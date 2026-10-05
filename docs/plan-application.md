# Plan d'application du design

Référence : journal version 48 (design gelé le 03/10/2026). Chaque décalage (D1 à D78) est rattaché à une seule tranche. Construction sur une branche séparée « refonte » : la version en ligne ne change qu'à l'étape S13.

Pour chaque tranche : tests ajoutés si de la logique est touchée, captures sur banc de données fictives (375 px puis 360 px) comparées aux maquettes, un commit par sous-point, mise à jour de `docs/decalages-design.md`.

## Avancement

- **Ordre validé par Omar le 03/10/2026 :** S0, S1, S2, S3, S4, S5, S6, S7, S11, S8, S9, S10, S12, S13 (S11 avant S8, S10 après S8).
- **S13 : contrôles faits le 05/10/2026, reste ce qui demande Omar.** Fait : 830 tests, planche de 80 écrans à 375 et 360 px sans débordement ni erreur de console, matrice de couverture (90 décalages tous traités ; restent à valider avec Omar : D34, D79, D80 à D90), audit des textes (aucun vouvoiement, aucun `alert`/`confirm`, vocabulaire « allure conseillée »), audit « réduire les animations » (règle ajoutée pour le menu, le message en bas et la roue ; l'animation du bonhomme gère le cas elle-même), poids de l'app (index.html 127 Ko, logic.js 66 Ko, record-man.js 4 Ko compressés ; environ 250 à 300 Ko transférés à la première ouverture, Supabase compris), 34 commits sur `refonte`, revue publiée pour Omar (page `docs/revue-finale/revue-finale.html`, lien dans la mémoire du projet). **Reste (Omar)** : test sur iPhone réel (temps d'ouverture, glisser-déposer, clavier, « réduire les animations », mode avion, guide RunSync), lien d'installation de RunSync (`RUNSYNC_INSTALL_URL`), ses réponses aux choix de la revue, puis son go pour la fusion sur `main`.
- **S12 : fait le 05/10/2026** (S12.1 plus aucune fenêtre du navigateur : messages avec « Réessayer » qui rejouent l'écriture, bloc « Impossible de charger tes séances », bandeau hors ligne, suppression d'une séance avec « Annuler » ; S12.2 états vides (Aujourd'hui, Progression), chiffres à 0 en gris, squelettes de chargement ; S12.3 écran « On prépare ton programme… » ; S12.4 synchro muette dans Mon compte ; anciens alias CSS retirés ; 830 tests OK). Décalages D67 à D70 traités, D90 ajouté.
- **S9 : fait le 05/10/2026** (S9.1 calculs : record de distance à fêter, gain « −34 s », la carte « Hier » ne vaut que pour une sortie d'aujourd'hui ou d'hier ; S9.2 plein écran avec le petit bonhomme `record-man.js`, une seule fois à l'ouverture de l'app, « Noter mon ressenti » / « Plus tard », petits confettis pour les records d'allure ; 811 tests OK ; planche de 63 écrans sans débordement ni erreur de console).
- **S10 : fait le 05/10/2026** (S10.1 calculs : date « un peu serrée » / « trop proche », première date possible, modèle du guide ; S10.2 parcours plein écran en 5 étapes + « Connecte tes courses », logo validé, « Ton niveau » avec garde-fous ; S10.3 guide « Voir comment » en feuille (4 étapes, détection des premières courses, état gardé sur l'appareil) ; 830 tests OK). Décalages D59 à D61 traités, D87 à D89 ajoutés. **Reste à fournir par Omar : le lien d'installation de RunSync (TestFlight puis App Store)**, constante `RUNSYNC_INSTALL_URL` dans `web/index.html`.
- **S8 : fait le 05/10/2026** (S8.1 calculs testés : fraîcheur du temps de référence, « Ton niveau » seule source des allures, garde-fou « temps trop rapide », nouvelles allures dès 5 s/km, reprise des anciens comptes, signature du programme ; S8.2 écran « Ton niveau » (niveau estimé, chrono récent, test guidé, question de reprise), cartes d'Aujourd'hui et du Programme, date de la VMA ; S8.3 feuille « Tes nouvelles allures » (Appliquer met à jour les séances générées à venir) et résultat du test guidé ; S8.4 carte « Ton objectif a changé » (× sur Aujourd'hui seulement) et feuille « Mettre à jour ton programme » (séances à venir mises de côté puis régénérées) ; 798 tests OK ; planche de 56 écrans sans débordement ni erreur de console). Décalages D62, D72, D73, D76 traités, D80 à D86 ajoutés. **Régression de S7 corrigée** : `ZONE_SHORT_LABEL` avait été supprimée par erreur (alertes douleur, zones en pause, mobilité ciblée) ; le banc contrôle maintenant les erreurs de console de chaque écran et `docs/banc-captures/verifier-noms.js` repère les noms utilisés mais non déclarés. Un chrono donné alors qu'un test de 20 minutes était planifié met ce test de côté. Reste pour plus tard : textes du parcours de démarrage et chrono daté dès le démarrage (S10).
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
## Notes de reprise pour S13 (écrites le 05/10/2026)

**Où en est-on :** S0 à S12 faites sur `refonte`. Reste : S13 (contrôles finaux, revue complète avec Omar, fusion sur `main` sur son go).

**Avant chaque commit :** `node docs/banc-captures/verifier-noms.js`, tests (`test.html`), planche (`planche.html`, environ 28 min, marque aussi les erreurs de console). Après `rafraichir.sh`, recharger `mr.html` avec un `?x=N` neuf.

**S13 : contrôle avant mise en ligne**
- Liste de contrôle : tests (830) et planche à 375 et 360 px ; vérifier chaque ligne de la matrice de couverture de ce fichier (colonne « Tranche » : tout doit être « fait ») ; mode « réduire les animations » (le navigateur d'aperçu ne l'émule pas : à vérifier sur iPhone réel ou en forçant la requête média dans les outils) ; temps d'ouverture ; iPhone réel (Safari, ajout à l'écran d'accueil) : gestes de glisser-déposer du calendrier, clavier sur les champs, feuilles, parcours de démarrage, guide RunSync avec le vrai lien TestFlight ; hors ligne ; compte neuf et compte existant (question de reprise) ; contrôle des textes (tutoiement, vocabulaire « allure conseillée »).
- Revue complète avec Omar : captures avant/après de tous les écrans (`avant/mr.html#scénario` = version en ligne, `mr.html#scénario` = refonte, `comparaison.html`), liste des écarts à valider (voir ci-dessous), puis fusion unique de `refonte` sur `main` seulement sur son go explicite ; garder l'étiquette `avant-design-v48` pour le retour en arrière.
- À fournir par Omar avant la mise en ligne : le lien d'installation de RunSync (constante `RUNSYNC_INSTALL_URL`, `web/index.html`).
- Après la mise en ligne (voir `docs/projets-en-attente.md`) : icône de l'app iOS RunSync (`icone-app-ios-carre-1024.png`, nécessite une nouvelle build Xcode), et les autres projets en attente.

**À valider par Omar à la revue finale :** D79 (carte « Dernière séance » retirée de Progression), D34 (axe d'efficience), D80 à D86 (choix de S8, surtout D83 et D85), D87 à D89 (choix de S10), D90 (choix de S12), et la régression de S7 corrigée en S8 (`ZONE_SHORT_LABEL`).
