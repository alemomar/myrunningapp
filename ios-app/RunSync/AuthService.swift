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
        email ?? Self.claims(of: accessToken)?["email"] as? String
    }

    // Fin de validité du jeton d'accès (champ « exp » du JWT).
    var expiresAt: Date? {
        (Self.claims(of: accessToken)?["exp"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue) }
    }

    private static func claims(of token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard let data = Data(base64Encoded: base64) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}

extension Notification.Name {
    // L'app a rafraîchi la session elle-même (synchro en arrière-plan) : la page doit reprendre les nouveaux jetons.
    static let sessionRefreshed = Notification.Name("mra.sessionRefreshed")
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
        webSession = nil
    }

    // MARK: Session partagée avec la page (app unique, 03/11/2026)
    //
    // La page MyRunningApp affichée dans l'app (WebAppView) et la synchro Apple Santé utilisent UNE seule session : les
    // jetons de rafraîchissement de Supabase ne servent qu'une fois, deux sessions séparées finiraient par se déconnecter
    // l'une l'autre. La page transmet chaque session neuve (connexion, rafraîchissement) : on la garde telle quelle. Au
    // chargement de la page, on lui rend la plus récente (avec les jetons rafraîchis ici entre-temps, le cas échéant).

    private static let webSessionKey = "mra.webSession"
    // Clé de stockage de supabase-js dans la page : « sb-<projet>-auth-token ».
    static let webStorageKey = "sb-\(URL(string: Config.supabaseURL)?.host?.split(separator: ".").first ?? "")-auth-token"

    // La session telle que la page l'a transmise (objet JSON de supabase-js).
    private static var webSession: [String: Any]? {
        get {
            guard let data = UserDefaults.standard.data(forKey: webSessionKey) else { return nil }
            return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }
        set {
            if let newValue, let data = try? JSONSerialization.data(withJSONObject: newValue) {
                UserDefaults.standard.set(data, forKey: webSessionKey)
            } else {
                UserDefaults.standard.removeObject(forKey: webSessionKey)
            }
        }
    }

    // Session reçue de la page. Renvoie true si c'est un autre compte que celui d'avant.
    @discardableResult
    static func adoptWebSession(_ object: [String: Any]) -> Bool {
        guard let access = object["access_token"] as? String, let refresh = object["refresh_token"] as? String,
              let user = object["user"] as? [String: Any], let userId = user["id"] as? String else { return false }
        let otherAccount = currentSession?.userId != userId
        currentSession = Session(accessToken: access, refreshToken: refresh, userId: userId, email: user["email"] as? String)
        webSession = object
        return otherAccount
    }

    // La session à rendre à la page. Une session d'avant l'app unique (RunSync seul) n'a jamais été vue par la page : on
    // la lui donne déjà expirée, pour que supabase-js la rafraîchisse tout de suite et récupère le compte complet.
    static func sessionForWeb() -> [String: Any]? {
        guard let session = currentSession else { return nil }
        if var object = webSession, (object["user"] as? [String: Any])?["id"] as? String == session.userId {
            if object["refresh_token"] as? String != session.refreshToken {
                object["access_token"] = session.accessToken
                object["refresh_token"] = session.refreshToken
                if let expiresAt = session.expiresAt {
                    object["expires_at"] = Int(expiresAt.timeIntervalSince1970)
                    object["expires_in"] = max(0, Int(expiresAt.timeIntervalSinceNow))
                }
            }
            return object
        }
        return ["access_token": session.accessToken, "refresh_token": session.refreshToken, "token_type": "bearer",
                "expires_in": 0, "expires_at": 0,
                "user": ["id": session.userId, "email": session.accountEmail ?? "", "aud": "authenticated", "role": "authenticated",
                         "app_metadata": [String: Any](), "user_metadata": [String: Any]()]]
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

    // Avant une synchro (app unique) : on ne rafraîchit que si le jeton d'accès expire dans moins de 5 minutes. La page le
    // rafraîchit elle-même quand elle est ouverte ; chaque rafraîchissement d'ici invalide le jeton qu'elle garde, il faut
    // donc le lui repasser (notification `sessionRefreshed`).
    func refreshIfNeeded() async {
        guard let session = AuthService.currentSession else { return }
        if let expiresAt = session.expiresAt, expiresAt.timeIntervalSinceNow > 300 { return }
        if await refresh() == .refreshed {
            await MainActor.run { NotificationCenter.default.post(name: .sessionRefreshed, object: nil) }
        }
    }
}
