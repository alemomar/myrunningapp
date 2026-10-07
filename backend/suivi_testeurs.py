#!/usr/bin/env python3
"""Suivi des testeurs (B6, 07/10/2026) : où en sont les testeurs, compté à partir d'une sauvegarde de la base.

Chiffres seulement, jamais de nom ni d'adresse. Le compte d'Omar est exclu. Un compte créé sans finir le parcours de
départ n'a pas encore de profil : il n'apparaît que dans Supabase › Authentication › Users (pas lu ici, la clé de
sauvegarde ne sert qu'aux sauvegardes).

Étapes comptées (chaque testeur une fois par étape) :
  - parcours fini : profil avec onboarding_completed_at ;
  - RunSync connecté : sync_since_date posé par RunSync à sa première connexion ;
  - courses reçues : au moins une séance venue d'Apple Santé (pas « Manuel ») ;
  - ressenti noté : au moins une séance avec un ressenti ;
  - actifs ces 7 jours : une séance datée des 7 derniers jours.

Usage : python3 backend/suivi_testeurs.py [dossier de sauvegarde]   (par défaut, la plus récente)
Écrit suivi_testeurs.json dans le dossier de la sauvegarde et l'affiche.
"""
import datetime

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER_IDS = {"6464472b-e7d3-4102-9e6e-597f74e607be"}   # compte principal d'Omar


def latest_backup():
    # Pas de glob : le chemin du projet contient « [3] », que glob lirait comme un motif.
    base = os.path.join(ROOT, "backups")
    dirs = sorted(n for n in os.listdir(base) if n.startswith("20") and os.path.isdir(os.path.join(base, n)))
    if not dirs:
        sys.exit("Aucune sauvegarde trouvée dans backups/.")
    return os.path.join(base, dirs[-1])


def parse_ts(value):
    """Date ISO de Supabase (UTC) -> date et heure locales."""
    if not value:
        return None
    base = datetime.datetime.strptime(str(value)[:19], "%Y-%m-%dT%H:%M:%S")
    return base.replace(tzinfo=datetime.timezone.utc).astimezone()


def funnel(profiles, runs, at):
    """Renvoie les étapes [{k, label, n}] et le nombre de parcours finis le jour de la sauvegarde."""
    users = {p["user_id"] for p in profiles if p["user_id"] not in OWNER_IDS}
    users |= {r["user_id"] for r in runs if r["user_id"] not in OWNER_IDS}
    done = {p["user_id"] for p in profiles if p["user_id"] in users and p.get("onboarding_completed_at")}
    synced = {p["user_id"] for p in profiles if p["user_id"] in users and p.get("sync_since_date")}
    received = {r["user_id"] for r in runs if r["user_id"] in users and (r.get("apple_type") or "") != "Manuel"}
    rated = {r["user_id"] for r in runs if r["user_id"] in users and r.get("pain_ratings")}
    week_ago = at - datetime.timedelta(days=7)
    active = {r["user_id"] for r in runs if r["user_id"] in users and (parse_ts(r.get("start_date")) or at) >= week_ago}
    today = {p["user_id"] for p in profiles if p["user_id"] in done
             and parse_ts(p.get("onboarding_completed_at")).date() == at.date()}
    steps = [
        {"k": "done", "label": "Parcours fini", "n": len(done)},
        {"k": "sync", "label": "RunSync connecté", "n": len(synced)},
        {"k": "runs", "label": "Courses reçues", "n": len(received)},
        {"k": "rated", "label": "Ressenti noté", "n": len(rated)},
        {"k": "active", "label": "Actifs ces 7 jours", "n": len(active)},
    ]
    return steps, len(today)


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else latest_backup()
    with open(os.path.join(folder, "profiles.json"), encoding="utf-8") as f:
        profiles = json.load(f)
    with open(os.path.join(folder, "runs.json"), encoding="utf-8") as f:
        runs = json.load(f)
    at = datetime.datetime.strptime(os.path.basename(folder.rstrip("/")), "%Y-%m-%d_%H%M%S").astimezone()
    steps, today = funnel(profiles, runs, at)
    result = {"at": at.isoformat(timespec="seconds"), "steps": steps, "today": today,
              "note": "Hors ton compte. Les comptes créés sans finir le parcours sont dans Supabase › Authentication › Users."}
    with open(os.path.join(folder, "suivi_testeurs.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
