-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Ajoute lap_markers : frontières d'intervalles Work/Récup posées par
-- HealthKit lui-même (événements .lap), quand la séance a été enregistrée
-- via l'entraînement fractionné structuré de la Watch. Bien plus fiable que
-- la reconstruction heuristique depuis l'allure GPS faite côté dashboard —
-- voir web/logic.js. NULL pour les séances sans structure d'intervalles
-- programmée (course libre) ou synchronisées avant l'ajout de ce champ.

alter table public.runs
  add column if not exists lap_markers jsonb;

insert into public.schema_migrations (filename) values ('migration_018_lap_markers.sql')
on conflict (filename) do nothing;
