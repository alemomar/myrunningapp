import SwiftUI

@main
struct RunSyncApp: App {
    @StateObject private var coordinator = SyncCoordinator()

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
