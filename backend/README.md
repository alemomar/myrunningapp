# Backend — sauvegarde/restauration Supabase et synchro iOS

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

## Synchro automatique du projet Xcode RunSync

`sync_ios_project.py` copie l'état du projet Xcode réel (`~/Developer/RunSync`,
la copie de travail ouverte dans Xcode au quotidien) vers `ios-app/` dans le
dépôt GitHub, et pousse automatiquement si quelque chose a changé — deux fois
par jour (13h et 21h, tâche planifiée sur ce Mac). Une notification macOS
confirme chaque exécution ("Rien à synchroniser" ou "X fichier(s)
synchronisé(s) et poussé(s)").

**Pourquoi un clone Git local séparé** (`~/.local/share/myrunningapp/myrunningapp-repo/`,
hors Google Drive) plutôt que d'écrire directement dans ce dépôt : Google
Drive File Stream bloque toute modification ou suppression d'un fichier déjà
existant pour les tâches lancées en arrière-plan par launchd (testé et
confirmé le 28/09/2026 — seule la création de fichiers tout neufs
fonctionne, ce qui explique pourquoi `backup_supabase.py` s'en sort : il ne
crée que des dossiers horodatés neufs). Or `git commit` modifie des fichiers
déjà existants (`.git/index`, `.git/HEAD`...), donc ça échouerait de toute
façon. Le script travaille donc sur ce clone local dédié et pousse
directement sur GitHub — **il ne touche jamais à la copie de ce dépôt dans
Google Drive**.

**Conséquence pratique** : GitHub est à jour toutes les 12h, mais la copie
`ios-app/` que tu vois dans ce dossier Google Drive ne se met à jour que
lors d'un `git pull` (fait en session Claude, ou manuellement). Ça ne pose
pas de problème en pratique — `~/Developer/RunSync` reste la seule copie de
travail utile pour builder/tester l'app, cette copie-ci n'est qu'une
référence versionnée.

Le script (`backend/sync_ios_project.py`) vit à la fois dans ce dépôt
(référence, mis à jour comme n'importe quel fichier) et dans le clone
local (copie d'exécution, mise à jour automatiquement par le `git pull`
que le script fait lui-même au début de chaque run).

**Remettre en place sur un nouveau Mac**, en plus des étapes du README
principal :
```bash
git clone https://github.com/alemomar/myrunningapp.git ~/.local/share/myrunningapp/myrunningapp-repo
```
Puis recréer `~/Library/LaunchAgents/com.omaralem.myrunningapp.sync-ios.plist`
(`ProgramArguments` pointant vers
`~/.local/share/myrunningapp/myrunningapp-repo/backend/sync_ios_project.py`,
`StartCalendarInterval` à 13h et 21h), et charger la tâche :
```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.omaralem.myrunningapp.sync-ios.plist
```

Testé et validé le 28/09/2026 : `git pull`, copie de fichiers, `git
add`/`commit`/`push` confirmés fonctionnels sous launchd depuis le clone
local (test isolé avec un fichier bidon, supprimé après vérification).

---

## Historique : ancien pipeline Google Apps Script (retiré)

Avant l'app iOS RunSync (synchro HealthKit → Supabase en arrière-plan), les
séances remontaient via une automatisation Raccourcis (iPhone) → un script
Google Apps Script → une Google Sheet. Ce pipeline (`AppsScript.gs` et sa
documentation de déploiement) a été retiré du dépôt le 28/09/2026
(cahier des charges v2, 6.1.4) — complètement abandonné, RunSync fait ce
travail directement depuis début septembre 2026. Le fichier et ces
instructions restent consultables dans l'historique git si jamais besoin
(`git log -- backend/AppsScript.gs`).
