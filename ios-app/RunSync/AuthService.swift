import Foundation

struct Session: Codable {
    let accessToken: String
    let refreshToken: String
    let userId: String
    // Absent des sessions enregistrées avant la version 3 de RunSync : voir `accountEmail`.
    let email: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case userId
        case email
    }

    // Adresse du compte connecté, affichée sur l'écran principal et comparée à celle que MyRunningApp
    // transmet par son lien. Les anciennes sessions ne l'ont pas : on la lit alors dans le jeton d'accès
    // (un JWT Supabase porte l'adresse du compte), jusqu'au prochain rafraîchissement qui l'enregistre.
    var accountEmail: String? {
        email ?? Self.emailInToken(accessToken)
    }

    private static func emailInToken(_ token: String) -> String? {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard let data = Data(base64Encoded: base64),
              let claims = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        return claims["email"] as? String
    }
}

private struct TokenResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: UserObject
    enum CodingKeys: String, CodingKey { case accessToken = "access_token", refreshToken = "refresh_token", user }
    struct UserObject: Codable {
        let id: String
        let email: String?
    }
}

enum AuthError: LocalizedError {
    case signInFailed(String)

    var errorDescription: String? {
        switch self {
        case .signInFailed(let message): return message
        }
    }
}

// Pas de création de compte ici (décision d'Omar du 06/10/2026) : le compte se crée dans MyRunningApp, seul
// endroit qui sait saisir le code reçu par e-mail. RunSync ne fait que s'y connecter.
final class AuthService {
    private static let defaultsKey = "runsync.session"

    static var currentSession: Session? {
        get {
            guard let data = UserDefaults.standard.data(forKey: defaultsKey) else { return nil }
            return try? JSONDecoder().decode(Session.self, from: data)
        }
        set {
            if let newValue, let data = try? JSONEncoder().encode(newValue) {
                UserDefaults.standard.set(data, forKey: defaultsKey)
            } else {
                UserDefaults.standard.removeObject(forKey: defaultsKey)
            }
        }
    }

    static func signOut() {
        currentSession = nil
    }

    func signIn(email: String, password: String) async throws {
        let url = URL(string: "\(Config.supabaseURL)/auth/v1/token?grant_type=password")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email, "password": password])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            // Deux formats selon la version de Supabase : {error, error_description} ou {error_code, msg}.
            let fields = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
            let code = (fields["error_code"] as? String) ?? (fields["error"] as? String) ?? ""
            let text = (fields["msg"] as? String) ?? (fields["error_description"] as? String) ?? ""
            throw AuthError.signInFailed(Self.signInMessage(code: code, text: text, status: (response as? HTTPURLResponse)?.statusCode))
        }

        let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
        AuthService.currentSession = Session(accessToken: decoded.accessToken, refreshToken: decoded.refreshToken,
                                             userId: decoded.user.id, email: decoded.user.email ?? email)
    }

    // Mêmes mots que l'app web (authErrorInfo dans web/logic.js).
    private static func signInMessage(code: String, text: String, status: Int?) -> String {
        let all = "\(code) \(text)".lowercased()
        if all.contains("email_not_confirmed") || all.contains("email not confirmed") {
            return "Ton adresse n'est pas encore confirmée : ouvre MyRunningApp et saisis le code reçu par e-mail."
        }
        if all.contains("invalid_credentials") || all.contains("invalid login credentials") || all.contains("invalid_grant") {
            return "E-mail ou mot de passe incorrect."
        }
        if status == 429 || all.contains("rate_limit") {
            return "Trop d'essais d'un coup : patiente une minute, puis réessaie."
        }
        return "Connexion impossible pour le moment. Réessaie dans un instant."
    }

    // Message à afficher pour une erreur de connexion, réseau compris.
    static func message(for error: Error) -> String {
        if error is URLError { return "Pas de connexion : vérifie ton réseau et réessaie." }
        return (error as? LocalizedError)?.errorDescription ?? "Connexion impossible pour le moment. Réessaie dans un instant."
    }

    enum RefreshOutcome {
        case refreshed
        case offline    // réseau absent ou Supabase injoignable : la session reste valable
        case expired    // jeton de rafraîchissement refusé : il faut se reconnecter
    }

    // Les jetons d'accès Supabase expirent (1h par défaut). On rafraîchit systématiquement avant une sync plutôt
    // que de suivre une date d'expiration. Une coupure réseau ne déconnecte plus : seul un refus de Supabase le fait.
    func refresh() async -> RefreshOutcome {
        guard let session = AuthService.currentSession else { return .expired }

        let url = URL(string: "\(Config.supabaseURL)/auth/v1/token?grant_type=refresh_token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["refresh_token": session.refreshToken])

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else {
            return .offline
        }
        guard (200..<300).contains(http.statusCode),
              let decoded = try? JSONDecoder().decode(TokenResponse.self, from: data) else {
            return (400..<500).contains(http.statusCode) ? .expired : .offline
        }
        AuthService.currentSession = Session(accessToken: decoded.accessToken, refreshToken: decoded.refreshToken,
                                             userId: decoded.user.id, email: decoded.user.email ?? session.email)
        return .refreshed
    }

    @discardableResult
    func refreshIfPossible() async -> Bool {
        await refresh() == .refreshed
    }
}
