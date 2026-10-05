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
// Réserve de FC (Karvonen) : zone = FC repos + %×(FC max − FC repos).
// C'est la méthode utilisée par l'app Santé — sans FC repos on retombe sur
// un simple % de FC max (moins précis mais reste utilisable).
function hrZoneDefs(maxHr, restingHr){
  const base = (restingHr && restingHr>0) ? restingHr : 0;
  const range = maxHr - base;
  const bound = pct => Math.round(base + range*pct);
  return [
    {zone:1,label:"Zone 1",color:"#5ac8fa",max:bound(0.6)},
    {zone:2,label:"Zone 2",color:"#C6F432",max:bound(0.7)},
    {zone:3,label:"Zone 3",color:"#a8e063",max:bound(0.8)},
    {zone:4,label:"Zone 4",color:"#ff9f0a",max:bound(0.9)},
    {zone:5,label:"Zone 5",color:"#ff375f",max:999},
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
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  const days = Math.ceil((parse(dateStr) - parse(todayStr)) / 86400000);
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
   joursIndisponibles:[0-6], chronoDistance (clé de course), chronoSec}.
   Un chrono saisi devient le temps de référence "de repli" du moteur
   (programSettings.refDistanceKm/refTimeSec), jamais un record (pbSec).
   Le plan débutant garde sa date de départ s'il est déjà en cours. */
function onboardingProfilePatch(state, goals, programSettings, raceDistancesKm, startMondayStr){
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
  const ps = { ...(programSettings||{}) };
  const km = raceDistancesKm ? raceDistancesKm[state.chronoDistance] : null;
  if(km && state.chronoSec>0){ ps.refDistanceKm = km; ps.refTimeSec = state.chronoSec; }
  const beginner = isBeginnerPlanEligible(state.niveau, state.frequenceHistorique, state.dureeMax);
  if(beginner) ps.beginnerPlan = ps.beginnerPlan || { startMonday: startMondayStr };
  else delete ps.beginnerPlan;
  // Ni plan débutant, ni chrono, ni record : première séance = test guidé de
  // 20 minutes (4.1.e), dont le résultat devient le temps de référence.
  const hasReference = !!(ps.refTimeSec) || !!(newGoals.principal && newGoals.principal.pbSec);
  const needsGuidedTest = !beginner && !hasReference;
  if(needsGuidedTest) ps.guidedTest = ps.guidedTest || { status:"pending" };
  return { goals:newGoals, programSettings:ps, beginner, needsGuidedTest };
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
function distanceRecordTime(run, dist){
  if(!run || !isRunningRunType(run.type) || !(run.durationSec>0)) return null;
  if(!(run.distKm>=dist.km && run.distKm<=dist.km*(1+RECORD_DISTANCE_TOLERANCE))) return null;
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
// Une séance n'est célébrée que si elle est récente (3 jours, pour ne pas
// fêter tout l'historique au premier lancement) et pas déjà célébrée.
function shouldCelebrateRun(runTs, nowTs, runId, celebratedIds){
  return (nowTs - runTs) <= 3*86400000 && (nowTs - runTs) >= 0 && !(celebratedIds||[]).includes(runId);
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
// (« Est-ce la même séance ? », sortie non prévue), puis « Hier » (record et/ou ressenti), puis
// « Ton objectif a changé » (chantier 6), puis « Ton niveau ». `available` : {clé: vrai si la carte existe}.
const TODAY_ACTION_ORDER = ["merge_ask","attach","hier","objectif","niveau"];
function pickTodayActionCard(available){
  return TODAY_ACTION_ORDER.find(k=>available && available[k]) || null;
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
// Titre affiché : « EF » avec le sous-titre « endurance, à allure facile » pour une séance EF ordinaire
// (la donnée enregistrée garde son titre d'origine, ex. « Sortie easy »).
function sessionDisplayTitle(session){
  const ordinary = !session.generation_reason || (session.generation_reason!=="beginner_plan" && session.generation_reason!=="guided_test");
  if(session.type==="EF" && ordinary) return { title:"EF", subtitle:"endurance, à allure facile" };
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
  if(acwr==null) return { zone:"inconnue", color:"#A3A7AD", phrase:"Pas encore assez d'historique pour calculer ta charge d'entraînement.", severe:false };
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
  return { "sous-charge":"En dessous de la zone idéale", "idéale":"Dans la zone idéale", "attention":"Au-dessus de la zone idéale", "inconnue":"Pas encore de repère" }[zone] || "";
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
const EFFICIENCY_STABLE_PCT = 2;
function efficiencyTrend(efRuns, todayStr){
  const parse = (str) => { const [y,m,d] = str.split("-").map(Number); return new Date(y, m-1, d); };
  const today = parse(todayStr);
  const dayMs = 86400000;
  const daysAgo = (dateStr) => Math.round((today - parse(dateStr)) / dayMs);
  const valid = (efRuns||[]).filter(r=>r.allure>0 && r.fc>0);
  const recent = valid.filter(r=>{ const a=daysAgo(r.date); return a>=0 && a<=29; });
  const baseline = valid.filter(r=>{ const a=daysAgo(r.date); return a>=30 && a<=59; });
  if(recent.length<2 || baseline.length<2) return { status:"insuffisant" };
  const avgRatio = (arr) => arr.reduce((a,r)=>a+r.allure/r.fc,0)/arr.length;
  const pct = (avgRatio(baseline) - avgRatio(recent)) / avgRatio(baseline) * 100;
  const rounded = Math.round(Math.abs(pct));
  if(Math.abs(pct) < EFFICIENCY_STABLE_PCT) return { status:"stable", pct:0 };
  return { status: pct>0 ? "mieux" : "moins", pct: rounded };
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
  return zone && acwr!=null ? `Charge d'entraînement : ${zone}, ${fmtDec(acwr,2)}` : "Charge d'entraînement : pas encore de repère";
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
  return { status:"ok", firstAvg:avg(first), lastAvg:avg(last), startTs };
}
// Progression d'une courbe sur une période : de la première à la dernière séance de la période.
function periodProgress(points, key, todayTs){
  const pts = pointsInPeriod(points, key, todayTs);
  if(pts.length<2) return { status:"insuffisant" };
  const p = windowProgress(pts, pts[0].ts, pts[pts.length-1].ts);
  return p.status==="ok" ? { ...p, since: sinceLabel(pts[0].ts, todayTs) } : p;
}
// Texte de la progression d'une allure : « −16 s/km » (citron) ; une allure qui ralentit « +5 s/km » en gris,
// jamais en rouge. null quand il n'y a pas assez de recul.
function paceProgressText(p){
  if(!p || p.status!=="ok") return null;
  const delta = Math.round(p.lastAvg - p.firstAvg);
  if(delta<0) return { text:`−${Math.abs(delta)} s/km`, tone:"good" };
  if(delta>0) return { text:`+${delta} s/km`, tone:"muted" };
  return { text:"0 s/km", tone:"muted" };
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
  const longest = month.reduce((m,r)=>Math.max(m, r.distKm||0), 0);
  const best = recordHolders(list).allure_ef;
  return {
    yearKm: Math.round(year.reduce((a,r)=>a+(r.distKm||0),0)*10)/10,
    longestMonthKm: longest>0 ? Math.round(longest*10)/10 : null,
    monthTimeSec: month.reduce((a,r)=>a+(r.durationSec||0),0),
    bestEfPaceSecKm: best ? best.paceSecKm : null,
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
function monthlyVolumeBars(runs, goalKm, todayTs, months){
  const n = months || 12, t = new Date(todayTs);
  const list = (runs||[]).filter(r=>r.distKm>0);
  const goal = goalKm>0 ? goalKm : null;
  const first = list.length ? new Date(Math.min(...list.map(r=>r.ts))) : null;
  const bars = [];
  for(let i=n-1;i>=0;i--){
    const d = new Date(t.getFullYear(), t.getMonth()-i, 1);
    if(first && d < new Date(first.getFullYear(), first.getMonth(), 1)) continue;
    if(!first) continue;
    const km = Math.round(list.filter(r=>{ const x=new Date(r.ts); return x.getFullYear()===d.getFullYear() && x.getMonth()===d.getMonth(); }).reduce((a,r)=>a+r.distKm,0)*10)/10;
    const state = !goal ? "none" : km > goal*VOLUME_HIGH_FACTOR ? "high" : km >= goal ? "met" : "under";
    bars.push({ key:d.getFullYear()+"-"+(d.getMonth()+1), label:MONTH_SHORT[d.getMonth()], km, current:i===0, state });
  }
  return { bars, goalKm:goal, limitKm: goal ? Math.round(goal*VOLUME_HIGH_FACTOR*10)/10 : null };
}

// --- Facile / soutenu (6h, D35) : facile = zones 1 à 3, soutenu = zones 4 et 5, repère à 80 % ---
const EASY_TARGET_PCT = 80;
function easyHardMonthly(monthly){
  return (monthly||[]).map(m=>{
    const secs = m.secs || [], easy = (secs[0]||0)+(secs[1]||0)+(secs[2]||0), hard = (secs[3]||0)+(secs[4]||0), total = easy+hard;
    return total>0 ? { label:m.label, easySec:easy, hardSec:hard, easyPct:Math.round(easy/total*100), hardPct:100-Math.round(easy/total*100) } : null;
  }).filter(Boolean);
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
  if(!(durationMin>0)) errors.push("Indique la durée en minutes.");
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
      warnings.push(`${String(distKm).replace(".",",")} km en ${Math.round(durationMin)} min, ça fait ${m}'${String(s).padStart(2,"0")}''/km. Ces chiffres sont-ils bons ?`);
    }
  }
  return { errors, warnings };
}
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
