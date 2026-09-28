import Foundation
import HealthKit
import os

private let syncLogger = Logger(subsystem: "com.omaralem.RunSync", category: "sync")

struct SyncResult {
    let workoutsFound: Int
    let added: Int
}

enum SyncServiceError: LocalizedError {
    case notSignedIn
    case noSyncDateConfigured
    case badResponse(String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Session expirée, reconnecte-toi."
        case .noSyncDateConfigured: return "Choisis d'abord une date de départ."
        case .badResponse(let message): return "Supabase a refusé l'envoi : \(message)"
        }
    }
}

// Horodatage de la dernière sync réussie (déclenchée par l'app, le lien web,
// ou l'automatisation Shortcuts) — permet de rassurer l'utilisateur qu'il n'a
// pas besoin de resynchroniser à chaque ouverture.
enum LastSync {
    private static let key = "runsync.lastSyncDate"

    static var date: Date? {
        get { UserDefaults.standard.object(forKey: key) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

final class SyncService {
    private let healthKit = HealthKitManager()

    func syncRecentWorkouts() async throws -> SyncResult {
        syncLogger.notice("[sync] start")
        guard AuthService.currentSession != nil else {
            syncLogger.notice("[sync] pas de session")
            throw SyncServiceError.notSignedIn
        }
        await AuthService().refreshIfPossible()
        syncLogger.notice("[sync] token rafraîchi")
        guard let session = AuthService.currentSession else {
            syncLogger.notice("[sync] session absente après refresh")
            throw SyncServiceError.notSignedIn
        }

        guard let sinceDate = await ProfileService().fetchSyncSinceDate(session: session) else {
            syncLogger.notice("[sync] pas de sync_since_date configurée")
            throw SyncServiceError.noSyncDateConfigured
        }
        syncLogger.notice("[sync] sinceDate = \(sinceDate.description, privacy: .public)")
        try await healthKit.requestAuthorization()
        syncLogger.notice("[sync] HealthKit autorisé")
        await syncRestingHrIfStale(session: session)
        syncLogger.notice("[sync] resting HR ok")
        await syncVo2MaxIfStale(session: session)
        syncLogger.notice("[sync] vo2max ok")
        let workouts = try await healthKit.fetchWorkouts(since: sinceDate)
        syncLogger.notice("[sync] \(workouts.count) séance(s) trouvée(s)")

        var payloads: [WorkoutPayload] = []
        for workout in workouts {
            let payload = await healthKit.buildPayload(for: workout, userId: session.userId)
            payloads.append(payload)
        }
        syncLogger.notice("[sync] payloads construits")

        // HealthKit peut renvoyer la même séance en double (ex: source Watch + iPhone) :
        // ON CONFLICT ne supporte pas deux lignes visant la même clé dans un seul envoi.
        var seenStartDates = Set<String>()
        let dedupedPayloads = payloads.filter { seenStartDates.insert($0.startDate).inserted }

        try await send(dedupedPayloads, session: session)
        syncLogger.notice("[sync] envoi réussi")
        LastSync.date = Date()

        // Rattrapage ponctuel : ajoute lap_markers aux séances déjà
        // synchronisées avant l'ajout de ce champ (voir backfillLapMarkersIfNeeded).
        // Fire-and-forget, ne doit jamais faire échouer une sync normale.
        Task { await backfillLapMarkersIfNeeded(session: session) }

        // Fait avancer la date de départ après chaque sync réussie : sans ça,
        // sync_since_date reste figée à sa valeur initiale pour toujours, et
        // chaque sync (y compris l'automatisation silencieuse du soir) doit
        // retraiter TOUT l'historique depuis cette date à chaque fois (6 requêtes
        // HealthKit par séance). En arrière-plan sans app ouverte, iOS tue le
        // processus avant la fin si ça prend trop longtemps → l'automatisation
        // échoue avec une "unknown error". Marge de 3 jours pour couvrir les
        // séances Watch qui remontent sur le téléphone avec un peu de retard.
        let newSinceDate = Calendar.current.date(byAdding: .day, value: -3, to: Date()) ?? Date()
        if newSinceDate > sinceDate {
            do {
                try await ProfileService().setSyncSinceDate(session: session, date: newSinceDate)
                syncLogger.notice("[sync] sync_since_date avancée avec succès à \(newSinceDate.description, privacy: .public)")
            } catch {
                syncLogger.error("[sync] échec avancement sync_since_date: \(String(describing: error), privacy: .public)")
            }
        }

        return SyncResult(workoutsFound: payloads.count, added: payloads.count)
    }

    // Renseignée automatiquement depuis la Watch, mais au plus 1 fois par
    // mois : la FC de repos ne varie pas au jour le jour, et la rafraîchir
    // à chaque sync ferait bouger les zones cardio en permanence.
    // Une valeur saisie manuellement n'est jamais touchée : si la Watch n'est
    // portée que pendant les séances, HealthKit n'a pas de données fiables
    // au repos et ne doit pas écraser un chiffre que l'utilisateur a lui-même vérifié.
    private func syncRestingHrIfStale(session: Session) async {
        let staleAfter: TimeInterval = 30 * 24 * 3600
        let info = await ProfileService().fetchRestingHrInfo(session: session)
        guard !info.isManual else { return }
        let isStale = info.updatedAt.map { Date().timeIntervalSince($0) > staleAfter } ?? true
        guard info.value == nil || isStale else { return }
        guard let restingHr = await healthKit.fetchLatestRestingHeartRate() else { return }
        try? await ProfileService().setRestingHr(session: session, value: Int(restingHr.rounded()), isManual: false)
    }

    // Même logique que la FC de repos : la VO2 max de la Watch évolue lentement,
    // pas besoin de la rafraîchir plus d'une fois par mois, et une valeur
    // manuelle n'est jamais écrasée.
    private func syncVo2MaxIfStale(session: Session) async {
        let staleAfter: TimeInterval = 30 * 24 * 3600
        let info = await ProfileService().fetchVo2MaxInfo(session: session)
        guard !info.isManual else { return }
        let isStale = info.updatedAt.map { Date().timeIntervalSince($0) > staleAfter } ?? true
        guard info.value == nil || isStale else { return }
        guard let vo2Max = await healthKit.fetchLatestVo2Max() else { return }
        try? await ProfileService().setVo2Max(session: session, value: vo2Max, isManual: false)
    }

    // Upsert : la contrainte unique(user_id, start_date) en base évite les
    // doublons si on relance une sync sur une période déjà envoyée.
    //
    // Envoyé par lots (pas un seul gros POST) : hr_series/pace_series sont des
    // JSON volumineux par séance, et un envoi de tout l'historique en un coup
    // (ex: gros import initial, ou sync_since_date qui n'a pas encore avancé)
    // peut dépasser le statement_timeout de Postgres côté Supabase (déjà vu :
    // erreur 57014 "canceling statement due to statement timeout").
    private func send(_ workouts: [WorkoutPayload], session: Session) async throws {
        guard !workouts.isEmpty else { return }
        let batchSize = 20
        var batchNum = 0
        for start in stride(from: 0, to: workouts.count, by: batchSize) {
            batchNum += 1
            let batch = Array(workouts[start..<min(start + batchSize, workouts.count)])
            syncLogger.notice("[sync] envoi lot \(batchNum) (\(batch.count) séance(s))")
            try await sendBatch(batch, session: session)
            syncLogger.notice("[sync] lot \(batchNum) envoyé")
        }
    }

    // Rattrapage ponctuel des séances déjà en base avant l'ajout du champ
    // lap_markers : contrairement à la sync normale (ignore-duplicates,
    // qui ne touche jamais une ligne existante pour protéger une
    // catégorisation manuelle), ceci fait un vrai UPDATE ciblé sur la seule
    // colonne lap_markers, sans toucher au reste de la ligne. Toutes les
    // séances Running sont passées en revue (pas seulement les Fractionné
    // catégorisées : le champ ne sert que si la séance a plusieurs
    // HKWorkoutActivity, sinon rien n'est envoyé). Protégé par un flag pour
    // ne tourner qu'une fois par appareil — "v2" car ce flag est distinct du
    // premier backfill (celui-là ne calculait pas encore l'allure native
    // par intervalle, seulement les frontières).
    private func backfillLapMarkersIfNeeded(session: Session) async {
        let doneKey = "runsync.lapMarkersBackfillDoneV2"
        guard !UserDefaults.standard.bool(forKey: doneKey) else { return }
        syncLogger.notice("[backfill] lap_markers: début")

        let veryEarly = Date(timeIntervalSince1970: 0)
        guard let workouts = try? await healthKit.fetchWorkouts(since: veryEarly) else {
            syncLogger.error("[backfill] lap_markers: échec récupération séances")
            return
        }

        var updated = 0
        for workout in workouts where workout.workoutActivityType == .running {
            let markers = await healthKit.extractLapMarkers(workout: workout, start: workout.startDate)
            guard !markers.isEmpty else { continue }
            do {
                try await updateLapMarkers(startDate: workout.startDate, markers: markers, session: session)
                updated += 1
            } catch {
                syncLogger.error("[backfill] lap_markers: échec sur une séance: \(String(describing: error), privacy: .public)")
            }
        }

        UserDefaults.standard.set(true, forKey: doneKey)
        syncLogger.notice("[backfill] lap_markers: terminé, \(updated) séance(s) mise(s) à jour")
    }

    private func updateLapMarkers(startDate: Date, markers: [LapMarker], session: Session) async throws {
        let isoFormatter = ISO8601DateFormatter()
        let dateStr = isoFormatter.string(from: startDate)
        guard let encodedDate = dateStr.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return }

        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/runs?user_id=eq.\(session.userId)&start_date=eq.\(encodedDate)")!)
        request.httpMethod = "PATCH"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(["lap_markers": markers])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "réponse invalide"
            throw SyncServiceError.badResponse(message)
        }
    }

    private func sendBatch(_ workouts: [WorkoutPayload], session: Session) async throws {
        // on_conflict indique à PostgREST la contrainte unique à utiliser pour l'upsert
        // (par défaut il ne regarde que la clé primaire "id", toujours unique).
        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/runs?on_conflict=user_id,start_date")!)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // ignore-duplicates (pas merge) : une séance déjà en base (même user_id+start_date)
        // n'est jamais réécrite par une resynchro, pour ne pas effacer une catégorisation
        // (type), une inclusion dans les stats, ou toute autre modification faite depuis le web.
        request.setValue("resolution=ignore-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(workouts)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "réponse invalide"
            throw SyncServiceError.badResponse(message)
        }
    }
}
