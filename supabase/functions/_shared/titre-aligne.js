// ═══════════════════════════════════════════════════════════════════════════
// LE TITRE DU JOB SUIT L'ANNONCE PROUVÉE (15/10 soir, point 6 : XEWER, DeadRoz)
// ═══════════════════════════════════════════════════════════════════════════
// Garde de l'extension (leboncoin.js, annonceNommee) : avant de supprimer une
// annonce Leboncoin, le titre affiché doit contenir les mots du TITRE DU JOB
// (tous sauf un, au moins 3). Bonne garde — mais son témoin est une COPIE :
//   · XEWER « Pure PS3 avec notice » : le job d'import est né d'une proposition
//     fausse acceptée (annonce 3258472485), puis la personne a rattaché la bonne
//     annonce (3259156501, Need for Speed ProStreet) ; rapprocher_recabler_job a
//     changé le lien et le numéro, jamais le titre. Photos fiche ↔ annonce :
//     identiques. Republications bloquées 08/10, 11/10, 15/10 ;
//   · DeadRoz « Jean Levi's L 950 » : annonce 3279304096 déposée par FillSell
//     (30/09), modifiée ensuite sur Leboncoin (« 9 LONG femme ») ; photos
//     identiques ; republication bloquée depuis le 11/10.
// Rien n'a été retiré (la garde a tenu) — mais rien ne repartait non plus.
//
// LA RÈGLE (cascade de Nico, 15/10 : identifiant → photos → IA) : quand le
// titre en ligne d'une annonce échoue au test de la garde contre le titre du
// job, le titre du job devient celui de l'annonce SI ET SEULEMENT SI :
//   1. IDENTIFIANT : le numéro du job EST celui de l'annonce, et le relevé
//      rattache cette annonce à la MÊME fiche ;
//   2. PHOTOS : les photos de l'annonce sont celles de la fiche (« même photo »,
//      seuils de la cascade, trancherParPhotos).
// Sinon on ne touche à rien (la garde continue de protéger). Le titre de la
// FICHE n'est jamais touché ; l'ancien titre du job reste tracé.
// Leboncoin seulement : c'est là que vit la garde par le titre.
// Pur (Deno + Node) : scripts/titre-aligne-selftest.mjs.

import { trancherParPhotos } from "./annonce-partagee.js";

// Mêmes normalisation et seuils que l'extension (leboncoin.js lbcNorm,
// motsSignificatifs, annonceNommee) — verrouillés par le selftest.
const lbcNorm = (s) => String(s ?? "").toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const motsSignificatifs = (t) => [...new Set(lbcNorm(t).split(" ").filter((m) => m.length >= 3))];

/** La garde de l'extension passerait-elle (titre affiché contre titre du job) ? */
export function titreNommeAnnonce(titreAffiche, titreJob) {
  const mots = motsSignificatifs(titreJob);
  if (mots.length < 3) return false;
  const cible = lbcNorm(titreAffiche);
  return mots.filter((m) => cible.includes(m)).length >= mots.length - 1;
}

/**
 * @param {{ job: any, annonce: any, empreintesAnnonce?: any[], empreintesFiche?: any[] }} arg
 * @returns {null | { aligner: boolean, titre?: string, preuve?: string, raison?: string, niveaux?: any }}
 *   null : rien à faire (pas de contradiction, ou pas ce cas).
 */
export function decisionAlignementTitre({ job, annonce, empreintesAnnonce = [], empreintesFiche = [] }) {
  if (!job || job.platform !== "leboncoin" || !annonce) return null;
  const titreEnLigne = String(annonce.titre ?? "").trim();
  if (!titreEnLigne || titreNommeAnnonce(titreEnLigne, job.title)) return null;
  if (!titreNommeAnnonce(titreEnLigne, titreEnLigne)) return { aligner: false, raison: "titre_en_ligne_trop_court" };
  const numero = String(job.platform_listing_id ?? "").trim();
  if (!numero || String(annonce.listing_id) !== numero) return { aligner: false, raison: "numero_different" };
  if (annonce.inventaire_id == null || job.inventaire_id == null || String(annonce.inventaire_id) !== String(job.inventaire_id)) {
    return { aligner: false, raison: "annonce_d_une_autre_fiche" };
  }
  if (annonce.disparu_le || annonce.retiree_le) return { aligner: false, raison: "annonce_plus_en_ligne" };
  const fiche = String(job.inventaire_id);
  const ph = trancherParPhotos(empreintesAnnonce, new Map([[fiche, empreintesFiche]]));
  if (ph.fiche !== fiche) return { aligner: false, raison: `photos_${ph.raison ?? "non_concluantes"}`, niveaux: ph.niveaux };
  return { aligner: true, titre: titreEnLigne, preuve: "identifiant de l'annonce + photos identiques à la fiche", niveaux: ph.niveaux };
}

/** Le motif d'arrêt de la garde, relu dans l'erreur d'un job. */
export const CONTRADICTION_IDENTITE_RE = /Contradiction d'identité|s'intitule « .* » alors que le job vise/i;
