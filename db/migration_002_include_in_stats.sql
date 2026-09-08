-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- Ajoute la possibilité d'inclure/exclure une séance des statistiques de course,
-- avec une valeur par défaut sensée (course = incluse, reste = exclu) sans rien
-- changer côté app iOS.

alter table public.runs add column if not exists include_in_stats boolean;

update public.runs
set include_in_stats = (type in ('EF','Long','Fractionné','Récup','Course'))
where include_in_stats is null;

create or replace function public.runs_default_include_in_stats()
returns trigger as $$
begin
  if new.include_in_stats is null then
    new.include_in_stats := new.type in ('EF','Long','Fractionné','Récup','Course');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_runs_default_include_in_stats on public.runs;
create trigger trg_runs_default_include_in_stats
before insert on public.runs
for each row execute function public.runs_default_include_in_stats();

alter table public.runs alter column include_in_stats set not null;
