-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Suivi des migrations déjà appliquées : jusqu'ici on n'avait aucun moyen de
-- savoir laquelle avait vraiment tourné, avec 14 fichiers déjà passés
-- manuellement. Cette table sert de journal simple, pas d'outil auto.

create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

-- Table interne (pas de donnée utilisateur) : RLS activé sans aucune policy,
-- ce qui la rend invisible aux clients anon/authenticated (donc à l'app web)
-- tout en restant gérable ici, dans le SQL Editor.
alter table public.schema_migrations enable row level security;

-- Backfill des migrations déjà exécutées avant la mise en place de ce suivi.
insert into public.schema_migrations (filename) values
  ('schema.sql'),
  ('migration_002_include_in_stats.sql'),
  ('migration_003_profiles.sql'),
  ('migration_004_legs_focused.sql'),
  ('migration_005_goals_text.sql'),
  ('migration_006_max_hr.sql'),
  ('migration_007_pain_tracking.sql'),
  ('migration_008_profile_fields.sql'),
  ('migration_009_hr_series.sql'),
  ('migration_010_resting_hr.sql'),
  ('migration_011_goals_structured.sql'),
  ('migration_012_pace_series.sql'),
  ('migration_013_avatar.sql'),
  ('migration_014_vo2max.sql'),
  ('migration_015_schema_migrations.sql')
on conflict (filename) do nothing;

-- Pour vérifier ce qui a été appliqué : select filename, applied_at from public.schema_migrations order by applied_at;
