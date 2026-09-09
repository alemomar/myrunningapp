# App iOS — sync HealthKit → dashboard

## 1. Créer le projet dans Xcode

1. Ouvre Xcode → **Create New Project**
2. Choisis **iOS** → **App** → Next
3. Nom du produit : `RunSync` (ou ce que tu veux), interface **SwiftUI**, langage **Swift**
4. Enregistre-le n'importe où sur ton Mac (pas besoin que ce soit dans ce dossier Google Drive)

## 2. Activer HealthKit

1. Clique sur le nom du projet en haut de la liste de fichiers à gauche
2. Onglet **Signing & Capabilities**
3. **+ Capability** → cherche **HealthKit** → ajoute-le
4. Toujours dans **Signing & Capabilities**, vérifie qu'un **Team** (ton Apple ID personnel) est sélectionné dans "Signing"

## 3. Ajouter la description d'usage (obligatoire pour Apple)

1. Ouvre le fichier **Info** (ou `Info.plist` selon la version d'Xcode)
2. Ajoute une clé **Privacy - Health Share Usage Description** avec la valeur : `Utilisé pour synchroniser tes séances de course vers ton dashboard personnel.`

## 4. Remplacer les fichiers du projet

Supprime le fichier `ContentView.swift` et le fichier `RunSyncApp.swift` (ou `NomDuProjetApp.swift`) créés par défaut par Xcode, puis fais glisser tous les fichiers de ce dossier `ios-app/` dans le projet Xcode (clic droit sur le dossier du projet → **Add Files to "RunSync"...**) :

- `Config.swift`
- `Models.swift`
- `HealthKitManager.swift`
- `BackgroundSyncManager.swift`
- `SyncService.swift`
- `ContentView.swift`
- `RunSyncApp.swift`
- `SyncWorkoutsIntent.swift`

## 5. Build & installer sur ton iPhone

1. Branche ton iPhone en USB (ou assure-toi qu'il est sur le même wifi avec le déverrouillage sans fil activé)
2. En haut d'Xcode, choisis ton iPhone comme destination (au lieu d'un simulateur)
3. Clique sur ▶️ (Run)
4. Sur ton iPhone, la première fois : **Réglages → Général → VPN et gestion de l'appareil** → fais confiance à ton certificat développeur
5. Relance l'app depuis ton iPhone

## 6. Premier test

1. Ouvre l'app, appuie sur **"Synchroniser mes courses"**
2. iOS va te demander l'autorisation d'accéder à Santé — accepte (coche au moins Entraînements, Fréquence cardiaque, Distance, Calories, Nombre de pas)
3. Vérifie le message affiché, puis va voir dans ta Google Sheet ("Running Data - Omar") que les séances sont bien arrivées dans l'onglet **Runs**

## 7. Synchro automatique en arrière-plan (pas besoin de Shortcuts)

Depuis septembre 2026, l'app se synchronise **automatiquement dès qu'une nouvelle séance apparaît dans Santé**, via `BackgroundSyncManager.swift` (HealthKit `HKObserverQuery` + `enableBackgroundDelivery`). Pas d'automatisation Shortcuts à configurer — ça s'enregistre tout seul à chaque lancement de l'app (`RunSyncApp.init()`).

**Pourquoi pas Shortcuts** : testé et abandonné — une automatisation Shortcuts silencieuse ("Automatisation personnelle" sans "Demander avant l'exécution") ne dispose que d'environ **1 seconde** de budget d'exécution avant qu'iOS ne tue le process (`LNContextErrorDomain` code 2022, confirmé par logs Console.app) — bien trop court pour HealthKit + réseau. `HKObserverQuery` dispose d'une fenêtre bien plus généreuse, prévue par Apple pour ce cas d'usage exact.

**Vérifier que ça fonctionne** : Console.app → filtre `com.omaralem.RunSync` → chercher `[background]` après une nouvelle séance enregistrée dans Santé.

**Si tu veux quand même une synchro à heure fixe en plus** (filet de sécurité), le bouton "Forcer une synchronisation" dans l'app fait ça manuellement.
