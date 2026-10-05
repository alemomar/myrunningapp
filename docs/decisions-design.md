# Suivi des décisions : relooking et nouvelles fonctions (02/10/2026)

Statuts : à faire / en cours / fait. « Qui » : Moi = code (Claude Code), CD = Claude Design.

## Chantiers de code (ordre validé)

| # | Chantier | Décision | Qui | Statut |
|---|---|---|---|---|
| 1 | Q1 : à l'ouverture de l'app (tout onglet) : ajustement léger, génération des 4 semaines, rapprochement course ↔ séance prévue. Rien en arrière-plan, aucune notification. | Validé | Moi | fait (bb84c28) |
| 2 | Saisie à la main : « J'ai fait cette séance » (séance prévue ou à replacer), « Ajouter une séance réalisée » (historique Progression). Champs : date, type, distance, durée, FC moyenne facultative. Marqueur : `apple_type = "Manuel"` (affiché « Saisie à la main »). Avertissement si une course synchronisée existe déjà ce jour-là. Correction : supprimer puis ressaisir ; la suppression libère la séance prévue liée (décision 3). | Validé (décisions 1, 2, 3) | Moi | fait (e736df6) |
| 3 | Q2 : la course RunSync remplace la saisie à la main (même jour, même nature, durée à 15 % près), notation/notes/lien repris, message visible ; si doute : « Est-ce la même séance ? » | Validé | Moi | fait (df88f8f) |
| 4 | Q3 : carte de rattachement d'une sortie non prévue (course < 7 jours non liée ; jusqu'à 3 séances de course à ±3 jours ; Oui = faite + déplacée au jour réel ; Non = mémorisé sur l'appareil) + ligne d'explication sur « à replacer » (R5) | Validé (décisions 4, 5, 6) | Moi | fait (c123433) |
| 5 | Q4 : feuille « Tes nouvelles allures » (seuil 5 s/km sur l'allure facile ; Appliquer = séances de course à venir mises à jour ; passé intact) | Validé | Moi | en pause : après la phase 6 de CD et le traitement des décalages |
| 6 | Q5 : carte persistante « Ton objectif a changé » (Programme + Aujourd'hui), confirmation avec nombre de séances, feuille commune avec Q4, séances ajoutées à la main conservées | Validé | Moi | en pause : après la phase 6 de CD et le traitement des décalages |

## Réponses aux questions de CD (envoyées)

Q1 à Q5 : voir ci-dessus. Q6 : la série bleue = sorties longues (légende à ajouter ; le bleu est réservé au renfo dans le Bento, donc autre distinction). Q7 : volume « 4 dernières semaines ». Q8 : genre et ville retirés de Mon compte (ne servent à rien). Q9 : ordre d'Aujourd'hui = bandeau coach (une ligne par priorité) → séance du jour → carte « Hier » → Ta semaine. Q10 : avancement de l'objectif en haut de Progression + liste des records.

## Ruptures R1 à R9 (acceptées)

R1 formulaire de ressenti en feuille ; R2 idem pour Modifier ; R3 réglé (Q1) ; R4 réglé (Q2) ; R5 ligne d'explication ; R6 après une douleur ≥ 6 : « On te propose d'adapter ton programme → Voir » et « Revoir mon objectif » en feuille ; R7 réglé (Q4, Q5) ; R8 pastille → jour de Programme, jauge → Progression ; R9 « Pas encore reçue de RunSync » + « J'ai fait cette séance ».

## Retours 1 à 18 et phase 4 (acceptés)

Précisions : Progression garde l'ordre anneaux → indicateurs → chiffres clés → graphiques → historique (+ avancement de l'objectif, raccourci vers l'historique). Sur Aujourd'hui, la séance du jour garde sa barre de structure et ses exercices animés ; Modifier/Supprimer dans un menu « … ». Retour 7 (« IA ») déjà corrigé.

## Les 4 derniers points de CD (positions envoyées)

1. « Générer/Compléter cette semaine » reste tel quel (semaine vide ou partielle ; renvoie au Profil si objectif/disponibilités manquants).
2. Pas de « Supprimer » sur la carte d'une séance faite ; suppression d'une course dans l'historique de Progression, menu « … », avec confirmation, pour toutes les courses.
3. Une seule carte d'action sous la séance du jour : rattachement → Hier → objectif changé → Ton niveau. Les alertes de douleur forte s'affichent toujours.
4. Records : 5 km, 10 km, semi, marathon ; une course compte si sa distance est à 5 % près ; chronos de « Ton niveau » affichés à part, « déclaré », jamais célébrés.

## Décisions de saisie à la main (détail)

1 option A (champ existant) ; 2 avertissement seulement ; 3 supprimer/ressaisir ; 4 fenêtre ±3 jours ; 5 la séance prévue se déplace au jour réel (sauf séance incompatible) ; 6 « Non » mémorisé sur l'appareil ; 7 ordre des chantiers ci-dessus.

## Reporté après le nouveau design

Petits rectificatifs (liste des 33 remarques de CD, famille A) : formats de distance, axe d'efficience, lissage haute intensité, carte du corps, jargon, libellé « Dashboard », « Supprimer » en gris, types de séance, champ « Rappel » retiré.

## Restant

- CDC sections 6 à 9 (hébergement, risques, ambiguïtés, fonctions non documentées).
- Fichier `maquette-aujourdhui-d2.html` à fournir.
- Mettre à jour le CDC avec les ajouts ci-dessus à la fin.

## Nouveautés apparues dans le journal de CD (v7), à évaluer avant de les construire

Ces points n'étaient pas dans nos décisions : à présenter (état actuel / effort / risque) puis à valider.

| Point | Origine | Statut |
|---|---|---|
| Renfo : remplacer ou supprimer un exercice d'une séance (V1b, V1d), annulable 5 s ; ne change que la séance du jour | Journal v7, élément 2 | à évaluer |
| Renfo : feuille de détail d'un exercice avec Précédent / Suivant (V1c) | idem | à évaluer |
| Séance passée non reçue visible dans Programme (V3) : « Pas encore reçue d'Apple Santé » + « J'ai fait cette séance » (aujourd'hui les séances « à replacer » ne sont dans aucun jour du calendrier, seulement dans la bannière) | idem | à évaluer |
| Avertissement de doublon : lien « Voir la course synchronisée » (N1b) | idem | à évaluer |
| Vocabulaire : « Apple Santé » dans l'app, « RunSync » seulement dans l'étape « Connecte tes courses » (change R9 : « Pas encore reçue d'Apple Santé ») | idem | à confirmer avec Omar |
| N2 : séance la plus probable pré-cochée (boutons radio) ; N1 : ressenti ouvert juste après l'enregistrement (déjà le cas) | idem, points ouverts | recommandation : oui aux deux |
