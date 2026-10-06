import Foundation
import UIKit

// Résultat du premier import, affiché sur l'écran « C'est fait ».
struct ImportSummary: Equatable {
    let sessions: Int
    let runs: Int
    let since: Date
}

// État de sync partagé par toute l'app : premier import guidé (avec compteur), bouton « Synchroniser maintenant »
// de l'écran principal, et lien myrunningapp://sync ouvert depuis MyRunningApp (Mon compte).
@MainActor
final class SyncCoordinator: ObservableObject {
    enum ImportPhase: Equatable {
        case searching                          // liste des séances demandée à Apple Santé
        case progressing(SyncProgress)
    }

    enum HomeStatus: Equatable {
        case idle
        case syncing
        case upToDate
        case failed(String)
    }

    @Published var importPhase: ImportPhase = .searching
    @Published var importError: String?
    @Published var homeStatus: HomeStatus = .idle
    @Published var lastSync: Date?

    var isSyncing: Bool { homeStatus == .syncing }

    func refreshLastSync() {
        lastSync = AuthService.currentSession.flatMap { LastSync.date(for: $0.userId) }
    }

    func reset() {
        importPhase = .searching
        importError = nil
        homeStatus = .idle
        lastSync = nil
    }

    // Étape 3 du premier lancement. nil en cas d'erreur : l'écran affiche alors `importError` et « Réessayer ».
    func firstImport() async -> ImportSummary? {
        importError = nil
        importPhase = .searching
        // Si on quitte RunSync pendant l'import, iOS le met en pause tout de suite : on demande quelques secondes de
        // plus pour finir le lot en cours (les lots déjà envoyés restent de toute façon dans MyRunningApp).
        beginImportBackgroundTask()
        defer { endImportBackgroundTask() }
        do {
            let result = try await SyncService().syncRecentWorkouts { [weak self] progress in
                self?.importPhase = .progressing(progress)
            }
            refreshLastSync()
            return ImportSummary(sessions: result.added, runs: result.runs, since: result.since)
        } catch {
            importError = SyncService.message(for: error)
            return nil
        }
    }

    private var importBackgroundTask: UIBackgroundTaskIdentifier = .invalid

    private func beginImportBackgroundTask() {
        importBackgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Premier import") { [weak self] in
            MainActor.assumeIsolated { self?.endImportBackgroundTask() }
        }
    }

    private func endImportBackgroundTask() {
        guard importBackgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(importBackgroundTask)
        importBackgroundTask = .invalid
    }

    func sync() async {
        guard AuthService.currentSession != nil, !isSyncing else { return }
        homeStatus = .syncing
        do {
            _ = try await SyncService().syncRecentWorkouts()
            refreshLastSync()
            homeStatus = .upToDate
        } catch {
            homeStatus = .failed(SyncService.message(for: error))
        }
    }

    // « aujourd'hui à 10:18 », « hier à 18:42 », « le 3 oct. à 10:18 » : en français, quelle que soit la langue de l'iPhone.
    static func lastSyncText(_ date: Date?) -> String {
        guard let date else { return "pas encore" }
        let time = date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(Theme.locale))
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "aujourd'hui à \(time)" }
        if calendar.isDateInYesterday(date) { return "hier à \(time)" }
        let day = date.formatted(Date.FormatStyle().day().month(.abbreviated).locale(Theme.locale))
        return "le \(day) à \(time)"
    }
}
