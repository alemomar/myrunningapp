# Sync automatique Apple Watch → dashboard

## 1. Déployer le backend (Google Apps Script)

1. Va sur [script.google.com](https://script.google.com) → Nouveau projet.
2. Colle le contenu de `AppsScript.gs` dans l'éditeur (remplace le code par défaut).
3. Déployer → Nouveau déploiement → Type : **Application web**.
   - Exécuter en tant que : Moi
   - Qui a accès : **Tout le monde** (nécessaire pour que le Shortcut puisse l'appeler)
4. Autorise les permissions demandées (accès à tes propres Sheets).
5. Copie l'URL du déploiement (se termine par `/exec`) — c'est ton `SYNC_URL`, donne-la moi pour brancher le dashboard.
6. Une Google Sheet "Runs" est créée automatiquement dans ton Drive au premier appel — c'est là que les séances s'accumulent (tu peux corriger la colonne `type` à la main si le classement auto (EF/Fractionné/Long...) est faux).

## 2. Créer l'automatisation Shortcuts (iPhone)

1. App **Raccourcis** → onglet **Automatisation** → **+** → **Créer une automatisation personnelle**.
2. Déclencheur : **Heure de la journée** → ex. tous les jours à 20h (ou hebdo).
3. **Important** : après création, tape sur l'automatisation → désactive **"Demander avant l'exécution"** — sinon elle ne tournera jamais toute seule.
4. Actions à ajouter :
   - **Rechercher des échantillons Santé** → Type : Entraînement → Date de début : dans les 7 derniers jours
   - **Répéter avec chaque élément** (boucle sur les résultats)
   - Dans la boucle, construis un dictionnaire avec les champs disponibles (teste ce qui apparaît réellement : Type d'entraînement, Date de début, Durée, Distance totale, Fréquence cardiaque moyenne, Énergie active — la cadence/puissance ne sont pas garanties disponibles ici, à vérifier)
   - Ajoute chaque dictionnaire à une liste
   - **Obtenir le contenu de l'URL** :
     - URL : ton `SYNC_URL`
     - Méthode : POST
     - Corps de la requête (JSON) : `{"workouts": [Liste construite plus haut]}`

## Notes

- Le classement automatique du type de séance (EF / Fractionné / Long / Récup) est une estimation grossière (`guessType` dans le script) — ajustable à la main dans la Sheet à tout moment.
- Dédup : basée sur l'horodatage exact (`startDate`), donc relancer le shortcut plusieurs fois sur la même semaine n'insère pas de doublons.
