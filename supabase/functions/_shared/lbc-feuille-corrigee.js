// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : LA FEUILLE QUE L'OBJET NOMME, PAS CELLE D'UN MOT COMPLÉMENT
// (15/10 soir, point 9 — PAUGUES, « Accolay Vintage Ceramic Table Lamp »)
// ═══════════════════════════════════════════════════════════════════════════
// La lampe est partie en Maison & Jardin › Arts de la table : la recherche par
// mot (« lampe de table ») n'avait trouvé qu'une feuille, accrochée au mot
// « table ». Le job portait pourtant DÉJÀ la bonne paire d'une autre feuille,
// relevée mot pour mot dans le texte sur la VRAIE liste Leboncoin
// (pairesMaisonJardinDeSecours : Décoration › Éclairage › « Lampe à poser »),
// et, pour sa propre feuille, seulement le fourre-tout « Autre / Autre » —
// que la liste Produit d'« Arts de la table › Vaisselle de table » (pré-remplie
// par Leboncoin) ne contient pas : « Produit* » demandé à la personne.
//
// LA RÈGLE (publication Leboncoin, avant de servir) : quand la paire de la
// feuille choisie n'est que le fourre-tout (ou absente), et qu'UNE SEULE autre
// feuille Maison & Jardin porte une paire RÉELLE (un Produit de sa liste nommé
// dans le texte de l'annonce), cette feuille-là devient la catégorie, avec sa
// paire ; le fourre-tout de l'ancienne est retiré. Deux feuilles candidates ou
// plus : rien ne bouge (Leboncoin et la personne tranchent, comme avant).
// ⛔ Aucune valeur inventée : la feuille et la paire viennent de la liste
//    relevée sur le formulaire (LBC_MAISON_JARDIN_DEPENDANTS) et du texte.
// ⛔ Jamais sur une feuille dont la paire est réelle (plateau à olives de
//    jocabroc, 22/09 : notre « Vase, cache pot et céramique » reste).
// Pur (Deno + Node) : scripts/lbc-feuille-corrigee-selftest.mjs.

import { LBC_MAISON_JARDIN_DEPENDANTS, pairesMaisonJardinDeSecours } from "../../../src/utils/lbcMaisonJardin.js";

const FOURRE_TOUT = /^autres?$/i;

/** La feuille « Maison & Jardin > X » d'un chemin, ou null. */
function feuilleDe(chemin) {
  if (!Array.isArray(chemin) || chemin.length < 2) return null;
  const f = `${chemin[0]} > ${chemin[chemin.length - 1]}`;
  return LBC_MAISON_JARDIN_DEPENDANTS[f] ? f : null;
}

/** Une paire (Univers, Produit) réelle d'une feuille, lue dans lbcAspects. */
function paireReelle(def, aspects) {
  const u = String(aspects?.[def.typeKey] ?? "").trim();
  const p = String(aspects?.[def.produitKey] ?? "").trim();
  if (!u || !p || FOURRE_TOUT.test(u) || FOURRE_TOUT.test(p)) return null;
  const liste = def.produits?.[u];
  return Array.isArray(liste) && liste.includes(p) ? { univers: u, produit: p } : null;
}

/**
 * @param {any} pf platform_fields d'une publication Leboncoin
 * @param {string} [texte] titre et description de l'annonce : si un Produit de
 *   la feuille CHOISIE y est nommé, elle est juste — rien ne bouge.
 * @returns {null | { pf: any, avant: string[], apres: string[], paire: { univers: string, produit: string } }}
 */
export function corrigerFeuilleLbc(pf, texte = "") {
  if (!pf || typeof pf !== "object") return null;
  const actuelle = feuilleDe(pf.lbcCategoryPath);
  if (!actuelle) return null;
  const aspects = (pf.lbcAspects && typeof pf.lbcAspects === "object") ? pf.lbcAspects : {};
  if (paireReelle(LBC_MAISON_JARDIN_DEPENDANTS[actuelle], aspects)) return null; // notre feuille a une vraie paire
  // Un Produit de NOTRE feuille nommé dans le texte (« pots » → « Bocaux et
  // pots ») : la feuille est juste, seul le stepper n'a pas posé la paire.
  const nommees = pairesMaisonJardinDeSecours(String(texte ?? ""), "__aucune__");
  if (nommees[LBC_MAISON_JARDIN_DEPENDANTS[actuelle].typeKey]) return null;
  const autres = Object.entries(LBC_MAISON_JARDIN_DEPENDANTS)
    .filter(([f]) => f !== actuelle)
    .map(([f, def]) => ({ f, def, paire: paireReelle(def, aspects) }))
    .filter((x) => x.paire);
  if (autres.length !== 1) return null;
  const { f, def, paire } = autres[0];
  const defActuelle = LBC_MAISON_JARDIN_DEPENDANTS[actuelle];
  const nouveauxAspects = { ...aspects };
  delete nouveauxAspects[defActuelle.typeKey];
  delete nouveauxAspects[defActuelle.produitKey];
  const apres = f.split(" > ");
  return {
    avant: [...pf.lbcCategoryPath],
    apres,
    paire,
    pf: {
      ...pf,
      lbcCategoryPath: apres,
      lbcAspects: nouveauxAspects,
      feuille_corrigee: {
        le: new Date().toISOString(), avant: pf.lbcCategoryPath, apres, paire,
        cles: [def.typeKey, def.produitKey],
        motif: "feuille choisie sans paire réelle ; une seule autre feuille porte un Produit nommé dans l'annonce",
      },
    },
  };
}
