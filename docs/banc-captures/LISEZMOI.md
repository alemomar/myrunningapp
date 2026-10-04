# Banc de captures de la refonte

Sert à contrôler chaque tranche (S1 à S13) à **375 px et 360 px**, avec des données **fictives** (aucun réseau, aucune donnée réelle), et à comparer aux maquettes du design gelé (journal v48).

## Contenu

| Fichier | Rôle |
|---|---|
| `mr-harness.js` | Jeu de données fictives (Camille, 14 semaines de courses, programme) et 28 scénarios choisis par l'adresse `mr.html#nom` |
| `planche.html` | Joue les 28 scénarios aux deux largeurs, mesure les débordements, affiche un tableau |
| `rafraichir.sh` | Copie `web/` vers le cache d'aperçu, fabrique `mr.html`, copie les maquettes |

## Utilisation

1. Rafraîchir (à lancer depuis un shell normal, jamais depuis le serveur d'aperçu : Google Drive lui est interdit) :

   ```bash
   bash docs/banc-captures/rafraichir.sh
   ```

2. Démarrer l'aperçu `myrunningapp-web` (port 8765).
3. Pages utiles :
   - `http://localhost:8765/planche.html` : les 28 scénarios, tableau « OK / à voir » (environ 2 min 30).
   - `http://localhost:8765/planche.html?s=progression` : un seul scénario, laissé à l'écran pour une capture.
   - `http://localhost:8765/mr.html#progression` : l'app seule sur un scénario.
   - `http://localhost:8765/maq/phase6.html` : la maquette du design (Phase 6) pour comparer.

## Ce que la planche mesure

- La page défile-t-elle à l'horizontale (largeur de contenu supérieure à l'écran) ?
- Un élément dépasse-t-il le bord droit, hors zones qui défilent exprès (graphiques, carrousels) ?
- Le jeu de données a-t-il signalé une erreur ?

Le détecteur a été vérifié le 03/10/2026 : il voit les hauteurs réelles des pages et détecte un élément de 500 px forcé dans un écran de 360 px.

## Scénarios (28)

Aujourd'hui : `aujourdhui_course`, `aujourdhui_renfo`, `aujourdhui_repos`, `aujourdhui_savoir_plus`, `douleur_forte`, `zone_pause`, `rappels`, `merge`, `merge_ask`, `attach`, `celebration_record`, `marche_course`, `test_niveau`.
Programme : `programme_semaine`, `programme_mois`, `programme_ajout`.
Progression et Profil : `progression`, `carte_corps`, `profil_objectifs`, `profil_compte`.
États vides : `vide_aujourdhui`, `vide_programme`, `vide_progression`.
Démarrage : `onboarding_bienvenue`, `onboarding`, `onboarding_niveau`, `onboarding_dispos`, `onboarding_recap`.

Quand une tranche ajoute un écran (feuille « Tes nouvelles allures », carte « Ton objectif a changé », historique en écran à part, etc.), ajouter son scénario à `mr-harness.js` et à la liste `SCENARIOS` de `planche.html`.

## État de référence (avant la refonte)

Passage du 03/10/2026 sur la version en ligne (étiquette `avant-design-v48`) : **28/28 scénarios sans débordement à 375 px et 360 px.** Toute régression de ce tableau pendant la refonte est à corriger avant de passer à la tranche suivante.
