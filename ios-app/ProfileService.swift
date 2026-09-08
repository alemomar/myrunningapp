import Foundation

// Date de début de sync propre à l'utilisateur, stockée dans Supabase.
// Pas de valeur par défaut silencieuse : tant que l'utilisateur n'a pas
// choisi explicitement (voir SetupSyncDateView), fetchSyncSinceDate renvoie nil.
final class ProfileService {
    static let isoDate: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    // Cache local : évite un aller-retour réseau à chaque sync pour relire une
    // valeur qu'on a nous-même écrite. Sur le chemin critique d'une automatisation
    // Shortcuts silencieuse, iOS ne laisse qu'environ 1s avant de tuer le
    // processus (voir SyncService.syncRecentWorkouts) — un GET réseau de plus
    // ici suffit à dépasser ce budget.
    private static let cacheKey = "runsync.syncSinceDateCache"

    // nil = pas encore configuré par l'utilisateur (ni en cache, ni côté serveur)
    func fetchSyncSinceDate(session: Session) async -> Date? {
        if let cached = UserDefaults.standard.object(forKey: Self.cacheKey) as? Date {
            return cached
        }

        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/profiles?user_id=eq.\(session.userId)&select=sync_since_date")!)
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([[String: String]].self, from: data),
              let dateString = rows.first?["sync_since_date"] else {
            return nil
        }
        let date = Self.isoDate.date(from: dateString)
        UserDefaults.standard.set(date, forKey: Self.cacheKey)
        return date
    }

    func setSyncSinceDate(session: Session, date: Date) async throws {
        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/profiles")!)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode([
            "user_id": session.userId,
            "sync_since_date": Self.isoDate.string(from: date),
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SyncServiceError.badResponse(String(data: data, encoding: .utf8) ?? "réponse invalide")
        }
        UserDefaults.standard.set(date, forKey: Self.cacheKey)
    }

    struct RestingHrInfo {
        let value: Int?
        let updatedAt: Date?
        let isManual: Bool
    }

    // nil/nil = pas encore de valeur en base (ni auto, ni manuelle)
    func fetchRestingHrInfo(session: Session) async -> RestingHrInfo {
        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/profiles?user_id=eq.\(session.userId)&select=resting_hr,resting_hr_updated_at,resting_hr_is_manual")!)
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first else {
            return RestingHrInfo(value: nil, updatedAt: nil, isManual: false)
        }
        let value = row["resting_hr"] as? Int
        let updatedAtFormatter = ISO8601DateFormatter()
        updatedAtFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let updatedAtString = row["resting_hr_updated_at"] as? String
        let updatedAt = updatedAtString.flatMap(updatedAtFormatter.date(from:))
        let isManual = (row["resting_hr_is_manual"] as? Bool) ?? false
        return RestingHrInfo(value: value, updatedAt: updatedAt, isManual: isManual)
    }

    private struct RestingHrPayload: Encodable {
        let userId: String
        let restingHr: Int
        let restingHrUpdatedAt: String
        let restingHrIsManual: Bool
        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case restingHr = "resting_hr"
            case restingHrUpdatedAt = "resting_hr_updated_at"
            case restingHrIsManual = "resting_hr_is_manual"
        }
    }

    // isManual: false pour un rafraîchissement auto (voir SyncService), true
    // uniquement quand l'utilisateur la saisit lui-même depuis le dashboard —
    // une valeur manuelle n'est ensuite plus jamais écrasée automatiquement.
    func setRestingHr(session: Session, value: Int, isManual: Bool) async throws {
        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/profiles")!)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        let payload = RestingHrPayload(userId: session.userId, restingHr: value, restingHrUpdatedAt: ISO8601DateFormatter().string(from: Date()), restingHrIsManual: isManual)
        request.httpBody = try JSONEncoder().encode(payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SyncServiceError.badResponse(String(data: data, encoding: .utf8) ?? "réponse invalide")
        }
    }

    struct Vo2MaxInfo {
        let value: Double?
        let updatedAt: Date?
        let isManual: Bool
    }

    func fetchVo2MaxInfo(session: Session) async -> Vo2MaxInfo {
        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/profiles?user_id=eq.\(session.userId)&select=vo2_max,vo2_max_updated_at,vo2_max_is_manual")!)
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first else {
            return Vo2MaxInfo(value: nil, updatedAt: nil, isManual: false)
        }
        let value = row["vo2_max"] as? Double
        let updatedAtFormatter = ISO8601DateFormatter()
        updatedAtFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let updatedAtString = row["vo2_max_updated_at"] as? String
        let updatedAt = updatedAtString.flatMap(updatedAtFormatter.date(from:))
        let isManual = (row["vo2_max_is_manual"] as? Bool) ?? false
        return Vo2MaxInfo(value: value, updatedAt: updatedAt, isManual: isManual)
    }

    private struct Vo2MaxPayload: Encodable {
        let userId: String
        let vo2Max: Double
        let vo2MaxUpdatedAt: String
        let vo2MaxIsManual: Bool
        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case vo2Max = "vo2_max"
            case vo2MaxUpdatedAt = "vo2_max_updated_at"
            case vo2MaxIsManual = "vo2_max_is_manual"
        }
    }

    func setVo2Max(session: Session, value: Double, isManual: Bool) async throws {
        var request = URLRequest(url: URL(string: "\(Config.supabaseURL)/rest/v1/profiles")!)
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        let payload = Vo2MaxPayload(userId: session.userId, vo2Max: value, vo2MaxUpdatedAt: ISO8601DateFormatter().string(from: Date()), vo2MaxIsManual: isManual)
        request.httpBody = try JSONEncoder().encode(payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SyncServiceError.badResponse(String(data: data, encoding: .utf8) ?? "réponse invalide")
        }
    }
}
