// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
//   node scripts/gen-tailles-content-script.mjs --depop
// Source : supabase/functions/_shared/tailles.js (recopiée à l'octet près, seuls les `export` tombent).
//
// Les content scripts MV3 ne sont pas des modules ES : le vocabulaire se
// publie sur globalThis, comme opla-prevol.js le fait pour ses propres
// fonctions. Injecté par DEPOP_SCRIPTS (background.js), AVANT depop.js.
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
// (12/11) Les options qui ne disent AUCUNE taille, dans la langue de chaque site (Depop « Other », « Autre »…) :
// jamais choisies, et jamais comptées pour juger qu'une grille n'écrit que des âges.
const AUTRES = new Set(["other", "others", "autre", "autres", "altro", "altri", "otro", "otros", "andere", "sonstige", "overig", "overige"]);
const estNeutre = (v) => estUnique(v) || AUTRES.has(plier(v));

// ── LES SYSTÈMES DE TAILLE, RANGÉS PAR SITE (12/11, décision de Nico — point 1a) ──
// CE QUI L'A PROVOQUÉ (compte c7c382b7, 12/11) : Depop a refusé « EU M » (pull,
// tâche baf800fe) et « EU 140cm » (leggings, fe3af982) — la lettre M et
// « 10 years » étaient DANS les grilles. Le préfixe vient de Lens, qui lit une
// étiquette à plusieurs systèmes (« UK 9-10 Yrs, EUR 140cm, US 10 Yrs ») et la
// rend dans la langue du compte. La règle n'existait que pour eBay
// (taille-ebay.js, 07/11, « module propre à eBay ») : c'était corriger le cas.
// LA RÈGLE, PAR SITE, POUR TOUTES LES PLATEFORMES (Vinted, Leboncoin, Beebs,
// Depop, eBay, et l'extension par gen-tailles-content-script.mjs) : un préfixe
// dit DANS QUEL SYSTÈME la valeur est écrite, et chaque système dit ce qu'il
// fait d'une lettre :
//   · EU, EUR, FR, IT, DE, ES, INT + lettre = la lettre (S, M, L… sont les mêmes
//     lettres dans ces systèmes) ;
//   · UK, US + lettre = la lettre de XS à XXL SEULEMENT (au-delà, les tailles
//     anglo-saxonnes ne suivent plus la même échelle : la question) ;
//   · UK, US, IT, DE, ES + NOMBRE : JAMAIS le nombre d'un autre système (« UK 10 »
//     n'est ni « 10 » ni « 38 ») — lireNombre ne lit que FR (≡ nu) et EU/EUR ;
//   · « EU 140cm » = 140 cm : un centimètre est un centimètre dans tous les
//     systèmes, l'unité écrite suffit (statureEnfant, lireCm) ; un « EU 140 »
//     SANS unité n'est jamais lu comme une stature.
// Un nouveau site (pays d'un compte) = une ligne ici, jamais une règle ailleurs.
// ⛔ Le préfixe doit être SÉPARÉ de la lettre (« EU M », « EU: M », « EU-M ») :
//    « ITS », « DES », « USS » collés ne sont pas des tailles.
const SYSTEMES_DE_TAILLE = Object.freeze({
  eu: Object.freeze({ systeme: "EU", lettres: "toutes" }),
  eur: Object.freeze({ systeme: "EU", lettres: "toutes" }),
  fr: Object.freeze({ systeme: "FR", lettres: "toutes" }),
  it: Object.freeze({ systeme: "IT", lettres: "toutes" }),
  de: Object.freeze({ systeme: "DE", lettres: "toutes" }),
  es: Object.freeze({ systeme: "ES", lettres: "toutes" }),
  int: Object.freeze({ systeme: "INT", lettres: "toutes" }),
  uk: Object.freeze({ systeme: "UK", lettres: "xs-xxl" }),
  us: Object.freeze({ systeme: "US", lettres: "xs-xxl" }),
});
const LETTRES_XS_XXL = new Set(["XS", "S", "M", "L", "XL", "XXL"]);
const SITES_RE = Object.keys(SYSTEMES_DE_TAILLE).sort((a, b) => b.length - a.length).join("|");
const SITE_SEPARE_RE = new RegExp(`^(${SITES_RE})(?:\\s*[:.]\\s*|\\s+)(.+)$`);

// Le site d'une écriture : « EU M » → { cle: "eu", systeme: "EU", lettres, reste: "m" } ; null sans préfixe de site.
function lireSysteme(v) {
  const m = SITE_SEPARE_RE.exec(plier(v));
  if (!m) return null;
  const s = SYSTEMES_DE_TAILLE[m[1]];
  return { cle: m[1], systeme: s.systeme, lettres: s.lettres, reste: m[2].trim() };
}

// ── Lettres : les deux orthographes du monde, XXL et 2XL ────────────────────
// Ce n'est pas une conversion : « 2XL » et « XXL » désignent la MÊME taille
// partout, et les plateformes ne s'accordent pas sur l'écriture (eBay écrit
// « 2XL » et jamais « XXL » — relevé, cf. [[ebay-taille-vocabulaire-releve]]).
// Rendu : la forme canonique « XXL »-style, pour comparer deux écritures.
// (12/11) Une lettre écrite dans un site (« EU M », « UK S ») : la règle du site
// (SYSTEMES_DE_TAILLE) — la lettre, ou rien.
function canonLettre(v) {
  const nue = lettreNue(v);
  if (nue) return nue;
  const site = lireSysteme(v);
  if (!site) return null;
  const l = lettreNue(site.reste);
  return l && (site.lettres === "toutes" || LETTRES_XS_XXL.has(l)) ? l : null;
}
function lettreNue(v) {
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
  // (12/11) Sinon, l'âge écrit en ANGLAIS (« 6 months », « 11-12 yrs », « Age 11-12 », « 10 years old ») : la même
  // unité, les mêmes nombres (ageEnFrancais) — jamais mois ↔ ans.
  const m = AGE_FR_RE.exec(s) ?? (() => { const fr = ageEnFrancais(v); return fr ? AGE_FR_RE.exec(plier(fr)) : null; })();
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
const AGE_FR_RE = /^(\d{1,2})(?:\s*(?:a|\/)?\s*(\d{1,2}))?\s*(mois|m|ans?|a|y|years?|yr)$/;
const memeAge = (x, y) => !!x && !!y && x.unite === y.unite && x.de === y.de && x.a === y.a;

// ── L'ÂGE ÉCRIT EN ANGLAIS → SON ÉCRITURE FRANÇAISE (07/11 pour eBay ; 12/11 : la règle de TOUTES les plateformes)
// « 11-12 yrs » → « 11-12 ans », « 3-4 years old » → « 3-4 ans », « Age 11-12 » → « 11-12 ans », « 18 months » →
// « 18 mois », « 12-18 mths » → « 12-18 mois », « 6 mos » → « 6 mois », « Newborn » → « Naissance ».
// ⛔ Jamais mois ↔ ans (« 24 months » n'est pas « 2 ans ») ; une tranche reste une tranche (« 11/12 yrs » est UNE
//    tranche, jamais « 12 ans ») ; sans unité, seul « Age 11-12 » (l'âge des étiquettes anglaises, en années) est un âge.
// Née dans taille-ebay.js (E1, compte c7c382b7, job ba0c4d73) ; taille-ebay.js la ré-exporte (une seule règle).
const plierAge = (v) => String(v ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[‐-―−]/g, "-")
  .replace(/\s+/g, " ")
  .trim();
const UNITE_MOIS_EN = "(?:months?|mths?|mos?)";
const UNITE_ANS_EN = "(?:years?\\s*old|yrs?\\s*old|y\\.?\\s*o\\.?|yrs?|years?|y)";
const MOIS_EN_RE = new RegExp(`^${UNITE_MOIS_EN}$`);
// [1] « age(s) » ; [2] première borne ; [3] seconde borne ; [4] unité.
const AGE_EN_RE = new RegExp(
  `^(ages?\\s*:?\\s*)?(\\d{1,2})(?:\\s*(?:-|\\/|to|a)\\s*(\\d{1,2}))?\\s*(${UNITE_ANS_EN}|${UNITE_MOIS_EN}|ans?|mois)?\\.?$`,
);
/**
 * L'écriture FRANÇAISE d'un âge écrit en anglais, ou null. Jamais une conversion d'unité.
 * @param {unknown} brut
 * @returns {string|null}
 */
function ageEnFrancais(brut) {
  const s = plierAge(brut);
  if (/^(?:new ?born|nouveau ?-?nes?)$/.test(s)) return "Naissance";
  const m = AGE_EN_RE.exec(s);
  if (!m) return null;
  const prefixeAge = Boolean(m[1]);
  const unite = m[4] ?? "";
  if (!unite && !prefixeAge) return null;
  const enMois = MOIS_EN_RE.test(unite) || unite === "mois";
  const de = Number(m[2]);
  const a = m[3] === undefined ? null : Number(m[3]);
  if (a !== null && a <= de) return null;
  const max = enMois ? 36 : 18;
  if (de > max || (a ?? de) > max) return null;
  const borne = a !== null ? `${de}-${a}` : String(de);
  return `${borne} ${enMois ? "mois" : ((a ?? de) > 1 ? "ans" : "an")}`;
}

// ── La stature écrite en centimètres (12/11) : « 140 cm », « 140cm », « EU 140cm », « EUR 140 cm » → 140 ; sinon null.
// L'unité ÉCRITE fait la stature : un nombre nu (« 140 ») ou préfixé sans unité (« EU 140 ») n'en est jamais une ici.
const CM_RE = new RegExp(`^(?:(?:${SITES_RE})\\s*[:.]?\\s*)?(\\d{2,3})\\s*cm$`);
function lireCm(v) {
  const m = CM_RE.exec(plier(v));
  return m ? Number(m[1]) : null;
}

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
// ── « EUR » ≡ « EU » (09/10, Depop) ─────────────────────────────────────────
// Depop écrit ses pointures adultes « EUR 38 » (grilles 48 et 79 du relevé du
// 08/10) là où l'app écrit « EU 38 » : le même système, deux orthographes —
// une TRADUCTION, jamais une conversion. Sans « eur » ici, toute pointure
// adulte était refusée sur Depop. « EUR » garde le pays EU : « EUR 38 » ≢ « 38 »
// (le nombre nu reste français ; seul le dernier recours de tailleDansGrille,
// à sens unique, le pose sur l'option EU d'une grille qui n'écrit que l'EU).
// Mesuré avant le changement (09/10) : aucune grille relevée de Vinted,
// Leboncoin, eBay, Beebs ou Opla, aucune taille de fiche, aucun job n'écrit
// « EUR » — les sorties des cinq plateformes ne bougent pas (tailles-rejeu).
function lireNombre(v) {
  const s = plier(v);
  const m = /^(?:(fr|eur|eu|t|taille)\s*)?(\d{1,3}(?:\.\d)?)(?:\s*(fr|eur|eu))?$/.exec(s);
  if (!m || (m[1] && m[3])) return null;
  const estEu = (x) => x === "eu" || x === "eur";
  const pays = (m[1] === "fr" || m[3] === "fr") ? "fr" : (estEu(m[1]) || estEu(m[3])) ? "eu" : "";
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
function memeTaille(a, b) {
  if (!a || !b) return false;
  if (plier(a) === plier(b)) return true;
  if (serrer(a) === serrer(b)) return true;
  if (estUnique(a) && estUnique(b)) return true;
  // Un tour de taille ne vaut QU'un tour de taille (« W34 » ≢ « 34 »).
  // Deux longueurs écrites doivent aussi s'accorder (« W34 L32 » ≢ « W34 L30 »).
  const tA = lireTourDeTaille(a), tB = lireTourDeTaille(b);
  if (tA?.w || tB?.w) return Boolean(tA?.w && tB?.w) && tA.w === tB.w && (tA.l == null || tB.l == null || tA.l === tB.l);
  // (12/11) Deux statures écrites en cm, préfixe de site ou non (« EU 140cm » ≡ « 140 cm ») — seulement quand LES
  // DEUX écrivent l'unité : « 140 » nu reste un nombre.
  const cA = lireCm(a), cB = lireCm(b);
  if (cA != null && cB != null) return cA === cB;
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
  if (memePays) return memePays;
  // (12/11) Une lettre : l'option écrite dans le même site (sans préfixe → l'option sans préfixe).
  const site = (x) => lireSysteme(x)?.systeme ?? "";
  const memeSite = canonLettre(valeur) ? egales.find((o) => site(o) === site(valeur)) : null;
  return memeSite ?? egales[0];
}

// Registre historique conservé pour compatibilité des imports, jamais utilisé
// pour choisir une taille. Une table d'une autre grille ne prouve pas la cible.
const TAILLE_FEMME_LETTRE_PAR_NOMBRE = Object.freeze({
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
function tailleDansGrille(brut, grille, opts) {
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
  //    (12/11) ⛔ Une TRANCHE d'âge écrite avec « / » (« 6/9 mois », « 11/12 yrs ») est UNE taille, jamais deux
  //    morceaux : « 9 mois » ou « 12 ans » seraient une de ses bornes (règle E1 d'eBay du 07/11, devenue commune).
  const ageEntier = canonAge(valeur);
  const morceaux = ageEntier && ageEntier.de !== ageEntier.a ? [valeur] : jetons(valeur);
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
    // (12/11) Les options NEUTRES (« One size », « Other », « Autre ») ne disent aucune taille : elles ne font pas
    // d'une grille d'âges une grille mixte (Depop 101 : « One size », 0-3 months … 16 years, « Other » — fe3af982).
    // Il faut au moins un âge.
    const queDesAges = options.some((o) => canonAge(o)) && options.every((o) => canonAge(o) || estNeutre(o));
    const ages = AGE_PAR_STATURE_ENFANT[stature];
    // (12/11) Un âge que la grille n'écrit pas seul, mais comme le BOUT d'une tranche (Depop « 18-24 months » face à
    // 92 cm = 24 mois = 2 ans : « N mois » = jusqu'à N mois), a deux lectures possibles (la tranche, ou l'âge suivant
    // de la même ligne, « 2 years ») : on ne tranche pas, la question (décision du 28/10 pour Depop, gardée quand
    // « Other » cesse de masquer la grille d'âges). Un âge écrit tel quel (« 24M » d'Opla) passe comme avant.
    const trancheAuBout = (age) => {
      const g = canonAge(age);
      return !!g && options.some((o) => { const x = canonAge(o); return !!x && x.de !== x.a && x.unite === g.unite && x.a === g.a; });
    };
    if (queDesAges && ages && !parCm.length) {
      for (const age of ages) {
        const cible = options.find((o) => memeTaille(o, age));
        if (cible) return { valeur: cible, motif: `étiquette enfant ${stature} cm = ${age}` };
        if (trancheAuBout(age)) return null;
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
const AGE_PAR_STATURE_ENFANT = Object.freeze({
  "50": ["0 mois"], "56": ["1 mois"], "62": ["3 mois"], "68": ["6 mois"],
  "74": ["9 mois"], "80": ["12 mois"], "86": ["18 mois"], "92": ["24 mois", "2 ans"],
  "98": ["3 ans", "36 mois"], "104": ["4 ans"], "110": ["5 ans"], "116": ["6 ans"],
  "122": ["7 ans"], "128": ["8 ans"], "134": ["9 ans"], "140": ["10 ans"],
  "146": ["11 ans"], "152": ["12 ans"], "158": ["13 ans"], "164": ["14 ans"],
  "170": ["15 ans"], "176": ["16 ans"],
});

// « 86 », « 86 cm », « 86cm », « T86 », « taille 86 » → "86" ; sinon null.
// (12/11) « EU 140cm », « EUR 140 cm » → "140" : un préfixe de site devant des centimètres ÉCRITS (lireCm) — jamais
// devant un nombre sans unité (« EU 86 » reste une taille EU). Exportée : la même lecture pour Depop (tailleDepop).
function statureEnfant(v) {
  const s = plier(v).replace(/^(?:taille|t)\s*/, "");
  const m = /^(\d{2,3})\s*(?:cm)?$/.exec(s);
  const n = m ? m[1] : (lireCm(v) != null ? String(lireCm(v)) : null);
  if (!n) return null;
  return Object.prototype.hasOwnProperty.call(AGE_PAR_STATURE_ENFANT, n) ? n : null;
}

// ══════════════════════════════════════════════════════════════════════════
// LA MÊME TAILLE, OU UNE AUTRE ? — UNE COPIE FACE À LA FICHE (12/11, décision de Nico)
// ══════════════════════════════════════════════════════════════════════════
// « Une taille qui contredit la fiche ne part jamais. » Fiche 1793630721658 (compte c7c382b7) : l'étiquette lue dit
// « EU 140cm » (= 10 ans) ; la copie Vinted portait « 9 ans », la copie Beebs « Naissance » — les deux sont parties en
// ligne. Ce module dit si deux écritures sont COMPARABLES (même système, ou stature ↔ âge par la table des étiquettes)
// et, si oui, si elles désignent la même taille. Deux systèmes que rien ne relie (« XL » face à « 42 », « 140 » nu face
// à « 140 cm ») ne sont JAMAIS une contradiction : on n'invente pas plus une contradiction qu'une correspondance.
// L'axe enfant est la stature (cm), par la table AGE_PAR_STATURE_ENFANT :
//   · un âge en ANS est sa stature (10 ans = 140 cm) ;
//   · un âge en MOIS couvre sa stature et la précédente (« N mois » = jusqu'à N mois : Vinted écrit « 3-6 mois /
//     62 cm » ce que la table dit 6 mois = 68 cm) — 6 mois = 62-68 cm ; jamais une fausse contradiction de convention ;
//   · une tranche couvre ses deux bornes ; « Naissance » = 44-50 cm ; « Prématuré » = moins de 44 cm ;
//   · un âge hors de la table (« 1 an », « 15 mois », « 18 ans ») n'est pas comparable.
// Rien ici ne choisit une option de grille : la taille de remplacement est écrite dans le vocabulaire de l'app
// (« 10 ans », « M », « 6 mois ») et la plateforme la traduit ensuite dans SA grille, comme toute taille.
const STATURES_MOIS = Object.freeze([[0, 50], [1, 56], [3, 62], [6, 68], [9, 74], [12, 80], [18, 86], [24, 92], [36, 98]]);
const STATURE_DES_ANS = (() => {
  const index = new Map();
  for (const [s, ages] of Object.entries(AGE_PAR_STATURE_ENFANT)) {
    for (const age of ages) { const g = /^(\d{1,2}) ans$/.exec(age); if (g && !index.has(Number(g[1]))) index.set(Number(g[1]), Number(s)); }
  }
  return index;
})();
function intervalleMois(n) {
  const i = STATURES_MOIS.findIndex(([m]) => m === n);
  if (i < 0) return null;
  return [i === 0 ? 44 : STATURES_MOIS[i - 1][1], STATURES_MOIS[i][1]];
}
function intervalleAns(n) {
  const s = STATURE_DES_ANS.get(n);
  return s === undefined ? null : [s, s];
}
// La lecture enfant d'UN morceau : { min, max, ecriture } en cm, ou null.
function lectureEnfant(t) {
  const p = plier(t);
  if (/^(?:bebe |enfant )?(?:prema(?:ture)?s?|preemie)(?:$|[ .])/.test(p)) return { min: 0, max: 43, ecriture: "Prématuré" };
  if (/^(?:naissance|nouveau nes?|new ?born)$/.test(p)) return { min: 44, max: 50, ecriture: "Naissance" };
  const cm = lireCm(t);
  if (cm != null) return cm >= 40 && cm <= 200 ? { min: cm, max: cm, ecriture: null, cm } : null;
  const tr = /^(\d{2,3}) (\d{2,3}) ?cm$/.exec(p);
  if (tr && Number(tr[1]) < Number(tr[2])) return { min: Number(tr[1]), max: Number(tr[2]), ecriture: null };
  const age = canonAge(t);
  if (!age) return null;
  const iv = age.unite === "M" ? intervalleMois : intervalleAns;
  const a = iv(age.de), b = iv(age.a);
  if (!a || !b) return null;
  const ecriture = age.de === age.a
    ? (age.unite === "M" ? (age.de === 0 ? "Naissance" : `${age.de} mois`) : `${age.de} ${age.de > 1 ? "ans" : "an"}`)
    : `${age.de}-${age.a} ${age.unite === "M" ? "mois" : "ans"}`;
  return { min: Math.min(a[0], b[0]), max: Math.max(a[1], b[1]), ecriture };
}
// Les morceaux d'une écriture : elle-même, puis ses jetons, puis le dehors et le dedans de ses parenthèses
// (« 10 ans (128-140 cm) » — l'écriture Beebs). Une tranche « 6/9 mois » reste entière.
function morceauxDeTaille(v) {
  const s = String(v ?? "").trim();
  const age = canonAge(s);
  const out = [s, ...(age && age.de !== age.a ? [] : jetons(s))];
  const par = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(s);
  if (par) out.push(par[1].trim(), par[2].trim());
  return [...new Set(out.filter(Boolean))];
}
// Les lectures d'une écriture, par genre : lettre, nombre (par système), tour de taille, enfant (cm).
// ⛔ Un NOMBRE ne se lit que sur une écriture SEULE (« 40 », « EU 38 », « UK 10 ») : dans une étiquette composite, les
//    nombres sont écrits nus dans d'AUTRES systèmes (Vinted « M / 38 / 10 » = EU 38 = FR 40 = UK 10) — y lire « 38 »
//    comme un 38 français inventerait une contradiction avec une fiche « 40 ».
function lectures(v) {
  const out = [];
  const entiere = String(v ?? "").trim();
  for (const m of morceauxDeTaille(v)) {
    const l = canonLettre(m);
    if (l) { out.push({ genre: "lettre", l }); continue; }
    const tour = lireTourDeTaille(m);
    if (tour?.w) { out.push({ genre: "tour", w: tour.w }); continue; }
    const enfant = lectureEnfant(m);
    if (enfant) { out.push({ genre: "enfant", ...enfant }); continue; }
    if (m !== entiere) continue;
    const nb = lireNombre(m);
    if (nb) { out.push({ genre: "nombre", systeme: nb.pays === "eu" ? "EU" : "FR", n: nb.n, nu: nb.pays === "" }); continue; }
    const site = lireSysteme(m);
    const ns = site && /^\d{1,3}(?:\.\d)?$/.test(site.reste) ? String(Number(site.reste)) : null;
    if (ns) out.push({ genre: "nombre", systeme: site.systeme, n: ns });
  }
  return out;
}
const comparables = (x, y) => x.genre === y.genre && (x.genre !== "nombre" || x.systeme === y.systeme);
const accord = (x, y) => (x.genre === "lettre" ? x.l === y.l
  : x.genre === "tour" ? x.w === y.w
  : x.genre === "nombre" ? x.n === y.n
  : x.min <= y.max && y.min <= x.max);
const ecritureDe = (x) => (x.genre === "lettre" ? x.l
  : x.genre === "tour" ? `W${x.w}`
  : x.genre === "nombre" ? (x.systeme === "FR" ? x.n : `${x.systeme} ${x.n}`)
  : x.ecriture ?? (x.cm != null && AGE_PAR_STATURE_ENFANT[String(x.cm)]
    ? (AGE_PAR_STATURE_ENFANT[String(x.cm)][0] === "0 mois" ? "Naissance" : AGE_PAR_STATURE_ENFANT[String(x.cm)][0]) : null));

/**
 * Une taille de COPIE face à une taille de RÉFÉRENCE (la fiche, l'étiquette lue).
 * @param {unknown} copie
 * @param {unknown} reference
 * @param {{etiquette?: boolean}} [opts] etiquette : la référence est une ÉTIQUETTE LUE (Lens) — un nombre NU y est
 *   d'un système inconnu (« 27 » : W27 ? 27 enfant ?) et ne sert jamais de référence ; ses lettres, ses âges, ses
 *   centimètres et ses nombres préfixés (« EU 36,5 ») si.
 * @returns {{verdict:'meme'|'contredit'|'incomparable', remplacement:string|null}}
 *   meme : un morceau comparable désigne la même taille ; contredit : des morceaux comparables, aucun d'accord ;
 *   remplacement (contredit seulement) : la référence écrite dans le vocabulaire de l'app, du genre de la copie
 *   (« EU 140cm » → « 10 ans », « EU M » → « M ») — null quand elle ne s'écrit pas sans deviner.
 */
function confronterTailles(copie, reference, opts = {}) {
  const lc = lectures(copie), lr = lectures(reference).filter((y) => !(opts?.etiquette && y.genre === "nombre" && y.nu));
  let comparable = false;
  for (const x of lc) for (const y of lr) {
    if (!comparables(x, y)) continue;
    comparable = true;
    if (accord(x, y)) return { verdict: "meme", remplacement: null };
  }
  if (!comparable) return { verdict: "incomparable", remplacement: null };
  const genres = new Set(lc.map((x) => x.genre));
  const ref = lr.find((y) => lc.some((x) => comparables(x, y)) && ecritureDe(y)) ?? lr.find((y) => genres.has(y.genre) && ecritureDe(y));
  return { verdict: "contredit", remplacement: ref ? ecritureDe(ref) : null };
}

/**
 * Le libellé FRANÇAIS d'une valeur de grille, pour une question posée à la
 * personne : « 18M » → « 18 mois », « 2Y » → « 2 ans », « TAILLE_UNIQUE » →
 * « Taille unique ». Toute autre valeur est rendue telle quelle (« M », « 38 »).
 * Réponse relue par tailleDansGrille : « 18 mois » retombe sur « 18M ».
 */
function libelleTaille(v) {
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
function candidatsTaille(brut, grille) {
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
function diagnosticTaille(brut, grille, opts) {
  if (tailleDansGrille(brut, grille, opts)) return null;
  if (lireTourDeTaille(String(brut ?? "").trim())?.ambigu) return "ambigu";
  const options = (Array.isArray(grille) ? grille : []).map((o) =>
    String(typeof o === "string" ? o : (o?.code ?? o?.title ?? "")).trim()).filter(Boolean);
  const morceaux = jetons(String(brut ?? "").trim());
  const candidates = options.filter((o) =>
    jetons(o).some((m) => morceaux.some((x) => memeTaille(m, x))));
  return candidates.length > 1 ? "ambigu" : "hors_vocabulaire";
}

// ── PUBLICATION ────────────────────────────────────────────────────────
globalThis.taillesVocabulaire = {
  memeTaille, tailleDansGrille, diagnosticTaille, TAILLE_FEMME_LETTRE_PAR_NOMBRE,
  libelleTaille, AGE_PAR_STATURE_ENFANT,
};
