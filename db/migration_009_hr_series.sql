-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Série temporelle de FC brute par séance (échantillons HealthKit), utilisée
-- par le dashboard pour calculer les zones cardio et détecter les séances
-- structurées (fractionné). Format : [{"t": secondes_depuis_debut, "hr": bpm}, ...]

alter table public.runs add column if not exists hr_series jsonb;
