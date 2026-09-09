import Foundation
import HealthKit
import os

private let bgLogger = Logger(subsystem: "com.omaralem.RunSync", category: "background")

// Remplace l'automatisation Shortcuts (budget d'exécution silencieux ~1s,
// bien trop court pour une synchro HealthKit + réseau — voir SyncWorkoutsIntent
// et les logs Console.app qui ont montré l'échec systématique).
//
// HKObserverQuery + enableBackgroundDelivery est le mécanisme qu'Apple prévoit
// pour ça : HealthKit réveille l'app avec une fenêtre d'exécution bien plus
// généreuse dès qu'une nouvelle séance apparaît, pas besoin d'automatisation
// externe ni d'heure fixe.
final class BackgroundSyncManager {
    static let shared = BackgroundSyncManager()

    private let store = HKHealthStore()
    private var observerQuery: HKObserverQuery?

    private init() {}

    // À appeler une fois, tôt, à chaque lancement du process (y compris un
    // lancement en arrière-plan déclenché par iOS) : la query ne survit pas
    // au process, il faut la ré-enregistrer systématiquement.
    func start() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let workoutType = HKObjectType.workoutType()

        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { _, completionHandler, error in
            if let error = error {
                bgLogger.error("[background] observer erreur: \(String(describing: error), privacy: .public)")
                completionHandler()
                return
            }
            bgLogger.notice("[background] nouvelle donnée détectée, synchro déclenchée")
            Task {
                defer { completionHandler() }
                do {
                    let result = try await SyncService().syncRecentWorkouts()
                    bgLogger.notice("[background] synchro réussie, \(result.workoutsFound) séance(s)")
                } catch {
                    bgLogger.error("[background] échec synchro: \(String(describing: error), privacy: .public)")
                }
            }
        }

        observerQuery = query
        store.execute(query)

        store.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { success, error in
            if let error = error {
                bgLogger.error("[background] enableBackgroundDelivery échec: \(String(describing: error), privacy: .public)")
            } else {
                bgLogger.notice("[background] enableBackgroundDelivery = \(success, privacy: .public)")
            }
        }
    }
}
