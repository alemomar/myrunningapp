-- Schéma consolidé de MyRunningApp — reflète l'état RÉEL de la base après
-- application de toutes les migrations jusqu'à migration_021 inclus.
--
-- Ce fichier est un document de référence, pas un script à exécuter tel
-- quel sur une base existante (les migrations numérotées dans ce dossier
-- restent la source d'exécution historique, une par une, dans l'ordre).
-- Il sert à répondre en un coup d'œil à "qu'est-ce qui existe vraiment
-- aujourd'hui ?", sans avoir à relire les 21 fichiers de migration.
--
-- À tenir à jour à chaque nouvelle migration (cahier des charges v2,
-- exigence 6.1.3 : "schéma consolidé à jour").

-- ============================================================
-- profiles — un réglage par utilisateur, tronc commun de l'app
-- ============================================================
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_since_date date not null default (current_date - interval '365 days'),
  updated_at timestamptz not null default now(),
  max_hr integer,
  pseudo text,
  age integer,
  gender text,
  cities text[],
  dashboard_period text not null default 'monthly',
  resting_hr integer,
  resting_hr_updated_at timestamptz,
  resting_hr_is_manual boolean not null default false,
  goals jsonb,                    -- objectifs structurés (principal/secondaire, niveau...)
  avatar_url text,
  vo2_max numeric,
  vo2_max_updated_at timestamptz,
  vo2_max_is_manual boolean not null default false,
  program_settings jsonb          -- réglages du moteur Programme (repli VMA/temps, contraintes)
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = user_id);
create policy "Users can upsert their own profile"
  on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = user_id);

-- ============================================================
-- runs — séances réelles, synchronisées depuis Apple Santé (RunSync)
-- ou ajoutées à la main
-- ============================================================
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date timestamptz not null,
  apple_type text,                -- type brut HealthKit (Running, Walking...)
  type text,                      -- EF / Long / Fractionné / Récup / Course / Renfo / Mobilité / Yoga
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
  include_in_stats boolean not null default true,  -- valeur posée par trigger si absente à l'insert
  legs_focused boolean,            -- pour une séance Renfo : travail ciblé jambes ?
  pain_ratings jsonb,              -- notation post-séance (RPE, douleurs par zone, fatigue/mental/respiration)
  peak_hr numeric,
  hr_series jsonb,                 -- échantillons FC bruts : [{"t":secondes,"hr":bpm}, ...]
  pace_series jsonb,                -- échantillons d'allure instantanée : [{"t":secondes,"pace":sec/km}, ...]
  frac_work_manual integer,         -- override manuel allure Work (sec/km) si pace_series trop épars
  frac_recovery_manual integer,     -- idem pour l'allure Récup
  lap_markers jsonb,                -- frontières d'intervalles posées par HealthKit (séance structurée)
  unique (user_id, start_date)      -- empêche les doublons si on relance une sync
);

create or replace function public.runs_default_include_in_stats()
returns trigger as $$
begin
  if new.include_in_stats is null then
    new.include_in_stats := new.type in ('EF','Long','Fractionné','Récup','Course');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_runs_default_include_in_stats
before insert on public.runs
for each row execute function public.runs_default_include_in_stats();

alter table public.runs enable row level security;

create policy "Users can view their own runs"
  on public.runs for select using (auth.uid() = user_id);
create policy "Users can insert their own runs"
  on public.runs for insert with check (auth.uid() = user_id);
create policy "Users can update their own runs"
  on public.runs for update using (auth.uid() = user_id);
create policy "Users can delete their own runs"
  on public.runs for delete using (auth.uid() = user_id);

-- ============================================================
-- planned_sessions — calendrier de séances généré (onglet Programme)
-- ============================================================
create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  week_start_date date not null,        -- lundi de la semaine ISO correspondante
  type text not null,                   -- EF / Long / Fractionné / Seuil / Récup / Repos / Renfo / Mobilité / Yoga
  pace_zone text,                       -- easy / marathon / threshold / interval / repetition / null
  title text not null,
  description text,
  target_distance_km numeric,
  target_duration_min numeric,
  target_pace_sec_per_km numeric,
  rationale text not null,              -- justification affichée dans la carte séance
  status text not null default 'planned', -- planned / done / skipped / replaced
  source text not null default 'generated', -- generated / manual_add / manual_edit / regenerated
  generation_reason text,               -- acwr_high / pain_repeat_or_wellbeing / user_constraint / weekly_replan...
  replaces_session_id uuid references public.planned_sessions(id) on delete set null,
  superseded_by_id uuid references public.planned_sessions(id) on delete set null,
  linked_run_id uuid references public.runs(id) on delete set null,
  user_confirmed boolean not null default false,
  reminder_time time,                    -- rappel affiché, aucune notification envoyée à ce jour
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.planned_sessions enable row level security;

create policy "Users can view their own planned sessions"
  on public.planned_sessions for select using (auth.uid() = user_id);
create policy "Users can insert their own planned sessions"
  on public.planned_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update their own planned sessions"
  on public.planned_sessions for update using (auth.uid() = user_id);
create policy "Users can delete their own planned sessions"
  on public.planned_sessions for delete using (auth.uid() = user_id);

create index planned_sessions_user_date_idx
  on public.planned_sessions (user_id, planned_date);

-- ============================================================
-- schema_migrations — journal des migrations déjà appliquées
-- ============================================================
create table public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

-- RLS activé sans aucune policy : invisible aux clients anon/authenticated
-- (donc à l'app web), gérable uniquement depuis le SQL Editor.
alter table public.schema_migrations enable row level security;

-- ============================================================
-- Storage — photos de profil
-- ============================================================
-- Bucket public en lecture (décision actée le 27/09/2026 : reste public
-- pour l'instant, upload désactivé côté app en attendant un stockage privé
-- — voir cahier des charges v2, 6.1.2).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects for insert
with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update their own avatar"
on storage.objects for update
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own avatar"
on storage.objects for delete
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- Tables supprimées (historique, pour mémoire)
-- ============================================================
-- pain_checkins (migration_007) — jamais utilisée par le code final (le
--   suivi douleur réel passe par runs.pain_ratings) — supprimée par
--   migration_021_cleanup_dead_columns.sql.
-- profiles.goals_text (migration_005) — remplacée par profiles.goals
--   (jsonb structuré, migration_011) — colonne supprimée par
--   migration_021_cleanup_dead_columns.sql.
