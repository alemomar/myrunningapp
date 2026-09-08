-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Remplace le texte libre unique (goals_text) par des réponses structurées,
-- utilisées plus tard par l'IA du Plan pour croiser objectifs + douleurs.
-- goals_text n'est pas supprimée (pas de perte de données), juste plus utilisée.

alter table public.profiles add column if not exists goals jsonb;
