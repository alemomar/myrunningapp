import Foundation

// État de sync partagé par toute l'app, pour pouvoir être déclenché soit par
// le bouton de l'app, soit par le lien profond myrunningapp://sync ouvert
// depuis le dashboard web.
@MainActor
final class SyncCoordinator: ObservableObject {
    @Published var status = "Prêt à synchroniser"
    @Published var isSyncing = false
    @Published var lastSyncLabel = SyncCoordinator.formatLastSync(LastSync.date)
    @Published var syncSinceDateLabel: String?

    func refreshSyncSinceDateLabel() async {
        guard let session = AuthService.currentSession else { return }
        guard let date = await ProfileService().fetchSyncSinceDate(session: session) else { return }
        syncSinceDateLabel = date.formatted(date: .abbreviated, time: .omitted)
    }

    func sync() async {
        guard AuthService.currentSession != nil else {
            status = "Connecte-toi dans l'app avant de synchroniser."
            return
        }
        isSyncing = true
        status = "Synchronisation en cours…"
        do {
            let result = try await SyncService().syncRecentWorkouts()
            status = "\(result.workoutsFound) séance(s) importée(s).\nVous pouvez à présent vous rendre sur votre dashboard."
            lastSyncLabel = Self.formatLastSync(LastSync.date)
        } catch {
            status = "Erreur : \(error.localizedDescription)"
        }
        isSyncing = false
    }

    private static func formatLastSync(_ date: Date?) -> String {
        guard let date else { return "Jamais synchronisé pour l'instant" }
        let cal = Calendar.current
        let time = date.formatted(date: .omitted, time: .shortened)
        if cal.isDateInToday(date) { return "Dernière synchronisation aujourd'hui à \(time)" }
        if cal.isDateInYesterday(date) { return "Dernière synchronisation hier à \(time)" }
        return "Dernière synchronisation le \(date.formatted(date: .abbreviated, time: .shortened))"
    }
}
