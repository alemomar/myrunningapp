-- Acceptation des conditions d'utilisation (02/11/2026, décision d'Omar : « fais accepter les conditions à tous »).
--
-- profiles.terms_accepted_at : la date à laquelle la personne a accepté les conditions d'utilisation
-- (web/conditions.html), exigées par le contrat Garmin (section 5.3 : un contrat écrit avec chaque utilisateur).
-- Vide (null) = pas encore acceptées : l'app demande l'accord (case sur l'écran « Ton accord » pour un compte
-- neuf, écran unique pour un compte existant). On garde cette date tant que le compte existe (preuve).
-- Tant que la colonne n'existe pas, l'app ne demande rien (elle lit le profil sans elle).
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

insert into public.schema_migrations (filename) values ('migration_027_terms.sql')
on conflict (filename) do nothing;
