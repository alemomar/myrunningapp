/* Prototype « refonte progression » (26/10/2026) : TOUS les seuils au même endroit.
   Change une valeur ici, recharge la page : les écrans suivent. Rien de ce fichier n'écrit nulle part.
   s/km = secondes par kilomètre (6'05/km = 365 s/km). Plus le nombre est grand, plus l'allure est lente. */
const REGLAGES = {

  /* ---- « Habitude » : à quoi on compare une sortie ---- */
  habitudeSemaines: 6,          // sorties du même type sur les 6 dernières semaines, sortie du jour exclue
  minSortiesHabitude: 2,        // en dessous : pas de verdict (« pas encore d'habitude pour ce type de sortie »)

  /* ---- Verdict avec un cœur fiable ---- */
  allureComparableSec: 10,      // « à allure comparable » = à 10 s/km près
  minSortiesComparables: 2,     // sorties à allure comparable nécessaires pour comparer le cœur directement
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
