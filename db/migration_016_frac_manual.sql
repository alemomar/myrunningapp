-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Allure Work/Récup saisies manuellement pour une séance Fractionné, en
-- exception : quand le pace_series capturé par HealthKit est trop épars pour
-- que l'algo (computeIntervalPaces) puisse fiablement isoler les intervalles
-- (ex: échantillonnage ~5min alors que l'app Fitness dispose d'une source
-- interne bien plus fine), on permet de saisir directement le résultat lu
-- dans l'app Fitness. Non-null = override manuel, prioritaire sur le calcul
-- automatique côté web (voir getIntervalPaces dans logic.js).

alter table public.runs add column if not exists frac_work_manual integer;
alter table public.runs add column if not exists frac_recovery_manual integer;

insert into public.schema_migrations (filename) values ('migration_016_frac_manual.sql')
on conflict (filename) do nothing;
