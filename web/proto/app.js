/* Prototype « refonte progression » (demande d'Omar du 26/10/2026) : les écrans.
   Étape 1 : Accueil, verdict de la dernière sortie, détail d'une sortie (+ connexion et Profil minimal).
   Étapes 2 et 3 : Sorties, puis Progression. Les données viennent de Lecture (lecture seule) ; le ressenti noté ici reste
   sur ce téléphone (stockage local « mra_proto_ressentis »), jamais dans la base. */
(() => {
  const R = REGLAGES;
  const etat = { session: null, email: "", profil: null, sorties: [], courses: [], zones: null, ressentis: {}, erreur: "", pret: false };
  const CLE_RESSENTIS = "mra_proto_ressentis";
  const lireRessentis = () => { try { return JSON.parse(localStorage.getItem(CLE_RESSENTIS) || "{}") || {}; } catch (e) { return {}; } };
  function noterRessenti(id, v) {
    const n = { ...etat.ressentis };
    if (v == null) delete n[id]; else n[id] = v;
    etat.ressentis = n;
    try { localStorage.setItem(CLE_RESSENTIS, JSON.stringify(n)); } catch (e) { /* stockage indisponible : le ressenti vaut pour cette visite */ }
  }

  /* ---------- Petits outils d'affichage ---------- */
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const I = {
    haut: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', egal: '<path d="M5 9h14M5 15h14"/>',
    bas: '<path d="M12 5v14"/><path d="M5 12l7 7 7-7"/>', aucun: '<circle cx="12" cy="12" r="1.5"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>', retour: '<path d="M15 18l-6-6 6-6"/>', fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    accueil: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', progression: '<path d="M3 17l6-6 4 4 8-8"/><path d="M3 21h18"/>',
    sorties: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>', profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    eclat: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>', coeur: '<path d="M12 21s-7-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12C19 16.4 12 21 12 21z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', check: '<path d="M5 12l5 5L20 7"/>',
  };
  const ic = (n, t, sw) => `<svg width="${t || 18}" height="${t || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const jourTxt = (ts) => { const d = new Date(ts); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
  const heureTxt = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  function relatif(ts) {
    const j = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const n = Math.round((j(Date.now()) - j(ts)) / 86400000);
    if (n === 0) return "aujourd'hui"; if (n === 1) return "hier";
    const d = new Date(ts); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_C[d.getMonth()]}`;
  }
  const km = (s) => Calc.kmTxt(s.dist * 1000);
  function dureeTxt(sec) {
    const m = Math.round((sec || 0) / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
  }
  const tuile = (l, v, u, h) => `<div class="tuile"><span class="l">${esc(l)}</span><span class="v">${esc(v)}${u ? `<small>${esc(u)}</small>` : ""}</span>${h ? `<span class="h">${esc(h)}</span>` : ""}</div>`;
  const pastille = (sens, grande) => `<span class="pastille ${sens || "aucun"}${grande ? " grande" : ""}">${ic(sens || "aucun", grande ? 22 : 18, 2.4)}</span>`;
  const COUL_FACILE = "#C6F432", COUL_SOUTENU = "#E2B04A", COUL_CALME = "#5A6068";

  // Mini-frise « facile / soutenu » (Accueil) : échauffement et retour au calme en gris.
  function friseFacileSoutenu(dec) {
    const coul = (sg) => sg.role ? COUL_CALME : R.zonesFaciles.includes(sg.zone) ? COUL_FACILE : COUL_SOUTENU;
    const tot = dec.segments.reduce((a, sg) => a + sg.m, 0);
    const facile = dec.segments.filter((sg) => !sg.role && R.zonesFaciles.includes(sg.zone)).reduce((a, sg) => a + sg.m, 0);
    const calme = dec.segments.filter((sg) => sg.role).reduce((a, sg) => a + sg.m, 0);
    return `<div class="frise" aria-hidden="true">${dec.segments.map((sg) => `<i style="flex:${(sg.m / tot).toFixed(4)};background:${coul(sg)}"></i>`).join("")}</div>
      <div class="legende">${calme ? `<span style="--c:${COUL_CALME}">${Calc.kmTxt(calme)} km calme</span>` : ""}${facile ? `<span style="--c:${COUL_FACILE}">${Calc.kmTxt(facile)} km facile</span>` : ""}${dec.soutenuM ? `<span style="--c:${COUL_SOUTENU}">${Calc.kmTxt(dec.soutenuM)} km soutenu</span>` : ""}</div>`;
  }
  // Frise détaillée (détail) : une couleur par zone d'allure, échauffement et retour au calme en gris.
  function friseZones(dec) {
    const tot = dec.segments.reduce((a, sg) => a + sg.m, 0);
    const coul = (sg) => sg.role ? COUL_CALME : R.zonesCouleurs[sg.zone];
    const nom = (sg) => sg.role === "echauffement" ? "échauffement" : sg.role === "retour" ? "retour au calme" : R.zonesNoms[sg.zone].toLowerCase();
    return `<div class="frise" style="height:18px" aria-hidden="true">${dec.segments.map((sg) => `<i style="flex:${(sg.m / tot).toFixed(4)};background:${coul(sg)}"></i>`).join("")}</div>
      <div class="legende">${dec.segments.map((sg) => `<span style="--c:${coul(sg)}">${Calc.kmTxt(sg.m)} km ${nom(sg)}</span>`).join("")}</div>`;
  }

  /* ---------- Connexion ---------- */
  function connexionHTML() {
    return `<header class="tete"><div class="sur">MyRunningApp</div><h1>Prototype</h1></header>
      <form class="carte" id="fConnexion" autocomplete="on">
        <p class="com">Connecte-toi avec ton compte MyRunningApp : même e-mail, même mot de passe. Le prototype lit tes sorties, il ne modifie rien.</p>
        <div class="champ"><label for="cEmail">E-mail</label><input id="cEmail" type="email" autocomplete="username" autocapitalize="none" required></div>
        <div class="champ"><label for="cMdp">Mot de passe</label><input id="cMdp" type="password" autocomplete="current-password" required></div>
        <div class="erreur" id="cErreur" role="alert">${esc(etat.erreur)}</div>
        <button type="submit" class="btn-primaire" id="cBouton">Se connecter</button>
      </form>`;
  }
  async function seConnecter(e) {
    e.preventDefault();
    const b = document.getElementById("cBouton"); b.disabled = true; b.textContent = "Connexion…";
    const { session, error } = await Lecture.connexion(document.getElementById("cEmail").value.trim(), document.getElementById("cMdp").value);
    if (error || !session) { etat.erreur = "E-mail ou mot de passe incorrect."; rendre(); return; }
    etat.erreur = ""; etat.session = session; etat.email = session.user?.email || "";
    await demarrer();
  }

  /* ---------- Accueil ---------- */
  function verdictLigne(v) {
    return `<div class="verdict-ligne">${pastille(v.sens)}<span class="t">${esc(v.titre)}</span></div>`;
  }
  function derniereHTML(s) {
    const v = Calc.verdict(s, etat.courses, etat.ressentis);
    const dec = Calc.decoupage(s, etat.zones);
    const res = Calc.ressentiDe(s, etat.ressentis);
    return `<div class="carte" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}" aria-label="Voir le détail de ta dernière sortie">
        <div class="carte-tete"><span class="sur">Ta dernière sortie · ${esc(relatif(s.ts))}</span><span style="color:var(--muted)">${ic("chevron", 16)}</span></div>
        ${verdictLigne(v)}
        <div class="tuiles">${tuile("Distance", km(s), "km")}${tuile("Durée", fmtDur(s.dur))}${tuile("Allure", Calc.allureTxt(s.allure), "/km")}</div>
        ${dec ? friseFacileSoutenu(dec) : `<div class="com">Pas de découpage : ta montre n'a pas envoyé l'allure détaillée.</div>`}
        ${res != null ? `<div class="com">Ressenti : <b style="color:var(--text)">${res}/10</b>, ${esc(Calc.ressentiMot(res))}</div>` : ""}
      </div>
      <button type="button" class="btn-primaire" data-go="#/verdict/${esc(s.id)}">${ic("eclat", 18)}Voir le verdict de ma dernière sortie</button>`;
  }
  function semaineHTML(now) {
    const w = Calc.semaine(etat.sorties, now, etat.zones);
    const c = w.cette, d = w.derniere, m = w.moyenne;
    const ligne = (lab, n, kmv, sec) => `<div class="compare">${lab} : <b>${Calc.kmTxt(n * 1000).replace(",0", "")} ${n > 1 ? "sorties" : "sortie"}</b> · <b>${Calc.kmTxt(kmv * 1000)} km</b> · <b>${dureeTxt(sec)}</b></div>`;
    const tot = w.facileSec + w.soutenuSec;
    const rep = tot > 0 ? `<div class="repart" aria-hidden="true"><i style="width:${100 - w.soutenuPct}%;background:${COUL_FACILE}"></i><i style="width:${w.soutenuPct}%;background:${COUL_SOUTENU}"></i></div>
      <div class="legende"><span style="--c:${COUL_FACILE}">facile ${100 - w.soutenuPct} %</span><span style="--c:${COUL_SOUTENU}">soutenu ${w.soutenuPct} %</span></div>` : "";
    return `<section class="carte" aria-label="Ta semaine">
        <div class="sur">Ta semaine</div>
        <div class="chiffres3"><div><div class="v">${c.n}</div><div class="l">${c.n > 1 ? "sorties" : "sortie"}</div></div><div><div class="v">${Calc.kmTxt(c.km * 1000)} km</div><div class="l">distance</div></div><div><div class="v">${dureeTxt(c.sec).toUpperCase()}</div><div class="l">durée</div></div></div>
        ${ligne("Semaine dernière", d.n, d.km, d.sec)}
        ${m.n != null ? ligne(`Moyenne des ${R.semaineMoyenneSemaines} semaines d'avant`, Math.round(m.n * 10) / 10, m.km, m.sec) : ""}
        ${rep}
        <div class="message neutre" style="background:transparent;padding:0">${ic("eclat", 16)}<span>${esc(w.phrase)}</span></div>
      </section>`;
  }
  function repereBadge(rp) {
    if (rp.ecart == null) return `<span class="badge egal">pas encore de comparaison</span>`;
    if (rp.ecart >= R.repereEcartMinSec) return `<span class="badge haut">−${rp.ecart} s en 3 mois</span>`;
    if (rp.ecart <= -R.repereEcartMinSec) return `<span class="badge bas">+${-rp.ecart} s en 3 mois</span>`;
    return `<span class="badge egal">stable en 3 mois</span>`;
  }
  function repereLigneHTML(now) {
    const rp = Calc.repere(etat.courses, now);
    const corps = rp.etat === "bientot"
      ? `<div class="com">Encore ${rp.manque} ${rp.manque > 1 ? "sorties faciles" : "sortie facile"} sur 4 semaines pour mesurer ton allure de départ.</div>`
      : `<div class="repere"><span class="v">${Calc.allureTxt(rp.valeur)}</span><span class="com">/km</span>${repereBadge(rp)}</div>
         <div class="com">${rp.modeCoeur ? `Ton allure facile à effort égal (cœur à ${rp.fcRef}).` : "Ton allure médiane en sortie facile (sans cœur fiable)."}</div>`;
    return `<div class="carte" role="link" tabindex="0" data-go="#/progression" aria-label="Ta progression">
        <div class="carte-tete"><span class="sur">Ta progression · ton repère</span><span style="color:var(--muted)">${ic("chevron", 16)}</span></div>${corps}</div>`;
  }
  function accueilHTML() {
    const now = Date.now();
    const prenom = String((etat.profil && etat.profil.pseudo) || "").trim();
    const derniere = etat.courses[etat.courses.length - 1];
    return `<header class="tete"><div class="sur">${esc(jourTxt(now))}</div><h1>${prenom ? `Salut ${esc(prenom)}` : "Salut"}</h1></header>
      ${derniere ? derniereHTML(derniere) : `<div class="carte"><div class="sur">Ta dernière sortie</div><p class="com">Pas encore de course reçue.</p></div>`}
      ${semaineHTML(now)}
      ${repereLigneHTML(now)}`;
  }

  /* ---------- Verdict après une sortie ---------- */
  function verdictHTML(s) {
    const v = Calc.verdict(s, etat.courses, etat.ressentis);
    const dec = Calc.decoupage(s, etat.zones);
    const local = etat.ressentis[s.id], res = Calc.ressentiDe(s, etat.ressentis);
    const reps = R.ressentiReperes;
    const tuiles = v.tuiles.map((t) => tuile(t.label, t.valeur, t.unite, t.habitude ? `habitude : ${t.habitude}` : null)).join("");
    return `<div class="haut-ecran"><header class="tete"><div class="sur">${esc(jourTxt(s.ts))} · ${esc(heureTxt(s.ts))}</div><h1>Bravo pour ta course !</h1></header>
        <button type="button" class="fermer" data-go="#/accueil" aria-label="Fermer">${ic("fermer", 18)}</button></div>
      <section class="carte">
        <div class="puces"><span class="puce"><i></i>${esc(Calc.libelleType(s, dec))} · ${km(s)} km</span></div>
        <div style="display:flex;gap:12px;align-items:flex-start">${pastille(v.sens, true)}<div style="display:flex;flex-direction:column;gap:6px">
          <div class="verdict-titre">${esc(v.titre)}</div><div style="color:var(--text-2)">${esc(v.phrase)}</div></div></div>
        <div class="tuiles ${v.tuiles.length > 1 ? "deux" : ""}" style="${v.tuiles.length === 1 ? "grid-template-columns:1fr" : ""}">${tuiles}</div>
        ${v.note ? `<div class="message neutre">${ic("info", 16)}<span>${esc(v.note)}</span></div>` : ""}
      </section>
      <section class="carte curseur-zone" aria-label="Ton ressenti">
        <div style="font-weight:600;font-size:16px">Comment tu l'as sentie ?</div>
        <div class="curseur-val"><span class="v" id="rVal">${res != null ? res : "—"}</span><span class="com">/10 <span id="rMot">${res != null ? esc(Calc.ressentiMot(res)) : "facultatif"}</span></span></div>
        <input type="range" id="rCurseur" min="1" max="10" step="1" value="${res != null ? res : 5}" aria-label="Ressenti sur 10">
        <div class="reperes"><span>1 · ${esc(reps[1])}</span><span>5 · ${esc(reps[5])}</span><span>10 · ${esc(reps[10])}</span></div>
        <div class="com">${local != null ? `Gardé sur ce téléphone seulement. <button type="button" class="lien-discret" id="rEffacer">Effacer</button>`
          : res != null ? "Noté dans l'app. Bouge le curseur pour le changer ici (gardé sur ce téléphone seulement)." : "Facultatif, gardé sur ce téléphone seulement."}</div>
      </section>
      <section class="carte" style="flex-direction:row;gap:10px;align-items:flex-start"><span style="color:var(--accent);margin-top:2px">${ic("eclat", 18)}</span>
        <div><div class="sur" style="margin-bottom:4px">La prochaine fois</div><div>${esc(Calc.conseil(s, v))}</div></div></section>`;
  }
  function brancherVerdict(s) {
    const c = document.getElementById("rCurseur");
    if (c) {
      c.addEventListener("input", () => { document.getElementById("rVal").textContent = c.value; document.getElementById("rMot").textContent = Calc.ressentiMot(Number(c.value)); });
      c.addEventListener("change", () => { noterRessenti(s.id, Number(c.value)); rendre(true); });
    }
    const ef = document.getElementById("rEffacer");
    if (ef) ef.addEventListener("click", () => { noterRessenti(s.id, null); rendre(true); });
    afficherBas(`<button type="button" class="btn-primaire" data-go="#/sortie/${esc(s.id)}">Voir le détail ${ic("chevron", 18)}</button>`);
  }

  /* ---------- Détail d'une sortie ---------- */
  function bloc(titre, contenu, commentaire) {
    return `<section class="carte"><h2>${esc(titre)}</h2>${contenu}${commentaire ? `<div class="com com-sep">${commentaire}</div>` : ""}</section>`;
  }
  function courbeCoeur(s) {
    const pts = s.hr.filter((p) => p && p.hr > 0).sort((a, b) => a.t - b.t);
    const W = 326, H = 120, tmax = Math.max(pts[pts.length - 1].t, 1);
    const lo = Math.min(...pts.map((p) => p.hr)) - 5, hi = Math.max(...pts.map((p) => p.hr)) + 5;
    const X = (t) => 4 + (t / tmax) * (W - 8), Y = (h) => 8 + (1 - (h - lo) / (hi - lo)) * (H - 30);
    const line = pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.hr).toFixed(1)}`).join(" ");
    const mn = (sec) => `${Math.round(sec / 60)} min`;
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cœur pendant la sortie, de ${Math.round(lo + 5)} à ${Math.round(hi - 5)} battements">
      <line x1="0" x2="${W}" y1="${Y(hi - 5).toFixed(1)}" y2="${Y(hi - 5).toFixed(1)}" stroke="#26292E"/><line x1="0" x2="${W}" y1="${Y(lo + 5).toFixed(1)}" y2="${Y(lo + 5).toFixed(1)}" stroke="#26292E"/>
      <text x="${W}" y="${(Y(hi - 5) - 3).toFixed(1)}" fill="#8B8F96" font-size="10" text-anchor="end">${Math.round(hi - 5)}</text><text x="${W}" y="${(Y(lo + 5) - 3).toFixed(1)}" fill="#8B8F96" font-size="10" text-anchor="end">${Math.round(lo + 5)}</text>
      <polyline points="${line}" fill="none" stroke="#FF645F" stroke-width="1.8" stroke-linejoin="round"/>
      <text x="4" y="${H - 4}" fill="#8B8F96" font-size="10">0</text><text x="${W / 2}" y="${H - 4}" fill="#8B8F96" font-size="10" text-anchor="middle">${mn(tmax / 2)}</text><text x="${W - 4}" y="${H - 4}" fill="#8B8F96" font-size="10" text-anchor="end">${mn(tmax)}</text></svg>`;
  }
  function detailHTML(s) {
    const v = Calc.verdict(s, etat.courses, etat.ressentis);
    const dec = Calc.decoupage(s, etat.zones);
    const res = Calc.ressentiDe(s, etat.ressentis);
    let html = `<div class="haut-ecran" style="align-items:center"><button type="button" class="retour" data-retour aria-label="Retour">${ic("retour", 18)}</button>
        <header class="tete" style="flex:1"><div class="sur">${esc(jourTxt(s.ts))} · ${esc(heureTxt(s.ts))}</div><h1>${esc(Calc.libelleType(s, dec))}</h1></header>
        <span class="com" style="text-align:right;font-size:12px">classée<br>automatiquement</span></div>`;
    // 1 · En-tête
    html += `<section class="carte">${verdictLigne(v)}
        <div class="tuiles">${tuile("Distance", km(s), "km")}${tuile("Durée", fmtDur(s.dur))}${tuile("Allure", Calc.allureTxt(s.allure), "/km")}</div>
        ${res != null ? `<div class="puces"><span class="puce" style="--c:var(--text-3)"><i></i>Ressenti : ${res}/10, ${esc(Calc.ressentiMot(res))}</span></div>` : ""}
        <div class="com com-sep">${esc(v.phrase)}${v.note ? ` ${esc(v.note)}` : ""}</div></section>
      <div class="sec-titre">Ce qui explique le verdict</div>`;
    // 2 · Découpage
    html += dec ? bloc("Ta sortie en un coup d'œil", friseZones(dec) + `<div style="color:var(--text-2)">${esc(dec.texte.charAt(0).toUpperCase() + dec.texte.slice(1))}.</div>`, esc(dec.commentaire))
      : bloc("Ta sortie en un coup d'œil", "", "Pas de découpage : ta montre n'a pas envoyé l'allure détaillée pour cette sortie (moins d'une mesure par minute).");
    // 3 · Temps par zone d'allure
    if (dec && etat.zones) {
      const lib = Calc.zonesLibelles(etat.zones), max = Math.max(...dec.tempsParZone, 1);
      const lignes = lib.map((z, i) => `<div class="barre-zone"><div class="n">${esc(z.nom)}<small>${esc(z.plage)}</small></div><div class="piste"><i style="width:${(dec.tempsParZone[i] / max * 100).toFixed(1)}%;background:${z.couleur}"></i></div><div class="v">${Math.round(dec.tempsParZone[i] / 60)} MIN</div></div>`).join("");
      html += bloc("Temps par zone d'allure", `<div style="display:flex;flex-direction:column;gap:12px">${lignes}</div>`, `Zones calculées à partir de ${esc(etat.zones.source)}.`);
    }
    // 4 · Allure par km
    const ks = s.type === "Fractionné" ? null : kmSplits({ paceSeries: s.pace, distanceKm: s.dist, durationSec: s.dur, type: "EF" });
    if (ks) {
      const rapide = Math.min(...ks.kms);
      const rows = ks.kms.map((sec, i) => `<div class="km${i === ks.fastest ? " rapide" : ""}"><span>Km ${i + 1}</span><span class="piste"><i style="width:${kmSplitBarPct(sec, rapide).toFixed(1)}%"></i></span><span class="p">${fmtKmPace(sec)}</span></div>`).join("")
        + (ks.partial ? `<div class="km"><span>${String(ks.partial.km).replace(".", ",")} km</span><span class="piste"><i style="width:${kmSplitBarPct(ks.partial.pace, rapide).toFixed(1)}%"></i></span><span class="p">${fmtKmPace(ks.partial.pace)}</span></div>` : "");
      html += bloc("Allure par km", `<div class="message">${ic("check", 16)}<span>${esc(kmSplitsMessage(ks))}</span></div><div style="display:flex;flex-direction:column;gap:8px">${rows}</div>`,
        `Plus lent : km ${ks.slowest + 1} (${fmtKmPace(ks.kms[ks.slowest])}) · plus rapide : km ${ks.fastest + 1} (${fmtKmPace(ks.kms[ks.fastest])}).`);
    } else {
      html += bloc("Allure par km", "", s.type === "Fractionné" ? "Pas d'allure par km pour un fractionné : ce sont les blocs d'effort qui comptent." : "Pas d'allure par km : il faut au moins 3 km et l'allure détaillée de ta montre.");
    }
    // 5 · Évolution sur cette distance
    const ev = Calc.evolution(s, etat.courses);
    html += bloc("Évolution sur cette distance", `<div style="color:var(--text);font-size:16px">${esc(ev.texte)}</div>`,
      "Comparée à tes sorties du même type et de distance proche, d'il y a 6 à 10 semaines. Pas de classement.");
    // 6 · Ressenti face à la mesure
    html += bloc("Ton ressenti face à la mesure", `<div style="color:var(--text);font-size:16px">${esc(Calc.ressentiFaceMesure(s, v, etat.ressentis))}</div>`,
      "Le ressenti se note dans le verdict, sur 10. Il reste sur ce téléphone.");
    // 7 · Cœur
    if (Calc.coeurFiable(s) && s.fc) {
      const fmax = Calc.fcMaxEffective(etat.profil, etat.courses), frepos = etat.profil && etat.profil.resting_hr ? Number(etat.profil.resting_hr) : null;
      let zonesC = "";
      if (fmax) {
        const { secs, defs } = computeHrZoneSeconds(s.hr, fmax, frepos), mx = Math.max(...secs, 1);
        zonesC = `<div style="display:flex;flex-direction:column;gap:10px">${defs.map((d, i) => `<div class="barre-zone"><div class="n">${esc(d.label)}<small>${i === 4 ? `plus de ${defs[3].max}` : `jusqu'à ${d.max}`} bpm</small></div><div class="piste"><i style="width:${(secs[i] / mx * 100).toFixed(1)}%;background:${d.color}"></i></div><div class="v">${Math.round(secs[i] / 60)} MIN</div></div>`).join("")}</div>`;
      }
      const der = cardiacDrift({ hrSeries: s.hr, paceSeries: s.pace, durationSec: s.dur, type: s.type });
      const cad = cadenceShown(s.cad, s.type);
      const t2 = (l, v, u, h) => tuile(l, v, u, h);
      html += bloc("Cœur", `<div class="sur" style="color:var(--coral);display:flex;gap:6px;align-items:center">${ic("coeur", 14)}Ton cœur pendant la sortie</div>${courbeCoeur(s)}${zonesC}
          <div class="tuiles deux">${t2("Dérive cardiaque", der ? `${der.pct} %` : "—", "", der ? DRIFT_LABELS[der.state] : "non mesurée")}${t2("Cadence", cad || "—", cad ? "pas/min" : "", null)}</div>
          <div class="tuiles deux">${t2("FC moyenne", Math.round(s.fc), "bpm", null)}${t2("FC max", s.fcMax ? Math.round(s.fcMax) : "—", s.fcMax ? "bpm" : "", null)}</div>`,
        esc(der ? cardiacDriftText(der) : "Dérive non mesurée : il faut une sortie facile d'au moins 40 min, à allure régulière.") + (fmax ? ` Zones cardio calculées avec une FC max de ${fmax}${frepos ? ` et une FC de repos de ${frepos}` : ""}.` : ""));
    } else {
      html += bloc("Cœur", `<div class="message neutre">${ic("info", 16)}<span>Données cardio partielles avec ta montre : le verdict s'appuie sur ton allure et ton ressenti.</span></div>`,
        s.fc ? `FC moyenne : ${Math.round(s.fc)} bpm${s.fcMax ? `, FC max : ${Math.round(s.fcMax)} bpm` : ""} (justes, calculées par ta montre).` : "");
    }
    return html;
  }

  /* ---------- Sorties, Progression (étapes 2 et 3), Profil ---------- */
  const bientotHTML = (titre, etape, texte) => `<header class="tete"><div class="sur">Prototype · étape ${etape}</div><h1>${esc(titre)}</h1></header><div class="carte"><p class="com">${esc(texte)}</p></div>`;
  function profilHTML() {
    return `<header class="tete"><div class="sur">Ton compte</div><h1>Profil</h1></header>
      <section class="carte"><div class="sur">Connecté avec</div><div style="font-size:16px;word-break:break-all">${esc(etat.email || "—")}</div>
        <div class="com">${etat.courses.length} courses lues, ${etat.sorties.length - etat.courses.length} autres séances. Rien n'est modifié dans ton compte.</div></section>
      <button type="button" class="btn-second" id="deconnexion">Se déconnecter (sur ce téléphone seulement)</button>`;
  }

  /* ---------- Navigation ---------- */
  const ONGLETS = [["accueil", "Accueil"], ["progression", "Progression"], ["sorties", "Sorties"], ["profil", "Profil"]];
  function afficherBas(html) { const b = document.getElementById("basFixe"); b.innerHTML = html; b.classList.toggle("cache", !html); }
  function rendre(garderDefilement) {
    const app = document.getElementById("app"), nav = document.getElementById("onglets");
    afficherBas("");
    if (!etat.session) { nav.classList.add("cache"); app.innerHTML = connexionHTML(); document.getElementById("fConnexion").addEventListener("submit", seConnecter); return; }
    if (!etat.pret) { app.innerHTML = `<p class="vide">${etat.erreur ? esc(etat.erreur) : "Lecture de tes sorties…"}</p>`; return; }
    const [, vue, id] = (location.hash || "#/accueil").split("/");
    const s = id ? etat.sorties.find((x) => String(x.id) === decodeURIComponent(id)) : null;
    const plein = vue === "verdict" || vue === "sortie";
    nav.classList.toggle("cache", plein);
    nav.innerHTML = ONGLETS.map(([k, l]) => `<button type="button" data-go="#/${k}" class="${(vue || "accueil") === k ? "actif" : ""}"${(vue || "accueil") === k ? ' aria-current="page"' : ""}>${ic(k, 22)}${l}</button>`).join("");
    const y = window.scrollY;
    if (vue === "verdict" && s) { app.innerHTML = verdictHTML(s); brancherVerdict(s); }
    else if (vue === "sortie" && s) app.innerHTML = detailHTML(s);
    else if (vue === "sorties") app.innerHTML = bientotHTML("Sorties", 2, "La liste de tes sorties par mois, avec leur type classé automatiquement et l'icône du verdict, arrive à l'étape 2.");
    else if (vue === "progression") app.innerHTML = bientotHTML("Progression", 3, "Ton repère en grand (allure facile à effort égal sur 3, 6 et 12 mois), le volume par mois, la régularité, la dérive et la cadence dans le temps et tes records arrivent à l'étape 3.");
    else if (vue === "profil") { app.innerHTML = profilHTML(); document.getElementById("deconnexion").addEventListener("click", async () => { await Lecture.deconnexion(); location.hash = "#/accueil"; location.reload(); }); }
    else app.innerHTML = accueilHTML();
    window.scrollTo(0, garderDefilement ? y : 0);
  }
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-retour]"); if (r) { if (history.length > 1) history.back(); else location.hash = "#/accueil"; return; }
    const g = e.target.closest("[data-go]"); if (g) location.hash = g.getAttribute("data-go");
  });
  document.addEventListener("keydown", (e) => { const g = e.target.closest && e.target.closest("[data-go][role=link]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = g.getAttribute("data-go"); } });
  window.addEventListener("hashchange", () => rendre(false));

  async function charger() {
    const banc = window.__PROTO_BANC__;   // banc de captures local seulement (jamais publié)
    if (banc) { etat.profil = banc.profil || {}; etat.email = banc.email || ""; installer(banc.runs || []); return true; }
    const [runs, prof] = await Promise.all([
      Lecture.lire("runs", "id,start_date,type,apple_type,distance_km,duration_sec,avg_hr,peak_hr,avg_cadence,pain_ratings,include_in_stats,hr_series,pace_series", { trierPar: "start_date" }),
      Lecture.lire("profiles", "pseudo,age,max_hr,resting_hr,goals,program_settings", { unSeul: true }),
    ]);
    if (runs.error) { etat.erreur = `Pas pu lire tes sorties : ${runs.error.message}`; return false; }
    etat.profil = prof.data || {};
    installer(runs.data || []);
    return true;
  }
  function installer(rows) {
    etat.sorties = rows.map(Calc.versSortie).filter((s) => !Number.isNaN(s.ts)).sort((a, b) => a.ts - b.ts);
    etat.courses = etat.sorties.filter(Calc.estCourse);
    etat.zones = Calc.zonesAllure(etat.profil, etat.sorties, Date.now());
  }
  async function demarrer() {
    etat.pret = false; rendre();
    etat.pret = await charger(); rendre();
  }

  (async () => {
    etat.ressentis = lireRessentis();
    if (window.__PROTO_BANC__) { etat.session = { banc: true }; await demarrer(); return; }
    etat.session = await Lecture.session();
    if (etat.session) { etat.email = etat.session.user?.email || ""; await demarrer(); } else rendre();
  })();
})();
