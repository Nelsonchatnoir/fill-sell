// ═══════════════════════════════════════════════════════════════════════════
// VINTED, À LA PUBLICATION : LA COULEUR NE BLOQUE JAMAIS, L'ABSENCE DE MARQUE
// NE SE DEMANDE PAS (11/10/2026 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Filet SERVEUR de get-pending-jobs pour une PUBLICATION Vinted (jamais une
// republication : l'annonce d'origine y est rejouée telle quelle, sans IA).
// L'app (stepper et lot) pose déjà couleur et « Sans marque » avant de créer
// le job (src/publication/moteur/couleurAuto.js, reponsesPartagees.js) ; ce
// filet couvre un écran d'avant la mise à jour, un rayon changé après coup,
// un job déjà en file. Avant, il posait la question « Couleur » / « Marque ».
//
// COULEUR (doctrine : « la couleur ne fait pas vendre, les gens la voient sur
// la photo » — jakefawright a abandonné une figurine sur « Couleur ») :
//   · vinted.js ne lit QUE fields.colors (libellés de la palette) : une
//     couleur de la copie ou de la FICHE (toute source, Lens compris — la
//     publication a droit à l'IA) est ramenée à la palette ; une couleur
//     anglaise de Lens (« Black ») y est traduite (vintedColors.js) ;
//   · rien de lisible → « Multicolore » (palette Vinted, VARIOUS), JAMAIS une
//     question. La fiche n'est jamais écrite.
// MARQUE :
//   · la réponse déjà donnée pour CET article à la question « marque hors
//     catalogue » (inventaire.attributs.marque_vinted = { v, de }) vaut pour
//     toutes ses publications Vinted suivantes — jamais redemandée ;
//   · fiche SANS AUCUNE marque (ni colonne, ni attribut, aucune source) →
//     « Sans marque » (la ligne native de Vinted), sans question ;
//   · une marque présente sur la fiche mais absente du catalogue Vinted garde
//     sa question (posée par l'extension) — jamais une autre marque en silence.
// ES module : Deno (get-pending-jobs) et node (selftest). Pur.
// ═══════════════════════════════════════════════════════════════════════════
import { normalizeVintedColors } from "../../../src/utils/vintedColors.js";
import { SANS_MARQUE, marqueComparable } from "./marque-absente.js";

export const COULEUR_REPLI_VINTED = "Multicolore";

const texte = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * La valeur d'un attribut de fiche, sous ses deux formes ({ v, source } ou chaîne nue).
 * @param {Record<string, any> | null | undefined} attrs
 * @param {string} cle
 * @returns {string}
 */
export function valeurAttribut(attrs, cle) {
  const e = attrs && typeof attrs === "object" ? attrs[cle] : null;
  if (!e) return "";
  if (typeof e === "string") return e.trim();
  if (typeof e === "object") return texte(e.v);
  return "";
}

/**
 * Les couleurs à envoyer (fields.colors) pour une publication Vinted qui en
 * exige une et n'en porte aucune lisible. Jamais vide, jamais une question.
 * @param {{ pf?: Record<string, any>, attrs?: Record<string, any> | null }} [p]
 * @returns {{ colors: string[], source: "copie" | "fiche" | "repli", de: string | null }}
 */
export function couleursVintedSansQuestion({ pf = {}, attrs = null } = {}) {
  const aspects = pf.vintedAspects && typeof pf.vintedAspects === "object" ? pf.vintedAspects : {};
  for (const brut of [texte(pf.couleur), texte(aspects.color)]) {
    if (!brut) continue;
    const n = normalizeVintedColors(brut);
    if (n.colors.length) return { colors: n.colors, source: "copie", de: brut };
  }
  const fiche = valeurAttribut(attrs, "couleur");
  if (fiche) {
    const n = normalizeVintedColors(fiche);
    if (n.colors.length) return { colors: n.colors, source: "fiche", de: fiche };
  }
  return { colors: [COULEUR_REPLI_VINTED], source: "repli", de: texte(pf.couleur) || fiche || null };
}

/**
 * La marque à poser sur une publication Vinted, ou null (rien à faire / la
 * question reste). Ne remplace jamais une vraie marque, sauf par la réponse
 * que la personne a déjà donnée pour CETTE marque sur CET article.
 * @param {{ pf?: Record<string, any>, attrs?: Record<string, any> | null, marqueColonne?: string | null }} [p]
 * @returns {{ marque: string, source: "reponse_article" | "fiche_sans_marque" } | null}
 */
export function marqueVintedSansQuestion({ pf = {}, attrs = null, marqueColonne = null } = {}) {
  const aspects = pf.vintedAspects && typeof pf.vintedAspects === "object" ? pf.vintedAspects : {};
  const actuelle = texte(pf.marque) || texte(aspects.brand);
  const rep = attrs && typeof attrs === "object" ? attrs.marque_vinted : null;
  if (rep && typeof rep === "object" && texte(rep.v)) {
    const de = texte(rep.de);
    if (!actuelle || (de && marqueComparable(actuelle) === marqueComparable(de))) {
      if (marqueComparable(actuelle) !== marqueComparable(rep.v)) return { marque: texte(rep.v), source: "reponse_article" };
      return null;
    }
  }
  if (actuelle) return null;
  const surLaFiche = valeurAttribut(attrs, "marque") || texte(marqueColonne);
  if (surLaFiche) return null; // une marque existe : la question (ou la fiche) tranche, jamais « Sans marque » en silence
  return { marque: SANS_MARQUE, source: "fiche_sans_marque" };
}
