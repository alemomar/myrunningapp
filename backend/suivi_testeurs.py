#!/usr/bin/env python3
"""Suivi des testeurs (B6, 07/10/2026) : où en sont les testeurs, compté à partir d'une sauvegarde de la base.

Jamais de nom ni d'adresse : un compte est désigné par les 6 premiers caractères de son identifiant (colonne UID de
Supabase › Authentication › Users, où Omar retrouve l'adresse). Le compte d'Omar est exclu. Un compte créé sans finir le
parcours de départ n'a pas encore de profil : il n'apparaît que dans Supabase › Authentication › Users (pas lu ici, la clé
de sauvegarde ne sert qu'aux sauvegardes).

Étapes comptées (chaque testeur une fois par étape) :
  - parcours fini : profil avec onboarding_completed_at ;
  - RunSync installé : au moins une séance reçue d'Apple Santé (pas « Manuel »), seule preuve que RunSync tourne.
    L'ancienne étape « RunSync connecté » (sync_since_date) comptait aussi les comptes qui n'ont jamais installé RunSync :
    l'app web remplit ce champ dès le parcours de départ (17/10/2026 : 16 « connectés », 8 testeurs dans TestFlight) ;
  - ressenti noté : au moins une séance avec un ressenti ;
  - actifs ces 7 jours : une séance datée des 7 derniers jours.
Répartition (17/10/2026, demande d'Omar) : RunSync (au moins une séance d'Apple Santé), saisie à la main seulement, aucune
séance ; et la liste des comptes avec leur statut, pour relancer ceux qui n'ont pas installé RunSync.

Usage : python3 backend/suivi_testeurs.py <dossier>
Les sauvegardes sont chiffrées depuis le 18/10/2026 (RGPD, A6) : <dossier> est une sauvegarde déchiffrée par
backend/lire_sauvegarde.py (dossier temporaire, à effacer après usage). Écrit suivi_testeurs.json dans ce dossier et l'affiche.
"""
import datetime

import json
import os
import sys

# Comptes d'Omar, exclus (6 premiers caractères de l'identifiant) : principal et compte test « testleila » (état des lieux
# du 17/10/2026, ce dernier était compté à tort parmi les testeurs RunSync).
OWNER_PREFIXES = {"646447", "6fb81c"}


def is_owner(user_id):
    return str(user_id)[:6] in OWNER_PREFIXES


def latest_backup():
    sys.exit("Donne le dossier d'une sauvegarde déchiffrée : python3 backend/lire_sauvegarde.py (affiche son chemin).")


def parse_ts(value):
    """Date ISO de Supabase (UTC) -> date et heure locales."""
    if not value:
        return None
    base = datetime.datetime.strptime(str(value)[:19], "%Y-%m-%dT%H:%M:%S")
    return base.replace(tzinfo=datetime.timezone.utc).astimezone()


def funnel(profiles, runs, at):
    """Renvoie les étapes [{k, label, n}], le nombre de parcours finis le jour de la sauvegarde, la répartition par statut
    et la liste des comptes."""
    users = {p["user_id"] for p in profiles if not is_owner(p["user_id"])}
    users |= {r["user_id"] for r in runs if not is_owner(r["user_id"])}
    done = {p["user_id"] for p in profiles if p["user_id"] in users and p.get("onboarding_completed_at")}
    received = {r["user_id"] for r in runs if r["user_id"] in users and (r.get("apple_type") or "") != "Manuel"}
    manual = {r["user_id"] for r in runs if r["user_id"] in users and (r.get("apple_type") or "") == "Manuel"} - received
    rated = {r["user_id"] for r in runs if r["user_id"] in users and r.get("pain_ratings")}
    week_ago = at - datetime.timedelta(days=7)
    active = {r["user_id"] for r in runs if r["user_id"] in users and (parse_ts(r.get("start_date")) or at) >= week_ago}
    # Accord RGPD (S35, 18/10/2026) : date de l'écran « Ton accord » (profiles.privacy_consent_at).
    consent = {p["user_id"]: parse_ts(p.get("privacy_consent_at")) for p in profiles if p["user_id"] in users and p.get("privacy_consent_at")}
    today = {p["user_id"] for p in profiles if p["user_id"] in done
             and parse_ts(p.get("onboarding_completed_at")).date() == at.date()}
    steps = [
        {"k": "done", "label": "Parcours fini", "n": len(done)},
        {"k": "runsync", "label": "RunSync installé", "n": len(received)},
        {"k": "rated", "label": "Ressenti noté", "n": len(rated)},
        {"k": "active", "label": "Actifs ces 7 jours", "n": len(active)},
        {"k": "consent", "label": "Accord donné", "n": len(consent)},
    ]
    split = {"runsync": len(received), "manuel": len(manual), "aucune": len(users - received - manual)}
    started = {p["user_id"]: parse_ts(p.get("onboarding_completed_at")) for p in profiles}
    accounts = []
    for u in sorted(users):
        mine = [r for r in runs if r["user_id"] == u]
        synced = [r for r in mine if (r.get("apple_type") or "") != "Manuel"]
        last_sync = max((parse_ts(r.get("created_at")) for r in synced if r.get("created_at")), default=None)
        last_run = max((parse_ts(r.get("start_date")) for r in mine if r.get("start_date")), default=None)
        accounts.append({
            "id": u[:6],
            "statut": "runsync" if u in received else "manuel" if u in manual else "aucune",
            "parcours": started[u].date().isoformat() if started.get(u) else None,
            "seances_runsync": len(synced),
            "seances_main": len(mine) - len(synced),
            "dernier_envoi": last_sync.date().isoformat() if last_sync else None,
            "derniere_seance": last_run.date().isoformat() if last_run else None,
            "accord": consent[u].date().isoformat() if u in consent else None,
        })
    order = {"runsync": 0, "manuel": 1, "aucune": 2}
    accounts.sort(key=lambda a: (order[a["statut"]], a["parcours"] or ""))
    return steps, len(today), split, accounts


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else latest_backup()
    with open(os.path.join(folder, "profiles.json"), encoding="utf-8") as f:
        profiles = json.load(f)
    with open(os.path.join(folder, "runs.json"), encoding="utf-8") as f:
        runs = json.load(f)
    at = datetime.datetime.strptime(os.path.basename(folder.rstrip("/")), "%Y-%m-%d_%H%M%S").astimezone()
    steps, today, split, accounts = funnel(profiles, runs, at)
    result = {"at": at.isoformat(timespec="seconds"), "steps": steps, "today": today, "split": split, "accounts": accounts,
              "note": "Hors tes comptes (principal et test). Les comptes créés sans finir le parcours sont dans Supabase › Authentication › Users."}
    with open(os.path.join(folder, "suivi_testeurs.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
