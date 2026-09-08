-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- FC max personnelle, nécessaire pour calculer des zones cardio fiables
-- (le détail par zone viendra dans une prochaine étape).

alter table public.profiles add column if not exists max_hr integer;
