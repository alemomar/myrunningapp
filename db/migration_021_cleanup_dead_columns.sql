-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Nettoyage (cahier des charges v2, 6.1.3) : pain_checkins et
-- profiles.goals_text ne sont référencés nulle part dans web/ ni ios-app/
-- (vérifié par recherche exhaustive) — remplacés respectivement par
-- runs.pain_ratings (migration_007) et profiles.goals (migration_011).
-- pain_checkins contenait encore 8 lignes de données historiques au moment
-- de cette migration : sauvegardées avant suppression (voir backups/,
-- backend/backup_supabase.py), mais plus jamais lues par l'app.

drop table if exists public.pain_checkins;

alter table public.profiles drop column if exists goals_text;

insert into public.schema_migrations (filename) values ('migration_021_cleanup_dead_columns.sql')
on conflict (filename) do nothing;
