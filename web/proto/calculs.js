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
    };
  }
  const estCourse = (s) => RUNNING_RUN_TYPES.includes(s.type) && s.stats && s.dist > 0 && s.allure > 0;

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
  const cachePoints = new Map();
  function pointsAllure(s, z, reg) {
    const r = reg || REGLAGES;
    if (!z || !s.pace || !(s.dist > 0) || !(s.dur > 0)) return null;
    const cle = `${s.id}|${s.ts}|${s.pace.length}|${(s.hr || []).length}|${z.bornes.join(",")}|${r.lissageSec}|${r.pauseSec}|${r.coeurToleranceSec}|${r.coeurDecalageSec}`;
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
      let prevT = 0; const pts = [];
      pc.forEach((p, i) => { const dt = p.t - prevT; prevT = p.t; if (dt > 0 && dt <= r.pauseSec) pts.push({ t: p.t, dt, m: dt * 1000 / lisse[i], pace: lisse[i], zone: zoneDe(lisse[i], z), hr: null }); });
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
  function libelleType(s, dec) {
    const L = { EF: "Sortie facile", Long: "Sortie longue", Fractionné: "Fractionné", Course: "Course", Seuil: "Tempo" };
    if (s.type === "Seuil" && dec) return dec.tempsParZone[3] + dec.tempsParZone[4] > dec.tempsParZone[2] ? "Seuil" : "Tempo";
    return L[s.type] || s.type;
  }

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
  const ZONE_A = ["en récupération", "en endurance", "au tempo", "au seuil", "en rapide"];

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
      return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, base: "coeur", zone: zi, note: null, comparees: ref.length,
        tuiles: [{ cle: "allure", label: `Allure ${ZONE_A[zi]}`, valeur: allureTxt(moi.allure), unite: "/km", habitude: allureTxt(moyenne(ref.map((a) => a.allure))) },
          { cle: "coeur", label: `Cœur ${ZONE_A[zi]}`, valeur: String(Math.round(moi.fc)), unite: "bpm", habitude: String(Math.round(fcAtt)) }] };
    }
    return null;
  }

  function verdict(s, toutes, ressentis, reg, z) {
    const r = reg || REGLAGES;
    const vp = bilanPassages(s, toutes, z, r);
    if (vp) return vp;
    // 2) Sorties du même type, 6 puis 12 semaines.
    let hab = habitude(s, toutes, r, r.habitudeSemaines), semaines = r.habitudeSemaines;
    if (hab.length < r.minSortiesHabitude) { hab = habitude(s, toutes, r, r.bilanFenetreMaxSemaines); semaines = r.bilanFenetreMaxSemaines; }
    const res = ressentiDe(s, ressentis);
    const fiable = coeurFiable(s, r) && !!s.fc;
    const tuileAllure = (habVal) => ({ cle: "allure", label: "Allure", valeur: allureTxt(s.allure), unite: "/km", habitude: habVal != null ? allureTxt(habVal) : null });
    const notePartielle = !fiable && s.fc ? "Données cardio partielles avec ta montre : le bilan s'appuie sur ton allure et ton ressenti." : null;
    // 3) Rien à comparer : première sortie de ce type, elle devient le point de départ.
    if (hab.length < r.minSortiesHabitude) {
      return { cle: "premiere", sens: SENS.premiere, titre: TITRES.premiere, base: null, note: notePartielle,
        phrase: `Pas d'autre sortie de ce type sur les ${r.bilanFenetreMaxSemaines} dernières semaines : ${allureTxt(s.allure)}/km${s.fc ? `, cœur à ${Math.round(s.fc)}` : ""}. Elle devient ton point de départ : la prochaine sera comparée à celle-ci.`,
        tuiles: [tuileAllure(null)].concat(s.fc ? [{ cle: "coeur", label: "Cœur moyen", valeur: String(Math.round(s.fc)), unite: "bpm", habitude: null }] : []) };
    }
    const allureHab = moyenne(hab.map((h) => h.allure)), compare = `comparé à ${plur(hab.length, "sortie", "sorties")} de ce type des ${semaines} dernières semaines`;
    if (fiable) {
      const avecCoeur = hab.filter((h) => h.fc && coeurFiable(h, r));
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
        return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, base: "coeur", note: null, comparees: hab.length,
          tuiles: [tuileAllure(allureHab), { cle: "coeur", label: "Cœur moyen", valeur: String(Math.round(s.fc)), unite: "bpm", habitude: String(Math.round(fcAttendue)) }] };
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
      return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, base: "ressenti", note: notePartielle, comparees: hab.length,
        tuiles: [tuileAllure(allureHab), { cle: "ressenti", label: "Ton ressenti", valeur: `${res}/10`, unite: "", habitude: `${rh}/10` }] };
    }
    const cle = dA <= -r.ecartAllureSec ? "rapide" : dA >= r.ecartAllureSec ? "lente" : "moyenne";
    const phrase = cle === "moyenne" ? `${allureTxt(s.allure)}/km : comme tes sorties de ce type (${compare}).`
      : `${allureTxt(s.allure)}/km : ${Math.round(Math.abs(dA))} s/km ${cle === "rapide" ? "plus vite" : "plus lent"} que ta moyenne sur ce type de sortie (${compare}). Note ton ressenti pour un bilan plus juste.`;
    return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, base: "allure", note: notePartielle, comparees: hab.length, tuiles: [tuileAllure(allureHab)] };
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
    if (!comp.length) return { texte: "Pas de sortie comparable il y a 2 mois : la comparaison viendra.", ecart: null, n: 0 };
    const avant = moyenne(comp.map((h) => h.allure)), d = Math.round(avant - s.allure);
    const plage = `${plur(comp.length, "sortie", "sorties")} de ${kmTxt(s.dist * 1000 * (1 - r.evolutionDistanceEcart))} à ${kmTxt(s.dist * 1000 * (1 + r.evolutionDistanceEcart))} km`;
    const texte = Math.abs(d) < r.evolutionMinSec ? `Sur cette distance, tu cours au même rythme qu'il y a 2 mois (${plage}).`
      : `Sur cette distance, tu cours ${Math.abs(d)} s/km ${d > 0 ? "plus vite" : "plus lentement"} qu'il y a 2 mois (${plage}).`;
    return { texte, ecart: d, n: comp.length };
  }

  /* ---------- Ressenti face à la mesure ---------- */
  function ressentiFaceMesure(s, v, ressentis, reg) {
    const res = ressentiDe(s, ressentis), mot = ressentiMot(res, reg);
    if (res == null) return "Note ton ressenti dans le bilan pour le comparer à ce que disent tes chiffres.";
    if (!v || !v.cle || v.cle === "premiere") return `Tu l'as trouvée « ${mot} » (${res}/10). Ta prochaine sortie de ce type sera comparée à celle-ci.`;
    if (v.base === "ressenti") return `Sans cœur fiable, c'est ton ressenti (${res}/10) qui fait le bilan, avec ton allure.`;
    const mesure = v.cle === "facile" || v.cle === "rapide" ? "facile" : v.cle === "dure" || v.cle === "lente" ? "dure" : "correcte";
    const qui = v.base === "coeur" ? "ton cœur" : "ton allure";
    if (mot === mesure) return `Tu l'as trouvée ${mot}, et ${qui} le confirme.`;
    if (mot === "dure" && mesure !== "dure") return `Tu l'as trouvée dure alors que ${qui} était dans ta moyenne ou mieux : fatigue, chaleur ou manque de sommeil jouent souvent.`;
    if (mot === "facile" && mesure === "dure") return `Tu l'as trouvée facile, mais ${qui} dit qu'elle t'a demandé plus que d'habitude : garde un œil sur la récupération.`;
    return `Tu l'as trouvée ${mot}, ${qui} la juge ${mesure} : un écart normal d'une sortie à l'autre.`;
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
    const avecCoeur = faciles.filter((s) => s.fc && coeurFiable(s, r));
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
    const efforts = [{ cle: "ef", k: 1, nom: "EF", zone: "zone 2" }, { cle: "tempo", k: 2, nom: "Tempo", zone: "zone 3" }, { cle: "seuil", k: 3, nom: "Seuil", zone: "zone 4" }];
    const recents = sorties.filter((s) => estCourse(s) && s.ts > nowTs - 400 * JOUR);
    const parSortie = defs ? recents.map((s) => ({ ts: s.ts, a: allureParEffort(s, z, defs, r) })).filter((x) => x.a) : [];
    const resume = (tous, min) => {
      const fen = (fin) => tous.filter((p) => p.ts <= fin && p.ts > fin - r.effortFenetreJours * JOUR).map((p) => p.v);
      const now = fen(nowTs), avant = fen(nowTs - ilYa);
      const maintenant = now.length >= min ? med(now) : null, vAvant = avant.length >= min ? med(avant) : null;
      return { points: tous.filter((p) => p.ts >= nowTs - mois * MOIS_J * JOUR), maintenant: maintenant != null ? Math.round(maintenant) : null,
        ecart: maintenant != null && vAvant != null ? Math.round(vAvant - maintenant) : null, n: now.length };
    };
    const liste = efforts.map((e) => ({ ...e, detail: defs ? `cœur en ${e.zone} · ${defs[e.k - 1].max + 1} à ${defs[e.k].max} bpm` : `cœur en ${e.zone}`,
      ...resume(parSortie.filter((x) => x.a[e.k].sec >= r.effortMinSec[e.k]).map((x) => ({ ts: x.ts, v: x.a[e.k].allure })), r.effortMinSorties) }));
    const frac = recents.filter((s) => s.type === "Fractionné").map((s) => {
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
  const coeurMoyen = (s) => (s.fc && coeurFiable(s) ? s.fc : null);

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
  function records(sorties) {
    const runs = sorties.filter(estCourse).map((s) => ({ id: s.id, ts: s.ts, type: s.type, distKm: s.dist, durationSec: s.dur, paceSecKm: s.allure, workPaceSecKm: null, cleanEf: false }));
    const h = recordHolders(runs);
    const liste = RECORD_DISTANCES.map((d) => ({ cle: d.key, label: d.label, valeur: h.distances[d.key] ? fmtDur(h.distances[d.key].timeSec) : null, id: h.distances[d.key] ? h.distances[d.key].runId : null, ts: h.distances[d.key] ? h.distances[d.key].ts : null }));
    const longue = sorties.filter(estCourse).reduce((m, s) => (!m || s.dist > m.dist ? s : m), null);
    liste.push({ cle: "longue", label: "Plus longue", valeur: longue ? `${kmTxt(longue.dist * 1000)} km` : null, id: longue ? longue.id : null, ts: longue ? longue.ts : null });
    return liste;
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
    records, cap, fcMaxEffective, moyenne, med, kmTxt, allureTxt, TITRES, ZONE_A };
})();
