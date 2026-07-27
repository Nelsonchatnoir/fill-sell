// chrome-extension/selectors/installId.js
//
// UUID d'installation ANONYME pour la télémétrie de dégradation des sélecteurs.
// - Généré au premier accès via crypto.randomUUID(), persisté dans
//   chrome.storage.local sous 'fs_install_id'.
// - AUCUN lien avec le compte utilisateur : ne jamais le corréler à un user_id,
//   ni côté extension, ni côté base (la table selector_health n'a pas de user_id).

const STORAGE_KEY = "fs_install_id";

let cached = null;
let pending = null;

export function getInstallId() {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = (async () => {
    try {
      const area = globalThis.chrome?.storage?.local;
      if (!area) {
        // Hors contexte extension (tests, harnais) : identifiant éphémère,
        // jamais persisté — la télémétrie reste anonyme et non corrélable.
        cached = crypto.randomUUID();
        return cached;
      }
      const stored = await area.get(STORAGE_KEY);
      const existing = stored && stored[STORAGE_KEY];
      if (typeof existing === "string" && existing) {
        cached = existing;
        return cached;
      }
      const id = crypto.randomUUID();
      await area.set({ [STORAGE_KEY]: id });
      cached = id;
      return cached;
    } finally {
      pending = null;
    }
  })();
  return pending;
}
