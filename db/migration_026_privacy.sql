-- Accord RGPD et suppression de son propre compte (A6 + A3, décisions d'Omar du 13/10/2026).
--
-- 1. profiles.privacy_consent_at : la date à laquelle la personne a coché « J'accepte » sur l'écran d'accord.
--    Vide (null) = pas encore d'accord : l'app affiche l'écran d'accord avant tout le reste. RunSync
--    vérifiera cette date à partir de sa version 1.0 (8) ; d'ici là, les séances continuent d'arriver
--    (décision d'Omar du 18/10). On garde cette date tant que le compte existe (preuve de l'accord).
alter table public.profiles add column if not exists privacy_consent_at timestamptz;

-- 2. delete_my_account() : « Retirer mon accord et supprimer mon compte », dans Mon compte › Tes données.
--    Supprime l'utilisateur connecté, et lui seul (auth.uid()). Le profil, les séances et le programme
--    partent avec lui (on delete cascade sur profiles, runs et planned_sessions). L'app efface d'abord
--    le dossier de sa photo de profil, s'il en a un, par l'API de stockage.
--    « security definer » : la fonction s'exécute avec les droits de son propriétaire, seul autorisé à
--    supprimer dans auth.users. Pas de clé de service dans l'app.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Pas connecté';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

insert into public.schema_migrations (filename) values ('migration_026_privacy.sql')
on conflict (filename) do nothing;
