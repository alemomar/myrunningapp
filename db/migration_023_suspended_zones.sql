-- Zones du corps mises "en pause" (cahier des charges v2, 4.6.c — palier
-- "Hors ajustement") : douleur très forte ou répétée 3 séances de suite,
-- l'utilisateur a choisi de suspendre les exercices ciblés sur cette zone.
-- Stocké dans le profil (pas en navigateur) pour être synchronisé entre
-- appareils. Format : [{"zone":"genoux_g","since":"2026-10-02T09:00:00Z"}, ...]
-- Jamais levé automatiquement : seul l'utilisateur le retire ("Ça va mieux, reprendre").
alter table public.profiles add column if not exists suspended_zones jsonb;

insert into public.schema_migrations (filename) values ('migration_023_suspended_zones.sql')
on conflict (filename) do nothing;
