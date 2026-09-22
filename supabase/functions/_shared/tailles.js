// ══════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE DES TAILLES — TRADUIRE, JAMAIS CONVERTIR (2026-09-18)
// ══════════════════════════════════════════════════════════════════════════
//
// CE QUI L'A PROVOQUÉ (mesuré en base le 18/09 au soir) :
//   · Ornella, « Pantalon jogging Zara gris 12 ans », Opla JOGGINGS_GIRLS_NEW :
//     refusé. La grille de cette feuille contient « 12Y ». C'est LA MÊME
//     TAILLE, écrite autrement, et on a rendu l'article indéposable.
//   · tessy, « Nike Pacific Rose », Opla MEN_SNEAKERS, pointure « 44.5 » :
//     refusé aussi — mais là c'est VRAI, la grille Opla va de 14 à 50 SANS
//     demi-pointures. Ces deux refus avaient le même message et n'ont rien à
//     voir : le premier est notre bug, le second est une limite d'Opla.
//
// ⛔ LA LIGNE, ET ELLE NE BOUGE PAS. Ce module TRADUIT une taille d'un
// vocabulaire vers un autre — il ne CONVERTIT jamais d'un système de mesure
// vers un autre.
//   · « 12 ans » → « 12Y »  ......... OUI. Même taille, deux orthographes.
//   · « 44,5 » → « 44.5 » ........... OUI. Même nombre, deux séparateurs.
//   · « Taille unique » → « TAILLE_UNIQUE » ... OUI.
//   · « 12 ans / 152 cm » → « 12Y » .. OUI. « 12 ans » est un JETON de
//     l'étiquette composite que Vinted écrit lui-même.
//   · « 44.5 » → « 44 » ou « 45 » ... NON, JAMAIS. C'est une autre pointure.
//   · « FR 42 » → « XL » ............ NON, sauf si la grille CIBLE porte
//     elle-même l'étiquette « XL / 42 / 14 » : alors ce n'est plus une
//     conversion, c'est la table de la plateforme, lue chez elle.
//   · « 2 ans » → « 24M » ........... NON. La grille Opla G2 contient les
//     DEUX (`24M` et `2Y`) : c'est donc une distinction qu'Opla fait, et ce
//     n'est pas à nous de la gommer.
// Règle de Nico, 18/09 : « on ne dépose jamais une taille fausse ; refuser
// vaut mieux qu'approximer. Mais refuser sur "12 ans" alors que la grille dit
// "12Y", ce n'est pas de la rigueur, c'est un trou. »
//
// ⛔ CE MODULE NE RÉÉCRIT RIEN DANS LA FICHE. Il rend la valeur à ENVOYER à
// une plateforme, pour un dépôt. La taille saisie par la personne reste la
// sienne, intacte, dans l'inventaire — c'est la règle posée avec le relevé.
//
// ES module SANS import : chargé tel quel par Deno (Edge Functions) et par
// Vite (app), même contrat que [[erreurs-archivees.js]] et [[isbn.js]].

// ── Pliage : casse, accents, ponctuation, séparateur décimal ────────────────
// « 44,5 » et « 44.5 » sont le même nombre ; « 85 G » et « 85G » la même
// taille de bonnet ; « TAILLE_UNIQUE », « Taille unique » et « taille-unique »
// le même mot. On plie tout ça, et RIEN d'autre.
function plier(v) {
  return String(v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // accents
    .toLowerCase()
    .replace(/,/g, ".")                                   // 44,5 → 44.5
    .replace(/[\s_\-–—]+/g, " ")                          // ponctuation → espace
    .replace(/\s+/g, " ")
    .trim();
}

// Forme « serrée » : sans aucun espace. « 85 g » → « 85g », « 3 xl » → « 3xl ».
// Utilisée en SECOND, jamais en premier : « 12 ans » et « 12a » ne doivent pas
// se confondre par accident avec autre chose.
const serrer = (v) => plier(v).replace(/ /g, "");

// ── Taille unique : le même concept sous onze noms ─────────────────────────
// ⚠️ « UNIVERSEL » EST LE MOT DE VINTED (2026-09-22, bonnet Jack & Jones de
//    lesnesarthur). C'est le libellé que Vinted propose comme taille unique
//    sur les chapeaux, bonnets et accessoires — il manquait ici, donc
//    memeTaille("Unique", "Universel") rendait false et l'article devenait
//    indéposable alors que la grille portait EXACTEMENT sa taille.
//    C'est une TRADUCTION, pas une conversion : même taille, autre mot.
const UNIQUES = new Set([
  "taille unique", "tailleunique", "taille u", "tu", "unique", "one size",
  "onesize", "os", "u", "einheitsgrosse", "talla unica", "taglia unica",
  "universel", "universelle", "universal",
]);
const estUnique = (v) => UNIQUES.has(plier(v)) || UNIQUES.has(serrer(v));

// ── Lettres : les deux orthographes du monde, XXL et 2XL ────────────────────
// Ce n'est pas une conversion : « 2XL » et « XXL » désignent la MÊME taille
// partout, et les plateformes ne s'accordent pas sur l'écriture (eBay écrit
// « 2XL » et jamais « XXL » — relevé, cf. [[ebay-taille-vocabulaire-releve]]).
// Rendu : la forme canonique « XXL »-style, pour comparer deux écritures.
function canonLettre(v) {
  const s = serrer(v);
  const mots = {
    xsmall: "xs", extrasmall: "xs", small: "s", medium: "m", moyen: "m",
    large: "l", xlarge: "xl", extralarge: "xl", petit: "s", grand: "l",
  };
  if (mots[s]) return mots[s].toUpperCase();
  // nXL / nXS → XX…L (n=2 → XXL, n=3 → XXXL)
  const mult = /^(\d)x(l|s)$/.exec(s);
  if (mult) {
    const n = Number(mult[1]);
    if (n >= 2 && n <= 8) return "X".repeat(n) + mult[2].toUpperCase();
  }
  // XXL / XXXL / XXS… déjà canoniques
  if (/^x*(l|s)$/.test(s) || s === "m") return s.toUpperCase();
  return null;
}

// ── Âge enfant : UNE valeur, écrite dans six dialectes ──────────────────────
// Rend { unite: 'M'|'Y', de, a } — jamais un nombre nu, et JAMAIS de
// conversion entre mois et années (cf. le bandeau : Opla distingue 24M et 2Y).
//   « 12 ans » « 12A » « 12Y » « 12 years » → { Y, 12, 12 }
//   « 0-3 mois » « 0-3M » « 0/3 mois »      → { M, 0, 3 }
function canonAge(v) {
  // ⚠️ LECTURE SUR `plier` UNIQUEMENT, JAMAIS SUR `serrer`. `plier` transforme
  // le tiret en espace, donc « 0-3 mois » arrive ici en « 0 3 mois » et les
  // deux bornes restent LISIBLES. `serrer` les colle (« 03mois ») et un
  // `\d{1,2}` gourmand lit alors « 03 » = 3 : « 0-3M » et « 3M » devenaient la
  // MÊME taille — or la grille Opla G2 contient les deux. Collision trouvée
  // par l'autotest, pas en prod, et c'est bien le but.
  const s = plier(v);
  // Un nombre, éventuellement une seconde borne (séparateur « à », « / » ou
  // le simple espace laissé par le tiret), puis l'unité.
  const m = /^(\d{1,2})(?:\s*(?:a|\/)?\s*(\d{1,2}))?\s*(mois|m|ans?|a|y|years?|yr)$/.exec(s);
  if (!m) return null;
  const u = m[3];
  const unite = (u === "mois" || u === "m") ? "M"
    : (u === "an" || u === "ans" || u === "a" || u === "y" || u === "years" || u === "year" || u === "yr") ? "Y"
    : null;
  if (!unite) return null;
  const de = Number(m[1]);
  const a = m[2] === undefined ? de : Number(m[2]);
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null;
  return { unite, de, a };
}
const memeAge = (x, y) => !!x && !!y && x.unite === y.unite && x.de === y.de && x.a === y.a;

// ── Nombre : pointure, taille FR, tour de poitrine ──────────────────────────
// « 44.5 » et « 44,5 » sont égaux ; « 44 » et « 44.5 » ne le sont JAMAIS.
function canonNombre(v) {
  const s = plier(v);
  if (!/^\d{1,3}(\.\d)?$/.test(s)) return null;
  return String(Number(s)); // « 44.0 » → « 44 », « 44.5 » → « 44.5 »
}

// ── Étiquette composite : « M / 38 / 10 », « 12 ans / 152 cm », « W30 | FR 40 »
// Les plateformes écrivent souvent PLUSIEURS écritures d'une même taille dans
// une seule étiquette. Chaque morceau désigne alors LA MÊME taille : croiser
// les morceaux n'est pas une conversion, c'est lire leur table.
// ⚠️ On ne coupe QUE sur / | · — jamais sur le tiret, qui appartient aux
// intervalles d'âge (« 0-3M », « 12-18 mois »).
function jetons(v) {
  return String(v ?? "")
    .split(/[/|·•]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Deux écritures désignent-elles LA MÊME taille ?
 * Comparaison par facettes, de la plus sûre à la plus large — et aucune
 * facette n'invente de correspondance entre systèmes.
 */
export function memeTaille(a, b) {
  if (!a || !b) return false;
  if (plier(a) === plier(b)) return true;
  if (serrer(a) === serrer(b)) return true;
  if (estUnique(a) && estUnique(b)) return true;
  const ageA = canonAge(a), ageB = canonAge(b);
  if (ageA || ageB) return memeAge(ageA, ageB);   // un âge ne vaut QUE un âge
  const litA = canonLettre(a), litB = canonLettre(b);
  if (litA && litB) return litA === litB;
  const nA = canonNombre(a), nB = canonNombre(b);
  if (nA && nB) return nA === nB;
  return false;
}

// ── LA TABLE NOMBRE → LETTRE, RELEVÉE CHEZ VINTED ──────────────────────────
// Elle vivait dans _shared/vinted-taille-republication.ts, qui la déclarait
// « la SEULE table de correspondance nombre → lettre du projet ». Elle monte
// ici SANS UNE VIRGULE DE CHANGEMENT (20/09) parce qu'Opla en a besoin aussi :
// la grille G1 d'Opla (`XXS`…`8XL`, relevée le 20/09) ne porte AUCUNE
// équivalence numérique, donc un « 38 » de robe y était refusé.
//
// ⛔ CE N'EST PAS UNE CONVERSION INVENTÉE. Vinted publie lui-même l'égalité,
//    dans /api/v2/size_groups, groupe 4 : « XXXS / 30 / 2 », « S / 36 / 8 »,
//    « M / 38 / 10 », « XL / 42 / 14 ». On lit sa table, on n'en fabrique pas.
// ⛔ ET ELLE NE VAUT QUE POUR LA BRANCHE FEMMES. Le MÊME « 38 » est une
//    pointure dans les groupes 7 et 38 du même référentiel, et un « 36 »
//    d'homme est un tour de taille, pas un S. C'est pourquoi l'accès passe
//    par une option que l'appelant doit poser à la main, après avoir vérifié
//    sa branche — jamais par défaut.
/** @type {Readonly<Record<string, string>>} */
export const TAILLE_FEMME_LETTRE_PAR_NOMBRE = Object.freeze({
  "30": "XXXS", "32": "XXS", "34": "XS", "36": "S",
  "38": "M", "40": "L", "42": "XL", "44": "XXL",
});

/**
 * LA fonction du module : écrire `brut` dans le vocabulaire de `grille`.
 *
 * @param {unknown} brut — la taille de l'article, telle que la personne l'a
 *   (« 12 ans », « 44,5 », « M / 38 / 10 », « Taille unique »).
 * @param {unknown[]} grille — les valeurs EXACTES que la plateforme accepte
 *   pour CETTE catégorie. Jamais l'union de plusieurs grilles.
 * @param {{tableFemme?: boolean}} [opts] — `tableFemme: true` autorise la
 *   dernière étape, la table relevée ci-dessus. L'appelant ne la pose QUE
 *   s'il a vérifié que la catégorie est un VÊTEMENT de la branche FEMMES.
 *   Absente par défaut : sans elle, le module se comporte à l'octet près
 *   comme avant le 20/09.
 * @returns {{valeur:string, motif:string}|null} la valeur À ENVOYER, telle
 *   qu'elle est écrite dans la grille — ou null si aucune ne désigne la même
 *   taille. null n'est pas un échec : c'est un refus, et il est voulu.
 */
export function tailleDansGrille(brut, grille, opts) {
  const options = (Array.isArray(grille) ? grille : [])
    .map((o) => (typeof o === "string" ? o : (o?.code ?? o?.title ?? "")))
    .map((o) => String(o ?? "").trim())
    .filter(Boolean);
  const valeur = String(brut ?? "").trim();
  if (!valeur || !options.length) return null;

  // 1. Telle quelle. Une taille qui passe déjà ne doit JAMAIS être retouchée
  //    (règle du 10/09 : « une taille qui passe aujourd'hui, on n'y touche
  //    pas »). C'est pour ça que cette étape est la première.
  const exact = options.find((o) => o === valeur);
  if (exact) return { valeur: exact, motif: "exacte" };

  // 2. La même écriture à la casse / aux accents / au séparateur près.
  const plie = options.find((o) => memeTaille(o, valeur));
  if (plie) return { valeur: plie, motif: "orthographe" };

  // 3. La taille de l'article est COMPOSITE (« 12 ans / 152 cm ») : chacun de
  //    ses morceaux désigne la même taille, on cherche celui que la grille
  //    sait écrire.
  const morceaux = jetons(valeur);
  if (morceaux.length > 1) {
    for (const m of morceaux) {
      const trouve = options.find((o) => memeTaille(o, m));
      if (trouve) return { valeur: trouve, motif: `jeton « ${m} »` };
    }
  }

  // 4. L'étiquette de la GRILLE est composite (« M / 38 / 10 », « 3 ans /
  //    98 cm ») : on cherche l'option dont l'un des morceaux désigne notre
  //    taille. Une seule candidate acceptée — deux options qui matchent, c'est
  //    une ambiguïté, et une ambiguïté ne se tranche pas toute seule.
  const parMorceau = options.filter((o) =>
    jetons(o).length > 1 && jetons(o).some((m) => morceaux.some((x) => memeTaille(m, x))));
  if (parMorceau.length === 1) return { valeur: parMorceau[0], motif: "étiquette composite de la grille" };

  // 5. DERNIER RECOURS, ET SEULEMENT SUR DEMANDE : la table femme relevée
  //    chez Vinted. La grille cible écrit des LETTRES et rien d'autre (Opla
  //    G1) ; l'article porte un nombre ; Vinted publie leur égalité.
  //    Deux verrous en plus de l'option, parce qu'une taille fausse coûte
  //    plus cher qu'un refus :
  //      · la grille doit n'écrire QUE des lettres (plus « taille unique ») :
  //        une grille de pointures écrit « 38 » pour dire 38, et la grille
  //        des soutiens-gorge (Opla G4) mêle `XS`…`XXL` à `75A`…`115E` — un
  //        « 38 » y est un tour de dos, jamais un M. Tester « aucun nombre »
  //        ne l'aurait pas vue : « 75A » n'est pas un nombre ;
  //      · la lettre doit exister dans la grille, sans quoi on ne sert rien.
  if (opts?.tableFemme) {
    const queDesLettres = options.every((o) => canonLettre(o) || estUnique(o));
    const nombre = canonNombre(valeur);
    const lettre = nombre ? TAILLE_FEMME_LETTRE_PAR_NOMBRE[nombre] : null;
    if (queDesLettres && lettre) {
      const cible = options.find((o) => canonLettre(o) === canonLettre(lettre));
      if (cible) return { valeur: cible, motif: `table femme Vinted (${nombre} = ${lettre})` };
    }
  }

  return null;
}

/**
 * Pourquoi ça n'a pas marché — pour écrire un message honnête plutôt que le
 * même texte dans deux situations qui n'ont rien à voir.
 *   'hors_vocabulaire' : la grille ne porte tout simplement pas cette taille
 *     (44.5 sur une grille d'entiers). Rien à corriger chez nous.
 *   'ambigu' : plusieurs options correspondent — on ne tranche pas.
 */
export function diagnosticTaille(brut, grille, opts) {
  if (tailleDansGrille(brut, grille, opts)) return null;
  const options = (Array.isArray(grille) ? grille : []).map((o) =>
    String(typeof o === "string" ? o : (o?.code ?? o?.title ?? "")).trim()).filter(Boolean);
  const morceaux = jetons(String(brut ?? "").trim());
  const candidates = options.filter((o) =>
    jetons(o).some((m) => morceaux.some((x) => memeTaille(m, x))));
  return candidates.length > 1 ? "ambigu" : "hors_vocabulaire";
}
