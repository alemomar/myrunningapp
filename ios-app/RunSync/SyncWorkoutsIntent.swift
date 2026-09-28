import AppIntents

// Rend la synchro appelable depuis Shortcuts (donc depuis une Automatisation
// programmée), sans avoir besoin d'ouvrir l'app.
struct SyncWorkoutsIntent: AppIntent {
    static var title: LocalizedStringResource = "Synchroniser mes courses"
    static var description = IntentDescription("Envoie les séances récentes de Santé vers le dashboard.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = try await SyncService().syncRecentWorkouts()
        return .result(dialog: "\(result.added) nouvelle(s) séance(s) synchronisée(s).")
    }
}

struct RunSyncShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SyncWorkoutsIntent(),
            phrases: ["Synchroniser mes courses avec \(.applicationName)"],
            shortTitle: "Synchroniser mes courses",
            systemImageName: "figure.run"
        )
    }
}
