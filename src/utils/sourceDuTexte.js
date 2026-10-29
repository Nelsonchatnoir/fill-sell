// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE DU VENDEUR N'EST JAMAIS RÉÉCRIT — QUI A ÉCRIT CE TEXTE ? (29/10, lot B partie 2)
// ═══════════════════════════════════════════════════════════════════════════
// paugues.contact (Pro), « Jazz man » 1793117541271 (27/10) : la fiche est créée au Stock à 17:12:23 avec SON
// titre et SA description ; à 17:12:36 la génération de l'écran de publication la traite comme « notre brouillon »
// (texte_vendeur_titre=false, texte_vendeur_description=false) et la réécrit — gabarit Vinted, « Envoi rapide »,
// #peinture #acrylique #jazz… Elle retouche ce texte de l'IA dans l'écran, et la retouche est recopiée sur la fiche
// (marqueur « manuel » à 17:12:44) : son texte d'origine est perdu, le job part identique au stock.
// La cause : le marqueur titre_source / description_source n'était posé qu'à la MODIFICATION d'une fiche, jamais à
// sa CRÉATION — et les quatre décideurs (generate-listing, l'écran, texteDeLaFiche.js, contenu-fiche.js) exigeaient
// ce marqueur ou une origine de relevé. Un texte tapé à la création passait pour du texte de FillSell.
// Mesuré (30 jours) : 56 fiches tapées à la main sur 15 comptes, 21 titres réécrits (8 comptes), 11 descriptions du
// stock remplacées par la copie de l'IA (paugues 10, lohanobert59 1).
//
// LA RÈGLE (Nico, 29/10) : « ce que le vendeur tape est gardé tel quel, partout. L'IA n'écrit que dans un champ
// vide, ou sur demande explicite. » Elle prolonge celle du 21/09 (« un texte qui EXISTE fait foi ») :
//   · un texte est À FILLSELL seulement s'il porte NOTRE marque : lens, vocal, ia (écrit par « Générer ») ;
//   · tout autre texte d'une FICHE DU STOCK est au vendeur — marqueur vinted / manuel / releve_*, origine d'un
//     relevé ou du dressing, ET désormais : aucun marqueur du tout (une fiche tapée avant ce lot n'en porte pas) ;
//   · un objet qui n'est PAS une ligne du stock (résultat d'une analyse Lens, corps item_data d'un article pas encore
//     enregistré) n'a de texte du vendeur que s'il le DIT par un marqueur : sans marqueur, c'est notre brouillon.
// Un texte vide ou d'un seul mot ne dit rien de l'article (exception du 07/09) : l'IA peut le compléter.
// Pur, sans réseau, partagé par l'app et le serveur (generate-listing, contenu-fiche.js) :
// scripts/source-du-texte-selftest.mjs.

export const CHAMPS_TEXTE_FICHE = Object.freeze(["titre", "description"]);

/** Les marques de FillSell : un texte qui en porte une a été écrit par nous. */
export const MARQUES_FILLSELL = Object.freeze(["lens", "vocal", "ia"]);

/** La valeur d'un marqueur d'attributs ({ v } ou valeur nue), en minuscules. */
export function valeurMarqueur(attributs, cle) {
  const c = attributs && typeof attributs === "object" ? attributs[cle] : null;
  const v = c && typeof c === "object" ? c.v : c;
  return String(v ?? "").trim().toLowerCase();
}

/** Un marqueur qui dit « c'est le texte du vendeur » (règle du 21/09). */
export const marqueurDuVendeur = (v) => v === "vinted" || v === "manuel" || String(v ?? "").startsWith("releve");

/** Un marqueur qui dit « c'est FillSell qui a écrit ce texte ». */
export const marqueurDeFillsell = (v) => MARQUES_FILLSELL.includes(String(v ?? ""));

const origineDuVendeur = (o) => {
  const s = String(o ?? "").trim().toLowerCase();
  return s.startsWith("releve") || s === "vinted_sync";
};

/** Un objet est-il une ligne du STOCK (inventaire) ? Ces lignes portent toujours la clé `origine`, même nulle. */
export function estLigneDuStock(ligne) {
  return Boolean(ligne && typeof ligne === "object" && Object.prototype.hasOwnProperty.call(ligne, "origine"));
}

/** Le texte, s'il dit quelque chose de l'article (deux mots au moins), sinon "". */
export function texteAssezLong(v) {
  const t = String(v ?? "").trim();
  return t && t.split(/\s+/).filter(Boolean).length >= 2 ? t : "";
}

/**
 * Le champ (« titre » | « description ») de cette fiche est-il écrit par le VENDEUR ?
 * @param {object|null} ligne   ligne du stock, ou objet d'analyse / item_data
 * @param {string} champ  « titre » | « description »
 * @param {{ ligneDuStock?: boolean }} [opts]  force la nature de l'objet (sinon : présence de la clé `origine`)
 */
export function champDuVendeur(ligne, champ, { ligneDuStock } = {}) {
  if (!ligne || typeof ligne !== "object") return false;
  const v = valeurMarqueur(ligne.attributs, `${champ}_source`);
  if (marqueurDuVendeur(v)) return true;
  if (origineDuVendeur(ligne.origine)) return true;
  if (marqueurDeFillsell(v)) return false;
  const duStock = typeof ligneDuStock === "boolean" ? ligneDuStock : estLigneDuStock(ligne);
  return duStock;
}

/** Le titre et la description de la fiche quand ce sont ceux du vendeur (sinon ""). */
export function texteDuVendeurDeLaFiche(ligne, opts = {}) {
  if (!ligne || typeof ligne !== "object") return { titre: "", description: "" };
  return {
    titre: champDuVendeur(ligne, "titre", opts) ? texteAssezLong(ligne.titre) : "",
    description: champDuVendeur(ligne, "description", opts) ? texteAssezLong(ligne.description) : "",
  };
}

/**
 * Les marqueurs à poser à la NAISSANCE d'une fiche (attributs.titre_source / description_source), pour les seuls
 * champs non vides. `source` : « manuel » (tapé par la personne), « lens », « vocal ».
 */
export function marqueursDeNaissance({ titre, description } = {}, source = "manuel", at = new Date().toISOString()) {
  const m = {};
  const s = String(source || "manuel");
  if (String(titre ?? "").trim()) m.titre_source = { v: s, source: s, at };
  if (String(description ?? "").trim()) m.description_source = { v: s, source: s, at };
  return m;
}
