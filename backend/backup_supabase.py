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
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

SUPABASE_URL = "https://iwzlxizgppghjpnasawy.supabase.co"
SUPABASE_HOST = "iwzlxizgppghjpnasawy.supabase.co"

# Quand le Mac se réveille d'une veille, launchd lance la sauvegarde avant que
# le Wi-Fi soit revenu (erreur « nodename nor servname provided » : le nom du
# serveur ne se résout pas). On attend donc le réseau, puis on réessaie.
NETWORK_WAIT_ATTEMPTS = 10   # × 30 s = 5 minutes d'attente maximum
NETWORK_WAIT_SECONDS = 30
FETCH_ATTEMPTS = 3
FETCH_RETRY_SECONDS = 20
# planned_sessions ajoutée le 2026-09-27 : absente depuis la création de
# l'onglet Programme (migration_019), jamais mise à jour ici depuis — tout
# le calendrier généré n'était donc pas sauvegardé.
# pain_checkins retirée le 2026-09-27 (migration_021) : table morte,
# supprimée du schéma, plus rien à en sauvegarder.
TABLES = ["runs", "profiles", "planned_sessions"]
BACKUP_KEEP = 60
# Supabase ne renvoie jamais plus de 1 000 lignes par lecture (réglage « max
# rows » de l'API). Sans pagination, la sauvegarde du 2026-10-07 s'est arrêtée
# à 1 000 séances sur environ 1 350, en se disant « terminée ». On lit donc
# chaque table par paquets, triés par sa clé primaire, chaque paquet reprenant
# après la dernière clé lue (pas de doublon ni d'oubli si une séance arrive
# pendant la sauvegarde : elle sera dans la suivante), jusqu'à un paquet vide.
PAGE_SIZE = 1000
TABLE_KEYS = {"runs": "id", "profiles": "user_id", "planned_sessions": "id"}


class IncompleteTable(Exception):
    """Moins de lignes lues que le total annoncé par Supabase."""

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


def wait_for_network() -> bool:
    for attempt in range(1, NETWORK_WAIT_ATTEMPTS + 1):
        try:
            socket.getaddrinfo(SUPABASE_HOST, 443)
            return True
        except OSError:
            print(
                f"[réseau] {SUPABASE_HOST} injoignable "
                f"(essai {attempt}/{NETWORK_WAIT_ATTEMPTS}), nouvel essai dans {NETWORK_WAIT_SECONDS} s",
                file=sys.stderr,
            )
            time.sleep(NETWORK_WAIT_SECONDS)
    return False


def fetch_table(table: str, key: str) -> list:
    pk = TABLE_KEYS[table]
    rows = []
    total = None
    last = None
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=*&order={pk}.asc&limit={PAGE_SIZE}"
        if last is not None:
            url += f"&{pk}=gt.{urllib.parse.quote(str(last), safe='')}"
        page, count = fetch_page(url, key, want_count=last is None)
        if last is None:
            total = count
        if not page:
            break
        rows.extend(page)
        last = page[-1][pk]
    if total is not None and len(rows) < total:
        raise IncompleteTable(f"{len(rows)} ligne(s) lue(s) sur {total} annoncée(s)")
    return rows


def fetch_page(url: str, key: str, want_count: bool) -> tuple:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    if want_count:
        # Total de la table dans l'en-tête Content-Range (« 0-999/1353 »).
        headers["Prefer"] = "count=exact"
    request = urllib.request.Request(url, headers=headers)
    last_error = None
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                page = json.loads(response.read().decode("utf-8"))
                total = response.headers.get("Content-Range", "").rpartition("/")[2]
                return page, int(total) if total.isdigit() else None
        except urllib.error.HTTPError as err:
            # 4xx = la requête est mauvaise (table absente, clé refusée) :
            # réessayer ne changera rien. 5xx = souci passager côté serveur.
            if err.code < 500:
                raise
            last_error = err
        except urllib.error.URLError as err:
            last_error = err
        if attempt < FETCH_ATTEMPTS:
            time.sleep(FETCH_RETRY_SECONDS)
    raise last_error


def notify_failure(message: str) -> None:
    # Notification macOS visible : sans elle, un échec de nuit passe inaperçu.
    try:
        subprocess.run(
            [
                "osascript",
                "-e",
                f'display notification "{message}" with title "MyRunningApp : sauvegarde"',
            ],
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        pass


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

    if not wait_for_network():
        message = "ÉCHEC : réseau injoignable, aucune sauvegarde faite."
        print(f"[{timestamp}] {message}", file=sys.stderr)
        notify_failure(message)
        sys.exit(1)

    counts = {}
    errors = []
    for table in TABLES:
        try:
            rows = fetch_table(table, key)
        except (urllib.error.URLError, IncompleteTable) as err:
            print(f"[{timestamp}] ERREUR sur {table} : {err}", file=sys.stderr)
            errors.append((table, str(err)))
            continue
        # Le dossier n'est créé qu'au premier succès : un échec total ne
        # laisse plus de dossier vide qui ressemble à une sauvegarde réussie.
        dest.mkdir(parents=True, exist_ok=True)
        (dest / f"{table}.json").write_text(
            json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        counts[table] = len(rows)
        print(f"[{timestamp}] {table} : {len(rows)} ligne(s) sauvegardée(s)")

    if not counts:
        message = "ÉCHEC : aucune table sauvegardée."
        print(f"[{timestamp}] {message}", file=sys.stderr)
        notify_failure(message)
        sys.exit(1)

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

    if errors:
        failed = ", ".join(table for table, _ in errors)
        message = f"PARTIELLE : {failed} non sauvegardée(s)."
        print(f"[{timestamp}] {message} -> {dest}", file=sys.stderr)
        notify_failure(message)
        sys.exit(1)

    print(f"[{timestamp}] Sauvegarde terminée -> {dest}")


if __name__ == "__main__":
    main()
