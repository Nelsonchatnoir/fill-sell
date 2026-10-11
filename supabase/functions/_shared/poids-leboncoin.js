// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — UNE PUBLICATION SANS POIDS N'EST JAMAIS SERVIE (11/10/2026, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (Business), 11/10 : 12 livres (10:07) et 18 vêtements (11:05) publiés
// en lot SANS poids — Leboncoin a gardé son estimation du rayon (livres :
// 100 g, format S). Le lot ne demandait plus le poids depuis 9bdcfce (10/10
// 13:50, « poids facultatif comme à l'unité ») ; celui du 10/10 19:44 n'avait
// le sien (500 g) que parce que les fiches le portaient déjà.
//
// Règle à la racine, côté serveur : get-pending-jobs ne sert JAMAIS à
// l'extension une PUBLICATION Leboncoin sans poids. Après le poids de la fiche
// (_shared/livraison-poids.js, inventaire.poids_g), il reste :
//   · un poids lisible (nombre, « 650 », « 650 g », « 1,2 kg ») → servi, en
//     grammes entiers ;
//   · rien → needs_user AVEC le champ « Poids du colis » : l'app le demande
//     (une fois pour le lot, StockTab), le job repart seul après la réponse.
//     Rien n'est envoyé à Leboncoin, aucun poids n'est inventé.
// La REPUBLICATION n'est pas concernée : elle reprend le poids que l'annonce
// en ligne affiche (autre chemin, inchangé).
// ES module sans import (Deno + node). Pur : scripts/lot-poids-leboncoin-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════

/** Borne de la saisie du lot (lirePoidsSaisi, publication/lot/regles.js) :
 * un poids que l'app accepte est toujours servi — jamais une question en boucle. */
export const POIDS_LBC_MAX_G = 150000;

/**
 * Un poids en grammes entiers, ou null : nombre, « 650 », « 650 g »,
 * « 1,2 kg », « 1.2kg ». Hors de [1 ; 150 000] g → null.
 */
export function grammesLbc(brut) {
  if (brut == null) return null;
  let g = null;
  if (typeof brut === "number") g = brut;
  else {
    const t = String(brut).trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
    const m = t.match(/^(\d+(?:\.\d+)?)(kg|g|gr|grammes?)?$/);
    if (!m) return null;
    g = m[2] === "kg" ? Number(m[1]) * 1000 : Number(m[1]);
  }
  if (!Number.isFinite(g) || g <= 0) return null;
  const r = Math.round(g);
  return r >= 1 && r <= POIDS_LBC_MAX_G ? r : null;
}

export const QUESTION_POIDS_LBC = Object.freeze({
  field_key: "lbcPoidsGrammes",
  field_label: "Poids du colis (g)",
  input_type: "number",
  explication: "Leboncoin calcule l'envoi au poids. Sans lui, l'annonce ne part pas : rien n'est deviné.",
  target: { root: null, key: "lbcPoidsGrammes" },
});

export const MESSAGE_POIDS_LBC =
  "Publication Leboncoin en attente : indique le poids du colis. Rien n'est parti sur Leboncoin, l'annonce partira toute seule après ta réponse.";

/**
 * Que faire d'un job avant de le servir ?
 * @returns {{ action: "rien" } | { action: "normaliser", valeur: number } | { action: "demander" }}
 *   rien       : pas une publication Leboncoin, ou poids déjà en grammes ;
 *   normaliser : un poids lisible mais écrit autrement (« 650 g ») → grammes ;
 *   demander   : aucun poids → needs_user avec QUESTION_POIDS_LBC.
 */
export function decisionPoidsLbc(job) {
  if (!job || job.platform !== "leboncoin") return { action: "rien" };
  if (String(job.action ?? "publish") !== "publish") return { action: "rien" };
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const brut = pf.lbcPoidsGrammes;
  const g = grammesLbc(brut);
  if (g == null) return { action: "demander" };
  if (typeof brut === "number" && brut === g) return { action: "rien" };
  return { action: "normaliser", valeur: g };
}
