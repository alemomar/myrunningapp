import AppIntents
import os

private let intentLogger = Logger(subsystem: "com.omaralem.RunSync", category: "intent")

// Rend la synchro appelable depuis Shortcuts (donc depuis une Automatisation
// programmée), sans avoir besoin d'ouvrir l'app.
struct SyncWorkoutsIntent: AppIntent {
    static var title: LocalizedStringResource = "Synchroniser mes courses"
    static var description = IntentDescription("Envoie les séances récentes d'Apple Santé vers le dashboard.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        intentLogger.notice("[intent] perform() appelé")
        do {
            let result = try await SyncService().syncRecentWorkouts()
            intentLogger.notice("[intent] succès")
            return .result(dialog: "\(result.added) nouvelle(s) séance(s) synchronisée(s).")
        } catch {
            intentLogger.error("[intent] échec : \(String(describing: error), privacy: .public)")
            throw error
        }
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
