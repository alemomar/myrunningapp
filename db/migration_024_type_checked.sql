-- Carte « Vérifions N sorties » (lot 3, D109) : vrai quand l'utilisateur a choisi ou confirmé le type d'une
-- sortie (depuis la carte, ou en changeant son type ailleurs). Une sortie vérifiée n'est plus proposée.
-- Vide (null) = jamais vérifiée : toutes les sorties déjà enregistrées, et celles qu'envoie RunSync.
alter table public.runs add column if not exists type_checked boolean;

insert into public.schema_migrations (filename) values ('migration_024_type_checked.sql')
on conflict (filename) do nothing;
