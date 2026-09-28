# App iOS RunSync — sync HealthKit → dashboard

Depuis le 28/09/2026, le vrai projet Xcode est versionné directement dans
ce dossier (`RunSync.xcodeproj` + `RunSync/`) — plus besoin de recréer un
projet à la main ni de glisser des fichiers un par un. HealthKit, les
descriptions de confidentialité et l'icône d'app sont déjà configurés
dans le projet.

## 1. Ouvrir le projet

1. Clone ce dépôt (ou récupère-le à jour si tu l'as déjà).
2. Ouvre `ios-app/RunSync.xcodeproj` directement dans Xcode.

## 2. Vérifier la signature (première fois sur un nouveau Mac)

1. Clique sur le nom du projet en haut de la liste de fichiers à gauche.
2. Onglet **Signing & Capabilities**.
3. Dans **Team**, sélectionne ton propre compte (le compte lié au projet
   à l'origine n'est pas transférable automatiquement) — voir le README
   principal du dépôt si tu dois reconfigurer un compte Apple Developer
   depuis zéro.

## 3. Build & installer sur ton iPhone

1. Branche ton iPhone en USB (ou assure-toi qu'il est sur le même wifi avec le déverrouillage sans fil activé).
2. En haut d'Xcode, choisis ton iPhone comme destination (au lieu d'un simulateur ou "Any iOS Device" qui sert à l'archive TestFlight).
3. Clique sur ▶️ (Run).
4. Sur ton iPhone, la première fois : **Réglages → Général → VPN et gestion de l'appareil** → fais confiance à ton certificat développeur.
5. Relance l'app depuis ton iPhone.

## 4. Premier test

1. Ouvre l'app, appuie sur **"Synchroniser mes courses"**.
2. iOS va te demander l'autorisation d'accéder à Santé — accepte (coche au moins Entraînements, Fréquence cardiaque, Distance, Calories, Nombre de pas).
3. Vérifie le message affiché, puis va voir sur le dashboard web (`web/index.html`) que les séances sont bien arrivées — RunSync envoie directement à Supabase, plus de Google Sheet intermédiaire (ancien pipeline retiré le 28/09/2026).

## 5. Synchro automatique en arrière-plan (pas besoin de Shortcuts)

L'app se synchronise **automatiquement dès qu'une nouvelle séance apparaît dans Santé**, via `BackgroundSyncManager.swift` (HealthKit `HKObserverQuery` + `enableBackgroundDelivery`). Pas d'automatisation Shortcuts à configurer — ça s'enregistre tout seul à chaque lancement de l'app (`RunSyncApp.init()`).

**Pourquoi pas Shortcuts** : testé et abandonné — une automatisation Shortcuts silencieuse ("Automatisation personnelle" sans "Demander avant l'exécution") ne dispose que d'environ **1 seconde** de budget d'exécution avant qu'iOS ne tue le process (`LNContextErrorDomain` code 2022, confirmé par logs Console.app) — bien trop court pour HealthKit + réseau. `HKObserverQuery` dispose d'une fenêtre bien plus généreuse, prévue par Apple pour ce cas d'usage exact.

**Vérifier que ça fonctionne** : Console.app → filtre `com.omaralem.RunSync` → chercher `[background]` après une nouvelle séance enregistrée dans Santé.

**Si tu veux quand même une synchro à heure fixe en plus** (filet de sécurité), le bouton "Forcer une synchronisation" dans l'app fait ça manuellement.

## Distribution TestFlight

Pour envoyer un nouveau build aux testeurs : Xcode → destination "Any iOS
Device (arm64)" → **Product → Archive** → dans l'Organizer, **Distribute
App → App Store Connect → Upload**. Voir App Store Connect → TestFlight
pour le suivi de la revue et l'ajout de testeurs.
