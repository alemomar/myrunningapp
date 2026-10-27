/* Prototype V2 « progression » : Ton conseil (Challenge C3 à C10, maquettes Claude Design validées par Omar le 27/10/2026).
   Deux volets : Zones (où va ton effort) et Allure (comment tu cours), au plus un conseil actif par volet. Dans chaque volet,
   la 1re règle qui s'applique gagne. Un conseil reste en place jusqu'à sa fin (1 à 4 semaines) : il n'est pas recalculé à
   chaque ouverture et se suit avec le même chiffre. À la fin : « C'est fait » ou « Pas encore » (on continue 1 semaine, une
   fois), puis le volet suivant prend sa place le lendemain. Pas d'historique.
   Calculs purs : la mémoire du conseil en cours (début, chiffre de départ, objectif) est passée puis rendue par l'écran, qui
   la garde sur ce téléphone. Seuils dans reglages.js. Testé dans proto/test.html. */
const Conseil = (() => {
  const R = REGLAGES, JOUR = 86400000, SEM = 7 * JOUR;
  const jourCle = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const avant = (ctx, excl) => ctx.courses.filter((s) => s.id !== excl && s.ts <= ctx.nowTs).sort((a, b) => a.ts - b.ts);   // toujours de la plus ancienne à la plus récente
  const ceil5 = (v) => Math.ceil(v / 5) * 5;

  /* ---------- Les chiffres suivis (excl : sortie mise de côté, pour dire ce qu'une sortie a changé) ---------- */
  const part = (ctx, excl, fin, jours) => Calc.partZones(ctx.courses, fin == null ? ctx.nowTs : fin, jours || R.conseilFenetreJours, ctx.fmax, ctx.frepos, R, excl);
  function coeurFacile(ctx, excl, fin, jours) {
    const f = fin == null ? ctx.nowTs : fin;
    const l = avant(ctx, excl).filter((s) => s.type === "EF" && s.fc && s.ts <= f && s.ts > f - jours * JOUR && Calc.coeurFiable(s)).map((s) => s.fc);
    return l.length ? Calc.med(l) : null;
  }
  const deriveDe = (s) => (s.type === "EF" && s.dur >= R.c8DureeMinSec ? Calc.derive(s) : null);
  function derives(ctx, excl) { return avant(ctx, excl).map((s) => ({ s, d: deriveDe(s) })).filter((x) => x.d != null).slice(-2); }
  function semaineDe(ctx, excl) { const l = Calc.lundi(ctx.nowTs); return avant(ctx, excl).filter((s) => s.ts >= l); }
  function minutesZ3(s, ctx) { const zs = Calc.zonesSortie(s, ctx.fmax, ctx.frepos); return zs ? zs.secs[2] / 60 : 0; }
  const MESURES = {
    soutenu: (ctx, excl) => { const p = part(ctx, excl); return p ? p.soutenuPct : null; },
    facile: (ctx, excl) => { const p = part(ctx, excl); return p ? p.facilePct : null; },
    coeurFacile: (ctx, excl) => coeurFacile(ctx, excl, null, 7) ?? coeurFacile(ctx, excl, null, 21),
    derive: (ctx, excl) => { const l = derives(ctx, excl); return l.length ? Calc.moyenne(l.map((x) => x.d)) : null; },
    passagesZ3: (ctx, excl) => semaineDe(ctx, excl).filter((s) => minutesZ3(s, ctx) * 60 >= R.c9Z3MinSec).length,
    minutesZ3: (ctx, excl) => Math.round(semaineDe(ctx, excl).reduce((a, s) => a + minutesZ3(s, ctx), 0)),
    sortiesSemaine: (ctx, excl) => semaineDe(ctx, excl).length,
    facilesSemaine: (ctx, excl) => semaineDe(ctx, excl).filter((s) => s.type === "EF" || s.type === "Long").length,
    premierKm: (ctx, excl) => { const l = avant(ctx, excl); const k = l.length ? Calc.premierKm(l[l.length - 1]) : null; return k ? k.premier : null; },
  };

  /* ---------- Les règles, dans l'ordre de chaque volet ---------- */
  const z2max = (ctx) => (ctx.defs ? ctx.defs[1].max : null);
  const z3 = (ctx) => (ctx.defs ? `${ctx.defs[1].max + 1} à ${ctx.defs[2].max} bpm` : "zone 3");
  const REGLES = {
    zones: [
      { id: "C4", teste(ctx) {
          const recent = coeurFacile(ctx, null, null, R.c4Semaines * 7), ancien = coeurFacile(ctx, null, ctx.nowTs - R.c4Semaines * SEM, R.c4Semaines * 7);
          if (recent != null && ancien != null && recent - ancien >= R.c4HausseBpm) return { recent, ancien };
          const dern = avant(ctx).slice(-2);
          if (dern.length === 2 && dern.every((s) => { const v = ctx.bilan(s); return v && v.cle === "dure"; })) return { recent: recent ?? MESURES.coeurFacile(ctx), ancien: null, deuxDures: true };
          return null;
        },
        creer(ctx, d) {
          const depart = MESURES.coeurFacile(ctx) ?? d.recent;
          return { mesure: "coeurFacile", titre: "Une semaine plus légère", unite: "bpm", sens: "max", jours: R.c4Jours, depart,
            objectif: d.ancien != null ? Math.round(d.ancien + R.c4MargeBpm) : Math.round((depart || 150) - 3),
            detail: "ton cœur moyen en facile · une sortie de moins cette semaine", effet: "Ton cœur moyen en facile",
            phrase: d.ancien != null ? `En facile, ton cœur est passé de ${Math.round(d.ancien)} à ${Math.round(d.recent)} bpm en 3 semaines. Souvent de la fatigue : une semaine plus légère, une sortie de moins.`
              : "Deux bilans « plus dure » d'affilée : souvent de la fatigue. Une semaine plus légère, une sortie de moins." };
        } },
      { id: "C5", teste(ctx) { const p = MESURES.soutenu(ctx); return p != null && p > R.c5SoutenuMaxPct ? { p } : null; },
        creer(ctx, d) {
          return { mesure: "soutenu", titre: "Cours davantage en zone 2", unite: "%", sens: "max", jours: R.c5Jours, depart: d.p, objectif: R.c5SoutenuMaxPct,
            detail: `de ton temps en zones 3 à 5${z2max(ctx) ? ` · reste sous ${z2max(ctx)} bpm` : ""}`, effet: "Sur 4 semaines, en zones 3 à 5",
            phrase: `${Math.round(d.p)} % de ton temps en zones 3 à 5. Le bon équilibre : 80 % en zones 1-2, 20 % au-dessus. Plus de zone 2, moins de zone 3${z2max(ctx) ? ` : reste sous ${z2max(ctx)} bpm en facile` : ""}.` };
        } },
      { id: "C8", teste(ctx) { const l = derives(ctx); return l.length === 2 && l.every((x) => x.d > R.c8DeriveMinPct) ? { d: Calc.moyenne(l.map((x) => x.d)) } : null; },
        creer(ctx, d) {
          return { mesure: "derive", titre: "Garde tes sorties à 45 min", unite: "%", sens: "max", jours: R.c8Jours, depart: d.d, objectif: R.c8DeriveMinPct,
            detail: "ta dérive cardiaque en facile · avant d'allonger", effet: "Ta dérive cardiaque en facile",
            phrase: `Ton cœur monte de ${Math.round(d.d)} % en 2e moitié de sortie. Garde tes sorties à 45 min, en facile, avant d'allonger.` };
        } },
      { id: "C9", teste(ctx) {
          const ok = [0, 1, 2].every((i) => { const p = part(ctx, null, ctx.nowTs - i * SEM, 7); return p && p.facilePct >= R.c9FacileMinPct; });
          return ok ? { p: part(ctx).facilePct } : null;
        },
        creer(ctx, d) {
          return { mesure: "passagesZ3", titre: "Glisse 10 à 15 min en zone 3", unite: "", etiquette: "Cette semaine", sens: "min", jours: R.c9Jours, depart: MESURES.passagesZ3(ctx), objectif: 1,
            detail: `dans une sortie par semaine · ${z3(ctx)}`, effet: "Passages en zone 3 cette semaine",
            phrase: `${Math.round(d.p)} % en facile, 3 semaines d'affilée : ta base est solide. Tu peux glisser 10 à 15 min en zone 3 dans une sortie par semaine.` };
        } },
      { id: "Z", teste(ctx) { const p = MESURES.facile(ctx); return p != null ? { p } : null; },
        creer(ctx, d) {
          return { mesure: "facile", titre: "Garde ton équilibre", unite: "%", sens: "min", jours: R.zDefautJours, depart: d.p, objectif: R.repereFacilePct,
            detail: "de ton temps en zones 1-2 · bon équilibre", effet: "Sur 4 semaines, en zones 1-2",
            phrase: `${Math.round(d.p)} % en facile : bon équilibre. Continue comme ça.` };
        } },
    ],
    allure: [
      { id: "C6", teste(ctx) {
          const l = Calc.lundi(ctx.nowTs), semaines = [0, 1, 2, 3].filter((i) => avant(ctx).some((s) => s.ts >= l - i * SEM && s.ts < l - (i - 1) * SEM)).length;
          const der = avant(ctx).slice(-1)[0], jours = der ? Math.floor((ctx.nowTs - der.ts) / JOUR) : 99;
          return jours >= R.c6ReprendreJours ? { reprendre: true, jours } : semaines < R.c6MinSemaines ? { semaines } : null;
        },
        creer(ctx, d) {
          return d.reprendre
            ? { mesure: "sortiesSemaine", titre: "Reprends doucement", unite: "", etiquette: "Sorties / sem.", sens: "min", jours: R.c6ReprendreJoursConseil, depart: 0, objectif: R.c6ObjectifSorties,
              detail: `20 à 30 min en facile${z2max(ctx) ? `, sous ${z2max(ctx)} bpm` : ""} · pendant 2 semaines`, effet: "Sorties cette semaine",
              phrase: `${d.jours} jours sans sortie. Reprends doucement : 20 à 30 min en facile, 2 fois par semaine.` }
            : { mesure: "sortiesSemaine", titre: "Cours 2 fois par semaine", unite: "", etiquette: "Sorties / sem.", sens: "min", jours: R.c6Jours, depart: MESURES.sortiesSemaine(ctx), objectif: R.c6ObjectifSorties,
              detail: "même courtes : c'est la régularité qui fait progresser", effet: "Sorties cette semaine",
              phrase: `${d.semaines} semaines sur 4 avec une sortie. C'est la régularité qui fait progresser ton allure : vise 2 sorties par semaine, même courtes.` };
        } },
      { id: "C3", teste(ctx) {
          const o = ctx.objectif, prem = avant(ctx)[0];
          return o && o.label && prem && ctx.nowTs - prem.ts >= R.c3ApresJours * JOUR ? { o } : null;
        },
        creer(ctx, d) {
          const tempo = (ctx.niveau || []).find((e) => e.cle === "tempo"), o = d.o;
          return { mesure: "minutesZ3", titre: "15 min en zone 3 par semaine", unite: "min", etiquette: "Cette semaine", sens: "min", jours: R.c3Jours, depart: MESURES.minutesZ3(ctx), objectif: R.c3Z3MinSem,
            detail: `pour ton objectif ${o.label} · ${z3(ctx)}`, effet: "Minutes en zone 3 cette semaine",
            phrase: `Ton objectif : ${o.label}${o.allure ? `, soit ${fmtKmPace(o.allure)}/km` : ""}.${tempo && tempo.maintenant ? ` Ton allure Tempo est à ${fmtKmPace(tempo.maintenant)}.` : ""} Pour t'en rapprocher : une fois par semaine, 15 min en zone 3 (${z3(ctx)}), le reste en zone 2.` };
        } },
      { id: "C7", teste(ctx) {
          const l = avant(ctx).slice(-R.c7SurDernieres).map(Calc.premierKm).filter(Boolean);
          const n = l.filter((k) => k.moyenne - k.premier >= R.c7EcartSec).length;
          return n >= R.c7MinFois ? { ecart: Math.round(Calc.moyenne(l.map((k) => k.moyenne - k.premier))), moy: Calc.med(l.map((k) => k.moyenne)) } : null;
        },
        creer(ctx, d) {
          const ef = (ctx.niveau || []).find((e) => e.cle === "ef"), base = ef && ef.maintenant ? ef.maintenant : d.moy, obj = ceil5(base + R.c7MargeSec);
          return { mesure: "premierKm", titre: "Pars plus lentement", unite: "allure", sens: "lent", jours: 21, finSorties: R.c7Sorties, nAuDebut: avant(ctx).length, depart: MESURES.premierKm(ctx), objectif: obj,
            detail: "ton 1er km, par km · ou plus lent", effet: "Ton 1er km",
            phrase: `Ton 1er km est ${d.ecart} s plus rapide que le reste de tes sorties. Pars plus lentement : ton 1er km à ${fmtKmPace(obj)} ou plus.` };
        } },
      { id: "C10", teste() { return {}; },
        creer(ctx) {
          const NOM = { ef: "Ton allure facile", tempo: "Ton tempo", seuil: "Ton seuil", frac: "Ton fractionné" };
          const best = (ctx.niveau || []).filter((e) => e.maintenant != null && e.ecart != null && e.ecart >= R.repereEcartMinSec).sort((a, b) => b.ecart - a.ecart)[0];
          return { mesure: "facilesSemaine", titre: best ? "Garde ce rythme" : "Continue comme ça", unite: "", etiquette: "Sorties faciles / sem.", sens: "min", jours: R.c10Jours, depart: MESURES.facilesSemaine(ctx), objectif: 2,
            detail: best ? `${NOM[best.cle]} : ${best.ecart} s plus vite en 3 mois · 2 à 3 sorties faciles par semaine` : "2 à 3 sorties faciles par semaine : c'est la base qui fait progresser", effet: "Sorties faciles cette semaine",
            phrase: best ? `${NOM[best.cle]} a gagné ${best.ecart} s en 3 mois. Garde ce rythme : 2 à 3 sorties faciles par semaine.` : "Garde ce rythme : 2 à 3 sorties faciles par semaine." };
        } },
    ],
  };

  /* ---------- Suivi ---------- */
  const mesurer = (c, ctx, excl) => { const f = MESURES[c.mesure]; const v = f ? f(ctx, excl) : null; return v == null ? null : v; };
  const atteint = (c, v) => v != null && (c.sens === "max" ? (c.unite === "%" && c.mesure === "derive" ? v < c.objectif : v <= c.objectif) : c.sens === "lent" ? v >= c.objectif : v >= c.objectif);
  function fini(c, ctx) {
    if (ctx.nowTs >= c.fin) return true;
    return !!(c.finSorties && avant(ctx).length - c.nAuDebut >= c.finSorties);
  }
  function choisir(volet, ctx) {
    for (const r of REGLES[volet]) {
      const d = r.teste(ctx);
      if (d) { const c = r.creer(ctx, d); return { ...c, volet, regle: r.id, debut: ctx.nowTs, fin: ctx.nowTs + c.jours * JOUR, prolonge: false, resultat: null, finVu: null }; }
    }
    return null;
  }
  // Ce que la sortie `s` a changé au conseil en cours (« 38 % → 34 % », « −4 avec ta sortie », « 7'15 aujourd'hui »).
  function effet(c, ctx, s) {
    if (!c || !s) return null;
    const apres = mesurer(c, ctx), av = mesurer(c, ctx, s.id);
    if (c.mesure === "premierKm") { const k = Calc.premierKm(s); return k ? { avant: null, apres: k.premier, sortie: k.premier } : null; }
    return apres == null ? null : { avant: av, apres };
  }

  /* ---------- Point d'entrée : l'écran passe le contexte et la mémoire, reçoit la vue et la nouvelle mémoire ---------- */
  // ctx : { courses (triées, plus ancienne d'abord), nowTs, fmax, frepos, defs, objectif, niveau (alluresParEffort), bilan(s) }
  function evaluer(ctx, stock) {
    const out = { zones: null, allure: null, attente: null, partiel: false, stock: { ...(stock || {}) } };
    const n = avant(ctx).length;
    if (n < R.conseilMinSorties) { out.attente = { n, manque: R.conseilMinSorties - n, sur: R.conseilMinSorties }; out.stock = {}; return out; }
    out.partiel = !part(ctx);
    ["zones", "allure"].forEach((volet) => {
      if (volet === "zones" && out.partiel) { out.stock.zones = null; return; }
      let c = out.stock[volet] || null;
      if (c && c.regle && !REGLES[volet].some((r) => r.id === c.regle)) c = null;
      if (c && fini(c, ctx)) {
        const v = mesurer(c, ctx), ok = atteint(c, v);
        if (!ok && !c.prolonge && !c.resultat) c = { ...c, fin: ctx.nowTs + R.conseilProlongeJours * JOUR, prolonge: true, finSorties: null };
        else if (!c.resultat) c = { ...c, resultat: ok ? "fait" : "pasEncore", valeurFin: v, finVu: jourCle(ctx.nowTs) };
        else if (c.finVu !== jourCle(ctx.nowTs)) c = null;   // message de fin vu un autre jour : le volet suivant prend sa place
      }
      if (!c) c = choisir(volet, ctx);
      out.stock[volet] = c;
      if (c) {
        const valeur = c.resultat ? c.valeurFin : mesurer(c, ctx);
        out[volet] = { ...c, valeur, resteJours: Math.max(1, Math.ceil((c.fin - ctx.nowTs) / JOUR)), atteint: atteint(c, valeur) };
      }
    });
    return out;
  }
  // Chiffre d'un conseil, pour l'écran : « 34 % », « 6'58 », « 2 ».
  function fmt(c, v) {
    if (v == null) return "—";
    if (c.unite === "%") return `${Math.round(v)} %`;
    if (c.unite === "allure") return fmtKmPace(v);
    if (c.unite === "min") return `${Math.round(v)} min`;
    return String(Math.round(v));
  }
  return Object.freeze({ evaluer, effet, fmt, atteint, REGLES, MESURES });
})();
