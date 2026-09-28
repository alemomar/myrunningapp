import SwiftUI

@main
struct RunSyncApp: App {
    @StateObject private var coordinator = SyncCoordinator()

    init() {
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
