// Fonctions de calcul pures, sans dépendance à l'état de l'app (RUNS, DOM,
// Supabase...) — extraites d'index.html pour pouvoir être testées isolément
// (voir test.html). Toute nouvelle fonction de calcul pur (zones, détection
// de patterns, régression...) devrait vivre ici plutôt que dans index.html.
// Après toute modification de ce fichier : incrémenter le ?v=N dans les
// <script src="logic.js?v=N"> d'index.html ET test.html, sinon les
// navigateurs (y compris pendant les tests) continuent de servir l'ancienne
// version en cache — un vrai piège déjà rencontré une fois.

const fmtA=s=>{if(!s)return"—";const m=Math.floor(s/60),sc=Math.round(s%60);return m+"'"+String(sc).padStart(2,"0")+"''"};
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
// Réserve de FC (Karvonen) : zone = FC repos + %×(FC max − FC repos).
// C'est la méthode utilisée par l'app Santé — sans FC repos on retombe sur
// un simple % de FC max (moins précis mais reste utilisable).
function hrZoneDefs(maxHr, restingHr){
  const base = (restingHr && restingHr>0) ? restingHr : 0;
  const range = maxHr - base;
  const bound = pct => Math.round(base + range*pct);
  return [
    {zone:1,label:"Zone 1",color:"#5ac8fa",max:bound(0.6)},
    {zone:2,label:"Zone 2",color:"#30d158",max:bound(0.7)},
    {zone:3,label:"Zone 3",color:"#a8e063",max:bound(0.8)},
    {zone:4,label:"Zone 4",color:"#ff9f0a",max:bound(0.9)},
    {zone:5,label:"Zone 5",color:"#ff375f",max:999},
  ];
}
function zoneIndexForHr(hr, defs){
  for(let i=0;i<defs.length;i++) if(hr<=defs[i].max) return i;
  return defs.length-1;
}
function computeHrZoneSeconds(hrSeries, maxHr, restingHr){
  const defs = hrZoneDefs(maxHr, restingHr);
  const secs=[0,0,0,0,0];
  const sorted = hrSeries.slice().sort((a,b)=>a.t-b.t);
  for(let i=0;i<sorted.length-1;i++){
    const dt = sorted[i+1].t - sorted[i].t;
    if(dt<=0 || dt>60) continue; // ignore pauses/trous de mesure
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

// Zones d'allure (sec/km) à partir d'un VDOT.
function paceZonesFromVdot(vdot){
  const zones = {};
  for(const [key,pct] of Object.entries(VDOT_ZONE_PCT)){
    zones[key] = Math.round(60000 / velocityForVo2(vdot*pct)); // 60000 m / (m/min) = sec/km
  }
  return zones;
}

// Résout la source de référence pour le moteur VDOT, par ordre de priorité,
// SANS dupliquer la donnée (rien n'est recopié tant qu'une valeur existe
// côté Objectifs — si l'utilisateur met à jour son PB, il prend le dessus
// automatiquement au prochain calcul) :
// 1. PB réel de l'objectif "Préparer une course" (perf réelle, la plus
//    fiable — jamais tempsViseSec, qui est un OBJECTIF, pas une perf).
// 2. VMA de l'objectif "Améliorer mon allure" (traitée comme un effort de
//    référence ~6min, protocole standard de test VMA).
// 3. Repli sur programSettings (saisi dans le formulaire initial Programme
//    si rien n'existe côté Objectifs).
// `raceDistancesKm` = table des distances (ex: RACE_DISTANCES_KM d'index.html),
// passée en paramètre pour garder cette fonction indépendante d'index.html.
function resolveRunnerProfile(goals, programSettings, raceDistancesKm){
  const slots = [goals?.principal, goals?.secondaire].filter(Boolean);
  for(const slot of slots){
    if(slot.objectifPrincipal==="Préparer une course" && slot.pbExistant==="Oui" && slot.pbSec && slot.distanceCourse){
      const km = raceDistancesKm[slot.distanceCourse];
      if(km) return { distanceKm: km, timeSec: Number(slot.pbSec), source:"goal_pb" };
    }
  }
  for(const slot of slots){
    if(slot.objectifPrincipal==="Améliorer mon allure" && slot.vmaConnue==="Oui" && slot.vma){
      // VMA en km/h ≈ vitesse tenable ~6min (protocole de test VMA standard).
      return { distanceKm: Number(slot.vma)*(6/60), timeSec: 360, source:"goal_vma" };
    }
  }
  if(programSettings?.refDistanceKm && programSettings?.refTimeSec){
    return { distanceKm: Number(programSettings.refDistanceKm), timeSec: Number(programSettings.refTimeSec), source:"program_fallback" };
  }
  return null;
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
   moyenne hebdomadaire sur les 28 derniers jours (somme/4). */
function acwrAt(dailySeries, targetDate){
  const inWindow = (days) => {
    const from = new Date(targetDate); from.setDate(from.getDate()-(days-1));
    return dailySeries.filter(d=>d.date>=from && d.date<=targetDate).reduce((a,d)=>a+d.load,0);
  };
  const acute7j = inWindow(7);
  const chronic28j = inWindow(28)/4;
  return { acute7j, chronic28j, acwr: chronic28j>0 ? acute7j/chronic28j : null };
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
      sessions.push({
        dayIndex, type:"Qualité", paceZone: zoneKey,
        distanceKm: Math.round(qualityKmEach*10)/10,
        targetPaceSecPerKm: zones[zoneKey],
        rationale: `Séance qualité (zone ${zoneKey}) — priorité liée à ton objectif.`,
      });
    } else {
      sessions.push({
        dayIndex, type:"Easy", paceZone:"easy",
        distanceKm: Math.round(easyKmEach*10)/10,
        targetPaceSecPerKm: zones.easy,
        rationale: structure.reason==="acwr_high"
          ? "Séance easy — volume/intensité réduits cette semaine (charge d'entraînement élevée détectée)."
          : avoidQualityReason
            ? `Séance easy — remplace une séance qualité (${avoidQualityReason}).`
            : "Séance easy — base aérobie (règle 80/20).",
      });
    }
  }
  return sessions;
}
