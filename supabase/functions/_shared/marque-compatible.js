// ═══════════════════════════════════════════════════════════════════════════
// UN ARTICLE « POUR » UNE MARQUE NE PREND JAMAIS CETTE MARQUE (06/11 soir, décision de Nico — Louis, « SEB »)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : les rangements imprimés en 3D de Louis (compte Amiral) sont COMPATIBLES avec la yaourtière SEB
// Multidélices, ce ne sont pas des produits SEB. Leboncoin pré-remplit « SEB » (il le lit dans le texte) et notre règle
// le gardait (« notre valeur Sans marque est un repli générique ») ; une fiche importée portait même « SEB ». Leboncoin
// refuse désormais une marque déclarée sur un produit qui n'est pas de cette marque : refus de modération, et Louis a
// fait passer son annonce 3303702852 en retirant SEUL la marque (essai réel du 06/11, 20:40).
//
// LA RÈGLE, toutes plateformes, publication comme republication : une marque que l'article ne cite QUE dans un
// contexte de compatibilité (« pour », « compatible (avec) », « adapté à », « s'adapte sur », « convient à »,
// « conçu / prévu / fait pour », « de / pour / à / sur votre… ») n'est jamais déposée : « Sans marque ».
//   · « Rangement pour yaourtière Multidélices de chez SEB », « Optimisez le rangement de votre yaourtière … de chez
//     SEB », « Coque pour iPhone Apple » → marque de compatibilité, retirée ;
//   · « Yaourtière SEB Multidélices », « Chargeur Apple pour iPhone » → la marque est AUSSI citée comme celle de
//     l'objet : gardée (vrai produit de marque) ;
//   · « Sac pour femme Longchamp », « Craquez pour ce sac Longchamp » → « pour » + public ou démonstratif : gardée ;
//   · une marque que le texte ne cite pas : rien n'est déduit, gardée (règle d'avant).
// Une proposition s'arrête à la ponctuation forte, aux puces (✅, ⚠️…) et aux retours à la ligne ; le tiret d'un titre
// (« … – Seb Multidélices ») n'arrête pas : il annonce l'appareil. La marque doit suivre le mot qui la rend compatible
// à 6 mots au plus.
// Pur (Deno + Node). Copie identique dans l'extension (content-scripts/leboncoin.js, entre ⟦marque-compatible:début⟧
// et ⟦marque-compatible:fin⟧), vérifiée par scripts/marque-compatible-selftest.mjs.
// ⟦marque-compatible:début⟧
const MC_GENERIQUE = /^(autres?|sans marque|marque generique|generique|non renseignee?|ne s'applique pas|inconnue?|indeterminee?|aucune)$/;
const MC_FORT = new Set(["compatible", "compatibles", "compatibilite", "adapte", "adaptee", "adaptes", "adaptees", "adaptable", "adaptables",
  "convient", "conviennent", "s'adapte", "s'adaptent", "s'adaptant"]);
const MC_PREPOSITIONS = new Set(["pour", "de", "a", "sur", "avec", "au", "aux", "for"]);
const MC_POSSESSIFS = new Set(["votre", "vos", "ton", "ta", "tes", "your"]);
const MC_PARTICIPES = new Set(["concu", "concue", "concus", "concues", "prevu", "prevue", "prevus", "prevues", "fait", "faite", "faits", "faites",
  "destine", "destinee", "destines", "destinees", "special", "speciale", "speciaux", "speciales"]);
const MC_PUBLIC = new Set(["femme", "femmes", "homme", "hommes", "enfant", "enfants", "fille", "filles", "garcon", "garcons", "bebe", "bebes",
  "ado", "ados", "adolescent", "adolescente", "adulte", "adultes", "mixte", "elle", "lui", "dame", "dames", "men", "women", "kids",
  "chien", "chiens", "chiot", "chiots", "chat", "chats", "chaton", "chatons", "animal", "animaux", "cheval", "chevaux", "lapin", "lapins",
  "oiseau", "oiseaux", "rongeur", "rongeurs", "dogs", "cats"]);
// « Craquez pour CE sac Longchamp » : le démonstratif désigne l'objet lui-même ; un article (« pour le Thermomix ») non.
const MC_DEMONSTRATIFS = new Set(["ce", "cet", "cette", "ces"]);
const MC_FENETRE = 6;
// Un JEU vidéo se range sous la marque de sa console (« Zelda pour Nintendo Game Boy », « … for Wii U Nintendo ») :
// jamais une marque de compatibilité. Un ACCESSOIRE de console (housse, manette, chargeur…) reste soumis à la règle.
const MC_CONSOLES = new Set(["nintendo", "sony", "playstation", "microsoft", "xbox", "sega", "atari"]);
const MC_JEU = /(^|[^a-z])(jeu|jeux|game|games|umd|cartouche|cartouches|pal|ntsc)([^a-z]|$)/;
const MC_ACCESSOIRE = /(^|[^a-z])(housse|housses|coque|coques|etui|etuis|manette|manettes|chargeur|chargeurs|support|supports|protection|cable|cables|socle|station|sacoche|grip|skin|stickers?|accessoires?)([^a-z]|$)/;

function mcSansAccents(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\u2019`]/g, "'");
}
/** Les propositions d'un texte, chacune en mots (minuscules, sans accents). */
function mcPropositions(texte) {
  return mcSansAccents(texte)
    .split(/[.;!?:()[\]{}|\n\r•·]+|[^\u0000-\u024f\s'\u2019\-\u2013\u2014,/&+]+/u)
    .map((p) => p.split(/[\s,/&+\-\u2013\u2014]+/).map((m) => m.replace(/^'+|'+$/g, "")).filter(Boolean))
    .filter((mots) => mots.length);
}
/** Le mot d'indice i fait-il de ce qui suit une compatibilité ? */
function mcMarqueur(mots, i) {
  const m = mots[i];
  if (MC_FORT.has(m)) return true;
  if ((m === "pour" || m === "for") && !MC_PUBLIC.has(mots[i + 1] ?? "") && !MC_DEMONSTRATIFS.has(mots[i + 1] ?? "")) return true;
  if (MC_POSSESSIFS.has(m) && MC_PREPOSITIONS.has(mots[i - 1] ?? "")) return true;
  if (MC_PARTICIPES.has(m) && (mots[i + 1] === "pour" || mots[i + 1] === "a" || mots[i + 1] === "aux")) return true;
  return false;
}

/** Une marque « générique » (Sans marque, Autre, Marque générique…) : jamais une marque de compatibilité. */
export function marqueGenerique(marque) {
  return MC_GENERIQUE.test(mcSansAccents(marque).trim());
}

/**
 * La marque n'est-elle citée, dans ces textes, QUE comme celle d'un appareil auquel l'article s'adapte ?
 * Faux si elle n'est pas citée du tout (rien n'est déduit), ou citée au moins une fois comme celle de l'objet.
 * @param {string} marque
 * @param {...string} textes  titre, description…
 */
export function marqueSeulementCompatible(marque, ...textes) {
  if (!marque || marqueGenerique(marque)) return false;
  // Lu sur le TITRE (ce qu'est l'objet) : une description de jeu parle souvent de sa « protection » ou de son « support ».
  const titreMc = mcSansAccents(textes[0] ?? "");
  if (MC_CONSOLES.has(mcSansAccents(marque).trim()) && MC_JEU.test(titreMc) && !MC_ACCESSOIRE.test(titreMc)) return false;
  const cible = mcSansAccents(marque).split(/[\s,/&+\-\u2013\u2014]+/).map((m) => m.replace(/^'+|'+$/g, "")).filter(Boolean);
  if (!cible.length) return false;
  let citee = 0;
  for (const texte of textes) {
    for (const mots of mcPropositions(texte)) {
      for (let i = 0; i + cible.length <= mots.length; i++) {
        if (!cible.every((c, k) => mots[i + k] === c)) continue;
        citee++;
        let compatible = false;
        for (let j = i - 1; j >= 0 && j >= i - 1 - MC_FENETRE; j--) {
          if (mcMarqueur(mots, j)) { compatible = true; break; }
        }
        if (!compatible) return false;
      }
    }
  }
  return citee > 0;
}
// ⟦marque-compatible:fin⟧

/**
 * La marque à déposer : « Sans marque » quand l'article ne la cite que comme marque de compatibilité.
 * @param {string|null|undefined} marque
 * @param {{ titre?: string|null, description?: string|null }} textes
 * @returns {{ marque: string|null|undefined, retiree: string|null }}
 */
export function marquePourLeDepot(marque, { titre = "", description = "" } = {}) {
  if (!marque || !marqueSeulementCompatible(String(marque), String(titre ?? ""), String(description ?? ""))) return { marque, retiree: null };
  return { marque: "Sans marque", retiree: String(marque) };
}

export const CLE_MARQUE_RETIREE = "marque_compatible_retiree";

/**
 * La tâche telle qu'elle part vers une plateforme (publication, republication, toutes plateformes) : sa marque est
 * remplacée par « Sans marque » quand l'article ne la cite que comme marque de compatibilité — et la caractéristique
 * eBay « Marque » qui la répète aussi. La trace (platform_fields.marque_compatible_retiree) dit laquelle et pourquoi.
 * Rend le MÊME objet quand rien ne change. Le texte, les photos et la fiche ne sont jamais touchés.
 * @param {Record<string, any>} job
 * @param {{ parLeVendeur?: boolean, maintenant?: string }} [o]  parLeVendeur : la marque a été écrite par la personne
 */
export function jobSansMarqueDeCompatibilite(job, { parLeVendeur = false, maintenant = new Date().toISOString() } = {}) {
  if (!job || typeof job !== "object") return job;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return job;
  const pf = job.platform_fields && typeof job.platform_fields === "object" && !Array.isArray(job.platform_fields) ? job.platform_fields : null;
  if (!pf || pf[CLE_MARQUE_RETIREE]?.marque && marqueGenerique(pf.marque)) return job;
  const textes = { titre: job.title ?? "", description: job.description ?? "" };
  const { retiree } = marquePourLeDepot(pf.marque, textes);
  const aspects = pf.ebayAspects && typeof pf.ebayAspects === "object" && !Array.isArray(pf.ebayAspects) ? pf.ebayAspects : null;
  const cleAspect = aspects ? ["Marque", "Brand"].find((k) => typeof aspects[k] === "string" && marquePourLeDepot(aspects[k], textes).retiree) : null;
  if (!retiree && !cleAspect) return job;
  const nouveau = { ...pf };
  if (retiree) nouveau.marque = "Sans marque";
  if (cleAspect) nouveau.ebayAspects = { ...aspects, [cleAspect]: "Sans marque" };
  nouveau[CLE_MARQUE_RETIREE] = { marque: retiree ?? aspects[cleAspect], le: maintenant, par_le_vendeur: parLeVendeur === true,
    motif: "l'article ne la cite que comme celle d'un appareil auquel il s'adapte (pour, compatible, adapté…)" };
  return { ...job, platform_fields: nouveau };
}
