import SwiftUI
import WebKit
import Network
import UIKit
import os

private let webLogger = Logger(subsystem: "com.omaralem.RunSync", category: "web")

// App unique (choix d'Omar du 02/11/2026) : RunSync devient MyRunningApp. L'app affiche la page du site en plein écran et
// garde ce que la page ne sait pas faire seule : lire Apple Santé et envoyer les sorties, y compris en arrière-plan
// (BackgroundSyncManager). Les deux se parlent par messages : la page écrit à « mra » (webkit.messageHandlers.mra),
// l'app lui répond par window.MRA_NATIF.recu(…). Le détail des messages est dans web/app/app.js (« App iPhone »).
@MainActor
final class WebAppController: NSObject, ObservableObject {
    @Published private(set) var offline = false
    @Published private(set) var firstPageShown = false

    let webView: WKWebView
    private let monitor = NWPathMonitor()
    private var networkUp = true
    private var lastAutoSync: Date?
    private var runningSync: Task<SyncResult, Error>?
    // Le jeton de rafraîchissement que la page a en main : si l'app en a un plus récent, elle le lui repasse.
    private var pageRefreshToken: String?

    static var pageURL: URL {
        #if DEBUG
        // Essais sur simulateur : « -adresse <url> » ouvre une autre page (le banc local, par exemple).
        if let link = UserDefaults.standard.string(forKey: "adresse"), let url = URL(string: link) { return url }
        #endif
        return URL(string: Config.dashboardURL)!
    }

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "MyRunningApp/\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")"
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(WeakMessageHandler(self), name: "mra")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Theme.bg)
        webView.scrollView.backgroundColor = UIColor(Theme.bg)
        // La page gère elle-même les bords (viewport-fit=cover, env(safe-area-inset-*)).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        let center = NotificationCenter.default
        center.addObserver(forName: .sessionRefreshed, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.passSessionToPage() }
        }
        // Retour au premier plan : la page reprend d'abord la session (rafraîchie ici pendant une synchro en arrière-plan),
        // avant que supabase-js ne relise la sienne ; puis on relit Apple Santé.
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.passSessionToPage() }
        }
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.autoSync() }
        }
        monitor.pathUpdateHandler = { [weak self] path in
            let up = path.status == .satisfied
            Task { @MainActor in self?.networkChanged(up: up) }
        }
        monitor.start(queue: DispatchQueue(label: "mra.reseau"))
        load()
    }

    func load() {
        installStartScript()
        offline = false
        webView.load(URLRequest(url: Self.pageURL))
    }

    // Avant tout script de la page : le drapeau MRA_NATIF, et la session la plus récente des deux (date d'expiration la
    // plus lointaine) dans le stockage de supabase-js.
    private func installStartScript() {
        let contentController = webView.configuration.userContentController
        contentController.removeAllUserScripts()
        var json = "null"
        if let session = AuthService.sessionForWeb(), let text = Self.json(session) { json = text }
        let source = """
        window.MRA_NATIF = { version: 1 };
        (function () { try {
          var k = "\(AuthService.webStorageKey)", s = \(json);
          if (!s) return;
          var c = null; try { c = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) {}
          if (!c) { localStorage.setItem(k, JSON.stringify(s)); return; }
          if (c.refresh_token !== s.refresh_token && (s.expires_at || 0) >= (c.expires_at || 0)) localStorage.setItem(k, JSON.stringify(s));
        } catch (e) {} })();
        """
        contentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    // MARK: Messages de la page

    fileprivate func receive(_ body: Any) {
        guard let message = body as? [String: Any], let type = message["type"] as? String else { return }
        switch type {
        case "session":
            guard let object = message["session"] as? [String: Any] else { return }
            pageRefreshToken = object["refresh_token"] as? String
            AuthService.adoptWebSession(object)
        case "deconnexion":
            AuthService.signOut()
            pageRefreshToken = nil
        case "etat":
            let userId = message["userId"] as? String ?? AuthService.currentSession?.userId ?? ""
            send(["type": "etat", "premierImportFait": FirstImport.isDone(userId), "santeDemandee": FirstImport.healthAsked(userId),
                  "derniereSynchro": Self.iso(LastSync.date(for: userId))])
        case "sante":
            Task { await askHealthAccess() }
        case "importer":
            Task { await firstImport() }
        case "synchroniser":
            Task { await syncForPage() }
        case "fichier":
            if let name = message["nom"] as? String, let content = message["contenu"] as? String { share(name: name, content: content) }
        default:
            break
        }
    }

    func send(_ message: [String: Any]) {
        guard let json = Self.json(message) else { return }
        webView.evaluateJavaScript("window.MRA_NATIF && window.MRA_NATIF.recu && window.MRA_NATIF.recu(\(json));")
    }

    // Premiers pas, « Autoriser Apple Santé » : la fenêtre d'Apple. Refus ou cases décochées : aucune erreur, Apple ne le
    // dit pas ; l'import trouvera alors zéro séance et la page montrera le chemin dans Réglages.
    private func askHealthAccess() async {
        try? await HealthKitManager().requestAuthorization()
        if let session = AuthService.currentSession { FirstImport.markHealthAsked(session.userId) }
        // L'écoute en arrière-plan démarrée au lancement n'avait pas encore l'accès : on la relance.
        BackgroundSyncManager.shared.start()
        send(["type": "sante", "ok": true])
    }

    // Premier import (les 12 derniers mois, date posée d'office par la base), avec l'avancement pour la page. Fait, même à
    // zéro séance : les synchros automatiques démarrent, et la suivante reprendra depuis la même date.
    private func firstImport() async {
        guard let session = AuthService.currentSession else {
            send(["type": "importer", "erreur": "Ta session n'est pas encore prête : ferme l'app, puis rouvre-la."])
            return
        }
        // Si on quitte l'app pendant l'import, iOS la met en pause : quelques secondes de plus pour finir le lot en cours.
        let backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Premier import")
        defer { UIApplication.shared.endBackgroundTask(backgroundTask) }
        do {
            let result = try await SyncService().syncRecentWorkouts { [weak self] progress in
                if case .importing(let done, let total) = progress { self?.send(["type": "importAvance", "fait": done, "total": total]) }
            }
            FirstImport.markDone(session.userId)
            send(["type": "importer", "seances": result.added, "courses": result.runs])
        } catch {
            webLogger.error("[web] premier import: \(String(describing: error), privacy: .public)")
            send(["type": "importer", "erreur": SyncService.message(for: error)])
        }
    }

    // « Synchroniser maintenant », tirer pour actualiser.
    private func syncForPage() async {
        do {
            let result = try await sync()
            send(["type": "synchroniser", "derniereSynchro": Self.iso(Date()), "seances": result.added])
        } catch {
            send(["type": "synchroniser", "erreur": SyncService.message(for: error)])
        }
    }

    // Une seule synchro à la fois : une deuxième demande attend la première.
    private func sync() async throws -> SyncResult {
        if let runningSync { return try await runningSync.value }
        let task = Task { try await SyncService().syncRecentWorkouts() }
        runningSync = task
        defer { runningSync = nil }
        return try await task.value
    }

    // Au premier plan et au retour du réseau (sorties gardées par Apple Santé pendant la coupure), au plus toutes les 2 min.
    func autoSync(force: Bool = false) {
        guard let session = AuthService.currentSession, FirstImport.isDone(session.userId), networkUp else { return }
        if !force, let lastAutoSync, Date().timeIntervalSince(lastAutoSync) < 120 { return }
        lastAutoSync = Date()
        Task {
            if let result = try? await sync(), result.workoutsFound > 0 { send(["type": "nouvellesSorties"]) }
        }
    }

    // La page reprend la session rafraîchie ici : dans son stockage tout de suite, puis dans supabase-js.
    private func passSessionToPage() {
        guard firstPageShown, let session = AuthService.currentSession, session.refreshToken != pageRefreshToken else { return }
        pageRefreshToken = session.refreshToken
        if let object = AuthService.sessionForWeb(), let json = Self.json(object) {
            webView.evaluateJavaScript("try { localStorage.setItem(\"\(AuthService.webStorageKey)\", JSON.stringify(\(json))); } catch (e) {}")
        }
        send(["type": "session", "session": ["access_token": session.accessToken, "refresh_token": session.refreshToken]])
    }

    private func networkChanged(up: Bool) {
        let cameBack = up && !networkUp
        networkUp = up
        guard cameBack else { return }
        if offline { load() }
        autoSync(force: true)
    }

    // « Télécharger mes données » : la feuille de partage d'iOS (Enregistrer dans Fichiers, Mail…).
    private func share(name: String, content: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        guard (try? content.write(to: url, atomically: true, encoding: .utf8)) != nil,
              let root = webView.window?.rootViewController else { return }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = webView
        (root.presentedViewController ?? root).present(sheet, animated: true)
    }

    private static func json(_ object: [String: Any]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func iso(_ date: Date?) -> Any {
        date.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull()
    }
}

extension WebAppController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        offline = false
        firstPageShown = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadFailed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadFailed(error)
    }

    // Page pas chargée faute de réseau : l'écran « Pas de connexion internet ».
    private func loadFailed(_ error: Error) {
        let error = error as NSError
        guard error.domain == NSURLErrorDomain, error.code != NSURLErrorCancelled else { return }
        webLogger.notice("[web] chargement impossible: \(error.code, privacy: .public)")
        offline = true
    }

    // Liens vers un autre site (TestFlight, e-mail, aides de Garmin…) : ouverts hors de l'app.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, action.targetFrame?.isMainFrame != false,
              let scheme = url.scheme, !["about", "blob", "data"].contains(scheme), url.host != Self.pageURL.host else {
            decisionHandler(.allow)
            return
        }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    // window.open, target="_blank" : hors de l'app aussi.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // Page fermée par iOS (mémoire) : on la recharge.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load()
    }
}

// WKUserContentController garde son destinataire : un relais faible évite que le contrôleur ne soit jamais libéré.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WebAppController?
    init(_ target: WebAppController) { self.target = target }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        MainActor.assumeIsolated { target?.receive(message.body) }
    }
}

// MARK: - Écrans

struct AppScreen: View {
    @StateObject private var web = WebAppController()

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            WebViewContainer(webView: web.webView)
                .ignoresSafeArea()
            if !web.firstPageShown && !web.offline {
                LaunchCover()
                    .transition(.opacity)
            }
            if web.offline {
                OfflineView { web.load() }
                    .transition(.opacity)
            }
        }
        // Bande de l'heure : la page qui défile ne passe pas dessous (déjà le cas dans RunSync depuis le 06/10/2026).
        .statusBarMask()
        .animation(.easeOut(duration: 0.25), value: web.firstPageShown)
        .animation(.easeOut(duration: 0.2), value: web.offline)
        // myrunningapp://sync (ancien lien « Ouvrir RunSync » de la page dans Safari) : on relit Apple Santé tout de suite.
        .onOpenURL { url in
            if url.scheme == "myrunningapp", url.host == "sync" { web.autoSync(force: true) }
        }
    }
}

private struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// Le temps que la page arrive : le logo sur le fond de l'app, pas un écran blanc.
private struct LaunchCover: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            Image("LogoVertical")
                .resizable()
                .scaledToFit()
                .frame(width: 150)
        }
    }
}

// Choix 4 d'Omar (02/11/2026) : sans réseau, un écran simple ; la page se recharge toute seule quand le réseau revient.
// (Une version hors ligne qui montre la dernière page vue est le sujet D12.1, pour plus tard.)
private struct OfflineView: View {
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(Theme.muted)
            Text("Pas de connexion internet")
                .font(Theme.display(30))
                .textCase(.uppercase)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.text)
            Text("Vérifie ton réseau : l'app se recharge toute seule dès qu'il revient.")
                .font(.system(size: 15))
                .foregroundStyle(Theme.text2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button("Réessayer", action: onRetry)
                .buttonStyle(PrimaryButtonStyle())
                .padding(.top, 8)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
    }
}
