import Foundation
import HealthKit

final class HealthKitManager {
    private let store = HKHealthStore()

    private var typesToRead: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .vo2Max)!,
        ]
        if let power = HKObjectType.quantityType(forIdentifier: .runningPower) {
            types.insert(power)
        }
        return types
    }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw SyncError.healthDataUnavailable
        }
        try await store.requestAuthorization(toShare: [], read: typesToRead)
    }

    func fetchWorkouts(since start: Date) async throws -> [HKWorkout] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: nil, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKObjectType.workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                // Exclut les séances écrites par des apps tierces (Whoop en particulier),
                // qui gardent leur propre nom/bundle identifier dans HealthKit. On exclut
                // plutôt que de n'autoriser qu'un identifiant Apple deviné (fragile).
                let workouts = (samples as? [HKWorkout] ?? []).filter { workout in
                    let source = workout.sourceRevision.source
                    let name = source.name.lowercased()
                    let bundleId = source.bundleIdentifier.lowercased()
                    return !name.contains("whoop") && !bundleId.contains("whoop")
                }
                continuation.resume(returning: workouts)
            }
            store.execute(query)
        }
    }

    private func averageQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, stats, _ in
                continuation.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func maxQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteMax) { _, stats, _ in
                continuation.resume(returning: stats?.maximumQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func sumQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                continuation.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    // Échantillons FC bruts sur la séance : c'est la seule façon de distinguer
    // un fractionné (FC qui oscille) d'un EF régulier — une moyenne/max seule
    // ne montre pas la structure temporelle. Le calcul des zones et la
    // détection se font côté dashboard, pas ici (l'app iOS ne fait que
    // remonter la donnée brute).
    private func fetchHeartRateSamples(start: Date, end: Date) async -> [(Date, Double)] {
        guard let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) else { return [] }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let unit = HKUnit.count().unitDivided(by: .minute())

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: hrType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, _ in
                let points = (samples as? [HKQuantitySample] ?? []).map { sample in
                    (sample.startDate, sample.quantity.doubleValue(for: unit))
                }
                continuation.resume(returning: points)
            }
            store.execute(query)
        }
    }

    private func buildHrSeries(start: Date, samples: [(Date, Double)]) -> [HrPoint] {
        samples.map { HrPoint(t: Int(round($0.0.timeIntervalSince(start))), hr: Int(round($0.1))) }
    }

    // Échantillons de distance bruts (deltas par intervalle, pas un cumul) :
    // permet de calculer une allure instantanée dans le temps, pour distinguer
    // plus tard les phases "Work" des phases de récup sur un fractionné.
    // Calcul et interprétation faits côté dashboard, pas ici.
    private func fetchDistanceSamples(start: Date, end: Date) async -> [(Date, Date, Double)] {
        guard let type = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) else { return [] }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, _ in
                let points = (samples as? [HKQuantitySample] ?? []).map { sample in
                    (sample.startDate, sample.endDate, sample.quantity.doubleValue(for: .meter()))
                }
                continuation.resume(returning: points)
            }
            store.execute(query)
        }
    }

    // Filtre les intervalles aberrants (arrêt, sursaut GPS) pour ne pas polluer
    // la série avec des allures impossibles (ex: 3s/km ou 25min/km).
    private func buildPaceSeries(start: Date, samples: [(Date, Date, Double)]) -> [PacePoint] {
        samples.compactMap { (sStart, sEnd, meters) in
            let dt = sEnd.timeIntervalSince(sStart)
            guard dt > 0, meters > 0 else { return nil }
            let paceSecPerKm = dt / (meters / 1000)
            guard paceSecPerKm > 120 && paceSecPerKm < 1200 else { return nil }
            return PacePoint(t: Int(round(sStart.timeIntervalSince(start))), paceSecKm: Int(round(paceSecPerKm)))
        }
    }

    // Frontières d'intervalles posées par HealthKit lui-même, quand la séance
    // a été enregistrée via un plan d'entraînement structuré programmé sur la
    // Watch (Warmup/Work/Récup/Cooldown) — bien plus fiables que la
    // reconstruction heuristique depuis l'allure GPS faite côté dashboard.
    // Chaque bloc du plan (une répétition Work, une répétition Récup...) est
    // une HKWorkoutActivity distincte au sein de la même HKWorkout — PAS un
    // événement .lap (essayé en premier, s'est avéré toujours vide : cette
    // API-là sert à autre chose). Une séance libre sans plan structuré n'a
    // qu'UNE SEULE activité couvrant toute sa durée : on l'ignore (pas une
    // vraie frontière d'intervalle).
    func extractLapMarkers(workout: HKWorkout, start: Date) async -> [LapMarker] {
        let activities = workout.workoutActivities
        guard activities.count > 1 else { return [] }
        var markers: [LapMarker] = []
        for activity in activities {
            let activityEnd = activity.endDate ?? activity.startDate
            let pace = await computeActivityPace(start: activity.startDate, end: activityEnd)
            markers.append(LapMarker(
                start: Int(round(activity.startDate.timeIntervalSince(start))),
                end: Int(round(activityEnd.timeIntervalSince(start))),
                paceSecKm: pace
            ))
        }
        return markers
    }

    // Allure exacte d'un intervalle : distance totale mesurée par HealthKit
    // sur EXACTEMENT [start,end] / durée exacte — pas une moyenne de nos
    // échantillons d'allure instantanée (dont la méthode de calcul diverge
    // de celle d'Apple, écart constant de ~7-9% observé en comparant à
    // l'app Fitness sur des séances réelles).
    private func computeActivityPace(start: Date, end: Date) async -> Int? {
        let duration = end.timeIntervalSince(start)
        guard duration > 0,
              let meters = await sumQuantity(.distanceWalkingRunning, unit: .meter(), start: start, end: end),
              meters > 0 else { return nil }
        let paceSecPerKm = duration / (meters / 1000)
        guard paceSecPerKm > 60 && paceSecPerKm < 1800 else { return nil }
        return Int(round(paceSecPerKm))
    }

    // FC de repos : calculée par la Watch une fois par jour. On prend la
    // plus récente disponible plutôt qu'une valeur liée à une séance précise.
    func fetchLatestRestingHeartRate() async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: .restingHeartRate) else { return nil }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let unit = HKUnit.count().unitDivided(by: .minute())

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                let value = (samples as? [HKQuantitySample])?.first?.quantity.doubleValue(for: unit)
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    // VO2 max : estimée automatiquement par la Watch (marche/course en extérieur
    // avec GPS), contrairement à la FC max qui n'a aucun équivalent auto.
    func fetchLatestVo2Max() async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: .vo2Max) else { return nil }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let unit = HKUnit(from: "ml/(kg*min)")

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                let value = (samples as? [HKQuantitySample])?.first?.quantity.doubleValue(for: unit)
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    // HealthKit n'a pas d'identifiant "cadence de course" dédié : on approxime
    // avec le nombre de pas / minute sur la fenêtre de la séance. À vérifier
    // empiriquement une fois qu'on aura de vraies données.
    private func approximateCadence(start: Date, end: Date) async -> Double? {
        guard let stepsSum = await sumQuantity(.stepCount, unit: .count(), start: start, end: end) else { return nil }
        let minutes = end.timeIntervalSince(start) / 60
        guard minutes > 0 else { return nil }
        return stepsSum / minutes
    }

    func buildPayload(for workout: HKWorkout, userId: String) async -> WorkoutPayload {
        let start = workout.startDate
        let end = workout.endDate

        let hrUnit = HKUnit.count().unitDivided(by: .minute())
        async let avgHR = averageQuantity(.heartRate, unit: hrUnit, start: start, end: end)
        async let peakHR = maxQuantity(.heartRate, unit: hrUnit, start: start, end: end)
        async let avgPower = averageQuantity(.runningPower, unit: .watt(), start: start, end: end)
        async let avgCadence = approximateCadence(start: start, end: end)
        async let hrSamples = fetchHeartRateSamples(start: start, end: end)
        async let distanceSamples = fetchDistanceSamples(start: start, end: end)

        let lapMarkers = await extractLapMarkers(workout: workout, start: start)
        let distanceKm = (workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo))) ?? 0
        let calories = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie())
        let isoFormatter = ISO8601DateFormatter()
        let appleType = workout.workoutActivityType.name

        return await WorkoutPayload(
            userId: userId,
            startDate: isoFormatter.string(from: start),
            appleType: appleType,
            type: guessType(appleType: appleType, distanceKm: distanceKm),
            distanceKm: distanceKm,
            durationSec: workout.duration,
            avgHr: avgHR,
            peakHr: peakHR,
            calories: calories,
            avgCadence: avgCadence,
            avgPower: avgPower,
            lieu: nil,
            notes: nil,
            hrSeries: buildHrSeries(start: start, samples: await hrSamples),
            paceSeries: buildPaceSeries(start: start, samples: await distanceSamples),
            lapMarkers: lapMarkers.isEmpty ? nil : lapMarkers
        )
    }
}

enum SyncError: LocalizedError {
    case healthDataUnavailable

    var errorDescription: String? {
        "HealthKit n'est pas disponible sur cet appareil."
    }
}

extension HKWorkoutActivityType {
    // Nom envoyé au backend, lu par guessType() dans AppsScript.gs
    var name: String {
        switch self {
        case .running: return "Running"
        case .walking: return "Walking"
        case .yoga: return "Yoga"
        case .functionalStrengthTraining: return "FunctionalStrengthTraining"
        case .traditionalStrengthTraining: return "TraditionalStrengthTraining"
        case .flexibility: return "Flexibility"
        case .cooldown: return "Cooldown"
        default: return "Other"
        }
    }
}
