// ═══════════════════════════════════════════════════════════════════════════
// « TU AS DÉJÀ QUELQUE CHOSE QUI RESSEMBLE » (2026-09-20, passe 2, point 6-a)
// ═══════════════════════════════════════════════════════════════════════════
// LE 20/09 À 11:56, en une minute, louis@ttfamily.fr a importé une
// cinquantaine d'annonces depuis l'écran de rattachement. DIX d'entre elles
// ont créé une deuxième ligne pour un article qu'il avait déjà : les sept
// tomes de « Une, deux, trois princesses » (l'article s'appelait « … tome 3 »,
// l'annonce « … tome 3 l'invité fantôme »), « sœurs sorcières », « Jeu des
// acrobates », et deux « père Noël » qui se sont doublés entre eux.
//
// L'écran ne lui a jamais rien dit. La garde posée le même jour dans
// `rapprocher_importer` ne couvre QUE le chemin automatique — délibérément :
// quand quelqu'un clique « importer », il a vu les deux et il décide.
// Sauf qu'ici il n'avait PAS vu les deux : le faisceau compare mot à mot et
// ne propose rien quand un titre est simplement plus long que l'autre.
//
// ⛔ ON PRÉVIENT, ON N'INTERDIT PAS. Le bouton « Importer comme nouvel
//    article » reste exactement où il est, actif, au même endroit. On ajoute
//    une phrase et un bouton qui rattache — rien de plus.
// ⛔ MÊME RÈGLE QUE LA BASE, AU CARACTÈRE PRÈS : titres normalisés
//    (accents, ponctuation, casse, espaces), inclusion AUX FRONTIÈRES DE MOTS,
//    les deux au-delà de 12 caractères. Si les deux divergeaient, l'écran
//    promettrait une chose et le serveur en ferait une autre.
//    Côté SQL : `titre_norm()` + `' '||a||' ' LIKE '% '||b||' %'`.

/** La même normalisation que `public.titre_norm` en base. */
export function titreNorm(t) {
  return String(t ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ── LA COULEUR ET LE NOMBRE EXCLUENT (2026-09-23, kits de Louis) ────────────
// « Rangement Blanc » est CONTENU dans « Rangement Blanc et Vert Pomme pour
// 12 pots… » aux frontières de mots : la règle d'inclusion en faisait un
// jumeau. Deux couleurs différentes, ce sont deux kits. Même règle que la
// garde SQL (rapprocher_importer, migration 20260924090000) et que l'alerte
// de l'écran Publier : src/utils/variantesTitre.js.
import { variantesIncompatibles } from './variantesTitre.js';

/** Deux titres désignent-ils visiblement le même objet ? */
export function titresJumeaux(a, b) {
  const x = titreNorm(a);
  const y = titreNorm(b);
  if (x.length <= 12 || y.length <= 12) return false;
  if (variantesIncompatibles(a, b).incompatibles) return false;
  if (x === y) return true;
  return ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `);
}

/** L'article du stock qui ressemble le plus à cette annonce, ou null.
 *  Le titre EXACTEMENT identique passe devant ; sinon le plus ancien, comme
 *  en base (`ORDER BY (titre_norm = …) DESC, created_at ASC`). */
export function jumeauProbable(titreAnnonce, articles) {
  const cible = titreNorm(titreAnnonce);
  if (cible.length <= 12 || !Array.isArray(articles)) return null;
  let exact = null;
  let inclus = null;
  for (const i of articles) {
    const t = titreNorm(i?.title ?? i?.titre);
    if (t.length <= 12) continue;
    // Une autre couleur ou un autre nombre : un autre objet, jamais un jumeau.
    if (variantesIncompatibles(titreAnnonce, i?.title ?? i?.titre).incompatibles) continue;
    if (t === cible) { if (!exact) exact = i; continue; }
    if ((` ${cible} `.includes(` ${t} `) || ` ${t} `.includes(` ${cible} `)) && !inclus) inclus = i;
  }
  return exact ?? inclus ?? null;
}

export default jumeauProbable;
