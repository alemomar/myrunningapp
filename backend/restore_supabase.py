#!/usr/bin/env python3
"""Restauration depuis une sauvegarde locale de la base Supabase (MyRunningApp).

Réinjecte le contenu d'un dossier backups/<timestamp>/ dans Supabase,
table par table, via upsert sur la clé primaire "id" (jamais de doublon,
relancer la restauration plusieurs fois ne pose pas de problème).

Usage :
  python3 restore_supabase.py <timestamp> [--suffix _suffix] [--tables t1,t2]

Par défaut, restaure dans les vraies tables (runs, profiles, pain_checkins,
planned_sessions). Avec --suffix, restaure dans des tables de même nom mais
suffixées (ex: --suffix _restore_test -> runs_restore_test) : sert à tester
la restauration sans toucher aux vraies données. Ces tables suffixées
doivent déjà exister avec les mêmes colonnes que l'originale — voir
backend/README.md pour le SQL de création du test et la procédure complète.

Clé requise dans ~/.config/myrunningapp/backup.env :
  SUPABASE_SERVICE_ROLE_KEY=...
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SUPABASE_URL = "https://iwzlxizgppghjpnasawy.supabase.co"
DEFAULT_TABLES = ["runs", "profiles", "pain_checkins", "planned_sessions"]
# Clé primaire réelle de chaque table (profiles n'a pas de colonne "id" —
# sa PK est user_id) : nécessaire pour que l'upsert cible la bonne colonne.
PRIMARY_KEYS = {"profiles": "user_id"}
BATCH_SIZE = 200

ENV_FILE = Path.home() / ".config" / "myrunningapp" / "backup.env"
PROJECT_DIR = Path(
    "/Users/omaralem/Library/CloudStorage/GoogleDrive-omaralempro@gmail.com"
    "/Mon Drive/[3] Omar perso/Projets/Entrepreneuriat/Test RUNNING"
)
BACKUPS_DIR = PROJECT_DIR / "backups"


def load_service_role_key() -> str:
    if not ENV_FILE.exists():
        sys.exit(f"Fichier de clé introuvable : {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit(f"SUPABASE_SERVICE_ROLE_KEY absente de {ENV_FILE}")


def upsert_batch(table: str, rows: list, key: str, conflict_col: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={conflict_col}"
    body = json.dumps(rows).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def restore_table(table: str, target_table: str, backup_dir: Path, key: str) -> None:
    source_file = backup_dir / f"{table}.json"
    if not source_file.exists():
        print(f"[{table}] absent de la sauvegarde ({source_file}), ignoré")
        return
    rows = json.loads(source_file.read_text(encoding="utf-8"))
    if not rows:
        print(f"[{table}] 0 ligne dans la sauvegarde, rien à restaurer")
        return
    conflict_col = PRIMARY_KEYS.get(table, "id")
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        try:
            upsert_batch(target_table, batch, key, conflict_col)
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")
            sys.exit(f"[{target_table}] échec sur le lot {start}-{start+len(batch)} : {err} — {detail}")
    print(f"[{target_table}] {len(rows)} ligne(s) restaurée(s) depuis {source_file.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("timestamp", help="Dossier de sauvegarde à restaurer, ex: 2026-09-27_184901 (ou 'latest')")
    parser.add_argument("--suffix", default="", help="Suffixe de table pour restaurer dans des tables de test (ex: _restore_test)")
    parser.add_argument("--tables", default=",".join(DEFAULT_TABLES), help="Liste de tables séparées par des virgules")
    args = parser.parse_args()

    timestamp = args.timestamp
    if timestamp == "latest":
        candidates = sorted(p.name for p in BACKUPS_DIR.iterdir() if p.is_dir())
        if not candidates:
            sys.exit("Aucune sauvegarde trouvée.")
        timestamp = candidates[-1]

    backup_dir = BACKUPS_DIR / timestamp
    if not backup_dir.is_dir():
        sys.exit(f"Dossier de sauvegarde introuvable : {backup_dir}")

    key = load_service_role_key()
    tables = [t.strip() for t in args.tables.split(",") if t.strip()]

    print(f"Restauration depuis {backup_dir} (suffixe cible: {args.suffix!r})")
    for table in tables:
        restore_table(table, f"{table}{args.suffix}", backup_dir, key)
    print("Restauration terminée.")


if __name__ == "__main__":
    main()
