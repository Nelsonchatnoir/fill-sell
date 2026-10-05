// ═══════════════════════════════════════════════════════════════════════════
// LA LIVRAISON AU SERVICE DU JOB — AUCUN FORMAT DEVINÉ (04/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// 13 « Rangement » identiques de Louis partis sur Leboncoin : 7 « Petit »,
// 6 « Moyen », sans poids. Le format venait de la rédaction (prompt Leboncoin,
// « Infère … le format colis »), tiré à chaque article. Règle de Nico : aucun
// format n'est plus jamais deviné en silence.
//
// Au service d'un job de PUBLICATION (la republication reprend ce que
// l'annonce en ligne affichait — autre chemin, inchangé) :
//   · un `format_colis` que la personne n'a pas CHOISI (marqueur
//     `format_colis_source: 'manuel'`, posé par la carte Livraison, la liste
//     des champs ou le lot) est ÉCARTÉ — Leboncoin et Beebs : copies
//     enregistrées avant ce jour, jobs déjà en file, écrans d'avant l'OTA ;
//   · Leboncoin : le POIDS de la fiche (inventaire.poids_g, le seul champ)
//     part quand la copie n'en a pas — l'extension 0.6.96 garde alors le
//     format que Leboncoin estime et choisit le palier par ce poids ;
//   · Leboncoin : les TRANSPORTEURS retenus par la personne
//     (platform_settings.leboncoin.transporteurs) partent quand le job n'en
//     porte pas, limités à ceux qui acceptent ce poids (relevé du 04/10).
// Rien n'est inventé : sans poids ni choix, Leboncoin garde son estimation.
// ES module sans import (Deno + node).

/** Bornes relevées sur le formulaire de dépôt (04/10) — miroir de src/utils/leboncoinColis.js. */
export const TRANSPORTEURS_LBC = [
  { nom: "Courrier suivi", kgMax: 2 },
  { nom: "Shop2Shop by Chronopost", kgMax: 20 },
  { nom: "Mondial Relay", kgMax: 30 },
  { nom: "Colissimo", kgMax: 30 },
];

/** Le format porté par ce job est-il un CHOIX de la personne ? */
export const formatChoisi = (pf) => pf?.format_colis_source === "manuel";

const grammes = (v) => { const g = Number(v); return Number.isFinite(g) && g > 0 ? Math.round(g) : null; };

/**
 * Écarte un format non choisi (Leboncoin et Beebs). Modifie `pf` en place.
 * @param {Record<string, any>} pf
 * @param {Date} [maintenant]
 * @returns {{de: string, le: string, raison: string} | null}
 */
export function ecarterFormatDevine(pf, maintenant = new Date()) {
  if (!pf || formatChoisi(pf)) return null;
  const de = String(pf.format_colis ?? pf.lbcFormatColis ?? "").trim();
  if (!de) return null;
  delete pf.format_colis;
  delete pf.lbcFormatColis;
  pf.format_colis_ecarte = { de, le: maintenant.toISOString(), raison: "format deviné par la rédaction, jamais choisi" };
  return pf.format_colis_ecarte;
}

/**
 * Leboncoin, publication : format deviné écarté, poids de la fiche, transporteurs retenus.
 * Modifie `pf` en place ; rend la liste de ce qui a été fait (vide = rien).
 * @param {Record<string, any>} pf
 * @param {{ poidsFiche?: unknown, transporteursRetenus?: unknown[] | null, maintenant?: Date }} [opts]
 * @returns {string[]}
 */
export function livraisonLbcAuService(pf, { poidsFiche = null, transporteursRetenus = null, maintenant = new Date() } = {}) {
  const fait = [];
  if (!pf) return fait;
  const ecarte = ecarterFormatDevine(pf, maintenant);
  if (ecarte) fait.push(`format deviné « ${ecarte.de} » écarté`);
  const gFiche = grammes(poidsFiche);
  if (grammes(pf.lbcPoidsGrammes) == null && gFiche != null && gFiche <= 150000) {
    pf.lbcPoidsGrammes = gFiche;
    fait.push(`poids de la fiche ${gFiche} g`);
  }
  if (!Array.isArray(pf.lbcTransporteurs) && Array.isArray(transporteursRetenus) && transporteursRetenus.length) {
    const g = grammes(pf.lbcPoidsGrammes);
    const permis = TRANSPORTEURS_LBC.filter((t) => g == null || t.kgMax * 1000 >= g).map((t) => t.nom);
    const voulus = transporteursRetenus.map((n) => String(n ?? "").trim()).filter((n) => permis.includes(n));
    if (voulus.length) {
      pf.lbcTransporteurs = voulus;
      fait.push(`transporteurs retenus : ${voulus.join(", ")}`);
    }
  }
  if (fait.length) pf.livraison_au_service = { fait, le: maintenant.toISOString(), pose_par: "get-pending-jobs (_shared/livraison-poids.js)" };
  return fait;
}
