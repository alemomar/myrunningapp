-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Suivi des douleurs : un check-in ponctuel (état actuel) + une note optionnelle
-- par séance. Les deux utilisent la même structure de zones du corps (jsonb),
-- ex: {"tendon_g":3,"tendon_d":0,"genou_g":2,"genou_d":0,"cuisse_g":1,
--      "cuisse_d":1,"pied_g":0,"pied_d":0,"bassin":2,"dos":0}

create table if not exists public.pain_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  ratings jsonb not null
);

alter table public.pain_checkins enable row level security;

create policy "Users can view their own checkins"
  on public.pain_checkins for select
  using (auth.uid() = user_id);

create policy "Users can insert their own checkins"
  on public.pain_checkins for insert
  with check (auth.uid() = user_id);

alter table public.runs add column if not exists pain_ratings jsonb;
