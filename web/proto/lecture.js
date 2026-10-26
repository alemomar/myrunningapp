/* Prototype : accès à Supabase en LECTURE SEULE (règle n° 1 de la demande d'Omar du 26/10/2026).
   Le client Supabase reste enfermé ici : le reste du prototype ne voit que cinq fonctions, qui ne savent que se connecter,
   se déconnecter de CE téléphone, lire la session et LIRE deux tables. Aucune fonction n'écrit (ni ajout, ni modification,
   ni suppression, ni appel de fonction en base). Vérifié par proto/test.html.
   Connexion rangée sous une clé à part (« mra-proto-auth ») : se connecter ou se déconnecter ici ne touche pas la connexion
   de l'app ; la déconnexion ne vaut que pour cet appareil (scope « local »), jamais pour tous les appareils. */
const Lecture = (() => {
  const TABLES_LISIBLES = Object.freeze(["runs", "profiles"]);
  let client = null;
  const c = () => client || (client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: "mra-proto-auth", persistSession: true, autoRefreshToken: true },
  }));

  // Lit une table : renvoie { data, error }, jamais l'objet de requête (qui permettrait d'enchaîner autre chose).
  async function lire(table, colonnes, options) {
    if (!TABLES_LISIBLES.includes(table)) return { data: null, error: { message: `Table non lisible dans le prototype : ${table}` } };
    let q = c().from(table).select(colonnes);
    const o = options || {};
    if (o.trierPar) q = q.order(o.trierPar, { ascending: o.croissant !== false });
    if (o.unSeul) q = q.maybeSingle();
    const { data, error } = await q;
    return { data, error };
  }

  return Object.freeze({
    connexion: async (email, motDePasse) => {
      const { data, error } = await c().auth.signInWithPassword({ email, password: motDePasse });
      return { session: data?.session || null, error };
    },
    deconnexion: async () => { await c().auth.signOut({ scope: "local" }); },
    session: async () => (await c().auth.getSession()).data.session || null,
    lire: Object.freeze(lire),
    tables: TABLES_LISIBLES,
  });
})();
