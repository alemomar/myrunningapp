#!/usr/bin/env python3
"""Synchronise le projet Xcode RunSync (~/Developer/RunSync) vers ios-app/
dans le dépôt GitHub, et commit+push automatiquement si quelque chose a
changé.

~/Developer/RunSync reste la copie de travail réelle (ouverte dans Xcode
au quotidien) ; ce script en copie l'état vers un clone Git local dédié,
deux fois par jour (tâche planifiée sur ce Mac), puis pousse directement
sur GitHub.

Pourquoi un clone local séparé plutôt que d'écrire directement dans le
dépôt ouvert dans Google Drive : Google Drive File Stream bloque toute
modification ou suppression d'un fichier déjà existant pour les process
lancés en arrière-plan par launchd (testé et confirmé le 28/09/2026 —
seule la création de fichiers tout neufs fonctionne). Or `git commit`
modifie des fichiers déjà existants (.git/index, .git/HEAD...), donc ça
échouerait de toute façon même sans compter la copie elle-même. Ce script
travaille donc uniquement sur CLONE_DIR (hors Drive, pas de restriction),
et pousse directement sur GitHub. La copie du dépôt dans Google Drive
n'est PAS mise à jour par ce script — elle se met à jour via un `git
pull` fait manuellement ou en session Claude (voir backend/README.md).

Notification macOS envoyée à chaque exécution (rien à synchroniser / X
fichiers synchronisés et poussés / erreur).
"""

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Clone Git local dédié à cette automatisation, hors Google Drive (voir
# l'explication ci-dessus). Chemin fixe (pas dérivé de __file__), même
# raisonnement que pour PROJECT_DIR dans backup_supabase.py.
CLONE_DIR = Path.home() / ".local" / "share" / "myrunningapp" / "myrunningapp-repo"
XCODE_SOURCE = Path.home() / "Developer" / "RunSync"
IOS_APP_DIR = CLONE_DIR / "ios-app"

# On ignore xcuserdata/ (réglages propres à cette machine) et .DS_Store.
IGNORE = shutil.ignore_patterns("xcuserdata", ".DS_Store")


def notify(message, title="Synchro RunSync"):
    try:
        subprocess.run(
            ["osascript", "-e", f'display notification "{message}" with title "{title}"'],
            check=False,
        )
    except Exception:
        pass


def run_git(*args):
    return subprocess.run(
        ["git", "-C", str(CLONE_DIR), *args],
        capture_output=True,
        text=True,
    )


def main():
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    if not CLONE_DIR.exists():
        msg = f"Clone local introuvable : {CLONE_DIR}"
        print(msg, file=sys.stderr)
        notify(f"Erreur : {msg}")
        sys.exit(1)

    if not XCODE_SOURCE.exists():
        msg = f"Source introuvable : {XCODE_SOURCE}"
        print(msg, file=sys.stderr)
        notify(f"Erreur : {msg}")
        sys.exit(1)

    pull = run_git("pull", "--ff-only")
    if pull.returncode != 0:
        msg = f"git pull a échoué : {pull.stderr.strip()}"
        print(msg, file=sys.stderr)
        notify(f"Erreur : {msg}")
        sys.exit(1)

    pbxproj_src = XCODE_SOURCE / "RunSync.xcodeproj" / "project.pbxproj"
    pbxproj_dst = IOS_APP_DIR / "RunSync.xcodeproj" / "project.pbxproj"
    swift_src = XCODE_SOURCE / "RunSync"
    swift_dst = IOS_APP_DIR / "RunSync"

    try:
        pbxproj_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(pbxproj_src, pbxproj_dst)

        if swift_dst.exists():
            shutil.rmtree(swift_dst)
        shutil.copytree(swift_src, swift_dst, ignore=IGNORE)
    except Exception as exc:
        msg = f"Erreur pendant la copie : {exc}"
        print(msg, file=sys.stderr)
        notify(f"Erreur : {msg}")
        sys.exit(1)

    status = run_git("status", "--porcelain", "--", "ios-app")
    if status.returncode != 0:
        msg = f"git status a échoué : {status.stderr.strip()}"
        print(msg, file=sys.stderr)
        notify(f"Erreur : {msg}")
        sys.exit(1)

    if not status.stdout.strip():
        print(f"[{timestamp}] Rien à synchroniser.")
        notify("Rien à synchroniser.")
        return

    changed_files = len(status.stdout.strip().splitlines())

    add = run_git("add", "ios-app")
    if add.returncode != 0:
        msg = f"git add a échoué : {add.stderr.strip()}"
        print(msg, file=sys.stderr)
        notify(f"Erreur : {msg}")
        sys.exit(1)

    commit_msg = (
        f"Synchro auto RunSync depuis ~/Developer/RunSync ({timestamp})\n\n"
        "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
    )
    commit = run_git("commit", "-m", commit_msg)
    if commit.returncode != 0:
        msg = f"git commit a échoué : {commit.stderr.strip()}"
        print(msg, file=sys.stderr)
        notify(f"Erreur : {msg}")
        sys.exit(1)

    push = run_git("push")
    if push.returncode != 0:
        msg = f"git push a échoué : {push.stderr.strip()}"
        print(msg, file=sys.stderr)
        notify(f"Erreur au push : {msg}")
        sys.exit(1)

    print(f"[{timestamp}] {changed_files} fichier(s) synchronisé(s) et poussé(s).")
    notify(f"{changed_files} fichier(s) synchronisé(s) et poussé(s) sur GitHub.")


if __name__ == "__main__":
    main()
