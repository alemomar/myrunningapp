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

PROJECT_DIR = Path(__file__).resolve().parent.parent
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
    backups = sorted(
        (p for p in BACKUPS_DIR.iterdir() if p.is_dir()),
        key=lambda p: p.name,
    )
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
    update_readme_status(now, counts, errors)
    print(f"[{timestamp}] Sauvegarde terminée -> {dest}")


if __name__ == "__main__":
    main()
