// BALISES GOOGLE SOUS CONSENTEMENT — script EN LIGNE dans le <head> (09/10/2026).
//
// Avant ce jour, Google Tag Manager (GTM-…, qui ne porte que Google Analytics)
// et la balise Google Ads (AW-…) se chargeaient à l'ouverture de toute page du
// site ET de l'app web, avant toute réponse au bandeau : cookies _ga, _gcl_au
// et requêtes chez Google sans accord (risque CNIL, article 82). Désormais :
//
//   · mode consentement de Google v2, REFUSÉ par défaut (les quatre signaux) ;
//   · AUCUN script Google n'est demandé tant que la personne n'a pas dit oui
//     au bandeau (mode « de base » : ni requête ni cookie avant l'accord ;
//     Google modélise lui-même les conversions des refus) ;
//   · à l'accord (événement `fs-consent`, posé par consentement.js, que ce
//     soit le bandeau du site ou celui de l'app), le consentement passe à
//     « accordé » PUIS GTM et gtag se chargent, dans l'ordre d'avant
//     (gtm.start, puis js/config AW) : la conversion Google Ads remonte comme
//     avant ; les événements poussés avant l'accord attendent dans dataLayer ;
//   · accord déjà donné : chargés tout de suite, comme avant ;
//   · refus (ou retrait de l'accord) : consentement « refusé » et cookies
//     Google déjà posés effacés.
//
// Fonction PURE sur un `window` donné : testée avec un faux window
// (scripts/site-balises-selftest.mjs). Les identifiants viennent des blocs
// d'index.html (source unique, scripts/site/lib/balises.mjs) ; la clé de
// stockage vient de src/utils/consentement.js (la même que les deux bandeaux).
// Pas de <noscript> : sans JavaScript, aucun accord ne peut être donné.

export const CONSENT_REFUSE = {
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied',
};
export const CONSENT_ACCORDE = {
  ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted',
};
// Cookies posés par Google Analytics et Google Ads sur notre domaine.
export const COOKIES_GOOGLE = /^(_ga|_gid|_gat|_gcl_|_gac_|__gads|__gpi)/;

export function brancherBalises(w, { gtm, aw, etat }) {
  const d = w.document;
  const dl = (w.dataLayer = w.dataLayer || []);
  // Forme imposée par Google : on pousse l'objet `arguments`, pas un tableau.
  // eslint-disable-next-line prefer-rest-params
  function gtag() { dl.push(arguments); }
  if (typeof w.gtag !== 'function') w.gtag = gtag;
  gtag('consent', 'default', CONSENT_REFUSE);

  let charge = false;
  const ajouter = (src) => {
    const s = d.createElement('script');
    s.async = true;
    s.src = src;
    d.head.appendChild(s);
  };
  const accorder = () => {
    if (charge) return;
    charge = true;
    gtag('consent', 'update', CONSENT_ACCORDE);
    dl.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    ajouter('https://www.googletagmanager.com/gtm.js?id=' + gtm);
    ajouter('https://www.googletagmanager.com/gtag/js?id=' + aw);
    gtag('js', new Date());
    gtag('config', aw);
  };
  const purger = () => {
    let noms = [];
    try {
      noms = String(d.cookie || '').split(';').map((c) => c.split('=')[0].trim()).filter((n) => COOKIES_GOOGLE.test(n));
    } catch { return; }
    if (!noms.length) return;
    // Le cookie peut avoir été posé sur l'hôte ou sur un domaine parent.
    const parts = String((w.location && w.location.hostname) || '').split('.');
    const domaines = [''];
    for (let i = 0; i < parts.length - 1; i++) domaines.push('; domain=.' + parts.slice(i).join('.'));
    for (const n of noms) for (const dom of domaines) d.cookie = n + '=; Max-Age=0; path=/' + dom;
  };

  const e = etat();
  if (e === 'accepte') accorder();
  else if (e === 'refuse') purger();
  w.addEventListener('fs-consent', (ev) => {
    if (ev && ev.detail === 'accepte') { accorder(); return; }
    if (charge) gtag('consent', 'update', CONSENT_REFUSE);
    purger();
  });
  return { accorder, purger };
}
