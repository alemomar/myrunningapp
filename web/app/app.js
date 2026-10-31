/* App V2 de MyRunningApp (31/10/2026) : la V2 du prototype « refonte progression » (maquettes Claude Design validées par Omar
   le 27/10, révisions du 29/10, docs/design/v2/brief-developpeur-V2.md) avec les 16 choix d'Omar du 31/10 : plus d'onglet
   Programme, de test guidé, de forme du jour, de charge, de douleurs, de VO2 max, d'objectif secondaire ni de visite guidée ;
   après une sortie, seulement le ressenti ; « Tempo » est un type ; carte « Vérifions N sorties » (avec Tempo et Marche) ;
   fusion d'une saisie à la main avec la sortie de la montre ; page « Ta montre » ; « Nouveautés » pour annoncer la V2.
   Écrans : installation et connexion, accord (A6), premiers pas avec le guide RunSync, Accueil à deux moments (2A : tu as
   couru aujourd'hui, jusqu'à minuit ; 2B : le reste du temps), Ton bilan (feuille qui s'ouvre seule après une nouvelle
   sortie, précédée du plein écran record s'il y a un record), détail d'une sortie, Sorties, Progression, Profil.
   Données : Donnees (app/donnees.js). Chaque écriture est vérifiée ; l'écran suit tout de suite et revient en arrière si
   elle échoue. */
(() => {
  const R = REGLAGES, U = UI, JOUR = 86400000, esc = U.esc, ic = U.ic;
  const CLES = { vues: "mra_v2_vues", plis: "mra_v2_plis", nouveautes: "mra_newsSeen", fusions: "mra_mergeNotices", pasMeme: "mra_notSamePairs",
    guide: "mra_syncGuide", installer: "mra_installSkipped", authEnCours: "mra_authPending" };
  const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v == null ? defaut : JSON.parse(v); } catch (e) { return defaut; } };
  const garder = (cle, v) => { try { if (v == null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* stockage indisponible : vaut pour cette visite */ } };
  const etat = { session: null, email: "", userId: "", creeLe: null, profil: null, brutes: [], sorties: [], courses: [], zones: null, doutes: [],
    erreur: "", erreurChargement: false, pret: false, chargeA: 0, ressentis: {}, plis: lire(CLES.plis, {}), filtre: "courses", periode: 12,
    autresRecues: [], now: null, memo: {}, nivSel: "ef", nivPer: 3,   // Ton niveau (13a) : Facile sur 3 mois à l'ouverture, rien n'est mémorisé
    accord: { coche: false, occupe: false, refus: false }, pp: null, finPremiersPas: false };
  const maintenant = () => etat.now || Date.now();

  /* ---------- Données ---------- */
  // Le vocabulaire de la V2 et les types enregistrés (Tempo : choix 5 ; hors course Marche, Renfo, Autre : choix 8).
  const TYPES_APP = { "Sortie facile": "EF", Longue: "Long", Tempo: "Tempo", Seuil: "Seuil", "Fractionné": "Fractionné", "Compétition": "Course", Marche: "Marche", Renfo: "Renfo", Autre: "Other" };
  const TYPES_COURSE = ["Sortie facile", "Longue", "Tempo", "Seuil", "Fractionné", "Compétition"], TYPES_AUTRES = ["Marche", "Renfo", "Autre"];
  const nomType = (t) => (t === "Sortie facile" ? "Facile" : t);
  function recalculer() {
    etat.sorties = etat.brutes.map(Calc.versSortie).filter((s) => !Number.isNaN(s.ts)).sort((a, b) => a.ts - b.ts);
    etat.courses = etat.sorties.filter(Calc.estCourse);
    etat.zones = Calc.zonesAllure(etat.profil, etat.sorties, maintenant());
    // Sorties au type douteux (D109) : courtes, ou nettement plus rapides que d'habitude, jamais vérifiées.
    etat.doutes = doubtfulRuns(etat.sorties.map((s) => ({ id: s.id, ts: s.ts, appleType: s.appleType, type: s.type, dist: s.dist, durationSec: s.dur,
      blocks: s.lapMarkers ? s.lapMarkers.length : 0, typeChecked: s.typeVerifie })));
    etat.memo = {};
  }
  const memo = (cle, f) => (cle in etat.memo ? etat.memo[cle] : (etat.memo[cle] = f()));
  // Ta montre en détail ? (Garmin : cœur toutes les 2 min, allure toutes les ~10 min dans Apple Santé.) Ce qu'on ne peut pas
  // mesurer est dit franchement, au lieu de « pas encore de séance ».
  const detail = () => memo("detail", () => Calc.detailMontre(etat.courses, maintenant()));
  const toutesLes = (sec) => (sec >= 90 ? `${Math.round(sec / 60)} min` : `${Math.round(sec)} s`);
  const nonMesure = (cle) => (cle === "tempo" || cle === "seuil" ? !detail().coeur || !detail().allure : cle === "frac" ? !detail().allure : false);
  const texteNonMesure = (cle) => (cle === "frac" ? "Ta montre n'envoie pas ton allure assez souvent à Apple Santé pour mesurer tes fractionnés."
    : `Ta montre n'envoie ton allure à Apple Santé que toutes les 10 min environ : pas assez pour mesurer ${cle === "tempo" ? "ton tempo" : "ton seuil"}.`);
  const fcMax = () => Calc.fcMaxEffective(etat.profil, etat.courses);
  const fcRepos = () => (etat.profil && etat.profil.resting_hr ? Number(etat.profil.resting_hr) : null);
  const defsZones = () => memo("defs", () => { const fm = fcMax(); return fm ? hrZoneDefs(fm.valeur, fcRepos()) : null; });
  const bilanDe = (s) => memo(`b${s.id}`, () => Calc.verdict(s, etat.courses, etat.ressentis, null, etat.zones));
  // Tempo ou Seuil : d'après l'allure détaillée ; sans elle (Garmin, 29/10), d'après le temps de cœur en zones 3 et 4. Un type
  // choisi par le coureur passe avant (Calc.libelleType).
  const libDe = (s) => memo(`l${s.id}`, () => { if (s.type !== "Seuil" || s.typeVerifie) return Calc.libelleType(s, null);
    const fm = fcMax(), zs = !Calc.allureDetaillee(s) && fm ? Calc.zonesSortie(s, fm.valeur, fcRepos()) : null;
    return Calc.libelleType(s, Calc.decoupage(s, etat.zones) || (zs ? { tempsParZone: zs.secs } : null)); });
  const niveau = (now) => memo(`n${now}`, () => Calc.niveauActuel(etat.courses, now, etat.zones, defsZones()));   // même Facile que « Ton allure facile » (Progression)
  const KM_COURSE = { "5km": 5, "10km": 10, "15km": 15, Semi: 21.0975, Marathon: 42.195 };
  // Ton objectif (choix 10 : l'objectif principal seul) : une course, son temps visé et sa date (goals.principal, même format
  // que l'ancienne app : objectifPrincipal, distanceCourse, tempsViseSec, dateCible).
  function objectif() {
    const p = etat.profil && etat.profil.goals && etat.profil.goals.principal;
    if (!p || p.objectifPrincipal !== "Préparer une course" || !p.distanceCourse) return null;
    const dist = p.distanceCourse, nom = RACE_LABELS[dist] || dist, temps = Number(p.tempsViseSec) > 0 ? Number(p.tempsViseSec) : null, date = p.dateCible || null;
    return { distance: dist, nom, tempsSec: temps, date, allure: temps && KM_COURSE[dist] ? temps / KM_COURSE[dist] : null,
      label: `${nom === "Semi-marathon" ? "semi" : nom}${temps ? ` en ${dureeCourte(temps)}` : date ? ` le ${isoToFr(date)}` : ""}` };
  }
  const dureeCourte = (sec) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
  // « AAAA-MM-JJ » du jour local (comme l'ancienne app).
  const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // « 45 », « 45:00 », « 1:05:30 » → secondes (null si illisible).
  const enSecondes = (txt) => { const m = parseDurationInput(txt); return m > 0 ? Math.round(m * 60) : null; };

  /* ---------- Écritures ---------- */
  async function ecrire(promesse, okTxt) {
    let r; try { r = await promesse; } catch (e) { r = { error: e }; }
    if (r && r.error) { U.toast(r.error.session ? "Ta session a expiré : reconnecte-toi." : "Pas enregistré, vérifie ta connexion."); return false; }
    if (okTxt) U.toast(okTxt);
    return true;
  }
  const ligne = (id) => etat.brutes.find((r) => String(r.id) === String(id));
  // L'écran suit tout de suite ; si la base refuse, on revient en arrière.
  async function majSortie(id, champs, okTxt) {
    const r = ligne(id); if (!r) return false;
    const avant = { ...r }; Object.assign(r, champs); recalculer(); rendre(true);
    if (await ecrire(Donnees.majSortie(id, champs), okTxt)) return true;
    Object.keys(champs).forEach((k) => { r[k] = avant[k]; }); recalculer(); rendre(true); return false;
  }
  async function majProfil(champs, okTxt) {
    const avant = etat.profil; etat.profil = { ...(etat.profil || {}), ...champs }; recalculer();
    if (await ecrire(Donnees.majProfil(champs), okTxt)) return true;
    etat.profil = avant; recalculer(); rendre(true); return false;
  }
  const majGoals = (f, okTxt) => majProfil({ goals: { ...((etat.profil && etat.profil.goals) || {}), ...f } }, okTxt);
  // Ressenti (choix 3 : la seule question après une sortie) : pain_ratings.rpe ; les anciennes réponses restent.
  function noterRessenti(id, v) {
    const r = ligne(id); if (!r) return;
    const pr = { ...(r.pain_ratings || {}) };
    if (v == null || Number(pr.rpe) === v) delete pr.rpe; else pr.rpe = v;
    majSortie(id, { pain_ratings: Object.keys(pr).length ? pr : null });
  }
  // Type choisi par le coureur : vérifié (D109) ; une sortie qui passe de course à hors course (ou l'inverse) sort des stats (D78).
  function changerType(id, lib) {
    const r = ligne(id); if (!r) return Promise.resolve(false);
    const type = TYPES_APP[lib] || lib, champs = { type, type_checked: true };
    if (isRunningRunType(type) !== isRunningRunType(r.type)) champs.include_in_stats = isRunningRunType(type);
    return majSortie(id, champs);
  }

  /* ---------- Petits morceaux d'écran ---------- */
  const tete = (sur, titre, droite) => `<header class="tete-ligne"><div class="tete" style="padding:0">${sur ? `<div class="sur">${esc(sur)}</div>` : ""}<h1>${esc(titre)}</h1></div>${droite || ""}</header>`;
  const retourLigne = (sur, cible) => `<div class="retour-ligne"><button type="button" class="rond" ${cible ? `data-go="${cible}"` : "data-retour"} aria-label="Retour">${ic("retour", 18)}</button>${sur ? `<span class="sur">${esc(sur)}</span>` : ""}</div>`;
  const info = (cle) => `<button type="button" class="info" data-feuille="${cle}" aria-label="Comment c'est calculé">i</button>`;
  const mt = (l, v, u, h, g) => `<div class="mt"><span class="l">${esc(l)}</span>${U.num(v, u, `v${g ? " g" : ""}`)}${h ? `<span class="h">${h}</span>` : ""}</div>`;
  const pour = (lib) => ({ "Sortie facile": "une sortie facile", Longue: "une sortie longue", Tempo: "un tempo", Seuil: "un seuil", "Fractionné": "un fractionné" }[lib] || "ce type");
  const attr = (t) => esc(t).replace(/"/g, "&quot;");

  /* =================== Installation et connexion (D99 à D101 de l'ancienne app, au style V2) ===================
     Connexion, création de compte, code reçu par e-mail, « mot de passe oublié » puis nouveau mot de passe. Tout se passe dans
     l'app : le code se recopie ici (un lien d'e-mail s'ouvrirait dans le navigateur, pas dans l'app installée). Le mot de passe
     tapé reste en mémoire le temps de l'étape « code », jamais sur l'appareil. */
  const auth = { etape: "connexion", email: "", mdp: "", code: "", info: "", erreur: "", occupe: false, envoyeA: 0, verifie: false, voir: false, installer: false };
  let minuteurAuth = null, minuteurCode = null;
  const autonome = () => { try { return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; } catch (e) { return false; } };
  const contexte = () => detectInstallContext(navigator.userAgent, autonome(), navigator.maxTouchPoints);
  // Étape « code » ou « nouveau mot de passe » gardée une heure, pour la reprendre si l'iPhone décharge l'app pendant qu'on lit son e-mail.
  function garderAuthEnCours() {
    garder(CLES.authEnCours, (auth.etape === "code" || auth.etape === "nouveau") && auth.envoyeA > 0 && validEmail(auth.email)
      ? { step: auth.etape === "nouveau" ? "reset" : "code", email: auth.email.trim(), sentAt: auth.envoyeA } : null);
  }
  function reprendreAuthEnCours() {
    let brut = null; try { brut = localStorage.getItem(CLES.authEnCours); } catch (e) { /* stockage indisponible */ }
    const p = pendingAuthFrom(brut, Date.now());
    if (!p) { if (brut) garder(CLES.authEnCours, null); return false; }
    Object.assign(auth, { etape: p.step === "reset" ? "nouveau" : "code", email: p.email, envoyeA: p.sentAt, code: "", mdp: "", erreur: "", info: "", verifie: false });
    return true;
  }
  // Premier écran sans session : « Installe l'app » (iPhone, hors de l'app installée, tant qu'on ne l'a pas écarté), sinon la connexion.
  function ecranEntree() { const enCours = reprendreAuthEnCours(); auth.installer = authEntryView(contexte(), !!lire(CLES.installer, false), enCours) === "install"; }
  function installHTML() {
    const g = installGuide(contexte());
    const etapes = g.steps.map((st, i) => `<div class="etape"><span class="no">${i + 1}</span><div style="flex:1"><b style="display:block">${esc(st.title)}</b><span class="cap">${esc(st.hint)}</span></div></div>`).join("");
    return `<div class="pp"><div style="display:flex;justify-content:center;padding:36px 0 6px"><img src="logo/logo-vertical-couleur.svg" alt="MyRunningApp" width="150" height="110" style="height:110px;width:auto"></div>
      <h1 class="h-plein">Installe l'app sur ton écran d'accueil</h1><div class="txt2" style="margin-top:-6px">Elle s'ouvre alors comme une vraie app, en plein écran, et tu y restes connecté.</div>
      ${g.inApp ? U.verdictBox({ ton: "attention", titre: "Tu es dans le navigateur d'une autre app : Instagram, Facebook et les autres ne permettent pas d'installer MyRunningApp. Ouvre ce lien dans Safari ou Chrome." }) : etapes}
      <div class="pp-bas">${g.inApp ? `<button type="button" class="btn primaire" data-action="copier-lien">Copier le lien</button>` : `<div class="cap" style="text-align:center">Une fois l'app ajoutée, ouvre-la depuis ton écran d'accueil : c'est là que tu crées ton compte.</div>`}
        <button type="button" class="btn second" data-action="installer-plus-tard">Continuer dans le navigateur</button>
        <div class="cap" style="text-align:center">Dans le navigateur, pas de plein écran, et il faudra te reconnecter si tu installes l'app plus tard.</div></div></div>`;
  }
  // Barres des premiers pas (1 à 4) : compte, accord, toi, ta montre.
  const barres = (k, retour) => `<div class="pp-haut">${retour ? `<button type="button" class="rond" ${retour} aria-label="Retour">${ic("retour", 18)}</button>` : `<span style="width:40px"></span>`}<div class="pp-barres">${[1, 2, 3, 4].map((i) => `<i class="${i <= k ? "on" : ""}"></i>`).join("")}</div><span class="cap">${k} / 4</span></div>`;
  const champEmail = (ac) => `<div class="champ"><label for="aEmail">E-mail</label><input id="aEmail" type="email" inputmode="email" autocomplete="${ac}" autocapitalize="none" autocorrect="off" spellcheck="false" data-auth-champ="email" value="${attr(auth.email)}"></div>`;
  // E13 de l'ancienne app : voir le mot de passe tapé (le même sert ensuite dans RunSync).
  const champMdp = (label, ac) => `<div class="champ"><label for="aMdp">${label}</label><div class="avec-u"><input id="aMdp" type="${auth.voir ? "text" : "password"}" autocomplete="${ac}" autocapitalize="none" autocorrect="off" spellcheck="false" data-auth-champ="mdp" value="${attr(auth.mdp)}"><button type="button" class="oeil" data-action="voir-mdp" aria-label="${auth.voir ? "Masquer" : "Afficher"} le mot de passe" aria-pressed="${auth.voir}">${ic(auth.voir ? "oeilBarre" : "oeil", 18)}</button></div></div>`;
  const champCode = () => `<div class="champ"><label for="aCode">Code reçu par e-mail</label><input id="aCode" class="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="one-time-code" placeholder="······" data-auth-champ="code" value="${attr(auth.code)}"></div>`;
  function authHTML() {
    const e = auth.etape, dis = auth.occupe ? " disabled" : "";
    const msgs = `${auth.info ? `<div class="cap citron" role="status" style="font-size:14px;font-weight:600">${esc(auth.info)}</div>` : ""}<div class="erreur" role="alert">${esc(auth.erreur)}</div>`;
    const go = (txt) => `<button type="submit" class="btn primaire"${dis}>${auth.occupe ? "Un instant…" : txt}</button>`;
    const lien = (etape, txt) => `<button type="button" class="btn-texte" data-auth-aller="${etape}">${txt}</button>`;
    const renvoi = `<button type="button" class="btn-texte" id="aRenvoi" data-action="auth-renvoyer"${dis}></button>`;
    const retour = (etape) => `<div class="pp-haut"><button type="button" class="rond" data-auth-aller="${etape}" aria-label="Retour">${ic("retour", 18)}</button></div>`;
    let h;
    if (e === "connexion") h = `<div style="display:flex;justify-content:center;padding:36px 0 8px"><img src="logo/logo-vertical-couleur.svg" alt="MyRunningApp" width="150" height="110" style="height:110px;width:auto"></div>
      <h1 class="h-plein">Content de te revoir</h1>${champEmail("username")}${champMdp("Mot de passe", "current-password")}
      <button type="button" class="citron" style="font-weight:700;font-size:14px;align-self:flex-start" data-auth-aller="oubli">Mot de passe oublié ?</button>${msgs}
      <div class="pp-bas">${go("Se connecter")}${lien("inscription", "Créer un compte")}<button type="button" class="btn-texte" data-feuille="confidentialite">Confidentialité</button></div>`;
    else if (e === "inscription") h = `${barres(1, 'data-auth-aller="connexion"')}<h1 class="h-plein">Crée ton compte</h1>${champEmail("email")}${champMdp("Mot de passe", "new-password")}<div class="cap" style="margin-top:-6px">6 caractères minimum.</div>${msgs}
      <div class="pp-bas">${go("Continuer")}${lien("connexion", "J'ai déjà un compte")}</div>`;
    else if (e === "code") h = `${barres(1, 'data-auth-aller="inscription"')}<h1 class="h-plein">Vérifie ta boîte mail</h1>
      <div class="txt2">${auth.envoyeA > 0 ? `On a envoyé un code à <b>${esc(auth.email)}</b>. Recopie-le ici, et pense à regarder tes courriers indésirables.` : `L'adresse <b>${esc(auth.email)}</b> n'est pas encore confirmée. Entre le code reçu par e-mail, ou demande-en un nouveau.`}</div>
      ${champCode()}${msgs}<div class="pp-bas">${go("Valider")}${renvoi}${lien("inscription", "Changer d'adresse")}${lien("connexion", "Mon adresse est déjà confirmée : me connecter")}</div>`;
    else if (e === "oubli") h = `${retour("connexion")}<h1 class="h-plein">Mot de passe oublié</h1><div class="txt2">Entre ton adresse e-mail : on t'envoie un code pour choisir un nouveau mot de passe.</div>
      ${champEmail("username")}${msgs}<div class="pp-bas">${go("Recevoir le code")}${lien("connexion", "Retour à la connexion")}</div>`;
    else h = `${retour("connexion")}<h1 class="h-plein">Nouveau mot de passe</h1><div class="txt2">${auth.verifie ? "Code accepté. Choisis ton nouveau mot de passe." : `Si un compte existe avec <b>${esc(auth.email)}</b>, un code vient d'être envoyé. Recopie-le, puis choisis ton nouveau mot de passe.`}</div>
      ${auth.verifie ? "" : champCode()}${champMdp("Nouveau mot de passe", "new-password")}<div class="cap" style="margin-top:-6px">6 caractères minimum.</div>${msgs}
      <div class="pp-bas">${go("Changer le mot de passe")}${auth.verifie ? "" : renvoi}${lien("connexion", "Retour à la connexion")}</div>`;
    return `<form class="pp" id="fAuth" novalidate autocomplete="on">${h}</form>`;
  }
  // Après chaque affichage de la connexion : bouton « Renvoyer le code », étape gardée, clavier numérique sur le code.
  function apresAuth() {
    majRenvoi(); minuterAuth(); garderAuthEnCours();
    const id = auth.etape === "code" || (auth.etape === "nouveau" && !auth.verifie) ? "aCode" : auth.etape === "nouveau" ? "aMdp" : "";
    const f = id && document.getElementById(id);
    if (f && !auth.occupe) { f.focus(); if (auth.erreur && id === "aCode" && f.select) f.select(); }
  }
  function majRenvoi() {
    const b = document.getElementById("aRenvoi"); if (!b) return;
    const w = resendWait(auth.envoyeA, Date.now());
    b.textContent = w > 0 ? `Renvoyer le code (dans ${w} s)` : auth.envoyeA > 0 || auth.etape === "nouveau" ? "Renvoyer le code" : "Envoyer un nouveau code";
    b.disabled = auth.occupe || w > 0;
  }
  function minuterAuth() {
    const besoin = (auth.etape === "code" || auth.etape === "nouveau") && resendWait(auth.envoyeA, Date.now()) > 0;
    if (besoin && !minuteurAuth) minuteurAuth = setInterval(() => { majRenvoi(); if (!resendWait(auth.envoyeA, Date.now())) { clearInterval(minuteurAuth); minuteurAuth = null; } }, 1000);
    if (!besoin && minuteurAuth) { clearInterval(minuteurAuth); minuteurAuth = null; }
  }
  async function authEnvoyer() {
    if (auth.occupe) return;
    const email = auth.email.trim(), e = auth.etape;
    auth.erreur = ""; auth.info = "";
    const stop = (t) => { auth.erreur = t; auth.occupe = false; rendre(); };
    const attendre = () => { auth.occupe = true; rendre(); };
    if (["connexion", "inscription", "oubli"].includes(e) && !validEmail(email)) return stop("Entre une adresse e-mail valide.");
    if (e === "connexion") {
      if (!auth.mdp) return stop("Entre ton mot de passe.");
      attendre(); const { error } = await Donnees.connexion(email, auth.mdp); auth.occupe = false;
      if (!error) return authFini();
      const i = authErrorInfo(error);
      if (i.kind === "not_confirmed") { Object.assign(auth, { etape: "code", code: "", envoyeA: 0 }); return rendre(); }
      return stop(i.text);
    }
    if (e === "inscription") {
      if (auth.mdp.length < 6) return stop("Choisis un mot de passe d'au moins 6 caractères.");
      attendre(); const { data, error } = await Donnees.inscription(email, auth.mdp); auth.occupe = false;
      const out = signUpOutcome(data, error);
      if (out === "error") return stop(authErrorInfo(error).text);
      if (out === "session") return authFini();          // confirmation par e-mail désactivée côté Supabase
      if (out === "exists") { Object.assign(auth, { etape: "connexion", info: "Un compte existe déjà avec cette adresse : connecte-toi." }); return rendre(); }
      Object.assign(auth, { etape: "code", code: "", envoyeA: Date.now() }); return rendre();
    }
    if (e === "code") {
      if (!otpComplete(auth.code)) return stop("Entre le code reçu par e-mail.");
      attendre();
      let r = await Donnees.verifierCode(email, auth.code, "email");
      if (r.error) r = await Donnees.verifierCode(email, auth.code, "signup");
      // L'adresse a peut-être déjà été confirmée par le lien de l'e-mail : le mot de passe suffit alors.
      if (r.error && auth.mdp) { const si = await Donnees.connexion(email, auth.mdp); if (!si.error) r = si; }
      auth.occupe = false;
      if (r.error) return stop(authErrorInfo(r.error).text);
      return authFini();
    }
    if (e === "oubli") {
      attendre(); const { error } = await Donnees.motDePasseOublie(email); auth.occupe = false;
      if (error) return stop(authErrorInfo(error).text);
      Object.assign(auth, { etape: "nouveau", code: "", mdp: "", envoyeA: Date.now(), verifie: false }); return rendre();
    }
    if (!auth.verifie && !otpComplete(auth.code)) return stop("Entre le code reçu par e-mail.");
    if (auth.mdp.length < 6) return stop("Choisis un mot de passe d'au moins 6 caractères.");
    attendre();
    if (!auth.verifie) { const v = await Donnees.verifierCode(email, auth.code, "recovery"); if (v.error) return stop(authErrorInfo(v.error).text); auth.verifie = true; }
    const u = await Donnees.changerMotDePasse(auth.mdp); auth.occupe = false;
    if (u.error) return stop(authErrorInfo(u.error).text);   // le code est déjà utilisé : on ne le redemande pas
    await authFini(); U.toast("Mot de passe changé.");
  }
  async function authFini() {
    Object.assign(auth, { etape: "connexion", mdp: "", code: "", erreur: "", info: "", occupe: false, verifie: false, envoyeA: 0, voir: false, installer: false });
    garder(CLES.authEnCours, null); minuterAuth();
    etat.session = await Donnees.session();
    if (etat.session) { etat.email = (etat.session.user && etat.session.user.email) || ""; await demarrer(); } else rendre();
  }
  async function authRenvoyer() {
    if (auth.occupe) return;
    const w = resendWait(auth.envoyeA, Date.now());
    if (w > 0) { auth.erreur = `Patiente ${w} secondes avant de redemander un code.`; return rendre(); }
    auth.erreur = ""; auth.info = ""; auth.occupe = true; rendre();
    const email = auth.email.trim();
    const { error } = auth.etape === "nouveau" ? await Donnees.motDePasseOublie(email) : await Donnees.renvoyerCode(email);
    auth.occupe = false;
    if (error) { const i = authErrorInfo(error); if (i.kind === "wait") auth.envoyeA = Date.now() - (RESEND_COOLDOWN_SEC - i.wait) * 1000; auth.erreur = i.text; return rendre(); }
    auth.envoyeA = Date.now(); auth.info = "Nouveau code envoyé."; rendre();
  }

  /* =================== Ton accord (A6, choix d'Omar du 13/10 ; texte allégé le 31/10 : ni douleurs ni programme) ===================
     Avant tout le reste, pour un compte neuf comme pour un compte existant sans accord. Case jamais cochée d'avance. « Je
     refuse » : l'app ne peut pas fonctionner sans ; revenir, ou supprimer son compte. */
  const accordManquant = () => privacyConsentNeeded(etat.accordPret, etat.profil && etat.profil.privacy_consent_at);
  function accordHTML() {
    const a = etat.accord, ancien = etat.brutes.length > 0 || !!(etat.profil && etat.profil.onboarding_completed_at);
    if (a.refus) return `<div class="pp"><h1 class="h-plein" style="margin-top:30px">Ton accord est nécessaire</h1>
      <div class="txt2">Sans cet accord, l'app ne peut pas fonctionner : elle s'appuie sur ton cœur et ton ressenti pour suivre ta progression.</div>
      <div class="txt2">Tu peux revenir pour donner ton accord, ou supprimer ton compte et toutes tes données.</div>
      <div class="pp-bas"><button type="button" class="btn primaire" data-action="accord-revenir">Revenir</button><button type="button" class="btn second" data-feuille="supprimer">Supprimer mon compte</button></div></div>`;
    return `<div class="pp">${ancien ? "" : barres(2)}<h1 class="h-plein"${ancien ? ' style="margin-top:30px"' : ""}>Ton accord</h1>
      <div class="txt2">${ancien ? "Rien ne change dans l'app : la loi demande simplement ton accord pour garder des données de santé." : "Avant de commencer, l'app a besoin de ton accord pour garder des données de santé."}</div>
      <div style="display:flex;gap:10px" class="txt2"><span class="citron">${ic("coeur", 18)}</span><span>Ta fréquence cardiaque et ton ressenti servent à suivre ta progression.</span></div>
      <div style="display:flex;gap:10px" class="txt2"><span class="citron">${ic("cadenas", 18)}</span><span>Personne d'autre ne les voit : pas de publicité, pas de revente. Tu peux tout télécharger ou tout supprimer quand tu veux.</span></div>
      <label class="carte" style="flex-direction:row;gap:12px;background:var(--surface);border:1px solid var(--line)"><input type="checkbox" data-accord-case${a.coche ? " checked" : ""} style="width:22px;height:22px;accent-color:#F2F3F0;flex:none"><span>J'accepte que MyRunningApp utilise mes données de santé (fréquence cardiaque, ressenti) pour suivre ma progression.</span></label>
      <button type="button" class="citron" style="font-weight:700;font-size:14px;align-self:flex-start" data-feuille="confidentialite">Lire la page Confidentialité</button>
      <div class="pp-bas"><button type="button" class="btn primaire" id="accordGo" data-action="accord-ok"${a.coche && !a.occupe ? "" : " disabled"}>${a.occupe ? "Enregistrement…" : "Continuer"}</button><button type="button" class="btn-texte" data-action="accord-refus">Je refuse</button></div></div>`;
  }
  async function accepterAccord() {
    if (!etat.accord.coche || etat.accord.occupe) return;
    etat.accord.occupe = true; rendre();
    const ok = await majProfil({ privacy_consent_at: new Date().toISOString() });
    etat.accord = { coche: false, occupe: false, refus: false };
    window.scrollTo(0, 0); rendre();
    if (ok) apresChargement();
  }

  /* =================== Premiers pas (D58 à D108 de l'ancienne app, écrans V2 8a à 8h) ===================
     Pour un compte neuf, après l'accord : toi (pseudo, âge, FC max), ta montre, le guide de connexion RunSync, puis « Tout est
     prêt ». Un compte d'avant le 05/10 qui a des données est marqué « fait » d'office (D106). On reprend où on en était si l'app
     est rechargée (dans TestFlight ou RunSync) : l'étape se déduit de ce qui est déjà rempli. */
  const premiersPasEnCours = () => !etat.profilErreur && !!etat.profil && !etat.profil.onboarding_completed_at;
  const goalsEquip = () => (etat.profil && etat.profil.goals && etat.profil.goals.equipement) || "";
  function etapePremiersPas() {
    if (etat.pp) return etat.pp;
    const p = etat.profil || {};
    if (!p.age && !p.max_hr) return "toi";
    if (!goalsEquip()) return "montre";
    return "guide";
  }
  const MONTRES_PP = [["Apple Watch", "Bilan complet : cœur et allure détaillés", "Apple Watch"], ["Garmin", "Cœur partiel : le bilan s'appuie sur ton allure", "Garmin"],
    ["Une autre montre", "Si elle envoie tes sorties à Apple Santé", "Autre"], ["Pas de montre", "Tu ajouteras tes sorties à la main", "Aucun"]];
  function premiersPasHTML() {
    const n = etapePremiersPas(), p = etat.profil || {};
    if (n === "toi") return `<div class="pp">${barres(3)}<h1 class="h-plein">Parle-nous de toi</h1><div class="txt2" style="margin-top:-6px">Juste de quoi calculer tes zones cardio.</div>
      <div class="champ"><label for="ppP">Prénom ou pseudo</label><input id="ppP" autocomplete="nickname" value="${attr(p.pseudo || "")}"></div>
      <div class="champ"><label for="ppA">Âge</label><div class="avec-u"><input id="ppA" inputmode="numeric" value="${attr(p.age || "")}"><em>ans</em></div></div>
      <div class="champ"><label for="ppF">FC max · facultatif</label><div class="avec-u"><input id="ppF" inputmode="numeric" placeholder="Je ne sais pas" value="${attr(p.max_hr || "")}"><em>bpm</em></div></div>
      <div class="cap">Vide : on l'estime d'après ton âge. Tu pourras la changer dans Profil.</div><div class="erreur" id="ppErreur" role="alert"></div>
      <div class="pp-bas"><button type="button" class="btn primaire" data-action="pp-toi">Continuer</button></div></div>`;
    if (n === "montre") {
      const choisie = etat.ppMontre || (MONTRES_PP.find((m) => m[2] === goalsEquip().split(",")[0]) || MONTRES_PP[0])[0];
      return `<div class="pp">${barres(4, 'data-action="pp-vers-toi"')}<h1 class="h-plein">Avec quoi tu cours ?</h1><div class="txt2" style="margin-top:-6px">On lit tes sorties dans Apple Santé.</div>
        ${MONTRES_PP.map(([t, d]) => `<button type="button" class="montre${t === choisie ? " actif" : ""}" data-pp-montre="${attr(t)}"><div><b>${esc(t)}</b><span class="cap">${esc(d)}</span></div><span class="coche${t === choisie ? " on" : ""}">${t === choisie ? ic("check", 14, 3) : ""}</span></button>`).join("")}
        <div class="pp-bas"><button type="button" class="btn primaire" data-action="pp-montre">Continuer</button></div></div>`;
    }
    return guideHTML(true);
  }
  async function ppToi() {
    const v = (id) => String((document.getElementById(id) || {}).value || "").trim(), err = (t) => { const e = document.getElementById("ppErreur"); if (e) e.textContent = t; };
    const age = Number(v("ppA")), fc = v("ppF") ? Number(v("ppF")) : null;
    if (!(age >= 10 && age <= 99)) return err("Indique ton âge : il sert à estimer ta FC max.");
    if (fc != null && !(fc >= 120 && fc <= 230)) return err("Ta FC max doit être entre 120 et 230, ou laisse la case vide.");
    const champs = { pseudo: v("ppP") || null, age }; if (fc) champs.max_hr = fc;
    if (await majProfil(champs)) { etat.pp = "montre"; window.scrollTo(0, 0); rendre(); }
  }
  async function ppMontre() {
    const choisie = etat.ppMontre || (MONTRES_PP.find((m) => m[2] === goalsEquip().split(",")[0]) || MONTRES_PP[0])[0], m = MONTRES_PP.find((x) => x[0] === choisie);
    if (!(await majGoals({ equipement: m[2] }))) return;
    if (m[2] === "Aucun") return terminerPremiersPas();
    etat.pp = "guide"; window.scrollTo(0, 0); rendre();
  }
  // Fin des premiers pas : le compte est marqué, l'annonce de la V2 ne lui sera jamais montrée, puis « Tout est prêt ».
  async function terminerPremiersPas(versAccueil) {
    garder(CLES.nouveautes, [...new Set([...lire(CLES.nouveautes, []), NOUVEAUTES_ID])]);
    fermerGuide(); etat.pp = null;
    await majProfil({ onboarding_completed_at: new Date().toISOString() });
    location.hash = versAccueil ? "#/accueil" : "#/pret"; rendre();
  }
  function pretHTML() {
    const pseudo = (etat.profil && etat.profil.pseudo) || "", n = etat.sorties.filter((s) => !s.manuel).length;
    return `<div class="pp"><span class="fin-ic ok" style="width:44px;height:44px;margin-top:20px">${ic("check", 22, 3)}</span><h1 class="h-plein">Tout est prêt${pseudo ? `, ${esc(pseudo)}` : ""}</h1>
      <div class="txt2" style="margin-top:-6px">${n ? `${n} ${n > 1 ? "sorties reçues" : "sortie reçue"}. Voici où tu en es.` : "Ta progression apparaîtra dès ta première sortie."}</div>
      ${etat.courses.length ? niveauHTML(maintenant()) : ""}
      <span class="sur" style="margin-top:6px">Pour aller plus loin · facultatif</span><div class="groupe"><button type="button" class="rangee" data-go="#/profil/chrono"><span style="flex:1"><b style="display:block">Ajoute un chrono récent</b><span class="cap">Sert quand ta montre ne donne pas ton cœur</span></span>${ic("chevron", 16)}</button><button type="button" class="rangee" data-go="#/profil/objectif"><span style="flex:1"><b style="display:block">Fixe-toi un objectif</b><span class="cap">Un repère dans Progression</span></span>${ic("chevron", 16)}</button></div>
      <div class="pp-bas"><button type="button" class="btn primaire" data-go="#/accueil">Voir mon accueil</button></div></div>`;
  }

  /* =================== Guide « Connecte tes courses » (D60, D102, D107 de l'ancienne app) ===================
     4 étapes : installer TestFlight, installer RunSync, l'ouvrir et se laisser guider, recevoir les courses. Les trois premières
     se cochent toutes seules au retour dans l'app après avoir ouvert l'App Store, TestFlight ou RunSync par leur lien direct.
     L'arrivée des premières sorties est vérifiée toutes les 4 s, à toutes les étapes (on fait souvent tout dans RunSync avant
     de revenir). L'état est gardé sur l'appareil : si l'app est rechargée entre-temps, le guide reprend où il en était. */
  const RUNSYNC_INSTALL_URL = "https://testflight.apple.com/join/vYx5KKUw";   // lien public TestFlight fourni par Omar (groupe « Amis_Testeurs ») ; à remplacer par le lien App Store à la sortie
  let guide = null, minuteurGuide = null;   // { done:[b,b,b], pending:0 à 3, hint:0 à 3, attente, recues, courses }
  const recuesDansEtat = () => etat.sorties.filter((s) => s.appleType && !s.manuel).length;
  const coursesRecues = () => etat.sorties.filter((s) => s.appleType === "Running").length;
  function ouvrirGuide() {
    const st = syncGuideRestore(lire(CLES.guide, null));
    guide = { done: st.done, pending: st.pending, hint: 0, attente: null, recues: recuesDansEtat(), courses: coursesRecues() };
    reglerGuide(); garderGuide(); sonderGuide();
  }
  const garderGuide = () => garder(CLES.guide, guide ? { v: 2, open: true, done: guide.done, pending: guide.pending } : null);
  function reglerGuide() { if (!guide || !guide.pending) return; guide.done[guide.pending - 1] = true; guide.pending = 0; guide.hint = 0; garderGuide(); }
  function modeleGuide() {
    const m = syncGuideModel(guide.done, guide.recues, guide.attente ? (Date.now() - guide.attente) / 1000 : 0, guide.courses);
    if (m.phase === "wait" && !guide.attente) guide.attente = Date.now();
    return m;
  }
  const vueGuide = () => { const m = modeleGuide(); return JSON.stringify([m.active, m.phase, guide.done, guide.recues, guide.courses, guide.hint, !!(etat.profil && etat.profil.sync_since_date)]); };
  function arreterSonde() { if (minuteurGuide) { clearInterval(minuteurGuide); minuteurGuide = null; } }
  function sonderGuide() { arreterSonde(); if (!modeleGuide().connected) minuteurGuide = setInterval(sondeGuide, 4000); }
  function fermerGuide() { arreterSonde(); guide = null; garderGuide(); }
  async function sondeGuide() {
    if (!guide) { arreterSonde(); return; }
    const avant = vueGuide();
    if (!modeleGuide().connected) {
      const { data: n, error } = await Donnees.compterRecues();
      if (!guide) return;
      if (!error && n > 0) { arreterSonde(); await charger(); if (guide) { guide.recues = Math.max(n, recuesDansEtat()); guide.courses = coursesRecues(); } }
      else if (!(etat.profil && etat.profil.sync_since_date)) { const { data: d } = await Donnees.lireSyncDepuis(); if (d) etat.profil = { ...etat.profil, sync_since_date: d }; }
    }
    if (guide && vueGuide() !== avant) rendre(true);
  }
  // L'app ouverte par un lien a-t-elle pris la main ? `resteIci` si MyRunningApp n'est jamais passée derrière (app pas
  // installée, ou fenêtre « Ouvrir dans … ? » refusée).
  function surveillerSortie(resteIci) {
    let partie = false, flou = false, fini = false;
    const vis = () => { if (document.visibilityState === "hidden") partie = true; }, cache = () => { partie = true; }, perdu = () => { flou = true; }, retour = () => setTimeout(finir, 600);
    const nettoyer = () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", cache); window.removeEventListener("blur", perdu); window.removeEventListener("focus", retour); };
    function finir() { if (fini) return; fini = true; nettoyer(); if (!partie) resteIci(); }
    document.addEventListener("visibilitychange", vis); window.addEventListener("pagehide", cache); window.addEventListener("blur", perdu);
    setTimeout(() => { if (fini) return; if (partie) { fini = true; nettoyer(); return; } if (flou) window.addEventListener("focus", retour); else finir(); }, 2500);
  }
  const liensGuide = () => syncInstallLinks(contexte().ios, RUNSYNC_INSTALL_URL);
  function lancerGuide(etape) {
    const l = liensGuide(), url = etape === 1 ? l.testflight : etape === 2 ? l.runsync : runSyncOpenUrl(etat.email, !autonome());
    if (!url) { U.toast("Le lien d'installation de RunSync arrive bientôt."); return; }
    guide.pending = etape; guide.hint = 0; garderGuide(); rendre(true);
    surveillerSortie(() => { if (guide && guide.pending === etape) { guide.hint = etape; rendre(true); } });
    if (/^https?:/.test(url)) window.open(url, "_blank"); else location.href = url;
  }
  // RunSync déjà relié : il s'ouvre et envoie tout de suite les dernières sorties ; s'il ne s'ouvre pas, on le dit (R38).
  function ouvrirRunSync() {
    surveillerSortie(() => U.toast("RunSync ne s'est pas ouvert : il n'est sans doute plus installé. Revois le guide de connexion."));
    location.href = runSyncSyncUrl(!autonome());
  }
  function indiceGuide() {
    const h = guide && guide.hint; if (!h) return "";
    const b = (txt, etape) => `<button type="button" class="btn second" data-guide-lancer="${etape}">${txt} ${ic("externe", 16, 2.4)}</button>`;
    if (h === 2) return U.verdictBox({ ton: "presque", titre: "TestFlight ne s'est pas ouvert : il n'est sans doute pas encore installé." }) + b("Installer TestFlight", 1);
    if (h === 3) return U.verdictBox({ ton: "presque", titre: "RunSync ne s'est pas ouvert : il n'est sans doute pas encore installé." }) + b("Installer RunSync", 2);
    return U.verdictBox({ ton: "presque", titre: "L'App Store ne s'est pas ouvert. Réessaie, ou cherche « TestFlight » dans l'App Store." });
  }
  function corpsEtape(m, n) {
    const go = (txt, etape) => `<button type="button" class="btn primaire" data-guide-lancer="${etape}">${txt}${etape < 3 ? ` ${ic("externe", 16, 2.4)}` : ""}</button>`;
    const deja = (etape, txt) => `<button type="button" class="btn-texte" data-guide-fait="${etape}">${txt}</button>`;
    const t = (x) => `<div class="txt2" style="font-size:14px;font-weight:500">${x}</div>`;
    if (n === 1) return `${t("RunSync est encore en test : elle s'installe avec <b>TestFlight</b>, l'app d'Apple pour les apps en test. Installe TestFlight, puis reviens ici.")}${t("<b>Pourquoi deux apps ?</b> RunSync n'est pas encore sur l'App Store : pendant les tests, Apple la distribue ainsi. Tu ne le fais qu'une fois.")}${indiceGuide()}${go("Installer TestFlight", 1)}${deja(1, "Je l'ai déjà")}`;
    if (n === 2) return `${t("RunSync est une petite app relais : elle récupère tes courses dans Apple Santé et les envoie ici, toute seule.")}${t("Dans TestFlight, touche <b>Accepter</b>, puis <b>Installer</b>. Reviens ensuite ici.")}${indiceGuide()}${go("Installer RunSync", 2)}${deja(2, "Je l'ai déjà")}`;
    if (n === 3) return `${t("Connecte-toi dans RunSync avec <b>le même e-mail et le même mot de passe</b> que dans MyRunningApp, puis suis ses écrans jusqu'à « C'est fait ». Ouvert d'ici, RunSync a ton e-mail déjà rempli.")}
      <div class="kv" style="background:var(--sunken);border-radius:12px;padding:10px 12px"><span>${esc(etat.email || "")}</span><button type="button" class="citron" style="font-weight:700" data-action="copier-email">Copier</button></div>
      <div class="cap">À la fin, reviens ici avec le petit retour tout en haut à gauche, ou depuis ton écran d'accueil.</div>${indiceGuide()}${go("Ouvrir RunSync", 3)}${deja(3, "C'est déjà fait")}`;
    if (m.phase === "ok") return `${t(`<b>${esc(m.summary.replace("C'est connecté · ", ""))}.</b> Les prochaines arriveront toutes seules.`)}<button type="button" class="btn primaire" data-action="guide-fini">Continuer</button>`;
    if (m.phase === "empty") {
      const p = etat.profil || {}, msg = syncEmptyMessage(!!p.sync_since_date, syncEquip(goalsEquip()), p.sync_since_date ? fmtJourMois(p.sync_since_date) : "");
      const astuces = msg.reopen ? "" : `<div class="cap">Ouvre RunSync et touche « Synchroniser maintenant ». Vérifie l'accès : Réglages › Confidentialité et sécurité › Santé › RunSync.</div>`;
      return `${t(`<b>${esc(msg.title)}</b>`)}${msg.lines.map((l) => t(esc(l.replace(/« J'ai fait cette séance » sur Aujourd'hui, ou « Séance réalisée » dans Progression/, "« Ajouter » dans Sorties")))).join("")}${astuces}
        ${msg.reopen ? `<button type="button" class="btn primaire" data-guide-lancer="3">Ouvrir RunSync</button><button type="button" class="btn second" data-action="guide-fini">Continuer sans attendre</button>`
          : `<button type="button" class="btn primaire" data-action="guide-fini">Continuer</button><button type="button" class="btn second" data-action="guide-reessayer">Réessayer</button>`}`;
    }
    return `<div class="txt2" style="display:flex;gap:10px;align-items:center"><span class="tourne" aria-hidden="true"></span>Synchronisation de tes courses… Ça prend en général moins de 30 secondes.</div><button type="button" class="btn-texte" data-action="guide-fini">Continuer sans attendre</button>`;
  }
  // « 1er janvier », « 12 mars » : date de départ de RunSync dans le message de l'étape 4.
  const fmtJourMois = (iso) => { const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`); if (isNaN(d)) return ""; return `${d.getDate() === 1 ? "1er" : d.getDate()} ${U.MOIS[d.getMonth()]}`; };
  function guideHTML(dansPremiersPas) {
    if (!guide) ouvrirGuide();
    const m = modeleGuide(), note = m.connected || m.phase ? null : syncGuideNote(syncEquip(goalsEquip()));
    const etapes = m.steps.map((st) => (st.state === "done" ? `<div class="etape faite"><span class="no">${ic("check", 14, 3)}</span>${esc(st.title)}</div>`
      : st.state === "active" ? `<div class="etape active"><div style="display:flex;gap:12px;align-items:center"><span class="no" style="background:var(--text);color:var(--on-accent)">${st.n}</span><b>${esc(st.title)}</b></div>${corpsEtape(m, st.n)}</div>`
      : `<div class="etape"><span class="no">${st.n}</span>${esc(st.title)}</div>`)).join("");
    const haut = dansPremiersPas ? `<div class="pp-haut"><button type="button" class="rond" data-action="pp-vers-montre" aria-label="Retour">${ic("retour", 18)}</button><span class="sur">Ta montre · ${esc(montreInfo().nom)}</span></div>` : retourLigne("Ta montre", "#/profil/montre");
    const noteH = note ? `${U.verdictBox({ ton: "presque", titre: note.text })}${note.skip ? `<div class="champs2"><button type="button" class="btn second" data-action="guide-saisie">Saisir à la main</button><button type="button" class="btn second" data-action="guide-plus-tard">Passer pour l'instant</button></div>` : ""}` : "";
    return `<div class="pp">${haut}<h1 class="h-plein">Connecte tes courses</h1><div class="txt2" style="margin-top:-6px">4 étapes, environ 4 minutes. On coche chaque étape tout seul quand tu reviens.</div>
      ${noteH}${etapes}${m.connected ? "" : `<div class="pp-bas"><button type="button" class="btn-texte" data-action="guide-plus-tard">Je le ferai plus tard</button></div>`}</div>`;
  }
  // Fin du guide : dans les premiers pas, « Tout est prêt » ; sinon, retour à « Ta montre ».
  function finirGuide(plusTard) {
    const pp = premiersPasEnCours();
    fermerGuide();
    if (pp) return terminerPremiersPas(plusTard);
    location.hash = "#/profil/montre";
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
    if (navigator.onLine === false) h += `<div class="bandeau-reseau">${ic("horsLigne", 22)}<div style="flex:1"><b>Pas de connexion</b><div class="cap">Tes chiffres datent de ${esc(U.heureTxt(etat.chargeA || now))}.</div></div></div>`;
    h += cartesActionHTML();   // fusion d'une saisie avec la sortie de la montre (choix 7)
    if (!der) return h + aucuneSortieHTML() + verifierHTML();
    const premieres = etat.courses.length < R.conseilMinSorties || now - etat.courses[0].ts < 28 * JOUR;
    if (premieres) h += `<section class="carte" style="background:var(--accent-soft);border:1px solid var(--accent-line);flex-direction:row;gap:12px">${ic("montre", 22)}<div><b class="lead">Tes ${etat.courses.length} premières sorties sont là</b><div class="txt2" style="font-size:14px;margin-top:4px">Ton bilan démarre dès maintenant. Ton niveau se précise après 4 semaines.</div></div></section>`;
    // « Vérifions N sorties » (choix 6) : juste après la première carte, pour qu'on la voie sans faire défiler.
    const corps = modeA ? [taSortieHTML(der), verifierHTML(), niveauHTML(now), moisHTML(now)]
      : [niveauHTML(now), verifierHTML(), moisHTML(now), derniereLigneHTML(der)];
    return h + corps.join("");
  }
  // 10H : rien reçu (après « Plus tard » ou « Pas de montre »).
  const aucuneSortieHTML = () => `<section class="carte" style="background:var(--accent-soft);border:1px solid var(--accent-line)">
      <div style="display:flex;gap:12px">${ic("montre", 22)}<div><b class="lead">Connecte tes courses</b><div class="txt2" style="font-size:14px;margin-top:4px">On lit tes sorties dans Apple Santé : allure, cœur, régularité. Ta progression apparaît dès ta première sortie reçue.</div></div></div>
      <button type="button" class="btn primaire" data-go="#/guide">Voir comment</button><button type="button" class="btn second" data-go="#/ajouter">Ajouter une sortie à la main</button></section>`;

  // 2A · Ta sortie : toute la carte se touche, plus le bouton.
  function taSortieHTML(s) {
    const v = bilanDe(s), lib = libDe(s), f = Calc.frise3(s, etat.zones), res = Calc.ressentiDe(s, etat.ressentis), cran = Calc.ressentiCran(res);
    const legende = f ? `<div class="carte-tete" style="font-size:13px"><span>${U.friseTexte({ morceaux: f.morceaux.filter((m) => m.cat !== "calme") })}</span>
        ${res != null ? `<span class="txt2">Ressenti <b style="color:var(--text)">${res}/10</b> · ${esc(cran.mot)}</span>` : `<span class="citron" style="font-weight:600">Note ton ressenti</span>`}</div>` : "";
    return `<section class="carte" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}" aria-label="Ta sortie d'aujourd'hui : voir le détail">
      <div class="carte-tete"><span class="sur">Ta sortie · aujourd'hui ${esc(U.heureTxt(s.ts))}</span>${U.pillType(lib)}</div>
      ${U.bilanLigne(v)}
      <div class="mini">${mt("Distance", U.kmTxt(s.dist), "km")}${mt("Durée", fmtDur(s.dur))}${mt("Allure", U.allure(s.allure), "/km")}</div>
      ${f ? U.frise(f) : ""}${legende}${!f ? `<div class="carte-tete" style="font-size:13px"><span></span>${res != null ? `<span class="txt2">Ressenti <b style="color:var(--text)">${res}/10</b> · ${esc(cran.mot)}</span>` : `<span class="citron" style="font-weight:600">Note ton ressenti</span>`}</div>` : ""}
      <button type="button" class="btn primaire" data-go="#/sortie/${esc(s.id)}">Voir le détail de ta course ${ic("chevron", 18, 2.4)}</button></section>`;
  }
  // 2B · Ta dernière sortie : une ligne qui se touche.
  function derniereLigneHTML(s) {
    const v = bilanDe(s);
    return `<section class="carte" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}" aria-label="Ta dernière sortie : voir le détail"><span class="sur">Ta dernière sortie</span>
      <div style="display:flex;align-items:center;gap:12px">${U.icBilan(v.sens, "petite")}<div style="flex:1;min-width:0"><b style="font-size:16px">${esc(libDe(s))} · ${U.kmTxt(s.dist)} km</b>
        <div class="cap">${esc(U.relatif(s.ts, maintenant()).replace(/^./, (c) => c.toUpperCase()))} · ${esc(v.titre.toLowerCase())}</div></div><span class="chev" style="color:var(--faint)">${ic("chevron", 18)}</span></div></section>`;
  }

  /* ---------- Ton niveau (13a, révision Claude Design choisie par Omar le 29/10) ----------
     Une allure en grand (Facile à l'ouverture) avec son écart et sa courbe 11a (un point par semaine sur 1, 2 ou 3 mois), les
     3 autres en petites tuiles : la tuile touchée passe en grand. Chiffres et écarts sur la période choisie. Rien n'est mémorisé. */
  const NIV = { ef: { nom: "Facile", titre: "Ton allure facile", de: "sortie facile", un: "sortie facile", des: "sorties faciles" },
    tempo: { nom: "Tempo", titre: "Ton allure au tempo", de: "tempo", un: "séance au tempo", des: "séances au tempo" },
    seuil: { nom: "Seuil", titre: "Ton allure au seuil", de: "seuil", un: "séance au seuil", des: "séances au seuil" },
    frac: { nom: "Fractionné", titre: "Ton allure en fractionné", de: "fractionné", un: "fractionné", des: "fractionnés" } };
  function niveauHTML(now) {
    const liste = memo(`nc${now}`, () => Calc.niveauCourbes(etat.courses, now, etat.zones, defsZones())), per = etat.nivPer;
    const sel = liste.find((e) => e.cle === etat.nivSel) || liste[0];
    // 29/10 (retour d'Omar) : le grand chiffre et les tuiles = tes séances de la période choisie ; l'allure actuelle est au bout
    // de la courbe. L'écart : « 9 s plus lent », « nouveau », « aucun en 1 mois ». cls : citron, violet, gris, rien.
    const ecartDe = (e) => {
      const ns = Calc.niveauSerie(e, now, per);
      if (!ns.n) return { ns, txt: nonMesure(e.cle) ? "non mesuré" : `${e.cle === "ef" ? "aucune" : "aucun"} en ${per} mois`, cls: "rien" };
      if (ns.nouveau || ns.ecart == null) return { ns, txt: "nouveau", cls: "gris" };   // pas encore de quoi comparer sur la période
      return { ns, ...U.ecartMots(ns.ecart) };
    };
    const g = ecartDe(sel), ns = g.ns, n = NIV[sel.cle], coul = U.couleurEffort(sel.cle);
    const depuis = ns.tronquee && ns.serie.length ? `depuis le ${U.jourMois(ns.serie[0].ts)}` : null;
    const pastille = ns.n && !ns.nouveau && ns.ecart != null ? (g.cls === "gris" ? (depuis ? `stable ${depuis}` : `stable sur ${per} mois`) : `${g.txt} ${depuis || `qu'il y a ${per} mois`}`) : g.txt;
    // 29/10 (retour d'Omar) : plus de nombre de sorties ; seulement depuis quand (nouveau) ou la dernière séance.
    const sous = !ns.n ? (sel.derniere ? `dernière le ${U.jourMois(sel.derniere.ts)}` : "") : g.txt === "nouveau" ? `depuis le ${U.jourMois(ns.depuisTs)}` : "";
    let vide = "";
    if (!ns.n) {
      if (nonMesure(sel.cle)) vide = texteNonMesure(sel.cle);
      else if (sel.cle !== "ef" && sel.cle !== "frac" && !defsZones()) vide = "Renseigne ta FC max ou ton âge pour lire l'effort au cœur.";
      else if (sel.cle === "ef" && sel.manque > 0) vide = `Encore ${sel.manque} ${sel.manque > 1 ? n.des : n.un} sur 4 semaines pour mesurer ton allure.`;
      else if (sel.derniere) vide = `Pas de ${n.de} sur ${per} mois. Ta dernière séance : ${fmtKmPace(sel.derniere.v)} /km, le ${U.jourMois(sel.derniere.ts).replace(/\.?$/, ".")}`;
      else vide = `Pas encore de ${n.un}.`;
    } else if (ns.serie.filter((p) => p.v != null).length < 2) vide = "Ta courbe apparaît dès 2 semaines de séances.";
    const courbe = !vide ? U.dessinCourbe(ns.serie, { couleur: coul, rapideEnHaut: true, fmt: fmtKmPace, padMin: 6, axe: "dates", h: 104, label: n.titre }).svg : "";
    const pers = [1, 2, 3].map((p) => `<button type="button" data-niv-per="${p}" class="${p === per ? "actif" : ""}" aria-pressed="${p === per}">${p} mois</button>`).join("");
    const tuiles = liste.filter((e) => e !== sel).map((e) => { const ge = ecartDe(e), v = ge.ns.valeur;
      return `<button type="button" class="niv-tuile" data-niv-sel="${e.cle}" aria-label="${esc(`${NIV[e.cle].nom} sur ${per} mois : ${v != null ? fmtKmPace(v) : "pas de séance"}, ${ge.txt}. Afficher en grand`)}">
        <span class="ta-tete" style="--c:${U.couleurEffort(e.cle)}"><i></i>${esc(NIV[e.cle].nom)}</span>
        <span class="num nt-v${v == null ? " rien" : ""}">${v != null ? fmtKmPace(v) : "—"}</span>
        <span class="nt-e ${ge.cls}">${esc(ge.txt)}</span>${U.flecheTuile()}</button>`; }).join("");
    return `<section class="carte niv13" aria-label="Ton niveau sur ${per} mois">
      <div class="niv-titre"><h2>Ton niveau</h2><span>sur ${per} mois</span></div>
      <div class="niv-sel"><div class="carte-tete"><span class="ta-tete" style="--c:${coul}"><i></i>${esc(n.titre)}</span><div class="per-mini" role="group" aria-label="Période">${pers}</div></div>
        <div class="niv-val">${ns.valeur != null ? U.num(fmtKmPace(ns.valeur), "/km", "n46") : '<span class="num n46" style="color:var(--faint)">—</span>'}
          <div class="niv-ec"><span class="pastille-e ${g.cls}">${esc(pastille)}</span>${sous ? `<span class="cap">${esc(sous)}</span>` : ""}</div></div></div>
      ${courbe}${vide ? `<div class="niv-vide">${esc(vide)}</div>` : ""}
      <div class="niv-tuiles">${tuiles}</div></section>`;
  }

  /* ---------- Ton mois (15a, révision Claude Design choisie par Omar le 29/10) ----------
     Une phrase de verdict, km / sorties / durée, « 61 % en zones 1-2 » avec la barre et les 5 zones en petites tuiles, puis la
     régularité en cases chiffrées (sans « d'affilée »). */
  function moisHTML(now) {
    const fm = fcMax(), m = Calc.mois(etat.sorties, now, fm ? fm.valeur : null, fcRepos()), c = m.ce, a = m.avant, tot = m.secs.reduce((x, v) => x + v, 0);
    const nomMois = U.MOIS[new Date(m.debut).getMonth()], moisAvant = U.MOIS[new Date(m.debut - JOUR).getMonth()];
    const sem = Calc.sortiesParSemaine(etat.sorties, now, 12), avec = sem.filter((w) => w.n > 0).length;
    const bande = `<div class="filet"></div><div role="link" tabindex="0" data-go="#/progression/volume" style="display:flex;flex-direction:column;gap:10px" aria-label="Ta régularité : voir le détail">
        <div class="carte-tete"><b style="font-size:16px">${avec} semaines sur 12</b><span style="color:var(--faint)">${ic("chevron", 16)}</span></div>${U.reguCases(sem)}<div class="carte-tete cap" style="margin-top:-2px"><span>${esc(U.jourMois(sem[0].debut))}</span><span>cette semaine</span></div></div>`;
    if (!c.n) {
      const der = etat.courses.filter((s) => s.ts <= now).slice(-1)[0];
      return `<section class="carte aeree" aria-label="Ton mois"><span class="sur">Ton mois · ${esc(nomMois)}</span><div class="lead">Pas encore de sortie ce mois-ci.</div>
        <div class="txt2" style="font-size:14px">${esc(moisAvant.replace(/^./, (x) => x.toUpperCase()))} : ${a.n} ${a.n > 1 ? "sorties" : "sortie"} · ${U.kmTxt(a.km)} km.${der ? ` Ta dernière : il y a ${Math.round((now - der.ts) / JOUR)} jours.` : ""}</div>${bande}</section>`;
    }
    const dKm = a.n ? c.km - a.km : null, dN = a.n ? c.n - a.n : null, pz = tot > 0 ? Calc.partsZones(m.secs) : null;
    const phrase = [!a.n ? "" : c.km > a.km + 0.5 ? `Plus de km qu'en ${moisAvant}.` : c.km >= a.km - 0.5 ? `Autant de km qu'en ${moisAvant}.` : `Encore ${U.kmTxt(a.km - c.km)} km pour égaler ${moisAvant}.`,
      !pz ? "" : pz.facilePct >= R.repereFacilePct ? "Bon équilibre : surtout du facile." : pz.facilePct >= R.moisFacileMinPct ? "Un peu trop d'allure soutenue." : "Beaucoup d'allure soutenue."].filter(Boolean).join(" ");
    return `<section class="carte aeree" aria-label="Ton mois"><span class="sur">Ton mois · ${esc(nomMois)}</span>
      ${phrase ? `<div class="lead">${esc(phrase)}</div>` : ""}
      <div class="mois-chiffres"><div>${U.num(U.kmTxt(c.km), "km", "n32")}${dKm != null && Math.abs(dKm) >= 0.05 ? `<b class="${dKm > 0 ? "citron" : "gris"}">${dKm > 0 ? "+" : "−"}${U.kmTxt(Math.abs(dKm))} km</b>` : ""}</div>
        <div>${U.num(c.n, "", "n32")}<b class="${dN > 0 ? "citron" : "gris"}">${c.n > 1 ? "sorties" : "sortie"}${dN ? ` · ${dN > 0 ? "+" : "−"}${Math.abs(dN)}` : ""}</b></div>
        <div>${U.num(U.dureeTxt(c.sec), "", "n32")}<b class="gris">de course</b></div></div>
      ${pz ? `<div class="filet"></div>${U.partFacile(pz)}` : ""}${bande}</section>`;
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
      const vr = Calc.verdictRepartition(lib, zs, null, s), m = (i) => Math.round(zs.secs[i] / 60);
      const droite = id.cible.length === 2 && id.cible[0] === 0 ? `${m(0) + m(1)} min sur ${Math.round(zs.tot / 60)} en zones 1-2` : `${id.cible.reduce((a, i) => a + m(i), 0)} min en ${id.cible.length > 1 ? `zones ${id.cible[0] + 1}-${id.cible[id.cible.length - 1] + 1}` : `zone ${id.cible[0] + 1}`}`;
      zonesHTML = `<span class="sur">Ton effort par zone</span><div class="carte-tete" style="font-size:14px"><b>Ta sortie</b><span class="cap">${esc(droite)}</span></div>${U.zbarre(zs.secs)}
        
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
    const manuel = s.manuel, now = maintenant();
    const ref = (niveau(s.ts - 1).find((e) => e.cle === Calc.EFFORT_DE[lib]) || {}).maintenant;   // tes 4 semaines d'avant, sans cette sortie
    const pd = Calc.passageDominant(s, etat.zones, R);
    const allureH = ["Tempo", "Seuil"].includes(lib) && pd ? `${Calc.ZONE_A[pd.zone]} ${fmtKmPace(pd.allure)}${v.cle === "premiere" ? " · 1re" : ""}` : ref ? `réf. 4 sem. ${fmtKmPace(ref)}` : "";
    const cadH = cad ? cad >= R.repereCadence ? `<span class="citron">bonne · repère ${R.repereCadence}</span>` : cad >= R.repereCadence - R.cadencePresque ? `presque · vise ${R.repereCadence}` : `<span class="violet">un peu basse · vise ${R.repereCadence}</span>` : "";
    let h = `<div class="carte-tete">${retourLigne(`${U.jourTxt(s.ts)} · ${U.heureTxt(s.ts)}`)}<button type="button" class="rond" data-feuille="menu-sortie" data-id="${esc(s.id)}" aria-label="Plus d'actions">${ic("menu", 18)}</button></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${U.pillType(lib, "", { bouton: true, attrs: `data-feuille="type" data-id="${esc(s.id)}" aria-label="Changer le type de cette sortie"` })}${manuel ? `<span class="etiquette">Saisie à la main</span>` : ""}</div>
      ${U.bilanLigne(v)}
      <section class="stats"><div class="rang"><div class="stat"><div class="l">Distance</div>${U.num(U.kmTxt(s.dist), "km", "v")}</div><div class="stat"><div class="l">Durée</div>${U.num(fmtDur(s.dur), "", "v")}</div>
        <div class="stat"><div class="l">Allure</div>${U.num(U.allure(s.allure), "/km", "v")}${allureH ? `<div class="h">${esc(allureH)}</div>` : ""}</div></div>
        <div class="rang deux"><div class="stat"><div class="l">Ressenti</div>${res != null ? `${U.num(res, "/10", "v")}<div class="h">${esc(cran.mot)}</div>` : `<button type="button" class="citron" style="font-weight:700;margin-top:4px" data-feuille="ressenti" data-id="${esc(s.id)}">Noter</button>`}</div>
        ${manuel && s.fc ? `<div class="stat"><div class="l">Cœur moy.</div>${U.num(Math.round(s.fc), "bpm", "v")}</div>` : cad ? `<div class="stat"><div class="l">Cadence</div>${U.num(cad, "pas/min", "v")}<div class="h">${cadH}</div></div>` : ""}</div></section>`;
    if (!manuel) h += coeurCarte(s, v, lib, pd);
    // 29/10 (retours d'Omar) : « Ta sortie en un coup d'œil » et « En résumé » retirés ; allure par km avec le cœur de chaque km.
    // (Le temps par zone d'allure façon Strava a été retiré : Omar voulait l'allure moyenne dans chaque zone cardio, ajoutée au-dessus.)
    if (!manuel) h += allureParKmHTML(s, lib);
    if (manuel) h += `<div class="cap" style="padding:0 4px">Saisie à la main : pas de courbe, de zones ni d'allure par km. Le bilan s'appuie sur ton allure.</div>`;
    return h;
  }
  function coeurCarte(s, v, lib, pd) {
    const fm = fcMax(), defs = defsZones();
    if (!(Calc.coeurZonesOk(s) && s.fc) || !defs) {
      const ic2 = Calc.intervalleCoeur(s), moyOk = Calc.coeurMoyenOk(s);
      const txt = moyOk && ic2 ? `Ta montre n'envoie ton cœur à Apple Santé que toutes les ${toutesLes(ic2)} : pas de courbe ni de zones. Ton bilan s'appuie sur ton cœur moyen.` : "Données cardio partielles avec ta montre : le bilan s'appuie sur ton allure et ton ressenti.";
      return `<section class="carte"><div class="carte-tete"><h2>Cœur</h2>${info("coeur")}</div><div class="verdict-box"><span class="vi" style="background:var(--control);color:var(--text)">${ic("montre", 14)}</span><span>${esc(txt)}</span></div>
        ${s.fc ? `<div class="mini deux">${mt("FC moy.", Math.round(s.fc), "bpm")}${mt("FC max", s.fcMax ? Math.round(s.fcMax) : "—", s.fcMax ? "bpm" : "")}</div>` : ""}</section>`;
    }
    const zs = Calc.zonesSortie(s, fm.valeur, fcRepos()), der = cardiacDrift({ hrSeries: s.hr, paceSeries: s.pace, durationSec: s.dur, type: s.type });
    const facile = lib === "Sortie facile" || lib === "Longue";
    const tFc = v.tuiles.find((t) => t.cle === "coeur"), dFc = tFc && tFc.delta != null && !/^Cœur (au|en) (tempo|seuil|fractionné)/.test(tFc.label) ? tFc.delta : null;
    const trois = [mt("FC moy.", Math.round(s.fc), "bpm", dFc != null && Math.abs(dFc) >= 1 ? `<span class="${dFc > 0 ? "violet" : "citron"}">${dFc > 0 ? "+" : "−"}${Math.abs(dFc)} vs habitude</span>` : ""), mt("FC max", s.fcMax ? Math.round(s.fcMax) : "—", "bpm")];
    if (facile && der) trois.push(mt("Dérive", der.pct, "%", `<span class="${der.pct > R.repereDerivePct ? "violet" : "citron"}">${esc(DRIFT_LABELS[der.state].toLowerCase())}</span>`));
    else if (pd && pd.fc && pd.zone >= 2) trois.push(mt(Calc.ZONE_A[pd.zone].replace(/^./, (c) => c.toUpperCase()), Math.round(pd.fc), "bpm", v.cle === "premiere" ? "point de départ" : tFc && tFc.habitude ? `habitude ${tFc.habitude}` : ""));
    // Temps par zone cardio (16c, révision du 29/10) : le chiffre du verdict en tête (« 87 % en zones 1-2 », la somme exacte des
    // zones), une colonne par zone avec ses minutes et ton allure dans la zone, puis le conseil seul.
    const vr = Calc.verdictRepartition(lib, zs, null, s);
    return `<section class="carte"><div class="carte-tete"><h2>Cœur</h2>${info("coeur")}</div>${U.courbeCoeur(s, defs)}
      <div class="mini" style="background:var(--sunken);border-radius:14px;padding:4px">${trois.join("").replace(/class="mt"/g, 'class="mt" style="background:transparent"')}</div>
      ${facile && der ? `<div class="txt2" style="font-size:14.5px">${esc(cardiacDriftText(der))}</div>` : ""}
      ${zs ? `<div class="filet"></div><span class="sur">Temps par zone cardio${Calc.coeurFiable(s) ? "" : ` · cœur toutes les ${toutesLes(Calc.intervalleCoeur(s) || 120)}`}</span>
        ${vr ? `<div class="carte-tete"><div class="pf"><span class="num pf-v citron">${vr.tete.pct} %</span><span class="pf-t">${esc(vr.tete.txt)}</span></div>${U.pastille(vr.ton, vr.mot)}</div>` : ""}
        ${U.zcolonnes(Calc.partsZones(zs.secs).mins, Calc.allureZonesCardio(s, etat.zones, defs))}
        ${vr ? U.verdictBox({ ton: vr.ton, titre: vr.conseil }) : ""}` : ""}</section>`;
  }
  function allureParKmHTML(s, lib) {
    const ks = lib === "Fractionné" ? null : Calc.kmParKm(s);   // 29/10 : les arrêts ne comptent plus comme du temps de course
    if (!ks) return `<section class="carte"><h2>Allure par km</h2><div class="cap">${lib === "Fractionné" ? "Pas d'allure par km pour un fractionné : ce sont les blocs d'effort qui comptent." : s.dist >= 3 && !Calc.allureDetaillee(s) ? "Ta montre n'envoie ton allure à Apple Santé que toutes les 10 min environ : pas d'allure par km." : "Pas d'allure par km : il faut au moins 3 km et l'allure détaillée de ta montre."}</div></section>`;
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
    const fc = Calc.coeurFiable(s) && ks.coeur ? ks.coeur : null, cf = (i) => (fc && fc[i] ? `<span class="c">${fc[i]}</span>` : '<span class="c"></span>');
    const rows = k.map((sec, i) => `<div class="km${i === ks.fastest ? " rapide" : ""}"><span>Km ${i + 1}</span><span class="piste"><i style="width:${kmSplitBarPct(sec, rapide).toFixed(1)}%"></i></span><span class="p">${fmtKmPace(sec)}</span>${cf(i)}</div>`).join("")
      + (ks.partial ? `<div class="km partiel"><span>${String(ks.partial.km).replace(".", ",")} km</span><span class="piste"><i style="width:${kmSplitBarPct(ks.partial.pace, rapide).toFixed(1)}%"></i></span><span class="p">${fmtKmPace(ks.partial.pace)}</span>${cf(k.length)}</div>` : "");
    const tete = `<div class="km km-tete"><span></span><span></span><span class="p">allure</span><span class="c">${fc ? "cœur" : ""}</span></div>`;
    return `<section class="carte"><h2>Allure par km</h2>${U.verdictBox({ ton: bon ? "bon" : "presque", titre: msg })}<div style="display:flex;flex-direction:column;gap:9px">${tete}${rows}</div></section>`;
  }


  /* =================== Sorties (5) =================== */
  function ligneCourse(s) {
    return `<div class="ligne" role="link" tabindex="0" data-go="#/sortie/${esc(s.id)}"><i class="pt" style="background:${U.couleurType(libDe(s))}"></i>
      <div class="m"><b>${esc(libDe(s))} · ${U.kmTxt(s.dist)} km</b><span>${esc(U.dateCourte(s.ts))}${s.manuel ? ` <span class="etiquette" style="height:19px;font-size:10.5px;margin-left:4px">Saisie à la main</span>` : ""}</span></div>
      <span class="al">${U.allure(s.allure)}</span><span class="chev">${ic("chevron", 16)}</span></div>`;
  }
  // Années et mois repliés (retour d'Omar du 28/10) : par défaut, seuls l'année et le mois en cours sont dépliés ; ensuite,
  // ce que tu ouvres ou fermes est gardé sur l'appareil.
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
  // 5C · Ajouter une sortie à la main (chantier 2 de l'ancienne app) : types de course et, hors course, Marche, Renfo, Autre
  // (choix 8). Un doublon possible ou des chiffres surprenants s'affichent avant d'enregistrer, sans bloquer (« Enregistrer
  // quand même »). Le ressenti se note pour une course.
  let brouillon = null;
  const aujourdhuiIso = () => localDateStr(new Date(maintenant()));
  function ajouterHTML() {
    const b = brouillon || (brouillon = { type: "Sortie facile", ressenti: null, date: aujourdhuiIso(), dist: "", dur: "", fc: "", doute: null, occupe: false });
    const course = TYPES_COURSE.includes(b.type), iso = aujourdhuiIso();
    const puce = (t) => `<button type="button" data-ajout-type="${attr(t)}" class="${b.type === t ? "actif" : ""}" style="--c:${U.couleurType(t)}"><i></i>${esc(nomType(t))}</button>`;
    return `<div class="feuille"><div class="poignee" aria-hidden="true"></div>
      <div class="carte-tete"><h1 style="font-size:26px">Ajouter une sortie</h1><button type="button" class="rond petit" data-action="ajout-fermer" aria-label="Fermer">${ic("fermer", 16)}</button></div>
      <div class="txt2" style="margin-top:-6px">Une sortie que ta montre n'a pas envoyée.</div>
      <div class="champ"><label for="aDate">Date</label><input id="aDate" type="date" value="${attr(b.date)}" max="${iso}" data-ajout-champ="date"></div>
      <div class="champ"><span class="lab">Course</span><div class="puces-choix">${TYPES_COURSE.map(puce).join("")}</div><span class="lab" style="margin-top:4px">Autre activité</span><div class="puces-choix">${TYPES_AUTRES.map(puce).join("")}</div></div>
      <div class="champs2"><div class="champ"><label for="aDist">Distance${course ? "" : " · facultatif"}</label><div class="avec-u"><input id="aDist" inputmode="decimal" placeholder="5,0" value="${attr(b.dist)}" data-ajout-champ="dist"><em>km</em></div></div>
        <div class="champ"><label for="aDur">Durée</label><div class="avec-u"><input id="aDur" inputmode="numeric" placeholder="35:00" value="${attr(b.dur)}" data-ajout-champ="dur"><em>h:min:s</em></div></div></div>
      <div class="champ"><label for="aFc">Cœur moyen · facultatif</label><div class="avec-u"><input id="aFc" inputmode="numeric" placeholder="—" value="${attr(b.fc)}" data-ajout-champ="fc"><em>bpm</em></div></div>
      ${course ? `<div class="champ" id="aRessenti"><div class="carte-tete"><span class="lab">Comment tu l'as sentie ?</span><span class="cap">facultatif</span></div>${U.crans(b.ressenti, 'data-ajout-cran="1"')}</div>` : ""}
      <div class="cap">Elle portera l'étiquette « Saisie à la main ». Son bilan comparera ton allure, sans courbe ni zones. Pour la corriger : supprime-la, puis ressaisis-la.</div>
      ${b.doute ? U.verdictBox({ ton: "presque", titre: b.doute.texte }) : ""}
      <div class="erreur" id="aErreur" role="alert"></div>
      <button type="button" class="btn primaire" data-action="enregistrer-ajout"${b.occupe ? " disabled" : ""}>${b.occupe ? "Enregistrement…" : b.doute ? "Enregistrer quand même" : "Enregistrer"}</button>
      ${b.doute && b.doute.id ? `<button type="button" class="btn-texte" data-go="#/sortie/${esc(b.doute.id)}">Voir la sortie de ce jour-là</button>` : ""}</div>`;
  }
  const entreeAjout = (b) => ({ date: b.date, type: TYPES_APP[b.type], distKm: String(b.dist).trim().replace(",", "."), durationMin: parseDurationInput(b.dur), hr: String(b.fc).trim(), time: "" });
  // Doute avant d'enregistrer : une sortie existe peut-être déjà ce jour-là, ou les chiffres surprennent.
  function douteAjout(b) {
    const e = entreeAjout(b);
    const dup = findLikelyDuplicateRun(etat.sorties.map((s) => ({ id: s.id, date: localDateStr(new Date(s.ts)), type: s.type, durationSec: s.dur })), { date: e.date, type: e.type, durationSec: e.durationMin * 60 });
    if (dup) return { texte: "Une sortie existe déjà ce jour-là, c'est peut-être la même.", id: dup.id };
    const v = validateManualRun(e, aujourdhuiIso());
    return !v.errors.length && v.warnings.length ? { texte: v.warnings[0] } : null;
  }
  async function enregistrerAjout() {
    const b = brouillon; if (!b || b.occupe) return;
    const e = entreeAjout(b), { errors } = validateManualRun(e, aujourdhuiIso());
    if (errors.length) { document.getElementById("aErreur").textContent = errors.join(" "); return; }
    if (!b.doute) { const d = douteAjout(b); if (d) { b.doute = d; rendre(true); return; } }
    b.occupe = true; rendre(true);
    const r = await Donnees.ajouterSortie(e, isRunningRunType(e.type) ? b.ressenti : null);
    if (r.error || !r.data) { b.occupe = false; rendre(true); U.toast(r.error && r.error.session ? "Ta session a expiré : reconnecte-toi." : "Pas enregistrée, vérifie ta connexion."); return; }
    brouillon = null; await charger();
    U.toast("Sortie ajoutée."); location.hash = isRunningRunType(e.type) ? `#/sortie/${r.data.id}` : "#/sorties";
  }

  /* =================== Progression (6) =================== */
  const MOIS_J = 30.44;
  // L'écart d'une courbe (départ → arrivée) et sa période : « en 12 mois », ou « depuis janvier » si tes sorties commencent après.
  const ecartCourbe = (c, rapideEnHaut) => (c.debut == null ? null : Math.round(rapideEnHaut ? c.debut - c.fin : c.fin - c.debut));
  const suffixeCourbe = (c, mois) => (c.depuis > maintenant() - mois * MOIS_J * JOUR + 21 * JOUR ? `depuis ${U.MOIS[new Date(c.depuis).getMonth()]}` : `en ${mois} mois`);
  const pastilleEcart = (e, mois, suffixe) => { const m = U.ecartMots(e, suffixe || `en ${mois} mois`); return `<span class="etiquette" style="height:auto;min-height:26px;padding:4px 10px;border-radius:12px;line-height:1.3;text-align:right;font-size:12.5px;font-weight:700;${m.cls === "citron" ? "background:var(--accent-soft);color:var(--accent)" : m.cls === "violet" ? "background:var(--attention-bg);color:var(--attention-text)" : ""}">${esc(m.txt)}</span>`; };
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
      const c = U.courbe(rp.points, { fin: now, mois, min: 2, finValeur: rp.valeur, couleur: "#C6F432", rapideEnHaut: true, fmt: (v) => fmtKmPace(v), padMin: 6, label: "Ton allure facile" });
      facile = `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px">${U.num(fmtKmPace(rp.valeur), "/km", "n52")}<div style="text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end">${c.debut != null ? pastilleEcart(ecartCourbe(c, true), mois, suffixeCourbe(c, mois)) : pastilleEcart(rp.ecart, mois)}${rp.modeCoeur ? `<span class="cap">à cœur égal · ${rp.fcRef} bpm</span>` : ""}</div></div>${c.svg}`;
    }
    const obj = o ? `<div class="filet"></div><div style="display:flex;align-items:center;gap:10px;font-size:14.5px">${ic("drapeau", 17)}<span class="txt2" style="flex:1">Ton objectif <b style="color:var(--text)">${esc(o.label)}</b></span>${o.allure ? `<span class="txt2">${fmtKmPace(o.allure)}/km</span>` : ""}</div>` : "";
    // Tes allures par effort : Tempo, Seuil, Fractionné (le Facile est « Ton allure facile », Q2).
    // Les mesures d'un mois de plus que la période : le 1er point d'une courbe à la semaine regarde les 4 semaines d'avant.
    const liste = Calc.alluresParEffort(etat.courses, now, mois + 1, etat.zones, defs, null, mois);
    // 28/10 (« sur 12 mois, je ne vois aucune séance de fractionné ») : la courbe suit la période choisie, même sans séance dans
    // les 4 dernières semaines ; le chiffre en grand est alors le bout de la courbe (son mois, ou il y a combien de semaines).
    const efforts = liste.filter((e) => e.cle !== "ef").map((e, i) => {
      const coul = U.couleurType(e.cle === "tempo" ? "Tempo" : e.cle === "seuil" ? "Seuil" : "Fractionné");
      const quoi = e.cle === "frac" ? "fractionné" : e.cle === "tempo" ? "séance au tempo" : "séance au seuil";
      const pts = e.points.slice().sort((a, b) => a.ts - b.ts), dans = pts.filter((p) => p.ts >= debut), dernier = dans[dans.length - 1];
      const c0 = dans.length ? U.courbe(pts, { fin: now, mois, min: e.cle === "frac" ? R.fracMinSorties : R.effortMinSorties, finValeur: e.maintenant, couleur: coul, rapideEnHaut: true, fmt: (v) => fmtKmPace(v), padMin: 6, label: `Allure ${e.nom}` }) : null;
      const c = c0 && c0.debut != null ? c0 : null;
      let bas;
      if (c) bas = c.svg;
      else if (dans.length) bas = `<div class="txt2" style="font-size:14px">Ta courbe démarre avec ${mois <= 3 ? "une 2e semaine" : "un 2e mois"} de mesures.</div>`;
      else bas = `<div class="txt2" style="font-size:14px">${nonMesure(e.cle) ? texteNonMesure(e.cle) : e.cle !== "frac" && !defs ? "Renseigne ta FC max ou ton âge pour lire l'effort au cœur." : `Pas de ${quoi} sur ${mois} mois.`}</div>`;
      // 29/10 (retour d'Omar) : un bloc bien distinct par type d'allure, construit comme « Ton allure facile ».
      const ec = c ? ecartCourbe(c, true) : e.ecart, suf = c ? suffixeCourbe(c, mois) : null;
      const titre = { tempo: "Ton allure au tempo", seuil: "Ton allure au seuil", frac: "Ton allure en fractionné" }[e.cle];
      // Sans valeur des 4 dernières semaines : le chiffre en grand = le bout de la courbe, et depuis quand il n'y a plus rien.
      const grand = e.maintenant != null ? fmtKmPace(e.maintenant) : c ? fmtKmPace(c.fin) : dernier ? fmtKmPace(dernier.v) : null;
      const sous = e.maintenant != null ? "tes 4 dernières semaines" : dernier ? `${nonMesure(e.cle) ? "dernière mesure le" : "rien depuis le"} ${esc(U.jourMois(dernier.ts).replace(/\.$/, ""))}` : "";
      return `<section class="carte" id="graphe-${e.cle}"><div class="carte-tete"><span class="ta-tete" style="--c:${coul};color:var(--text);font-size:16px"><i></i>${esc(titre)}</span>${info("efforts")}</div>
        ${grand ? `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px">${U.num(grand, "/km", "n52")}<div style="text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end">${c || e.maintenant != null ? pastilleEcart(ec, mois, suf) : ""}<span class="cap">${sous}</span></div></div>` : ""}
        ${bas}</section>`;
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
      ${efforts}
      <section class="carte"><div class="carte-tete"><h2>${nouveau("Allure × régularité")}</h2>${info("croisements")}</div>${regu}</section>
      <section class="carte"><div class="carte-tete"><h2>${nouveau("Allure × ressenti")}</h2>${info("croisements")}</div>${ress}</section>`;
  }
  function progressionCoeur(now, mois) {
    const fm = fcMax(), fr = fcRepos();
    let zones = `<div class="txt2">Renseigne ta FC max ou ton âge pour voir tes zones.</div>`;
    // 29/10 : avec un cœur toutes les 2 min (Garmin), les zones et les sorties faciles restent justes ; la dérive demande l'allure
    // détaillée. Cœur trop rare (toutes les 16 min) : une carte qui le dit, au lieu de blocs vides.
    const detaille = detail().zones, derivePossible = detail().coeur && detail().allure;
    if (!detaille) zones = `<div class="txt2" style="font-size:14.5px">Ta montre n'envoie ton cœur à Apple Santé que toutes les ${toutesLes(detail().intervalle || 120)} : pas assez pour ton temps par zone, ta dérive et tes sorties faciles. Ton cœur moyen, lui, reste juste.</div>`;
    else if (fm) {
      const z = Calc.zonesCardioPeriode(etat.courses, now, mois, fm.valeur, fr), tot = z.secs.reduce((a, v) => a + v, 0);
      const dur = etat.courses.filter((s) => s.ts >= now - mois * MOIS_J * JOUR && Calc.coeurZonesOk(s)).reduce((a, s) => a + s.dur, 0);
      // 29/10 (retour d'Omar) : comme le temps par zone d'une sortie (16c) : « 70 % en zones 1-2 » et sa pastille, une colonne
      // par zone (% du temps, ton allure dans la zone), puis le conseil seul.
      if (z.n) { const pz = Calc.partsZones(z.secs), fac = pz.facilePct, ton = fac >= R.repereFacilePct ? "bon" : fac >= R.moisFacileMinPct ? "presque" : "attention";
        zones = `<div class="carte-tete"><div class="pf"><span class="num pf-v citron">${fac} %</span><span class="pf-t">en zones 1-2</span></div>${U.pastille(ton, { bon: "bien", presque: "presque", attention: "trop soutenu" }[ton])}</div>
          ${U.zcolonnes(pz.pcts, Calc.allureZonesCardioPeriode(etat.courses, now, mois, etat.zones, z.defs), "%")}
          ${U.verdictBox(ton === "bon" ? { ton, titre: "Bon équilibre : surtout du facile." } : { ton, titre: `Vise ${R.repereFacilePct} % en zones 1-2 : un peu plus de facile.` })}
          <div class="cap">${z.n} sorties · ${esc(U.dureeTxt(dur))} de course</div>`; }
      else zones = `<div class="txt2">Pas de sortie au cœur fiable sur la période.</div>`;
    }
    const cm = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.coeurMoyen), der = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.derive);
    const tousCm = etat.courses.filter((s) => s.type === "EF" || s.type === "Long").map((s) => ({ ts: s.ts, v: Calc.coeurMoyen(s) })).filter((p) => p.v != null);
    const tousDer = etat.courses.filter((s) => s.type === "EF" || s.type === "Long").map((s) => ({ ts: s.ts, v: Calc.derive(s) })).filter((p) => p.v != null);
    const cC = U.courbe(tousCm, { fin: now, mois, couleur: "#F2F3F0", fmt: (v) => String(Math.round(v)), padMin: 3, label: "Ton cœur en sortie facile", vide: "Pas encore de sortie facile au cœur fiable sur la période." });
    const cD = U.courbe(tousDer, { fin: now, mois, couleur: "#F2F3F0", fmt: (v) => `${Math.round(v)} %`, padMin: 1.5, repere: { v: R.repereDerivePct, label: `${R.repereDerivePct} %` }, label: "Dérive cardiaque", vide: "Pas encore de sortie facile de 40 min ou plus sur la période." });
    const ecartBpm = cC.debut != null ? Math.round(cC.debut - cC.fin) : null;
    const sf = fm ? Calc.sortiesFacilesZones(etat.courses, now, fm.valeur, fr) : [], vraies = sf.filter((x) => x.vraiment).length;
    // La valeur en grand = tes 4 dernières semaines = le bout de la courbe (même chiffre des deux côtés).
    const valCm = cC.fin ?? cm.maintenant, valDer = cD.fin ?? der.maintenant;
    return `<section class="carte"><div class="carte-tete"><h2>Temps par zone cardio</h2>${info("coeur")}</div>${zones}</section>
      <section class="carte"><div class="carte-tete"><span class="ta-tete" style="--c:#C6F432;color:var(--text);font-size:16px"><i></i>Ton cœur en sortie facile</span>${info("coeur-facile")}</div>
        ${valCm != null ? `<div style="display:flex;align-items:flex-end;justify-content:space-between">${U.num(Math.round(valCm), "bpm", "n52")}<b class="${ecartBpm == null || Math.abs(ecartBpm) < 2 ? "gris" : ecartBpm > 0 ? "citron" : "violet"}" style="font-size:13.5px">${ecartBpm == null || Math.abs(ecartBpm) < 2 ? `stable ${suffixeCourbe(cC, mois)}` : `${Math.abs(ecartBpm)} bpm ${ecartBpm > 0 ? "de moins" : "de plus"} ${suffixeCourbe(cC, mois)}`}</b></div>` : ""}
        ${cC.svg}<div class="txt2" style="font-size:14.5px">À allure égale, un cœur qui baisse veut dire que tu progresses.</div></section>
      ${derivePossible ? `<section class="carte"><div class="carte-tete"><b style="font-size:16px">Dérive cardiaque</b>${info("derive")}</div>
        ${valDer != null ? `<div style="display:flex;align-items:flex-end;justify-content:space-between">${U.num(Math.round(valDer), "%", "n52")}<b class="${valDer < R.repereDerivePct ? "citron" : "violet"}" style="font-size:13.5px">${valDer < R.repereDerivePct ? `stable · sous ${R.repereDerivePct} %` : `au-dessus de ${R.repereDerivePct} %`}</b></div>` : ""}
        ${cD.svg}<div class="txt2" style="font-size:14.5px">Combien ton cœur monte en fin de sortie facile. Sous ${R.repereDerivePct} % : ton endurance tient.</div></section>` : ""}
      ${detaille ? `<section class="carte"><div class="carte-tete"><h2>${nouveau("Tes sorties faciles")}</h2>${info("sorties-faciles")}</div>
        ${sf.length ? `<div style="display:flex;align-items:center;gap:12px"><span class="num" style="font-size:52px">${vraies}<span style="color:var(--text-3);font-size:30px">/${sf.length}</span></span><span class="txt2" style="font-size:14.5px">vraiment faciles :<br>${R.idealZones["Sortie facile"].minPct} % ou plus en zones 1-2</span></div>
          <div style="display:flex;flex-direction:column;gap:10px">${sf.map((x) => `<div role="link" tabindex="0" data-go="#/sortie/${esc(x.id)}" style="display:grid;grid-template-columns:52px 1fr 44px 16px;align-items:center;gap:10px;font-size:13.5px"><span class="txt2">${esc(U.jourMois(x.ts))}</span>
            <span style="position:relative;height:10px;border-radius:5px;background:var(--control)"><i style="display:block;height:100%;width:${Math.round(x.pct)}%;border-radius:5px;background:${x.vraiment ? "#C6F432" : "#5A6068"}"></i><i style="position:absolute;top:-4px;bottom:-4px;left:${R.idealZones["Sortie facile"].minPct}%;width:2px;background:var(--text)"></i></span>
            <b style="text-align:right">${Math.round(x.pct)} %</b><span class="citron">${x.vraiment ? ic("check", 15, 2.6) : ""}</span></div>`).join("")}</div>
          <div class="cap">Trait blanc = repère ${R.idealZones["Sortie facile"].minPct} %.${sf.length - vraies ? ` ${sf.length - vraies === 1 ? "L'autre est trop montée" : `Les ${sf.length - vraies} autres sont trop montées`} en zone 3.` : ""}</div>`
          : `<div class="txt2">Pas encore de sortie facile au cœur fiable.</div>`}</section>` : ""}
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
    const cad = Calc.indicateurDansLeTemps(etat.courses, now, mois, Calc.cadence);
    const tousCad = etat.courses.filter((s) => s.type === "EF" || s.type === "Long").map((s) => ({ ts: s.ts, v: Calc.cadence(s) })).filter((p) => p.v != null);
    const cC = U.courbe(tousCad, { fin: now, mois, couleur: "#F2F3F0", fmt: (v) => String(Math.round(v)), padMin: 3, repere: { v: R.repereCadence, label: String(R.repereCadence) }, label: "Cadence", vide: "Pas de cadence mesurée sur tes sorties faciles de la période." });
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

  /* =================== Accueil : cartes d'action (fusion, « Vérifions N sorties ») =================== */
  // Fusion d'une saisie à la main avec la course de la montre (chantier 3 de l'ancienne app, choix 7) : même jour, même nature,
  // durée à 15 % près → la course de la montre remplace la saisie et reprend son ressenti, avec un message ; si ce n'est pas
  // clair, on demande « Est-ce la même sortie ? ».
  const pourFusion = () => etat.sorties.map((s) => ({ id: s.id, date: localDateStr(new Date(s.ts)), type: s.type, durationSec: s.dur, manual: s.manuel }));
  async function fusionner(idSaisie, idMontre) {
    const m = etat.sorties.find((x) => String(x.id) === String(idSaisie)), s = etat.sorties.find((x) => String(x.id) === String(idMontre));
    if (!m || !s) return false;
    const patch = mergedRunPatch({ painRatings: m.ratings, notes: m.notes }, { painRatings: s.ratings, notes: s.notes });
    if (Object.keys(patch).length && (await Donnees.majSortie(idMontre, patch)).error) return false;
    if ((await Donnees.supprimerSortie(idSaisie)).error) return false;
    garder(CLES.fusions, [...lire(CLES.fusions, []), { label: U.dateCourte(m.ts) }].slice(-5));
    return true;
  }
  async function fusionnerSaisies() {
    const { auto } = matchManualRuns(pourFusion(), lire(CLES.pasMeme, []));
    let change = false;
    for (const p of auto) if (await fusionner(p.manualId, p.syncedId)) change = true;
    return change;
  }
  function cartesActionHTML() {
    let h = lire(CLES.fusions, []).map((n) => `<div class="verdict-box" style="background:var(--surface)"><span class="vi" style="background:var(--control);color:var(--text)">${ic("actualiser", 14)}</span><span style="flex:1">On a remplacé ta saisie du ${esc(n.label)} par la course reçue d'Apple Santé. Ton ressenti est gardé.</span><button type="button" class="rond petit" data-action="fusions-vues" aria-label="Fermer">${ic("fermer", 14)}</button></div>`).join("");
    const q = matchManualRuns(pourFusion(), lire(CLES.pasMeme, [])).ask[0];
    const m = q && etat.sorties.find((x) => String(x.id) === String(q.manualId)), s = q && etat.sorties.find((x) => String(x.id) === String(q.syncedId));
    if (m && s) {
      const col = (k, x) => `<div class="mt"><span class="l">${esc(k)}</span><b style="font-size:15px">${esc(nomType(libDe(x)))}${x.dist > 0 ? ` · ${U.kmTxt(x.dist)} km` : ""}</b><span class="h">${Math.round(x.dur / 60)} min</span></div>`;
      h += `<section class="carte"><h2>Est-ce la même sortie ?</h2><div class="txt2" style="font-size:14px">Une course est arrivée d'Apple Santé le même jour qu'une sortie saisie à la main.</div>
        <div class="mini deux">${col("Saisie à la main", m)}${col("Apple Santé", s)}</div>
        <div class="champs2"><button type="button" class="btn primaire" data-fusion-oui="${attr(m.id)}|${attr(s.id)}">Oui, garder Apple Santé</button><button type="button" class="btn second" data-fusion-non="${attr(m.id)}|${attr(s.id)}">Non, 2 sorties</button></div></section>`;
    }
    return h;
  }
  // « Vérifions N sorties » (D109, choix 6) : 5 à la fois, une touche par sortie, Tempo et Marche compris. doubtfulRuns parle
  // l'ancien vocabulaire : sa proposition « Seuil » (plus rapide que d'habitude) devient « Tempo », « Course » devient « Compétition ».
  const VERIF_TYPES = ["Sortie facile", "Longue", "Tempo", "Seuil", "Fractionné", "Compétition", "Marche"], SUGGESTION = { Course: "Compétition", Seuil: "Tempo" };
  function verifierHTML() {
    const d = etat.doutes; if (!d.length) return "";
    const items = d.slice(0, 5).map((x) => {
      const s = etat.sorties.find((y) => String(y.id) === String(x.id)); if (!s) return "";
      const pourquoi = x.reason === "courte" ? "Très courte : un échauffement, ou une sortie interrompue ?" : `Plus rapide que d'habitude (${fmtKmPace(Math.round(x.refPace))}/km)${x.race ? ", sur une distance de course" : ""}.`;
      const sugg = SUGGESTION[x.suggestion] || null;
      return `<div class="verif"><div class="carte-tete" style="font-size:14px"><b>${esc(U.dateCourte(s.ts))}</b><span class="cap">${U.kmTxt(s.dist)} km · ${U.allure(s.allure)}/km</span></div>
        <div class="cap">${esc(pourquoi)} Classée en « ${esc(nomType(libDe(s)))} ».</div>
        <div class="puces-choix">${VERIF_TYPES.map((t) => `<button type="button" data-verifier="${attr(s.id)}|${attr(t)}" class="${t === sugg ? "propose" : ""}" style="--c:${U.couleurType(t)}"><i></i>${esc(nomType(t))}</button>`).join("")}</div></div>`;
    }).join("");
    return `<section class="carte"><span class="sur">Tes données</span><h2>Vérifions ${d.length} sortie${d.length > 1 ? "s" : ""}</h2>
      <div class="txt2" style="font-size:14px">L'app hésite sur leur type. Une touche par sortie : tes records et tes courbes resteront justes.</div>${items}
      ${d.length > 5 ? `<div class="cap">Encore ${d.length - 5} après celles-ci.</div>` : ""}</section>`;
  }

  /* =================== Profil (7) =================== */
  const MONTRES = ["Apple Watch", "Garmin", "Whoop", "Strava", "Autre"];
  const AIDE_MONTRE = { "Apple Watch": "Avec une Apple Watch, on reçoit ton cœur seconde par seconde et ton allure détaillée : bilan complet.",
    Garmin: "Avec une Garmin, Apple Santé ne reçoit ton cœur que toutes les 2 min et ton allure toutes les 10 min environ : ton bilan s'appuie sur ton cœur moyen et ton ressenti. Active l'envoi vers Apple Santé dans Garmin Connect.",
    Whoop: "Active l'envoi vers Apple Santé dans l'app Whoop. Le bracelet n'a pas de GPS : enregistre tes courses avec le GPS du téléphone pour avoir la distance.",
    Strava: "Active l'envoi vers Apple Santé dans Strava : Strava n'y envoie que le résumé de tes sorties (ni cœur détaillé, ni allure par km)." };
  // Ta montre (choix 12) : celle déclarée dans le compte (goals.equipement, comme l'ancienne app), sinon devinée d'après le cœur.
  function montreInfo() {
    const der = etat.sorties.filter((s) => !s.manuel).slice(-1)[0], liste = goalsEquip().split(",").map((x) => x.trim()).filter(Boolean);
    const declaree = liste.find((x) => MONTRES.includes(x)) || (liste.includes("Aucun") ? "Pas de montre" : null);
    const devinee = etat.courses.length ? (etat.courses.slice(-3).some((s) => Calc.coeurFiable(s)) ? "Apple Watch" : "Garmin") : "Apple Watch";
    return { nom: declaree || devinee, declaree: !!declaree, connectee: !!der && maintenant() - der.ts < 14 * JOUR, der };
  }
  function profilHTML() {
    const z = etat.zones, prof = z && z.niveau, fm = fcMax(), o = objectif(), m = montreInfo(), pseudo = (etat.profil && etat.profil.pseudo) || "";
    const rangee = (cle, icone, nom, val) => `<button type="button" class="rangee" data-go="#/profil/${cle}"><span class="ic">${ic(icone, 17)}</span><b>${esc(nom)}</b><span class="val">${esc(val)}</span><span style="color:var(--faint)">${ic("chevron", 16)}</span></button>`;
    return `<header class="tete">${pseudo ? `<div class="sur">${esc(pseudo)}</div>` : ""}<h1>Profil</h1></header>
      <section class="carte" role="link" tabindex="0" data-go="#/profil/montre" style="gap:10px"><div style="display:flex;align-items:center;gap:12px"><span class="ic" style="width:40px;height:40px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center">${ic("montre", 20)}</span>
        <div style="flex:1"><b style="font-size:16px">Ta montre</b><div class="txt2" style="font-size:14px;display:flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${m.connectee ? "var(--accent)" : "var(--faint)"}"></i>${esc(m.nom)} · ${m.connectee ? "connectée" : "pas de sortie récente"}</div></div><span style="color:var(--faint)">${ic("chevron", 16)}</span></div>
        ${m.der ? `<div class="cap">Dernière sortie reçue : ${esc(U.relatif(m.der.ts, maintenant()))}, ${esc(U.heureTxt(m.der.ts))}</div>` : ""}</section>
      <div class="groupe">${rangee("chrono", "drapeau", "Ton chrono", prof ? `${Calc.kmTxt(prof.distanceKm * 1000)} km · ${fmtDur(prof.timeSec)}` : "à renseigner")}${rangee("coeur", "coeur", "Ton cœur", fm ? `FC max ${fm.valeur}` : "à renseigner")}${rangee("objectif", "cible", "Ton objectif", o ? o.label : "aucun")}</div>
      <div class="groupe">${rangee("compte", "profil", "Ton compte", "e-mail, mot de passe")}${rangee("donnees", "donnees", "Tes données", "télécharger, supprimer")}</div>
      <button type="button" class="btn second" data-action="deconnexion">Se déconnecter</button>`;
  }
  const DIST_COURSE = ["5km", "10km", "15km", "Semi", "Marathon"];
  const nomCourse = (d) => (RACE_LABELS[d] === "Semi-marathon" ? "Semi" : RACE_LABELS[d] || d);
  let mdp = null;   // changer son mot de passe depuis Ton compte : { etape: "envoi"|"code", code, mdp, erreur, occupe }
  function profilPage(page) {
    const fm = fcMax(), fr = fcRepos(), defs = defsZones(), z = etat.zones, prof = z && z.niveau, m = montreInfo(), o = objectif(), p = etat.profil || {};
    const haut = (titre, sous, retour) => `${retourLigne("Profil", retour || "#/profil")}<h1 style="margin-top:4px">${esc(titre)}</h1>${sous ? `<div class="txt2" style="margin-top:-4px">${esc(sous)}</div>` : ""}`;
    const plageZ = (d, i) => (i === 0 ? `jusqu'à ${d.max}` : i === 4 ? `plus de ${defs[3].max}` : `${defs[i - 1].max + 1} à ${d.max}`);
    if (page === "montre") {
      const recues = recuesDansEtat() > 0;
      return `${haut("Ta montre")}<section class="carte" style="gap:0"><div class="carte-tete" style="padding-bottom:10px"><b style="display:flex;align-items:center;gap:8px"><i style="width:9px;height:9px;border-radius:50%;background:${m.connectee ? "var(--accent)" : "var(--faint)"}"></i>${m.connectee ? "Connectée" : "Pas de sortie récente"}</b><span class="cap">via Apple Santé</span></div>
        <div class="kv"><span>Dernière sortie reçue</span><b>${m.der ? esc(`${U.relatif(m.der.ts, maintenant())}, ${U.heureTxt(m.der.ts)}`) : "—"}</b></div>
        <div class="kv"><label for="pSync" style="color:var(--text-2)">Importer depuis</label><input id="pSync" class="date-kv" type="date" max="${aujourdhuiIso()}" value="${attr(String(p.sync_since_date || "").slice(0, 10))}" data-profil-champ="sync_since_date"></div>
        <div class="cap">RunSync récupère tes sorties à partir de cette date.</div>
        ${recues ? `<button type="button" class="btn primaire" style="margin-top:12px" data-action="ouvrir-runsync">Ouvrir RunSync ${ic("externe", 16, 2.4)}</button><div class="cap" style="margin-top:10px">RunSync envoie tout de suite tes dernières sorties. Pratique juste après une course.</div>`
          : `<button type="button" class="btn primaire" style="margin-top:12px" data-go="#/guide">Connecter Apple Santé</button>`}</section>
        <section class="carte"><span class="sur">Ta montre</span><div class="puces-choix">${MONTRES.map((x) => `<button type="button" data-montre="${attr(x)}" class="${m.declaree && m.nom === x ? "actif" : ""}">${esc(x)}</button>`).join("")}</div>
          <div class="txt2" style="font-size:14px">${esc(AIDE_MONTRE[m.nom] || "Si elle envoie tes sorties à Apple Santé, RunSync les récupère.")}</div></section>
        <div class="groupe"><button type="button" class="rangee" data-go="#/guide"><b>Revoir le guide de connexion</b><span style="color:var(--faint)">${ic("chevron", 16)}</span></button></div>`;
    }
    if (page === "coeur") return `${haut("Ton cœur", "Tes zones viennent de ces deux chiffres.")}
      <section class="carte"><div class="champs2"><div class="champ"><label for="pFcMax">FC max</label><div class="avec-u"><input id="pFcMax" inputmode="numeric" placeholder="${fm ? fm.valeur : "—"}" value="${attr(p.max_hr || "")}" data-profil-champ="max_hr"><em>bpm</em></div></div>
        <div class="champ"><label for="pFcRepos">FC de repos</label><div class="avec-u"><input id="pFcRepos" inputmode="numeric" placeholder="—" value="${attr(p.resting_hr || "")}" data-profil-champ="resting_hr"><em>bpm</em></div></div></div>
        <div class="cap">${fm ? `Zones calculées avec une FC max de ${fm.valeur} (${esc(fm.source)}). ` : ""}FC max vide : on l'estime d'après ton âge.</div></section>
      ${defs ? `<section class="carte" style="gap:0"><span class="sur" style="padding-bottom:6px">Tes zones cardio</span>${defs.map((d, i) => `<div class="kv"><span><i class="pt" style="background:${U.couleurZone(i)}"></i>Zone ${i + 1} · ${esc(R.zonesCardioEffort[i])}</span><b>${plageZ(d, i)} <small class="cap">bpm</small></b></div>`).join("")}</section>` : ""}`;
    if (page === "chrono") return `${haut("Ton chrono", "Sert à classer tes sorties quand le cœur manque.")}
      <section class="carte"><span class="sur">Ton chrono de référence</span>${prof ? `<div>${U.num(fmtDur(prof.timeSec), "", "n52")} <span class="txt2">sur ${Calc.kmTxt(prof.distanceKm * 1000)} km</span></div><div class="cap">${esc(prof.date ? `Déclaré le ${isoToFr(prof.date)}` : "Date non renseignée")}</div>` : `<div class="txt2">Pas de chrono : les zones sont estimées d'après tes sorties faciles.</div>`}</section>
      ${z ? `<section class="carte" style="gap:0"><span class="sur" style="padding-bottom:6px">Tes zones d'allure</span>${Calc.zonesLibelles(z).map((x) => `<div class="kv"><span><i class="pt" style="background:${x.couleur}"></i>${esc(x.nom)}</span><b>${esc(x.plage)}</b></div>`).join("")}</section>` : ""}
      <div class="sur" style="padding:6px 2px 0">Mettre à jour</div><div class="groupe"><button type="button" class="rangee" data-go="#/profil/chrono-saisie"><span style="flex:1"><b style="display:block">Je connais un chrono récent</b><span class="cap">distance, temps, date</span></span>${ic("chevron", 16)}</button><button type="button" class="rangee" data-feuille="sans-chrono"><span style="flex:1"><b style="display:block">Je ne sais pas</b><span class="cap">zones estimées d'après tes sorties faciles</span></span>${ic("chevron", 16)}</button></div>`;
    if (page === "chrono-saisie") {
      const ps = p.program_settings || {}, sel = etat.chronoDist || DIST_COURSE.find((d) => Math.abs(KM_COURSE[d] - Number(ps.refDistanceKm)) < 0.05) || "10km";
      return `${haut("Ton chrono", "Un effort à fond de moins de 6 mois : une course, ou un chrono sur l'une de ces distances.", "#/profil/chrono")}
        <section class="carte"><div class="champ"><span class="lab">Distance</span><div class="puces-choix">${DIST_COURSE.map((d) => `<button type="button" data-chrono-dist="${d}" class="${sel === d ? "actif" : ""}">${esc(nomCourse(d))}</button>`).join("")}</div></div>
          <div class="champs2"><div class="champ"><label for="cTemps">Temps</label><input id="cTemps" inputmode="numeric" placeholder="52:30" value="${attr(ps.refTimeSec && ps.refSource === "chrono" ? fmtDur(ps.refTimeSec) : "")}"></div><div class="champ"><label for="cDate">Date</label><input id="cDate" type="date" max="${aujourdhuiIso()}" value="${attr(ps.refSource === "chrono" ? ps.refDate || "" : "")}"></div></div>
          <div class="erreur" id="cErreur" role="alert"></div></section>
        <button type="button" class="btn primaire" data-action="enregistrer-chrono">Enregistrer</button>`;
    }
    if (page === "objectif") {
      const d = etat.objDist || (o && o.distance) || "10km";
      return `${haut("Ton objectif", "Facultatif. Il sert de repère dans Progression.")}
        <section class="carte"><div class="champ"><span class="lab">Distance</span><div class="puces-choix">${DIST_COURSE.map((x) => `<button type="button" data-obj-dist="${x}" class="${d === x ? "actif" : ""}">${esc(nomCourse(x))}</button>`).join("")}</div></div>
          <div class="champs2"><div class="champ"><label for="oTemps">En moins de · facultatif</label><input id="oTemps" inputmode="numeric" placeholder="55:00" value="${o && o.tempsSec ? attr(fmtDur(o.tempsSec)) : ""}"></div><div class="champ"><label for="oDate">Date · facultatif</label><input id="oDate" type="date" value="${o && o.date ? attr(o.date) : ""}"></div></div>
          <div class="mt" style="flex-direction:row;align-items:center;justify-content:space-between"><span class="txt2">Allure visée</span>${U.num(o && o.allure ? fmtKmPace(o.allure) : "—", "/km", "citron")}</div>
          <div class="erreur" id="oErreur" role="alert"></div></section>
        <button type="button" class="btn primaire" data-action="enregistrer-objectif">Enregistrer</button>${o ? `<button type="button" class="btn-texte" data-action="retirer-objectif">Retirer mon objectif</button>` : ""}`;
    }
    if (page === "compte") return `${haut("Ton compte")}<section class="carte"><div class="champ"><span class="lab">E-mail</span><b>${esc(etat.email || "—")}</b></div>
        <div class="champ"><label for="pPseudo">Prénom ou pseudo</label><input id="pPseudo" autocomplete="nickname" value="${attr(p.pseudo || "")}" data-profil-champ="pseudo"></div>
        <div class="champ"><label for="pAge">Âge</label><div class="avec-u"><input id="pAge" inputmode="numeric" value="${attr(p.age || "")}" data-profil-champ="age"><em>ans</em></div></div><div class="cap">Chaque champ s'enregistre tout seul. L'âge sert à estimer ta FC max.</div></section>
      <section class="carte"><h2>Mot de passe</h2><div class="txt2" style="font-size:14px">On t'envoie un code à ton adresse e-mail, puis tu choisis le nouveau mot de passe.</div><button type="button" class="btn primaire" data-go="#/profil/mdp">Changer mon mot de passe</button></section>`;
    if (page === "mdp") {
      const st = mdp || (mdp = { etape: "envoi", code: "", mdp: "", erreur: "", occupe: false }), dis = st.occupe ? " disabled" : "";
      return `${haut("Mot de passe", "", "#/profil/compte")}<section class="carte">${st.etape === "envoi"
        ? `<div class="txt2">On envoie un code à <b>${esc(etat.email)}</b>.</div><div class="erreur" role="alert">${esc(st.erreur)}</div><button type="button" class="btn primaire" data-action="mdp-envoyer"${dis}>${st.occupe ? "Envoi…" : "Recevoir un code"}</button>`
        : `<div class="txt2">Recopie le code reçu à <b>${esc(etat.email)}</b>, puis choisis ton nouveau mot de passe.</div>
          <div class="champ"><label for="mCode">Code reçu par e-mail</label><input id="mCode" class="code" inputmode="numeric" maxlength="10" autocomplete="one-time-code" placeholder="······" value="${attr(st.code)}" data-mdp-champ="code"></div>
          <div class="champ"><label for="mMdp">Nouveau mot de passe</label><input id="mMdp" type="password" autocomplete="new-password" value="${attr(st.mdp)}" data-mdp-champ="mdp"></div><div class="cap">6 caractères minimum.</div>
          <div class="erreur" role="alert">${esc(st.erreur)}</div><button type="button" class="btn primaire" data-action="mdp-changer"${dis}>${st.occupe ? "Un instant…" : "Changer le mot de passe"}</button>`}</section>`;
    }
    if (page === "donnees") return `${haut("Tes données", "Ton profil, tes sorties avec ton cœur et ton allure, tes ressentis. Personne d'autre ne les voit.")}
      <div class="groupe"><button type="button" class="rangee" data-action="telecharger-tout"><b>Télécharger toutes mes données</b>${ic("telecharger", 17)}</button><button type="button" class="rangee" data-action="telecharger-csv"><b>Mes sorties en tableau (CSV)</b>${ic("telecharger", 17)}</button><button type="button" class="rangee" data-feuille="confidentialite"><b>Lire la page Confidentialité</b>${ic("chevron", 16)}</button></div>
      <button type="button" class="btn violet" data-feuille="supprimer">Retirer mon accord et supprimer mon compte</button>`;
    return profilHTML();
  }
  // Champs du profil qui s'enregistrent tout seuls (Ton compte, Ton cœur, Ta montre).
  function enregistrerChampProfil(el) {
    const cle = el.getAttribute("data-profil-champ"), brut = String(el.value).trim();
    const nombre = (min, max, msg) => { if (!brut) return null; const n = Number(brut.replace(",", ".")); if (!(n >= min && n <= max)) { U.toast(msg); return undefined; } return Math.round(n); };
    let v;
    if (cle === "pseudo") v = brut || null;
    else if (cle === "age") v = nombre(10, 99, "Indique un âge entre 10 et 99 ans.");
    else if (cle === "max_hr") v = nombre(120, 230, "Ta FC max doit être entre 120 et 230.");
    else if (cle === "resting_hr") v = nombre(30, 110, "Ta FC de repos doit être entre 30 et 110.");
    else if (cle === "sync_since_date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return; v = brut; }
    if (v === undefined) { rendre(true); return; }
    const champs = { [cle]: v };
    if (cle === "resting_hr") Object.assign(champs, { resting_hr_is_manual: v != null, resting_hr_updated_at: new Date().toISOString() });
    majProfil(champs, "Enregistré.").then(() => rendre(true));
  }
  async function enregistrerChrono() {
    const dist = etat.chronoDist || (document.querySelector("[data-chrono-dist].actif") || {}).getAttribute?.("data-chrono-dist") || "10km";
    const sec = enSecondes(document.getElementById("cTemps").value), date = document.getElementById("cDate").value, err = (t) => { document.getElementById("cErreur").textContent = t; };
    const km = KM_COURSE[dist], allure = sec && km ? sec / km : 0;
    if (!sec || allure < 150 || allure > 720) return err("Indique ton temps, par exemple 52:30 (ou 1:52:30).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > aujourdhuiIso()) return err("Indique la date de ce chrono.");
    if (!isLevelDateFresh(date, aujourdhuiIso())) return err("Ce chrono date de plus de 6 mois : il ne reflète plus ton niveau. Garde plutôt « Je ne sais pas ».");
    const ps = { ...((etat.profil && etat.profil.program_settings) || {}), refDistanceKm: km, refTimeSec: sec, refDate: date, refSource: "chrono", refDateApprox: false };
    if (await majProfil({ program_settings: ps }, "Chrono enregistré : tes zones d'allure sont recalculées.")) { etat.chronoDist = null; location.hash = "#/profil/chrono"; }
  }
  async function retirerChrono() {
    const ps = { ...((etat.profil && etat.profil.program_settings) || {}), refDistanceKm: null, refTimeSec: null, refDate: null, refSource: null };
    fermerCalque();
    if (await majProfil({ program_settings: ps }, "Chrono retiré : tes zones sont estimées d'après tes sorties faciles.")) rendre(true);
  }
  // Ton objectif (choix 10) : goals.principal seulement ; l'objectif secondaire éventuel reste dans la base, sans être montré.
  async function enregistrerObjectif() {
    const dist = etat.objDist || (objectif() && objectif().distance) || "10km", tTxt = document.getElementById("oTemps").value.trim(), date = document.getElementById("oDate").value || "";
    const sec = tTxt ? enSecondes(tTxt) : null;
    if (tTxt && !sec) { document.getElementById("oErreur").textContent = "Indique ton temps visé, par exemple 55:00 (ou 1:55:00)."; return; }
    const ancien = (etat.profil && etat.profil.goals && etat.profil.goals.principal) || {};
    const principal = { ...(ancien.objectifPrincipal === "Préparer une course" ? ancien : {}), objectifPrincipal: "Préparer une course", distanceCourse: dist, dateCible: date, objectifChrono: sec ? "Viser un chrono" : "Juste finir", tempsViseSec: sec || "" };
    if (await majGoals({ principal }, "Objectif enregistré.")) { etat.objDist = null; rendre(true); }
  }
  async function mdpEnvoyer() {
    mdp.occupe = true; mdp.erreur = ""; rendre(true);
    const { error } = await Donnees.motDePasseOublie(etat.email);
    mdp.occupe = false;
    if (error) mdp.erreur = authErrorInfo(error).text; else mdp.etape = "code";
    rendre(true);
  }
  async function mdpChanger() {
    if (!otpComplete(mdp.code)) { mdp.erreur = "Entre le code reçu par e-mail."; return rendre(true); }
    if (mdp.mdp.length < 6) { mdp.erreur = "Choisis un mot de passe d'au moins 6 caractères."; return rendre(true); }
    mdp.occupe = true; mdp.erreur = ""; rendre(true);
    const v = await Donnees.verifierCode(etat.email, mdp.code, "recovery");
    const u = v.error ? v : await Donnees.changerMotDePasse(mdp.mdp);
    mdp.occupe = false;
    if (u.error) { mdp.erreur = authErrorInfo(u.error).text; return rendre(true); }
    mdp = null; U.toast("Mot de passe changé."); location.hash = "#/profil/compte";
  }
  // Tes données (A3) : un fichier JSON relu en base au moment du clic, ou tes sorties en tableau.
  function telecharger(blob, nom) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  async function telechargerTout() {
    const r = await Donnees.exporter();
    if (r.error || !r.data) { U.toast("Pas pu préparer le fichier, vérifie ta connexion."); return; }
    telecharger(new Blob([JSON.stringify(myDataExport({ email: etat.email, profile: r.data.profile, runs: r.data.runs, planned: r.data.planned, exportedAt: new Date().toISOString() }), null, 2)], { type: "application/json" }), MY_DATA_FILENAME);
    U.toast("Fichier téléchargé.");
  }
  function telechargerCsv() {
    const tetes = ["date", "type", "distance_km", "duree", "allure_min_km", "fc_moyenne", "fc_max", "cadence", "ressenti"];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lignes = etat.sorties.map((s) => [new Date(s.ts).toISOString(), libDe(s), s.dist || "", fmtDur(s.dur), s.allure ? fmtKmPace(s.allure) : "", s.fc ? Math.round(s.fc) : "", s.fcMax ? Math.round(s.fcMax) : "", s.cad ? Math.round(s.cad) : "", s.rpe == null ? "" : s.rpe]);
    telecharger(new Blob([[tetes, ...lignes].map((l) => l.map(q).join(",")).join("\n")], { type: "text/csv" }), `mes-sorties-myrunningapp-${aujourdhuiIso()}.csv`);
  }
  // Retirer son accord et supprimer son compte (A3) : delete_my_account, puis on vide ce téléphone.
  async function supprimerCompte(bouton) {
    bouton.disabled = true; bouton.textContent = "Suppression…";
    const { error } = await Donnees.supprimerCompte();
    fermerCalque();
    if (error) { U.toast("Pas pu supprimer ton compte. Vérifie ta connexion et réessaie."); return; }
    try { Object.keys(localStorage).filter((k) => k.startsWith("mra_") && k !== CLES.installer).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* rien à vider */ }
    await Donnees.deconnexion();
    reinitialiser(); auth.info = "Ton compte et toutes tes données ont été supprimés."; rendre();
  }
  function reinitialiser() {
    fermerGuide(); mdp = null; brouillon = null;
    Object.assign(etat, { session: null, email: "", userId: "", profil: null, brutes: [], pret: false, pp: null, ppMontre: null, accord: { coche: false, occupe: false, refus: false } });
    recalculer();
    Object.assign(auth, { etape: "connexion", email: "", mdp: "", code: "", info: "", erreur: "", occupe: false, envoyeA: 0, verifie: false, installer: false });
    history.replaceState(null, "", "#/accueil");
  }

  /* =================== Feuilles (i, type, ressenti, suppressions, confidentialité, nouveautés) =================== */
  const INFOS = {
    bilan: ["Comment on fait ton bilan", "On compare ton cœur sur les passages à la même allure, sur tes 6 dernières semaines (12 s'il le faut). Sans cœur fiable : ton allure et ton ressenti. Rien à comparer : la sortie devient ton point de départ."],
    coeur: ["Tes zones cardio", null],
    "allure-facile": ["Ton allure facile", "Chaque sortie facile est ramenée à ton cœur habituel en facile : on voit si tu cours plus vite pour le même effort. La valeur : tes 4 dernières semaines. La courbe : un point par mois (par semaine sur 3 mois) sur la période choisie, pointillé = ton point de départ."],
    efforts: ["Tes allures par effort", "L'allure que tu tiens quand ton cœur est en zone 3 (Tempo) ou 4 (Seuil), même au milieu d'une sortie. Fractionné : l'allure de tes blocs d'effort."],
    croisements: ["Les croisements", "Allure × régularité : ton allure facile les semaines où tu cours 2 fois ou plus, face aux semaines à une sortie. Allure × ressenti : comment tu ressens tes sorties faciles, d'un mois à l'autre."],
    "coeur-facile": ["Ton cœur en sortie facile", "Le cœur moyen de tes sorties faciles au cœur fiable. Courbe : un point par mois (par semaine sur 3 mois)."],
    derive: ["La dérive cardiaque", "De combien ton cœur monte entre la 1re et la 2e moitié d'une sortie facile d'au moins 40 min à allure régulière. Sous 5 % : ton endurance tient."],
    "sorties-faciles": ["Tes sorties faciles", `Tes 6 dernières sorties faciles au cœur fiable, et la part de leur temps en zones 1-2. Vraiment facile : ${R.idealZones["Sortie facile"].minPct} % ou plus.`],
    repos: ["Ton cœur au repos", "La valeur de ton profil (Profil › Ton cœur). Bientôt lue chaque matin sur ta montre, avec une prochaine version de RunSync."],
    cadence: ["Ta cadence", `Le nombre de pas par minute sur tes sorties faciles. Repère : ${R.repereCadence}.`],
    records: ["Tes records", "Temps ramené à la distance exacte, sur tes courses de 5, 10, 15 km, semi et marathon. Max : ta sortie la plus longue."],
    "sans-chrono": ["Pas de chrono récent ?", "Pas de souci : sans chrono, tes zones d'allure sont estimées d'après tes sorties faciles. Ajoute un chrono quand tu en auras un, après une course par exemple."],
  };
  // Annonce de la V2 (choix 14) : une fois par appareil, pour les comptes qui existaient avant ; un compte neuf l'a déjà « vue »
  // à la fin de ses premiers pas. Textes à relire par Omar.
  const NOUVEAUTES_ID = "v2-2026-11";
  const nouveautesAMontrer = () => !etat.profilErreur && shouldShowNews(etat.profil && etat.profil.onboarding_completed_at, false, lire(CLES.nouveautes, []), NOUVEAUTES_ID, "2999-12-31");
  const NOUVEAUTES = [["accueil", "Ton niveau en un coup d'œil : tes allures facile, tempo, seuil et fractionné, et comment elles évoluent."],
    ["eclat", "Après chaque course, ton bilan : plus facile ou plus dure que d'habitude, et ton cœur zone par zone."],
    ["progression", "Progression : ton allure, ton cœur et ton volume sur 3 à 12 mois."],
    ["cible", "Le programme d'entraînement disparaît : l'app se concentre sur ta progression. Tes anciennes séances restent enregistrées."],
    ["coeur", "Après une course, une seule question : ton ressenti."],
    ["montre", "Nouveau dans Profil : « Ta montre », pour voir si tes sorties arrivent bien."]];
  let confidentialite = null;
  async function chargerConfidentialite() {
    try {
      const r = await fetch("confidentialite.html", { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status));
      const doc = new DOMParser().parseFromString(await r.text(), "text/html"), art = doc.getElementById("privacy-text"), upd = doc.querySelector(".upd");
      if (!art) throw new Error("texte introuvable");
      confidentialite = `${upd ? `<div class="cap">${esc(upd.textContent)}</div>` : ""}${art.innerHTML}`;
    } catch (e) { confidentialite = null; }
    const el = document.getElementById("texteLegal");
    if (el) el.innerHTML = confidentialite || "<p>Pas pu charger la page. Vérifie ta connexion et réessaie.</p>";
  }
  function feuille(cle, id) {
    const calque = document.getElementById("calque");
    const fermer = `<button type="button" class="rond petit" data-fermer-calque aria-label="Fermer">${ic("fermer", 16)}</button>`;
    const fenetre = (titre, corps, boutons) => { calque.innerHTML = `<div class="voile centre" data-voile><div class="fenetre" role="dialog" aria-modal="true" aria-label="${attr(titre)}"><h2>${esc(titre)}</h2>${corps}<div class="champs2"><button type="button" class="btn second" data-fermer-calque>Annuler</button>${boutons}</div></div></div>`; };
    let html;
    if (INFOS[cle]) {
      let [titre, txt] = INFOS[cle];
      if (cle === "coeur") { const fm = fcMax(), fr = fcRepos(); txt = fm ? `Zones calculées avec une FC max de ${fm.valeur} (${fm.source})${fr ? ` et une FC de repos de ${fr}` : ""}. Zone 1 Récup, 2 Facile, 3 Tempo, 4 Seuil, 5 Fractionné.` : "Renseigne ta FC max ou ton âge pour calculer tes zones."; }
      const plus = cle === "sans-chrono" && etat.zones && etat.zones.niveau ? `<button type="button" class="btn violet" data-action="retirer-chrono">Retirer mon chrono</button>` : "";
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>${esc(titre)}</h2>${fermer}</div><div class="txt2">${esc(txt)}</div>${plus}</div>`;
    } else if (cle === "type") {
      const s = etat.sorties.find((x) => String(x.id) === String(id)); if (!s) return;
      const actuel = libDe(s), lib = LIB_TYPE[actuel] || actuel;
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>Change le type</h2>${fermer}</div><div class="txt2">${s.typeVerifie ? `Tu l'as classée en « ${esc(nomType(lib))} ».` : `On l'a classée en « ${esc(nomType(lib))} »${Calc.coeurFiable(s) ? " d'après ton cœur" : ""}.`} Ton bilan se recalcule si tu changes.</div>
        <div class="carte" style="gap:0;padding:4px 14px">${TYPES_COURSE.concat(TYPES_AUTRES).map((t) => `<button type="button" class="choix" data-type-choix="${attr(t)}" data-id="${attr(s.id)}"><i style="width:9px;height:9px;border-radius:50%;background:${U.couleurType(t)}"></i><b>${esc(nomType(t))}${TYPES_AUTRES.includes(t) ? " (pas une course)" : ""}</b><span class="coche${lib === t ? " on" : ""}">${lib === t ? ic("check", 13, 3) : ""}</span></button>`).join("")}</div></div>`;
    } else if (cle === "ressenti") {
      const s = etat.sorties.find((x) => String(x.id) === String(id)); if (!s) return;
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>Comment tu l'as sentie ?</h2>${fermer}</div>${U.crans(Calc.ressentiDe(s, etat.ressentis), `data-sortie="${attr(s.id)}"`)}<button type="button" class="btn primaire" data-fermer-calque>Fermer</button></div>`;
    } else if (cle === "menu-sortie") {
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>Cette sortie</h2>${fermer}</div><button type="button" class="btn violet" data-feuille="supprimer-sortie" data-id="${attr(id)}">Supprimer cette sortie</button><div class="cap">Pour corriger une saisie à la main : supprime-la, puis ressaisis-la.</div></div>`;
    } else if (cle === "supprimer-sortie") {
      return fenetre("Supprimer cette sortie ?", `<div class="txt2" style="font-size:14.5px">Elle disparaît de tes sorties, de ton bilan et de tes courbes. Ce n'est pas réversible.</div>`, `<button type="button" class="btn violet" data-action="supprimer-sortie" data-id="${attr(id)}">Supprimer</button>`);
    } else if (cle === "supprimer") {
      return fenetre("Supprimer ton compte ?", `<div class="txt2" style="font-size:14.5px">Ton profil, tes sorties et tes ressentis seront effacés tout de suite, et de nos sauvegardes sous 30 jours. Ce n'est pas réversible.</div><div class="txt2" style="font-size:14.5px">Pense aussi à supprimer RunSync de ton iPhone.</div>`, `<button type="button" class="btn violet" data-action="supprimer-compte">Supprimer</button>`);
    } else if (cle === "confidentialite") {
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>Confidentialité</h2>${fermer}</div><div class="texte-legal" id="texteLegal">${confidentialite || "<p>Chargement…</p>"}</div></div>`;
      if (!confidentialite) setTimeout(chargerConfidentialite, 0);
    } else if (cle === "nouveautes") {
      garder(CLES.nouveautes, [...new Set([...lire(CLES.nouveautes, []), NOUVEAUTES_ID])]);
      html = `<div class="feuille"><div class="poignee"></div><div class="carte-tete"><h2>La nouvelle MyRunningApp</h2>${fermer}</div>
        ${NOUVEAUTES.map(([i, t]) => `<div style="display:flex;gap:12px;align-items:flex-start" class="txt2"><span class="citron" style="margin-top:1px">${ic(i, 18)}</span><span>${esc(t)}</span></div>`).join("")}
        <button type="button" class="btn primaire" data-fermer-calque>C'est parti</button></div>`;
    } else return;
    calque.innerHTML = `<div class="voile" data-voile>${html}</div>`;
  }
  const fermerCalque = () => { document.getElementById("calque").innerHTML = ""; };
  const LIB_TYPE = { Other: "Autre" };

  /* =================== Navigation =================== */
  const ONGLETS = [["accueil", "Accueil"], ["progression", "Progression"], ["sorties", "Sorties"], ["profil", "Profil"]];
  const erreurHTML = () => `<div class="pp" style="justify-content:center;text-align:center;align-items:center"><span style="color:var(--muted)">${ic("horsLigne", 40)}</span><h1>Impossible de charger tes sorties</h1><div class="txt2">Vérifie ta connexion, puis réessaie.</div><div style="width:100%"><button type="button" class="btn primaire" data-action="reessayer">Réessayer</button></div></div>`;
  function rendre(garderDefilement) {
    const app = document.getElementById("app"), nav = document.getElementById("onglets"), y = window.scrollY;
    document.body.classList.remove("feuille-ouverte"); app.classList.remove("plein");
    const pleinEcran = (html) => { nav.classList.add("cache"); app.classList.add("plein"); app.innerHTML = html; if (garderDefilement) window.scrollTo(0, y); };
    if (!etat.session) { pleinEcran(auth.installer ? installHTML() : authHTML()); if (!auth.installer) apresAuth(); return; }
    if (!etat.pret) { nav.classList.add("cache"); app.innerHTML = etat.erreurChargement ? erreurHTML() : chargementHTML(); return; }
    if (accordManquant()) { pleinEcran(accordHTML()); return; }
    if (premiersPasEnCours()) { pleinEcran(premiersPasHTML()); return; }
    let [, vue, id, ancre] = (location.hash || "#/accueil").split("/");
    if (vue === "verdict") vue = "bilan";   // ancienne adresse
    const s = id && ["sortie", "bilan", "record"].includes(vue) ? etat.sorties.find((x) => String(x.id) === decodeURIComponent(id)) : null;
    const plein = ["bilan", "sortie", "record", "ajouter", "guide", "pret"].includes(vue);
    nav.classList.toggle("cache", plein); app.classList.toggle("plein", plein);
    const actif = ONGLETS.some(([k]) => k === vue) ? vue : "accueil";
    nav.innerHTML = ONGLETS.map(([k, l]) => `<button type="button" data-go="#/${k}" class="${actif === k ? "actif" : ""}"${actif === k ? ' aria-current="page"' : ""}>${ic(k, 21)}${l}</button>`).join("");
    let html;
    if (vue === "bilan" && s) { document.body.classList.add("feuille-ouverte"); html = bilanHTML(s); }
    else if (vue === "record" && s) html = recordHTML(s) || bilanHTML(s);
    else if (vue === "sortie" && s) html = detailHTML(s);
    else if (vue === "sorties") html = sortiesHTML();
    else if (vue === "ajouter") { document.body.classList.add("feuille-ouverte"); html = ajouterHTML(); }
    else if (vue === "progression") html = progressionHTML(id, ancre);
    else if (vue === "profil") html = id ? profilPage(id) : profilHTML();
    else if (vue === "guide") html = guideHTML(false);
    else if (vue === "pret") html = pretHTML();
    else html = accueilHTML();
    app.innerHTML = html;
    window.scrollTo(0, garderDefilement ? y : 0);
    const cible = vue === "progression" && ancre && !garderDefilement ? document.getElementById(`graphe-${ancre}`) : null;
    if (cible) cible.scrollIntoView({ block: "start" });
  }

  /* =================== Gestes =================== */
  const paire = (v) => String(v || "").split("|");
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-fermer-calque]") || (t.matches && t.matches("[data-voile]"))) { fermerCalque(); return; }
    const r = t.closest("[data-retour]"); if (r) { if (history.length > 1) history.back(); else location.hash = "#/accueil"; return; }
    const cr = t.closest("[data-cran]");
    if (cr) {
      const n = Number(cr.getAttribute("data-cran"));
      if (cr.hasAttribute("data-ajout-cran")) { brouillon.ressenti = brouillon.ressenti === n ? null : n; const z = document.getElementById("aRessenti"); if (z) z.innerHTML = `<div class="carte-tete"><span class="lab">Comment tu l'as sentie ?</span><span class="cap">facultatif</span></div>${U.crans(brouillon.ressenti, 'data-ajout-cran="1"')}`; return; }
      const idS = cr.getAttribute("data-sortie"); noterRessenti(idS, n);
      if (cr.closest("#calque")) feuille("ressenti", idS);
      return;
    }
    const tc = t.closest("[data-type-choix]");
    if (tc) {
      const idS = tc.getAttribute("data-id"), v = tc.getAttribute("data-type-choix"); fermerCalque();
      changerType(idS, v).then((ok) => { if (ok && TYPES_AUTRES.includes(v)) { U.toast("Sortie retirée de tes courses."); location.hash = "#/sorties"; } });
      return;
    }
    const vf = t.closest("[data-verifier]"); if (vf) { const [idS, lib] = paire(vf.getAttribute("data-verifier")); vf.disabled = true; changerType(idS, lib).then((ok) => { if (ok && !etat.doutes.length) U.toast("Merci, toutes tes sorties sont vérifiées."); }); return; }
    const fo = t.closest("[data-fusion-oui]"); if (fo) { const [a, b] = paire(fo.getAttribute("data-fusion-oui")); fo.disabled = true; fusionner(a, b).then(async (ok) => { if (ok) await charger(); else U.toast("Pas enregistré, vérifie ta connexion."); rendre(true); }); return; }
    const fn = t.closest("[data-fusion-non]"); if (fn) { garder(CLES.pasMeme, [...lire(CLES.pasMeme, []), fn.getAttribute("data-fusion-non")].slice(-100)); rendre(true); return; }
    const at = t.closest("[data-ajout-type]"); if (at) { brouillon.type = at.getAttribute("data-ajout-type"); brouillon.doute = null; rendre(true); return; }
    const fe = t.closest("[data-feuille]"); if (fe) { e.stopPropagation(); feuille(fe.getAttribute("data-feuille"), fe.getAttribute("data-id")); return; }
    const f = t.closest("[data-filtre]"); if (f) { etat.filtre = f.getAttribute("data-filtre"); rendre(true); return; }
    const rp = t.closest("[data-replie]"); if (rp) { const k = rp.getAttribute("data-replie"); etat.plis = { ...etat.plis, [k]: estReplie(k) ? 0 : 1 }; garder(CLES.plis, etat.plis); rendre(true); return; }
    // Ton niveau (13a) : la tuile touchée passe en grand ; 1, 2 ou 3 mois de courbe.
    const nv = t.closest("[data-niv-sel]"); if (nv) { etat.nivSel = nv.getAttribute("data-niv-sel"); rendre(true); return; }
    const np = t.closest("[data-niv-per]"); if (np) { etat.nivPer = Number(np.getAttribute("data-niv-per")); rendre(true); return; }
    const pe = t.closest("[data-periode]"); if (pe) { etat.periode = Number(pe.getAttribute("data-periode")); rendre(true); return; }
    const mo = t.closest("[data-montre]"); if (mo) { majGoals({ equipement: mo.getAttribute("data-montre") }, "Enregistré.").then(() => rendre(true)); return; }
    const pm = t.closest("[data-pp-montre]"); if (pm) { etat.ppMontre = pm.getAttribute("data-pp-montre"); rendre(true); return; }
    const od = t.closest("[data-obj-dist]"); if (od) { etat.objDist = od.getAttribute("data-obj-dist"); od.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("actif", b === od)); return; }
    const cd = t.closest("[data-chrono-dist]"); if (cd) { etat.chronoDist = cd.getAttribute("data-chrono-dist"); cd.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("actif", b === cd)); return; }
    const aa = t.closest("[data-auth-aller]"); if (aa) { const et = aa.getAttribute("data-auth-aller"); Object.assign(auth, { etape: et, erreur: "", info: "", code: "", verifie: false }); if (et !== "code" && et !== "nouveau") auth.envoyeA = 0; rendre(); return; }
    const gl = t.closest("[data-guide-lancer]"); if (gl) { lancerGuide(Number(gl.getAttribute("data-guide-lancer"))); return; }
    const gf = t.closest("[data-guide-fait]"); if (gf) { const k = Number(gf.getAttribute("data-guide-fait")); guide.done[k - 1] = true; guide.pending = 0; guide.hint = 0; garderGuide(); rendre(true); return; }
    const ac = t.closest("[data-action]");
    if (ac) { action(ac.getAttribute("data-action"), ac); return; }
    const g = t.closest("[data-go]"); if (g) { e.stopPropagation(); fermerCalque(); location.hash = g.getAttribute("data-go"); }
  });
  function action(a, el) {
    if (a === "deconnexion") { Donnees.deconnexion().then(() => { reinitialiser(); ecranEntree(); rendre(); }); }
    else if (a === "reessayer") demarrer();
    else if (a === "installer-plus-tard") { garder(CLES.installer, true); auth.installer = false; rendre(); }
    else if (a === "copier-lien") { const u = location.href.split("#")[0].split("?")[0]; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => U.toast("Lien copié."), () => U.toast("Copie l'adresse dans la barre du navigateur.")); }
    else if (a === "voir-mdp") { auth.voir = !auth.voir; const i = document.getElementById("aMdp"); if (i) i.type = auth.voir ? "text" : "password"; el.innerHTML = ic(auth.voir ? "oeilBarre" : "oeil", 18); el.setAttribute("aria-pressed", String(auth.voir)); el.setAttribute("aria-label", `${auth.voir ? "Masquer" : "Afficher"} le mot de passe`); }
    else if (a === "auth-renvoyer") authRenvoyer();
    else if (a === "accord-ok") accepterAccord();
    else if (a === "accord-refus") { etat.accord.refus = true; window.scrollTo(0, 0); rendre(); }
    else if (a === "accord-revenir") { etat.accord.refus = false; window.scrollTo(0, 0); rendre(); }
    else if (a === "pp-toi") ppToi();
    else if (a === "pp-montre") ppMontre();
    else if (a === "pp-vers-toi") { etat.pp = "toi"; rendre(); }
    else if (a === "pp-vers-montre") { etat.pp = "montre"; fermerGuide(); rendre(); }
    else if (a === "guide-fini") finirGuide(false);
    else if (a === "guide-plus-tard") finirGuide(true);
    else if (a === "guide-saisie") { const pp = premiersPasEnCours(); fermerGuide(); (pp ? terminerPremiersPas(true) : Promise.resolve()).then(() => { location.hash = "#/ajouter"; }); }
    else if (a === "guide-reessayer") { guide.attente = Date.now(); rendre(true); sonderGuide(); sondeGuide(); }
    else if (a === "copier-email") { (navigator.clipboard ? navigator.clipboard.writeText(etat.email || "") : Promise.reject()).then(() => U.toast("E-mail copié."), () => U.toast("Sélectionne l'e-mail pour le copier.")); }
    else if (a === "ouvrir-runsync") ouvrirRunSync();
    else if (a === "fusions-vues") { garder(CLES.fusions, null); rendre(true); }
    else if (a === "ajout-fermer") { brouillon = null; if (history.length > 1) history.back(); else location.hash = "#/sorties"; }
    else if (a === "enregistrer-ajout") enregistrerAjout();
    else if (a === "supprimer-sortie") { const idS = el.getAttribute("data-id"); el.disabled = true; Donnees.supprimerSortie(idS).then(async ({ error }) => { fermerCalque(); if (error) { U.toast("Pas supprimée, vérifie ta connexion."); return; } await charger(); U.toast("Sortie supprimée."); location.hash = "#/sorties"; rendre(); }); }
    else if (a === "supprimer-compte") supprimerCompte(el);
    else if (a === "enregistrer-chrono") enregistrerChrono();
    else if (a === "retirer-chrono") retirerChrono();
    else if (a === "enregistrer-objectif") enregistrerObjectif();
    else if (a === "retirer-objectif") majGoals({ principal: null }, "Objectif retiré.").then(() => rendre(true));
    else if (a === "telecharger-tout") telechargerTout();
    else if (a === "telecharger-csv") telechargerCsv();
    else if (a === "mdp-envoyer") mdpEnvoyer();
    else if (a === "mdp-changer") mdpChanger();
  }
  // Saisies : connexion (le code se valide tout seul dès 6 chiffres, sauf pour un nouveau mot de passe), ajout d'une sortie,
  // changement de mot de passe.
  document.addEventListener("input", (e) => {
    const t = e.target, ch = t.getAttribute && t.getAttribute("data-auth-champ");
    if (ch) {
      if (ch === "code") { auth.code = cleanOtp(t.value); t.value = auth.code; } else auth[ch] = t.value;
      if (auth.erreur) { auth.erreur = ""; const er = document.querySelector("#fAuth .erreur"); if (er) er.textContent = ""; }
      clearTimeout(minuteurCode);
      if (ch === "code" && auth.etape === "code" && otpComplete(auth.code) && !auth.occupe) { const tape = auth.code; minuteurCode = setTimeout(() => { if (auth.etape === "code" && auth.code === tape && !auth.occupe) authEnvoyer(); }, 450); }
      return;
    }
    const aj = t.getAttribute && t.getAttribute("data-ajout-champ");
    if (aj && brouillon) { brouillon[aj] = t.value; if (brouillon.doute) { brouillon.doute = null; const b = document.querySelector('[data-action="enregistrer-ajout"]'); if (b) b.textContent = "Enregistrer"; } return; }
    const mc = t.getAttribute && t.getAttribute("data-mdp-champ");
    if (mc && mdp) mdp[mc] = mc === "code" ? (t.value = cleanOtp(t.value)) : t.value;
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-profil-champ")) { enregistrerChampProfil(t); return; }
    if (t.hasAttribute && t.hasAttribute("data-accord-case")) { etat.accord.coche = t.checked; const b = document.getElementById("accordGo"); if (b) b.disabled = !t.checked || etat.accord.occupe; }
  });
  document.addEventListener("submit", (e) => { if (e.target && e.target.id === "fAuth") { e.preventDefault(); authEnvoyer(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { fermerCalque(); return; }
    const g = e.target.closest && e.target.closest("[data-go][role=link]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = g.getAttribute("data-go"); }
  });
  window.addEventListener("hashchange", () => {
    fermerCalque(); etat.nivSel = "ef"; etat.nivPer = 3;   // Ton niveau : rien n'est mémorisé
    const vue = (location.hash || "").split("/")[1];
    if (guide && vue !== "guide" && !premiersPasEnCours()) fermerGuide();
    if (vue !== "ajouter") brouillon = null;
    if (!(vue === "profil" && (location.hash || "").split("/")[2] === "mdp")) mdp = null;
    rendre(false);
  });

  /* =================== Chargement, « après une sortie » (9) et actualisation (E1) =================== */
  async function charger() {
    const [runs, prof] = await Promise.all([Donnees.lireSorties(), Donnees.lireProfil()]);
    if (runs.error) { etat.erreur = "Impossible de charger tes sorties."; return false; }
    // Profil illisible (réseau) : ni écran d'accord ni premiers pas par erreur, l'app s'affiche avec ce qu'elle a.
    etat.profilErreur = !!prof.error;
    if (prof.error) U.toast("Tes réglages n'ont pas pu être chargés : ils peuvent apparaître vides sans être perdus.");
    etat.profil = prof.error ? etat.profil || {} : prof.data || {};
    etat.accordPret = !prof.error && (prof.data ? Object.prototype.hasOwnProperty.call(prof.data, "privacy_consent_at") : true);
    etat.brutes = runs.data || []; recalculer(); etat.chargeA = Date.now();
    return true;
  }
  // Nouvelle sortie reçue (moins de 7 jours, jamais vue) : record en plein écran s'il y en a un, puis le bilan ; plusieurs
  // sorties : le bilan de la plus récente et « X autres sorties reçues ». Une seule célébration par sortie. À la 1re ouverture
  // de la V2, tout ce qui existe est considéré comme vu.
  function ouvrirSiNouvelles() {
    if (Donnees.banc && !(window.__BANC__ && window.__BANC__.bilan)) return false;
    const now = maintenant(), recentes = etat.courses.filter((s) => now - s.ts <= R.bilanJoursOuverture * JOUR && !s.manuel);
    let vues = lire(CLES.vues, null);
    if (!vues) { garder(CLES.vues, etat.courses.map((s) => String(s.id)).slice(-500)); return false; }
    const nouvelles = recentes.filter((s) => !vues.includes(String(s.id)));
    if (!nouvelles.length || (location.hash && !["#/accueil", "#/", "#"].includes(location.hash))) return false;
    garder(CLES.vues, vues.concat(nouvelles.map((s) => String(s.id))).slice(-500));
    const principale = nouvelles[nouvelles.length - 1];
    etat.autresRecues = nouvelles.slice(0, -1).reverse().map((s) => s.id);
    location.hash = Calc.recordsBattus(principale, etat.sorties).length ? `#/record/${principale.id}` : `#/bilan/${principale.id}`;
    return true;
  }
  // Ce qui s'ouvre tout seul après le chargement : le bilan d'une nouvelle sortie, sinon l'annonce de la V2.
  function apresChargement() {
    if (accordManquant() || premiersPasEnCours()) return;
    if (!ouvrirSiNouvelles() && nouveautesAMontrer()) feuille("nouveautes");
  }
  async function demarrer() {
    etat.pret = false; etat.erreurChargement = false; rendre();
    const u = await Donnees.utilisateur();
    etat.userId = (u && u.id) || ""; etat.creeLe = (u && u.created_at) || null; if (u && u.email) etat.email = u.email;
    if (!(await charger())) { etat.erreurChargement = true; rendre(); return; }
    // Comptes d'avant le parcours de démarrage (05/10) qui ont des données : marqués « faits » d'office (D106).
    const p = etat.profil, aDesDonnees = etat.brutes.length > 0 || !!(p.goals && p.goals.principal && p.goals.principal.objectifPrincipal);
    if (!etat.profilErreur && !p.onboarding_completed_at && shouldAutoMarkOnboarding(aDesDonnees, etat.creeLe)) {
      p.onboarding_completed_at = new Date().toISOString(); Donnees.majProfil({ onboarding_completed_at: p.onboarding_completed_at });
    }
    if (!accordManquant() && (await fusionnerSaisies())) await charger();
    etat.pret = true; rendre(); apresChargement();
  }
  async function actualiser(manuel) {
    if (etat.actualise) return; etat.actualise = true;
    const avant = etat.brutes.length, ok = await charger(); etat.actualise = false;
    if (!ok) { U.toast("Pas pu actualiser tes sorties. On garde ce qui est affiché."); return; }
    const ouvert = ouvrirSiNouvelles(); rendre(true);
    const msg = newRunsMessage(avant, etat.brutes.length);
    if (msg && !ouvert) U.toast(msg); else if (!msg && manuel) U.toast("Tout est à jour.");
  }
  const occupe = () => !!document.querySelector("#calque *") || ["#/ajouter"].includes(location.hash) || (location.hash || "").startsWith("#/profil/mdp");
  // Retour dans l'app : le guide coche l'étape partie ouvrir une app ; l'inscription en attente d'un code tente la connexion
  // (adresse confirmée par le lien de l'e-mail) ; sinon, on relit les sorties après 30 s (une course a pu arriver de RunSync).
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    if (!etat.session) {
      if (auth.etape === "code" && auth.mdp && !auth.occupe) { const { error } = await Donnees.connexion(auth.email.trim(), auth.mdp); if (!error) authFini(); }
      return;
    }
    if (guide) { reglerGuide(); rendre(true); sonderGuide(); sondeGuide(); return; }
    if (!etat.pret || Donnees.banc || accordManquant() || premiersPasEnCours() || occupe()) return;
    if (shouldAutoRefresh(etat.chargeA, Date.now(), false)) actualiser(false);
  });
  // Tirer pour actualiser (app installée seulement : Safari a déjà son geste).
  let tirer = null;
  const tirerPossible = () => autonome() && etat.pret && !accordManquant() && !premiersPasEnCours() && !occupe() && !document.body.classList.contains("feuille-ouverte");
  function peindreTirer(decalage, txt, tourne) {
    let el = document.getElementById("tirer");
    if (!el) { el = document.createElement("div"); el.id = "tirer"; el.className = "tirer"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.innerHTML = `<i class="${tourne ? "tourne-ic" : ""}" aria-hidden="true">${ic("actualiser", 16)}</i><span>${esc(txt)}</span>`;
    el.style.transform = `translate(-50%, ${Math.round(decalage - 56)}px)`; el.style.opacity = String(Math.min(1, decalage / 40));
  }
  const cacherTirer = () => { const el = document.getElementById("tirer"); if (el) { el.style.transform = "translate(-50%,-60px)"; el.style.opacity = "0"; } };
  document.addEventListener("touchstart", (e) => {
    tirer = null;
    if (e.touches.length !== 1 || window.scrollY > 2 || !tirerPossible() || (e.target.closest && e.target.closest("input, textarea, select, svg"))) return;
    tirer = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, dy: 0, on: false };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!tirer) return;
    const dx = e.touches[0].clientX - tirer.x0, dy = e.touches[0].clientY - tirer.y0;
    if (!tirer.on) { if (Math.abs(dx) > Math.abs(dy) || dy < 0 || window.scrollY > 2) { tirer = null; return; } if (dy < 8) return; tirer.on = true; }
    tirer.dy = dy; const st = pullRefreshState(dy);
    peindreTirer(st.offset, st.armed ? "Relâche pour actualiser" : "Tire pour actualiser", false);
  }, { passive: true });
  document.addEventListener("touchend", async () => {
    if (!tirer) return;
    const go = tirer.on && pullRefreshState(tirer.dy).armed; tirer = null;
    if (!go) { cacherTirer(); return; }
    peindreTirer(PULL_TRIGGER, "Actualisation…", true); await actualiser(true); cacherTirer();
  });
  document.addEventListener("touchcancel", () => { tirer = null; cacherTirer(); });

  (async () => {
    etat.session = await Donnees.session();
    if (etat.session) { etat.email = (etat.session.user && etat.session.user.email) || ""; await demarrer(); }
    else { ecranEntree(); rendre(); }
  })();
})();
