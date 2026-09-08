import SwiftUI

struct ContentView: View {
    @State private var isSignedIn = AuthService.currentSession != nil
    @State private var needsDateSetup: Bool? = nil // nil = vérification en cours

    var body: some View {
        Group {
            if !isSignedIn {
                LoginView(onSignedIn: { isSignedIn = true; needsDateSetup = nil })
            } else if needsDateSetup == nil {
                ProgressView().task { await checkProfile() }
            } else if needsDateSetup == true {
                SetupSyncDateView(onDone: { needsDateSetup = false })
            } else {
                SyncView(onSignOut: { isSignedIn = false; needsDateSetup = nil })
            }
        }
    }

    private func checkProfile() async {
        guard AuthService.currentSession != nil else { needsDateSetup = true; return }
        // Rafraîchit ici, une fois pour toute la session : tout le reste de l'app
        // (setup, sync, dashboard) peut ensuite compter sur un jeton valide.
        // Si le jeton de rafraîchissement lui-même est mort, on redemande une
        // vraie connexion plutôt que d'afficher des erreurs Supabase en boucle.
        guard await AuthService().refreshIfPossible() else {
            AuthService.signOut()
            isSignedIn = false
            return
        }
        guard let session = AuthService.currentSession else { needsDateSetup = true; return }
        let date = await ProfileService().fetchSyncSinceDate(session: session)
        needsDateSetup = (date == nil)
    }
}

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isLoading = false
    let onSignedIn: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Text("Running Sync")
                .font(.title)
                .fontWeight(.semibold)

            TextField("Email", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .textFieldStyle(.roundedBorder)

            SecureField("Mot de passe", text: $password)
                .textContentType(.password)
                .textFieldStyle(.roundedBorder)

            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
            }

            Button {
                Task { await signIn() }
            } label: {
                if isLoading { ProgressView() } else { Text("Se connecter") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoading || email.isEmpty || password.isEmpty)
        }
        .padding()
    }

    private func signIn() async {
        isLoading = true
        error = nil
        do {
            try await AuthService().signIn(email: email, password: password)
            onSignedIn()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

// Étape obligatoire avant la toute première synchro : pas de valeur par
// défaut silencieuse, l'utilisateur choisit lui-même sa fenêtre d'historique.
struct SetupSyncDateView: View {
    @EnvironmentObject private var coordinator: SyncCoordinator
    @State private var date = Date()
    @State private var isSaving = false
    @State private var error: String?
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Text("Depuis quand ?")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Choisis la date à partir de laquelle importer tes séances depuis Apple Santé. Modifiable à tout moment depuis le dashboard.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            DatePicker("Date de départ", selection: $date, in: ...Date(), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .labelsHidden()

            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
            }

            Button {
                Task { await save() }
            } label: {
                if isSaving { ProgressView() } else { Text("Confirmer") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSaving)
        }
        .padding()
    }

    private func save() async {
        guard let session = AuthService.currentSession else { return }
        isSaving = true
        error = nil
        do {
            try await ProfileService().setSyncSinceDate(session: session, date: date)
            onDone()
            await coordinator.sync()
        } catch {
            self.error = error.localizedDescription
        }
        isSaving = false
    }
}

struct SyncView: View {
    @EnvironmentObject private var coordinator: SyncCoordinator
    let onSignOut: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text("Running Sync")
                .font(.title)
                .fontWeight(.semibold)

            Text(coordinator.lastSyncLabel)
                .font(.footnote)
                .foregroundStyle(.secondary)

            Text("Tes séances sont automatiquement importées depuis ta Apple Watch, tous les soirs à 20h, depuis le \(coordinator.syncSinceDateLabel ?? "…"). Les séances déjà importées ne sont jamais dupliquées.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Text(coordinator.status)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button("Retourner au dashboard") {
                if let url = URL(string: Config.dashboardURL) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.bordered)

            Button("Déconnexion") {
                AuthService.signOut()
                onSignOut()
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .font(.footnote)

            Spacer()

            Divider()

            VStack(spacing: 8) {
                Text("Pour voir tout de suite une séance faite depuis la dernière synchro, sans attendre ce soir 20h :")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                Button {
                    Task { await coordinator.sync() }
                } label: {
                    if coordinator.isSyncing {
                        ProgressView()
                    } else {
                        Text("Forcer une synchronisation")
                    }
                }
                .buttonStyle(.bordered)
                .tint(.secondary)
                .disabled(coordinator.isSyncing)
            }

            RunningAnimationView()
        }
        .padding()
        .task { await coordinator.refreshSyncSinceDateLabel() }
    }
}

#Preview {
    ContentView()
}
