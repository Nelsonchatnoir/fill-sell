// ═══════════════════════════════════════════════════════════════════════════
// QUAND LE RAYON CONTREDIT L'ARTICLE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// TROUVÉ EN TESTANT, le 20/09 : j'ai posé à la main le rayon Beebs
// « Mode › Garçon › Vêtements (garçon) › Pantalons et jeans (garçon) » sur un
// jogging de FEMME en XS. Rien ne m'a prévenu. Beebs a refusé le dépôt sur la
// taille — « XS / 34 » n'existe pas dans une grille enfant — et je ne l'ai
// appris qu'après coup, par le refus de la plateforme.
// La garde hors-grille (f3b43c9) attrape la TAILLE. Elle ne dit rien du
// GENRE : un vêtement de femme au rayon garçon avec une taille enfant valide
// passerait sans un mot, et partirait au mauvais endroit.
//
// 🚨 ON PRÉVIENT, ON N'INTERDIT PAS.
//    « Un rayon choisi par la personne n'est jamais recalculé » est la règle
//    nº1 et elle ne bouge pas d'un pouce ici : ce module ne modifie RIEN, ne
//    bloque RIEN, ne repose aucune question. Il rend une PHRASE, ou null.
//    Le vendeur a le droit d'avoir raison contre nous — un jogging unisexe
//    au rayon garçon peut être un choix délibéré, et c'est le sien.
//
// ⛔ ON NE PARLE QUE DE CE QU'ON SAIT DES DEUX CÔTÉS. Pas de genre sur la
//    fiche → pas d'avis. Pas de marqueur dans le chemin → pas d'avis. Le
//    doute ne produit jamais de bandeau : c'est la doctrine permissive du
//    02/09, et c'est ce qui empêche ce genre d'avertissement de devenir un
//    bruit qu'on apprend à ignorer.

const sansAccents = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Les marqueurs que les arbres des plateformes posent dans leurs chemins.
 *  `classe` : à qui l'article est destiné. `sexe` : null = non genré. */
const MARQUEURS = [
  { motif: /\bgarcons?\b/,            classe: 'enfant', sexe: 'M', mot: 'garçon' },
  { motif: /\bfilles?\b/,             classe: 'enfant', sexe: 'F', mot: 'fille' },
  { motif: /\bbebes?\b/,              classe: 'bebe',   sexe: null, mot: 'bébé' },
  { motif: /\benfants?\b/,            classe: 'enfant', sexe: null, mot: 'enfant' },
  { motif: /\bhommes?\b/,             classe: 'adulte', sexe: 'M', mot: 'homme' },
  { motif: /\bfemmes?\b/,             classe: 'adulte', sexe: 'F', mot: 'femme' },
];

/** Ce que la FICHE dit d'elle-même (genre / univers, valeurs canoniques FR). */
const DIT_LA_FICHE = [
  { motif: /^gar[cç]on/,  classe: 'enfant', sexe: 'M', mot: 'Garçon' },
  { motif: /^fille/,      classe: 'enfant', sexe: 'F', mot: 'Fille' },
  { motif: /^bebe/,       classe: 'bebe',   sexe: null, mot: 'Bébé' },
  { motif: /^enfant/,     classe: 'enfant', sexe: null, mot: 'Enfant' },
  { motif: /^homme/,      classe: 'adulte', sexe: 'M', mot: 'Homme' },
  { motif: /^femme/,      classe: 'adulte', sexe: 'F', mot: 'Femme' },
  { motif: /^maternite/,  classe: 'adulte', sexe: 'F', mot: 'Maternité' },
];

/** Le marqueur porté par le chemin du rayon. Le PLUS PRÉCIS gagne : un chemin
 *  « Mode › Garçon › Vêtements (garçon) » dit garçon, pas seulement enfant. */
export function marqueurDuRayon(chemin) {
  if (!Array.isArray(chemin) || !chemin.length) return null;
  const texte = sansAccents(chemin.join(' '));
  let trouve = null;
  for (const m of MARQUEURS) {
    if (!m.motif.test(texte)) continue;
    // Un marqueur SEXUÉ (garçon/fille/homme/femme) prime sur le générique
    // (enfant) : c'est lui qui porte l'information.
    if (!trouve || (m.sexe && !trouve.sexe)) trouve = m;
  }
  return trouve;
}

/** Ce que la fiche dit — genre d'abord (c'est le champ le plus précis),
 *  univers en repli (Leboncoin ne connaît que lui). */
export function marqueurDeLaFiche(pf) {
  for (const brut of [pf?.genre, pf?.univers]) {
    const v = sansAccents(brut);
    if (!v) continue;
    const m = DIT_LA_FICHE.find((d) => d.motif.test(v));
    if (m) return m;
  }
  return null;
}

/**
 * Le rayon contredit-il la fiche ? Rend `null` (rien à dire) ou
 * `{ motif, rayon, fiche }` où `motif` vaut 'age' ou 'sexe'.
 *
 * Deux contradictions, et deux seulement :
 *   · l'ÂGE  — un rayon enfant/bébé pour un article adulte, ou l'inverse.
 *              C'est celle qui casse les grilles de taille, donc les dépôts.
 *   · le SEXE — rayon garçon/homme contre fiche fille/femme (et l'inverse).
 * Tout le reste se tait.
 */
export function rayonContreditLaFiche(chemin, pf) {
  const r = marqueurDuRayon(chemin);
  const f = marqueurDeLaFiche(pf);
  if (!r || !f) return null;
  // « bébé » et « enfant » ne se contredisent pas entre eux : les arbres les
  // emboîtent (Mode › Enfant › Bébé) et les fiches n'ont pas cette finesse.
  const jeune = (c) => c === 'enfant' || c === 'bebe';
  if (jeune(r.classe) !== jeune(f.classe)) {
    return { motif: 'age', rayon: r.mot, fiche: f.mot };
  }
  if (r.sexe && f.sexe && r.sexe !== f.sexe) {
    return { motif: 'sexe', rayon: r.mot, fiche: f.mot };
  }
  return null;
}

/** La phrase affichée. Elle NOMME les deux camps et ne tranche pas : c'est au
 *  vendeur de dire qui a raison. Jamais d'impératif, jamais de blocage. */
export function phraseIncoherence(inc, lang = 'fr') {
  if (!inc) return null;
  if (lang === 'en') {
    return inc.motif === 'age'
      ? `This aisle is a “${inc.rayon}” one, and your item says “${inc.fiche}”. Sizes and shipping differ — check it's the right aisle.`
      : `This aisle is a “${inc.rayon}” one, and your item says “${inc.fiche}”. Check it's the right aisle.`;
  }
  return inc.motif === 'age'
    ? `Ce rayon est un rayon « ${inc.rayon} », et ta fiche dit « ${inc.fiche} ». Les tailles et la livraison n'y sont pas les mêmes — vérifie que c'est le bon.`
    : `Ce rayon est un rayon « ${inc.rayon} », et ta fiche dit « ${inc.fiche} ». Vérifie que c'est le bon.`;
}
