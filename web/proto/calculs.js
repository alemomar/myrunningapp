/* Prototype « refonte progression » : calculs purs (ni réseau, ni écriture, ni écran). Seuils dans reglages.js.
   Réutilise sans les modifier les fonctions de l'app (../logic.js) : allures conseillées (VDOT), allure par km, dérive
   cardiaque, zones cardio, cadence, records. Testé dans proto/test.html.
   26/10 (retours d'Omar) : bilan toujours donné (passages à la même allure), découpage en 3 catégories, allures par effort. */
const Calc = (() => {
  const JOUR = 86400000, SEM = 7 * JOUR, MOIS_J = 30.44;
  const moyenne = (a) => a.length ? a.reduce((x, v) => x + v, 0) / a.length : null;
  const med = (a) => { const s = a.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const kmTxt = (m) => String(Math.round(m / 100) / 10).replace(".", ",");
  const allureTxt = (s) => s == null ? "—" : fmtKmPace(s);
  const plur = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
  const maj = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  /* ---------- Une sortie ---------- */
  function versSortie(row) {
    const ts = Date.parse(row.start_date);
    const dist = Number(row.distance_km) || 0, dur = Number(row.duration_sec) || 0;
    return {
      id: row.id, ts, type: normalizeSessionType(row.type) || "Other", appleType: row.apple_type || null,
      dist, dur, allure: dist > 0 && dur > 0 ? dur / dist : null,
      fc: Number(row.avg_hr) || null, fcMax: Number(row.peak_hr) || null, cad: Number(row.avg_cadence) || null,
      rpe: row.pain_ratings && row.pain_ratings.rpe != null ? Number(row.pain_ratings.rpe) : null,
      stats: row.include_in_stats !== false, hr: Array.isArray(row.hr_series) ? row.hr_series : null,
      pace: Array.isArray(row.pace_series) ? row.pace_series : null,
      lapMarkers: Array.isArray(row.lap_markers) ? row.lap_markers : null,
      fracWorkManual: Number(row.frac_work_manual) || null, fracRecoveryManual: Number(row.frac_recovery_manual) || null,
      manuel: row.apple_type === "Manuel",   // saisie à la main dans l'app (MANUAL_RUN_MARKER de logic.js)
      typeV2: row.typeV2 || null,            // V2 : type corrigé à la main (gardé sur ce téléphone dans le prototype)
    };
  }
  const estCourse = (s) => RUNNING_RUN_TYPES.includes(s.type) && s.stats && s.dist > 0 && s.allure > 0;

  // Montres peu détaillées (29/10, question d'Omar sur Garmin) : Garmin n'envoie à Apple Santé qu'un cœur toutes les 2 min et
  // une allure toutes les ~10 min. La courbe et les zones ne sont alors pas fiables, mais le cœur moyen de la sortie l'est.
  const mesures = (serie, cle) => (serie || []).filter((p) => p && p[cle] > 0);
  const coeurMoyenOk = (s, reg) => { const r = reg || REGLAGES; return s.fc > 0 && (coeurFiable(s, r) || (s.dur > 0 && mesures(s.hr, "hr").length >= s.dur / r.coeurMoyenIntervalleMaxSec)); };
  const allureDetaillee = (s, reg) => s.dur > 0 && mesures(s.pace, "pace").length / s.dur * 60 >= (reg || REGLAGES).allureDetailleeParMin;
  // Écart habituel entre deux mesures de cœur d'une sortie, en secondes (« toutes les 2 min »).
  function intervalleCoeur(s) {
    const t = mesures(s.hr, "hr").map((p) => p.t).sort((a, b) => a - b), d = [];
    for (let i = 1; i < t.length; i++) if (t[i] > t[i - 1]) d.push(t[i] - t[i - 1]);
    return med(d);
  }
  // Ta montre sur tes dernières courses (hors saisies à la main) : cœur détaillé ? allure détaillée ? intervalle de cœur habituel.
  function detailMontre(sorties, nowTs, reg) {
    const r = reg || REGLAGES, l = sorties.filter((s) => estCourse(s) && !s.manuel && !s.local && s.ts <= nowTs).slice(-r.detailSorties);
    if (!l.length) return { coeur: true, allure: true, intervalle: null };
    return { coeur: l.filter((s) => coeurFiable(s, r)).length * 2 >= l.length, allure: l.filter((s) => allureDetaillee(s, r)).length * 2 >= l.length,
      intervalle: med(l.map(intervalleCoeur).filter((v) => v != null)) };
  }
  // Démo « Voir comme une Garmin » (Profil › Écrans de démonstration) : une sortie telle que Garmin l'envoie à Apple Santé
  // (cœur moyenné toutes les 2 min, allure moyenne toutes les ~10 min, pas de tours). Calcul sur le téléphone, rien n'est écrit.
  function commeGarmin(row) {
    const hr = mesures(row.hr_series, "hr").sort((a, b) => a.t - b.t), pc = mesures(row.pace_series, "pace").sort((a, b) => a.t - b.t);
    const fenHr = []; let i = 0;
    for (let t0 = 0; hr.length && t0 < hr[hr.length - 1].t; t0 += 120) {
      let n = 0, somme = 0;
      while (i < hr.length && hr[i].t <= t0 + 120) { if (hr[i].t > t0) { somme += hr[i].hr; n++; } i++; }
      if (n) fenHr.push({ t: t0 + 120, hr: Math.round(somme / n) });
    }
    const fenPc = []; let prev = 0, t0 = 0, d = 0, du = 0;
    pc.forEach((p) => { const dt = p.t - prev; prev = p.t; if (dt <= 0 || dt > 120) return; d += dt * 1000 / p.pace; du += dt;
      if (p.t - t0 >= 593 && d > 0) { fenPc.push({ t: p.t, pace: Math.round(du / (d / 1000)) }); t0 = p.t; d = 0; du = 0; } });
    if (d > 0) fenPc.push({ t: prev, pace: Math.round(du / (d / 1000)) });
    return { ...row, hr_series: hr.length ? fenHr : row.hr_series, pace_series: pc.length ? fenPc : row.pace_series, lap_markers: null };
  }

  // Cœur fiable : au moins une mesure toutes les 30 s en moyenne, sur au moins 70 % de la sortie.
  const cacheFiable = new Map();
  function coeurFiable(s, reg) {
    const r = reg || REGLAGES, cle = `${s.id}|${s.ts}|${(s.hr || []).length}|${r.coeurFiableIntervalleSec}|${r.coeurFiableCouverture}`;
    if (cacheFiable.has(cle)) return cacheFiable.get(cle);
    const pts = (s.hr || []).filter((p) => p && p.hr > 0);
    let ok = false;
    if (pts.length >= 2 && s.dur > 0) {
      const ts = pts.map((p) => p.t).sort((a, b) => a - b);
      ok = pts.length >= s.dur / r.coeurFiableIntervalleSec && (ts[ts.length - 1] - ts[0]) / s.dur >= r.coeurFiableCouverture;
    }
    cacheFiable.set(cle, ok);
    return ok;
  }

  // Ressenti sur 10 : celui noté dans le prototype (ce téléphone), sinon la difficulté notée dans l'app.
  const ressentiDe = (s, ressentis) => (ressentis && ressentis[s.id] != null ? Number(ressentis[s.id]) : s.rpe);
  function ressentiMot(v, reg) {
    const r = reg || REGLAGES;
    return v == null ? null : v <= r.ressentiFacileMax ? "facile" : v >= r.ressentiDurMin ? "dure" : "correcte";
  }

  /* ---------- Zones d'allure (tirées de tes allures conseillées) ---------- */
  function zonesAllure(profil, sorties, nowTs, reg) {
    const r = reg || REGLAGES;
    const today = new Date(nowTs || Date.now()).toISOString().slice(0, 10);
    const prof = resolveRunnerProfile((profil && profil.goals) || {}, (profil && profil.program_settings) || {}, today);
    let a = prof ? levelPaceZones(prof.distanceKm, prof.timeSec) : null, source;
    if (a) source = `tes allures conseillées (${levelSourceText(prof)})`;
    else {
      const faciles = (sorties || []).filter((s) => s.type === "EF" && estCourse(s) && s.ts >= (nowTs || Date.now()) - 8 * SEM);
      const easy = med(faciles.map((s) => s.allure));
      if (!easy) return null;
      // Sans chrono : écarts types des allures de Daniels autour de l'allure facile (approximation, à affiner).
      a = { easy, marathon: easy * 0.87, threshold: easy * 0.83, interval: easy * 0.75, repetition: easy * 0.71 };
      source = "ton allure habituelle en sortie facile (pas de chrono dans « Ton niveau »)";
    }
    const mi = (x, y) => (x + y) / 2;
    // Bornes basses (s/km) : une allure plus LENTE que la borne appartient à la zone (index 0 = la plus lente).
    const bornes = [a.easy + r.recupEcartSec, mi(a.easy, a.marathon), mi(a.marathon, a.threshold), mi(a.threshold, a.interval)];
    return { bornes, source, conseillees: a, niveau: prof };
  }
  function zoneDe(pace, z) {
    if (pace >= z.bornes[0]) return 0;
    if (pace >= z.bornes[1]) return 1;
    if (pace >= z.bornes[2]) return 2;
    if (pace >= z.bornes[3]) return 3;
    return 4;
  }
  function zonesLibelles(z, reg) {
    const r = reg || REGLAGES, b = z.bornes, f = (v) => allureTxt(Math.round(v));
    return [`plus de ${f(b[0])}`, `${f(b[1])} à ${f(b[0])}`, `${f(b[2])} à ${f(b[1])}`, `${f(b[3])} à ${f(b[2])}`, `moins de ${f(b[3])}`]
      .map((plage, i) => ({ nom: r.zonesNoms[i], plage, couleur: r.zonesCouleurs[i] }));
  }

  /* ---------- Points d'allure lissés, recalés sur la distance, avec le cœur au même instant ---------- */
  // Trou au-delà duquel on considère une pause : 4 fois l'écart habituel entre deux mesures d'allure, au moins 15 s, au plus 2 min.
  function trouMax(pc, r) {
    const dts = [];
    for (let i = 1; i < pc.length; i++) { const d = pc[i].t - pc[i - 1].t; if (d > 0) dts.push(d); }
    return Math.min(r.pauseSec, Math.max(r.pauseMinSec || 0, (r.pauseFacteur || 0) * (med(dts) || 0)));
  }
  const cachePoints = new Map();
  function pointsAllure(s, z, reg) {
    const r = reg || REGLAGES;
    if (!z || !s.pace || !(s.dist > 0) || !(s.dur > 0)) return null;
    const cle = `${s.id}|${s.ts}|${s.pace.length}|${(s.hr || []).length}|${z.bornes.join(",")}|${r.lissageSec}|${r.pauseSec}|${r.pauseFacteur}|${r.pauseMinSec}|${r.coeurToleranceSec}|${r.coeurDecalageSec}`;
    if (cachePoints.has(cle)) return cachePoints.get(cle);
    let res = null;
    const pc = s.pace.filter((p) => p && p.pace > 0 && p.t >= 0).sort((a, b) => a.t - b.t);
    if (pc.length / s.dur * 60 >= 1) {   // au moins une mesure d'allure par minute
      const demi = r.lissageSec / 2;
      const lisse = pc.map((p, i) => {
        const fen = []; for (let j = i; j >= 0 && pc[j].t >= p.t - demi; j--) fen.push(pc[j].pace);
        for (let j = i + 1; j < pc.length && pc[j].t <= p.t + demi; j++) fen.push(pc[j].pace);
        return med(fen);
      });
      let prevT = 0; const pts = [], cap = trouMax(pc, r);
      pc.forEach((p, i) => { const dt = p.t - prevT; prevT = p.t; if (dt > 0 && dt <= cap) pts.push({ t: p.t, dt, m: dt * 1000 / lisse[i], pace: lisse[i], zone: zoneDe(lisse[i], z), hr: null }); });
      const brut = pts.reduce((a, x) => a + x.m, 0);
      const ech = brut > 0 ? s.dist * 1000 / brut : 0;
      if (ech >= 0.8 && ech <= 1.25) {      // sinon les mesures sont trop loin de la distance de la sortie : jugées fausses
        pts.forEach((x) => { x.m *= ech; });
        const hr = (s.hr || []).filter((p) => p && p.hr > 0).sort((a, b) => a.t - b.t);
        // Le cœur suit l'allure avec un temps de retard : chaque mesure d'allure prend le cœur mesuré 45 s plus tard.
        if (hr.length) pts.forEach((x) => {
          const t = x.t + r.coeurDecalageSec;
          let lo = 0, hi = hr.length - 1;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (hr[mid].t < t) lo = mid + 1; else hi = mid; }
          const cand = [hr[lo], hr[lo - 1]].filter(Boolean).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
          if (cand && Math.abs(cand.t - t) <= r.coeurToleranceSec) x.hr = cand.hr;
        });
        res = pts;
      }
    }
    cachePoints.set(cle, res);
    return res;
  }

  /* ---------- Découpage automatique : 3 catégories (calme, facile, soutenu) ---------- */
  const CATEGORIE = (sg) => sg.role || sg.zone === 0 ? "calme" : sg.zone === 1 ? "facile" : "soutenu";
  function decoupage(s, z, reg) {
    const r = reg || REGLAGES, pts = pointsAllure(s, z, r);
    if (!pts) return null;
    const tempsParZone = [0, 0, 0, 0, 0]; pts.forEach((x) => { tempsParZone[x.zone] += x.dt; });
    // 1) Segments de même zone d'allure ; les plus courts (< 400 m) sont fondus dans le voisin le plus proche en allure.
    let segs = [];
    pts.forEach((x) => { const last = segs[segs.length - 1]; if (last && last.zone === x.zone) { last.m += x.m; last.sec += x.dt; } else segs.push({ zone: x.zone, m: x.m, sec: x.dt }); });
    const fusionner = () => { const out = []; segs.forEach((sg) => { const l = out[out.length - 1]; if (l && l.zone === sg.zone) { l.m += sg.m; l.sec += sg.sec; } else out.push({ ...sg }); }); segs = out; };
    for (let garde = 0; garde < 500 && segs.length > 1; garde++) {
      let iMin = -1; segs.forEach((sg, i) => { if (sg.m < r.decoupageMinM && (iMin < 0 || sg.m < segs[iMin].m)) iMin = i; });
      if (iMin < 0) break;
      const g = segs[iMin - 1], d = segs[iMin + 1], ici = segs[iMin].zone;
      const cible = !g ? d : !d ? g : (Math.abs(g.zone - ici) < Math.abs(d.zone - ici) ? g : Math.abs(g.zone - ici) > Math.abs(d.zone - ici) ? d : (g.m >= d.m ? g : d));
      cible.m += segs[iMin].m; cible.sec += segs[iMin].sec; segs.splice(iMin, 1); fusionner();
    }
    segs.forEach((sg) => { sg.role = null; });
    // Échauffement : 1er segment plus lent que le suivant, en récupération ou avant un passage soutenu. Retour au calme : dernier
    // segment plus lent que le précédent, en récupération ou à la fin d'une séance intense (une EF qui finit facile reste « facile »).
    if (segs.length > 1 && segs[0].zone < segs[1].zone && segs[0].m <= r.echauffementMaxM && (segs[0].zone === 0 || segs[1].zone >= 2)) segs[0].role = "echauffement";
    const n = segs.length;
    if (n > 2 && segs[n - 1].zone < segs[n - 2].zone && segs[n - 1].m <= r.retourCalmeMaxM && (segs[n - 1].zone === 0 || !["EF", "Long"].includes(s.type))) segs[n - 1].role = "retour";
    // 2) Regroupement en 3 catégories (retour d'Omar du 26/10 : « illisible ») : les passages soutenus voisins ne font qu'un.
    const cats = [];
    segs.forEach((sg) => {
      const cat = CATEGORIE(sg), cle = sg.role || cat, l = cats[cats.length - 1];
      if (l && l.cle === cle && !sg.role) { l.m += sg.m; l.sec += sg.sec; l.zones.add(sg.zone); }
      else cats.push({ cle, cat, role: sg.role, m: sg.m, sec: sg.sec, zones: new Set([sg.zone]) });
    });
    let debut = 0; cats.forEach((c) => { c.debutM = debut; debut += c.m; });
    const nom = (c) => c.role === "echauffement" ? "d'échauffement" : c.role === "retour" ? "de retour au calme" : c.cat === "calme" ? "lents" : c.cat === "facile" ? "faciles" : "en soutenu";
    const texte = maj(cats.map((c) => `${kmTxt(c.m)} km ${nom(c)}`).join(", ")) + ".";
    const soutenus = cats.filter((c) => c.cat === "soutenu");
    const soutenuM = soutenus.reduce((a, c) => a + c.m, 0), facileM = cats.filter((c) => c.cat === "facile").reduce((a, c) => a + c.m, 0);
    const calmeM = cats.filter((c) => c.cat === "calme").reduce((a, c) => a + c.m, 0);
    let commentaire;
    if ((s.type === "EF" || s.type === "Long") && soutenus.length) {
      const ou = soutenus.map((c) => `au ${Math.floor((c.debutM + c.m / 2) / 1000) + 1}e km`).join(" et ");   // le km où tombe le milieu du passage
      commentaire = `Une sortie facile avec ${kmTxt(soutenuM)} km plus rapides (${ou}) : elle reste classée « ${s.type === "Long" ? "longue" : "facile"} », les km rapides sont comptés à part.`;
    } else if (!soutenus.length) commentaire = "Toute la sortie en facile : c'est exactement ce qu'on attend d'une sortie d'endurance.";
    else commentaire = `${kmTxt(soutenuM)} km en soutenu sur ${kmTxt(s.dist * 1000)} km, en ${plur(soutenus.length, "passage", "passages")}.`;
    return { segments: cats, texte, commentaire, soutenuM, facileM, calmeM, tempsParZone,
      facileSec: tempsParZone[0] + tempsParZone[1], soutenuSec: tempsParZone[2] + tempsParZone[3] + tempsParZone[4] };
  }

  // Tempo ou Seuil pour une séance « Seuil » de l'app : la zone soutenue où elle a passé le plus de temps (E19).
  // V2 : un seul vocabulaire (Sortie facile, Longue, Tempo, Seuil, Fractionné, Compétition) ; un type corrigé à la main passe avant.
  function libelleType(s, dec) {
    if (s.typeV2) return s.typeV2;
    const L = { EF: "Sortie facile", Long: "Longue", Fractionné: "Fractionné", Course: "Compétition", Seuil: "Tempo" };
    if (s.type === "Seuil" && dec) return dec.tempsParZone[3] + dec.tempsParZone[4] > dec.tempsParZone[2] ? "Seuil" : "Tempo";
    return L[s.type] || s.type;
  }
  const nomCourt = (lib) => (lib === "Sortie facile" ? "Facile" : lib);
  // « Ta première au seuil », « tes sorties faciles »… : le type dans une phrase.
  const PREMIERE = { "Sortie facile": "Ta première sortie facile", Longue: "Ta première sortie longue", Tempo: "Ta première au tempo", Seuil: "Ta première au seuil", "Fractionné": "Ton premier fractionné", "Compétition": "Ta première compétition" };
  const TES = { "Sortie facile": "tes sorties faciles", Longue: "tes sorties longues", Tempo: "tes séances au tempo", Seuil: "tes séances au seuil", "Fractionné": "tes fractionnés", "Compétition": "tes compétitions" };

  /* ---------- Passages par zone d'allure : temps, distance, allure et cœur moyens ---------- */
  function passages(s, z, reg) {
    const pts = pointsAllure(s, z, reg);
    if (!pts) return null;
    const r = reg || REGLAGES, o = [0, 1, 2, 3, 4].map(() => ({ sec: 0, m: 0, hrSum: 0, hrSec: 0 }));
    pts.forEach((x) => { const a = o[x.zone]; a.sec += x.dt; a.m += x.m; if (x.hr != null) { a.hrSum += x.hr * x.dt; a.hrSec += x.dt; } });
    return o.map((a) => ({ sec: a.sec, m: a.m, allure: a.m > 0 ? a.sec / (a.m / 1000) : null, fc: a.hrSec >= r.coeurMinSec ? a.hrSum / a.hrSec : null }));
  }
  // Zone qui compte pour le bilan : la zone soutenue la plus longue pour une séance intense, sinon la plus longue hors récupération.
  function zoneDominante(p, type) {
    const parmi = type === "Seuil" || type === "Fractionné" ? [2, 3, 4] : [1, 2, 3, 4];
    let best = -1; parmi.forEach((i) => { if (p[i].sec > 0 && (best < 0 || p[i].sec > p[best].sec)) best = i; });
    return best;
  }
  const ZONE_A = ["en récup", "en facile", "au tempo", "au seuil", "en fractionné"];

  /* ---------- Bilan (le « verdict » de la demande ; renommé le 26/10) ---------- */
  function habitude(s, toutes, reg, semaines) {
    const r = reg || REGLAGES, w = semaines || r.habitudeSemaines;
    return toutes.filter((h) => h.id !== s.id && estCourse(h) && h.type === s.type && h.ts < s.ts && h.ts >= s.ts - w * SEM);
  }
  const TITRES = {
    facile: "Plus facile que d'habitude à cette allure", moyenne: "Dans ta moyenne", dure: "Plus dure que d'habitude",
    rapide: "Plus rapide que d'habitude", lente: "Plus lente que d'habitude", premiere: "Ta première sortie de ce type",
  };
  const SENS = { facile: "haut", rapide: "haut", moyenne: "egal", dure: "bas", lente: "bas", premiere: "nouveau" };
  const battements = (d) => d < 0 ? `${plur(-d, "battement", "battements")} de moins que` : `${plur(d, "battement", "battements")} de plus que`;

  // 1) Tes passages à la même allure, toutes sorties confondues.
  function bilanPassages(s, toutes, z, r) {
    if (!z || !coeurFiable(s, r)) return null;
    const p = passages(s, z, r);
    if (!p) return null;
    const zi = zoneDominante(p, s.type);
    if (zi < 0 || !p[zi].fc || p[zi].sec < r.bilanMinPassageSec) return null;
    const moi = p[zi];
    // Pente cœur / allure de la personne (battements par s/km), tirée de tous ses passages des 12 dernières semaines :
    // à 10 s/km près, l'écart d'allure compte encore (plus vite = cœur plus haut).
    const tousPassages = toutes.filter((h) => h.id !== s.id && estCourse(h) && h.ts < s.ts && h.ts >= s.ts - r.bilanFenetreMaxSemaines * SEM && coeurFiable(h, r))
      .map((h) => ({ h, p: passages(h, z, r) })).filter((x) => x.p);
    const nuage = []; tousPassages.forEach((x) => x.p.forEach((q) => { if (q.sec >= r.bilanMinPassageSec && q.fc) nuage.push({ x: q.allure, y: q.fc }); }));
    let pente = nuage.length >= r.penteMinPoints ? linearRegression(nuage).slope : null;
    if (pente == null || pente > r.penteCoeurMax || pente < r.penteCoeurMin) pente = r.penteCoeurDefaut;
    for (const semaines of [r.habitudeSemaines, r.bilanFenetreMaxSemaines]) {
      const autres = tousPassages.filter((x) => x.h.ts >= s.ts - semaines * SEM && x.p[zi].sec >= r.bilanMinPassageSec && x.p[zi].fc)
        .map((x) => ({ ts: x.h.ts, allure: x.p[zi].allure, fc: x.p[zi].fc }));
      // D'abord les passages à 10 s/km près, sinon à 30 s/km près : le cœur de chacun est ramené à ton allure du jour.
      const comp = autres.filter((a) => Math.abs(a.allure - moi.allure) <= r.allureComparableSec);
      const proches = autres.filter((a) => Math.abs(a.allure - moi.allure) <= r.allureProcheMaxSec);
      let fcAtt = null, ref = null;
      const choix = comp.length >= r.minSortiesComparables ? comp : proches.length >= r.minSortiesComparables ? proches : null;
      if (choix) { fcAtt = moyenne(choix.map((a) => a.fc + pente * (moi.allure - a.allure))); ref = choix; }
      else if (autres.length >= r.minSortiesTendance) {
        const lr = linearRegression(autres.map((a) => ({ x: a.allure, y: a.fc })));
        fcAtt = lr.intercept + lr.slope * moi.allure; ref = autres;
      }
      if (fcAtt == null) continue;
      const d = Math.round(moi.fc - fcAtt), cle = d <= -r.ecartCoeurBpm ? "facile" : d >= r.ecartCoeurBpm ? "dure" : "moyenne";
      const base = `${maj(ZONE_A[zi])} (${kmTxt(moi.m)} km à ${allureTxt(moi.allure)}/km), ton cœur était à ${Math.round(moi.fc)}`;
      const compare = `comparé à ${plur(ref.length, "sortie", "sorties")} des ${semaines} dernières semaines`;
      const phrase = cle === "moyenne" ? `${base} : comme d'habitude à cette allure (${compare}).` : `${base} : ${battements(d)} d'habitude à cette allure (${compare}).`;
      return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, pourquoi: POURQUOI_COEUR[cle], compare: maj(compare), base: "coeur", zone: zi, note: null, comparees: ref.length, ecartBpm: d,
        tuiles: [{ cle: "allure", label: `Allure ${ZONE_A[zi]}`, valeur: allureTxt(moi.allure), unite: "/km", habitude: allureTxt(moyenne(ref.map((a) => a.allure))) },
          { cle: "coeur", label: `Cœur ${ZONE_A[zi]}`, valeur: String(Math.round(moi.fc)), unite: "bpm", habitude: String(Math.round(fcAtt)), delta: d }] };
    }
    return null;
  }
  const POURQUOI_COEUR = { facile: "À la même allure, ton cœur battait moins vite.", dure: "À la même allure, ton cœur battait plus vite.", moyenne: "Même allure, même cœur que d'habitude." };
  // Le passage le plus long dans la zone qui fait le bilan (« Au seuil : 5,3 km sur 8,5 km »), pour une première sortie.
  function passageDominant(s, z, r) {
    if (!z) return null;
    const p = passages(s, z, r);
    if (!p) return null;
    const zi = zoneDominante(p, s.type);
    return zi < 0 || p[zi].sec < r.bilanMinPassageSec ? null : { zone: zi, m: p[zi].m, allure: p[zi].allure, fc: p[zi].fc };
  }

  function verdict(s, toutes, ressentis, reg, z) {
    const r = reg || REGLAGES;
    const vp = bilanPassages(s, toutes, z, r);
    if (vp) return vp;
    // 2) Sorties du même type, 6 puis 12 semaines.
    let hab = habitude(s, toutes, r, r.habitudeSemaines), semaines = r.habitudeSemaines;
    if (hab.length < r.minSortiesHabitude) { hab = habitude(s, toutes, r, r.bilanFenetreMaxSemaines); semaines = r.bilanFenetreMaxSemaines; }
    const res = ressentiDe(s, ressentis);
    const fiable = coeurMoyenOk(s, r);   // 29/10 : le cœur moyen suffit (Garmin), même sans courbe détaillée
    const tuileAllure = (habVal) => ({ cle: "allure", label: "Allure", valeur: allureTxt(s.allure), unite: "/km", habitude: habVal != null ? allureTxt(habVal) : null });
    const notePartielle = !fiable && s.fc ? "Données cardio partielles avec ta montre : le bilan s'appuie sur ton allure et ton ressenti." : null;
    const lib = libelleType(s, s.type === "Seuil" ? decoupage(s, z, r) : null);
    // 3) Rien à comparer : première sortie de ce type, elle devient le point de départ.
    if (hab.length < r.minSortiesHabitude) {
      const pd = coeurFiable(s, r) ? passageDominant(s, z, r) : null;   // les passages demandent la courbe détaillée
      const tuiles = pd && pd.fc ? [{ cle: "allure", label: `Allure ${ZONE_A[pd.zone]}`, valeur: allureTxt(pd.allure), unite: "/km", habitude: null },
        { cle: "coeur", label: `Cœur ${ZONE_A[pd.zone]}`, valeur: String(Math.round(pd.fc)), unite: "bpm", habitude: null }]
        : [tuileAllure(null)].concat(s.fc ? [{ cle: "coeur", label: "Cœur moyen", valeur: String(Math.round(s.fc)), unite: "bpm", habitude: null }] : []);
      return { cle: "premiere", sens: SENS.premiere, titre: PREMIERE[lib] || TITRES.premiere, base: null, note: notePartielle,
        pourquoi: "Elle devient ton point de départ : les prochaines s'y compareront.",
        compare: pd ? `${maj(ZONE_A[pd.zone])} : ${kmTxt(pd.m)} km sur ${kmTxt(s.dist * 1000)} km` : `Rien à comparer sur les ${r.bilanFenetreMaxSemaines} dernières semaines`,
        phrase: `Pas d'autre sortie de ce type sur les ${r.bilanFenetreMaxSemaines} dernières semaines : ${allureTxt(s.allure)}/km${s.fc ? `, cœur à ${Math.round(s.fc)}` : ""}. Elle devient ton point de départ : la prochaine sera comparée à celle-ci.`,
        tuiles };
    }
    const allureHab = moyenne(hab.map((h) => h.allure)), compare = `comparé à ${plur(hab.length, "sortie", "sorties")} de ce type des ${semaines} dernières semaines`;
    const compareCourt = `Comparé à ${plur(hab.length, "sortie", "sorties")} des ${semaines} dernières semaines`;
    if (fiable) {
      const avecCoeur = hab.filter((h) => coeurMoyenOk(h, r));
      const comparables = avecCoeur.filter((h) => Math.abs(h.allure - s.allure) <= r.allureComparableSec);
      let fcAttendue = null;
      if (comparables.length >= r.minSortiesComparables) fcAttendue = moyenne(comparables.map((h) => h.fc));
      else if (avecCoeur.length >= r.minSortiesTendance) {
        const lr = linearRegression(avecCoeur.map((h) => ({ x: h.allure, y: h.fc })));
        fcAttendue = lr.intercept + lr.slope * s.allure;
      }
      if (fcAttendue != null) {
        const d = Math.round(s.fc - fcAttendue);
        const cle = d <= -r.ecartCoeurBpm ? "facile" : d >= r.ecartCoeurBpm ? "dure" : "moyenne";
        const debut = `Ton cœur à ${Math.round(s.fc)} pour ${allureTxt(s.allure)}/km`;
        const phrase = cle === "moyenne" ? `${debut} : comme d'habitude à cette allure (${compare}).` : `${debut} : ${battements(d)} d'habitude à cette allure (${compare}).`;
        return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, pourquoi: POURQUOI_COEUR[cle], compare: compareCourt, base: "coeur", note: null, comparees: hab.length, ecartBpm: d,
          tuiles: [tuileAllure(allureHab), { cle: "coeur", label: "Cœur moyen", valeur: String(Math.round(s.fc)), unite: "bpm", habitude: String(Math.round(fcAttendue)), delta: d }] };
      }
    }
    const dA = s.allure - allureHab;   // > 0 : plus lent que d'habitude
    const resHab = moyenne(hab.map((h) => ressentiDe(h, ressentis)).filter((v) => v != null));
    if (res != null && resHab != null) {
      const dR = res - resHab;
      let cle = "moyenne";
      if (Math.abs(dA) <= r.allureComparableSec) { if (dR <= -r.ecartRessenti) cle = "facile"; else if (dR >= r.ecartRessenti) cle = "dure"; }
      else if (dA < 0 && dR <= 0) cle = "facile";
      else if (dA > 0 && dR >= 0) cle = "dure";
      const rh = String(Math.round(resHab * 10) / 10).replace(".", ",");
      const phrase = `${allureTxt(s.allure)}/km, trouvée « ${ressentiMot(res, r)} » (${res}/10, d'habitude ${rh}/10) : ${
        cle === "facile" ? "plus facile" : cle === "dure" ? "plus dure" : "comme"} ${cle === "moyenne" ? "tes" : "que tes"} dernières sorties de ce type (${compare}).`;
      const memeAllure = Math.abs(dA) <= r.allureComparableSec;
      const pourquoi = cle === "facile" ? (memeAllure ? "Même allure, et tu l'as trouvée plus facile." : "Plus vite que d'habitude, sans te sentir plus fatigué.")
        : cle === "dure" ? (memeAllure ? "Même allure, et tu l'as trouvée plus dure." : "Plus lente, et tu l'as trouvée plus dure.") : "Même allure, même ressenti que d'habitude.";
      return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, pourquoi, compare: compareCourt, base: "ressenti", note: notePartielle, comparees: hab.length,
        tuiles: [tuileAllure(allureHab), { cle: "ressenti", label: "Ressenti", valeur: String(res), unite: "/10", habitude: rh }] };
    }
    const cle = dA <= -r.ecartAllureSec ? "rapide" : dA >= r.ecartAllureSec ? "lente" : "moyenne";
    const phrase = cle === "moyenne" ? `${allureTxt(s.allure)}/km : comme tes sorties de ce type (${compare}).`
      : `${allureTxt(s.allure)}/km : ${Math.round(Math.abs(dA))} s/km ${cle === "rapide" ? "plus vite" : "plus lent"} que ta moyenne sur ce type de sortie (${compare}). Note ton ressenti pour un bilan plus juste.`;
    const tes = TES[lib] || "tes sorties de ce type";
    const pourquoi = cle === "moyenne" ? `Même allure que ${tes}.` : `${Math.round(Math.abs(dA))} s/km ${cle === "rapide" ? "plus vite" : "plus lent"} que ${tes}.`;
    const tuiles = [tuileAllure(allureHab)].concat(res != null ? [{ cle: "ressenti", label: "Ressenti", valeur: String(res), unite: "/10", habitude: resHab != null ? String(Math.round(resHab)) : null }] : []);
    return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, pourquoi, compare: compareCourt, base: "allure", note: notePartielle, comparees: hab.length, tuiles };
  }

  function conseil(s, v, reg) {
    const c = (reg || REGLAGES).conseils;
    if (s.type === "Course") return c.course;
    if (s.type === "Fractionné" || s.type === "Seuil") return c.intense;
    if (v && v.cle === "dure") return c.dure;
    if (v && v.cle === "lente") return c.lente;
    if (v && (v.cle === "facile" || v.cle === "rapide")) return c.facileFacile;
    if (v && v.cle === "moyenne") return c.moyenneFacile;
    return c.defaut;
  }

  /* ---------- Évolution sur cette distance ---------- */
  function evolution(s, toutes, reg) {
    const r = reg || REGLAGES;
    const comp = toutes.filter((h) => h.id !== s.id && estCourse(h) && h.type === s.type && Math.abs(h.dist - s.dist) <= s.dist * r.evolutionDistanceEcart
      && h.ts <= s.ts - r.evolutionDe * SEM && h.ts >= s.ts - r.evolutionA * SEM);
    if (!comp.length) return { texte: "Pas de sortie comparable il y a 2 mois : la comparaison viendra.", court: "Pas encore de sortie comparable il y a 2 mois : la comparaison viendra.", ecart: null, n: 0 };
    const avant = moyenne(comp.map((h) => h.allure)), d = Math.round(avant - s.allure);
    const plage = `${plur(comp.length, "sortie", "sorties")} de ${kmTxt(s.dist * 1000 * (1 - r.evolutionDistanceEcart))} à ${kmTxt(s.dist * 1000 * (1 + r.evolutionDistanceEcart))} km`;
    const texte = Math.abs(d) < r.evolutionMinSec ? `Sur cette distance, tu cours au même rythme qu'il y a 2 mois (${plage}).`
      : `Sur cette distance, tu cours ${Math.abs(d)} s/km ${d > 0 ? "plus vite" : "plus lentement"} qu'il y a 2 mois (${plage}).`;
    const court = Math.abs(d) < r.evolutionMinSec ? "Même rythme qu'il y a 2 mois." : `${Math.abs(d)} s/km ${d > 0 ? "plus vite" : "plus lent"} qu'il y a 2 mois.`;
    return { texte, court, ecart: d, n: comp.length };
  }

  /* ---------- Ressenti face à la mesure (V2 : une phrase, le ressenti en tête) ---------- */
  // `libelle` : le type tel qu'affiché (Tempo ou Seuil pour une séance « Seuil » de l'app), sinon celui sans découpage.
  function ressentiFaceMesure(s, v, ressentis, reg, libelle) {
    const res = ressentiDe(s, ressentis);
    if (res == null) return "Note ton ressenti pour le comparer à ce que disent tes chiffres.";
    const lib = libelle || libelleType(s, null), intense = ["Tempo", "Seuil", "Fractionné", "Compétition"].includes(lib) || s.type === "Seuil";
    if (intense && res >= 6) return `${res}/10 pour ${lib === "Fractionné" ? "un fractionné" : lib === "Compétition" ? "une compétition" : `une séance ${lib === "Tempo" ? "au tempo" : "au seuil"}`} : c'est l'effort attendu.`;
    if (!v || !v.cle || v.cle === "premiere") return `${res}/10 : ta prochaine sortie de ce type s'y comparera.`;
    if (v.base === "ressenti") return `Sans cœur fiable, c'est ton ressenti (${res}/10) qui fait le bilan, avec ton allure.`;
    // Échelle V2 : 1 à 4 facile, 5 modéré, 6 et plus soutenu ou dur.
    const mot = res >= 6 ? "dure" : res <= 4 ? "facile" : "correcte";
    const mesure = v.cle === "facile" || v.cle === "rapide" ? "facile" : v.cle === "dure" || v.cle === "lente" ? "dure" : "correcte";
    const coeur = v.base === "coeur";
    const chiffre = { dure: coeur ? "un cœur plus haut que d'habitude" : "une allure plus lente que d'habitude",
      facile: coeur ? "un cœur plus bas que d'habitude" : "une allure plus rapide que d'habitude", correcte: coeur ? "un cœur dans ta moyenne" : "une allure dans ta moyenne" }[mesure];
    if (mot === "dure" && mesure === "dure") return `${res}/10 et ${chiffre} : les deux parlent de fatigue.`;
    if (mot === "facile" && mesure === "facile") return `${res}/10 et ${chiffre} : les deux disent que tu progresses.`;
    if (mot === mesure) return `${res}/10 et ${chiffre} : rien à signaler.`;
    if (mot === "dure") return `${res}/10 avec ${chiffre} : fatigue, chaleur ou manque de sommeil jouent souvent.`;
    if (mesure === "dure") return `${res}/10, mais ${chiffre} : elle t'a demandé plus que d'habitude, garde un œil sur la récupération.`;
    return `${res}/10 et ${chiffre} : un écart normal d'une sortie à l'autre.`;
  }

  /* ---------- Ta semaine, ta série ---------- */
  function lundi(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); }
  function semaine(sorties, nowTs, z, reg) {
    const r = reg || REGLAGES, l = lundi(nowTs);
    const courses = sorties.filter(estCourse);
    const bilan = (de, a) => { const c = courses.filter((s) => s.ts >= de && s.ts < a); return { n: c.length, km: c.reduce((x, s) => x + s.dist, 0), sec: c.reduce((x, s) => x + s.dur, 0), sorties: c }; };
    const cette = bilan(l, nowTs + 1), derniere = bilan(l - SEM, l);
    const avant = Array.from({ length: r.semaineMoyenneSemaines }, (_, i) => bilan(l - (i + 1) * SEM, l - i * SEM));
    const moy = { n: moyenne(avant.map((b) => b.n)), km: moyenne(avant.map((b) => b.km)), sec: moyenne(avant.map((b) => b.sec)) };
    let facile = 0, soutenu = 0;
    cette.sorties.forEach((s) => {
      const d = decoupage(s, z, r);
      if (d) { facile += d.facileSec; soutenu += d.soutenuSec; }
      else if (s.type === "EF" || s.type === "Long") facile += s.dur; else soutenu += s.dur;
    });
    const pct = facile + soutenu > 0 ? Math.round(soutenu / (facile + soutenu) * 100) : null;
    const phrase = !cette.n ? "Pas encore de sortie cette semaine : une sortie facile pour la lancer."
      : pct > r.semaineSoutenuMaxPct ? `Beaucoup d'intensité cette semaine (${pct} % en soutenu) : ta prochaine sortie, en facile.`
      : pct === 0 && cette.n >= 2 ? "Que du facile cette semaine : tu peux mettre un peu de rythme sur une sortie."
      : "Bon équilibre : surtout du facile, un peu de soutenu.";
    return { cette, derniere, moyenne: moy, facileSec: facile, soutenuSec: soutenu, soutenuPct: pct, phrase };
  }
  // Semaines d'affilée avec au moins une course (la semaine en cours compte si elle en a déjà une, sinon on part de la précédente).
  function serie(sorties, nowTs) {
    const l = lundi(nowTs), a = (deb) => sorties.some((s) => estCourse(s) && s.ts >= deb && s.ts < deb + SEM);
    let deb = a(l) ? l : l - SEM, n = 0;
    while (n < 520 && a(deb)) { n++; deb -= SEM; }
    return n;
  }

  /* ---------- Ton repère : allure facile à effort égal ---------- */
  function repere(sorties, nowTs, reg, ilYaJours) {
    const r = reg || REGLAGES;
    const faciles = sorties.filter((s) => estCourse(s) && (s.type === "EF" || s.type === "Long"));
    const avecCoeur = faciles.filter((s) => coeurMoyenOk(s, r));   // 29/10 : cœur moyen juste suffit (Garmin)
    const fcRef = med(avecCoeur.filter((s) => s.ts >= nowTs - r.repereFcRefJours * JOUR).map((s) => s.fc));
    const modeCoeur = !!fcRef && avecCoeur.filter((s) => s.ts >= nowTs - r.repereFenetreJours * JOUR).length >= r.repereMinSorties;
    const val = (s) => modeCoeur ? s.allure * s.fc / fcRef : s.allure;
    const base = modeCoeur ? avecCoeur : faciles;
    const fen = (fin) => base.filter((s) => s.ts <= fin && s.ts > fin - r.repereFenetreJours * JOUR);
    const maintenant = fen(nowTs), avant = fen(nowTs - (ilYaJours || r.repereIlYaJours) * JOUR);
    if (maintenant.length < r.repereMinSorties) return { etat: "bientot", manque: r.repereMinSorties - maintenant.length, modeCoeur };
    const v = med(maintenant.map(val)), vAvant = avant.length >= r.repereMinSorties ? med(avant.map(val)) : null;
    const ecart = vAvant != null ? Math.round(vAvant - v) : null;   // > 0 : plus rapide qu'il y a 3 mois
    return { etat: "valeur", valeur: Math.round(v), ecart, modeCoeur, fcRef: fcRef ? Math.round(fcRef) : null, n: maintenant.length,
      points: base.filter((s) => s.ts > nowTs - 400 * JOUR).map((s) => ({ ts: s.ts, v: val(s) })) };
  }
  // Courbe du repère : un point par semaine = médiane des sorties faciles des 4 semaines précédentes (au moins 2).
  function repereCourbe(sorties, nowTs, mois, reg) {
    const r = reg || REGLAGES, rp = repere(sorties, nowTs, r, mois * MOIS_J);   // comparé au début de la période choisie
    if (rp.etat !== "valeur") return { rp, points: [] };
    const debut = nowTs - mois * MOIS_J * JOUR, pts = [];
    for (let fin = nowTs; fin >= debut; fin -= SEM) {
      const fen = rp.points.filter((p) => p.ts <= fin && p.ts > fin - r.repereFenetreJours * JOUR);
      if (fen.length >= 2) pts.unshift({ ts: fin, v: med(fen.map((p) => p.v)) });
    }
    return { rp, points: pts };
  }

  /* ---------- Tes allures par effort : EF (cœur en zone 2), Tempo (zone 3), Seuil (zone 4) ---------- */
  function allureParEffort(s, z, defs, reg) {
    const r = reg || REGLAGES;
    if (!defs || !coeurFiable(s, r)) return null;
    const pts = pointsAllure(s, z, r);
    if (!pts) return null;
    const zc = (hr) => { for (let i = 0; i < defs.length; i++) if (hr <= defs[i].max) return i; return defs.length - 1; };
    const blocs = [];
    pts.forEach((x) => {
      if (x.hr == null) return;
      const k = zc(x.hr), b = blocs[blocs.length - 1];
      if (b && b.k === k && x.t - b.fin <= 30) { b.pts.push(x); b.fin = x.t; } else blocs.push({ k, debut: x.t, fin: x.t, pts: [x] });
    });
    const o = [0, 1, 2, 3, 4].map(() => ({ sec: 0, m: 0 }));
    blocs.forEach((b) => {
      if (b.fin - b.debut < r.effortBlocMinSec) return;
      b.pts.forEach((x) => { if (x.t - b.debut >= r.effortRetardSec) { o[b.k].sec += x.dt; o[b.k].m += x.m; } });
    });
    return o.map((a) => ({ sec: a.sec, allure: a.m > 0 ? a.sec / (a.m / 1000) : null }));
  }
  // Tes allures par effort : EF, Tempo, Seuil (allure tenue cœur en zone 2, 3, 4) et Fractionné (allure de travail des blocs
  // d'effort de tes fractionnés, calcul de l'app : saisie à la main, sinon blocs de la montre, sinon blocs repérés à l'allure).
  // `ilYaMois` : la comparaison se fait avec la même fenêtre il y a 3, 6 ou 12 mois (la période choisie).
  function alluresParEffort(sorties, nowTs, mois, z, defs, reg, ilYaMois) {
    const r = reg || REGLAGES, ilYa = (ilYaMois || 3) * MOIS_J * JOUR;
    const efforts = [{ cle: "ef", k: 1, nom: "Facile", zone: "zone 2" }, { cle: "tempo", k: 2, nom: "Tempo", zone: "zone 3" }, { cle: "seuil", k: 3, nom: "Seuil", zone: "zone 4" }];
    const recents = sorties.filter((s) => estCourse(s) && s.ts > nowTs - 400 * JOUR);
    const parSortie = defs ? recents.map((s) => ({ ts: s.ts, a: allureParEffort(s, z, defs, r) })).filter((x) => x.a) : [];
    const resume = (tous, min) => {
      const fen = (fin) => tous.filter((p) => p.ts <= fin && p.ts > fin - r.effortFenetreJours * JOUR).map((p) => p.v);
      const now = fen(nowTs), avant = fen(nowTs - ilYa);
      const maintenant = now.length >= min ? med(now) : null, vAvant = avant.length >= min ? med(avant) : null;
      return { points: tous.filter((p) => p.ts >= nowTs - mois * MOIS_J * JOUR), maintenant: maintenant != null ? Math.round(maintenant) : null,
        avant: vAvant != null ? Math.round(vAvant) : null,   // la même fenêtre il y a 3 mois (ou la période choisie) : « 7'04 → 7'12 »
        ecart: maintenant != null && vAvant != null ? Math.round(vAvant) - Math.round(maintenant) : null, n: now.length };   // écart des valeurs affichées
    };
    const liste = efforts.map((e) => ({ ...e, detail: defs ? `cœur en ${e.zone} · ${defs[e.k - 1].max + 1} à ${defs[e.k].max} bpm` : `cœur en ${e.zone}`,
      ...resume(parSortie.filter((x) => x.a[e.k].sec >= r.effortMinSec[e.k]).map((x) => ({ ts: x.ts, v: x.a[e.k].allure })), r.effortMinSorties) }));
    // 29/10 : sans allure détaillée (Garmin : une mesure toutes les ~10 min), l'allure des blocs serait fausse : pas de mesure.
    const frac = recents.filter((s) => s.type === "Fractionné" && (s.fracWorkManual || allureDetaillee(s, r))).map((s) => {
      const ip = getIntervalPaces({ paceSeries: s.pace, lapMarkers: s.lapMarkers, fracWorkManual: s.fracWorkManual, fracRecoveryManual: s.fracRecoveryManual });
      return ip && ip.work && (ip.manual || ip.workCount >= 2) ? { ts: s.ts, v: ip.work } : null;
    }).filter(Boolean);
    liste.push({ cle: "frac", k: 4, nom: "Fractionné", zone: "blocs d'effort", detail: "allure de travail de tes fractionnés", ...resume(frac, r.fracMinSorties) });
    return liste;
  }
  // Ta régularité : nombre de courses de chacune des `semaines` dernières semaines (du lundi au dimanche).
  function sortiesParSemaine(sorties, nowTs, semaines) {
    const l = lundi(nowTs), out = [];
    for (let i = semaines - 1; i >= 0; i--) { const deb = l - i * SEM; out.push({ debut: deb, n: sorties.filter((s) => estCourse(s) && s.ts >= deb && s.ts < deb + SEM).length }); }
    return out;
  }

  /* ---------- Accueil (27/10) : types de sorties, ton mois, tes semaines en couleurs ---------- */
  // Nombre de sorties par type sur les `jours` derniers jours (« Seuil » de l'app départagé en Tempo / Seuil).
  function typesSur(sorties, nowTs, jours, z, reg) {
    const out = {};
    sorties.filter((s) => estCourse(s) && s.ts > nowTs - jours * JOUR && s.ts <= nowTs).forEach((s) => {
      const lib = libelleType(s, s.type === "Seuil" ? decoupage(s, z, reg) : null); out[lib] = (out[lib] || 0) + 1;
    });
    return out;
  }
  // Ton mois : volume face au mois dernier, temps en zones cardio 1 à 5 et une phrase.
  function mois(sorties, nowTs, fmax, frepos, reg) {
    const r = reg || REGLAGES, d = new Date(nowTs);
    const bornes = (k) => [new Date(d.getFullYear(), d.getMonth() + k, 1).getTime(), new Date(d.getFullYear(), d.getMonth() + k + 1, 1).getTime()];
    const bilan = ([de, a]) => { const c = sorties.filter((s) => estCourse(s) && s.ts >= de && s.ts < a && s.ts <= nowTs); return { n: c.length, km: c.reduce((x, s) => x + s.dist, 0), sec: c.reduce((x, s) => x + s.dur, 0), sorties: c }; };
    const ce = bilan(bornes(0)), avant = bilan(bornes(-1));
    const secs = [0, 0, 0, 0, 0]; let nCoeur = 0;
    if (fmax) ce.sorties.filter((s) => coeurFiable(s, r)).forEach((s) => { computeHrZoneSeconds(s.hr, fmax, frepos).secs.forEach((v, i) => { secs[i] += v; }); nCoeur++; });
    const tot = secs.reduce((a, v) => a + v, 0), pctFacile = tot > 0 ? Math.round((secs[0] + secs[1]) / tot * 100) : null;
    const phrase = !ce.n ? "Pas encore de sortie ce mois-ci : une sortie facile pour le lancer."
      : pctFacile == null ? "Ajoute des sorties avec ta montre au poignet pour voir la répartition de ton effort."
      : pctFacile >= r.moisFacileBienPct ? `${pctFacile} % de ton temps en zones 1 et 2 : surtout du facile, c'est la base qui fait progresser.`
      : pctFacile >= r.moisFacileMinPct ? `${pctFacile} % de ton temps en zones 1 et 2 : un bon mélange de facile et de soutenu.`
      : `${pctFacile} % de ton temps en zones 1 et 2 : beaucoup d'intensité, garde au moins 3 sorties sur 4 en facile.`;
    return { ce, avant, secs, nCoeur, pctFacile, phrase, debut: bornes(0)[0], defs: fmax ? hrZoneDefs(fmax, frepos) : null };
  }
  // Tes semaines en couleurs : pour chacune des `semaines` dernières semaines, les km de chaque type de sortie.
  function semainesParType(sorties, nowTs, semaines, z, reg) {
    const l = lundi(nowTs), out = [];
    for (let i = semaines - 1; i >= 0; i--) {
      const deb = l - i * SEM, parType = {};
      sorties.filter((s) => estCourse(s) && s.ts >= deb && s.ts < deb + SEM).forEach((s) => {
        const lib = libelleType(s, s.type === "Seuil" ? decoupage(s, z, reg) : null); parType[lib] = (parType[lib] || 0) + s.dist;
      });
      out.push({ debut: deb, parType, km: Object.values(parType).reduce((a, v) => a + v, 0) });
    }
    return out;
  }

  /* ---------- Cœur sur la période ---------- */
  function zonesCardioPeriode(sorties, nowTs, mois, fmax, frepos, reg) {
    const secs = [0, 0, 0, 0, 0]; let n = 0;
    if (!fmax) return { secs, n, defs: null };
    sorties.filter((s) => estCourse(s) && s.ts >= nowTs - mois * MOIS_J * JOUR && coeurFiable(s, reg)).forEach((s) => {
      const res = computeHrZoneSeconds(s.hr, fmax, frepos); res.secs.forEach((v, i) => { secs[i] += v; }); n++;
    });
    return { secs, n, defs: hrZoneDefs(fmax, frepos) };
  }
  // Un indicateur sur les sorties faciles (dérive, cadence, cœur moyen) dans le temps : points sur la période, médiane des
  // 8 dernières semaines et des mêmes 8 semaines il y a 3 mois (règles de l'app, C2).
  function indicateurDansLeTemps(sorties, nowTs, mois, valeur) {
    const faciles = sorties.filter((s) => estCourse(s) && (s.type === "EF" || s.type === "Long"));
    const pts = faciles.map((s) => ({ ts: s.ts, v: valeur(s), id: s.id })).filter((p) => p.v != null);
    const fen = (fin) => pts.filter((p) => p.ts <= fin && p.ts > fin - 56 * JOUR).map((p) => p.v);
    const now = fen(nowTs), avant = fen(nowTs - 91 * JOUR);
    return { points: pts.filter((p) => p.ts >= nowTs - mois * MOIS_J * JOUR), maintenant: now.length >= 3 ? med(now) : null, nMaintenant: now.length, avant: avant.length >= 3 ? med(avant) : null };
  }
  const derive = (s) => { const d = cardiacDrift({ hrSeries: s.hr, paceSeries: s.pace, durationSec: s.dur, type: s.type }); return d ? d.pct : null; };
  const cadence = (s) => cadenceShown(s.cad, s.type);
  const coeurMoyen = (s) => (coeurMoyenOk(s) ? s.fc : null);

  /* ---------- Courses : volume, régularité, records ---------- */
  function volumeParMois(sorties, nowTs, mois) {
    const d = new Date(nowTs), out = [];
    for (let i = mois - 1; i >= 0; i--) {
      const deb = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime(), fin = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
      const c = sorties.filter((s) => estCourse(s) && s.ts >= deb && s.ts < fin);
      out.push({ debut: deb, km: c.reduce((a, s) => a + s.dist, 0), n: c.length });
    }
    return out;
  }
  function regularite(sorties, nowTs, semaines) {
    const l = lundi(nowTs), out = [];
    for (let i = semaines - 1; i >= 0; i--) { const deb = l - i * SEM; out.push(sorties.some((s) => estCourse(s) && s.ts >= deb && s.ts < deb + SEM)); }
    return { semaines: out, avec: out.filter(Boolean).length };
  }
  // V2 : records 5, 10, 15 km, semi, marathon et distance max ; un record pas encore fait dit combien il manque (« encore 3 km »,
  // écart avec ta sortie la plus longue). Temps ramené à la distance exacte (règle de l'app, distanceRecordTime).
  const DISTANCES_V2 = [{ key: "5k", km: 5, label: "5 km" }, { key: "10k", km: 10, label: "10 km" }, { key: "15k", km: 15, label: "15 km" },
    { key: "semi", km: 21.0975, label: "Semi" }, { key: "marathon", km: 42.195, label: "Marathon" }];
  const enRecord = (s) => ({ id: s.id, ts: s.ts, type: s.type, distKm: s.dist, durationSec: s.dur });
  function meilleurTemps(courses, d) {
    let best = null;
    courses.slice().sort((a, b) => a.ts - b.ts).forEach((s) => { const t = distanceRecordTime(enRecord(s), d); if (t != null && (!best || t < best.t)) best = { t, id: s.id, ts: s.ts }; });
    return best;
  }
  function records(sorties) {
    const courses = sorties.filter(estCourse);
    const longue = courses.reduce((m, s) => (!m || s.dist > m.dist ? s : m), null);
    const liste = DISTANCES_V2.map((d) => { const b = meilleurTemps(courses, d);
      return { cle: d.key, label: d.label, valeur: b ? fmtDur(b.t) : null, id: b ? b.id : null, ts: b ? b.ts : null,
        manque: !b ? Math.max(1, Math.ceil(d.km - (longue ? longue.dist : 0))) : null }; });
    liste.push({ cle: "longue", label: "Max", valeur: longue ? `${kmTxt(longue.dist * 1000)} km` : null, id: longue ? longue.id : null, ts: longue ? longue.ts : null });
    return liste;
  }
  // Les records de distance battus par une sortie (face aux records d'avant elle), le plus long d'abord. Sert au plein écran.
  function recordsBattus(s, sorties) {
    if (!estCourse(s)) return [];
    const avant = sorties.filter((h) => estCourse(h) && h.ts < s.ts);
    return DISTANCES_V2.slice().reverse().map((d) => {
      const t = distanceRecordTime(enRecord(s), d), b = meilleurTemps(avant, d);
      return t != null && b && t < b.t ? { cle: d.key, label: d.label, temps: t, ancien: b.t, ancienTs: b.ts } : null;
    }).filter(Boolean);
  }
  /* ================= V2 « progression » (maquettes Claude Design du 27/10) ================= */
  // Ressenti : ce que veut dire un cran (« Soutenu · Je parlais par phrases courtes. »).
  function ressentiCran(v, reg) { const r = reg || REGLAGES; return v == null ? null : r.ressentiEchelle.find((e) => v >= e.de && v <= e.a) || null; }
  // Quelle tuile de « Ton niveau » une sortie fait bouger.
  const EFFORT_DE = { "Sortie facile": "ef", Longue: "ef", Tempo: "tempo", Seuil: "seuil", "Fractionné": "frac" };

  // Frise V2 : 3 couleurs, 3 morceaux au plus. Une sortie facile ou longue reste d'un seul bloc (aucun km rapide signalé).
  function frise3(s, z, reg) {
    const dec = decoupage(s, z, reg);
    if (!dec) return null;
    const lib = libelleType(s, dec), tot = s.dist * 1000;
    if (lib === "Sortie facile" || lib === "Longue") return { morceaux: [{ cat: "facile", m: tot, mot: lib === "Longue" ? "en sortie longue" : "facile" }], suite: "Exactement ce qu'on attend d'une sortie d'endurance.", dec };
    const segs = dec.segments, iS = segs.findIndex((c) => c.cat === "soutenu");
    if (iS < 0) return { morceaux: [{ cat: "facile", m: tot, mot: "facile" }], suite: "Pas de passage soutenu dans cette sortie.", dec };
    let jS = iS; segs.forEach((c, i) => { if (c.cat === "soutenu") jS = i; });
    const somme = (a) => a.reduce((x, c) => x + c.m, 0);
    const avant = somme(segs.slice(0, iS)), milieu = somme(segs.slice(iS, jS + 1)), apres = somme(segs.slice(jS + 1));
    const m = [];
    if (avant >= 100) m.push({ cat: "calme", m: avant, mot: "d'échauffement" });
    m.push({ cat: "soutenu", m: milieu, mot: "en soutenu" });
    if (apres >= 100) m.push({ cat: "calme", m: apres, mot: "de retour au calme" });
    return { morceaux: m, suite: null, dec };
  }

  // Temps en zones cardio 1 à 5 d'une sortie (cœur fiable seulement).
  function zonesSortie(s, fmax, frepos, reg) {
    if (!fmax || !s.hr || !coeurFiable(s, reg)) return null;
    const { secs, defs } = computeHrZoneSeconds(s.hr, fmax, frepos);
    const tot = secs.reduce((a, v) => a + v, 0);
    return tot > 0 ? { secs, defs, tot } : null;
  }
  // Arrondis qui tombent juste (29/10, révision Claude Design 16c : « 13 % annoncé, 12 % affiché ») : on arrondit chaque part
  // au plus fort reste, pour que la somme des chiffres affichés fasse exactement `total` (100 %, ou la durée en minutes).
  function repartir(vals, total) {
    const s = vals.reduce((a, v) => a + (v > 0 ? v : 0), 0);
    if (!(s > 0)) return vals.map(() => 0);
    const brut = vals.map((v) => (v > 0 ? v : 0) / s * total), ent = brut.map(Math.floor);
    let reste = total - ent.reduce((a, v) => a + v, 0);
    brut.map((v, i) => [v - ent[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (reste > 0) { ent[i]++; reste--; } });
    return ent;
  }
  // Les 5 zones d'un temps en secondes : % et minutes arrondis juste, part en zones 1-2.
  function partsZones(secs) {
    const tot = secs.reduce((a, v) => a + v, 0), pcts = repartir(secs, 100), mins = repartir(secs, Math.round(tot / 60));
    return { pcts, mins, facilePct: pcts[0] + pcts[1], soutenuPct: pcts[2] + pcts[3] + pcts[4] };
  }
  // Verdict de répartition face à l'idéal du type de sortie (bilan, détail). ton : bon, presque, attention.
  // Les chiffres sont ceux affichés (partsZones) : « 7 min au-dessus » = la somme des minutes des zones 3 à 5 qu'on voit.
  // `tete` : le chiffre en tête du bloc (16c), `mot` : la pastille, `conseil` : l'encadré seul.
  function verdictRepartition(lib, zs, reg) {
    const r = reg || REGLAGES, id = r.idealZones[lib];
    if (!id || !zs) return null;
    const pz = partsZones(zs.secs), facile = pz.facilePct, z2max = zs.defs[1].max;
    const MOT = { bon: "bien", presque: "presque", attention: "trop soutenu" };
    const avec = (v, tete) => ({ ...v, mot: MOT[v.ton], tete, pz });
    if (lib === "Sortie facile" || lib === "Longue") {
      const mn = pz.mins[2] + pz.mins[3] + pz.mins[4], tete = { pct: facile, txt: "en zones 1-2" };
      if (mn < 1) return avec({ ton: "bon", titre: "Parfait : tout en zones 1-2.", phrase: "Exactement ce qu'on attend d'une sortie facile.", court: "Parfait : toute la sortie en zones 1-2.", conseil: "Toute la sortie en zones 1-2 : exactement ce qu'on attend d'une sortie facile." }, tete);
      const txt = `${mn} min (${100 - facile} %) au-dessus de la zone 2. Ralentis dès ${z2max} bpm.`, cs = `${mn} min au-dessus de la zone 2. Ralentis dès ${z2max} bpm.`;
      return avec(mn < r.idealPresqueMin ? { ton: "presque", titre: `Presque : ${facile} % en facile.`, phrase: txt, court: `Presque : ${cs}`, conseil: cs }
        : { ton: "attention", titre: `Trop haut pour une sortie facile : ${facile} % en facile.`, phrase: txt, court: `Trop haut : ${cs}`, conseil: cs }, tete);
    }
    const cible = id.cible.reduce((a, i) => a + pz.pcts[i], 0), nomZ = id.cible.length > 1 ? `zones ${id.cible[0] + 1}-${id.cible[id.cible.length - 1] + 1}` : `zone ${id.cible[0] + 1}`;
    const pour = lib === "Fractionné" ? "un fractionné" : lib === "Tempo" ? "un tempo" : "un seuil", tete = { pct: cible, txt: `en ${nomZ}` };
    if (cible >= id.ciblePct && facile >= 25) return avec({ ton: "bon", titre: `Bonne répartition pour ${pour}.`, phrase: `${cible} % en ${nomZ}, le reste surtout en facile : échauffement et retour au calme bien faits.`, court: `Bien construit : échauffement et retour au calme en facile, bloc en ${nomZ}.`, conseil: `Bien construit : échauffement et retour au calme en facile, bloc en ${nomZ}.` }, tete);
    if (cible < id.ciblePct) return avec({ ton: "presque", titre: `Bloc un peu court pour ${pour}.`, phrase: `${cible} % en ${nomZ} : vise ${id.ciblePct} % ou plus.`, court: `Bloc un peu court : ${cible} % en ${nomZ}, vise ${id.ciblePct} %.`, conseil: `Bloc un peu court : vise ${id.ciblePct} % ou plus en ${nomZ}.` }, tete);
    return avec({ ton: "attention", titre: "Peu de facile autour du bloc.", phrase: "Prends 10 min d'échauffement et de retour au calme en facile.", court: "Peu de facile autour du bloc : 10 min d'échauffement et de retour au calme.", conseil: "Prends 10 min d'échauffement et de retour au calme en facile." }, tete);
  }
  // Part du temps en zones 1-2 et 3-5 sur une fenêtre de jours (courses au cœur fiable), sortie `exclureId` mise de côté.
  function partZones(sorties, finTs, jours, fmax, frepos, reg, exclureId) {
    if (!fmax) return null;
    const secs = [0, 0, 0, 0, 0]; let n = 0;
    sorties.filter((s) => estCourse(s) && s.id !== exclureId && s.ts <= finTs && s.ts > finTs - jours * JOUR && coeurFiable(s, reg)).forEach((s) => {
      computeHrZoneSeconds(s.hr, fmax, frepos).secs.forEach((v, i) => { secs[i] += v; }); n++;
    });
    const tot = secs.reduce((a, v) => a + v, 0);
    return tot > 0 ? { secs, tot, n, facilePct: (secs[0] + secs[1]) / tot * 100, soutenuPct: (secs[2] + secs[3] + secs[4]) / tot * 100 } : null;
  }
  // 1er km et allure moyenne d'une sortie (règle C7 « pars plus lentement »).
  function premierKm(s) {
    if (s.type === "Fractionné" || !s.pace) return null;
    const ks = kmSplits({ paceSeries: s.pace, distanceKm: s.dist, durationSec: s.dur, type: "EF" });
    return ks ? { premier: ks.kms[0], moyenne: ks.avg } : null;
  }
  // Allure moyenne dans chaque zone cardio d'une sortie (retour d'Omar du 29/10 : « l'allure moyenne par zone, celles du dessus ») :
  // pour chaque zone 1 à 5, l'allure tenue pendant que ton cœur y était (cœur décalé de 45 s, comme pour le bilan). Il faut au
  // moins 1 min dans la zone ; sinon null.
  function allureZonesCardio(s, z, defs, reg) {
    const r = reg || REGLAGES, pts = defs ? pointsAllure(s, z, r) : null;
    if (!pts) return null;
    const zc = (hr) => { for (let i = 0; i < defs.length; i++) if (hr <= defs[i].max) return i; return defs.length - 1; };
    const o = [0, 1, 2, 3, 4].map(() => ({ sec: 0, m: 0 }));
    pts.forEach((x) => { if (x.hr != null) { const a = o[zc(x.hr)]; a.sec += x.dt; a.m += x.m; } });
    return o.map((a) => (a.sec >= r.coeurMinSec && a.m > 0 ? Math.round(a.sec / (a.m / 1000)) : null));
  }
  // Allure par km et cœur moyen de chaque km (29/10). Même principe que kmSplits de l'app, mais les arrêts (trou nettement plus
  // long que l'écart habituel entre deux mesures, voir trouMax) ne comptent pas comme du temps de course : la moyenne des km
  // retombe sur l'allure de la sortie. Les km se coupent sur la distance recalée sur celle de la sortie ; le cœur est mesuré entre
  // deux passages au km. Renvoie { kms, partial, avg, fastest, slowest, coeur } (forme de kmSplits) ou null.
  function kmParKm(s, reg) {
    const r = reg || REGLAGES, minKm = typeof KM_SPLIT_MIN_KM !== "undefined" ? KM_SPLIT_MIN_KM : 3;
    if (!s.pace || !(s.dist >= minKm) || !(s.dur > 0)) return null;
    const pc = s.pace.filter((p) => p && p.pace > 0 && p.t >= 0).sort((a, b) => a.t - b.t);
    if (pc.length / s.dur * 60 < 1) return null;
    const cap = trouMax(pc, r), parts = []; let prev = 0;
    pc.forEach((p) => { const dt = p.t - prev; prev = p.t; if (dt > 0 && dt <= cap) parts.push({ t: p.t, dt, d: dt * 1000 / p.pace }); });
    const brut = parts.reduce((a, x) => a + x.d, 0);
    if (!(brut > 0)) return null;
    const ech = s.dist * 1000 / brut;
    if (ech < 0.8 || ech > 1.25) return null;
    const total = s.dist * 1000, pleins = Math.floor(total / 1000 + 1e-9), kms = [], bornes = [parts[0].t - parts[0].dt];
    let d = 0, t = 0, tPassage = 0;
    parts.forEach((x) => {
      const dd = x.d * ech;
      while (kms.length < pleins && d + dd >= 1000 * (kms.length + 1) - 1e-6) {
        const f = (1000 * (kms.length + 1) - d) / dd, tc = t + x.dt * f;
        kms.push(Math.round(tc - tPassage)); tPassage = tc; bornes.push(x.t - x.dt + x.dt * f);
      }
      d += dd; t += x.dt;
    });
    if (kms.length < 2) return null;
    const reste = total - kms.length * 1000;
    const partial = reste >= 100 && t - tPassage > 0 ? { km: Math.round(reste / 10) / 100, pace: Math.round((t - tPassage) / (reste / 1000)) } : null;
    const hr = (s.hr || []).filter((p) => p && p.hr > 0).sort((a, b) => a.t - b.t);
    const moy = (a, b) => { const l = hr.filter((p) => p.t >= a && p.t < b).map((p) => p.hr); return l.length ? Math.round(l.reduce((x, v) => x + v, 0) / l.length) : null; };
    const coeur = hr.length ? kms.map((_, i) => moy(bornes[i], bornes[i + 1])).concat(partial ? [moy(bornes[bornes.length - 1], parts[parts.length - 1].t + 1)] : []) : null;
    return { kms, partial, avg: Math.round(t / s.dist), fastest: kms.indexOf(Math.min(...kms)), slowest: kms.indexOf(Math.max(...kms)), coeur };
  }
  const kmCoeur = (s) => { const k = kmParKm(s); return k ? k.coeur : null; };
  // Allure moyenne dans chaque zone cardio sur une période (Progression › Cœur, 29/10) : toutes tes courses au cœur fiable.
  function allureZonesCardioPeriode(sorties, nowTs, mois, z, defs, reg) {
    const r = reg || REGLAGES;
    if (!defs) return null;
    const zc = (hr) => { for (let i = 0; i < defs.length; i++) if (hr <= defs[i].max) return i; return defs.length - 1; };
    const o = [0, 1, 2, 3, 4].map(() => ({ sec: 0, m: 0 }));
    sorties.filter((s) => estCourse(s) && s.ts <= nowTs && s.ts >= nowTs - mois * MOIS_J * JOUR && coeurFiable(s, r)).forEach((s) => {
      const pts = pointsAllure(s, z, r);
      if (pts) pts.forEach((x) => { if (x.hr != null) { const a = o[zc(x.hr)]; a.sec += x.dt; a.m += x.m; } });
    });
    return o.map((a) => (a.sec >= r.coeurMinSec && a.m > 0 ? Math.round(a.sec / (a.m / 1000)) : null));
  }
  // Ton allure par zone (Progression › Allure) : allure tenue dans chaque zone cardio, mois par mois (médiane des sorties du mois).
  function allureParZoneMois(sorties, nowTs, mois, z, defs, reg) {
    const r = reg || REGLAGES, d = new Date(nowTs), out = [0, 1, 2, 3, 4].map(() => []);
    if (!defs) return out;
    const min = [180, r.effortMinSec[1], r.effortMinSec[2], r.effortMinSec[3], 60];
    for (let i = mois - 1; i >= 0; i--) {
      const deb = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime(), fin = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
      const parZone = [0, 1, 2, 3, 4].map(() => []);
      sorties.filter((s) => estCourse(s) && s.ts >= deb && s.ts < fin && s.ts <= nowTs).forEach((s) => {
        const a = allureParEffort(s, z, defs, r);
        if (a) a.forEach((x, k) => { if (x.allure && x.sec >= min[k]) parZone[k].push(x.allure); });
      });
      parZone.forEach((l, k) => { if (l.length) out[k].push({ ts: deb, mois: new Date(deb).getMonth(), v: med(l), n: l.length }); });
    }
    return out;
  }
  // Allure × régularité : ton allure facile les semaines à 2 sorties ou plus, face aux semaines à 1 sortie (12 dernières semaines).
  function allureRegularite(sorties, nowTs, reg) {
    const r = reg || REGLAGES, l = lundi(nowTs), deux = [], une = [];
    for (let i = 0; i < r.croisementSemaines; i++) {
      const deb = l - i * SEM, c = sorties.filter((s) => estCourse(s) && s.ts >= deb && s.ts < deb + SEM && s.ts <= nowTs);
      const fac = c.filter((s) => s.type === "EF").map((s) => s.allure);
      if (fac.length) (c.length >= 2 ? deux : une).push(med(fac));
    }
    const a2 = deux.length ? med(deux) : null, a1 = une.length ? med(une) : null;
    return { deux: a2, une: a1, n2: deux.length, n1: une.length, gain: a2 != null && a1 != null ? Math.round(a1 - a2) : null };
  }
  // Allure × ressenti : sur tes sorties faciles notées, le 1er mois de la période face au dernier (ressenti moyen, allure).
  function allureRessenti(sorties, ressentis, nowTs, mois, reg) {
    const r = reg || REGLAGES, debut = nowTs - mois * MOIS_J * JOUR;
    const notees = sorties.filter((s) => estCourse(s) && s.type === "EF" && s.ts >= debut && s.ts <= nowTs && ressentiDe(s, ressentis) != null);
    if (notees.length < r.ressentisMin) return { n: notees.length, manque: r.ressentisMin - notees.length };
    const cle = (ts) => { const x = new Date(ts); return x.getFullYear() * 12 + x.getMonth(); };
    const parMois = {}; notees.forEach((s) => { (parMois[cle(s.ts)] = parMois[cle(s.ts)] || []).push(s); });
    const k = Object.keys(parMois).map(Number).sort((a, b) => a - b);
    if (k.length < 2) return { n: notees.length, manque: 0, unMois: true };
    const bilan = (l, kk) => ({ mois: kk % 12, ressenti: moyenne(l.map((s) => ressentiDe(s, ressentis))), allure: med(l.map((s) => s.allure)), n: l.length });
    return { n: notees.length, manque: 0, debut: bilan(parMois[k[0]], k[0]), fin: bilan(parMois[k[k.length - 1]], k[k.length - 1]) };
  }
  // Tes sorties faciles : les 6 dernières au cœur fiable et leur part du temps en zones 1-2 (vraiment facile : 80 % ou plus).
  function sortiesFacilesZones(sorties, nowTs, fmax, frepos, reg, n) {
    const r = reg || REGLAGES;
    if (!fmax) return [];
    return sorties.filter((s) => estCourse(s) && s.type === "EF" && s.ts <= nowTs && coeurFiable(s, r)).slice(-(n || 6)).reverse().map((s) => {
      const zs = zonesSortie(s, fmax, frepos, r);
      if (!zs) return null;
      const pct = (zs.secs[0] + zs.secs[1]) / zs.tot * 100;
      return { id: s.id, ts: s.ts, pct, vraiment: pct >= r.repereFacilePct };
    }).filter(Boolean);
  }
  // Courbes V2 : tendance lissée sur 4 semaines glissantes, un point par semaine sur la période. Médiane, comme les valeurs
  // affichées (« tes 4 dernières semaines ») : le bout de la courbe donne le même chiffre que la valeur en grand.
  function lisser(points, debutTs, finTs, jours) {
    const fen = (jours || 28) * JOUR, pts = points.slice().sort((a, b) => a.ts - b.ts), out = [];
    for (let t = finTs; t >= debutTs; t -= SEM) {
      const f = pts.filter((p) => p.ts <= t && p.ts > t - fen);
      if (f.length) out.unshift({ ts: t, v: med(f.map((p) => p.v)) });
    }
    return out;
  }
  // Courbes 11a (révision Claude Design du 29/10) : les points d'une courbe sur `mois` mois.
  // pas "mois" : un point par mois (médiane des mesures du mois) ; le mois en cours = tes 4 dernières semaines, le même chiffre
  // que la valeur en grand. pas "semaine" (1 à 3 mois : un point par mois n'en donnerait qu'un à trois) : un point par semaine,
  // médiane des 4 semaines qui précèdent. Un trou (v null) = rien de mesuré : tronçon en pointillé. La courbe démarre à la
  // première mesure. `fin` (facultatif) remplace la valeur du dernier point (la valeur en grand, null s'il n'y en a pas).
  function serieCourbe(points, nowTs, mois, pas, o) {
    const opt = o || {}, pts = points.filter((p) => p && p.v != null && !Number.isNaN(p.v) && p.ts <= nowTs), fen = 28 * JOUR;
    const medFen = (de, a) => { const l = pts.filter((p) => p.ts > de && p.ts <= a).map((p) => p.v); return l.length >= (opt.min || 1) ? med(l) : null; };
    const out = [];
    if (pas === "mois") {
      const d = new Date(nowTs);
      for (let i = mois - 1; i >= 0; i--) {
        const deb = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime(), fin = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
        out.push({ ts: i ? deb : nowTs, mois: new Date(deb).getMonth(), v: i ? medFen(deb - 1, fin - 1) : medFen(nowTs - fen, nowTs) });
      }
    } else {
      for (let k = Math.floor(mois * MOIS_J / 7); k >= 0; k--) { const t = nowTs - k * SEM; out.push({ ts: t, mois: new Date(t).getMonth(), v: medFen(t - fen, t) }); }
    }
    if ("fin" in opt) out[out.length - 1] = { ...out[out.length - 1], v: opt.fin };
    const i0 = out.findIndex((p) => p.v != null);
    return i0 < 0 ? [] : out.slice(i0);
  }
  // Ton niveau (Accueil, 13a du 29/10) : pour chaque effort, l'allure des 4 dernières semaines (celle de niveauActuel), toutes
  // les mesures de l'année (la courbe : un point par semaine), la première et la dernière, et ce qui manque pour une valeur.
  function niveauCourbes(sorties, nowTs, z, defs, reg) {
    const r = reg || REGLAGES, liste = niveauActuel(sorties, nowTs, z, defs, r), rp = repere(sorties, nowTs, r);
    const tous = alluresParEffort(sorties, nowTs, 13, z, defs, r, 3);
    return liste.map((e) => {
      const brut = e.cle === "ef" ? (rp.points || []) : tous.find((x) => x.cle === e.cle).points;
      const pts = brut.filter((p) => p.ts <= nowTs && p.v != null).sort((a, b) => a.ts - b.ts);
      const n4 = pts.filter((p) => p.ts > nowTs - r.effortFenetreJours * JOUR).length;
      const min = e.cle === "ef" ? r.repereMinSorties : e.cle === "frac" ? r.fracMinSorties : r.effortMinSorties;
      return { ...e, points: pts, premiere: pts[0] || null, derniere: pts[pts.length - 1] || null, n4,
        min: e.cle === "ef" ? 2 : e.cle === "frac" ? r.fracMinSorties : r.effortMinSorties,   // par point de courbe (comme repereCourbe et l'« il y a 3 mois »)
        manque: e.maintenant != null ? 0 : e.cle === "ef" && rp.etat === "bientot" ? rp.manque : Math.max(min - n4, 0) };
    });
  }
  // Un effort sur 1, 2 ou 3 mois (4, 8 ou 13 semaines) : retour d'Omar du 29/10 (« le grand chiffre, la moyenne du dernier
  // mois, qui s'actualise si je clique sur 2 mois ; l'allure actuelle est déjà en bout de courbe »).
  // valeur : la valeur du milieu de tes séances de la période (médiane, comme partout : une sortie ratée ne fausse rien ; sur
  // 1 mois, c'est pile le bout de la courbe). n : séances de la période (une séance du 12 sept. compte sur 2 mois, même sans
  // rien depuis). serie : un point par semaine, le dernier = tes 4 dernières semaines quand il y en a. ecart (> 0 : plus vite) :
  // du 1er au dernier point ; tronquee : pas de point tout au début (« depuis le 5 août ») ; nouveau : 1re séance dans la période.
  function niveauSerie(e, nowTs, mois) {
    const k = Math.floor(mois * MOIS_J / 7), debut = nowTs - k * SEM;
    const dans = e.points.filter((p) => p.ts > debut && p.ts <= nowTs);
    if (!dans.length) return { n: 0, valeur: null, serie: [], ecart: null };
    const serie = serieCourbe(e.points, nowTs, mois, "semaine", e.maintenant != null ? { fin: e.maintenant, min: e.min || 1 } : { min: e.min || 1 });
    const pleins = serie.filter((p) => p.v != null), ecart = pleins.length >= 2 ? Math.round(pleins[0].v) - Math.round(pleins[pleins.length - 1].v) : null;
    return { n: dans.length, valeur: Math.round(med(dans.map((p) => p.v))), serie, ecart, tronquee: !serie.length || serie[0].ts > debut,
      nouveau: !!e.premiere && e.premiere.ts > debut, depuisTs: dans[0].ts, derniere: dans[dans.length - 1] };
  }
  // Ton niveau actuel (Accueil) : Facile, Tempo, Seuil, Fractionné sur tes 4 dernières semaines, face à il y a 3 mois.
  // 28/10 (question d'Omar « pourquoi 7'12 ici et 7'09 dans Progression ? ») : le Facile est « Ton allure facile » de la
  // Progression (allure de tes sorties faciles ramenée à un même cœur, décision Q2 du Challenge), le même chiffre partout.
  function niveauActuel(sorties, nowTs, z, defs, reg) {
    const liste = alluresParEffort(sorties, nowTs, 3, z, defs, reg, 3), rp = repere(sorties, nowTs, reg);
    return liste.map((e) => (e.cle !== "ef" ? e : rp.etat !== "valeur" ? { ...e, maintenant: null, avant: null, ecart: null, n: 0 }
      : { ...e, maintenant: rp.valeur, avant: rp.ecart != null ? rp.valeur + rp.ecart : null, ecart: rp.ecart, n: rp.n, aCoeurEgal: rp.modeCoeur }));
  }
  // Ton niveau en une phrase (Accueil, moment B) : le progrès le plus net des 4 allures, sinon ce qui tient.
  function niveauPhrase(liste, mois, reg) {
    const r = reg || REGLAGES, NOM = { ef: "Ton allure facile", tempo: "Ton tempo", seuil: "Ton seuil", frac: "Ton fractionné" };
    const avec = liste.filter((e) => e.maintenant != null && e.ecart != null);
    const best = avec.filter((e) => e.ecart >= r.repereEcartMinSec).sort((a, b) => b.ecart - a.ecart)[0];
    if (best) return `${NOM[best.cle]} progresse : ${best.ecart} s plus vite en ${mois} mois.`;
    if (avec.length && avec.every((e) => Math.abs(e.ecart) < r.repereEcartMinSec)) return `Ton niveau tient : stable sur ${mois} mois.`;
    if (avec.length) return `Pas de progrès net sur ${mois} mois : c'est la régularité qui fera la différence.`;
    return "Tes allures des 4 dernières semaines : ton point de départ.";
  }

  // Ton cap : l'objectif principal de l'app, en une ligne.
  function cap(profil) {
    const p = profil && profil.goals && profil.goals.principal;
    if (!p || !p.objectifPrincipal) return null;
    if (p.objectifPrincipal === "Préparer une course") {
      const dist = RACE_LABELS[p.distanceCourse] || p.distanceCourse || "une course";
      return `${dist}${p.dateCible ? ` le ${isoToFr(p.dateCible)}` : ""}`;
    }
    return p.objectifPrincipal === "Améliorer mon allure" ? "améliorer ton allure" : p.objectifPrincipal.charAt(0).toLowerCase() + p.objectifPrincipal.slice(1);
  }
  function fcMaxEffective(profil, sorties) {
    if (profil && profil.max_hr) return { valeur: Number(profil.max_hr), source: "renseignée dans ton profil" };
    if (profil && profil.age) return { valeur: 220 - Number(profil.age), source: `estimée d'après ton âge (220 − ${profil.age})` };
    const pics = sorties.map((s) => s.fcMax).filter(Boolean);
    return pics.length ? { valeur: Math.max(...pics), source: "la plus haute mesurée en course" } : null;
  }

  return { versSortie, estCourse, coeurFiable, ressentiDe, ressentiMot, zonesAllure, zoneDe, zonesLibelles, pointsAllure, decoupage, libelleType,
    passages, zoneDominante, habitude, verdict, conseil, evolution, ressentiFaceMesure, lundi, semaine, serie, repere, repereCourbe,
    allureParEffort, alluresParEffort, sortiesParSemaine, typesSur, mois, semainesParType, zonesCardioPeriode, indicateurDansLeTemps, derive, cadence, coeurMoyen, volumeParMois, regularite,
    records, cap, fcMaxEffective, moyenne, med, kmTxt, allureTxt, TITRES, ZONE_A,
    // V2
    nomCourt, passageDominant, recordsBattus, ressentiCran, EFFORT_DE, frise3, zonesSortie, verdictRepartition, partZones, premierKm,
    allureParZoneMois, allureRegularite, allureRessenti, sortiesFacilesZones, lisser, niveauPhrase, niveauActuel, kmCoeur, kmParKm, allureZonesCardio, allureZonesCardioPeriode, JOUR, SEM, MOIS_J,
    // Révisions du 29/10
    repartir, partsZones, serieCourbe, niveauCourbes, niveauSerie, coeurMoyenOk, allureDetaillee, intervalleCoeur, detailMontre, commeGarmin };
})();
