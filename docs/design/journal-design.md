# MyRunningApp — Journal du design (phase 6)

- **Dernière mise à jour :** 3 octobre 2026
- **Version :** 48
- **Éléments validés :** 18 sur 18
- **Revue Claude Code (v45) :** amendements A1 à A15 intégrés. Nouveaux écrans dessinés (A1 refus, A2 carte de célébration simple, A9 types, A10 chrono). Récup en gris perle (R2).
- **Fichier de maquettes :** `Phase 6 - Design.dc.html` (iPhone 390 px, toutes les options proposées restent visibles)
- **Référence de style :** Design « Bento commenté » (3a), dans `Directions Running.dc.html#3a`

Ce journal suffit pour appliquer le design. Il ne touche pas aux textes de l'application : il décrit seulement l'habillage (couleurs, typo, formes, états, animations). Les phrases citées servent d'exemple ou viennent de décisions validées.

---

## 0. Règle de couleur (validée le 2 oct., s'applique à toute l'app)

> **Note du 2 oct. :** l'ambre `oklch(0.8 0.15 70)` est remplacé par le violet `oklch(0.72 0.17 300)` dans toute l'app (décision d'Omar). Les spécifications de ce journal sont à jour en violet. Les éléments 1 à 6 avaient été validés avec l'ambre : seule la couleur change.

- **Citron `#C6F432`** : l'action principale (bouton principal, onglet actif), le type EF et le côté « facile » dans les données, les progrès. Rien d'autre.
- **Blanc `#F2F3F0`** : réglages et sélections (curseurs, choix 1 à 5, Oui / Non, Avant / Pendant / Après, période active).
- **Violet `oklch(0.72 0.17 300)`** : l'attention, en remplacement de l'ambre (décision d'Omar). Il sert pour « à replacer », le volume trop élevé, la charge au-dessus, les bannières et alertes, le point sur Programme, une douleur de 6 ou plus. Texte sur violet : `#0C0D0F`. Fonds teintés : violet à 10 %, liseré à 40 %.
- **Douleur de 1 à 5** : blanc, avec une opacité de 35 % à 100 % selon l'intensité. De 6 à 10 : violet.
- Le type Kiné passe en rose, avec Mobilité, Yoga et Pilates.

---

## 1. Statut des éléments

| # | Élément | Statut |
|---|---|---|
| 1 | Menu du bas | Validé (1b + point violet) |
| 2 | Carte de séance + variantes | Validé (2d + V1 à V7) |
| 3 | « Ta semaine » + pastilles | Validé (3c) |
| 4 | Jauge de charge | Validé (4c) |
| 5 | Anneaux, indicateurs, chiffres clés (avec avancement objectif et records) | Validé (5d) |
| 6 | Chaque type de graphique | Validé (6c + 6e à 6h) |
| 7 | Historique, formulaire de ressenti, carte du corps | Validé (7a + 7g) |
| 8 | Calendrier semaine et mois | Validé (8a + 8b + gestes et formulaires) |
| 9 | Bannières et alertes | Validé (9a + étape 2) |
| 10 | Célébration | Validé (10b + 10b-4) |
| 11 | Parcours de démarrage | Validé (11b + guide) |
| 12 | Formulaires du Profil (avec « Ton niveau », formulaire chrono) | Validé (12b) |
| 13 | États vide, chargement, erreur | Validé (13a + 13c) |
| N1 | Saisie à la main (« J'ai fait cette séance » / « Ajouter une séance réalisée ») | Validé |
| N2 | Carte de rattachement d'une sortie non prévue | Validé |
| N3 | Feuille « Tes nouvelles allures » / « Mettre à jour ton programme » | Validé |
| N4 | Carte « Ton objectif a changé » | Validé |
| N5 | Message de fusion « On a remplacé ta saisie… » + « Est-ce la même séance ? » | Validé |
| R | Amendements de la revue (A1 à A15, partie 2b) | Intégrés ; écrans A1, A2, A9, A10 à valider |

---

## 2. Éléments validés

### 1. Menu du bas — VALIDÉ (version 3)

**Décision finale :** option 1b, « actif avec libellé », avec un point violet sur Programme. C'est une pilule flottante à 4 onglets. L'onglet actif s'étire en pilule citron et affiche son nom.

**Ce qui vient de la 3a :** la pilule flottante, le fond sombre translucide, les icônes seules pour les onglets inactifs, l'onglet actif sur fond citron.
**Ce que j'ai ajouté :** le nom de l'onglet actif dans la pilule citron, le point violet d'alerte, le flou d'arrière-plan, un fin liseré, la hauteur fixe des cibles.

**Structure**
- Ordre fixe : Aujourd'hui (icône Lucide `sun`), Programme (`calendar`), Progression (`chart-no-axes-column`), Profil (`user`).
- Conteneur : position fixe, 20 px à gauche et à droite, 30 px du bas (au-dessus de l'indicateur d'accueil iOS ; ajouter `env(safe-area-inset-bottom)` si besoin). Hauteur 64 px, arrondi 32 px, marge intérieure 0 9 px, `justify-content: space-between`.
- Onglet inactif : zone de 52 × 46 px, icône seule centrée.
- Onglet actif : pilule de 46 px de haut, marge intérieure 0 16 px 0 13 px, arrondi 23 px, icône et nom séparés de 8 px. Le nom le plus long, « Progression », tient sur 350 px de large.

**Jetons**
| Rôle | Valeur |
|---|---|
| Fond | `rgba(30,33,37,.88)` + `backdrop-filter: blur(16px)` |
| Liseré | 1 px `rgba(255,255,255,.06)` |
| Icône inactive | `#8B8F96`, 22 px |
| Fond actif | `#C6F432` |
| Contenu actif | `#0C0D0F`, Barlow 600 15 px |
| Hauteur / arrondi | 64 px / 32 px |
| Marges | 20 px sur les côtés, 30 px en bas |
| Point d'alerte | 8 px, `oklch(0.72 0.17 300)`, contour 2 px `#1E2125`, en haut à droite de l'icône Programme |
| Marge basse des pages | 110 px (pour que le contenu ne passe pas sous le menu) |

**États**
- Par défaut : un seul onglet actif.
- Toucher : on change d'onglet. Toucher l'onglet déjà actif remonte en haut de la page.
- Feuille ouverte (ressenti, saisie, chrono…) : la feuille passe au-dessus du menu.
- Alerte : point violet sur Programme tant qu'une bannière sérieuse y attend (douleur, charge très haute, séance non faite). Il disparaît dès que la bannière est traitée (choix fait ou « Ignorer »). Il s'affiche aussi quand Programme est l'onglet actif ; il est alors posé sur la pilule citron. Ce n'est pas une notification.
- Pas d'état vide, de chargement ou d'erreur propre au menu : il reste toujours affiché et utilisable.

**Animations**
- Changement d'onglet : la pilule citron glisse et s'étire vers le nouvel onglet en 220 ms (`cubic-bezier(.2,.8,.2,1)`), et le nom apparaît en fondu en 120 ms.
- Avec « réduire les animations » : le changement est immédiat, sans glissement ni fondu.

**Accessibilité**
- Contraste : `#0C0D0F` sur `#C6F432` ≈ 15:1. L'icône inactive `#8B8F96` sur le fond du menu ≈ 5:1.
- Cibles tactiles : au moins 46 px de haut et 52 px de large.
- Le point violet n'est pas le seul signal : l'`aria-label` devient « Programme, 1 point à voir ».
- Lecteurs d'écran : `role="tablist"`, chaque onglet en `role="tab"` avec `aria-label` (le nom de l'onglet) et `aria-selected` pour l'actif.

**Options écartées**
- 1a, icônes seules : demande d'apprendre les icônes, ce qui est trop pour des débutants.
- 1c, tous les libellés : la plus claire, mais elle perd la forme de pilule de la 3a et prend plus de hauteur.

**Points ouverts**
- Aucun.

### 2. Carte de séance — VALIDÉ (version 7)

- **Forme validée : 2d**, un mix de 2a et 2b (2 oct.). L'en-tête tient sur 2 lignes. La 1re ligne porte une icône de 32 px dans une case arrondie à 10 px, sur fond teinté du type, le sur-titre en 11 px, espacé de 0,14 em, en `#8B8F96`, et « … » en cible de 36 px. La 2e ligne porte le titre seul, en Barlow Condensed 700, 23 px, interligne 1,15, en majuscules. Viennent ensuite un grand chiffre (Barlow Condensed 700, 40-44 px) et 2 tuiles (fond `#0F1113`, arrondi 14 px, libellé en 11 px, valeur en Condensed 22-24 px). Puis la barre de structure (14 px de haut, marche `#3A4047`, course citron, écart de 2 px), la ligne du coach (icône sparkles citron, 14 px, `#C9CCD0`), le déroulé et « En savoir plus ». La carte a un fond `#17191C`, un arrondi de 22 px, une marge intérieure de 18 px 16 px 16 px et un écart de 14 px.
- **Écartées :** 2a, la tuile bento (pas de repère visuel pour le type) ; 2b, les chiffres en tuiles (encadré du coach trop lourd) ; 2c, la frise (moins fidèle à la 3a). Omar a demandé un mix de 2a et 2b, puis un en-tête plus aéré : le doublon « Marche/course » du sur-titre a été retiré.
- **Variantes, version 2 (à valider), d'après les retours d'Omar :**
  - V1, renfo du jour : 7 exercices animés (vignette de 56 px, fond `#0F1113`, arrondi 12 px), un « ⋮ » par exercice. Omar l'aime.
  - V1a, plusieurs matériels : la tuile affiche « 2 objets », avec des pastilles en dessous (30 px, icône bleu renfo).
  - V1b, « ⋮ » d'un exercice : Remplacer, ou Supprimer de la séance (en gris, annulable pendant 5 s).
  - V1c, détail d'un exercice, en feuille : animation de 200 px, zone travaillée, séries, matériel, consignes, variante sans matériel, Remplacer et Supprimer, Précédent et Suivant.
  - V1d, remplacer un exercice : la feuille propose les exercices de la même zone, avec un bouton « Choisir ».
  - V7, « … » d'une séance prévue : J'ai fait cette séance, Modifier la séance, Supprimer la séance (en gris).
  - V2, séance faite reçue d'Apple Santé (Omar : en réduire/déployer) : la ligne « Détail cardio » (44 px) est repliée par défaut. Déployée, elle montre la carte complète, avec FC moyenne et maximale, la courbe cardiaque (corail, et la limite EF de 151 bpm en pointillés cyan) et le temps par zone (Z1 gris, Z2 cyan, Z3 citron, Z4 violet, Z5 corail).
  - V4, séance saisie à la main : FC moyenne si elle a été saisie, ni courbe ni zones, étiquette « Saisie à la main ».
  - V3, séance passée pas encore reçue : « Pas encore reçue d'Apple Santé » en violet, et le bouton « J'ai fait cette séance » (contour citron).
  - V5, un autre jour dans Programme (décision d'Omar) : une petite carte (icône de 36 px, date, « Long · 13 km », chevron, arrondi 18 px). La toucher ouvre la carte complète en feuille, sur le même modèle qu'Aujourd'hui.
  - V6, deux séances le même jour : deux cartes complètes l'une sous l'autre, la course toujours en premier.
- **Vocabulaire :** la séance s'appelle « EF », avec le sous-titre « endurance, à allure facile ». La source des courses s'appelle « Apple Santé », pas « RunSync ».
- **Décisions finales :** un exercice supprimé ou remplacé ne change que la séance du jour, les prochains renfos le gardent. Barre de structure : marche et récupération en `#3A4047`, course EF en citron `#C6F432`, effort du fractionné en terre battue `oklch(0.62 0.13 45)` (≈ #B8653F). Sur une séance faite, on garde le « prévu » en petit sous le réel.
- **États :** prévue (V1, V6) ; faite reçue d'Apple Santé (V2, avec « Détail cardio » replié ou déployé) ; faite par saisie à la main (V4) ; passée non reçue (V3) ; petite carte de Programme (V5) ; menu ouvert (V7, V1b). Le chargement et l'erreur viendront à l'élément 13.
- **Animations :** les exercices sont des SVG animés en boucle. Le dépliage de « Détail cardio » et de « En savoir plus » se fait en 200 ms (`ease-out`). La feuille monte en 280 ms. Avec « réduire les animations », les SVG restent figés sur leur 1re image, et le dépliage comme la feuille s'affichent sans transition.
- **Accessibilité :** texte `#F2F3F0` sur `#17191C` ≈ 15:1, texte secondaire `#8B8F96` ≈ 5,6:1, citron sur `#17191C` ≈ 13:1. Cibles : « … » et « ⋮ » 36 px, avec une zone de toucher étendue à 44 px ; ligne d'exercice ≥ 72 px ; boutons 40 à 48 px. Chaque animation a un texte alternatif (le nom de l'exercice). La couleur n'est jamais le seul signal : il y a toujours une légende texte sous la barre.
- **Points ouverts :** aucun.

### N1 Saisie à la main et N2 Rattachement — VALIDÉS (version 8)

- **N1a, « J'ai fait cette séance » :** feuille avec la séance prévue liée, pré-remplie (date, type), distance, durée, FC moyenne facultative. Le ressenti se remplit dans la même feuille, pendant la saisie (décision d'Omar) : difficulté perçue sur un curseur de 0 à 10, « Une gêne ou une douleur ? » Oui / Non. Bouton citron « Enregistrer ». Note : étiquette « Saisie à la main », pour corriger on supprime puis on ressaisit.
- **N1b, « Ajouter une séance réalisée » :** même feuille, sans pré-remplissage. Si une course existe déjà ce jour-là, avertissement violet (fond à 10 %, liseré à 40 %), qui ne bloque pas. Boutons « Enregistrer quand même » et « Voir la course synchronisée ».
- **N2, rattachement :** carte sur Aujourd'hui avec la sortie (3 tuiles), jusqu'à 3 séances proposées (lignes de 56 px avec bouton radio, la plus probable pré-cochée), puis « Oui, c'est celle-là » (citron) et « Non, c'était une sortie en plus » (sans fond).
- **Jetons des champs :** hauteur 48 px, fond `#0F1113`, liseré `#2A2E33`, arrondi 14 px, texte 16 px, libellé 12,5 px `#C9CCD0`. Bouton principal citron, 48 px, arrondi 24 px.
- **« Une gêne ou une douleur ? » = Oui (précision pour Claude Code) :** la carte du corps se déplie dans la même feuille, sous la question, avec la même carte que le formulaire de ressenti de l'historique. Son design sera fixé à l'élément 7, et la feuille de saisie le reprendra tel quel. Avec « Non » ou sans réponse, rien ne s'ajoute. Après l'enregistrement d'une douleur ≥ 6 : « On te propose d'adapter ton programme → Voir » (R6).
- **Décisions :** la séance la plus probable est pré-cochée sur N2. La teinte terre battue `oklch(0.62 0.13 45)` est validée.
- **États :** formulaire vide, pré-rempli (N1a), avec avertissement de doublon (N1b). Erreur de champ : à l'élément 13.
- **Accessibilité :** champs et pastilles de 44 à 48 px ; l'avertissement de doublon a une icône en plus de la couleur.
- **Points ouverts :** aucun.

### 3. Ta semaine et pastilles — VALIDÉ (version 11)

- **Choix : 3c, tuiles avec icône** (2 oct.). Tuile de 40 × 44 px, arrondi 12 px, icône Lucide du type en 18 px. Fait : fond de la couleur du type, icône `#0C0D0F`. Prévu : fond `#0F1113`, contour de 1,5 px et icône de la couleur du type. À replacer : contour en pointillés violet et pastille « ! » violet de 16 px en haut à gauche. Repos : simple contour en pointillés `#2A2E33`.
- **Aujourd'hui :** un halo blanc autour de la lettre du jour, pas de la tuile (demande d'Omar). Cercle de 26 px, `box-shadow: 0 0 0 1.5px #F2F3F0`, lettre en gras `#F2F3F0`. Les autres lettres font 26 px de haut pour rester alignées.
- **2e séance :** une pastille « + » de 17 px en haut à droite de la tuile (demande d'Omar, à la place du point dessous). Elle suit la même logique que les tuiles (décision d'Omar) : couleur du type de la 2e séance, pleine si la séance est faite (« + » en `#0C0D0F`), en contour de 1,5 px sur fond `#0F1113` (« + » de la couleur du type) si elle est prévue.
- **Ligne R5 sous la semaine :** pastille « ! » violet + phrase. Textes (A7, v45) : une séance « Ta séance de jeudi n'a pas pu se faire, tu peux la replacer. » ; plusieurs « 2 séances n'ont pas pu se faire cette semaine, tu peux les replacer. » ; une à replacer + une sortie comptée « Ta sortie de samedi est bien comptée. La séance de vendredi reste à replacer. »
- **Carte :** les chiffres de la semaine restent en haut (Barlow Condensed 30 px). Sous chaque chiffre, son libellé (12,5 px, `#C9CCD0`), puis la comparaison « sem. dernière : 36,2 km » (11,5 px, `#8B8F96`), toutes deux conservées. Ordre de la carte : chiffres → tuiles des jours → légende → ligne de synthèse → ligne de charge.
- **Phrase de synthèse de la semaine (précision pour Claude Code) :** conservée, en une seule ligne du coach (icône sparkles citron, 14 px, `#C9CCD0`) entre la légende et la ligne de charge. S'il y a une séance à replacer, la ligne R5 (pastille « ! » violet) prend cette place et la phrase de synthèse ne s'affiche pas : jamais deux messages à la suite. Textes : ceux de l'app. Écart entre les blocs de 22 px (demande d'Omar). La légende reste visible. La charge tient sur une ligne avec un chevron, et ouvre les indicateurs.
- **Couleurs par type (proposition) :** EF citron `#C6F432`, Long menthe `oklch(0.8 0.12 160)`, Seuil sable `oklch(0.74 0.11 80)`, Fractionné terre battue `oklch(0.62 0.13 45)`, **Course rouge `oklch(0.62 0.22 25)`** (choix d'Omar), Renfo bleu `oklch(0.72 0.14 250)`, Mobilité, Yoga et Pilates rose `oklch(0.75 0.13 330)`, Kiné rose `oklch(0.75 0.13 330)` (avec Mobilité, Yoga, Pilates, pour ne pas confondre avec le violet d'attention), Autre gris `#8B8F96`.
- **Écartées :** 3a, les ronds (le type ne se lit qu'à la couleur) ; 3b, les barres (moins lisibles en 7 colonnes).
- **Rouge Course et corail FC :** on garde les deux, ils n'apparaissent jamais côte à côte.
- **États :** fait, prévu, à replacer, repos, aujourd'hui, 2e séance faite ou prévue. Semaine vide : à l'élément 13.
- **Animations :** au chargement, les tuiles apparaissent en fondu et légère montée, de gauche à droite (30 ms d'écart, 200 ms chacune). Avec « réduire les animations », elles s'affichent sans transition.
- **Accessibilité :** toute la colonne du jour est une cible (≈ 48 × 70 px). Chaque jour a un `aria-label` (ex. « Vendredi, aujourd'hui, EF prévue, 2e séance yoga faite »). Le statut est donné par la forme (plein, contour, pointillés, « ! ») et pas seulement par la couleur.
- **Points ouverts :** aucun.

### 4. Jauge de charge — VALIDÉ (version 13)

- **Choix : 4c, barre + 8 semaines** (2 oct.). Sur-titre « CHARGE D'ENTRAÎNEMENT » avec « i » (feuille « La charge d'entraînement », texte en partie 2b, A7), puis le libellé de la zone (Barlow Condensed 28 px, en majuscules, couleur de la zone) et le **chiffre de charge à droite** (28 px, `#F2F3F0`, virgule, 2 décimales : décision d'Omar). Barre de 8 px. Repère blanc de 4 px avec un liseré de la couleur de fond. Courbe de 8 semaines (80 px de haut, trait blanc de 2 px) avec la bande de la zone idéale (citron à 8 %, bords en pointillés) et le point final de la couleur de la zone. Ligne du coach en dessous.
- **Échelle commune** à la barre et à la courbe : 0,50 à 1,80. En dessous : < 0,80, gris `#5A6068`. Idéale : de 0,80 à 1,30, citron. Au-dessus : > 1,30, violet `oklch(0.72 0.17 300)` (validé). La barre et la courbe utilisent les mêmes seuils : le décalage repéré par Omar venait de la maquette.
- **États :** en dessous, idéale, au-dessus, pas encore assez d'historique (barre grise à 35 %, texte de l'app). Version courte sur Aujourd'hui : ligne de 52 px « Charge d'entraînement · [zone] · 1,08 › », qui ouvre la jauge.
- **Écartées :** 4a, la barre seule (pas de tendance) ; 4b, le cadran (trop haut).
- **Où :** la carte 4c complète est dans Progression > Tes indicateurs. Sur Aujourd'hui, seule la ligne courte apparaît dans la carte « Ta semaine », avec le chiffre (retour n° 5 de la phase 5).
- **Seuils :** reprendre ceux du code. 0,80 et 1,30 sont des valeurs de maquette, et l'échelle de 0,50 à 1,80 s'adapte aux seuils réels.
- **Animations :** le repère glisse de gauche jusqu'à sa valeur et la courbe se trace de gauche à droite (600 ms, `ease-out`). Avec « réduire les animations », tout s'affiche directement à sa place finale.
- **Accessibilité :** la zone est dite par le libellé (texte), pas seulement par la couleur. Le libellé et le chiffre sont lus ensemble (`aria-label` « Charge d'entraînement : dans la zone idéale, 1,08 »). L'violet et le citron sur `#17191C` dépassent 9:1.
- **Points ouverts :** aucun.

### 5. Anneaux, indicateurs, chiffres clés — VALIDÉ (version 15)

**Décision finale :** 5d, la structure en tuiles de 5a avec la carte objectif + anneaux de 5b.

**Ordre en haut de Progression :** titre « PROGRESSION » + bouton « Historique › » (36 px, fond `#22252A`, arrondi 18 px), puis la carte objectif + anneaux, puis « Tes indicateurs » (grille 2 × 2), puis « Chiffres clés » (grille 2 × 2), puis « Tes records ».

**Carte objectif + anneaux** (fond `#17191C`, arrondi 22 px, marge intérieure 16 px)
- Sur-titre « OBJECTIF PRINCIPAL » + étiquette « Principal » (22 px, contour citron 1 px, texte citron 11 px 600).
- Nom de l'objectif en Barlow Condensed 24 px, en majuscules.
- Barre d'avancement de 8 px (fond `#26292E`, remplissage citron), avec « Semaine X sur Y » à gauche et « J-N » à droite (12 px, `#8B8F96`). Libellé validé par Omar.
- Séparateur de 1 px, puis 2 anneaux de 52 px (trait de 6 px, piste `#26292E`) : km du mois en citron, séances du mois en cyan `oklch(0.85 0.13 200)`. À droite de chaque anneau : valeur (Condensed 20 px) et « sur 90 · ce mois » (11,5 px).
- Pas d'objectif km ou séances : l'anneau ne s'affiche pas. Pas d'objectif principal : la carte est vide (élément 13).
- **Selon le type d'objectif** (précision pour Claude Code). La carte et les anneaux gardent la même structure, seule la ligne d'avancement change.
  - *Préparer une course* : barre d'avancement de 8 px, « Semaine X sur Y » (X = semaine du programme depuis son début, Y = nombre de semaines jusqu'à la course) et « J-N ».
  - *Améliorer mon allure* : pas de barre. À la place, l'allure EF de départ → l'allure EF des 4 dernières semaines (Condensed 20 px, l'allure actuelle en citron, ex. « 6'08" → 5'52" »), puis « Semaine X du programme · depuis le 3 août » (12 px, `#8B8F96`).
  - *Courir plus régulièrement* : pas de barre. À la place, 8 petites pastilles (une par semaine, les 8 dernières), pleines en citron si la semaine a au moins une course, en contour sinon, puis « 8 semaines d'affilée » et « Semaine X du programme ».
  - *Rester en forme* : même affichage que *Courir plus régulièrement* (8 pastilles + « N semaines d'affilée » + « Semaine X du programme »), décision d'Omar : « même esprit ».
  - Dans tous les cas sans date : pas de « J-N ».
  - Maquettes 5e à 5h validées le 2 oct. Bloc d'avancement d'environ 40 px de haut dans les 4 cas, pour que la carte garde la même hauteur.

**Tuiles d'indicateur** (fond `#17191C`, arrondi 20 px, marge intérieure 14 px, écart de 10 px) : sur-titre 11 px, valeur en Condensed 26 px, ligne du coach (sparkles citron, 12,5 px). Efficience cardiaque, Régularité, Volume (« 4 dernières semaines »), Charge (libellé de zone en couleur + chiffre + mini-barre de 6 px, ouvre la jauge 4c). Toucher une tuile ouvre son graphique (élément 6).

**Chiffres clés** (arrondi 18 px, marge intérieure 12 px 14 px, valeur en Condensed 24 px) : distance annuelle, plus longue sortie (ce mois), temps de course (ce mois), meilleure allure EF.

**Tes records :** lignes de 44 px pour 5 km, 10 km, semi et marathon. Règle de calcul (Claude Code, sans effet sur le design) : une course compte si sa distance est comprise entre la distance du record et cette distance + 5 % (une course de 9,5 km ne compte pas pour le 10 km). Le temps est ramené à la distance exacte, au prorata. Un record pas encore couru s'affiche « — · pas encore couru » (validé). Les chronos déclarés ont leur propre bloc « DÉCLARÉ DANS « TON NIVEAU » », en gris, jamais célébrés. Meilleure allure fractionné en dessous.

**Animations :** les anneaux et la barre se remplissent en 800 ms (`ease-out`) au premier affichage. Avec « réduire les animations », ils sont remplis d'emblée.
**Accessibilité :** chaque anneau a un `aria-label` (« Km ce mois : 8 sur 90 »). Les tuiles font plus de 44 px de haut. Le texte respecte les contrastes de l'élément 2.
**Options écartées :** 5a (anneaux séparés de l'objectif), 5b (indicateurs en liste, moins bento), 5c (anneaux concentriques, trop denses).
**Points ouverts :** aucun.

### 6. Graphiques — VALIDÉ (version 22)

- **Style retenu : 6c, interactif** (2 oct.), testé sur la courbe d'allure EF.
  - En-tête : le sur-titre à gauche, la progression à droite (Barlow Condensed 26 px, citron, ex. « −16 S/KM »), avec en dessous « depuis juin » (11,5 px, `#8B8F96`). Elle suit la période choisie (demande d'Omar). Calcul : moyenne des 4 premières semaines de la période → moyenne des 4 dernières. Si les données commencent plus tard que la période, on écrit le mois réel. Une allure qui ralentit s'affiche en gris (« +5 s/km »), jamais en rouge.
  - Sélecteur de période : 3 mois, 6 mois, 12 mois, Tout. « Tout » est sélectionné par défaut (demandes d'Omar). Les 4 cases sont égales, hauteur 34 px, fond `#0F1113`, case active `#F2F3F0` avec le texte `#0C0D0F`.
  - Ligne du coach, puis le graphique (Chart.js 4.4.1). Grille `#26292E`, axes en 10,5 px `#8B8F96`, échelle d'allure inversée (plus haut = plus rapide).
  - **Curseur de navigation** (demande d'Omar), sous les mois, aligné sur la zone du graphique. Piste de 4 px `#26292E`, un trait de 3 × 10 px `#5A6068` par séance (rouge et 12 px pour une course officielle), poignée blanche de 28 px (halo citron à 25 %). En dessous : boutons ‹ › de 44 px et « Séance N sur M · glisse le curseur ou utilise ‹ › » (12,5 px, `#8B8F96`).
  - **Lecture de la séance choisie :** dans une bulle sur le graphique, au-dessus du point, pour ne pas être cachée par le doigt (demande d'Omar). Fond `#F2F3F0`, arrondi 8 px, flèche vers le point, contenu « 5'57"/km · sam. 12 sept. » (12 px, allure en gras). Le point choisi est cerclé de blanc, avec une ligne verticale à 40 %. La bulle reste dans la zone du graphique. La toucher ouvre la séance dans l'historique.
  - **Courses officielles faites** (demande d'Omar) : point rouge `oklch(0.62 0.22 25)` de 4,2 px, avec un drapeau rouge planté au-dessus (mât de 16 px, fanion de 10 × 8 px). La course objectif garde son drapeau, sur une ligne verticale en pointillés. Légende : « Course officielle » et « Course objectif ».
  - Écart de 22 px entre les blocs de la carte (demande d'Omar). Le tableau des périodes a été retiré (doublon).
  - Séries : EF en points citron de 3,6 px, sorties longues en losanges menthe `oklch(0.8 0.12 160)` (validé), tendance en pointillés blancs à 70 %, projection à 2 mois en pointillés à 45 %, drapeau rouge pour les courses (voir plus bas). La légende reste toujours visible.
- **Écartées :** 6a, le progrès d'abord (pas d'exploration) ; 6b, le graphique d'abord (sans axe chiffré).
- **Allure EF validée par Omar** (2 oct.).
- **Fractionné (6e) validé par Omar.** Révisés après ses retours : 6f, le volume indique « trop élevé » (barre violet, pastille « ! » de 16 px, ligne « limite » en pointillés violet, seuil proposé = objectif + 30 %) ; 6g, l'efficience passe en corail `oklch(0.7 0.19 25)`, avec un cœur Lucide qui bat (1,6 s, double battement, échelle 1 → 1,18) et reste immobile avec « réduire les animations » ; 6h, en 2 parts : facile = zones 1-3 en citron, soutenu = zones 4-5 en terre battue (choix final d'Omar, après un essai avec la zone 3 à part en gris).
- **Décisions finales (2 oct.) :** seuil « trop élevé » = objectif + 30 %. Efficience en corail avec un cœur qui bat. Facile / soutenu en 2 parts (facile = zones 1-3). Les libellés de repère ne recouvrent jamais une barre : ils vont au-dessus du mois en cours ou dans la légende.
- **Animations :** courbe tracée de gauche à droite (600 ms), barres qui montent depuis la base (400 ms, 40 ms d'écart entre barres), poignée du curseur qui glisse (150 ms), cœur qui bat (1,6 s). Avec « réduire les animations », tout s'affiche directement, sans battement.
- **Accessibilité :** boutons ‹ › de 44 px, poignée de 28 px avec une zone de toucher de 44 px. Le contenu de la bulle est annoncé à chaque changement (`aria-live="polite"`). Les états ne reposent jamais sur la couleur seule : « ! », pointillés, légende.
- **Points ouverts :** aucun.
- **Étape 2, version 1 (autres graphiques) :** 6e fractionné (efforts seuls, points terre battue, état « à partir de 4 séances »), 6f volume mensuel (barres citron si l'objectif est atteint, grises sinon, mois en cours en pointillés, ligne d'objectif), 6g efficience cardiaque (courbe citron avec remplissage à 7 %, une décimale), 6h facile / soutenu (barre par mois, citron pour facile, terre battue pour soutenu, repère 80 %). Le curseur avance par séance (courbes) ou par mois (barres).

### 7. Historique, ressenti, carte du corps — VALIDÉ (version 27)

- **Étape 1 validée (2 oct.) : feuille de ressenti 7a**, la même partout (Aujourd'hui, historique, saisie à la main).
  - Critères toujours visibles : difficulté perçue, fatigue générale, mental, respiration (curseurs de 0 à 10 avec les libellés de l'app), puis « Une gêne ou une douleur ? » Oui / Non.
  - **Note globale retirée** (doublon avec les 4 curseurs, décision d'Omar), y compris dans la saisie à la main (N1).
  - Curseurs : piste de 6 px `#2A2E33`, remplissage et valeur en blanc `#F2F3F0`, poignée blanche de 24 px. Choix (Oui / Non, Avant / Pendant / Après) : pastilles de 40 px, sélection blanche avec le texte `#0C0D0F`.
  - « Oui » → la carte du corps s'ouvre : onglets Devant / Derrière (36 px), silhouette sans nom. Seule la zone touchée affiche sa fiche (nom complet, ex. « Genou gauche », intensité de 0 à 10, Avant / Pendant / Après, plusieurs choix possibles). Zone de 1 à 5 : blanc, opacité de 35 % à 100 %. De 6 à 10 : violet.
  - Bouton citron « Enregistrer » (48 px).
- **Écartées :** 7b, la liste par région (on perd le « j'ai mal là ») ; 7c, les silhouettes + liste (trop petites pour toucher).
- **Étape 2 validée : historique 7g** (demande d'Omar). On l'ouvre depuis « Historique » en haut de Progression.
  - En-tête : ‹ + « HISTORIQUE » (Condensed 26 px) + « + Séance réalisée » (contour citron, 36 px, ouvre N1b).
  - Filtres : « Tout · Courses · Autres » (sélection blanche) + menu « Type ».
  - **« Cette semaine »** toujours dépliée, en carte (fond `#17191C`, arrondi 22 px), avec son total à droite (« 18,1 km · 3 séances »). Elle couvre du lundi à aujourd'hui.
  - **« Plus ancien »** : les mois à déplier (ligne de 44 px, chevron, « N séances »). La liste commence avant la semaine en cours, sans répéter ses séances.
  - Ligne de séance de 60 px : icône du type (36 px, fond teinté à 14 %), type + date, puis distance · allure · durée. Records : trophée citron. « Saisie à la main » quand c'est le cas.
  - À droite : la difficulté perçue (« 3/10 », gris `#26292E`, violet à partir de 6), ou « À noter » (contour citron) si le ressenti manque (décision d'Omar). Puis un chevron.
  - Toucher une ligne ouvre la feuille de détail : carte V2, type de séance, interrupteur **« Compter dans mes stats »** (ancien « Suivi », validé), « Noter mon ressenti » (ouvre la feuille 7a). « … » → Supprimer → confirmation (« Annuler » / « Supprimer » en gris `#3A3D42`). La séance prévue liée redevient « à faire », ou « à replacer » si son jour est passé (précision de Claude Code). Le texte de confirmation, côté app, dit l'un ou l'autre selon le cas.
- **Écartées :** 7d, la liste par mois seule ; 7e, les cartes (trop longues) ; 7f, les semaines seules.
- **Animations :** dépliage d'un mois en 200 ms. Feuille de détail qui monte en 280 ms. Avec « réduire les animations », sans transition.
- **Accessibilité :** lignes de 60 px. Le texte de la pastille de difficulté est lu (« difficulté 3 sur 10 »). Le contraste du texte sur le violet est assuré par `#0C0D0F`.
- **Points ouverts :** aucun.

### 8. Calendrier semaine et mois — VALIDÉ (version 28)

**Décision finale :** 8a pour la vue semaine (Omar adore), 8b pour la vue mois.

- **En-tête Programme :** « PROGRAMME » (Condensed 30 px) + « + Ajouter » (36 px, fond `#22252A`). Sélecteur Semaine / Mois (34 px, sélection blanche). Les bannières (élément 9) se placent entre le sélecteur et le calendrier, une seule visible.
- **Tuiles :** même logique que « Ta semaine » (élément 3). Couleur = type, plein = fait, contour de 1,5 px = prévu, pointillés violets + « ! » = à replacer, contour en pointillés `#26292E` = repos, « + » de 15 px = 2e séance. Halo blanc (1,5 px) sur le numéro du jour en cours.
- **Semaine (8a) :** carte `#17191C`, arrondi 22 px, flèches ‹ › de 40 px, plage de dates au centre (Condensed 19 px). 7 tuiles de 40 px, légende (fait, prévu, à replacer, repos). Dessous : le jour choisi (« VEN. 2 OCT. · AUJOURD'HUI ») et ses petites cartes V5 (une par séance, icône pleine si faite), qui ouvrent la carte complète en feuille.
- **Mois (8b) :** même carte, « Octobre 2026 », grille 7 × 5 de tuiles de 36 px (écart de 8 px vertical et 4 px horizontal). Jours hors du mois à 40 %. Toucher un jour affiche ses petites cartes dessous.
- **États :** semaine vide ou partielle : « Générer / Compléter cette semaine » sous le calendrier (style à l'élément 9). Chargement et erreur : élément 13.
- **Animations :** changement de semaine ou de mois en glissement horizontal (220 ms). Avec « réduire les animations », changement direct.
- **Accessibilité :** chaque jour est une cible d'au moins 44 px (tuile + numéro), avec un `aria-label` complet (« Jeudi 1er octobre, fractionné à replacer »).
- **Écartée :** 8c, le mois par semaines.
- **Étape 2 validée (2 oct.), à la demande de Claude Code :**
  - **Glisser-déposer gardé** (vue semaine seulement). Un appui long de 0,4 s soulève la tuile : échelle 1,08, rotation de −6°, ombre `0 14px 30px rgba(0,0,0,.6)`, légère vibration. Le jour d'origine passe en pointillés `#5A6068` et le jour visé est entouré de 2 px blanc sur fond blanc à 8 %. Une ligne d'aide s'affiche : « Lâche sur jeudi 8… ». Au lâcher, un message blanc apparaît : « Fractionné déplacé au jeudi 8. » + « Annuler » (5 s). Une séance faite ne se déplace pas. Sur un jour déjà occupé, la séance devient la 2e du jour (« + »).
  - **Alternative accessible :** changer la date dans « Modifier la séance » déplace la séance.
  - **Feuille « + Ajouter »** (sur-titre « PROGRAMME ») et **« Modifier la séance »** (pré-remplie, sur-titre « VEN. 9 OCT. · PRÉVUE »). Type en pastilles de 36 px parmi les 11 (carré de couleur du type, sélection blanche), puis Date, Distance, Allure, Durée (champs de 48 px, unités en gris) et Notes (zone de 72 px, facultative), seulement pour une séance ajoutée à la main : pas de Notes sur une séance générée par l'app (A8). Pas de « Rappel ». Bouton citron « Ajouter au programme » ou « Enregistrer ». Dans Modifier, « Supprimer la séance » en texte gris `#A3A7AD` en bas.
  - **Calcul :** sur distance, allure et durée, on en remplit 2 et la 3e se calcule, dans les deux sens (décision d'Omar). Le dernier champ modifié est gardé.
  - Types sans distance (Renfo, Mobilité, Yoga, Pilates, Kiné, Autre) : seulement Date, Durée et Notes.
- **Décision :** pas de ligne « km faits / prévus » sous la semaine (Omar : pas besoin).
- **Points ouverts :** aucun.

### 9. Bannières et alertes — validé (2-3 oct.)

- **Étape 1 validée (2 oct.) : forme 9a, carte complète.** Fond violet à 10 %, liseré violet à 40 %, arrondi 22 px, marge intérieure 16 px. Icône de 32 px sur violet plein (`#0C0D0F`). Titre en 15 px 600, texte en 13 px `#C9CCD0`. Les choix sont des lignes de 44 px (fond `#0F1113`, arrondi 12 px, chevron), toutes de même poids, sans choix en rouge. Note médicale en 12 px en bas.
- **« Décaler la semaine » :** un bloc avec le titre « Décaler toute la semaine », un compteur − / + (boutons de 36 px) avec « 3 jours plus tard » au centre (Condensed 22 px), et le bouton « Décaler de 3 jours », qui reprend le chiffre (demande d'Omar).
- **Une seule bannière visible** + ligne « 1 autre point : … » (40 px, point violet, chevron) qui déplie la suivante. Le calendrier reste toujours visible.
- **Messages communs** (Omar : ce n'est pas un centre de notifications, chaque message a sa place fixe) :
  - Bandeau coach : en haut d'Aujourd'hui, sous la date. Rond citron de 32 px (sparkles) + une phrase, fond `#17191C`, arrondi 18 px.
  - Alerte douleur forte (≥ 7) : juste sous le bandeau coach, toujours affichée (hors règle de la carte unique). Rond violet + texte en gras, fond violet à 10 %.
  - Ajustement léger : en haut de Programme, au-dessus du calendrier. Ligne grise (`#17191C`, icône refresh, croix pour fermer), sans violet puisqu'il n'y a rien à décider.
- **Écartées :** 9b (bandeau + feuille), 9c (choix à cocher).
- **Bandeau coach cliquable (3 oct., question de Claude Code) :** quand le rappel a une action, tout le bandeau est cliquable, avec un chevron à droite (hauteur minimale 44 px) et sans bouton. Sans action : pas de chevron. Ordre des rappels (ajusté avec Claude Code) : 1) fin du plan débutant (« Renseigner mon chrono ») ; 2) planifier le test de niveau ; 3) X jours sans courir (« Voir mon programme »). Les rappels de niveau passent d'abord : sans chrono, plus de séances après la semaine 9. Si la carte « Ton niveau » est affichée, les deux rappels de niveau sont masqués dans le bandeau (même besoin) et on passe au suivant.
- **Ordre des bannières sur Programme :** douleur ≥ 7, puis douleur 6 ou charge > 1,5 (choix), puis séance non faite. Une seule visible, les autres via « 1 autre point ».
- **Étape 2 validée (3 oct.), style 9a :**
  - **Séance non faite** (icône calendar-x) : « La replacer cette semaine » / « La remplacer par une EF » / « La laisser passer ».
  - **Charge > 1,5** (icône gauge, valeur dans le titre) : les 5 choix (supprimer la prochaine intense, renfo, décaler la semaine, revoir l'objectif, ignorer) + ligne « 1 autre point ».
- **N3 · « Tes nouvelles allures »** (feuille, sur-titre « APRÈS TON CHRONO » ou « APRÈS TON TEST » ; un record trouvé dans les courses ne l'ouvre jamais, A4) : lignes EF / Seuil / Fractionné, ancienne allure barrée en `#8B8F96` Condensed 18 → nouvelle en citron Condensed 20 ; « S'applique aux séances à venir » ; « Appliquer » (citron) / « Garder les anciennes » (`#22252A`). **« Mettre à jour ton programme »** (niveau + objectif ensemble) : lignes Objectif / Niveau / Séances recalculées (`#0F1113`, arrondi 14), « Mettre à jour » / « Plus tard ».
- **N4 · « Ton objectif a changé »** (carte `#17191C`, drapeau sur `#22252A`, sur-titre gris) : nouvel objectif 15 px 600, nombre de séances à recalculer, « Mettre à jour » en citron. Aujourd'hui (carte d'action n° 3) : × pour fermer. Programme : persistante, sans ×.
- **N5 · Fusion :** même séance (même jour, même nature, durée ±15 %) → ligne grise (refresh-cw) « On a remplacé ta saisie du 12 oct. par la course reçue d'Apple Santé. Ta notation et tes notes sont gardées. » + ×. Doute → carte « Est-ce la même séance ? », deux séances côte à côte (`#0F1113`), « Oui, garder Apple Santé » (blanc) / « Non, ce sont 2 séances » (gris).
- **Générer / Compléter :** « Compléter cette semaine » sur semaine partielle (citron). Sans objectif ni disponibilités : info grise « Il nous manque ton objectif et tes disponibilités… » + « Compléter mon profil » (gris) → Profil.

### 10. Célébration — validé (3 oct.)

- **Décision :** plein écran 10b, ouvert une seule fois à l'ouverture de l'app après un record (5 km, 10 km, semi, marathon), puis la carte « Hier » + « Noter mon ressenti ». « Plus tard » : la carte disparaît le lendemain, comme les autres cartes « Hier ». Sans record : seulement « Note ton ressenti », sans fête. Chrono déclaré : jamais célébré.
- **Animation 10b-4 (idée d'Omar),** fichier de référence `record-man.js` (SVG, ~9,8 s en démo, jouée une fois dans l'app) : un bonhomme en traits blancs (bras/jambe arrière `#9DA2A9`, traits 3,5-4,5 px, tête r 6,5) arrive en marchant (jambes alternées, genoux pliés, bras opposés) → efface l'ancien record (gris `#8B8F96`, Condensed 64 px) avec une éponge grise, le chiffre disparaissant derrière sa main + poussière → se retourne et écrit le nouveau au pinceau citron (révélé derrière le pinceau + étincelles) ; le titre passe de « TON RECORD » (gris) à « NOUVEAU RECORD » (citron) → saute deux fois bras en V, le chiffre pulse (×1,14), 46 confettis rectangulaires (citron, blanc, cyan, corail) jaillissent et retombent en flottant, « avant 28:15 · −34 s » apparaît → repart à droite, le nouveau record reste.
- **Réduire les animations :** écran final directement (nouveau record + « avant … »), sans bonhomme ni confettis.
- **Écartées :** 10a carte, 10c compacte ; animations 10b-1 chute, 10b-2 cassé, 10b-3 éjecté ; 1re version du bonhomme (mouvements pas assez lisibles).

### 11. Parcours de démarrage — validé (3 oct.)

- **Forme 11b, plein écran :** pas de carte. En haut : chevron retour (44 px), barre en 5 segments (citron = fait/en cours, `#26292E` sinon), « N / 5 » en 12 px gris. Titre Condensed 34 px majuscules + sous-titre 15 px `#A3A7AD`. Libellés de question 13,5 px `#C9CCD0`. Pastilles 44 px (arrondi 22) : sélection blanche `#F2F3F0` / texte `#0C0D0F`, sinon `#17191C` + bord `#2A2E33`. Tuiles d'objectif 2×2 (76 px, rond d'icône 36 px). Un seul bouton citron de 52 px en bas. Textes de l'app inchangés.
- **Étapes :** 0 Bienvenue (logo Condensed 40, « Running » en citron, « C'est parti ») → 1 Objectif → 2 Niveau → 3 Disponibilités (nombres 1-7 en ronds de 44 px, jours en pastilles) → 4 Récapitulatif (lignes clé/valeur sur `#17191C`, « Créer mon programme ») → 5 Connecte tes courses (« Voir comment » + « Plus tard »).
- **Étape 2, questions du plan débutant :** « Tu cours à quelle fréquence en ce moment ? » et « Combien de temps peux-tu courir sans t'arrêter ? » restent en haut de l'étape 2, avant le choix du chrono (pastilles).
- **Étape 2 = écran « Ton niveau » :** deux choix en cartes, « Je connais un chrono récent » (déplie distance + h/min/s) / « Je ne sais pas » (test de 20 min plus tard, via la carte « Ton niveau »). Niveau estimé en 3 cases (sélection blanche). Encadré « Couch to 5K » en gris neutre avec icône info (plus de vert).
- **#32 Date un peu serrée :** champ date bordé violet + bloc violet (icône calendar-clock) « Date un peu serrée » + texte + pastilles « Choisir une autre date » / « Garder cette date ». Seuils (déjà dans l'app) : minimum 8 semaines pour 5 et 10 km, 10 pour 15 km, 12 pour le semi, 18 pour le marathon, ×0,75 au niveau Confirmé. Trois états : correct (rien), serré (≥ 60 % du minimum : bloc violet à 10 %, on peut garder la date), extrême (< 60 % : « Date trop proche », bloc violet à 16 % + bord violet plein 1,5 px, « Première date possible : le … » + pastilles « Prendre le … » (sélectionnée) / « Une autre date » / « Sans date », bouton Continuer désactivé (`#22252A`, texte `#5A6068`) avec « Choisis une date possible, ou « Sans date », pour continuer. »). « Sans date » débloque Continuer. Première date possible = aujourd'hui + 60 % du minimum recommandé, arrondi au jour supérieur (A13). Textes proposés.
- **Guide « Voir comment » (feuille), simplifié au maximum (demande d'Omar) :** 4 étapes en liste, une seule ouverte (bord blanc), les étapes faites cochées en citron et cochées automatiquement au retour dans l'app.
  - A · Installe RunSync : « petite app relais » + schéma Apple Santé → RunSync → MyRunningApp + « Tu n'auras pas besoin de l'ouvrir ensuite » ; bouton « Installer RunSync » (TestFlight pour les testeurs, App Store ensuite).
  - B · Autorise Apple Santé : reproduction de l'écran d'Apple (« Tout activer », interrupteurs) + « Ouvrir RunSync » + « On ne lit que tes séances de sport ».
  - C · On reçoit tes courses : indicateur d'attente → « C'est connecté · 12 courses reçues » + « Continuer ».
  - D · Rien reçu : message rassurant + 2 pistes (forcer une synchro, Réglages → Santé → Accès) + « Continuer sans attendre » / « Réessayer ».
- **Animations :** glissement horizontal de 280 ms entre étapes, barre qui se remplit en 250 ms. Réduire les animations : fondu.
- **Écartée :** 11a (carte, Retour + Continuer).
- **Identification RunSync (décision d'Omar, 3 oct.) : le même email.** Le guide passe à 4 étapes. Nouvelle étape 2 « Connecte-toi avec ton email » : « connecte-toi avec le même email et le même mot de passe que dans MyRunningApp », email affiché avec un bouton « Copier » (40 px), connexion avec le même email et le même mot de passe (RunSync a son propre écran de connexion, confirmé par Claude Code), bouton « Ouvrir RunSync ». Ensuite : 3 Autorise Apple Santé, 4 On reçoit tes courses.

### 12. Formulaires de Profil — validé (3 oct.)

- **Forme 12b, formulaire en place** (« plus vivant », choix d'Omar). Titre « PROFIL » en Condensed 30 px. Sélecteur Objectifs / Mon compte : pilule `#17191C` avec la sélection en blanc (40 px).
- **Enregistrement champ par champ, sans bouton « Enregistrer » (#23) :** le champ modifié affiche un badge « Enregistré » (26 px, citron sur citron à 12 %, icône check) pendant 2 s.
- **Onglet Objectifs :** carte d'objectif principal en haut (rond blanc avec drapeau, plus de jaune, #27), « PRÉPARER UNE COURSE · 10 KM » en Condensed 20 px, date + semaines restantes, 3 mini-tuiles Terrain / Record / Visé ; un appui ouvre l'objectif. Puis « Ajouter un objectif secondaire » (ligne en pointillés). Bloc « Ton profil coureur » (`#17191C`, arrondi 20) : séances (ronds 1-7 de 40 px, sélection blanche), renfo (0-7), « Objectif km par mois / par an » (champs avec unité km) + « Facultatif, alimente tes anneaux dans Progression. », terrain et équipement en pastilles, jours indisponibles, « Autre chose à préciser ». Ton niveau ouvre l'écran unique « Ton niveau ».
- **Onglet Mon compte (#29) :** blocs Profil (avatar, email non modifiable, Pseudo, Âge), Sécurité (nouveau mot de passe + « Changer le mot de passe »), Cardio (FC max modifiable « vide = calcul automatique » ; FC de repos modifiable « vide = valeur Apple Santé » (A5) ; VO2 max seule en lecture seule, bord en pointillés, « Apple Santé, chaque mois »). Pas de bloc Affichage (A6 : graphiques et chiffres mensuels ou annuels, sans interrupteur), Synchronisation (point citron + « Apple Santé · Connecté », « Dernière course reçue : … », « Synchroniser mes courses » ; non connecté → guide « Voir comment »), Parcours de démarrage, Export JSON / CSV, Déconnexion en gris (`#A3A7AD` sur `#17191C`). Genre et ville retirés.
- **Un réglage qui change le programme** (séances, jours, objectif) le signale ; l'objectif ouvre la feuille « Mettre à jour ton programme ».
- **Écartée :** 12a liste + feuilles (plus courte mais moins vivante).

### 13. États vide, chargement, erreur — validé (3 oct.)

- **Langage commun :** « rien encore » = tuiles en pointillés `#33373D` (1 px) ; chiffres à 0 en `#5A6068` ; une seule action en citron. Erreur : jamais de rouge ni de violet (le violet est réservé à l'attention), gris + « Réessayer », on garde les dernières données quand c'est possible.
- **Vides :** Aujourd'hui sans programme (carte, icône calendar-plus sur citron à 12 %, « Tu n'as pas encore de programme. », « Créer mon programme »), puis Ta semaine à 0 et texte charge. Programme semaine vide : tuiles « Repos » en pointillés, « Générer cette semaine » en citron, carte du jour « Repos — aucune séance planifiée. » + « Ajouter une séance » (pastille grise de 44 px). Progression sans course : icône heart-pulse, « Aucune séance pour l'instant », rappel RunSync, « Voir comment » (ouvre le guide) + « Ajouter une séance réalisée », 4 blocs à venir en pointillés « Ils apparaîtront dès ta première course. »
- **Chargement 13a, squelettes :** blocs `#22252A` aux formes du contenu, pulsation d'opacité .45 → 1 en 1,4 s. Synchro : pilule `#17191C` en haut, rond de 16 px (bord `#26292E`, haut citron, 0,9 s) + « Chargement… ». « Synchronisation de tes courses… » seulement dans le guide « Voir comment » (attente de la 1re course) et après « Synchroniser mes courses » (A3). Réduire les animations : blocs fixes, pas de rotation.
- **13c, création du programme** (après « Créer mon programme ») : « On prépare ton programme… » + 4 étapes (Objectif et niveau, Allures, Placement dans ta semaine, 4 premières semaines) cochées en citron une à une.
- **Erreurs (textes proposés) :** hors ligne (bandeau gris wifi-off en haut : « Tu es hors ligne. On garde ce qui est affiché. », A3) ; chargement échoué (bloc à la place du contenu, icône cloud-off, « Impossible de charger tes séances », « Ça vient de chez nous, pas de toi. », « Réessayer ») ; synchro muette dans Profil (point gris, « aucune course depuis 9 jours », conseil RunSync) ; enregistrement échoué (message blanc en bas « Pas enregistré, vérifie ta connexion. » + « Réessayer »).
- **Écartée :** 13b (rond qui tourne au centre).

---


## 2b. Amendements de la revue avec Claude Code (v45, 3 oct.)

Règle : ce journal fournit l'habillage, Claude Code et Omar gèrent le fond. Quand une décision de fond diffère, le message de revue fait foi. Maquettes : colonne « Ce qui change après la revue » (tout à droite) dans `Phase 6 - Design.dc.html`.

- **A1 · Glisser-déposer refusé (élément 8).** Sur un jour occupé, la séance ne devient la 2e du jour que si la cohabitation l'autorise : une course accepte une séance légère (Yoga, Mobilité, Étirements, Pilates, Kiné), jamais une 2e course, jamais du Renfo avec une course, une seule séance complémentaire par jour. Sinon : la tuile revient à sa place (250 ms, vibration d'erreur) et un message blanc (même style que « Fractionné déplacé au jeudi 8 », icône undo-2, texte `#0C0D0F` 13,5 px, 6 s, sans « Annuler ») : « On ne peut pas mettre ces deux séances le même jour : une course accepte une séance légère, mais pas une autre course ni du renfo, pour que tu récupères entre deux efforts. »
- **A2 · Célébration (élément 10).** Le plein écran 10b + bonhomme est réservé aux 4 records de distance (5 km, 10 km, semi, marathon). Pour la meilleure allure EF, la meilleure allure fractionné, la plus longue sortie ou durée et l'efficience cardiaque : carte « Hier » simple (carte d'action n° 2), icône du type sur citron à 12 %, sur-titre « HIER · MEILLEURE ALLURE EF », titre Condensed 26 px + valeur en citron : « Nouveau record d'allure ! » (meilleure allure EF et fractionné), « Nouvelle plus longue sortie ! », « Nouvelle plus longue durée ! », « Ton efficience cardiaque progresse ! » (sur-titres et boutons inchangés), ligne « Avant : … », « Noter mon ressenti » + « Plus tard ». Records d'allure (EF, fractionné) seulement : ~10 petits confettis (5 × 9 px ; citron, blanc, cyan) pendant 1,5 s ; réduire les animations = aucun. « Bravo, séance faite » supprimé. Meilleure allure EF : seulement si le cœur est resté en zones 1 et 2. Chrono déclaré : jamais célébré.
- **A3 · Textes de chargement.** « Synchronisation de tes courses… » seulement dans le guide « Voir comment » et au retour de « Synchroniser mes courses » ; ailleurs « Chargement… ». Hors ligne : « Tu es hors ligne. On garde ce qui est affiché. »
- **A4 · N3.** Sur-titres « APRÈS TON CHRONO » ou « APRÈS TON TEST » uniquement.
- **A5 · Cardio.** FC de repos modifiable comme la FC max (« vide = valeur Apple Santé ») ; seule la VO2 max reste en lecture seule.
- **A6 · Affichage retiré** de Mon compte : graphiques et chiffres mensuels ou annuels, sans interrupteur.
- **A7 · Textes.** Ligne « ! » : voir élément 3. Feuille « i » de la charge (titre « La charge d'entraînement ») : paragraphe d'explication, puis un bloc `#0F1113` avec 4 seuils précédés d'un carré de couleur (gris `#5A6068` < 0,8 ; citron 0,8-1,3 ; violet à 60 % > 1,3 ; violet > 1,5), puis « C'est un repère… » et la source Gabbett (2016) en 12 px gris. Texte complet tel que fourni par Claude Code.
- **A8 · Notes** seulement pour une séance ajoutée à la main.
- **A9 · Types.** Séances réalisées (historique, saisie à la main) : 14 types — EF, Long, Fractionné, Seuil, Course, Récup, Marche, Renfo, Mobilité, Yoga, Pilates, Étirements, Kiné, Autre. Séances prévues : 12 (sans Récup ni Marche). Souplesse → Étirements. Nouvelles couleurs : **Récup gris perle `oklch(0.86 0.01 250)`, icône battery-charging** (teinte R2 choisie par Omar : le bleu ciel proposé d'abord était trop proche du Renfo ; jamais citron ni bleu) ; **Marche taupe `oklch(0.74 0.05 70)`, icône person-standing** ; **Étirements rose clair `oklch(0.82 0.09 350)`, icône move-horizontal** (famille rose). Sélecteurs en pastilles de 36 px qui passent à la ligne (14 ou 12). Filtre de l'historique : Récup et Marche dans « Autres ».
- **A10 · Ton niveau / chrono.** Les allures viennent uniquement de « Ton niveau » (effort à fond de moins de 6 mois ou test de 20 min) ; jamais du record d'Objectifs ni des records des courses. Au-dessus du formulaire, ligne d'info grise (icône info) : « Ton temps sur une course ou un effort à fond, récent. Pas ton record de toute une vie, pas ta sortie tranquille : à partir de là, on calcule tes allures faciles, plus lentes. » Avertissement violet à 10 % (icône triangle-alert, champ minutes bordé violet) : « Vérifie ce temps : il est bien plus rapide que ce que tu cours en ce moment. » Question de reprise (comptes existants) : « On utilisait ton record de 10 km. Date de ce temps ? » + le record + 3 choix (moins de 6 mois / plus de 6 mois / je ne sais plus ; choix proposés). Bouton « Calculer mes allures conseillées ». Vocabulaire : « allure conseillée », jamais « objectif » ni « record ».
- **A11 · Statistiques.** Seules les sorties de course alimentent graphiques, indicateurs, anneaux, chiffres clés, records et charge. Récup, Renfo, Yoga, Mobilité, Étirements, Pilates, Kiné, Marche et Autre sont hors statistiques par défaut ; interrupteur « Compter dans mes stats » par séance.
- **A12 · Trophée (élément 7).** = la séance détient un record actuel (4 distances, meilleure allure EF, meilleure allure fractionné). Dans la feuille de détail : ligne citron à 12 %, icône trophy, « Record : 10 km en 52:10 ». Disparaît si le record est battu. Jamais pour un chrono déclaré.
- **A13 · Date extrême.** « Sans date » débloque Continuer ; première date possible = aujourd'hui + 60 % du minimum, arrondi au jour supérieur.

---

## 3. Arbitrages des phases 2 à 5 qui touchent le design (nettoyés en v45)

**Identité**
- Sombre seul. Fond `#0C0D0F`, surfaces `#17191C`. Citron `#C6F432` = action principale, EF / facile, progrès. Blanc = sélections. Violet `oklch(0.72 0.17 300)` = attention. Cyan et corail réservés aux données. Bleu réservé au Renfo.
- Typo : Barlow Condensed (titres et chiffres, majuscules) et Barlow (texte). Icônes Lucide. Graphiques Chart.js 4.4.1.
- Nom affiché « MyRunningApp », « Running » en citron. La source des courses s'appelle « Apple Santé » ; RunSync n'est cité que dans « Connecte tes courses » et le guide « Voir comment ».
- Ton neutre, 1re personne du pluriel (« on te conseille »), tutoiement. Pas de personnage, jamais « IA ».
- Pas de score « Forme ». 4 indicateurs : charge (3 zones), efficience cardiaque, régularité, volume (« 4 dernières semaines »).
- **Seules les sorties de course comptent dans les statistiques** (graphiques, indicateurs, anneaux, chiffres clés, records, charge). Les autres types sont hors stats par défaut, avec « Compter dans mes stats » par séance (A11).

**Aujourd'hui**
- Ordre : bandeau coach (une ligne, cliquable si le rappel a une action), séance du jour, une seule carte d'action, « Ta semaine ».
- Séance du jour : barre de structure et exercices visibles ; Modifier et Supprimer dans « … ». Pas de Supprimer sur une séance faite.
- Carte d'action unique, par priorité : rattachement d'une sortie → « Hier » (célébration et notation fusionnées, seulement si utile) → « Ton objectif a changé » → « Ton niveau ». Les alertes de douleur forte s'affichent toujours.
- Ta semaine : une tuile par jour pour la séance principale (la course s'il y en a une, sinon la séance légère). Une 2e séance ajoute une **pastille « + »** en haut à droite de la tuile (pleine si faite, contour si prévue). Toucher une tuile ouvre ce jour dans Programme ; la ligne de charge ouvre les indicateurs.
- Ligne « ! » : textes A7 (élément 3).
- Séance passée non reçue : « Pas encore reçue d'Apple Santé » + « J'ai fait cette séance ».

**Programme**
- Une seule bannière visible (douleur ≥ 7 → douleur 6 / charge > 1,5 → séance non faite) + « 1 autre point ». Calendrier toujours visible.
- Bannière douleur / charge : 5 choix (supprimer, renfo, décaler, revoir l'objectif, ignorer). Douleur ≥ 7 : avis médical.
- « Générer cette semaine » (vide) / « Compléter cette semaine » (partielle) ; sans objectif ni disponibilités → Profil.
- Glisser-déposer selon la règle de cohabitation, sinon refus (A1).
- La couleur dit le type, le remplissage dit le statut.
- Types prévus (12) : EF, Long, Fractionné, Seuil, Course, Renfo, Mobilité, Yoga, Pilates, Étirements, Kiné, Autre. Nom « EF » avec le sous-titre « endurance, à allure facile » la première fois.
- Pas de champ « Rappel ». Notes seulement pour une séance ajoutée à la main.

**Progression**
- Ordre : anneaux + avancement de l'objectif, raccourci historique, indicateurs, chiffres clés (avec records), graphiques, historique.
- Anneaux : seulement ce qui a un objectif. Le temps de course est dans les chiffres clés.
- Records : 5 km, 10 km, semi, marathon. Une course compte si sa distance est **entre D et D + 5 %**, avec le temps ramené à la distance exacte. Plus : meilleure allure EF (cœur en zones 1-2), meilleure allure fractionné, plus longue sortie / durée, efficience cardiaque (carte de célébration simple, A2). Chronos de « Ton niveau » : à part, « déclaré », jamais célébrés ni trophée.
- Courbe allure EF : **sorties EF en points citron, sorties longues en losanges menthe**, avec légende.
- Graphiques et chiffres : mensuels ou annuels uniquement (A6).
- Historique : filtres « Tout · Courses · Autres » + liste des types ; Récup et Marche dans « Autres ». Types réalisés (14) : les 12 + Récup et Marche.
- Suppression d'une course (toutes, Apple Santé compris) : menu « … » de l'historique, confirmation ; libère la séance prévue liée (« à faire », ou « à replacer » si son jour est passé).
- Progression vide : rappel « Connecte tes courses ».

**Feuilles et formulaires**
- Ressenti, Modifier, Ajouter, Revoir l'objectif, saisie à la main, chrono : en feuille, retour au point de départ.
- Après une douleur ≥ 6 : « On te propose d'adapter ton programme → Voir ».
- Profil enregistré champ par champ (badge « Enregistré »), sans bouton Enregistrer.
- « Objectif km par mois / par an » facultatifs, alimentent les anneaux.
- Objectif principal : rond blanc (plus de jaune), en haut ; objectifs secondaires dessous.
- Mon compte : email en lecture, mot de passe, Cardio (FC max et FC de repos modifiables, VO2 max en lecture), Synchronisation, export, Déconnexion en gris. Pas de genre, ville ni Affichage.
- « Ton niveau » : un seul écran (« Je connais un chrono récent » / « Je ne sais pas » → test de 20 min), ouvert depuis le démarrage, Aujourd'hui et le Profil. **Seule source des allures conseillées** (A10).

**Écrans nouveaux**
- N1 saisie à la main : date, type (14), distance, durée, FC moyenne facultative, avertissement de doublon, puis ressenti. Étiquette « Saisie à la main » ; correction = supprimer + ressaisir.
- N2 rattachement : course de moins de 7 jours non liée → jusqu'à 3 séances (±3 jours), « Oui, c'est celle-là » / « Non, c'était une sortie en plus ».
- N3 nouvelles allures : si l'allure facile change d'au moins 5 s/km après un nouveau chrono ou un test (jamais après un record trouvé dans les courses). Avant → après, « Appliquer » (futur seulement) / « Garder les anciennes ». Niveau + objectif : une seule feuille « Mettre à jour ton programme ».
- N4 objectif changé : carte sur Aujourd'hui (fermable) et Programme (persistante), « Mettre à jour », nombre de séances recalculées.
- N5 fusion : « On a remplacé ta saisie du 12 oct. par la course reçue d'Apple Santé. Ta notation et tes notes sont gardées. » ; doute → « Est-ce la même séance ? » ; sens inverse : simple avertissement.

**Démarrage**
- Bienvenue + 5 étapes : Objectif, Ton niveau, Disponibilités, Récapitulatif, Connecte tes courses (« Voir comment » + « Plus tard »). Guide en 4 étapes, même email et mot de passe dans RunSync.
- Date : correct / « Date un peu serrée » (≥ 60 % du minimum) / « Date trop proche » (< 60 %, plan refusé, première date possible ou « Sans date »).

**Logique (pour mémoire, sans habillage)**
- À l'ouverture de l'app : ajustement léger, génération des semaines à venir, appariement prévue ↔ réelle. Rien en arrière-plan, aucune notification.
- Doublon : même jour, même nature, durée ±15 % → la course **Apple Santé** remplace la saisie à la main.

---

## 4. Brief final (v45, 3 oct. 2026)

Le design est entièrement validé (18 sur 18). Ce brief résume comment l'appliquer. Le détail de chaque élément se trouve dans la partie 2, les amendements de la revue dans la partie 2b (ils priment sur la partie 2), et les maquettes dans `maquettes/Phase 6 - Design.dc.html`.

### 4.1 Principes à respecter partout

1. **Sombre seul.** Fond `--bg`, cartes `--surface`, champs `--surface-sunken`.
2. **Trois couleurs de rôle, jamais mélangées :** citron = action principale / EF-facile / progrès ; blanc = réglages et sélections ; violet = attention (à replacer, alertes, douleur ≥ 6). Erreurs et pannes : gris, jamais rouge ni violet. Le corail et les couleurs de type ne servent qu'aux données.
3. **Un seul bouton citron par écran ou feuille.** Les autres actions sont grises (`--surface-control`) ou en lien texte. « Supprimer » toujours en gris (`--text-3`).
4. **Typo :** Barlow Condensed 700 en majuscules pour les titres et tous les chiffres ; Barlow pour le texte. Sur-titres en 11 px, majuscules, espacement .14em, `--text-muted`.
5. **Cibles tactiles ≥ 44 px**, boutons de 48 px (52 px au démarrage). Contraste du texte ≥ 4,5:1.
6. **Une seule chose à la fois :** une carte d'action sous la séance du jour (rattachement → Hier → Objectif changé → Ton niveau), une bannière visible sur Programme (douleur ≥ 7 → douleur 6 / charge > 1,5 → séance non faite), le reste derrière « 1 autre point ». Les alertes de douleur forte s'affichent toujours.
7. **Feuilles plutôt que pages** pour toute saisie (ressenti, Modifier, Ajouter, nouvelles allures…). Poignée, titre Condensed 22 px, bouton × de 36 px.
8. **Seules les courses comptent dans les statistiques** (A11). Les autres types sont hors stats par défaut, avec « Compter dans mes stats » par séance.
9. **Vocabulaire :** « allure conseillée » pour les allures du programme (jamais « objectif » ni « record ») ; « Apple Santé » comme source des courses.
10. **Réduire les animations :** chaque animation a une version fixe (voir chaque élément). Les textes de l'app ne changent pas : seul l'habillage change.

### 4.2 Ordre conseillé pour appliquer

1. **Socle :** coller `tokens.css`, charger Barlow / Barlow Condensed et Lucide, remplacer les couleurs existantes par les variables (vert → `--accent`, ambre/jaune → `--attention` ou `--select` selon le rôle, rouge de « Supprimer » → `--text-3`).
2. **Menu du bas** (élément 1), puis **feuilles** génériques (poignée, ×, ombre) : elles servent partout.
3. **Composants de base :** pastilles et chips (sélection blanche), champs, boutons, lignes de choix 9a, badge « Enregistré », message en bas (toast blanc).
4. **Aujourd'hui :** bandeau coach cliquable (9), carte de séance (2), carte d'action unique (N2, 10, N4, Ton niveau), Ta semaine + pastilles (3), jauge de charge (4).
5. **Programme :** calendrier semaine / mois (8), glisser-déposer avec règle de cohabitation et message de refus (A1), feuilles Ajouter / Modifier (12 types, Notes seulement pour les séances ajoutées à la main), bannières (9), Générer / Compléter.
6. **Progression :** anneaux, indicateurs, chiffres clés, records (5), graphiques mensuels / annuels (6), historique avec 14 types et trophée (7, A12), ressenti + carte du corps, fusion N5.
7. **Feuilles transverses :** saisie à la main (N1, 14 types), « Ton niveau » + formulaire chrono (A10), nouvelles allures « APRÈS TON CHRONO / TEST » (N3).
8. **Célébration** (10) : plein écran + `record-man.js` pour les records de distance ; carte de célébration simple pour les autres records (A2).
9. **Démarrage** (11) et guide « Voir comment ».
10. **Profil** (12) : sans bloc Affichage, FC de repos modifiable.
11. **États vide / chargement / erreur** (13), à vérifier sur chaque écran.

### 4.3 Fichiers livrés

- `journal-design.md` : ce fichier (spécification complète).
- `tokens.css` : les jetons ci-dessous, prêts à coller.
- `record-man.js` : l'animation de célébration (web component `<record-man once old="28:15" new="27:41" distance="5 KM" gain="−34 s">`).
- `web/exercices/` : les 20 illustrations d'exercices (déjà livrées).
- `maquettes/Phase 6 - Design.dc.html` : toutes les maquettes (options retenues et écartées, colonne des amendements à droite).
- `maquettes/Directions Running.dc.html` : les directions de départ, dont la référence 3a « Bento commenté ».
- `maquettes/support.js` : nécessaire pour ouvrir les deux maquettes dans un navigateur (à garder dans le même dossier).

### 4.4 Jetons (copie de `tokens.css`)

```css
/* MyRunningApp — jetons de design (journal v45, 3 oct. 2026)
   Thème sombre uniquement. Polices : Barlow Condensed (titres, chiffres, majuscules) + Barlow (texte).
   Icônes : Lucide (https://lucide.dev). Graphiques : Chart.js 4.4.1. */

@import url("https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap");

:root {
  /* — Fonds et surfaces — */
  --bg: #0C0D0F;               /* fond de page */
  --surface: #17191C;          /* cartes, tuiles, bandeau coach */
  --surface-sunken: #0F1113;   /* champs, mini-tuiles dans une carte */
  --surface-raised: #1B1E21;   /* feuilles (bottom sheets) */
  --surface-control: #22252A;  /* boutons secondaires, squelettes */
  --line: #26292E;             /* séparateurs, pistes de jauge/anneau */
  --line-field: #2A2E33;       /* bord de champ et de pastille */
  --line-empty: #33373D;       /* pointillés « rien encore » */
  --grabber: #3A4047;          /* poignée de feuille */

  /* — Texte — */
  --text: #F2F3F0;             /* texte principal, sélection (blanc) */
  --text-2: #C9CCD0;           /* texte secondaire */
  --text-3: #A3A7AD;           /* sous-titres, valeurs, « Supprimer » */
  --text-muted: #8B8F96;       /* libellés, sur-titres, icônes inactives */
  --text-faint: #5A6068;       /* placeholders, chiffres à 0, désactivé */
  --on-accent: #0C0D0F;        /* texte sur citron, blanc ou violet */

  /* — Couleurs de rôle (règle validée) — */
  --accent: #C6F432;                       /* citron : action principale, EF/facile, progrès */
  --accent-soft: rgba(198, 244, 50, .12);  /* fond « Enregistré », icône sur citron */
  --select: #F2F3F0;                       /* blanc : réglages et sélections */
  --select-soft: rgba(242, 243, 240, .07);
  --attention: oklch(0.72 0.17 300);       /* violet : à replacer, alertes, douleur ≥ 6 */
  --attention-bg: oklch(0.72 0.17 300 / .10);
  --attention-bg-strong: oklch(0.72 0.17 300 / .16); /* date « extrême » */
  --attention-line: oklch(0.72 0.17 300 / .40);

  /* — Données (graphiques) — */
  --data-cyan: oklch(0.85 0.13 200);       /* série secondaire */
  --data-coral: oklch(0.7 0.19 25);        /* efficience cardiaque, cardio */
  --data-heart: oklch(0.62 0.22 25);       /* cœur, type Course, drapeau course officielle */
  --data-neutral: #8B8F96;                 /* Z3 seul, moyenne, objectif */

  /* — Types de séance — */
  --type-ef: #C6F432;
  --type-long: oklch(0.8 0.12 160);
  --type-fractionne: oklch(0.62 0.13 45);  /* terre battue */
  --type-seuil: oklch(0.74 0.11 80);
  --type-course: oklch(0.62 0.22 25);
  --type-recup: oklch(0.86 0.01 250);      /* gris perle, icône battery-charging — ni citron ni bleu */
  --type-marche: oklch(0.74 0.05 70);      /* taupe, icône person-standing */
  --type-renfo: oklch(0.72 0.14 250);
  --type-souple: oklch(0.75 0.13 330);     /* Mobilité, Yoga, Pilates, Kiné */
  --type-etirements: oklch(0.82 0.09 350); /* rose clair, icône move-horizontal */
  --type-autre: #8B8F96;

  /* — Typographie — */
  --font-display: "Barlow Condensed", sans-serif; /* 600/700, majuscules */
  --font-text: "Barlow", sans-serif;
  --fs-hero: 56px;      /* record plein écran */
  --fs-h1: 34px;        /* titre d'étape du démarrage */
  --fs-h2: 28px;        /* titre de page (date, Programme…) */
  --fs-h3: 22px;        /* titre de feuille / carte */
  --fs-num: 22px;       /* chiffres de tuiles */
  --fs-body: 15px;
  --fs-small: 13.5px;
  --fs-caption: 12.5px;
  --fs-overline: 11px;  /* sur-titres : majuscules, letter-spacing .14em */

  /* — Espacements — */
  --sp-1: 4px; --sp-2: 6px; --sp-3: 8px; --sp-4: 10px; --sp-5: 12px;
  --sp-6: 14px; --sp-7: 16px; --sp-8: 18px; --sp-9: 22px; --sp-10: 28px;
  --page-pad: 16px;

  /* — Arrondis — */
  --r-xs: 10px;   /* tuiles jour 40 px */
  --r-sm: 12px;   /* lignes de choix */
  --r-md: 14px;   /* champs, mini-tuiles */
  --r-lg: 18px;   /* bandeau coach, cartes de choix */
  --r-xl: 22px;   /* cartes */
  --r-sheet: 26px;
  --r-pill: 999px;

  /* — Tailles — */
  --tap-min: 44px;     /* cible tactile minimale */
  --btn-h: 48px;       /* bouton standard */
  --btn-h-lg: 52px;    /* bouton du démarrage */
  --field-h: 48px;
  --chip-h: 36px;      /* pastilles de type (44 px dans le démarrage) */
  --tile-day: 40px;
  --nav-item: 48px;

  /* — Ombres — */
  --shadow-sheet: 0 -10px 40px rgba(0, 0, 0, .5);
  --shadow-lift: 0 14px 30px rgba(0, 0, 0, .6); /* glisser-déposer */

  /* — Animations — */
  --ease: cubic-bezier(.2, .8, .2, 1);
  --t-fast: 200ms;
  --t-step: 280ms;     /* étapes du démarrage */
  --t-pulse: 1.4s;     /* squelettes */
}

@media (prefers-reduced-motion: reduce) {
  :root { --t-fast: 0ms; --t-step: 0ms; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

html, body { background: var(--bg); color: var(--text); font-family: var(--font-text); }
```
