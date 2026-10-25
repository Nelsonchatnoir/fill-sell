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
// (25/10, audit N9) À LA REPUBLICATION aussi, la couleur ne se demande plus
// (couleurRepublicationAPoser, plus bas) — sans IA, jamais par-dessus une
// couleur de l'annonce capturée.
// ES module : Deno (get-pending-jobs) et node (selftest). Pur.
// ═══════════════════════════════════════════════════════════════════════════
import { normalizeVintedColors, VINTED_COLORS } from "../../../src/utils/vintedColors.js";
import { SANS_MARQUE, marqueComparable } from "./marque-absente.js";
import { vintedExigeUneCouleur } from "./vinted-exigences.js";
import { CATALOGUE_VINTED_FR } from "./vinted-catalogue-fr.js";

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

// ═══════════════════════════════════════════════════════════════════════════
// (25/10, audit N9) LA COULEUR D'UNE REPUBLICATION VINTED QUI N'EN PORTE PAS
// ═══════════════════════════════════════════════════════════════════════════
// Jobs 6ff45122 et 775186a3 (compte 40e1122e, « Nerf élite », 20-21/10) :
// l'annonce en ligne n'avait aucune couleur, Vinted en exige une à la
// création ; l'extension cherchait dans l'app (vintedAspects.color), le dépôt
// d'origine (colorsFallback), puis le titre — rien → question « Couleur »
// avant tout retrait (vinted.js, une-passe). La règle couleur_auto du 11/10
// ne servait que la publication. À la republication, servie par
// get-pending-jobs, dans l'ordre et SANS IA :
//   1. la couleur de la FICHE, d'une source du vendeur (saisie à la main,
//      capture, synchro ou relevé de SES annonces — jamais lens ni backfill) ;
//   2. celle du dépôt d'origine (platform_fields.colors de la publication
//      Vinted du même article, la plus récente — la lecture de l'extension) ;
//   3. un mot du titre qui est un libellé de la palette (mots entiers, le plus
//      long d'abord — la lecture de l'extension contre la palette affichée) ;
//   4. sinon « Multicolore » — jamais une question.
// Posée dans vintedAspects.color, le canal que vinted.js lit (il devient
// fields.colors) : ⛔ jamais quand l'annonce capturée porte une couleur
// (vinted.js l'écraserait), jamais par-dessus une couleur déjà là (réponse de
// la personne comprise), jamais pour un rayon mesuré sans champ Couleur, jamais
// sur une page Vinted qui n'est pas française (la palette y porte d'autres mots :
// « Multi » en italien — l'extension y lit elle-même la palette affichée). Une
// couleur posée ici qu'une capture plus récente contredit est retirée.
const SOURCE_DU_VENDEUR_COULEUR = /^(manuel|capture|vinted|releve_)/;
const sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const PALETTE_PAR_LONGUEUR = [...VINTED_COLORS].sort((a, b) => b.length - a.length);
// Les racines du catalogue FRANÇAIS de Vinted (Femmes, Hommes, Enfants, Maison…) : un rayon capturé sous une
// autre racine (« Donna », « Women ») vient d'une page dans une autre langue.
const RACINES_VINTED_FR = new Set(CATALOGUE_VINTED_FR.filter((r) => r[1] === 0).map((r) => sansAccents(r[2])));

/** La couleur de la fiche si elle vient du vendeur (forme { v, source } ou chaîne nue ancienne), sinon "". */
export function couleurDuVendeur(attrs) {
  const e = attrs && typeof attrs === "object" ? attrs.couleur : null;
  if (!e) return "";
  if (typeof e === "string") return e.trim();
  if (typeof e !== "object") return "";
  return SOURCE_DU_VENDEUR_COULEUR.test(String(e.source ?? "")) ? texte(e.v) : "";
}

/** Le premier libellé de la palette Vinted que le titre écrit en mots entiers (le plus long d'abord), sinon null. */
export function couleurDuTitreVinted(titre) {
  const t = sansAccents(titre);
  if (!t) return null;
  for (const libelle of PALETTE_PAR_LONGUEUR) {
    const m = sansAccents(libelle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^a-z0-9])${m}(?:[^a-z0-9]|$)`).test(t)) return libelle;
  }
  return null;
}

const couleursDe = (v) => (Array.isArray(v) ? v.map((c) => texte(c)).filter(Boolean) : (texte(v) ? [texte(v)] : []));

/**
 * Que faire de la couleur d'une republication Vinted servie à l'étape captured / deleted ?
 * `pf` = platform_fields du job ; sa copie (republish_snapshot) doit être celle de SA capture.
 * @returns {null | { action: "poser", chemin: string[], titre: string } | { action: "retirer" }}
 */
export function couleurRepublicationAPoser(pf) {
  if (!pf || typeof pf !== "object") return null;
  const snap = pf.republish_snapshot && typeof pf.republish_snapshot === "object" ? pf.republish_snapshot : null;
  if (!snap || pf.capture_id == null || String(snap.capture_id ?? "") !== String(pf.capture_id)) return null; // copie d'une autre capture : rien
  const aspects = pf.vintedAspects && typeof pf.vintedAspects === "object" ? pf.vintedAspects : {};
  const posee = texte(aspects.color);
  const trace = pf.couleur_republication_sans_question && typeof pf.couleur_republication_sans_question === "object" ? pf.couleur_republication_sans_question : null;
  if (couleursDe(snap.couleurs).length) {
    // L'annonce capturée porte une couleur : la nôtre, si elle est là, s'efface (jamais une réponse de la personne).
    const notre = trace && posee && posee === texte(trace.couleur) && !texte(pf.needsUserResolved?.["vintedAspects.color"]);
    return notre ? { action: "retirer" } : null;
  }
  if (posee) return null; // déjà là (réponse de la personne, ou posée à un service précédent)
  const chemin = Array.isArray(snap.categoryPath) ? snap.categoryPath.map(String) : [];
  if (!chemin.length || !RACINES_VINTED_FR.has(sansAccents(chemin[0])) || !vintedExigeUneCouleur(chemin)) return null;
  return { action: "poser", chemin, titre: texte(snap.titre) };
}

/**
 * La couleur à poser (une seule, de la palette) : fiche du vendeur > dépôt d'origine > titre > « Multicolore ».
 * @param {{ attrs?: Record<string, any> | null, couleursDepot?: unknown, titre?: string }} [p]
 * @returns {{ couleur: string, source: "fiche" | "depot_origine" | "titre" | "repli", de: string | null }}
 */
export function couleurRepublicationSansQuestion({ attrs = null, couleursDepot = null, titre = "" } = {}) {
  const fiche = couleurDuVendeur(attrs);
  const nf = fiche ? normalizeVintedColors(fiche).colors : [];
  if (nf.length) return { couleur: nf[0], source: "fiche", de: fiche };
  for (const c of couleursDe(couleursDepot)) {
    const nd = normalizeVintedColors(c).colors;
    if (nd.length) return { couleur: nd[0], source: "depot_origine", de: c };
  }
  const t = couleurDuTitreVinted(titre);
  if (t) return { couleur: t, source: "titre", de: texte(titre).slice(0, 120) };
  return { couleur: COULEUR_REPLI_VINTED, source: "repli", de: null };
}
