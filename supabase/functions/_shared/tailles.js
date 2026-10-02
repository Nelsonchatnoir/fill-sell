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
// ── LE PAYS D'UN NOMBRE (02/10, jeans de Patrick Giry) ──────────────────────
// Vinted écrit les bas homme « W36 | FR 46 » et les bas femme « FR 46 » /
// « EU 46 » (deux onglets : pour Vinted, FR 40 = EU 38 — deux tailles).
// « 46 » saisi dans l'app ne trouvait AUCUNE des deux : le nombre nu ne savait
// pas qu'il est français. Règle :
//   · « 46 », « T46 », « taille 46 » : nombre nu, c'est le français de l'app ;
//   · « FR 46 » ≡ « 46 » (même pays, écrit ou sous-entendu) ;
//   · « EU 46 » ≢ « 46 » ≢ « FR 46 » : on garde le pays (point G du 28/09,
//     « EU 42 garde son pays »). Le seul passage admis, « 46 » nu vers l'option
//     « EU 46 » d'une grille qui n'a ni « 46 » ni « FR 46 », est le dernier
//     recours de tailleDansGrille — la règle du 23/09 (Joséphine), à sens unique.
// UK, US, IT, DE ne se lisent JAMAIS ici : ce sont d'autres tailles.
function lireNombre(v) {
  const s = plier(v);
  const m = /^(?:(fr|eu|t|taille)\s*)?(\d{1,3}(?:\.\d)?)(?:\s*(fr|eu))?$/.exec(s);
  if (!m || (m[1] && m[3])) return null;
  const pays = (m[1] === "fr" || m[3] === "fr") ? "fr" : (m[1] === "eu" || m[3] === "eu") ? "eu" : "";
  return { pays, n: String(Number(m[2])) }; // « 44.0 » → « 44 », « 44.5 » → « 44.5 »
}

// ── Tour de taille d'un bas : « W34 », « W34 L32 », « 34W », « 32x34 », « 35/34 »
// Le W est le tour de taille en pouces, le L la longueur de jambe. Vinted ne
// prend que le W (« W34 | FR 44 ») ; aucune autre grille ne l'écrit. Rend
// { w, l } — ou { ambigu: true } quand la même écriture peut être une
// fourchette française (« 34/36 » : W34 L36 ou « entre le 34 et le 36 ») —
// ou null si ce n'est pas un tour de taille.
// ⛔ Le L ne sert JAMAIS à choisir une taille : « 33/32 » n'est pas un FR 32.
// ⛔ Un W ne devient jamais un nombre nu, un US, un UK ni une lettre : seule
//    une grille qui écrit elle-même « W.. » le reçoit.
function lireTourDeTaille(v) {
  const s = plier(v);
  const plausible = (w, l) => w >= 23 && w <= 54 && (l === null || (l >= 26 && l <= 38));
  let m = /^w\s*(\d{2})(?:\s*(?:\/|x)?\s*l\s*(\d{2}))?$/.exec(s)
    || /^(\d{2})\s*w(?:\s*(?:\/|x)?\s*(\d{2})\s*l)?$/.exec(s);
  if (m) {
    const w = Number(m[1]), l = m[2] === undefined ? null : Number(m[2]);
    return plausible(w, l) ? { w, l } : null;
  }
  m = /^(\d{2})\s*x\s*(\d{2})$/.exec(s);
  if (m && plausible(Number(m[1]), Number(m[2]))) return { w: Number(m[1]), l: Number(m[2]) };
  m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(s);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    // « 34/36 », « 38/40 » : deux tailles françaises qui se suivent — une
    // fourchette, pas UNE taille. Si la lecture W/L est possible aussi, c'est
    // l'une OU l'autre : on ne tranche pas.
    if (a % 2 === 0 && b === a + 2) return { ambigu: true };
    if (plausible(a, b)) return { w: a, l: b };
  }
  return null;
}

// ── Étiquette composite : « M / 38 / 10 », « 12 ans / 152 cm », « W30 | FR 40 »
// Les plateformes écrivent souvent PLUSIEURS écritures d'une même taille dans
// une seule étiquette. Chaque morceau désigne alors LA MÊME taille : croiser
// les morceaux n'est pas une conversion, c'est lire leur table.
// ⚠️ On ne coupe QUE sur / | · et sur le tiret ENTOURÉ D'ESPACES (« 44 - XXL »,
// la grille Leboncoin) — jamais sur le tiret collé, qui appartient aux
// intervalles d'âge (« 0-3M », « 12-18 mois »).
function jetons(v) {
  return String(v ?? "")
    .split(/\s+[-–—]\s+|[/|·•]+/)
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
  // Un tour de taille ne vaut QU'un tour de taille (« W34 » ≢ « 34 »).
  // Deux longueurs écrites doivent aussi s'accorder (« W34 L32 » ≢ « W34 L30 »).
  const tA = lireTourDeTaille(a), tB = lireTourDeTaille(b);
  if (tA?.w || tB?.w) return Boolean(tA?.w && tB?.w) && tA.w === tB.w && (tA.l == null || tB.l == null || tA.l === tB.l);
  const ageA = canonAge(a), ageB = canonAge(b);
  if (ageA || ageB) return memeAge(ageA, ageB);   // un âge ne vaut QUE un âge
  const litA = canonLettre(a), litB = canonLettre(b);
  if (litA && litB) return litA === litB;
  const nA = lireNombre(a), nB = lireNombre(b);
  if (nA && nB) return nA.n === nB.n && (nA.pays === nB.pays || (nA.pays !== "eu" && nB.pays !== "eu"));
  return false;
}

// Plusieurs options désignent la même taille (« FR 38 » face à « 38 » et à
// « FR 38 ») : le même pays d'abord. Sinon la première — le comportement
// d'avant, inchangé pour les lettres (« XXL » et « 2XL »).
function meilleureEgale(valeur, options) {
  const egales = options.filter((o) => memeTaille(o, valeur));
  if (egales.length <= 1) return egales[0] ?? null;
  const nv = lireNombre(valeur);
  const memePays = nv ? egales.find((o) => lireNombre(o)?.pays === nv.pays) : null;
  return memePays ?? egales[0];
}

// Registre historique conservé pour compatibilité des imports, jamais utilisé
// pour choisir une taille. Une table d'une autre grille ne prouve pas la cible.
export const TAILLE_FEMME_LETTRE_PAR_NOMBRE = Object.freeze({
  "30":"XXXS", "32":"XXS", "34":"XS", "36":"S", "38":"M", "40":"L", "42":"XL", "44":"XXL",
});

/**
 * LA fonction du module : écrire `brut` dans le vocabulaire de `grille`.
 *
 * @param {unknown} brut — la taille de l'article, telle que la personne l'a
 *   (« 12 ans », « 44,5 », « M / 38 / 10 », « Taille unique »).
 * @param {unknown[]} grille — les valeurs EXACTES que la plateforme accepte
 *   pour CETTE catégorie. Jamais l'union de plusieurs grilles.
 * @param {{tableFemme?: boolean}} [opts] — ancien argument conservé, sans conversion.
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

  // 2. La même écriture à la casse / aux accents / au séparateur près — et,
  //    pour un nombre, au pays près (« 46 » ≡ « FR 46 », cf. lireNombre).
  const plie = meilleureEgale(valeur, options);
  if (plie) return { valeur: plie, motif: "orthographe" };

  // 2 bis. UN BAS ÉCRIT EN TOUR DE TAILLE (« W34 L32 », « 35/34 », « 32x34 »).
  //    Seul le W compte, et seulement dans une grille qui écrit des W (Vinted
  //    homme : « W35 | FR 44 ») — la table de la plateforme, lue chez elle.
  //    Ailleurs : refus, la personne choisit (jamais W34 → « 34 », qui serait
  //    le 34 FRANÇAIS, ni → « US 34 », ni → une lettre). Une écriture qui
  //    peut aussi être une fourchette française (« 34/36 ») : refus aussi.
  //    ⛔ On ne laisse JAMAIS « 35/34 » tomber dans les jetons ci-dessous : le
  //    34 de la longueur y deviendrait un FR 34.
  const bas = lireTourDeTaille(valeur);
  if (bas) {
    if (bas.ambigu) return null;
    const parW = options.filter((o) => jetons(o).some((j) => lireTourDeTaille(j)?.w === bas.w && lireTourDeTaille(j)?.l == null));
    return parW.length === 1 ? { valeur: parW[0], motif: `tour de taille W${bas.w} lu dans la grille` } : null;
  }

  // 3. La taille de l'article est COMPOSITE (« 12 ans / 152 cm ») : chacun de
  //    ses morceaux désigne la même taille, on cherche celui que la grille
  //    sait écrire.
  const morceaux = jetons(valeur);
  if (morceaux.length > 1) {
    for (const m of morceaux) {
      const trouve = meilleureEgale(m, options);
      if (trouve) return { valeur: trouve, motif: `jeton « ${m} »` };
    }
  }

  // 4. L'étiquette de la GRILLE est composite (« M / 38 / 10 », « 3 ans /
  //    98 cm ») : on cherche l'option dont l'un des morceaux désigne notre
  //    taille. Une seule candidate acceptée — deux options qui matchent, c'est
  //    une ambiguïté, et une ambiguïté ne se tranche pas toute seule.
  //    SAUF si une seule porte TOUS les morceaux de la taille de l'article
  //    (« FR 44 / W35 » face à « W34 | FR 44 » et « W35 | FR 44 ») : ce n'est
  //    plus un choix, c'est la ligne de la table.
  const couverture = (o) => morceaux.filter((x) => jetons(o).some((m) => memeTaille(m, x))).length;
  const parMorceau = options.filter((o) => jetons(o).length > 1 && couverture(o) > 0);
  if (parMorceau.length === 1) return { valeur: parMorceau[0], motif: "étiquette composite de la grille" };
  if (parMorceau.length > 1 && morceaux.length > 1) {
    const completes = parMorceau.filter((o) => couverture(o) === morceaux.length);
    if (completes.length === 1) return { valeur: completes[0], motif: "étiquette composite de la grille (tous les morceaux)" };
  }

  // Un nombre ne devient jamais une lettre sur la table d’une autre grille.

  // 5. DERNIER RECOURS, À SENS UNIQUE (règle du 23/09, Joséphine ; point G du
  //    28/09) : un nombre NU face à une grille qui ne l'écrit qu'avec « EU »
  //    (« EU 42 » des vestes homme Vinted) — ni « 42 », ni « FR 42 » n'y sont.
  //    C'est le candidat que l'extension essaie déjà en dernier ; le juger ici
  //    évite de redemander une taille que le dépôt saurait poser.
  const nu = lireNombre(valeur);
  if (nu && nu.pays === "" && !options.some((o) => memeTaille(o, valeur))) {
    const enEu = options.filter((o) => { const x = lireNombre(o); return x && x.pays === "eu" && x.n === nu.n; });
    if (enEu.length === 1) return { valeur: enEu[0], motif: `nombre nu → « ${enEu[0]} » (la grille n'écrit que l'EU)` };
  }

  // 6. TAILLE ENFANT EN CENTIMÈTRES (27/09, doriane-henri : « Pantalon taille
  //    86 » refusé par Opla, qui écrit « 18 mois »). Deux lectures, dans cet
  //    ordre, et aucune n'invente d'équivalence :
  //    a) la grille écrit ELLE-MÊME la stature (Vinted : « 18-24 mois / 86 cm »)
  //       → on lit SA table : « 86 » y est l'option qui porte « 86 cm » ;
  //    b) la grille n'écrit QUE des âges (Opla G2) → la table française des
  //       étiquettes enfant (taille par stature, celle imprimée sur les
  //       vêtements : 86 cm = 18 mois, 98 cm = 3 ans). C'est une TRADUCTION
  //       de l'étiquette, pas une conversion de mesure : la même taille,
  //       écrite en âge plutôt qu'en stature.
  //    ⛔ Seulement une stature de la table (50…176) : un « 12 » ou un « 38 »
  //       n'est jamais lu comme des centimètres.
  const stature = statureEnfant(valeur);
  if (stature) {
    const parCm = options.filter((o) => jetons(o).length > 1
      && jetons(o).some((m) => memeTaille(m, `${stature} cm`)));
    if (parCm.length === 1) return { valeur: parCm[0], motif: `stature ${stature} cm lue dans la grille` };
    const queDesAges = options.every((o) => canonAge(o) || estUnique(o));
    const ages = AGE_PAR_STATURE_ENFANT[stature];
    if (queDesAges && ages && !parCm.length) {
      for (const age of ages) {
        const cible = options.find((o) => memeTaille(o, age));
        if (cible) return { valeur: cible, motif: `étiquette enfant ${stature} cm = ${age}` };
      }
    }
  }

  return null;
}

// ── LA TABLE DES ÉTIQUETTES ENFANT : STATURE → ÂGE (27/09) ──────────────────
// Celle que les vêtements enfant français impriment (« 18 mois / 86 cm »).
// Chaque stature donne l'âge de l'étiquette, puis, si la grille ne l'écrit
// pas, l'autre écriture du MÊME âge (92 cm = 24 mois = 2 ans) — jamais un
// âge voisin.
/** @type {Readonly<Record<string, readonly string[]>>} */
export const AGE_PAR_STATURE_ENFANT = Object.freeze({
  "50": ["0 mois"], "56": ["1 mois"], "62": ["3 mois"], "68": ["6 mois"],
  "74": ["9 mois"], "80": ["12 mois"], "86": ["18 mois"], "92": ["24 mois", "2 ans"],
  "98": ["3 ans", "36 mois"], "104": ["4 ans"], "110": ["5 ans"], "116": ["6 ans"],
  "122": ["7 ans"], "128": ["8 ans"], "134": ["9 ans"], "140": ["10 ans"],
  "146": ["11 ans"], "152": ["12 ans"], "158": ["13 ans"], "164": ["14 ans"],
  "170": ["15 ans"], "176": ["16 ans"],
});

// « 86 », « 86 cm », « 86cm », « T86 », « taille 86 » → "86" ; sinon null.
function statureEnfant(v) {
  const s = plier(v).replace(/^(?:taille|t)\s*/, "");
  const m = /^(\d{2,3})\s*(?:cm)?$/.exec(s);
  if (!m) return null;
  return Object.prototype.hasOwnProperty.call(AGE_PAR_STATURE_ENFANT, m[1]) ? m[1] : null;
}

/**
 * Le libellé FRANÇAIS d'une valeur de grille, pour une question posée à la
 * personne : « 18M » → « 18 mois », « 2Y » → « 2 ans », « TAILLE_UNIQUE » →
 * « Taille unique ». Toute autre valeur est rendue telle quelle (« M », « 38 »).
 * Réponse relue par tailleDansGrille : « 18 mois » retombe sur « 18M ».
 */
export function libelleTaille(v) {
  const s = String(v ?? "").trim();
  const age = /^(\d{1,2})(?:-(\d{1,2}))?([MY])$/i.exec(s);
  if (age) {
    const borne = age[2] !== undefined ? `${age[1]}-${age[2]}` : age[1];
    return age[3].toUpperCase() === "M" ? `${borne} mois` : `${borne} ${Number(age[2] ?? age[1]) > 1 ? "ans" : "an"}`;
  }
  if (estUnique(s)) return "Taille unique";
  return s;
}

/**
 * Les options de la grille qui PEUVENT désigner cette taille quand elle ne s'y
 * écrit pas d'une seule façon (02/10, point 11) : « 44 » face à « W34 | FR 44 »
 * et « W35 | FR 44 », « 34 » face à « W24 | FR 34 », « W25 | FR 34 » et
 * « W34 | FR 44 », « 34/36 » face à ses deux lectures. On les montre EN
 * TÊTE de la question — sans en choisir une : c'est la personne qui sait.
 * Vide quand rien dans la grille ne ressemble à la taille.
 */
export function candidatsTaille(brut, grille) {
  const options = (Array.isArray(grille) ? grille : []).map((o) =>
    String(typeof o === "string" ? o : (o?.code ?? o?.title ?? "")).trim()).filter(Boolean);
  const valeur = String(brut ?? "").trim();
  if (!valeur || !options.length) return [];
  const bas = lireTourDeTaille(valeur);
  // Un nombre nu de jean (« 34 ») se dit aussi en W : sa lecture W est montrée
  // parmi les candidates — jamais choisie (le nombre nu reste français).
  const nu = !bas ? lireNombre(valeur) : null;
  const nuW = nu && nu.pays === "" && /^\d{2}$/.test(nu.n) && Number(nu.n) >= 23 && Number(nu.n) <= 54 ? Number(nu.n) : null;
  const tours = bas?.w ? [bas.w] : bas?.ambigu ? [Number(valeur.split("/")[0])] : nuW ? [nuW] : [];
  const morceaux = bas?.w ? [] : bas?.ambigu ? valeur.split("/").map((x) => x.trim()) : jetons(valeur);
  return options.filter((o) => jetons(o).some((j) =>
    tours.includes(lireTourDeTaille(j)?.w) || morceaux.some((x) => memeTaille(j, x))));
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
  if (lireTourDeTaille(String(brut ?? "").trim())?.ambigu) return "ambigu";
  const options = (Array.isArray(grille) ? grille : []).map((o) =>
    String(typeof o === "string" ? o : (o?.code ?? o?.title ?? "")).trim()).filter(Boolean);
  const morceaux = jetons(String(brut ?? "").trim());
  const candidates = options.filter((o) =>
    jetons(o).some((m) => morceaux.some((x) => memeTaille(m, x))));
  return candidates.length > 1 ? "ambigu" : "hors_vocabulaire";
}
