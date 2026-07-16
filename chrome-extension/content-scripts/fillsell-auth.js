// Injecté sur https://fillsell.app/* — capture la session Supabase après login.
//
// supabase-js persiste la session dans localStorage sous la clé `sb-<ref>-auth-token`
// ({ access_token, refresh_token, expires_at, user }). On la lit ici (aucune
// modification du code de l'app nécessaire) et on l'envoie au background qui la
// stocke dans chrome.storage.local.

(() => {
  const POLL_MS = 2000;
  const MAX_POLLS = 150; // ~5 min : laisse le temps à l'utilisateur de se connecter

  let polls = 0;
  let lastSent = null;

  function readSupabaseSession() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        // Selon la version de supabase-js, la session est à la racine ou sous currentSession
        const s = raw?.access_token ? raw : raw?.currentSession;
        if (s?.access_token) {
          return {
            access_token: s.access_token,
            refresh_token: s.refresh_token ?? null,
            expires_at: s.expires_at ?? null,
            email: s.user?.email ?? null,
          };
        }
      } catch {
        /* clé illisible, on continue */
      }
    }
    return null;
  }

  function tick() {
    const session = readSupabaseSession();
    if (session && session.access_token !== lastSent) {
      lastSent = session.access_token;
      chrome.runtime.sendMessage({ type: "FILLSELL_SESSION", session }, () => {
        // Ignore l'erreur si le service worker est endormi ; il sera resynchronisé au prochain tick
        void chrome.runtime.lastError;
      });
      console.log("[fillsell-auth] Session capturée et envoyée à l'extension");
    }
    polls += 1;
    if (polls < MAX_POLLS) setTimeout(tick, POLL_MS);
  }

  tick();
})();
