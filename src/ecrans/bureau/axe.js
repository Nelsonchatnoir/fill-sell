// Libellés de l'axe horizontal des graphes (29/10, bug « janvfévmarsavr… » vu sur iPhone
// dans la feuille Vinted · depuis le début). RÈGLE, pour TOUS les graphes (ordinateur,
// téléphone, Tableau, feuilles, Statistiques) : jamais deux libellés qui se touchent, ni
// un libellé coupé au bord, quelle que soit la largeur ou la période.
//
// L'appelant décrit l'axe en JEUX de libellés, du plus dense au plus clairsemé (tous les
// mois, un sur deux, un par trimestre, un par semestre, les changements d'année…) ; le
// graphe mesure le texte à sa largeur réelle et garde le premier jeu qui tient
// (placerAxe). Le détail de chaque mois ou jour reste lisible au survol ou au toucher.
// Module pur (aucun React, aucun DOM) : selftest `npm run selftest:axe-graphes`.
//
// Un libellé : { i, l, fort, gras, facultatif, annee }
//   fort       : toujours affiché (« auj. ») ; un libellé régulier qui le touche s'efface.
//   facultatif : ajouté seulement s'il a la place (le mois en cours hors grille, la fin du mois).
//   gras/annee : style (texte encre, graisse 600).

/** Espace minimal entre deux libellés, en pixels. */
export const ECART_LIBELLES = 10;

const FORMATS = new Map();
const MOIS_COURTS = new Map();
/** « oct. » / « Oct » ; formateur et noms mis en cache (l'axe est recalculé à chaque rendu). */
function moisCourt(cle, lang) {
  const k = `${lang}|${cle.slice(5, 7)}`;
  if (!MOIS_COURTS.has(k)) {
    const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
    if (!FORMATS.has(loc)) FORMATS.set(loc, new Intl.DateTimeFormat(loc, { timeZone: 'UTC', month: 'short' }));
    MOIS_COURTS.set(k, FORMATS.get(loc).format(new Date(`2026-${cle.slice(5, 7)}-15T12:00:00Z`)));
  }
  return MOIS_COURTS.get(k);
}

/** Pas en mois, alignés sur le calendrier (1 = tous, 3 = janv. avr. juil. oct., 12 = chaque année, 24 = une année sur deux…). */
const PAS_MOIS = [1, 2, 3, 6, 12, 24, 60, 120];

/**
 * Axe d'une série mois par mois (clés « 2025-03 »). Dès que la série couvre plus d'une
 * année civile, le libellé de janvier est l'ANNÉE (« 2026 ») : sur une longue période, il
 * ne reste que les changements d'année. `gras(i)` : le mois mis en avant (en cours).
 */
export function axeMois(cles, lang, { gras = null } = {}) {
  if (!cles.length) return [[]];
  const plusieursAnnees = cles[0].slice(0, 4) !== cles[cles.length - 1].slice(0, 4);
  const lib = (cle, i) => (plusieursAnnees && cle.slice(5, 7) === '01'
    ? { l: cle.slice(0, 4), annee: true, gras: Boolean(gras && gras(i)) }
    : { l: moisCourt(cle, lang), gras: Boolean(gras && gras(i)) });
  return PAS_MOIS.map((pas) => {
    const jeu = [];
    cles.forEach((cle, i) => {
      const an = Number(cle.slice(0, 4)), m = Number(cle.slice(5, 7)) - 1;
      const regulier = pas <= 12 ? m % pas === 0 : m === 0 && an % (pas / 12) === 0;
      if (regulier) jeu.push({ i, ...lib(cle, i) });
      else if (pas <= 6 && gras && gras(i)) jeu.push({ i, ...lib(cle, i), facultatif: true });
    });
    // Changements d'année seuls : l'année du premier mois, s'il ne commence pas en janvier.
    if (pas >= 12 && plusieursAnnees && cles[0].slice(5, 7) !== '01') jeu.unshift({ i: 0, l: cles[0].slice(0, 4), annee: true, facultatif: true });
    return jeu;
  });
}

/**
 * Axe d'une série jour par jour : `grilles` = indices réguliers, du plus dense au plus
 * clairsemé ; `lib(i)` le texte d'un jour ; `aujourdhui` (indice) toujours libellé
 * `libAuj` ; `fin` : le dernier jour en facultatif.
 */
export function axeJours({ n, lib, grilles, aujourdhui = null, libAuj = '', fin = false }) {
  if (!(n > 0)) return [[]];
  return [...grilles, []].map((g) => {
    const jeu = g.filter((i) => i >= 0 && i <= n - 1 && i !== aujourdhui).map((i) => ({ i, l: lib(i) }));
    if (aujourdhui != null && aujourdhui >= 0 && aujourdhui <= n - 1) jeu.push({ i: aujourdhui, l: libAuj, fort: true, gras: true });
    if (fin && n - 1 !== aujourdhui && !g.includes(n - 1)) jeu.push({ i: n - 1, l: lib(n - 1), facultatif: true });
    return jeu;
  });
}

/** Grilles d'une série de jours : une semaine sur une (1, 8, 15…), une sur deux, le premier jour seul. */
export const grillesSemaines = (n) => [7, 14].map((p) => Array.from({ length: Math.ceil(n / p) }, (_, k) => k * p)).concat([[0]]);

/** Axe d'une liste courte (jours de la semaine…) : tous, puis un sur deux, sur trois… */
export function axeSimple(libelles) {
  const pas = [1, 2, 3, 4, 6, 8, 12].filter((p) => p === 1 || p < libelles.length);
  return pas.map((p) => libelles.map((l, i) => ({ i, l })).filter((c) => c.i % p === 0 && c.l));
}

/**
 * Choisit les libellés à dessiner : le premier jeu dont les libellés réguliers tiennent
 * côte à côte (ECART_LIBELLES entre deux), les « fort » d'abord, puis les facultatifs qui
 * ont la place. Si aucun jeu ne tient, le plus clairsemé, libellé par libellé. Le centre
 * d'un libellé trop près d'un bord est rentré pour qu'il ne soit jamais coupé.
 * x(i) : centre du point i ; mesurer(texte, gras) : largeur en pixels ; gauche : aucun
 * libellé ne commence avant (29/10 : début du tracé, jamais sous le « 0 € » de l'axe vertical).
 */
export function placerAxe(jeux, { x, largeur, mesurer, ecart = ECART_LIBELLES, gauche = 0 }) {
  if (!(largeur > 0) || !jeux?.length) return [];
  const g0 = Math.max(0, gauche);
  const boite = (c) => {
    const w = mesurer(c.l, Boolean(c.gras || c.annee));
    const cx = Math.min(Math.max(x(c.i), g0 + w / 2), largeur - w / 2);
    return { ...c, x: cx, g: cx - w / 2, d: cx + w / 2, trop: w > largeur - g0 };
  };
  const libre = (pris, b) => !b.trop && pris.every((p) => b.d + ecart <= p.g || b.g >= p.d + ecart);
  const placer = (jeu, strict) => {
    const bs = jeu.filter((c) => c.l).map(boite);
    const pris = [];
    for (const b of bs) if (b.fort && libre(pris, b)) pris.push(b);
    const forts = [...pris];
    for (const b of bs) {
      if (b.fort || b.facultatif || !libre(forts, b)) continue; // touche « auj. » : s'efface
      if (libre(pris, b)) pris.push(b);
      else if (strict) return null; // deux libellés réguliers se touchent : jeu suivant
    }
    for (const b of bs) if (b.facultatif && libre(pris, b)) pris.push(b);
    return pris.sort((a, b) => a.x - b.x);
  };
  for (const jeu of jeux) { const r = placer(jeu, true); if (r) return r; }
  return placer(jeux[jeux.length - 1], false);
}

/** Largeur approchée d'un texte (repli sans canvas : selftest, rendu serveur) — volontairement large. */
export const largeurApprochee = (taille) => (texte, gras) => texte.length * taille * (gras ? 0.64 : 0.6);
