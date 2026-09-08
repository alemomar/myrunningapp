-- À exécuter dans Supabase : Project → SQL Editor → New query → Run

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date timestamptz not null,
  apple_type text,
  type text,          -- EF / Long / Fractionné / Récup / Course / Renfo / Mobilité / Yoga
  lieu text,
  distance_km numeric not null default 0,
  duration_sec numeric not null default 0,
  avg_hr numeric,
  calories numeric,
  avg_cadence numeric,
  avg_power numeric,
  effort numeric,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, start_date)  -- empêche les doublons si on relance une sync
);

alter table public.runs enable row level security;

create policy "Users can view their own runs"
  on public.runs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own runs"
  on public.runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own runs"
  on public.runs for update
  using (auth.uid() = user_id);
