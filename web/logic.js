// Fonctions de calcul pures, sans dépendance à l'état de l'app (RUNS, DOM,
// Supabase...) — extraites d'index.html pour pouvoir être testées isolément
// (voir test.html). Toute nouvelle fonction de calcul pur (zones, détection
// de patterns, régression...) devrait vivre ici plutôt que dans index.html.
// Après toute modification de ce fichier : incrémenter le ?v=N dans les
// <script src="logic.js?v=N"> d'index.html ET test.html, sinon les
// navigateurs (y compris pendant les tests) continuent de servir l'ancienne
// version en cache — un vrai piège déjà rencontré une fois.

const fmtA=s=>{if(!s)return"—";let m=Math.floor(s/60),sc=Math.round(s%60);if(sc===60){m++;sc=0;}return m+"'"+String(sc).padStart(2,"0")+'"'};
function fmtDur(sec){
  sec=Math.round(sec||0);
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  return h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
}

function linearRegression(points){
  const n=points.length;
  const sumX=points.reduce((a,p)=>a+p.x,0), sumY=points.reduce((a,p)=>a+p.y,0);
  const sumXY=points.reduce((a,p)=>a+p.x*p.y,0), sumX2=points.reduce((a,p)=>a+p.x*p.x,0);
  const denom=n*sumX2-sumX*sumX;
  if(denom===0) return {slope:0, intercept:sumY/n};
  return { slope:(n*sumXY-sumX*sumY)/denom, intercept:(sumY-((n*sumXY-sumX*sumY)/denom)*sumX)/n };
}

/* ---------- Zones cardio & détection fractionné (calculées ici, jamais côté iOS) ---------- */
// Couleurs des zones : design V2 (Z1 gris, Z2 cyan, Z3 citron, Z4 violet, Z5 corail). Réserve de FC (Karvonen) : zone = FC repos + %×(FC max − FC repos).
// C'est la méthode utilisée par l'app Santé — sans FC repos on retombe sur
// un simple % de FC max (moins précis mais reste utilisable).
function hrZoneDefs(maxHr, restingHr){
  const base = (restingHr && restingHr>0) ? restingHr : 0;
  const range = maxHr - base;
  const bound = pct => Math.round(base + range*pct);
  return [
    {zone:1,label:"Zone 1",color:"#5A6068",max:bound(0.6)},
    {zone:2,label:"Zone 2",color:"#44E7EF",max:bound(0.7)},
    {zone:3,label:"Zone 3",color:"#C6F432",max:bound(0.8)},
    {zone:4,label:"Zone 4",color:"#B688FE",max:bound(0.9)},
    {zone:5,label:"Zone 5",color:"#FF645F",max:999},
  ];
}
/* ---------- Consigne d'intensité par zone d'allure du Programme (4.3.b) ----------
   CDC v2, 4.3 : EF/sortie longue -> ressenti ("tu dois pouvoir parler") +
   plafond de FC (allure seulement indicative). Seuil -> allure cible +
   zone FC en complément (effort assez long pour que la FC ait le temps
   de suivre). Fractionné -> allure seule : décision prise avec
   l'utilisateur, la FC a 1 à 3 minutes de retard sur l'effort réel, donc
   inutile à viser sur des intervalles courts (pas une exigence du CDC,
   une raison physiologique reconnue). Réutilise hrZoneDefs plutôt que
   d'inventer de nouveaux seuils : plafond EF = haut de zone 2 (même
   limite que "EF qualitatif" dans classifyRunType) ; zone Seuil = zone 3
   à 4. */
function programIntensityGuidance(paceZone, maxHr, restingHr){
  if(paceZone==="interval" || paceZone==="repetition") return { mode:"allure" };
  if(!maxHr) return { mode: paceZone==="threshold" ? "allure" : "ressenti" };
  const defs = hrZoneDefs(maxHr, restingHr);
  if(paceZone==="threshold") return { mode:"allure_zone", hrRangeMin: defs[1].max+1, hrRangeMax: defs[3].max };
  return { mode:"ressenti_plafond", hrCeiling: defs[1].max };
}
function zoneIndexForHr(hr, defs){
  for(let i=0;i<defs.length;i++) if(hr<=defs[i].max) return i;
  return defs.length-1;
}
// Attribue à CHAQUE échantillon la totalité du temps qui le sépare du
// suivant, sans jamais ignorer les grands écarts — vérifié le 29/09/2026
// contre un vrai export Apple Santé (testeuse Leïla) : une séance de 30min
// avec seulement 22 mesures FC (échantillonnage épars mais réel, pas un
// bug de synchro) donne, écarts non filtrés, exactement les mêmes zones
// que celles affichées nativement par Apple (27:17 calculé vs 27:16
// affiché par Apple, à 1s près). Un ancien filtre ignorait tout écart
// >60s ("pour ignorer les pauses") : il faisait perdre plus de 95% de la
// séance dans ce cas réel, largement plus agressif que ce qu'Apple
// applique lui-même (qui semble ne jamais ignorer les écarts, même de
// plus de 10 minutes, d'après ce même export).
function computeHrZoneSeconds(hrSeries, maxHr, restingHr){
  const defs = hrZoneDefs(maxHr, restingHr);
  const secs=[0,0,0,0,0];
  const sorted = hrSeries.slice().sort((a,b)=>a.t-b.t);
  for(let i=0;i<sorted.length-1;i++){
    const dt = sorted[i+1].t - sorted[i].t;
    if(dt<=0) continue; // horodatages dupliqués/aberrants uniquement
    secs[zoneIndexForHr(sorted[i].hr, defs)] += dt;
  }
  return {secs, defs};
}

// Une moyenne/pic seuls ne montrent pas la structure temporelle d'une séance :
// on repère les oscillations nettes et soutenues de FC (pic après un creux)
// pour suggérer "ça ressemble à un fractionné" — sans jamais reclasser
// automatiquement. Le seuil d'amplitude (30 bpm) et l'espacement minimum
// (60s) sont volontairement élevés pour ignorer le bruit normal d'un footing
// (montée en warmup, petites oscillations de mesure) et ne retenir que de
// vrais blocs d'effort/récup répétés.
function detectHrSurges(hrSeries, deltaMin=30, minSpacingSec=60){
  const sorted = hrSeries.slice().sort((a,b)=>a.t-b.t);
  if(sorted.length<10) return [];
  const win=20;
  const sm = sorted.map(p=>{
    const near = sorted.filter(q=>Math.abs(q.t-p.t)<=win);
    return {t:p.t, hr: near.reduce((s,q)=>s+q.hr,0)/near.length};
  });
  let kept=[], lastPeakT=-Infinity;
  for(let i=1;i<sm.length-1;i++){
    if(sm[i].hr>sm[i-1].hr && sm[i].hr>=sm[i+1].hr){
      const since = sm.filter(q=>q.t>lastPeakT && q.t<=sm[i].t);
      const trough = since.length ? Math.min(...since.map(q=>q.hr)) : sm[0].hr;
      if(sm[i].hr - trough >= deltaMin && sm[i].t - lastPeakT >= minSpacingSec){
        kept.push(sm[i]);
        lastPeakT = sm[i].t;
      }
    }
  }
  return kept;
}
function looksLikeFractionne(hrSeries){
  if(!hrSeries || hrSeries.length<10) return false;
  const sorted = hrSeries.slice().sort((a,b)=>a.t-b.t);
  const totalDuration = sorted[sorted.length-1].t - sorted[0].t;
  if(totalDuration<300) return false; // trop court pour juger d'une structure
  const surges = detectHrSurges(hrSeries);
  if(surges.length<3) return false;
  // Les oscillations doivent couvrir une bonne partie de la séance, pas
  // juste un pic isolé au warmup ou en fin de séance.
  const span = surges[surges.length-1].t - surges[0].t;
  return span >= totalDuration*0.4;
}

// Définition donnée par l'utilisateur : Seuil = zones 3+4+5 combinées >50% du
// temps de la séance (EF = zone 2 >50%, mais ça reste le comportement par
// défaut — rien à détecter, juste Seuil qui est l'exception à signaler).
function looksLikeSeuil(hrSeries, maxHr, restingHr){
  if(!hrSeries || hrSeries.length<10 || !maxHr) return false;
  const {secs} = computeHrZoneSeconds(hrSeries, maxHr, restingHr);
  const total = secs.reduce((a,b)=>a+b,0);
  if(total<300) return false; // trop court pour juger d'une structure
  const highZone = secs[2]+secs[3]+secs[4];
  return highZone/total > 0.5;
}

/* ---------- Détection d'intervalles fractionné (Work/Récup) à partir de l'allure ---------- */
function median(values){
  const s = values.slice().sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}

// Segmente la séance en blocs Work/Récup contigus. Un seuil GLOBAL (même basé
// sur des percentiles) se fait piéger dès qu'il y a une 3e population de
// valeurs dans la séance (ex: un cooldown lent en fin de séance) — le
// percentile haut se décale sur le cooldown au lieu de la vraie récup, et
// absorbe la récup dans le "work". On compare donc chaque point à un seuil
// LOCAL (contexte proche dans le temps, ~un demi-cycle), insensible à ce qui
// se passe loin de lui dans la séance. Quand le contexte local est plat (pas
// assez de variation — typiquement en plein milieu d'un cooldown constant),
// le point est marqué indéterminé plutôt que classé par défaut. Le lissage
// utilise la MÉDIANE et non la moyenne : l'allure GPS brute contient des
// pics isolés très violents (ex: 189→743→264 sur 3 échantillons de 2-3s) —
// une moyenne se fait complètement fausser par un seul de ces pics, la
// médiane les ignore tant qu'ils restent minoritaires dans la fenêtre.
function detectPaceIntervals(paceSeries, minSegDurationSec=20, localWindowSec=65, minLocalRange=30, smoothWin=15){
  const sorted = paceSeries.slice().sort((a,b)=>a.t-b.t);
  const sm = sorted.map(p=>{
    const near = sorted.filter(q=>Math.abs(q.t-p.t)<=smoothWin).map(q=>q.pace);
    return {t:p.t, pace: median(near)};
  });
  const classified = sm.map(p=>{
    const local = sm.filter(q=>Math.abs(q.t-p.t)<=localWindowSec).map(q=>q.pace);
    const lo = Math.min(...local), hi = Math.max(...local);
    if(hi-lo < minLocalRange) return {t:p.t, pace:p.pace, isWork:null};
    const mid = (lo+hi) / 2;
    return {t:p.t, pace:p.pace, isWork: p.pace<mid}; // allure plus petite = plus rapide = "work"
  }).filter(p => p.isWork !== null);

  const segments = [];
  let current = null;
  for(const p of classified){
    if(!current || current.isWork !== p.isWork){
      if(current) segments.push(current);
      current = {isWork:p.isWork, points:[p]};
    } else {
      current.points.push(p);
    }
  }
  if(current) segments.push(current);

  const filtered = segments.filter(s => {
    const dur = s.points[s.points.length-1].t - s.points[0].t;
    return dur >= minSegDurationSec;
  });

  // Un blip de l'autre type trop court (<minSegDurationSec) au milieu d'un
  // intervalle est retiré par le filtre ci-dessus SANS recoller les deux
  // morceaux du même type de part et d'autre : un vrai intervalle Work de
  // ~4min peut ainsi finir coupé en 2-3 fragments d'une minute chacun,
  // chaque fragment étant alors trop court pour passer le test de
  // régularité de findConsistentRun (comparé à la durée de référence des
  // autres intervalles) — sous-comptage réel observé : 4 intervalles Work
  // réels, seulement 2 détectés, le calcul biaisé vers les 2 restants.
  // On recolle donc les segments adjacents de même type juste après filtrage.
  const merged = [];
  for(const s of filtered){
    const prev = merged[merged.length-1];
    if(prev && prev.isWork === s.isWork){
      prev.points = prev.points.concat(s.points);
    } else {
      merged.push({isWork:s.isWork, points:s.points.slice()});
    }
  }
  return merged;
}

// Retire le début/fin de chaque intervalle avant de moyenner : le lissage
// utilisé pour la détection mélange la fin d'un bloc avec le début du
// suivant sur quelques secondes, ce qui biaiserait sinon la moyenne vers la
// valeur du bloc voisin. Rognage plafonné à 20% de la durée pour ne pas
// vider les intervalles très courts.
function trimSegmentEdges(points, trimSec=8){
  if(points.length<3) return points;
  const dur = points[points.length-1].t - points[0].t;
  const trim = Math.min(trimSec, dur*0.2);
  const start = points[0].t + trim, end = points[points.length-1].t - trim;
  const core = points.filter(p=>p.t>=start && p.t<=end);
  return core.length ? core : points;
}

// Un fractionné, c'est une structure RÉGULIÈRE : des intervalles de durée
// proche les uns des autres, répétés. Le warmup, un palier "Seuil" prolongé
// ou un cooldown n'ont pas cette régularité — ni forcément un seul segment
// unique et long (le bruit peut aussi les fragmenter en plusieurs petits
// segments irréguliers). On ne peut PAS supposer que le fractionné démarre
// au tout début de la séance : un échauffement de plusieurs minutes avant
// les intervalles génère lui aussi du bruit GPS classé en petits faux
// segments Work/Récup, et si on prend CES segments comme référence de
// régularité, on coupe la vraie plage fractionné avant même de l'atteindre
// (bug réel observé sur une séance avec 10min d'échauffement : la moyenne
// finale ne contenait que du bruit d'échauffement, donnant un Work et un
// Récup quasi identiques). On teste donc TOUTES les positions de départ
// possibles parmi les segments détectés, et on garde la plage régulière qui
// couvre le plus de temps total — c'est elle qui représente le vrai bloc
// fractionné, peu importe où il se trouve dans la séance.
// Une exigence d'alternance stricte Work/Récup (essayée d'abord) s'est avérée
// trop fragile : dès qu'un seul segment de récup entre deux Work est trop
// court/bruité pour survivre au filtrage (fréquent sur des cycles courts),
// l'alternance casse et coupe une plage par ailleurs parfaitement propre
// bien avant la fin (observé sur une séance à cycles ~75-80s : seulement 3
// segments retenus sur ~25min de structure régulière). On vérifie donc
// plutôt la cohérence de l'ALLURE en continu pendant l'extension — une
// référence glissante par type (Work / Récup), mise à jour à chaque segment
// accepté — en plus de la cohérence de durée. Deux segments Work consécutifs
// sont acceptés tant que leur allure reste proche des autres Work déjà
// retenus (signe d'une récup manquante, pas d'une sortie de structure) ; un
// segment dont l'allure dévie trop (ex: bascule vers un cooldown, même à
// durée compatible) est lui rejeté.
function findConsistentRun(segments, factor=1.8, paceFactor=1.45){
  if(segments.length<3) return segments;
  const durations = segments.map(s => s.points[s.points.length-1].t - s.points[0].t);
  const avg = pts => { const core=trimSegmentEdges(pts); return core.reduce((a,p)=>a+p.pace,0)/core.length; };
  const paces = segments.map(s=>avg(s.points));
  let best = {start:0, end:0, totalDur:-1};
  for(let i=0;i<=durations.length-3;i++){
    const durRef = median(durations.slice(i, Math.min(i+4, durations.length)));
    let workPaces = [], recPaces = [];
    for(let k=i;k<Math.min(i+4, segments.length);k++){
      (segments[k].isWork ? workPaces : recPaces).push(paces[k]);
    }
    let j=i;
    while(j<durations.length){
      if(durations[j]>durRef*factor || durations[j]<durRef/factor) break;
      const refArr = segments[j].isWork ? workPaces : recPaces;
      const ref = refArr.length ? median(refArr) : null;
      if(ref!=null && (paces[j]>ref*paceFactor || paces[j]<ref/paceFactor)) break;
      refArr.push(paces[j]);
      j++;
    }
    const totalDur = durations.slice(i,j).reduce((a,b)=>a+b,0);
    if(totalDur > best.totalDur) best = {start:i, end:j, totalDur};
  }
  return segments.slice(best.start, best.end);
}

// La cohérence de durée n'empêche pas qu'un segment en tout début ou toute
// fin de plage retenue ait une allure très différente des autres du même
// type (ex: dernier "Work" en réalité déjà entré dans une bascule vers le
// cooldown — même durée qu'un vrai intervalle, mais allure ~1.6x plus
// lente). On rogne donc les extrémités tant que leur allure dévie trop de la
// médiane des segments de même type dans la plage — jamais l'intérieur, qui
// reste protégé par l'alternance stricte.
function trimPaceOutlierEdges(segments, avgPaceFn, factor=1.4){
  segments = segments.slice();
  function typeMedian(isWork){
    const vals = segments.filter(s=>s.isWork===isWork).map(avgPaceFn);
    return vals.length ? median(vals) : null;
  }
  let changed = true;
  while(changed && segments.length>2){
    changed = false;
    const first = segments[0], last = segments[segments.length-1];
    const medFirst = typeMedian(first.isWork), medLast = typeMedian(last.isWork);
    const pFirst = avgPaceFn(first), pLast = avgPaceFn(last);
    if(medFirst && (pFirst>medFirst*factor || pFirst<medFirst/factor)){ segments.shift(); changed=true; continue; }
    if(medLast && (pLast>medLast*factor || pLast<medLast/factor)){ segments.pop(); changed=true; }
  }
  return segments;
}

// Pipeline de détection partagé (allure ET, plus bas, FC) : segmenter puis
// ne garder que la plage cohérente débruitée. Factorisé pour que l'allure
// Work et la FC Work utilisent exactement les mêmes segments — sinon les
// deux mesures pourraient décrire des portions différentes de la séance.
function findWorkoutSegments(paceSeries){
  const avg = pts => { const core=trimSegmentEdges(pts); return core.reduce((a,p)=>a+p.pace,0)/core.length; };
  let segments = findConsistentRun(detectPaceIntervals(paceSeries));
  return trimPaceOutlierEdges(segments, s=>avg(s.points));
}

function computeIntervalPaces(paceSeries){
  if(!paceSeries || paceSeries.length<10) return null;
  const avg = pts => { const core=trimSegmentEdges(pts); return core.reduce((a,p)=>a+p.pace,0)/core.length; };
  const segments = findWorkoutSegments(paceSeries);
  const workAvgs = segments.filter(s=>s.isWork).map(s=>avg(s.points));
  const recoveryAvgs = segments.filter(s=>!s.isWork).map(s=>avg(s.points));
  if(!workAvgs.length) return null;
  return {
    work: Math.round(workAvgs.reduce((a,b)=>a+b,0)/workAvgs.length),
    recovery: recoveryAvgs.length ? Math.round(recoveryAvgs.reduce((a,b)=>a+b,0)/recoveryAvgs.length) : null,
    workCount: workAvgs.length,
    recoveryCount: recoveryAvgs.length,
  };
}

// FC moyenne pendant les phases Work d'un fractionné : réutilise les mêmes
// segments temporels que l'allure Work (findWorkoutSegments), mais moyenne
// les points de hrSeries tombant dans ces fenêtres plutôt que la pace —
// donne le "combien ça a couté en FC" en plus du "à quelle vitesse".
function computeWorkAvgHr(paceSeries, hrSeries){
  if(!paceSeries || paceSeries.length<10 || !hrSeries || hrSeries.length<2) return null;
  const workSegs = findWorkoutSegments(paceSeries).filter(s=>s.isWork);
  if(!workSegs.length) return null;
  const hrSorted = hrSeries.slice().sort((a,b)=>a.t-b.t);
  const segAvgs = workSegs.map(s=>{
    const start = s.points[0].t, end = s.points[s.points.length-1].t;
    const inRange = hrSorted.filter(p=>p.t>=start && p.t<=end).map(p=>p.hr);
    return inRange.length ? inRange.reduce((a,b)=>a+b,0)/inRange.length : null;
  }).filter(v=>v!=null);
  if(!segAvgs.length) return null;
  return Math.round(segAvgs.reduce((a,b)=>a+b,0)/segAvgs.length);
}

// Quand HealthKit a lui-même posé les frontières d'intervalles (une
// HKWorkoutActivity par bloc du plan structuré programmé sur la Watch —
// voir ios-app/HealthKitManager.swift ; PAS des événements .lap, essayés en
// premier, toujours vides) : bien plus fiable que la reconstruction
// heuristique depuis l'allure GPS (findWorkoutSegments), qui doit deviner où
// commence/finit chaque intervalle sur un signal bruité et peut se tromper
// de quelques secondes par frontière. Ici les bornes sont exactes.
// Le plan inclut aussi Warmup/Cooldown (pas juste Work/Récup) : on les
// exclut par leur durée, nettement différente de chaque répétition
// individuelle (ex: Warmup à 2s ou 15min, Cooldown à 15min, vs 1min par
// répétition Work/Récup selon les séances observées) — un filtre à bornes
// symétriques autour de la médiane, plus robuste que de supposer qu'ils
// sont toujours en 1re/dernière position ou toujours plus longs (un plan
// peut ne pas avoir de cooldown, et un warmup peut être quasi instantané).
// Le reste est classé Work/Récup par comparaison à la médiane des allures
// (les plus rapides = Work).
// `m.pace` (quand présent) est calculé nativement côté iOS : distance
// HealthKit exacte sur [m.start,m.end] / durée exacte — pas une moyenne de
// nos échantillons pace_series, dont la méthode de calcul diverge de celle
// d'Apple (écart constant de ~7-9% observé, allure toujours plus lente que
// l'app Fitness). On ne retombe sur l'estimation depuis pace_series que si
// `m.pace` est absent (marker calculé avant l'ajout de ce champ, ou aucune
// distance mesurée par HealthKit sur cette fenêtre précise).
function computeIntervalPacesFromLaps(paceSeries, lapMarkers){
  if(!lapMarkers || lapMarkers.length<2) return null;
  const laps = lapMarkers.map(m=>{
    let pace = m.pace;
    if(pace==null && paceSeries){
      const pts = paceSeries.filter(p=>p.t>=m.start && p.t<=m.end).map(p=>p.pace);
      pace = pts.length ? pts.reduce((a,b)=>a+b,0)/pts.length : null;
    }
    return pace!=null ? {dur:m.end-m.start, pace} : null;
  }).filter(l=>l!=null);
  if(laps.length<2) return null;

  const durMedian = median(laps.map(l=>l.dur));
  const reps = laps.filter(l => l.dur >= durMedian/2.5 && l.dur <= durMedian*2.5);
  const usable = reps.length>=2 ? reps : laps;

  const mid = median(usable.map(l=>l.pace));
  const workPaces = usable.filter(l=>l.pace<mid).map(l=>l.pace);
  const recoveryPaces = usable.filter(l=>l.pace>=mid).map(l=>l.pace);
  if(!workPaces.length) return null;
  return {
    work: Math.round(workPaces.reduce((a,b)=>a+b,0)/workPaces.length),
    recovery: recoveryPaces.length ? Math.round(recoveryPaces.reduce((a,b)=>a+b,0)/recoveryPaces.length) : null,
    workCount: workPaces.length,
    recoveryCount: recoveryPaces.length,
    fromLaps: true,
  };
}

// Exception : pour certaines séances, le pace_series capturé par HealthKit
// est trop épars (échantillonnage ~5min) pour que l'algo puisse fiablement
// isoler les intervalles — alors que l'app Fitness, qui dispose d'une source
// de données interne bien plus fine, y arrive très bien. Dans ce cas
// seulement, une allure Work/Récup saisie manuellement (lue dans l'app
// Fitness) prend le pas sur le calcul automatique.
// Ordre de priorité : saisie manuelle > lap_markers natifs HealthKit >
// reconstruction heuristique depuis le GPS (dans cet ordre de fiabilité).
function getIntervalPaces(run){
  if(run.fracWorkManual){
    return {
      work: run.fracWorkManual,
      recovery: run.fracRecoveryManual || null,
      workCount: null,
      recoveryCount: null,
      manual: true,
    };
  }
  const fromLaps = computeIntervalPacesFromLaps(run.paceSeries, run.lapMarkers);
  if(fromLaps) return fromLaps;
  return run.paceSeries ? computeIntervalPaces(run.paceSeries) : null;
}

/* ============================================================
   Moteur "Programme" — référentiel scientifique running.
   Fonctions pures uniquement (pas d'accès à RUNS/DOM/Supabase),
   pour rester testables isolément dans test.html comme le reste
   de ce fichier. Chaque bloc cite sa source.
   ============================================================ */

/* ---------- VDOT / Daniels' Running Formula ----------
   Source : Daniels & Gilbert (1979), "Oxygen power: representing a
   mathematical connection between measures of aerobic power and running
   performance", Medicine and Science in Sports 11(2) — mêmes formules
   reprises dans Daniels' Running Formula (J. Daniels, Human Kinetics). */

// VO2 (ml/kg/min) requis pour courir à la vitesse v (m/min).
function vo2AtVelocity(v){ return -4.60 + 0.182258*v + 0.000104*v*v; }

// Fraction de VO2max mobilisable en effort maximal soutenu pendant t minutes.
function pctVo2MaxForDuration(t){
  return 0.8 + 0.1894393*Math.exp(-0.012778*t) + 0.2989558*Math.exp(-0.1932605*t);
}

// VDOT à partir d'une perf de référence (distance en km, temps en secondes).
function computeVdot(distanceKm, timeSec){
  if(!distanceKm || !timeSec) return null;
  const t = timeSec/60;
  const v = (distanceKm*1000)/t;
  return vo2AtVelocity(v) / pctVo2MaxForDuration(t);
}

// Inverse de vo2AtVelocity : vitesse (m/min) atteignant un VO2 cible.
// Racine positive de 0.000104v² + 0.182258v − (4.60+vo2) = 0.
function velocityForVo2(vo2Target){
  const a=0.000104, b=0.182258, c=-(4.60+vo2Target);
  return (-b + Math.sqrt(b*b - 4*a*c)) / (2*a);
}

// Pourcentages de VDOT par zone — recoupés sur plusieurs calculateurs
// Daniels publics (convergent sur ces valeurs), approximation du tableau
// original par zones plutôt qu'une formule fermée officiellement publiée.
const VDOT_ZONE_PCT = { easy:0.70, marathon:0.84, threshold:0.88, interval:0.98, repetition:1.05 };

// Description de chaque zone en langage clair, pensée pour un débutant :
// pas de jargon non expliqué (VDOT, ACWR...), des phrases complètes.
// Réutilisée à la fois pour la justification de la séance (ci-dessous) et
// pour l'explication d'allure côté UI (programPaceExplanationHTML,
// index.html) — une seule description à tenir à jour.
const ZONE_FRIENDLY = {
  easy: { name:"Easy", what:"un rythme confortable, où tu peux parler sans être essoufflé", why:"Elle construit ton endurance de fond en douceur, sans te fatiguer — c'est le type de séance le plus fréquent dans un bon programme d'entraînement." },
  threshold: { name:"Seuil", what:"un rythme soutenu mais tenable, juste avant que l'effort devienne vraiment difficile", why:"Elle t'entraîne à repousser le moment où tu commences à t'essouffler, pour tenir plus longtemps à une bonne allure." },
  interval: { name:"Fractionné", what:"des efforts courts et rapides, entrecoupés de phases de récupération", why:"Elle développe ta vitesse et ta capacité à encaisser un effort intense." },
  repetition: { name:"Répétition", what:"un rythme plus rapide que ton allure de course, sur de courtes distances avec une récupération complète entre chaque", why:"Elle améliore ta vitesse pure et ta technique de course." },
  marathon: { name:"Marathon", what:"le rythme que tu pourrais tenir sur la distance d'un marathon", why:"Elle t'habitue à courir longtemps à une allure stable, sans à-coups." },
};

// Zones d'allure (sec/km) à partir d'un VDOT.
function paceZonesFromVdot(vdot){
  const zones = {};
  for(const [key,pct] of Object.entries(VDOT_ZONE_PCT)){
    zones[key] = Math.round(60000 / velocityForVo2(vdot*pct)); // 60000 m / (m/min) = sec/km
  }
  return zones;
}

/* ---------- S8 : « Ton niveau », nouvelles allures, programme à mettre à jour (D62, D72, D73, D76) ----------
   Depuis S8, les allures conseillées ne viennent QUE de « Ton niveau » : un chrono (effort à fond) de moins de
   6 mois, ou le test guidé de 20 minutes. Jamais le record d'Objectifs (souvent ancien, ou réussi un jour
   exceptionnel), jamais un record trouvé dans les courses. Le temps de référence vit dans programSettings :
   refDistanceKm, refTimeSec, refDate (AAAA-MM-JJ), refSource ("chrono" | "test"), refDateApprox (date estimée à la
   reprise d'un compte existant). Seul autre cas : une VMA datée de moins de 6 mois (« Améliorer mon allure »),
   quand aucun « Ton niveau » n'existe. */
const LEVEL_FRESH_MONTHS = 6;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Ajoute `n` mois (négatif pour reculer) à une date AAAA-MM-JJ ; le jour est ramené à la fin du mois si besoin.
function addMonthsStr(dateStr, n){
  const [y,m,d] = dateStr.split("-").map(Number);
  const total = y*12 + (m-1) + n, ny = Math.floor(total/12), nm = total - ny*12;
  const last = new Date(ny, nm+1, 0).getDate();
  return `${ny}-${String(nm+1).padStart(2,"0")}-${String(Math.min(d,last)).padStart(2,"0")}`;
}
// Un temps est « récent » s'il date de moins de 6 mois.
function isLevelDateFresh(dateStr, todayStr){
  if(!ISO_DAY_RE.test(dateStr||"") || !ISO_DAY_RE.test(todayStr||"")) return false;
  return dateStr >= addMonthsStr(todayStr, -LEVEL_FRESH_MONTHS);
}
// Mois proposés pour dater un chrono : le mois en cours et les 6 précédents (tous « récents »).
function levelMonthOptions(todayStr){
  const [y,m] = todayStr.split("-").map(Number), out = [];
  for(let i=0;i<=LEVEL_FRESH_MONTHS;i++){
    const total = y*12 + (m-1) - i, ny = Math.floor(total/12), nm = total - ny*12;
    out.push({ value:`${ny}-${String(nm+1).padStart(2,"0")}`, label:MONTH_NAMES[nm].charAt(0).toUpperCase()+MONTH_NAMES[nm].slice(1)+" "+ny });
  }
  return out;
}
// Mois choisi (« 2026-09 ») → date enregistrée : le 15, sans jamais dépasser aujourd'hui.
function levelDateFromMonth(monthStr, todayStr){
  if(!/^\d{4}-\d{2}$/.test(monthStr||"")) return null;
  const d = monthStr+"-15";
  return d > todayStr ? todayStr : d;
}
// « septembre 2026 » à partir de « 2026-09-15 ».
function levelDateLabel(dateStr){
  if(!ISO_DAY_RE.test(dateStr||"")) return "";
  const [y,m] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[m-1]} ${y}`;
}
const RACE_LABELS = { "5km":"5 km", "10km":"10 km", "15km":"15 km", "Semi":"Semi-marathon", "Marathon":"Marathon" };
// « 14/03/2027 » à partir de « 2027-03-14 ».
function isoToFr(dateStr){
  return ISO_DAY_RE.test(dateStr||"") ? dateStr.split("-").reverse().join("/") : "";
}
// Une distance en mots : { chip:"Semi-marathon", of:"semi-marathon" (« ton record de … »), on:"le semi-marathon" (« sur … ») }.
function levelDistanceName(km){
  const known = [[5,"5 km","5 km","5 km"],[10,"10 km","10 km","10 km"],[15,"15 km","15 km","15 km"],
    [21.0975,"Semi-marathon","semi-marathon","le semi-marathon"],[42.195,"Marathon","marathon","le marathon"]].find(k=>Math.abs(k[0]-km)<0.05);
  if(known) return { chip:known[1], of:known[2], on:known[3] };
  const t = String(Math.round(km*10)/10).replace(".",",")+" km";
  return { chip:t, of:t, on:t };
}

// Résout le temps de référence du moteur VDOT (voir l'en-tête de ce bloc). `todayStr` AAAA-MM-JJ.
// Résultat : { distanceKm, timeSec, source:"level_chrono"|"level_test"|"goal_vma", date, approx, undated, stale }.
// `stale` : plus de 6 mois ; on continue de s'en servir (le programme ne s'arrête pas), mais « Ton niveau » propose
// de le mettre à jour. `undated` : compte existant dont le temps n'a pas de date (question de reprise).
function resolveRunnerProfile(goals, programSettings, todayStr){
  const ps = programSettings || {};
  if(ps.refDistanceKm && ps.refTimeSec){
    const date = ps.refDate || null;
    return {
      distanceKm:Number(ps.refDistanceKm), timeSec:Number(ps.refTimeSec),
      source: ps.refSource==="test" ? "level_test" : ps.refSource==="estimate" ? "level_estimate" : "level_chrono",
      date, approx:!!ps.refDateApprox, undated:!date,
      stale:!!(date && todayStr && !isLevelDateFresh(date, todayStr)),
    };
  }
  const slots = [goals?.principal, goals?.secondaire].filter(Boolean);
  for(const slot of slots){
    if(slot.objectifPrincipal==="Améliorer mon allure" && slot.vmaConnue==="Oui" && slot.vma && slot.vmaDate && todayStr && isLevelDateFresh(slot.vmaDate, todayStr)){
      // VMA en km/h ≈ vitesse tenable ~6 min (protocole de test VMA standard).
      return { distanceKm:Number(slot.vma)*(6/60), timeSec:360, source:"goal_vma", date:slot.vmaDate, approx:false, undated:false, stale:false };
    }
  }
  return null;
}
// Ce sur quoi les allures s'appuient, en une expression (« à partir de … »).
function levelSourceText(profile){
  if(!profile) return "";
  if(profile.source==="goal_vma") return `ta VMA (${String(Math.round(profile.distanceKm*100)/10).replace(".",",")} km/h)`;
  if(profile.source==="level_test") return `ton test de 20 minutes (${String(Math.round(profile.distanceKm*10)/10).replace(".",",")} km)`;
  if(profile.source==="level_estimate") return `ta réponse (5 km en ${fmtDur(profile.timeSec)} environ)`;
  return `ton chrono sur ${levelDistanceName(profile.distanceKm).on} (${fmtDur(profile.timeSec)})`;
}
// Ligne d'état de « Ton niveau » : d'après quoi, de quand, et si c'est à rafraîchir. Allures estimées (R14) : pas de date,
// et une invitation à donner un vrai chrono.
function levelStatus(profile){
  if(!profile) return null;
  if(profile.source==="level_estimate") return { text:`Allures conseillées estimées d'après ${levelSourceText(profile)}. Un chrono récent ou le test de 20 minutes les rendra plus justes.`, stale:false, estimated:true };
  const when = profile.date && !profile.approx ? levelDateLabel(profile.date) : "";
  return { text:`Allures conseillées calculées d'après ${levelSourceText(profile)}${when?`, ${when}`:""}.`, stale:!!profile.stale, estimated:false };
}

// --- Garde-fou « temps trop rapide » (D76, point 4) ---
// Allures conseillées (s/km) d'un temps de référence.
function levelPaceZones(distanceKm, timeSec){
  const v = computeVdot(distanceKm, timeSec);
  return v ? paceZonesFromVdot(v) : null;
}
// Les vraies sorties faciles de la personne (8 dernières semaines) : { medianSecKm, count } ou null s'il y en a moins de 3.
// `runs` : [{ ts, type, distKm, paceSecKm, qualitatif }] ; une sortie facile dont le cœur est monté (qualitatif false) ne compte pas.
function easyPaceReality(runs, todayTs, weeks){
  const from = todayTs - (weeks||8)*7*DAY_MS;
  const paces = (runs||[]).filter(r=>r.type==="EF" && r.qualitatif!==false && r.ts>=from && r.ts<=todayTs+DAY_MS && r.distKm>=2 && r.paceSecKm>0).map(r=>r.paceSecKm);
  return paces.length>=3 ? { medianSecKm:median(paces), count:paces.length } : null;
}
// Le temps donné suggère une allure facile 12 % plus rapide (ou plus) que ce que la personne court vraiment en facile.
const LEVEL_TOO_FAST_RATIO = 1.12;
function refTimeTooFast(distanceKm, timeSec, reality){
  if(!reality) return false;
  const zones = levelPaceZones(distanceKm, timeSec);
  return !!zones && reality.medianSecKm >= zones.easy*LEVEL_TOO_FAST_RATIO;
}
// Formulaire « chrono récent » (A10). `input` : { distanceKm, h, m, s, month } (month : « 2026-09 », « old » = plus de
// 6 mois, vide = pas choisi). Résultat : errors par champ, ok (peut calculer), stale (plus de 6 mois : faire le test
// guidé), tooFast (avertissement violet, qui ne bloque pas), et les valeurs lues.
// « Autre distance » (R1, 08/10/2026) : la formule de Daniels accepte toute distance, mais devient peu fiable sous 3 km.
const CHRONO_KM_MIN = 3, CHRONO_KM_MAX = 42.2;
function levelChronoCheck(input, todayStr, reality){
  const errors = {}, km = Number(input.distanceKm)||0;
  const h = parseInt(input.h,10)||0, m = parseInt(input.m,10)||0, s = parseInt(input.s,10)||0;
  const sec = h*3600 + m*60 + s;
  let plausible = false;
  if(!(km>0)) errors.distance = "Choisis la distance.";
  else if(km<CHRONO_KM_MIN || km>CHRONO_KM_MAX) errors.distance = "Choisis une distance entre 3 et 42 km.";
  if(m>59 || s>59) errors.time = "Les minutes et les secondes vont de 0 à 59.";
  else if(!(sec>0)) errors.time = "Indique ton temps.";
  else if(km>0 && (sec/km<165 || sec/km>840)) errors.time = "Ce temps ne semble pas possible sur cette distance : vérifie les heures, minutes et secondes.";
  else plausible = km>0 && !errors.distance;
  let date = null, stale = false;
  if(!input.month) errors.month = "Indique de quand date ce temps.";
  else if(input.month==="old") stale = true;
  else date = levelDateFromMonth(input.month, todayStr);
  return {
    errors, stale, date, timeSec:sec, distanceKm:km,
    ok: !errors.distance && !errors.time && !errors.month && !stale,
    tooFast: plausible && refTimeTooFast(km, sec, reality),
  };
}

// --- « Tes nouvelles allures » (N3, D72, D76) ---
// Proposée seulement si l'allure facile change d'au moins 5 s/km, après un nouveau chrono ou un nouveau test.
const NEW_PACE_MIN_DELTA_SEC = 5;
const NEW_PACE_ROWS = [["easy","EF"],["threshold","Seuil"],["interval","Fractionné"]];
function newPaceProposal(oldRef, newRef){
  if(!oldRef || !newRef) return null;
  const o = levelPaceZones(oldRef.distanceKm, oldRef.timeSec), n = levelPaceZones(newRef.distanceKm, newRef.timeSec);
  if(!o || !n || Math.abs(o.easy-n.easy) < NEW_PACE_MIN_DELTA_SEC) return null;
  return { faster:n.easy<o.easy, rows:NEW_PACE_ROWS.map(([key,label])=>({ key, label, oldSec:o[key], newSec:n[key] })) };
}
function newPacesOverline(source){ return source==="test" ? "APRÈS TON TEST" : "APRÈS TON CHRONO"; }
function newPacesIntro(source, distanceKm, timeSec, faster){
  const km = String(Math.round(distanceKm*10)/10).replace(".",",");
  if(source==="test") return faster ? `Ton test de 20 minutes (${km} km) montre que tu as progressé.` : `Ton test de 20 minutes (${km} km) donne des allures un peu plus tranquilles : elles suivent ton niveau du moment.`;
  const on = levelDistanceName(distanceKm).on;
  return faster ? `Ton nouveau chrono sur ${on} (${fmtDur(timeSec)}) montre que tu as progressé.` : `Ton nouveau chrono sur ${on} (${fmtDur(timeSec)}) donne des allures un peu plus tranquilles : elles suivent ton niveau du moment.`;
}
// Séances de course à venir dont l'allure peut changer : générées par l'app, pas encore faites, avec une allure visée.
// Une allure choisie à la main n'est jamais touchée, ni le passé.
function sessionsToRepace(plannedSessions, todayStr){
  return (plannedSessions||[]).filter(p=>p.status==="planned" && p.source==="generated" && p.pace_zone && p.target_pace_sec_per_km>0 && p.planned_date>=todayStr);
}

// --- Question de reprise (A10) : comptes dont les allures reposaient sur un record, une VMA ou un temps sans date ---
// Renvoie ce qu'il faut leur demander ({ kind, slotKey?, distanceKm?, timeSec?, vma?, fromTest? }) ou null.
function levelResumeInfo(goals, programSettings, raceDistancesKm){
  const ps = programSettings || {};
  if(ps.refDistanceKm && ps.refTimeSec){
    if(ps.refDate) return null;
    return { kind:"undated", distanceKm:Number(ps.refDistanceKm), timeSec:Number(ps.refTimeSec), fromTest:ps.refSource==="test" || ps.guidedTest?.status==="done" };
  }
  for(const slotKey of ["principal","secondaire"]){
    const slot = goals?.[slotKey];
    if(slot && slot.objectifPrincipal==="Préparer une course" && slot.pbExistant==="Oui" && slot.pbSec && slot.distanceCourse){
      const km = raceDistancesKm?.[slot.distanceCourse];
      if(km) return { kind:"record", slotKey, distanceKm:km, timeSec:Number(slot.pbSec) };
    }
  }
  for(const slotKey of ["principal","secondaire"]){
    const slot = goals?.[slotKey];
    if(slot && slot.objectifPrincipal==="Améliorer mon allure" && slot.vmaConnue==="Oui" && slot.vma && !slot.vmaDate) return { kind:"vma", slotKey, vma:Number(slot.vma) };
  }
  return null;
}
function levelResumeTexts(info){
  if(info.kind==="vma") return { question:`On utilisait ta VMA de ${String(info.vma).replace(".",",")} km/h. Date de ce test ?`, rowLabel:"VMA", rowValue:`${String(info.vma).replace(".",",")} km/h` };
  if(info.kind==="undated" && info.fromTest) return { question:"On utilisait ton test de 20 minutes. Date de ce test ?", rowLabel:"Test 20 min", rowValue:`${String(Math.round(info.distanceKm*10)/10).replace(".",",")} km` };
  const of = levelDistanceName(info.distanceKm).of;
  return { question:`On utilisait ton ${info.kind==="record"?"record":"chrono"} de ${of}. Date de ce temps ?`, rowLabel:`${info.kind==="record"?"Record":"Chrono"} ${of}`, rowValue:fmtDur(info.timeSec) };
}
// Réponse « Il y a moins de 6 mois » : on garde le temps, daté d'il y a environ 3 mois (date estimée, donc `approx`).
// Les autres réponses ne gardent rien : on propose un nouveau chrono ou le test guidé. Renvoie le complément de
// programSettings (record, undated) ou la date de VMA (vma), ou null.
function levelResumePatch(info, answer, todayStr){
  if(!info || answer!=="recent") return null;
  const date = addMonthsStr(todayStr, -3);
  if(info.kind==="record") return { programSettings:{ refDistanceKm:info.distanceKm, refTimeSec:info.timeSec, refDate:date, refDateApprox:true, refSource:"chrono" } };
  if(info.kind==="undated") return { programSettings:{ refDate:date, refDateApprox:true, refSource:info.fromTest?"test":"chrono" } };
  if(info.kind==="vma") return { slotKey:info.slotKey, vmaDate:date };
  return null;
}

// --- Programme à mettre à jour (N4, D62) ---
// Réglages avec lesquels les séances générées ont été construites (programSettings.programSignature).
function programSignature(goals){
  const g = goals || {}, p = g.principal || {}, race = p.objectifPrincipal==="Préparer une course";
  const secOn = g.secondaireEnabled!==undefined ? !!g.secondaireEnabled : !!(g.secondaire && g.secondaire.objectifPrincipal);
  const days = String(g.joursIndisponibles||"").split(",").filter(x=>x!=="").map(Number).filter(n=>!isNaN(n));
  return {
    objectif:p.objectifPrincipal||"", distance:race ? (p.distanceCourse||"") : "", date:race ? (p.dateCible||"") : "",
    secondaire:secOn ? ((g.secondaire && g.secondaire.objectifPrincipal)||"") : "",
    niveau:g.niveau||"", frequence:Number(g.frequence)||3, frequenceAutre:Number(g.frequenceAutre)||0,
    jours:[...new Set(days)].sort((a,b)=>a-b),
  };
}
// Ce qui a changé depuis la dernière construction du programme : clés parmi objectif, secondaire, niveau, frequence,
// frequenceAutre, jours. Sans signature enregistrée, rien à comparer.
function programChanges(prev, cur){
  if(!prev || !cur) return [];
  const out = [];
  if(prev.objectif!==cur.objectif || prev.distance!==cur.distance || prev.date!==cur.date) out.push("objectif");
  if(prev.secondaire!==cur.secondaire) out.push("secondaire");
  if(prev.niveau!==cur.niveau) out.push("niveau");
  if(prev.frequence!==cur.frequence) out.push("frequence");
  if(prev.frequenceAutre!==cur.frequenceAutre) out.push("frequenceAutre");
  if(JSON.stringify(prev.jours)!==JSON.stringify(cur.jours)) out.push("jours");
  return out;
}
const DAYS_LONG_FR = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
const daysListText = (days) => (days&&days.length) ? days.map(d=>DAYS_LONG_FR[d]).join(", ") : "aucun";
function objectiveShortLabel(sig, withDate){
  if(!sig.objectif) return "Aucun";
  if(sig.objectif!=="Préparer une course") return sig.objectif;
  const name = RACE_LABELS[sig.distance] || "Course";
  return withDate && sig.date ? `${name} (${isoToFr(sig.date)})` : name;
}
function objectiveHeadline(sig){
  if(sig.objectif!=="Préparer une course") return sig.objectif || "Aucun objectif";
  return (RACE_LABELS[sig.distance] || "Course") + (sig.date ? ` le ${isoToFr(sig.date)}` : "");
}
// Séances générées à venir qu'une mise à jour remplacerait : ni le passé, ni les séances ajoutées ou modifiées à la
// main, ni le plan marche/course, le test guidé ou la mobilité ajoutée après une douleur.
function recalculableSessions(plannedSessions, todayStr){
  return (plannedSessions||[]).filter(p=>p.status==="planned" && p.source==="generated" && p.planned_date>=todayStr
    && p.generation_reason!=="beginner_plan" && p.generation_reason!=="guided_test"
    && !(!p.pace_zone && p.generation_reason==="pain_repeat_or_wellbeing"));
}
// Texte de la carte « Ton objectif a changé » et lignes de la feuille « Mettre à jour ton programme ».
// `count` : séances à recalculer. Renvoie null s'il n'y a rien à signaler.
function programChangeInfo(prev, cur, count){
  const fields = programChanges(prev, cur);
  if(!fields.length) return null;
  const kind = fields.includes("objectif") ? "objective" : "settings";
  const n = count||0, plural = n>1 ? "s" : "";
  const rows = [];
  if(fields.includes("objectif")){
    let a = objectiveShortLabel(prev,false), b = objectiveShortLabel(cur,false);
    if(a===b){ a = objectiveShortLabel(prev,true); b = objectiveShortLabel(cur,true); }
    rows.push({ key:"objectif", label:"Objectif", from:a, to:b });
  }
  if(fields.includes("secondaire")) rows.push({ key:"secondaire", label:"Objectif secondaire", from:prev.secondaire||"Aucun", to:cur.secondaire||"Aucun" });
  if(fields.includes("niveau")) rows.push({ key:"niveau", label:"Niveau", from:prev.niveau||"—", to:cur.niveau||"—" });
  if(fields.includes("frequence")) rows.push({ key:"frequence", label:"Séances de course / semaine", from:String(prev.frequence), to:String(cur.frequence) });
  if(fields.includes("frequenceAutre")) rows.push({ key:"frequenceAutre", label:"Renfo / mobilité / semaine", from:String(prev.frequenceAutre), to:String(cur.frequenceAutre) });
  if(fields.includes("jours")) rows.push({ key:"jours", label:"Jours indisponibles", from:daysListText(prev.jours), to:daysListText(cur.jours) });
  rows.push({ key:"seances", label:"Séances recalculées", from:null, to:`${n} à venir` });
  const heads = [];
  if(kind==="objective") heads.push(objectiveHeadline(cur));
  else {
    if(fields.includes("frequence")) heads.push(`${cur.frequence} séance${cur.frequence>1?"s":""} de course par semaine`);
    if(fields.includes("frequenceAutre")) heads.push(cur.frequenceAutre ? `${cur.frequenceAutre} renfo / mobilité par semaine` : "Plus de renfo ni de mobilité");
    if(fields.includes("jours")) heads.push(cur.jours.length ? `Indisponible : ${daysListText(cur.jours)}` : "Aucun jour indisponible");
    if(fields.includes("niveau")) heads.push(`Niveau : ${cur.niveau||"—"}`);
    if(fields.includes("secondaire")) heads.push(cur.secondaire ? `Objectif secondaire : ${cur.secondaire}` : "Plus d'objectif secondaire");
  }
  const intro = fields.includes("objectif") && fields.includes("niveau") ? "Ton niveau et ton objectif ont changé."
    : kind==="objective" ? "Ton objectif a changé."
    : fields.length===1 && fields[0]==="niveau" ? "Ton niveau a changé." : "Tes réglages ont changé.";
  return {
    fields, kind, rows, intro,
    overline: kind==="objective" ? "TON OBJECTIF A CHANGÉ" : "TES RÉGLAGES ONT CHANGÉ",
    headline: heads.slice(0,2).join(" · "),
    text: `${kind==="objective" ? "Ton programme suit encore l'ancien objectif." : "Ton programme suit encore tes anciens réglages."} ${n} séance${plural} à recalculer.`,
  };
}

/* ---------- Classification automatique du type de course ----------
   Corrige la règle d'origine côté iOS (RunSync/Models.swift, guessType),
   trop grossière (Running > 10km -> Long, sinon EF, aucune détection de
   Seuil) : plein de séances Seuil ou Long se retrouvaient classées EF par
   défaut. Cette classification vit désormais côté web (seul endroit avec
   accès aux zones cardio) et remplace la proposition initiale de RunSync.
   Règles validées avec l'utilisateur, par ordre de priorité :
   1. Fractionné : looksLikeFractionne(hrSeries) (oscillations de FC).
   2. Seuil : zones 3+4+5 combinées > 50% du temps (looksLikeSeuil).
   3. Long : distance > 10km.
   4. EF : sinon — "qualitatif" (zones 1+2 combinées > 70% du temps) ou pas
      (allure/effort moins homogène) ; `qualitatif` vaut `null` si pas assez
      de données FC pour juger (à ne pas confondre avec `false`, qui veut
      dire "on sait que ce n'est pas un EF propre"). Un EF non qualitatif
      reste un EF (pas de reclassement), mais doit être signalé comme tel
      dans l'affichage plutôt que présenté comme un footing propre. */
// EF « propre » : zones 1 et 2 combinées > 70 % du temps. null = pas assez de
// données de FC pour juger (à ne pas confondre avec false). Sert aussi à décider
// si une sortie EF peut être un record d'allure (D77).
function efQualitatif(hrSeries, maxHr, restingHr){
  if(!hrSeries || hrSeries.length<10 || !maxHr) return null;
  const {secs} = computeHrZoneSeconds(hrSeries, maxHr, restingHr);
  const total = secs.reduce((a,b)=>a+b,0);
  if(total<300) return null;
  const lowZone = secs[0]+secs[1];
  return lowZone/total > 0.7;
}
/* ---------- Détail cardio incomplet (R24, 08/10/2026) ----------
   Apple Santé range parfois la fréquence cardiaque d'une séance en « paquets » (un enregistrement pour 10 à 20 minutes,
   vérifié dans l'export de Leïla : 2 paquets pour sa sortie du 31/01) ; RunSync n'en lit aujourd'hui que la première
   valeur. Moins d'une mesure par minute, ou des mesures qui couvrent moins de 70 % de la séance : pas de courbe ni de
   zones. La FC moyenne et maximale, calculées par Apple, restent justes. */
const HR_MIN_PER_MIN = 1, HR_MIN_COVER = 0.7;
function hrSeriesIncomplete(hrSeries, durationSec){
  const pts = Array.isArray(hrSeries) ? hrSeries.filter(p=>p && p.hr>0) : [];
  const dur = Number(durationSec)||0;
  if(pts.length<2) return true;
  if(dur<=0) return false;
  const ts = pts.map(p=>p.t).sort((a,b)=>a-b);
  return pts.length/(dur/60) < HR_MIN_PER_MIN || (ts[ts.length-1]-ts[0])/dur < HR_MIN_COVER;
}

/* ---------- Suggestion du « Détail cardio » (C9, 07/10/2026) ----------
   Rejouée sur les vraies séances d'Omar et de Leïla (291 avec FC) : l'ancienne règle proposait 63 reclassements, presque
   tous faux : « Fractionné ? » sur 22 renfos, marches et autres activités, « Zone haute ? » sur 5 vrais fractionnés et sur
   des EF tranquilles (les zones dépendent d'une FC max souvent estimée). On ne propose plus que « Fractionné », seulement
   sur une course classée EF, Long ou Récup et jamais vérifiée par l'utilisateur, quand la FC oscille (looksLikeFractionne)
   ET que l'allure confirme au moins 3 blocs rapides, 60 s/km ou plus plus rapides que la récupération (vrais fractionnés :
   ~5 min/km d'écart ; sorties vallonnées : 25 à 80 s). Le « Seuil » est laissé à la carte « Vérifions N sorties » (D109),
   fondée sur l'allure. `run` : { appleType, type, typeChecked, hrSeries, paceSeries }. */
const CARDIO_SUGGEST_TYPES = ["EF","Long","Récup"], CARDIO_MIN_WORK = 3, CARDIO_MIN_GAP = 60;
function cardioTypeSuggestion(run){
  if(!run || run.appleType!=="Running" || run.typeChecked || !CARDIO_SUGGEST_TYPES.includes(run.type)) return null;
  if(!looksLikeFractionne(run.hrSeries)) return null;
  const ip = run.paceSeries && run.paceSeries.length ? computeIntervalPaces(run.paceSeries) : null;
  if(!ip || !(ip.workCount>=CARDIO_MIN_WORK) || !(ip.recovery-ip.work>=CARDIO_MIN_GAP)) return null;
  return "Fractionné";
}
function classifyRunType(distanceKm, hrSeries, maxHr, restingHr){
  if(looksLikeFractionne(hrSeries)) return {type:"Fractionné", qualitatif:true};
  if(looksLikeSeuil(hrSeries, maxHr, restingHr)) return {type:"Seuil", qualitatif:true};
  if(distanceKm>10) return {type:"Long", qualitatif:true};
  return {type:"EF", qualitatif: efQualitatif(hrSeries, maxHr, restingHr)};
}

/* ---------- Détection du niveau depuis l'historique (onboarding, 4.1.b.1) ----------
   CDC v2, 4.1 : "analyse de l'historique si au moins 6 courses sur les 8
   dernières semaines [...] sinon questionnaire [...] puis test guidé".
   Cette fonction ne couvre QUE le premier cas (détection automatique) et
   ne renvoie qu'un niveau qualitatif (Débutant/Intermédiaire/Confirmé) —
   décision prise avec l'utilisateur de rester prudent et de ne PAS en
   déduire un chrono de référence pour les allures (resolveRunnerProfile
   reste la seule source pour ça, une estimation depuis du footing non-
   maximal fausserait les allures calculées).
   Seuils choisis avec l'utilisateur (arbitraires, à ajuster avec des
   retours réels) : moins de 6 courses sur 8 semaines = pas assez de recul
   pour détecter (renvoie null, la cascade passe au questionnaire) ; 6 à 9
   courses = Débutant (pratique encore occasionnelle) ; 16 courses et 120
   km ou plus sur la période = Confirmé (~2 courses/semaine et ~15 km/
   semaine) ; les cas entre les deux = Intermédiaire.
   `runs` : [{date:Date, distanceKm}] déjà filtrés par l'appelant (courses
   incluses aux stats uniquement, comme `runningRuns` côté index.html). */
function detectLevelFromHistory(runs, now){
  const from = new Date(now); from.setDate(from.getDate()-56);
  const recent = (runs||[]).filter(r=>r.date>=from && r.date<=now);
  const count = recent.length;
  if(count<6) return null;
  const totalKm = recent.reduce((a,r)=>a+(r.distanceKm||0),0);
  if(count>=16 && totalKm>=120) return "Confirmé";
  if(count<=9) return "Débutant";
  return "Intermédiaire";
}

// Options de fréquence proposées dans le questionnaire (4.1.b.2) — mêmes
// libellés utilisés côté UI et ici, pour éviter toute divergence de
// formulation entre les deux.
const QUESTIONNAIRE_FREQUENCE_OPTIONS = [
  "Jamais encore",
  "1 fois par semaine ou moins",
  "2 à 3 fois par semaine",
  "4 fois par semaine ou plus",
];

/* ---------- Niveau depuis le questionnaire (onboarding, 4.1.b.2) ----------
   Utilisé uniquement quand detectLevelFromHistory() renvoie null (pas
   assez d'historique) — cascade CDC v2, 4.1 : "questionnaire (fréquence,
   durée max, chrono récent)". Le "chrono récent" n'entre PAS dans ce
   calcul (il sert uniquement à préremplir programSettings.refDistanceKm/
   refTimeSec pour les allures, comme le fait déjà resolveRunnerProfile) —
   volontairement séparé pour ne pas mélanger deux logiques différentes
   (niveau qualitatif vs performance chronométrée).
   Seuils validés avec l'utilisateur : fréquence "jamais encore"/"1x ou
   moins", OU durée max tenue <20min -> Débutant ; fréquence "4x ou plus"
   ET durée max tenue >=45min -> Confirmé ; sinon Intermédiaire. */
function classifyLevelFromQuestionnaire(frequence, dureeMaxMin){
  const lowFreq = frequence==="Jamais encore" || frequence==="1 fois par semaine ou moins";
  const highFreq = frequence==="4 fois par semaine ou plus";
  if(lowFreq || (dureeMaxMin!=null && dureeMaxMin<20)) return "Débutant";
  if(highFreq && dureeMaxMin!=null && dureeMaxMin>=45) return "Confirmé";
  return "Intermédiaire";
}

/* ---------- Programme "marche/course" pour débutant complet (onboarding, 4.1.d) ----------
   Pour un "vrai" débutant complet (niveau Débutant + "Jamais encore couru"
   au questionnaire, 4.1.b.2) : le moteur normal (VDOT/allures) ne peut
   rien générer sans référence de performance. Ce plan la remplace pour
   les 9 premières semaines par un programme en alternance course/marche.
   Pas une source scientifique comme VDOT/ACWR/sRPE — c'est le plan
   "Couch to 5K" du NHS (service de santé publique britannique), un
   standard pratique largement éprouvé plutôt qu'une étude, choisi pour sa
   traçabilité (contrairement à d'innombrables variantes non sourcées).
   Suivi à l'identique, vérifié le 30/09/2026 contre la page officielle :
   https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/
   Chaque séance = une liste de blocs {type:"marche"|"course", sec}, un
   échauffement et un retour au calme de 5 minutes de marche systématiques.
   Semaines 1-4 et 7-9 : les 3 séances de la semaine sont identiques.
   Semaines 5 et 6 : les 3 séances diffèrent (seule exception du plan). */
function couchCycle(runSec, walkSec, times){
  const blocks = [];
  for(let i=0;i<times;i++){ blocks.push({type:"course",sec:runSec}); blocks.push({type:"marche",sec:walkSec}); }
  return blocks;
}
function withWarmup(blocks){
  return [{type:"marche",sec:300}, ...blocks, {type:"marche",sec:300}];
}
const COUCH_TO_5K_PLAN = {
  1: [{ label:"Course 1min / marche 1min30, répété 7 fois + 1min de course finale",
        segments: withWarmup([...couchCycle(60,90,7), {type:"course",sec:60}]) }],
  2: [{ label:"Course 1min30 / marche 2min, répété 5 fois + 1min30 de course finale",
        segments: withWarmup([...couchCycle(90,120,5), {type:"course",sec:90}]) }],
  3: [{ label:"1min30 course / 1min30 marche / 3min course / 3min marche / 1min30 course / 1min30 marche / 3min course finale",
        segments: withWarmup([{type:"course",sec:90},{type:"marche",sec:90},{type:"course",sec:180},{type:"marche",sec:180},{type:"course",sec:90},{type:"marche",sec:90},{type:"course",sec:180}]) }],
  4: [{ label:"3min course / 1min30 marche / 5min course / 2min30 marche / 3min course / 1min30 marche / 5min course finale",
        segments: withWarmup([{type:"course",sec:180},{type:"marche",sec:90},{type:"course",sec:300},{type:"marche",sec:150},{type:"course",sec:180},{type:"marche",sec:90},{type:"course",sec:300}]) }],
  5: [
    { label:"5min course / 3min marche / 5min course / 3min marche / 5min course",
      segments: withWarmup([{type:"course",sec:300},{type:"marche",sec:180},{type:"course",sec:300},{type:"marche",sec:180},{type:"course",sec:300}]) },
    { label:"8min course / 5min marche / 8min course",
      segments: withWarmup([{type:"course",sec:480},{type:"marche",sec:300},{type:"course",sec:480}]) },
    { label:"20 minutes de course continue",
      segments: withWarmup([{type:"course",sec:1200}]) },
  ],
  6: [
    { label:"5min course / 3min marche / 8min course / 3min marche / 5min course",
      segments: withWarmup([{type:"course",sec:300},{type:"marche",sec:180},{type:"course",sec:480},{type:"marche",sec:180},{type:"course",sec:300}]) },
    { label:"10min course / 3min marche / 10min course",
      segments: withWarmup([{type:"course",sec:600},{type:"marche",sec:180},{type:"course",sec:600}]) },
    { label:"25 minutes de course continue",
      segments: withWarmup([{type:"course",sec:1500}]) },
  ],
  7: [{ label:"25 minutes de course continue", segments: withWarmup([{type:"course",sec:1500}]) }],
  8: [{ label:"28 minutes de course continue", segments: withWarmup([{type:"course",sec:1680}]) }],
  9: [{ label:"30 minutes de course continue", segments: withWarmup([{type:"course",sec:1800}]) }],
};
// Renvoie toujours exactement 3 séances (répète l'unique structure des
// semaines qui n'en ont qu'une) — semaine invalide (hors 1-9) -> null,
// pour laisser l'appelant décider de la "graduation" vers le programme
// normal une fois les 9 semaines terminées (pas géré ici : orchestration
// à faire au moment de brancher ce plan dans l'onglet Programme).
function couchTo5kWeekSessions(week){
  const templates = COUCH_TO_5K_PLAN[week];
  if(!templates) return null;
  return templates.length===3 ? templates : [templates[0], templates[0], templates[0]];
}
function couchTo5kSessionDurationSec(session){
  return session.segments.reduce((a,b)=>a+b.sec,0);
}

/* ---------- Parcours de démarrage (onboarding, 4.1.a) ----------
   Fonctions pures du parcours guidé (l'écran est dans index.html).
   Durée maximale tenue sans s'arrêter : options du questionnaire (4.1.b.2)
   et la valeur en minutes qu'on en tire pour classifyLevelFromQuestionnaire
   (une valeur représentative par tranche, choisie avec l'utilisateur :
   5 / 15 / 25 / 40 / 50 min — 40 reste < 45, 50 est >= 45). */
const ONBOARDING_DUREE_OPTIONS = [
  ["Moins de 10 min", 5], ["10 à 20 min", 15], ["20 à 30 min", 25], ["30 à 45 min", 40], ["Plus de 45 min", 50],
];
// Programme marche/course du NHS plutôt que le moteur VDOT (4.1.d) : niveau
// Débutant ET (jamais couru OU incapable de courir 20 minutes d'affilée).
// Le second cas complète la règle d'origine ("jamais encore" seulement) :
// sans lui, quelqu'un qui court un peu mais moins de 20 min n'aurait ni le
// plan débutant ni la possibilité de faire le test guidé de 20 minutes.
function isBeginnerPlanEligible(niveau, frequence, dureeMaxMin){
  return niveau==="Débutant" && (frequence==="Jamais encore" || (dureeMaxMin!=null && dureeMaxMin<20));
}
// Semaines entre aujourd'hui et la date visée, arrondies au supérieur (même
// règle que le texte "Il te reste N semaines" de l'onglet Profil). null si
// pas de date ; 0 si la date est passée ou imminente.
function weeksUntilDate(dateStr, todayStr){
  if(!dateStr) return null;
  // Jours en UTC : avec des dates locales, le changement d'heure d'octobre ajoutait un jour (donc parfois une semaine de trop).
  const utc = (str) => { const [y,m,d] = str.split("-").map(Number); return Date.UTC(y, m-1, d); };
  const days = Math.round((utc(dateStr) - utc(todayStr)) / 86400000);
  return Math.max(0, Math.ceil(days/7));
}
// Lundi où démarre le programme marche/course : cette semaine si on est du
// lundi au mercredi (3 séances espacées tiennent encore), sinon la semaine
// suivante. `todayStr` AAAA-MM-JJ -> AAAA-MM-JJ.
function beginnerPlanStartMonday(todayStr){
  const [y,m,d] = todayStr.split("-").map(Number);
  const today = new Date(y, m-1, d);
  const dow = (today.getDay()+6)%7; // lundi=0
  const monday = new Date(today); monday.setDate(today.getDate()-dow);
  if(dow>=3) monday.setDate(monday.getDate()+7);
  return monday.getFullYear()+"-"+String(monday.getMonth()+1).padStart(2,"0")+"-"+String(monday.getDate()).padStart(2,"0");
}
/* Réponses du parcours -> données du profil. `state` : {objectif,
   distanceCourse, dateCible, niveau, frequenceHistorique, frequence,
   joursIndisponibles:[0-6], chronoDistance (clé de course), chronoSec,
   chronoDate (AAAA-MM-JJ, facultatif), frequenceAutre, terrain,
   equipement:[…] (écran « Ton profil coureur », D108 ; absents = réglages du
   profil gardés)}.
   Un chrono saisi devient le temps de référence du moteur (« Ton niveau » :
   programSettings.refDistanceKm/refTimeSec/refDate/refSource), jamais un record
   (pbSec). Sans date précise (« chrono récent »), il est daté d'il y a 3 mois
   environ (refDateApprox) quand `todayStr` est fourni. Le programme mémorise
   les réglages avec lesquels il sera construit (programSignature, s'il n'en
   avait pas déjà une), pour signaler plus tard un changement (D62).
   Le plan débutant garde sa date de départ s'il est déjà en cours. */
function onboardingProfilePatch(state, goals, programSettings, raceDistancesKm, startMondayStr, todayStr){
  const prev = goals || {};
  const principal = { ...(prev.principal||{}), objectifPrincipal: state.objectif };
  if(state.objectif==="Préparer une course"){
    if(state.distanceCourse) principal.distanceCourse = state.distanceCourse;
    principal.dateCible = state.dateCible || "";
  }
  const newGoals = {
    ...prev, principal,
    niveau: state.niveau,
    frequence: String(state.frequence),
    joursIndisponibles: (state.joursIndisponibles||[]).slice().sort((a,b)=>a-b).join(","),
  };
  // Renfo/mobilité compte dans le programme (programSignature) : demandé avant sa création, plus de « Tes réglages ont
  // changé » juste après le parcours (tests d'Omar du 07/10/2026). Terrain et équipement complètent le profil.
  if(state.frequenceAutre!=null && state.frequenceAutre!=="") newGoals.frequenceAutre = String(state.frequenceAutre);
  if(state.terrain) newGoals.terrain = state.terrain;
  if(Array.isArray(state.equipement)) newGoals.equipement = state.equipement.join(",");
  const ps = { ...(programSettings||{}) };
  // « Autre distance » (R1) : `chronoKm` (km saisis) passe avant la distance choisie parmi les pastilles.
  const km = Number(state.chronoKm)>0 ? Number(state.chronoKm) : (raceDistancesKm ? raceDistancesKm[state.chronoDistance] : null);
  const chronoGiven = !!(km && state.chronoSec>0);
  if(chronoGiven){
    ps.refDistanceKm = km; ps.refTimeSec = state.chronoSec; ps.refSource = "chrono";
    if(state.chronoDate){ ps.refDate = state.chronoDate; delete ps.refDateApprox; }
    else if(todayStr){ ps.refDate = addMonthsStr(todayStr, -3); ps.refDateApprox = true; }
  }
  const beginner = isBeginnerPlanEligible(state.niveau, state.frequenceHistorique, state.dureeMax);
  if(beginner) ps.beginnerPlan = ps.beginnerPlan || { startMonday: startMondayStr };
  else delete ps.beginnerPlan;
  // Sans chrono, le programme est créé quand même (R14, 08/10/2026 : le test de 20 minutes obligatoire bloquait le
  // programme) : allures estimées d'après une fourchette de temps sur 5 km, ou le temps type du niveau déclaré. Un vrai
  // temps de référence déjà connu (chrono, test) n'est jamais remplacé par une estimation.
  if(!beginner && !chronoGiven){
    const realRef = ps.refTimeSec && ps.refSource!=="estimate";
    if(!realRef && (state.estimateKey || !ps.refTimeSec)){
      ps.refDistanceKm = 5; ps.refTimeSec = estimate5kSec(state.estimateKey, state.niveau); ps.refSource = "estimate";
      if(todayStr) ps.refDate = todayStr;
      delete ps.refDateApprox;
    }
  }
  const hasReference = !!(ps.refTimeSec);
  const needsGuidedTest = !beginner && !hasReference;
  if(needsGuidedTest) ps.guidedTest = ps.guidedTest || { status:"pending" };
  // Un compte qui a déjà un programme garde sa signature : un changement d'objectif fait avec le parcours sera signalé (D62).
  if(!ps.programSignature) ps.programSignature = programSignature(newGoals);
  return { goals:newGoals, programSettings:ps, beginner, needsGuidedTest, estimated: !beginner && ps.refSource==="estimate" };
}
// « Une idée, à peu près ? » (R14) : fourchettes de temps sur 5 km, on garde le milieu ; « Aucune idée » : temps type du
// niveau déclaré. [libellé, clé, secondes].
const ESTIMATE_5K_OPTIONS = [["Moins de 25 min","lt25",1440],["25 à 30 min","25-30",1650],["30 à 35 min","30-35",1950],
  ["35 à 40 min","35-40",2250],["Plus de 40 min","gt40",2700],["Aucune idée","none",null]];
const ESTIMATE_5K_BY_LEVEL = { "Débutant":2280, "Intermédiaire":1800, "Confirmé":1500 };
function estimate5kSec(key, niveau){
  const o = ESTIMATE_5K_OPTIONS.find(x=>x[1]===key);
  return (o && o[2]) || ESTIMATE_5K_BY_LEVEL[niveau] || ESTIMATE_5K_BY_LEVEL["Intermédiaire"];
}
// Écran « Ton profil coureur » du parcours (D108). Équipement : plusieurs choix possibles, « Aucun » exclut les autres
// (et un appareil choisi retire « Aucun »).
function toggleEquipement(list, value){
  const cur = (list||[]).filter(Boolean);
  if(cur.includes(value)) return cur.filter(v=>v!==value);
  if(value==="Aucun") return ["Aucun"];
  return [...cur.filter(v=>v!=="Aucun"), value];
}
function renfoHint(n){
  const k = Number(n)||0;
  if(k<=0) return "Que de la course : pas de renfo ni de mobilité.";
  return `${k} séance${k>1?"s":""} de gainage, musculation ou étirements en plus de la course.`;
}
// Écran « Tout est prêt » (D108) : la prochaine séance prévue à partir d'aujourd'hui ; le même jour, la course avant
// le renfo ou la mobilité.
function nextPlannedSession(sessions, todayStr){
  const later = (s) => NON_RUNNING_SESSION_TYPES.includes(normalizeSessionType(s.type)) ? 1 : 0;
  return (sessions||[]).filter(s => s && s.status==="planned" && String(s.planned_date||"") >= todayStr)
    .sort((a,b) => String(a.planned_date).localeCompare(String(b.planned_date)) || later(a)-later(b))[0] || null;
}

/* ---------- Génération du plan marche/course (4.1.d) ----------
   Branche le plan NHS (COUCH_TO_5K_PLAN, ci-dessus) dans le Programme.
   `startMonday` : lundi de la semaine 1 (programSettings.beginnerPlan).
   Numéro de semaine : 1 pour la semaine de départ ; <1 avant le départ,
   >9 après la fin (l'appelant décide de la "graduation", voir la bannière
   d'Aujourd'hui). 3 séances par semaine, espacées au maximum (jamais 2
   jours de suite si on peut l'éviter) : choix pragmatique, le NHS demande
   seulement des jours de repos entre les séances. */
const COUCH_WEEKS = 9;
function couchWeekNumber(startMondayStr, weekMondayStr){
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  return Math.round((parse(weekMondayStr) - parse(startMondayStr)) / (7*86400000)) + 1;
}
// Choisit `n` jours parmi `available` (indices 0-6) : écart minimum entre
// deux séances le plus grand possible, puis étendue la plus large, puis les
// jours les plus tôt dans la semaine.
function pickSpacedDays(available, n){
  const days = [...new Set(available||[])].sort((a,b)=>a-b);
  if(n<=0) return [];
  if(days.length<=n) return days;
  let best = null;
  const choose = (start, picked) => {
    if(picked.length===n){
      const gaps = picked.slice(1).map((d,i)=>d-picked[i]);
      const minGap = gaps.length ? Math.min(...gaps) : Infinity;
      const span = picked[picked.length-1]-picked[0];
      if(!best || minGap>best.minGap || (minGap===best.minGap && span>best.span)) best = { picked:[...picked], minGap, span };
      return;
    }
    for(let i=start;i<days.length;i++){ picked.push(days[i]); choose(i+1, picked); picked.pop(); }
  };
  choose(0, []);
  return best.picked;
}
// Première semaine incomplète (R26, 08/10/2026) : jusqu'à `n` jours parmi `available`, jamais deux jours de suite ;
// on en place moins s'il le faut (le programme ne se tasse pas sur les derniers jours de la semaine).
function pickNonConsecutiveDays(available, n){
  for(let k=Math.min(n, [...new Set(available||[])].length); k>0; k--){
    const picked = pickSpacedDays(available, k);
    if(picked.every((d,i)=>i===0 || d-picked[i-1]>=2)) return picked;
  }
  return [];
}
// Lignes de séances d'une semaine du plan : `dayIndexes` (jours choisis),
// `firstSessionNumber` (1 pour la première séance de la semaine ; plus si
// une séance existe déjà). Renvoie [{dayIndex,title,description,durationMin,rationale}].
function couchSessionRows(week, dayIndexes, firstSessionNumber){
  const templates = couchTo5kWeekSessions(week);
  if(!templates) return [];
  return dayIndexes.map((dayIndex, i) => {
    const number = (firstSessionNumber||1) + i;
    const t = templates[(number-1)%3];
    return {
      dayIndex,
      title: `Marche/course — semaine ${week}, séance ${number}`,
      description: `Échauffement : 5 min de marche rapide.\n${t.label}.\nRetour au calme : 5 min de marche.`,
      durationMin: Math.round(couchTo5kSessionDurationSec(t)/60),
      rationale: `Ce programme alterne marche et course pour que ton corps s'habitue progressivement à courir, jusqu'à 30 minutes d'affilée à la fin de la semaine ${COUCH_WEEKS}. C'est le programme « Couch to 5K » du NHS (service de santé britannique). Semaine ${week} sur ${COUCH_WEEKS}.`,
    };
  });
}

/* ---------- Test guidé de 20 minutes (onboarding, 4.1.e) ----------
   CDC v2, 4.1 : dernier palier de la cascade de niveau, pour qui n'a ni
   historique ni chrono. Une séance où l'on court 20 minutes à allure
   soutenue mais régulière ; la distance parcourue donne le temps de
   référence du moteur (computeVdot accepte tout effort de 3,5 min à 3 h,
   Daniels & Gilbert 1979). Protocole choisi avec l'utilisateur (pas une
   méthode publiée) : l'effort étant un peu en dessous d'une vraie course,
   les allures calculées sont prudentes, et s'affinent avec les séances. */
function guidedTestSession(){
  return {
    title: "Test de 20 minutes",
    description: "Échauffement : 10 min de footing très léger, sans enregistrer l'activité.\nTest : lance l'enregistrement de ta montre et cours 20 minutes à une allure soutenue mais que tu peux tenir régulièrement du début à la fin, sans partir trop vite. Tu dois pouvoir dire quelques mots, pas une phrase entière. Arrête l'enregistrement au bout des 20 minutes.\nRetour au calme : 5 min de marche.",
    durationMin: 35,
    rationale: "On ne connaît pas encore ton niveau en course. Cette séance sert à le mesurer : la distance que tu parcours en 20 minutes nous permet de calculer tes allures d'entraînement, puis de te construire ton programme.",
  };
}
// Une course peut servir de test si elle dure entre 15 et 35 minutes et
// couvre au moins 1,5 km ; renvoie le temps de référence ou la raison du refus.
function evaluateGuidedTestRun(distanceKm, durationSec){
  if(!(distanceKm>=1.5)) return { ok:false, reason:"distance" };
  if(!(durationSec>=900 && durationSec<=2100)) return { ok:false, reason:"duree" };
  return { ok:true, refDistanceKm: Math.round(distanceKm*100)/100, refTimeSec: Math.round(durationSec) };
}

/* ---------- Textes "En savoir plus" par type de séance (CDC v2, 4.10.b) ----------
   Un texte long par type de séance, en 3 blocs (à quoi ça sert / comment la
   faire / pourquoi) + sources. Ton : coach bienveillant, tutoiement, jamais
   de culpabilisation, toujours une raison derrière un conseil (4.10.c).
   Chaque affirmation scientifique cite une source vérifiée sur la page
   d'origine (02/10/2026) :
   - Higdon : https://www.halhigdon.com/training-programs/marathon-training/advanced-1-marathon/
     (sections Tempo Runs, Interval Training, Race Pace)
   - NHS : https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/
   - Blagrove et al. (2018), Sports Medicine, PMID 29249083
   - Lauersen et al. (2014), British Journal of Sports Medicine, PMID 24100287
   - Seiler & Kjerland (2006), Scand J Med Sci Sports 16:49-56
   - CDC, "How to Measure Physical Activity Intensity" (test de la conversation)
   Yoga : aucune étude citée, la séance est proposée pour le bien-être. */
const SESSION_LEARN_MORE = {
  easy: {
    title: "La sortie easy",
    blocks: [
      { h:"À quoi ça sert ?", p:"C'est la base de ton entraînement. À allure tranquille, ton cœur, tes muscles et tes tendons s'adaptent petit à petit, sans accumuler de fatigue. Chez les athlètes d'endurance étudiés par Seiler et Kjerland, environ les trois quarts de l'entraînement se faisaient à cette intensité douce." },
      { h:"Comment la faire ?", p:"Cours à un rythme où tu peux tenir une conversation : une phrase complète sans reprendre ton souffle. Si tu ne peux dire que quelques mots, tu vas trop vite, ralentis. Si tu hésites entre deux allures, prends la plus lente." },
      { h:"Pourquoi lentement ?", p:"Parce que courir trop vite ces jours-là te fatigue pour les séances importantes, sans te faire progresser davantage. Une sortie easy réussie, c'est une sortie après laquelle tu te sens bien." },
    ],
    sources: "Seiler & Kjerland (2006), Scandinavian Journal of Medicine & Science in Sports 16:49-56 ; CDC, « How to Measure Physical Activity Intensity » (test de la conversation).",
  },
  marathon: {
    title: "La séance à allure marathon",
    blocks: [
      { h:"À quoi ça sert ?", p:"À t'habituer à tenir longtemps une allure régulière, celle que tu pourrais garder sur la distance d'un marathon. Ton corps et ta tête apprennent à rester stables, sans à-coups." },
      { h:"Comment la faire ?", p:"Cours à l'allure indiquée, la même du début à la fin de la partie rapide. Hal Higdon définit l'allure de course comme le rythme que tu prévois de tenir le jour de la course pour laquelle tu t'entraînes, et c'est ce rythme qu'il demande dans ces séances." },
      { h:"Pourquoi ?", p:"La répéter à l'entraînement la rend familière. Si elle te semble beaucoup trop difficile, ralentis : le but est de finir la séance avec de l'énergie, pas de te mettre à bout." },
    ],
    sources: "Hal Higdon, programme Advanced 1 Marathon (halhigdon.com), section « Race Pace ».",
  },
  threshold: {
    title: "La séance au seuil",
    blocks: [
      { h:"À quoi ça sert ?", p:"À repousser le moment où l'effort devient vraiment difficile, pour tenir plus longtemps à une bonne allure. C'est un effort soutenu, mais que tu peux maîtriser." },
      { h:"Comment la faire ?", p:"Cours à un rythme soutenu où tu ne peux dire que quelques mots à la fois. Hal Higdon décrit la sortie « tempo » comme une course continue avec une montée en rythme au milieu, jusqu'à près de l'allure d'un 10 km, le pic arrivant environ aux deux tiers de la séance et seulement pendant quelques minutes." },
      { h:"Pourquoi garder le contrôle ?", p:"Cette séance est efficace parce qu'elle reste maîtrisée : si tu pars trop vite, tu devras ralentir avant la fin et tu en retireras moins. Termine en te disant que tu aurais pu en faire un tout petit peu plus." },
    ],
    sources: "Hal Higdon, programme Advanced 1 Marathon (halhigdon.com), section « Tempo Runs ».",
  },
  interval: {
    title: "Le fractionné et les répétitions",
    blocks: [
      { h:"À quoi ça sert ?", p:"À développer ta vitesse et ta capacité à encaisser un effort intense. Le fractionné alterne des efforts rapides et des récupérations ; les répétitions sont des efforts encore plus courts et plus rapides, avec une récupération complète entre chacun." },
      { h:"Comment le faire ?", p:"Hal Higdon donne cet exemple : courir un 800 m plus vite que l'allure marathon, récupérer en trottinant ou en marchant 400 m, puis recommencer. Respecte les allures et les temps de récupération indiqués dans ta séance." },
      { h:"Pourquoi des récupérations ?", p:"Elles font partie de la séance : elles te permettent de refaire chaque effort à la bonne allure. Si tu n'arrives plus à tenir l'allure, termine la séance plutôt que de forcer. Dans ton programme, ces séances restent une minorité (environ 20 % de l'entraînement) pour que ton corps ait le temps de récupérer." },
    ],
    sources: "Hal Higdon, programme Advanced 1 Marathon (halhigdon.com), section « Interval Training » ; répartition 80/20 : Seiler & Kjerland (2006).",
  },
  couch: {
    title: "Le programme marche/course",
    blocks: [
      { h:"À quoi ça sert ?", p:"À habituer ton corps à courir en douceur. En alternant marche et course, ton souffle, tes muscles et tes articulations s'adaptent sans être brusqués. Chaque semaine, tu cours un peu plus, jusqu'à pouvoir courir 30 minutes sans t'arrêter." },
      { h:"Comment la faire ?", p:"Fais 3 séances par semaine, avec des jours de repos entre elles, et cours à un rythme qui te convient, sans chercher la vitesse. Si tu es essoufflé, ralentis ou marche un peu plus longtemps : l'important est de terminer la séance." },
      { h:"Pourquoi y aller doucement ?", p:"Parce que progresser doucement limite les risques de blessure et te laisse l'envie de continuer. Tu n'es pas obligé de suivre le rythme de 9 semaines : le NHS précise qu'on peut mettre plus longtemps si c'est ce qui te convient, et tu peux déplacer tes séances." },
    ],
    sources: "NHS, « Couch to 5K » (nhs.uk) : 3 séances par semaine avec des jours de repos entre elles, à un rythme qui te convient, en 9 semaines ou plus.",
  },
  test: {
    title: "Le test de 20 minutes",
    blocks: [
      { h:"À quoi ça sert ?", p:"À mesurer ton niveau du moment, pour calculer des allures d'entraînement qui te correspondent et te construire ton programme." },
      { h:"Comment le faire ?", p:"Échauffe-toi 10 minutes en footing très léger sans enregistrer l'activité, puis lance l'enregistrement de ta montre et cours 20 minutes à une allure soutenue mais que tu peux tenir régulièrement du début à la fin. Pars plutôt prudemment : si tu t'essouffles trop vite, c'est que tu es parti trop fort. Arrête l'enregistrement au bout des 20 minutes." },
      { h:"Pourquoi ce test ?", p:"On convertit la distance parcourue en niveau de forme grâce à une formule de Daniels et Gilbert (1979), puis on en déduit tes allures. Comme ce test est un peu moins exigeant qu'une vraie course, tes allures seront prudentes au début, puis elles s'affineront avec tes séances. Il n'y a ni bon ni mauvais résultat." },
    ],
    sources: "Daniels & Gilbert (1979), Medicine and Science in Sports 11(2), reprise dans Daniels' Running Formula. Le protocole de 20 minutes est celui de l'application.",
  },
  Renfo: {
    title: "La séance de renfo",
    blocks: [
      { h:"À quoi ça sert ?", p:"À renforcer les muscles qui te portent à chaque foulée. Une revue de 24 études chez des coureurs (Blagrove et al., 2018) montre que le renforcement améliore en général l'économie de course (de 2 à 8 % selon les études) et les performances sur 1,5 à 10 km, même si ce n'est pas le cas dans toutes les études. Dans une méta-analyse de 25 essais sur le sport en général (Lauersen et al., 2014), il réduisait les blessures à moins d'un tiers du niveau habituel." },
      { h:"Comment la faire ?", p:"Fais chaque exercice de façon contrôlée, en suivant les consignes et l'animation. Aucune douleur ne doit apparaître : si un mouvement fait mal, arrête-le et prends la variante proposée ou passe au suivant. Une fatigue musculaire agréable est normale." },
      { h:"Pourquoi à ce moment-là ?", p:"On place le renfo un jour sans course, et jamais la veille d'une sortie, pour que tes jambes soient fraîches. La revue de Blagrove conclut que 2 à 3 séances de renforcement par semaine sont susceptibles d'apporter un bénéfice aux coureurs." },
    ],
    sources: "Blagrove et al. (2018), Sports Medicine, PMID 29249083 ; Lauersen et al. (2014), British Journal of Sports Medicine, PMID 24100287.",
  },
  "Mobilité": {
    title: "La séance de mobilité",
    blocks: [
      { h:"À quoi ça sert ?", p:"À entretenir l'amplitude de tes mouvements et à prendre soin des zones qui te gênent. Si une douleur est revenue, ces exercices peuvent t'aider à la soulager." },
      { h:"Comment la faire ?", p:"Va doucement, sans chercher la douleur : tu dois sentir une tension agréable, jamais une douleur vive. Respire calmement et prends ton temps sur chaque exercice. Si une gêne persiste, pense à consulter un médecin ou un kiné." },
      { h:"À savoir", p:"Dans la méta-analyse de Lauersen et al. (2014), les étirements seuls n'ont pas montré de baisse du nombre de blessures, contrairement au renforcement. La mobilité reste utile pour le confort et l'amplitude, mais elle ne remplace pas le renfo." },
    ],
    sources: "Lauersen et al. (2014), British Journal of Sports Medicine, PMID 24100287.",
  },
  Yoga: {
    title: "La séance de yoga",
    blocks: [
      { h:"À quoi ça sert ?", p:"À détendre ton corps et ta tête entre deux sorties : respiration, souplesse et relâchement." },
      { h:"Comment la faire ?", p:"Reste dans le confort : la respiration guide le mouvement, et tu ne cherches ni la performance ni la douleur. Si une posture te gêne, adapte-la ou passe-la." },
      { h:"Pourquoi ?", p:"On te la propose pour ton bien-être et ta récupération active. Elle ne remplace ni une sortie de course ni du renforcement. On ne cite pas d'étude ici : ce n'est pas proposé pour un gain de performance démontré." },
    ],
    sources: "",
  },
};
// Clé du texte "En savoir plus" d'une séance planifiée, ou null si aucun texte.
function learnMoreKey(session){
  if(!session) return null;
  if(session.generation_reason==="beginner_plan") return "couch";
  if(session.generation_reason==="guided_test") return "test";
  if(session.pace_zone){
    if(session.pace_zone==="interval" || session.pace_zone==="repetition") return "interval";
    return SESSION_LEARN_MORE[session.pace_zone] ? session.pace_zone : null;
  }
  return SESSION_LEARN_MORE[session.type] ? session.type : null;
}

/* ---------- Éléments dynamiques (CDC v2, 4.11) : fonctions pures ----------
   Texte d'un chiffre qui s'anime (compteur) : la même fonction produit les
   valeurs intermédiaires et la valeur finale, donc l'affichage final est
   identique avec ou sans animation. Formats : km, int, min (1 h 25),
   pct (signe dans opts.sign), frac ("6/8 sem.", total dans opts.total). */
function formatCountUp(value, format, opts){
  const o = opts || {};
  const n = Number(value) || 0;
  if(format==="km") return n.toLocaleString("fr-FR", { maximumFractionDigits:1 })+" km";
  if(format==="int") return String(Math.round(n));
  if(format==="min") return formatMinutesShort(n);
  if(format==="pct") return (o.sign||"")+Math.round(Math.abs(n))+" %";
  if(format==="frac") return Math.round(n)+"/"+o.total+" sem.";
  return String(n);
}
/* Structure d'une séance structurée (barre de 4.11.d) : liste de blocs
   {type, sec}. Plan marche/course : les blocs du plan NHS de la semaine et
   de la séance lues dans le titre ("… semaine W, séance N"). Test guidé :
   10 min de footing léger, 20 min de test, 5 min de marche. null pour les
   autres séances (pas de structure à montrer). */
function sessionStructureSegments(session){
  if(!session) return null;
  if(session.generation_reason==="guided_test"){
    return [{type:"facile",sec:600},{type:"test",sec:1200},{type:"marche",sec:300}];
  }
  if(session.generation_reason==="beginner_plan"){
    const m = /semaine (\d+), séance (\d+)/.exec(session.title||"");
    if(!m) return null;
    const templates = couchTo5kWeekSessions(Number(m[1]));
    if(!templates) return null;
    return templates[(Number(m[2])-1)%3].segments.map(x=>({ type:x.type, sec:x.sec }));
  }
  return null;
}

/* ---------- Records et célébrations (CDC v2, 4.11.f) ----------
   Records célébrés (liste validée avec l'utilisateur) : plus longue sortie
   (distance), plus longue durée, meilleure allure en sortie easy (EF),
   meilleure allure de travail en fractionné, et amélioration de
   l'efficience cardiaque (detectEfficiencyImprovement, 4.3.e).
   Garde-fous (choix pragmatiques) : au moins 3 séances précédentes pour
   parler de record (pas de "record" à la première sortie) ; marge minimale
   (+0,1 km, +60 s, -1 s/km) pour ignorer le bruit de mesure ; allure EF
   seulement sur des sorties d'au moins 3 km. Seules les séances ANTÉRIEURES
   comptent comme référence. `run`/`allRuns` : {id, ts (ms), type, distKm,
   durationSec, paceSecKm, workPaceSecKm}. */
function recordsForRun(run, allRuns){
  const prev = (allRuns||[]).filter(r=>r.ts < run.ts);
  const records = [];
  if(prev.length>=3){
    const maxDist = Math.max(...prev.map(r=>r.distKm||0)), maxDur = Math.max(...prev.map(r=>r.durationSec||0));
    if(run.distKm >= maxDist + 0.1) records.push({ key:"distance", value:run.distKm, previous:maxDist });
    if(run.durationSec >= maxDur + 60) records.push({ key:"duree", value:run.durationSec, previous:maxDur });
  }
  // D77 : un record d'allure EF ne compte que pour une sortie réellement facile (cœur resté
  // en zones 1 et 2, run.cleanEf), et seulement face à d'autres sorties EF propres : sinon on
  // encouragerait à courir les sorties faciles trop vite.
  if(run.type==="EF" && run.cleanEf===true && run.distKm>=3 && run.paceSecKm>0){
    const prevEf = prev.filter(r=>r.type==="EF" && r.cleanEf===true && r.distKm>=3 && r.paceSecKm>0);
    if(prevEf.length>=3 && run.paceSecKm <= Math.min(...prevEf.map(r=>r.paceSecKm)) - 1) records.push({ key:"allure_ef", value:run.paceSecKm, previous:Math.min(...prevEf.map(r=>r.paceSecKm)) });
  }
  if(run.type==="Fractionné" && run.workPaceSecKm>0){
    const prevFrac = prev.filter(r=>r.type==="Fractionné" && r.workPaceSecKm>0);
    if(prevFrac.length>=3 && run.workPaceSecKm <= Math.min(...prevFrac.map(r=>r.workPaceSecKm)) - 1) records.push({ key:"allure_frac", value:run.workPaceSecKm, previous:Math.min(...prevFrac.map(r=>r.workPaceSecKm)) });
  }
  // D26 : records par distance. Il faut avoir déjà couru cette distance (un premier 5 km
  // n'est pas un « record » mais devient le détenteur) et gagner au moins 1 s.
  RECORD_DISTANCES.forEach(d=>{
    const t = distanceRecordTime(run, d);
    if(t==null) return;
    const prevTimes = prev.map(r=>distanceRecordTime(r, d)).filter(x=>x!=null);
    if(!prevTimes.length) return;
    const best = Math.min(...prevTimes);
    if(t <= best - 1) records.push({ key:"record_"+d.key, value:t, previous:best, distKm:d.km, label:d.label });
  });
  return records;
}

/* ---------- Records par distance (D26, D43) ----------
   5 km, 10 km, semi, marathon. Une course compte pour la distance D si sa
   distance est entre D et D + 5 % (règle validée par Omar le 03/10/2026 :
   ±5 % était trop souple, une course de 9,5 km aurait compté comme un 10 km
   avec un temps trop optimiste). Le temps est ramené proportionnellement à D
   (5,2 km en 26:00 -> 5 km en 25:00). Seules les sorties de course comptent.
   Les chronos déclarés dans « Ton niveau » n'entrent jamais ici. */
const RECORD_DISTANCES = [
  { key:"5k",       km:5,       label:"5 km" },
  { key:"10k",      km:10,      label:"10 km" },
  { key:"semi",     km:21.0975, label:"Semi" },
  { key:"marathon", km:42.195,  label:"Marathon" },
];
const RECORD_DISTANCE_TOLERANCE = 0.05;
const RECORD_DISTANCE_TOLERANCE_BELOW = 0.01;   // un GPS qui mesure 9,99 km sur un vrai 10 km : la sortie compte, temps ramené à la distance exacte
function distanceRecordTime(run, dist){
  if(!run || !isRunningRunType(run.type) || !(run.durationSec>0)) return null;
  if(!(run.distKm>=dist.km*(1-RECORD_DISTANCE_TOLERANCE_BELOW) && run.distKm<=dist.km*(1+RECORD_DISTANCE_TOLERANCE))) return null;
  return Math.round(run.durationSec * dist.km / run.distKm);
}
/* Détenteurs ACTUELS des records (D43 : « la séance détient un record actuel »).
   `runs` : [{id, ts, type, distKm, durationSec, paceSecKm, workPaceSecKm, cleanEf}],
   déjà limitées aux séances qui comptent dans les stats. À égalité, la plus ancienne
   garde le record ; quand il est battu, il passe à la nouvelle course. */
function recordHolders(runs){
  const list = (runs||[]).slice().sort((a,b)=>a.ts-b.ts);
  const holders = { distances:{}, allure_ef:null, allure_frac:null };
  RECORD_DISTANCES.forEach(d=>{
    let best = null;
    list.forEach(r=>{
      const t = distanceRecordTime(r, d);
      if(t!=null && (best===null || t<best.timeSec)) best = { runId:r.id, timeSec:t, distKm:r.distKm, ts:r.ts };
    });
    holders.distances[d.key] = best;
  });
  list.forEach(r=>{
    if(r.type==="EF" && r.cleanEf===true && r.distKm>=3 && r.paceSecKm>0 && (holders.allure_ef===null || r.paceSecKm<holders.allure_ef.paceSecKm))
      holders.allure_ef = { runId:r.id, paceSecKm:r.paceSecKm, ts:r.ts };
    if(r.type==="Fractionné" && r.workPaceSecKm>0 && (holders.allure_frac===null || r.workPaceSecKm<holders.allure_frac.workPaceSecKm))
      holders.allure_frac = { runId:r.id, workPaceSecKm:r.workPaceSecKm, ts:r.ts };
  });
  return holders;
}
// Records détenus par UNE course (pour le trophée et la feuille de détail :
// « Record : 10 km en 52:10 »). Renvoie [{key, text}].
function runRecordLabels(runId, holders){
  const out = [];
  RECORD_DISTANCES.forEach(d=>{
    const h = holders.distances[d.key];
    if(h && h.runId===runId) out.push({ key:d.key, text:`${d.label} en ${fmtDur(h.timeSec)}` });
  });
  if(holders.allure_ef && holders.allure_ef.runId===runId) out.push({ key:"allure_ef", text:`meilleure allure EF, ${fmtA(holders.allure_ef.paceSecKm)}/km` });
  if(holders.allure_frac && holders.allure_frac.runId===runId) out.push({ key:"allure_frac", text:`meilleure allure fractionné, ${fmtA(holders.allure_frac.workPaceSecKm)}/km` });
  return out;
}
function recordPhrase(record){
  if(record.key && record.key.startsWith("record_")){
    const gain = record.previous!=null ? Math.round(record.previous - record.value) : null;
    return `Nouveau record sur ${record.label} : ${fmtDur(record.value)}${gain>0?`, ${gain} s de mieux`:""} !`;
  }
  if(record.key==="distance") return `Ta plus longue sortie : ${Number(record.value).toLocaleString("fr-FR",{maximumFractionDigits:1})} km !`;
  if(record.key==="duree") return `Ta plus longue durée de course : ${formatMinutesShort(record.value/60)} !`;
  if(record.key==="allure_ef") return `Ta meilleure allure en sortie easy : ${fmtA(record.value)}/km !`;
  if(record.key==="allure_frac") return `Ta meilleure allure en fractionné : ${fmtA(record.value)}/km !`;
  return "";
}
// Une séance n'est célébrée que si elle date d'aujourd'hui ou d'hier (D57 : la carte « Hier » disparaît le
// lendemain, comme les autres ; cela évite aussi de fêter tout l'historique au premier lancement) et si elle
// n'a pas déjà été célébrée ou fermée.
function shouldCelebrateRun(runTs, nowTs, runId, celebratedIds){
  const day = (ts) => { const d = new Date(ts); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const age = Math.round((day(nowTs) - day(runTs)) / 86400000);
  return age>=0 && age<=1 && !(celebratedIds||[]).includes(runId);
}
// Amélioration d'efficience à fêter : fenêtres 30 j / 30 j d'avant (comme
// efficiencyTrend), seuil de 5% avec allure réellement meilleure
// (detectEfficiencyImprovement), au plus une fois tous les 15 jours.
// `efRuns` : [{date:"AAAA-MM-JJ", allure, fc}].
function efficiencyCelebration(efRuns, todayStr, lastCelebratedStr){
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  const today = parse(todayStr);
  if(lastCelebratedStr && (today - parse(lastCelebratedStr))/86400000 < 15) return null;
  const trend = efficiencyTrend(efRuns, todayStr);
  if(trend.status!=="mieux") return null;
  const daysAgo = (d) => Math.round((today - parse(d)) / 86400000);
  const valid = (efRuns||[]).filter(r=>r.allure>0 && r.fc>0);
  const recent = valid.filter(r=>{ const a=daysAgo(r.date); return a>=0 && a<=29; });
  const baseline = valid.filter(r=>{ const a=daysAgo(r.date); return a>=30 && a<=59; });
  return detectEfficiencyImprovement(recent, baseline) ? { pct: trend.pct } : null;
}

/* ---------- Priorité des alertes de Programme (D51, D7) ----------
   Une seule bannière visible sur Programme, les autres derrière « 1 autre point ».
   Ordre validé (03/10/2026) : douleur très forte (≥ 7, avis médical) d'abord, puis
   douleur 6 ou charge très haute (propositions à choisir), puis séance non faite.
   `alerts` : [{kind:"urgent"|"gros"|"missed", ...}]. À rang égal, l'ordre d'arrivée
   est conservé. Un kind inconnu est ignoré. Le point violet du menu compte ces alertes. */
const PROGRAM_ALERT_RANK = { urgent:0, gros:1, missed:2 };
function orderProgramAlerts(alerts){
  return (alerts||[])
    .map((a,i)=>({a,i}))
    .filter(x=>x.a && PROGRAM_ALERT_RANK[x.a.kind]!==undefined)
    .sort((x,y)=>PROGRAM_ALERT_RANK[x.a.kind]-PROGRAM_ALERT_RANK[y.a.kind] || x.i-y.i)
    .map(x=>x.a);
}
// Titre court d'une alerte pour la ligne « 1 autre point : … » (design 9) et libellé de cette ligne.
function alertShortTitle(alert){
  if(!alert) return "";
  if(alert.kind==="urgent") return "douleur à surveiller";
  if(alert.kind==="gros") return alert.issue && alert.issue.type==="charge" ? "charge très haute" : "douleur à vérifier";
  if(alert.kind==="missed") return "séance non faite";
  return "";
}
function moreAlertsLabel(rest){
  const n = (rest||[]).length;
  if(!n) return "";
  return n===1 ? `1 autre point : ${alertShortTitle(rest[0])}` : `${n} autres points`;
}
/* Ajustement léger (D54) : quand l'app a allégé ou raccourci toute seule une séance (ouverture de l'app,
   douleur répétée ou charge), une ligne grise fermable en haut de Programme le dit, sans violet puisqu'il n'y a
   rien à décider. Séances remplacées automatiquement ces 3 derniers jours, dont la ligne n'a pas été fermée
   (`dismissedIds` : mémorisé sur l'appareil). La plus récente d'abord. */
function lightAdjustments(plannedSessions, dismissedIds, nowTs){
  const dayName = (d) => new Date(d+"T00:00:00").toLocaleDateString("fr-FR", { weekday:"long" });
  return (plannedSessions||[])
    .filter(p=>p.replaces_session_id && p.status==="planned" && /automatiquement/.test(p.rationale||"")
      && !(dismissedIds||[]).includes(p.id) && p.created_at && (nowTs - new Date(p.created_at).getTime())<=3*86400000)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
    .map(p=>({ id:p.id, text:`On a ${/raccourcie/.test(p.rationale||"")?"raccourci":"allégé"} ta séance de ${dayName(p.planned_date)}.` }));
}
// Nom accessible de l'onglet Programme : « Programme, 1 point à voir ».
function programTabLabel(count){
  return count>0 ? `Programme, ${count} point${count>1?"s":""} à voir` : "Programme";
}

/* ---------- Aujourd'hui : carte « Hier », carte d'action unique, bandeau coach (D11, D12, D53, E1) ---------- */
// Une seule carte d'action sous la séance du jour, par priorité (D11) : décision de rattachement
// (« Est-ce la même séance ? », sortie non prévue), puis « Hier » (record et/ou ressenti), puis « Vérifions N sorties »
// (D109), puis « Ton objectif a changé » (chantier 6), puis « Ton niveau ». L'alerte douleur forte est affichée à part,
// au-dessus. `available` : {clé: vrai si la carte existe}.
const TODAY_ACTION_ORDER = ["merge_ask","attach","hier","verifier","objectif","niveau"];
function pickTodayActionCard(available){
  return TODAY_ACTION_ORDER.find(k=>available && available[k]) || null;
}
/* ---------- Carte « Vérifions N sorties » (lot 3, D109) ----------
   Courses reçues d'Apple Santé dont le type est douteux, à faire confirmer d'une touche ; pas encore vérifiées, elles ne
   comptent ni dans les records ni dans la courbe d'endurance. Seules comptent les sorties dont le type est celui que RunSync
   pose seul (EF ou Long) et jamais touché. Douteuse si très courte (< 2 km : échauffement, sortie interrompue) ou nettement
   plus rapide que d'habitude : allure ≤ 90 % de la médiane des 10 sorties précédentes (≥ 3 km, hors séances à blocs de la
   montre), course si c'est une distance de course. Référence récente plutôt qu'annuelle : un coureur qui progresse (Omar :
   8'34 en janvier, 7'00 en juillet) verrait sinon toutes ses sorties récentes « rapides ». Fréquence cardiaque écartée :
   trop variable (15 alertes sur 40 courses chez Leïla). Bilan du 07/10/2026 : 4 courses sur 65 chez Omar (dont sa course
   du 7 juin), 6 sur 75 dans ses données brutes, 8 sur 40 chez Leïla (dont 4 très courtes). */
const DOUBT_FAST_RATIO = 0.90, DOUBT_SHORT_KM = 2, DOUBT_MIN_KM = 3, DOUBT_HISTORY = 10, DOUBT_MIN_HISTORY = 4, DOUBT_BLOCKS = 4;
const DOUBT_IGNORE_KM = 0.3;   // en dessous : montre lancée par erreur (80 à 150 m chez Omar et Leïla), rien à demander
const DOUBT_RACE_KM = [5, 10, 21.0975, 42.195];
// `runs` : [{ id, ts, appleType, type, dist (km), durationSec, blocks (repères de la montre), typeChecked }].
// Renvoie les sorties douteuses, la plus récente d'abord : [{ id, reason:"rapide"|"courte", race, pace, refPace, suggestion }].
function doubtfulRuns(runs){
  const list = (runs||[]).filter(r => r && r.appleType==="Running" && r.dist>=DOUBT_IGNORE_KM && r.durationSec>0).slice().sort((a,b)=>a.ts-b.ts);
  const hist = [], out = [];
  for(const r of list){
    const pace = r.durationSec / r.dist, blocks = r.blocks || 0;
    const ref = hist.length >= DOUBT_MIN_HISTORY ? median(hist.slice(-DOUBT_HISTORY)) : null;
    if((r.type==="EF" || r.type==="Long") && !r.typeChecked){
      if(r.dist < DOUBT_SHORT_KM) out.push({ id:r.id, reason:"courte", race:false, pace, refPace:ref, suggestion:"Récup" });
      else if(r.dist >= DOUBT_MIN_KM && blocks < DOUBT_BLOCKS && ref && pace <= ref*DOUBT_FAST_RATIO){
        const race = DOUBT_RACE_KM.some(D => Math.abs(r.dist-D) <= Math.max(0.15, D*0.015));
        out.push({ id:r.id, reason:"rapide", race, pace, refPace:ref, suggestion: race ? "Course" : "Seuil" });
      }
    }
    if(r.dist >= DOUBT_MIN_KM && blocks < DOUBT_BLOCKS) hist.push(pace);
  }
  return out.reverse();
}
// Bandeau coach : une phrase choisie par priorité parmi les rappels (D53, journal 9) :
// 1) fin du plan débutant, 2) test de niveau à planifier, 3) X jours sans courir. Quand la carte
// « Ton niveau » est affichée, les deux rappels de niveau sont masqués (même besoin).
// `s` : {graduation, guidedTestPending, levelCardShown, daysSinceRun}.
const NO_RECENT_RUN_DAYS = 5;
function coachReminder(s){
  if(!s) return null;
  if(!s.levelCardShown){
    if(s.graduation) return { key:"graduation" };
    if(s.guidedTestPending) return { key:"guided_test" };
  }
  if(s.daysSinceRun!=null && s.daysSinceRun>=NO_RECENT_RUN_DAYS) return { key:"no_recent_run", days:s.daysSinceRun };
  return null;
}
// Habillage textuel d'un record pour la carte « Hier » (titres validés en E1 : plus de « Merci ! »,
// plus de « Bravo, séance faite »). Priorité d'affichage quand une course bat plusieurs records.
const HIER_RECORD_PRIORITY = ["record_marathon","record_semi","record_10k","record_5k","allure_ef","allure_frac","distance","duree"];
function sortRecordsForHier(records){
  const rank = k => { const i = HIER_RECORD_PRIORITY.indexOf(k); return i<0 ? 99 : i; };
  return (records||[]).slice().sort((a,b)=>rank(a.key)-rank(b.key));
}
function hierRecordInfo(record){
  const k = record.key;
  if(k && k.startsWith("record_")){
    return { title:`Nouveau record sur ${record.label} !`, overline:`RECORD · ${String(record.label).toUpperCase()}`, value:fmtDur(record.value),
      before: record.previous!=null ? `Avant : ${fmtDur(record.previous)}` : "" };
  }
  if(k==="allure_ef") return { title:"Nouveau record d'allure !", overline:"MEILLEURE ALLURE EF", value:`${fmtA(record.value)}/km`, before: record.previous!=null ? `Avant : ${fmtA(record.previous)}/km` : "" };
  if(k==="allure_frac") return { title:"Nouveau record d'allure !", overline:"MEILLEURE ALLURE FRACTIONNÉ", value:`${fmtA(record.value)}/km`, before: record.previous!=null ? `Avant : ${fmtA(record.previous)}/km` : "" };
  if(k==="distance"){
    const f = v => Number(v).toLocaleString("fr-FR",{maximumFractionDigits:1})+" km";
    return { title:"Nouvelle plus longue sortie !", overline:"PLUS LONGUE SORTIE", value:f(record.value), before: record.previous ? `Avant : ${f(record.previous)}` : "" };
  }
  if(k==="duree") return { title:"Nouvelle plus longue durée !", overline:"PLUS LONGUE DURÉE", value:formatMinutesShort(record.value/60), before: record.previous ? `Avant : ${formatMinutesShort(record.previous/60)}` : "" };
  return { title:"", overline:"", value:"", before:"" };
}
// Efficience cardiaque qui progresse : même carte, sans valeur de record.
function hierEfficiencyInfo(pct){
  return { title:"Ton efficience cardiaque progresse !", overline:"EFFICIENCE CARDIAQUE", value:`+${pct} %`, before:"À fréquence cardiaque égale, tu es plus efficace qu'il y a un mois." };
}

/* ---------- Célébration plein écran (S9 ; D55, D56, D57 ; journal 10b-4) ----------
   Réservée aux records de distance (5 km, 10 km, semi, marathon) : l'écran s'ouvre une seule fois à l'ouverture de
   l'app, avec le petit bonhomme (record-man.js) qui efface l'ancien temps et écrit le nouveau ; puis la carte « Hier »
   prend le relais. Les autres records (allure, plus longue sortie ou durée) et l'efficience gardent la carte simple. */
// Gain de temps en toutes lettres courtes : « −34 s », « −1 min 25 s », « −2 min », « −1 h 02 min ».
function formatTimeGain(sec){
  const s = Math.round(Math.abs(sec));
  if(s<60) return `−${s} s`;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), r = s%60;
  if(h>0) return `−${h} h ${String(m).padStart(2,"0")} min`;
  return r ? `−${m} min ${String(r).padStart(2,"0")} s` : `−${m} min`;
}
// La même durée en mots, pour les lecteurs d'écran : « 34 secondes », « 1 minute 25 secondes ».
function timeGainWords(sec){
  const s = Math.round(Math.abs(sec)), pl = (n, unit) => `${n} ${unit}${n>1?"s":""}`;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), r = s%60;
  return [h>0 ? pl(h,"heure") : "", m>0 ? pl(m,"minute") : "", (r>0 || s===0) && h===0 ? pl(r,"seconde") : ""].filter(Boolean).join(" ");
}
// Le record de distance à fêter en plein écran parmi ceux d'une sortie (le plus long d'abord), ou null :
// textes de l'animation (ancien temps, nouveau temps, distance en majuscules, gain) et libellé pour les lecteurs d'écran.
function celebrationRecord(records){
  const r = sortRecordsForHier(records).find(x=>x.key && x.key.startsWith("record_") && x.previous!=null && x.value<x.previous);
  if(!r) return null;
  const gain = r.previous - r.value;
  return {
    key:r.key, label:r.label, newText:fmtDur(r.value), oldText:fmtDur(r.previous),
    distanceText:String(r.label).toUpperCase(), gainText:formatTimeGain(gain),
    ariaLabel:`Nouveau record sur ${r.label} : ${fmtDur(r.value)}, contre ${fmtDur(r.previous)} avant, soit ${timeGainWords(gain)} de mieux.`,
  };
}
// Le plein écran n'est ouvert qu'une fois par sortie (`shownIds` : mémoire locale à l'appareil).
function celebrationToShow(records, runId, shownIds){
  if((shownIds||[]).includes(runId)) return null;
  return celebrationRecord(records);
}

/* ---------- Carte de séance (design 2d, V1 à V7) ----------
   États : « done » (faite, reçue d'Apple Santé ou saisie à la main), « late » (jour passé, rien reçu :
   « Pas encore reçue d'Apple Santé » + « J'ai fait cette séance »), « planned » (prévue). */
function sessionCardState(session, todayStr){
  if(session.status==="done") return "done";
  if(session.status==="missed" || (session.planned_date && session.planned_date < todayStr)) return "late";
  return "planned";
}
// Grand chiffre et tuiles du haut de la carte pour une séance PRÉVUE. Distance connue : « 7,5 km » avec
// allure et durée ; sinon durée seule (« 29 min environ ») avec, pour les séances marche/course et le test,
// le temps par type de segment (`structure` : [{type, minutes}], course d'abord).
function sessionHeadline(session, segments){
  const dist = Number(session.target_distance_km)||0, pace = Number(session.target_pace_sec_per_km)||0;
  let minutes = Math.round(Number(session.target_duration_min)||0);
  if(!minutes && dist>0 && pace>0) minutes = Math.round(dist*pace/60);
  const tiles = [], structure = [];
  let big = null;
  if(dist>0){
    big = { value:String(dist).replace(".",","), unit:"km", note:"" };
    if(pace>0) tiles.push({ label:"Allure /km", value:fmtA(pace) });
    if(minutes>0) tiles.push({ label:"Durée", value:`${minutes} min` });
  } else if(minutes>0){
    big = { value:String(minutes), unit:"min", note:"environ" };
  }
  if(segments && segments.length){
    const totals = {};
    segments.forEach(g=>{ totals[g.type] = (totals[g.type]||0) + g.sec; });
    ["course","test","facile","marche"].forEach(t=>{ if(totals[t]) structure.push({ type:t, minutes:Math.round(totals[t]/60) }); });
  }
  return { big, tiles, structure };
}
// Titre affiché : « EF » avec le sous-titre « Endurance Fondamentale, à allure facile » pour une séance EF ordinaire
// (la donnée enregistrée garde son titre d'origine, ex. « Sortie easy »).
function sessionDisplayTitle(session){
  const ordinary = !session.generation_reason || (session.generation_reason!=="beginner_plan" && session.generation_reason!=="guided_test");
  if(session.type==="EF" && ordinary) return { title:"EF", subtitle:"Endurance Fondamentale, à allure facile" };
  return { title:session.title||sessionTypeLabel(session.type), subtitle:"" };
}

/* ---------- Feuilles Ajouter / Modifier : distance, allure, durée (D47) ----------
   Sur ces trois champs, on en remplit deux et la troisième se calcule, dans les deux sens (décision
   d'Omar). Le champ modifié en dernier est gardé : on recalcule celui qui a été modifié le moins
   récemment (`order` : champs dans l'ordre de leurs modifications, le plus récent en dernier ; un champ
   jamais modifié passe avant tous les autres, par priorité durée, distance, allure). Avec deux champs
   remplis seulement, c'est le champ vide qui est calculé. Unités : distKm (km), paceSecKm (s/km),
   durationMin (min). */
const RUN_TRIPLET_FIELDS = ["durationMin","distKm","paceSecKm"];
function solveRunTriplet(vals, order){
  const v = { distKm:Number(vals.distKm)||0, paceSecKm:Number(vals.paceSecKm)||0, durationMin:Number(vals.durationMin)||0 };
  const filled = RUN_TRIPLET_FIELDS.filter(k=>v[k]>0);
  if(filled.length<2) return { ...v, computed:null };
  const rank = k => (order||[]).lastIndexOf(k);
  let target;
  if(filled.length===2) target = RUN_TRIPLET_FIELDS.find(k=>!(v[k]>0));
  else target = RUN_TRIPLET_FIELDS.slice().sort((a,b)=>rank(a)-rank(b) || RUN_TRIPLET_FIELDS.indexOf(a)-RUN_TRIPLET_FIELDS.indexOf(b))[0];
  const out = { ...v, computed:target };
  if(target==="distKm") out.distKm = Math.round(v.durationMin*60/v.paceSecKm*100)/100;
  else if(target==="paceSecKm") out.paceSecKm = Math.round(v.durationMin*60/v.distKm);
  else out.durationMin = Math.round(v.distKm*v.paceSecKm/60);
  return out;
}

/* ---------- Format court/détaillé de la notation post-séance (4.5.b) ----------
   CDC v2, 4.5 : par défaut, formulaire court (note globale 1-5 + "une
   gêne/douleur ?") ; le détaillé (respiration/mental/fatigue + carte du
   corps) ne s'affiche que si la note est basse OU qu'une gêne est
   signalée. Le RPE reste toujours demandé même dans le format court
   (décision prise avec l'utilisateur, en plus de ce que liste le CDC) :
   sans lui, le calcul de charge d'entraînement (4.4, sRPE Foster 2001)
   perdrait sa donnée pour la majorité des séances.
   Seuil "note basse" = 1 ou 2 sur 5 (notre choix, validé avec
   l'utilisateur, en dessous de la moyenne). */
function shouldShowDetailedRatingForm(note, hasGene){
  return (note!=null && note<=2) || !!hasGene;
}

/* ---------- Session-RPE ----------
   Source : Foster et al. (2001), "A new approach to monitoring exercise
   training", Journal of Strength and Conditioning Research 15(1). */

// Charge de séance = durée (min) × RPE (Borg CR-10, 0-10).
function sessionLoad(durationMin, rpe){
  if(!durationMin || rpe==null) return 0;
  return durationMin * rpe;
}

// `sessions` : [{date:Date, durationMin, rpe}] déjà extraits par l'appelant
// (qui a accès à dateFromRun/parsing de `dur` — cette fonction reste pure,
// pas de dépendance à la forme exacte d'un run). Agrège la charge par jour
// calendaire (plusieurs séances le même jour = charges additionnées).
function buildDailyLoadSeries(sessions){
  const byDay = {};
  sessions.forEach(s=>{
    if(!s.date || s.rpe==null) return;
    const key = s.date.toISOString().slice(0,10);
    if(!byDay[key]) byDay[key] = { date: new Date(s.date.getFullYear(),s.date.getMonth(),s.date.getDate()), load: 0 };
    byDay[key].load += sessionLoad(s.durationMin, s.rpe);
  });
  return Object.values(byDay).sort((a,b)=>a.date-b.date);
}

/* ---------- ACWR (Acute:Chronic Workload Ratio) ----------
   Source : Gabbett (2016), "The training-injury prevention paradox: should
   athletes be training smarter and harder?", British Journal of Sports
   Medicine 50(5). Cible 0.8-1.3, risque accru au-delà de 1.5. Méthode
   "coupled" : charge aiguë = somme des 7 derniers jours, charge chronique =
   moyenne hebdomadaire sur les 28 derniers jours (somme/4).
   Garde-fou (E8, 07/10/2026) : sans recul, le rapport ne veut rien dire. L'historique d'Apple Santé arrive sans
   difficulté notée : à la 1re séance notée, l'aigu vaut 4 fois le chronique, d'où une fausse alerte « risque de
   blessure élevé » pendant environ 3 semaines ; même chose au retour d'une pause sans séance notée. Le rapport
   n'est donné que si : au moins CHARGE_MIN_RATED jours avec une séance notée dans les 28 derniers jours, une
   1re séance notée il y a au moins CHARGE_MIN_SPAN_DAYS jours, et de la charge notée avant la dernière semaine
   (J-27 à J-7). Sinon acwr = null (texte « few » de CHARGE_EMPTY_TEXTS). */
const CHARGE_MIN_RATED = 4, CHARGE_MIN_SPAN_DAYS = 21;
function acwrAt(dailySeries, targetDate){
  const back = (n) => { const d = new Date(targetDate); d.setDate(d.getDate()-n); return d; };
  const sumBetween = (from, to) => dailySeries.filter(d=>d.date>=from && d.date<=to).reduce((a,d)=>a+d.load,0);
  const acute7j = sumBetween(back(6), targetDate);
  const chronic28j = sumBetween(back(27), targetDate)/4;
  const rated = dailySeries.filter(d=>d.load>0 && d.date<=targetDate);
  const ratedDays28 = rated.filter(d=>d.date>=back(27)).length;
  const first = rated.reduce((m,d)=>(m==null || d.date<m) ? d.date : m, null);
  const enough = ratedDays28>=CHARGE_MIN_RATED && first!=null && first<=back(CHARGE_MIN_SPAN_DAYS) && sumBetween(back(27), back(7))>0;
  return { acute7j, chronic28j, ratedDays28, enough, acwr: enough && chronic28j>0 ? acute7j/chronic28j : null };
}

/* ---------- Charge d'entraînement affichée à l'utilisateur (4.4) ----------
   CDC v2, 4.4 : l'ACWR déjà calculé (acwrAt ci-dessus) devient visible
   sous le nom "charge d'entraînement" — jamais le jargon "ACWR" lui-même.
   Seuils du CDC, directement repris de Gabbett (2016) (voir acwrAt) :
   sous-charge <0,8 ; zone idéale 0,8-1,3 ; attention >1,3 (alerte
   renforcée >1,5, mais reste la même zone "attention" — le CDC ne définit
   qu'une alerte visuelle plus marquée, pas une 4e zone). Zone attention
   toujours en violet (la couleur d'attention de l'app), jamais en rouge (demande explicite du CDC).
   `acwr` : résultat de acwrAt(...).acwr (peut être null, pas assez
   d'historique). Renvoie {zone, color, phrase, severe} — `severe` sert à
   l'UI pour renforcer l'alerte au-delà de 1,5 sans changer de couleur. */
function chargeEntrainementGauge(acwr){
  if(acwr==null) return { zone:"inconnue", color:"#A3A7AD", phrase:"Ta charge d'entraînement s'affichera après quelques séances notées.", severe:false };
  if(acwr<0.8) return { zone:"sous-charge", color:"#8B8F96", phrase:"Tu pourrais progresser un peu plus vite — ta charge est en dessous de la zone idéale.", severe:false };
  if(acwr<=1.3) return { zone:"idéale", color:"#C6F432", phrase:"Tu augmentes ta charge à un rythme sûr.", severe:false };
  const severe = acwr>1.5;
  return { zone:"attention", color:"oklch(0.72 0.17 300)", phrase: severe
    ? "Ta charge augmente très vite — risque de blessure élevé, pense à lever le pied."
    : "Ta charge augmente vite — reste attentif à ton ressenti.", severe };
}

/* ---------- Séances manquées (4.3.c) ----------
   CDC v2, 4.3 : une séance planifiée non faite passe automatiquement au
   statut "manquée" le lendemain. Pas de vraie notification push (l'app
   n'a pas cette infrastructure, pas de service worker) — une bannière
   in-app à la prochaine ouverture en fait office. Ne concerne que les
   séances de course (`pace_zone` non vide) : le renfo/mobilité n'est
   jamais passé par le mécanisme de réorganisation (regenerateSession),
   volontairement exclu ailleurs dans le moteur (index.html,
   applyProgramAdjustments).
   `today` : date du jour au format YYYY-MM-DD (même format que
   `planned_date`, comparaison directe en chaîne).
   Ne renvoie que les séances PAS ENCORE marquées (status==="planned") —
   une fois passées à "missed", elles ne ressortent plus ici (pas de
   re-traitement à chaque appel). */
function detectMissedSessions(plannedSessions, today){
  return (plannedSessions||[]).filter(p =>
    p.status==="planned" && p.pace_zone && p.planned_date < today
  );
}

/* ---------- Garde-fous de réorganisation (4.3.d) ----------
   CDC v2, 4.3 : jamais 2 séances le même jour, jamais 2 séances intenses
   d'affilée, pas de hausse du volume hebdo pendant une réorganisation,
   priorité à la séance de qualité (sinon abandon).
   Vérifié dans la littérature running (30/09-01/10/2026) qu'un EF juste
   avant/après une séance intense n'est PAS un problème — le consensus
   ("hard days hard, easy days easy") porte sur l'enchaînement de DEUX
   séances intenses, jamais sur un EF à côté d'une séance dure :
   https://endogusto.com/blog/recovery-runs-easy-days-runners/
   https://www.runnersblueprint.com/interval-training-running/
   D'où : la règle "jamais 2 intenses d'affilée" ne s'applique qu'entre
   séances intenses elles-mêmes (Seuil/Fractionné/Répétition) — jamais
   entre un EF et une séance intense.
   Note : la "sortie longue" du CDC n'est pas protégée spécifiquement ici
   — le moteur actuel (generateWeekSessions) ne génère pas de sortie
   longue distincte des autres séances easy (toutes ont la même distance),
   donc impossible de l'identifier pour l'instant. Seule la séance de
   qualité bénéficie de la priorité "on retente avant d'abandonner".
   `sessionToReschedule` : {pace_zone}. `weekSessions` : séances déjà
   dans la semaine (planned/done), chacune {dayIndex, pace_zone}.
   `availableDayIndexes` : jours que l'utilisateur a dit disponibles.
   `isPriority` : true si séance de qualité (Seuil/Fractionné). Renvoie le
   jour choisi (0=lundi..6=dimanche) ou null (abandon). */
function isIntensePaceZone(paceZone){
  return paceZone==="threshold" || paceZone==="interval" || paceZone==="repetition";
}
/* ---------- Cohabitation de séances le même jour (CDC v2, 4.3.d révisé) ----------
   Règle validée avec l'utilisateur (02/10/2026) : une course accepte une
   séance LÉGÈRE (yoga, mobilité, étirements, kiné, pilates...) le même
   jour ; jamais deux courses, jamais du renfo avec une course, et une
   seule séance complémentaire par jour. Choix pragmatique, pas une règle
   sourcée. Catégorie : "run" si pace_zone ou type de course, "renfo",
   sinon "light". Un objet sans type ni allure (ex: {pace_zone:null}) est
   traité comme léger. */
/* ---------- Types de séance (D15, design v48) ----------
   Séances RÉALISÉES (historique, saisie à la main) : 14 types. Séances PRÉVUES
   (Programme) : 12, sans Récup ni Marche. « Récup » n'est jamais confondu avec
   « EF » et n'est pas une course (hors statistiques par défaut, voir D78) ;
   « Marche » est une activité à part entière ; « Souplesse » est devenu
   « Étirements » (normalizeSessionType ramène les anciennes valeurs). La valeur
   interne « Other » s'affiche « Autre ». */
const SESSION_TYPES_DONE = ["EF","Long","Fractionné","Seuil","Course","Récup","Marche","Renfo","Mobilité","Yoga","Pilates","Étirements","Kiné","Other"];
const SESSION_TYPES_PLANNED = SESSION_TYPES_DONE.filter(t=>t!=="Récup" && t!=="Marche");
function normalizeSessionType(type){ return type==="Souplesse" ? "Étirements" : type; }
function sessionTypeLabel(type){ return type==="Other" ? "Autre" : (normalizeSessionType(type)||""); }
const NON_RUNNING_SESSION_TYPES = ["Renfo","Mobilité","Yoga","Étirements","Kiné","Pilates","Other","Marche","Récup"];
function sessionCategory(s){
  if(s.pace_zone) return "run";
  if(!s.type) return "light";
  const type = normalizeSessionType(s.type);
  if(type==="Renfo") return "renfo";
  if(NON_RUNNING_SESSION_TYPES.includes(type)) return "light";
  return "run";
}
function sessionsCanShareDay(a, b){
  const ca = sessionCategory(a), cb = sessionCategory(b);
  return (ca==="run" && cb==="light") || (ca==="light" && cb==="run");
}
// Une séance planifiée correspond à une vraie séance synchronisée si les
// deux sont des courses, ou si elles ont exactement le même type
// (Renfo/Yoga/Mobilité...) — sinon une course du matin validait aussi le
// yoga prévu le même jour.
function plannedSessionMatchesRun(planned, run){
  if(sessionCategory(planned)==="run") return sessionCategory({type:run.type})==="run";
  return planned.type===run.type;
}
function findRescheduleDay(sessionToReschedule, weekSessions, availableDayIndexes, isPriority){
  const intenseDays = new Set((weekSessions||[]).filter(s=>isIntensePaceZone(s.pace_zone)).map(s=>s.dayIndex));
  const freeDays = (availableDayIndexes||[]).filter(d =>
    !(weekSessions||[]).some(s => s.dayIndex===d && !sessionsCanShareDay(sessionToReschedule, s)));
  if(!isIntensePaceZone(sessionToReschedule.pace_zone)){
    return freeDays.length ? freeDays[0] : null;
  }
  const safe = freeDays.filter(d=>!intenseDays.has(d-1) && !intenseDays.has(d+1));
  if(safe.length) return safe[0];
  if(isPriority && freeDays.length) return freeDays[0]; // assouplit en dernier recours plutôt que d'abandonner tout de suite
  return null;
}

/* ---------- Détection d'amélioration de l'efficience EF (4.3.e, recalibrage) ----------
   CDC v2, 4.3 : réévaluer le niveau/les allures périodiquement (15 jours,
   choisi avec l'utilisateur — plus fréquent que les 4-6 semaines du CDC,
   pour rester réactif) plutôt que seulement à la prochaine séance qualité.
   Réutilise la même métrique que le graphique "Efficience cardiaque" du
   Dashboard (allure ÷ FC moyenne, voir mkPaceFcChart, index.html) — plus
   bas = meilleur.
   Deux garde-fous ajoutés avec l'utilisateur en discutant de cette ligne :
   1. Ne compare que des séances EF "qualitatives" (classifyRunType, zones
      1-2 majoritaires) — à filtrer par l'appelant avant d'appeler cette
      fonction — jamais une séance qui a dérivé vers la zone 3 (sinon une
      allure plus rapide obtenue en poussant plus fort serait prise à
      tort pour un vrai progrès aérobie).
   2. Exige que l'allure se soit RÉELLEMENT améliorée (pas seulement le
      ratio) : le ratio peut aussi baisser si la FC monte pour la même
      allure (fatigue, chaleur, surentraînement) — un faux positif qu'on
      ne veut jamais célébrer comme un progrès.
   Seuil 5% sur le ratio (notre propre choix, pas une étude — discuté et
   validé avec l'utilisateur, d'abord proposé à 10% puis resserré) : à
   7'00/km et FC 150, 5% de mieux sur le ratio correspond à ~6'39/km à FC
   égale — une progression perceptible sans être trop sensible au bruit.
   `recentRuns`/`baselineRuns` : [{allure, fc}], déjà filtrés EF
   qualitatif par l'appelant, au moins 2 séances dans chaque fenêtre pour
   être pris en compte (sinon pas assez de données -> false). */
function detectEfficiencyImprovement(recentRuns, baselineRuns, thresholdPct=0.05){
  if(!recentRuns || recentRuns.length<2 || !baselineRuns || baselineRuns.length<2) return false;
  const ratio = r => r.allure / r.fc;
  const avg = (arr, fn) => arr.reduce((a,r)=>a+fn(r),0)/arr.length;
  const recentRatio = avg(recentRuns, ratio);
  const baselineRatio = avg(baselineRuns, ratio);
  const ratioImproved = recentRatio <= baselineRatio * (1 - thresholdPct);
  const paceImproved = avg(recentRuns, r=>r.allure) < avg(baselineRuns, r=>r.allure);
  return ratioImproved && paceImproved;
}

/* ---------- Douleur/gêne répétée ----------
   Règle donnée par l'utilisateur (pas une source externe) : une même zone
   signalée ≥ seuil sur les 2 dernières séances NOTÉES d'affilée déclenche un
   remplacement de la prochaine séance qualité. `ratingsHistory` : liste de
   `pain_ratings` (objets plats zone→0-10), la plus récente en dernier. */
function detectRepeatedPain(ratingsHistory, zoneKeys, threshold=4){
  if(!ratingsHistory || ratingsHistory.length<2) return null;
  const [prev, last] = ratingsHistory.slice(-2);
  for(const zone of zoneKeys){
    if((prev[zone]||0)>=threshold && (last[zone]||0)>=threshold) return zone;
  }
  return null;
}

// Fatigue/mental dégradés = dernière notation au-dessus du seuil (échelle
// 0-10, 10=pire) — reflète l'état ACTUEL, pas une moyenne qui diluerait un
// mauvais ressenti récent avec une séance antérieure correcte. Signal pour
// réduire l'intensité prévue, jamais pour supprimer une séance silencieusement.
function detectDegradedWellbeing(ratingsHistory, threshold=6){
  if(!ratingsHistory || ratingsHistory.length<1) return false;
  const last = ratingsHistory[ratingsHistory.length-1];
  return (last.fatigue||0)>=threshold || (last.mental||0)>=threshold;
}

/* ---------- Palier d'adaptation selon la douleur répétée (4.6.b) ----------
   CDC v2, 4.6 : "Petit" = ajustement automatique (déjà géré ailleurs,
   4.6.a) ; "Gros" = proposé, à valider par l'utilisateur. Seuils discutés
   avec l'utilisateur (pas une étude, une échelle cohérente avec le reste
   de l'app) : intensité 4-5 sur les 2 dernières séances notées -> Petit ;
   intensité >=6 -> Gros. Réutilise detectRepeatedPain (seuil variable,
   déjà testé) en vérifiant d'abord le seuil le plus sévère, pour que les
   deux paliers restent mutuellement exclusifs (une intensité de 6 ne
   doit jamais aussi matcher comme "Petit").
   Le palier "Hors ajustement" (douleur >=7 OU 3 séances de suite) est
   géré séparément (4.6.c) — volontairement pas ici, pour ne pas
   pré-construire cette ligne avant de l'avoir traitée. */
function painAdaptationTier(ratingsHistory, zoneKeys){
  const gros = detectRepeatedPain(ratingsHistory, zoneKeys, 6);
  if(gros) return { zone:gros, tier:"gros" };
  const petit = detectRepeatedPain(ratingsHistory, zoneKeys, 4);
  if(petit) return { zone:petit, tier:"petit" };
  return null;
}

/* ---------- Palier "Hors ajustement" (4.6.c) ----------
   Douleur d'intensité >=7 sur la dernière séance notée ("severe"), OU
   >=4 sur les 3 dernières séances notées de suite ("recurring"). Seuils
   validés avec l'utilisateur (échelle interne de l'app, pas une étude).
   "severe" prime sur "recurring". Ne regarde que les zones passées dans
   zoneKeys (l'appelant retire celles déjà en pause). */
function acutePainTrigger(ratingsHistory, zoneKeys){
  if(!ratingsHistory || ratingsHistory.length<1) return null;
  const last = ratingsHistory[ratingsHistory.length-1];
  for(const zone of zoneKeys){
    if((last[zone]||0)>=7) return { zone, reason:"severe" };
  }
  if(ratingsHistory.length>=3){
    const lastThree = ratingsHistory.slice(-3);
    for(const zone of zoneKeys){
      if(lastThree.every(r=>(r[zone]||0)>=4)) return { zone, reason:"recurring" };
    }
  }
  return null;
}

/* ---------- Tuile d'un jour (design 3c et 8, D18, D48) ----------
   Modèle d'un jour pour « Ta semaine » et pour le calendrier de Programme (semaine et mois).
   `status` (une seule valeur par jour) : « fait » si une séance est faite ou une vraie course existe ce
   jour ; « manque » si une course prévue n'a pas été faite ; « prevu » s'il reste une séance à venir ;
   sinon « repos ». `main` : la séance principale (la course d'abord), `second` : la 2e séance (pastille
   « + ») ; `mainId` / `secondId` : leurs identifiants de séance prévue (null pour une course sans séance
   prévue). Une séance légère passée et non faite reste neutre (aucune entrée). */
function dayTileModel(date, plannedSessions, runs, todayStr){
  const sessions = (plannedSessions||[]).filter(p=>["planned","done","missed"].includes(p.status) && p.planned_date===date);
  const hasRun = (runs||[]).some(r=>r.date===date);
  const missed = sessions.some(p => p.status==="missed" || (p.status==="planned" && p.pace_zone && date<todayStr));
  let status;
  if(hasRun || sessions.some(p=>p.status==="done")) status = "fait";
  else if(missed) status = "manque";
  else if(sessions.some(p=>p.status==="planned") && date>=todayStr) status = "prevu";
  else status = "repos";
  const entries = [];
  sessions.forEach(p=>{
    const isRun = sessionCategory(p)==="run";
    let st = null;
    if(p.status==="done") st = "fait";
    else if(p.status==="missed" || (p.status==="planned" && p.pace_zone && date<todayStr)) st = "manque";
    else if(p.status==="planned" && date>=todayStr) st = "prevu";
    if(st) entries.push({ type:normalizeSessionType(p.type)||"Other", status:st, isRun, id:p.id||null });
  });
  const dayRuns = (runs||[]).filter(r=>r.date===date);
  if(dayRuns.length){
    // une vraie course valide la course prévue du jour ; sinon elle compte seule
    const runEntry = entries.find(e=>e.isRun);
    if(runEntry) runEntry.status = "fait";
    else entries.push({ type:dayRuns[0].type||"EF", status:"fait", isRun:true, id:null });
  }
  entries.sort((a,b)=>(b.isRun?1:0)-(a.isRun?1:0));
  const strip = e => e ? { type:e.type, status:e.status } : null;
  return { date, status, isToday: date===todayStr, main:strip(entries[0]), second:strip(entries[1]),
    mainId: entries[0] ? entries[0].id : null, secondId: entries[1] ? entries[1].id : null };
}
// Grille d'un mois (design 8b) : semaines du lundi au dimanche qui couvrent le mois ; `inMonth` estompe les
// jours des mois voisins. `monthIndex` : 0 = janvier.
function monthWeeks(year, monthIndex){
  const fmt = (d) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const first = new Date(year, monthIndex, 1), last = new Date(year, monthIndex+1, 0);
  const start = new Date(first); start.setDate(start.getDate() - ((first.getDay()+6)%7));
  const weeks = [];
  for(let cursor=new Date(start); cursor<=last; cursor.setDate(cursor.getDate()+7)){
    weeks.push(Array.from({length:7}, (_,i)=>{ const d = new Date(cursor); d.setDate(d.getDate()+i); return { date:fmt(d), inMonth:d.getMonth()===monthIndex }; }));
  }
  return weeks;
}
// Titre d'une petite carte de séance (V5) : « EF · 7,5 KM », « Yoga · 30 MIN » (la mise en majuscules est faite
// par l'habillage). Sans distance ni durée : le type seul.
function sessionSmallTitle(session){
  const type = sessionTypeLabel(session.type);
  const dist = Number(session.target_distance_km)||0;
  const min = Math.round(Number(session.target_duration_min)||0);
  if(dist>0) return `${type} · ${String(dist).replace(".",",")} km`;
  if(min>0) return `${type} · ${min} min`;
  return type;
}

/* ---------- Récap de la semaine (CDC v2, 4.8.a / 4.8.b) ----------
   Semaine = lundi-dimanche (comme le reste de l'app). Les 3 chiffres
   (distance, nombre de séances, durée) ne comptent que les courses ; la
   semaine en cours est montrée "à ce jour" à côté de la semaine dernière
   COMPLÈTE, sans pourcentage ni flèche (décision validée : pas de
   culpabilisation, CDC 4.10). `runs` : [{date:"AAAA-MM-JJ", distKm,
   durationSec}] (courses seulement). `plannedSessions` : lignes de
   planned_sessions. Statut d'un jour (une seule pastille même avec 2
   séances) : "fait" si une séance est faite ou une vraie course existe ce
   jour ; sinon "manque" si une course prévue n'a pas été faite (même règle
   que detectMissedSessions) ; sinon "prevu" si une séance est encore à
   venir ; sinon "repos" (une séance légère passée non faite reste neutre,
   jamais "manquée"). */
function weekRecap(runs, plannedSessions, todayStr){
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  const fmt = (d) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
  const today = parse(todayStr);
  const monday = addDays(today, -((today.getDay()+6)%7));
  const lastMonday = addDays(monday, -7);
  const nextMonday = addDays(monday, 7);
  const inRange = (dateStr, from, to) => { const d = parse(dateStr); return d>=from && d<to; };
  const sum = (from, to) => {
    const rs = (runs||[]).filter(r=>inRange(r.date, from, to));
    return {
      km: Math.round(rs.reduce((a,r)=>a+(r.distKm||0),0)*10)/10,
      sessions: rs.length,
      minutes: Math.round(rs.reduce((a,r)=>a+(r.durationSec||0),0)/60),
    };
  };
  const active = (plannedSessions||[]).filter(p=>["planned","done","missed"].includes(p.status));
  const days = Array.from({length:7}, (_,i) => dayTileModel(fmt(addDays(monday, i)), plannedSessions, runs, todayStr));
  const plannedThisWeek = active.filter(p => inRange(p.planned_date, monday, nextMonday)).length;
  return { thisWeek: sum(monday, nextMonday), lastWeek: sum(lastMonday, monday), days, plannedThisWeek };
}

/* ---------- Jauge de charge (4.8.c) et phrase de synthèse (4.8.d) ----------
   Position du repère sur la barre : échelle commune à la barre et à la courbe
   des 8 semaines, de 0,50 à 1,80 (design 4c ; au-delà, le repère reste au
   bout). Segments : sous 0,8, de 0,8 à 1,3, au-dessus de 1,3 (mêmes seuils que
   chargeEntrainementGauge). null -> pas de repère.
   La phrase de synthèse suit des règles validées avec l'utilisateur
   (02/10/2026), la première qui s'applique l'emporte ; elle ne compare
   jamais à la semaine dernière (pas de pression, CDC 4.10). */
const CHARGE_MIN = 0.5, CHARGE_MAX = 1.8, CHARGE_LOW = 0.8, CHARGE_HIGH = 1.3;
function chargeScale(v){
  return (Math.min(Math.max(v, CHARGE_MIN), CHARGE_MAX) - CHARGE_MIN) / (CHARGE_MAX - CHARGE_MIN);
}
function chargeGaugePosition(acwr){
  if(acwr==null) return null;
  return chargeScale(acwr);
}
function weekSummaryPhrase(recap, gauge){
  const done = recap.days.filter(d=>d.status==="fait").length;
  const upcoming = recap.days.filter(d=>d.status==="prevu").length;
  const missed = recap.days.some(d=>d.status==="manque");
  if(gauge && gauge.severe) return "Ta charge d'entraînement monte très vite : écoute ton corps, un jour de repos en plus serait bien venu.";
  if(missed) return "Une séance n'a pas pu se faire cette semaine, ce n'est pas grave : ce qui compte, c'est la régularité sur plusieurs semaines.";
  if(done>0 && upcoming===0 && recap.plannedThisWeek>0) return "Semaine bien remplie, bravo ! Pense à bien récupérer pour en profiter.";
  if(done>0 && upcoming>0) return "Tu es sur la bonne voie, continue à ton rythme.";
  if(done===0 && upcoming>0) return "La semaine démarre : tu as des séances prévues, à ton rythme.";
  if(done>0) return "Belle sortie ! Chaque séance compte.";
  return "Pas de séance prévue pour l'instant : c'est peut-être le moment de créer ton programme ou de te reposer.";
}
/* Ligne sous les jours de « Ta semaine » (A7, D20, D23) : si une séance est à replacer, la ligne « ! » prend la
   place de la phrase de synthèse (jamais deux messages d'affilée). Dates « AAAA-MM-JJ ».
   - une séance à replacer : « Ta séance de jeudi n'a pas pu se faire, tu peux la replacer. »
   - plusieurs : « 2 séances n'ont pas pu se faire cette semaine, tu peux les replacer. »
   - une à replacer et une sortie comptée : « Ta sortie de samedi est bien comptée. La séance de vendredi reste à replacer. » */
function weekMissedLine(missedDates, unlinkedRunDates){
  const missed = missedDates || [];
  if(!missed.length) return "";
  if((unlinkedRunDates||[]).length) return missedDayNote(missed, unlinkedRunDates);
  const dayName = (d) => new Date(d+"T00:00:00").toLocaleDateString("fr-FR", { weekday:"long" });
  if(missed.length===1) return `Ta séance de ${dayName(missed[0])} n'a pas pu se faire, tu peux la replacer.`;
  return `${missed.length} séances n'ont pas pu se faire cette semaine, tu peux les replacer.`;
}
function weekMessage(recap, gauge, missedDates, unlinkedRunDates){
  const missedLine = weekMissedLine(missedDates, unlinkedRunDates);
  if(missedLine) return { kind:"missed", text:missedLine };
  return { kind:"summary", text:weekSummaryPhrase(recap, gauge) };
}
function chargeZoneLabel(zone){
  return { "sous-charge":"En dessous de la zone idéale", "idéale":"Dans la zone idéale", "attention":"Au-dessus de la zone idéale", "inconnue":"Bientôt disponible" }[zone] || "";
}
// Ligne de charge de « Ta semaine » : « Charge d'entraînement · Dans la zone idéale · 1,08 › ».
function chargeLineInfo(gauge, acwr){
  const label = chargeZoneLabel(gauge.zone);
  return { label, value: acwr==null ? "" : Number(acwr).toFixed(2).replace(".",","), color:gauge.color };
}
function formatMinutesShort(min){
  const m = Math.round(min||0);
  if(m<60) return m+" min";
  return Math.floor(m/60)+" h "+String(m%60).padStart(2,"0");
}

/* ---------- Indicateurs de l'onglet Progression (CDC v2, 4.9.a) ----------
   Définitions validées avec l'utilisateur (02/10/2026), choix pragmatiques
   (pas des règles sourcées) :
   - Efficience cardiaque : même métrique que le graphique du Dashboard
     (allure ÷ FC moyenne, plus bas = mieux), courses EF avec FC des 30
     derniers jours vs les 30 jours d'avant ; il faut au moins 2 courses de
     chaque côté. "Même niveau" = moins de 2% d'écart. Formulé en "plus
     efficace" (le ratio baisse aussi si la FC baisse à allure égale) plutôt
     qu'en "plus vite".
   - Régularité : sur les (jusqu'à 8) dernières semaines COMPLÈTES lundi-
     dimanche, combien contiennent au moins une course. Pas plus de semaines
     que depuis la première course (un débutant n'est pas pénalisé).
   - Volume : km des 28 derniers jours vs les 28 d'avant, sans flèche ni %
     (même principe que weekRecap). */
const EFFICIENCY_STABLE_PCT = 2, EFFICIENCY_MIN_KM = 3, EFFICIENCY_UNUSUAL_PCT = 15;
function efficiencyTrend(efRuns, todayStr){
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  const today = parse(todayStr);
  const dayMs = 86400000;
  const daysAgo = (dateStr) => Math.round((today - parse(dateStr)) / dayMs);
  // R15 (08/10/2026) : sorties d'au moins 3 km seulement (quand la distance est connue), médiane plutôt que moyenne (une
  // sortie mal classée ne fait plus bondir le chiffre), et `unusual` au-delà de 15 % (le « ! » invite à vérifier le type
  // des dernières sorties dans l'Historique, le chiffre reste affiché).
  const valid = (efRuns||[]).filter(r=>r.allure>0 && r.fc>0 && (r.distKm==null || r.distKm>=EFFICIENCY_MIN_KM));
  const recent = valid.filter(r=>{ const a=daysAgo(r.date); return a>=0 && a<=29; });
  const baseline = valid.filter(r=>{ const a=daysAgo(r.date); return a>=30 && a<=59; });
  if(recent.length<2 || baseline.length<2) return { status:"insuffisant" };
  const medRatio = (arr) => median(arr.map(r=>r.allure/r.fc));
  const pct = (medRatio(baseline) - medRatio(recent)) / medRatio(baseline) * 100;
  const rounded = Math.round(Math.abs(pct));
  if(Math.abs(pct) < EFFICIENCY_STABLE_PCT) return { status:"stable", pct:0 };
  const out = { status: pct>0 ? "mieux" : "moins", pct: rounded };
  if(Math.abs(pct) > EFFICIENCY_UNUSUAL_PCT) out.unusual = true;
  return out;
}
function efficiencyPhrase(trend){
  if(trend.status==="mieux") return `À fréquence cardiaque égale, tu es ${trend.pct} % plus efficace qu'il y a un mois.`;
  if(trend.status==="moins") return "À fréquence cardiaque égale, tu es un peu moins efficace qu'il y a un mois : fatigue, chaleur ou reprise peuvent l'expliquer.";
  if(trend.status==="stable") return "À fréquence cardiaque égale, tu es au même niveau qu'il y a un mois.";
  return "Pas encore assez de courses avec fréquence cardiaque pour comparer.";
}
function regularitySummary(runDates, todayStr){
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
  const today = parse(todayStr);
  const currentMonday = addDays(today, -((today.getDay()+6)%7));
  const dates = (runDates||[]).map(parse);
  if(!dates.length) return { status:"insuffisant" };
  const first = new Date(Math.min(...dates));
  const firstMonday = addDays(first, -((first.getDay()+6)%7));
  const weeksSinceFirst = Math.round((currentMonday - firstMonday) / (7*86400000));
  const totalWeeks = Math.min(8, weeksSinceFirst);
  if(totalWeeks<1) return { status:"insuffisant" };
  let weeksWithRun = 0, runs = 0;
  for(let i=1;i<=totalWeeks;i++){
    const from = addDays(currentMonday, -7*i), to = addDays(from, 7);
    const n = dates.filter(d=>d>=from && d<to).length;
    runs += n; if(n>0) weeksWithRun++;
  }
  return { status:"ok", weeksWithRun, totalWeeks, avgPerWeek: Math.round(runs/totalWeeks*10)/10 };
}
function regularityPhrase(r){
  if(r.status!=="ok") return "Pas encore assez d'historique : reviens après ta première semaine complète.";
  if(r.weeksWithRun===0) return `Aucune course ces ${r.totalWeeks} dernières semaines : une petite sortie facile pour reprendre ?`;
  const avg = String(r.avgPerWeek).replace(".", ",");
  if(r.weeksWithRun===r.totalWeeks) return `Au moins une course par semaine, ${avg} en moyenne.`;
  return `Tu as couru au moins une fois dans ${r.weeksWithRun} semaine${r.weeksWithRun>1?"s":""} sur ${r.totalWeeks}, soit ${avg} course${r.avgPerWeek>=2?"s":""} par semaine en moyenne.`;
}
function volumeComparison(runs, todayStr){
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  const today = parse(todayStr);
  const daysAgo = (dateStr) => Math.round((today - parse(dateStr)) / 86400000);
  const sum = (from, to) => Math.round((runs||[]).filter(r=>{ const a=daysAgo(r.date); return a>=from && a<=to; }).reduce((a,r)=>a+(r.distKm||0),0)*10)/10;
  return { last28: sum(0,27), prev28: sum(28,55) };
}

/* ---------- Progression (S6) : jauge 4c, courbes, chiffres clés, carte objectif ----------
   Fonctions pures, testées dans test.html. Les « points » des courbes sont
   {ts (ms), value, id?} ; les séances {ts, type, distKm, durationSec, paceSecKm, cleanEf},
   déjà limitées à celles qui comptent dans les stats (règle D78). */
const DAY_MS = 86400000;
const MONTH_NAMES = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const MONTH_SHORT = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const fmtDec = (v, d) => Number(v).toFixed(d).replace(".", ",");

// Barre de la jauge : largeur de chaque zone, en fraction de l'échelle 0,50 à 1,80 (23 % / 38 % / 38 %).
function chargeSegments(){
  const a = chargeScale(CHARGE_LOW), b = chargeScale(CHARGE_HIGH);
  return { low:a, ideal:b-a, high:1-b };
}
// Charge d'entraînement des `weeks` dernières semaines, une valeur par semaine (la dernière = aujourd'hui).
// `dailySeries` : sortie de buildDailyLoadSeries. acwr peut être null (pas assez d'historique ce jour-là).
function chargeWeeklySeries(dailySeries, today, weeks){
  const n = weeks || 8, out = [];
  for(let i=n-1;i>=0;i--){
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate()-7*i);
    out.push({ date:d, acwr: acwrAt(dailySeries, d).acwr });
  }
  return out;
}
// Courbe de la jauge dans un cadre width × height : points (les semaines sans valeur sont sautées), bande de la
// zone idéale (haut = 1,30, bas = 0,80) et dernier point.
function chargeCurve(series, width, height){
  const n = (series||[]).length;
  const points = [];
  (series||[]).forEach((s,i)=>{
    if(s.acwr==null) return;
    points.push({ x: n>1 ? width*i/(n-1) : width, y: height*(1-chargeScale(s.acwr)), acwr:s.acwr });
  });
  return { points, band:{ top:height*(1-chargeScale(CHARGE_HIGH)), bottom:height*(1-chargeScale(CHARGE_LOW)) }, last: points.length ? points[points.length-1] : null };
}
function chargeAriaLabel(gauge, acwr){
  const zone = { "sous-charge":"en dessous de la zone idéale", "idéale":"dans la zone idéale", "attention":"au-dessus de la zone idéale" }[gauge.zone];
  return zone && acwr!=null ? `Charge d'entraînement : ${zone}, ${fmtDec(acwr,2)}` : "Charge d'entraînement : bientôt disponible";
}

// --- Périodes des courbes (6c) : 3 mois, 6 mois, 12 mois, Tout (par défaut) ---
const PROGRESS_PERIODS = [
  { key:"3m", label:"3 mois", months:3 }, { key:"6m", label:"6 mois", months:6 },
  { key:"12m", label:"12 mois", months:12 }, { key:"all", label:"Tout", months:null },
];
function periodStartTs(key, todayTs){
  const p = PROGRESS_PERIODS.find(x=>x.key===key);
  if(!p || p.months==null) return null;
  const d = new Date(todayTs); d.setMonth(d.getMonth()-p.months);
  return d.getTime();
}
function pointsInPeriod(points, key, todayTs){
  const start = periodStartTs(key, todayTs);
  return (points||[]).filter(p=>p.ts<=todayTs+DAY_MS && (start==null || p.ts>=start)).slice().sort((a,b)=>a.ts-b.ts);
}
// « depuis juin » (l'année seulement si c'est loin : « depuis juin 2025 »).
function sinceLabel(startTs, todayTs){
  const d = new Date(startTs), t = new Date(todayTs);
  const months = (t.getFullYear()-d.getFullYear())*12 + t.getMonth()-d.getMonth();
  return "depuis " + MONTH_NAMES[d.getMonth()] + (months>=11 ? " "+d.getFullYear() : "");
}
// Progression = moyenne des 4 premières semaines → moyenne des 4 dernières (D30). Si les données couvrent moins de
// 8 semaines, chaque fenêtre vaut la moitié de la durée (elles ne se recouvrent jamais) ; en dessous de 2 semaines
// de recul, pas de progression. `points` : [{ts, value}]. Bornes explicites : startTs → endTs.
function windowProgress(points, startTs, endTs){
  const pts = (points||[]).filter(p=>p.ts>=startTs && p.ts<=endTs && p.value>0);
  if(pts.length<2) return { status:"insuffisant" };
  const span = endTs - startTs;
  if(span < 14*DAY_MS) return { status:"insuffisant" };
  const w = Math.min(28*DAY_MS, Math.floor(span/2));
  const first = pts.filter(p=>p.ts < startTs+w), last = pts.filter(p=>p.ts > endTs-w);
  if(!first.length || !last.length) return { status:"insuffisant" };
  const avg = (a) => a.reduce((x,p)=>x+p.value,0)/a.length;
  return { status:"ok", firstAvg:avg(first), lastAvg:avg(last), startTs, fullWindows: w>=28*DAY_MS };
}
// Progression d'une courbe sur une période : de la première à la dernière séance de la période.
function periodProgress(points, key, todayTs){
  const pts = pointsInPeriod(points, key, todayTs);
  if(pts.length<2) return { status:"insuffisant" };
  const p = windowProgress(pts, pts[0].ts, pts[pts.length-1].ts);
  return p.status==="ok" ? { ...p, since: sinceLabel(pts[0].ts, todayTs) } : p;
}
// Texte de la progression d'une allure, dans le même référentiel que les allures affichées : « −0'16"/km » (citron) ;
// une allure qui ralentit « +0'05"/km » en gris, jamais en rouge. 79 s = 1'19" (« −0'79 » n'existe pas).
// null quand il n'y a pas assez de recul.
function paceDeltaText(sec){
  const s = Math.abs(sec);
  return `${Math.floor(s/60)}'${String(s%60).padStart(2,"0")}"/km`;
}
function paceProgressText(p){
  if(!p || p.status!=="ok") return null;
  const delta = Math.round(p.lastAvg - p.firstAvg);
  if(delta<0) return { text:`−${paceDeltaText(delta)}`, tone:"good" };
  if(delta>0) return { text:`+${paceDeltaText(delta)}`, tone:"muted" };
  return { text:`0'00"/km`, tone:"muted" };
}
// Efficience (allure ÷ FC, plus bas = mieux) : « +3 % » quand le rapport baisse.
function ratioProgressText(p){
  if(!p || p.status!=="ok") return null;
  const pct = Math.round((p.firstAvg - p.lastAvg) / p.firstAvg * 100);
  if(pct>0) return { text:`+${pct} %`, tone:"good" };
  if(pct<0) return { text:`−${Math.abs(pct)} %`, tone:"muted" };
  return { text:"0 %", tone:"muted" };
}
// Décimales d'un axe pour que deux graduations ne s'écrivent jamais pareil (D34) : pas de 0,25 → 1 décimale, 0,02 → 2.
function axisDecimals(min, max, ticks){
  const step = (max-min)/Math.max(1,(ticks||5)-1);
  if(!(step>0)) return 1;
  if(step>=1) return 0;
  return Math.min(3, Math.max(1, Math.ceil(-Math.log10(step)-1e-9)));
}
// Fractionné (6e) : à partir de 4 séances, sinon un état d'attente.
const FRACTIONNE_MIN_SESSIONS = 4;
function fractionneChartState(count){
  return count>=FRACTIONNE_MIN_SESSIONS ? { ready:true } : { ready:false, count, missing: FRACTIONNE_MIN_SESSIONS-count };
}

// --- Géométrie des courbes (graduations, mois de l'axe, tendance) ---
// Graduations rondes : environ `count` repères entre min et max, avec le plus petit pas de `steps` qui convient.
function niceTicks(min, max, count, steps){
  const list = steps || [5,10,15,20,30,60,120,300,600];
  const target = Math.max(1e-9, max-min) / Math.max(1,(count||3)-1);
  const step = list.find(x=>x>=target) || list[list.length-1];
  const ticks = [];
  for(let v=Math.ceil(min/step - 1e-9)*step; v<=max+1e-9; v+=step) ticks.push(Math.round(v/step)*step);
  return { ticks, step };
}
// Bornes verticales d'une courbe : de la plus petite à la plus grande valeur, avec une marge de `pad` (8 % par défaut).
function chartYDomain(values, pad){
  const v = (values||[]).filter(x=>isFinite(x));
  if(!v.length) return null;
  let lo = Math.min(...v), hi = Math.max(...v);
  if(hi===lo){ lo -= 1; hi += 1; }
  const m = (hi-lo)*(pad==null?0.08:pad);
  return { min:lo-m, max:hi+m };
}
// Premiers de chaque mois entre deux dates, pour l'axe horizontal ; si trop nombreux, un mois sur k. Janvier porte l'année.
function monthTicks(startTs, endTs, maxLabels){
  const all = [];
  const d = new Date(startTs); d.setDate(1); d.setHours(0,0,0,0);
  if(d.getTime()<startTs) d.setMonth(d.getMonth()+1);
  for(; d.getTime()<=endTs; d.setMonth(d.getMonth()+1)){
    all.push({ ts:d.getTime(), label: d.getMonth()===0 ? `${MONTH_SHORT[0]} ${String(d.getFullYear()).slice(2)}` : MONTH_SHORT[d.getMonth()] });
  }
  // Le mois de départ garde son étiquette même quand la courbe commence en cours de mois (si l'écart est d'au moins 20 jours).
  const s0 = new Date(startTs);
  if(!all.length || all[0].ts - startTs >= 20*DAY_MS) all.unshift({ ts:startTs, label: s0.getMonth()===0 ? `${MONTH_SHORT[0]} ${String(s0.getFullYear()).slice(2)}` : MONTH_SHORT[s0.getMonth()] });
  const k = Math.max(1, Math.ceil(all.length/Math.max(1,maxLabels||6)));
  return all.filter((_,i)=>i%k===0);
}
// Droite de tendance (régression sur le temps, en jours) : valeurs aux dates `fromTs`, `toTs` (fin des points) et `projTs` (projection).
function trendSegments(points, projDays){
  const pts = (points||[]).filter(p=>p.value>0).slice().sort((a,b)=>a.ts-b.ts);
  if(pts.length<3) return null;
  const t0 = pts[0].ts, day = (ts)=>(ts-t0)/DAY_MS;
  const { slope, intercept } = linearRegression(pts.map(p=>({x:day(p.ts), y:p.value})));
  const at = (ts) => slope*day(ts)+intercept;
  const lastTs = pts[pts.length-1].ts, projTs = lastTs + (projDays==null?60:projDays)*DAY_MS;
  return { fromTs:t0, fromValue:at(t0), toTs:lastTs, toValue:at(lastTs), projTs, projValue:at(projTs) };
}

// « aujourd'hui, 07:33 », « hier, 18:42 » ou « 28 sept., 07:33 » (Mon compte : dernière course reçue).
function relativeDayTime(ts, nowTs){
  const d = new Date(ts), n = new Date(nowTs);
  const hhmm = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const diff = Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate()) - new Date(d.getFullYear(),d.getMonth(),d.getDate())) / DAY_MS);
  if(diff===0) return `aujourd'hui, ${hhmm}`;
  if(diff===1) return `hier, ${hhmm}`;
  return `${d.getDate()===1?"1er":d.getDate()} ${MONTH_SHORT[d.getMonth()]}, ${hhmm}`;
}

// --- Chiffres clés (D27) ---
function formatHoursMinutes(sec){
  const m = Math.round((sec||0)/60);
  return `${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}`;
}
function keyFigures(runs, todayTs){
  const t = new Date(todayTs);
  const yearStart = new Date(t.getFullYear(),0,1).getTime(), monthStart = new Date(t.getFullYear(),t.getMonth(),1).getTime();
  const list = (runs||[]).filter(r=>r.ts<=todayTs+DAY_MS);
  const year = list.filter(r=>r.ts>=yearStart), month = list.filter(r=>r.ts>=monthStart);
  const longestRun = month.reduce((m,r)=>(r.distKm||0)>((m&&m.distKm)||0) ? r : m, null);
  const longest = longestRun ? (longestRun.distKm||0) : 0;
  const best = recordHolders(list).allure_ef;
  return {
    yearKm: Math.round(year.reduce((a,r)=>a+(r.distKm||0),0)*10)/10,
    longestMonthKm: longest>0 ? Math.round(longest*10)/10 : null,
    longestMonthRunId: longest>0 ? (longestRun.id ?? null) : null,   // la séance qu'ouvre la tuile « Plus longue sortie »
    monthTimeSec: month.reduce((a,r)=>a+(r.durationSec||0),0),
    bestEfPaceSecKm: best ? best.paceSecKm : null,
    bestEfRunId: best ? (best.runId ?? null) : null,
  };
}

// --- « Tes records » (D26) : une ligne par distance, « pas encore couru » sinon ---
function shortDateFr(ts){
  const d = new Date(ts);
  return `${d.getDate()}${d.getDate()===1?"er":""} ${MONTH_SHORT[d.getMonth()]}`;
}
function recordsListModel(holders){
  return RECORD_DISTANCES.map(d=>{
    const h = holders.distances[d.key];
    return h ? { key:d.key, label:d.label, timeText:fmtDur(h.timeSec), dateText:shortDateFr(h.ts), runId:h.runId }
             : { key:d.key, label:d.label, timeText:null, dateText:"pas encore couru", runId:null };
  });
}

// --- Carte objectif de Progression (D25, journal 5) ---
// Début du programme : lundi de la première semaine planifiée, jamais remis à zéro quand le programme est recalculé.
function programStartMonday(plannedSessions){
  const weeks = (plannedSessions||[]).map(p=>p.week_start_date).filter(Boolean).sort();
  return weeks.length ? weeks[0] : null;
}
const parseDay = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
function programWeekNumber(startMonday, todayStr){
  if(!startMonday) return null;
  const n = Math.floor((parseDay(todayStr) - parseDay(startMonday)) / (7*DAY_MS)) + 1;
  return n>=1 ? n : null;
}
// Préparer une course : « Semaine X sur Y » + « J-N ». Y = semaines du début du programme à la course.
function raceProgress(startMonday, raceDateStr, todayStr){
  if(!raceDateStr) return null;
  const race = parseDay(raceDateStr), today = parseDay(todayStr);
  const daysLeft = Math.round((race - today) / DAY_MS);
  if(daysLeft<0) return { past:true, daysLeft:0 };
  const start = startMonday ? parseDay(startMonday) : null;
  const total = start ? Math.max(1, Math.ceil((race - start) / (7*DAY_MS))) : null;
  const week = total ? Math.min(total, Math.max(1, programWeekNumber(startMonday, todayStr) || 1)) : null;
  return { daysLeft, totalWeeks:total, week, pct: total ? Math.round(week/total*100) : null };
}
// Courir plus régulièrement / Rester en forme : 8 pastilles (une par semaine, les 8 dernières, la semaine en cours
// à la fin), pleine s'il y a eu au moins une course ; « N semaines d'affilée » (la semaine en cours ne compte que si
// elle a déjà une course).
function weeklyStreak(runDates, todayStr, weeks){
  const n = weeks || 8, dates = (runDates||[]).map(parseDay);
  const today = parseDay(todayStr);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay()+6)%7));
  const dots = [];
  for(let i=n-1;i>=0;i--){
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()-7*i), to = new Date(from.getFullYear(), from.getMonth(), from.getDate()+7);
    dots.push(dates.some(d=>d>=from && d<to));
  }
  let streak = 0, i = dots.length-1;
  if(!dots[i]) i--;                                  // semaine en cours encore vide : on compte à partir de la précédente
  for(; i>=0 && dots[i]; i--) streak++;
  return { dots, streak, currentWeekHasRun: dots[dots.length-1] };
}
// Améliorer mon allure : allure EF des 4 premières semaines du programme → des 4 dernières semaines.
function efPaceSinceStart(efPoints, startMonday, todayTs){
  if(!startMonday) return { status:"insuffisant" };
  return windowProgress(efPoints, parseDay(startMonday).getTime(), todayTs);
}
function objectiveVariant(objectifPrincipal){
  return { "Préparer une course":"race", "Améliorer mon allure":"pace", "Courir plus régulièrement":"streak", "Rester en forme":"streak" }[objectifPrincipal] || null;
}
// Anneaux (D29) : km et séances du mois ; pas d'objectif chiffré = pas d'anneau.
function ringModel(value, goal){
  if(!(goal>0)) return null;
  return { value, goal, pct: Math.min(100, Math.round(value/goal*100)) };
}

// --- Volume mensuel (6f, D32) ---
const VOLUME_HIGH_FACTOR = 1.3;   // « trop élevé » = objectif + 30 % (repère pragmatique, pas une règle sourcée)
// `view` : une année civile (janvier à décembre, jusqu'au mois en cours pour l'année en cours) ; sinon les `months` derniers mois.
function monthlyVolumeBars(runs, goalKm, todayTs, months, view){
  const n = months || 12, t = new Date(todayTs);
  const list = (runs||[]).filter(r=>r.distKm>0);
  const goal = goalKm>0 ? goalKm : null;
  const first = list.length ? new Date(Math.min(...list.map(r=>r.ts))) : null;
  const starts = [];
  if(view){ const last = view===t.getFullYear() ? t.getMonth() : 11; for(let m=0;m<=last;m++) starts.push(new Date(view, m, 1)); }
  else for(let i=n-1;i>=0;i--) starts.push(new Date(t.getFullYear(), t.getMonth()-i, 1));
  const bars = [];
  starts.forEach(d=>{
    if(!first || d < new Date(first.getFullYear(), first.getMonth(), 1)) return;
    const km = Math.round(list.filter(r=>{ const x=new Date(r.ts); return x.getFullYear()===d.getFullYear() && x.getMonth()===d.getMonth(); }).reduce((a,r)=>a+r.distKm,0)*10)/10;
    const state = !goal ? "none" : km > goal*VOLUME_HIGH_FACTOR ? "high" : km >= goal ? "met" : "under";
    bars.push({ key:d.getFullYear()+"-"+(d.getMonth()+1), label:MONTH_SHORT[d.getMonth()], km, current:d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth(), state });
  });
  const totalKm = Math.round(bars.reduce((a,b)=>a+b.km,0)*10)/10;
  return { bars, goalKm:goal, limitKm: goal ? Math.round(goal*VOLUME_HIGH_FACTOR*10)/10 : null, totalKm };
}
// Années civiles ayant au moins une sortie, de la plus récente à la plus ancienne ; [] s'il n'y en a qu'une (pas de menu).
function chartYears(runs){
  const ys = [...new Set((runs||[]).filter(r=>r.distKm>0).map(r=>new Date(r.ts).getFullYear()))].sort((x,y)=>y-x);
  return ys.length>=2 ? ys : [];
}

// --- Facile / soutenu (6h, D35) : facile = zones 1 à 3, soutenu = zones 4 et 5, repère à 80 % ---
const EASY_TARGET_PCT = 80;
function easyHardMonthly(monthly){   // chaque mois garde sortKey (année × 12 + mois) quand il est fourni
  return (monthly||[]).map(m=>{
    const secs = m.secs || [], easy = (secs[0]||0)+(secs[1]||0)+(secs[2]||0), hard = (secs[3]||0)+(secs[4]||0), total = easy+hard;
    return total>0 ? { label:m.label, easySec:easy, hardSec:hard, easyPct:Math.round(easy/total*100), hardPct:100-Math.round(easy/total*100), ...(m.sortKey!=null?{sortKey:m.sortKey}:{}) } : null;
  }).filter(Boolean);
}

/* ---------- Historique, détail d'une séance et ressenti (S7, design 7) ---------- */
// Filtres de l'historique (7g) : Courses = EF, Long, Fractionné, Seuil, Course ; Autres = le reste (Récup et Marche inclus, A9).
function historyCategory(type){ return RUNNING_RUN_TYPES.includes(type) ? "runs" : "others"; }
function historyMatches(run, cat, type){
  if(type && type!=="all" && run.type!==type) return false;
  if(cat==="runs") return historyCategory(run.type)==="runs";
  if(cat==="others") return historyCategory(run.type)==="others";
  return true;
}
// « Cette semaine » (du lundi à aujourd'hui, toujours dépliée, avec son total) puis les mois précédents sans répéter
// ces séances (D42). `runs` : [{id, ts, type, distKm}] ; chaque groupe, plus récent d'abord.
function historySplit(runs, todayStr){
  const today = parseDay(todayStr);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay()+6)%7)).getTime();
  const sorted = (runs||[]).slice().sort((a,b)=>b.ts-a.ts);
  const week = sorted.filter(r=>r.ts>=monday), rest = sorted.filter(r=>r.ts<monday);
  const months = [];
  rest.forEach(r=>{
    const d = new Date(r.ts), key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    let g = months[months.length-1];
    if(!g || g.key!==key){ g = { key, label:`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, runs:[] }; months.push(g); }
    g.runs.push(r);
  });
  const km = Math.round(week.reduce((a,r)=>a+(r.distKm||0),0)*10)/10;
  return { thisWeek:{ runs:week, km, count:week.length, text: week.length ? `${km>0?fmtDec(km,1)+" km · ":""}${week.length} séance${week.length>1?"s":""}` : "" }, months };
}
// Deuxième ligne d'une ligne d'historique : « 8,1 km · 5'43"/km · 46:18 » ; sans distance, la durée seule.
function historyRowInfo(run){
  if(run.dist>0) return [`${fmtDec(run.dist,1)} km`, run.allure ? `${fmtA(run.allure)}/km` : "", run.dur].filter(Boolean).join(" · ");
  return run.durationSec>=3600 ? run.dur : `${Math.round((run.durationSec||0)/60)} min`;
}
// Pastille de droite : la difficulté perçue (« 3/10 », violette à partir de 6) ou « À noter » quand le ressenti manque.
// Rien pour une séance qui ne compte pas dans les stats.
function difficultyPill(run){
  if(!run.includeInStats) return null;
  const rpe = run.painRatings ? run.painRatings.rpe : null;
  if(rpe==null) return { kind:"todo", text:"À noter", aria:"Ressenti à noter" };
  return { kind:"score", text:`${rpe}/10`, high: rpe>=6, aria:`Difficulté ${rpe} sur 10` };
}
// Trophée sous la ligne d'une séance qui détient un record actuel : « Record 10 km » (le premier, « +1 » s'il y en a d'autres).
function recordBadgeText(runId, holders){
  const labels = runRecordLabels(runId, holders);
  if(!labels.length) return "";
  const names = { "5k":"5 km", "10k":"10 km", "semi":"semi", "marathon":"marathon", "allure_ef":"allure EF", "allure_frac":"allure fractionné" };
  return `Record ${names[labels[0].key]}${labels.length>1?` +${labels.length-1}`:""}`;
}
// Confirmation de suppression (feuille) : dit ce qui arrive à la séance prévue liée (D45, journal 7).
// info : { typeLabel, dateText, distKm, linked:{status:"missed"|"planned"}|null }
function deleteRunText(info){
  const head0 = `${info.typeLabel} du ${info.dateText}${info.distKm>0?` · ${fmtDec(info.distKm,1)} km`:""}`;
  const head = head0.endsWith(".") ? head0 : head0+".";   // « 29 sept. » finit déjà par un point
  const tail = !info.linked ? "" : info.linked.status==="missed"
    ? " La séance prévue liée redevient « à replacer » (son jour est passé)."
    : " La séance prévue liée redevient « à faire ».";
  return `${head} Elle disparaît de l'historique et des stats.${tail}`;
}

// --- Silhouette de la carte du corps (7a) : devant (14 zones) et derrière (9 zones), « gauche » = côté gauche de l'écran ---
// [clé, cx, cy, rx, ry] dans une vue de 200 × 300.
const BODY_VIEWS = {
  front:[["epaules_g",62,62,16,12],["epaules_d",138,62,16,12],["abdos",100,92,22,22],["psoas_g",84,120,9,12],["psoas_d",116,120,9,12],["bassin",100,136,26,9],["cuisse_g",82,172,12,26],["cuisse_d",118,172,12,26],["genoux_g",82,214,9,9],["genoux_d",118,214,9,9],["tibias_g",82,246,8,20],["tibias_d",118,246,8,20],["pied_g",80,286,11,6],["pied_d",120,286,11,6]],
  back:[["dos",100,92,24,30],["fessiers_g",86,138,13,12],["fessiers_d",114,138,13,12],["ischios_g",84,178,11,24],["ischios_d",116,178,11,24],["mollets_g",82,236,10,18],["mollets_d",118,236,10,18],["tendons_g",82,272,6,9],["tendons_d",118,272,6,9]],
};
const ZONE_FULL_NAMES = {
  epaules_g:"Épaule gauche", epaules_d:"Épaule droite", dos:"Dos", abdos:"Abdos", psoas_g:"Psoas gauche", psoas_d:"Psoas droit", bassin:"Bassin",
  fessiers_g:"Fessier gauche", fessiers_d:"Fessier droit", cuisse_g:"Cuisse gauche", cuisse_d:"Cuisse droite", ischios_g:"Ischio gauche", ischios_d:"Ischio droit",
  genoux_g:"Genou gauche", genoux_d:"Genou droit", tibias_g:"Tibia gauche", tibias_d:"Tibia droit", mollets_g:"Mollet gauche", mollets_d:"Mollet droit",
  tendons_g:"Tendon gauche", tendons_d:"Tendon droit", pied_g:"Pied gauche", pied_d:"Pied droit",
};
const BODY_ZONE_KEYS = [...BODY_VIEWS.front, ...BODY_VIEWS.back].map(z=>z[0]);
function bodyViewOf(zoneKey){ return BODY_VIEWS.front.some(z=>z[0]===zoneKey) ? "front" : "back"; }
// Plusieurs moments possibles par zone (D39) ; les anciennes valeurs uniques (« pendant ») restent lisibles.
function zoneMoments(v){ return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []; }
// Couleur d'une zone selon l'intensité : 1 à 5 en blanc (opacité de 35 à 100 %), 6 à 10 en violet (50 à 100 %), 0 = neutre.
function zoneFill(v){
  const n = Number(v)||0;
  if(n<=0) return { fill:"#33373C", stroke:"#4A4F55", opacity:1 };
  if(n<=5) return { fill:"#F2F3F0", stroke:"#F2F3F0", opacity: Math.round((0.35+(n-1)*0.1625)*100)/100 };
  return { fill:"#B688FE", stroke:"#B688FE", opacity: Math.round((0.5+(n-6)*0.125)*100)/100 };
}
// Plus forte intensité notée sur une zone du corps : ≥ 6 déclenche « On te propose d'adapter ton programme ».
function maxZoneIntensity(ratings){
  return BODY_ZONE_KEYS.reduce((m,k)=>Math.max(m, Number(ratings && ratings[k])||0), 0);
}
// Enregistrement de la feuille de ressenti : mêmes clés qu'avant (rpe, fatigue, mental, respiration, gene, une valeur par zone,
// `${zone}_moment`) ; la note globale n'est plus demandée (D38), l'ancienne valeur reste en base si elle existait.
function buildPainRatings(form, existing){
  const out = { ...(existing||{}) };
  ["rpe","fatigue","mental","respiration"].forEach(k=>{ const v = form.sliders && form.sliders[k]; if(v!=null && v!=="") out[k] = parseInt(v,10); });
  out.gene = form.gene===true ? true : form.gene===false ? false : null;
  BODY_ZONE_KEYS.forEach(k=>{
    const z = (form.zones && form.zones[k]) || {};
    const v = form.gene===false ? 0 : (parseInt(z.value,10)||0);
    out[k] = v;
    out[k+"_moment"] = v>0 ? (zoneMoments(z.moments).length ? zoneMoments(z.moments) : ["pendant"]) : [];
  });
  return out;
}

/* ---------- Base d'exercices renfo/mobilité (CDC v2, 4.7 — base pour 4.6.a) ----------
   Fournie par l'utilisateur (01/10/2026), 20 exercices (14 Renfo + 6
   Mobilité) — destinée à être relue par un kiné avant la phase 3 (CDC v2,
   trajectoire, condition de passage phase 2->3). `visuel` : SVG animé
   (bonhomme filaire, produit avec Claude Design le 02/10/2026, style
   validé), `consignes` : 3 repères d'exécution courts. Les deux sont
   affichés dans la séance (exerciseListHTML, index.html).
   `zonesDouleur` : correspondance faite au mieux avec nos 22 zones déjà
   codées (BODY_ZONES), qui n'utilisent pas exactement les mêmes noms que
   la colonne "Gêne/douleur associée" fournie — signalé à l'utilisateur :
   "bas du dos" -> dos ; "Achille"/"périostite" -> tendons/tibias (deux
   zones déjà existantes, pas une seule) ; "hanche" -> bassin (pas de zone
   "hanche" dédiée) sauf "fléchisseurs de hanche" -> psoas (zone déjà
   explicitement nommée) ; "essuie-glace"/bande ilio-tibiale -> cuisse
   (pas de zone dédiée) ; "fasciite plantaire"/"talon" -> pied.
   `objectifs` : "Tous" ou liste des libellés exacts d'objectifs (4.2). */
const EXERCISE_LIBRARY = [
  { id:1,  name:"Pont fessier bilatéral", type:"Renfo", zoneTravaillee:"Grand fessier", objectifs:"Tous", zonesDouleur:["genoux","dos"], niveau:"Débutant", format:"3x15", materiel:"Aucun", variante:null, visuel:"exercices/pont-fessier.svg", consignes:["Pieds à plat, près des fesses", "Serre les fessiers pour monter", "En haut : épaules, hanches, genoux alignés"] },
  { id:2,  name:"Pont fessier unilatéral", type:"Renfo", zoneTravaillee:"Grand fessier (unilatéral)", objectifs:["Préparer une course","Améliorer mon allure"], zonesDouleur:["genoux"], niveau:"Intermédiaire", format:"3x10/côté", materiel:"Aucun", variante:null, visuel:"exercices/pont-fessier-unilateral.svg", consignes:["Jambe levée tendue, dans l'axe de la cuisse", "Pousse dans le talon au sol", "Bassin horizontal, il ne bascule pas"] },
  { id:3,  name:"Clamshell (coquillage) élastique", type:"Renfo", zoneTravaillee:"Moyen fessier", objectifs:"Tous", zonesDouleur:["genoux","bassin"], niveau:"Débutant", format:"3x15/côté", materiel:"Élastique", variante:"Sans élastique : même mouvement, en tenant 2 secondes en haut de chaque répétition.", visuel:"exercices/clamshell-elastique.svg", consignes:["Hanches empilées, pieds collés", "Ouvre le genou sans rouler le bassin", "Referme lentement contre l'élastique"] },
  { id:4,  name:"Marche latérale élastique", type:"Renfo", zoneTravaillee:"Moyen fessier", objectifs:"Tous", zonesDouleur:["genoux","bassin"], niveau:"Débutant", format:"3x10 pas/côté", materiel:"Élastique", variante:"Sans élastique : pas latéraux lents en position de mini-squat, genoux légèrement fléchis.", visuel:"exercices/marche-laterale-elastique.svg", consignes:["Reste en mini-squat tout du long", "Petits pas, l'élastique reste tendu", "Genoux vers l'extérieur, pieds parallèles"] },
  { id:5,  name:"Fente arrière", type:"Renfo", zoneTravaillee:"Quadriceps, fessiers, stabilité", objectifs:"Tous", zonesDouleur:["genoux"], niveau:"Débutant/Intermédiaire", format:"3x10/côté", materiel:"Aucun", variante:null, visuel:"exercices/fente-arriere.svg", consignes:["Grand pas en arrière, buste droit", "Genou avant au-dessus de la cheville", "Remonte en poussant sur le talon avant"] },
  { id:6,  name:"Squat bulgare", type:"Renfo", zoneTravaillee:"Quadriceps, fessiers (unilatéral)", objectifs:["Améliorer mon allure","Préparer une course"], zonesDouleur:["genoux"], niveau:"Intermédiaire", format:"3x8/côté", materiel:"Chaise ou banc", variante:"Sans surélévation : pied arrière posé au sol, derrière toi, même mouvement de fente.", visuel:"exercices/squat-bulgare.svg", consignes:["Dessus du pied arrière sur la chaise", "Descends à la verticale, buste droit", "Genou avant au-dessus de la cheville"] },
  { id:7,  name:"Soulevé de terre jambe tendue unilatéral", type:"Renfo", zoneTravaillee:"Ischios, fessiers, équilibre", objectifs:"Tous", zonesDouleur:["ischios","dos"], niveau:"Intermédiaire", format:"3x8/côté", materiel:"Aucun", variante:null, visuel:"exercices/souleve-de-terre-jambe-tendue-unilateral.svg", consignes:["Genou d'appui légèrement fléchi", "Bascule le buste, dos droit, jambe arrière dans l'axe", "Remonte en serrant le fessier"] },
  { id:8,  name:"Nordic hamstring curl (ou variante assistée)", type:"Renfo", zoneTravaillee:"Ischio-jambiers (excentrique)", objectifs:["Améliorer mon allure","Préparer une course"], zonesDouleur:["ischios"], niveau:"Avancé", format:"3x5", materiel:"Point d'ancrage pour les pieds (partenaire ou meuble lourd)", variante:"Sans ancrage : pont fessier talons au sol, en faisant glisser lentement les talons vers les fesses puis en les repoussant.", visuel:"exercices/nordic-hamstring-curl.svg", consignes:["Chevilles bien calées", "Corps droit des genoux à la tête", "Descends le plus lentement possible, mains prêtes"] },
  { id:9,  name:"Mollets debout jambe tendue", type:"Renfo", zoneTravaillee:"Gastrocnémien", objectifs:"Tous", zonesDouleur:["mollets","tendons","tibias"], niveau:"Débutant", format:"3x15", materiel:"Aucun", variante:null, visuel:"exercices/mollets-debout-jambe-tendue.svg", consignes:["Jambes tendues", "Monte haut sur la pointe des pieds", "Redescends lentement jusqu'au talon"] },
  { id:10, name:"Mollets debout genou fléchi", type:"Renfo", zoneTravaillee:"Soléaire", objectifs:"Tous", zonesDouleur:["tendons","mollets"], niveau:"Débutant", format:"3x15", materiel:"Aucun", variante:null, visuel:"exercices/mollets-debout-genou-fleshi.svg", consignes:["Genoux légèrement fléchis, garde-les ainsi", "Monte sur la pointe des pieds", "Redescends lentement"] },
  { id:11, name:"Gainage ventral (planche)", type:"Renfo", zoneTravaillee:"Core (transverse)", objectifs:"Tous", zonesDouleur:["dos"], niveau:"Débutant", format:"3x30-45s", materiel:"Aucun", variante:null, visuel:"exercices/gainage-planche.svg", consignes:["Coudes sous les épaules", "Corps aligné, bassin ni haut ni bas", "Respire calmement, ne bloque pas"] },
  { id:12, name:"Gainage latéral (planche côté)", type:"Renfo", zoneTravaillee:"Obliques, moyen fessier", objectifs:"Tous", zonesDouleur:["bassin","dos"], niveau:"Débutant/Intermédiaire", format:"3x20-30s/côté", materiel:"Aucun", variante:null, visuel:"exercices/gainage-lateral.svg", consignes:["Coude sous l'épaule", "Corps aligné, hanches hautes", "Respire calmement, ne bloque pas"] },
  { id:13, name:"Dead bug", type:"Renfo", zoneTravaillee:"Core profond (stabilité lombo-pelvienne)", objectifs:"Tous", zonesDouleur:["dos"], niveau:"Débutant", format:"3x10/côté", materiel:"Aucun", variante:null, visuel:"exercices/dead-bug.svg", consignes:["Bas du dos plaqué au sol", "Allonge bras et jambe opposés en même temps", "Va lentement, reviens au centre"] },
  { id:14, name:"Renforcement intrinsèque du pied (toe curls / short foot)", type:"Renfo", zoneTravaillee:"Muscles du pied", objectifs:"Tous", zonesDouleur:["pied"], niveau:"Débutant", format:"3x15 ou 2 min", materiel:"Aucun", variante:null, visuel:"exercices/renforcement-pied.svg", consignes:["Orteils à plat, détendus", "Rapproche la base des orteils du talon", "La voûte monte, les orteils restent au sol"] },
  { id:15, name:"Étirement fléchisseurs de hanche (couch stretch)", type:"Mobilité", zoneTravaillee:"Psoas, fléchisseurs hanche", objectifs:"Tous", zonesDouleur:["psoas","dos"], niveau:"Débutant", format:"2x30-45s/côté", materiel:"Un mur ou un canapé", variante:"Sans mur : fente basse, genou arrière posé au sol, buste droit, hanche poussée vers l'avant.", visuel:"exercices/etirement-flechisseurs-hanche.svg", consignes:["Genou arrière posé au sol", "Serre le fessier arrière, avance le bassin", "Buste droit, sans cambrer"] },
  { id:16, name:"Mobilité cheville (knee-to-wall dorsiflexion)", type:"Mobilité", zoneTravaillee:"Cheville", objectifs:"Tous", zonesDouleur:["tendons","tibias","mollets"], niveau:"Débutant", format:"2x10/côté", materiel:"Un mur", variante:null, visuel:"exercices/mobilite-cheville.svg", consignes:["Pied avant à quelques cm du mur", "Avance le genou vers le mur", "Le talon reste collé au sol"] },
  { id:17, name:"Étirement mollet contre mur", type:"Mobilité", zoneTravaillee:"Mollet (gastrocnémien)", objectifs:"Tous", zonesDouleur:["mollets","tendons","tibias"], niveau:"Débutant", format:"2x30s/côté", materiel:"Un mur", variante:null, visuel:"exercices/etirement-mollet-mur.svg", consignes:["Jambe arrière tendue", "Talon arrière collé au sol", "Penche-toi doucement, sans à-coup"] },
  { id:18, name:"Ouverture de hanche 90/90", type:"Mobilité", zoneTravaillee:"Rotateurs de hanche", objectifs:["Préparer une course","Améliorer mon allure"], zonesDouleur:["bassin","genoux"], niveau:"Intermédiaire", format:"2x30-45s/côté", materiel:"Aucun", variante:null, visuel:"exercices/ouverture-hanche-90-90.svg", consignes:["Les deux genoux à 90°", "Buste droit, penche-toi depuis les hanches", "Reste dans une sensation douce"] },
  { id:19, name:"Étirement / auto-massage bande ilio-tibiale", type:"Mobilité", zoneTravaillee:"Bande ilio-tibiale, tenseur du fascia lata", objectifs:"Tous", zonesDouleur:["genoux","cuisse"], niveau:"Débutant", format:"1-2 min/côté", materiel:"Rouleau de massage (foam roller)", variante:"Sans rouleau : étirement debout, jambe croisée derrière l'autre, buste penché du côté opposé.", visuel:"exercices/etirement-bande-ilio-tibiale.svg", consignes:["Croise une jambe derrière l'autre", "Pousse la hanche vers l'extérieur", "Penche le buste du côté opposé"] },
  { id:20, name:"Auto-massage plantaire (balle)", type:"Mobilité", zoneTravaillee:"Fascia plantaire", objectifs:"Tous", zonesDouleur:["pied"], niveau:"Débutant", format:"2 min/pied", materiel:"Balle (tennis ou de massage)", variante:"Sans balle : rouler le pied sur une bouteille d'eau.", visuel:"exercices/auto-massage-plantaire.svg", consignes:["Assis, pied posé sur la balle", "Fais rouler du talon aux orteils", "Appuie selon ton confort, sans douleur"] },
];
// Une zone de BODY_ZONES porte un suffixe _g/_d (genoux_g, genoux_d...) —
// un exercice n'est jamais spécifique à un côté, donc on compare par
// "famille" de zone (suffixe retiré) plutôt que par clé exacte.
function zoneFamily(zoneKey){
  return (zoneKey||"").replace(/_(g|d)$/, "");
}
function exercisesForZone(zoneKey){
  const family = zoneFamily(zoneKey);
  return EXERCISE_LIBRARY.filter(ex => ex.zonesDouleur.includes(family));
}

// Texte d'une liste d'exercices pour la description d'une séance : nom,
// format, matériel (seulement s'il en faut) et variante sans matériel.
function formatExerciseList(exercises){
  return exercises.map(ex => {
    let line = `${ex.name} — ${ex.format}`;
    if(ex.materiel && ex.materiel!=="Aucun") line += ` · matériel : ${ex.materiel}`;
    if(ex.variante) line += `\n   ${ex.variante}`;
    return line;
  }).join("\n");
}

/* ---------- Remplacer ou supprimer un exercice d'une séance (D4, V1b à V1d) ----------
   La description d'une séance est un texte : une ligne « Nom — format [· matériel : …] » par exercice,
   suivie de lignes indentées (variante). Rien à changer en base : on réécrit ce texte, pour la séance
   du jour seulement (les prochaines séances gardent leur liste). Un exercice est retrouvé par son nom
   dans la bibliothèque ; toute autre ligne est gardée telle quelle. */
function parseExerciseBlocks(description, library){
  const lib = library || EXERCISE_LIBRARY;
  const blocks = [];
  String(description||"").split("\n").forEach(line=>{
    const ex = line.startsWith("   ") ? null : lib.find(e=>line.startsWith(e.name+" — "));
    if(ex) blocks.push({ kind:"ex", name:ex.name, ex, lines:[line] });
    else if(line.startsWith("   ") && blocks.length) blocks[blocks.length-1].lines.push(line);
    else blocks.push({ kind:"text", lines:[line] });
  });
  return blocks;
}
function exercisesInDescription(description, library){
  return parseExerciseBlocks(description, library).filter(b=>b.kind==="ex").map(b=>b.ex);
}
function removeExerciseFromDescription(description, name, library){
  return parseExerciseBlocks(description, library).filter(b=>!(b.kind==="ex" && b.name===name)).map(b=>b.lines.join("\n")).join("\n");
}
function replaceExerciseInDescription(description, oldName, newEx, library){
  return parseExerciseBlocks(description, library).map(b=>(b.kind==="ex" && b.name===oldName) ? formatExerciseList([newEx]) : b.lines.join("\n")).join("\n");
}
// Exercices proposés pour en remplacer un : même zone travaillée d'abord, puis zone de douleur commune,
// puis même type. Jamais un exercice déjà dans la séance ; l'exercice remplacé lui-même est exclu.
function replacementCandidates(exName, currentNames, library){
  const lib = library || EXERCISE_LIBRARY;
  const cur = lib.find(e=>e.name===exName);
  if(!cur) return [];
  const taken = new Set([...(currentNames||[]), exName]);
  const shares = (a,b) => (a.zonesDouleur||[]).some(z=>(b.zonesDouleur||[]).includes(z));
  const rank = e => e.zoneTravaillee===cur.zoneTravaillee ? 0 : shares(e,cur) ? 1 : 2;
  return lib.filter(e=>e.type===cur.type && !taken.has(e.name)).sort((a,b)=>rank(a)-rank(b) || a.name.localeCompare(b.name,"fr"));
}

/* ---------- Séance de renfo / mobilité (CDC v2, 4.7.c) ----------
   Durée visée par niveau (10-30 min, CDC) et durée estimée par exercice :
   choix pragmatiques validés avec l'utilisateur, PAS des règles sourcées.
   Niveaux : l'app dit Débutant/Intermédiaire/Confirmé, la base dit aussi
   "Avancé" (traité comme Confirmé) et "Débutant/Intermédiaire"
   (accessible dès Débutant). Un coureur peut faire les exercices de son
   niveau ou plus faciles. Les exercices liés à une zone en pause (4.6.c)
   sont exclus. Sélection répartie sur la liste (groupée par zone) avec un
   décalage `rotationSeed` qui change d'une semaine à l'autre, pour ne
   pas refaire les mêmes exercices. Mobilité : la base n'a que 6
   exercices, la durée est donc plafonnée par ce qui existe. */
const STRENGTH_TARGET_MIN = { "Débutant":12, "Intermédiaire":20, "Confirmé":30 };
const STRENGTH_MIN_PER_EXERCISE = { "Renfo":3, "Mobilité":2 };
const EXERCISE_LEVEL_RANK = { "Débutant":0, "Débutant/Intermédiaire":0, "Intermédiaire":1, "Avancé":2 };
const RUNNER_LEVEL_RANK = { "Débutant":0, "Intermédiaire":1, "Confirmé":2 };
function buildStrengthSession({ type, niveau, objectif, pausedZoneKeys, rotationSeed }){
  const perExercise = STRENGTH_MIN_PER_EXERCISE[type];
  if(!perExercise) return null;
  const target = STRENGTH_TARGET_MIN[niveau] ?? STRENGTH_TARGET_MIN["Débutant"];
  const rank = RUNNER_LEVEL_RANK[niveau] ?? 0;
  const pausedFamilies = (pausedZoneKeys||[]).map(zoneFamily);
  const eligible = EXERCISE_LIBRARY.filter(ex =>
    ex.type===type
    && (EXERCISE_LEVEL_RANK[ex.niveau] ?? 0) <= rank
    && (ex.objectifs==="Tous" || (objectif && ex.objectifs.includes(objectif)))
    && !ex.zonesDouleur.some(z => pausedFamilies.includes(z)));
  if(!eligible.length) return null;
  const count = Math.min(eligible.length, Math.max(1, Math.round(target/perExercise)));
  const step = eligible.length/count;
  const offset = Math.abs(rotationSeed||0) % eligible.length;
  const exercises = Array.from({length:count}, (_,k) => eligible[Math.floor(offset + k*step) % eligible.length]);
  return { exercises, durationMin: count*perExercise };
}

/* ---------- Cohérence date/distance/niveau d'un objectif course (4.2.d) ----------
   Durées MINIMALES recommandées par distance : directement reprises des
   plans Hal Higdon (coach américain, référence largement utilisée et
   publiée), dont la durée totale ne varie quasiment pas entre les niveaux
   Novice/Intermediate pour une même distance (c'est le contenu de chaque
   semaine qui change, pas la durée) — vérifié le 30/09/2026 :
   5K  : https://www.halhigdon.com/training-programs/5k-training/novice-5k/ (8 semaines)
   10K : https://www.halhigdon.com/training-programs/10k-training/novice-10k/ (8 semaines)
   15K : https://www.halhigdon.com/training-programs/15k-10-mile-training/novice-15k-10-mile/ (10 semaines)
   Semi : https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/ (12 semaines)
   Marathon : https://www.halhigdon.com/training-programs/marathon-training/novice-1-marathon/ (18 semaines)
   Le facteur "Confirmé" (-25%) ci-dessous n'est PAS issu de Higdon — c'est
   notre propre ajustement (un coureur déjà confirmé peut raisonnablement
   compresser davantage), à afficher distinctement de la source dans l'UI. */
const HIGDON_MIN_WEEKS = { "5km":8, "10km":8, "15km":10, "Semi":12, "Marathon":18 };
const NIVEAU_WEEKS_FACTOR = { "Débutant":1, "Intermédiaire":1, "Confirmé":0.75 };
// Écart jugé "extrême" : moins de 60% de la durée minimale recommandée —
// seuil choisi avec l'utilisateur, pas issu de Higdon non plus.
const EXTREME_GAP_FACTOR = 0.6;

// `weeksAvailable` : semaines entre aujourd'hui et la date visée.
// Renvoie le statut ("ok"/"compresse"/"extreme"), la durée minimale
// recommandée (ajustée au niveau) et si le plan compressé peut être
// proposé ou non.
function checkGoalTimelineFeasibility(distanceKey, niveau, weeksAvailable){
  const baseWeeks = HIGDON_MIN_WEEKS[distanceKey];
  if(baseWeeks==null || weeksAvailable==null) return null;
  const minWeeks = baseWeeks * (NIVEAU_WEEKS_FACTOR[niveau] ?? 1);
  if(weeksAvailable >= minWeeks) return { status:"ok", minWeeks };
  if(weeksAvailable >= minWeeks*EXTREME_GAP_FACTOR) return { status:"compresse", minWeeks };
  return { status:"extreme", minWeeks };
}

/* ---------- Parcours de démarrage : date de course (S10, journal 11b, #32 ; D59) ----------
   À l'étape « Objectif », avant de connaître le niveau : sous « Confirmé », le niveau n'a pas d'effet sur la durée
   minimale (Débutant et Intermédiaire comptent pareil), donc on juge sans niveau (ou avec celui qu'on connaît déjà).
   Trois états : correct (rien à dire), « Date un peu serrée » (au moins 60 % du minimum : on peut la garder, le
   programme sera plus prudent) et « Date trop proche » (moins de 60 % : on propose la première date possible). */
const RACE_WITH_ARTICLE = { "5km":"un 5 km", "10km":"un 10 km", "15km":"un 15 km", "Semi":"un semi-marathon", "Marathon":"un marathon" };
function weeksText(n){ return n<1 ? "Moins d'une semaine" : `${n} semaine${n>1?"s":""}`; }
function addDaysToStr(dateStr, n){
  const [y,m,d] = dateStr.split("-").map(Number), t = new Date(y, m-1, d+n);
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
}
// Première date à partir de laquelle la date n'est plus « trop proche » (aujourd'hui + 60 % du minimum, arrondi au jour
// supérieur : un jour de moins, et on resterait en dessous du seuil).
function firstPossibleDate(distanceKey, niveau, todayStr){
  if(HIGDON_MIN_WEEKS[distanceKey]==null) return null;
  for(let days=1; days<=800; days++){
    const date = addDaysToStr(todayStr, days), check = checkGoalTimelineFeasibility(distanceKey, niveau, weeksUntilDate(date, todayStr));
    if(check && check.status!=="extreme") return date;
  }
  return null;
}
// Ce que l'écran affiche pour une date de course : état, textes du design, première date possible. null si rien à juger.
function dateCheckModel(distanceKey, niveau, dateStr, todayStr){
  if(!dateStr || HIGDON_MIN_WEEKS[distanceKey]==null) return null;
  const weeks = weeksUntilDate(dateStr, todayStr), check = checkGoalTimelineFeasibility(distanceKey, niveau, weeks);
  if(!check || check.status==="ok") return check ? { status:"ok", weeks, minWeeks:check.minWeeks } : null;
  const what = RACE_WITH_ARTICLE[distanceKey], advised = Math.ceil(check.minWeeks), required = Math.ceil(check.minWeeks*EXTREME_GAP_FACTOR);
  const first = check.status==="extreme" ? firstPossibleDate(distanceKey, niveau, todayStr) : null;
  return {
    status:check.status, weeks, minWeeks:check.minWeeks, advisedWeeks:advised, requiredWeeks:required,
    title: check.status==="compresse" ? "Date un peu serrée" : "Date trop proche",
    text: check.status==="compresse"
      ? `${weeksText(weeks)} pour ${what}, c'est court à ton niveau. On te conseille au moins ${advised} semaines. Tu peux garder cette date : le programme sera plus prudent.`
      : `${weeksText(weeks)} pour ${what}, c'est trop court pour te préparer sans risque de blessure. Il faut au moins ${required} semaines à ton niveau.`,
    firstDate:first, firstDateFr:first ? isoToFr(first) : "",
  };
}
// Peut-on passer à l'étape suivante ? `choice` : « first » (première date prise), « none » (sans date), « other » (autre date à choisir),
// « keep » (date un peu serrée gardée). Une date trop proche bloque tant qu'aucune date possible n'est choisie ; « sans date » débloque.
function dateStepBlocked(model, choice){
  if(!model || model.status==="ok") return false;
  if(choice==="first") return false;     // la première date possible a été prise : on n'en demande pas plus
  if(model.status==="compresse") return choice!=="keep";
  return choice!=="none";
}

/* ---------- Guide « Voir comment » : connecter RunSync (S10, journal 11, élément 13 ; D60 ; lot 2, D102 ; D107) ----------
   4 étapes : installer TestFlight, installer RunSync, l'ouvrir et se laisser guider (connexion avec l'e-mail déjà rempli,
   date de départ, Apple Santé et import se font dans RunSync version 3), recevoir les courses. Les trois premières se
   cochent toutes seules quand on revient dans l'app après les avoir ouvertes ; la dernière attend l'arrivée des premières
   courses (interrogation régulière), puis « C'est connecté » ; au bout de 90 s sans rien : « Rien reçu ».
   TestFlight a son étape (D107) : RunSync s'installe maintenant par le lien direct de TestFlight, qui ne marche que si
   TestFlight est déjà là. */
const SYNC_GUIDE_TITLES = ["Installe TestFlight", "Installe RunSync", "Ouvre RunSync et laisse-toi guider", "On reçoit tes courses"];
const SYNC_WAIT_EMPTY_SEC = 30;   // R4 (08/10/2026) : 90 s « dans le vide » pour Mohamed, sans historique
// Guide selon l'équipement déclaré dans « Ton profil coureur » (R4). RunSync lit Apple Santé : une Apple Watch y écrit
// toute seule ; Garmin Connect et Strava seulement si on l'active dans leurs réglages ; RunSync écarte les séances Whoop
// (doublons avec l'Apple Watch) ; sans montre ni app de course, rien n'arrive. `equipement` : « Apple Watch,Whoop »…
function syncEquip(equipement){
  const list = String(equipement||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(!list.length) return { kind:null, apps:[] };
  if(list.includes("Apple Watch")) return { kind:"watch", apps:[] };
  const apps = list.filter(x=>x==="Garmin" || x==="Strava");
  if(apps.length) return { kind:"app", apps };
  if(list.includes("Whoop")) return { kind:"whoop", apps:[] };
  return { kind:"none", apps:[] };
}
const SYNC_APP_NAMES = { Garmin:"Garmin Connect", Strava:"Strava" };
const syncAppsText = (apps) => (apps||[]).map(a=>SYNC_APP_NAMES[a]||a).join(" ou ");
// Note en tête du guide, avant d'installer quoi que ce soit ; null pour une Apple Watch ou sans réponse. `skip` : proposer
// de passer le guide (rien ne pourra arriver tout seul).
function syncGuideNote(eq){
  if(!eq) return null;
  if(eq.kind==="app") return { text:`Avant de commencer : dans ${syncAppsText(eq.apps)}, active l'envoi de tes activités vers Apple Santé. Sinon, rien n'arrivera.`, skip:false };
  if(eq.kind==="whoop") return { text:"Les séances Whoop ne sont pas encore reprises par RunSync. Tu peux saisir tes courses à la main, ou installer RunSync quand même pour plus tard.", skip:true };
  if(eq.kind==="none") return { text:"Sans montre ni app de course, rien ne peut arriver tout seul. Enregistre tes courses avec une app qui les envoie dans Apple Santé (Strava, Nike Run Club…), ou saisis-les à la main.", skip:true };
  return null;
}
// Ce que dit l'étape 4 quand rien n'arrive (R4) : RunSync relié au compte ou pas (`linked` : date de départ posée par
// RunSync), puis selon l'équipement. `sinceText` : « 1er janv. » (facultatif).
const SYNC_MANUAL_LINE = "Tu peux aussi saisir tes courses à la main : « J'ai fait cette séance » sur Aujourd'hui, ou « Séance réalisée » dans Progression.";
function syncEmptyMessage(linked, eq, sinceText){
  if(!linked) return { title:"RunSync n'est pas encore connecté à ton compte.", lines:["Rouvre-le et connecte-toi avec le même e-mail que dans MyRunningApp."], reopen:true };
  const since = sinceText ? ` depuis le ${sinceText}` : "";
  const kind = eq ? eq.kind : null;
  if(kind==="watch") return { title:"RunSync est bien connecté.", lines:[`Apple Santé ne contient pas encore de course${since}. Ta prochaine course enregistrée avec ta montre arrivera toute seule.`, SYNC_MANUAL_LINE], reopen:false };
  if(kind==="app") return { title:`RunSync est bien connecté, mais Apple Santé ne contient aucune course${since}.`, lines:[`Active l'envoi de tes activités vers Apple Santé dans ${syncAppsText(eq.apps)} : elles arriveront ici toutes seules.`, SYNC_MANUAL_LINE], reopen:false };
  if(kind==="whoop") return { title:"RunSync est bien connecté.", lines:["Les séances Whoop ne sont pas encore reprises. Pour l'instant, enregistre aussi tes courses avec une autre app.", SYNC_MANUAL_LINE], reopen:false };
  return { title:`RunSync est bien connecté, mais Apple Santé ne contient aucune course${since}.`, lines:["Pour que tes courses arrivent toutes seules, enregistre-les avec une app qui les envoie dans Apple Santé (Strava, Nike Run Club, Garmin Connect…).", SYNC_MANUAL_LINE], reopen:false };
}
// `done` : une case par étape à faire, toutes sauf la dernière (cases en trop ignorées) ; `received` : séances reçues
// d'Apple Santé (courses, marches, renfo…) ; `waitedSec` : attente à la dernière étape ; `runs` : combien de ces séances
// sont des courses (inconnu tant que les séances ne sont pas chargées).
function syncGuideModel(done, received, waitedSec, runs){
  const d = SYNC_GUIDE_TITLES.slice(0, -1).map((_, i) => !!(done && done[i]));
  const last = SYNC_GUIDE_TITLES.length;
  const connected = (received||0)>0;
  const firstTodo = d.findIndex(x=>!x);
  const active = connected ? last : (firstTodo<0 ? last : firstTodo+1);
  const phase = connected ? "ok" : (firstTodo<0 ? ((waitedSec||0)>=SYNC_WAIT_EMPTY_SEC ? "empty" : "wait") : null);
  return {
    active, phase, connected,
    // Les courses sont arrivées : les étapes d'avant sont cochées d'office (RunSync était déjà en place) et la dernière reste ouverte (« C'est connecté »).
    steps: SYNC_GUIDE_TITLES.map((title,i)=>({ n:i+1, title, state: i<last-1 ? (d[i] || connected ? "done" : i+1===active ? "active" : "todo") : (active===last ? "active" : "todo") })),
    summary: connected ? `C'est connecté · ${syncReceivedText(received, runs)}` : "",
  };
}
// État du guide gardé sur l'appareil (l'app peut être rechargée pendant qu'on est dans l'App Store, TestFlight ou RunSync).
// Version 2 (4 étapes, D107) : 3 cases, `pending` = étape dont on est parti ouvrir l'app (1 à 3). Avant : 2 cases (RunSync
// installé, RunSync ouvert), voire une 3e (Apple Santé) ignorée ; RunSync installé veut dire TestFlight installé aussi.
function syncGuideRestore(saved){
  const d = saved && Array.isArray(saved.done) ? saved.done : [];
  const p = saved ? Number(saved.pending) || 0 : 0;
  if(saved && saved.v===2) return { done:[!!d[0], !!d[1], !!d[2]], pending: p>=1 && p<=3 ? p : 0 };
  // ancien guide : 1 = parti installer RunSync (page TestFlight), 2 = parti ouvrir RunSync
  return { done:[!!d[0] || p===1, !!d[0], !!d[1]], pending: p===1 ? 2 : p===2 ? 3 : 0 };
}
// Liens des étapes « Installe TestFlight » et « Installe RunSync ». Sur iPhone, liens directs vers l'App Store et TestFlight
// (comme myrunningapp:// pour RunSync) : l'app s'ouvre sans passer par le mini-navigateur que l'iPhone ouvre dans une app
// de l'écran d'accueil pour un lien web, et qui restait ouvert, vide, au retour (test d'Omar du 07/10/2026). Ailleurs, les
// pages web d'Apple. `joinUrl` : lien public TestFlight (https://testflight.apple.com/join/…), vide tant qu'il n'existe pas.
const TESTFLIGHT_APP_ID = "899247664";
function syncInstallLinks(ios, joinUrl){
  const join = String(joinUrl||"").trim();
  const code = (join.match(/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/) || [])[1] || "";
  if(!ios) return { testflight:`https://apps.apple.com/app/testflight/id${TESTFLIGHT_APP_ID}`, runsync:join };
  return { testflight:`itms-apps://apps.apple.com/app/testflight/id${TESTFLIGHT_APP_ID}`, runsync: code ? `itms-beta://testflight.apple.com/join/${code}` : "" };
}
// « 234 séances reçues, dont 77 courses » : RunSync envoie toutes les séances, pas seulement les courses (retour d'Omar,
// 06/10/2026 : « 234 courses reçues » était faux).
function syncReceivedText(received, runs){
  const n = (k, one, many) => `${k} ${k>1?many:one}`;
  if(runs==null || runs===0) return n(received, "séance reçue", "séances reçues");
  if(runs===received) return n(received, "course reçue", "courses reçues");
  return `${n(received, "séance reçue", "séances reçues")}, dont ${n(runs, "course", "courses")}`;
}
/* ---------- Visite guidée après le parcours de démarrage (lot 3, D105) ----------
   Une bulle par onglet, sur le vrai écran, l'onglet éclairé dans le menu du bas. Remplace les 4 anciennes bulles « Compris »
   retirées le 05/10/2026 (D91, textes périmés). La dernière montre où tout se règle ; la première fois, l'écran
   « Tout est prêt » suit (D108 : les réglages manquants sont maintenant demandés dans le parcours). */
const TOUR_STEPS = [
  { tab:"aujourdhui", title:"Aujourd'hui", text:"Ta séance du jour, ta semaine et tes dernières sorties. Après une course, c'est ici que tu notes ton ressenti : ton programme s'adapte." },
  { tab:"programme", title:"Programme", text:"Ton programme, semaine par semaine. Touche une séance pour la voir en détail, la déplacer ou la remplacer." },
  { tab:"progression", title:"Progression", text:"Tes records, ton allure en endurance et ton volume. Tout se met à jour tout seul, course après course." },
  { tab:"profil", title:"Profil", text:"Ton objectif, ton niveau et tous tes réglages. Tu peux tout modifier ici, quand tu veux." },
];

/* ---------- Parcours de démarrage marqué fait d'office (lot 3, D106) ----------
   Un compte qui avait déjà des données AVANT l'arrivée du parcours (05/10/2026) est marqué « parcours fait » d'office : sans ça,
   il le verrait à sa prochaine ouverture. Un compte créé depuis fait toujours le parcours, même si ses séances sont arrivées
   avant (RunSync connecté en premier). Date de création inconnue : on garde l'ancien comportement. */
const ONBOARDING_RELEASE_ISO = "2026-10-05T00:00:00Z";
function shouldAutoMarkOnboarding(hasData, createdAtIso){
  if(!hasData) return false;
  const t = Date.parse(createdAtIso || "");
  return !isFinite(t) || t < Date.parse(ONBOARDING_RELEASE_ISO);
}
// Lien qui ouvre RunSync avec l'e-mail du compte déjà rempli (RunSync version 3 ; les versions 1 et 2 ignorent la suite
// du lien et s'ouvrent simplement). Sans adresse valable, RunSync s'ouvre sans rien de rempli.
function runSyncOpenUrl(email){
  const e = String(email||"").trim();
  return validEmail(e) ? "myrunningapp://connexion?email=" + encodeURIComponent(e) : "myrunningapp://";
}

/* ---------- Structure macro par objectif ----------
   Répartition Easy/qualité de départ par type d'objectif (base : polarisé
   80/20, Seiler & Kjerland 2006, "Quantifying training intensity
   distribution in elite endurance athletes", ajustée par priorité) ; si 2
   objectifs sont actifs, moyenne pondérée des deux structures. */
const OBJECTIVE_STRUCTURE = {
  "Préparer une course":       { easyPct:0.80, qualityPct:0.20, priority:"race" },
  "Améliorer mon allure":      { easyPct:0.70, qualityPct:0.30, priority:"quality" },
  "Courir plus régulièrement": { easyPct:0.90, qualityPct:0.10, priority:"frequency" },
  "Rester en forme":           { easyPct:0.95, qualityPct:0.05, priority:"maintenance" },
  "Autre":                     { easyPct:0.80, qualityPct:0.20, priority:"general" },
};
function weeklyStructureForObjective(objectifType, secondaryType){
  const a = OBJECTIVE_STRUCTURE[objectifType] || OBJECTIVE_STRUCTURE["Autre"];
  if(!secondaryType || secondaryType===objectifType) return { ...a, priorities:[a.priority] };
  const b = OBJECTIVE_STRUCTURE[secondaryType] || OBJECTIVE_STRUCTURE["Autre"];
  return {
    easyPct: (a.easyPct+b.easyPct)/2,
    qualityPct: (a.qualityPct+b.qualityPct)/2,
    priorities: [a.priority, b.priority],
  };
}

/* ---------- Progression ----------
   Règle empirique standard (consensus large en préparation running, pas une
   source unique) : +10% de volume hebdo max d'une semaine sur l'autre,
   semaine de décharge toutes les 3-4 semaines. */
function maxProgressedVolume(previousWeekKm){
  return previousWeekKm ? previousWeekKm*1.10 : null;
}
function isDeloadWeek(weekIndexSinceStart){
  return weekIndexSinceStart>0 && weekIndexSinceStart%4===0;
}

/* ---------- Ajustement selon la charge (ACWR) ----------
   ACWR>1.3 → réduit volume/intensité (bascule de la qualité vers l'easy,
   plafonne le volume) et insère une récupération. ACWR<0.8 (plusieurs
   semaines, vérifié par l'appelant) → autorise une progression de volume.
   Jamais de suppression silencieuse : la structure change, avec une raison
   explicite toujours renvoyée. */
function applyAcwrAdjustment(structure, acwr){
  if(acwr==null) return { ...structure, reason:null };
  if(acwr>1.3){
    return { easyPct:1, qualityPct:0, priorities:structure.priorities, reason:"acwr_high", insertRecovery:true };
  }
  if(acwr<0.8){
    return { ...structure, reason:"acwr_low_may_progress" };
  }
  return { ...structure, reason:null };
}

/* ---------- Génération du calendrier de séances ----------
   Compose les blocs ci-dessus en un calendrier concret pour une semaine.
   `params` :
   - profile: {distanceKm,timeSec} (résolu via resolveRunnerProfile)
   - structure: résultat de weeklyStructureForObjective (+ ajustement ACWR/
     douleur/fatigue appliqué par l'appelant AVANT de passer ici)
   - weeklyKm: volume hebdo cible (dérivé de goals.kmMensuel/4.33, ou
     progression/décharge)
   - frequency: nombre de séances de course/semaine
   - availableDayIndexes: jours dispo (0=lundi..6=dimanche)
   - avoidQualityZone/avoidQualityReason: si non-null, aucune séance qualité
     cette semaine (remplacée par easy), motif affiché à l'utilisateur
   - weekIndex: entier croissant d'une semaine sur l'autre (ex: nombre de
     semaines écoulées depuis une origine fixe) — sert uniquement à alterner
     Seuil/Fractionné d'une semaine sur l'autre quand une seule séance
     qualité est prévue (voir qualityZoneForSlot ci-dessous). Optionnel,
     défaut 0 (comportement stable pour les appels/tests qui l'ignorent).
   Chaque séance renvoyée porte une `rationale` courte expliquant le lien
   objectif/ressenti — jamais un simple numéro de zone sans explication. */
// AVANT ce correctif, la séance qualité était TOUJOURS "threshold" (Seuil),
// sauf pour l'objectif "Améliorer mon allure" où c'était TOUJOURS
// "interval" (Fractionné) — jamais de mélange, jamais d'alternance : un
// utilisateur avec un autre objectif ne voyait donc JAMAIS de Fractionné,
// semaine après semaine (bug remonté : "pourquoi jamais de fractionné/
// renfo ces 2 prochaines semaines ?"). Corrigé : 2 séances qualité/semaine
// -> une de chaque type ; 1 seule -> alterne par semaine (biaisé vers
// l'objectif prioritaire mais jamais exclusif).
function qualityZoneForSlot(structure, slotIndex, qualityN, weekIndex){
  if(qualityN>=2) return slotIndex===0 ? "threshold" : "interval";
  const emphasizeInterval = structure.priorities?.includes("quality");
  const altWeek = (weekIndex||0)%2===0;
  return emphasizeInterval ? (altWeek?"interval":"threshold") : (altWeek?"threshold":"interval");
}
function generateWeekSessions(params){
  const { profile, structure, weeklyKm, frequency, availableDayIndexes, avoidQualityReason, weekIndex } = params;
  if(!profile || !frequency || frequency<1) return [];
  const zones = paceZonesFromVdot(computeVdot(profile.distanceKm, profile.timeSec));
  const days = (availableDayIndexes && availableDayIndexes.length ? availableDayIndexes : [0,1,2,3,4,5,6]).slice().sort((a,b)=>a-b);
  const n = Math.min(frequency, days.length || frequency);

  // Pas de séance qualité en dessous de 3 séances/semaine (trop peu de
  // volume pour l'isoler sans écraser le easy), ni si la semaine est
  // marquée "à éviter" (douleur répétée / ACWR haut / fatigue dégradée).
  // Plafonné à 2/semaine même à fréquence élevée (pratique courante,
  // éviter d'enchaîner trop de séances dures).
  const qualityN = avoidQualityReason ? 0 : (n>=3 ? Math.max(0, Math.min(2, Math.round(n * structure.qualityPct))) : 0);
  const easyN = n - qualityN;

  // Répartit les jours dispo de façon régulière sur la semaine (espacement
  // maximal) plutôt que les N premiers jours, pour ne pas coller deux
  // séances qualité/dur d'affilée sans le vouloir.
  const spread = Array.from({length:n}, (_,i) => days[Math.round(i*(days.length-1)/Math.max(1,n-1))]);
  const uniqueDays = [...new Set(spread)];
  while(uniqueDays.length<n && uniqueDays.length<days.length){
    for(const d of days){ if(!uniqueDays.includes(d)){ uniqueDays.push(d); break; } }
  }
  uniqueDays.sort((a,b)=>a-b);

  // Distance : la/les séance(s) qualité pèsent un volume fixe modeste
  // (~20% du volume hebdo chacune, plafonné), le reste se répartit à parts
  // égales sur les séances easy — garde un total proche de weeklyKm.
  const qualityKmEach = qualityN ? Math.min(weeklyKm*0.20, 12) : 0;
  const remainingKm = Math.max(0, weeklyKm - qualityKmEach*qualityN);
  const easyKmEach = easyN ? remainingKm/easyN : 0;

  const sessions = [];
  for(let i=0;i<n;i++){
    const isQuality = i<qualityN;
    const dayIndex = uniqueDays[i];
    if(isQuality){
      const zoneKey = qualityZoneForSlot(structure, i, qualityN, weekIndex);
      const zf = ZONE_FRIENDLY[zoneKey];
      // Explique pourquoi CETTE zone précisément (pas juste "qualité") :
      // les deux stimulus la même semaine si qualityN>=2, sinon pourquoi
      // ça alterne d'une semaine sur l'autre (voir qualityZoneForSlot).
      const mixNote = qualityN>=2
        ? (zoneKey==="threshold"
            ? " Cette semaine, tu as aussi une séance de Fractionné : les deux types d'effort intense sont travaillés."
            : " Cette semaine, tu as aussi une séance de Seuil : les deux types d'effort intense sont travaillés.")
        : " La prochaine fois, ce sera l'autre type d'effort intense, pour varier les stimulations.";
      sessions.push({
        dayIndex, type:"Qualité", paceZone: zoneKey,
        distanceKm: Math.round(qualityKmEach*10)/10,
        targetPaceSecPerKm: zones[zoneKey],
        rationale: `Cette séance est en ${zf.name} : ${zf.what}. ${zf.why} C'est la séance la plus exigeante de la semaine, en lien avec ton objectif actuel.${mixNote}`,
      });
    } else {
      const zf = ZONE_FRIENDLY.easy;
      let why;
      if(structure.reason==="acwr_high") why = "Le volume et l'intensité sont réduits cette semaine, car ta charge d'entraînement récente a beaucoup augmenté — mieux vaut souffler un peu maintenant pour éviter la blessure ou la fatigue excessive.";
      else if(avoidQualityReason) why = `Elle remplace une séance plus intense initialement prévue, à cause d'${avoidQualityReason} — mieux vaut lever le pied plutôt que forcer.`;
      else why = zf.why;
      sessions.push({
        dayIndex, type:"Easy", paceZone:"easy",
        distanceKm: Math.round(easyKmEach*10)/10,
        targetPaceSecPerKm: zones.easy,
        rationale: `Cette séance est en ${zf.name} : ${zf.what}. ${why}`,
      });
    }
  }
  return sessions;
}

/* ---------- Séances complémentaires (renfo / mobilité / yoga) ----------
   Ce ne sont pas des séances de course : pas d'allure, pas de VDOT, pas
   soumises à l'ajustement ACWR/douleur (qui suppose une allure — voir
   applyProgramAdjustments côté index.html, qui filtre explicitement sur
   pace_zone truthy pour ne jamais leur appliquer regenerateSession).
   Le TYPE et la justification sont choisis ici ; les exercices concrets
   d'une séance Renfo/Mobilité viennent de buildStrengthSession (4.7.c). */
const CROSS_TRAINING_TYPES = ["Renfo", "Mobilité", "Yoga"];
const CROSS_TRAINING_RATIONALE = {
  "Renfo": "Cette séance de renforcement musculaire t'aide à prévenir les blessures et complète ta charge de course sans ajouter d'impact au sol.",
  "Mobilité": "Cette séance de mobilité entretient l'amplitude de tes mouvements et facilite ta récupération entre deux sorties de course.",
  "Yoga": "Cette séance de yoga t'aide à récupérer activement et à gérer le stress lié à l'entraînement, grâce au travail de la respiration et de la souplesse.",
};
// `runDayIndexes` : jours déjà pris par une course cette semaine. Une
// séance légère (yoga, mobilité) peut tomber le même jour qu'une course,
// jamais le renfo (règle validée 02/10/2026, voir sessionsCanShareDay) ;
// `takenCrossDayIndexes` : jours où une séance complémentaire existe déjà
// (une seule par jour).
// `weekIndex` : fait tourner le TYPE d'une semaine sur l'autre (et d'une
// séance à l'autre la même semaine), pour ne jamais répéter indéfiniment
// le même type.
// `avoidDayIndexes` (0-6, optionnel) : jours à exclure pour toute séance
// complémentaire — sert à ne jamais placer une séance complémentaire la
// veille d'une course, peu importe son type (retour utilisateur : les
// courbatures de la veille dégradent la course du lendemain). Calculé par
// l'appelant (index.html), qui a la visibilité sur la semaine suivante
// pour couvrir aussi le dimanche de cette semaine -> lundi de la suivante.
// Pas une règle sourcée comme les autres (VDOT/80-20/sRPE/ACWR) : c'est un
// consensus de terrain sur les courbatures (DOMS) plutôt qu'une étude
// unique citable, assumé comme un choix pragmatique.
function generateCrossTrainingSessions(frequencyAutre, runDayIndexes, weekIndex, avoidDayIndexes, takenCrossDayIndexes){
  if(!frequencyAutre || frequencyAutre<1) return [];
  const runDays = new Set(runDayIndexes||[]);
  const blocked = new Set([...(avoidDayIndexes||[]), ...(takenCrossDayIndexes||[])]);
  const candidates = [0,1,2,3,4,5,6].filter(d=>!blocked.has(d));
  const n = Math.min(frequencyAutre, candidates.length);
  if(n<1) return [];
  const spread = Array.from({length:n}, (_,i) => candidates[Math.round(i*(candidates.length-1)/Math.max(1,n-1))]);
  const uniqueDays = [...new Set(spread)];
  while(uniqueDays.length<n && uniqueDays.length<candidates.length){
    for(const d of candidates){ if(!uniqueDays.includes(d)){ uniqueDays.push(d); break; } }
  }
  uniqueDays.sort((a,b)=>a-b);
  // Un jour de course accepte une séance légère mais jamais du renfo : un
  // renfo tombé sur un jour de course est déplacé vers le jour sans course
  // le plus proche, ou remplacé par une séance légère s'il n'y en a plus.
  const nonRunCandidates = candidates.filter(d=>!runDays.has(d));
  const lightTypes = CROSS_TRAINING_TYPES.filter(t=>t!=="Renfo");
  const used = new Set(uniqueDays);
  const sessions = uniqueDays.map((dayIndex, i) => ({ dayIndex, type: CROSS_TRAINING_TYPES[(weekIndex+i)%CROSS_TRAINING_TYPES.length] }));
  sessions.forEach((s, i) => {
    if(s.type!=="Renfo" || !runDays.has(s.dayIndex)) return;
    const free = nonRunCandidates.filter(d=>!used.has(d)).sort((a,b)=>Math.abs(a-s.dayIndex)-Math.abs(b-s.dayIndex) || a-b);
    if(free.length){ used.delete(s.dayIndex); s.dayIndex = free[0]; used.add(free[0]); }
    else s.type = lightTypes[(weekIndex+i)%lightTypes.length];
  });
  sessions.sort((a,b)=>a.dayIndex-b.dayIndex);
  return sessions.map(s => ({ dayIndex:s.dayIndex, type:s.type, rationale: CROSS_TRAINING_RATIONALE[s.type] }));
}

/* ---------- Saisie à la main d'une séance faite sans montre (chantier 2) ----------
   Marqueur : runs.apple_type = "Manuel" (décision validée le 02/10/2026,
   pas de nouvelle colonne). Les types de course comptent dans les stats :
   le trigger SQL ne connaît pas "Seuil", on pose donc include_in_stats
   explicitement à l'insertion. Récup n'est plus un type de course (D78,
   03/10/2026) : seules les sorties de course alimentent graphiques, indicateurs,
   records et charge ; tous les autres types sont hors stats par défaut. */
const MANUAL_RUN_MARKER = "Manuel";
const RUNNING_RUN_TYPES = ["EF","Long","Fractionné","Seuil","Course"];
function isRunningRunType(type){ return RUNNING_RUN_TYPES.includes(type); }
// Une saisie est valide si on peut l'enregistrer (errors vide) ; les
// warnings sont des doutes (allure invraisemblable) que l'utilisateur peut
// confirmer. `input` : {date:"YYYY-MM-DD", type, distKm, durationMin, hr}.
function validateManualRun(input, todayStr){
  const errors = [], warnings = [];
  const { date, type } = input;
  const distKm = Number(input.distKm), durationMin = Number(input.durationMin);
  const running = isRunningRunType(type);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||"")) errors.push("Indique la date de la séance.");
  else if(date > todayStr) errors.push("La date ne peut pas être dans le futur.");
  if(!type) errors.push("Choisis le type de séance.");
  if(!(durationMin>0)) errors.push("Indique la durée de la séance.");
  else if(durationMin>720) errors.push("Plus de 12 heures : vérifie la durée.");
  if(running){
    if(!(distKm>0)) errors.push("Indique la distance en km.");
    else if(distKm>250) errors.push("Plus de 250 km : vérifie la distance.");
  } else if(input.distKm!=="" && input.distKm!=null && (isNaN(distKm) || distKm<0 || distKm>250)){
    errors.push("Vérifie la distance.");
  }
  if(input.hr!=="" && input.hr!=null){
    const hr = Number(input.hr);
    if(!(hr>=30 && hr<=230)) errors.push("La fréquence cardiaque doit être entre 30 et 230.");
  }
  if(!errors.length && running){
    const paceSec = durationMin*60/distKm;
    if(paceSec<150 || paceSec>1200){
      const m = Math.floor(paceSec/60), s = Math.round(paceSec%60);
      warnings.push(`${String(distKm).replace(".",",")} km en ${Math.round(durationMin)} min, ça fait ${m}'${String(s).padStart(2,"0")}"/km : ces chiffres sont-ils bons ?`);
    }
  }
  return { errors, warnings };
}
// Durée saisie : « 45 » ou « 45,5 » (minutes), « 45:00 » (min:s), « 1:05:30 » (h:min:s). Renvoie des minutes, NaN si illisible.
function parseDurationInput(text){
  const t = String(text==null?"":text).trim().replace(",",".");
  if(!t) return NaN;
  if(!t.includes(":")){ const n = Number(t); return isFinite(n) && n>=0 ? n : NaN; }
  const parts = t.split(":");
  if(parts.length>3 || parts.some(p=>!/^\d+$/.test(p))) return NaN;
  const nums = parts.map(Number);
  const [h,m,sec] = nums.length===3 ? nums : [0, nums[0], nums[1]];
  if(sec>=60 || (nums.length===3 && m>=60)) return NaN;
  return h*60 + m + sec/60;
}
function formatDurationInput(min){ return min>0 ? fmtDur(Math.round(min*60)) : ""; }
// Date de départ d'une saisie : heure donnée (HH:MM), sinon l'heure à laquelle
// on saisit (évite la collision unique(user_id,start_date) entre deux saisies).
function manualRunStartDate(dateStr, timeStr, now){
  const [y,m,d] = dateStr.split("-").map(Number);
  if(/^\d{2}:\d{2}$/.test(timeStr||"")){
    const [h,mi] = timeStr.split(":").map(Number);
    return new Date(y, m-1, d, h, mi, 0);
  }
  return new Date(y, m-1, d, now.getHours(), now.getMinutes(), now.getSeconds());
}
function manualRunRow(input, userId, now){
  const running = isRunningRunType(input.type);
  const distKm = Number(input.distKm);
  const hr = input.hr!=="" && input.hr!=null ? Number(input.hr) : null;
  return {
    user_id: userId,
    start_date: manualRunStartDate(input.date, input.time, now||new Date()).toISOString(),
    apple_type: MANUAL_RUN_MARKER,
    type: input.type,
    distance_km: distKm>0 ? distKm : 0,
    duration_sec: Math.round(Number(input.durationMin)*60),
    avg_hr: hr,
    include_in_stats: running,
  };
}
// Une séance existe peut-être déjà ce jour-là (synchronisée ou saisie) :
// même jour, même nature, durée à 15 % près. Sert d'avertissement à la
// saisie (jamais bloquant) ; `runs` : [{id, date:"YYYY-MM-DD", type, durationSec}].
const DUPLICATE_DURATION_TOLERANCE = 0.15;
function runsSameNature(a, b){
  return sessionCategory({type:a})==="run" ? sessionCategory({type:b})==="run" : a===b;
}
function findLikelyDuplicateRun(runs, candidate){
  return (runs||[]).find(r => {
    if(r.date!==candidate.date || !runsSameNature(r.type, candidate.type)) return false;
    const longer = Math.max(r.durationSec, candidate.durationSec);
    return longer>0 && Math.abs(r.durationSec-candidate.durationSec) <= DUPLICATE_DURATION_TOLERANCE*longer;
  }) || null;
}
// Supprimer une course liée à une séance prévue la libère : une course passée
// redevient "à replacer", le reste redevient simplement "prévu".
function plannedStatusAfterRunDeleted(planned, todayStr){
  return planned.pace_zone && planned.planned_date < todayStr ? "missed" : "planned";
}

/* ---------- Fusion saisie à la main / course synchronisée (chantier 3, Q2) ----------
   Règle validée le 02/10/2026 : même jour, même nature, durée à 15 % près ->
   la course de la montre remplace la saisie (notation, notes et lien avec la
   séance prévue repris), avec un message. Si ce n'est pas clair (durée très
   différente, ou plusieurs candidates) : on demande "Est-ce la même séance ?".
   `runs` : [{id, date:"YYYY-MM-DD", type, durationSec, manual:bool}] ;
   `notSame` : paires "idSaisie|idSynchro" déjà refusées par l'utilisateur.
   Fusion automatique seulement si le couple est unique des deux côtés. */
function durationsClose(a, b){
  const longer = Math.max(a.durationSec, b.durationSec);
  return longer>0 && Math.abs(a.durationSec-b.durationSec) <= DUPLICATE_DURATION_TOLERANCE*longer;
}
function matchManualRuns(runs, notSame){
  const refused = new Set(notSame||[]);
  const manuals = (runs||[]).filter(r=>r.manual), synced = (runs||[]).filter(r=>!r.manual);
  const candidatesOf = (m) => synced.filter(s => s.date===m.date && runsSameNature(m.type, s.type) && !refused.has(m.id+"|"+s.id));
  const auto = [], ask = [];
  manuals.forEach(m => {
    const cands = candidatesOf(m);
    if(!cands.length) return;
    const close = cands.filter(s=>durationsClose(m, s));
    if(close.length===1){
      const rivals = manuals.filter(o => o.id!==m.id && candidatesOf(o).some(s=>s.id===close[0].id) && durationsClose(o, close[0]));
      if(!rivals.length){ auto.push({ manualId:m.id, syncedId:close[0].id }); return; }
    }
    const best = cands.slice().sort((a,b)=>Math.abs(a.durationSec-m.durationSec)-Math.abs(b.durationSec-m.durationSec))[0];
    ask.push({ manualId:m.id, syncedId:best.id });
  });
  return { auto, ask };
}
// Ce qu'on reprend de la saisie sur la course synchronisée (colonnes SQL) :
// seulement ce que la course de la montre n'a pas déjà (ses mesures priment).
function mergedRunPatch(manual, synced){
  const patch = {};
  if(manual.painRatings && !synced.painRatings) patch.pain_ratings = manual.painRatings;
  if(manual.notes && !synced.notes) patch.notes = manual.notes;
  if(manual.effort!=null && synced.effort==null) patch.effort = manual.effort;
  if(manual.legsFocused!=null && synced.legsFocused==null) patch.legs_focused = manual.legsFocused;
  return patch;
}

/* ---------- Rattachement d'une sortie non prévue (chantier 4, Q3) ----------
   Règles validées le 02/10/2026 : une course récente liée à aucune séance
   prévue propose jusqu'à 3 séances de course "à faire" ou "à replacer" à ±3
   jours, classées par proximité de date, puis de type d'effort, puis de
   distance. "Oui" : la séance passe "faite", liée, et se déplace au jour réel
   de la sortie sauf si une séance incompatible y est déjà. */
const ATTACH_WINDOW_DAYS = 3;
function daysBetween(a, b){
  const t = (s) => { const [y,m,d] = s.split("-").map(Number); return Date.UTC(y, m-1, d); };
  return Math.round((t(b)-t(a))/86400000);
}
function attachCandidates(run, plannedSessions){
  return (plannedSessions||[])
    .filter(p => (p.status==="planned"||p.status==="missed") && !p.linked_run_id && sessionCategory(p)==="run"
      && Math.abs(daysBetween(p.planned_date, run.date)) <= ATTACH_WINDOW_DAYS)
    .map(p => ({
      p,
      days: Math.abs(daysBetween(p.planned_date, run.date)),
      typeGap: p.type===run.type ? 0 : 1,
      distGap: p.target_distance_km && run.distKm ? Math.abs(p.target_distance_km-run.distKm)/Math.max(p.target_distance_km, run.distKm) : 1,
    }))
    .sort((a,b)=>a.days-b.days || a.typeGap-b.typeGap || a.distGap-b.distGap)
    .slice(0,3)
    .map(x=>x.p);
}
function attachPlannedDate(planned, runDate, sameDaySessions){
  return (sameDaySessions||[]).every(o => sessionsCanShareDay(planned, o)) ? runDate : planned.planned_date;
}
// Ligne d'explication sous "Ta semaine" (R5) : une sortie non rattachée est
// bien comptée même si une séance prévue reste à replacer. Dates "YYYY-MM-DD".
function missedDayNote(missedDates, unlinkedRunDates){
  if(!(missedDates||[]).length || !(unlinkedRunDates||[]).length) return "";
  const dayName = (d) => new Date(d+"T00:00:00").toLocaleDateString("fr-FR", { weekday:"long" });
  return `Ta sortie de ${dayName(unlinkedRunDates[unlinkedRunDates.length-1])} est bien comptée. La séance de ${dayName(missedDates[0])} reste à replacer.`;
}

/* ---------- Message « L'app a changé de look » (D91) ----------
   Une seule fois, à l'ouverture, pour les comptes qui existaient avant la refonte. Les comptes neufs (parcours de démarrage
   terminé à partir du jour de la mise en ligne) ne le voient jamais. « Déjà vu » reste sur l'appareil : rien n'est écrit
   dans le profil. */
// `completedAt` : fin du parcours de démarrage (date ISO) ou vide ; `autoMarked` : ancien compte marqué « parcours fait » à
// cette ouverture (il avait déjà des données) ; `seenIds` : messages déjà vus sur cet appareil ; `before` : jour de la mise
// en ligne (AAAA-MM-JJ). On compare les jours, écrits en texte : le même résultat quel que soit le format de l'heure.
function shouldShowNews(completedAt, autoMarked, seenIds, newsId, before){
  if(!completedAt) return false;                                   // parcours en cours : rien par-dessus
  if(Array.isArray(seenIds) && seenIds.includes(newsId)) return false;
  return !!autoMarked || String(completedAt).slice(0,10) < String(before).slice(0,10);
}
// Texte du message. S'il reste une question de reprise à poser (levelResumeInfo non nul), on la mentionne : « chrono » pour un
// record ou un temps sans date, « test » pour une VMA ou un test de 20 minutes.
function newsMessage(resumeInfo){
  const title = "L'app a changé de look";
  if(!resumeInfo) return { title, text:"Tes séances et ton programme sont toujours là." };
  const what = (resumeInfo.kind==="vma" || (resumeInfo.kind==="undated" && resumeInfo.fromTest)) ? "test" : "chrono";
  return { title, text:`Tes séances, ton programme et tes allures sont toujours là. Pour calculer tes allures conseillées, il nous faut un ${what} de référence avec sa date. On te pose une question sur la date du tien.` };
}

/* ---------- Retours d'Omar du 05/10/2026 (D92 et suivants) ---------- */
// Séances ratées proposées dans la bannière du Programme : les plus récentes d'abord, jamais plus de 14 jours en arrière
// (une séance d'il y a trois semaines n'a plus de sens à replacer) ; celles déjà écartées ne reviennent pas.
const MISSED_BANNER_MAX_DAYS = 14;
function missedBannerSessions(plannedSessions, dismissedIds, todayStr){
  const skip = dismissedIds || [];
  return (plannedSessions||[])
    .filter(p=>p.status==="missed" && !skip.includes(p.id) && daysBetween(p.planned_date, todayStr)<=MISSED_BANNER_MAX_DAYS)
    .sort((a,b)=>a.planned_date<b.planned_date ? 1 : a.planned_date>b.planned_date ? -1 : 0);
}
// « Ta séance de lundi n'a pas pu se faire. » dans les 6 derniers jours ; au-delà, avec la date (« du lundi 21 septembre »),
// pour ne jamais être pris pour une séance d'aujourd'hui.
function missedBannerTitle(session, todayStr){
  const d = new Date(session.planned_date+"T00:00:00");
  if(daysBetween(session.planned_date, todayStr)<=6) return `Ta séance de ${d.toLocaleDateString("fr-FR",{weekday:"long"})} n'a pas pu se faire.`;
  return `Ta séance du ${d.toLocaleDateString("fr-FR",{weekday:"long", day:"numeric", month:"long"})} n'a pas pu se faire.`;
}
// Charge d'entraînement vide : pourquoi ? Appelée seulement quand la charge ne se calcule pas (acwrAt -> null).
// « few » = des ressentis notés, mais pas encore assez de recul (garde-fou E8 : 4 séances notées, sur 3 semaines) ;
// « unrated » = des sorties ces 4 dernières semaines mais aucun ressenti noté ; « norun » = aucune sortie. `runs` : [{ ts, rpe }].
function chargeEmptyReason(runs, todayTs){
  const from = todayTs - 28*DAY_MS;
  const recent = (runs||[]).filter(r=>r.ts>=from && r.ts<=todayTs+DAY_MS);
  if(recent.some(r=>r.rpe!=null)) return "few";
  return recent.length ? "unrated" : "norun";
}
const CHARGE_EMPTY_TEXTS = {
  few:{ tile:"Elle s'affiche après 4 séances notées, sur 3 semaines.",
        sheet:"Ta charge compare ta dernière semaine à tes habitudes. Pour te donner un repère fiable, il lui faut au moins 4 séances notées, réparties sur 3 semaines. Continue de noter ton ressenti après chaque sortie : elle s'affichera toute seule." },
  unrated:{ tile:"Note ton ressenti après tes séances pour la voir.",
            sheet:"Ta charge se calcule avec la difficulté (0 à 10) que tu notes après chaque séance. Aucune de tes sorties des 4 dernières semaines n'en a." },
  norun:{ tile:"Pas de course ces 4 dernières semaines.",
          sheet:"Dès que tu auras repris et noté ta difficulté, ta charge apparaîtra." },
};

/* ---------- Données à jour sans fermer l'app (E1, retour d'Omar du 07/10/2026) ----------
   Au retour dans l'app, on recharge si le dernier chargement date d'au moins 30 s (sauf pendant une saisie : `busy`).
   Tirer pour actualiser : l'indicateur suit le doigt avec une résistance de moitié, plafonné ; au-delà du seuil, relâcher
   actualise. Après coup, un message dit combien de séances sont arrivées. */
const AUTO_REFRESH_MS = 30000, PULL_RESIST = 0.5, PULL_TRIGGER = 64, PULL_MAX = 96;
function shouldAutoRefresh(lastLoadAt, now, busy){
  return !busy && lastLoadAt>0 && now-lastLoadAt>=AUTO_REFRESH_MS;
}
function pullRefreshState(dy){
  const offset = Math.max(0, Math.min(PULL_MAX, (Number(dy)||0)*PULL_RESIST));
  return { offset, armed: offset>=PULL_TRIGGER };
}
function newRunsMessage(before, after){
  const n = (after||0)-(before||0);
  if(n<=0) return "";
  return n===1 ? "1 nouvelle séance reçue." : n+" nouvelles séances reçues.";
}

/* ---------- Première connexion (S15, lot 1 : D99 à D101) ----------
   Test d'Omar du 06/10/2026 : on ne sait pas qu'il faut installer l'app, un lien reçu par e-mail s'ouvre dans le navigateur par
   défaut (jamais dans l'app installée, dont la connexion est séparée), et les erreurs de Supabase s'affichaient en anglais. */
// Où l'utilisateur ouvre l'app. `ua` = navigator.userAgent, `standalone` = ouverte depuis l'icône de l'écran d'accueil,
// `touchPoints` = navigator.maxTouchPoints (un iPad récent se présente comme un Mac : seul l'écran tactile le trahit).
function detectInstallContext(ua, standalone, touchPoints){
  const u = String(ua||"");
  const ios = /iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && (touchPoints||0)>1);
  const inApp = /FBAN|FBAV|Instagram|Snapchat|TikTok|musical_ly|Line\/|MicroMessenger|Twitter|LinkedInApp|GSA\//.test(u);
  const browser = /CriOS/.test(u) ? "chrome" : /FxiOS/.test(u) ? "firefox" : /EdgiOS/.test(u) ? "edge" : /OPiOS|DuckDuckGo/.test(u) ? "other" : "safari";
  return { ios, inApp, browser, standalone:!!standalone };
}
// Écran « Installe l'app » : iPhone ou iPad, hors de l'app installée, tant que l'utilisateur ne l'a pas écarté.
function shouldShowInstall(ctx, skipped){ return !!(ctx && ctx.ios && !ctx.standalone && !skipped); }
// Les trois gestes pour ajouter l'app à l'écran d'accueil ; seul le premier change selon le navigateur
// (Chrome, Firefox et Edge savent le faire depuis iOS 16.4).
const INSTALL_STEP_FIRST = {
  safari:{ icon:"share", title:"Touche Partager", hint:"Le carré avec une flèche vers le haut, en bas de l'écran." },
  chrome:{ icon:"share", title:"Touche Partager", hint:"L'icône à droite de la barre d'adresse, en haut de l'écran." },
  firefox:{ icon:"more", title:"Touche le menu, puis Partager", hint:"Le menu est en bas à droite de l'écran." },
  edge:{ icon:"more", title:"Touche le menu, puis Partager", hint:"Le menu est en bas de l'écran." },
  other:{ icon:"share", title:"Touche Partager", hint:"Cherche le bouton Partager, ou le menu de ton navigateur." },
};
function installGuide(ctx){
  const first = INSTALL_STEP_FIRST[ctx && ctx.browser] || INSTALL_STEP_FIRST.other;
  return { inApp:!!(ctx && ctx.inApp), browser:(ctx && ctx.browser) || "other", steps:[
    first,
    { icon:"squarePlus", title:"Touche «\u00a0Sur l'écran d'accueil\u00a0»", hint:"Fais défiler le menu si tu ne le vois pas. Laisse «\u00a0Ouvrir comme app web\u00a0» activé." },
    { icon:"phone", title:"Ouvre MyRunningApp depuis ton écran d'accueil", hint:"C'est là que tu crées ton compte : tu y resteras connecté." },
  ] };
}
// Inscription par code recopié dans l'app (D100). Supabase envoie 6 chiffres, ou 8 pour les projets récents (réglable de 6 à 10) :
// l'app accepte toute longueur de 6 à 10.
function validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||"").trim()); }
function cleanOtp(s){ return String(s||"").replace(/\D/g,"").slice(0,10); }
function otpComplete(s){ return /^\d{6,10}$/.test(String(s||"")); }
const RESEND_COOLDOWN_SEC = 60;
// Secondes à attendre avant de pouvoir redemander un code (0 = tout de suite).
function resendWait(sentAt, now){ return sentAt ? Math.max(0, Math.ceil(RESEND_COOLDOWN_SEC - (now - sentAt)/1000)) : 0; }
// Ce que répond Supabase à une inscription : « session » (confirmation par e-mail désactivée), « exists » (adresse déjà inscrite et
// confirmée : Supabase renvoie alors un utilisateur sans identités, sans erreur), « confirm » (un code vient d'être envoyé), « error ».
function signUpOutcome(data, error){
  if(error) return "error";
  if(data && data.session) return "session";
  const ids = data && data.user && data.user.identities;
  if(Array.isArray(ids) && ids.length===0) return "exists";
  return "confirm";
}
// Messages de Supabase traduits et tutoyés. `kind` sert à choisir la suite (adresse non confirmée, attente avant un nouveau code…).
function authErrorInfo(error){
  const msg = String((error && error.message) || error || ""), code = String((error && error.code) || "");
  const has = (re) => re.test(msg) || re.test(code);
  const sec = msg.match(/after (\d+) seconds?/i);
  if(has(/email_not_confirmed|Email not confirmed/i)) return { kind:"not_confirmed", text:"Ton adresse n'est pas encore confirmée." };
  if(has(/invalid_credentials|Invalid login credentials/i)) return { kind:"credentials", text:"E-mail ou mot de passe incorrect." };
  if(has(/user_already_exists|already registered|already been registered/i)) return { kind:"exists", text:"Un compte existe déjà avec cette adresse : connecte-toi." };
  if(has(/same_password|different from the old/i)) return { kind:"same_password", text:"Choisis un mot de passe différent de l'ancien." };
  if(has(/weak_password|at least \d+ characters|Password should be/i)) return { kind:"password", text:"Choisis un mot de passe d'au moins 6 caractères." };
  if(sec || has(/over_request_rate_limit/i)){ const wait = sec ? Number(sec[1]) : RESEND_COOLDOWN_SEC; return { kind:"wait", wait, text:`Patiente ${wait} secondes avant de redemander un code.` }; }
  if(has(/over_email_send_rate_limit|email rate limit exceeded/i)) return { kind:"rate", text:"Trop d'e-mails envoyés pour le moment. Réessaie dans une heure." };
  if(has(/otp_expired|Token has expired|invalid.*(token|otp)|otp.*invalid/i)) return { kind:"code", text:"Code incorrect ou expiré. Vérifie les chiffres, ou demande un nouveau code." };
  if(has(/signup_disabled|Signups not allowed/i)) return { kind:"closed", text:"Les inscriptions sont fermées pour le moment." };
  if(has(/validation_failed|Unable to validate email|invalid format|email_address_invalid|is invalid/i)) return { kind:"email", text:"Cette adresse e-mail ne semble pas valide." };
  if(has(/Failed to fetch|NetworkError|Load failed|network/i)) return { kind:"network", text:"Pas de connexion : vérifie ton réseau et réessaie." };
  return { kind:"other", text:"Quelque chose n'a pas marché. Réessaie dans un instant." };
}
// Premier écran pour quelqu'un qui n'est pas connecté : « Installe l'app », sauf s'il est en pleine inscription (étape « code » reprise
// après un rechargement) ou s'il l'a déjà écarté.
function authEntryView(ctx, skipped, hasPending){ return !hasPending && shouldShowInstall(ctx, skipped) ? "install" : "auth"; }
// Étape « code » ou « mot de passe oublié » en cours quand l'app est rechargée (l'iPhone peut décharger l'app pendant qu'on lit son
// e-mail) : seuls l'étape, l'adresse et l'heure d'envoi sont gardées, jamais le mot de passe ni le code. Valable une heure.
const AUTH_PENDING_MAX_AGE_MS = 60*60*1000;
function pendingAuthFrom(raw, now){
  let p = null;
  try{ p = typeof raw==="string" ? JSON.parse(raw) : raw; }catch(e){ return null; }
  if(!p || (p.step!=="code" && p.step!=="reset") || !validEmail(p.email)) return null;
  const sentAt = Number(p.sentAt) || 0;
  if(!sentAt || now - sentAt > AUTH_PENDING_MAX_AGE_MS || sentAt - now > 60000) return null;
  return { step:p.step, email:String(p.email).trim(), sentAt };
}
