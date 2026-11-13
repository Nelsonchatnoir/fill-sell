// ═══════════════════════════════════════════════════════════════════════════
// LES ÉLÉMENTS D'UN ARTICLE ET LEURS NOMS, PAR LANGUE (13/11, lot « zéro problème », point 5a de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Compte de63ca45 (Pro), propositions du 02/11 : « Notice » écrite pour un feuillet, « Livret » pour un feuillet
// promotionnel, « Boîte cartonnée » et « Jaquette » pour une pochette cartonnée qui n'a pas de jaquette ; et
// « Boîtier en bon état » remplacé par « Boîtier en très bon état » parce que la fiche disait « Très bon état ».
// Deux règles en sortent, pour tous les comptes :
//   1. un document, un contenant ou une édition ne se NOMME que si la source le nomme, avec son nom à lui
//      (notice ≠ livret ≠ feuillet ≠ guide ; « boîte » et « boîtier » disent la même chose) ;
//   2. un état écrit juste après une PARTIE de l'article (« Boîtier en bon état », « Disque : excellent état ») est
//      l'état de cette partie, jamais l'état général de la fiche : il ne se remplace pas, il ne se retire pas.
// Rangé PAR LANGUE (la langue du texte, celle du compte ou du site) : le français est livré, l'anglais prépare le
// terrain. Pur, sans import (Deno + Node + Vite) : scripts/elements-nommes-selftest.ts, etat-jamais-embelli.
// ═══════════════════════════════════════════════════════════════════════════

/** Forme comparable d'un mot : sans accents, minuscule. */
export const motComparable = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const ELEMENTS_PAR_LANGUE = Object.freeze({
  fr: Object.freeze({
    // Noms qu'un texte rédigé ne peut écrire que si la source les écrit. Un groupe = un même objet sous deux mots.
    nommes: Object.freeze([
      ["notice"], ["livret"], ["feuillet"], ["guide"], ["manuel"], ["jaquette"], ["boite", "boitier"], ["pochette"],
      ["fourreau"], ["etui"], ["coffret"], ["poster", "affiche"], ["artbook"], ["steelbook"],
    ]),
    // Éditions : nommées seulement si la source (titre, note, lecture) les nomme.
    editions: Object.freeze([
      /[ée]dition\s+(?:collector|limit[ée]e|sp[ée]ciale|deluxe|gold|ultimate|compl[èe]te|game of the year|premium|standard)/iu,
      /collector/iu, /steelbook/iu, /artbook/iu, /fourreau/iu, /(?:^|[^\p{L}])goty(?=$|[^\p{L}])/iu,
    ]),
    // Parties d'un article : un état écrit juste après elles est l'état de cette partie.
    parties: Object.freeze([
      "disque", "disques", "cartouche", "cartouches", "boite", "boites", "boitier", "boitiers", "jaquette", "jaquettes",
      "notice", "notices", "livret", "livrets", "feuillet", "feuillets", "manuel", "manuels", "guide", "guides",
      "pochette", "pochettes", "fourreau", "fourreaux", "etui", "etuis", "coffret", "coffrets", "cable", "cables",
      "manette", "manettes", "chargeur", "chargeurs", "ecran", "batterie", "film", "plastique", "coque", "couverture",
      "pages", "tranche", "dos", "coins", "angles", "semelle", "semelles", "bracelet", "cadran", "verre", "sangle",
      "fermeture", "zip", "doublure", "poster", "affiche", "artbook", "steelbook", "illustrations", "code", "codes",
    ]),
    // Juste avant un nom : il dit une ABSENCE (« sans notice », « ni jaquette ») — ce n'est pas nommer un élément présent.
    absence: /(?:^|[^\p{L}])(?:sans|ni|pas\s+de|pas\s+d['’]|aucune?s?|non|hors)\s+(?:[\p{L}'’-]+\s+){0,2}$/iu,
  }),
  en: Object.freeze({
    nommes: Object.freeze([["manual"], ["booklet"], ["leaflet", "insert"], ["guide"], ["cover"], ["case", "box"], ["sleeve"], ["artbook"], ["steelbook"]]),
    editions: Object.freeze([/collector/iu, /steelbook/iu, /artbook/iu, /(?:^|[^\p{L}])goty(?=$|[^\p{L}])/iu, /limited\s+edition/iu]),
    parties: Object.freeze(["disc", "disk", "cartridge", "case", "box", "cover", "manual", "booklet", "leaflet", "insert", "sleeve", "cable", "controller", "screen", "battery", "sole", "strap"]),
    absence: /(?:^|[^\p{L}])(?:without|no|nor|not)\s+(?:[\p{L}'’-]+\s+){0,2}$/iu,
  }),
});

/** Le lexique d'une langue (français par défaut : la seule livrée). */
export function lexiqueElements(langue) {
  return ELEMENTS_PAR_LANGUE[String(langue ?? "").slice(0, 2).toLowerCase()] ?? ELEMENTS_PAR_LANGUE.fr;
}

const MOT = /[\p{L}\p{N}]+/gu;

/** Un mot (forme comparable) est-il ce nom, au singulier ou au pluriel ? */
function estLeNom(mot, nom) {
  return mot === nom || mot === `${nom}s` || mot === `${nom}x`;
}

/**
 * Les éléments nommés dans un texte, présents (jamais ceux qu'une absence nie : « sans notice »).
 * @returns {Array<{groupe: number, mot: string, index: number}>}
 */
export function elementsNommes(texte, langue = "fr") {
  const lex = lexiqueElements(langue);
  const t = String(texte ?? "");
  const out = [];
  for (const m of t.matchAll(MOT)) {
    const mot = motComparable(m[0]);
    const groupe = lex.nommes.findIndex((g) => g.some((nom) => estLeNom(mot, nom)));
    if (groupe < 0) continue;
    if (lex.absence.test(t.slice(Math.max(0, m.index - 40), m.index))) continue;
    out.push({ groupe, mot: m[0], index: m.index });
  }
  return out;
}

/** Les groupes d'éléments qu'une source nomme (présents ou niés : la source en parle, le nom est le sien). */
export function groupesDeLaSource(texte, langue = "fr") {
  const lex = lexiqueElements(langue);
  const groupes = new Set();
  for (const m of String(texte ?? "").matchAll(MOT)) {
    const mot = motComparable(m[0]);
    lex.nommes.forEach((g, i) => { if (g.some((nom) => estLeNom(mot, nom))) groupes.add(i); });
  }
  return groupes;
}

/** Les éditions nommées par un texte (motifs du lexique qui le trouvent). */
export function editionsNommees(texte, langue = "fr") {
  const lex = lexiqueElements(langue);
  const t = String(texte ?? "");
  return lex.editions.filter((re) => re.test(t));
}

/**
 * Un état écrit à `index` dans `texte` est-il celui d'une PARTIE de l'article ? Vrai quand une partie est nommée
 * entre le début du segment (ligne, phrase, puce) et la formule d'état : « Boîtier en bon état », « Disque : très bon
 * état », « 📦 Boîtier en très bon état, ferme bien ».
 */
export function etatDUnePartie(texte, index, langue = "fr") {
  const lex = lexiqueElements(langue);
  const avant = String(texte ?? "").slice(0, Math.max(0, index));
  const debut = Math.max(avant.lastIndexOf("\n"), avant.search(/[.!?;](?=[^.!?;]*$)/));
  const segment = avant.slice(debut + 1);
  for (const m of segment.matchAll(MOT)) {
    if (lex.parties.includes(motComparable(m[0]))) return true;
  }
  return false;
}
