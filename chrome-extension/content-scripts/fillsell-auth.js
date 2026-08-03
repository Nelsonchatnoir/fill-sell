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

  // ── Pont site → extension (2026-08-03) ────────────────────────────────────
  // Le site n'a AUCUN moyen de parler à l'extension : pas d'externally_connectable
  // dans le manifest, pas de onMessageExternal. Plutôt que d'ouvrir l'extension
  // au web (surface d'attaque : n'importe quelle page pourrait déclencher des
  // actions), on relaie ici, dans un content script déjà limité à fillsell.app —
  // exactement le pattern de la sonde réseau Vinted.
  //
  // Garde-fous : origine vérifiée (e.source === window ET même origine que la
  // page), et liste FERMÉE de commandes. Ajouter une commande ici, c'est
  // l'exposer à toute personne capable d'exécuter du JS sur fillsell.app.
  const COMMANDES = new Set(["SYNC_DRESSING", "FETCH_VINTED_ITEM"]);
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const cmd = e.data?.__fillsellCmd;
    if (!cmd || !COMMANDES.has(cmd)) return;
    try {
      // FETCH_VINTED_ITEM est un ALLER-RETOUR : la réponse du background
      // (détail d'UN article, demandé au clic « Publier ») repart vers la page
      // — contrairement à SYNC_DRESSING, qui rend compte par la base.
      if (cmd === "FETCH_VINTED_ITEM") {
        const vintedItemId = String(e.data?.vintedItemId ?? "");
        chrome.runtime.sendMessage({ type: cmd, vintedItemId }, (rep) => {
          void chrome.runtime.lastError;
          window.postMessage({
            __fillsellItemDetail: { vintedItemId, ...(rep ?? { success: false, error: "extension muette" }) },
          }, window.location.origin);
        });
        console.log(`[fillsell-auth] commande relayée : ${cmd} (${vintedItemId})`);
        return;
      }
      chrome.runtime.sendMessage({ type: cmd, declencheur: "bouton" }, () => {
        void chrome.runtime.lastError;
      });
      console.log(`[fillsell-auth] commande relayée : ${cmd}`);
    } catch { /* extension rechargée : sans conséquence */ }
  });

  // Signal de présence : le site grise son bouton de sync tant qu'il n'a pas vu
  // l'extension. Le heartbeat serveur (profiles.extension_last_seen_at) ne se
  // rafraîchit qu'au poll (2 min) — trop lent pour un bouton qu'on regarde.
  const annoncer = () => window.postMessage({ __fillsellExt: true, version: chrome.runtime?.getManifest?.().version ?? null }, window.location.origin);
  annoncer();
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data?.__fillsellPing) annoncer();
  });
})();
