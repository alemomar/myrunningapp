import Foundation

struct HrPoint: Codable {
    let t: Int   // secondes depuis le début de la séance
    let hr: Int  // bpm
}

struct PacePoint: Codable {
    let t: Int         // secondes depuis le début de la séance
    let paceSecKm: Int // secondes par km sur cet intervalle

    enum CodingKeys: String, CodingKey {
        case t
        case paceSecKm = "pace"
    }
}

// Frontière d'intervalle posée par HealthKit lui-même (événement .lap), pas
// reconstruite depuis l'allure GPS : quand la séance a été enregistrée via
// l'entraînement fractionné structuré de la Watch (Work/Récup programmés),
// ces bornes sont exactes — bien plus fiables que la détection heuristique
// côté dashboard, qui doit deviner les frontières depuis un signal GPS
// bruité. `start`/`end` en secondes depuis le début de la séance.
struct LapMarker: Codable {
    let start: Int
    let end: Int
}

// Les clés doivent correspondre aux colonnes de la table `runs` (db/schema.sql)
struct WorkoutPayload: Codable {
    let userId: String
    let startDate: String   // ISO 8601, ex: 2026-08-10T09:15:00Z
    let appleType: String   // ex: "Running", "Yoga", "FunctionalStrengthTraining"
    let type: String        // EF / Long / Récup / Yoga... (estimation, voir guessType())
    let distanceKm: Double
    let durationSec: Double
    let avgHr: Double?
    let peakHr: Double?
    let calories: Double?
    let avgCadence: Double?
    let avgPower: Double?
    let lieu: String?
    let notes: String?
    let hrSeries: [HrPoint]?
    let paceSeries: [PacePoint]?
    let lapMarkers: [LapMarker]?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case startDate = "start_date"
        case appleType = "apple_type"
        case type
        case distanceKm = "distance_km"
        case durationSec = "duration_sec"
        case avgHr = "avg_hr"
        case peakHr = "peak_hr"
        case calories
        case avgCadence = "avg_cadence"
        case avgPower = "avg_power"
        case lieu
        case notes
        case hrSeries = "hr_series"
        case paceSeries = "pace_series"
        case lapMarkers = "lap_markers"
    }

    // PostgREST exige des objets aux clés identiques dans un même envoi groupé :
    // on encode explicitement `null` pour les champs absents plutôt que d'omettre la clé
    // (comportement par défaut de Codable pour les Optional).
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(startDate, forKey: .startDate)
        try c.encode(appleType, forKey: .appleType)
        try c.encode(type, forKey: .type)
        try c.encode(distanceKm, forKey: .distanceKm)
        try c.encode(durationSec, forKey: .durationSec)
        try c.encode(avgHr, forKey: .avgHr)
        try c.encode(peakHr, forKey: .peakHr)
        try c.encode(calories, forKey: .calories)
        try c.encode(avgCadence, forKey: .avgCadence)
        try c.encode(avgPower, forKey: .avgPower)
        try c.encode(lieu, forKey: .lieu)
        try c.encode(notes, forKey: .notes)
        try c.encode(hrSeries, forKey: .hrSeries)
        try c.encode(paceSeries, forKey: .paceSeries)
        try c.encode(lapMarkers, forKey: .lapMarkers)
    }
}

// Best-effort : Apple ne connait pas la notion d'EF/Fractionné/Long/Récup,
// ni les catégories Marche/Souplesse/Pilates qu'on distingue nous-mêmes.
// Éditable plus tard depuis le dashboard.
func guessType(appleType: String, distanceKm: Double) -> String {
    switch appleType {
    case "Running": return distanceKm > 10 ? "Long" : "EF"
    case "Walking": return "Marche"
    case "Yoga": return "Yoga"
    case "Pilates": return "Pilates"
    case "FunctionalStrengthTraining", "TraditionalStrengthTraining", "CoreTraining": return "Renfo"
    case "Flexibility": return "Souplesse"
    case "Cooldown": return "Mobilité"
    default: return "Other"
    }
}
