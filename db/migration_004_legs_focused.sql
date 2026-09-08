-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Pour les séances de type "Renfo", précise si le travail ciblait les jambes.
-- nil = pas encore répondu par l'utilisateur.

alter table public.runs add column if not exists legs_focused boolean;
