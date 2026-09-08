# Migrations

Chaque fichier `migration_NNN_nom.sql` s'exécute manuellement dans Supabase → SQL Editor → New query → Run, une seule fois, dans l'ordre numérique.

## Suivi (depuis migration_015)

La table `public.schema_migrations` journalise les migrations exécutées. Après avoir lancé un nouveau `migration_NNN_xxx.sql`, ajoute à la fin de ce même fichier (avant de l'exécuter) :

```sql
insert into public.schema_migrations (filename) values ('migration_NNN_xxx.sql')
on conflict (filename) do nothing;
```

Pour vérifier ce qui a déjà été appliqué :

```sql
select filename, applied_at from public.schema_migrations order by applied_at;
```

## Convention

- Toujours `alter table ... add column if not exists ...` pour rester rejouable sans erreur.
- `create policy` ne supporte pas `if not exists` — ne relancer un bloc de policies que s'il n'a pas déjà tourné (vérifier via `schema_migrations`).
- **Toute nouvelle table doit activer RLS** (`alter table ... enable row level security;`), même une table interne sans donnée utilisateur (ex: `schema_migrations`) : sans ça, Supabase l'expose par défaut aux clients anon/authenticated via l'API REST. RLS sans aucune policy = table invisible depuis l'app, mais toujours gérable ici. Le SQL Editor avertit si RLS manque — ne jamais choisir "Run without RLS" sans y avoir réfléchi.
