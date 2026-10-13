-- Exercices cochés d'une séance prévue (S24, retour d'Omar du 13/10, point 2) : la liste des noms d'exercices déjà
-- faits, ex. ["Pont fessier bilatéral", "Dead bug"]. Au dernier exercice coché, la séance passe en « Fait ».
-- Vide (null) = aucun exercice coché : toutes les séances déjà enregistrées.
alter table public.planned_sessions add column if not exists exercises_done jsonb;

insert into public.schema_migrations (filename) values ('migration_025_exercises_done.sql')
on conflict (filename) do nothing;
