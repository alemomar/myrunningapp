# Banc de captures de la refonte

Sert à contrôler chaque tranche (S1 à S13) à **375 px et 360 px**, avec des données **fictives** (aucun réseau, aucune donnée réelle), et à comparer aux maquettes du design gelé (journal v48).

## Contenu

| Fichier | Rôle |
|---|---|
| `mr-harness.js` | Jeu de données fictives (Camille, 14 semaines de courses, programme) et les scénarios choisis par l'adresse `mr.html#nom` |
| `planche.html` | Joue tous les scénarios aux deux largeurs, mesure les débordements et les erreurs de console, affiche un tableau |
| `verifier-noms.js` | Contrôle statique : aucun nom utilisé n'est déclaré nulle part (`node docs/banc-captures/verifier-noms.js`) |
| `rafraichir.sh` | Copie `web/` vers le cache d'aperçu, fabrique `mr.html`, copie les maquettes |

## Utilisation

1. Rafraîchir (à lancer depuis un shell normal, jamais depuis le serveur d'aperçu : Google Drive lui est interdit) :

   ```bash
   bash docs/banc-captures/rafraichir.sh
   ```

2. Démarrer l'aperçu `myrunningapp-web` (port 8765).
3. Pages utiles :
   - `http://localhost:8765/planche.html` : tous les scénarios, tableau « OK / à voir » (environ 15 à 20 min).
   - `http://localhost:8765/planche.html?s=progression` : un seul scénario, laissé à l'écran pour une capture.
   - `http://localhost:8765/mr.html#progression` : l'app seule sur un scénario.
   - `http://localhost:8765/maq/phase6.html` : la maquette du design (Phase 6) pour comparer.

## Ce que la planche mesure

- La page défile-t-elle à l'horizontale (largeur de contenu supérieure à l'écran) ?
- Un élément dépasse-t-il le bord droit, hors zones qui défilent exprès (graphiques, carrousels) ?
- Le jeu de données a-t-il signalé une erreur ?
- La page a-t-elle levé une **erreur de console** (nom introuvable, fonction absente…) ? Un écran qui lève une erreur est marqué « à voir ». Ce contrôle a été ajouté en S8, après qu'une régression de S7 (`ZONE_SHORT_LABEL` supprimée par erreur) soit passée inaperçue.

Le détecteur a été vérifié le 03/10/2026 : il voit les hauteurs réelles des pages et détecte un élément de 500 px forcé dans un écran de 360 px.

## Scénarios

Aujourd'hui : `aujourdhui_course`, `aujourdhui_renfo`, `aujourdhui_repos`, `aujourdhui_savoir_plus`, `douleur_forte`, `zone_pause`, `rappels`, `merge`, `merge_ask`, `attach`, `celebration_record`, `marche_course`, `test_niveau`.
Programme : `programme_semaine`, `programme_mois`, `programme_ajout`, `ajout_choix`, `ajout_passe` (S21 : « Ajouter » selon le jour), `programme_creation` (S21 : programme créé en milieu de semaine, à partir du lendemain ; S22 : sans bouton « Compléter » quand plus rien ne peut aller), `programme_semaine_passee` (S22 : pas de bouton dans une semaine passée).
Retours des testeurs (S21) : `onboarding_niveau_estimation`, `onboarding_niveau_autre`, `onboarding_recap_estimation`, `niveau_autre`, `profil_niveau_estime`, `guide_note_garmin`, `guide_note_aucun`, `guide_vide_montre`, `guide_vide_garmin`, `detail_cardio_incomplet`, `efficience_inhabituelle`.
Progression et Profil : `progression`, `profil_objectifs`, `profil_compte`.
États vides : `vide_aujourdhui`, `vide_programme`, `vide_progression`.
Démarrage : `onboarding_bienvenue`, `onboarding`, `onboarding_niveau`, `onboarding_dispos`, `onboarding_recap`.
Première connexion (S15) : `install_safari`, `install_chrome`, `install_dansapp`, `auth_connexion`, `auth_creation`, `auth_code`, `auth_code_erreur`, `auth_non_confirme`, `auth_oublie`, `auth_nouveau_mdp`. `mr.html#verif_completer` n'est pas un écran non plus (S22) : il contrôle le bouton « Compléter cette semaine » (jamais deux jours de course de suite, absent quand plus rien ne peut aller ou dans une semaine passée, présent s'il reste de la place) et le remplissage le jour de l'inscription ; le titre indique « COMPLETER OK n/n » (détail dans `window.__verif`). Recharger vraiment la page (`mr.html?x=N#…`), un simple changement de `#` ne relance rien. `mr.html#auth_flux` n'est pas un écran : il rejoue les enchaînements de la connexion avec un faux Supabase, et le titre de la page indique « AUTH OK n/n » (détail dans `window.__auth`).

Quand une tranche ajoute un écran (feuille « Tes nouvelles allures », carte « Ton objectif a changé », historique en écran à part, etc.), ajouter son scénario à `mr-harness.js` et à la liste `SCENARIOS` de `planche.html`.

## État de référence (avant la refonte)

Passage du 03/10/2026 sur la version en ligne (étiquette `avant-design-v48`) : **28/28 scénarios sans débordement à 375 px et 360 px.** Toute régression de ce tableau pendant la refonte est à corriger avant de passer à la tranche suivante.
