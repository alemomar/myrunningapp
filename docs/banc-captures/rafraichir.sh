#!/bin/bash
# Rafraîchit le banc de captures de la refonte.
#
# Copie web/ vers le cache d'aperçu (hors Google Drive : le serveur d'aperçu ne
# peut pas lire le Drive, voir backend/README.md), ajoute le jeu de données
# FICTIVES (mr-harness.js : aucun réseau, aucune donnée réelle), fabrique
# mr.html (l'app + ce jeu de données), la planche de mesure, et copie les
# maquettes du design gelé pour les comparer côte à côte.
#
# À lancer depuis un shell normal (pas depuis le serveur d'aperçu) :
#   bash docs/banc-captures/rafraichir.sh
set -euo pipefail

PROJET="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="$HOME/.local/share/myrunningapp/web_preview_cache"
BANC="$PROJET/docs/banc-captures"
MAQ="$PROJET/docs/design/maquettes"

mkdir -p "$CACHE/maq"
rsync -a "$PROJET/web/" "$CACHE/"
cp "$BANC/mr-harness.js" "$CACHE/mr-harness.js"
cp "$BANC/planche.html" "$BANC/comparaison.html" "$CACHE/"

# mr.html = index.html + le jeu de données fictives, juste avant </body>
fabriquer_mr() {
python3 - "$1" <<'PY'
import sys, pathlib
cache = pathlib.Path(sys.argv[1])
html = (cache / "index.html").read_text(encoding="utf-8")
tag = '<script src="mr-harness.js"></script>\n'
assert "</body>" in html, "index.html sans </body>"
(cache / "mr.html").write_text(html.replace("</body>", tag + "</body>", 1), encoding="utf-8")
PY
}
fabriquer_mr "$CACHE"

# Version « avant » (celle en ligne avant la refonte, étiquette avant-design-v48) dans avant/,
# pour comparer chaque écran avant/après : http://localhost:8765/avant/mr.html#scenario
TAG="avant-design-v48"
if git -C "$PROJET" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  rm -rf "$CACHE/avant"; mkdir -p "$CACHE/avant"
  git -C "$PROJET" archive "$TAG" web | tar -x -C "$CACHE/avant" --strip-components=1
  cp "$BANC/mr-harness.js" "$CACHE/avant/mr-harness.js"
  fabriquer_mr "$CACHE/avant"
fi

# Maquettes du design gelé (journal v48)
cp "$MAQ/Phase 6 - Design.dc.html" "$CACHE/maq/phase6.html"
cp "$MAQ/Directions Running.dc.html" "$CACHE/maq/directions.html"
cp "$MAQ/support.js" "$MAQ/record-man.js" "$CACHE/maq/"

echo "Banc rafraîchi : $CACHE"
echo "Aperçu : preview_start « myrunningapp-web » (port 8765), puis /planche.html"
