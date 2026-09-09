# MyRunningApp

App perso de suivi de course à pied : app iOS (RunSync) qui synchronise HealthKit vers Supabase, dashboard web pour visualiser les séances.

- `ios-app/` — app iOS Swift, voir [ios-app/README.md](ios-app/README.md)
- `web/` — dashboard (`index.html` + `logic.js`)
- `db/` — schéma + migrations SQL Supabase, voir [db/README.md](db/README.md)
- `backend/` — script de sauvegarde automatique + ancien backend Google Apps Script (obsolète, remplacé par la sync directe HealthKit → Supabase), voir [backend/README.md](backend/README.md)
- `backups/` — sauvegardes JSON automatiques de la base (non versionné, voir plus bas)

---

## 🆘 En cas de perte totale (nouveau Mac, ancien Mac mort, etc.)

Tout ce qui suit part du principe que tu repars d'un Mac neuf, sans rien d'installé.

### 1. Récupérer le code

Le code est sauvegardé sur GitHub, en privé : **https://github.com/alemomar/myrunningapp**

```bash
git clone https://github.com/alemomar/myrunningapp.git
```

Si tu n'as pas encore Git configuré sur ce nouveau Mac :

```bash
git config --global user.name "Omar Alem"
git config --global user.email "ton@email.com"
```

Si tu n'as pas `gh` (CLI GitHub) ou besoin de te reconnecter à GitHub, voir la section [Outils à réinstaller](#outils-à-réinstaller) plus bas.

### 2. Récupérer les données

**Les données elles-mêmes vivent sur Supabase**, pas sur ton Mac — donc si Supabase est toujours en ligne (le cas normal), tu n'as rien à restaurer, l'app se reconnecte directement dessus.

Le seul cas où tu as besoin des sauvegardes locales (`backups/`), c'est si la base Supabase elle-même a un problème (suppression accidentelle, corruption) :

- Les sauvegardes sont dans `backups/<date>/*.json` (30 derniers jours, 2x/jour)
- Comme ce dossier est dans Google Drive, il est accessible depuis n'importe quel Mac connecté à ton compte Google, même si l'ancien Mac est perdu
- Pour ré-importer des données dans Supabase depuis un fichier JSON de sauvegarde, il faudra écrire un petit script d'import (pas encore fait — à faire seulement si ce cas arrive vraiment, pas la peine de le préparer à l'avance)

### 3. Reconfigurer les clés / secrets

Ton code (déjà sur GitHub) contient uniquement la clé **publique** Supabase (`web/config.js`, `ios-app/Config.swift`) — rien à refaire ici, elle fonctionne telle quelle.

En revanche, la clé secrète utilisée par le **script de sauvegarde automatique** n'est jamais dans le code (volontairement). Pour la remettre en place sur un nouveau Mac :

1. Va sur **Supabase → Project Settings → API → Secret API keys**
2. Si la clé existe encore (`backup-script`), copie-la. Sinon, crée-en une nouvelle.
3. Sur le nouveau Mac :
   ```bash
   mkdir -p ~/.config/myrunningapp
   cat > ~/.config/myrunningapp/backup.env << 'EOF'
   SUPABASE_SERVICE_ROLE_KEY=ta_clé_ici
   EOF
   chmod 600 ~/.config/myrunningapp/backup.env
   ```

### 4. Remettre en place la sauvegarde automatique

**Important** : le script exécuté par launchd n'est PAS celui de ce repo (dans Google Drive) — c'est une copie locale, hors Google Drive. Google Drive (mode streaming) bloque l'accès à ses fichiers pour les process lancés en arrière-plan par launchd (`Operation not permitted`, même avec Accès complet au disque accordé), sauf pour créer des fichiers neufs. Donc :

- Le **script** (`backup_supabase.py`) vit en local : `~/.local/share/myrunningapp/backup_supabase.py`
- Il **écrit** ses sauvegardes dans Google Drive (`backups/`) et met à jour ce README — ça, ça marche, seule la *lecture d'un fichier déjà existant* (listing d'un dossier, relecture du README) échoue parfois sous launchd, donc ces deux étapes sont non bloquantes dans le script (`try/except`, log un avertissement sans faire échouer la sauvegarde).

Sur un nouveau Mac :

1. Copie le script à jour vers l'emplacement local :
   ```bash
   mkdir -p ~/.local/share/myrunningapp
   cp backend/backup_supabase.py ~/.local/share/myrunningapp/backup_supabase.py
   ```
   **Attention** : si le dossier `Test RUNNING` n'est plus exactement au même chemin Google Drive, mets aussi à jour la constante `PROJECT_DIR` en haut de `backend/backup_supabase.py` (et donc de la copie locale) — elle est en dur, pas dérivée automatiquement.
2. Copie `~/Library/LaunchAgents/com.omaralem.myrunningapp.backup.plist` (si tu l'as encore quelque part) ou recrée-le — le contenu de référence est documenté dans l'historique Git / à redemander à Claude si besoin. Le `ProgramArguments` doit pointer vers `~/.local/share/myrunningapp/backup_supabase.py` (la copie locale, pas le fichier dans Google Drive).
3. Charge la tâche :
   ```bash
   launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.omaralem.myrunningapp.backup.plist
   ```
4. Teste manuellement une fois pour vérifier que ça marche :
   ```bash
   launchctl kickstart -k "gui/$(id -u)/com.omaralem.myrunningapp.backup"
   cat ~/Library/Logs/myrunningapp/backup.log ~/Library/Logs/myrunningapp/backup.error.log
   ```

**Si tu modifies `backend/backup_supabase.py` dans Google Drive**, pense à recopier vers la copie locale (`cp backend/backup_supabase.py ~/.local/share/myrunningapp/backup_supabase.py`) — sinon la version planifiée ne verra jamais tes changements.

### 5. Réinstaller l'app iOS

Suis les étapes du [ios-app/README.md](ios-app/README.md) — il faut recréer le projet Xcode et y glisser les fichiers `.swift` (le projet Xcode lui-même, avec ses réglages de build, n'est pas versionné, seulement le code source).

### Outils à réinstaller

Sur un Mac neuf, ces outils ne sont pas là par défaut et ont été installés manuellement pendant le développement de ce projet :

- **Git** : normalement déjà présent sur macOS (sinon, Xcode Command Line Tools : `xcode-select --install`)
- **`gh`** (CLI GitHub) : téléchargé depuis [github.com/cli/cli/releases](https://github.com/cli/cli/releases) (version `macOS_arm64.zip`), binaire placé dans `~/.local/bin/gh`, puis `gh auth login --web` pour se reconnecter
- **`supabase`** (CLI Supabase, optionnel, pas utilisé pour l'instant) : idem depuis [github.com/supabase/cli/releases](https://github.com/supabase/cli/releases)

---

## Dernière sauvegarde

<!-- BACKUP_STATUS_START -->
Dernière exécution : **09/09/2026 à 21:13**

- `runs` : 172 ligne(s)
- `profiles` : 1 ligne(s)
- `pain_checkins` : 8 ligne(s)
<!-- BACKUP_STATUS_END -->

Cette section est mise à jour automatiquement par `backend/backup_supabase.py` à chaque exécution (2x/jour, 3h et 14h). Ne pas éditer à la main entre les marqueurs — ce serait écrasé au prochain passage.

---

## Sécurité — état actuel (à jour au 8 septembre 2026)

- ✅ Code versionné avec Git, sauvegardé sur GitHub (dépôt privé)
- ✅ Row Level Security activé et vérifié sur toutes les tables Supabase (`runs`, `profiles`, `pain_checkins`) — chaque utilisateur ne voit que ses propres données, même si la clé publique est exposée dans le code
- ✅ Sauvegarde automatique de la base (2x/jour, 30 jours d'historique, dans `backups/` synchronisé Google Drive)
- ✅ Clé secrète du script de sauvegarde stockée hors du repo, permissions restreintes (`chmod 600`), jamais committée (`.gitignore`)
- ⬜ 2FA sur le compte GitHub — pas encore fait, recommandé
- ⬜ Script de ré-import automatique des sauvegardes JSON — pas fait (à faire seulement si besoin réel un jour)
