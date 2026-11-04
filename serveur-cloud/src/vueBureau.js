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
export function ligneRequete({ le, cadre, url, methode, type, http = null, echec = null, bloquee = null, publicite = false }) {
  let hote = '', chemin = '';
  try { const u = new URL(String(url)); hote = u.hostname; chemin = u.pathname.slice(0, 120); } catch { hote = String(url ?? '').slice(0, 40); }
  return { le, cadre: cadre ?? 'page', hote, chemin, methode: methode ?? null, type: type ?? null, http, echec, bloquee, publicite: Boolean(publicite) };
}
