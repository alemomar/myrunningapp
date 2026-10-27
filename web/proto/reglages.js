/* Prototype « refonte progression » (26/10/2026) : TOUS les seuils au même endroit.
   Change une valeur ici, recharge la page : les écrans suivent. Rien de ce fichier n'écrit nulle part.
   s/km = secondes par kilomètre (6'05/km = 365 s/km). Plus le nombre est grand, plus l'allure est lente. */
const REGLAGES = {

  /* ---- « Habitude » : à quoi on compare une sortie (le bilan est TOUJOURS donné, retour d'Omar du 26/10) ----
     1) Cœur fiable et allure détaillée : on compare tes PASSAGES à la même allure (même zone d'allure), toutes sorties
        confondues : ton cœur sur ces passages face à ton habitude à cette allure. Un seuil se compare à tes autres
        passages au seuil, même au milieu d'une sortie mixte. Fenêtre de 6 semaines, élargie à 12 s'il le faut.
     2) Sinon : sorties du même type (allure, cœur moyen ou ressenti), 6 puis 12 semaines.
     3) Sinon : « Ta première sortie de ce type » (elle devient le point de départ). */
  habitudeSemaines: 6,          // sorties sur les 6 dernières semaines, sortie du jour exclue…
  bilanFenetreMaxSemaines: 12,  // … élargies à 12 semaines s'il n'y a rien à comparer
  minSortiesHabitude: 1,        // une seule sortie comparable suffit pour donner un bilan (on dit à combien on compare)
  bilanMinPassageSec: 300,      // une zone d'allure compte si la sortie y a passé au moins 5 min (les courtes accélérations ne servent pas de référence)
  penteCoeurDefaut: -0.7,       // à défaut de mieux : le cœur monte de 0,7 battement par s/km plus vite (corrige l'écart d'allure « à 10 s près »)
  penteCoeurMin: -2, penteCoeurMax: -0.1, penteMinPoints: 6,   // pente tirée de tes passages si elle est plausible et s'il y a au moins 6 points
  coeurToleranceSec: 20,        // cœur pris à 20 s près de chaque mesure d'allure
  coeurDecalageSec: 45,         // le cœur suit l'allure avec ~45 s de retard : chaque mesure d'allure prend le cœur mesuré 45 s plus tard
  coeurMinSec: 60,              // il faut au moins 60 s de cœur dans la zone pour comparer
  bilanJoursOuverture: 7,       // le bilan s'ouvre tout seul à la 1re ouverture après une sortie de moins de 7 jours

  /* ---- Bilan avec un cœur fiable ---- */
  allureComparableSec: 10,      // « à allure comparable » = à 10 s/km près…
  allureProcheMaxSec: 30,       // … sinon à 30 s/km près, le cœur de chaque passage étant ramené à ton allure du jour (pente ci-dessous)
  minSortiesComparables: 1,     // sorties à allure comparable nécessaires pour comparer le cœur directement
  minSortiesTendance: 3,        // sinon : relation allure → cœur tirée des sorties du même type (au moins 3)
  ecartCoeurBpm: 3,             // au moins 3 battements sous l'habitude → « plus facile » ; 3 au-dessus → « plus dure »

  /* ---- Cœur fiable ---- */
  coeurFiableIntervalleSec: 30, // au moins une mesure toutes les 30 s en moyenne (l'app, elle, demande 1 par minute)
  coeurFiableCouverture: 0.7,   // … et des mesures sur au moins 70 % de la sortie (même règle que « Détail incomplet »)

  /* ---- Verdict sans cœur fiable : allure et ressenti ---- */
  ecartAllureSec: 10,           // au moins 10 s/km plus vite (ou plus lent) que l'habitude
  ecartRessenti: 2,             // ressenti sur 10 : au moins 2 points sous (ou au-dessus de) ton habitude

  /* ---- Ressenti sur 10 (gardé sur ce téléphone seulement, jamais dans la base) ---- */
  ressentiReperes: { 1: "très facile", 5: "je pouvais encore parler", 10: "effort maximal" },
  ressentiFacileMax: 3,         // 1 à 3 : « facile »
  ressentiDurMin: 7,            // 7 à 10 : « dur » ; 4 à 6 : « correct »

  /* ---- 5 zones d'allure, calculées à partir de tes allures conseillées (celles de l'app : chrono de « Ton niveau ») ----
     Bornes = milieux entre les allures conseillées : Endurance jusqu'au milieu facile / marathon, Tempo jusqu'au milieu
     marathon / seuil, Seuil jusqu'au milieu seuil / fractionné, Rapide au-delà. Récupération = plus lent que l'allure
     facile + 45 s/km (marche, footing très lent). Sans chrono : allure facile = médiane de tes sorties faciles (8 semaines). */
  recupEcartSec: 45,
  zonesNoms: ["Récupération", "Endurance", "Tempo", "Seuil", "Rapide"],
  zonesCouleurs: ["#5A6068", "#C6F432", "#E2B04A", "#D9894A", "#FF645F"],
  zonesFaciles: [0, 1],         // Récupération + Endurance = « facile » ; Tempo, Seuil, Rapide = « soutenu »

  /* ---- Découpage automatique d'une sortie ---- */
  decoupageMinM: 400,           // un segment fait au moins 400 m (les plus courts sont fondus dans un voisin)
  lissageSec: 30,               // l'allure est lissée sur 30 s (médiane glissante) avant d'être classée
  pauseSec: 120,                // plus de 2 min sans mesure = une pause (ni distance ni temps)
  echauffementMaxM: 2500,       // 1er segment plus lent que le suivant, de 2,5 km au plus, en récupération ou avant un passage soutenu = échauffement
  retourCalmeMaxM: 2500,        // dernier segment plus lent que le précédent, de 2,5 km au plus, en récupération ou après un fractionné / seuil = retour au calme
                                // (une sortie facile qui finit facile après quelques km rapides garde « faciles »)

  /* ---- Évolution sur cette distance ---- */
  evolutionDe: 6,               // « il y a 2 mois » = sorties du même type datées de 6…
  evolutionA: 10,               // … à 10 semaines avant celle-ci
  evolutionDistanceEcart: 0.2,  // distance comparable : à 20 % près
  evolutionMinSec: 3,           // moins de 3 s/km d'écart : « au même rythme »

  /* ---- Ton repère : allure facile à effort égal ----
     Pour chaque sortie facile (EF, longue) au cœur fiable : allure ramenée à un même cœur (ta FC habituelle en facile,
     médiane des 12 dernières semaines), par simple proportion. Repère = médiane des 4 dernières semaines, comparée aux
     4 semaines d'il y a 3 mois. Sans cœur fiable : médiane de l'allure des sorties faciles. */
  repereFenetreJours: 28,
  repereIlYaJours: 91,
  repereMinSorties: 3,
  repereFcRefJours: 84,
  repereEcartMinSec: 3,         // moins de 3 s/km d'écart : « stable »

  /* ---- Tes allures par effort (Progression › Allure, idée d'Omar du 26/10) ----
     L'effort se lit au cœur : EF = cœur en zone 2, Tempo = zone 3, Seuil = zone 4 (zones cardio de l'app, réserve de FC).
     Pour chaque sortie au cœur fiable : l'allure tenue pendant les moments passés dans chaque zone (blocs d'au moins
     90 s, sans leurs 30 premières secondes, le temps que le cœur se cale). Évolution : médiane des 4 dernières semaines
     face aux 4 semaines d'il y a 3 mois. À distinguer de la répartition du temps en zones 1 à 5 (onglet Cœur). */
  effortBlocMinSec: 90,
  effortRetardSec: 30,
  effortMinSec: { 1: 600, 2: 180, 3: 180 },   // temps minimum dans la zone pour qu'une sortie compte (EF 10 min, Tempo et Seuil 3 min)
  fracMinSorties: 1,            // Fractionné : une séance sur la fenêtre suffit (les fractionnés sont plus rares)
  zonesCardioEffort: ["Récupération", "EF", "Tempo", "Seuil", "Fractionné"],   // nom de l'effort de chaque zone cardio 1 à 5 (retour d'Omar du 27/10)
  effortFenetreJours: 28,          // les 4 dernières semaines (choix d'Omar du 27/10), face aux mêmes 4 semaines il y a 3 mois
  effortMinSorties: 2,

  /* ---- Ton mois (Accueil, retour d'Omar du 27/10 : remplace « Ta semaine ») ---- */
  moisFacileBienPct: 75,        // au moins 75 % du temps en zones 1 et 2 : « surtout du facile »
  moisFacileMinPct: 60,         // moins de 60 % : « beaucoup d'intensité »
  couleursTypes: { "Sortie facile": "#C6F432", "Sortie longue": "#44E7EF", Tempo: "#E2B04A", Seuil: "#D9894A", "Fractionné": "#FF645F", Course: "#F2F3F0" },

  /* ---- Ta semaine ---- */
  semaineMoyenneSemaines: 4,    // comparée à la semaine dernière et à la moyenne des 4 semaines d'avant
  semaineSoutenuMaxPct: 25,     // plus de 25 % du temps en soutenu : « beaucoup d'intensité »

  /* ---- Ligne de conseil pour la prochaine sortie (première version, règles simples) ---- */
  conseils: {
    dure: "Une sortie ne fait pas une tendance. La prochaine fois : une sortie facile et courte pour récupérer.",
    lente: "Une sortie plus lente ne dit rien de ta forme : garde ton rythme habituel la prochaine fois.",
    intense: "Après une séance intense, la prochaine sortie se fait en facile.",
    course: "Après une course, deux ou trois jours faciles avant de remettre du rythme.",
    facileFacile: "Garde cette allure facile, et ajoute 4 accélérations de 20 secondes à la fin.",
    moyenneFacile: "Continue comme ça : c'est la régularité qui fait progresser.",
    defaut: "La prochaine fois : une sortie facile, à une allure où tu peux parler.",
  },
};
