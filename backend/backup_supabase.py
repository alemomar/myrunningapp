#!/usr/bin/env python3
"""Sauvegarde locale de la base Supabase (MyRunningApp).

Exporte chaque table en JSON dans backups/<timestamp>/, et garde les
BACKUP_KEEP dernières sauvegardes (supprime les plus anciennes).

Clé requise dans ~/.config/myrunningapp/backup.env :
  SUPABASE_SERVICE_ROLE_KEY=...
"""

import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

SUPABASE_URL = "https://iwzlxizgppghjpnasawy.supabase.co"
TABLES = ["runs", "profiles", "pain_checkins"]
BACKUP_KEEP = 60

# Chemin fixe (pas dérivé de __file__) : le script tourne depuis une copie
# locale hors Google Drive (~/.local/share/myrunningapp/), pour que launchd
# puisse l'exécuter (Google Drive File Stream bloque les accès fichier des
# process lancés en arrière-plan par launchd, même avec Accès complet au
# disque accordé à Xcode/python3 — cause du échec silencieux "Operation not
# permitted" observé). Seule cette constante doit changer si le projet
# change d'emplacement.
PROJECT_DIR = Path(
    "/Users/omaralem/Library/CloudStorage/GoogleDrive-omaralempro@gmail.com"
    "/Mon Drive/[3] Omar perso/Projets/Entrepreneuriat/Test RUNNING"
)
ENV_FILE = Path.home() / ".config" / "myrunningapp" / "backup.env"
BACKUPS_DIR = PROJECT_DIR / "backups"
README_FILE = PROJECT_DIR / "README.md"
STATUS_START = "<!-- BACKUP_STATUS_START -->"
STATUS_END = "<!-- BACKUP_STATUS_END -->"


def load_service_role_key() -> str:
    if not ENV_FILE.exists():
        sys.exit(f"Fichier de clé introuvable : {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit(f"SUPABASE_SERVICE_ROLE_KEY absente de {ENV_FILE}")


def fetch_table(table: str, key: str) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=*"
    request = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def prune_old_backups() -> None:
    # Lister un dossier Google Drive (iterdir) échoue parfois avec
    # "Operation not permitted" quand le script est lancé par launchd en
    # arrière-plan (contrairement à lire/écrire un fichier précis, qui
    # fonctionne très bien dans ce même contexte) — probablement une
    # restriction propre à l'extension Google Drive côté énumération de
    # dossier. Non bloquant : la sauvegarde elle-même a déjà réussi à ce
    # stade, mieux vaut garder quelques sauvegardes en trop que faire
    # échouer tout le run pour ça.
    try:
        backups = sorted(
            (p for p in BACKUPS_DIR.iterdir() if p.is_dir()),
            key=lambda p: p.name,
        )
    except OSError as err:
        print(f"[prune] listing de {BACKUPS_DIR} impossible, purge ignorée : {err}", file=sys.stderr)
        return
    for old in backups[:-BACKUP_KEEP]:
        shutil.rmtree(old)


def update_readme_status(when: datetime, counts: dict, errors: list) -> None:
    if not README_FILE.exists():
        return

    lines = [f"Dernière exécution : **{when.strftime('%d/%m/%Y à %H:%M')}**", ""]
    if counts:
        for table, n in counts.items():
            lines.append(f"- `{table}` : {n} ligne(s)")
    if errors:
        lines.append("")
        for table, err in errors:
            lines.append(f"- ⚠️ `{table}` a échoué : {err}")

    block = STATUS_START + "\n" + "\n".join(lines) + "\n" + STATUS_END

    content = README_FILE.read_text(encoding="utf-8")
    pattern = re.compile(
        re.escape(STATUS_START) + r".*?" + re.escape(STATUS_END), re.DOTALL
    )
    if pattern.search(content):
        content = pattern.sub(block, content)
        README_FILE.write_text(content, encoding="utf-8")


def main() -> None:
    key = load_service_role_key()
    now = datetime.now()
    timestamp = now.strftime("%Y-%m-%d_%H%M%S")
    dest = BACKUPS_DIR / timestamp
    dest.mkdir(parents=True, exist_ok=True)

    counts = {}
    errors = []
    for table in TABLES:
        try:
            rows = fetch_table(table, key)
        except urllib.error.URLError as err:
            print(f"[{timestamp}] ERREUR sur {table} : {err}", file=sys.stderr)
            errors.append((table, str(err)))
            continue
        (dest / f"{table}.json").write_text(
            json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        counts[table] = len(rows)
        print(f"[{timestamp}] {table} : {len(rows)} ligne(s) sauvegardée(s)")

    prune_old_backups()

    # Comme prune_old_backups, lire+réécrire un fichier déjà existant sur
    # Google Drive (README.md) peut échouer sous launchd ("Operation not
    # permitted", Google Drive doit re-matérialiser le fichier à la demande)
    # alors que la sauvegarde elle-même (créer des fichiers neufs) a déjà
    # réussi juste au-dessus. Non bloquant : la donnée est en sécurité, la
    # mise à jour du statut dans le README est secondaire.
    try:
        update_readme_status(now, counts, errors)
    except OSError as err:
        print(f"[{timestamp}] mise à jour du README impossible : {err}", file=sys.stderr)

    print(f"[{timestamp}] Sauvegarde terminée -> {dest}")


if __name__ == "__main__":
    main()
