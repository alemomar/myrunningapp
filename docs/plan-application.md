# Plan d'application du design

Référence : journal version 48 (design gelé le 03/10/2026). Chaque décalage (D1 à D78) est rattaché à une seule tranche. Construction sur une branche séparée « refonte » : la version en ligne ne change qu'à l'étape S13.

Pour chaque tranche : tests ajoutés si de la logique est touchée, captures sur banc de données fictives (375 px puis 360 px) comparées aux maquettes, un commit par sous-point, mise à jour de `docs/decalages-design.md`.

## Avancement

- **Ordre validé par Omar le 03/10/2026 :** S0, S1, S2, S3, S4, S5, S6, S7, S11, S8, S9, S10, S12, S13 (S11 avant S8, S10 après S8).
- **S11 : fait le 05/10/2026** (Objectifs : carte d'objectif principal avec tuiles Terrain / Record / Visé, objectif secondaire, « Ton profil coureur » en pastilles, « Ton niveau » ; l'ancien formulaire détaillé s'ouvre dans une feuille ; Mon compte en blocs ; enregistrement champ par champ avec badge ; 726 tests OK). Reste pour plus tard : écran « Ton niveau » complet et feuille « Mettre à jour ton programme » (S8), guide « Voir comment » (S10).
- **S7 : fait le 05/10/2026** (S7.1 calculs ; S7.2 écran Historique à part ; S7.3 feuille de détail d'une séance, Détail cardio V2 en SVG, suppression avec confirmation ; S7.4 feuille de ressenti 7a avec carte du corps devant / derrière ; S7.5 saisie à la main alignée (sans heure de départ, doublon dans la feuille), rattachement N2 et fusion N5 ; Chart.js retiré de l'app ; 722 tests OK). Reste pour plus tard : `confirm()` de suppression d'une séance prévue et `alert()` d'erreurs de chargement (S12), carte « Ton objectif a changé » (S8).
- **S6 : fait le 05/10/2026** (S6.1 calculs testés, S6.2 haut de Progression : carte objectif en 4 variantes, anneaux, tuiles, chiffres clés, Tes records, jauge de charge et son explication ; S6.3 graphiques en SVG : courbe EF interactive, fractionné, efficience, volume mensuel, facile / soutenu ; ancien code de Progression et réglage « Affichage » retirés ; 677 tests OK). Nouvelle décision D79 (carte « Dernière séance » retirée). Reste pour plus tard : liste d'historique en écran à part (S7), chronos déclarés limités à « Ton niveau » (S8), états vides de Progression (S12).
- **S5 : fait le 05/10/2026** (S5.1 calendrier semaine et mois, petites cartes, feuilles Ajouter / Modifier, glisser-déposer avec annulation ; S5.3 détail du jour ; S5.4 bannières 9a : une carte à la fois, « 1 autre point », curseur « Décaler », ajustement léger ; S5.5 Générer / Compléter sans alerte du navigateur, message D75 ; 602 tests OK). Reste pour plus tard : `confirm()` de suppression d'une séance (S12), alias CSS provisoires.
- **S4 : fait le 04/10/2026** (S4.1 à S4.4 : titre de page, bandeau coach, carte d'action unique, Hier, carte de séance, exercices remplaçables, Ta semaine ; 563 tests OK ; 33 écrans sans débordement à 375 et 360 px). Reste pour plus tard : plein écran de record et confettis (S9), carte « Ton objectif a changé » (S8), détail du jour de Programme (S5).
- **S3 : fait le 04/10/2026** (menu en pilule, point violet, priorité des alertes ; 495 tests OK ; 360 px vérifié).
- **S2 : fait le 04/10/2026** (S2.1 types et règles, S2.2 records ; 486 tests OK). Reste pour plus tard : listes des formulaires et trophée (S5, S7), affichage de la liste des records (S6).
- **S1 : fait le 04/10/2026** (7 commits S1.1 à S1.7 sur `refonte`, 427 tests OK, 30 écrans sans débordement à 375 px et 360 px). Polices copiées dans `web/fonts/` (6 fichiers, 90 Ko). Restent à traiter plus loin : couleurs de données des graphiques (S6), alias provisoires `--card`, `--card-2`, `--border`, `--text-dim`, `--accent-dim`, `--radius-*` à supprimer quand les écrans auront migré, préchargement de Barlow Condensed 700 à ajouter en S4.
- **Méthode changée par Omar le 04/10/2026 :** après S1, construction de toutes les tranches S2 à S13 sans validation intermédiaire (l'app est hybride tant que tout n'est pas posé). Revue complète et corrections à la fin, puis son go pour la mise en ligne (S13).
- **S0 : fait le 03/10/2026.** Branche `refonte` (poussée sur GitHub, GitHub Pages ne publie que `main`). Étiquette de retour arrière `avant-design-v48` sur `3cda37c` (l'étiquette `avant-refonte` du 27/09 est un autre repère, conservée). Banc de captures dans `docs/banc-captures/` (voir son LISEZMOI) : 28 scénarios sans débordement à 375 px et 360 px sur la version actuelle. `.gitignore` : « Sauvegarde de secours/ » ajouté.

| Tranche | Titre | Contenu | Dépend de | Taille | Contrôle |
|---|---|---|---|---|---|
| S0 | Préparation | Branche « refonte », étiquette de retour arrière, banc de captures à jour (375 px et 360 px). Pas de changement visible. | — | Petite | — |
| S1 | Socle visuel | Jetons (couleurs, polices, espacements), polices Barlow avec affichage de secours, violet à la place de l'ambre, composants de base (pastilles, champs, boutons, feuilles). | S0 | Moyenne | Captures des composants |
| S2 | Types et statistiques (règles) | Liste de types (14 et 12), Récup/Marche/Étirements, hors-statistiques par défaut, règle de cohabitation mise à jour, détenteurs de records, records par distance (D à D + 5 %), record EF seulement pour une sortie facile. | S0 | Moyenne | Tests unitaires |
| S3 | Menu du bas et priorité des alertes | Menu en pilule, point violet, fonction de priorité des bannières, test à 360 px. | S1 | Petite | Captures + tests |
| S4 | Aujourd'hui | Bandeau coach cliquable, carte de séance (exercices remplaçables, détail), carte d'action unique, « Hier », alerte douleur forte, « Ta semaine » (tuiles, phrases, navigation). | S1, S2, S3 | Grande | Captures vs maquettes |
| S5 | Programme | Calendrier semaine et mois, glisser-déposer avec annulation et règle de cohabitation, feuilles Ajouter / Modifier avec calcul distance-allure-durée, bannières 9a, ajustement léger, Générer / Compléter. | S1, S2, S3 | Grande | Captures + essai du geste |
| S6 | Progression et graphiques | Carte objectif (4 variantes), indicateurs, chiffres clés, records, anneaux, jauge de charge avec courbe, graphiques (courbe EF interactive en deux livraisons, fractionné, volume, efficience, facile/soutenu), réglage semaine/mois retiré. | S1, S2 | Très grande | Captures + tests de calcul |
| S7 | Historique, ressenti, saisie | Historique en écran à part, détail de séance, ressenti unique (4 curseurs, carte du corps à choix multiples), saisie à la main alignée sur le design, rattachement, fusion et ses textes. | S1, S2 | Grande | Captures + essai complet |
| S8 | Allures et programme (chantiers 5 et 6) | Base des allures « Ton niveau » seulement, garde-fou, reprise des anciens comptes, feuille « Tes nouvelles allures », carte « Ton objectif a changé » élargie aux réglages qui changent le programme. | S2, S5, S11 | Grande | Tests + captures |
| S9 | Célébration | Plein écran avec le bonhomme (records de distance), carte simple avec petits confettis, déclenchement et durée de la carte « Hier ». | S2, S4 | Moyenne | Captures + essai animation |
| S10 | Parcours de démarrage et guide | Parcours plein écran, « Ton niveau », date serrée et « trop proche », guide RunSync en 4 étapes avec détection des premières courses. | S1, S8 | Moyenne | Captures + essai du parcours |
| S11 | Profil | Objectifs et Mon compte, enregistrement champ par champ avec badge, FC de repos modifiable. | S1 | Moyenne | Captures + essai de sauvegarde |
| S12 | États vides, chargement, erreurs | Squelettes, écrans vides, création du programme, messages avec « Réessayer », détection hors ligne. | S1 | Moyenne | Captures de chaque état |
| S13 | Contrôle avant mise en ligne | Tests, iPhone réel, temps d'ouverture, mode « réduire les animations », 360 px, vérification que chaque ligne de la matrice est traitée ; fusion sur la branche principale. | Toutes | — | Liste de contrôle |

## Matrice de couverture

| Décalage | Sujet | Tranche |
|---|---|---|
| D1 | Palette et polices | S1 |
| D2 | Les maquettes ne sont pas dans le Drive (toujours absentes de l'archi… | Action d'Omar (fichiers de maquettes) |
| D3 | La source des courses | S1 |
| D4 | Remplacer ou supprimer un exercice du renfo du jour (V1b, V1d), annul… | S4 |
| D5 | Feuille de détail d'un exercice (V1c) | S4 |
| D6 | Séance passée non reçue visible (V3) | S4 |
| D7 | Point ambre sur l'icône Programme | S3 |
| D8 | Avertissement de doublon à la saisie (N1b) | S7 |
| D9 | Rattachement (N2) | S7 |
| D10 | Formulaire de saisie (N1a) : le ressenti se remplit dans la même feui… | S7 |
| D11 | Carte d'action unique sous la séance du jour | S4 |
| D12 | Carte « Hier » = célébration + notation fusionnées | S4 |
| D13 | Suppression d'une course | S7 |
| D14 | Détail cardio replié par défaut (V2), avec la « limite EF de 151 bpm… | S7 |
| D15 | Types de séance | S2 |
| D16 | Polices Google Fonts | S1 |
| D17 | Largeur 360 px du menu | S3 |
| D18 | Tuiles de « Ta semaine » (3c) : icône et couleur du type de la séance… | S4 |
| D19 | Toucher un jour ouvre ce jour dans Programme ; toucher la charge ouvr… | S4 |
| D20 | Ligne sous la semaine (R5) : deux cas | S4 |
| D21 | Jauge de charge (4c) : chiffre à 2 décimales, courbe des 8 dernières… | S6 |
| D22 | Bouton « i » de la jauge : « feuille d'explication » | S6 |
| D23 | Ordre et contenu de la carte « Ta semaine » | S4 |
| D24 | Couleurs par type de séance | S1 |
| D25 | Carte objectif de Progression : ligne d'avancement selon l'objectif | S6 |
| D26 | Records par distance (5 km, 10 km, semi, marathon) : une course compt… | S2 |
| D27 | Chiffres clés : distance annuelle, plus longue sortie (ce mois), temp… | S6 |
| D28 | Tuiles d'indicateur 2 × 2 (efficience, régularité, volume, charge) av… | S6 |
| D29 | Anneaux et bouton « Historique › » | S6 |
| D30 | Courbe d'allure EF interactive (6c) : période (3 mois, 6 mois, 12 moi… | S6 |
| D31 | Fractionné (6e) : efforts seuls, à partir de 4 séances | S6 |
| D32 | Volume mensuel (6f) : barres citron si objectif atteint, grises sinon… | S6 |
| D33 | Vue hebdomadaire ou mensuelle des graphiques | S6 |
| D34 | Efficience cardiaque (6g) : courbe corail, cœur qui bat, une décimale | S6 |
| D35 | Facile / soutenu (6h) : 2 parts, facile = zones 1 à 3, soutenu = zone… | S6 |
| D36 | Séries du graphique d'allure EF | S6 |
| D37 | Règle de couleur globale : le violet oklch(0.72 0.17 300) remplace l'… | S1 |
| D38 | Feuille de ressenti 7a, la même partout (Aujourd'hui, historique, sai… | S7 |
| D39 | Carte du corps : « Avant / Pendant / Après » à choix multiples ; coul… | S7 |
| D40 | Libellés et couleurs à changer | S7 |
| D41 | L'historique devient un écran à part (7g), ouvert par « Historique ›… | S7 |
| D42 | « Cette semaine » (carte toujours dépliée, avec total « 18,1 km · 3 s… | S7 |
| D43 | Trophée citron sur la ligne d'une séance qui a un record | S2 |
| D44 | Pastille de difficulté à droite de chaque ligne : « 3/10 » (violet à… | S7 |
| D45 | Feuille de détail d'une séance : type, « Compter dans mes stats » (an… | S7 |
| D46 | Glisser-déposer d'une séance (vue semaine seulement) : décidé, on le… | S5 |
| D47 | Feuilles « + Ajouter » et « Modifier la séance » (dessinées) | S5 |
| D48 | Calendrier : semaine (7 tuiles de 40 px, jour choisi, petites cartes… | S5 |
| D49 | Ligne « km faits sur km prévus » sous la semaine | S5 |
| D50 | Bannière d'adaptation (9a) : carte violette, 5 choix en lignes de 44… | S5 |
| D51 | Une seule bannière visible sur Programme, plus une ligne « 1 autre po… | S3 |
| D52 | Alerte douleur forte (7 ou plus) toujours affichée sur Aujourd'hui, s… | S4 |
| D53 | Bandeau coach en haut d'Aujourd'hui : une phrase choisie par priorité… | S4 |
| D54 | Ajustement léger : ligne grise en haut de Programme (icône refresh, c… | S5 |
| D55 | Célébration (10b) : plein écran seulement pour un record de distance… | S9 |
| D56 | Animation du bonhomme (10b-4) | S9 |
| D57 | Déclenchement de la célébration et durée de la carte « Hier » | S9 |
| D58 | Étape « Ton niveau » du démarrage : questions du plan débutant | S10 |
| D59 | « Date un peu serrée » et « Date trop proche » | S10 |
| D60 | Guide « Voir comment » pour connecter RunSync (feuille) | S10 |
| D61 | Parcours de démarrage en plein écran (11b) | S10 |
| D62 | Élargissement de « Ton objectif a changé » (chantier 6, Q5) : tout ré… | S8 |
| D63 | FC de repos et VO2 max en lecture seule (« Apple Santé, chaque mois ») | S11 |
| D64 | Profil enregistré champ par champ avec badge « Enregistré » (2 s), sa… | S11 |
| D65 | Réglage « Affichage : Hebdomadaire / Mensuel » conservé dans Mon comp… | S6 |
| D66 | Reste de Mon compte : avatar, pseudo, âge, mot de passe, export JSON/… | S11 |
| D67 | États vides (Aujourd'hui, Programme, Progression) et chargement par s… | S12 |
| D68 | Pilule « Synchronisation de tes courses… » en haut pendant le chargem… | S12 |
| D69 | Écran « On prépare ton programme… » avec 4 étapes qui se cochent une… | S12 |
| D70 | Gestion des erreurs sans fenêtre du navigateur : message blanc en bas… | S12 |
| D71 | Bannière « séance non faite » (9a) : « La replacer cette semaine » /… | S5 |
| D72 | Feuille « Tes nouvelles allures » (N3) avec le sur-titre « APRÈS TON… | S8 |
| D73 | Carte « Ton objectif a changé » (N4) : × pour fermer sur Aujourd'hui… | S8 |
| D74 | Fusion (N5) : textes et doute | S7 |
| D75 | « Générer / Compléter cette semaine » sans objectif ni disponibilités | S5 |
| D76 | Base des allures du programme : « Ton niveau » seulement, jamais un r… | S8 |
| D77 | Record de meilleure allure EF seulement pour une sortie réellement fa… | S2 |
| D78 | Principe : seules les sorties de course alimentent graphiques et indi… | S2 |

## Rappels

- Aucun script SQL n'est prévu dans cette refonte (notes limitées aux séances ajoutées à la main, Récup réglé dans le code).
- Les chantiers 5 et 6 sont la tranche S8, après les tranches qui leur servent de base.
- Les petits rectificatifs de la liste de 33 remarques sont absorbés par les tranches ou traités après la mise en ligne (voir `docs/projets-en-attente.md`).