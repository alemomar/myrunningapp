import SwiftUI

@main
struct RunSyncApp: App {
    @StateObject private var coordinator = SyncCoordinator()

    init() {
        // Mise à jour depuis la version 1 ou 2 : la date de dernière synchro, unique pour l'appareil, revient au
        // compte connecté au lancement (voir LastSync), qui n'a donc pas à refaire le premier lancement guidé.
        if let session = AuthService.currentSession {
            if LastSync.adoptLegacy(for: session.userId) { FirstImport.markDone(session.userId) }
        } else {
            LastSync.discardLegacy()
        }
        BackgroundSyncManager.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            // Liens myrunningapp://… : traités dans ContentView, qui connaît l'écran affiché.
            ContentView()
                .environmentObject(coordinator)
                .preferredColorScheme(.dark)
        }
    }
}
