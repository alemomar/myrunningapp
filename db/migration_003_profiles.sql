-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Un réglage par utilisateur pour la date de début d'import HealthKit,
-- au lieu d'une valeur figée dans le code de l'app iOS.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_since_date date not null default (current_date - interval '365 days'),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

-- Réglage initial pour ton compte : import depuis le 1er janvier 2026.
-- Remplace <TON_USER_ID> par ton id (visible dans Supabase → Authentication → Users).
-- insert into public.profiles (user_id, sync_since_date) values ('<TON_USER_ID>', '2026-01-01')
--   on conflict (user_id) do update set sync_since_date = excluded.sync_since_date;
