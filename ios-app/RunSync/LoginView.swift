import SwiftUI

// Connexion seule : le compte se crée dans MyRunningApp (décision d'Omar du 06/10/2026), seul endroit qui sait saisir
// le code reçu par e-mail. L'e-mail arrive déjà rempli quand RunSync est ouvert par le guide de MyRunningApp
// (myrunningapp://connexion?email=…).
struct LoginView: View {
    enum Sheet: String, Identifiable {
        case noAccount, forgotPassword
        var id: String { rawValue }
    }

    let prefilledEmail: String?
    let onSignedIn: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var error: String?
    @State private var isLoading = false
    @State private var sheet: Sheet?
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    init(prefilledEmail: String?, startSheet: Sheet? = nil, onSignedIn: @escaping () -> Void) {
        self.prefilledEmail = prefilledEmail
        self.onSignedIn = onSignedIn
        _email = State(initialValue: prefilledEmail ?? "")
        _sheet = State(initialValue: startSheet)
    }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var emailIsPrefilled: Bool {
        guard let prefilledEmail, !prefilledEmail.isEmpty else { return false }
        return trimmedEmail.caseInsensitiveCompare(prefilledEmail) == .orderedSame
    }
    private var canSubmit: Bool {
        !isLoading && !password.isEmpty && trimmedEmail.wholeMatch(of: #/[^\s@]+@[^\s@]+\.[^\s@]+/#) != nil
    }

    var body: some View {
        ScreenScaffold {
            header
            FlowStrip().padding(.top, 14)
            sameAccountNote.padding(.top, 16)
            fields.padding(.top, 18)
            if let error {
                Text(error)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            Button {
                Task { await signIn() }
            } label: {
                if isLoading { ProgressView().tint(Theme.onAccent) } else { Text("Se connecter") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSubmit)
            .padding(.top, 14)
            Button("Mot de passe oublié ?") { sheet = .forgotPassword }
                .buttonStyle(QuietLinkStyle())
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
        } bottom: {
            Button("Pas encore de compte ?") { sheet = .noAccount }
                .buttonStyle(QuietLinkStyle(color: Theme.accent, weight: .semibold))
        }
        .onChange(of: prefilledEmail) { _, newValue in
            if let newValue, !newValue.isEmpty { email = newValue }
        }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case .noAccount: NoAccountSheet()
            case .forgotPassword: ForgotPasswordSheet()
            }
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            AppIconImage(name: "LogoRunSync", size: 72)
            Wordmark(size: 34)
            (Text("Une seule mission : ").fontWeight(.semibold).foregroundStyle(Theme.text)
             + Text("envoyer tes courses d'Apple Santé vers MyRunningApp. Rien d'autre."))
                .font(.system(size: 15))
                .foregroundStyle(Theme.text2)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    private var sameAccountNote: some View {
        HStack(spacing: 12) {
            AppIconImage(name: "LogoMyRunningApp", size: 32)
            (Text("Connecte-toi avec ")
             + Text("le même e-mail et le même mot de passe").fontWeight(.semibold).foregroundStyle(Theme.text)
             + Text(" que dans MyRunningApp."))
                .font(.system(size: 14))
                .foregroundStyle(Theme.text2)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("E-mail").font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text3).padding(.leading, 2)
            fieldBox(icon: "envelope") {
                // verbatim : sinon SwiftUI prend l'exemple d'adresse pour un lien et l'affiche en bleu.
                TextField("", text: $email, prompt: Text(verbatim: "ton@email.fr").foregroundStyle(Theme.faint))
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focus, equals: .email)
                    .onSubmit { focus = .password }
                    .accessibilityLabel("E-mail")
                if emailIsPrefilled {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.accent)
                        .accessibilityHidden(true)
                }
            }
            if emailIsPrefilled {
                Text("Rempli par MyRunningApp")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.muted)
                    .padding(.leading, 2)
            }
            Text("Mot de passe").font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.text3)
                .padding(.leading, 2).padding(.top, 6)
            fieldBox(icon: "lock") {
                Group {
                    if showPassword {
                        TextField("", text: $password, prompt: Text("Ton mot de passe MyRunningApp").foregroundStyle(Theme.faint))
                    } else {
                        SecureField("", text: $password, prompt: Text("Ton mot de passe MyRunningApp").foregroundStyle(Theme.faint))
                    }
                }
                .textContentType(.password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .focused($focus, equals: .password)
                .onSubmit { if canSubmit { Task { await signIn() } } }
                .accessibilityLabel("Mot de passe")
                Button {
                    showPassword.toggle()
                } label: {
                    Image(systemName: showPassword ? "eye.slash" : "eye")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 40, height: 40)
                }
                .accessibilityLabel(showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe")
            }
        }
    }

    private func fieldBox<Content: View>(icon: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(Theme.muted)
                .frame(width: 22)
                .accessibilityHidden(true)
            content()
                .font(.system(size: 16))
                .foregroundStyle(Theme.text)
                .tint(Theme.accent)
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .frame(height: 50)
        .background(Theme.field, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.lineField, lineWidth: 1))
    }

    private func signIn() async {
        focus = nil
        isLoading = true
        error = nil
        do {
            try await AuthService().signIn(email: trimmedEmail, password: password)
            password = ""
            isLoading = false
            onSignedIn()
        } catch {
            self.error = AuthService.message(for: error)
            isLoading = false
        }
    }
}

// MARK: - Feuilles

// Ouvre MyRunningApp dans le navigateur : iOS ne sait pas rouvrir l'app installée sur l'écran d'accueil depuis une
// autre app, d'où la phrase sous le bouton.
private struct OpenMyRunningAppButton: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 8) {
            Button {
                if let url = URL(string: Config.dashboardURL) { openURL(url) }
            } label: {
                HStack(spacing: 8) {
                    Text("Ouvrir MyRunningApp")
                    Image(systemName: "arrow.up.right").font(.system(size: 14, weight: .bold))
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            Text("Déjà sur ton écran d'accueil ? Ouvre-la plutôt depuis là.")
                .font(.system(size: 13.5))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct SheetContainer<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 12) {
                    ScreenTitle(text: title, size: 26)
                    Spacer(minLength: 0)
                    CloseButton { dismiss() }
                }
                content()
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 20)
        }
        .scrollBounceBehavior(.basedOnSize)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(26)
        .presentationBackground(Theme.raised)
    }
}

struct NoAccountSheet: View {
    var body: some View {
        SheetContainer(title: "Ton compte se crée dans MyRunningApp") {
            BodyText("RunSync utilise le même compte que MyRunningApp. Crée-le là-bas en une minute, puis reviens ici pour te connecter.")
            VStack(alignment: .leading, spacing: 12) {
                step(1, "Ouvre MyRunningApp")
                step(2, "Crée ton compte : e-mail, mot de passe, puis le code reçu par e-mail")
                step(3, "Reviens dans RunSync et connecte-toi")
            }
            OpenMyRunningAppButton().padding(.top, 4)
        }
    }

    private func step(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            NumberBadge(number: number)
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 5 }
            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(Theme.text2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct ForgotPasswordSheet: View {
    var body: some View {
        SheetContainer(title: "Mot de passe oublié ?") {
            BodyText(Text("Ton mot de passe est celui de MyRunningApp. Pour le changer, ouvre MyRunningApp, puis ")
                     + Text("Profil › Mon compte").fontWeight(.semibold).foregroundStyle(Theme.text)
                     + Text(", rubrique Sécurité. Reviens ensuite ici avec le nouveau."))
            InfoNote(text: Text("Plus connecté à MyRunningApp ? Touche « Mot de passe oublié ? » sur son écran de connexion : tu recevras un code par e-mail."))
            OpenMyRunningAppButton().padding(.top, 4)
        }
    }
}
