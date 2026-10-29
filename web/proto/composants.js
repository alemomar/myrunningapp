/* Prototype V2 « progression » : les composants communs (étape 1 des maquettes Claude Design, validée par Omar le 27/10/2026).
   Chaque composant a une seule forme, partout : menu du bas, tuile d'allure, carte « Ton conseil », ressenti à 10 crans,
   pastilles de type, ligne de bilan, frise, zones, courbe avec tendance, cases de régularité. Rien ici ne lit ni n'écrit de
   données : on reçoit des chiffres, on rend du HTML. */
const UI = (() => {
  const R = REGLAGES;
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Icônes (traits façon Lucide) ---------- */
  const I = {
    accueil: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    progression: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    sorties: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    haut: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>', bas: '<path d="M12 5v14"/><path d="M5 12l7 7 7-7"/>', egal: '<path d="M5 9h14M5 15h14"/>',
    nouveau: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>', drapeau: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>', chevronBas: '<path d="M6 9l6 6 6-6"/>', chevronHaut: '<path d="M18 15l-6-6-6 6"/>',
    retour: '<path d="M15 18l-6-6 6-6"/>', fermer: '<path d="M6 6l12 12M18 6L6 18"/>', fleche: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    eclat: '<path d="M12 3c.6 4.6 3.4 7.4 8 8-4.6.6-7.4 3.4-8 8-.6-4.6-3.4-7.4-8-8 4.6-.6 7.4-3.4 8-8z"/>', check: '<path d="M5 12l5 5L20 7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    montre: '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
    coeur: '<path d="M12 20s-7-4.4-9.2-8.7A5 5 0 0 1 12 6.4a5 5 0 0 1 9.2 4.9C19 15.6 12 20 12 20z"/>',
    cible: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    donnees: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    telecharger: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    trophee: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9 20h6"/>',
    externe: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>', alerte: '<path d="M12 7v6"/><path d="M12 17h.01"/>',
    horsLigne: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.5 5.2A15 15 0 0 1 22 8.8"/><path d="M5 12.5a10 10 0 0 1 3.6-2M12 9.6a10 10 0 0 1 7 2.9"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="M3 3l18 18"/>',
    menu: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    cadenas: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    jauge: '<path d="M3.5 16a8.5 8.5 0 1 1 17 0"/><path d="M12 16l4.5-5"/>', barres: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
  };
  const ic = (n, t, sw) => `<svg width="${t || 18}" height="${t || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ""}</svg>`;

  /* ---------- Dates et chiffres ---------- */
  const JOUR = 86400000;
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const debutJour = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const jourTxt = (ts) => { const d = new Date(ts); return `${JOURS[d.getDay()]} ${d.getDate() === 1 ? "1er" : d.getDate()} ${MOIS[d.getMonth()]}`; };
  const heureTxt = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateCourte = (ts) => { const d = new Date(ts); return `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MOIS_C[d.getMonth()]}`; };
  const jourMois = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MOIS_C[d.getMonth()]}`; };
  function relatif(ts, now) {
    const n = Math.round((debutJour(now || Date.now()) - debutJour(ts)) / JOUR);
    if (n === 0) return "aujourd'hui"; if (n === 1) return "hier";
    const d = new Date(ts); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_C[d.getMonth()]}${d.getFullYear() !== new Date(now || Date.now()).getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  }
  const memeJour = (a, b) => debutJour(a) === debutJour(b);
  const kmTxt = (km) => Calc.kmTxt(km * 1000);
  function dureeTxt(sec) { const m = Math.round((sec || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; }
  const allure = (s) => (s == null ? "—" : fmtKmPace(s));
  const num = (v, u, cls) => `<span class="num ${cls || ""}">${esc(v)}${u ? `<small>${esc(u)}</small>` : ""}</span>`;

  /* ---------- Couleurs ---------- */
  const couleurType = (lib) => R.couleursTypes[lib] || R.couleursTypes.Autre;
  const couleurZone = (i) => R.zonesCardioCouleurs[i];

  /* ---------- 1.6 · Pastille de type ---------- */
  const pillType = (lib, suite, opts) => `<${opts && opts.bouton ? `button type="button" ${opts.attrs || ""}` : "span"} class="pilule" style="--c:${couleurType(lib)}"><i></i>${esc(lib)}${suite ? ` · ${esc(suite)}` : ""}${opts && opts.bouton ? ic("chevronBas", 15, 2.4) : ""}</${opts && opts.bouton ? "button" : "span"}>`;

  /* ---------- 1.7 · Ligne de bilan ---------- */
  const IC_SENS = { haut: "haut", egal: "egal", bas: "bas", nouveau: "drapeau" };
  const icBilan = (sens, taille) => `<span class="ic-bilan ${sens || "egal"}${taille ? ` ${taille}` : ""}">${ic(IC_SENS[sens] || "egal", taille === "grande" ? 22 : taille === "petite" ? 15 : 19, 2.4)}</span>`;
  const bilanLigne = (v, grand) => `<div class="bilan-ligne">${icBilan(v.sens, grand ? "grande" : null)}<div><div class="bl-titre${grand ? " grand" : ""}">${esc(v.titre)}</div>${v.pourquoi ? `<div class="bl-pq">${esc(v.pourquoi)}</div>` : ""}</div></div>`;

  /* ---------- Écart en mots (jamais de flèches) ---------- */
  // e > 0 : plus rapide. « 3 s plus vite » en citron ; plus lent, stable, nouveau en gris (tuiles) ou violet (pastilles de courbe).
  function ecartMots(e, suffixe) {
    const min = R.repereEcartMinSec, s = suffixe ? ` ${suffixe}` : "";
    const sec = (n) => (n >= 60 ? `${Math.floor(n / 60)} min ${String(n % 60).padStart(2, "0")} s` : `${n} s`);   // « 1 min 59 s » plutôt que « 119 s »
    if (e == null) return { txt: "nouveau", cls: "gris" };
    if (e >= min) return { txt: `${sec(e)} plus vite${s}`, cls: "citron" };
    if (e <= -min) return { txt: `${sec(-e)} plus lent${s}`, cls: "violet" };
    return { txt: `stable${s}`, cls: "gris" };
  }

  /* ---------- 1.2 · Tuile d'allure ---------- */
  function tuileAllure(e, o) {
    const coul = { ef: couleurType("Sortie facile"), tempo: couleurType("Tempo"), seuil: couleurType("Seuil"), frac: couleurType("Fractionné") }[e.cle];
    const em = ecartMots(e.ecart), bougee = o && o.bougee;
    const corps = e.maintenant != null
      ? `${num(allure(e.maintenant), "/km", "ta-v")}
         <span class="ta-e ${bougee ? "bougee" : em.cls === "citron" ? "progres" : ""}">${bougee ? "Bougée aujourd'hui" : esc(em.txt)}</span>
         ${bougee ? "" : `<span class="ta-n">${e.n} ${e.n > 1 ? "sorties" : "sortie"}</span>`}`
      : `<span class="tiret"></span><span class="ta-n" style="color:var(--text-3)">${esc(o && o.vide ? o.vide : e.cle === "frac" ? "Pas de fractionné en 4 semaines" : "bientôt")}</span>`;
    return `<div class="tuile-allure${bougee ? " bougee" : ""}" role="link" tabindex="0" data-go="#/progression/allure/${e.cle}" aria-label="${esc(`${e.nom} : voir la courbe`)}">
      <div class="ta-tete" style="--c:${coul}"><i></i>${esc(e.nom)}${ic("chevron", 15)}</div>${corps}</div>`;
  }

  /* ---------- Ton niveau en lignes (retour d'Omar du 28/10) ----------
     On doit comprendre que c'est le niveau ACTUEL (4 dernières semaines) : une ligne par effort, l'allure d'il y a 3 mois,
     une flèche, puis l'allure d'aujourd'hui en grand. Toute la ligne ouvre la courbe dans Progression. */
  function niveauLignes(liste, o) {
    const opt = o || {}, coul = { ef: couleurType("Sortie facile"), tempo: couleurType("Tempo"), seuil: couleurType("Seuil"), frac: couleurType("Fractionné") };
    const tete = `<div class="nl nl-tete" aria-hidden="true"><span></span><span>il y a<br>3 mois</span><span></span><span>4 dernières<br>semaines</span><span></span></div>`;
    const lignes = liste.map((e) => {
      const em = ecartMots(e.ecart), bougee = opt.bougee === e.cle && e.maintenant != null;
      const sous = e.maintenant == null ? (e.cle === "frac" ? "aucun en 4 semaines" : "pas assez de sorties") : bougee ? "bougée aujourd'hui" : em.txt;
      const cls = e.maintenant == null ? "gris" : bougee ? "blanc" : em.cls === "citron" ? "citron" : "gris";
      return `<div class="nl${bougee ? " bougee" : ""}" role="link" tabindex="0" data-go="#/progression/allure/${e.cle}" aria-label="${esc(`${e.nom} : ${e.avant != null ? `${allure(e.avant)} il y a 3 mois, ` : ""}${e.maintenant != null ? `${allure(e.maintenant)} sur tes 4 dernières semaines` : "pas de mesure"}. Voir la courbe`)}">
        <span class="nl-nom"><span class="ta-tete" style="--c:${coul[e.cle]}"><i></i>${esc(e.nom)}</span><span class="nl-e ${cls}">${esc(sous)}</span></span>
        <span class="num nl-avant">${e.avant != null ? allure(e.avant) : "—"}</span><span class="nl-fl">${ic("fleche", 15)}</span>
        <span class="nl-v">${e.maintenant != null ? num(allure(e.maintenant), "/km", "") : '<span class="num" style="color:var(--faint)">—</span>'}</span><span class="nl-ch">${ic("chevron", 15)}</span></div>`;
    }).join("");
    return `<div class="niv-lignes">${tete}${lignes}</div>`;
  }

  /* ---------- 1.8 · Frise : 3 couleurs, 3 morceaux au plus ---------- */
  const COUL_FRISE = { calme: "#6B7078", facile: "#C6F432", soutenu: "#F7C747" };
  function frise(f, haute) {
    const tot = f.morceaux.reduce((a, c) => a + c.m, 0) || 1;
    return `<div class="frise"${haute ? ' style="height:18px"' : ""} aria-hidden="true">${f.morceaux.map((c) => `<i style="flex:${(c.m / tot).toFixed(4)};background:${COUL_FRISE[c.cat]}"></i>`).join("")}</div>`;
  }
  const friseTexte = (f) => f.morceaux.map((c) => { const t = `${Calc.kmTxt(c.m)} km ${esc(c.mot)}`; return c.cat === "calme" ? t : `<b style="color:${COUL_FRISE[c.cat]}">${t}</b>`; }).join(", ") + ".";

  /* ---------- 1.9 · Zones ---------- */
  // Barre 5 zones (largeurs = parts du temps). o : { pale, labels (% dans la barre), repere (80 %), haute }.
  function zbarre(secs, o) {
    const opt = o || {}, tot = secs.reduce((a, v) => a + v, 0) || 1;
    const segs = secs.map((v, i) => { const p = v / tot * 100; return p < 0.5 ? "" : `<i style="flex:${p.toFixed(2)};background:${couleurZone(i)}${i === 0 && opt.labels ? ";color:var(--text)" : ""}">${opt.labels && p >= 12 ? `${Math.round(p)} %` : ""}</i>`; }).join("");
    const rep = opt.repere ? `<span class="repere80" style="left:${R.repereFacilePct}%"><span>repère ${R.repereFacilePct} %</span></span>` : "";
    return `<div class="zbarre${opt.pale ? " pale" : ""}${opt.haute ? " haute" : ""}"${opt.repere ? ' style="margin-top:16px"' : ""} aria-hidden="true">${segs}${rep}</div>`;
  }
  // 5 colonnes : % en grand, minutes dessous (si demandé), « Zone 1 » à « Zone 5 » (retour d'Omar du 28/10 : pas de noms) ;
  // une zone à 0 reste visible, grisée.
  function zcols(secs, minutes) {
    const tot = secs.reduce((a, v) => a + v, 0) || 1;
    return `<div class="zcols">${secs.map((v, i) => { const p = Math.round(v / tot * 100);
      return `<div class="zcol${p === 0 ? " zero" : ""}" style="--c:${couleurZone(i)}"><span class="p">${p} %</span>${minutes ? `<span class="m">${Math.round(v / 60)} min</span>` : ""}<span class="n">Zone ${i + 1}</span></div>`; }).join("")}</div>`;
  }
  const legendeZones = () => `<div class="leg">${[0, 1, 2, 3, 4].map((i) => `<span style="--c:${couleurZone(i)}">Zone ${i + 1}</span>`).join("")}</div>`;
  // Facile / Soutenu en grand (zones 1-2 et 3-5).
  function deuxGrands(facilePct, soutenuPct) {
    return `<div class="deux-grands"><div><div class="num citron">${Math.round(facilePct)} %</div><div class="txt2" style="font-size:14px;margin-top:4px">en facile · zones 1-2</div></div>
      <div><div class="num">${Math.round(soutenuPct)} %</div><div class="txt2" style="font-size:14px;margin-top:4px">en soutenu · zones 3-5</div></div></div>`;
  }
  const verdictBox = (v) => `<div class="verdict-box ${v.ton}"><span class="vi">${v.ton === "bon" ? ic("check", 15, 3) : "!"}</span><div><b>${esc(v.titre)}</b>${v.phrase ? `<span>${esc(v.phrase)}</span>` : ""}</div></div>`;

  /* ---------- 1.11 · Régularité ---------- */
  const fondRegu = (n) => (n <= 0 ? null : n === 1 ? "rgba(198,244,50,.38)" : n === 2 ? "rgba(198,244,50,.66)" : "#C6F432");
  function reguCases(sem) {
    return `<div class="regu-cases">${sem.map((w, i) => { const f = fondRegu(w.n);
      return `<div class="regu-case${f ? "" : " vide"}${i === sem.length - 1 ? " encours" : ""}"${f ? ` style="background:${f};color:${w.n === 1 ? "var(--text)" : "var(--on-accent)"}"` : ""} title="Semaine du ${jourMois(w.debut)} : ${w.n} ${w.n > 1 ? "sorties" : "sortie"}">${w.n >= 3 ? "3" : w.n || ""}</div>`; }).join("")}</div>`;
  }
  const reguBande = (sem) => `<div class="regu-bande" aria-hidden="true">${sem.map((w, i) => { const f = fondRegu(w.n); return `<i class="${f ? "" : "vide"}${i === sem.length - 1 ? " encours" : ""}"${f ? ` style="background:${f}"` : ""}></i>`; }).join("")}</div>`;

  /* ---------- 1.4 · Ressenti sur 10 : barre à 10 crans, rien de choisi au départ ---------- */
  function crans(v, attrs) {
    const cran = Calc.ressentiCran(v);
    const boutons = Array.from({ length: 10 }, (_, i) => { const n = i + 1;
      return `<button type="button" role="radio" aria-checked="${v === n}" aria-label="${n} sur 10" data-cran="${n}" ${attrs || ""} class="${v != null && n < v ? "plein" : ""}${v === n ? " choisi" : ""}">${n}</button>`; }).join("");
    const dessous = cran ? `<div class="crans-sens" style="--x:${((v - 0.5) * 10).toFixed(1)}%"><b>${esc(cran.mot)}</b><span>${esc(cran.phrase)}</span></div>`
      : `<div class="reperes" style="margin-top:10px"><span>1 · très facile</span><span>5 · je pouvais<br>encore parler</span><span>10 · effort<br>maximal</span></div>`;
    return `<div class="crans" role="radiogroup" aria-label="Ressenti sur 10">${boutons}</div>${dessous}`;
  }

  /* ---------- 1.10 · Courbe avec tendance ----------
     Tendance lissée (moyenne glissante sur 4 semaines) en trait épais, points pâles derrière, valeur de départ à gauche et
     d'arrivée à droite, rapide toujours en haut. o : { debut, fin, couleur, rapideEnHaut, fmt, repere: {v, label}, h, vide, sens }. */
  function cheminLisse(p) {
    if (p.length < 3) return `M${p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" L")}`;
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
    }
    return d;
  }
  function courbe(points, o) {
    const W = 326, H = o.h || 150, brut = points.filter((p) => p.ts >= o.debut && p.ts <= o.fin);
    const lisse = Calc.lisser(points, o.debut, o.fin, 28);
    if (lisse.length < 2) return { svg: `<div class="cap">${esc(o.vide || "Pas encore assez de points pour tracer une tendance.")}</div>`, debut: null, fin: null };
    // Zoom sur la tendance (retour d'Omar du 28/10 : « la courbe devrait être plus zoomée ») : l'échelle suit la courbe lissée,
    // pas les points isolés ; les points hors de l'échelle ne sont pas dessinés.
    const vals = lisse.map((p) => p.v).concat(o.repere ? [o.repere.v] : []);
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max((hi - lo) * 0.22, o.padMin || 1), a = lo - pad, b = hi + pad;
    // La courbe part de ta première mesure de la période (pas de vide à gauche quand tes sorties commencent plus tard).
    const x0 = lisse[0].ts, X = (t) => 34 + (t - x0) / Math.max(o.fin - x0, 1) * (W - 78), Y = (v) => { const k = (v - a) / (b - a); return 16 + (o.rapideEnHaut ? k : 1 - k) * (H - 40); };
    const pts = lisse.map((p) => [X(p.ts), Y(p.v)]), p0 = lisse[0], p1 = lisse[lisse.length - 1];
    const lab = (y, dessus) => (dessus ? (y - 10 < 12 ? y + 20 : y - 10) : (y + 20 > H - 26 ? y - 10 : y + 20));
    const fmt = o.fmt || ((v) => String(Math.round(v)));
    const d0 = new Date(x0), d1 = new Date(o.fin), gris = "#5A6068", an = o.fin - x0 > 200 * JOUR;
    const moisAxe = (d) => `${MOIS_C[d.getMonth()]}${an ? ` ${d.getFullYear()}` : ""}`;
    const rep = o.repere ? `<line x1="30" x2="${W - 6}" y1="${Y(o.repere.v).toFixed(1)}" y2="${Y(o.repere.v).toFixed(1)}" stroke="#8B8F96" stroke-width="1.2" stroke-dasharray="4 4"/>
      <text x="30" y="${(Y(o.repere.v) - 5).toFixed(1)}" fill="#C9CCD0" font-size="10" font-weight="700">${esc(o.repere.label)}</text>` : "";
    const sens = o.sens || "";   // 29/10 : plus de « plus rapide ↑ » (retour d'Omar) ; les lignes d'allure suffisent
    // Lignes horizontales aux allures rondes (retour d'Omar du 29/10) : tous les 10, 15, 30 ou 60 s selon l'écart affiché.
    let grille = "";
    if (o.grille === "allure") {
      const pas = b - a <= 35 ? 10 : b - a <= 80 ? 15 : b - a <= 160 ? 30 : 60;
      for (let v = Math.ceil(a / pas) * pas; v <= b; v += pas) {
        const y = Y(v);
        if (y < 8 || y > H - 26) continue;
        grille += `<line x1="30" x2="${W - 4}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#26292E" stroke-width="1"/><text x="0" y="${(y + 3.5).toFixed(1)}" fill="#8B8F96" font-size="10">${esc(fmt(v))}</text>`;
      }
    }
    const svg = `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || "Courbe")} : de ${esc(fmt(p0.v))} à ${esc(fmt(p1.v))}">
      <line x1="0" x2="${W}" y1="${H - 22}" y2="${H - 22}" stroke="#26292E"/>
      ${sens ? `<text x="${W - 2}" y="9" fill="${gris}" font-size="9.5" text-anchor="end">${esc(sens)}</text>` : ""}
      ${grille}${rep}
      ${brut.filter((p) => p.v >= a && p.v <= b).map((p) => `<circle cx="${X(p.ts).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.8" fill="${o.couleur}" opacity=".32"/>`).join("")}
      <path d="${cheminLisse(pts)}" fill="none" stroke="${o.couleur}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${pts[0][0].toFixed(1)}" cy="${pts[0][1].toFixed(1)}" r="5" fill="#17191C" stroke="${o.couleur}" stroke-width="2.4"/>
      <text x="${(pts[0][0] - 4).toFixed(1)}" y="${lab(pts[0][1], true).toFixed(1)}" fill="#C9CCD0" font-size="11.5" font-weight="700">${esc(fmt(p0.v))}</text>
      <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="5.5" fill="${o.couleur}"/>
      <text x="${(pts[pts.length - 1][0] + 4).toFixed(1)}" y="${lab(pts[pts.length - 1][1], false).toFixed(1)}" fill="#F2F3F0" font-size="12.5" font-weight="700" text-anchor="end">${esc(fmt(p1.v))}</text>
      <text x="2" y="${H - 6}" fill="${gris}" font-size="10">${moisAxe(d0)}</text><text x="${W - 2}" y="${H - 6}" fill="${gris}" font-size="10" text-anchor="end">${moisAxe(d1)}</text></svg>`;
    return { svg, debut: p0.v, fin: p1.v, depuis: x0 };
  }

  /* ---------- Courbe du cœur d'une sortie, sur les bandes de zones (détail) ---------- */
  function courbeCoeur(s, defs) {
    const brut = (s.hr || []).filter((p) => p && p.hr > 0).sort((a, b) => a.t - b.t);
    if (brut.length < 2) return "";
    const pas = Math.max(1, Math.ceil(brut.length / 160)), pts = [];
    for (let i = 0; i < brut.length; i += pas) { const g = brut.slice(i, i + pas); pts.push({ t: g[Math.floor(g.length / 2)].t, hr: g.reduce((a, p) => a + p.hr, 0) / g.length }); }
    const W = 326, H = 150, tmax = Math.max(brut[brut.length - 1].t, 1), hrs = pts.map((p) => p.hr);
    const lo = Math.min(...hrs) - 8, hi = Math.max(Math.max(...hrs) + 8, defs[3].max + 6);
    const X = (t) => 2 + t / tmax * (W - 30), Y = (h) => 6 + (1 - (h - lo) / (hi - lo)) * (H - 30);
    const bandes = defs.map((d, i) => { const bas = Math.max(i === 0 ? lo : defs[i - 1].max, lo), haut = Math.min(i === 4 ? hi : d.max, hi);
      if (haut <= bas) return "";
      const y1 = Y(haut), y2 = Y(bas);
      return `<rect x="2" y="${y1.toFixed(1)}" width="${W - 30}" height="${(y2 - y1).toFixed(1)}" fill="${couleurZone(i)}" opacity="${i === 0 ? 0.06 : 0.11}"/>
        <line x1="2" x2="${W - 28}" y1="${y1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#0C0D0F" stroke-width="1"/>
        ${y2 - y1 > 9 ? `<text x="${W - 2}" y="${((y1 + y2) / 2 + 3.5).toFixed(1)}" fill="${couleurZone(i)}" font-size="10" font-weight="700" text-anchor="end">Z${i + 1}</text>` : ""}`; }).join("");
    const iMax = hrs.indexOf(Math.max(...hrs)), pm = pts[iMax], mn = (sec) => `${Math.round(sec / 60)} min`;
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cœur pendant la sortie, jusqu'à ${Math.round(Math.max(...brut.map((p) => p.hr)))} battements">
      ${bandes}
      <polyline points="${pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.hr).toFixed(1)}`).join(" ")}" fill="none" stroke="#F2F3F0" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="${X(pm.t).toFixed(1)}" cy="${Y(pm.hr).toFixed(1)}" r="3.5" fill="#F2F3F0"/>
      <text x="${X(pm.t).toFixed(1)}" y="${(Y(pm.hr) - 8).toFixed(1)}" fill="#F2F3F0" font-size="11" font-weight="700" text-anchor="middle">${Math.round(Math.max(...brut.map((p) => p.hr)))}</text>
      <text x="2" y="${H - 5}" fill="#5A6068" font-size="10">0</text><text x="${((W - 28) / 2).toFixed(1)}" y="${H - 5}" fill="#5A6068" font-size="10" text-anchor="middle">${mn(tmax / 2)}</text><text x="${W - 28}" y="${H - 5}" fill="#5A6068" font-size="10" text-anchor="end">${mn(tmax)}</text></svg>`;
  }

  /* ---------- Message éphémère ---------- */
  let minuteur = null;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove("cache");
    clearTimeout(minuteur); minuteur = setTimeout(() => t.classList.add("cache"), 2600);
  }

  return Object.freeze({ esc, ic, JOUR, JOURS, MOIS, MOIS_C, debutJour, jourTxt, heureTxt, dateCourte, jourMois, relatif, memeJour, kmTxt, dureeTxt, allure, num,
    couleurType, couleurZone, pillType, icBilan, bilanLigne, ecartMots, tuileAllure, niveauLignes, frise, friseTexte, COUL_FRISE, zbarre, zcols, legendeZones, deuxGrands, verdictBox,
    fondRegu, reguCases, reguBande, crans, courbe, courbeCoeur, toast });
})();
