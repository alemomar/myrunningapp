-- À exécuter dans Supabase : Project → SQL Editor → New query → Run

alter table public.profiles add column if not exists pseudo text;
alter table public.profiles add column if not exists age integer;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists cities text[];
alter table public.profiles add column if not exists dashboard_period text not null default 'monthly';

-- FC de pointe par séance (distincte de la moyenne déjà stockée dans avg_hr),
-- utilisée pour estimer automatiquement la FC max de l'utilisateur.
alter table public.runs add column if not exists peak_hr numeric;
