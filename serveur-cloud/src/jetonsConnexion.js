// (05/11, règle de Nico — Beebs bloqué par notre propre verrou, capture de 11:20) UNE SEULE VÉRITÉ « connectée » pour
// l'écran « Me connecter » (coffre, serveur-cloud/src/coffre.js), le verrou de l'extension Cloud
// (scripts/cloud/build-extension-cloud.mjs, qui recopie CETTE fonction telle quelle) et la sonde de session.
//
// Le cas du 05/11 : Beebs garde un jeton LONG (cookie refresh_token, un an) et un jeton COURT (access_token, ~1 h). La
// messagerie Beebs en pause 6 h (02:48), l'onglet inactif fermé : plus aucune visite, l'access_token a expiré et Chrome
// l'a effacé. Le verrou ne regardait que lui : « beebs n'est pas connecté dans ce navigateur, aucune visite » — y compris
// la visite qui l'aurait renouvelé. 4 tâches Beebs refusées toutes les 15 min, l'app affichant « Connecté » (la base
// refusait en silence d'écrire « à reconnecter », cloud_coffre_ecrire).
//
// La règle (toutes les plateformes à jeton court + jeton long, pas seulement Beebs) :
//   · « absente »      : aucun jeton long vivant, ou un jeton court qui dit « invité / anonyme » (session fermée) ;
//   · « a_renouveler » : jeton long vivant, jeton court ABSENT (cookie échu, effacé par Chrome) — la plateforme EST
//                        connectée ; l'exécutant renouvelle le jeton court par une visite normale de l'accueil du site
//                        avant de travailler (aucun mot de passe, aucun login automatique) ;
//   · « connectee »    : jeton court d'un utilisateur présent (comme avant le 05/11 : son heure d'expiration n'est pas
//                        jugée ici — la page de Vinted le renouvelle elle-même sur un 401, toutes les heures cette nuit ;
//                        aucune visite de plus sur Vinted, Leboncoin ou Depop, zéro changement pour elles).
// Connectée = tout sauf « absente ». Leboncoin et Depop n'ont qu'un cookie de session (__Secure-Login, access_token) :
// présent = connectée, jamais « a_renouveler ».
//
// ⛔ PURE, SANS IMPORT NI RÉFÉRENCE EXTÉRIEURE : sa source est injectée dans le service worker de l'extension Cloud
// (Function.prototype.toString). Les cookies arrivent déjà filtrés sur la plateforme : { name, value, expires } (expires
// en secondes, null ou -1 = cookie de session).

/** Les cookies de connexion que l'extension doit lire, par plateforme (court d'abord, long ensuite). */
export const NOMS_JETONS_CONNEXION = Object.freeze({
  vinted: Object.freeze(['access_token_web', 'refresh_token_web']),
  leboncoin: Object.freeze(['__Secure-Login']),
  beebs: Object.freeze(['access_token', 'refresh_token']),
  depop: Object.freeze(['access_token']),
});

/** L'état de connexion d'une plateforme d'après ses seuls cookies (aucune requête). */
export function etatJetonsConnexion(cookies, plateforme, maintenant = Date.now()) {
  const liste = Array.isArray(cookies) ? cookies : [];
  const vivant = (c) => Boolean(c) && String(c.value ?? '').trim().length > 0
    && !(Number(c.expires) > 0 && Number(c.expires) * 1000 <= maintenant);
  const cookie = (nom) => liste.find((c) => c && c.name === nom && vivant(c)) ?? null;
  const claims = (v) => {
    try {
      const p = String(v ?? '').split('.')[1];
      if (!p) return null;
      const b = p.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)),
        (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
    } catch { return null; }
  };
  const etat = (e, long, court) => ({ etat: e, long, court });
  // Un jeton court lu (cookie vivant, JWT lisible) : { invite, valable } — valable = celui d'un utilisateur.
  const jetonCourt = (c, estInvite) => {
    const cl = c ? claims(c.value) : null;
    if (!cl) return null;
    const invite = estInvite(cl);
    return { invite, valable: !invite };
  };

  if (plateforme === 'vinted') {
    const long = cookie('refresh_token_web');
    // Un jeton d'accès SANS utilisateur = visiteur invité (règle du 26/09).
    const court = jetonCourt(cookie('access_token_web'), (cl) => !cl.sub);
    if (court?.invite) return etat('absente', Boolean(long), false);
    if (!long) return etat('absente', false, Boolean(court?.valable));
    return court?.valable ? etat('connectee', true, true) : etat('a_renouveler', true, false);
  }
  if (plateforme === 'beebs') {
    const long = cookie('refresh_token');
    // (30/10) Beebs donne à TOUT visiteur un jeton Firebase anonyme : invité = anonyme, rôle invité, ou sans utilisateur.
    const court = jetonCourt(cookie('access_token'), (cl) => {
      const role = String(cl.role ?? cl.type ?? cl.user_type ?? '').toLowerCase();
      const anonyme = [cl.provider_id, cl.firebase?.sign_in_provider].some((p) => String(p ?? '').toLowerCase() === 'anonymous');
      return !(cl.sub ?? cl.user_id ?? cl.id) || anonyme || /guest|anon|invite/.test(role) || cl.is_guest === true;
    });
    if (court?.invite) return etat('absente', Boolean(long), false);
    // Jeton court d'un utilisateur, valable, sans jeton long lisible (cookie posé sans « Secure ») : connectée, comme avant.
    if (court?.valable) return etat('connectee', Boolean(long), true);
    return long ? etat('a_renouveler', true, false) : etat('absente', false, false);
  }
  if (plateforme === 'leboncoin') return cookie('__Secure-Login') ? etat('connectee', true, true) : etat('absente', false, false);
  if (plateforme === 'depop') return cookie('access_token') ? etat('connectee', true, true) : etat('absente', false, false);
  return etat('absente', false, false);
}
