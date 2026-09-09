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
- Objectif principal : ajouter du dynamisme visuel (icônes animées)
- Sous-bloc course : "je ne vois pas cette fonctionnalité" — vérifier si bug d'affichage
- Allure EF/Work visée : demander la période de mesure (semaine/mois/an) avant saisie, toujours donner un équivalent annuel

**Séances**
- Graph FC moyenne : utilité questionnée — envisager plutôt un rapport allure/FC
- Répartition zones cardio : ajouter un bouton "i" explicatif, revoir le rendu visuel (pas très joli actuellement)
- Haute intensité (zones 4-5) : ajouter la courbe basse intensité (zones 1-3) sur le même graphique
- Polarisation : à retirer, fait doublon avec le graph des zones juste au-dessus
- Ligne de séance gérable : vérifier si les zones cardio remontent bien sur toutes les séances ; simplifier l'affichage (date/type/km, regroupement par mois, détail au clic)

**Mon compte**
- Avatar/profil : envisager de fusionner l'onglet Objectifs dans Mon compte (nouvelle rubrique "Objectif")
- FC max/repos/VO2max : retirer, donnée non utilisée ailleurs dans l'app

## P2 — Envisagées (valeur probable, scope à affiner)

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
*Dernière mise à jour : 2026-09-09*
