import Foundation

struct Session: Codable {
    let accessToken: String
    let refreshToken: String
    let userId: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case userId
    }
}

private struct TokenResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: UserObject
    enum CodingKeys: String, CodingKey { case accessToken = "access_token", refreshToken = "refresh_token", user }
    struct UserObject: Codable { let id: String }
}

enum AuthError: LocalizedError {
    case invalidCredentials(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials(let message): return message
        }
    }
}

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
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error_description"]
            throw AuthError.invalidCredentials(message ?? "Identifiants invalides")
        }

        let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
        AuthService.currentSession = Session(accessToken: decoded.accessToken, refreshToken: decoded.refreshToken, userId: decoded.user.id)
    }

    // Les jetons d'accès Supabase expirent (1h par défaut). On ne rafraîchit
    // que si le dernier rafraîchissement date de plus de 45 min : un appel
    // réseau systématique à chaque sync coûte un aller-retour complet, ce qui
    // est déjà presque tout le budget d'exécution accordé par iOS à une
    // automatisation Shortcuts silencieuse (~1s avant d'être tuée, voir
    // SyncService.syncRecentWorkouts).
    // Renvoie false si le jeton de rafraîchissement lui-même n'est plus valide
    // (auquel cas il faut se reconnecter, pas réessayer indéfiniment).
    private static let lastRefreshKey = "runsync.lastTokenRefresh"

    @discardableResult
    func refreshIfPossible() async -> Bool {
        guard let session = AuthService.currentSession else { return false }

        if let last = UserDefaults.standard.object(forKey: Self.lastRefreshKey) as? Date,
           Date().timeIntervalSince(last) < 45 * 60 {
            return true
        }

        let url = URL(string: "\(Config.supabaseURL)/auth/v1/token?grant_type=refresh_token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["refresh_token": session.refreshToken])

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let decoded = try? JSONDecoder().decode(TokenResponse.self, from: data) else {
            return false
        }
        AuthService.currentSession = Session(accessToken: decoded.accessToken, refreshToken: decoded.refreshToken, userId: decoded.user.id)
        UserDefaults.standard.set(Date(), forKey: Self.lastRefreshKey)
        return true
    }
}
