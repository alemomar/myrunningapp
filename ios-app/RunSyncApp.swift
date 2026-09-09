import SwiftUI

@main
struct RunSyncApp: App {
    @StateObject private var coordinator = SyncCoordinator()

    init() {
        // Doit être ré-enregistré à chaque lancement du process, y compris un
        // lancement en arrière-plan déclenché par HealthKit lui-même.
        BackgroundSyncManager.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(coordinator)
                .onOpenURL { url in
                    // myrunningapp://sync — ouvert depuis le bouton du dashboard web
                    if url.host == "sync" {
                        Task { await coordinator.sync() }
                    }
                }
        }
    }
}
