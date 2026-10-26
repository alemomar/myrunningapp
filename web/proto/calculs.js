/* Prototype « refonte progression » : calculs purs (ni réseau, ni écriture, ni écran). Seuils dans reglages.js.
   Réutilise sans les modifier les fonctions de l'app (../logic.js) : allures conseillées (VDOT), allure par km, dérive
   cardiaque, zones cardio, cadence. Testé dans proto/test.html. */
const Calc = (() => {
  const JOUR = 86400000, SEM = 7 * JOUR;
  const moyenne = (a) => a.length ? a.reduce((x, v) => x + v, 0) / a.length : null;
  const med = (a) => { const s = a.filter((v) => v != null && !Number.isNaN(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const kmTxt = (m) => String(Math.round(m / 100) / 10).replace(".", ",");
  const allureTxt = (s) => s == null ? "—" : fmtKmPace(s);
  const plur = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

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
    };
  }
  const estCourse = (s) => RUNNING_RUN_TYPES.includes(s.type) && s.stats && s.dist > 0 && s.allure > 0;

  // Cœur fiable : au moins une mesure toutes les 30 s en moyenne, sur au moins 70 % de la sortie.
  function coeurFiable(s, reg) {
    const r = reg || REGLAGES;
    const pts = (s.hr || []).filter((p) => p && p.hr > 0);
    if (pts.length < 2 || !(s.dur > 0)) return false;
    const ts = pts.map((p) => p.t).sort((a, b) => a - b);
    return pts.length >= s.dur / r.coeurFiableIntervalleSec && (ts[ts.length - 1] - ts[0]) / s.dur >= r.coeurFiableCouverture;
  }

  // Ressenti sur 10 : celui noté dans le prototype (ce téléphone), sinon la difficulté notée dans l'app.
  const ressentiDe = (s, ressentis) => (ressentis && ressentis[s.id] != null ? Number(ressentis[s.id]) : s.rpe);
  function ressentiMot(v, reg) {
    const r = reg || REGLAGES;
    return v == null ? null : v <= r.ressentiFacileMax ? "facile" : v >= r.ressentiDurMin ? "dure" : "correcte";
  }

  /* ---------- Habitude et verdict ---------- */
  function habitude(s, toutes, reg) {
    const r = reg || REGLAGES;
    return toutes.filter((h) => h.id !== s.id && estCourse(h) && h.type === s.type && h.ts < s.ts && h.ts >= s.ts - r.habitudeSemaines * SEM);
  }
  const TITRES = {
    facile: "Plus facile que d'habitude à cette allure", moyenne: "Dans ta moyenne", dure: "Plus dure que d'habitude",
    rapide: "Plus rapide que d'habitude", lente: "Plus lente que d'habitude",
  };
  const SENS = { facile: "haut", rapide: "haut", moyenne: "egal", dure: "bas", lente: "bas" };

  function verdict(s, toutes, ressentis, reg) {
    const r = reg || REGLAGES;
    const hab = habitude(s, toutes, r);
    const res = ressentiDe(s, ressentis);
    const fiable = coeurFiable(s, r) && !!s.fc;
    const tuileAllure = (habVal) => ({ cle: "allure", label: "Allure", valeur: allureTxt(s.allure), unite: "/km", habitude: habVal != null ? allureTxt(habVal) : null });
    const notePartielle = !fiable && s.fc ? "Données cardio partielles avec ta montre : le verdict s'appuie sur ton allure et ton ressenti." : null;
    if (hab.length < r.minSortiesHabitude) {
      return { cle: null, sens: null, titre: "Pas encore de verdict", base: null, note: null,
        phrase: `Il faut au moins ${r.minSortiesHabitude} sorties du même type sur ${r.habitudeSemaines} semaines pour comparer : ${hab.length ? "il n'y en a qu'une" : "il n'y en a pas encore"}.`,
        tuiles: [tuileAllure(null)], habitude: hab };
    }
    const allureHab = moyenne(hab.map((h) => h.allure));
    if (fiable) {
      const avecCoeur = hab.filter((h) => h.fc && coeurFiable(h, r));
      const comparables = avecCoeur.filter((h) => Math.abs(h.allure - s.allure) <= r.allureComparableSec);
      let fcAttendue = null, mode = null;
      if (comparables.length >= r.minSortiesComparables) { fcAttendue = moyenne(comparables.map((h) => h.fc)); mode = "comparables"; }
      else if (avecCoeur.length >= r.minSortiesTendance) {
        const lr = linearRegression(avecCoeur.map((h) => ({ x: h.allure, y: h.fc })));
        fcAttendue = lr.intercept + lr.slope * s.allure; mode = "tendance";
      }
      if (fcAttendue != null) {
        const d = Math.round(s.fc - fcAttendue);
        const cle = d <= -r.ecartCoeurBpm ? "facile" : d >= r.ecartCoeurBpm ? "dure" : "moyenne";
        const debut = `Ton cœur à ${Math.round(s.fc)} pour ${allureTxt(s.allure)}/km`;
        const phrase = cle === "facile" ? `${debut} : ${plur(-d, "battement", "battements")} de moins que d'habitude à cette allure.`
          : cle === "dure" ? `${debut} : ${plur(d, "battement", "battements")} de plus que d'habitude à cette allure.`
          : `${debut} : comme d'habitude à cette allure.`;
        return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, base: "coeur", mode, note: null, habitude: hab,
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
      const mot = ressentiMot(res, r);
      const phrase = `${allureTxt(s.allure)}/km, trouvée « ${mot} » (${res}/10, d'habitude ${String(Math.round(resHab * 10) / 10).replace(".", ",")}/10) : ${
        cle === "facile" ? "plus facile que tes dernières sorties de ce type." : cle === "dure" ? "plus dure que tes dernières sorties de ce type." : "comme tes dernières sorties de ce type."}`;
      return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, base: "ressenti", note: notePartielle, habitude: hab,
        tuiles: [tuileAllure(allureHab), { cle: "ressenti", label: "Ton ressenti", valeur: `${res}/10`, unite: "", habitude: `${String(Math.round(resHab * 10) / 10).replace(".", ",")}/10` }] };
    }
    const cle = dA <= -r.ecartAllureSec ? "rapide" : dA >= r.ecartAllureSec ? "lente" : "moyenne";
    const ec = Math.round(Math.abs(dA));
    const phrase = cle === "moyenne" ? `${allureTxt(s.allure)}/km : comme tes sorties de ce type des ${r.habitudeSemaines} dernières semaines.`
      : `${allureTxt(s.allure)}/km : ${ec} s/km ${cle === "rapide" ? "plus vite" : "plus lent"} que ta moyenne sur ce type de sortie. Note ton ressenti pour un verdict plus juste.`;
    return { cle, sens: SENS[cle], titre: TITRES[cle], phrase, base: "allure", note: notePartielle, habitude: hab, tuiles: [tuileAllure(allureHab)] };
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

  /* ---------- Zones d'allure ---------- */
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
      a = { easy, marathon: easy * 0.87, threshold: easy * 0.83, interval: easy * 0.75 };
      source = "ton allure habituelle en sortie facile (pas de chrono dans « Ton niveau »)";
    }
    const mi = (x, y) => (x + y) / 2;
    // Bornes basses (s/km) : une allure plus LENTE que la borne appartient à la zone (index 0 = la plus lente).
    const bornes = [a.easy + r.recupEcartSec, mi(a.easy, a.marathon), mi(a.marathon, a.threshold), mi(a.threshold, a.interval)];
    return { bornes, source, conseillees: a };
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

  /* ---------- Découpage automatique ---------- */
  function decoupage(s, z, reg) {
    const r = reg || REGLAGES;
    if (!z || !s.pace || !(s.dist > 0) || !(s.dur > 0)) return null;
    const pc = s.pace.filter((p) => p && p.pace > 0 && p.t >= 0).sort((a, b) => a.t - b.t);
    if (pc.length / s.dur * 60 < 1) return null;   // moins d'une mesure d'allure par minute : pas de découpage
    const demi = r.lissageSec / 2;
    const lisse = pc.map((p, i) => {
      const fen = []; for (let j = i; j >= 0 && pc[j].t >= p.t - demi; j--) fen.push(pc[j].pace);
      for (let j = i + 1; j < pc.length && pc[j].t <= p.t + demi; j++) fen.push(pc[j].pace);
      return med(fen);
    });
    let prevT = 0; const pts = [];
    pc.forEach((p, i) => { const dt = p.t - prevT; prevT = p.t; if (dt > 0 && dt <= r.pauseSec) pts.push({ t: p.t, dt, m: dt * 1000 / lisse[i], pace: lisse[i], zone: zoneDe(lisse[i], z) }); });
    const brut = pts.reduce((a, x) => a + x.m, 0);
    if (!(brut > 0)) return null;
    const ech = s.dist * 1000 / brut;
    if (ech < 0.8 || ech > 1.25) return null;     // mesures trop loin de la distance de la sortie : jugées fausses
    pts.forEach((x) => { x.m *= ech; });
    const tempsParZone = [0, 0, 0, 0, 0]; pts.forEach((x) => { tempsParZone[x.zone] += x.dt; });
    // Segments de même zone, puis on fond les plus courts (< 400 m) dans le voisin le plus proche en allure.
    let segs = [];
    pts.forEach((x) => { const last = segs[segs.length - 1]; if (last && last.zone === x.zone) { last.m += x.m; last.sec += x.dt; } else segs.push({ zone: x.zone, m: x.m, sec: x.dt }); });
    const fusionner = () => { const out = []; segs.forEach((sg) => { const l = out[out.length - 1]; if (l && l.zone === sg.zone) { l.m += sg.m; l.sec += sg.sec; } else out.push({ ...sg }); }); segs = out; };
    for (let guard = 0; guard < 500 && segs.length > 1; guard++) {
      let iMin = -1; segs.forEach((sg, i) => { if (sg.m < r.decoupageMinM && (iMin < 0 || sg.m < segs[iMin].m)) iMin = i; });
      if (iMin < 0) break;
      const g = segs[iMin - 1], d = segs[iMin + 1];
      const cible = !g ? d : !d ? g : (Math.abs(g.zone - segs[iMin].zone) < Math.abs(d.zone - segs[iMin].zone) ? g : Math.abs(g.zone - segs[iMin].zone) > Math.abs(d.zone - segs[iMin].zone) ? d : (g.m >= d.m ? g : d));
      cible.m += segs[iMin].m; cible.sec += segs[iMin].sec; segs.splice(iMin, 1); fusionner();
    }
    let debut = 0; segs.forEach((sg) => { sg.debutM = debut; debut += sg.m; sg.role = null; });
    // Échauffement : 1er segment plus lent que le suivant, en récupération ou avant un passage soutenu. Retour au calme : dernier
    // segment plus lent que le précédent, en récupération ou à la fin d'une séance intense (une EF qui finit facile reste « facile »).
    if (segs.length > 1 && segs[0].zone < segs[1].zone && segs[0].m <= r.echauffementMaxM && (segs[0].zone === 0 || segs[1].zone >= 2)) segs[0].role = "echauffement";
    const n = segs.length;
    if (n > 2 && segs[n - 1].zone < segs[n - 2].zone && segs[n - 1].m <= r.retourCalmeMaxM && (segs[n - 1].zone === 0 || !["EF", "Long"].includes(s.type))) segs[n - 1].role = "retour";
    const nomSeg = (sg) => sg.role === "echauffement" ? "d'échauffement" : sg.role === "retour" ? "de retour au calme"
      : ["très lents", "faciles", "au tempo", "au seuil", "rapides"][sg.zone];
    const texte = segs.map((sg) => `${kmTxt(sg.m)} km ${nomSeg(sg)}`).join(", ");
    const facile = (sg) => r.zonesFaciles.includes(sg.zone) || sg.role;
    const soutenus = segs.filter((sg) => !facile(sg));
    const soutenuM = soutenus.reduce((a, sg) => a + sg.m, 0);
    let commentaire;
    if ((s.type === "EF" || s.type === "Long") && soutenus.length) {
      const ou = soutenus.map((sg) => `au ${Math.floor((sg.debutM + sg.m / 2) / 1000) + 1}e km`).join(" et ");   // le km où tombe le milieu du passage
      commentaire = `Une sortie facile avec ${kmTxt(soutenuM)} km plus rapides (${ou}) : elle reste classée « ${s.type === "Long" ? "longue" : "facile"} », les km rapides sont comptés à part.`;
    } else if (!soutenus.length) commentaire = "Toute la sortie en facile : c'est exactement ce qu'on attend d'une sortie d'endurance.";
    else commentaire = `${kmTxt(soutenuM)} km en soutenu sur ${kmTxt(s.dist * 1000)} km.`;
    return { segments: segs, tempsParZone, texte, commentaire, soutenuM, facileSec: tempsParZone[0] + tempsParZone[1], soutenuSec: tempsParZone[2] + tempsParZone[3] + tempsParZone[4] };
  }

  // Tempo ou Seuil pour une séance « Seuil » de l'app : la zone soutenue où elle a passé le plus de temps (E19).
  function libelleType(s, dec) {
    const L = { EF: "Sortie facile", Long: "Sortie longue", Fractionné: "Fractionné", Course: "Course", Seuil: "Tempo" };
    if (s.type === "Seuil" && dec) return dec.tempsParZone[3] > dec.tempsParZone[2] ? "Seuil" : "Tempo";
    return L[s.type] || s.type;
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
    if (res == null) return "Note ton ressenti dans le verdict pour le comparer à ce que disent tes chiffres.";
    if (!v || !v.cle) return `Tu l'as trouvée « ${mot} » (${res}/10). Le verdict viendra quand tu auras quelques sorties de ce type.`;
    if (v.base === "ressenti") return `Sans cœur fiable, c'est ton ressenti (${res}/10) qui fait le verdict, avec ton allure.`;
    const mesure = v.cle === "facile" || v.cle === "rapide" ? "facile" : v.cle === "dure" || v.cle === "lente" ? "dure" : "correcte";
    const qui = v.base === "coeur" ? "ton cœur" : "ton allure";
    if (mot === mesure) return `Tu l'as trouvée ${mot}, et ${qui} le confirme.`;
    if (mot === "dure" && mesure !== "dure") return `Tu l'as trouvée dure alors que ${qui} était dans ta moyenne ou mieux : fatigue, chaleur ou manque de sommeil jouent souvent.`;
    if (mot === "facile" && mesure === "dure") return `Tu l'as trouvée facile, mais ${qui} dit qu'elle t'a demandé plus que d'habitude : garde un œil sur la récupération.`;
    return `Tu l'as trouvée ${mot}, ${qui} la juge ${mesure} : un écart normal d'une sortie à l'autre.`;
  }

  /* ---------- Ta semaine ---------- */
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

  /* ---------- Ton repère : allure facile à effort égal ---------- */
  function repere(sorties, nowTs, reg) {
    const r = reg || REGLAGES;
    const faciles = sorties.filter((s) => estCourse(s) && (s.type === "EF" || s.type === "Long"));
    const avecCoeur = faciles.filter((s) => s.fc && coeurFiable(s, r));
    const fcRef = med(avecCoeur.filter((s) => s.ts >= nowTs - r.repereFcRefJours * JOUR).map((s) => s.fc));
    const modeCoeur = !!fcRef && avecCoeur.filter((s) => s.ts >= nowTs - r.repereFenetreJours * JOUR).length >= r.repereMinSorties;
    const val = (s) => modeCoeur ? s.allure * s.fc / fcRef : s.allure;
    const base = modeCoeur ? avecCoeur : faciles;
    const fen = (fin) => base.filter((s) => s.ts <= fin && s.ts > fin - r.repereFenetreJours * JOUR);
    const maintenant = fen(nowTs), avant = fen(nowTs - r.repereIlYaJours * JOUR);
    if (maintenant.length < r.repereMinSorties) return { etat: "bientot", manque: r.repereMinSorties - maintenant.length, modeCoeur };
    const v = med(maintenant.map(val)), vAvant = avant.length >= r.repereMinSorties ? med(avant.map(val)) : null;
    const ecart = vAvant != null ? Math.round(vAvant - v) : null;   // > 0 : plus rapide qu'il y a 3 mois
    return { etat: "valeur", valeur: Math.round(v), ecart, modeCoeur, fcRef: fcRef ? Math.round(fcRef) : null, n: maintenant.length,
      points: base.filter((s) => s.ts > nowTs - 365 * JOUR).map((s) => ({ ts: s.ts, v: val(s) })) };
  }

  /* ---------- Progression (étape 3) ---------- */
  // Courbe du repère : un point par semaine = médiane des sorties faciles des 4 semaines précédentes (au moins 2).
  function repereCourbe(sorties, nowTs, mois, reg) {
    const r = reg || REGLAGES, rp = repere(sorties, nowTs, r);
    if (rp.etat !== "valeur") return { rp, points: [] };
    const debut = nowTs - mois * 30.44 * JOUR, pts = [];
    for (let fin = nowTs; fin >= debut; fin -= SEM) {
      const fen = rp.points.filter((p) => p.ts <= fin && p.ts > fin - r.repereFenetreJours * JOUR);
      if (fen.length >= 2) pts.unshift({ ts: fin, v: med(fen.map((p) => p.v)) });
    }
    return { rp, points: pts };
  }
  // Volume par mois (courses) sur les `mois` derniers mois, mois en cours compris.
  function volumeParMois(sorties, nowTs, mois) {
    const d = new Date(nowTs), out = [];
    for (let i = mois - 1; i >= 0; i--) {
      const deb = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime(), fin = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
      const c = sorties.filter((s) => estCourse(s) && s.ts >= deb && s.ts < fin);
      out.push({ debut: deb, km: c.reduce((a, s) => a + s.dist, 0), n: c.length });
    }
    return out;
  }
  // Régularité : pour chacune des `semaines` dernières semaines (lundi à dimanche), au moins une course ?
  function regularite(sorties, nowTs, semaines) {
    const l = lundi(nowTs), out = [];
    for (let i = semaines - 1; i >= 0; i--) { const deb = l - i * SEM; out.push(sorties.some((s) => estCourse(s) && s.ts >= deb && s.ts < deb + SEM)); }
    return { semaines: out, avec: out.filter(Boolean).length };
  }
  // Un indicateur sorties faciles (dérive, cadence) dans le temps : points sur la période, médiane des 8 dernières semaines
  // et des mêmes 8 semaines il y a 3 mois (règles de l'app, C2).
  function indicateurDansLeTemps(sorties, nowTs, mois, valeur) {
    const faciles = sorties.filter((s) => estCourse(s) && (s.type === "EF" || s.type === "Long"));
    const pts = faciles.map((s) => ({ ts: s.ts, v: valeur(s), id: s.id })).filter((p) => p.v != null);
    const fen = (fin) => pts.filter((p) => p.ts <= fin && p.ts > fin - 56 * JOUR).map((p) => p.v);
    const now = fen(nowTs), avant = fen(nowTs - 91 * JOUR);
    return { points: pts.filter((p) => p.ts >= nowTs - mois * 30.44 * JOUR), maintenant: now.length >= 3 ? med(now) : null, nMaintenant: now.length, avant: avant.length >= 3 ? med(avant) : null };
  }
  const derive = (s) => { const d = cardiacDrift({ hrSeries: s.hr, paceSeries: s.pace, durationSec: s.dur, type: s.type }); return d ? d.pct : null; };
  const cadence = (s) => cadenceShown(s.cad, s.type);
  // Records : ceux de l'app (5 km, 10 km, semi, marathon : temps ramené à la distance exacte), plus la sortie la plus longue.
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

  /* ---------- Bloc cœur du détail ---------- */
  function fcMaxEffective(profil, sorties) {
    if (profil && profil.max_hr) return Number(profil.max_hr);
    if (profil && profil.age) return 220 - Number(profil.age);
    const pics = sorties.map((s) => s.fcMax).filter(Boolean);
    return pics.length ? Math.max(...pics) : null;
  }

  return { versSortie, estCourse, coeurFiable, ressentiDe, ressentiMot, habitude, verdict, conseil, zonesAllure, zoneDe, zonesLibelles,
    decoupage, libelleType, evolution, ressentiFaceMesure, semaine, lundi, repere, repereCourbe, volumeParMois, regularite, indicateurDansLeTemps,
    derive, cadence, records, cap, fcMaxEffective, moyenne, med, kmTxt, allureTxt, TITRES };
})();
