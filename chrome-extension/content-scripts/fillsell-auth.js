// Injecté sur https://fillsell.app/* — capture la session Supabase après login.
//
// supabase-js persiste la session dans localStorage sous la clé `sb-<ref>-auth-token`
// ({ access_token, refresh_token, expires_at, user }). On la lit ici (aucune
// modification du code de l'app nécessaire) et on l'envoie au background qui la
// stocke dans chrome.storage.local.

(() => {
  // ── (25/10, 0.6.144 — Louis) LE PONT SURVIT À UNE MISE À JOUR DE L'EXTENSION ──────────────────────────────
  // Chrome ne réinjecte PAS ce script dans un onglet fillsell.app déjà ouvert quand l'extension se met à jour :
  // l'ancien script reste, coupé de l'extension (« Extension context invalidated »), et avalait chaque commande
  // en silence. louis-seller, 25/10 : extension mise à jour à 01:58:40, onglet FillSell resté ouvert, puis 20+
  // lectures de détail demandées par son lot entre 10:29 et 10:50 — aucune réponse, 25 s d'attente chacune.
  // Reproduit sur le poste de Nico le 25/10 (13:38 réponse en 4,3 s ; rechargement de l'extension à 13:43:50 ;
  // 13:45 même onglet : ni présence ni réponse en 30 s ; onglet rechargé : réponse en 3,2 s). Désormais :
  //   · le background réinjecte ce script dans les onglets ouverts à chaque installation ou mise à jour ;
  //   · une copie déjà active dans ce monde isolé ne se lance pas deux fois ;
  //   · une copie coupée de son extension le DIT à la page (__fillsellPontMort) et se tait, au lieu d'avaler.
  if (globalThis.__fillsellPontActif) return;
  globalThis.__fillsellPontActif = true;
  const pontVivant = () => { try { return Boolean(chrome.runtime?.id); } catch { return false; } };

  const POLL_MS = 2000;
  const MAX_POLLS = 150; // ~5 min : laisse le temps à l'utilisateur de se connecter (estimation-ok: réglage interne)

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
  const COMMANDES = new Set([
    "SYNC_DRESSING", "FETCH_VINTED_ITEM", "CAPTURE_VINTED_ITEM", "PROBE_VINTED_LISTING",
    // « Autoriser Opla » depuis la page (2026-09-23) : l'extension ouvre SA page
    // (popup), où le geste que Chrome exige se fait. Aller-retour : la page
    // apprend si la fenêtre s'est ouverte, ou si l'accès est déjà là.
    "AUTORISER_OPLA",
    // « Autoriser Depop » (09/10) : le même aller-retour, pour www.depop.com.
    "AUTORISER_DEPOP",
    // Question « Marque » (03/10 nuit, 0.6.94) : chercher un nom dans le
    // catalogue des marques Vinted. Lecture seule ; la réponse repart vers la
    // page avec le terme cherché.
    "CHERCHER_MARQUE",
    // (25/10, 0.6.144) La PAGE PUBLIQUE d'une annonce Vinted (texte, couleur, rayon) : une page vue, comme un
    // visiteur — jamais le formulaire d'édition, et lisible quel que soit le compte Vinted ouvert dans Chrome.
    "FETCH_VINTED_PUBLIC",
  ]);
  const surCommande = (e) => {
    if (e.source !== window) return;
    const cmd = e.data?.__fillsellCmd;
    if (!cmd || !COMMANDES.has(cmd)) return;
    if (!pontVivant()) {
      // Coupé de l'extension (mise à jour, rechargement) : la page l'apprend tout de suite, et ce script se tait.
      window.removeEventListener("message", surCommande);
      window.postMessage({ __fillsellPontMort: { cmd, vintedItemId: String(e.data?.vintedItemId ?? "") } }, window.location.origin);
      return;
    }
    try {
      if (cmd === "AUTORISER_OPLA") {
        chrome.runtime.sendMessage({ type: cmd }, (rep) => {
          void chrome.runtime.lastError;
          window.postMessage({ __fillsellOplaOuverture: rep ?? { ok: false, error: "extension muette" } }, window.location.origin);
        });
        console.log("[fillsell-auth] commande relayée : AUTORISER_OPLA");
        return;
      }
      if (cmd === "AUTORISER_DEPOP") {
        chrome.runtime.sendMessage({ type: cmd }, (rep) => {
          void chrome.runtime.lastError;
          window.postMessage({ __fillsellDepopOuverture: rep ?? { ok: false, error: "extension muette" } }, window.location.origin);
        });
        console.log("[fillsell-auth] commande relayée : AUTORISER_DEPOP");
        return;
      }
      if (cmd === "CHERCHER_MARQUE") {
        const q = String(e.data?.q ?? "").slice(0, 60);
        chrome.runtime.sendMessage({ type: cmd, q }, (rep) => {
          void chrome.runtime.lastError;
          window.postMessage({ __fillsellMarques: { q, ...(rep ?? { success: false, error: "extension muette" }) } }, window.location.origin);
        });
        console.log(`[fillsell-auth] commande relayée : ${cmd} (${q})`);
        return;
      }
      // PROBE_VINTED_LISTING (2026-08-10) : aller-retour aussi, mais son argument
      // est une URL, pas un id — d'où sa branche à part. Le background REVALIDE
      // l'URL (hôte vinted.fr + /items/<id>) : ce relais ne fait confiance à
      // rien de ce qui arrive par postMessage, et surtout pas à une URL.
      // La réponse RÉPÈTE l'URL demandée : le site en a plusieurs en vol
      // possibles (modale rouverte sur un autre article) et doit pouvoir
      // reconnaître la sienne.
      if (cmd === "PROBE_VINTED_LISTING") {
        const listingUrl = String(e.data?.listingUrl ?? "");
        chrome.runtime.sendMessage({ type: cmd, listingUrl }, (rep) => {
          void chrome.runtime.lastError;
          window.postMessage({
            __fillsellListingProbe: { listingUrl, ...(rep ?? { success: false, error: "extension muette" }) },
          }, window.location.origin);
        });
        console.log(`[fillsell-auth] commande relayée : ${cmd} (${listingUrl})`);
        return;
      }
      // FETCH_VINTED_ITEM et CAPTURE_VINTED_ITEM sont des ALLERS-RETOURS : la
      // réponse du background repart vers la page — contrairement à
      // SYNC_DRESSING, qui rend compte par la base. CAPTURE (É1 republication,
      // 2026-08-05) : lecture seule, à l'unité, sur action humaine.
      if (cmd === "FETCH_VINTED_ITEM" || cmd === "CAPTURE_VINTED_ITEM" || cmd === "FETCH_VINTED_PUBLIC") {
        const vintedItemId = String(e.data?.vintedItemId ?? "");
        const cleReponse = cmd === "CAPTURE_VINTED_ITEM" ? "__fillsellItemCapture"
          : cmd === "FETCH_VINTED_PUBLIC" ? "__fillsellAnnoncePublique" : "__fillsellItemDetail";
        chrome.runtime.sendMessage({ type: cmd, vintedItemId }, (rep) => {
          void chrome.runtime.lastError;
          window.postMessage({
            [cleReponse]: { vintedItemId, ...(rep ?? { success: false, error: "extension muette" }) },
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
  };
  window.addEventListener("message", surCommande);

  // Signal de présence : le site grise son bouton de sync tant qu'il n'a pas vu
  // l'extension. Le heartbeat serveur (profiles.extension_last_seen_at) ne se
  // rafraîchit qu'au poll (2 min) — trop lent pour un bouton qu'on regarde.
  // (25/10, 0.6.144) Une copie coupée de son extension ne se déclare plus présente : la page ne compte pas sur elle.
  const annoncer = () => {
    if (!pontVivant()) return;
    try { window.postMessage({ __fillsellExt: true, version: chrome.runtime?.getManifest?.().version ?? null }, window.location.origin); } catch { /* coupée */ }
  };
  // (31/10, lot F) La présence ci-dessus ne dit PAS que l'extension travaille : ce script répond seul, même quand le
  // service worker est muet. La page apprend ici si l'extension de ce navigateur travaille pour le compte connecté
  // (meme : oui / non / inconnu), et si son service worker répond (vivant). Seul « meme: false » prouve un autre
  // compte ; un silence n'est jamais « autre compte ». La demande réveille aussi le service worker (veille du poll).
  const compteDeLaPage = () => {
    try {
      const jeton = readSupabaseSession()?.access_token;
      if (!jeton) return null;
      const b64 = String(jeton).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(b64))?.sub ?? null;
    } catch { return null; }
  };
  const annoncerCompte = () => {
    if (!pontVivant()) return;
    let fini = false;
    const dire = (etat) => {
      if (fini) return;
      fini = true;
      try { window.postMessage({ __fillsellCompte: etat }, window.location.origin); } catch { /* coupée */ }
    };
    const garde = setTimeout(() => dire({ vivant: false }), 4000);
    try {
      chrome.runtime.sendMessage({ type: "FILLSELL_ETAT_COMPTE", sub: compteDeLaPage() }, (rep) => {
        void chrome.runtime.lastError;
        clearTimeout(garde);
        dire(rep?.ok
          ? { vivant: true, meme: typeof rep.meme === "boolean" ? rep.meme : null, connecte: rep.connecte === true,
              poll_ok_le: rep.poll_ok_le ?? null, version: rep.version ?? null }
          : { vivant: false });
      });
    } catch { clearTimeout(garde); dire({ vivant: false }); }
  };
  annoncer();
  annoncerCompte();
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data?.__fillsellPing) { annoncer(); annoncerCompte(); }
  });
})();
