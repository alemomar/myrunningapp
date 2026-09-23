-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Programme : calendrier de séances généré (VDOT + objectifs + ressenti),
-- modifiable par l'utilisateur. Une ligne = une séance planifiée pour un
-- jour donné. Le remplacement d'une séance (régénération auto ou manuelle)
-- ne modifie jamais le contenu en place : l'ancienne ligne passe en
-- status='replaced' et une nouvelle ligne est insérée, liée par
-- replaces_session_id / superseded_by_id — traçabilité complète, jamais
-- de perte d'historique ni de duplication incohérente. Voir web/index.html
-- pour la convention d'usage exacte (décaler/valider/marquer fait = simple
-- UPDATE, remplacer le contenu = pattern supersede décrit ci-dessus).

create table if not exists public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  week_start_date date not null,        -- lundi de la semaine ISO correspondante
  type text not null,                   -- EF / Long / Fractionné / Seuil / Récup / Repos (mêmes libellés que runs.type)
  pace_zone text,                       -- easy / marathon / threshold / interval / repetition / null (Repos)
  title text not null,
  description text,                     -- détail structuré (échauffement / corps / retour au calme), texte libre
  target_distance_km numeric,
  target_duration_min numeric,
  target_pace_sec_per_km numeric,
  rationale text not null,              -- justification courte affichée dans la carte séance
  status text not null default 'planned', -- planned / done / skipped / replaced
  source text not null default 'generated', -- generated / manual_edit / regenerated
  generation_reason text,               -- règle ayant déclenché la génération/l'ajustement (acwr_high, pain_repeat, user_constraint, weekly_replan...)
  replaces_session_id uuid references public.planned_sessions(id) on delete set null,
  superseded_by_id uuid references public.planned_sessions(id) on delete set null,
  linked_run_id uuid references public.runs(id) on delete set null, -- renseigné quand la séance est marquée faite
  user_confirmed boolean not null default false, -- action "Valider"
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

-- Index pour les requêtes courantes de l'onglet (vue semaine/mois, séance
-- suivante à ajuster) : filtrage par utilisateur+date, très fréquent.
create index if not exists planned_sessions_user_date_idx
  on public.planned_sessions (user_id, planned_date);

-- Réglages du moteur Programme : repli si aucun temps de référence/VMA
-- n'est déjà saisi dans un objectif, + contraintes de planning (jours
-- indisponibles, séances/semaine disponibles).
alter table public.profiles add column if not exists program_settings jsonb;

insert into public.schema_migrations (filename) values ('migration_019_planned_sessions.sql')
on conflict (filename) do nothing;
