#!/usr/bin/env python3
"""Sauvegarde locale de la base Supabase (MyRunningApp).

Exporte chaque table en JSON dans backups/<timestamp>/, et garde les
BACKUP_KEEP dernières sauvegardes (supprime les plus anciennes).

Clé requise dans ~/.config/myrunningapp/backup.env :
  SUPABASE_SERVICE_ROLE_KEY=...

Lancé à la main : sauvegarde tout de suite. Lancé par launchd avec --auto
(toutes les 30 min) : sauvegarde seulement si le dernier créneau (14 h ou 17 h)
n'est pas encore couvert et que le Mac est vraiment réveillé.
"""

import http.client
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
from datetime import datetime, timedelta
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
# Avec les courbes cardio, 1 000 séances pèsent environ 19 Mo : une coupure
# pendant un si gros téléchargement faisait tout échouer (10/10/2026). Paquets
# plus petits pour runs : une coupure ne fait reprendre qu'un petit paquet.
PAGE_SIZES = {"runs": 200}

# Créneaux de la sauvegarde automatique. launchd lance le script toutes les
# 30 min avec --auto ; il ne sauvegarde que si le dernier créneau passé n'est
# pas encore couvert par une sauvegarde réussie (rattrapage dès que le Mac est
# rouvert, si le créneau a été manqué ou a échoué).
SLOT_HOURS = (14, 17)
# Hors Google Drive : launchd peut y lire et écrire sans restriction.
STATE_FILE = Path.home() / ".local" / "share" / "myrunningapp" / "backup_state.json"
# Pendant une série d'échecs, au plus une notification toutes les 6 heures.
NOTIFY_EVERY = timedelta(hours=6)


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
    page_size = PAGE_SIZES.get(table, PAGE_SIZE)
    rows = []
    total = None
    last = None
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=*&order={pk}.asc&limit={page_size}"
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
        except (OSError, http.client.HTTPException, ValueError) as err:
            # Réseau coupé ou trop lent en plein téléchargement (connexion
            # réinitialisée, délai dépassé, réponse tronquée) : ces erreurs
            # n'étaient pas rattrapées et arrêtaient tout le script, sans
            # sauvegarde ni notification (10/10/2026). URLError en fait partie.
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


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except OSError as err:
        print(f"[état] écriture de {STATE_FILE} impossible : {err}", file=sys.stderr)


def parse_time(value) -> "datetime | None":
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def due_slot(now: datetime) -> datetime:
    """Dernier créneau (14 h ou 17 h) déjà passé : celui qu'une sauvegarde réussie doit couvrir."""
    past = [now.replace(hour=h, minute=0, second=0, microsecond=0) for h in SLOT_HOURS]
    past = [slot for slot in past if slot <= now]
    if past:
        return past[-1]
    yesterday = now - timedelta(days=1)
    return yesterday.replace(hour=SLOT_HOURS[-1], minute=0, second=0, microsecond=0)


def mac_fully_awake() -> bool:
    # En veille, le Mac se réveille seul une quarantaine de secondes de temps en
    # temps (« DarkWake ») ; launchd en profitait pour lancer la sauvegarde, que
    # le Mac coupait en se rendormant (10/10/2026, 14 h 07 et 17 h 18). Réveil
    # complet = écran disponible, « Graphics » dans les capacités du système.
    try:
        out = subprocess.run(
            ["pmset", "-g", "systemstate"], capture_output=True, text=True, timeout=10
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return True
    if "Capabilities" not in out:
        return True
    return "Graphics" in out


def keep_mac_awake() -> None:
    # Empêche la mise en veille tant que ce script tourne (caffeinate s'arrête
    # tout seul à la fin du script, grâce à -w).
    try:
        subprocess.Popen(
            ["caffeinate", "-i", "-w", str(os.getpid())],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        pass


def fail(state: dict, now: datetime, timestamp: str, message: str, auto: bool) -> None:
    print(f"[{timestamp}] {message}", file=sys.stderr)
    state["last_failure"] = now.isoformat(timespec="seconds")
    last_notified = parse_time(state.get("last_notified"))
    if last_notified is None or now - last_notified >= NOTIFY_EVERY:
        retry = " Nouvel essai automatique dans 30 min." if auto else ""
        notify_failure(message + retry)
        state["last_notified"] = now.isoformat(timespec="seconds")
    save_state(state)
    sys.exit(1)


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
    auto = "--auto" in sys.argv[1:]
    now = datetime.now()
    timestamp = now.strftime("%Y-%m-%d_%H%M%S")
    dest = BACKUPS_DIR / timestamp
    state = load_state()

    if auto:
        last_success = parse_time(state.get("last_success"))
        if last_success is not None and last_success >= due_slot(now):
            return  # créneau déjà couvert : rien à faire, sans rien écrire
        if not mac_fully_awake():
            print(f"[{timestamp}] Mac en veille (réveil de quelques secondes) : sauvegarde remise au prochain réveil.")
            return

    key = load_service_role_key()
    keep_mac_awake()
    try:
        run_backup(key, now, timestamp, dest, state, auto)
    except Exception as err:  # imprévu : prévenir plutôt que s'arrêter en silence
        fail(state, now, timestamp, f"ÉCHEC imprévu : {err}", auto)


def run_backup(key: str, now: datetime, timestamp: str, dest: Path, state: dict, auto: bool) -> None:
    if not wait_for_network():
        fail(state, now, timestamp, "ÉCHEC : réseau injoignable, aucune sauvegarde faite.", auto)

    counts = {}
    errors = []
    for table in TABLES:
        try:
            rows = fetch_table(table, key)
        except (OSError, http.client.HTTPException, ValueError, IncompleteTable) as err:
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
        fail(state, now, timestamp, "ÉCHEC : aucune table sauvegardée.", auto)

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
        # Partielle = pas une réussite : le créneau reste à couvrir, --auto réessaiera.
        failed = ", ".join(table for table, _ in errors)
        fail(state, now, timestamp, f"PARTIELLE : {failed} non sauvegardée(s) ({dest.name}).", auto)

    state["last_success"] = now.isoformat(timespec="seconds")
    state.pop("last_notified", None)
    save_state(state)
    print(f"[{timestamp}] Sauvegarde terminée -> {dest}")


if __name__ == "__main__":
    main()
