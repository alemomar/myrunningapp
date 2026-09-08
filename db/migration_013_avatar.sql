-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Photo de profil : bucket de stockage public (juste une photo perso, pas
-- besoin d'URL signée) + policies limitant l'écriture au propriétaire du fichier.

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Chaque fichier est stocké sous <user_id>/... : storage.foldername(name)[1]
-- récupère ce premier segment pour vérifier que l'utilisateur ne touche qu'à
-- son propre dossier. Pas de IF NOT EXISTS ici : CREATE POLICY ne le supporte
-- pas, ne relance ce bloc que si les policies n'existent pas déjà.
create policy "Avatar images are publicly accessible"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects for insert
with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update their own avatar"
on storage.objects for update
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own avatar"
on storage.objects for delete
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
