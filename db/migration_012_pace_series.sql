-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Série d'allure instantanée par séance (dérivée des échantillons de distance
-- HealthKit), utilisée pour isoler l'allure des phases "Work" d'un fractionné
-- plutôt que la moyenne globale de la séance. Format : [{"t": secondes, "pace": sec/km}, ...]

alter table public.runs add column if not exists pace_series jsonb;
