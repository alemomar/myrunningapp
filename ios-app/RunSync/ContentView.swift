import SwiftUI

// Parcours de RunSync : connexion, puis au premier lancement trois étapes guidées (date de départ, autorisation
// Apple Santé, import), puis l'écran des jours suivants. Si l'app est fermée en route, chaque étape reprend là où
// elle en était (date enregistrée dans Supabase, drapeaux par compte sur l'appareil : voir FirstImport).
enum Stage: Equatable {
    case checking
    case login
    case chooseDate
    case healthAccess
    case importing
    case done(ImportSummary)
    case noWorkouts(since: Date)
    case home
}

// Compte connecté ≠ compte de MyRunningApp (lien du guide) : voir OtherAccountView.
struct AccountMismatch: Identifiable {
    let current: String
    let wanted: String
    var id: String { wanted }
}

struct ContentView: View {
    @EnvironmentObject private var coordinator: SyncCoordinator
    @State private var stage: Stage = AuthService.currentSession == nil ? .login : .checking
    @State private var linkEmail: String?
    @State private var mismatch: AccountMismatch?
    @State private var checkError: String?

    var body: some View {
        Group {
            #if DEBUG
            if let demo = DemoScreen.requested {
                DemoScreen(name: demo)
            } else {
                flow
            }
            #else
            flow
            #endif
        }
        .tint(Theme.accent)
    }

    private var flow: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            switch stage {
            case .checking:
                CheckingView(error: checkError) { Task { await check() } }
                    .task { await check() }
            case .login:
                LoginView(prefilledEmail: linkEmail) { stage = .checking }
            case .chooseDate:
                ChooseDateView { date in
                    guard let session = AuthService.currentSession else { return }
                    try await ProfileService().setSyncSinceDate(session: session, date: date)
                    stage = .healthAccess
                }
            case .healthAccess:
                HealthAccessView { await askHealthAccess() }
            case .importing:
                ImportView { startImport() }
            case .done(let summary):
                DoneView(summary: summary) { finishFirstImport() }
            case .noWorkouts(let since):
                NoWorkoutsView(since: since, onRetry: { startImport() }, onContinue: { finishFirstImport() })
            case .home:
                HomeView(email: AuthService.currentSession?.accountEmail) { signOut() }
                    .onAppear { coordinator.refreshLastSync() }
            }
        }
        .animation(.easeOut(duration: 0.25), value: stage)
        .onOpenURL { handle($0) }
        #if DEBUG
        // Essais sur simulateur : « -lien <url> » rejoue un lien sans passer par la fenêtre « Ouvrir dans RunSync ? ».
        .task {
            if let link = UserDefaults.standard.string(forKey: "lien"), let url = URL(string: link) { handle(url) }
        }
        #endif
        .fullScreenCover(item: $mismatch) { mismatch in
            OtherAccountView(currentEmail: mismatch.current, wantedEmail: mismatch.wanted,
                             onSwitch: {
                                 self.mismatch = nil
                                 signOut(prefill: mismatch.wanted)
                             },
                             onKeep: { self.mismatch = nil })
        }
    }

    // Au lancement et après la connexion : session encore valable ? date de départ choisie ? premier import fait ?
    private func check() async {
        checkError = nil
        guard AuthService.currentSession != nil else { stage = .login; return }
        if await AuthService().refresh() == .expired {
            signOut()
            return
        }
        guard let session = AuthService.currentSession else { stage = .login; return }
        let since: Date?
        do {
            since = try await ProfileService().loadSyncSinceDate(session: session)
        } catch {
            // Pas de réseau : l'écran principal fonctionne sans, le premier lancement guidé non.
            if FirstImport.isDone(session.userId) { stage = .home } else { checkError = SyncService.message(for: error) }
            return
        }
        if since == nil {
            stage = .chooseDate
        } else if FirstImport.isDone(session.userId) {
            stage = .home
        } else if FirstImport.healthAsked(session.userId) {
            startImport()
        } else {
            stage = .healthAccess
        }
    }

    private func askHealthAccess() async {
        guard let session = AuthService.currentSession else { return }
        // Refus ou cases décochées : aucune erreur, Apple ne le dit pas. L'import trouvera alors zéro séance
        // et l'écran « Aucune séance trouvée » montrera le chemin dans Réglages.
        try? await HealthKitManager().requestAuthorization()
        FirstImport.markHealthAsked(session.userId)
        // L'écoute en arrière-plan démarrée au lancement n'avait pas encore l'accès : on la relance.
        BackgroundSyncManager.shared.start()
        startImport()
    }

    private func startImport() {
        stage = .importing
        Task {
            guard let summary = await coordinator.firstImport() else { return }   // erreur : affichée sur l'écran d'import
            stage = summary.sessions == 0 ? .noWorkouts(since: summary.since) : .done(summary)
        }
    }

    private func finishFirstImport() {
        if let session = AuthService.currentSession { FirstImport.markDone(session.userId) }
        stage = .home
    }

    private func signOut(prefill: String? = nil) {
        AuthService.signOut()
        coordinator.reset()
        linkEmail = prefill
        stage = .login
    }

    // myrunningapp://connexion?email=… (guide de MyRunningApp) et myrunningapp://sync (Mon compte).
    private func handle(_ url: URL) {
        guard url.scheme == "myrunningapp" else { return }
        switch url.host {
        case "connexion":
            let email = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "email" })?.value?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard let email, !email.isEmpty else { return }
            if let session = AuthService.currentSession {
                if let current = session.accountEmail, current.caseInsensitiveCompare(email) != .orderedSame {
                    mismatch = AccountMismatch(current: current, wanted: email)
                }
            } else {
                linkEmail = email
            }
        case "sync":
            if stage == .home { Task { await coordinator.sync() } }
        default:
            break
        }
    }
}

private struct CheckingView: View {
    let error: String?
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            if let error {
                Text(error)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Réessayer", action: onRetry)
                    .buttonStyle(PrimaryButtonStyle())
            } else {
                ProgressView().tint(Theme.accent).controlSize(.large)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#if DEBUG
// Écrans de démonstration pour les captures du simulateur : lancer l'app avec « -demo <écran> ». Jamais dans une
// version TestFlight (compilé seulement en Debug). Données d'exemple, aucune connexion à Supabase.
struct DemoScreen: View {
    static var requested: String? { UserDefaults.standard.string(forKey: "demo") }

    let name: String
    @EnvironmentObject private var coordinator: SyncCoordinator

    private let email = "camille@exemple.fr"
    private var lastYear: Date { Calendar.current.date(byAdding: .year, value: -1, to: Calendar.current.startOfDay(for: Date())) ?? Date() }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            switch name {
            case "connexion-lien": LoginView(prefilledEmail: email) {}
            case "pas-de-compte": LoginView(prefilledEmail: nil, startSheet: .noAccount) {}
            case "mot-de-passe": LoginView(prefilledEmail: email, startSheet: .forgotPassword) {}
            case "date": ChooseDateView { _ in }
            case "date-autre": ChooseDateView(startPeriod: .custom) { _ in }
            case "sante": HealthAccessView {}
            case "import":
                ImportView {}
                    .onAppear { coordinator.importPhase = .progressing(.reading(done: 37, total: 120)) }
            case "fini": DoneView(summary: ImportSummary(sessions: 120, runs: 87, since: lastYear)) {}
            case "aucune": NoWorkoutsView(since: lastYear, onRetry: {}, onContinue: {})
            case "accueil":
                HomeView(email: email) {}
                    .onAppear { coordinator.lastSync = Calendar.current.date(bySettingHour: 10, minute: 18, second: 0, of: Date()) }
            case "autre-compte": OtherAccountView(currentEmail: "autre@exemple.fr", wantedEmail: email, onSwitch: {}, onKeep: {})
            default: LoginView(prefilledEmail: nil) {}
            }
        }
    }
}
#endif

#Preview {
    ContentView().environmentObject(SyncCoordinator())
}
