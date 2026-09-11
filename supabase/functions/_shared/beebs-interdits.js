// ── Articles que Beebs (by Kiabi) N'ACCEPTE PAS dans son catalogue ───────────
// Source : https://sos.beebs.app/hc/fr/articles/5843157506706 (« Les règles du
// catalogue Beebs by Kiabi », relevé le 11/09/2026). Beebs modère automatiquement
// et RETIRE l'annonce non conforme — autant ne pas la déposer.
//
// UN SEUL fichier, lu des deux côtés :
//   · l'app (src/utils/platformCompat.js) : la case Beebs est GRISÉE, le motif
//     est écrit sous la case, l'unité n'est jamais débitée ;
//   · le serveur (get-pending-jobs) : filet sur un job déjà en file (app sans
//     l'OTA, relance) — le job passe en needs_user avec le même motif, rien
//     n'est annulé.
// ES module SANS import : chargé tel quel par Vite (app) et par Deno (fonctions).
//
// RÈGLE DU CHANTIER (Nico, 11/09/2026) — on ne bloque QUE sur une source
// CERTAINE :
//   · la marque RELEVÉE SUR VINTED (attributs.marque.source ∈ SOURCES_CERTAINES),
//   · la catégorie Vinted de l'article (inventaire.vinted_catalog_id, écrit par
//     la sync du dressing, le détail Vinted ou la capture — jamais par l'IA),
//   · l'état RELEVÉ SUR VINTED (attributs.etat.source ∈ SOURCES_CERTAINES) pour
//     les articles acceptés « neufs seulement ».
// JAMAIS un mot du titre, JAMAIS une déduction de l'IA (source « lens »), JAMAIS
// la marque saisie dans le formulaire de l'aperçu (pré-remplie par l'IA). En cas
// de doute, on laisse passer : c'est Beebs qui tranche à la modération. Les
// autres plateformes ne lisent pas ce fichier.

export const SOURCES_CERTAINES = ["vinted_liste", "vinted_detail", "capture"];

// Marques refusées : Temu et Shein ; articles de luxe Louis Vuitton et Chanel ;
// robots Thermomix. Égalité STRICTE sur la forme normalisée (minuscules, sans
// accents, espaces réduits) — jamais « contient ».
export const MARQUES_INTERDITES = ["temu", "shein", "louis vuitton", "chanel", "thermomix"];

// Feuilles du catalogue Vinted refusées QUEL QUE SOIT L'ÉTAT — relevé
// docs/vinted-catalog-tree.json (11/09/2026), libellés [fr, en] écrits à la
// personne. Vérifié sur le parc le 11/09 : 1 article publié sur Beebs sur 265
// tombait sous ces règles (une marque), 0 par catégorie.
//
// Volontairement ABSENTS, Beebs les accepte :
//   · chaussettes (1262, 1828, 1600, 1757) et collants (1263, 1601, 1758) ;
//   · maillots de bain (28, 84, 218, 219, 220, 1780) ;
//   · pyjamas, tenues de nuit et peignoirs (123, 1030, 1616, 2910-2914) ;
//   · bodies bébé (1835, 1515, 1643), brassières de sport (1439) ;
//   · « Ensembles » lingerie 229 : la feuille contient des ensembles de PYJAMA
//     (« Pyjama polaire Stitch Primark XXS », publié sur Beebs) → doute → passe ;
//   · « Autres » (124, 1867, 1871, 1872) et accessoires de lingerie (1847) ;
//   · caméscopes 3078, ordinateurs de bureau 3581 (« PC gaming » indécidable),
//     tablettes, consoles 3025 (la PS5 n'est pas une feuille Vinted), gros
//     électroménager et ordinateurs de vélo (aucune feuille Vinted).
export const CATEGORIES_INTERDITES = {
  // Sous-vêtements, même neufs
  119: ["soutiens-gorge", "bras"],
  120: ["culottes", "knickers"],
  1781: ["gaines", "shapewear"],
  1615: ["sous-vêtements de maternité", "maternity underwear"],
  1618: ["soutiens-gorge de grossesse et d'allaitement", "maternity and nursing bras"],
  1829: ["sous-vêtements homme", "men's underwear"],
  1602: ["culottes enfant", "children's knickers"],
  1759: ["culottes enfant", "children's underwear"],
  // Électronique refusée
  3661: ["téléphones portables", "mobile phones"],
  3580: ["ordinateurs portables", "laptops"],
  3602: ["cartes graphiques", "graphics cards"],
  3738: ["téléviseurs", "televisions"],
  3739: ["projecteurs", "projectors"],
  3745: ["systèmes home cinéma", "home cinema systems"],
  3756: ["écrans de projection", "projection screens"],
  3697: ["barres de son", "soundbars"],
  3577: ["casques de réalité virtuelle", "VR headsets"],
  3074: ["caméras d'action", "action cameras"],
  3075: ["appareils photo numériques", "digital cameras"],
  3076: ["appareils photo argentiques", "film cameras"],
  3077: ["appareils photo instantanés", "instant cameras"],
  3714: ["appareils photo", "cameras"],
  3723: ["drones", "drones"],
};

// Feuilles acceptées NEUVES et scellées seulement (consommables, hygiène,
// cosmétiques, puériculture). Bloquées quand l'état est CERTAIN et n'est pas
// « neuf » ; état absent ou incertain = on laisse passer. Vinted n'accepte que
// du neuf en Beauté : en pratique ce groupe ne bloque rien aujourd'hui (0/265).
export const CATEGORIES_NEUF_SEULEMENT = {
  964: ["maquillage", "make-up"],
  152: ["parfums", "fragrances"],
  948: ["soins du visage", "skincare"],
  1264: ["soins des mains", "hand care"],
  956: ["soins du corps", "body care"],
  1902: ["soins des cheveux", "hair care"],
  153: ["cosmétiques", "cosmetics"],
  143: ["soins du visage", "skincare"],
  140: ["soins des cheveux", "hair care"],
  141: ["soins du corps", "body care"],
  142: ["soins des mains et des ongles", "hand and nail care"],
  145: ["parfums", "fragrances"],
  144: ["maquillage", "make-up"],
  968: ["cosmétiques", "cosmetics"],
  3410: ["shampoings, savons et soins bébé", "baby shampoos, soaps and skincare"],
  3411: ["lingettes bébé", "baby wipes"],
  3402: ["couches jetables", "disposable nappies"],
  3436: ["biberons", "baby bottles"],
  3437: ["tétines", "dummies and teats"],
  3353: ["jouets de dentition", "teething toys"],
  3383: ["sièges auto", "car seats"],
};

const normaliser = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// « Neuf avec étiquette », « Neuf sans étiquette », « Neuf », « New with tags »…
const estNeuf = (etat) => {
  const e = normaliser(etat);
  return e.startsWith("neuf") || e.startsWith("new");
};

// Valeur d'un attribut SEULEMENT si sa source est certaine — sinon null (doute).
function champCertain(attributs, cle) {
  const champ = attributs && typeof attributs === "object" ? attributs[cle] : null;
  if (!champ || typeof champ !== "object") return null;
  if (!SOURCES_CERTAINES.includes(String(champ.source ?? ""))) return null;
  const v = champ.v;
  return v == null || String(v).trim() === "" ? null : String(v).trim();
}

/**
 * Verdict Beebs pour un article, d'après la ligne inventaire (ou un objet qui
 * en porte les mêmes champs) : `attributs` ({ marque, etat } en { v, source })
 * et `vinted_catalog_id`. Tout autre champ (titre, description, marque saisie)
 * est IGNORÉ par construction.
 *
 * @param {{ attributs?: unknown, vinted_catalog_id?: unknown }|null} article
 * @returns {null | { motif: "marque", marque: string }
 *   | { motif: "categorie", vinted_catalog_id: number, categorie: string[] }
 *   | { motif: "usage", vinted_catalog_id: number, categorie: string[], etat: string }}
 *   null = rien de certain ne s'oppose au dépôt (y compris en cas de doute).
 */
export function verdictBeebsInterdit(article) {
  if (!article || typeof article !== "object") return null;
  const attributs = article.attributs;
  const marque = champCertain(attributs, "marque");
  if (marque && MARQUES_INTERDITES.includes(normaliser(marque))) {
    return { motif: "marque", marque };
  }
  const cat = Number(article.vinted_catalog_id);
  if (Number.isInteger(cat) && cat > 0) {
    if (Object.prototype.hasOwnProperty.call(CATEGORIES_INTERDITES, cat)) {
      return { motif: "categorie", vinted_catalog_id: cat, categorie: CATEGORIES_INTERDITES[cat] };
    }
    if (Object.prototype.hasOwnProperty.call(CATEGORIES_NEUF_SEULEMENT, cat)) {
      const etat = champCertain(attributs, "etat");
      if (etat && !estNeuf(etat)) {
        return { motif: "usage", vinted_catalog_id: cat, categorie: CATEGORIES_NEUF_SEULEMENT[cat], etat };
      }
    }
  }
  return null;
}

/**
 * Phrase écrite à la personne, sous la case Beebs (app) et dans job.error
 * (serveur). Ton d'équipe, jamais culpabilisant : c'est une règle de Beebs,
 * pas une erreur de la personne, et rien n'est débité.
 * @param {ReturnType<typeof verdictBeebsInterdit>} verdict
 * @param {"fr"|"en"} [lang]
 */
export function messageBeebsInterdit(verdict, lang = "fr") {
  if (!verdict) return "";
  const en = lang === "en";
  const libelle = Array.isArray(verdict.categorie) ? verdict.categorie[en ? 1 : 0] : String(verdict.categorie ?? "");
  if (verdict.motif === "marque") {
    return en
      ? `Beebs doesn't accept ${verdict.marque} items in its catalogue (a Beebs rule): this listing can't go to Beebs. The other platforms remain available.`
      : `Beebs n'accepte pas les articles ${verdict.marque} dans son catalogue (règle de Beebs) : l'annonce ne peut pas partir sur Beebs. Les autres plateformes restent disponibles.`;
  }
  if (verdict.motif === "usage") {
    return en
      ? `Beebs only accepts ${libelle} that are new and sealed (a Beebs rule): this item, listed as "${verdict.etat}", can't go to Beebs. The other platforms remain available.`
      : `Beebs n'accepte les ${libelle} que neufs et scellés (règle de Beebs) : cet article, en « ${verdict.etat} », ne peut pas partir sur Beebs. Les autres plateformes restent disponibles.`;
  }
  return en
    ? `Beebs doesn't accept ${libelle} in its catalogue (a Beebs rule): this listing can't go to Beebs. The other platforms remain available.`
    : `Beebs n'accepte pas les ${libelle} dans son catalogue (règle de Beebs) : l'annonce ne peut pas partir sur Beebs. Les autres plateformes restent disponibles.`;
}
