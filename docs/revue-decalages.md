# Revue des décalages avec Omar (méthode d'alignement)

Document de travail de la revue. Source des détails : `docs/decalages-design.md` (colonnes état actuel, design, effort, risque). Ici : ma proposition, et ta décision.

## Verdicts

| Verdict | Signification | Qui change |
|---|---|---|
| A | Design adopté tel quel | Moi (code) |
| B | Design amendé : le design est bon, on change un détail | Claude Design (journal) |
| C | Notre version : on garde notre règle, le design est écarté sur ce point | Claude Design (journal) |
| D | À dessiner : il manque un visuel | Claude Design (maquette) |

Colonne « Verdict d'Omar » : à remplir pendant la revue (OK = tu valides ma proposition, sinon la lettre et une remarque).

## Règles

0. (Décidé le 03/10) Tout ce qui reprend le design déjà validé avec Claude Design (verdict A) est considéré comme validé : on ne le redemande pas. La revue ne porte que sur les vrais choix (verdicts B, C, D).

1. Les verdicts B, C et D alimentent l'envoi groupé à Claude Design (section finale).
2. Une fois le design gelé (version 45), tout changement passe par une nouvelle ligne ici et un numéro de version.
3. Une matrice de couverture rattache chaque ligne à une tranche d'application ; à la fin, plus aucune ligne sans tranche.

---

## Lot 1 : décisions à trancher, une par une

On les prend à voix haute, une à une. Les autres lots se valident en bloc.

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D20 | Ligne sous la semaine (R5) : deux cas | Deux phrases : manquée seule « Ta sortie de jeudi a été manquée, tu peux la remplacer. » ; manquée avec une autre sortie comptée « Ta sortie de samedi est bien comptée. La séance de vendredi reste à replacer. » | A | OK : les 3 phrases validées le 03/10 | Phrases : « Ta séance de jeudi n'a pas pu se faire, tu peux la replacer. » ; « 2 séances n'ont pas pu se faire cette semaine, tu peux les replacer. » ; « Ta sortie de samedi est bien comptée. La séance de vendredi reste à replacer. » |
| D22 | Bouton « i » de la jauge : « feuille d'explication » | Texte proposé : « La charge compare ce que tu as couru cette semaine à ce que ton corps a l'habitude de faire (ses 4 dernières semaines). Autour de 1, tu progresses à un rythme qu'il encaisse. En dessous de 0,8, tu peux en faire un peu plus. Au-dessus de 1,3, ta charge monte vite et le risque de blessure augmente. » À valider, sans jargon. | A | OK : texte validé le 03/10 | Texte validé (voir docs/decalages-design.md D22) |
| D43 | Trophée citron sur la ligne d'une séance qui a un record | Le trophée signifie « cette séance détient un record actuel » (pas « était un record le jour même »). | A | OK : sens A validé le 03/10 | Trophée = la séance détient un record actuel (4 distances + meilleure allure EF + meilleure allure fractionné) ; la feuille de détail dit lequel ; chronos déclarés exclus |
| D47 | Feuilles « + Ajouter » et « Modifier la séance » (dessinées) | Colonne dédiée « notes » dans les séances prévues (script SQL 024 à exécuter par toi dans Supabase), pour ne pas écraser la liste d'exercices. | B | OK : option 1 choisie le 03/10 | Notes uniquement sur les séances ajoutées à la main (rangées dans le champ existant, comme aujourd'hui) ; aucune colonne ni script SQL. Une séance générée n'a pas de champ « Notes ». |
| D55 | Célébration (10b) : plein écran seulement pour un record de distance (5 km, 10 km, semi… | Plein écran seulement pour un record de distance, comme le design. En plus : une carte simple, sans plein écran, pour meilleure allure EF/fractionné, plus longue sortie et efficience cardiaque ; plus de « Bravo, séance faite ». CD dessine la carte simple (verdict D). | B + D | OK avec ajout d'Omar le 03/10 | Plein écran = records de distance. Carte simple pour les autres records et l'efficience, avec de petits confettis pour les records d'allure (EF et fractionné) ; plus de « Bravo, séance faite ». CD dessine la carte et les petits confettis. |
| D68 | Pilule « Synchronisation de tes courses… » en haut pendant le chargement ; bandeau gris… | « Chargement… » par défaut ; « Synchronisation… » seulement quand c'est vrai (attente de la 1re course dans le guide, retour de « Synchroniser mes courses »). Hors ligne : détection de la connexion, données déjà chargées gardées en mémoire, pas de cache persistant. | B | OK : validé le 03/10 | « Chargement… » par défaut ; « Synchronisation de tes courses… » seulement dans le guide et au retour de « Synchroniser mes courses » ; bandeau hors ligne « Tu es hors ligne. On garde ce qui est affiché. » ; pas de copie permanente |
| D72 | Feuille « Tes nouvelles allures » (N3) avec le sur-titre « APRÈS TON RECORD » | Mise à jour des allures proposée seulement après un chrono (Ton niveau), un test guidé ou un record personnel déclaré. Trois sur-titres : « après ton chrono », « après ton test », « après ton record ». | B | OK : règles 1 à 6 validées le 03/10 | Voir D76 : une seule source pour les allures (« Ton niveau »), le record d'Objectifs et les records de courses ne servent plus à les calculer. Feuille « Tes nouvelles allures » après un chrono ou un test seulement ; sur-titre « APRÈS TON RECORD » supprimé. |
| D76 | Base des allures : « Ton niveau » seulement, record exclu | 1) Source unique : « Ton niveau » = effort à fond récent (moins de 6 mois) ou test guidé de 20 min. 2) Texte explicite (« Pas ton record de toute une vie, pas ta sortie tranquille »). 3) Le record d'Objectifs et les records de courses ne calculent jamais les allures. 4) Garde-fou : temps beaucoup plus rapide que les vraies sorties faciles. 5) Vocabulaire « allure conseillée ». 6) Nouvelles allures après chrono ou test seulement. Question de reprise pour les comptes qui utilisent un record comme base. | B + C | OK validé le 03/10 | Le journal de CD change : texte explicatif et message du garde-fou sur « Ton niveau », deux sur-titres seulement sur N3. |
| D77 | Record de meilleure allure EF seulement pour une sortie réellement facile | Le record EF (célébration, trophée, liste) ne compte que si la sortie est une EF « propre » (cœur resté en zones 1 et 2), pour ne pas encourager à courir les sorties faciles trop vite. | A | OK validé le 03/10 (dans le cadre de D76) | |
| D33 | Vue hebdomadaire ou mensuelle des graphiques | Interrupteur « Semaine / Mois » directement au-dessus du graphique de volume, et réglage retiré de Mon compte (D65 fusionné). CD dessine l'interrupteur (verdict D). | B | Option 1 choisie le 03/10 | Plus de réglage ni d'interrupteur : tous les graphiques et chiffres sont mensuels. Le bloc « Affichage » est retiré de Mon compte. |
| D65 | Réglage « Affichage : Hebdomadaire / Mensuel » conservé dans Mon compte | Voir D33 : le réglage « Hebdomadaire / Mensuel » de Mon compte disparaît. | B | Option 1 choisie le 03/10 | Plus de réglage ni d'interrupteur : tous les graphiques et chiffres sont mensuels. Le bloc « Affichage » est retiré de Mon compte. |

## Lot 2 : socle (couleurs, polices, libellés)

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D1 | Palette et polices | Déjà confirmé : palette et polices du journal font foi. | A | Design déjà validé avec CD | |
| D2 | Les maquettes ne sont pas dans le Drive (toujours absentes de l'archive v44) | Action pour toi : télécharger les deux fichiers de maquettes et les déposer dans docs/design/. | A | Design déjà validé avec CD | |
| D3 | La source des courses | Déjà confirmé : « Apple Santé » partout, « RunSync » seulement dans l'étape « Connecte tes courses » et le guide. | A | Design déjà validé avec CD | |
| D15 | Types de séance | Liste à 11 types ; Souplesse devient Mobilité et Other devient Autre (affichage et formulaires, anciennes séances conservées). | B + D | OK : Récup hors stats par défaut, validé le 03/10 (voir D78) | Types affichés pour les séances réalisées : EF, Long, Fractionné, Seuil, Course, Récup, Marche, Renfo, Mobilité, Yoga, Pilates, Étirements, Kiné, Autre. « Récup » n'est jamais confondu avec « EF » (ce peut être un autre sport). « Marche » reste une activité à part entière (visible), à surveiller à l'usage. « Souplesse » devient « Étirements ». Pour les séances prévues : les 12 types actuels sans Récup ni Marche. Question ouverte : « Récup » compte-t-il dans les stats de course ? |
| D78 | Principe : seules les sorties de course alimentent graphiques et indicateurs | Les graphiques, indicateurs, anneaux, chiffres clés, records et la charge ne comptent que les sorties de course. Récup, Renfo, Yoga, Mobilité, Étirements, Pilates, Kiné, Marche et Autre « gravitent autour » et sont hors stats par défaut ; l'interrupteur « Compter dans mes stats » reste possible séance par séance. | A | OK validé le 03/10 | Pas de colonne ni de script SQL : réglage dans le code (défaut à la saisie et au changement de type). |
| D16 | Polices Google Fonts | Adopter Barlow, avec préchargement, affichage de secours immédiat, et mesure du temps d'ouverture avant mise en ligne. | A | Design déjà validé avec CD | |
| D17 | Largeur 360 px du menu | Tester le menu à 360 px au moment de l'application. | A | Design déjà validé avec CD | |
| D24 | Couleurs par type de séance | Couleurs par type du design, partout, y compris dans les graphiques. | A | Design déjà validé avec CD | |
| D36 | Séries du graphique d'allure EF | EF en points citron, sorties longues en losanges menthe. | A | Design déjà validé avec CD | |
| D37 | Règle de couleur globale : le violet oklch(0.72 0.17 300) remplace l'ambre pour toute l… | Violet à la place de l'ambre et de l'orange partout (28 endroits), y compris l'alerte de douleur forte. | A | Design déjà validé avec CD | |
| D40 | Libellés et couleurs à changer | « Compter dans mes stats » à la place de « Suivi » ; Kiné en rose. | A | Design déjà validé avec CD | |

## Lot 3 : Aujourd'hui et carte de séance

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D4 | Remplacer ou supprimer un exercice du renfo du jour (V1b, V1d), annulable 5 s, valable… | Remplacer ou supprimer un exercice pour la séance du jour seulement (liste déjà stockée par séance, aucune base à modifier), avec annulation de 5 s. | A | Design déjà validé avec CD | |
| D5 | Feuille de détail d'un exercice (V1c) | Feuille de détail d'un exercice avec Précédent / Suivant. | A | Design déjà validé avec CD | |
| D6 | Séance passée non reçue visible (V3) | Afficher les séances à replacer dans le calendrier et sur la carte « Pas encore reçue d'Apple Santé » avec « J'ai fait cette séance ». | A | Design déjà validé avec CD | |
| D11 | Carte d'action unique sous la séance du jour | Règle de la carte d'action unique : rattachement, Hier, objectif changé, Ton niveau ; alerte douleur forte toujours affichée. | A | Design déjà validé avec CD | |
| D12 | Carte « Hier » = célébration + notation fusionnées | Carte « Hier » = célébration (si record) + « Noter mon ressenti ». | A | Design déjà validé avec CD | |
| D18 | Tuiles de « Ta semaine » (3c) : icône et couleur du type de la séance du jour, 2e séanc… | Étendre le calcul de la semaine : type et statut de la séance principale et de la 2e séance de chaque jour. | A | Design déjà validé avec CD | |
| D19 | Toucher un jour ouvre ce jour dans Programme ; toucher la charge ouvre les indicateurs… | Toucher un jour ouvre ce jour dans Programme ; toucher la charge ouvre les indicateurs. | A | Design déjà validé avec CD | |
| D23 | Ordre et contenu de la carte « Ta semaine » | Ordre : chiffres, jours, légende, phrase de synthèse, charge ; la ligne « ! » remplace la phrase de synthèse quand une séance est à replacer. | A | Design déjà validé avec CD | |
| D52 | Alerte douleur forte (7 ou plus) toujours affichée sur Aujourd'hui, sous le bandeau coa… | Alerte douleur forte (7 et plus) aussi sur Aujourd'hui, sous le bandeau coach. | A | Design déjà validé avec CD | |
| D53 | Bandeau coach en haut d'Aujourd'hui : une phrase choisie par priorité parmi les rappels | Bandeau entièrement cliquable ; ordre : fin du plan débutant, test de niveau, X jours sans courir ; rappels de niveau masqués si la carte « Ton niveau » est affichée (déjà dans le journal v44). | A | Design déjà validé avec CD | |
| D57 | Déclenchement de la célébration et durée de la carte « Hier » | L'écran plein se déclenche une seule fois à l'ouverture après un record ; la carte « Hier » disparaît le lendemain. | A | Design déjà validé avec CD | |

## Lot 4 : Programme

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D7 | Point ambre sur l'icône Programme | Calculer le nombre de points à voir à l'ouverture de l'app (même fonction que la priorité des bannières, D51). | A | Design déjà validé avec CD | |
| D46 | Glisser-déposer d'une séance (vue semaine seulement) : décidé, on le garde | Garder le glisser-déposer, mais appliquer notre règle sur un jour occupé : refus si deux courses ou renfo avec course (message existant), au lieu de « devient la 2e du jour ». CD ajuste la phrase du journal. | B | OK : on garde notre règle, validé le 03/10 | |
| D48 | Calendrier : semaine (7 tuiles de 40 px, jour choisi, petites cartes V5 qui ouvrent la… | Reconstruire les vues semaine et mois ; gros chantier d'affichage. | A | Design déjà validé avec CD | |
| D49 | Ligne « km faits sur km prévus » sous la semaine | Réglé : pas de ligne « km faits / prévus ». | A | Design déjà validé avec CD | |
| D50 | Bannière d'adaptation (9a) : carte violette, 5 choix en lignes de 44 px de même poids,… | Habillage de la bannière 9a ; compteur − / + pour décaler. | A | Design déjà validé avec CD | |
| D51 | Une seule bannière visible sur Programme, plus une ligne « 1 autre point : … » qui dépl… | Une seule bannière visible ; ordre : douleur 7 et plus, douleur 6 ou charge très haute, séance non faite. | A | Design déjà validé avec CD | |
| D54 | Ajustement léger : ligne grise en haut de Programme (icône refresh, croix pour fermer),… | Ligne grise fermable ; texte à écrire (ex. « On a allégé ta séance de jeudi »), fermeture mémorisée sur l'appareil. | A | Design déjà validé avec CD | |
| D62 | Élargissement de « Ton objectif a changé » (chantier 6, Q5) : tout réglage qui change l… | Signature du programme élargie (séances, renfo, jours indisponibles, objectif) ; l'objectif ouvre la feuille « Mettre à jour ton programme ». | A | Design déjà validé avec CD | |
| D71 | Bannière « séance non faite » (9a) : « La replacer cette semaine » / « La remplacer par… | Trois choix : la replacer, la remplacer par une EF, la laisser passer ; « Je l'ai faite » reste sur la carte de séance. | A | Design déjà validé avec CD | |
| D73 | Carte « Ton objectif a changé » (N4) : × pour fermer sur Aujourd'hui ; persistante sans… | × sur Aujourd'hui (fermeture mémorisée sur l'appareil), persistante sans × sur Programme. | A | Design déjà validé avec CD | |
| D75 | « Générer / Compléter cette semaine » sans objectif ni disponibilités | Info grise « Il nous manque ton objectif et tes disponibilités… » + « Compléter mon profil ». | A | Design déjà validé avec CD | |

## Lot 5 : Progression et graphiques

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D21 | Jauge de charge (4c) : chiffre à 2 décimales, courbe des 8 dernières semaines, échelle… | Chiffre à 2 décimales, courbe de 8 semaines (la fonction de charge à une date existe), échelle 0,50 à 1,80 ; état « très vite » (> 1,5) à régler avec la couleur violette. | A | Design déjà validé avec CD | |
| D25 | Carte objectif de Progression : ligne d'avancement selon l'objectif | Carte objectif selon le type d'objectif ; définitions : début du programme = lundi de la 1re semaine planifiée ; allure EF de départ = moyenne des 4 premières semaines ; N semaines d'affilée = série de semaines avec au moins une course. | A | Design déjà validé avec CD | |
| D26 | Records par distance (5 km, 10 km, semi, marathon) : une course compte à ±5 % de la dis… | Déjà validé : une course compte entre D et D + 5 %, temps ramené à la distance exacte. | A | Design déjà validé avec CD | |
| D27 | Chiffres clés : distance annuelle, plus longue sortie (ce mois), temps de course (ce mo… | Quatre chiffres clés ; les tuiles allure et cardio disparaissent. | A | Design déjà validé avec CD | |
| D28 | Tuiles d'indicateur 2 × 2 (efficience, régularité, volume, charge) avec ligne du coach | Brancher les indicateurs existants et leurs phrases. | A | Design déjà validé avec CD | |
| D29 | Anneaux et bouton « Historique › » | Deux anneaux (km, séances), bouton « Historique › ». | A | Design déjà validé avec CD | |
| D30 | Courbe d'allure EF interactive (6c) : période (3 mois, 6 mois, 12 mois, Tout ; « Tout »… | Courbe interactive : à livrer en deux temps (calcul de période et progression, puis couche interactive). | A | Design déjà validé avec CD | |
| D31 | Fractionné (6e) : efforts seuls, à partir de 4 séances | Efforts seuls à partir de 4 séances. | A | Design déjà validé avec CD | |
| D32 | Volume mensuel (6f) : barres citron si objectif atteint, grises sinon, mois en cours en… | Barres colorées selon l'objectif ; « trop élevé » à objectif + 30 % (repère pragmatique, pas une règle sourcée : ne pas l'écrire comme tel). | A | Design déjà validé avec CD | |
| D34 | Efficience cardiaque (6g) : courbe corail, cœur qui bat, une décimale | Courbe corail ; adapter la précision de l'axe pour éviter les graduations répétées ; vérifier ce qui est affiché en valeur. | A | Design déjà validé avec CD | |
| D35 | Facile / soutenu (6h) : 2 parts, facile = zones 1 à 3, soutenu = zones 4 et 5, repère à… | Déjà décidé : légende « Objectif conseillé : 80 % facile », facile = zones 1 à 3. | A | Design déjà validé avec CD | |

## Lot 6 : historique, ressenti, saisie à la main

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D8 | Avertissement de doublon à la saisie (N1b) | Carte d'avertissement de doublon avec « Enregistrer quand même » et « Voir la course synchronisée ». | A | Design déjà validé avec CD | |
| D9 | Rattachement (N2) | Boutons radio, séance la plus probable présélectionnée, un seul « Oui, c'est celle-là ». | A | Design déjà validé avec CD | |
| D10 | Formulaire de saisie (N1a) : le ressenti se remplit dans la même feuille | Ressenti dans la même feuille que la saisie ; heure de départ posée automatiquement (déjà décidé). | A | Design déjà validé avec CD | |
| D13 | Suppression d'une course | Suppression dans le menu « … » de la feuille de détail, confirmation en feuille. | A | Design déjà validé avec CD | |
| D14 | Détail cardio replié par défaut (V2), avec la « limite EF de 151 bpm » en pointillés | À vérifier d'abord : d'où vient la « limite EF » (je pense à la borne de la zone 2) ; sinon la retirer de la maquette. | A | Design déjà validé avec CD | |
| D38 | Feuille de ressenti 7a, la même partout (Aujourd'hui, historique, saisie à la main) : n… | Retirer la note globale ; quatre curseurs toujours visibles. | A | Design déjà validé avec CD | |
| D39 | Carte du corps : « Avant / Pendant / Après » à choix multiples ; couleur de l'intensité | Moment (avant, pendant, après) à choix multiples, enregistré en liste ; couleurs : blanc de 1 à 5, violet de 6 à 10. | A | Design déjà validé avec CD | |
| D41 | L'historique devient un écran à part (7g), ouvert par « Historique › » en haut de Progr… | L'historique devient un écran à part avec retour, « + Séance réalisée » et filtres. | A | Design déjà validé avec CD | |
| D42 | « Cette semaine » (carte toujours dépliée, avec total « 18,1 km · 3 séances ») puis « P… | « Cette semaine » puis « Plus ancien » par mois. | A | Design déjà validé avec CD | |
| D44 | Pastille de difficulté à droite de chaque ligne : « 3/10 » (violet à partir de 6) ou «… | Pastille de difficulté ou « À noter ». | A | Design déjà validé avec CD | |
| D45 | Feuille de détail d'une séance : type, « Compter dans mes stats » (ancien « Suivi »), «… | Feuille de détail ; la séance prévue liée repasse « à faire » ou « à replacer » si son jour est passé. | A | Design déjà validé avec CD | |
| D74 | Fusion (N5) : textes et doute | Reprendre les textes du journal (« course reçue d'Apple Santé », notation et notes gardées) ; deux séances côte à côte en cas de doute. | A | Design déjà validé avec CD | |

## Lot 7 : célébration

D55 et D72 sont traités dans le lot 1.

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D56 | Animation du bonhomme (10b-4) | Intégrer `record-man.js` avec deux retouches : arrêt de la boucle à la fin, texte pour lecteurs d'écran. | A | Design déjà validé avec CD | |

## Lot 8 : parcours de démarrage et guide

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D58 | Étape « Ton niveau » du démarrage : questions du plan débutant | Réglé : les questions du plan débutant sont dans l'étape « Ton niveau ». | A | Design déjà validé avec CD | |
| D59 | « Date un peu serrée » et « Date trop proche » | Trois états ; fonction « première date possible » (aujourd'hui + 60 % du minimum, arrondi au jour supérieur) ; « Sans date » débloque « Continuer ». | A | Design déjà validé avec CD | |
| D60 | Guide « Voir comment » pour connecter RunSync (feuille) | Guide en 4 étapes ; détection de l'arrivée des premières courses ; lien d'installation à fournir par toi (TestFlight, puis App Store). | A | Design déjà validé avec CD | |
| D61 | Parcours de démarrage en plein écran (11b) | Parcours en plein écran. | A | Design déjà validé avec CD | |

## Lot 9 : Profil

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D63 | FC de repos et VO2 max en lecture seule (« Apple Santé, chaque mois ») | FC de repos modifiable (même champ que la FC max) ; VO2 max en lecture seule. Le journal de CD dira « lecture seule » : à corriger chez lui. | C | OK : décidé le 03/10 (on le fait nous-mêmes, sans CD) | |
| D64 | Profil enregistré champ par champ avec badge « Enregistré » (2 s), sans bouton | Enregistrement champ par champ avec badge « Enregistré » ; court délai pour la saisie au clavier ; gestion d'échec (D70). | A | Design déjà validé avec CD | |
| D66 | Reste de Mon compte : avatar, pseudo, âge, mot de passe, export JSON/CSV, synchronisati… | Mon compte en blocs ; ajouter « Dernière course reçue » et définir « Connecté » (au moins une course synchronisée). | A | Design déjà validé avec CD | |

## Lot 10 : états vide, chargement, erreur

| ID | Sujet | Ma proposition | Verdict proposé | Verdict d'Omar | Remarque |
|---|---|---|---|---|---|
| D67 | États vides (Aujourd'hui, Programme, Progression) et chargement par squelettes (13a) | États vides et squelettes de chargement. | A | Design déjà validé avec CD | |
| D69 | Écran « On prépare ton programme… » avec 4 étapes qui se cochent une à une (13c) | Écran de création du programme, coches reliées aux vraies étapes, sans attente artificielle. | A | Design déjà validé avec CD | |
| D70 | Gestion des erreurs sans fenêtre du navigateur : message blanc en bas « Pas enregistré,… | Système de messages avec « Réessayer » à la place des alertes et confirmations du navigateur (26 + 4). | A | Design déjà validé avec CD | |

---

## À préparer à l'issue de la revue : envoi groupé à Claude Design

Brouillon, à compléter avec les verdicts B, C et D validés. Format de chaque amendement : numéro, section du journal, ancien texte, nouveau texte.

| N° | Origine | Section du journal | Amendement |
|---|---|---|---|
| A1 | D46 | Élément 8, glisser-déposer | Sur un jour occupé : appliquer la règle « jamais deux courses, jamais du renfo avec une course, une séance légère OK » ; sinon la séance revient avec un message de refus. |
| A2 | D55 | Élément 10, célébration | Ajouter une carte simple (sans plein écran) pour meilleure allure EF/fractionné, plus longue sortie et efficience cardiaque ; retirer « Bravo, séance faite ». |
| A3 | D68 | Éléments 13 et 12 | « Synchronisation de tes courses… » seulement dans le guide ; ailleurs « Chargement… ». |
| A4 | D72/D76 | Élément 9, N3 | Deux sur-titres seulement : « APRÈS TON CHRONO » et « APRÈS TON TEST » ; supprimer « APRÈS TON RECORD ». |
| A13 | D76 | Éléments 11 et 12, « Ton niveau » et formulaire chrono | Ajouter le texte explicatif (« Ton temps sur une course ou un effort à fond, récent. Pas ton record de toute une vie, pas ta sortie tranquille : à partir de là, on calcule tes allures faciles, plus lentes. ») et le message du garde-fou (« Vérifie ce temps : il est bien plus rapide que ce que tu cours en ce moment. »). Message de reprise pour les comptes qui utilisaient un record d'Objectifs. |
| A14 | D76 | Tout le journal | Vocabulaire : l'allure du programme s'appelle « allure conseillée » (jamais « objectif » ni « record »). La tuile « Record » de la carte d'objectif concerne l'objectif, pas les allures. |
| A5 | D63 | Élément 12, Mon compte | FC de repos modifiable comme la FC max ; VO2 max en lecture seule. |
| A6 | D33/D65 | Éléments 6 et 12 | Retirer le bloc « Affichage » (Hebdomadaire / Mensuel) de Mon compte ; les graphiques restent mensuels. Pas d'interrupteur. |
| A7 | D20/D22 | Éléments 3 et 4 | Insérer les textes validés (ligne sous la semaine, explication de la charge). |
| A8 | Nettoyage | Section 3 | Supprimer ou corriger les phrases périmées (2e séance « point dessous », ±5 %, points verts, « RunSync remplace », phrase R5 ancienne). |
| A9 | Nettoyage | En-tête et statuts | Compteur d'éléments et tableau de statut cohérents. |
| A15 | D15 | Éléments 2, 3, 7, 8 (types) | Liste des types : ajouter Récup, Marche et Étirements (Souplesse devient Étirements) ; couleurs et icônes à définir (Étirements dans la famille rose, Récup et Marche en gris distincts de Autre) ; sélecteurs de type (14 pour les séances réalisées, 12 pour les séances prévues) ; filtre de l'historique : où classer Récup et Marche (Autres). |
| A12 | D55 | Élément 10, célébration | Ajouter une carte simple (sans plein écran) avec « Merci ! » pour : meilleure allure EF, meilleure allure fractionné (avec de petits confettis), plus longue sortie ou durée, efficience cardiaque (sans confettis) ; retirer « Bravo, séance faite ». Version réduite sans animation avec « réduire les animations ». |
| A11 | D47 | Élément 8, feuilles Ajouter / Modifier | « Notes » affichée seulement sur les séances ajoutées à la main (pas sur une séance générée). |
| A10 | Brief | Section 4 | Refaire le brief final et tokens.css après ces amendements. |
