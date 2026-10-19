#!/usr/bin/env python3
"""Relit une sauvegarde chiffrée de MyRunningApp (RGPD, A6).

  python3 backend/lire_sauvegarde.py                 # la plus récente du Mac
  python3 backend/lire_sauvegarde.py <fichier.enc>   # une sauvegarde précise
  python3 backend/lire_sauvegarde.py <fichier.enc> <dossier>

Déchiffre l'archive avec ~/.config/myrunningapp/backup.key et en extrait les
fichiers JSON (runs, profiles, planned_sessions) dans un dossier temporaire
(ou celui donné), dont le chemin est affiché. Ce sont des données de santé de
vraies personnes : effacer ce dossier dès qu'on n'en a plus besoin.
"""

import io
import sys
import tarfile
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from backup_supabase import BACKUP_SUFFIX, KEY_FILE, LOCAL_BACKUPS_DIR, openssl  # noqa: E402


def main() -> None:
    if not KEY_FILE.exists():
        sys.exit(f"Clé de chiffrement introuvable : {KEY_FILE}")
    if len(sys.argv) > 1:
        source = Path(sys.argv[1])
    else:
        found = sorted(LOCAL_BACKUPS_DIR.glob("*" + BACKUP_SUFFIX))
        if not found:
            sys.exit(f"Aucune sauvegarde chiffrée dans {LOCAL_BACKUPS_DIR}")
        source = found[-1]
    # Dossier au nom de la sauvegarde (2026-10-18_183839) : suivi_testeurs.py y lit la date de la sauvegarde.
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.mkdtemp(prefix="mra_sauvegarde_")) / source.name[:17]
    out.mkdir(parents=True, exist_ok=True)
    plain = openssl(["-d"], source.read_bytes())
    with tarfile.open(fileobj=io.BytesIO(plain), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile() or "/" in member.name or member.name.startswith("."):
                continue  # seulement les fichiers JSON à la racine de l'archive
            (out / member.name).write_bytes(tar.extractfile(member).read())
    print(out)


if __name__ == "__main__":
    main()
