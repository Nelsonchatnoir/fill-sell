// ═══════════════════════════════════════════════════════════════════════════
// VARIANTES DE TITRE — la COULEUR et le NOMBRE excluent (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Louis, 23/09 : « Rangement Blanc et Noir pour 12 pots… » et « Rangement
// Blanc et Gris pour 12 pots… » sont DEUX kits (deux annonces Beebs, deux
// annonces Leboncoin), et tout les rapprochait — 0,89 de recouvrement au
// faisceau SQL, « ≥ 4 mots en commun » pour l'alerte de l'écran Publier, et
// la MÊME PHOTO (dHash 0 : Louis réutilise la photo entre couleurs). Seul le
// titre les distingue, par sa couleur.
//
// RÈGLE : deux titres qui portent tous deux des couleurs, ou tous deux des
// nombres, et qui ne portent pas LES MÊMES, désignent deux objets. Ils ne
// sont JAMAIS rapprochés — ni proposés, ni alertés, ni importés comme jumeau
// — quoi que disent les mots communs ou les photos.
//   · couleur : la phrase de couleur (« vert pomme », « bleu ciel », « gris
//     anthracite ») compte entière ; « vert pomme » ≠ « vert » ;
//   · nombre : « 8 ans » ≠ « 10 ans », « tome 1 » ≠ « tome 6 », « 12 pots » ≠
//     « 6 pots », « 1000 pièces » ≠ « 500 pièces » ;
//   · un seul côté renseigné (« Puzzle Vilainous » / « Puzzle Vilainous 1000
//     pièces ») n'exclut rien : c'est le même objet, décrit plus ou moins.
//
// ⛔ MIROIR EXACT de `public.titres_variantes_incompatibles` (migration
//    20260924090000) — même liste de couleurs, même normalisation
//    (titre_norm : accents, minuscules, tout ce qui n'est ni lettre ni
//    chiffre devient une espace). scripts/variantes-titre-selftest.mjs
//    compare la liste SQL et celle-ci à l'octet.

import { titreNorm } from './rapprochementJumeau.js';

// ⟦couleurs:début⟧
export const COULEURS = ['blanc', 'noir', 'gris', 'bleu', 'vert', 'rouge', 'rose', 'jaune', 'orange', 'violet', 'marron', 'beige', 'turquoise', 'dore', 'argente', 'bordeaux', 'kaki', 'camel', 'creme', 'ecru', 'fuchsia', 'lilas', 'mauve', 'marine', 'anthracite', 'taupe', 'corail', 'ivoire', 'multicolore', 'transparent', 'chocolat', 'moutarde', 'saumon', 'prune', 'aubergine', 'menthe', 'olive', 'cuivre', 'bronze', 'lavande', 'peche', 'framboise', 'cerise', 'emeraude', 'sable', 'indigo', 'or'];
// ⟦couleurs:fin⟧
// Féminins et pluriels → la forme de base.
// ⟦couleurs-formes:début⟧
export const COULEURS_FORMES = { blanche: 'blanc', blanches: 'blanc', blancs: 'blanc', noire: 'noir', noires: 'noir', noirs: 'noir', grise: 'gris', grises: 'gris', bleue: 'bleu', bleues: 'bleu', bleus: 'bleu', verte: 'vert', vertes: 'vert', verts: 'vert', rouges: 'rouge', roses: 'rose', jaunes: 'jaune', violette: 'violet', violettes: 'violet', violets: 'violet', marrons: 'marron', beiges: 'beige', doree: 'dore', dorees: 'dore', dores: 'dore', argentee: 'argente', argentees: 'argente', argentes: 'argente', argent: 'argente', turquoises: 'turquoise' };
// ⟦couleurs-formes:fin⟧
// Le mot qui, juste après une couleur, en fait une nuance : « vert pomme »,
// « bleu ciel », « gris clair ». Une couleur de base peut aussi être une
// nuance (« bleu marine », « gris anthracite », « rouge bordeaux ») : elle est
// alors absorbée par la phrase, jamais comptée seule.
// ⟦nuances:début⟧
export const NUANCES = ['pomme', 'ciel', 'clair', 'claire', 'fonce', 'foncee', 'marine', 'roi', 'pale', 'anthracite', 'perle', 'nuit', 'canard', 'pastel', 'vif', 'vive', 'fluo', 'menthe', 'olive', 'sapin', 'kaki', 'bordeaux', 'corail', 'saumon', 'poudre', 'lavande', 'lilas', 'prune', 'cerise', 'brique', 'rouille', 'terracotta', 'moutarde', 'citron', 'dore', 'cuivre', 'chocolat', 'taupe', 'sable', 'beige', 'creme', 'ecru', 'ivoire', 'casse', 'nacre', 'turquoise', 'petrole', 'emeraude', 'or', 'argent', 'argente', 'framboise', 'peche', 'indigo', 'electrique', 'glacier', 'gris', 'bleu', 'vert', 'rose', 'rouge', 'jaune', 'orange', 'violet', 'noir', 'blanc'];
// ⟦nuances:fin⟧

const NOMBRE_RE = /^\d+$/;

/** Les phrases de couleur d'un titre, dans l'ordre, dédoublonnées, triées. */
export function couleursDuTitre(titre) {
  const mots = titreNorm(titre).split(' ').filter(Boolean).map((m) => COULEURS_FORMES[m] ?? m);
  const phrases = [];
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    if (!COULEURS.includes(m)) continue;
    const suivant = mots[i + 1] ? (COULEURS_FORMES[mots[i + 1]] ?? mots[i + 1]) : null;
    if (suivant && NUANCES.includes(suivant) && suivant !== m && suivant !== 'et') {
      phrases.push(`${m} ${suivant}`);
      i += 1; // la nuance est absorbée
    } else {
      phrases.push(m);
    }
  }
  return [...new Set(phrases)].sort();
}

/** Les nombres nus d'un titre (« 12 », « 1000 », « 8 »), dédoublonnés, triés. */
export function nombresDuTitre(titre) {
  const mots = titreNorm(titre).split(' ').filter(Boolean);
  // Les DÉCENNIES se lisent (2026-09-25, pichet de Jocabroc : « années 30 »
  // sur Vinted, « années 1930 » sur eBay = le même objet, pas deux) :
  // « années 30 » → 1930, « 70s » → 1970. Miroir de public.titre_nombres
  // (migration 20260925150000).
  const nombres = mots.map((m, i) => {
    if (/^[1-9]0s$/.test(m)) return `19${m.slice(0, 2)}`;
    if (/^[1-9]0$/.test(m) && i > 0 && /^annees?$/.test(mots[i - 1])) return `19${m}`;
    return m;
  });
  return [...new Set(nombres.filter((m) => NOMBRE_RE.test(m)))].sort();
}

const memes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Deux titres désignent-ils VISIBLEMENT deux variantes (couleur ou nombre) ?
 * Rend { incompatibles, motif, couleurs: [a, b], nombres: [a, b] }.
 * `motif` vaut 'couleur' ou 'nombre' quand c'est incompatible, sinon null.
 */
export function variantesIncompatibles(titreA, titreB) {
  const ca = couleursDuTitre(titreA), cb = couleursDuTitre(titreB);
  if (ca.length && cb.length && !memes(ca, cb)) {
    return { incompatibles: true, motif: 'couleur', couleurs: [ca, cb], nombres: [nombresDuTitre(titreA), nombresDuTitre(titreB)] };
  }
  const na = nombresDuTitre(titreA), nb = nombresDuTitre(titreB);
  if (na.length && nb.length && !memes(na, nb)) {
    return { incompatibles: true, motif: 'nombre', couleurs: [ca, cb], nombres: [na, nb] };
  }
  return { incompatibles: false, motif: null, couleurs: [ca, cb], nombres: [na, nb] };
}

export default variantesIncompatibles;
