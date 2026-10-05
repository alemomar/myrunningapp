# MyRunningApp — logo (version 8d, validée le 4 oct. 2026)

## L'idée
Deux foulées. La première, blanche, est dessinée comme une piste d'athlétisme à 2 couloirs : le programme préparé pour toi. La seconde, citron et pleine, avance devant elle et la chevauche : toi qui progresses.

## Fichiers
Chaque fichier existe en SVG (vectoriel, à privilégier). La plupart ont aussi une version PNG transparente.

| Dossier | Contenu | Usage |
|---|---|---|
| `icone-app/` | `icone-app.svg` (coins arrondis), `icone-app-ios-carre.svg` + `-1024.png` (carré plein) ; PNG 1024 / 512 / 180 / 120 / 32 | App Store et Xcode : **carré plein 1024**, iOS arrondit lui-même les coins. Favicon : 32 et 180. |
| `symbole/` | Les deux foulées seules : `couleur`, `blanc`, `noir` | Écran de démarrage, en-tête d'écran, réseaux sociaux |
| `logo-horizontal/` | Symbole + nom sur une ligne | En-têtes, emails, site |
| `logo-vertical/` | Symbole au-dessus du nom | Écran de bienvenue, affiches |
| `nom/` | « MyRunningApp » seul | Quand le symbole est déjà visible à côté |
| `apercu.png` | Planche de toutes les versions | Référence visuelle |

## Couleurs
- Citron `#C6F432` : foulée pleine, et « Running » dans le nom.
- Blanc `#F2F3F0` : piste, « My » et « App ».
- Fond de l'icône `#17191C` (surface). Fond de l'app `#0C0D0F`.
- Version **couleur** : uniquement sur fond sombre (`#0C0D0F` ou `#17191C`).
- Version **blanc** : sur photo ou sur un fond foncé autre que la marque.
- Version **noir** (`#0C0D0F`) : sur fond clair ou sur fond citron. Ne jamais poser la version couleur sur fond clair : la foulée citron disparaîtrait.

## Construction (grille 100 × 100 de l'icône)
- Piste : 2 contours en stade, trait de 3,2. Contour extérieur de 27 × 44 et contour intérieur de 15 × 32 (dimensions mesurées à l'extérieur du trait). Les deux sont centrés en (40, 57) et inclinés de −18°.
- Foulée : une pilule pleine de 19 × 33 centrée en (61,5 ; 41,5), inclinée de −18°.
- La foulée découpe la piste avec une **marge vide de 5** autour d'elle. Dans les SVG transparents, cette marge est un masque, pas un trait de couleur : le logo marche sur tous les fonds.
- Nom : Barlow Condensed Bold, **converti en tracés** (aucune police à charger).

## Règles d'usage
- Zone de protection autour du logo : au moins la largeur de la foulée citron.
- Taille minimale : symbole à 20 px de haut, logo horizontal à 100 px de large.
- Ne pas déformer, tourner, ajouter d'ombre, changer les couleurs ni séparer les deux foulées.
