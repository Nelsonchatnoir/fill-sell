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
import { familleDeChemin, famillesCompatibles } from "./familleCategorie";

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
//
// ⛔ « ACCESSOIRE(S) », « POUR », « ARTICLE(S) » EN SONT SORTIS (2026-09-12).
// Ils y étaient au motif qu'ils « ne qualifient pas un objet ». C'est faux :
// « accessoires POUR sacs à main » n'est pas un qualificatif de sac à main,
// c'est un AUTRE objet (bandoulières, breloques, porte-clés). Escamotés, les
// deux libellés rendaient le même ensemble de jetons, donc une correspondance
// EXACTE et unique, donc une catégorie posée avec certitude — sans recours,
// puisqu'une source certaine désarme aussi la règle n°2.
// Deux cas réels le 12/09 : le sac doré de sandrine_mimi rangé en
// « Accessoires pour sacs à main » (163570), et un lot de 3 jeux Switch rangé
// en « Articles de jeux vidéo » (38583), c'est-à-dire les goodies — une
// catégorie à required_count=0, que RIEN n'aurait arrêtée.
//
// Mesure avant retrait (GO Nico, 12/09) : 60 mots-objets réels rendus par l'IA
// sur 90 jours, rejoués sur les 4 arbres = 240 résolutions. 238 INCHANGÉES, et
// les 2 qui changent sont exactement les 2 bugs (« sac à main », « jeu vidéo »)
// — qui passent de « la mauvaise feuille » à « aucune feuille exacte », c'est-
// à-dire à l'étape 3. Pièges d'escamotage : 94 → 26, eBay à ZÉRO.
// Et structurellement : retirer un mot ne peut qu'AJOUTER des jetons, donc
// SCINDER des classes d'équivalence — aucun piège nouveau ne peut naître.
const VIDES = new Set([
  "de", "des", "du", "le", "la", "les", "l", "d", "et", "ou", "a", "au", "aux",
  "en", "par", "sur", "avec", "autre", "autres", "divers",
]);

// Ce qui RESTE escamoté tout en désignant potentiellement autre chose. On les
// garde dans VIDES — « Autres jupes (femme) » EST un rayon de jupes, le bloquer
// serait le faux positif qu'on cherche à éviter (décision Nico 12/09, les 26
// pièges restants sont tous des « Autres X ») — mais on ne leur accorde plus la
// CERTITUDE : jetonsStricts les compte, et le garde-fou ci-dessous s'en sert.
const ESCAMOTAGE_SUSPECT = new Set(["autre", "autres", "divers"]);
const VIDES_STRICTS = new Set([...VIDES].filter((m) => !ESCAMOTAGE_SUSPECT.has(m)));

/**
 * Découpe en jetons COMPARABLES : minuscules sans accents, ponctuation ôtée,
 * pluriels réguliers ramenés au singulier (« taies » → « taie », « jeux » →
 * « jeu »). C'est le même besoin que le correctif du pluriel des mots-objets :
 * un arbre écrit « Taies d'oreiller » et l'IA dit « taie d'oreiller ».
 */
function decoupe(s) {
  return texteComparable(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/(?<=\p{L}{3})[sx]$/u, ""))
    .filter(Boolean);
}

export function jetons(s) {
  return decoupe(s).filter((t) => !VIDES.has(t));
}

/**
 * Les jetons SANS escamoter « autre(s) » ni « divers ». Sert uniquement au
 * garde-fou d'escamotage : deux libellés que `jetons` rend identiques peuvent
 * désigner deux objets différents si l'un porte « Autres ». On ne s'en sert
 * jamais pour APPARIER — seulement pour VÉRIFIER un appariement déjà trouvé.
 */
export function jetonsStricts(s) {
  return decoupe(s).filter((t) => !VIDES_STRICTS.has(t));
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
 * @param {string} [opts.genre]   genre de la fiche, s'il est connu
 * @param {string} [opts.famille] famille CERTAINE de l'objet (familleDeLObjet),
 *                                s'il en a une — une feuille d'une autre
 *                                famille est écartée comme une branche d'un
 *                                autre genre (salopette de mode ≠ combinaison
 *                                de mécanicien, cas dddc7f2a du 10/09)
 * @returns {Promise<{chemin: string[]|null, id: string|null, certitude: "exact"|null,
 *                    candidats: Array<{chemin: string[], id: string|null}>, motif: string}>}
 */
export async function resoudreParMot(mot, plateforme, { genre = "", famille = null } = {}) {
  const vide = { chemin: null, id: null, certitude: null, candidats: [], motif: "", escamotage: null };
  const jm = jetons(mot);
  if (!jm.length) return { ...vide, motif: "aucun mot exploitable" };

  const feuilles = await feuillesDe(plateforme);
  if (!feuilles.length) return { ...vide, motif: `arbre ${plateforme} indisponible` };

  const g = genreNormalise(genre);
  const accepte = g ? new Set(ACCEPTE[g] ?? [g]) : null;
  // Une feuille GENRÉE est écartée quand la fiche dit un autre genre. Une
  // feuille SANS genre (Maison, Électronique…) passe toujours : le genre n'y
  // veut rien dire. Même règle pour la FAMILLE : une feuille dont la famille
  // est connue et incompatible avec celle de l'objet est écartée ; une feuille
  // de famille inconnue passe.
  let horsFamille = 0;
  const compatible = (f) => {
    if (famille && !famillesCompatibles(famille, familleDeChemin(plateforme, f.chemin))) { horsFamille++; return false; }
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
  // ── GARDE-FOU D'ESCAMOTAGE (2026-09-12, GO Nico) ──────────────────────────
  // Une correspondance exacte n'est une CERTITUDE que si elle tient encore
  // quand on cesse d'escamoter. Trois conditions CUMULATIVES avant de retirer
  // la certitude — dans cet ordre, et toutes obligatoires :
  //   (1) on a bien une feuille exacte unique (on est dans ce bloc) ;
  //   (2) relue SANS escamoter, la feuille N'EST PAS le mot — c'est donc
  //       l'escamotage qui a fait l'appariement, pas le libellé ;
  //   (3) il existe dans le MÊME arbre, compatible genre et famille, une autre
  //       feuille qui, elle, EST le mot au sens strict.
  // Sans (3) on ne retire RIEN : une feuille approximative vaut mieux que pas
  // de réponse, et l'étape 3 ne ferait pas mieux avec une liste vide.
  // Quand les trois tiennent : aucune décision ici, la sœur passe en TÊTE des
  // candidats et l'étape 3 tranche. On ne pose jamais la sœur d'autorité —
  // « Autres hauts » vs « Hauts et t-shirts » n'est pas une évidence, et poser
  // d'autorité serait refaire la même faute dans l'autre sens.
  const jmStricts = jetonsStricts(mot);
  let escamotage = null;
  if (exactsOk.length === 1) {
    const f = exactsOk[0];
    const libelle = f.chemin[f.chemin.length - 1];
    if (!memeEnsemble(jmStricts, jetonsStricts(libelle))) {
      const soeur = feuilles.find((g2) =>
        g2 !== f && compatible(g2) && memeEnsemble(jmStricts, jetonsStricts(g2.chemin[g2.chemin.length - 1])));
      if (soeur) {
        escamotage = {
          mot,
          feuille_ecartee: f.chemin, id_ecarte: f.id,
          feuille_stricte: soeur.chemin, id_strict: soeur.id,
          motif: `« ${mot} » n'appariait « ${libelle} » que parce que des mots étaient escamotés ; ` +
            `« ${soeur.chemin[soeur.chemin.length - 1]} » est le mot au sens strict — aucune certitude ici, l'étape 3 tranche`,
        };
      }
    }
  }
  if (exactsOk.length === 1 && !escamotage) {
    return {
      chemin: exactsOk[0].chemin, id: exactsOk[0].id, certitude: "exact", candidats: [],
      motif: `« ${mot} » = la feuille « ${exactsOk[0].chemin[exactsOk[0].chemin.length - 1] }` +
        ` » de l'arbre ${plateforme}${g ? ` (genre ${g})` : ""}`,
    };
  }
  if (escamotage) {
    const soeurDd = feuilles.filter((g2) =>
      compatible(g2) && memeEnsemble(jmStricts, jetonsStricts(g2.chemin[g2.chemin.length - 1])));
    return {
      ...vide,
      escamotage,
      candidats: [...soeurDd, ...exactsOk, ...proches.filter(compatible)]
        .filter((f, i, t) => t.indexOf(f) === i).slice(0, 20),
      motif: escamotage.motif,
    };
  }

  // Plusieurs feuilles exactes (le même mot sous plusieurs branches), ou
  // seulement des voisins : AUCUNE décision ici. On rend les candidats — au
  // plus 20, l'ordre des relevés — et l'appelant tranche par l'étape 3 ou 4.
  const candidats = (exactsOk.length ? exactsOk : proches.filter(compatible)).slice(0, 20);
  const noteFamille = horsFamille ? ` (${horsFamille} feuille(s) d'une autre famille que « ${famille} » écartée(s))` : "";
  return {
    ...vide,
    candidats,
    motif: (exactsOk.length
      ? `« ${mot} » correspond à ${exactsOk.length} feuilles ${plateforme} — genre insuffisant pour trancher`
      : candidats.length
        ? `« ${mot} » n'a aucune feuille exacte dans l'arbre ${plateforme} — ${candidats.length} voisines`
        : `« ${mot} » est inconnu de l'arbre ${plateforme}`) + noteFamille,
  };
}

/**
 * ÉTAPE A du choix assisté : la machine RATISSE, elle ne choisit pas.
 *
 * Rend jusqu'à `max` feuilles qui ressemblent au mot, de près ou de loin. Le
 * tri sert seulement à garder les plus plausibles quand il y en a trop — il ne
 * vaut PAS décision : c'est l'IA qui tranchera dans cette liste (étape B), et
 * elle seule sait qu'une chapka n'est pas un bonnet de douche. Un rapprochement
 * par ressemblance de lettres se planterait ici : mesuré sur l'arbre réel,
 * « bonnet » ne rend que « Bonnets de bain » (Natation) et « Bonnets de
 * douche » (Beauté).
 *
 * ⛔ Seuls les jetons du MOT font entrer une feuille dans la liste. Ceux du
 *    titre ne servent qu'à RE-CLASSER : sans ça, « bébé » d'un titre ferait
 *    entrer des centaines de feuilles et la liste ne voudrait plus rien dire.
 * ⛔ Le genre filtre comme partout : une branche genrée incompatible sort.
 * ⛔ Un mot inconnu de l'arbre rend une liste VIDE — et c'est la bonne réponse.
 *    Les suggestions de la plateforme, elles, sont ajoutées par l'appelant qui
 *    les possède (le worker eBay les a ; l'app ne les a pas).
 */
export async function candidatsParMot(mot, plateforme, { genre = "", titre = "", max = 20, famille = null } = {}) {
  const jm = jetons(mot);
  if (!jm.length) return [];
  const feuilles = await feuillesDe(plateforme);
  if (!feuilles.length) return [];

  const g = genreNormalise(genre);
  const accepte = g ? new Set(ACCEPTE[g] ?? [g]) : null;
  const jt = new Set(jetons(titre));
  const jmSet = new Set(jm);

  const notes = [];
  for (const f of feuilles) {
    // ⛔ La FAMILLE filtre comme le genre : une feuille d'une autre famille que
    //    l'objet n'entre jamais dans la liste soumise à l'IA — c'est ainsi que
    //    « Combinaisons, salopettes » (Auto, moto) était devenue la seule
    //    candidate d'une salopette de mode, et donc son choix (10/09).
    if (famille && !famillesCompatibles(famille, familleDeChemin(plateforme, f.chemin))) continue;
    if (accepte) {
      const b = brancheGenre(f.chemin);
      if (b !== null && !accepte.has(b)) continue;
    }
    const jf = jetons(f.chemin[f.chemin.length - 1]);
    if (!jf.length) continue;
    let communsMot = 0;
    for (const t of jf) if (jmSet.has(t)) communsMot++;
    if (!communsMot) continue; // le MOT seul fait entrer
    let communsTitre = 0;
    for (const t of jf) if (jt.has(t)) communsTitre++;
    // Une feuille courte qui partage tout est plus précise qu'une feuille
    // fourre-tout qui partage un mot sur six.
    const precision = communsMot / jf.length;
    notes.push({ f, score: communsMot * 3 + communsTitre + precision });
  }
  notes.sort((a, b) => b.score - a.score);
  return notes.slice(0, max).map((n) => ({ chemin: n.f.chemin, id: n.f.id }));
}

/**
 * LE GARDE-FOU INVERSE (2026-09-12, GO Nico) — allowedValues comme PREUVE,
 * jamais comme déclencheur.
 *
 * Une liste de valeurs offertes par une plateforme pour un aspect obligatoire
 * décrit-elle l'objet ? Sert à DEUX choses, et à rien d'autre :
 *  · confirmer un soupçon déjà levé par le garde-fou d'escamotage, en donnant
 *    à l'utilisateur une preuve vérifiable (« les valeurs proposées sont
 *    Sangle/poignée, Charme, Porte-clés — aucune ne décrit ton sac ») ;
 *  · et surtout l'INVERSE : si une valeur décrit vraiment l'objet, on ne
 *    propose PAS de changer la catégorie, quoi qu'en dise le reste.
 *
 * ⛔ CE N'EST PAS UN DÉCLENCHEUR, et la mesure du 12/09 dit pourquoi : sur le
 *    cas fondateur, l'aspect « Type » de 163570 est FREE_TEXT (pas
 *    SELECTION_ONLY) et sa liste porte TROIS valeurs contenant « sac » (Fond de
 *    sac, Porte-sac, Sac à déchets). Un test « la liste est fermée » ne tire
 *    pas ; un test « un jeton en commun » trouve une correspondance et ne tire
 *    pas non plus ; un test « le mot doit être une valeur exacte » tire, mais
 *    aussi sur « robe midi » dans Robes ou « pull col roulé » dans Pulls,
 *    c'est-à-dire sur la majorité des articles légitimes.
 *    Le rapprochement retenu est donc `inclus` : TOUS les jetons du mot doivent
 *    se retrouver dans la valeur. « sac à main » n'est ni dans « Sac à
 *    déchets » ni dans « Porte-sac » (« main » manque) → verdict juste ; et
 *    « robe » se retrouve dans « Robe de cocktail » → pas de faux positif.
 *
 * ⚠️ LE VERDICT EST GRADUÉ, et les deux usages ne lisent PAS le même niveau —
 *    mesuré sur les 21 couples (mot, catégorie) des publications eBay RÉUSSIES
 *    du parc (90 j) dont la catégorie porte un aspect d'identité, le seul niveau
 *    `inclus` rendait 6 FAUX POSITIFS sur 21 (29 %) : « manteau fourrure
 *    synthétique » contre « Manteau », « veste denim capuche » contre « Veste »,
 *    « pull col roulé » contre « Pull », « peignoir enfant » contre « Peignoir »,
 *    « bottes de neige bébé » contre « Bottes », « bottines » contre la feuille
 *    « Bottes, bottines ». Un mot de plusieurs mots ne se retrouve JAMAIS entier
 *    dans le vocabulaire d'une plateforme.
 *    · LE GARDE-FOU INVERSE lit le niveau le plus LÂCHE (`tete`) : il doit se
 *      taire dès qu'un doute existe. Se taire à tort ne coûte rien — c'est le
 *      garde-fou d'escamotage qui détecte, pas celui-ci.
 *    · LA PREUVE affichée peut citer le niveau le plus STRICT.
 *    Seul `aucun` — pas même le nom de tête en commun, ni dans les valeurs ni
 *    dans le libellé de la feuille — autorise à mettre la catégorie en doute.
 *
 * @param {string} mot        le mot-objet
 * @param {string[]} valeurs  les allowedValues de l'aspect
 * @param {string} [libelle] libellé de la feuille, source de description
 *                            supplémentaire (« Bottes, bottines » décrit
 *                            « bottines » même si aucune valeur ne le fait)
 * @returns {{niveau: "exact"|"inclus"|"tete", valeur: string}}  une valeur décrit l'objet
 *          | {niveau: "aucun", valeur: null}   rien ne le décrit, pas même le nom de tête
 *          | null    indécidable (pas de mot, ou pas de liste) — ne jamais conclure
 */
export function valeurDecritLObjet(mot, valeurs, libelle = null) {
  const jm = jetonsStricts(mot ?? "");
  if (!jm.length || !Array.isArray(valeurs) || !valeurs.length) return null;
  const paires = valeurs
    .map((v) => ({ v: String(v ?? ""), j: jetonsStricts(v) }))
    .filter((p) => p.j.length);
  if (libelle) {
    const jl = jetonsStricts(libelle);
    if (jl.length) paires.push({ v: String(libelle), j: jl });
  }
  if (!paires.length) return null;
  const exact = paires.find((p) => memeEnsemble(jm, p.j));
  if (exact) return { niveau: "exact", valeur: exact.v };
  const large = paires.find((p) => inclus(jm, p.j));
  if (large) return { niveau: "inclus", valeur: large.v };
  // Nom de TÊTE : en français le mot-objet commence par son nom principal
  // (« manteau fourrure synthétique » → manteau). Volontairement lâche.
  const tete = jm[0];
  const parTete = paires.find((p) => p.j.includes(tete));
  if (parTete) return { niveau: "tete", valeur: parTete.v };
  return { niveau: "aucun", valeur: null };
}

export const _internes = { memeEnsemble, inclus, genreNormalise, ACCEPTE, VIDES, VIDES_STRICTS };
