# MyRunningApp

App perso de suivi de course à pied : app iOS (RunSync) qui synchronise HealthKit vers Supabase, dashboard web pour visualiser les séances.

- `ios-app/` — app iOS Swift, voir [ios-app/README.md](ios-app/README.md)
- `web/` — dashboard (`index.html` + `logic.js`)
- `db/` — schéma + migrations SQL Supabase, voir [db/README.md](db/README.md)
- `backend/` — scripts de sauvegarde/restauration Supabase, voir [backend/README.md](backend/README.md)
- `backups/` — sauvegardes JSON automatiques de la base (non versionné, voir plus bas)

---

## 🆘 En cas de perte totale (nouveau Mac, ancien Mac mort, etc.)

Tout ce qui suit part du principe que tu repars d'un Mac neuf, sans rien d'installé.

### 1. Récupérer le code

Le code est sauvegardé sur GitHub, **en public** (dépôt privé envisagé plus tard, voir la section Sécurité plus bas) : **https://github.com/alemomar/myrunningapp**

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
- Pour ré-importer des données dans Supabase depuis une sauvegarde, utilise `backend/restore_supabase.py` — voir [backend/README.md](backend/README.md) pour la procédure complète (testée et validée)

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

Le vrai projet Xcode est versionné dans `ios-app/` depuis le 28/09/2026 — ouvre directement `ios-app/RunSync.xcodeproj`. Suis les étapes du [ios-app/README.md](ios-app/README.md) pour la signature et l'installation.

Une tâche automatique (2x/jour) synchronise `~/Developer/RunSync` vers ce dépôt — voir [backend/README.md](backend/README.md) pour la remettre en place sur un nouveau Mac.

### Outils à réinstaller

Sur un Mac neuf, ces outils ne sont pas là par défaut et ont été installés manuellement pendant le développement de ce projet :

- **Git** : normalement déjà présent sur macOS (sinon, Xcode Command Line Tools : `xcode-select --install`)
- **`gh`** (CLI GitHub) : téléchargé depuis [github.com/cli/cli/releases](https://github.com/cli/cli/releases) (version `macOS_arm64.zip`), binaire placé dans `~/.local/bin/gh`, puis `gh auth login --web` pour se reconnecter
- **`supabase`** (CLI Supabase, optionnel, pas utilisé pour l'instant) : idem depuis [github.com/supabase/cli/releases](https://github.com/supabase/cli/releases)

---

## Dernière sauvegarde

<!-- BACKUP_STATUS_START -->
Dernière exécution : **03/10/2026 à 19:49**

- `runs` : 290 ligne(s)
- `profiles` : 3 ligne(s)
- `planned_sessions` : 53 ligne(s)
<!-- BACKUP_STATUS_END -->

Cette section est mise à jour automatiquement par `backend/backup_supabase.py` à chaque exécution (2x/jour, 14h et 17h). Ne pas éditer à la main entre les marqueurs — ce serait écrasé au prochain passage.

---

## Sécurité — état actuel (à jour au 27 septembre 2026)

- ⚠️ Dépôt **public** sur GitHub (pas privé) — décision explicitement différée jusqu'à ce que l'app soit testée par plein de monde, voir le cahier des charges v2 (6.1.1). Aucun secret trouvé dans le code ni l'historique git (clé Supabase exposée = clé publique "anon", protégée par RLS, faite pour être publique).
- ✅ Row Level Security activé **et testé en conditions réelles** (connexion avec un 2e compte réel, aucune donnée d'un autre utilisateur visible) sur `runs`, `profiles`, `planned_sessions`
- ✅ Confirmation d'email obligatoire, mot de passe 8 caractères minimum, protection contre les mots de passe compromis (HaveIBeenPwned), limitation des tentatives de connexion (30/5min/IP) — réglages Supabase Authentication
- ✅ Sauvegarde automatique de la base (2x/jour, 30 jours d'historique, dans `backups/` synchronisé Google Drive), couvre `runs`, `profiles`, `planned_sessions`
- ✅ Script de restauration (`backend/restore_supabase.py`) écrit et testé avec succès (restauration bit à bit identique à la sauvegarde, sur des tables temporaires, sans toucher aux vraies données)
- ✅ Clé secrète du script de sauvegarde stockée hors du repo, permissions restreintes (`chmod 600`), jamais committée (`.gitignore`)
- ✅ Photos de profil : bucket public en lecture (décision assumée pour l'instant), upload désactivé côté app en attendant un stockage privé
- ⬜ 2FA sur le compte GitHub — pas encore fait, recommandé
