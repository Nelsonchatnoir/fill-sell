// Point d'entrée d'aperçu (captures du site), jamais livré.
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — le popup de l'extension Chrome, version PUBLIÉE (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de CAPTURES pour le site vitrine, jamais livré, et qui ne touche pas
// chrome-extension/. Le popup affiché est celui de la version servie aux
// utilisateurs — refait le 09/10 sur la 0.6.105 (commit 8f88cdd), la PREMIÈRE
// version qui connaît Depop (zip prêt, à téléverser au Chrome Web Store) ;
// le commit se choisit dans site-capture.mjs (EXTENSION_COMMIT).
// site-capture.mjs sert ses fichiers (popup.html, popup.js, config.js,
// manifest.json, assets/) tels qu'ils sont dans ce commit (`git show`), sous
// /extension-publiee/, et n'y ajoute qu'UNE balise : le script de
// l'objet `chrome` simulé (site-extension-chrome.js). Rien n'est écrit sur le
// disque. ⇒ Cette page ne s'affiche que sous site-capture.mjs (routes
// Playwright) ; ouverte dans Vite seul, l'iframe reste vide.
//
// L'état montré, tiré du compte de DÉMONSTRATION : l'extension tourne (dernier
// passage il y a 1 min), elle garde l'ordinateur éveillé (des annonces sont en
// file), les cinq plateformes sont connectées (eBay relié par l'API, Depop
// autorisée dans ce navigateur), le sweat Öhlins (déjà sur Vinted) attend son
// dépôt sur Leboncoin et Depop, la casquette Volcom le sien sur Depop.
//
//   site-extension.html               — 1280 × 800, le popup en haut à droite
//   site-extension.html?etat=en-cours — la casquette est en cours de dépôt sur
//                                       Depop (section « En cours » : le popup
//                                       est alors plus haut que l'écran)
import { donneesDemo, UID_DEMO } from './site-donnees-demo.js';

const enCours = new URLSearchParams(location.search).get('etat') === 'en-cours';
const D = donneesDemo(Date.now());
const il = (ms) => new Date(Date.now() - ms).toISOString();
const ohlins = D.parCle.ohlins;
const casquette = D.parCle.casquette;
const jobPopup = (o) => ({
  id: o.id, user_id: UID_DEMO, inventaire_id: o.inventaire_id, platform: o.platform, action: 'publish', status: o.status,
  created_at: o.created_at, title: o.title, price: o.price, photos: o.photos, platform_fields: { categorie: 'Mode' }, error: null,
});
const jobs = [
  jobPopup({ id: 'demo-pop-1', inventaire_id: ohlins.id, platform: 'leboncoin', status: 'pending', created_at: il(6 * 60_000), title: ohlins.titre, price: ohlins.prix_vente, photos: ohlins.photos }),
  jobPopup({ id: 'demo-pop-4', inventaire_id: ohlins.id, platform: 'depop', status: 'pending', created_at: il(6 * 60_000), title: ohlins.titre, price: ohlins.prix_vente, photos: ohlins.photos }),
  jobPopup({ id: 'demo-pop-3', inventaire_id: casquette.id, platform: 'depop', status: enCours ? 'processing' : 'pending', created_at: il(7 * 60_000), title: casquette.titre, price: casquette.prix_vente, photos: casquette.photos }),
];
// Un jeton factice (en-tête.charge.signature) : le popup n'en lit que l'e-mail.
const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
window.__POPUP_DEMO = {
  session: { access_token: `${b64({ alg: 'none' })}.${b64({ email: D.utilisateur.email })}.demo`, email: D.utilisateur.email },
  prochainPoll: Date.now() + 70_000,
  stockage: {
    fillsell_last_poll: il(60_000),
    fillsell_keep_awake: { maj: il(20_000), debut: il(6 * 60_000) },
    fillsell_recent_results: {},
    fillsell_derniere_publication_ok: {},
  },
  reponseFile: {
    jobs,
    annonces_en_attente: { total: 0 },
    boutique_pause: null,
    // « Déjà en ligne » pour l'article affiché en « Prête à publier » (le sweat Öhlins).
    deja_en_ligne: { inventaire_id: ohlins.id, plateformes: { vinted: true, leboncoin: false, ebay: false, beebs: false, depop: false } },
    contexte: {
      sync: null,
      sessions: null,
      opla: { relie: false, sortie_active: true },
      // Depop ouverte pour ce compte (la garde depop_autorise du serveur).
      depop: { ouverte: true },
      verite: {
        plateformes: {
          vinted: { etat: 'connectee', source: 'releve', depuis: il(2 * 3600_000) },
          leboncoin: { etat: 'connectee', source: 'depot', depuis: il(25 * 60_000) },
          ebay: { etat: 'connectee', source: 'api', depuis: null },
          beebs: { etat: 'connectee', source: 'releve', depuis: il(2 * 3600_000) },
          depop: { etat: 'connectee', source: 'releve', depuis: il(2 * 3600_000) },
        },
      },
    },
  },
};

// Le décor : un fond neutre, le popup ancré en haut à droite comme Chrome
// l'ouvre sous l'icône de la barre d'outils. Aucun faux navigateur dessiné.
document.body.style.cssText = 'margin:0;min-height:800px;overflow:hidden;background:#E9E6DD';
const cadre = document.createElement('iframe');
cadre.id = 'popup';
cadre.title = 'Popup de l’extension FillSell';
cadre.src = '/extension-publiee/popup.html';
cadre.style.cssText = 'position:absolute;top:16px;right:24px;width:380px;height:600px;border:0;border-radius:10px;'
  + 'background:#F5F6F5;box-shadow:0 12px 40px rgba(16,32,27,0.22),0 2px 8px rgba(16,32,27,0.10)';
document.body.appendChild(cadre);
// La hauteur suit TOUT le contenu du popup (même origine : lisible) : aucune
// barre de défilement dans le cadre ; ce qui dépasse sort par le bas de l'écran
// (Chrome, lui, borne un popup à 600 px de haut et le fait défiler).
const ajuster = () => {
  try {
    const h = cadre.contentDocument?.documentElement?.scrollHeight;
    if (h) cadre.style.height = `${h}px`;
  } catch { /* pas encore chargé */ }
};
cadre.addEventListener('load', () => { ajuster(); setTimeout(ajuster, 600); setTimeout(() => { ajuster(); window.__pret = true; }, 1500); });
