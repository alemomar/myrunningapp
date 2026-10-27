/* Prototype « refonte progression » (demande d'Omar du 26/10/2026) : les écrans.
   Accueil (où tu en es, dernière sortie, ta semaine), bilan après une sortie, détail d'une sortie, Sorties, Progression
   (Allure, Cœur, Courses), Profil. 26/10, retours d'Omar : bilan toujours donné et nommé « bilan », plus de gros bouton sur
   l'Accueil, découpage en 3 couleurs, zones cardio 1 à 5 en haut du détail, allures par effort, sous-onglets, Profil rempli.
   Les données viennent de Lecture (lecture seule) ; le ressenti noté ici reste sur ce téléphone (« mra_proto_ressentis »). */
(() => {
  const R = REGLAGES, JOUR = 86400000;
  const etat = { session: null, email: "", profil: null, sorties: [], courses: [], zones: null, ressentis: {}, erreur: "", pret: false, filtre: "toutes", periode: 3 };
  const CLE_RESSENTIS = "mra_proto_ressentis", CLE_BILAN_VU = "mra_proto_bilan_vu";
  const lireLocal = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v == null ? defaut : v; } catch (e) { return defaut; } };
  const ecrireLocal = (cle, v) => { try { localStorage.setItem(cle, v); } catch (e) { /* stockage indisponible : vaut pour cette visite */ } };
  function noterRessenti(id, v) {
    const n = { ...etat.ressentis };
    if (v == null) delete n[id]; else n[id] = v;
    etat.ressentis = n; ecrireLocal(CLE_RESSENTIS, JSON.stringify(n));
  }
  const bilanDe = (s) => Calc.verdict(s, etat.courses, etat.ressentis, null, etat.zones);

  /* ---------- Petits outils d'affichage ---------- */
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const I = {
    haut: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', egal: '<path d="M5 9h14M5 15h14"/>',
    bas: '<path d="M12 5v14"/><path d="M5 12l7 7 7-7"/>', aucun: '<circle cx="12" cy="12" r="1.5"/>', nouveau: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>', retour: '<path d="M15 18l-6-6 6-6"/>', fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    accueil: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', progression: '<path d="M3 17l6-6 4 4 8-8"/><path d="M3 21h18"/>',
    sorties: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>', profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    eclat: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>', coeur: '<path d="M12 21s-7-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12C19 16.4 12 21 12 21z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', check: '<path d="M5 12l5 5L20 7"/>',
    allure: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-3M12 2v3"/>', calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  };
  const ic = (n, t, sw) => `<svg width="${t || 18}" height="${t || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || I.aucun}</svg>`;
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const jourTxt = (ts) => { const d = new Date(ts); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
  const heureTxt = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  function relatif(ts) {
    const j = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const n = Math.round((j(Date.now()) - j(ts)) / JOUR);
    if (n === 0) return "aujourd'hui"; if (n === 1) return "hier";
    const d = new Date(ts); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_C[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  }
  const km = (s) => Calc.kmTxt(s.dist * 1000);
  function dureeTxt(sec) {
    const m = Math.round((sec || 0) / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
  }
  const tuile = (l, v, u, h) => `<div class="tuile"><span class="l">${esc(l)}</span><span class="v">${esc(v)}${u ? `<small>${esc(u)}</small>` : ""}</span>${h ? `<span class="h">${esc(h)}</span>` : ""}</div>`;
  const pastille = (sens, grande) => `<span class="pastille ${sens || "aucun"}${grande ? " grande" : ""}">${ic(sens || "aucun", grande ? 22 : 18, 2.4)}</span>`;
  const COUL = { calme: "#5A6068", facile: "#C6F432", soutenu: "#E2B04A" };
  const bloc = (titre, contenu, commentaire) => `<section class="carte"><h2>${esc(titre)}</h2>${contenu}${commentaire ? `<div class="com com-sep">${commentaire}</div>` : ""}</section>`;
  const badgeEcart = (e, min, mois) => e == null ? `<span class="badge egal">pas encore de comparaison</span>`
    : e >= min ? `<span class="badge haut">−${e} s en ${mois || 3} mois</span>` : e <= -min ? `<span class="badge bas">+${-e} s en ${mois || 3} mois</span>` : `<span class="badge egal">stable en ${mois || 3} mois</span>`;

  // Frise du découpage en 3 couleurs (calme, facile, soutenu) et sa légende en totaux.
  function frise(dec, haute) {
    const tot = dec.segments.reduce((a, c) => a + c.m, 0);
    const leg = [["calme", dec.calmeM, "calme"], ["facile", dec.facileM, "facile"], ["soutenu", dec.soutenuM, "soutenu"]].filter((x) => x[1] >= 50);
    return `<div class="frise"${haute ? ' style="height:18px"' : ""} aria-hidden="true">${dec.segments.map((c) => `<i style="flex:${(c.m / tot).toFixed(4)};background:${COUL[c.cat]}"></i>`).join("")}</div>
      <div class="legende">${leg.map(([cat, m, mot]) => `<span style="--c:${COUL[cat]}">${Calc.kmTxt(m)} km ${mot}</span>`).join("")}</div>`;
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
  const verdictLigne = (v) => `<div class="verdict-ligne">${pastille(v.sens)}<span class="t">${esc(v.titre)}</span></div>`;
  // Ton niveau (choix B d'Omar, 27/10) : tes allures EF / Tempo / Seuil des 4 dernières semaines, et les sorties faites.
  const ORDRE_TYPES = ["Sortie facile", "Sortie longue", "Tempo", "Seuil", "Fractionné", "Course"];
  const COURT_TYPE = { "Sortie facile": "EF", "Sortie longue": "Longue", Tempo: "Tempo", Seuil: "Seuil", "Fractionné": "Fractionné", Course: "Course" };
  const couleurType = (t) => R.couleursTypes[t] || "var(--faint)";
  function flecheEcart(e) {
    if (e == null) return `<span class="niv-e egal">nouveau</span>`;
    if (e >= R.repereEcartMinSec) return `<span class="niv-e haut">${ic("haut", 12, 2.6)}${e} s</span>`;
    if (e <= -R.repereEcartMinSec) return `<span class="niv-e bas">${ic("bas", 12, 2.6)}${-e} s</span>`;
    return `<span class="niv-e egal">${ic("egal", 12, 2.6)}stable</span>`;
  }
  function niveauHTML(now) {
    const fm = fcMax(), defs = fm ? hrZoneDefs(fm.valeur, fcRepos()) : null;
    const liste = Calc.alluresParEffort(etat.courses, now, 3, etat.zones, defs);
    const coul = { ef: couleurType("Sortie facile"), tempo: couleurType("Tempo"), seuil: couleurType("Seuil"), frac: couleurType("Fractionné") };
    // 2 lignes : EF et Tempo, puis Seuil et Fractionné (retour d'Omar du 27/10). Toucher une allure ouvre sa courbe dans Progression.
    const tuiles = `<div class="niv-grille">${liste.map((e) => `<div class="niv" role="link" tabindex="0" data-go="#/progression/allure/${e.cle}" aria-label="${esc(`${e.nom} : voir la courbe`)}">
        <span class="niv-n" style="color:${coul[e.cle]}">${esc(e.nom)}</span>
        <span class="niv-v">${e.maintenant != null ? Calc.allureTxt(e.maintenant) : "—"}${e.maintenant != null ? "<small>/km</small>" : ""}</span>
        ${e.maintenant != null ? flecheEcart(e.ecart) : `<span class="niv-e egal">${e.cle === "frac" ? "pas de fractionné" : "pas de passage"}</span>`}
        <span class="niv-z">${esc(e.cle === "frac" ? "blocs d'effort" : `cœur en ${e.zone}`)}</span></div>`).join("")}</div>`;
    const types = Calc.typesSur(etat.sorties, now, 28, etat.zones);
    const total = Object.values(types).reduce((a, v) => a + v, 0);
    const puces = ORDRE_TYPES.filter((t) => types[t] || ["Sortie facile", "Tempo", "Seuil", "Fractionné"].includes(t))
      .map((t) => `<span class="type-puce${types[t] ? "" : " zero"}" style="--c:${couleurType(t)}"><i></i><b>${types[t] || 0}</b> ${esc(COURT_TYPE[t])}</span>`).join("");
    return `<section class="carte" aria-label="Ton niveau">
        <div class="carte-tete"><span class="sur">Ton niveau · 4 dernières semaines</span></div>
        ${tuiles}
        <div class="com">EF, Tempo, Seuil : l'allure que tu tiens quand ton cœur est en zone 2, 3 ou 4. Fractionné : l'allure de tes blocs d'effort. Flèche : face aux mêmes 4 semaines il y a 3 mois. Touche une allure pour voir sa courbe.</div>
        <div class="sur" style="margin-top:2px">${total} ${total > 1 ? "sorties" : "sortie"} en 4 semaines</div><div class="type-puces">${puces}</div>
      </section>`;
  }
  function derniereHTML(s) {
    const v = bilanDe(s), dec = Calc.decoupage(s, etat.zones), res = Calc.ressentiDe(s, etat.ressentis), lib = Calc.libelleType(s, dec);
    return `<div class="carte" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}" aria-label="Voir le détail de ta dernière sortie">
        <div class="carte-tete"><span class="sur">Ta dernière sortie · ${esc(relatif(s.ts))}</span><span class="puce" style="padding:3px 9px;--c:${couleurType(lib)}"><i></i>${esc(lib)}</span></div>
        ${verdictLigne(v)}
        <div class="tuiles">${tuile("Distance", km(s), "km")}${tuile("Durée", fmtDur(s.dur))}${tuile("Allure", Calc.allureTxt(s.allure), "/km")}</div>
        ${dec ? frise(dec) : ""}
        ${res != null ? `<div class="com">Ressenti : <b style="color:var(--text)">${res}/10</b>, ${esc(Calc.ressentiMot(res))}</div>` : ""}
        <button type="button" class="btn-primaire" data-go="#/sortie/${esc(s.id)}">Voir le détail de ta course ${ic("chevron", 18)}</button>
      </div>`;
  }
  // Ton mois (remplace « Ta semaine », retour d'Omar du 27/10) : volume face au mois dernier, ton effort en zones 1 à 5 en grand,
  // et la phrase mise en avant (27/10 : « pas assez mis en valeur »).
  function moisHTML(now) {
    const fm = fcMax(), m = Calc.mois(etat.sorties, now, fm ? fm.valeur : null, fcRepos());
    const c = m.ce, a = m.avant, tot = m.secs.reduce((x, v) => x + v, 0);
    const ecart = (v, ref, fmt) => ref == null ? "" : v > ref ? `+${fmt(v - ref)}` : v < ref ? `−${fmt(ref - v)}` : "=";
    const zones = tot > 0 && m.defs ? `<div class="sur" style="margin-top:2px">Ton effort ce mois-ci</div>
        <div class="zones-grille">${m.secs.map((v, i) => `<div class="zone-tuile" style="--c:${m.defs[i].color}"><span class="zt-v">${Math.round(v / tot * 100)}<small>%</small></span><span class="zt-z">Zone ${i + 1}</span><span class="zt-n">${esc(R.zonesCardioEffort[i])}</span></div>`).join("")}</div>
        <div class="zones-barre" aria-hidden="true">${m.secs.map((v, i) => v > 0 ? `<i style="flex:${(v / tot).toFixed(4)};background:${m.defs[i].color}"></i>` : "").join("")}</div>` : "";
    const ton = m.pctFacile == null || !c.n ? "neutre" : m.pctFacile >= R.moisFacileBienPct ? "bon" : m.pctFacile >= R.moisFacileMinPct ? "neutre" : "attention";
    return `<section class="carte" aria-label="Ton mois">
        <div class="sur">Ton mois · ${esc(MOIS[new Date(m.debut).getMonth()])}</div>
        <div class="chiffres3"><div><div class="v">${Calc.kmTxt(c.km * 1000)} km</div><div class="l">${esc(ecart(c.km, a.km, (x) => `${Calc.kmTxt(x * 1000)} km`))} vs mois dernier</div></div>
          <div><div class="v">${c.n}</div><div class="l">${c.n > 1 ? "sorties" : "sortie"} (${a.n} le mois dernier)</div></div>
          <div><div class="v">${dureeTxt(c.sec).toUpperCase()}</div><div class="l">de course</div></div></div>
        ${zones}
        <div class="phrase-forte ${ton}">${ic(ton === "attention" ? "info" : "eclat", 18)}<span>${esc(m.phrase)}</span></div>
      </section>`;
  }
  // Ta régularité (27/10 : le graphique empilé n'était pas compris) : une case par semaine, le nombre de sorties dedans,
  // plus la case est claire plus il y a eu de sorties.
  function regulariteGrilleHTML(now) {
    const sem = Calc.sortiesParSemaine(etat.sorties, now, 12), avec = sem.filter((w) => w.n > 0).length, serie = Calc.serie(etat.sorties, now);
    const fond = (n) => n <= 0 ? "var(--control)" : n === 1 ? "rgba(198,244,50,.35)" : n === 2 ? "rgba(198,244,50,.68)" : "#C6F432";
    const date = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MOIS_C[d.getMonth()]}`; };
    return `<div class="regu-tete"><span class="regu-grand">${avec}</span><span class="regu-txt">semaines sur 12<br>avec au moins une sortie</span>${serie > 1 ? `<span class="regu-serie">${ic("eclat", 13)}${serie} semaines d'affilée</span>` : ""}</div>
      <div class="regu-grille">${sem.map((w, i) => `<div class="regu-case${i === 11 ? " encours" : ""}" style="background:${fond(w.n)};color:${w.n >= 3 ? "#0C0D0F" : w.n ? "var(--text)" : "var(--faint)"}" title="Semaine du ${date(w.debut)} : ${w.n} ${w.n > 1 ? "sorties" : "sortie"}">${w.n || "·"}</div>`).join("")}</div>
      <div class="reperes"><span>sem. du ${esc(date(sem[0].debut))}</span><span>sem. du ${esc(date(sem[6].debut))}</span><span>cette semaine</span></div>
      <div class="legende regu-leg"><span>Sorties dans la semaine :</span>${[0, 1, 2, 3].map((n) => `<span class="regu-ech" style="background:${fond(n)};color:${n >= 3 ? "#0C0D0F" : n ? "var(--text)" : "var(--faint)"}">${n === 3 ? "3+" : n}</span>`).join("")}</div>`;
  }
  const regulariteHTML = (now) => `<section class="carte" role="link" tabindex="0" data-go="#/progression/courses" aria-label="Ta régularité">
      <div class="carte-tete"><span class="sur">Ta régularité · 12 dernières semaines</span><span style="color:var(--muted)">${ic("chevron", 16)}</span></div>${regulariteGrilleHTML(now)}</section>`;
  function accueilHTML() {
    const now = Date.now(), prenom = String((etat.profil && etat.profil.pseudo) || "").trim();
    const derniere = etat.courses[etat.courses.length - 1];
    return `<header class="tete"><div class="sur">${esc(jourTxt(now))}</div><h1>${prenom ? `Salut ${esc(prenom)}` : "Salut"}</h1></header>
      ${niveauHTML(now)}
      ${derniere ? derniereHTML(derniere) : `<div class="carte"><div class="sur">Ta dernière sortie</div><p class="com">Pas encore de course reçue.</p></div>`}
      ${moisHTML(now)}
      ${regulariteHTML(now)}`;
  }

  /* ---------- Bilan après une sortie ---------- */
  function bilanHTML(s) {
    const v = bilanDe(s), dec = Calc.decoupage(s, etat.zones);
    const local = etat.ressentis[s.id], res = Calc.ressentiDe(s, etat.ressentis), reps = R.ressentiReperes;
    const tuiles = v.tuiles.map((t) => tuile(t.label, t.valeur, t.unite, t.habitude ? `habitude : ${t.habitude}` : null)).join("");
    return `<div class="haut-ecran"><header class="tete"><div class="sur">${esc(jourTxt(s.ts))} · ${esc(heureTxt(s.ts))}</div><h1>Bravo pour ta course !</h1></header>
        <button type="button" class="fermer" data-go="#/accueil" aria-label="Fermer">${ic("fermer", 18)}</button></div>
      <section class="carte">
        <div class="carte-tete"><span class="sur">Ton bilan</span><span class="puce"><i></i>${esc(Calc.libelleType(s, dec))} · ${km(s)} km</span></div>
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
  function brancherBilan(s) {
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
  function courbeCoeur(s) {
    const pts = s.hr.filter((p) => p && p.hr > 0).sort((a, b) => a.t - b.t);
    const W = 326, H = 120, tmax = Math.max(pts[pts.length - 1].t, 1);
    const lo = Math.min(...pts.map((p) => p.hr)) - 5, hi = Math.max(...pts.map((p) => p.hr)) + 5;
    const X = (t) => 4 + (t / tmax) * (W - 8), Y = (h) => 8 + (1 - (h - lo) / (hi - lo)) * (H - 30);
    const mn = (sec) => `${Math.round(sec / 60)} min`;
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cœur pendant la sortie, de ${Math.round(lo + 5)} à ${Math.round(hi - 5)} battements">
      <line x1="0" x2="${W}" y1="${Y(hi - 5).toFixed(1)}" y2="${Y(hi - 5).toFixed(1)}" stroke="#26292E"/><line x1="0" x2="${W}" y1="${Y(lo + 5).toFixed(1)}" y2="${Y(lo + 5).toFixed(1)}" stroke="#26292E"/>
      <text x="${W}" y="${(Y(hi - 5) - 3).toFixed(1)}" fill="#8B8F96" font-size="10" text-anchor="end">${Math.round(hi - 5)}</text><text x="${W}" y="${(Y(lo + 5) - 3).toFixed(1)}" fill="#8B8F96" font-size="10" text-anchor="end">${Math.round(lo + 5)}</text>
      <polyline points="${pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.hr).toFixed(1)}`).join(" ")}" fill="none" stroke="#FF645F" stroke-width="1.8" stroke-linejoin="round"/>
      <text x="4" y="${H - 4}" fill="#8B8F96" font-size="10">0</text><text x="${W / 2}" y="${H - 4}" fill="#8B8F96" font-size="10" text-anchor="middle">${mn(tmax / 2)}</text><text x="${W - 4}" y="${H - 4}" fill="#8B8F96" font-size="10" text-anchor="end">${mn(tmax)}</text></svg>`;
  }
  const fcMax = () => Calc.fcMaxEffective(etat.profil, etat.courses);
  const fcRepos = () => (etat.profil && etat.profil.resting_hr ? Number(etat.profil.resting_hr) : null);
  // Barres « Zone 1 … Zone 5 » (temps et part), pour une sortie ou une période.
  function barresZonesCardio(secs, defs, enPct) {
    const mx = Math.max(...secs, 1), tot = secs.reduce((a, v) => a + v, 0) || 1;
    const val = (v) => enPct ? `${Math.round(v / tot * 100)} %` : `${Math.round(v / 60)} MIN`;
    return `<div style="display:flex;flex-direction:column;gap:10px">${defs.map((d, i) => `<div class="barre-zone"><div class="n">${esc(d.label)} · ${esc(R.zonesCardioEffort[i])}<small>${i === 0 ? `jusqu'à ${d.max}` : i === 4 ? `plus de ${defs[3].max}` : `${defs[i - 1].max + 1} à ${d.max}`} bpm</small></div><div class="piste"><i style="width:${(secs[i] / mx * 100).toFixed(1)}%;background:${d.color}"></i></div><div class="v">${val(secs[i])}</div></div>`).join("")}</div>`;
  }
  function coeurBlocHTML(s) {
    if (!(Calc.coeurFiable(s) && s.fc)) {
      return bloc("Cœur", `<div class="message neutre">${ic("info", 16)}<span>Données cardio partielles avec ta montre : le bilan s'appuie sur ton allure et ton ressenti.</span></div>`,
        s.fc ? `FC moyenne : ${Math.round(s.fc)} bpm${s.fcMax ? `, FC max : ${Math.round(s.fcMax)} bpm` : ""} (justes, calculées par ta montre).` : "");
    }
    const fm = fcMax(), fr = fcRepos();
    let zones = "";
    if (fm) { const { secs, defs } = computeHrZoneSeconds(s.hr, fm.valeur, fr); zones = `<div class="sur" style="margin-top:4px">Temps par zone</div>${barresZonesCardio(secs, defs, false)}`; }
    const der = cardiacDrift({ hrSeries: s.hr, paceSeries: s.pace, durationSec: s.dur, type: s.type });
    const tuiles = [tuile("FC moyenne", Math.round(s.fc), "bpm", null), tuile("FC max", s.fcMax ? Math.round(s.fcMax) : "—", s.fcMax ? "bpm" : "", null)];
    if (der) tuiles.push(tuile("Dérive cardiaque", `${der.pct} %`, "", DRIFT_LABELS[der.state]));
    return bloc("Cœur", `${courbeCoeur(s)}${zones}<div class="tuiles ${tuiles.length === 2 ? "deux" : ""}">${tuiles.join("")}</div>`,
      esc((der ? `${cardiacDriftText(der)} ` : "") + (fm ? `Zones calculées avec une FC max de ${fm.valeur} (${fm.source})${fr ? ` et une FC de repos de ${fr}` : ""}.` : "")));
  }
  function detailHTML(s) {
    const v = bilanDe(s), dec = Calc.decoupage(s, etat.zones), res = Calc.ressentiDe(s, etat.ressentis), cad = cadenceShown(s.cad, s.type);
    let html = `<div class="haut-ecran" style="align-items:center"><button type="button" class="retour" data-retour aria-label="Retour">${ic("retour", 18)}</button>
        <header class="tete" style="flex:1"><div class="sur">${esc(jourTxt(s.ts))} · ${esc(heureTxt(s.ts))}</div><h1>${esc(Calc.libelleType(s, dec))}</h1></header>
        <span class="com" style="text-align:right;font-size:12px">classée<br>automatiquement</span></div>`;
    // En-tête : le bilan, les chiffres, le ressenti et la cadence.
    const puces = [res != null ? `Ressenti : ${res}/10, ${Calc.ressentiMot(res)}` : null, cad ? `Cadence : ${cad} pas/min` : null].filter(Boolean);
    html += `<section class="carte">${verdictLigne(v)}
        <div class="tuiles">${tuile("Distance", km(s), "km")}${tuile("Durée", fmtDur(s.dur))}${tuile("Allure", Calc.allureTxt(s.allure), "/km")}</div>
        ${puces.length ? `<div class="puces">${puces.map((p) => `<span class="puce" style="--c:var(--text-3)"><i></i>${esc(p)}</span>`).join("")}</div>` : ""}
        <div class="com com-sep">${esc(v.phrase)}${v.note ? ` ${esc(v.note)}` : ""}</div></section>`;
    // Le cœur remonte en haut (retour d'Omar du 26/10).
    html += coeurBlocHTML(s);
    html += `<div class="sec-titre">Ce qui explique ton bilan</div>`;
    html += dec ? bloc("Ta sortie en un coup d'œil", frise(dec, true) + `<div style="color:var(--text-2)">${esc(dec.texte)}</div>`, esc(dec.commentaire))
      : bloc("Ta sortie en un coup d'œil", "", "Pas de découpage : ta montre n'a pas envoyé l'allure détaillée pour cette sortie (moins d'une mesure par minute).");
    // Allure par km (inchangée).
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
    const ev = Calc.evolution(s, etat.courses);
    html += bloc("Évolution sur cette distance", `<div style="color:var(--text);font-size:16px">${esc(ev.texte)}</div>`,
      "Comparée à tes sorties du même type et de distance proche, d'il y a 6 à 10 semaines. Pas de classement.");
    html += bloc("Ton ressenti face à la mesure", `<div style="color:var(--text);font-size:16px">${esc(Calc.ressentiFaceMesure(s, v, etat.ressentis))}</div>`,
      "Le ressenti se note dans le bilan, sur 10. Il reste sur ce téléphone.");
    return html;
  }

  /* ---------- Sorties ---------- */
  const COUL_TYPE = { "Sortie facile": "#C6F432", "Sortie longue": "#44E7EF", Seuil: "#D9894A", Tempo: "#E2B04A", "Fractionné": "#FF8A3D", Course: "#FF645F" };
  const MOIS_MAJ = (d) => MOIS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "");
  const pastillePetite = (sens) => `<span class="pastille ${sens}" style="width:30px;height:30px">${ic(sens, 15, 2.4)}</span>`;
  function ligneSortie(s) {
    const d = new Date(s.ts), date = `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MOIS_C[d.getMonth()]}`;
    if (!Calc.estCourse(s)) {
      const quoi = s.dist > 0.2 ? `${km(s)} km` : dureeTxt(s.dur);
      return `<div class="ligne"><i class="pt" style="background:var(--faint)"></i><div class="m"><b>${esc(s.type === "Other" ? "Autre" : s.type)} · ${esc(quoi)}</b><span>${esc(date)}</span></div><span class="pv">pas de bilan</span></div>`;
    }
    const dec = s.type === "Seuil" ? Calc.decoupage(s, etat.zones) : null, lib = Calc.libelleType(s, dec), v = bilanDe(s);
    return `<div class="ligne" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}"><i class="pt" style="background:${COUL_TYPE[lib] || "var(--faint)"}"></i>
      <div class="m"><b>${esc(lib)} · ${km(s)} km</b><span>${esc(date)}</span></div><span class="al">${Calc.allureTxt(s.allure)}</span>${pastillePetite(v.sens || "aucun")}</div>`;
  }
  function sortiesHTML() {
    const f = etat.filtre;
    const liste = etat.sorties.slice().reverse().filter((s) => f === "toutes" || (f === "courses" ? Calc.estCourse(s) : !Calc.estCourse(s)));
    const groupes = [];
    liste.forEach((s) => { const d = new Date(s.ts), k = d.getFullYear() * 12 + d.getMonth(); let g = groupes[groupes.length - 1]; if (!g || g.k !== k) { g = { k, d, items: [] }; groupes.push(g); } g.items.push(s); });
    const seg = [["toutes", "Toutes"], ["courses", "Courses"], ["autres", "Autres"]].map(([k, l]) => `<button type="button" data-filtre="${k}" class="${f === k ? "actif" : ""}" aria-pressed="${f === k}">${l}</button>`).join("");
    return `<header class="tete"><h1>Sorties</h1></header>
      <div class="segments" role="group" aria-label="Filtrer les sorties">${seg}</div>
      ${groupes.length ? groupes.map((g) => { const c = g.items.filter(Calc.estCourse);
        const sous = f === "autres" ? `${g.items.length} ${g.items.length > 1 ? "séances" : "séance"}` : `${c.length} ${c.length > 1 ? "courses" : "course"} · ${Calc.kmTxt(c.reduce((a, s) => a + s.dist, 0) * 1000)} km`;
        return `<section class="carte" style="gap:0;padding-top:16px;padding-bottom:6px"><div class="carte-tete" style="padding-bottom:10px"><h2>${esc(MOIS_MAJ(g.d))}</h2><span class="com">${sous}</span></div>${g.items.map(ligneSortie).join("")}</section>`; }).join("")
        : `<p class="vide">Rien à afficher.</p>`}
      <div class="com" style="padding:0 4px">Ton bilan : ${ic("haut", 13)} plus facile ou plus rapide que d'habitude · ${ic("egal", 13)} dans ta moyenne · ${ic("bas", 13)} plus dure ou plus lente · ${ic("nouveau", 13)} première de ce type.</div>`;
  }

  /* ---------- Progression : Allure, Cœur, Courses ---------- */
  function courbe(points, o) {
    const W = 326, H = o.h || 110, pts = points.slice().sort((a, b) => a.ts - b.ts);
    if (pts.length < 2) return `<div class="com">${esc(o.vide || "Pas encore assez de points pour tracer une courbe.")}</div>`;
    const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), pad = Math.max((hi - lo) * 0.15, o.padMin || 1);
    const a = lo - pad, b = hi + pad, t0 = pts[0].ts, t1 = pts[pts.length - 1].ts;
    const X = (t) => 6 + (t - t0) / Math.max(t1 - t0, 1) * (W - 44), Y = (v) => { const k = (v - a) / (b - a); return 8 + (o.inverse ? k : 1 - k) * (H - 28); };
    const ligne = o.points ? "" : `<polyline points="${pts.map((p) => `${X(p.ts).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")}" fill="none" stroke="${o.couleur}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    const ronds = o.points ? pts.map((p) => `<circle cx="${X(p.ts).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3.5" fill="${o.couleur}"/>`).join("") : `<circle cx="${X(t1).toFixed(1)}" cy="${Y(pts[pts.length - 1].v).toFixed(1)}" r="5" fill="${o.couleur}"/>`;
    const d0 = new Date(t0), d1 = new Date(t1);
    // Courbe de tendance (retour d'Omar du 27/10 : « on a du mal à lire l'évolution ») : droite des moindres carrés, en pointillé.
    let tend = "";
    if (o.tendance && pts.length >= 3) {
      const lr = linearRegression(pts.map((p) => ({ x: (p.ts - t0) / 86400000, y: p.v }))), j1 = (t1 - t0) / 86400000;
      const y0 = Math.max(a, Math.min(b, lr.intercept)), y1 = Math.max(a, Math.min(b, lr.intercept + lr.slope * j1));
      tend = `<line x1="${X(t0).toFixed(1)}" y1="${Y(y0).toFixed(1)}" x2="${X(t1).toFixed(1)}" y2="${Y(y1).toFixed(1)}" stroke="${o.couleur}" stroke-width="2.4" stroke-dasharray="6 5" opacity=".75"/>`;
    }
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">
      <line x1="0" x2="${W - 38}" y1="${Y(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}" stroke="#26292E"/><line x1="0" x2="${W - 38}" y1="${Y(lo).toFixed(1)}" y2="${Y(lo).toFixed(1)}" stroke="#26292E"/>
      <text x="${W}" y="${(Y(hi) + 3).toFixed(1)}" fill="#8B8F96" font-size="10" text-anchor="end">${esc(o.fmt(hi))}</text><text x="${W}" y="${(Y(lo) + 3).toFixed(1)}" fill="#8B8F96" font-size="10" text-anchor="end">${esc(o.fmt(lo))}</text>
      ${tend}${ligne}${ronds}
      <text x="6" y="${H - 3}" fill="#8B8F96" font-size="10">${MOIS_C[d0.getMonth()]}</text><text x="${W - 44}" y="${H - 3}" fill="#8B8F96" font-size="10" text-anchor="end">${MOIS_C[d1.getMonth()]}</text></svg>`;
  }
  const resume = (x, u, fmt) => x.maintenant == null ? `Il faut au moins 3 sorties mesurées sur 8 semaines (${x.nMaintenant} pour l'instant).`
    : `Médiane des 8 dernières semaines : ${fmt(x.maintenant)}${u}${x.avant != null ? ` (il y a 3 mois : ${fmt(x.avant)}${u})` : ""}.`;
  function progressionAllure(now, mois) {
    const { rp, points } = Calc.repereCourbe(etat.courses, now, mois), capTxt = Calc.cap(etat.profil);
    let repere;
    if (rp.etat === "bientot") repere = `<div class="sur">Ton repère · allure facile</div><div class="verdict-titre" style="color:var(--faint);font-size:44px">Bientôt</div>
        <div class="com">Encore ${rp.manque} ${rp.manque > 1 ? "sorties faciles" : "sortie facile"} sur 4 semaines pour mesurer ton allure de départ.</div>`;
    else {
      const e = rp.ecart, phrase = e == null ? `Pas encore de sorties faciles il y a ${mois} mois pour comparer.`
        : Math.abs(e) < R.repereEcartMinSec ? `À effort égal, tu cours au même rythme qu'il y a ${mois} mois.`
        : `À effort égal, tu cours ${Math.abs(e)} s/km ${e > 0 ? "plus vite" : "plus lentement"} qu'il y a ${mois} mois.`;
      repere = `<div class="sur">Ton repère · allure facile${rp.modeCoeur ? " à effort égal" : ""} · ces 4 dernières semaines</div>
        <div class="repere"><span class="v" style="font-size:56px">${Calc.allureTxt(rp.valeur)}</span><span class="com" style="font-family:var(--cond);font-weight:600;font-size:18px">/KM</span><span style="margin-left:auto">${badgeEcart(rp.ecart, R.repereEcartMinSec, mois)}</span></div>
        <div style="color:var(--text-2)">${esc(phrase)}</div>
        ${courbe(points, { couleur: "#C6F432", inverse: true, fmt: (v) => fmtKmPace(v), padMin: 3, label: "Ton allure facile à effort égal sur la période" })}
        ${capTxt ? `<div class="com com-sep" style="display:flex;gap:8px;align-items:center"><span style="color:var(--accent)">${ic("eclat", 15)}</span><span>Ton cap : <b style="color:var(--text)">${esc(capTxt)}</b></span></div>` : ""}
        <div class="com">${rp.modeCoeur ? `Chaque point : la médiane de tes sorties faciles des 4 semaines précédentes, ramenées à un même cœur (${rp.fcRef}, ta FC habituelle en facile).` : "Chaque point : la médiane de l'allure de tes sorties faciles des 4 semaines précédentes."}</div>`;
    }
    // Tes allures par effort : EF, Tempo, Seuil (cœur en zone 2, 3, 4) et Fractionné (blocs d'effort), une courbe chacune.
    const fm = fcMax(), defs = fm ? hrZoneDefs(fm.valeur, fcRepos()) : null;
    const coulE = { ef: couleurType("Sortie facile"), tempo: couleurType("Tempo"), seuil: couleurType("Seuil"), frac: couleurType("Fractionné") };
    const liste = Calc.alluresParEffort(etat.courses, now, mois, etat.zones, defs, null, mois);
    const efforts = liste.map((e, i) => `<div class="effort${i ? " sep" : ""}" id="graphe-${e.cle}"><div class="carte-tete"><div><b style="font-size:16px;color:${coulE[e.cle]}">${esc(e.nom)}</b> <span class="com">${esc(e.detail)}</span></div></div>
          ${e.maintenant != null ? `<div class="repere"><span class="v">${Calc.allureTxt(e.maintenant)}</span><span class="com">/km</span><span style="margin-left:auto">${badgeEcart(e.ecart, R.repereEcartMinSec, mois)}</span></div>`
            : `<div class="com">${e.cle === "frac" ? "Pas de fractionné sur les 4 dernières semaines." : !defs ? "Renseigne ta FC max ou ton âge pour lire l'effort au cœur." : `Pas assez de passages en ${esc(e.zone)} sur 4 semaines (${e.n} ${e.n > 1 ? "sorties" : "sortie"}, il en faut ${R.effortMinSorties}).`}</div>`}
          ${courbe(e.points, { couleur: coulE[e.cle], points: true, tendance: true, inverse: true, fmt: (v) => fmtKmPace(v), padMin: 4, h: 100, label: `Allure ${e.nom}`, vide: e.cle === "frac" ? "Pas de fractionné sur la période." : "Pas encore de passages sur la période." })}</div>`).join("");
    const recs = Calc.records(etat.sorties);
    return `<section class="carte">${repere}</section>
      ${bloc("Tes allures par effort", efforts, `EF, Tempo, Seuil : l'allure que tu tiens quand ton cœur est en zone 2, 3 ou 4, même au milieu d'une sortie mixte. Fractionné : l'allure de tes blocs d'effort. Valeur : médiane des 4 dernières semaines, comparée aux mêmes 4 semaines il y a ${mois} mois. Pointillés : la tendance sur la période.`)}
      <section class="carte"><h2>Mes records</h2><div class="tuiles deux">${recs.map((r) => `<div class="tuile"${r.id ? ` role="link" tabindex="0" data-go="#/sortie/${esc(r.id)}"` : ""}><span class="l">${esc(r.label)}</span><span class="v"${r.valeur ? "" : ' style="color:var(--faint)"'}>${esc(r.valeur || "à venir")}</span>${r.ts ? `<span class="h">${esc(relatif(r.ts))}</span>` : ""}</div>`).join("")}</div>
        <div class="com com-sep">Temps ramené à la distance exacte, sur tes courses de 5 km, 10 km, semi et marathon (à 5 % près).</div></section>`;
  }
  function progressionCoeur(now, mois) {
    const fm = fcMax(), fr = fcRepos();
    let zones = `<div class="com">Renseigne ta FC max ou ton âge pour voir tes zones.</div>`;
    if (fm) {
      const z = Calc.zonesCardioPeriode(etat.courses, now, mois, fm.valeur, fr), tot = z.secs.reduce((a, v) => a + v, 0);
      zones = z.n ? barresZonesCardio(z.secs, z.defs, true) + `<div class="com">${Math.round((z.secs[0] + z.secs[1]) / Math.max(tot, 1) * 100)} % de ton temps en zones 1 et 2 (facile), sur ${z.n} ${z.n > 1 ? "sorties" : "sortie"} au cœur fiable · ${dureeTxt(tot)} au total.</div>`
        : `<div class="com">Pas de sortie au cœur fiable sur la période.</div>`;
    }
    const cm = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.coeurMoyen), der = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.derive);
    return `${bloc("Temps par zone sur la période", zones, fm ? esc(`Zones calculées avec une FC max de ${fm.valeur} (${fm.source})${fr ? ` et une FC de repos de ${fr}` : ""}.`) : "")}
      ${bloc("Ton cœur moyen en sortie facile", courbe(cm.points, { couleur: "#FF645F", points: true, tendance: true, fmt: (v) => `${Math.round(v)}`, padMin: 2, label: "Cœur moyen de tes sorties faciles", vide: "Pas encore de sortie facile au cœur fiable sur la période." }),
        esc(resume(cm, " bpm", (v) => Math.round(v))) + " À allure égale, un cœur qui baisse est un signe de progrès.")}
      ${bloc("Dérive cardiaque", courbe(der.points, { couleur: "#B688FE", points: true, tendance: true, fmt: (v) => `${Math.round(v)} %`, padMin: 1, label: "Dérive cardiaque de tes sorties faciles", vide: "Pas encore de sortie mesurable sur la période." }),
        esc(resume(der, " %", (v) => Math.round(v))) + " Mesurée seulement sur les sorties faciles d'au moins 40 min à allure régulière : sur un seuil ou une sortie courte, le cœur monte à cause de l'effort, pas de la fatigue. Moins de 5 % : stable.")}`;
  }
  function progressionCourses(now, mois) {
    const vol = Calc.volumeParMois(etat.sorties, now, mois), vmax = Math.max(...vol.map((m) => m.km), 1);
    const W = 326, bw = (W - 8) / vol.length;
    const barres = `<svg width="100%" viewBox="0 0 ${W} 120" role="img" aria-label="Kilomètres par mois">${vol.map((m, i) => { const h = m.km / vmax * 80, x = 4 + i * bw;
      return `<rect x="${(x + bw * 0.18).toFixed(1)}" y="${(96 - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="4" fill="${i === vol.length - 1 ? "#C6F432" : "#3A3E44"}"/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(90 - h).toFixed(1)}" fill="#C9CCD0" font-size="${vol.length > 6 ? 9 : 11}" text-anchor="middle">${Math.round(m.km)}</text>
        <text x="${(x + bw / 2).toFixed(1)}" y="114" fill="#8B8F96" font-size="${vol.length > 6 ? 9 : 10}" text-anchor="middle">${MOIS_C[new Date(m.debut).getMonth()]}</text>`; }).join("")}</svg>`;
    const dernier = vol[vol.length - 1], avant = vol[vol.length - 2], cad = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.cadence);
    return `${bloc("Volume par mois", barres, `${Calc.kmTxt(dernier.km * 1000)} km ce mois-ci${avant ? `, ${Calc.kmTxt(avant.km * 1000)} km le mois dernier` : ""}.`)}
      ${bloc("Régularité", regulariteGrilleHTML(now), "Une case par semaine, du lundi au dimanche, avec le nombre de sorties. La semaine en cours est entourée.")}
      ${bloc("Cadence", courbe(cad.points, { couleur: "#44E7EF", points: true, tendance: true, fmt: (v) => `${Math.round(v)}`, padMin: 2, label: "Cadence de tes sorties faciles", vide: "Pas de cadence mesurée sur tes sorties faciles de la période." }),
        esc(resume(cad, " pas/min", (v) => Math.round(v))))}`;
  }
  function progressionHTML(theme) {
    const now = Date.now(), mois = etat.periode, t = ["allure", "coeur", "courses"].includes(theme) ? theme : "allure";
    const onglets = [["allure", "Allure"], ["coeur", "Cœur"], ["courses", "Courses"]].map(([k, l]) => `<button type="button" data-go="#/progression/${k}" class="${t === k ? "actif" : ""}" aria-pressed="${t === k}">${l}</button>`).join("");
    const per = [3, 6, 12].map((m) => `<button type="button" data-periode="${m}" class="${mois === m ? "actif" : ""}" aria-pressed="${mois === m}">${m} mois</button>`).join("");
    const corps = t === "coeur" ? progressionCoeur(now, mois) : t === "courses" ? progressionCourses(now, mois) : progressionAllure(now, mois);
    return `<header class="tete"><h1>Progression</h1></header>
      <div class="segments" role="group" aria-label="Thème">${onglets}</div>
      <div class="segments petits" role="group" aria-label="Période">${per}</div>
      ${corps}`;
  }

  /* ---------- Profil (rempli, en lecture seule) ---------- */
  function profilHTML() {
    const z = etat.zones, niv = z && z.niveau ? levelStatus(z.niveau) : null, fm = fcMax(), fr = fcRepos();
    const conseillees = z ? [["EF", z.conseillees.easy], ["Marathon", z.conseillees.marathon], ["Seuil", z.conseillees.threshold], ["Fractionné", z.conseillees.interval]] : [];
    const lignesZones = z ? Calc.zonesLibelles(z).map((x) => `<div class="kv"><span><i class="pt" style="background:${x.couleur}"></i>${esc(x.nom)}</span><b>${esc(x.plage)}</b></div>`).join("") : "";
    const defs = fm ? hrZoneDefs(fm.valeur, fr) : null;
    const lignesCoeur = defs ? defs.map((d, i) => `<div class="kv"><span><i class="pt" style="background:${d.color}"></i>${esc(d.label)} · ${esc(R.zonesCardioEffort[i])}</span><b>${i === 0 ? `jusqu'à ${d.max}` : i === 4 ? `plus de ${defs[3].max}` : `${defs[i - 1].max + 1} à ${d.max}`} bpm</b></div>`).join("") : "";
    const capTxt = Calc.cap(etat.profil), derniere = etat.sorties[etat.sorties.length - 1], premiere = etat.sorties[0];
    return `<header class="tete"><div class="sur">Ton compte</div><h1>Profil</h1></header>
      <section class="carte"><h2>Ton niveau</h2>
        <div class="com">${esc(niv ? niv.text : "Pas de chrono de référence : les allures sont estimées d'après tes sorties faciles.")}</div>
        ${conseillees.length ? `<div class="tuiles deux">${conseillees.map(([l, v]) => tuile(`Allure ${l}`, Calc.allureTxt(Math.round(v)), "/km", null)).join("")}</div>` : ""}
        ${lignesZones ? `<div class="sur" style="margin-top:4px">Tes 5 zones d'allure</div><div class="kvs">${lignesZones}</div>` : ""}
      </section>
      <section class="carte"><h2>Ton cœur</h2>
        <div class="tuiles deux">${tuile("FC max", fm ? fm.valeur : "—", fm ? "bpm" : "", fm ? fm.source : "non renseignée")}${tuile("FC de repos", fr || "—", fr ? "bpm" : "", fr ? "de ton profil" : "non renseignée")}</div>
        ${lignesCoeur ? `<div class="sur" style="margin-top:4px">Tes zones cardio</div><div class="kvs">${lignesCoeur}</div>` : ""}
      </section>
      <section class="carte"><h2>Ton objectif</h2><div style="font-size:16px">${esc(capTxt ? capTxt.charAt(0).toUpperCase() + capTxt.slice(1) : "Pas d'objectif renseigné")}</div></section>
      <section class="carte"><h2>Tes données</h2><div class="kvs">
        <div class="kv"><span>Courses</span><b>${etat.courses.length}</b></div>
        <div class="kv"><span>Autres séances</span><b>${etat.sorties.length - etat.courses.length}</b></div>
        <div class="kv"><span>Dernière séance reçue</span><b>${derniere ? esc(`${relatif(derniere.ts)}, ${heureTxt(derniere.ts)}`) : "—"}</b></div>
        <div class="kv"><span>Depuis</span><b>${premiere ? esc(`${new Date(premiere.ts).getDate()} ${MOIS_C[new Date(premiere.ts).getMonth()]} ${new Date(premiere.ts).getFullYear()}`) : "—"}</b></div></div>
        <div class="com com-sep">Lues dans ton compte MyRunningApp. Le prototype ne modifie rien : pour changer ces réglages, passe par l'app.</div></section>
      <section class="carte"><h2>Compte</h2><div style="word-break:break-all">${esc(etat.email || "—")}</div>
        <button type="button" class="btn-second" id="deconnexion">Se déconnecter (sur ce téléphone seulement)</button></section>`;
  }

  /* ---------- Navigation ---------- */
  const ONGLETS = [["accueil", "Accueil"], ["progression", "Progression"], ["sorties", "Sorties"], ["profil", "Profil"]];
  function afficherBas(html) { const b = document.getElementById("basFixe"); b.innerHTML = html; b.classList.toggle("cache", !html); }
  function rendre(garderDefilement) {
    const app = document.getElementById("app"), nav = document.getElementById("onglets");
    afficherBas("");
    if (!etat.session) { nav.classList.add("cache"); app.innerHTML = connexionHTML(); document.getElementById("fConnexion").addEventListener("submit", seConnecter); return; }
    if (!etat.pret) { app.innerHTML = `<p class="vide">${etat.erreur ? esc(etat.erreur) : "Lecture de tes sorties…"}</p>`; return; }
    let [, vue, id, ancre] = (location.hash || "#/accueil").split("/");
    if (vue === "verdict") vue = "bilan";   // ancienne adresse
    const s = id && vue !== "progression" ? etat.sorties.find((x) => String(x.id) === decodeURIComponent(id)) : null;
    const plein = vue === "bilan" || vue === "sortie";
    nav.classList.toggle("cache", plein);
    const actif = vue || "accueil";
    nav.innerHTML = ONGLETS.map(([k, l]) => `<button type="button" data-go="#/${k}" class="${actif === k ? "actif" : ""}"${actif === k ? ' aria-current="page"' : ""}>${ic(k, 22)}${l}</button>`).join("");
    const y = window.scrollY;
    if (vue === "bilan" && s) { app.innerHTML = bilanHTML(s); brancherBilan(s); }
    else if (vue === "sortie" && s) app.innerHTML = detailHTML(s);
    else if (vue === "sorties") app.innerHTML = sortiesHTML();
    else if (vue === "progression") app.innerHTML = progressionHTML(id);
    else if (vue === "profil") { app.innerHTML = profilHTML(); document.getElementById("deconnexion").addEventListener("click", async () => { await Lecture.deconnexion(); location.hash = "#/accueil"; location.reload(); }); }
    else app.innerHTML = accueilHTML();
    window.scrollTo(0, garderDefilement ? y : 0);
    // #/progression/allure/seuil : on descend jusqu'à la courbe demandée (touchée depuis « Ton niveau »).
    const cible = vue === "progression" && ancre && !garderDefilement ? document.getElementById(`graphe-${ancre}`) : null;
    if (cible) cible.scrollIntoView({ block: "start" });
  }
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-retour]"); if (r) { if (history.length > 1) history.back(); else location.hash = "#/accueil"; return; }
    const f = e.target.closest("[data-filtre]"); if (f) { etat.filtre = f.getAttribute("data-filtre"); rendre(true); return; }
    const p = e.target.closest("[data-periode]"); if (p) { etat.periode = Number(p.getAttribute("data-periode")); rendre(true); return; }
    const g = e.target.closest("[data-go]"); if (g) { e.stopPropagation(); location.hash = g.getAttribute("data-go"); }
  });
  document.addEventListener("keydown", (e) => { const g = e.target.closest && e.target.closest("[data-go][role=link]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = g.getAttribute("data-go"); } });
  window.addEventListener("hashchange", () => rendre(false));

  async function charger() {
    const banc = window.__PROTO_BANC__;   // banc de captures local seulement (jamais publié)
    if (banc) { etat.profil = banc.profil || {}; etat.email = banc.email || ""; installer(banc.runs || []); return true; }
    const [runs, prof] = await Promise.all([
      Lecture.lire("runs", "id,start_date,type,apple_type,distance_km,duration_sec,avg_hr,peak_hr,avg_cadence,pain_ratings,include_in_stats,hr_series,pace_series,lap_markers,frac_work_manual,frac_recovery_manual", { trierPar: "start_date" }),
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
  // Le bilan s'ouvre tout seul à la première ouverture qui suit une nouvelle sortie (de moins de 7 jours), une seule fois.
  function ouvrirBilanSiNouvelle() {
    const der = etat.courses[etat.courses.length - 1];
    if (!der || location.hash || Date.now() - der.ts > R.bilanJoursOuverture * JOUR) return;
    if (lireLocal(CLE_BILAN_VU, null) === String(der.id)) return;
    ecrireLocal(CLE_BILAN_VU, String(der.id));
    location.hash = `#/bilan/${der.id}`;
  }
  async function demarrer() {
    etat.pret = false; rendre();
    etat.pret = await charger();
    if (etat.pret) ouvrirBilanSiNouvelle();
    rendre();
  }

  (async () => {
    try { etat.ressentis = JSON.parse(lireLocal(CLE_RESSENTIS, "{}")) || {}; } catch (e) { etat.ressentis = {}; }
    if (window.__PROTO_BANC__) { etat.session = { banc: true }; await demarrer(); return; }
    etat.session = await Lecture.session();
    if (etat.session) { etat.email = etat.session.user?.email || ""; await demarrer(); } else rendre();
  })();
})();
