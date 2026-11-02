// Les plateformes servies par le Cloud — ce que l'orchestrateur sait d'elles.
// Pur (aucun réseau) : testé par tests/plateformes.test.mjs.
//
//   · Vinted, Leboncoin, Beebs, Depop (30/10) passent par le NAVIGATEUR Cloud (notre extension) ;
//   · eBay passe par l'API existante (connexion officielle eBay, ebay-oauth) :
//     jamais dans le navigateur Cloud ;
//   · Opla sort le 10/10 : jamais dans le Cloud.
//
// L'écran « Me connecter » ne mène QU'À la page de connexion de la plateforme :
// toute navigation vers un hôte (ou un chemin) hors de sa liste est REFUSÉE,
// et la personne revient à la page de connexion. Les fournisseurs de connexion
// (Apple, Google, Facebook) : (30/10, lot D) seulement leurs pages de CONNEXION — plus « google.com » ni
// « apple.com » ni « facebook.com » en entier (une recherche ou un fil d'actualité y étaient joignables).

export const PLATEFORMES_CLOUD = Object.freeze(['vinted', 'leboncoin', 'beebs', 'depop']);

// [hôte, chemins permis] — null = l'hôte entier (un hôte qui ne sert QUE l'authentification).
// (01/11, Beebs avec Google : « Une erreur est survenue » au retour) Deux étapes de la connexion Google étaient REFUSÉES
// (journal du serveur, 21:14 et 21:15) : le dépôt des cookies Google sur le domaine du pays (accounts.google.fr/
// accounts/SetSID — google.be, google.ch, google.co.uk… selon la personne) et le RETOUR vers la plateforme, qui passe
// par le gestionnaire d'authentification Firebase (babytouch-782e4.firebaseapp.com/__/auth/handler pour Beebs). La
// fenêtre Google était fermée net : Beebs n'apprenait jamais la fin de la connexion. Permis désormais : les hôtes
// accounts.google.<pays>, les écrans de sécurité de Google pendant la connexion (gds.google.com/web/), et les seuls
// chemins /__/auth/ des gestionnaires Firebase (rien d'autre n'y est servi) — pour Google, Apple et Facebook.
const PAYS_GOOGLE = String.raw`(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})`;
const SSO = Object.freeze([
  [/^appleid\.apple\.com$/, null], [/^idmsa\.apple\.com$/, null],
  [new RegExp(String.raw`^accounts\.google\.${PAYS_GOOGLE}$`), null], [/^accounts\.youtube\.com$/, [/^\/accounts\//]],
  [new RegExp(String.raw`^(www\.)?google\.${PAYS_GOOGLE}$`), [/^\/accounts\//, /^\/recaptcha\//]],
  [/^gds\.google\.com$/, [/^\/web\//]],
  [/^[a-z0-9-]+\.firebaseapp\.com$/, [/^\/__\/auth\//]], [/^[a-z0-9-]+\.web\.app$/, [/^\/__\/auth\//]],
  // (30/10) Kiabi : « Connexion avec Kiabi » sur la page de connexion de Beebs — ses hôtes d'authentification seulement.
  [/^(auth|secure|connect|accounts|login|id)\.kiabi\.com$/, null], [/^www\.kiabi\.com$/, [/^\/(login|connexion|auth|oauth|account\/login)/i]],
  [/^(www|m|web)\.facebook\.com$/, [/^\/login/, /^\/dialog\/oauth/, /^\/v\d+\.\d+\/dialog\/oauth/, /^\/checkpoint/, /^\/two_step_verification/, /^\/cookie\/consent/, /^\/privacy\/consent/, /^\/auth/]],
]);
/** Une page d'un fournisseur de connexion, et SEULEMENT ses pages de connexion. */
export function pageSsoPermise(hote, chemin) {
  const r = SSO.find(([h]) => h.test(hote));
  if (!r) return false;
  return r[1] == null || r[1].some((c) => c.test(chemin));
}

/**
 * (01/11) LE RETOUR DÉCLARÉ PAR LA PLATEFORME (pure). Une page de connexion d'un fournisseur (Google, Apple, Facebook)
 * porte dans son adresse le `redirect_uri` où elle renverra : c'est la PAGE DE LA PLATEFORME qui l'a choisi (la personne
 * ne tape aucune adresse), et le fournisseur n'accepte que les retours enregistrés par la plateforme. Ce retour exact
 * (hôte et chemin, jamais la requête) devient permis pour CE « Me connecter » : le retour vers la plateforme ne se perd
 * plus, quel que soit son hôte. Rend { hote, chemin } ou null.
 */
export function retourDeclare(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'https:' || !SSO.some(([h]) => h.test(u.hostname.toLowerCase()))) return null;
  const brut = u.searchParams.get('redirect_uri');
  if (!brut) return null;
  let r;
  try { r = new URL(brut); } catch { return null; }
  if (r.protocol !== 'https:' || !r.hostname) return null;
  return { hote: r.hostname.toLowerCase(), chemin: r.pathname || '/' };
}

export const DEFINITIONS = Object.freeze({
  vinted: {
    nom: 'Vinted',
    pageConnexion: 'https://www.vinted.fr/member/signup/select_type?ref_url=%2F',
    domaine: /(^|\.)vinted\.fr$/,
    // Sur vinted.fr même, seulement ce qui mène à la connexion (et l'accueil,
    // où Vinted renvoie une fois connecté).
    // (05/10) Vinted redirige /member/signup/select_type → /member/register/select_type
    // (relu par l'écran « Me connecter » du test : refus en boucle) — « register » est permis.
    cheminsPermis: [/^\/$/, /^\/member\/(signup|register|login|general|auth)/, /^\/oauth/, /^\/auth/, /^\/(verification|two_factor)/, /^\/session/],
    hotesPermis: [/^(www\.)?vinted\.fr$/, /^accounts\.vinted\.com$/],
    cookiesDomaine: /(^|\.)vinted\.(fr|com)$/,
    hoteSite: 'www.vinted.fr',
  },
  leboncoin: {
    nom: 'Leboncoin',
    // (30/10, lot D) /se-connecter rend une 404, même dans un vrai Chrome : « Mes annonces » renvoie un visiteur non
    // connecté vers la vraie page de connexion (auth.leboncoin.fr/login), relu le 30/10.
    pageConnexion: 'https://www.leboncoin.fr/compte/part/mes-annonces',
    domaine: /(^|\.)leboncoin\.fr$/,
    cheminsPermis: [/^\/$/, /^\/se-connecter/, /^\/connexion/, /^\/login/, /^\/oauth/, /^\/compte\/part\/mes-annonces/],
    hotesPermis: [/^(www\.)?leboncoin\.fr$/, /^auth\.leboncoin\.fr$/, /^api\.leboncoin\.fr$/],
    cookiesDomaine: /(^|\.)leboncoin\.fr$/,
    hoteSite: 'www.leboncoin.fr',
  },
  beebs: {
    nom: 'Beebs',
    // (30/10, lot D) /fr/login rend une page 404, même dans un vrai Chrome : la connexion vit sur /fr/auth (Kiabi,
    // Google, Facebook, e-mail) — relu dans le Chrome de Nico et dans l'extension (ADRESSES_CONNEXION).
    pageConnexion: 'https://www.beebs.app/fr/auth',
    domaine: /(^|\.)beebs\.app$/,
    cheminsPermis: [/^\/$/, /^\/fr\/?$/, /^\/fr\/(login|signin|connexion|auth|register|inscription)/, /^\/(login|auth)/],
    hotesPermis: [/^(www\.)?beebs\.app$/, /^auth\.beebs\.app$/],
    cookiesDomaine: /(^|\.)beebs\.app$/,
    hoteSite: 'www.beebs.app',
  },
  // (30/10, lot D) Depop : la page de connexion (et ses étapes : code, mot de passe oublié), rien d'autre.
  depop: {
    nom: 'Depop',
    pageConnexion: 'https://www.depop.com/login/',
    domaine: /(^|\.)depop\.com$/,
    // (01/11) + l'accueil de la langue (/fr/) : Depop y renvoie une fois connecté ; refusé, il montrait une page d'erreur
    // juste après la connexion (« Depop a affiché une erreur », Nico, 21:22 ; journal : 3 refus de www.depop.com/fr/).
    cheminsPermis: [/^\/$/, /^\/[a-z]{2}(-[a-z]{2})?\/?$/, /^\/login/, /^\/signup/, /^\/password/, /^\/verify/, /^\/oauth/, /^\/auth/],
    hotesPermis: [/^(www\.)?depop\.com$/, /^auth\.depop\.com$/, /^api\.depop\.com$/],
    cookiesDomaine: /(^|\.)depop\.com$/,
    hoteSite: 'www.depop.com',
  },
});

/**
 * Une navigation (document principal ou fenêtre ouverte par la page de connexion) est-elle permise ?
 * `retours` : les retours déclarés par la plateforme pendant CE « Me connecter » (retourDeclare), permis à l'identique.
 */
export function navigationPermise(plateforme, url, retours = []) {
  const def = DEFINITIONS[plateforme];
  if (!def) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === 'about:' || u.href === 'about:blank') return true;
  if (u.protocol !== 'https:') return false;
  const hote = u.hostname.toLowerCase();
  if ((retours ?? []).some((r) => r?.hote === hote && r?.chemin === u.pathname)) return true;
  if (SSO.some(([h]) => h.test(hote))) return pageSsoPermise(hote, u.pathname);
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
    // (30/10, essai du PC de Nico) Beebs donne à TOUT visiteur un jeton Firebase anonyme (provider_id « anonymous »,
    // firebase.sign_in_provider « anonymous ») : « Me connecter » se fermait sur « connecté » 2 s après l'ouverture.
    const anonyme = [cl.provider_id, cl.firebase?.sign_in_provider].some((p) => String(p ?? '').toLowerCase() === 'anonymous');
    return Boolean(cl.sub ?? cl.user_id ?? cl.id) && !anonyme && !/guest|anon|invite/.test(role) && cl.is_guest !== true;
  }
  // (30/10) Depop : le cookie access_token (même règle que l'extension, sonderSessionDepop : absent = session fermée).
  if (plateforme === 'depop') return de.some((c) => c.name === 'access_token' && String(c.value ?? '').trim().length > 0);
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
  if (plateforme === 'depop') {
    const id = de.find((c) => c.name === 'user_id' || c.name === 'depop_user_id')?.value;
    return id ? String(id) : null;
  }
  return null;
}

/** Les cookies d'une plateforme seulement (ce qui entre dans SA ligne du coffre). */
export const cookiesDe = dePlateforme;

// ── (01/11) LA PREUVE DE CONNEXION : LE COMPTE LU PAR LE SERVEUR ─────────────────────────────────────────────────────
// Essai de Nico (01/11, 21:00 → 21:23) : Leboncoin et Depop se sont dits « connectés » sur le seul cookie (Leboncoin au
// milieu de la vérification du téléphone, Depop sur sa page d'erreur). Règle : les cookies ne font que DÉCLENCHER la
// lecture ; « connecté » = le compte LU par le serveur, depuis la page de connexion revenue sur le site de la plateforme
// (Runtime.evaluate dans CETTE page, avec ses cookies et son adresse), par les lectures que l'extension fait déjà :
//   · Vinted : /api/v2/users/current → 200 et un identifiant (sonde de l'extension) ;
//   · Leboncoin : api.leboncoin.fr/api/account/v2/members/me/account, jeton « luat » de la page → 200 et un compte ;
//   · Beebs : la session Firebase de la page (non anonyme), vérifiée par Google (identitytoolkit accounts:lookup) ;
//   · Depop : webapi.depop.com/presentation/api/v1/users/me/, jeton de la page → 200 et un identifiant.
// Rien ne sort de la page : ni jeton ni courriel — l'état HTTP, la présence d'un identifiant.
const LECTURES_COMPTE = Object.freeze({
  vinted: `const r = await fetch('/api/v2/users/current', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json().catch(() => null) : null; const u = j && (j.user || j);
    return { http: r.status, id: u && u.id != null ? String(u.id) : null };`,
  leboncoin: `const t = localStorage.getItem('luat'); if (!t) return { http: 0, motif: 'sans_jeton' };
    const r = await fetch('https://api.leboncoin.fr/api/account/v2/members/me/account', { cache: 'no-store', headers: { authorization: 'Bearer ' + t, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json().catch(() => null) : null; const a = j && j.account;
    return { http: r.status, id: a ? String(a.id || a.userId || a.user_id || a.account_id || 'compte') : null };`,
  beebs: `const u = await new Promise((ok) => { let fini = false; const fin = (v) => { if (!fini) { fini = true; ok(v); } };
      setTimeout(() => fin(null), 4000);
      try { const q = indexedDB.open('firebaseLocalStorageDb');
        q.onupgradeneeded = (e) => { try { e.target.transaction.abort(); } catch (x) {} fin(null); };
        q.onerror = () => fin(null);
        q.onsuccess = () => { const db = q.result; try { if (!db.objectStoreNames.contains('firebaseLocalStorage')) { db.close(); return fin(null); }
          const g = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll();
          g.onsuccess = () => { db.close(); const l = (g.result || []).find((x) => /^firebase:authUser:/.test(String(x && x.fbase_key))); fin(l && l.value || null); };
          g.onerror = () => { db.close(); fin(null); }; } catch (x) { fin(null); } };
      } catch (x) { fin(null); } });
    if (!u) return { http: 0, motif: 'sans_session' };
    if (u.isAnonymous === true) return { http: 0, motif: 'anonyme' };
    const jeton = u.stsTokenManager && u.stsTokenManager.accessToken;
    if (!jeton || !u.apiKey) return { http: 0, motif: 'sans_jeton' };
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(u.apiKey), { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: jeton }), signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json().catch(() => null) : null; const c = j && j.users && j.users[0];
    return { http: r.status, id: c && c.localId && c.localId === u.uid ? String(c.localId) : null };`,
  depop: `const m = String(document.cookie || '').match(/(?:^|;\\s*)access_token=([^;]+)/); if (!m) return { http: 0, motif: 'sans_jeton' };
    let t = m[1]; try { t = decodeURIComponent(t); } catch (x) {}
    const r = await fetch('https://webapi.depop.com/presentation/api/v1/users/me/', { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json', Authorization: 'Bearer ' + t }, signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json().catch(() => null) : null;
    return { http: r.status, id: j && j.id != null ? String(j.id) : null };`,
});

/**
 * L'expression à évaluer dans la page de connexion (pure) : hors du site de la plateforme (page Google, page
 * d'authentification, étape de vérification sur un autre hôte), elle ne lit RIEN et le dit ({ horsSite }).
 */
export function expressionLectureCompte(plateforme) {
  const def = DEFINITIONS[plateforme];
  const corps = LECTURES_COMPTE[plateforme];
  if (!def?.hoteSite || !corps) return null;
  return `(async () => { if (location.protocol !== 'https:' || location.hostname !== ${JSON.stringify(def.hoteSite)}) return { horsSite: true };
    try { ${corps} } catch (e) { return { http: 0, motif: 'reseau' }; } })()`;
}

// ── (02/11, demande de Nico) « RÉSOUDRE LA VÉRIFICATION » : LA PAGE, ET LA LECTURE QUI PROUVE L'ACCÈS RENDU ─────────────
// Après la glissière, UNE requête légère dit si la plateforme répond de nouveau : la lecture du compte (Vinted,
// Leboncoin, Depop : l'adresse même que l'anti-robot protège) ; Beebs lit son compte chez Google, son accès se lit donc
// par la page elle-même (HEAD, sans corps).
const LECTURES_ACCES = Object.freeze({
  beebs: `const r = await fetch(location.pathname || '/', { method: 'HEAD', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return { http: r.status, id: r.ok ? 'page' : null };`,
});
/** L'expression qui lit l'accès à la plateforme dans SA page (pure) — même garde « hors site » que la lecture du compte. */
export function expressionAcces(plateforme) {
  const def = DEFINITIONS[plateforme];
  const corps = LECTURES_ACCES[plateforme] ?? LECTURES_COMPTE[plateforme];
  if (!def?.hoteSite || !corps) return null;
  return `(async () => { if (location.protocol !== 'https:' || location.hostname !== ${JSON.stringify(def.hoteSite)}) return { horsSite: true };
    try { ${corps} } catch (e) { return { http: 0, motif: 'reseau' }; } })()`;
}

/**
 * L'état de la page, lu SANS réseau (pure : une expression) : la page est-elle chargée, y a-t-il un cadre DataDome —
 * glissière (/captcha/), bloqué sans glissière (t=bv), vérification de l'appareil qui passe seule (/interstitial/) ?
 */
// (02/11, essai de Nico 11:45 : Beebs « vérification de l'appareil » puis « Accès temporairement restreint », l'IP citée)
// Un refus ÉCRIT (dans la page ou dans le cadre DataDome) est un accès restreint, pour toutes les plateformes.
export const TEXTE_ACCES_RESTREINT = /acc[eè]s (temporairement )?(restreint|refus[ée]|bloqu[ée])|temporarily (restricted|blocked)|access (has been |is )?(restricted|denied|blocked)|vous (avez été|êtes) bloqu|you (have been|are) blocked/i;
export const EXPRESSION_ETAT_PAGE = `(() => {
  const hote = (s) => { try { return new URL(s, location.href).hostname; } catch (e) { return ''; } };
  const cadres = [...document.querySelectorAll('iframe')].map((f) => f.src || '').filter((s) => /(^|\\.)captcha-delivery\\.com$/i.test(hote(s)));
  const bloque = cadres.some((s) => /\\/captcha\\//i.test(s) && /[?&]t=bv(&|$)/.test(s));
  const texte = String((document.body && document.body.innerText) || '').slice(0, 2000);
  return { hote: location.hostname, pret: document.readyState === 'complete', bloque, restreint: ${TEXTE_ACCES_RESTREINT}.test(texte),
    captcha: !bloque && cadres.some((s) => /\\/captcha\\//i.test(s)), interstitiel: cadres.some((s) => /\\/interstitial\\//i.test(s)) };
})()`;

// La page qui rouvre la vérification quand l'anti-robot l'a montrée sur une requête de fond (une API) : une page du site
// connecté, qui fait elle-même ses requêtes (la glissière s'y affiche si l'appareil est encore signalé).
const PAGES_DU_COMPTE = Object.freeze({
  vinted: 'https://www.vinted.fr/',
  leboncoin: 'https://www.leboncoin.fr/compte/part/mes-annonces',
  beebs: 'https://www.beebs.app/fr',
  depop: 'https://www.depop.com/',
});
/**
 * La page à rouvrir pour résoudre (pure) : celle où l'anti-robot a montré la vérification (son paramètre `referer`,
 * quand c'est une page du site de la plateforme — jamais son ancre de travail), sinon une page du compte.
 */
export function pageDeResolution(plateforme, blocage = null) {
  const def = DEFINITIONS[plateforme];
  if (!def) return null;
  try {
    const u = new URL(String(blocage?.referer ?? ''));
    if (u.protocol === 'https:' && u.hostname === def.hoteSite) { u.hash = ''; return u.href; }
  } catch { /* pas de page connue */ }
  return PAGES_DU_COMPTE[plateforme] ?? def.pageConnexion;
}

/** Pendant une résolution, un document principal reste sur le site de la plateforme (ou la page DataDome elle-même). */
export function navigationResolution(plateforme, url) {
  const def = DEFINITIONS[plateforme];
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.href === 'about:blank') return true;
  if (!def || u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return def.domaine.test(h) || /(^|\.)captcha-delivery\.com$/.test(h);
}

// ── (02/11, essai Beebs de Nico 14:37) LE BANDEAU DE COOKIES QU'ON NE POUVAIT NI ACCEPTER NI REFUSER ─────────────────────
// Le bandeau Axeptio de Beebs s'affichait dans la fenêtre de connexion sans se fermer. Les boutons de refus d'un bandeau de
// consentement (Axeptio : #axeptio_btn_dismiss, ou les mots usuels), cherchés dans la page ET ses racines d'ombre ouvertes,
// lus SANS réseau ; « Refuser les cookies » (le choix le plus discret) les presse à la demande de la personne.
const TROUVER_REFUS_COOKIES = `const racines = [document];
  for (let i = 0; i < racines.length && i < 60; i++) for (const el of racines[i].querySelectorAll('*')) if (el.shadowRoot && !racines.includes(el.shadowRoot)) racines.push(el.shadowRoot);
  const visible = (b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const refus = racines.flatMap((r) => [...r.querySelectorAll('button, [role=button], a')]).find((b) => visible(b)
    && (/axeptio_btn_dismiss/i.test(b.id || '') || /^(non merci|tout refuser|refuser( tout)?|je refuse|continuer sans accepter)$/i.test(String(b.innerText || b.textContent || '').trim())));`;
export const EXPRESSION_COOKIES = `(() => { ${TROUVER_REFUS_COOKIES} return { refus: Boolean(refus) }; })()`;
export const EXPRESSION_REFUSER_COOKIES = `(() => { ${TROUVER_REFUS_COOKIES} if (!refus) return { clique: false }; refus.click(); return { clique: true }; })()`;

/** Le verdict d'une lecture de compte (pure) : { ok, http, motif } — ok seulement sur 200 ET un compte lu. */
export function verdictLectureCompte(lu) {
  if (!lu || typeof lu !== 'object') return { ok: false, http: 0, motif: 'illisible' };
  if (lu.horsSite) return { ok: false, http: 0, motif: 'hors_site' };
  const http = Number(lu.http) || 0;
  if (http === 200 && typeof lu.id === 'string' && lu.id.length > 0) return { ok: true, http, motif: null };
  return { ok: false, http, motif: lu.motif ?? (http === 200 ? 'sans_compte' : `http_${http}`) };
}

// ── (01/11) UNE PLATEFORME NON CONNECTÉE N'A AUCUNE SESSION DANS LE PROFIL ───────────────────────────────────────────
// Le coffre fait foi : une plateforme sans connexion VÉRIFIÉE au coffre (connecte = vrai) ne garde dans le profil du
// navigateur aucun cookie de session (demi-connexion abandonnée en pleine vérification, connexion remise à « non
// connecté »). Seul le cookie de l'appareil DataDome reste : l'effacer ferait repasser la vérification d'appareil.
const COOKIES_GARDES = new Set(['datadome']);
/** Les cookies du profil à effacer (pure) : ceux des plateformes du Cloud ABSENTES de `connectees`, sauf DataDome. */
export function cookiesAPurger(cookies, connectees = []) {
  const garder = new Set(connectees ?? []);
  return PLATEFORMES_CLOUD.filter((p) => !garder.has(p))
    .flatMap((p) => dePlateforme(cookies, p))
    .filter((c) => !COOKIES_GARDES.has(String(c.name ?? '').toLowerCase()));
}
/** Les origines dont le stockage de page (localStorage, IndexedDB) part avec la session (pure). */
export const ORIGINES_SESSION = Object.freeze({
  vinted: Object.freeze(['https://www.vinted.fr']),
  leboncoin: Object.freeze(['https://www.leboncoin.fr', 'https://auth.leboncoin.fr']),
  beebs: Object.freeze(['https://www.beebs.app']),
  depop: Object.freeze(['https://www.depop.com']),
});

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
