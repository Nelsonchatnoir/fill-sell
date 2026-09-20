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
  // Le motif 'taille' (20/09, passe 3) : la grille du rayon et la taille de
  // l'article ne parlent pas le même système. Même ton que les deux autres —
  // on nomme les deux camps et on ne tranche pas.
  if (inc.motif === 'taille') {
    const en = { 'en mois': 'in months', 'en années': 'in years', 'en lettres': 'in letters', 'en chiffres': 'in numbers' };
    return lang === 'en'
      ? `This aisle uses sizes ${en[inc.rayon] ?? inc.rayon}, and your item gives one ${en[inc.fiche] ?? inc.fiche}. That usually means it was filed too young or too old — check it's the right aisle.`
      : `Ce rayon a des tailles ${inc.rayon}, et ta fiche en donne une ${inc.fiche}. C'est souvent le signe qu'il a été rangé trop jeune ou trop vieux — vérifie que c'est le bon.`;
  }
  if (lang === 'en') {
    return inc.motif === 'age'
      ? `This aisle is a “${inc.rayon}” one, and your item says “${inc.fiche}”. Sizes and shipping differ — check it's the right aisle.`
      : `This aisle is a “${inc.rayon}” one, and your item says “${inc.fiche}”. Check it's the right aisle.`;
  }
  return inc.motif === 'age'
    ? `Ce rayon est un rayon « ${inc.rayon} », et ta fiche dit « ${inc.fiche} ». Les tailles et la livraison n'y sont pas les mêmes — vérifie que c'est le bon.`
    : `Ce rayon est un rayon « ${inc.rayon} », et ta fiche dit « ${inc.fiche} ». Vérifie que c'est le bon.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LA TAILLE TRAHIT LE RAYON (2026-09-20, passe 3, point 6-e)
// ═══════════════════════════════════════════════════════════════════════════
// LES SIX REFUS OPLA « taille hors grille », relevés un par un :
//   · Robe Biloba 12-18 mois → Femmes › Robes (genre Fille) ......... ÂGE, déjà attrapé
//   · Pull Coca-Cola XXS-XS  → Enfants › filles › Pulls, grille 0M… . TAILLE
//   · Legging enfant 5 ans   → Enfants › filles › Leggings, grille 0M… TAILLE
//   · Camaïeu Blue Dress 38  → Femmes › Robes, grille XXS…8XL ....... rayon JUSTE
//   · Maje robe, taille vide → Femmes › Robes ....................... rayon JUSTE
//   · Nike 44.5              → Hommes › Baskets, grille sans demi ... rayon JUSTE
//
// L'alerte âge/sexe était MUETTE sur les deux du milieu, et elle avait
// raison : « Enfants › Vêtements pour filles » contre une fiche « Fille »,
// c'est cohérent. Ce qui ne l'est pas, c'est la GRILLE : ces feuilles
// `*_GIRLS_NEW` d'Opla sont des rayons BÉBÉ, leur grille va de 0M à 24M. Un
// « XS » ou un « 5 ans » là-dedans dit que le rayon est trop jeune — et le
// dit AVANT le refus.
//
// ⛔ CE QU'ON NE FAIT PAS, ET LA RÈGLE EST CELLE DU 18/09 (_shared/tailles.js,
//    « TRADUIRE, JAMAIS CONVERTIR ») :
//      · « 38 » → « M » : NON. C'est une conversion de système, pas une
//        traduction. Un 38 Camaïeu n'est pas un 38 Zara. On DEMANDE, et la
//        question offre déjà les 14 valeurs de la grille.
//      · « 44.5 » → « 44 » ou « 45 » : NON, JAMAIS. L'en-tête de
//        _shared/tailles.js nomme ce cas précis. C'est une autre pointure.
//    Champ vide plutôt que champ menteur — et question plutôt que champ vide
//    quand la personne, elle, sait.
// ⛔ CE SIGNAL NE BLOQUE RIEN : il alimente la même alerte ambre que l'âge et
//    le sexe. On prévient, on n'interdit pas.

/** Le SYSTÈME d'une taille : 'mois' · 'ans' · 'lettre' · 'nombre' · 'unique'.
 *  null quand on ne sait pas — et alors on se tait. */
export function systemeDeTaille(brut) {
  const v = sansAccents(brut).replace(/[.,]/g, '.').trim();
  if (!v) return null;
  if (/^(taille[_ ]?unique|unique|os|one size)$/.test(v)) return 'unique';
  if (/(^|\b)\d{1,2}\s*-?\s*\d{0,2}\s*m(ois)?\b/.test(v) || /^\d{1,2}m$/.test(v)) return 'mois';
  if (/\b\d{1,2}\s*(ans?|y)\b/.test(v) || /^\d{1,2}y$/.test(v)) return 'ans';
  if (/^(xx?x?s|s|m|l|xx?x?l|[2-9]xl)$/.test(v)) return 'lettre';
  if (/^\d{1,3}([.]\d)?$/.test(v)) return 'nombre';
  return null;
}

/** Le système MAJORITAIRE d'une grille de valeurs. null si elle est muette
 *  ou si aucun système ne domine — on ne conclut jamais sur un brouillard. */
export function systemeDeLaGrille(grille) {
  const valeurs = (Array.isArray(grille) ? grille : [])
    .map((o) => (typeof o === 'string' ? o : (o?.code ?? o?.title ?? '')));
  const compte = {};
  for (const v of valeurs) {
    const s = systemeDeTaille(v);
    if (!s || s === 'unique') continue;   // TAILLE_UNIQUE vit dans toutes les grilles
    compte[s] = (compte[s] ?? 0) + 1;
  }
  const paires = Object.entries(compte).sort((a, b) => b[1] - a[1]);
  if (!paires.length) return null;
  const total = paires.reduce((n, [, c]) => n + c, 0);
  // Il faut une VRAIE majorité : une grille mélangée ne prouve rien.
  return paires[0][1] * 2 > total ? paires[0][0] : null;
}

/** La taille de l'article contredit-elle la grille du rayon ?
 *  Rend `{ motif:'taille', rayon, fiche }` ou null. */
export function tailleContreditLaGrille(taille, grille) {
  const tSys = systemeDeTaille(taille);
  const gSys = systemeDeLaGrille(grille);
  if (!tSys || !gSys || tSys === 'unique') return null;
  if (tSys === gSys) return null;
  // ⛔ lettre ↔ nombre : ce n'est PAS un rayon faux, c'est un système
  //    d'habillement différent (FR 38 contre S/M/L). On se tait : la question
  //    de taille, elle, offre déjà la grille.
  const adulte = (s) => s === 'lettre' || s === 'nombre';
  if (adulte(tSys) && adulte(gSys)) return null;
  const nom = { mois: 'en mois', ans: 'en années', lettre: 'en lettres', nombre: 'en chiffres' };
  return { motif: 'taille', rayon: nom[gSys], fiche: nom[tSys] };
}
