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
function classifyRunType(distanceKm, hrSeries, maxHr, restingHr){
  if(looksLikeFractionne(hrSeries)) return {type:"Fractionné", qualitatif:true};
  if(looksLikeSeuil(hrSeries, maxHr, restingHr)) return {type:"Seuil", qualitatif:true};
  if(distanceKm>10) return {type:"Long", qualitatif:true};
  if(!hrSeries || hrSeries.length<10 || !maxHr) return {type:"EF", qualitatif:null};
  const {secs} = computeHrZoneSeconds(hrSeries, maxHr, restingHr);
  const total = secs.reduce((a,b)=>a+b,0);
  if(total<300) return {type:"EF", qualitatif:null};
  const lowZone = secs[0]+secs[1];
  return {type:"EF", qualitatif: lowZone/total > 0.7};
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
   toujours en ambre, jamais en rouge (demande explicite du CDC).
   `acwr` : résultat de acwrAt(...).acwr (peut être null, pas assez
   d'historique). Renvoie {zone, color, phrase, severe} — `severe` sert à
   l'UI pour renforcer l'alerte au-delà de 1,5 sans changer de couleur. */
function chargeEntrainementGauge(acwr){
  if(acwr==null) return { zone:"inconnue", color:"#98989f", phrase:"Pas encore assez d'historique pour calculer ta charge d'entraînement.", severe:false };
  if(acwr<0.8) return { zone:"sous-charge", color:"#5ac8fa", phrase:"Tu pourrais progresser un peu plus vite — ta charge est en dessous de la zone idéale.", severe:false };
  if(acwr<=1.3) return { zone:"idéale", color:"#30d158", phrase:"Tu augmentes ta charge à un rythme sûr.", severe:false };
  const severe = acwr>1.5;
  return { zone:"attention", color:"#e8a317", phrase: severe
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
const NON_RUNNING_SESSION_TYPES = ["Renfo","Mobilité","Yoga","Souplesse","Kiné","Pilates","Other","Marche"];
function sessionCategory(s){
  if(s.pace_zone) return "run";
  if(!s.type) return "light";
  if(s.type==="Renfo") return "renfo";
  if(NON_RUNNING_SESSION_TYPES.includes(s.type)) return "light";
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

/* ---------- Base d'exercices renfo/mobilité (CDC v2, 4.7 — base pour 4.6.a) ----------
   Fournie par l'utilisateur (01/10/2026), 20 exercices (14 Renfo + 6
   Mobilité) — destinée à être relue par un kiné avant la phase 3 (CDC v2,
   trajectoire, condition de passage phase 2->3). `gif` reste à null tant
   qu'aucune image/GIF réel n'existe (produit ou licencié) — l'UI doit
   prévoir cet emplacement sans bloquer sur son absence.
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
  { id:1,  name:"Pont fessier bilatéral", type:"Renfo", zoneTravaillee:"Grand fessier", objectifs:"Tous", zonesDouleur:["genoux","dos"], niveau:"Débutant", format:"3x15", materiel:"Aucun", variante:null, gif:null },
  { id:2,  name:"Pont fessier unilatéral", type:"Renfo", zoneTravaillee:"Grand fessier (unilatéral)", objectifs:["Préparer une course","Améliorer mon allure"], zonesDouleur:["genoux"], niveau:"Intermédiaire", format:"3x10/côté", materiel:"Aucun", variante:null, gif:null },
  { id:3,  name:"Clamshell (coquillage) élastique", type:"Renfo", zoneTravaillee:"Moyen fessier", objectifs:"Tous", zonesDouleur:["genoux","bassin"], niveau:"Débutant", format:"3x15/côté", materiel:"Élastique", variante:"Sans élastique : même mouvement, en tenant 2 secondes en haut de chaque répétition.", gif:null },
  { id:4,  name:"Marche latérale élastique", type:"Renfo", zoneTravaillee:"Moyen fessier", objectifs:"Tous", zonesDouleur:["genoux","bassin"], niveau:"Débutant", format:"3x10 pas/côté", materiel:"Élastique", variante:"Sans élastique : pas latéraux lents en position de mini-squat, genoux légèrement fléchis.", gif:null },
  { id:5,  name:"Fente arrière", type:"Renfo", zoneTravaillee:"Quadriceps, fessiers, stabilité", objectifs:"Tous", zonesDouleur:["genoux"], niveau:"Débutant/Intermédiaire", format:"3x10/côté", materiel:"Aucun", variante:null, gif:null },
  { id:6,  name:"Squat bulgare", type:"Renfo", zoneTravaillee:"Quadriceps, fessiers (unilatéral)", objectifs:["Améliorer mon allure","Préparer une course"], zonesDouleur:["genoux"], niveau:"Intermédiaire", format:"3x8/côté", materiel:"Chaise ou banc", variante:"Sans surélévation : pied arrière posé au sol, derrière toi, même mouvement de fente.", gif:null },
  { id:7,  name:"Soulevé de terre jambe tendue unilatéral", type:"Renfo", zoneTravaillee:"Ischios, fessiers, équilibre", objectifs:"Tous", zonesDouleur:["ischios","dos"], niveau:"Intermédiaire", format:"3x8/côté", materiel:"Aucun", variante:null, gif:null },
  { id:8,  name:"Nordic hamstring curl (ou variante assistée)", type:"Renfo", zoneTravaillee:"Ischio-jambiers (excentrique)", objectifs:["Améliorer mon allure","Préparer une course"], zonesDouleur:["ischios"], niveau:"Avancé", format:"3x5", materiel:"Point d'ancrage pour les pieds (partenaire ou meuble lourd)", variante:"Sans ancrage : pont fessier talons au sol, en faisant glisser lentement les talons vers les fesses puis en les repoussant.", gif:null },
  { id:9,  name:"Mollets debout jambe tendue", type:"Renfo", zoneTravaillee:"Gastrocnémien", objectifs:"Tous", zonesDouleur:["mollets","tendons","tibias"], niveau:"Débutant", format:"3x15", materiel:"Aucun", variante:null, gif:null },
  { id:10, name:"Mollets debout genou fléchi", type:"Renfo", zoneTravaillee:"Soléaire", objectifs:"Tous", zonesDouleur:["tendons","mollets"], niveau:"Débutant", format:"3x15", materiel:"Aucun", variante:null, gif:null },
  { id:11, name:"Gainage ventral (planche)", type:"Renfo", zoneTravaillee:"Core (transverse)", objectifs:"Tous", zonesDouleur:["dos"], niveau:"Débutant", format:"3x30-45s", materiel:"Aucun", variante:null, gif:null },
  { id:12, name:"Gainage latéral (planche côté)", type:"Renfo", zoneTravaillee:"Obliques, moyen fessier", objectifs:"Tous", zonesDouleur:["bassin","dos"], niveau:"Débutant/Intermédiaire", format:"3x20-30s/côté", materiel:"Aucun", variante:null, gif:null },
  { id:13, name:"Dead bug", type:"Renfo", zoneTravaillee:"Core profond (stabilité lombo-pelvienne)", objectifs:"Tous", zonesDouleur:["dos"], niveau:"Débutant", format:"3x10/côté", materiel:"Aucun", variante:null, gif:null },
  { id:14, name:"Renforcement intrinsèque du pied (toe curls / short foot)", type:"Renfo", zoneTravaillee:"Muscles du pied", objectifs:"Tous", zonesDouleur:["pied"], niveau:"Débutant", format:"3x15 ou 2 min", materiel:"Aucun", variante:null, gif:null },
  { id:15, name:"Étirement fléchisseurs de hanche (couch stretch)", type:"Mobilité", zoneTravaillee:"Psoas, fléchisseurs hanche", objectifs:"Tous", zonesDouleur:["psoas","dos"], niveau:"Débutant", format:"2x30-45s/côté", materiel:"Un mur ou un canapé", variante:"Sans mur : fente basse, genou arrière posé au sol, buste droit, hanche poussée vers l'avant.", gif:null },
  { id:16, name:"Mobilité cheville (knee-to-wall dorsiflexion)", type:"Mobilité", zoneTravaillee:"Cheville", objectifs:"Tous", zonesDouleur:["tendons","tibias","mollets"], niveau:"Débutant", format:"2x10/côté", materiel:"Un mur", variante:null, gif:null },
  { id:17, name:"Étirement mollet contre mur", type:"Mobilité", zoneTravaillee:"Mollet (gastrocnémien)", objectifs:"Tous", zonesDouleur:["mollets","tendons","tibias"], niveau:"Débutant", format:"2x30s/côté", materiel:"Un mur", variante:null, gif:null },
  { id:18, name:"Ouverture de hanche 90/90", type:"Mobilité", zoneTravaillee:"Rotateurs de hanche", objectifs:["Préparer une course","Améliorer mon allure"], zonesDouleur:["bassin","genoux"], niveau:"Intermédiaire", format:"2x30-45s/côté", materiel:"Aucun", variante:null, gif:null },
  { id:19, name:"Étirement / auto-massage bande ilio-tibiale", type:"Mobilité", zoneTravaillee:"Bande ilio-tibiale, tenseur du fascia lata", objectifs:"Tous", zonesDouleur:["genoux","cuisse"], niveau:"Débutant", format:"1-2 min/côté", materiel:"Rouleau de massage (foam roller)", variante:"Sans rouleau : étirement debout, jambe croisée derrière l'autre, buste penché du côté opposé.", gif:null },
  { id:20, name:"Auto-massage plantaire (balle)", type:"Mobilité", zoneTravaillee:"Fascia plantaire", objectifs:"Tous", zonesDouleur:["pied"], niveau:"Débutant", format:"2 min/pied", materiel:"Balle (tennis ou de massage)", variante:"Sans balle : rouler le pied sur une bouteille d'eau.", gif:null },
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
