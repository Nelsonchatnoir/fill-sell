// (04/11, mesure Beebs — décision de Nico) LA VUE « BUREAU RÉDUIT » DE « ME CONNECTER » ET « RÉSOUDRE », pour Beebs.
// Mesuré le 04/11 sur un onglet vide du navigateur Cloud : avec l'émulation du téléphone (connexion.js), la page de Beebs
// voyait un appareil qui n'existe pas — écran 390×844 ×3, 5 points de toucher, pointeur tactile, MAIS un Chrome Linux de
// bureau (identité, plateforme « Linux x86_64 », rendu SwiftShader). La « vérification de l'appareil » de DataDome lit
// précisément cela. Pour Beebs, la page reste donc ce qu'est le navigateur : une fenêtre de BUREAU (500 px de large, échelle
// 1, souris, aucun toucher), aux proportions de l'écran du téléphone — l'app étire chaque image sur son canvas
// (clientConnexion.js) — sans zoom, rien ne change côté app. Les touchers deviennent des gestes de souris (un appui = un clic, un
// glissé horizontal = un glisser avec le bouton enfoncé, un glissé vertical = la molette) ; quand la glissière DataDome
// s'affiche, l'app n'affiche plus que SA zone, à la largeur du téléphone (elle découpe l'image reçue : la page ne voit
// rien). La fenêtre est une vraie fenêtre redimensionnée (connexion.js), jamais une taille émulée.
// Fonctions pures, testées par tests/vue-bureau.test.mjs.

export const PLATEFORMES_VUE_BUREAU = Object.freeze(['beebs']);
export const VUE_BUREAU_LARGEUR = 500;          // une fenêtre de bureau étroite (Chrome n'en ouvre pas de plus étroite)
export const VUE_BUREAU_HAUTEUR_MAX = 990;      // tient dans l'écran du navigateur (1920×1080)
export const ZOOM_MARGE = 10;

export const vueBureau = (plateforme) => PLATEFORMES_VUE_BUREAU.includes(plateforme);
const borne = (v, a, b) => Math.min(b, Math.max(a, v));

/** La taille de la page de bureau pour un canvas de téléphone (pure) : même proportion, 500 px de large. */
export function formatBureau(dims) {
  const largeur = VUE_BUREAU_LARGEUR;
  const hauteur = Math.min(VUE_BUREAU_HAUTEUR_MAX, Math.round(largeur * Number(dims.hauteur) / Number(dims.largeur)));
  return { largeur, hauteur, k: Number(dims.largeur) / largeur };
}

/**
 * La zone du zoom (pure) : le cadre de la glissière plus une marge, aux proportions du canvas, gardée dans la page.
 * `cadre` et le résultat en pixels CSS de la page ; `k` = pixels du canvas par pixel de page.
 */
export function zoneZoom(cadre, page, dims, marge = ZOOM_MARGE) {
  if (!cadre || !(cadre.l > 0) || !(cadre.h > 0)) return null;
  const l = Math.min(page.largeur, Math.round(cadre.l + 2 * marge));
  const h = Math.min(page.hauteur, Math.round(l * Number(dims.hauteur) / Number(dims.largeur)));
  const x = borne(Math.round(cadre.x + cadre.l / 2 - l / 2), 0, Math.max(0, page.largeur - l));
  const y = borne(Math.round(cadre.y + cadre.h / 2 - h / 2), 0, Math.max(0, page.hauteur - h));
  return { x, y, l, h, k: Number(dims.largeur) / l };
}

/** Un point du canvas → un point de la page (pure) : vue entière (x0 = y0 = 0) ou zone du zoom. */
export function versPage(p, vue) {
  const k = vue?.k > 0 ? vue.k : 1;
  return { x: (vue?.x ?? 0) + Number(p?.x ?? 0) / k, y: (vue?.y ?? 0) + Number(p?.y ?? 0) / k };
}

/**
 * Les touchers du téléphone → des gestes de souris (pure, avec état) : `suivre(type, point de page)` rend la liste des
 * paramètres d'Input.dispatchMouseEvent à envoyer, dans l'ordre. Le sens se décide au premier mouvement net :
 *   · aucun mouvement → un clic (appui puis relâché, au point de départ) ;
 *   · surtout horizontal (≥ seuilGlisse) → un glisser : appui au départ, mouvements bouton enfoncé, relâché au dernier point ;
 *   · surtout vertical (≥ seuilDefile) → la molette (la page défile comme sous un doigt).
 */
export function creerGesteSouris({ seuilGlisse = 6, seuilDefile = 10 } = {}) {
  let g = null;
  const pt = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  const souris = (type, p, extra) => ({ type, ...pt(p), button: 'left', pointerType: 'mouse', ...extra });
  return function suivre(type, p) {
    if (type === 'debut') {
      g = { mode: 'indecis', depart: p, dernier: p };
      return [{ type: 'mouseMoved', ...pt(p), button: 'none', buttons: 0, pointerType: 'mouse' }];
    }
    if (!g) return [];
    if (type === 'deplacer') {
      const dx = p.x - g.depart.x, dy = p.y - g.depart.y;
      const evs = [];
      if (g.mode === 'indecis') {
        if (Math.abs(dy) >= seuilDefile && Math.abs(dy) > Math.abs(dx)) g.mode = 'defile';
        else if (Math.abs(dx) >= seuilGlisse) { g.mode = 'glisse'; evs.push(souris('mousePressed', g.depart, { buttons: 1, clickCount: 1 })); }
        else return [];
      }
      if (g.mode === 'glisse') evs.push(souris('mouseMoved', p, { buttons: 1 }));
      else evs.push({ type: 'mouseWheel', ...pt(g.depart), deltaX: 0, deltaY: Math.round(g.dernier.y - p.y), pointerType: 'mouse' });
      g.dernier = p;
      return evs;
    }
    if (type === 'fin') {
      const fini = g;
      g = null;
      if (fini.mode === 'indecis') return [souris('mousePressed', fini.depart, { buttons: 1, clickCount: 1 }), souris('mouseReleased', fini.depart, { buttons: 0, clickCount: 1 })];
      if (fini.mode === 'glisse') return [souris('mouseReleased', fini.dernier, { buttons: 0, clickCount: 1 })];
      return [];
    }
    return [];
  };
}

/**
 * (04/11) UNE LIGNE DE L'ENREGISTREMENT D'UNE PAGE BEEBS (pure) : chaque requête de la page et de ses cadres (DataDome
 * compris), avec sa réponse ou son échec — ce que le verrou ou le filtre anti-pubs ont coupé y paraît en
 * net::ERR_BLOCKED_BY_CLIENT. Jamais une requête (query), jamais un en-tête, jamais un corps : l'hôte et le chemin
 * (borné), la méthode, le type, le code, l'échec.
 */
/** Un chemin sans donnée personnelle (pure) : e-mails (même encodés) et suites de 4 chiffres ou plus masqués. */
export function cheminMasque(p) {
  let c = String(p ?? '');
  try { c = decodeURIComponent(c); } catch { /* chemin tel quel */ }
  return c.replace(/[^/@\s]+@[^/@\s]+/g, '…@…').replace(/\d{4,}/g, '#');
}

export function ligneRequete({ le, cadre, url, methode, type, http = null, echec = null, bloquee = null, publicite = false,
  id = null, envoyes = null, recus = null, parametres = null, corps = null, reponse = null }) {
  let hote = '', chemin = '';
  // (21/11/2026 nuit, complément 2 de Nico) Le chemin MASQUÉ : une adresse e-mail et toute suite de 4 chiffres ou plus (un
  // code de vérification, un numéro) n'y restent jamais ; ni query, ni en-tête, ni corps (comme avant).
  try { const u = new URL(String(url)); hote = u.hostname; chemin = cheminMasque(u.pathname).slice(0, 120); } catch { hote = String(url ?? '').slice(0, 40); }
  return { le, cadre: cadre ?? 'page', hote, chemin, methode: methode ?? null, type: type ?? null, http, echec, bloquee, publicite: Boolean(publicite),
    ...(id ? { id } : {}), ...(envoyes ? { cookies_envoyes: envoyes } : {}), ...(recus ? { cookies_recus: recus } : {}),
    ...(parametres ? { parametres } : {}), ...(corps != null ? { corps_octets: corps } : {}), ...(reponse != null ? { reponse } : {}) };
}

// ── (04/11, décision de Nico : « l'enregistrement complet ») Ce qui part et ce qui revient, SANS une valeur secrète ────
/** Les cookies ENVOYÉS avec une requête (Network.requestWillBeSentExtraInfo.associatedCookies) : noms, et la raison s'il
 *  a été retenu par le navigateur — jamais une valeur (pure). */
export function nomsCookiesEnvoyes(associes) {
  return (Array.isArray(associes) ? associes : []).map((a) => {
    const raisons = (a?.blockedReasons ?? []).filter(Boolean);
    return { nom: String(a?.cookie?.name ?? '?'), domaine: a?.cookie?.domain ?? null, ...(raisons.length ? { retenu: raisons } : {}) };
  });
}

/** Les cookies POSÉS par une réponse (en-têtes set-cookie de Network.responseReceivedExtraInfo) : noms, attributs, et la
 *  raison s'il a été refusé par le navigateur (blockedCookies) — jamais une valeur (pure). */
export function nomsCookiesRecus(entetes, refuses) {
  const brut = Object.entries(entetes ?? {}).filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => String(v)).join('\n');
  const raisonsDe = new Map((Array.isArray(refuses) ? refuses : []).map((b) => [String(b?.cookie?.name ?? String(b?.cookieLine ?? '').split('=')[0]).trim(), b?.blockedReasons ?? []]));
  return brut.split('\n').map((l) => l.trim()).filter(Boolean).map((ligne) => {
    const [paire, ...attrs] = ligne.split(';');
    const nom = paire.split('=')[0].trim();
    const raisons = raisonsDe.get(nom) ?? [];
    return { nom, attributs: attrs.map((a) => a.trim().split('=')[0].toLowerCase()).filter(Boolean),
      ...(raisons.length ? { refuse: raisons } : {}) };
  });
}

/** Les paramètres d'une adresse : noms et longueurs, jamais les valeurs (la trajectoire de la glissière y passe) (pure). */
export function parametresSansValeur(url) {
  try { return [...new URL(String(url)).searchParams.entries()].map(([k, v]) => `${k}:${v.length}`); } catch { return null; }
}

/** La réponse de DataDome (vérification de l'appareil, glissière) : sa forme et son verdict, jetons masqués (pure). */
export function reponseDataDomeMasquee(texte, max = 2000) {
  const masquer = (s) => String(s).replace(/(datadome=)[^;"\s\\]+/gi, (_, n, v) => `${n}<masqué>`);
  let j = null;
  try { j = JSON.parse(String(texte ?? '')); } catch { return masquer(String(texte ?? '').slice(0, max)); }
  const parcourir = (v) => (typeof v === 'string' ? masquer(v).slice(0, 300) : Array.isArray(v) ? v.slice(0, 20).map(parcourir)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, parcourir(x)])) : v);
  return parcourir(j);
}
export const estDataDome = (url) => { try { return /(^|\.)captcha-delivery\.com$/i.test(new URL(String(url)).hostname); } catch { return false; } };

// ── (21/11/2026 nuit, complément 2 de Nico) LE PROCHAIN ÉCHEC DE CONNEXION DOIT ÊTRE PROUVABLE ─────────────────────────
// L'enregistrement des connexions (ENREGISTREMENT_CONNEXIONS=1 sur cloud-2) ne tourne QUE pendant « Me connecter » /
// « Résoudre » (un fichier par connexion, fermé avec elle). En plus des lignes réseau (sans query, en-tête ni corps), la
// RÉPONSE d'une plateforme à une étape de connexion (identifiant, mot de passe, code, double authentification) est gardée
// MASQUÉE : sa forme (clés), ses statuts et ses messages, jamais un mot de passe, un code, une adresse e-mail ni un jeton.
// Conservation courte : les fichiers de connexion de plus de ENREGISTREMENT_CONSERVATION_MS sont effacés à l'ouverture
// de la connexion suivante (les enregistrements de fond, eux, ne sont pas touchés).
export const ENREGISTREMENT_CONSERVATION_MS = 48 * 3600_000;
const HOTES_CONNEXION = /(^|\.)(vinted\.[a-z.]+|leboncoin\.fr|beebs\.app|depop\.com)$/i;
const CHEMIN_CONNEXION = /verif|two[_-]?factor|2fa|otp|auth|login|signin|sign_in|session|token|code|challenge|captcha|password|identif/i;

/** Une réponse d'une plateforme à une étape de connexion ? (XHR/Fetch, écriture, chemin d'authentification) (pure) */
export function estReponseConnexion(url, methode, type) {
  if (!['XHR', 'Fetch'].includes(String(type ?? ''))) return false;
  if (!['POST', 'PUT', 'PATCH'].includes(String(methode ?? '').toUpperCase())) return false;
  try { const u = new URL(String(url)); return HOTES_CONNEXION.test(u.hostname) && CHEMIN_CONNEXION.test(u.pathname); } catch { return false; }
}

/** Un texte sans donnée : e-mails, suites de 4 chiffres ou plus, jetons (20 caractères d'un seul tenant) masqués (pure). */
function texteMasque(s, max = 160) {
  return String(s ?? '').replace(/[^\s@"']+@[^\s@"']+/g, '…@…').replace(/\d{4,}/g, '#').replace(/[A-Za-z0-9_\-.=+/]{20,}/g, '…').replace(/\s+/g, ' ').trim().slice(0, max);
}
const CLES_DITES = /field|champ|param|message|error|erreur|code|status|statut|type|title|titre|reason|raison|description|detail|kind|state|etat|result|success|valid|remaining|attempt|retry|expire|locked|blocked/i;
const CLES_SECRETES = /pass|mot_de_passe|secret|token|jeton|cookie|otp|pin|email|e_mail|mail|phone|tel|login|username|identifiant|signature|key|cle/i;

/** La réponse d'une étape de connexion, masquée (pure) : JSON → clés gardées, valeurs dites seulement pour les statuts et les
 *  messages (masqués), nombres gardés sous 1000, booléens gardés ; tout le reste « … ». Autre chose : sa nature et sa taille. */
export function reponseConnexionMasquee(texte, max = 1500) {
  const brut = String(texte ?? '');
  let j;
  try { j = JSON.parse(brut); } catch { return { nature: /^\s*</.test(brut) ? 'html' : 'texte', octets: brut.length }; }
  const parcourir = (v, cle, prof) => {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Math.abs(v) < 1000 ? v : '#';
    if (typeof v === 'string') return CLES_SECRETES.test(cle) && !/message|error|erreur/i.test(cle) ? '…' : CLES_DITES.test(cle) ? texteMasque(v) : '…';
    if (prof >= 4) return '…';
    if (Array.isArray(v)) return v.slice(0, 5).map((x) => parcourir(x, cle, prof + 1));
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, parcourir(x, k, prof + 1)]));
    return '…';
  };
  const s = JSON.stringify(parcourir(j, '', 0));
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Les fichiers d'enregistrement de CONNEXION à effacer (pure) : `<plateforme>-<horodatage>-<mode>.jsonl` plus vieux que la
 *  conservation. Jamais un enregistrement de fond (fond-…), jamais un autre fichier. */
export function enregistrementsAPurger(fichiers, maintenant = Date.now(), dureeMs = ENREGISTREMENT_CONSERVATION_MS) {
  return (Array.isArray(fichiers) ? fichiers : [])
    .filter((f) => /^(vinted|leboncoin|beebs|depop|ebay)-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-z_]+\.jsonl$/.test(String(f?.nom ?? '')))
    .filter((f) => Number.isFinite(f?.modifieLe) && maintenant - f.modifieLe > dureeMs)
    .map((f) => f.nom);
}
