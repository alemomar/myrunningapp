-- À exécuter dans Supabase : Project → SQL Editor → New query
-- Supprime TOUTES tes séances et ton profil, pour repartir de zéro comme un
-- tout premier utilisateur. Ne touche pas à ton compte de connexion.

-- Étape 1 : lance d'abord cette requête seule pour retrouver ton user_id
select id, email from auth.users;

-- Étape 2 : remplace <TON_USER_ID> ci-dessous par la valeur trouvée (colonne "id"),
-- puis sélectionne uniquement les deux lignes ci-dessous et Run.
delete from public.runs where user_id = '<TON_USER_ID>';
delete from public.profiles where user_id = '<TON_USER_ID>';
