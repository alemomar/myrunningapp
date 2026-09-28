-- Onboarding (cahier des charges v2, 4.1.a) : marque si un compte a
-- terminé le parcours guidé de première connexion. Pas de valeur par
-- défaut ni de backfill : tous les comptes existants (y compris les
-- comptes de test déjà utilisés) démarrent à NULL, donc "non onboardés",
-- pour permettre de tester le parcours sur un compte réel.
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;

insert into public.schema_migrations (filename) values ('migration_022_onboarding.sql')
on conflict (filename) do nothing;
