# Roadmap MyRunningApp

Idées de fonctionnalités futures, priorisées. Chaque entrée : contexte rapide + pourquoi cette priorité. À compléter au fil de l'eau.

## P1 — Prochaines (valeur claire, scope déjà cadré)

### IA du Plan personnalisé
Croiser les données de l'onglet Objectifs et les check-ins douleur pour proposer un plan d'entraînement calendaire, avec des conseils spécifiques (exos pour diminuer les douleurs, améliorer la foulée, la vitesse, le cardio...).
Nécessite une nouvelle brique backend (appel LLM côté serveur, pas depuis le navigateur, pour ne pas exposer de clé API — probablement une Supabase Edge Function).

### Ouvrir l'app à des amis pour la tester
**(2026-09-09)** Remplace la décision du 5 sept ci-dessous (P3 "Hébergement public") — la question s'est reposée directement, à traiter maintenant plutôt qu'après validation MVP.

Deux blocages techniques distincts, indépendants l'un de l'autre :

1. **Dashboard web** — tourne aujourd'hui en local sur le Mac (IP LAN), inaccessible à quiconque hors du wifi. Fichier statique HTML/JS qui parle déjà à Supabase (cloud) : aucune logique serveur à héberger. Débloquable en ~15 min via GitHub Pages (le repo est déjà sur GitHub), Netlify, Vercel ou Cloudflare Pages — gratuit.
2. **App iOS (RunSync)** — installée uniquement via Xcode branché en direct, certificat gratuit expirant tous les 7 jours : impossible à distribuer tel quel. Nécessite un compte **Apple Developer Program (99$/an)** pour utiliser **TestFlight** : jusqu'à 100 testeurs internes (install immédiate, pas de review) ou 10 000 externes via lien public (1ère build de chaque version review par Apple, ~24-48h). C'est la seule dépense réellement nécessaire pour ouvrir les tests.

Le backend (Supabase) n'a rien à changer : RLS déjà vérifié multi-utilisateur, inscription déjà self-service, largement dans les limites du plan gratuit pour quelques amis.

**Décision à prendre** : payer les 99$/an Apple maintenant, ou tester d'abord le dashboard seul (sans l'app iOS, import manuel des données) le temps de valider l'intérêt avant la dépense.

### Retours de l'audit « Boussole débutant » (2026-09-09)
Commentaires laissés ligne par ligne sur [le tableau d'audit produit](https://claude.ai/code/artifact/ff1da862-eff8-4252-8601-6648e912a347) (37 fonctionnalités passées au crible de la mission débutants+amateurs). À traiter un par un. Groupés par zone :

**Dashboard**
- KPI Volume : vue de progression adaptative selon l'ancienneté du compte (2 premières sem. vs dernière sem. pour un nouvel utilisateur ; 3 premiers mois vs dernier mois après 6 mois) — établir des règles précises
- KPI Cardio : retirer "Seuil"
- Graph progression Fractionné : garder, même si absent du dashboard actuellement
- Graph progression allure EF : jugé le plus intéressant de l'app — ajouter un point rouge pour les courses officielles ; remplacer la courbe linéaire par une moyenne glissante, plus réaliste
- Carte "Dernière séance" : remonter tout en haut du dashboard, avec animation de célébration à l'ouverture, infos aussi complètes que l'onglet Séances, design à soigner

**Plan**
- Bannière douleur : renommer "Note ton ressenti" + ajouter d'autres critères (respiration, fatigue...)
- Check-in douleur rapide + Notation par séance : d'accord pour simplifier — brainstorm à faire ensemble sur la nouvelle version

**Objectifs**
- ~~Objectif principal : ajouter du dynamisme visuel (icônes animées)~~ **Fait (2026-09-11)**
- ~~Sous-bloc course : "je ne vois pas cette fonctionnalité" — vérifier si bug d'affichage~~ **Vérifié (2026-09-11)** : pas de bug, fonctionnait déjà correctement
- ~~Allure EF/Work visée : demander la période de mesure (semaine/mois/an) avant saisie, toujours donner un équivalent annuel~~ **Fait autrement (2026-09-11/12)** : Km/mois ↔ Km/an synchronisés automatiquement dans les deux sens ; pour la course, Temps visé ↔ Allure visée synchronisés pareil à partir de la distance choisie

**Séances**
- Graph FC moyenne : utilité questionnée — envisager plutôt un rapport allure/FC
- Répartition zones cardio : ajouter un bouton "i" explicatif, revoir le rendu visuel (pas très joli actuellement)
- Haute intensité (zones 4-5) : ajouter la courbe basse intensité (zones 1-3) sur le même graphique
- Polarisation : à retirer, fait doublon avec le graph des zones juste au-dessus
- Ligne de séance gérable : vérifier si les zones cardio remontent bien sur toutes les séances ; simplifier l'affichage (date/type/km, regroupement par mois, détail au clic)

**Mon compte**
- Avatar/profil : envisager de fusionner l'onglet Objectifs dans Mon compte (nouvelle rubrique "Objectif")
- FC max/repos/VO2max : retirer, donnée non utilisée ailleurs dans l'app

### Refonte Objectifs — parcours par type d'objectif (2026-09-12)
Vision complète transmise par Omar pour approfondir l'onglet Objectifs, au-delà des blocs conditionnels déjà en place (`OBJECTIF_BLOCKS`, "Ta situation actuelle"). Deux couches distinctes :

**A. Données à collecter — scope raisonnable, suit les patterns déjà en place**

- ~~Socle commun (avant même de choisir un objectif) : terrain habituel, équipement connecté (Apple Watch/Garmin/Whoop/Strava), volume actuel~~ **Fait (2026-09-12)** — carte "Ton profil coureur" en tête d'onglet. Âge/sexe/niveau volontairement pas dupliqués (déjà dans Mon compte / "Ton niveau actuel").
- ~~**Préparer une course** : type de course, date (semaines restantes calculées), objectif chrono vs "finisher", PB existant sur la distance, dénivelé/terrain de la course.~~ **Fait (2026-09-12)**
- ~~**Améliorer mon allure** : FC à l'allure cible, fréquence fractionné/tempo actuelle, VMA connue ou test à proposer.~~ **Fait (2026-09-12)** — allure EF de référence (calculée depuis l'historique) affichée aussi, en plus de la fréquence fractionné/tempo, FC cible et VMA.
- **Courir plus régulièrement** : créneaux/jours disponibles, principaux freins (motivation/météo/temps/fatigue), préférence de rappel.
- **Reprendre après une pause/blessure** : type d'interruption (blessure/maladie/indispo/sans raison — pas juste blessure), statut de la blessure (guérie/en rééducation/feu vert médical), niveau avant la pause, douleur actuelle au repos et à l'effort (au-delà de durée d'arrêt + zone déjà en place).
- **Rester en forme** : autres activités pratiquées, motivation principale (santé/sommeil/mental/poids), et une question franche : veut-il des objectifs chiffrés du tout, ou juste du suivi passif ?
- **Autre** : tags suggérés dynamiquement selon les mots tapés (perte de poids, prépa militaire/pompiers, défi perso, club/socialisation, gestion du stress) + question de clarification pour router vers la logique la plus proche des 5 objectifs ci-dessus plutôt que de créer un parcours à part.

**B. UX/animations — chaque item est un vrai chantier de design à part entière, à traiter un par un**

- Écran de synthèse animé "Voici ton profil de coureur" à la fin du socle commun (effet récompense avant la 1ère séance loggée).
- Préparer une course : jauge circulaire compte à rebours ("J-45") en widget d'accueil ; slider de temps cible avec feedback live ("ambitieux"/"réaliste"/"confortable" calculé depuis l'allure actuelle) ; timeline de plan façon route qui se remplit, paliers base/spécifique/affûtage qui se débloquent visuellement.
- Améliorer mon allure : compteur façon speedomètre qui se rapproche de l'objectif ; courbe objectif (pointillés) vs réel en "draw-in" animé ; jauge allure/FC avec pulsation cardiaque en fond ; micro-célébration au record d'allure battu.
- Courir plus régulièrement : streak façon Duolingo (flamme qui s'estompe plutôt qu'elle casse en cas de trou — évite la culpabilisation) ; heatmap calendrier façon GitHub ; "joker" animé pour protéger le streak une semaine en cas d'imprévu.
- Reprendre après une pause/blessure : palette visuelle apaisée, distincte du mode performance ; jauge de charge progressive (règle des 10%) ; body map interactive pointant la zone sensible avec suivi de la douleur dans le temps ; **masquer les comparaisons aux performances passées tant que ce mode est actif** (comparer à un pic de forme antérieur est démotivant).
- Rester en forme : dashboard allégé, indicateurs de bien-être (énergie/humeur/sommeil) plutôt que des courbes de perf ; roue du bien-être (radar chart) ; ton non compétitif dans les messages ("tu as bougé 3 fois cette semaine, bravo").
- Autre : chips de suggestion qui apparaissent dynamiquement en tapant, pour éviter l'effet page blanche.

**Décision (2026-09-12)** : on commence par le socle commun (fait), puis la couche A (données) objectif par objectif, avant de revenir sur la couche B (animations) — chaque animation mérite sa propre réflexion de design plutôt qu'être codée à la chaîne.

## P2 — Envisagées (valeur probable, scope à affiner)

### Objectifs de fréquence pour Yoga / Mobilité / Musculation
**(2026-09-10)** Se fixer un nombre de séances cible (ex: 2x/semaine Musculation, 1x/semaine Yoga) pour ces types déjà trackés via HealthKit, sur le même principe que les objectifs existants côté course à pied (onglet Objectifs). À creuser : période de mesure (semaine/mois), affichage de la progression (probablement un KPI adaptatif comme pour Allure EF/Fractionné), emplacement dans l'app (onglet Objectifs actuel, ou la nouvelle rubrique envisagée dans Mon compte — voir retours d'audit ci-dessus).

### Gamification
Rendre l'expérience plus engageante : badges, streaks, objectifs déblocables, etc. À définir : quels leviers de gamification correspondent à l'usage réel (pas de la gamification pour la gamification).

### Amis / comptes partagés
Pouvoir ajouter des amis qui ont aussi un compte MyRunningApp — voir leurs séances, se motiver mutuellement. Implique : système de demande d'ami, permissions de visibilité (tout / rien / résumé), et potentiellement un flux social (réactions, commentaires).

## P3 — Notées, pas creusées

### Hébergement public permanent du dashboard
Le dashboard tourne aujourd'hui en local (serveur Python sur le Mac, accessible via IP LAN/hotspot).
~~**Choix assumé (2026-09-05)** : reste en local tant que le MVP n'est pas validé — pas de volonté de le publier ou de le faire utiliser par d'autres personnes avant ça. À reconsidérer une fois le MVP validé.~~
**Reconsidéré (2026-09-09)** : voir "Ouvrir l'app à des amis pour la tester" en P1 — la question du MVP se pose plus tôt que prévu.

---
*Dernière mise à jour : 2026-09-12*
