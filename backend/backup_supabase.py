#!/usr/bin/env python3
"""Sauvegarde chiffrée de la base Supabase (MyRunningApp).

Exporte chaque table en JSON, les réunit dans une archive (tar.gz) chiffrée
(AES-256, openssl du Mac) : <timestamp>.tar.gz.enc, écrite sur le Mac
(~/.local/share/myrunningapp/backups/) et copiée dans backups/ du projet, sur
Google Drive. Garde les BACKUP_KEEP dernières (environ 30 jours) aux deux
endroits. RGPD (A6, décision d'Omar du 13/10/2026) : sauvegardes chiffrées, et
un compte supprimé disparaît des copies sous 30 jours.

Clés requises dans ~/.config/myrunningapp/ (jamais dans Git ni sur le Drive) :
  backup.env : SUPABASE_SERVICE_ROLE_KEY=...
  backup.key : la clé de chiffrement (Omar en garde une copie dans son
               gestionnaire de mots de passe : sans elle, les sauvegardes
               sont illisibles).
Pour relire une sauvegarde : backend/lire_sauvegarde.py.

Lancé à la main : sauvegarde tout de suite. Lancé par launchd avec --auto
(toutes les 30 min) : sauvegarde seulement si le dernier créneau (14 h ou 17 h)
n'est pas encore couvert et que le Mac est vraiment réveillé.
"""

import http.client
import io
import json
import os
import re
import socket
import subprocess
import sys
import tarfile
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
# Promesse de la page Confidentialité : un compte supprimé disparaît des sauvegardes sous 30 jours. 60 copies font 30
# jours à 2 par jour, mais plus si le Mac est resté éteint : au-delà de 30 jours, une copie part quoi qu'il arrive (sauf
# la plus récente).
BACKUP_MAX_AGE = timedelta(days=30)
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


# Chiffrement (RGPD, A6) : openssl fourni avec macOS (LibreSSL), clé dérivée par
# PBKDF2. Mêmes réglages pour chiffrer et déchiffrer (lire_sauvegarde.py).
OPENSSL = "/usr/bin/openssl"
OPENSSL_ARGS = ["-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-md", "sha256"]
KEY_FILE = Path.home() / ".config" / "myrunningapp" / "backup.key"
BACKUP_SUFFIX = ".tar.gz.enc"
# Copie sur le Mac, hors Google Drive : launchd peut la lister et l'effacer.
LOCAL_BACKUPS_DIR = Path.home() / ".local" / "share" / "myrunningapp" / "backups"


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


def openssl(args: list, data: bytes) -> bytes:
    done = subprocess.run(
        [OPENSSL, "enc", *args, *OPENSSL_ARGS, "-pass", f"file:{KEY_FILE}"],
        input=data, capture_output=True, timeout=300,
    )
    if done.returncode != 0:
        raise RuntimeError("openssl : " + done.stderr.decode("utf-8", "replace").strip())
    return done.stdout


def build_encrypted_archive(files: dict) -> bytes:
    """Archive tar.gz des fichiers JSON ({nom: texte}), chiffrée, vérifiée en la déchiffrant aussitôt."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, text in files.items():
            data = text.encode("utf-8")
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(data))
    plain = buf.getvalue()
    blob = openssl(["-salt"], plain)
    if openssl(["-d"], blob) != plain:
        raise RuntimeError("le déchiffrement de contrôle ne redonne pas l'archive")
    return blob


def write_file(path: Path, blob: bytes) -> None:
    # Écrit à côté puis renomme : une copie coupée en route ne ressemble jamais à une sauvegarde.
    part = path.with_name(path.name + ".part")
    part.write_bytes(blob)
    os.replace(part, path)


def backups_to_delete(names: list, now: datetime) -> list:
    """Noms à effacer : au-delà des BACKUP_KEEP plus récentes, ou plus vieux que BACKUP_MAX_AGE (jamais la plus récente)."""
    names = sorted(names)
    old = set(names[:-BACKUP_KEEP])
    for name in names[:-1]:
        try:
            when = datetime.strptime(name[:17], "%Y-%m-%d_%H%M%S")
        except ValueError:
            continue
        if now - when > BACKUP_MAX_AGE:
            old.add(name)
    return sorted(old)


def prune_old_backups(auto: bool) -> None:
    # Les BACKUP_KEEP dernières sauvegardes sont gardées, sur le Mac comme sur le Drive. Lancé par launchd, le script ne
    # peut pas lister le dossier du Drive (« Operation not permitted », restriction de macOS sur Google Drive) mais il peut
    # y effacer, par son nom, une sauvegarde qu'il a lui-même créée (vérifié le 18/10/2026) : la liste vient donc de la
    # copie du Mac. Lancé à la main (accès complet), il range aussi le Drive à partir de sa propre liste.
    try:
        local = sorted(p.name for p in LOCAL_BACKUPS_DIR.glob("*" + BACKUP_SUFFIX))
    except OSError as err:
        print(f"[prune] liste des sauvegardes du Mac impossible : {err}", file=sys.stderr)
        return
    now = datetime.now()
    for name in backups_to_delete(local, now):
        for folder in (LOCAL_BACKUPS_DIR, BACKUPS_DIR):
            try:
                (folder / name).unlink()
            except FileNotFoundError:
                pass
            except OSError as err:
                print(f"[prune] effacement de {folder / name} impossible : {err}", file=sys.stderr)
    if auto:
        return
    try:
        drive = sorted(p.name for p in BACKUPS_DIR.glob("*" + BACKUP_SUFFIX))
    except OSError as err:
        print(f"[prune] liste des sauvegardes du Drive impossible : {err}", file=sys.stderr)
        return
    for name in backups_to_delete(drive, now):
        try:
            (BACKUPS_DIR / name).unlink()
        except OSError as err:
            print(f"[prune] effacement de {BACKUPS_DIR / name} impossible : {err}", file=sys.stderr)


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
    dest = BACKUPS_DIR / (timestamp + BACKUP_SUFFIX)
    state = load_state()

    if auto:
        last_success = parse_time(state.get("last_success"))
        if last_success is not None and last_success >= due_slot(now):
            return  # créneau déjà couvert : rien à faire, sans rien écrire
        if not mac_fully_awake():
            print(f"[{timestamp}] Mac en veille (réveil de quelques secondes) : sauvegarde remise au prochain réveil.")
            return

    key = load_service_role_key()
    if not KEY_FILE.exists():
        fail(state, now, timestamp, f"ÉCHEC : clé de chiffrement introuvable ({KEY_FILE}), aucune sauvegarde faite.", auto)
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
    files = {}
    for table in TABLES:
        try:
            rows = fetch_table(table, key)
        except (OSError, http.client.HTTPException, ValueError, IncompleteTable) as err:
            print(f"[{timestamp}] ERREUR sur {table} : {err}", file=sys.stderr)
            errors.append((table, str(err)))
            continue
        files[f"{table}.json"] = json.dumps(rows, indent=2, ensure_ascii=False)
        counts[table] = len(rows)
        print(f"[{timestamp}] {table} : {len(rows)} ligne(s) sauvegardée(s)")

    # Rien n'est écrit si aucune table n'a été lue : un échec total ne laisse pas de fichier qui ressemble à une sauvegarde.
    if not counts:
        fail(state, now, timestamp, "ÉCHEC : aucune table sauvegardée.", auto)

    blob = build_encrypted_archive(files)
    LOCAL_BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    write_file(LOCAL_BACKUPS_DIR / dest.name, blob)
    try:
        write_file(dest, blob)
    except OSError as err:
        fail(state, now, timestamp, f"PARTIELLE : copie sur le Drive impossible ({err}), sauvegarde gardée sur le Mac.", auto)
    print(f"[{timestamp}] archive chiffrée : {len(blob) // 1024} Ko")

    prune_old_backups(auto)

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
