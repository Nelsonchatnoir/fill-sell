// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — un objet `chrome` SIMULÉ pour le popup de l'extension
// (09/10/2026). Script CLASSIQUE, injecté par site-capture.mjs en tête du
// popup.html servi (celui du commit de la version publiée), AVANT config.js et
// popup.js. Outil de captures, jamais livré ; chrome-extension/ n'est pas
// touché.
//
// Le popup ne fait que LIRE : chrome.storage.local, chrome.alarms,
// chrome.permissions, chrome.runtime (session validée par le background), et
// un fetch vers get-pending-jobs. Ici tout est servi depuis
// window.parent.__POPUP_DEMO (posé par site-extension.jsx avec le compte de
// DÉMONSTRATION) ; aucun appel ne quitte la page : le fetch est remplacé, et le
// capteur coupe en plus tout le réseau sortant. Toute écriture (storage.set,
// permissions.request, tabs.create, messages autres que les deux lectures)
// est journalisée et sans effet.
(function () {
  const demo = (window.parent && window.parent.__POPUP_DEMO) || null;
  const journal = (window.__journalChrome = []);
  const noter = (...a) => journal.push(a);
  const stockage = (demo && demo.stockage) || {};
  // La version : lue dans le manifest servi à côté (même commit), jamais écrite ici.
  let manifeste = { version: '?' };
  try {
    const x = new XMLHttpRequest();
    x.open('GET', 'manifest.json', false);
    x.send(null);
    if (x.status === 200) manifeste = JSON.parse(x.responseText);
  } catch (e) { noter('manifest', String(e)); }

  const lire = (cles) => {
    if (cles == null) return { ...stockage };
    const liste = Array.isArray(cles) ? cles : (typeof cles === 'string' ? [cles] : Object.keys(cles));
    const out = {};
    for (const k of liste) if (k in stockage) out[k] = stockage[k];
    return out;
  };
  const ecouteurs = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; } });

  window.chrome = {
    storage: {
      local: {
        get: async (cles) => lire(cles),
        set: async (v) => { noter('storage.set', Object.keys(v || {})); },
        remove: async (k) => { noter('storage.remove', k); },
      },
      onChanged: ecouteurs(),
    },
    alarms: { get: async () => (demo ? { name: 'fillsell-poll-jobs', scheduledTime: demo.prochainPoll } : null) },
    permissions: {
      // Depop est autorisée dans CE navigateur (le geste « Autoriser Depop »
      // déjà fait) ; aucune autre permission optionnelle (jamais Opla).
      contains: async (q) => ((q && q.origins) || []).length > 0 && q.origins.every((o) => o.indexOf('https://www.depop.com/') === 0),
      request: async (p) => { noter('permissions.request', p); return false; },
    },
    runtime: {
      getManifest: () => manifeste,
      onMessage: ecouteurs(),
      sendMessage: async (m) => {
        const type = m && m.type;
        if (type === 'GET_PENDING_SWITCH') return { pending: null };
        if (type === 'GET_VALID_SESSION') return { session: demo ? demo.session : null };
        noter('runtime.sendMessage', type);
        return {};
      },
    },
    tabs: { create: async (o) => { noter('tabs.create', o && o.url); } },
  };

  // Les deux lectures réseau du popup, servies sur place.
  const fetchOrigine = window.fetch.bind(window);
  window.fetch = async (entree, init) => {
    const url = typeof entree === 'string' ? entree : (entree && entree.url) || '';
    const json = (corps) => new Response(JSON.stringify(corps), { status: 200, headers: { 'content-type': 'application/json' } });
    if (/\/functions\/v1\/get-pending-jobs/.test(url)) { noter('fetch', 'get-pending-jobs'); return json(demo ? demo.reponseFile : { jobs: [] }); }
    if (/\/functions\/v1\/avis-demande/.test(url)) { noter('fetch', 'avis-demande'); return json({ ouvrir: false }); }
    if (/^https?:\/\//.test(url) && !url.startsWith(location.origin)) { noter('fetch refusé', url); throw new TypeError('aperçu : réseau coupé'); }
    return fetchOrigine(entree, init);
  };
})();
