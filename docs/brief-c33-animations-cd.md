# Brief à Claude Design : animations de célébration après une séance (C33, 19/10/2026 ; 10e animation « course officielle » ajoutée le même jour)

Texte à copier-coller dans la conversation avec Claude Design.

```text
Nouveau petit chantier pour MyRunningApp : des animations de célébration. Règle de travail inchangée : tu fournis l'habillage, Claude Code construit et branche dans l'app.

1 · Le contexte
Quand un coureur ouvre l'app et qu'une séance est arrivée depuis sa dernière visite (envoyée par sa montre via Apple Santé, ou saisie à la main), l'app la fête une seule fois : un bandeau en haut de l'écran pendant 4 secondes, avec quelques confettis, le titre « Bravo pour ta course ! » (ou « Bravo pour ta séance ! », ou « Bravo pour tes 3 courses ! ») et un message d'encouragement tiré de ses données. Toucher le bandeau ouvre la séance. Les vrais records gardent leur plein écran (ton petit bonhomme record-man).

2 · Ce qu'on te demande : 10 petites animations, une par type de message
1. Reprise après 10 jours ou plus sans courir : « Belle reprise ! Première sortie depuis 12 jours : le plus dur est fait. »
2. Objectif de km du mois atteint : « Objectif du mois atteint : 90 km ! »
3. Cap de km du mois franchi (50, 100, 150…) : « 100 km ce mois-ci : cap franchi ! »
4. Plusieurs semaines d'affilée avec au moins une course : « 5 semaines d'affilée avec au moins une course : la régularité paie. »
5. 2e, 3e… course de la semaine : « 3e sortie de la semaine : tu tiens ton rythme. »
6. Plus longue sortie du mois : « Ta plus longue sortie du mois : 13 km. »
7. Endurance (EF, sortie longue) : « Une EF tranquille : c'est elle qui construit ton endurance. »
8. Vitesse (fractionné, tempo) : « C'est comme ça qu'on gagne en vitesse. »
9. Renfo, mobilité, yoga : « Le renfo protège tes articulations. »
10. Course officielle : « Une course officielle de 20 km, jusqu'au bout : bravo ! »
Chaque animation illustre son message par un geste simple et lisible d'un coup d'œil. Quelques idées, libre à toi : une silhouette qui redémarre, un anneau qui se ferme, un compteur qui passe un cap, des pastilles de semaines qui s'allument une à une, une trace qui s'allonge. Le ton : positif et sobre, dans l'esprit du petit bonhomme du record, jamais enfantin. Les nombres (12 jours, 90 km, 5 semaines, 3e…) changent d'un coureur à l'autre : si une animation montre un chiffre, il doit pouvoir être passé en paramètre.

3 · Les contraintes
- Taille : elles vivent dans le bandeau, à gauche du texte, dans un carré d'environ 56 × 56 px ; elles doivent rester lisibles à 48 px.
- Durée : environ 2 secondes, jouées une fois, puis une image finale fixe.
- Couleurs de l'app, sur fond sombre (#17191C) : citron #C6F432 (progrès), blanc #F2F3F0, gris #8B8F96. Le violet oklch(0.72 0.17 300) est réservé à l'attention : pas ici. Jamais de rouge.
- « Réduire les animations » (prefers-reduced-motion) : afficher directement l'image finale.
- Léger : dessin vectoriel animé (SVG avec CSS ou JavaScript), sans vidéo, sans GIF, sans bibliothèque externe ; les 10 ensemble en moins de 30 Ko.
- Livraison, comme record-man.js : un seul fichier JavaScript qui définit un élément, par exemple <mra-cheer kind="reprise" value="12" once aria-label="…"></mra-cheer>, avec kind parmi : reprise, objectif, cap, serie, semaine, plus-longue, endurance, vitesse, renfo, course.
- Accessibilité : rôle « image » et libellé lu par le lecteur d'écran (attribut aria-label) ; le dessin lui-même est masqué aux lecteurs d'écran.

4 · Le bandeau (facultatif)
Le format est choisi : un bandeau en haut, 4 secondes, quelques confettis. Si tu as une proposition d'habillage (taille, arrondis, place du titre et du message, arrivée et départ du bandeau, confettis), montre-la avec deux ou trois des messages ci-dessus. Sinon, Claude Code le fait dans le style actuel de l'app.

5 · Ce qu'on attend en retour
Le fichier JavaScript des 10 animations, une page de démonstration qui les montre toutes (à 56 px et en grand), et, si tu le proposes, la maquette du bandeau.
```
