// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION REPART DANS LA CATÉGORIE CORRIGÉE, JAMAIS DANS L'ANCIENNE (21/11/2026 soir, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une republication recopie le rayon de l'annonce d'avant (Leboncoin, Beebs : ses platform_fields ; Vinted : sa capture ;
// eBay : son rayon mappé). Une annonce rangée avant la règle de cohérence (_shared/coherence-categorie.js) repartait donc
// dans son rayon faux — « Vans Sk8-Hi » en « Sport & Plein air » chez Leboncoin, en file le 21/11.
// RÈGLE : au moment de repartir, un rayon INCOHÉRENT avec le titre et l'objet reconnu est remplacé par :
//   1. la catégorie CORRIGÉE enregistrée sur la fiche (inventaire.attributs.categorie_corrigee, posée par une réparation
//      ou un choix), si elle est cohérente ;
//   2. sinon le rayon de l'ICÔNE de l'objet reconnu par l'IA (la table de la plateforme), s'il est cohérent ;
//   3. sinon le rayon reste, la trace le dit (contrôle quotidien, ops-digest) — jamais une catégorie inventée.
// Un rayon cohérent n'est jamais touché. Pur (Node + navigateur + Deno).
import { incoherenceCategorie } from "./coherence-categorie.js";

export const CLE_CATEGORIE_CORRIGEE = "categorie_corrigee";

/** La catégorie corrigée d'une plateforme sur la fiche : { chemin, id } ou null (pur).
 * @param {object|null|undefined} attributs
 * @param {string} plateforme
 * @returns {{chemin: string[], id: string|number|null}|null} */
export function categorieCorrigeeDeLaFiche(attributs, plateforme) {
  const a = attributs && typeof attributs === "object" ? attributs[CLE_CATEGORIE_CORRIGEE] : null;
  const v = a && typeof a === "object" ? (a.v && typeof a.v === "object" ? a.v : a) : null;
  const c = v ? v[plateforme] : null;
  if (!c) return null;
  const chemin = Array.isArray(c) ? c : (Array.isArray(c.chemin) ? c.chemin : null);
  if (!chemin || !chemin.length) return null;
  return { chemin: chemin.map(String), id: Array.isArray(c) ? null : (c.id ?? null) };
}

/**
 * Le rayon avec lequel une republication repart (pur).
 * @param {{plateforme?: string, chemin?: string[]|null, titre?: string, objet?: string|null, attributs?: object|null, cheminIcone?: string[]|null}} [p]
 * @returns {null | {regle: string, motif: string, chemin: string[]|null, id: string|number|null, source: "fiche"|"icone_objet"|null}}
 *   null = cohérent, rien à changer ; chemin null = incohérent mais rien de sûr pour le remplacer (il reste, tracé).
 */
export function cheminPourLaRepublication({ plateforme, chemin, titre = "", objet = null, attributs = null, cheminIcone = null } = {}) {
  if (!Array.isArray(chemin) || !chemin.length) return null;
  const inc = incoherenceCategorie({ chemin, titre, objet });
  if (!inc) return null;
  const fiche = categorieCorrigeeDeLaFiche(attributs, plateforme);
  if (fiche && !incoherenceCategorie({ chemin: fiche.chemin, titre, objet })) return { ...inc, chemin: fiche.chemin, id: fiche.id ?? null, source: "fiche" };
  if (Array.isArray(cheminIcone) && cheminIcone.length && !incoherenceCategorie({ chemin: cheminIcone, titre, objet })) {
    return { ...inc, chemin: cheminIcone.map(String), id: null, source: "icone_objet" };
  }
  return { ...inc, chemin: null, id: null, source: null };
}
