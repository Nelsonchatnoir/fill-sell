// ═══════════════════════════════════════════════════════════════════════════
// LA CATÉGORIE PAR LE MOT — étape 2 du chantier « sortir de l'emoji »
// ═══════════════════════════════════════════════════════════════════════════
// L'IA nomme l'objet en français (étape 1, generate-listing v94 : « chapka »,
// « taie d'oreiller », « lave-vaisselle »). Ici on résout ce mot contre NOS
// ARBRES RELEVÉS, chez nous, SANS IA : recherche texte sur les feuilles, c'est
// instantané et gratuit.
//
// ⛔ LA RÈGLE ABSOLUE : EXACT, OU RIEN.
// Une correspondance exacte, unique après filtrage par genre, donne la
// catégorie. Tout le reste — plusieurs candidats, ou seulement des voisins —
// ne décide RIEN ici : ça remonte en `candidats`, à l'étape 3 (l'IA choisit
// DANS cette liste, sa réponse vérifiée contre elle) puis à l'étape 4 (la
// suggestion de la plateforme). Jamais une catégorie approchée.
//
// ⛔ ET L'IA NE PEUT PLUS INVENTER : les feuilles viennent des relevés
// (docs/*.txt, arbres générés par scripts/gen-arbres-feuilles.mjs). Une
// catégorie qui n'a pas été relevée n'existe pas dans ce module.
//
// Les index sont chargés en `import()` DYNAMIQUE : 323 Ko qui ne pèsent rien
// tant qu'on ne publie pas, et une seule fois par session.
// ═══════════════════════════════════════════════════════════════════════════

import { texteComparable } from "./texteComparable";

const CACHE = new Map();

/** Les feuilles relevées d'une plateforme, chargées à la demande. */
export async function feuillesDe(plateforme) {
  if (CACHE.has(plateforme)) return CACHE.get(plateforme);
  let mod = null;
  switch (plateforme) {
    case "vinted": mod = await import("./arbres/vintedFeuilles.js"); break;
    case "ebay": mod = await import("./arbres/ebayFeuilles.js"); break;
    case "beebs": mod = await import("./arbres/beebsFeuilles.js"); break;
    case "leboncoin": mod = await import("./arbres/leboncoinFeuilles.js"); break;
    default: return [];
  }
  const feuilles = mod?.FEUILLES ?? [];
  CACHE.set(plateforme, feuilles);
  return feuilles;
}

// Mots vides des libellés d'arbre : ils ne portent aucune information d'objet
// et feraient matcher n'importe quoi avec n'importe quoi.
const VIDES = new Set([
  "de", "des", "du", "le", "la", "les", "l", "d", "et", "ou", "a", "au", "aux",
  "en", "pour", "par", "sur", "avec", "autre", "autres", "divers", "accessoire",
  "accessoires", "articles", "article",
]);

/**
 * Découpe en jetons COMPARABLES : minuscules sans accents, ponctuation ôtée,
 * pluriels réguliers ramenés au singulier (« taies » → « taie », « jeux » →
 * « jeu »). C'est le même besoin que le correctif du pluriel des mots-objets :
 * un arbre écrit « Taies d'oreiller » et l'IA dit « taie d'oreiller ».
 */
export function jetons(s) {
  return texteComparable(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/(?<=\p{L}{3})[sx]$/u, ""))
    .filter((t) => t && !VIDES.has(t));
}

/** Les jetons de deux libellés sont-ils le MÊME ensemble ? (ordre indifférent) */
function memeEnsemble(a, b) {
  if (a.length !== b.length || !a.length) return false;
  const sa = [...a].sort().join(" ");
  const sb = [...b].sort().join(" ");
  return sa === sb;
}

/** Tous les jetons de `petit` sont-ils dans `grand` ? */
function inclus(petit, grand) {
  if (!petit.length) return false;
  const g = new Set(grand);
  return petit.every((t) => g.has(t));
}

// ── LE GENRE CONTRAINT LA BRANCHE ────────────────────────────────────────────
// Les arbres Vinted, eBay et Beebs sont GENRÉS jusqu'aux accessoires : la même
// feuille « Bonnets » existe sous Femmes, Hommes et Enfants. Sans le genre, un
// mot exact rend plusieurs feuilles — donc aucune certitude, donc l'étape 3.
// Leboncoin n'est PAS genré (son équivalent est le critère « Univers »,
// rempli à part) : aucun filtre n'y est appliqué.
const BRANCHES = [
  [/(^|\W)(femmes?|women)(\W|$)/i, "femme"],
  [/(^|\W)(hommes?|men)(\W|$)/i, "homme"],
  [/(^|\W)filles?(\W|$)/i, "fille"],
  [/(^|\W)gar[çc]ons?(\W|$)/i, "garcon"],
  [/(^|\W)b[ée]b[ée]s?(\W|$)/i, "bebe"],
  [/(^|\W)(enfants?|junior)(\W|$)/i, "enfant"],
];

/** La branche de genre d'un chemin, ou null s'il n'en porte aucune. */
export function brancheGenre(chemin) {
  const texte = chemin.join(" > ");
  for (const [re, nom] of BRANCHES) if (re.test(texte)) return nom;
  return null;
}

// Ce que le genre de la fiche ACCEPTE comme branche. « Enfant » accepte les
// trois branches enfantines (nos copies ne distinguent pas toujours) ; « Mixte »
// et « Unisexe » n'accordent RIEN — ce sont des non-réponses, et une
// non-réponse ne doit jamais servir à trancher.
const ACCEPTE = {
  femme: ["femme"], homme: ["homme"],
  fille: ["fille", "enfant"], garcon: ["garcon", "enfant"],
  bebe: ["bebe", "enfant"], enfant: ["enfant", "fille", "garcon"],
};

function genreNormalise(genre) {
  const g = texteComparable(genre);
  if (/^femmes?$/.test(g)) return "femme";
  if (/^hommes?$/.test(g)) return "homme";
  if (/^filles?$/.test(g)) return "fille";
  if (/^gar[cç]ons?$/.test(g)) return "garcon";
  if (/^b[ée]b[ée]s?$/.test(g)) return "bebe";
  if (/^enfants?$/.test(g)) return "enfant";
  return null;
}

/**
 * Résout un mot-objet contre l'arbre relevé d'une plateforme.
 *
 * @param {string} mot        le nom rendu par l'IA (« taie d'oreiller »)
 * @param {string} plateforme "vinted" | "ebay" | "beebs" | "leboncoin"
 * @param {object} [opts]
 * @param {string} [opts.genre] genre de la fiche, s'il est connu
 * @returns {Promise<{chemin: string[]|null, id: string|null, certitude: "exact"|null,
 *                    candidats: Array<{chemin: string[], id: string|null}>, motif: string}>}
 */
export async function resoudreParMot(mot, plateforme, { genre = "" } = {}) {
  const vide = { chemin: null, id: null, certitude: null, candidats: [], motif: "" };
  const jm = jetons(mot);
  if (!jm.length) return { ...vide, motif: "aucun mot exploitable" };

  const feuilles = await feuillesDe(plateforme);
  if (!feuilles.length) return { ...vide, motif: `arbre ${plateforme} indisponible` };

  const g = genreNormalise(genre);
  const accepte = g ? new Set(ACCEPTE[g] ?? [g]) : null;
  // Une feuille GENRÉE est écartée quand la fiche dit un autre genre. Une
  // feuille SANS genre (Maison, Électronique…) passe toujours : le genre n'y
  // veut rien dire.
  const compatible = (f) => {
    if (!accepte) return true;
    const b = brancheGenre(f.chemin);
    return b === null || accepte.has(b);
  };

  const exacts = [];
  const proches = [];
  for (const f of feuilles) {
    const jf = jetons(f.chemin[f.chemin.length - 1]);
    if (!jf.length) continue;
    if (memeEnsemble(jm, jf)) exacts.push(f);
    else if (inclus(jm, jf) || inclus(jf, jm)) proches.push(f);
  }

  const exactsOk = exacts.filter(compatible);
  if (exactsOk.length === 1) {
    return {
      chemin: exactsOk[0].chemin, id: exactsOk[0].id, certitude: "exact", candidats: [],
      motif: `« ${mot} » = la feuille « ${exactsOk[0].chemin[exactsOk[0].chemin.length - 1] }` +
        ` » de l'arbre ${plateforme}${g ? ` (genre ${g})` : ""}`,
    };
  }

  // Plusieurs feuilles exactes (le même mot sous plusieurs branches), ou
  // seulement des voisins : AUCUNE décision ici. On rend les candidats — au
  // plus 20, l'ordre des relevés — et l'appelant tranche par l'étape 3 ou 4.
  const candidats = (exactsOk.length ? exactsOk : proches.filter(compatible)).slice(0, 20);
  return {
    ...vide,
    candidats,
    motif: exactsOk.length
      ? `« ${mot} » correspond à ${exactsOk.length} feuilles ${plateforme} — genre insuffisant pour trancher`
      : candidats.length
        ? `« ${mot} » n'a aucune feuille exacte dans l'arbre ${plateforme} — ${candidats.length} voisines`
        : `« ${mot} » est inconnu de l'arbre ${plateforme}`,
  };
}

export const _internes = { memeEnsemble, inclus, genreNormalise, ACCEPTE, VIDES };
