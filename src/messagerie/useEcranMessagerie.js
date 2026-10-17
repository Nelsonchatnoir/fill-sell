// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRAN BÊTA « MESSAGES » / « À EXPÉDIER » : UNE PAGE, PAS UNE COUCHE (17/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Constat de Nico (iPhone, Safari, 390 px, 17/10 à 09:10) : l'espace était une
// couche `position:fixed` rendue DANS l'app. WebKit la peignait sous l'en-tête
// et sous la barre du bas (la règle des couches, src/utils/modale.js) : sa
// croix restait cachée (« coincé »), un appui sur un onglet changeait l'onglet
// SOUS l'écran (« Tableau » allumé sur À expédier), et sa liste, colonne flex
// à hauteur fixe, écrasait ses cartes au lieu de défiler.
//
// LA RÈGLE. L'écran s'ouvre DANS la page — le conteneur qui défile de l'app
// (.wrap.page-pad, qui réserve déjà la place de la barre du bas et de la zone
// de sécurité) — à la place du contenu de l'onglet (espace.css). L'en-tête et
// la barre du bas restent les vrais, rien ne les recouvre.
//   · ouvrir crée une entrée d'historique : le retour du navigateur, le geste
//     retour d'iOS (Safari) et le bouton retour d'Android (Capacitor revient
//     dans l'historique tant qu'aucune couche n'écoute) font ce que fait la
//     flèche ← ; ouvrir une conversation en crée une de plus ;
//   · un appui sur un onglet (barre du bas, onglets du bureau) ferme l'écran
//     et laisse l'onglet faire le reste ; un changement d'onglet venu d'ailleurs
//     le ferme aussi. Ouvrir ne change jamais d'onglet ;
//   · au retour, la page d'avant retrouve sa place (le Stock, la liste).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const CLE = 'fsEcranBeta';
const NAVIGATIONS = '.bnav, .desktop-nav';

/** L'écran bêta porté par l'entrée d'historique courante, ou null. */
function etatHistorique() {
  try {
    const v = window.history.state?.[CLE];
    return v && typeof v === 'object' && Number(v.n) > 0 ? v : null;
  } catch { return null; }
}

/**
 * L'écran bêta ouvert — { onglet: 'messages'|'expedier', article, conversation, n }
 * (n = profondeur : 1 la liste, 2 une conversation) — ou null, et ses gestes :
 *   aller(v)  ouvre l'écran, ou une conversation depuis la liste (une entrée d'historique) ;
 *   retour()  la flèche ← : un pas en arrière, exactement comme le retour du navigateur ;
 *   fermer()  tout refermer (appui sur un onglet) : les entrées poussées partent aussi.
 * @param {{ current: HTMLElement|null }} scrollRef  le conteneur qui défile de l'app
 * @param {number} tab  l'onglet courant (un changement d'onglet ferme l'écran)
 */
export function useEcranMessagerie(scrollRef, tab) {
  const [ecran, setEcran] = useState(null);
  const courant = useRef(null);
  const positions = useRef({});
  const precedent = useRef(null);
  const ongletVu = useRef(tab);

  const appliquer = useCallback((v) => { courant.current = v; setEcran(v); }, []);

  const aller = useCallback((v) => {
    if (!v) return;
    const avant = courant.current;
    const n = (avant?.n ?? 0) + 1;
    const suivant = { onglet: v.onglet ?? avant?.onglet ?? 'messages', article: v.article ?? null, conversation: v.conversation ?? null, n };
    positions.current[n - 1] = scrollRef?.current?.scrollTop ?? 0;
    try { window.history.pushState({ ...(window.history.state ?? {}), [CLE]: suivant }, ''); } catch { /* sans historique, la flèche reste */ }
    appliquer(suivant);
  }, [appliquer, scrollRef]);

  const retour = useCallback(() => {
    const v = courant.current;
    if (!v) return;
    // Notre entrée est au sommet : le navigateur recule, `popstate` applique.
    if (etatHistorique()?.n === v.n) { window.history.back(); return; }
    appliquer(v.n > 1 ? { ...v, conversation: null, n: v.n - 1 } : null);
  }, [appliquer]);

  const fermer = useCallback(() => {
    if (!courant.current) return;
    appliquer(null);
    const h = etatHistorique();
    if (h) { try { window.history.go(-h.n); } catch { /* rien à retirer */ } }
  }, [appliquer]);

  // Retour du navigateur, geste iOS, retour Android : l'entrée d'arrivée dit l'écran.
  useEffect(() => {
    // Une entrée laissée par un rechargement ne rouvre rien.
    if (etatHistorique()) {
      try { window.history.replaceState({ ...window.history.state, [CLE]: null }, ''); } catch { /* rien */ }
    }
    const surRetour = () => appliquer(etatHistorique());
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, [appliquer]);

  // Un appui sur un onglet ferme l'écran (l'onglet, lui, fait son travail).
  const ouvert = ecran != null;
  useEffect(() => {
    if (!ouvert) return undefined;
    const surAppui = (e) => { if (e.target instanceof Element && e.target.closest(NAVIGATIONS)) fermer(); };
    document.addEventListener('click', surAppui, true);
    return () => document.removeEventListener('click', surAppui, true);
  }, [ouvert, fermer]);

  // Un changement d'onglet venu d'ailleurs (lien, notification) ferme aussi :
  // l'historique recule, `popstate` referme l'écran (même chemin que le retour).
  // ATTENTION : seulement si l'écran est ENCORE ouvert : après un appui sur un onglet,
  // fermer() a déjà reculé, et `history.state` ne le dit qu'au `popstate` —
  // reculer une seconde fois sortait de l'app (Chromium, banc du 17/10).
  useEffect(() => {
    if (ongletVu.current === tab) return;
    ongletVu.current = tab;
    if (!courant.current) return;
    const h = etatHistorique();
    if (h) { try { window.history.go(-h.n); } catch { /* rien à retirer */ } }
  }, [tab]);

  // La place dans la page : un écran neuf commence en haut, un retour retrouve
  // celle d'avant (l'onglet, la liste). App remet en haut à chaque changement
  // d'onglet, APRÈS cet effet : un retour au Stock garde sa place, un autre
  // onglet commence en haut comme toujours.
  useLayoutEffect(() => {
    const el = scrollRef?.current;
    const nAvant = precedent.current?.n ?? 0;
    const nApres = ecran?.n ?? 0;
    precedent.current = ecran;
    if (!el || nAvant === nApres) return;
    el.scrollTo(0, nApres > nAvant ? 0 : (positions.current[nApres] ?? 0));
  }, [ecran, scrollRef]);

  return { ecran, aller, retour, fermer };
}

export default useEcranMessagerie;
