# Backend — sauvegarde et restauration Supabase

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

## Historique : ancien pipeline Google Apps Script (retiré)

Avant l'app iOS RunSync (synchro HealthKit → Supabase en arrière-plan), les
séances remontaient via une automatisation Raccourcis (iPhone) → un script
Google Apps Script → une Google Sheet. Ce pipeline (`AppsScript.gs` et sa
documentation de déploiement) a été retiré du dépôt le 28/09/2026
(cahier des charges v2, 6.1.4) — complètement abandonné, RunSync fait ce
travail directement depuis début septembre 2026. Le fichier et ces
instructions restent consultables dans l'historique git si jamais besoin
(`git log -- backend/AppsScript.gs`).
