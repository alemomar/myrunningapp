# Projets en attente

Idées et sujets mis de côté volontairement. Rien ici n'est dans le périmètre de la refonte en cours. On les reprend à la demande d'Omar.

## 1. Consulter l'app et ses statistiques hors ligne

- **Origine :** décision D68 (03/10/2026). Pour la refonte, on se limite à détecter la perte de connexion et à garder affiché ce qui est déjà chargé. Au démarrage sans réseau, l'app montre le bloc d'erreur avec « Réessayer ».
- **Le besoin :** pouvoir ouvrir l'app sans réseau et voir son programme, ses séances et ses statistiques (la dernière version connue).
- **Ce que ça demanderait :**
  - un service worker (l'app n'en a pas aujourd'hui) pour conserver les fichiers de l'app ;
  - une copie locale des dernières données (séances, programme, profil), mise à jour à chaque chargement réussi ;
  - une indication claire « données du … » quand l'affichage vient de la copie ;
  - une décision sur les modifications faites hors ligne (les refuser, ou les mettre en file d'attente et les rejouer au retour du réseau).
- **Effort estimé :** moyen à élevé (surtout les modifications hors ligne et la mise à jour de la copie).
- **Risques :** données périmées affichées sans que l'utilisateur le voie ; conflits si on accepte les modifications hors ligne ; cache d'une version ancienne de l'app après une mise à jour.
- **Statut :** en attente.

## 2. Mettre à jour les allures après une course officielle

- **Origine :** réserve notée à la décision D72.
- **Idée :** une course de type « Course » sur une distance standard est un vrai effort maximal. Elle pourrait proposer la feuille « Tes nouvelles allures » (« APRÈS TA COURSE »), comme un chrono déclaré.
- **Point de vigilance :** une course mal étiquetée donnerait des allures trop rapides.
- **Statut :** en attente.

## 3. Notes sur toutes les séances

- **Origine :** décision D47 (option 1 retenue : notes seulement sur les séances ajoutées à la main).
- **Idée :** colonne « notes » dédiée sur toutes les séances prévues, si des utilisateurs le demandent (un script SQL à exécuter).
- **Statut :** en attente de demande.

## 4. Reste du cahier des charges

- Revue des sections 6 à 9 (hébergement et sécurité, risques, ambiguïtés, fonctions non documentées).
- Mise à jour du cahier des charges avec les décisions du relooking.
- **Statut :** après la mise en ligne de la refonte.

## 5. Petits rectificatifs de la liste des 33 remarques de Claude Design

- Suivi dans `docs/decalages-design.md` et la mémoire de travail (corrections de formats, axes de graphiques, jargon, etc.). Une partie est absorbée par l'application du design.
- **Statut :** après l'application du design.
