// ═══════════════════════════════════════════════════════════════════════════
// UNE PAGE TRADUITE PAR LE NAVIGATEUR NE BLANCHIT PLUS L'ÉCRAN (29/10/2026, point 10)
// ═══════════════════════════════════════════════════════════════════════════
// « Traduire cette page » (Chrome, Google Traduction) remplace les nœuds texte rendus par React par des <font> ;
// React garde ses références sur les nœuds d'origine, sortis du DOM. Au rendu suivant, insertBefore(nouveau, texte
// sorti) lève « Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is
// not a child of this node » : erreur non rattrapée, React 19 démonte toute la racine — écran blanc. Et les textes
// qui changent ne se voient plus (React écrit dans le nœud sorti) : une page traduite affiche des valeurs FIGÉES.
// Cas fondateurs : mele.marta (Chrome Windows, Italie) le 28/10 de 13:28 à 13:33, six écrans blancs et six
// rechargements autour de « Synchroniser » (BlocSynchro : `{!ctaInactif && <RefreshCw/>}{ctaTexte}`) ;
// pedrobaylina (Chrome Windows, Portugal) le 27/10 à 11:17, fin de sa première synchro. Profils en « fr ».
// Deux gestes, pour tous les comptes :
//   1. FillSell se déclare non traduisible (translate="no", classe notranslate, meta google notranslate) — décision de
//      Nico du 29/10 soir, PARTOUT : app web et mobile (index.html, reposé par interdireTraductionApp), site vitrine
//      (site/gabarits/layout.mjs), popup de l'extension, page « Me connecter » du Cloud ; l'anglais reste dans Réglages ;
//   2. ceinture pour les autres tiers (extensions qui touchent au DOM) : un insertBefore / removeChild sur un nœud
//      qui n'est plus l'enfant du parent ne lève plus — l'insertion se fait en fin de parent, le retrait n'a plus
//      rien à retirer — et se signale UNE fois par onglet (action_app_ratee, action « dom_tiers »).

let interdite = false;
/** L'app ne se laisse plus traduire par le navigateur (appelé au chargement d'App.jsx ; index.html le déclare déjà). */
export function interdireTraductionApp(doc = typeof document !== 'undefined' ? document : null) {
  if (interdite || !doc?.documentElement) return;
  interdite = true;
  try {
    doc.documentElement.setAttribute('translate', 'no');
    doc.documentElement.classList.add('notranslate');
    if (doc.head && !doc.head.querySelector('meta[name="google"][content="notranslate"]')) {
      const m = doc.createElement('meta');
      m.setAttribute('name', 'google');
      m.setAttribute('content', 'notranslate');
      doc.head.appendChild(m);
    }
  } catch { /* jamais un point de panne */ }
}

/** La page a-t-elle été traduite par le navigateur ? Google Traduction pose translated-ltr / translated-rtl sur <html>. */
export function pageTraduite(doc = typeof document !== 'undefined' ? document : null) {
  try {
    const c = doc?.documentElement?.classList;
    if (!c) return null;
    return c.contains('translated-ltr') || c.contains('translated-rtl');
  } catch { return null; }
}

/** Ce qui prouve (ou écarte) la traduction, joint à chaque exception signalée. */
export function contexteLangue() {
  const c = { traduite: pageTraduite() };
  try { c.lang_nav = typeof navigator !== 'undefined' ? (navigator.language ?? null) : null; } catch { c.lang_nav = null; }
  try { c.lang_page = typeof document !== 'undefined' ? (document.documentElement.lang || null) : null; } catch { c.lang_page = null; }
  return c;
}

let gardee = false;
/**
 * Un DOM touché par un tiers ne lève plus pendant le rendu de React. `signaler(op)` : une fois par onglet.
 * @param {(op: 'insertBefore'|'removeChild') => void} [signaler]
 * @param {{ prototype?: any }} [N] — Node (injectable pour le selftest)
 */
export function garderDomContreTiers(signaler = null, N = typeof Node === 'function' ? Node : null) {
  if (gardee || !N?.prototype) return;
  gardee = true;
  let dit = false;
  const prevenir = (op) => {
    if (dit) return;
    dit = true;
    try { signaler?.(op); } catch { /* un journal raté ne casse rien */ }
  };
  const insererAvant = N.prototype.insertBefore;
  N.prototype.insertBefore = function insertBefore(nouveau, repere) {
    if (repere != null && repere.parentNode !== this) {
      prevenir('insertBefore');
      return insererAvant.call(this, nouveau, null);
    }
    return insererAvant.call(this, nouveau, repere);
  };
  const retirer = N.prototype.removeChild;
  N.prototype.removeChild = function removeChild(enfant) {
    if (enfant != null && enfant.parentNode !== this) {
      prevenir('removeChild');
      return enfant;
    }
    return retirer.call(this, enfant);
  };
}

/** Pour le selftest : la garde se repose. */
export function _remettreGarde() { gardee = false; interdite = false; }
