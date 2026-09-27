# Sync automatique Apple Watch → dashboard

## Sauvegarde et restauration Supabase

`backup_supabase.py` exporte `runs`, `profiles` et
`planned_sessions` en JSON dans `backups/<horodatage>/`, deux fois par jour
(tâche planifiée sur ce Mac). `restore_supabase.py` fait l'inverse : il
réinjecte le contenu d'un dossier de sauvegarde dans Supabase, table par
table, en upsert (relancer plusieurs fois ne crée jamais de doublon).

**En cas de vraie perte de données**, dans l'ordre :

1. Repérer la dernière sauvegarde utilisable dans `backups/` (nom =
   horodatage `AAAA-MM-JJ_HHMMSS`).
2. Lancer :
   ```
   python3 backend/restore_supabase.py <horodatage>
   ```
   (ou `latest` à la place de l'horodatage pour prendre la plus récente).
3. Vérifier dans l'app que les données sont bien revenues.

**Pour tester la procédure sans toucher aux vraies données** (à refaire
après tout changement du schéma Supabase) :

1. Dans Supabase → SQL Editor, créer des tables de test (copies vides des
   vraies, jamais lues par l'app) :
   ```sql
   create table if not exists public.runs_restore_test (like public.runs including all);
   create table if not exists public.profiles_restore_test (like public.profiles including all);
   create table if not exists public.planned_sessions_restore_test (like public.planned_sessions including all);
   ```
2. Restaurer dedans :
   ```
   python3 backend/restore_supabase.py latest --suffix _restore_test
   ```
3. Vérifier que le nombre de lignes et le contenu correspondent à la
   sauvegarde source, puis supprimer les tables de test :
   ```sql
   drop table if exists public.runs_restore_test;
   drop table if exists public.profiles_restore_test;
   drop table if exists public.planned_sessions_restore_test;
   ```

Testé et validé le 27/09/2026 (à l'époque avec 4 tables, `pain_checkins`
retirée depuis par la migration_021_cleanup_dead_columns.sql) : les tables
restaurées correspondaient exactement à la sauvegarde (même nombre de
lignes, contenu identique). Ce test a révélé et corrigé un bug (`profiles`
a `user_id` comme clé primaire, pas `id` — `restore_supabase.py` gère
maintenant les deux).

Clé requise dans `~/.config/myrunningapp/backup.env` :
`SUPABASE_SERVICE_ROLE_KEY=...` (jamais dans le dépôt).

---

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
