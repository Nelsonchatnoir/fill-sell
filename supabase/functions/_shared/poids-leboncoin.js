// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE POIDS D'UNE PUBLICATION, LU EN GRAMMES (11/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Historique : le 11/10 midi (Louis, 12 livres et 18 vêtements partis sans
// poids), get-pending-jobs v234 ne servait PLUS une publication Leboncoin
// sans poids (needs_user « Poids du colis »).
// Décision de Nico, 11/10 soir : « le poids obligatoire est une friction de
// trop ». Sans poids, Leboncoin publie et estime lui-même d'après le rayon
// (100 g format S pour un livre, 250 g pour un pyjama) : c'est acceptable.
// La personne choisit dans l'app « Laisser Leboncoin estimer » (par défaut)
// ou « Saisir le poids » (src/utils/choixPoidsLeboncoin.js).
//
// Ce que fait le serveur, au service d'une PUBLICATION Leboncoin, après le
// poids de la fiche (_shared/livraison-poids.js, inventaire.poids_g) :
//   · un poids lisible (nombre, « 650 », « 650 g », « 1,2 kg ») → servi, en
//     grammes entiers (jamais une question en boucle sur une écriture) ;
//   · rien → SERVI tel quel : Leboncoin estime. Aucun poids n'est inventé,
//     aucune publication n'est retenue pour son poids.
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

/**
 * Que faire d'un job avant de le servir ? Jamais le retenir.
 * @returns {{ action: "rien" } | { action: "normaliser", valeur: number }}
 *   rien       : pas une publication Leboncoin, poids déjà en grammes, ou
 *                AUCUN poids (Leboncoin estime — 11/10 soir, Nico) ;
 *   normaliser : un poids lisible mais écrit autrement (« 650 g ») → grammes.
 */
export function decisionPoidsLbc(job) {
  if (!job || job.platform !== "leboncoin") return { action: "rien" };
  if (String(job.action ?? "publish") !== "publish") return { action: "rien" };
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const brut = pf.lbcPoidsGrammes;
  const g = grammesLbc(brut);
  if (g == null) return { action: "rien" };
  if (typeof brut === "number" && brut === g) return { action: "rien" };
  return { action: "normaliser", valeur: g };
}
