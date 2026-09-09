-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Ajoute la policy DELETE manquante sur runs, nécessaire pour le bouton
-- "Supprimer" du dashboard web (jusqu'ici seules select/insert/update existaient).

create policy "Users can delete their own runs"
  on public.runs for delete
  using (auth.uid() = user_id);

insert into public.schema_migrations (filename) values ('migration_017_runs_delete_policy.sql')
on conflict (filename) do nothing;
