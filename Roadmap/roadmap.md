# Roadmap MyRunningApp

Idées de fonctionnalités futures, priorisées. Chaque entrée : contexte rapide + pourquoi cette priorité. À compléter au fil de l'eau.

## P1 — Prochaines (valeur claire, scope déjà cadré)

### IA du Plan personnalisé
Croiser les données de l'onglet Objectifs et les check-ins douleur pour proposer un plan d'entraînement calendaire, avec des conseils spécifiques (exos pour diminuer les douleurs, améliorer la foulée, la vitesse, le cardio...).
Nécessite une nouvelle brique backend (appel LLM côté serveur, pas depuis le navigateur, pour ne pas exposer de clé API — probablement une Supabase Edge Function).

## P2 — Envisagées (valeur probable, scope à affiner)

### Gamification
Rendre l'expérience plus engageante : badges, streaks, objectifs déblocables, etc. À définir : quels leviers de gamification correspondent à l'usage réel (pas de la gamification pour la gamification).

### Amis / comptes partagés
Pouvoir ajouter des amis qui ont aussi un compte MyRunningApp — voir leurs séances, se motiver mutuellement. Implique : système de demande d'ami, permissions de visibilité (tout / rien / résumé), et potentiellement un flux social (réactions, commentaires).

## P3 — Notées, pas creusées

### Hébergement public permanent du dashboard
Le dashboard tourne aujourd'hui en local (serveur Python sur le Mac, accessible via IP LAN/hotspot).
**Choix assumé (2026-09-05)** : reste en local tant que le MVP n'est pas validé — pas de volonté de le publier ou de le faire utiliser par d'autres personnes avant ça. À reconsidérer une fois le MVP validé.

---
*Dernière mise à jour : 2026-09-05*
