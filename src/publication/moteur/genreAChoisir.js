// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON (GENRE) À CHOISIR : UNE QUESTION A TOUJOURS SON CHAMP (22/10 soir, point 4 — Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel : « Lunettes enfants Stitch » (louis-seller, fiche importée de Vinted) — la copie Beebs portait le genre
// « Enfant », que Beebs n'a pas (ses rayons : Femme, Homme, Fille, Garçon, Bébé). L'écran comptait « une question »
// et grisait Publier, mais n'affichait qu'une phrase (« choisis un genre dans les champs Beebs ») : aucun champ.
// Désormais la question montre les SEULS rayons qui existent pour cet article (ceux qui résolvent une catégorie
// réelle), et le moteur en pose un lui-même quand c'est sûr — jamais une valeur devinée :
//   1. un seul rayon existe pour cet article ;
//   2. le titre ou la description nomment UN genre (« fille », « garçon »…) et ce rayon existe ;
//   3. le genre choisi est « Enfant » et un seul rayon enfant existe pour cet article.
// « Mixte » ou « unisexe » dans le texte, ou deux genres nommés : on demande.

export const RAYONS_GENRE = Object.freeze({
  vinted: Object.freeze(["Femme", "Homme", "Fille", "Garçon"]),
  beebs: Object.freeze(["Femme", "Homme", "Fille", "Garçon", "Bébé"]),
});

const ENFANT = new Set(["Fille", "Garçon", "Bébé"]);
const AVANT = "(?<![\\p{L}\\p{N}])";
const APRES = "(?![\\p{L}\\p{N}])";
const mot = (corps) => new RegExp(`${AVANT}(?:${corps})${APRES}`, "iu");
const MOTS_GENRE = [
  ["Fille", mot("filles?|fillette|girls?")],
  ["Garçon", mot("gar[cç]ons?|boys?")],
  ["Bébé", mot("b[ée]b[ée]s?|baby|naissance")],
  ["Femme", mot("femmes?|women|woman|dames?")],
  ["Homme", mot("hommes?|men|man")],
];
const PLUSIEURS = mot("mixtes?|unisexes?|unisex");

/** Les rayons qui existent pour cet article sur la plateforme : ceux dont `cheminDe(icon, genre)` résout une catégorie. */
export function rayonsGenreValides(plateforme, icon, cheminDe) {
  const tous = RAYONS_GENRE[plateforme] ?? [];
  if (typeof cheminDe !== "function") return [];
  return tous.filter((g) => {
    try { return Boolean(cheminDe(icon, g)); } catch { return false; }
  });
}

/** Les genres que le texte nomme (dans l'ordre de MOTS_GENRE), et le mot qui le dit. */
export function genresNommes(texte) {
  const t = String(texte ?? "");
  const out = [];
  for (const [genre, re] of MOTS_GENRE) {
    const m = t.match(re);
    if (m) out.push({ genre, mot: m[0] });
  }
  return out;
}

/**
 * Le rayon sûr, ou null (pur, testé).
 * @returns {{ valeur: string, preuve: "seul_rayon"|"texte"|"seul_rayon_enfant", mot?: string } | null}
 */
export function genreSur({ actuel = "", valides = [], texte = "" } = {}) {
  const v = Array.isArray(valides) ? valides : [];
  if (!v.length) return null;
  if (v.length === 1) return { valeur: v[0], preuve: "seul_rayon" };
  const t = String(texte ?? "");
  if (!PLUSIEURS.test(t)) {
    const nommes = genresNommes(t);
    if (nommes.length === 1 && v.includes(nommes[0].genre)) return { valeur: nommes[0].genre, preuve: "texte", mot: nommes[0].mot };
  }
  if (String(actuel) === "Enfant") {
    const enfants = v.filter((g) => ENFANT.has(g));
    if (enfants.length === 1) return { valeur: enfants[0], preuve: "seul_rayon_enfant" };
  }
  return null;
}

/** La phrase qui dit d'où vient un rayon posé par le moteur. */
export function phraseGenreDeduit(deduit, nomPlateforme, lang = "fr") {
  if (!deduit) return "";
  const en = lang === "en";
  if (deduit.preuve === "texte") {
    return en
      ? `${nomPlateforme} section set to “${deduit.valeur}”: your text says “${deduit.mot}”. Change it if this item is different.`
      : `Rayon ${nomPlateforme} « ${deduit.valeur} » : ton texte dit « ${deduit.mot} ». Change-le si cet article est différent.`;
  }
  if (deduit.preuve === "seul_rayon_enfant") {
    return en
      ? `${nomPlateforme} has only one kids' section for this item: “${deduit.valeur}”. Change it if needed.`
      : `${nomPlateforme} n'a qu'un rayon enfant pour cet article : « ${deduit.valeur} ». Change-le si besoin.`;
  }
  return en
    ? `${nomPlateforme} has only one section for this item: “${deduit.valeur}”.`
    : `${nomPlateforme} n'a qu'un rayon pour cet article : « ${deduit.valeur} ».`;
}

/** La phrase de la question (genre actuel impossible sur la plateforme). */
export function phraseGenreAChoisir({ actuel = "", valides = [], nomPlateforme = "", lang = "fr" } = {}) {
  const en = lang === "en";
  if (!valides.length) {
    return en
      ? `${nomPlateforme} has no section for this item. Untick ${nomPlateforme}, or change the item type.`
      : `${nomPlateforme} n'a aucun rayon pour cet article. Décoche ${nomPlateforme}, ou change le type de l'article.`;
  }
  const a = String(actuel ?? "").trim();
  return en
    ? `${a ? `“${a}” is not a ${nomPlateforme} section for this item.` : `${nomPlateforme} needs a section for this item.`} Choose the one that fits:`
    : `${a ? `« ${a} » n'est pas un rayon ${nomPlateforme} pour cet article.` : `${nomPlateforme} demande un rayon pour cet article.`} Choisis celui qui lui correspond :`;
}
