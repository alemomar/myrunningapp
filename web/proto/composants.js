/* Prototype V2 « progression » : les composants communs (étape 1 des maquettes Claude Design, validée par Omar le 27/10/2026).
   Chaque composant a une seule forme, partout : menu du bas, ressenti à 10 crans, pastilles de type, ligne de bilan, frise,
   zones, courbe 11a, cases de régularité (révisions du 29/10 : courbe 11a, Ton mois 15a, temps par zone 16c). Rien ici ne lit
   ni n'écrit de données : on reçoit des chiffres, on rend du HTML. */
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

  // Couleur de chaque effort de « Ton niveau » (une couleur = un effort).
  const couleurEffort = (cle) => couleurType({ ef: "Sortie facile", tempo: "Tempo", seuil: "Seuil", frac: "Fractionné" }[cle]);
  // Flèche ↗ des petites tuiles de « Ton niveau » (clignote lentement, coupée si « réduire les animations »).
  const flecheTuile = () => `<svg class="fl-tuile" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`;

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
  // une zone à 0 reste visible, grisée. Les % sont arrondis pour faire 100 pile (29/10).
  // `allures` (facultatif, 29/10) : l'allure moyenne quand le cœur était dans chaque zone (« 7'24 »).
  function zcols(secs, minutes, allures) {
    const pz = Calc.partsZones(secs);
    return `<div class="zcols">${secs.map((v, i) => { const p = pz.pcts[i];
      return `<div class="zcol${p === 0 ? " zero" : ""}" style="--c:${couleurZone(i)}"><span class="p">${p} %</span>${minutes ? `<span class="m">${pz.mins[i]} min</span>` : ""}${allures ? `<span class="a">${allures[i] ? allure(allures[i]) : "—"}</span>` : ""}<span class="n">Zone ${i + 1}</span></div>`; }).join("")}</div>`;
  }
  // 15a · Ton mois (révision du 29/10) : « 61 % en zones 1-2 » en grand, barre 2 couleurs (1-2 citron, 3-5 gris) avec le repère
  // 80 %, puis les 5 zones en petites tuiles groupées comme la barre (1-2 à gauche, 3-5 à droite). Zone à 0 % en gris.
  function partFacile(pz) {
    const seg = (p, c) => (p > 0 ? `<i style="flex:${p};background:${c}"></i>` : "");
    return `<div class="pf"><span class="num pf-v citron">${pz.facilePct} %</span><span class="pf-t">en zones 1-2</span></div>
      <div class="zbarre deux" aria-hidden="true">${seg(pz.facilePct, "var(--accent)")}${seg(pz.soutenuPct, "var(--control-2)")}<span class="repere80" style="left:${R.repereFacilePct}%"><span>repère ${R.repereFacilePct} %</span></span></div>
      <div class="ztuiles">${[[0, 1], [2, 3, 4]].map((g) => `<div style="flex:${g.length}">${g.map((i) => `<div class="zt${pz.pcts[i] ? "" : " zero"}" style="--c:${couleurZone(i)}"><span><i></i>Z${i + 1}</span><b class="num">${pz.pcts[i]} %</b></div>`).join("")}</div>`).join("")}</div>`;
  }
  // 16c · Temps par zone d'une sortie (révision du 29/10) : une colonne par zone, minutes au-dessus (hauteur = temps), « Z1 »
  // dessous, puis l'allure moyenne dans la zone (« — » sans mesure). Zone vide : un trait gris.
  function zcolonnes(mins, allures) {
    const mx = Math.max(...mins, 1);
    return `<div class="zcolonnes">${mins.map((m, i) => `<div class="zk${m ? "" : " zero"}" style="--c:${couleurZone(i)}"><span class="zk-m"><b class="num">${m}</b>min</span><i style="height:${m ? Math.max(6, Math.round(m / mx * 88)) : 4}px"></i><span class="zk-n">Z${i + 1}</span><span class="zk-a num">${allures && allures[i] ? `${allure(allures[i])}<small>/km</small>` : '<span class="zk-rien">—</span>'}</span></div>`).join("")}</div>`;
  }
  // Pastille de verdict : « bien » (citron), « presque » (gris), « trop soutenu » (violet).
  const pastille = (ton, mot) => `<span class="pastille ${esc(ton)}">${esc(mot)}</span>`;
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

  /* ---------- 1.10 · Courbe 11a (révision Claude Design du 29/10, choisie par Omar) ----------
     Un point par mois (un par semaine sur 1 à 3 mois), courbe douce, pointillé horizontal au niveau du départ ; seules la valeur
     de départ (cercle vide) et l'actuelle (point plein) sont écrites ; initiales des mois en bas, ou les dates de début et de fin.
     Mois sans mesure : tronçon en pointillé. Plus de nuage de points ni d'axe gradué. Rapide toujours en haut. */
  function cheminLisse(p) {
    if (p.length < 3) return `M${p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" L")}`;
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
    }
    return d;
  }
  // `serie` : les points de Calc.serieCourbe ({ ts, mois, v } ; v null = rien de mesuré). o : { couleur, rapideEnHaut, fmt,
  // padMin (demi-écart minimal affiché, pour ne pas grossir 2 s en montagne), repere: {v, label}, h, vide, label,
  // axe: "mois" (initiales) ou "dates" (date du départ · « cette semaine ») }.
  let nGrad = 0;
  const INITIALES = "JFMAMJJASOND";
  function dessinCourbe(serie, o) {
    const vals = serie.filter((p) => p.v != null);
    if (vals.length < 2) return { svg: `<div class="cap">${esc(o.vide || "Pas encore assez de mesures pour tracer une courbe.")}</div>`, debut: null, fin: null };
    const W = 326, H = o.h || 118, HAUT = 28, BAS = 24, n = serie.length, c = o.couleur, fmt = o.fmt || ((v) => String(Math.round(v)));
    const vs = vals.map((p) => p.v).concat(o.repere ? [o.repere.v] : []), lo = Math.min(...vs), hi = Math.max(...vs);
    const demi = Math.max((hi - lo) / 2, o.padMin || 1), a = (hi + lo) / 2 - demi, b = (hi + lo) / 2 + demi;
    const X = (i) => 9 + i * (W - 18) / Math.max(n - 1, 1), Y = (v) => { const k = (v - a) / (b - a); return HAUT + (o.rapideEnHaut ? k : 1 - k) * (H - HAUT - BAS); };
    const P = serie.map((p, i) => (p.v == null ? null : [X(i), Y(p.v)]));
    const runs = []; let cur = null;
    P.forEach((q) => { if (q) { if (!cur) runs.push((cur = [])); cur.push(q); } else cur = null; });
    const f2 = (x) => x.toFixed(1), id = `cg${++nGrad}`;
    const pleins = runs.filter((r) => r.length >= 2);
    const aires = pleins.map((r) => `<path d="${cheminLisse(r)} L${f2(r[r.length - 1][0])},${H} L${f2(r[0][0])},${H} Z" fill="url(#${id})"/>`).join("");
    const traits = pleins.map((r) => `<path d="${cheminLisse(r)}" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    const trous = runs.slice(0, -1).map((r, k) => { const p = r[r.length - 1], q = runs[k + 1][0];
      return `<path d="M${f2(p[0])},${f2(p[1])} L${f2(q[0])},${f2(q[1])}" stroke="${c}" stroke-width="2.5" stroke-dasharray="4 5" stroke-linecap="round" opacity=".75" fill="none"/>`; }).join("");
    const iF = P.findIndex(Boolean), iL = P.length - 1 - P.slice().reverse().findIndex(Boolean), F = P[iF], L = P[iL];
    // Étiquettes du côté où la courbe ne passe pas (moyenne des 3 points voisins) : le départ dessous, sauf si la courbe
    // descend ensuite ; l'arrivée dessus, sauf si la courbe arrive d'en haut. Les marges HAUT et BAS leur gardent la place.
    const voisins = (l) => { const v = l.filter(Boolean).slice(0, 3); return v.length ? v.reduce((x, q) => x + q[1], 0) / v.length : null; };
    const vF = voisins(P.slice(iF + 1)), vL = voisins(P.slice(0, iL).reverse());
    const yF = vF != null && vF > F[1] + 2 ? F[1] - 12 : F[1] + 22;
    const yL = vL != null && vL < L[1] - 2 ? L[1] + 24 : L[1] - 13;
    // Repère (5 %, 170) : son étiquette à droite, sinon à gauche, sinon au milieu, là où elle ne touche pas une valeur écrite.
    let rep = "";
    if (o.repere) {
      const yR = Y(o.repere.v), loin = (y) => Math.abs(y - (yR - 5)) > 22;
      // La courbe ne traverse pas l'étiquette : sur ce bout de largeur, tous les points restent du même côté, à distance.
      const libre = (x0, x1) => { const ys = P.filter((q) => q && q[0] >= x0 && q[0] <= x1).map((q) => q[1]); return ys.every((y) => y > yR + 4) || ys.every((y) => y < yR - 20); };
      const [xR, ancre] = loin(yL) && loin(L[1]) && libre(W - 90, W) ? [W - 2, "end"] : loin(yF) && loin(F[1]) && libre(0, 90) ? [2, "start"] : [W / 2, "middle"];
      rep = `<line x1="0" x2="${W}" y1="${f2(yR)}" y2="${f2(yR)}" stroke="#8B8F96" stroke-width="1.2" stroke-dasharray="4 4"/>
        <text x="${f2(xR)}" y="${f2(yR - 5)}" fill="#C9CCD0" font-size="10" font-weight="700" text-anchor="${ancre}">${esc(o.repere.label)}</text>`;
    }
    let axe = "";
    if (o.axe === "dates") axe = `<text x="0" y="${H + 16}" fill="#5A6068" font-size="11.5">${esc(jourMois(serie[0].ts))}</text><text x="${W}" y="${H + 16}" fill="#A3A7AD" font-size="11.5" font-weight="600" text-anchor="end">cette semaine</text>`;
    else {
      let dernierX = -99;
      serie.forEach((p, i) => {
        if (i && p.mois === serie[i - 1].mois) return;
        if (X(i) - dernierX < 13) return;
        dernierX = X(i);
        const actuel = p.mois === serie[n - 1].mois && i >= n - 5;
        axe += `<text x="${f2(X(i))}" y="${H + 16}" fill="${actuel ? "#F2F3F0" : "#5A6068"}" font-size="11"${actuel ? ' font-weight="700"' : ""} text-anchor="middle">${INITIALES[p.mois]}</text>`;
      });
    }
    const svg = `<svg class="courbe11" width="100%" viewBox="0 0 ${W} ${H + 20}" role="img" aria-label="${esc(o.label || "Courbe")} : de ${esc(fmt(vals[0].v))} à ${esc(fmt(vals[vals.length - 1].v))}" style="overflow:visible">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".2"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
      <path d="M${f2(F[0])},${f2(F[1])} H${W - 2}" stroke="#3A4047" stroke-width="1.2" stroke-dasharray="2 5" fill="none"/>
      ${rep}${aires}${trous}${traits}
      <circle cx="${f2(F[0])}" cy="${f2(F[1])}" r="5" fill="#17191C" stroke="${c}" stroke-width="2.5"/>
      <circle cx="${f2(L[0])}" cy="${f2(L[1])}" r="6.5" fill="${c}" stroke="#17191C" stroke-width="3"/>
      <text class="cv" x="${f2(Math.max(F[0] - 4, 0))}" y="${f2(yF)}" fill="#A3A7AD" font-size="15">${esc(fmt(vals[0].v))}</text>
      <text class="cv" x="${f2(Math.min(L[0] + 4, W))}" y="${f2(yL)}" fill="#F2F3F0" font-size="17" text-anchor="end">${esc(fmt(vals[vals.length - 1].v))}</text>
      ${axe}</svg>`;
    return { svg, debut: vals[0].v, fin: vals[vals.length - 1].v, depuis: serie[0].ts, finTs: vals[vals.length - 1].ts };
  }
  // Courbe de Progression : tes mesures une à une → un point par mois (par semaine sur 3 mois), puis le dessin.
  // o : { fin (maintenant), mois (3, 6, 12), min (mesures par point à la semaine, comme Ton niveau ; 1 par mois suffit),
  // finValeur (la valeur en grand, pour que le bout de la courbe soit ce chiffre) }.
  function courbe(points, o) {
    const so = { min: o.mois <= 3 ? o.min : 1 };
    if ("finValeur" in o) so.fin = o.finValeur;
    return dessinCourbe(Calc.serieCourbe(points, o.fin, o.mois, o.mois <= 3 ? "semaine" : "mois", so), { ...o, axe: "mois" });
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
    couleurType, couleurZone, couleurEffort, flecheTuile, pillType, icBilan, bilanLigne, ecartMots, frise, friseTexte, COUL_FRISE, zbarre, zcols, partFacile, zcolonnes, pastille, legendeZones, deuxGrands, verdictBox,
    fondRegu, reguCases, reguBande, crans, dessinCourbe, courbe, courbeCoeur, toast });
})();
