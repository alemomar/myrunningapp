/* App V2 (31/10/2026, les 16 choix d'Omar) : le seul accès à Supabase. Connexion, lecture et écritures de l'utilisateur
   connecté, et rien d'autre (pas de clé de service). Même session que l'ancienne app (clé de stockage par défaut) : les
   testeurs restent connectés après la mise à jour.
   Banc de captures local (window.__BANC__, jamais publié) : mêmes fonctions, données en mémoire, rien n'est envoyé. */
const Donnees = (() => {
  const B = window.__BANC__ || null;
  let client = null;
  const c = () => client || (client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  const COLONNES_SORTIES = "id,start_date,type,type_checked,apple_type,distance_km,duration_sec,avg_hr,peak_hr,avg_cadence,pain_ratings,include_in_stats,hr_series,pace_series,lap_markers,frac_work_manual,frac_recovery_manual,notes";
  const COLONNES_PROFIL = "pseudo,age,max_hr,resting_hr,goals,program_settings,sync_since_date,onboarding_completed_at,privacy_consent_at";

  /* ---------- Banc : une base en mémoire ---------- */
  const banc = B && (() => {
    const u = { id: "banc-utilisateur", email: B.email || "camille@exemple.fr", created_at: B.creeLe || "2026-05-01T08:00:00Z" };
    let profil = { privacy_consent_at: "2026-05-01T08:00:00Z", onboarding_completed_at: "2026-05-01T08:00:00Z", sync_since_date: "2026-05-01", ...(B.profil || {}) };
    let runs = (B.runs || []).map((r) => ({ type_checked: null, notes: null, ...r }));
    let connecte = B.connecte !== false, n = 0;
    const ok = (data) => Promise.resolve({ data, error: null });
    return {
      session: () => (connecte ? { user: u, banc: true } : null),
      utilisateur: () => (connecte ? u : null),
      connexion: () => { connecte = true; return ok({ session: { user: u } }); },
      deconnexion: () => { connecte = false; return ok(null); },
      lireSorties: () => ok(runs.slice().sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date))),
      lireProfil: () => ok({ ...profil }),
      majProfil: (f) => { profil = { ...profil, ...f }; return ok(null); },
      majSortie: (id, f) => { runs = runs.map((r) => (String(r.id) === String(id) ? { ...r, ...f } : r)); return ok(null); },
      ajouterSortie: (row) => { const id = `banc-${++n}`; runs.push({ ...row, id }); return ok({ id }); },
      supprimerSortie: (id) => { runs = runs.filter((r) => String(r.id) !== String(id)); return ok(null); },
      compterRecues: () => ok(runs.filter((r) => r.apple_type && r.apple_type !== "Manuel").length),
    };
  })();

  /* ---------- Connexion (étapes de l'ancienne app : D100, D101) ---------- */
  const redirection = () => location.origin + location.pathname;
  async function session() { if (banc) return banc.session(); try { return (await c().auth.getSession()).data.session || null; } catch (e) { return null; } }
  async function utilisateur() { if (banc) return banc.utilisateur(); const { data } = await c().auth.getUser(); return (data && data.user) || null; }
  const connexion = (email, motDePasse) => (banc ? banc.connexion() : c().auth.signInWithPassword({ email, password: motDePasse }));
  const inscription = (email, motDePasse) => c().auth.signUp({ email, password: motDePasse, options: { emailRedirectTo: redirection() } });
  // Le code de l'e-mail : « email » puis « signup » (selon le réglage de Supabase), « recovery » pour un mot de passe oublié.
  const verifierCode = (email, code, type) => c().auth.verifyOtp({ email, token: code, type });
  const renvoyerCode = (email) => c().auth.resend({ type: "signup", email, options: { emailRedirectTo: redirection() } });
  const motDePasseOublie = (email) => c().auth.resetPasswordForEmail(email);
  const changerMotDePasse = (motDePasse) => c().auth.updateUser({ password: motDePasse });
  // Ce téléphone seulement (scope « local ») : RunSync et les autres appareils restent connectés.
  async function deconnexion() { if (banc) return banc.deconnexion(); try { await c().auth.signOut({ scope: "local" }); } catch (e) { /* déjà déconnecté */ } }

  /* ---------- Lecture ---------- */
  async function lireSorties() {
    if (banc) return banc.lireSorties();
    return c().from("runs").select(COLONNES_SORTIES).order("start_date", { ascending: true });
  }
  // Profil : en deux temps, comme l'ancienne app (A6) — si la colonne de l'accord manquait, le reste se charge quand même.
  async function lireProfil() {
    if (banc) return banc.lireProfil();
    const r = await c().from("profiles").select(COLONNES_PROFIL).maybeSingle();
    if (!r.error) return r;
    return c().from("profiles").select(COLONNES_PROFIL.replace(",privacy_consent_at", "")).maybeSingle();
  }
  // Courses reçues d'Apple Santé (guide de connexion) : requête légère, sans les courbes.
  async function compterRecues() {
    if (banc) return banc.compterRecues();
    const { count, error } = await c().from("runs").select("id", { count: "exact", head: true }).not("apple_type", "is", null).neq("apple_type", MANUAL_RUN_MARKER);
    return { data: count || 0, error };
  }
  async function lireSyncDepuis() {
    if (banc) return { data: (await banc.lireProfil()).data.sync_since_date || null, error: null };
    const { data, error } = await c().from("profiles").select("sync_since_date").maybeSingle();
    return { data: data ? data.sync_since_date : null, error };
  }

  /* ---------- Écritures (toujours vérifiées : une erreur remonte, jamais de silence) ---------- */
  async function majProfil(champs) {
    if (banc) return banc.majProfil(champs);
    const u = await utilisateur();
    if (!u) return { error: { message: "session", session: true } };
    return c().from("profiles").upsert({ user_id: u.id, ...champs });
  }
  const majSortie = (id, champs) => (banc ? banc.majSortie(id, champs) : c().from("runs").update(champs).eq("id", id));
  // Deux saisies à la même seconde se gênent (start_date unique par utilisateur) : on décale d'une seconde, 3 essais.
  async function ajouterSortie(entree, ressenti) {
    const u = await utilisateur();
    if (!u) return { error: { message: "session", session: true } };
    let r = { data: null, error: null };
    for (let essai = 0; essai < 3; essai++) {
      const row = manualRunRow(entree, u.id, new Date(Date.now() + essai * 1000));
      if (ressenti != null) row.pain_ratings = { rpe: ressenti };
      r = banc ? await banc.ajouterSortie(row) : await c().from("runs").insert(row).select("id").single();
      if (!r.error || r.error.code !== "23505") break;
    }
    return r;
  }
  const supprimerSortie = (id) => (banc ? banc.supprimerSortie(id) : c().from("runs").delete().eq("id", id));

  /* ---------- Tes données (A3) ---------- */
  async function exporter() {
    if (banc) return { data: { profile: (await banc.lireProfil()).data, runs: (await banc.lireSorties()).data, planned: [] }, error: null };
    const [pr, ru, pl] = await Promise.all([
      c().from("profiles").select("*").maybeSingle(),
      c().from("runs").select("*").order("start_date", { ascending: true }),
      c().from("planned_sessions").select("*").order("planned_date", { ascending: true }),
    ]);
    const error = pr.error || ru.error || pl.error;
    return { data: error ? null : { profile: pr.data, runs: ru.data, planned: pl.data }, error };
  }
  // « Retirer mon accord et supprimer mon compte » : la fonction delete_my_account (migration 026). La photo de profil
  // éventuelle part d'abord (l'envoi est coupé depuis le 27/09, mais une ancienne peut rester).
  async function supprimerCompte() {
    if (banc) return { error: null };
    const u = await utilisateur();
    try {
      if (u) {
        const { data: fichiers } = await c().storage.from("avatars").list(u.id);
        if (fichiers && fichiers.length) await c().storage.from("avatars").remove(fichiers.map((f) => `${u.id}/${f.name}`));
      }
    } catch (e) { /* rien à effacer */ }
    return c().rpc("delete_my_account");
  }

  return Object.freeze({
    banc: !!banc, session, utilisateur, connexion, inscription, verifierCode, renvoyerCode, motDePasseOublie, changerMotDePasse, deconnexion,
    lireSorties, lireProfil, compterRecues, lireSyncDepuis, majProfil, majSortie, ajouterSortie, supprimerSortie, exporter, supprimerCompte,
  });
})();
