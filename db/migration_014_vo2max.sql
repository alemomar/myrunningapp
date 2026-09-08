-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- VO2 max : contrairement à la FC max, la Watch la calcule automatiquement
-- (marche/course en extérieur avec GPS) — même principe que la FC de repos :
-- rafraîchie au plus 1x/mois, jamais écrasée si saisie manuellement.

alter table public.profiles add column if not exists vo2_max numeric;
alter table public.profiles add column if not exists vo2_max_updated_at timestamptz;
alter table public.profiles add column if not exists vo2_max_is_manual boolean not null default false;
