-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Programme : heure de rappel optionnelle sur une séance planifiée.
-- Ce champ seul ne déclenche AUCUNE notification pour l'instant — une
-- envoyée à l'heure dite nécessiterait une brique séparée (Web Push +
-- un scheduler côté serveur, ex: Supabase Edge Function + pg_cron) : une
-- PWA statique comme celle-ci ne peut pas réveiller le téléphone toute
-- seule à une heure précise. Voir web/index.html pour l'état actuel
-- (le champ est saisi/affiché, rien n'est envoyé).

alter table public.planned_sessions add column if not exists reminder_time time;

insert into public.schema_migrations (filename) values ('migration_020_planned_sessions_reminder.sql')
on conflict (filename) do nothing;
