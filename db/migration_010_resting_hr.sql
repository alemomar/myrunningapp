-- À exécuter dans Supabase : Project → SQL Editor → New query → Run
-- FC de repos, nécessaire pour calculer les zones cardio via la méthode
-- de réserve de FC (Karvonen), la même que celle utilisée par l'app Santé.

alter table public.profiles add column if not exists resting_hr integer;

-- Date de dernière mise à jour (auto ou manuelle) : sert à ne rafraîchir la
-- valeur automatique qu'une fois par mois, pas à chaque sync, pour éviter
-- que les zones cardio ne bougent en permanence.
alter table public.profiles add column if not exists resting_hr_updated_at timestamptz;

-- Une valeur saisie à la main n'est jamais écrasée par le rafraîchissement
-- automatique (utile si la Watch n'est portée que pendant les séances : dans
-- ce cas HealthKit n'a pas de données fiables au repos pour calculer restingHeartRate).
alter table public.profiles add column if not exists resting_hr_is_manual boolean not null default false;
