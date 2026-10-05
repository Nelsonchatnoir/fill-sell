// Les plateformes servies par le Cloud — ce que l'orchestrateur sait d'elles.
// Pur (aucun réseau) : testé par tests/plateformes.test.mjs.
//
//   · Vinted, Leboncoin, Beebs passent par le NAVIGATEUR Cloud (notre extension) ;
//   · eBay passe par l'API existante (connexion officielle eBay, ebay-oauth) :
//     jamais dans le navigateur Cloud ;
//   · Opla sort le 10/10 : jamais dans le Cloud.
//
// L'écran « Me connecter » ne mène QU'À la page de connexion de la plateforme :
// toute navigation vers un hôte (ou un chemin) hors de sa liste est REFUSÉE,
// et la personne revient à la page de connexion. Les fournisseurs de connexion
// (Apple, Google, Facebook) sont permis en entier : c'est leur page à eux.

export const PLATEFORMES_CLOUD = Object.freeze(['vinted', 'leboncoin', 'beebs']);

const SSO = Object.freeze([
  /^appleid\.apple\.com$/, /^idmsa\.apple\.com$/, /^(www\.)?apple\.com$/,
  /^accounts\.google\.com$/, /^accounts\.youtube\.com$/, /^(www\.)?google\.(com|fr)$/,
  /^(www|m|web)\.facebook\.com$/,
]);

export const DEFINITIONS = Object.freeze({
  vinted: {
    nom: 'Vinted',
    pageConnexion: 'https://www.vinted.fr/member/signup/select_type?ref_url=%2F',
    domaine: /(^|\.)vinted\.fr$/,
    // Sur vinted.fr même, seulement ce qui mène à la connexion (et l'accueil,
    // où Vinted renvoie une fois connecté).
    cheminsPermis: [/^\/$/, /^\/member\/(signup|login|general|auth)/, /^\/oauth/, /^\/auth/, /^\/(verification|two_factor)/, /^\/session/],
    hotesPermis: [/^(www\.)?vinted\.fr$/, /^accounts\.vinted\.com$/],
    cookiesDomaine: /(^|\.)vinted\.(fr|com)$/,
  },
  leboncoin: {
    nom: 'Leboncoin',
    pageConnexion: 'https://www.leboncoin.fr/se-connecter',
    domaine: /(^|\.)leboncoin\.fr$/,
    cheminsPermis: [/^\/$/, /^\/se-connecter/, /^\/connexion/, /^\/login/, /^\/oauth/, /^\/compte\/part\/mes-annonces/],
    hotesPermis: [/^(www\.)?leboncoin\.fr$/, /^auth\.leboncoin\.fr$/, /^api\.leboncoin\.fr$/],
    cookiesDomaine: /(^|\.)leboncoin\.fr$/,
  },
  beebs: {
    nom: 'Beebs',
    pageConnexion: 'https://www.beebs.app/fr/login',
    domaine: /(^|\.)beebs\.app$/,
    cheminsPermis: [/^\/$/, /^\/fr\/?$/, /^\/fr\/(login|signin|connexion|auth|register|inscription)/, /^\/(login|auth)/],
    hotesPermis: [/^(www\.)?beebs\.app$/, /^auth\.beebs\.app$/],
    cookiesDomaine: /(^|\.)beebs\.app$/,
  },
});

/** Une navigation (document principal ou fenêtre ouverte par la page de connexion) est-elle permise ? */
export function navigationPermise(plateforme, url) {
  const def = DEFINITIONS[plateforme];
  if (!def) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === 'about:' || u.href === 'about:blank') return true;
  if (u.protocol !== 'https:') return false;
  const hote = u.hostname.toLowerCase();
  if (SSO.some((r) => r.test(hote))) return true;
  if (!def.hotesPermis.some((r) => r.test(hote))) return false;
  // Les hôtes d'authentification de la plateforme : en entier.
  if (/^(auth|accounts|api)\./.test(hote)) return true;
  return def.cheminsPermis.some((r) => r.test(u.pathname));
}

/** Pour le journal : l'hôte et le chemin, jamais la requête (elle porte des jetons). */
export function urlPourJournal(url) {
  try { const u = new URL(url); return `${u.hostname}${u.pathname}`.slice(0, 160); } catch { return 'url-illisible'; }
}

const claimsJwt = (jwt) => {
  try {
    const p = String(jwt).split('.')[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return null; }
};

const dePlateforme = (cookies, plateforme) => {
  const d = DEFINITIONS[plateforme]?.cookiesDomaine;
  return (cookies ?? []).filter((c) => d && d.test(String(c.domain ?? '').replace(/^\./, '')));
};

/**
 * Connectée POUR DE VRAI d'après les cookies (règle du prototype, éprouvée le
 * 26/09) : Vinted = jeton d'accès PORTANT un utilisateur + refresh token (un
 * visiteur invité ne compte pas) ; Leboncoin = __Secure-Login ; Beebs = jeton
 * d'accès portant un utilisateur NON invité (à confirmer au test réel : en cas
 * de doute, la sonde de page fait foi — sondeConnexionBeebs).
 */
export function estConnectee(cookies, plateforme) {
  const de = dePlateforme(cookies, plateforme);
  if (plateforme === 'vinted') {
    const at = de.find((c) => c.name === 'access_token_web');
    const sub = at ? claimsJwt(at.value)?.sub : null;
    return Boolean(sub) && de.some((c) => c.name === 'refresh_token_web');
  }
  if (plateforme === 'leboncoin') return de.some((c) => c.name === '__Secure-Login' && String(c.value ?? '').length > 0);
  if (plateforme === 'beebs') {
    const at = de.find((c) => c.name === 'access_token');
    const cl = at ? claimsJwt(at.value) : null;
    if (!cl) return false;
    const role = String(cl.role ?? cl.type ?? cl.user_type ?? '').toLowerCase();
    return Boolean(cl.sub ?? cl.user_id ?? cl.id) && !/guest|anon|invite/.test(role) && cl.is_guest !== true;
  }
  return false;
}

/** L'identifiant du compte de plateforme (pour le verrou d'essai), ou null. Jamais journalisé. */
export function identifiantCompte(cookies, plateforme) {
  const de = dePlateforme(cookies, plateforme);
  if (plateforme === 'vinted') {
    const at = de.find((c) => c.name === 'access_token_web');
    const sub = at ? claimsJwt(at.value)?.sub : null;
    if (sub) return String(sub);
    const vuid = de.find((c) => c.name === 'v_uid')?.value;
    return vuid ? String(vuid) : null;
  }
  if (plateforme === 'leboncoin') {
    const id = de.find((c) => c.name === 'lbc_user_id' || c.name === 'userId')?.value;
    if (id) return String(id);
    const login = de.find((c) => c.name === '__Secure-Login')?.value;
    const sub = login ? claimsJwt(login)?.sub : null;
    return sub ? String(sub) : null;
  }
  if (plateforme === 'beebs') {
    const at = de.find((c) => c.name === 'access_token')?.value;
    const cl = at ? claimsJwt(at) : null;
    const id = cl?.sub ?? cl?.user_id ?? cl?.id;
    return id ? String(id) : null;
  }
  return null;
}

/** Les cookies d'une plateforme seulement (ce qui entre dans SA ligne du coffre). */
export const cookiesDe = dePlateforme;

/** Cookie lu (Network.Cookie) → cookie à poser (Network.CookieParam). Les cookies échus ne reviennent pas. */
export function versCookieParam(c, maintenant = Date.now()) {
  if (!c?.session && c?.expires > 0 && c.expires * 1000 <= maintenant) return null;
  const { name, value, domain, path, secure, httpOnly, sameSite, priority, sourceScheme, sourcePort } = c;
  const p = { name, value, domain, path, secure, httpOnly };
  if (sameSite) p.sameSite = sameSite;
  if (priority) p.priority = priority;
  if (sourceScheme) p.sourceScheme = sourceScheme;
  if (Number.isInteger(sourcePort) && sourcePort > 0) p.sourcePort = sourcePort;
  if (!c.session && c.expires > 0) p.expires = c.expires;
  if (c.partitionKey && typeof c.partitionKey === 'object') p.partitionKey = c.partitionKey;
  return p;
}
