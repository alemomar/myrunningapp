/* Prototype « refonte progression » (demande d'Omar du 26/10/2026), habillé de la V2 de Claude Design (maquettes validées
   par Omar le 27/10, docs/design/v2/brief-developpeur-V2.md) : les écrans.
   Accueil à deux moments (2A : tu as couru aujourd'hui, jusqu'à minuit ; 2B : le reste du temps), Ton bilan (feuille qui
   s'ouvre seule après une nouvelle sortie, précédée du plein écran record s'il y a un record), détail d'une sortie (type
   corrigeable), Sorties (par année et par mois, ajout d'une séance), Progression (Allure, Cœur, Volume), Profil en liste,
   premiers pas et états en démonstration.
   Lecture seule : les données viennent de Lecture. Ce qui s'enregistrerait dans l'app (ressenti, type corrigé, séance
   ajoutée, conseil en cours, objectif, montre) reste sur ce téléphone (localStorage), jamais dans la base. */
(() => {
  const R = REGLAGES, U = UI, JOUR = 86400000, esc = U.esc, ic = U.ic;
  const CLES = { ressentis: "mra_proto_ressentis", types: "mra_proto_types", ajouts: "mra_proto_ajouts", vues: "mra_proto_vues",
    plis: "mra_proto_plis", objectif: "mra_proto_objectif", montre: "mra_proto_montre", ancienBilanVu: "mra_proto_bilan_vu" };
  const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v == null ? defaut : JSON.parse(v); } catch (e) { return defaut; } };
  const garder = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* stockage indisponible : vaut pour cette visite */ } };
  const banc = () => !!window.__PROTO_BANC__;
  const etat = { session: null, email: "", profil: null, brutes: [], sorties: [], courses: [], zones: null, erreur: "", pret: false, chargeA: 0,
    ressentis: lire(CLES.ressentis, {}), types: lire(CLES.types, {}), ajouts: lire(CLES.ajouts, []),
    plis: lire(CLES.plis, {}), objectifLocal: lire(CLES.objectif, null), montre: lire(CLES.montre, null),
    filtre: "courses", periode: 12, autresRecues: [], demo: null, now: null, memo: {} };   // 28/10 : Progression sur 12 mois par défaut
  try { localStorage.removeItem("mra_proto_conseils"); localStorage.removeItem("mra_proto_replies"); } catch (e) { /* rien à faire */ }
  const maintenant = () => etat.now || Date.now();

  /* ---------- Données ---------- */
  const TYPES_APP = { "Sortie facile": "EF", Longue: "Long", Tempo: "Seuil", Seuil: "Seuil", "Fractionné": "Fractionné", "Compétition": "Course", Autre: "Other" };
  function recalculer() {
    const lignes = etat.brutes.concat(etat.ajouts);
    etat.sorties = lignes.map((row) => {
      const t = etat.types[row.id];
      const s = Calc.versSortie(t && t !== "Autre" ? { ...row, typeV2: t } : row);
      if (t) s.type = TYPES_APP[t] || s.type;
      s.local = !!row.local;
      return s;
    }).filter((s) => !Number.isNaN(s.ts)).sort((a, b) => a.ts - b.ts);
    etat.courses = etat.sorties.filter(Calc.estCourse);
    etat.zones = Calc.zonesAllure(etat.profil, etat.sorties, maintenant());
    etat.memo = {};
  }
  const memo = (cle, f) => (cle in etat.memo ? etat.memo[cle] : (etat.memo[cle] = f()));
  const fcMax = () => Calc.fcMaxEffective(etat.profil, etat.courses);
  const fcRepos = () => (etat.profil && etat.profil.resting_hr ? Number(etat.profil.resting_hr) : null);
  const defsZones = () => memo("defs", () => { const fm = fcMax(); return fm ? hrZoneDefs(fm.valeur, fcRepos()) : null; });
  const bilanDe = (s) => memo(`b${s.id}`, () => Calc.verdict(s, etat.courses, etat.ressentis, null, etat.zones));
  const libDe = (s) => memo(`l${s.id}`, () => Calc.libelleType(s, s.type === "Seuil" ? Calc.decoupage(s, etat.zones) : null));
  const niveau = (now) => memo(`n${now}`, () => Calc.niveauActuel(etat.courses, now, etat.zones, defsZones()));   // même Facile que « Ton allure facile » (Progression)
  function objectif() {
    const o = etat.objectifLocal, p = etat.profil && etat.profil.goals && etat.profil.goals.principal;
    const KM = { "5km": 5, "10km": 10, "15km": 15, Semi: 21.0975, Marathon: 42.195 };
    const dist = o ? o.distance : p && p.objectifPrincipal === "Préparer une course" ? p.distanceCourse : null;
    if (!dist) return null;
    const nom = RACE_LABELS[dist] || dist, temps = o && o.tempsSec ? o.tempsSec : null, date = o ? o.date : p.dateCible;
    return { distance: dist, nom, tempsSec: temps, date, allure: temps && KM[dist] ? temps / KM[dist] : null,
      label: `${nom === "Semi-marathon" ? "semi" : nom}${temps ? ` en ${dureeCourte(temps)}` : date ? ` le ${isoToFr(date)}` : ""}` };
  }
  const dureeCourte = (sec) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
  // 28/10 : la carte « Ton conseil » est retirée (retour d'Omar : « surcharge, ne sert pas à grand-chose »). Son moteur reste
  // dans conseil.js (testé dans test.html) au cas où on le rebrancherait ; il n'est plus chargé par la page.
  function noterRessenti(id, v) {
    const n = { ...etat.ressentis };
    if (v == null || n[id] === v) delete n[id]; else n[id] = v;
    etat.ressentis = n; garder(CLES.ressentis, n); etat.memo = {};
  }

  /* ---------- Petits morceaux d'écran ---------- */
  const tete = (sur, titre, droite) => `<header class="tete-ligne"><div class="tete" style="padding:0">${sur ? `<div class="sur">${esc(sur)}</div>` : ""}<h1>${esc(titre)}</h1></div>${droite || ""}</header>`;
  const retourLigne = (sur, cible) => `<div class="retour-ligne"><button type="button" class="rond" ${cible ? `data-go="${cible}"` : "data-retour"} aria-label="Retour">${ic("retour", 18)}</button>${sur ? `<span class="sur">${esc(sur)}</span>` : ""}</div>`;
  const info = (cle) => `<button type="button" class="info" data-feuille="${cle}" aria-label="Comment c'est calculé">i</button>`;
  const mt = (l, v, u, h, g) => `<div class="mt"><span class="l">${esc(l)}</span>${U.num(v, u, `v${g ? " g" : ""}`)}${h ? `<span class="h">${h}</span>` : ""}</div>`;
  const pour = (lib) => ({ "Sortie facile": "une sortie facile", Longue: "une sortie longue", Tempo: "un tempo", Seuil: "un seuil", "Fractionné": "un fractionné" }[lib] || "ce type");

  /* =================== Connexion (10G) =================== */
  function connexionHTML(demo) {
    return `<div class="pp">
      <div style="display:flex;justify-content:center;padding:36px 0 8px"><img src="../logo/logo-vertical-couleur.svg" alt="MyRunningApp" width="150" height="110" style="height:110px;width:auto"></div>
      <h1 class="h-plein">Content de te revoir</h1>
      <form id="fConnexion" style="display:flex;flex-direction:column;gap:14px" autocomplete="on">
        <div class="champ"><label for="cEmail">E-mail</label><input id="cEmail" type="email" autocomplete="username" autocapitalize="none" required${demo ? ' placeholder="ton.adresse@exemple.fr"' : ""}></div>
        <div class="champ"><label for="cMdp">Mot de passe</label><input id="cMdp" type="password" autocomplete="current-password" required></div>
        <button type="button" class="citron" style="font-weight:700;font-size:14px;align-self:flex-start" data-action="pas-ici">Mot de passe oublié ?</button>
        <div class="erreur" id="cErreur" role="alert">${esc(etat.erreur)}</div>
        <div class="pp-bas"><button type="submit" class="btn primaire" id="cBouton">Se connecter</button>
          <button type="button" class="btn-texte" data-action="pas-ici">Créer un compte</button></div>
      </form>
      <p class="cap" style="text-align:center">Prototype : ton compte MyRunningApp, même e-mail et même mot de passe. Il lit tes sorties, il ne modifie rien.</p></div>`;
  }
  async function seConnecter(e) {
    e.preventDefault();
    if (/^#\/demo\//.test(location.hash)) { U.toast("Démo : la connexion se fait pour de vrai à l'ouverture du prototype."); return; }
    const b = document.getElementById("cBouton"); b.disabled = true; b.textContent = "Connexion…";
    const { session, error } = await Lecture.connexion(document.getElementById("cEmail").value.trim(), document.getElementById("cMdp").value);
    if (error || !session) { etat.erreur = "E-mail ou mot de passe incorrect."; rendre(); return; }
    etat.erreur = ""; etat.session = session; etat.email = session.user?.email || "";
    await demarrer();
  }
  // Chargement (10E) : squelettes à la forme des cartes, et une ligne qui dit ce qu'on fait.
  const chargementHTML = () => `<div class="tete"><div class="squelette" style="width:120px;height:11px"></div><div class="squelette" style="width:200px;height:28px;margin-top:6px"></div></div>
    <div class="carte"><div class="squelette" style="width:110px;height:12px"></div><div class="squelette" style="height:22px"></div><div class="squelette" style="height:64px"></div></div>
    <div class="carte"><div class="squelette" style="width:160px;height:12px"></div><div class="niv-grille">${'<div class="squelette" style="height:96px"></div>'.repeat(4)}</div></div>
    <div class="cap" style="display:flex;align-items:center;gap:8px;justify-content:center">${ic("eclat", 14)} On regarde si tu as de nouvelles sorties…</div>`;

  /* =================== Accueil (2A / 2B) =================== */
  function accueilHTML() {
    const now = maintenant(), prenom = String((etat.profil && etat.profil.pseudo) || "").trim();
    const der = etat.courses.filter((s) => s.ts <= now).slice(-1)[0];
    const modeA = der && U.memeJour(der.ts, now);
    let h = `<header class="tete"><div class="sur">${esc(U.jourTxt(now))}</div><h1>${prenom ? `Salut ${esc(prenom)}` : "Salut"}</h1></header>`;
    if (etat.demo === "reseau") h += `<div class="bandeau-reseau">${ic("horsLigne", 22)}<div style="flex:1"><b>Pas de connexion</b><div class="cap">Tes chiffres datent de ce matin, 07:42.</div></div><button type="button" class="pilule" style="background:var(--text);color:var(--on-accent)" data-action="pas-ici">Réessayer</button></div>`;
    if (!der) return h + aucuneSortieHTML();
    const premieres = etat.courses.length < R.conseilMinSorties || now - etat.courses[0].ts < 28 * JOUR;
    if (premieres) h += `<section class="carte" style="background:var(--accent-soft);border:1px solid var(--accent-line);flex-direction:row;gap:12px">${ic("montre", 22)}<div><b class="lead">Tes ${etat.courses.length} premières sorties sont là</b><div class="txt2" style="font-size:14px;margin-top:4px">Ton bilan démarre dès maintenant. Ton niveau se précise après 4 semaines.</div></div></section>`;
    const corps = modeA ? [taSortieHTML(der), niveauHTML(now, der), moisHTML(now)]
      : [niveauHTML(now, null), moisHTML(now), derniereLigneHTML(der)];
    return h + (etat.demo === "reseau" ? `<div class="attenue" style="display:flex;flex-direction:column;gap:12px">${corps.join("")}</div>` : corps.join(""));
  }
  // 10H : rien reçu (après « Plus tard » ou « Pas de montre »).
  const aucuneSortieHTML = () => `<section class="carte" style="background:var(--accent-soft);border:1px solid var(--accent-line)">
      <div style="display:flex;gap:12px">${ic("montre", 22)}<div><b class="lead">Connecte tes courses</b><div class="txt2" style="font-size:14px;margin-top:4px">On lit tes sorties dans Apple Santé : allure, cœur, régularité. Ta progression apparaît dès ta première sortie reçue.</div></div></div>
      <button type="button" class="btn primaire" data-go="#/premiers/6">Voir comment</button><button type="button" class="btn second" data-go="#/ajouter">Ajouter une sortie à la main</button></section>`;

  // 2A · Ta sortie : toute la carte se touche, plus le bouton.
  function taSortieHTML(s) {
    const v = bilanDe(s), lib = libDe(s), f = Calc.frise3(s, etat.zones), res = Calc.ressentiDe(s, etat.ressentis), cran = Calc.ressentiCran(res);
    const legende = f ? `<div class="carte-tete" style="font-size:13px"><span>${U.friseTexte({ morceaux: f.morceaux.filter((m) => m.cat !== "calme") })}</span>
        ${res != null ? `<span class="txt2">Ressenti <b style="color:var(--text)">${res}/10</b> · ${esc(cran.mot)}</span>` : `<span class="citron" style="font-weight:600">Note ton ressenti</span>`}</div>` : "";
    return `<section class="carte" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}" aria-label="Ta sortie d'aujourd'hui : voir le détail">
      <div class="carte-tete"><span class="sur">Ta sortie · aujourd'hui ${esc(U.heureTxt(s.ts))}</span>${U.pillType(lib)}</div>
      ${U.bilanLigne(v)}
      <div class="mini">${mt("Distance", U.kmTxt(s.dist), "km")}${mt("Durée", fmtDur(s.dur))}${mt("Allure", U.allure(s.allure), "/km")}</div>
      ${f ? U.frise(f) : ""}${legende}
      <button type="button" class="btn primaire" data-go="#/sortie/${esc(s.id)}">Voir le détail de ta course ${ic("chevron", 18, 2.4)}</button></section>`;
  }
  // 2B · Ta dernière sortie : une ligne qui se touche.
  function derniereLigneHTML(s) {
    const v = bilanDe(s);
    return `<section class="carte" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}" aria-label="Ta dernière sortie : voir le détail"><span class="sur">Ta dernière sortie</span>
      <div style="display:flex;align-items:center;gap:12px">${U.icBilan(v.sens, "petite")}<div style="flex:1;min-width:0"><b style="font-size:16px">${esc(libDe(s))} · ${U.kmTxt(s.dist)} km</b>
        <div class="cap">${esc(U.relatif(s.ts, maintenant()).replace(/^./, (c) => c.toUpperCase()))} · ${esc(v.titre.toLowerCase())}</div></div><span class="chev" style="color:var(--faint)">${ic("chevron", 18)}</span></div></section>`;
  }

  /* ---------- Ton niveau actuel (retour d'Omar du 28/10) ----------
     Bien dire que c'est ton niveau d'AUJOURD'HUI (4 dernières semaines), pas une moyenne de l'année : une ligne par effort,
     l'allure d'il y a 3 mois → l'allure actuelle en grand. */
  function niveauHTML(now, sortieDuJour) {
    const liste = niveau(now), bougee = sortieDuJour ? Calc.EFFORT_DE[libDe(sortieDuJour)] : null;
    const premieres = etat.courses.length && now - etat.courses[0].ts < 28 * JOUR;
    return `<section class="carte" aria-label="Ton niveau actuel"><div><h2>Ton niveau actuel</h2>
        <div class="txt2" style="font-size:14px;margin-top:3px">${premieres ? "Tes allures de départ : les écarts apparaîtront quand on pourra comparer." : "Tes allures des <b style=\"color:var(--text)\">4 dernières semaines</b>, face à il y a 3 mois."}</div></div>
      ${U.niveauLignes(liste, { bougee })}</section>`;
  }

  /* ---------- Ton mois ---------- */
  function moisHTML(now) {
    const fm = fcMax(), m = Calc.mois(etat.sorties, now, fm ? fm.valeur : null, fcRepos()), c = m.ce, a = m.avant, tot = m.secs.reduce((x, v) => x + v, 0);
    const nomMois = U.MOIS[new Date(m.debut).getMonth()], moisAvant = U.MOIS_C[new Date(new Date(m.debut).getTime() - JOUR).getMonth()];
    const sem = Calc.sortiesParSemaine(etat.sorties, now, 12), avec = sem.filter((w) => w.n > 0).length, serie = Calc.serie(etat.sorties, now);
    const bande = `<div class="filet"></div><div role="link" tabindex="0" data-go="#/progression/volume" style="display:flex;flex-direction:column;gap:10px" aria-label="Ta régularité : voir le détail">
        <div class="carte-tete"><span><b>${avec} semaines sur 12</b>${serie > 1 ? `<span class="cap"> · ${serie} d'affilée</span>` : ""}</span><span style="color:var(--faint)">${ic("chevron", 16)}</span></div>${U.reguCases(sem)}<div class="carte-tete cap" style="margin-top:-2px"><span>${esc(U.jourMois(sem[0].debut))}</span><span>cette semaine</span></div></div>`;   // 28/10 : les chiffres, comme dans Progression
    if (!c.n) {
      const der = etat.courses.filter((s) => s.ts <= now).slice(-1)[0];
      return `<section class="carte aeree" aria-label="Ton mois"><span class="sur">Ton mois · ${esc(nomMois)}</span><div class="lead">Pas encore de sortie ce mois-ci.</div>
        <div class="txt2" style="font-size:14px">${esc(U.MOIS[new Date(new Date(m.debut).getTime() - JOUR).getMonth()].replace(/^./, (x) => x.toUpperCase()))} : ${a.n} ${a.n > 1 ? "sorties" : "sortie"} · ${U.kmTxt(a.km)} km.${der ? ` Ta dernière : il y a ${Math.round((now - der.ts) / JOUR)} jours.` : ""}</div>${bande}</section>`;
    }
    const dKm = a.n ? c.km - a.km : null, dN = a.n ? c.n - a.n : null;
    const zones = tot > 0 ? `<div class="filet"></div>${U.deuxGrands((m.secs[0] + m.secs[1]) / tot * 100, (m.secs[2] + m.secs[3] + m.secs[4]) / tot * 100)}${U.zbarre(m.secs, { repere: true })}` : "";
    // 28/10 (« un peu trop surchargé, il y a moyen de l'aérer ? ») : plus d'espace entre les trois parties, chiffres un peu moins gros.
    return `<section class="carte aeree" aria-label="Ton mois"><span class="sur">Ton mois · ${esc(nomMois)}</span>
      <div class="mini" style="gap:6px"><div>${U.num(U.kmTxt(c.km), "km", "n34")}<div class="cap" style="margin-top:4px">${dKm != null ? `<b class="${dKm >= 0 ? "citron" : "gris"}">${dKm >= 0 ? "+" : "−"}${U.kmTxt(Math.abs(dKm))} km</b> vs ${esc(moisAvant)}` : "ce mois-ci"}</div></div>
        <div>${U.num(c.n, "", "n34")}<div class="cap" style="margin-top:4px">${c.n > 1 ? "sorties" : "sortie"}${dN ? ` <b class="${dN > 0 ? "citron" : "gris"}">${dN > 0 ? "+" : "−"}${Math.abs(dN)}</b>` : ""}</div></div>
        <div>${U.num(U.dureeTxt(c.sec), "", "n34")}<div class="cap" style="margin-top:4px">de course</div></div></div>
      ${zones}${bande}</section>`;
  }

  /* =================== Ton bilan (3) et après une sortie (9) =================== */
  function bilanHTML(s) {
    const v = bilanDe(s), lib = libDe(s), now = maintenant(), res = Calc.ressentiDe(s, etat.ressentis);
    const record = Calc.recordsBattus(s, etat.sorties)[0];
    let tetes;
    if (record) tetes = `<div class="record-ligne" role="link" tabindex="0" data-go="#/progression/volume/records"><span class="tr">${ic("trophee", 20)}</span><div style="flex:1"><b>Nouveau record ${esc(record.label)} · ${esc(fmtDur(record.temps))}</b>
        <div class="txt2" style="font-size:13.5px">${esc(formatTimeGain(record.ancien - record.temps).replace("−", ""))} de mieux qu'en ${esc(U.MOIS[new Date(record.ancienTs).getMonth()])}</div></div>${ic("chevron", 18)}</div>`;
    else {
      const m = cheerModel({ fresh: [{ id: s.id, ts: s.ts, type: s.type, distKm: s.dist }], runs: etat.courses.map((h) => ({ id: h.id, ts: h.ts, type: h.type, distKm: h.dist })), kmGoal: 0 });
      const kinds = ["reprise", "objectif", "cap", "serie", "semaine", "plus-longue", "endurance", "vitesse", "renfo"];
      tetes = m ? `<div class="cheer">${kinds.includes(m.kind) ? `<mra-cheer kind="${esc(m.kind)}"${m.value != null ? ` value="${esc(String(m.value))}"` : ""} once aria-hidden="true"></mra-cheer>` : `<span class="ic-bilan haut grande">${ic("eclat", 22)}</span>`}<span class="txt2" style="font-size:14px">${esc(m.text)}</span></div>` : "";
    }
    const tuiles = v.tuiles.slice(0, 2).map((t) => {
      // L'écart de cœur n'apparaît que s'il compte pour le bilan (3 battements ou plus) ; en dessous, c'est « dans ta moyenne ».
      const h = v.cle === "premiere" ? "point de départ" : t.habitude ? `${t.delta != null && Math.abs(t.delta) >= R.ecartCoeurBpm ? `<b class="${t.delta > 0 ? "violet" : "citron"}">${t.delta > 0 ? "+" : "−"}${Math.abs(t.delta)}</b> · ` : ""}habitude ${esc(t.habitude)}${t.unite === "/10" ? "/10" : ""}` : "";
      return mt(t.label, t.valeur, t.unite, h, true);
    }).join("");
    const autres = etat.autresRecues.map((id) => etat.sorties.find((x) => String(x.id) === String(id))).filter(Boolean);
    return `<div class="feuille">
      <div class="poignee" aria-hidden="true"></div>${tetes}
      <div class="carte-tete" style="align-items:flex-start"><div class="tete" style="padding:0"><span class="sur">${esc(U.jourTxt(s.ts))} · ${esc(U.heureTxt(s.ts))}</span><h1>Bravo pour ta course !</h1></div>
        <button type="button" class="rond petit" data-go="#/accueil" aria-label="Fermer le bilan">${ic("fermer", 16)}</button></div>
      <div>${U.pillType(lib, `${U.kmTxt(s.dist)} km`)}</div>
      <section class="carte">${U.bilanLigne(v, true)}<div class="mini deux">${tuiles}</div>
        <div class="carte-tete"><span class="cap">${esc(v.compare || "")}</span>${info("bilan")}</div>
        ${v.note ? `<div class="verdict-box" style="background:var(--sunken)"><span class="vi" style="background:var(--control);color:var(--text)">${ic("montre", 14)}</span><span>${esc(v.note)}</span></div>` : ""}</section>
      ${ressentiCarte(s, res)}
      ${pourLaSuiteHTML(s, v, lib)}
      ${autres.length ? `<section class="carte" style="gap:0"><span class="sur" style="padding-bottom:6px">${autres.length} ${autres.length > 1 ? "autres sorties reçues" : "autre sortie reçue"}</span>${autres.map(ligneCourse).join("")}</section>` : ""}
      <button type="button" class="btn primaire" data-go="#/sortie/${esc(s.id)}">Voir le détail de ta course ${ic("chevron", 18, 2.4)}</button></div>`;
  }
  const ressentiCarte = (s, res) => `<section class="carte" aria-label="Ton ressenti"><div class="carte-tete"><b style="font-size:16px">Comment tu l'as sentie ?</b>
      ${res != null ? `<span>${U.num(res, "/10", "n28")}</span>` : `<span class="cap">facultatif</span>`}</div>${U.crans(res, `data-sortie="${esc(s.id)}"`)}</section>`;
  // Après le bilan : ta sortie face à l'idéal pour ce type (zones), puis « La prochaine fois ». Le conseil est retiré (28/10).
  function pourLaSuiteHTML(s, v, lib) {
    const fm = fcMax(), zs = fm ? Calc.zonesSortie(s, fm.valeur, fcRepos()) : null, id = R.idealZones[lib];
    let zonesHTML = "";
    if (zs && id) {
      const vr = Calc.verdictRepartition(lib, zs), m = (i) => Math.round(zs.secs[i] / 60);
      const droite = id.cible.length === 2 && id.cible[0] === 0 ? `${m(0) + m(1)} min sur ${Math.round(zs.tot / 60)} en zones 1-2` : `${id.cible.reduce((a, i) => a + m(i), 0)} min en ${id.cible.length > 1 ? `zones ${id.cible[0] + 1}-${id.cible[id.cible.length - 1] + 1}` : `zone ${id.cible[0] + 1}`}`;
      zonesHTML = `<span class="sur">Ton effort par zone</span><div class="carte-tete" style="font-size:14px"><b>Ta sortie</b><span class="cap">${esc(droite)}</span></div>${U.zbarre(zs.secs)}
        <div class="carte-tete" style="font-size:14px"><b>Idéal pour ${esc(pour(lib))}</b><span class="cap">${esc(id.cible[0] === 0 ? "tout en zones 1-2" : lib === "Fractionné" ? "facile autour des blocs" : "facile autour du bloc")}</span></div>${U.zbarre(id.pct, { pale: true })}
        ${U.legendeZones()}${vr ? U.verdictBox({ ton: vr.ton, titre: vr.court }) : ""}<div class="filet"></div>`;
    }
    return `<section class="carte">${zonesHTML}
      <div style="display:flex;gap:10px;align-items:flex-start"><span class="citron" style="margin-top:2px">${ic("eclat", 18)}</span><div><span class="sur">La prochaine fois</span><div class="lead" style="margin-top:3px">${esc(Calc.conseil(s, v))}</div></div></div></section>`;
  }
  // 9B : record, plein écran (le petit bonhomme), puis le bilan.
  function recordHTML(s, bandeau) {
    const r = Calc.recordsBattus(s, etat.sorties)[0];
    if (!r) return null;
    const gain = r.ancien - r.temps;
    return `<div class="plein-record" role="dialog" aria-modal="true" aria-label="Nouveau record">${bandeau ? `<div style="width:100%;max-width:448px">${bandeau}</div>` : ""}<div class="sur citron" style="font-size:12px">${esc(U.jourTxt(s.ts).toUpperCase())} · ${esc(U.heureTxt(s.ts))}</div>
      <record-man once old="${esc(fmtDur(r.ancien))}" new="${esc(fmtDur(r.temps))}" distance="${esc(r.label.toUpperCase())}" gain="${esc(formatTimeGain(gain))}" aria-label="${esc(`Nouveau record sur ${r.label} : ${fmtDur(r.temps)}, contre ${fmtDur(r.ancien)} avant.`)}"></record-man>
      <button type="button" class="btn primaire" style="max-width:448px" data-go="#/bilan/${esc(s.id)}">Voir ton bilan ${ic("chevron", 18, 2.4)}</button></div>`;
  }

  /* =================== Détail d'une sortie (4) =================== */
  function detailHTML(s) {
    const v = bilanDe(s), lib = libDe(s), res = Calc.ressentiDe(s, etat.ressentis), cran = Calc.ressentiCran(res), cad = cadenceShown(s.cad, s.type);
    const manuel = s.manuel || s.local, now = maintenant();
    const ref = (niveau(s.ts - 1).find((e) => e.cle === Calc.EFFORT_DE[lib]) || {}).maintenant;   // tes 4 semaines d'avant, sans cette sortie
    const pd = Calc.passageDominant(s, etat.zones, R);
    const allureH = ["Tempo", "Seuil"].includes(lib) && pd ? `${Calc.ZONE_A[pd.zone]} ${fmtKmPace(pd.allure)}${v.cle === "premiere" ? " · 1re" : ""}` : ref ? `réf. 4 sem. ${fmtKmPace(ref)}` : "";
    const cadH = cad ? cad >= R.repereCadence ? `<span class="citron">bonne · repère ${R.repereCadence}</span>` : cad >= R.repereCadence - R.cadencePresque ? `presque · vise ${R.repereCadence}` : `<span class="violet">un peu basse · vise ${R.repereCadence}</span>` : "";
    let h = `<div class="carte-tete">${retourLigne(`${U.jourTxt(s.ts)} · ${U.heureTxt(s.ts)}`)}${s.local ? `<button type="button" class="rond" data-feuille="menu-sortie" data-id="${esc(s.id)}" aria-label="Plus d'actions">${ic("menu", 18)}</button>` : ""}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${U.pillType(lib, "", { bouton: true, attrs: `data-feuille="type" data-id="${esc(s.id)}" aria-label="Changer le type de cette sortie"` })}${manuel ? `<span class="etiquette">Saisie à la main</span>` : ""}${s.local ? `<span class="etiquette">sur ce téléphone</span>` : ""}</div>
      ${U.bilanLigne(v)}
      <section class="stats"><div class="rang"><div class="stat"><div class="l">Distance</div>${U.num(U.kmTxt(s.dist), "km", "v")}</div><div class="stat"><div class="l">Durée</div>${U.num(fmtDur(s.dur), "", "v")}</div>
        <div class="stat"><div class="l">Allure</div>${U.num(U.allure(s.allure), "/km", "v")}${allureH ? `<div class="h">${esc(allureH)}</div>` : ""}</div></div>
        <div class="rang deux"><div class="stat"><div class="l">Ressenti</div>${res != null ? `${U.num(res, "/10", "v")}<div class="h">${esc(cran.mot)}</div>` : `<button type="button" class="citron" style="font-weight:700;margin-top:4px" data-feuille="ressenti" data-id="${esc(s.id)}">Noter</button>`}</div>
        ${manuel && s.fc ? `<div class="stat"><div class="l">Cœur moy.</div>${U.num(Math.round(s.fc), "bpm", "v")}</div>` : cad ? `<div class="stat"><div class="l">Cadence</div>${U.num(cad, "pas/min", "v")}<div class="h">${cadH}</div></div>` : ""}</div></section>`;
    if (!manuel) h += coeurCarte(s, v, lib, pd);
    // 29/10 (retours d'Omar) : « Ta sortie en un coup d'œil » et « En résumé » retirés ; temps par zone d'allure (comme Strava)
    // et allure par km avec le cœur moyen de chaque km.
    if (!manuel) h += zonesAllureHTML(s) + allureParKmHTML(s, lib);
    if (manuel) h += `<div class="cap" style="padding:0 4px">Saisie à la main : pas de courbe, de zones ni d'allure par km. Le bilan s'appuie sur ton allure.</div>`;
    return h;
  }
  function coeurCarte(s, v, lib, pd) {
    const fm = fcMax(), defs = defsZones();
    if (!(Calc.coeurFiable(s) && s.fc) || !defs) {
      return `<section class="carte"><div class="carte-tete"><h2>Cœur</h2>${info("coeur")}</div><div class="verdict-box"><span class="vi" style="background:var(--control);color:var(--text)">${ic("montre", 14)}</span><span>Données cardio partielles avec ta montre : le bilan s'appuie sur ton allure et ton ressenti.</span></div>
        ${s.fc ? `<div class="mini deux">${mt("FC moy.", Math.round(s.fc), "bpm")}${mt("FC max", s.fcMax ? Math.round(s.fcMax) : "—", s.fcMax ? "bpm" : "")}</div>` : ""}</section>`;
    }
    const zs = Calc.zonesSortie(s, fm.valeur, fcRepos()), der = cardiacDrift({ hrSeries: s.hr, paceSeries: s.pace, durationSec: s.dur, type: s.type });
    const facile = lib === "Sortie facile" || lib === "Longue";
    const tFc = v.tuiles.find((t) => t.cle === "coeur"), dFc = tFc && tFc.delta != null && !/^Cœur (au|en) (tempo|seuil|fractionné)/.test(tFc.label) ? tFc.delta : null;
    const trois = [mt("FC moy.", Math.round(s.fc), "bpm", dFc != null && Math.abs(dFc) >= 1 ? `<span class="${dFc > 0 ? "violet" : "citron"}">${dFc > 0 ? "+" : "−"}${Math.abs(dFc)} vs habitude</span>` : ""), mt("FC max", s.fcMax ? Math.round(s.fcMax) : "—", "bpm")];
    if (facile && der) trois.push(mt("Dérive", der.pct, "%", `<span class="${der.pct > R.repereDerivePct ? "violet" : "citron"}">${esc(DRIFT_LABELS[der.state].toLowerCase())}</span>`));
    else if (pd && pd.fc && pd.zone >= 2) trois.push(mt(Calc.ZONE_A[pd.zone].replace(/^./, (c) => c.toUpperCase()), Math.round(pd.fc), "bpm", v.cle === "premiere" ? "point de départ" : tFc && tFc.habitude ? `habitude ${tFc.habitude}` : ""));
    const vr = Calc.verdictRepartition(lib, zs), id = R.idealZones[lib];
    return `<section class="carte"><div class="carte-tete"><h2>Cœur</h2>${info("coeur")}</div>${U.courbeCoeur(s, defs)}
      <div class="mini" style="background:var(--sunken);border-radius:14px;padding:4px">${trois.join("").replace(/class="mt"/g, 'class="mt" style="background:transparent"')}</div>
      ${facile && der ? `<div class="txt2" style="font-size:14.5px">${esc(cardiacDriftText(der))}</div>` : ""}
      ${zs ? `<div class="filet"></div><span class="sur">Temps par zone</span><b style="font-size:14px">Ta sortie</b>${U.zbarre(zs.secs, { labels: true, haute: true })}${U.zcols(zs.secs, true)}
        ${id ? `<div class="carte-tete" style="font-size:14px;margin-top:4px"><b>Idéal pour ${esc(pour(lib))}</b><span class="cap">${esc(id.texte)}</span></div>${U.zbarre(id.pct, { pale: true })}` : ""}
        ${vr ? U.verdictBox(vr) : ""}` : ""}</section>`;
  }
  function allureParKmHTML(s, lib) {
    const ks = lib === "Fractionné" ? null : kmSplits({ paceSeries: s.pace, distanceKm: s.dist, durationSec: s.dur, type: "EF" });
    if (!ks) return `<section class="carte"><h2>Allure par km</h2><div class="cap">${lib === "Fractionné" ? "Pas d'allure par km pour un fractionné : ce sont les blocs d'effort qui comptent." : "Pas d'allure par km : il faut au moins 3 km et l'allure détaillée de ta montre."}</div></section>`;
    const k = ks.kms, n = k.length, rapide = Math.min(...k), moy = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    // Un message sur la gestion de l'effort (pas une redite du plus rapide / plus lent).
    let msg, bon = false;
    const h2 = Math.floor(n / 2), d = moy(k.slice(0, h2)) - moy(k.slice(n - h2));
    if (lib === "Sortie facile" || lib === "Longue") {
      const i = k.indexOf(rapide), ecart = Math.round(ks.avg - rapide);
      if (ecart >= 20 && i < n - 1) { msg = `Le km ${i + 1} est parti vite (${fmtKmPace(rapide)})${i < n - 2 ? `, les ${Math.min(2, n - 1 - i)} suivants l'ont payé` : ""}. En facile, vise un rythme régulier.`; }
      else if (Math.max(...k) - rapide < 20) { msg = "Très régulier : tous tes km à moins de 20 s d'écart. C'est ça, une sortie facile."; bon = true; }
      else msg = kmSplitsMessage(ks);
    } else {
      // Tempo, seuil, compétition : on juge le bloc (les km plus rapides que la moyenne de la sortie), pas l'échauffement.
      const bloc = k.filter((sec) => sec < ks.avg);
      if (bloc.length >= 2) {
        const a = bloc[0], b = bloc[bloc.length - 1];
        if (b <= a - 3) { msg = `Ton bloc a fini plus vite qu'il n'a commencé (${fmtKmPace(a)} → ${fmtKmPace(b)}) : bien géré.`; bon = true; }
        else if (b >= a + 10) msg = `Ton bloc a ralenti à la fin (${fmtKmPace(a)} → ${fmtKmPace(b)}) : pars un peu moins vite au début.`;
        else { msg = `Bloc régulier (${fmtKmPace(a)} → ${fmtKmPace(b)}) : bien tenu.`; bon = true; }
      } else if (d > 5) { msg = `Tu as fini plus vite que tu n'as commencé (${fmtKmPace(k[0])} → ${fmtKmPace(k[n - 1])}) : bien géré.`; bon = true; }
      else msg = kmSplitsMessage(ks);
    }
    const fc = Calc.coeurFiable(s) ? Calc.kmCoeur(s) : null, cf = (i) => (fc && fc[i] ? `<span class="c">${fc[i]}</span>` : '<span class="c"></span>');
    const rows = k.map((sec, i) => `<div class="km${i === ks.fastest ? " rapide" : ""}"><span>Km ${i + 1}</span><span class="piste"><i style="width:${kmSplitBarPct(sec, rapide).toFixed(1)}%"></i></span><span class="p">${fmtKmPace(sec)}</span>${cf(i)}</div>`).join("")
      + (ks.partial ? `<div class="km partiel"><span>${String(ks.partial.km).replace(".", ",")} km</span><span class="piste"><i style="width:${kmSplitBarPct(ks.partial.pace, rapide).toFixed(1)}%"></i></span><span class="p">${fmtKmPace(ks.partial.pace)}</span>${cf(k.length)}</div>` : "");
    const tete = `<div class="km km-tete"><span></span><span></span><span class="p">allure</span><span class="c">${fc ? "cœur" : ""}</span></div>`;
    return `<section class="carte"><h2>Allure par km</h2>${U.verdictBox({ ton: bon ? "bon" : "presque", titre: msg })}<div style="display:flex;flex-direction:column;gap:9px">${tete}${rows}</div></section>`;
  }
  // Temps par zone d'allure (retour d'Omar du 29/10, sur le modèle de Strava) : le temps passé dans chaque zone d'allure, la plus
  // rapide en haut, avec ses bornes. Les zones viennent de ton chrono (Profil › Ton chrono), sinon de ton allure facile habituelle.
  function zonesAllureHTML(s) {
    const z = etat.zones, dec = z ? Calc.decoupage(s, z) : null;
    if (!dec) return "";
    const t = dec.tempsParZone, tot = t.reduce((a, v) => a + v, 0) || 1, mx = Math.max(...t, 1), plages = Calc.zonesLibelles(z), prof = z.niveau;
    const rangs = [4, 3, 2, 1, 0].map((i) => `<div class="za"><span class="za-z">Zone ${i + 1}</span><span class="za-piste"><i style="width:${(t[i] / mx * 100).toFixed(1)}%;background:${R.zonesCouleurs[i]}"></i><b>${Math.round(t[i] / tot * 100)} %</b></span><span class="za-p">${esc(plages[i].plage)}</span></div>`).join("");
    return `<section class="carte"><h2>Temps par zone d'allure</h2>
      <div class="cap" style="margin-top:-6px">${prof ? `D'après ton chrono : ${Calc.kmTxt(prof.distanceKm * 1000)} km en ${fmtDur(prof.timeSec)}` : "D'après ton allure habituelle en sortie facile"}</div>
      <div style="display:flex;flex-direction:column;gap:10px">${rangs}</div></section>`;
  }

  /* =================== Sorties (5) =================== */
  function ligneCourse(s) {
    return `<div class="ligne" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}"><i class="pt" style="background:${U.couleurType(libDe(s))}"></i>
      <div class="m"><b>${esc(libDe(s))} · ${U.kmTxt(s.dist)} km</b><span>${esc(U.dateCourte(s.ts))}${s.manuel || s.local ? ` <span class="etiquette" style="height:19px;font-size:10.5px;margin-left:4px">Saisie à la main</span>` : ""}</span></div>
      <span class="al">${U.allure(s.allure)}</span><span class="chev">${ic("chevron", 16)}</span></div>`;
  }
  // Années et mois repliés (retour d'Omar du 28/10) : par défaut, seuls l'année et le mois en cours sont dépliés ; ensuite,
  // ce que tu ouvres ou fermes est gardé sur ce téléphone.
  function estReplie(k) {
    if (k in etat.plis) return !!etat.plis[k];
    const d = new Date(maintenant());
    return k !== `a${d.getFullYear()}` && k !== `m${d.getFullYear()}-${d.getMonth()}`;
  }
  const nomAutre = (s) => (s.type === "Other" ? "Autre" : s.type === "Récupération" ? "Récup" : s.type);
  const quoiAutre = (s) => `${nomAutre(s)} ${s.dist > 0.3 && !/Renfo|Mobilit/.test(s.type) ? `${U.kmTxt(s.dist)} km` : U.dureeTxt(s.dur)}`;
  function sortiesHTML() {
    const f = etat.filtre, liste = etat.sorties.slice().reverse();
    const annees = [];
    liste.forEach((s) => { const d = new Date(s.ts), y = d.getFullYear(), m = d.getMonth();
      let a = annees.find((x) => x.y === y); if (!a) { a = { y, mois: [] }; annees.push(a); }
      let mo = a.mois.find((x) => x.m === m); if (!mo) { mo = { m, items: [] }; a.mois.push(mo); } mo.items.push(s); });
    const totaux = (items) => { const c = items.filter(Calc.estCourse); return `${c.length} ${c.length > 1 ? "courses" : "course"} · ${Calc.kmTxt(c.reduce((a, s) => a + s.dist, 0) * 1000)} km`; };
    const lignesMois = (items) => {
      const out = []; let gris = null;
      items.forEach((s) => {
        if (Calc.estCourse(s)) { gris = null; if (f !== "autres") out.push(ligneCourse(s)); return; }
        if (f === "courses") return;
        const jour = U.debutJour(s.ts);
        if (gris && gris.jour === jour) gris.items.push(s); else { gris = { jour, items: [s] }; out.push(gris); }
      });
      return out.map((x) => typeof x === "string" ? x : `<div class="ligne grise"><i class="pt creux"></i><span>${esc(U.dateCourte(x.jour).replace(/\s\S+$/, ""))} · ${esc(x.items.map(quoiAutre).join(" · "))}</span></div>`).join("");
    };
    const seg = [["courses", "Courses"], ["toutes", "Toutes"], ["autres", "Autres"]].map(([k, l]) => `<button type="button" data-filtre="${k}" class="${f === k ? "actif" : ""}" aria-pressed="${f === k}">${l}</button>`).join("");
    const corps = annees.map((a) => {
      const ra = estReplie(`a${a.y}`), tous = a.mois.flatMap((m) => m.items);
      return `<button type="button" class="annee-tete${ra ? " replie" : ""}" data-replie="a${a.y}" aria-expanded="${!ra}"><span class="an" style="${ra ? "color:var(--text-3)" : ""}">${a.y}</span><span class="cap">${totaux(tous)}</span><span class="chev-rond">${ic("chevronHaut", 16)}</span></button>
        ${ra ? "" : a.mois.map((m) => { const k = `m${a.y}-${m.m}`, rm = estReplie(k), lignes = lignesMois(m.items);
          if (!lignes) return "";   // rien à montrer avec ce filtre : pas d'en-tête de mois
          return `<section class="mois-carte"><button type="button" class="mois-tete${rm ? " replie" : ""}" data-replie="${k}" aria-expanded="${!rm}"><h2>${esc(U.MOIS[m.m])}</h2><span class="cap">${totaux(m.items)}</span><span class="chev-rond">${ic("chevronHaut", 16)}</span></button>${rm ? "" : `<div style="padding-bottom:4px">${lignes}</div>`}</section>`; }).join("")}`;
    }).join("");
    return `${tete("", "Sorties", `<button type="button" class="btn-contour" data-go="#/ajouter">${ic("plus", 16, 2.6)}Ajouter</button>`)}
      <div class="segments" role="group" aria-label="Filtrer les sorties">${seg}</div>${corps || `<p class="cap" style="text-align:center;padding:30px">Rien à afficher.</p>`}`;
  }
  // 5C · Ajouter une séance (gardée sur ce téléphone dans le prototype).
  let brouillon = null;
  function ajouterHTML() {
    const b = brouillon || (brouillon = { type: "Sortie facile", ressenti: null });
    const auj = new Date(maintenant()), iso = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, "0")}-${String(auj.getDate()).padStart(2, "0")}`;
    const types = ["Sortie facile", "Longue", "Tempo", "Seuil", "Fractionné", "Compétition", "Autre"];
    return `<div class="feuille"><div class="poignee" aria-hidden="true"></div>
      <div class="carte-tete"><h1 style="font-size:26px">Ajouter une séance</h1><button type="button" class="rond petit" data-go="#/sorties" aria-label="Fermer">${ic("fermer", 16)}</button></div>
      <div class="txt2" style="margin-top:-6px">Une sortie que ta montre n'a pas envoyée.</div>
      <div class="champ"><label for="aDate">Date</label><input id="aDate" type="date" value="${iso}" max="${iso}"></div>
      <div class="champ"><span class="lab">Type</span><div class="puces-choix">${types.map((t) => `<button type="button" data-ajout-type="${esc(t)}" class="${b.type === t ? "actif" : ""}" style="--c:${U.couleurType(t)}"><i></i>${esc(t === "Sortie facile" ? "Facile" : t)}</button>`).join("")}</div></div>
      <div class="champs2"><div class="champ"><label for="aDist">Distance</label><div class="avec-u"><input id="aDist" inputmode="decimal" placeholder="5,0"><em>km</em></div></div>
        <div class="champ"><label for="aDur">Durée</label><div class="avec-u"><input id="aDur" inputmode="numeric" placeholder="35:00"><em>h:min:s</em></div></div></div>
      <div class="champ"><label for="aFc">Cœur moyen · facultatif</label><div class="avec-u"><input id="aFc" inputmode="numeric" placeholder="—"><em>bpm</em></div></div>
      <div class="champ"><div class="carte-tete"><span class="lab">Comment tu l'as sentie ?</span><span class="cap">facultatif</span></div>${U.crans(b.ressenti, 'data-ajout-cran="1"')}</div>
      <div class="cap">Elle portera l'étiquette « Saisie à la main ». Son bilan comparera ton allure, sans courbe ni zones. Dans le prototype, elle reste sur ce téléphone.</div>
      <div class="erreur" id="aErreur" role="alert"></div>
      <button type="button" class="btn primaire" data-action="enregistrer-ajout">Enregistrer</button></div>`;
  }
  function enregistrerAjout() {
    const dist = Number(String(document.getElementById("aDist").value).replace(",", ".")), durTxt = String(document.getElementById("aDur").value).trim();
    const p = durTxt.split(":").map(Number), dur = p.some(Number.isNaN) ? 0 : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60;
    const fc = Number(document.getElementById("aFc").value) || null, date = document.getElementById("aDate").value;
    if (!(dist > 0) || !(dur > 0) || !date) { document.getElementById("aErreur").textContent = "Indique la distance et la durée (par exemple 5,0 km et 35:00)."; return; }
    const id = `local-${Date.now()}`, b = brouillon;
    etat.ajouts = etat.ajouts.concat([{ id, local: true, start_date: new Date(`${date}T12:00:00`).toISOString(), type: TYPES_APP[b.type], apple_type: "Manuel", distance_km: dist, duration_sec: dur, avg_hr: fc, include_in_stats: true }]);
    etat.types = { ...etat.types, [id]: b.type }; garder(CLES.types, etat.types);   // Tempo et Seuil : même type dans l'app, départagés ici
    if (b.ressenti != null) noterRessenti(id, b.ressenti);
    garder(CLES.ajouts, etat.ajouts); brouillon = null; recalculer();
    U.toast("Séance ajoutée sur ce téléphone."); location.hash = `#/sortie/${id}`;
  }

  /* =================== Progression (6) =================== */
  const MOIS_J = 30.44;
  // L'écart d'une courbe (départ → arrivée) et sa période : « en 12 mois », ou « depuis janvier » si tes sorties commencent après.
  const ecartCourbe = (c, rapideEnHaut) => (c.debut == null ? null : Math.round(rapideEnHaut ? c.debut - c.fin : c.fin - c.debut));
  const suffixeCourbe = (c, mois) => (c.depuis > maintenant() - mois * MOIS_J * JOUR + 21 * JOUR ? `depuis ${U.MOIS[new Date(c.depuis).getMonth()]}` : `en ${mois} mois`);
  const pastilleEcart = (e, mois, suffixe) => { const m = U.ecartMots(e, suffixe || `en ${mois} mois`); return `<span class="etiquette" style="height:26px;padding:0 10px;font-size:12.5px;font-weight:700;${m.cls === "citron" ? "background:var(--accent-soft);color:var(--accent)" : m.cls === "violet" ? "background:var(--attention-bg);color:var(--attention-text)" : ""}">${esc(m.txt)}</span>`; };
  const nouveau = (t) => `${esc(t)}<span class="badge-nouveau">NOUVEAU</span>`;
  function progressionHTML(onglet, ancre) {
    const now = maintenant(), mois = etat.periode, t = ["allure", "coeur", "volume"].includes(onglet) ? onglet : "allure";
    // 28/10 (retours d'Omar) : une icône par onglet, et la période en boutons bien visibles sous les onglets (12 mois par défaut).
    const segs = [["allure", "Allure", "jauge"], ["coeur", "Cœur", "coeur"], ["volume", "Volume", "barres"]].map(([k, l, i]) => `<button type="button" data-go="#/progression/${k}" class="${t === k ? "actif" : ""}" aria-pressed="${t === k}">${ic(i, 17, 2.2)}${l}</button>`).join("");
    const per = `<div class="periodes" role="group" aria-label="Période"><span>Sur</span>${[3, 6, 12].map((m) => `<button type="button" data-periode="${m}" class="${m === mois ? "actif" : ""}" aria-pressed="${m === mois}">${m} mois</button>`).join("")}</div>`;
    const corps = !etat.courses.length ? `<section class="carte attenue"><h2>Ton allure facile</h2><svg viewBox="0 0 300 60" width="100%"><path d="M10 45 C80 40 150 30 290 15" fill="none" stroke="#5A6068" stroke-width="3" stroke-dasharray="5 6"/></svg></section>`
      : t === "coeur" ? progressionCoeur(now, mois) : t === "volume" ? progressionVolume(now, mois) : progressionAllure(now, mois);
    return `${tete("", "Progression")}<div class="segments onglets-icones" role="group" aria-label="Thème">${segs}</div>${per}${!etat.courses.length ? aucuneSortieHTML() : ""}${corps}`;
  }
  function progressionAllure(now, mois) {
    const debut = now - mois * MOIS_J * JOUR, defs = defsZones(), o = objectif();
    const { rp } = Calc.repereCourbe(etat.courses, now, mois);
    let facile;
    if (rp.etat === "bientot") facile = `<div class="lead">Encore ${rp.manque} ${rp.manque > 1 ? "sorties faciles" : "sortie facile"} sur 4 semaines pour mesurer ton allure de départ.</div>`;
    else {
      const c = U.courbe(rp.points, { debut, fin: now, couleur: "#C6F432", rapideEnHaut: true, fmt: (v) => fmtKmPace(v), padMin: 3, label: "Ton allure facile", grille: "allure" });
      facile = `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px">${U.num(fmtKmPace(rp.valeur), "/km", "n52")}<div style="text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end">${c.debut != null ? pastilleEcart(ecartCourbe(c, true), mois, suffixeCourbe(c, mois)) : pastilleEcart(rp.ecart, mois)}${rp.modeCoeur ? `<span class="cap">à cœur égal · ${rp.fcRef} bpm</span>` : ""}</div></div>${c.svg}`;
    }
    const obj = o ? `<div class="filet"></div><div style="display:flex;align-items:center;gap:10px;font-size:14.5px">${ic("drapeau", 17)}<span class="txt2" style="flex:1">Ton objectif <b style="color:var(--text)">${esc(o.label)}</b></span>${o.allure ? `<span class="txt2">${fmtKmPace(o.allure)}/km</span>` : ""}</div>` : "";
    // Tes allures par effort : Tempo, Seuil, Fractionné (le Facile est « Ton allure facile », Q2).
    const liste = Calc.alluresParEffort(etat.courses, now, mois, etat.zones, defs, null, mois);
    // 28/10 (« sur 12 mois, je ne vois aucune séance de fractionné ») : la courbe suit la période choisie, même sans séance dans
    // les 4 dernières semaines ; le chiffre en grand est alors celui de ta dernière séance, avec sa date.
    const efforts = liste.filter((e) => e.cle !== "ef").map((e, i) => {
      const coul = U.couleurType(e.cle === "tempo" ? "Tempo" : e.cle === "seuil" ? "Seuil" : "Fractionné");
      const quoi = e.cle === "frac" ? "fractionné" : e.cle === "tempo" ? "séance au tempo" : "séance au seuil";
      const pts = e.points.slice().sort((a, b) => a.ts - b.ts), dernier = pts[pts.length - 1];
      const c = pts.length >= 3 ? U.courbe(pts, { debut, fin: now, couleur: coul, rapideEnHaut: true, fmt: (v) => fmtKmPace(v), padMin: 4, h: 112, label: `Allure ${e.nom}`, grille: "allure" }) : null;
      const em = c && c.debut != null ? U.ecartMots(ecartCourbe(c, true), suffixeCourbe(c, mois)) : U.ecartMots(e.ecart);   // l'écart dit ce que montre la courbe
      const valeur = e.maintenant != null ? `${U.num(fmtKmPace(e.maintenant), "/km", "ta-v")}<span class="cap">tes 4 dernières semaines</span>`
        : dernier ? `${U.num(fmtKmPace(dernier.v), "/km", "ta-v")}<span class="cap">ton dernier ${quoi === "fractionné" ? "fractionné" : quoi.replace("séance", "passage")}, le ${esc(U.jourMois(dernier.ts).replace(/\.$/, ""))} · rien depuis</span>` : "";
      let bas;
      if (c) bas = c.svg;
      else if (pts.length) bas = `<div class="txt2" style="font-size:14px">${pts.length} ${pts.length > 1 ? "séances" : "séance"} sur ${mois} mois. Encore ${3 - pts.length} pour tracer ta tendance.</div>`;
      else bas = `<div class="txt2" style="font-size:14px">${e.cle !== "frac" && !defs ? "Renseigne ta FC max ou ton âge pour lire l'effort au cœur." : `Pas de ${quoi} sur ${mois} mois.`}</div>`;
      return `<div class="effort" id="graphe-${e.cle}" style="display:flex;flex-direction:column;gap:6px;${i ? "border-top:1px solid var(--line);padding-top:14px" : ""}">
        <div class="carte-tete"><span class="ta-tete" style="--c:${coul};color:var(--text);font-size:15px"><i></i>${esc(e.nom)}</span>${c || e.maintenant != null ? `<b class="${em.cls}" style="font-size:13.5px">${esc(em.txt)}</b>` : ""}</div>
        ${valeur ? `<div style="display:flex;flex-direction:column;gap:2px">${valeur}</div>` : ""}${bas}</div>`;
    }).join("");
    // Croisements
    const ar = Calc.allureRegularite(etat.courses, now);
    const maxA = Math.max(ar.deux || 0, ar.une || 0), barreA = (v) => (v ? Math.max(25, 100 - (v - Math.min(ar.deux || v, ar.une || v)) * 2.2) : 0);
    const regu = ar.deux != null && ar.une != null ? `<div class="lead">${ar.gain >= R.repereEcartMinSec ? `Quand tu cours 2 fois par semaine, ton allure facile gagne ${ar.gain} s/km.` : ar.gain <= -R.repereEcartMinSec ? `Tes semaines à 2 sorties, ton allure facile est ${-ar.gain} s/km plus lente : la fatigue s'accumule peut-être.` : "Ton allure facile est la même, que tu coures 1 ou 2 fois par semaine."}</div>
      ${[["Semaines à 2 sorties ou plus", ar.deux, true], ["Semaines à 1 sortie", ar.une, false]].map(([l, v, c]) => `<div style="display:flex;flex-direction:column;gap:6px"><div class="carte-tete"><span class="txt2" style="font-size:14px">${l}</span>${U.num(fmtKmPace(v), "/km", c ? "citron" : "")}</div><div class="zbarre" style="height:10px;background:var(--control);border-radius:5px"><i style="flex:none;width:${barreA(v).toFixed(0)}%;border-radius:5px;background:${c ? "#C6F432" : "#5A6068"}"></i></div></div>`).join("")}
      <div class="cap">Tes sorties faciles · 12 semaines</div>` : `<div class="txt2" style="font-size:14px">Il faut des semaines à 1 sortie et d'autres à 2 sorties ou plus, sur 12 semaines, pour comparer.</div>`;
    const as = Calc.allureRessenti(etat.courses, etat.ressentis, now, mois);
    const barre10 = (v, c) => `<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:2px;flex:1">${Array.from({ length: 10 }, (_, i) => `<i style="height:12px;border-radius:2px;background:${i < Math.round(v) ? c : "var(--control)"}"></i>`).join("")}</div>`;
    const ress = as.manque > 0 ? `<div class="txt2" style="font-size:14px">Note ton ressenti après tes sorties faciles : encore ${as.manque} pour voir si la même allure te semble plus facile (${as.n} ${as.n > 1 ? "notées" : "notée"} sur la période).</div>`
      : as.unMois ? `<div class="txt2" style="font-size:14px">Tes ressentis notés sont tous du même mois : la comparaison viendra le mois prochain.</div>`
      : `<div class="lead">${as.fin.ressenti <= as.debut.ressenti - 1 ? `À ${fmtKmPace(as.fin.allure)}/km, la même sortie te semble plus facile qu'en ${U.MOIS[as.debut.mois]}.` : as.fin.ressenti >= as.debut.ressenti + 1 ? `Tes sorties faciles te semblent plus dures qu'en ${U.MOIS[as.debut.mois]}.` : `Même ressenti qu'en ${U.MOIS[as.debut.mois]} pour tes sorties faciles.`}</div>
        ${[as.debut, as.fin].map((x, i) => `<div style="display:flex;align-items:center;gap:12px"><span class="txt2" style="width:40px;font-size:13.5px">${U.MOIS_C[x.mois]}</span>${barre10(x.ressenti, i ? "#C6F432" : "#8B8F96")}${U.num(String(Math.round(x.ressenti * 10) / 10).replace(".", ","), "/10", i ? "citron" : "")}</div>`).join("")}
        <div class="cap">Ressenti moyen de tes sorties faciles notées · ${as.n} sorties</div>`;
    return `<section class="carte" id="graphe-ef"><div class="carte-tete"><span class="ta-tete" style="--c:#C6F432;color:var(--text);font-size:16px"><i></i>Ton allure facile</span>${info("allure-facile")}</div>${facile}${obj}</section>
      <section class="carte"><div class="carte-tete"><h2>Tes allures par effort</h2>${info("efforts")}</div>${efforts}</section>
      <section class="carte"><div class="carte-tete"><h2>${nouveau("Allure × régularité")}</h2>${info("croisements")}</div>${regu}</section>
      <section class="carte"><div class="carte-tete"><h2>${nouveau("Allure × ressenti")}</h2>${info("croisements")}</div>${ress}</section>`;
  }
  function progressionCoeur(now, mois) {
    const fm = fcMax(), fr = fcRepos();
    let zones = `<div class="txt2">Renseigne ta FC max ou ton âge pour voir tes zones.</div>`;
    if (fm) {
      const z = Calc.zonesCardioPeriode(etat.courses, now, mois, fm.valeur, fr), tot = z.secs.reduce((a, v) => a + v, 0);
      const dur = etat.courses.filter((s) => s.ts >= now - mois * MOIS_J * JOUR && Calc.coeurFiable(s)).reduce((a, s) => a + s.dur, 0);
      if (z.n) { const fac = (z.secs[0] + z.secs[1]) / tot * 100;
        zones = `${U.deuxGrands(fac, 100 - fac)}${U.zbarre(z.secs, { repere: true })}${U.zcols(z.secs, false)}
          ${U.verdictBox(fac >= R.repereFacilePct ? { ton: "bon", titre: `Bon équilibre : ${Math.round(fac)} % en facile.` } : { ton: "presque", titre: `Un peu trop de soutenu : vise ${R.repereFacilePct} % en facile.` })}
          <div class="cap">${z.n} sorties · ${esc(U.dureeTxt(dur))} de course</div>`; }
      else zones = `<div class="txt2">Pas de sortie au cœur fiable sur la période.</div>`;
    }
    const debut = now - mois * MOIS_J * JOUR;
    const cm = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.coeurMoyen), der = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.derive);
    const tousCm = etat.courses.filter((s) => s.type === "EF" || s.type === "Long").map((s) => ({ ts: s.ts, v: Calc.coeurMoyen(s) })).filter((p) => p.v != null);
    const tousDer = etat.courses.filter((s) => s.type === "EF" || s.type === "Long").map((s) => ({ ts: s.ts, v: Calc.derive(s) })).filter((p) => p.v != null);
    const cC = U.courbe(tousCm, { debut, fin: now, couleur: "#F2F3F0", fmt: (v) => String(Math.round(v)), padMin: 2, label: "Ton cœur en sortie facile", vide: "Pas encore de sortie facile au cœur fiable sur la période." });
    const cD = U.courbe(tousDer, { debut, fin: now, couleur: "#F2F3F0", fmt: (v) => `${Math.round(v)} %`, padMin: 1, repere: { v: R.repereDerivePct, label: `${R.repereDerivePct} %` }, label: "Dérive cardiaque", vide: "Pas encore de sortie facile de 40 min ou plus sur la période." });
    const ecartBpm = cC.debut != null ? Math.round(cC.debut - cC.fin) : null;
    const sf = fm ? Calc.sortiesFacilesZones(etat.courses, now, fm.valeur, fr) : [], vraies = sf.filter((x) => x.vraiment).length;
    // La valeur en grand = tes 4 dernières semaines = le bout de la courbe (même chiffre des deux côtés).
    const valCm = cC.fin ?? cm.maintenant, valDer = cD.fin ?? der.maintenant;
    return `<section class="carte"><div class="carte-tete"><h2>Temps par zone</h2>${info("coeur")}</div>${zones}</section>
      <section class="carte"><div class="carte-tete"><span class="ta-tete" style="--c:#C6F432;color:var(--text);font-size:16px"><i></i>Ton cœur en sortie facile</span>${info("coeur-facile")}</div>
        ${valCm != null ? `<div style="display:flex;align-items:flex-end;justify-content:space-between">${U.num(Math.round(valCm), "bpm", "n52")}<b class="${ecartBpm == null || Math.abs(ecartBpm) < 2 ? "gris" : ecartBpm > 0 ? "citron" : "violet"}" style="font-size:13.5px">${ecartBpm == null || Math.abs(ecartBpm) < 2 ? `stable ${suffixeCourbe(cC, mois)}` : `${Math.abs(ecartBpm)} bpm ${ecartBpm > 0 ? "de moins" : "de plus"} ${suffixeCourbe(cC, mois)}`}</b></div>` : ""}
        ${cC.svg}<div class="txt2" style="font-size:14.5px">À allure égale, un cœur qui baisse veut dire que tu progresses.</div></section>
      <section class="carte"><div class="carte-tete"><b style="font-size:16px">Dérive cardiaque</b>${info("derive")}</div>
        ${valDer != null ? `<div style="display:flex;align-items:flex-end;justify-content:space-between">${U.num(Math.round(valDer), "%", "n52")}<b class="${valDer < R.repereDerivePct ? "citron" : "violet"}" style="font-size:13.5px">${valDer < R.repereDerivePct ? `stable · sous ${R.repereDerivePct} %` : `au-dessus de ${R.repereDerivePct} %`}</b></div>` : ""}
        ${cD.svg}<div class="txt2" style="font-size:14.5px">Combien ton cœur monte en fin de sortie facile. Sous ${R.repereDerivePct} % : ton endurance tient.</div></section>
      <section class="carte"><div class="carte-tete"><h2>${nouveau("Tes sorties faciles")}</h2>${info("sorties-faciles")}</div>
        ${sf.length ? `<div style="display:flex;align-items:center;gap:12px"><span class="num" style="font-size:52px">${vraies}<span style="color:var(--text-3);font-size:30px">/${sf.length}</span></span><span class="txt2" style="font-size:14.5px">vraiment faciles :<br>${R.repereFacilePct} % ou plus en zones 1-2</span></div>
          <div style="display:flex;flex-direction:column;gap:10px">${sf.map((x) => `<div role="link" tabindex="0" data-go="#/sortie/${esc(x.id)}" style="display:grid;grid-template-columns:52px 1fr 44px 16px;align-items:center;gap:10px;font-size:13.5px"><span class="txt2">${esc(U.jourMois(x.ts))}</span>
            <span style="position:relative;height:10px;border-radius:5px;background:var(--control)"><i style="display:block;height:100%;width:${Math.round(x.pct)}%;border-radius:5px;background:${x.vraiment ? "#C6F432" : "#5A6068"}"></i><i style="position:absolute;top:-4px;bottom:-4px;left:${R.repereFacilePct}%;width:2px;background:var(--text)"></i></span>
            <b style="text-align:right">${Math.round(x.pct)} %</b><span class="citron">${x.vraiment ? ic("check", 15, 2.6) : ""}</span></div>`).join("")}</div>
          <div class="cap">Trait blanc = repère ${R.repereFacilePct} %.${sf.length - vraies ? ` ${sf.length - vraies === 1 ? "L'autre est trop montée" : `Les ${sf.length - vraies} autres sont trop montées`} en zone 3.` : ""}</div>`
          : `<div class="txt2">Pas encore de sortie facile au cœur fiable.</div>`}</section>
      <section class="carte"><div class="carte-tete"><h2>${nouveau("Ton cœur au repos")}</h2>${info("repos")}</div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between">${U.num(fr || "—", fr ? "bpm" : "", "n52")}<span class="cap">${fr ? "valeur de ton profil" : "pas encore de mesure"}</span></div>
        <svg viewBox="0 0 300 50" width="100%" aria-hidden="true"><path d="M8 18 C80 22 160 30 292 36" fill="none" stroke="#33373D" stroke-width="3" stroke-dasharray="5 6"/></svg>
        <div class="txt2" style="font-size:14.5px">Bientôt lu sur ta montre chaque matin, avec la prochaine version de RunSync. Un cœur au repos qui baisse : ta forme progresse.</div></section>`;
  }
  function progressionVolume(now, mois) {
    const vol = Calc.volumeParMois(etat.sorties, now, mois), vmax = Math.max(...vol.map((m) => m.km), 1), W = 326, bw = (W - 8) / vol.length;
    const barres = `<svg width="100%" viewBox="0 0 ${W} 150" role="img" aria-label="Kilomètres par mois">${vol.map((m, i) => { const h = m.km / vmax * 100, x = 4 + i * bw, cur = i === vol.length - 1;
      return `<rect x="${(x + bw * 0.1).toFixed(1)}" y="${(122 - h).toFixed(1)}" width="${(bw * 0.8).toFixed(1)}" height="${Math.max(h, 2).toFixed(1)}" rx="${vol.length > 6 ? 4 : 8}" fill="${cur ? "#C6F432" : "#2C3035"}"/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(114 - h).toFixed(1)}" fill="${cur ? "#F2F3F0" : "#A3A7AD"}" font-size="${vol.length > 6 ? 9.5 : 11.5}" font-weight="700" text-anchor="middle">${Math.round(m.km)}</text>
        <text x="${(x + bw / 2).toFixed(1)}" y="142" fill="#5A6068" font-size="${vol.length > 6 ? 9 : 10.5}" text-anchor="middle">${U.MOIS_C[new Date(m.debut).getMonth()]}</text>`; }).join("")}</svg>`;
    const dernier = vol[vol.length - 1], avant = vol[vol.length - 2], d = avant ? dernier.km - avant.km : null;
    const sem = Calc.sortiesParSemaine(etat.sorties, now, 12), avec = sem.filter((w) => w.n > 0).length, serie = Calc.serie(etat.sorties, now);
    const cad = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.cadence), debut = now - mois * MOIS_J * JOUR;
    const tousCad = etat.courses.filter((s) => s.type === "EF" || s.type === "Long").map((s) => ({ ts: s.ts, v: Calc.cadence(s) })).filter((p) => p.v != null);
    const cC = U.courbe(tousCad, { debut, fin: now, couleur: "#F2F3F0", fmt: (v) => String(Math.round(v)), padMin: 2, repere: { v: R.repereCadence, label: String(R.repereCadence) }, label: "Cadence", vide: "Pas de cadence mesurée sur tes sorties faciles de la période." });
    const valCad = cC.fin ?? cad.maintenant, ecCad = cC.debut != null ? Math.round(cC.fin - cC.debut) : null;
    const recs = Calc.records(etat.sorties);
    return `<section class="carte"><div class="carte-tete"><h2>Volume par mois</h2></div><div style="display:flex;align-items:flex-end;justify-content:space-between">${U.num(U.kmTxt(dernier.km), "km", "n52")}${d != null ? `<b class="${d >= 0 ? "citron" : "gris"}" style="font-size:13.5px">${d >= 0 ? "+" : "−"}${U.kmTxt(Math.abs(d))} km vs ${U.MOIS_C[new Date(avant.debut).getMonth()]}</b>` : ""}</div>${barres}</section>
      <section class="carte" id="graphe-regularite"><div class="carte-tete"><h2>Régularité</h2></div>
        <div class="regu-tete"><span class="num regu-grand">${avec}</span><span class="txt2" style="font-size:14.5px;flex:1">semaines sur 12<br>avec au moins une sortie</span>${serie > 1 ? `<span class="serie">${serie} d'affilée</span>` : ""}</div>
        ${U.reguCases(sem)}<div class="carte-tete cap"><span>${esc(U.jourMois(sem[0].debut))}</span><span>cette semaine</span></div></section>
      <section class="carte"><div class="carte-tete"><b style="font-size:16px">Cadence</b>${info("cadence")}</div>
        ${valCad != null ? `<div style="display:flex;align-items:flex-end;justify-content:space-between">${U.num(Math.round(valCad), "pas/min", "n52")}<b class="gris" style="font-size:13.5px">${ecCad == null || Math.abs(ecCad) < 2 ? "stable" : `${ecCad > 0 ? "+" : "−"}${Math.abs(ecCad)} pas/min`} · repère ${R.repereCadence}</b></div>` : ""}
        ${cC.svg}<div class="txt2" style="font-size:14.5px">Des pas plus courts et plus rapides fatiguent moins.</div></section>
      <section class="carte" id="graphe-records"><div class="carte-tete"><h2>Tes records</h2>${info("records")}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${recs.map((r) => `<div class="mt"${r.id ? ` role="link" tabindex="0" data-go="#/sortie/${esc(r.id)}"` : ""} style="${r.valeur ? "" : "background:transparent;border:1.5px dashed var(--line-empty)"}">
          <span class="l">${esc(r.label)}</span>${r.valeur ? U.num(r.valeur, "", "v") : '<span class="tiret" style="margin:12px 0 10px"></span>'}<span class="h">${r.valeur ? esc(U.jourMois(r.ts)) : `encore ${r.manque} km`}</span></div>`).join("")}</div>
        <div class="cap">« Encore » = l'écart avec ta sortie la plus longue.</div></section>`;
  }

  /* =================== Profil (7) =================== */
  function montreInfo() {
    const der = etat.sorties.slice(-1)[0], auto = etat.courses.slice(-3).some((s) => Calc.coeurFiable(s)) ? "Apple Watch" : "Garmin";
    const nom = etat.montre || auto, connectee = der && maintenant() - der.ts < 14 * JOUR;
    return { nom, connectee, der };
  }
  function profilHTML() {
    const z = etat.zones, prof = z && z.niveau, fm = fcMax(), o = objectif(), m = montreInfo(), pseudo = (etat.profil && etat.profil.pseudo) || "";
    const rangee = (cle, icone, nom, val) => `<button type="button" class="rangee" data-go="#/profil/${cle}"><span class="ic">${ic(icone, 17)}</span><b>${esc(nom)}</b><span class="val">${esc(val)}</span><span style="color:var(--faint)">${ic("chevron", 16)}</span></button>`;
    const demo = (cle, nom) => `<button type="button" class="rangee" data-go="${cle}"><b style="font-weight:500;font-size:14.5px">${esc(nom)}</b><span style="color:var(--faint)">${ic("chevron", 16)}</span></button>`;
    return `<header class="tete">${pseudo ? `<div class="sur">${esc(pseudo)}</div>` : ""}<h1>Profil</h1></header>
      <section class="carte" role="link" tabindex="0" data-go="#/profil/montre" style="gap:10px"><div style="display:flex;align-items:center;gap:12px"><span class="ic" style="width:40px;height:40px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center">${ic("montre", 20)}</span>
        <div style="flex:1"><b style="font-size:16px">Ta montre</b><div class="txt2" style="font-size:14px;display:flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${m.connectee ? "var(--accent)" : "var(--faint)"}"></i>${esc(m.nom)} · ${m.connectee ? "connectée" : "pas de sortie récente"}</div></div><span style="color:var(--faint)">${ic("chevron", 16)}</span></div>
        ${m.der ? `<div class="cap">Dernière sortie reçue : ${esc(U.relatif(m.der.ts, maintenant()))}, ${esc(U.heureTxt(m.der.ts))}</div>` : ""}</section>
      <div class="groupe">${rangee("chrono", "drapeau", "Ton chrono", prof ? `${Calc.kmTxt(prof.distanceKm * 1000)} km · ${fmtDur(prof.timeSec)}` : "à renseigner")}${rangee("coeur", "coeur", "Ton cœur", fm ? `FC max ${fm.valeur}` : "à renseigner")}${rangee("objectif", "cible", "Ton objectif", o ? o.label : "aucun")}</div>
      <div class="groupe">${rangee("compte", "profil", "Ton compte", "e-mail, mot de passe")}${rangee("donnees", "donnees", "Tes données", "télécharger, supprimer")}</div>
      <button type="button" class="btn second" data-action="deconnexion">Se déconnecter</button>
      <div class="sur" style="padding:14px 2px 0">Prototype · écrans de démonstration</div>
      <div class="groupe">${demo("#/premiers/1", "Premiers pas (8 écrans)")}${demo("#/demo/record", "Après un record (plein écran)")}${demo("#/demo/partiel", "Bilan avec un cœur partiel (Garmin)")}${demo("#/demo/premieres", "Premières semaines")}${demo("#/demo/mois", "Mois sans sortie")}${demo("#/demo/reseau", "Pas de connexion")}${demo("#/demo/chargement", "Chargement")}${demo("#/demo/aucune", "Pas encore de sortie reçue")}${demo("#/demo/connexion", "Connexion")}</div>
      <div class="cap" style="padding:0 4px">Ces écrans reprennent tes vraies données, arrangées pour montrer chaque état. Rien n'est enregistré.</div>`;
  }
  function profilPage(page) {
    const fm = fcMax(), fr = fcRepos(), defs = defsZones(), z = etat.zones, prof = z && z.niveau, m = montreInfo(), o = objectif();
    const haut = (titre, sous) => `${retourLigne("Profil", "#/profil")}<h1 style="margin-top:4px">${esc(titre)}</h1>${sous ? `<div class="txt2" style="margin-top:-4px">${esc(sous)}</div>` : ""}`;
    const plageZ = (d, i) => (i === 0 ? `jusqu'à ${d.max}` : i === 4 ? `plus de ${defs[3].max}` : `${defs[i - 1].max + 1} à ${d.max}`);
    if (page === "montre") {
      const MONTRES = ["Apple Watch", "Garmin", "Whoop", "Strava", "Autre"], aide = { "Apple Watch": "Avec une Apple Watch, on reçoit ton cœur seconde par seconde et ton allure détaillée : bilan complet.", Garmin: "Garmin : cœur partiel via Apple Santé. Le bilan s'appuie sur ton allure et ton ressenti." };
      return `${haut("Ta montre")}<section class="carte" style="gap:0"><div class="carte-tete" style="padding-bottom:10px"><b style="display:flex;align-items:center;gap:8px"><i style="width:9px;height:9px;border-radius:50%;background:${m.connectee ? "var(--accent)" : "var(--faint)"}"></i>${m.connectee ? "Connectée" : "Pas de sortie récente"}</b><span class="cap">via Apple Santé</span></div>
        <div class="kv"><span>Dernière sortie reçue</span><b>${m.der ? esc(`${U.relatif(m.der.ts, maintenant())}, ${U.heureTxt(m.der.ts)}`) : "—"}</b></div>
        <div class="kv"><span>Importée depuis</span><b>${etat.sorties[0] ? esc(`${new Date(etat.sorties[0].ts).getDate()} ${U.MOIS_C[new Date(etat.sorties[0].ts).getMonth()]} ${new Date(etat.sorties[0].ts).getFullYear()}`) : "—"}</b></div>
        <button type="button" class="btn primaire" style="margin-top:12px" data-action="pas-ici">Ouvrir RunSync ${ic("externe", 16, 2.4)}</button><div class="cap" style="margin-top:10px">RunSync envoie tout de suite tes dernières sorties. Pratique juste après une course.</div></section>
        <section class="carte"><span class="sur">Ta montre</span><div class="puces-choix">${MONTRES.map((x) => `<button type="button" data-montre="${esc(x)}" class="${m.nom === x ? "actif" : ""}">${esc(x)}</button>`).join("")}</div>
          <div class="txt2" style="font-size:14px">${esc(aide[m.nom] || "Si elle envoie tes sorties à Apple Santé, RunSync les récupère.")}</div></section>
        <div class="groupe"><button type="button" class="rangee" data-go="#/premiers/6"><b>Revoir le guide de connexion</b><span style="color:var(--faint)">${ic("chevron", 16)}</span></button></div>`;
    }
    if (page === "coeur") return `${haut("Ton cœur", "Tes zones viennent de ces deux chiffres.")}
      <div class="mini deux">${mt("FC max", fm ? fm.valeur : "—", fm ? "bpm" : "", fm ? esc(fm.source) : "non renseignée", true)}${mt("FC de repos", fr || "—", fr ? "bpm" : "", fr ? "de ton profil" : "non renseignée", true)}</div>
      ${defs ? `<section class="carte" style="gap:0"><span class="sur" style="padding-bottom:6px">Tes zones cardio</span>${defs.map((d, i) => `<div class="kv"><span><i class="pt" style="background:${U.couleurZone(i)}"></i>Zone ${i + 1} · ${esc(R.zonesCardioEffort[i])}</span><b>${plageZ(d, i)} <small class="cap">bpm</small></b></div>`).join("")}</section>` : ""}`;
    if (page === "chrono") return `${haut("Ton chrono", "Sert à classer tes sorties quand le cœur manque.")}
      <section class="carte"><span class="sur">Ton chrono de référence</span>${prof ? `<div>${U.num(fmtDur(prof.timeSec), "", "n52")} <span class="txt2">sur ${Calc.kmTxt(prof.distanceKm * 1000)} km</span></div><div class="cap">${esc(prof.date ? `Déclaré le ${isoToFr(prof.date)}` : "Date non renseignée")}</div>` : `<div class="txt2">Pas de chrono : les zones sont estimées d'après tes sorties faciles.</div>`}</section>
      ${z ? `<section class="carte" style="gap:0"><span class="sur" style="padding-bottom:6px">Tes zones d'allure</span>${Calc.zonesLibelles(z).map((x) => `<div class="kv"><span><i class="pt" style="background:${x.couleur}"></i>${esc(x.nom)}</span><b>${esc(x.plage)}</b></div>`).join("")}</section>` : ""}
      <div class="sur" style="padding:6px 2px 0">Mettre à jour</div><div class="groupe"><button type="button" class="rangee" data-action="pas-ici"><span style="flex:1"><b style="display:block">Je connais un chrono récent</b><span class="cap">distance, temps, date</span></span>${ic("chevron", 16)}</button><button type="button" class="rangee" data-action="pas-ici"><span style="flex:1"><b style="display:block">Je ne sais pas</b><span class="cap">test guidé de 20 min</span></span>${ic("chevron", 16)}</button></div>`;
    if (page === "objectif") {
      const d = (o && o.distance) || "10km", DIST = ["5km", "10km", "15km", "Semi", "Marathon"];
      return `${haut("Ton objectif", "Facultatif. Il sert de repère dans Progression et dans ton conseil Allure.")}
        <section class="carte"><div class="champ"><span class="lab">Distance</span><div class="puces-choix">${DIST.map((x) => `<button type="button" data-obj-dist="${x}" class="${d === x ? "actif" : ""}">${esc(RACE_LABELS[x] === "Semi-marathon" ? "Semi" : RACE_LABELS[x])}</button>`).join("")}</div></div>
          <div class="champs2"><div class="champ"><label for="oTemps">En moins de</label><input id="oTemps" inputmode="numeric" placeholder="55:00" value="${o && o.tempsSec ? esc(fmtDur(o.tempsSec)) : ""}"></div><div class="champ"><label for="oDate">Date · facultatif</label><input id="oDate" type="date" value="${o && o.date ? esc(o.date) : ""}"></div></div>
          <div class="mt" style="flex-direction:row;align-items:center;justify-content:space-between"><span class="txt2">Allure visée</span>${U.num(o && o.allure ? fmtKmPace(o.allure) : "—", "/km", "citron")}</div></section>
        <button type="button" class="btn primaire" data-action="enregistrer-objectif">Enregistrer sur ce téléphone</button>${etat.objectifLocal ? `<button type="button" class="btn-texte" data-action="retirer-objectif">Retirer mon objectif</button>` : ""}`;
    }
    if (page === "compte") return `${haut("Ton compte")}<section class="carte"><div class="champ"><span class="lab">E-mail</span><b>${esc(etat.email || "—")}</b></div>
        <div class="champ"><label for="pPseudo">Pseudo</label><input id="pPseudo" value="${esc((etat.profil && etat.profil.pseudo) || "")}" disabled></div>
        <div class="champ"><label for="pAge">Âge</label><input id="pAge" value="${esc((etat.profil && etat.profil.age) || "")}" disabled></div><div class="cap">Chaque champ s'enregistre tout seul dans l'app. L'âge sert à estimer ta FC max.</div></section>
      <section class="carte"><h2>Mot de passe</h2><div class="txt2" style="font-size:14px">On t'envoie un code à ton adresse e-mail, puis tu choisis le nouveau mot de passe.</div><button type="button" class="btn primaire" data-action="pas-ici">Recevoir un code</button></section>`;
    if (page === "donnees") return `${haut("Tes données", "Ton profil, tes sorties avec ton cœur et ton allure, tes ressentis. Personne d'autre ne les voit.")}
      <div class="groupe"><button type="button" class="rangee" data-action="pas-ici"><b>Télécharger toutes mes données</b>${ic("telecharger", 17)}</button><button type="button" class="rangee" data-action="pas-ici"><b>Mes sorties en tableau (CSV)</b>${ic("telecharger", 17)}</button><a class="rangee" href="../confidentialite.html" style="color:var(--text);text-decoration:none"><b>Lire la page Confidentialité</b>${ic("chevron", 16)}</a></div>
      <button type="button" class="btn violet" data-feuille="supprimer">Retirer mon accord et supprimer mon compte</button>`;
    return profilHTML();
  }

  /* =================== Premiers pas (8) : démonstration, rien n'est enregistré =================== */
  function premiersPasHTML(n) {
    const pseudo = (etat.profil && etat.profil.pseudo) || "", barres = (k) => `<div class="pp-haut"><button type="button" class="rond" data-go="#/premiers/${n - 1}" aria-label="Retour">${ic("retour", 18)}</button><div class="pp-barres">${[1, 2, 3, 4].map((i) => `<i class="${i <= k ? "on" : ""}"></i>`).join("")}</div><span class="cap">${k} / 4</span></div>`;
    const suite = (cible, libelle, second) => `<div class="pp-bas"><button type="button" class="btn primaire" data-go="${cible}">${libelle}</button>${second || ""}</div>`;
    const bandeau = `<div class="demo-bandeau">Démo des premiers pas : rien n'est enregistré. <button type="button" style="text-decoration:underline" data-go="#/profil">Quitter</button></div>`;
    const ecrans = {
      1: `<div style="display:flex;justify-content:center;padding:60px 0 30px"><img src="../logo/logo-vertical-couleur.svg" alt="MyRunningApp" style="height:120px;width:auto"></div>
        <h1 class="h-plein">Bienvenue sur MyRunningApp</h1><div class="txt2" style="font-size:16px">On lit tes sorties et on te montre où tu en es : ton niveau, ton bilan après chaque course, ta progression. 2 minutes pour commencer.</div>
        ${suite("#/premiers/2", "C'est parti", `<button type="button" class="btn-texte" data-go="#/demo/connexion">J'ai déjà un compte</button>`)}`,
      2: `${barres(1)}<h1 class="h-plein">Crée ton compte</h1><div class="champ"><label for="ppE">E-mail</label><input id="ppE" type="email" placeholder="ton.adresse@exemple.fr"></div><div class="champ"><label for="ppM">Mot de passe</label><input id="ppM" type="password" placeholder="••••••••"></div><div class="cap">6 caractères minimum.</div>${suite("#/premiers/3", "Continuer")}`,
      3: `${barres(2)}<h1 class="h-plein">Ton accord</h1><div class="txt2">Avant de commencer, l'app a besoin de ton accord pour garder des données de santé.</div>
        <div style="display:flex;gap:10px" class="txt2"><span class="citron">${ic("coeur", 18)}</span><span>Ta fréquence cardiaque, tes ressentis et tes douleurs servent à adapter ton programme et à suivre ta progression.</span></div>
        <div style="display:flex;gap:10px" class="txt2"><span class="citron">${ic("cadenas", 18)}</span><span>Personne d'autre ne les voit : pas de publicité, pas de revente. Tu peux tout télécharger ou tout supprimer quand tu veux.</span></div>
        <label class="carte" style="flex-direction:row;gap:12px;background:var(--surface);border:1px solid var(--line)"><input type="checkbox" checked style="width:22px;height:22px;accent-color:#F2F3F0;flex:none"><span>J'accepte que MyRunningApp utilise mes données de santé (fréquence cardiaque, ressentis, douleurs) pour adapter mon programme et suivre ma progression.</span></label>
        <div class="demo-bandeau">Texte légal gardé tel quel : il cite encore « douleurs » et « programme », à faire réviser.</div>
        ${suite("#/premiers/4", "Continuer", `<button type="button" class="btn-texte" data-action="pas-ici">Je refuse</button>`)}`,
      4: `${barres(3)}<h1 class="h-plein">Parle-nous de toi</h1><div class="txt2" style="margin-top:-6px">Juste de quoi calculer tes zones cardio.</div>
        <div class="champ"><label for="ppP">Prénom ou pseudo</label><input id="ppP" value="${esc(pseudo)}"></div><div class="champ"><label for="ppA">Âge</label><div class="avec-u"><input id="ppA" inputmode="numeric" value="${esc((etat.profil && etat.profil.age) || "")}"><em>ans</em></div></div>
        <div class="champ"><label for="ppF">FC max · facultatif</label><div class="avec-u"><input id="ppF" inputmode="numeric" placeholder="Je ne sais pas"><em>bpm</em></div></div><div class="cap">Vide : on l'estime d'après ton âge. Tu pourras la changer dans Profil.</div>${suite("#/premiers/5", "Continuer")}`,
      5: `${barres(4)}<h1 class="h-plein">Avec quoi tu cours ?</h1><div class="txt2" style="margin-top:-6px">On lit tes sorties dans Apple Santé.</div>
        ${[["Apple Watch", "Bilan complet : cœur et allure détaillés"], ["Garmin", "Cœur partiel : le bilan s'appuie sur ton allure"], ["Une autre montre", "Si elle envoie tes sorties à Apple Santé"], ["Pas de montre", "Tu ajouteras tes sorties à la main"]].map(([t, d], i) => `<button type="button" class="montre${i === 0 ? " actif" : ""}" data-go="${i === 3 ? "#/premiers/8" : "#/premiers/6"}"><div><b>${t}</b><span class="cap">${d}</span></div><span class="coche${i === 0 ? " on" : ""}">${i === 0 ? ic("check", 14, 3) : ""}</span></button>`).join("")}
        ${suite("#/premiers/6", "Continuer")}`,
      6: `<div class="pp-haut"><button type="button" class="rond" data-go="#/premiers/5" aria-label="Retour">${ic("retour", 18)}</button><span class="sur">Ta montre · Apple Watch</span></div>
        <h1 class="h-plein">Connecte tes courses</h1><div class="txt2" style="margin-top:-6px">4 étapes, environ 4 minutes. On coche chaque étape tout seul quand tu reviens.</div>
        <div class="etape faite"><span class="no">${ic("check", 14, 3)}</span>Installe TestFlight</div>
        <div class="etape active"><div style="display:flex;gap:12px;align-items:center"><span class="no" style="background:var(--text);color:var(--on-accent)">2</span><b>Installe RunSync</b></div><div class="txt2" style="font-size:14px;font-weight:500">RunSync envoie tes sorties d'Apple Santé à MyRunningApp. Ouvre le lien dans TestFlight, puis reviens ici.</div><button type="button" class="btn primaire" data-action="pas-ici">Installer RunSync ${ic("externe", 16, 2.4)}</button></div>
        <div class="etape"><span class="no">3</span>Ouvre RunSync et laisse-toi guider</div><div class="etape"><span class="no">4</span>On reçoit tes courses</div>
        <div class="pp-bas"><button type="button" class="btn second" data-go="#/premiers/7">Étape suivante (démo)</button><button type="button" class="btn-texte" data-go="#/demo/aucune">Je le ferai plus tard</button></div>`,
      7: (() => { const six = etat.sorties.filter((s) => s.ts >= maintenant() - 183 * JOUR), prem = six[0];
        return `<h1 class="h-plein" style="margin-top:30px">On récupère tes sorties</h1><div class="txt2" style="margin-top:-6px">Ça prend moins d'une minute.</div>
        <section class="carte"><div>${U.num(six.length, "", "n52")} <span class="txt2">sorties reçues</span></div><div class="zbarre" style="height:8px;background:var(--control);border-radius:4px"><i style="flex:none;width:62%;background:#C6F432;border-radius:4px"></i></div>
          ${[[`Tes courses depuis le ${prem ? U.jourMois(prem.ts) : "—"}`, true], ["Ton cœur, seconde par seconde", true], ["On classe tes sorties", null], ["On calcule ton niveau", false]].map(([t, ok]) => `<div style="display:flex;gap:10px;align-items:center;color:${ok === false ? "var(--faint)" : "var(--text-2)"}">${ok ? `<span class="citron">${ic("check", 16, 2.6)}</span>` : `<span style="width:16px;height:16px;border-radius:50%;border:2px solid ${ok === null ? "var(--accent)" : "var(--line-empty)"};border-top-color:transparent;display:inline-block"></span>`}${esc(t)}</div>`).join("")}</section>
        <div class="cap" style="text-align:center">Import des 6 derniers mois · modifiable dans Profil › Ta montre</div>${suite("#/premiers/8", "Continuer (démo)")}`; })(),
      8: `<span class="fin-ic ok" style="width:44px;height:44px;margin-top:20px">${ic("check", 22, 3)}</span><h1 class="h-plein">Tout est prêt${pseudo ? `, ${esc(pseudo)}` : ""}</h1><div class="txt2" style="margin-top:-6px">${etat.sorties.filter((s) => s.ts >= maintenant() - 183 * JOUR).length} sorties reçues. Voici où tu en es.</div>
        <div><h2>Ton niveau actuel</h2><div class="txt2" style="font-size:14px;margin-top:3px">Tes allures des 4 dernières semaines, face à il y a 3 mois.</div></div><section class="carte" style="padding:10px 6px">${U.niveauLignes(niveau(maintenant()))}</section>
        <span class="sur" style="margin-top:6px">Pour aller plus loin · facultatif</span><div class="groupe"><button type="button" class="rangee" data-go="#/profil/chrono"><span style="flex:1"><b style="display:block">Ajoute un chrono récent</b><span class="cap">Sert quand ta montre ne donne pas ton cœur</span></span>${ic("chevron", 16)}</button><button type="button" class="rangee" data-go="#/profil/objectif"><span style="flex:1"><b style="display:block">Fixe-toi un objectif</b><span class="cap">Un repère dans Progression et ton conseil</span></span>${ic("chevron", 16)}</button></div>
        ${suite("#/accueil", "Voir mon accueil")}`,
    };
    return `<div class="pp">${bandeau}${ecrans[n] || ecrans[1]}</div>`;
  }

  /* =================== Feuilles (i, type, ressenti, suppression) =================== */
  const INFOS = {
    bilan: ["Comment on fait ton bilan", "On compare ton cœur sur les passages à la même allure, sur tes 6 dernières semaines (12 s'il le faut). Sans cœur fiable : ton allure et ton ressenti. Rien à comparer : la sortie devient ton point de départ."],
    coeur: ["Tes zones cardio", null],
    "allure-facile": ["Ton allure facile", "Chaque sortie facile est ramenée à ton cœur habituel en facile : on voit si tu cours plus vite pour le même effort. La valeur : tes 4 dernières semaines. L'écart et la courbe : la période choisie."],
    efforts: ["Tes allures par effort", "L'allure que tu tiens quand ton cœur est en zone 3 (Tempo) ou 4 (Seuil), même au milieu d'une sortie. Fractionné : l'allure de tes blocs d'effort."],
    croisements: ["Les croisements", "Allure × régularité : ton allure facile les semaines où tu cours 2 fois ou plus, face aux semaines à une sortie. Allure × ressenti : comment tu ressens tes sorties faciles, d'un mois à l'autre."],
    "coeur-facile": ["Ton cœur en sortie facile", "Le cœur moyen de tes sorties faciles au cœur fiable. Courbe : la moyenne glissante sur 4 semaines."],
    derive: ["La dérive cardiaque", "De combien ton cœur monte entre la 1re et la 2e moitié d'une sortie facile d'au moins 40 min à allure régulière. Sous 5 % : ton endurance tient."],
    "sorties-faciles": ["Tes sorties faciles", "Tes 6 dernières sorties faciles au cœur fiable, et la part de leur temps en zones 1-2. Vraiment facile : 80 % ou plus."],
    repos: ["Ton cœur au repos", "Bientôt lu chaque matin sur ta montre (prochaine version de RunSync). Pour l'instant, le prototype montre la valeur de ton profil."],
    cadence: ["Ta cadence", "Le nombre de pas par minute sur tes sorties faciles. Repère : 170 (à confirmer)."],
    records: ["Tes records", "Temps ramené à la distance exacte, sur tes courses de 5, 10, 15 km, semi et marathon. Max : ta sortie la plus longue."],
  };
  function feuille(cle, id) {
    const calque = document.getElementById("calque");
    const fermer = `<button type="button" class="rond petit" data-fermer-calque aria-label="Fermer">${ic("fermer", 16)}</button>`;
    let html;
    if (INFOS[cle]) {
      let [titre, txt] = INFOS[cle];
      if (cle === "coeur") { const fm = fcMax(), fr = fcRepos(); txt = fm ? `Zones calculées avec une FC max de ${fm.valeur} (${fm.source})${fr ? ` et une FC de repos de ${fr}` : ""}. Zone 1 Récup, 2 Facile, 3 Tempo, 4 Seuil, 5 Fractionné.` : "Renseigne ta FC max ou ton âge pour calculer tes zones."; }
      const plus = "";
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>${esc(titre)}</h2>${fermer}</div><div class="txt2">${esc(txt)}</div>${plus}</div>`;
    } else if (cle === "type") {
      const s = etat.sorties.find((x) => String(x.id) === String(id)); if (!s) return;
      const actuel = etat.types[s.id] || libDe(s), liste = ["Sortie facile", "Longue", "Tempo", "Seuil", "Fractionné", "Compétition", "Autre"];
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>Change le type</h2>${fermer}</div><div class="txt2">On l'a classée en ${esc(libDe(s))}${Calc.coeurFiable(s) ? " d'après ton cœur" : ""}. Ton bilan se recalcule si tu changes. Dans le prototype, le changement reste sur ce téléphone.</div>
        <div class="carte" style="gap:0;padding:4px 14px">${liste.map((t) => `<button type="button" class="choix" data-type-choix="${esc(t)}" data-id="${esc(s.id)}"><i style="width:9px;height:9px;border-radius:50%;background:${U.couleurType(t)}"></i><b>${esc(t === "Sortie facile" ? "Facile" : t === "Autre" ? "Autre (pas une course)" : t)}</b><span class="coche${actuel === t ? " on" : ""}">${actuel === t ? ic("check", 13, 3) : ""}</span></button>`).join("")}</div>
        ${etat.types[s.id] ? `<button type="button" class="btn-texte" data-type-choix="" data-id="${esc(s.id)}">Revenir au classement automatique</button>` : ""}</div>`;
    } else if (cle === "ressenti") {
      const s = etat.sorties.find((x) => String(x.id) === String(id)); if (!s) return;
      const res = Calc.ressentiDe(s, etat.ressentis);
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>Comment tu l'as sentie ?</h2>${fermer}</div>${U.crans(res, `data-sortie="${esc(s.id)}"`)}<button type="button" class="btn primaire" data-fermer-calque>Fermer</button></div>`;
    } else if (cle === "menu-sortie") {
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>Cette séance</h2>${fermer}</div><button type="button" class="btn violet" data-action="supprimer-ajout" data-id="${esc(id)}">Supprimer (sur ce téléphone)</button><div class="cap">Pour corriger une saisie : supprime-la, puis ressaisis-la.</div></div>`;
    } else if (cle === "supprimer") {
      calque.innerHTML = `<div class="voile centre" data-voile><div class="fenetre" role="dialog" aria-modal="true" aria-label="Supprimer ton compte"><h2>Supprimer ton compte ?</h2>
        <div class="txt2" style="font-size:14.5px">Ton profil, tes sorties et tes ressentis seront effacés tout de suite, et de nos sauvegardes sous 30 jours. Ce n'est pas réversible.</div><div class="txt2" style="font-size:14.5px">Pense aussi à supprimer RunSync de ton iPhone.</div>
        <div class="champs2"><button type="button" class="btn second" data-fermer-calque>Annuler</button><button type="button" class="btn violet" data-action="pas-ici">Supprimer</button></div></div></div>`;
      return;
    }
    calque.innerHTML = `<div class="voile" data-voile>${html}</div>`;
  }
  const fermerCalque = () => { document.getElementById("calque").innerHTML = ""; };

  /* =================== Navigation =================== */
  const ONGLETS = [["accueil", "Accueil"], ["progression", "Progression"], ["sorties", "Sorties"], ["profil", "Profil"]];
  // Démonstrations des états (10) et du record (9B) : tes vraies données, arrangées le temps d'un écran.
  function avecDemo(cle, f) {
    const sauve = { sorties: etat.sorties, courses: etat.courses, now: etat.now, memo: etat.memo };
    etat.demo = cle; etat.memo = {};
    try {
      if (cle === "premieres") { etat.courses = etat.courses.slice(-2); etat.sorties = etat.sorties.filter((s) => !Calc.estCourse(s) || etat.courses.includes(s)).filter((s) => s.ts >= etat.courses[0].ts - JOUR); etat.now = etat.courses[1].ts + 2 * JOUR; }
      if (cle === "mois") { const der = etat.courses.slice(-1)[0], d = new Date(der.ts); etat.now = Math.max(new Date(d.getFullYear(), d.getMonth() + 1, 7, 8, 10).getTime(), der.ts + 12 * JOUR); }
      if (cle === "aucune") { etat.courses = []; etat.sorties = []; }
      if (cle === "partiel") {   // la dernière course, avec une mesure de cœur toutes les ~3 min (comme une Garmin)
        const der = etat.courses.slice(-1)[0], s = { ...der, id: "demo-partiel", hr: (der.hr || []).filter((_, i) => i % 40 === 0) };
        etat.courses = etat.courses.map((x) => (x === der ? s : x)); etat.sorties = etat.sorties.map((x) => (x === der ? s : x));
      }
      return f();
    } finally { etat.sorties = sauve.sorties; etat.courses = sauve.courses; etat.now = sauve.now; etat.memo = sauve.memo; etat.demo = null; }
  }
  function rendre(garderDefilement) {
    const app = document.getElementById("app"), nav = document.getElementById("onglets");
    document.body.classList.remove("feuille-ouverte"); app.classList.remove("plein");
    if (!etat.session) { nav.classList.add("cache"); app.innerHTML = connexionHTML(); document.getElementById("fConnexion").addEventListener("submit", seConnecter); return; }
    if (!etat.pret) { nav.classList.add("cache"); app.innerHTML = etat.erreur ? `<p class="cap" style="text-align:center;padding:40px">${esc(etat.erreur)}</p>` : chargementHTML(); return; }
    let [, vue, id, ancre] = (location.hash || "#/accueil").split("/");
    if (vue === "verdict") vue = "bilan";   // ancienne adresse
    const s = id && ["sortie", "bilan", "record"].includes(vue) ? etat.sorties.find((x) => String(x.id) === decodeURIComponent(id)) : null;
    const plein = ["bilan", "sortie", "record", "ajouter", "premiers"].includes(vue) || (vue === "demo" && ["record", "chargement", "connexion", "partiel"].includes(id));
    nav.classList.toggle("cache", plein); app.classList.toggle("plein", plein);
    const actif = vue === "demo" ? "accueil" : vue || "accueil";
    nav.innerHTML = ONGLETS.map(([k, l]) => `<button type="button" data-go="#/${k}" class="${actif === k ? "actif" : ""}"${actif === k ? ' aria-current="page"' : ""}>${ic(k, 21)}${l}</button>`).join("");
    const y = window.scrollY;
    let html;
    if (vue === "bilan" && s) { document.body.classList.add("feuille-ouverte"); html = bilanHTML(s); }
    else if (vue === "record" && s) html = recordHTML(s) || bilanHTML(s);
    else if (vue === "sortie" && s) html = detailHTML(s);
    else if (vue === "sorties") html = sortiesHTML();
    else if (vue === "ajouter") { document.body.classList.add("feuille-ouverte"); html = ajouterHTML(); }
    else if (vue === "progression") html = progressionHTML(id, ancre);
    else if (vue === "profil") html = id ? profilPage(id) : profilHTML();
    else if (vue === "premiers") html = premiersPasHTML(Number(id) || 1);
    else if (vue === "demo") html = vueDemo(id);
    else html = accueilHTML();
    app.innerHTML = html;
    if (vue === "demo" && id === "connexion") document.getElementById("fConnexion").addEventListener("submit", seConnecter);
    window.scrollTo(0, garderDefilement ? y : 0);
    const cible = vue === "progression" && ancre && !garderDefilement ? document.getElementById(`graphe-${ancre}`) : null;
    if (cible) cible.scrollIntoView({ block: "start" });
  }
  function vueDemo(cle) {
    const titre = { premieres: "Premières semaines", mois: "Mois sans sortie", reseau: "Pas de connexion", aucune: "Pas encore de sortie reçue", chargement: "Chargement", connexion: "Connexion", record: "Après un record", partiel: "Cœur partiel (Garmin)" }[cle] || "Démo";
    const band = `<div class="demo-bandeau" style="display:flex;justify-content:space-between;gap:10px"><span>Démo · ${esc(titre)}</span><button type="button" style="text-decoration:underline" data-go="#/profil">Quitter</button></div>`;
    if (cle === "chargement") return band + chargementHTML();
    if (cle === "connexion") { etat.demo = "connexion"; const h = connexionHTML(true); etat.demo = null; return band + h; }
    if (cle === "record") {
      const s = etat.courses.slice().reverse().find((x) => Calc.recordsBattus(x, etat.sorties).length);
      return s ? recordHTML(s, band) : band + `<p class="txt2">Aucun record battu dans tes sorties pour l'instant.</p>`;
    }
    if (cle === "partiel") return avecDemo("partiel", () => { document.body.classList.add("feuille-ouverte"); return band + bilanHTML(etat.courses[etat.courses.length - 1]); });
    if (cle === "reseau") { etat.demo = "reseau"; etat.memo = {}; const h = accueilHTML(); etat.demo = null; etat.memo = {}; return band + h; }
    return band + avecDemo(cle, accueilHTML);
  }

  /* =================== Gestes =================== */
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-fermer-calque]") || (t.matches && t.matches("[data-voile]"))) { fermerCalque(); return; }
    const r = t.closest("[data-retour]"); if (r) { if (history.length > 1) history.back(); else location.hash = "#/accueil"; return; }
    const cr = t.closest("[data-cran]");
    if (cr) {
      const n = Number(cr.getAttribute("data-cran"));
      if (cr.hasAttribute("data-ajout-cran")) { brouillon.ressenti = brouillon.ressenti === n ? null : n; rendreAjoutRessenti(); return; }
      noterRessenti(cr.getAttribute("data-sortie"), n);
      const dansCalque = cr.closest("#calque"); if (dansCalque) feuille("ressenti", cr.getAttribute("data-sortie"));
      rendre(true); return;
    }
    const tc = t.closest("[data-type-choix]");
    if (tc) {
      const idS = tc.getAttribute("data-id"), v = tc.getAttribute("data-type-choix"), n = { ...etat.types };
      if (v) n[idS] = v; else delete n[idS];
      etat.types = n; garder(CLES.types, n); recalculer(); fermerCalque();
      if (v === "Autre") { U.toast("Sortie retirée des courses (sur ce téléphone)."); location.hash = "#/sorties"; } else rendre(true);
      return;
    }
    const at = t.closest("[data-ajout-type]"); if (at) { brouillon.type = at.getAttribute("data-ajout-type"); at.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("actif", b === at)); return; }
    const fe = t.closest("[data-feuille]"); if (fe) { e.stopPropagation(); feuille(fe.getAttribute("data-feuille"), fe.getAttribute("data-id")); return; }
    const f = t.closest("[data-filtre]"); if (f) { etat.filtre = f.getAttribute("data-filtre"); rendre(true); return; }
    const rp = t.closest("[data-replie]"); if (rp) { const k = rp.getAttribute("data-replie"); etat.plis = { ...etat.plis, [k]: estReplie(k) ? 0 : 1 }; garder(CLES.plis, etat.plis); rendre(true); return; }
    const pe = t.closest("[data-periode]"); if (pe) { etat.periode = Number(pe.getAttribute("data-periode")); rendre(true); return; }
    const mo = t.closest("[data-montre]"); if (mo) { etat.montre = mo.getAttribute("data-montre"); garder(CLES.montre, etat.montre); rendre(true); return; }
    const od = t.closest("[data-obj-dist]"); if (od) { od.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("actif", b === od)); return; }
    const ac = t.closest("[data-action]");
    if (ac) {
      const a = ac.getAttribute("data-action");
      if (a === "pas-ici") U.toast("Prototype : cette action se fera dans l'app.");
      else if (a === "deconnexion") { Lecture.deconnexion().then(() => { location.hash = "#/accueil"; location.reload(); }); }
      else if (a === "enregistrer-ajout") enregistrerAjout();
      else if (a === "supprimer-ajout") { const idS = ac.getAttribute("data-id"); etat.ajouts = etat.ajouts.filter((x) => x.id !== idS); garder(CLES.ajouts, etat.ajouts); recalculer(); fermerCalque(); location.hash = "#/sorties"; }
      else if (a === "enregistrer-objectif") {
        const choisie = document.querySelector("[data-obj-dist].actif"), dist = choisie ? choisie.getAttribute("data-obj-dist") : "10km";
        const p = String(document.getElementById("oTemps").value).trim().split(":").map(Number), sec = p.some(Number.isNaN) || !p[0] ? null : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60;
        etat.objectifLocal = { distance: dist, tempsSec: sec, date: document.getElementById("oDate").value || null }; garder(CLES.objectif, etat.objectifLocal);
        etat.memo = {}; U.toast("Objectif gardé sur ce téléphone."); rendre(true);
      } else if (a === "retirer-objectif") { etat.objectifLocal = null; garder(CLES.objectif, null); etat.memo = {}; rendre(true); }
      return;
    }
    const g = t.closest("[data-go]"); if (g) { e.stopPropagation(); fermerCalque(); location.hash = g.getAttribute("data-go"); }
  });
  function rendreAjoutRessenti() {
    const zone = document.querySelector("[data-ajout-cran]") && document.querySelector("[data-ajout-cran]").closest(".champ");
    if (zone) zone.innerHTML = `<div class="carte-tete"><span class="lab">Comment tu l'as sentie ?</span><span class="cap">facultatif</span></div>${U.crans(brouillon.ressenti, 'data-ajout-cran="1"')}`;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { fermerCalque(); return; }
    const g = e.target.closest && e.target.closest("[data-go][role=link]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = g.getAttribute("data-go"); }
  });
  window.addEventListener("hashchange", () => { fermerCalque(); rendre(false); });

  /* =================== Chargement et « après une sortie » (9) =================== */
  async function charger() {
    const b = window.__PROTO_BANC__;   // banc de captures local seulement (jamais publié)
    if (b) { etat.profil = b.profil || {}; etat.email = b.email || ""; if (b.now) etat.now = b.now; installer(b.runs || []); return true; }
    const [runs, prof] = await Promise.all([
      Lecture.lire("runs", "id,start_date,type,apple_type,distance_km,duration_sec,avg_hr,peak_hr,avg_cadence,pain_ratings,include_in_stats,hr_series,pace_series,lap_markers,frac_work_manual,frac_recovery_manual", { trierPar: "start_date" }),
      Lecture.lire("profiles", "pseudo,age,max_hr,resting_hr,goals,program_settings", { unSeul: true }),
    ]);
    if (runs.error) { etat.erreur = `Pas pu lire tes sorties : ${runs.error.message}`; return false; }
    etat.profil = prof.data || {};
    installer(runs.data || []);
    return true;
  }
  function installer(rows) { etat.brutes = rows; recalculer(); }
  // Nouvelle sortie reçue (moins de 7 jours, jamais vue) : record en plein écran s'il y en a un, puis le bilan ; plusieurs
  // sorties : le bilan de la plus récente et « X autres sorties reçues ». Une seule célébration par sortie.
  function ouvrirSiNouvelles() {
    if (banc()) return;
    const now = maintenant(), recentes = etat.courses.filter((s) => now - s.ts <= R.bilanJoursOuverture * JOUR && !s.local);
    let vues = lire(CLES.vues, null);
    if (!vues) {   // 1re ouverture de la V2 : tout est déjà vu, sauf la dernière sortie si son bilan n'a jamais été ouvert
      const ancien = lire(CLES.ancienBilanVu, null), der = etat.courses.slice(-1)[0];
      vues = etat.courses.map((s) => String(s.id)).filter((id) => !(der && id === String(der.id) && String(ancien) !== id && recentes.includes(der)));
      garder(CLES.vues, vues);
    }
    const nouvelles = recentes.filter((s) => !vues.includes(String(s.id)));
    if (!nouvelles.length || (location.hash && location.hash !== "#/accueil")) return;
    garder(CLES.vues, vues.concat(nouvelles.map((s) => String(s.id))).slice(-500));
    const principale = nouvelles[nouvelles.length - 1];
    etat.autresRecues = nouvelles.slice(0, -1).reverse().map((s) => s.id);
    location.hash = Calc.recordsBattus(principale, etat.sorties).length ? `#/record/${principale.id}` : `#/bilan/${principale.id}`;
  }
  async function demarrer() {
    etat.pret = false; rendre();
    etat.pret = await charger();
    etat.chargeA = Date.now();
    if (etat.pret) ouvrirSiNouvelles();
    rendre();
  }
  // Retour dans le prototype après plus de 30 s : on relit tes sorties (une course a pu arriver de RunSync entre-temps).
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !etat.session || !etat.pret || banc()) return;
    if (Date.now() - (etat.chargeA || 0) < 30000) return;
    if (await charger()) { etat.chargeA = Date.now(); ouvrirSiNouvelles(); rendre(true); }
  });

  (async () => {
    if (banc()) { etat.session = { banc: true }; await demarrer(); return; }
    etat.session = await Lecture.session();
    if (etat.session) { etat.email = etat.session.user?.email || ""; await demarrer(); } else rendre();
  })();
})();
