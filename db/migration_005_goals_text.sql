-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Texte libre décrivant les objectifs de l'utilisateur, servira de contexte
-- au futur plan personnalisé par IA (onglet Plan).

alter table public.profiles add column if not exists goals_text text;
