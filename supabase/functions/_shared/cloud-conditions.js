// ═══════════════════════════════════════════════════════════════════════════
// LES CONDITIONS D'UTILISATION DE FILLSELL CLOUD : version en vigueur, version minimale, règle d'acceptation
// ═══════════════════════════════════════════════════════════════════════════
// SEULE SOURCE (11/11, point C1 du méga lot de Nico) : l'app les ré-exporte (src/config/cloudOffer.js, puis
// src/cloud/conditionsCloud.js) ; create-checkout-session (paiement Stripe web) applique conditionsCloudAcceptees juste
// avant d'ouvrir Stripe. Rien d'autre ne lit la version (service du Cloud, Apple / Google, crons) : le Cloud en service
// n'est jamais coupé pour une version (selftest:cloud-executant § 3 bis).
// (30/10, lot D) Le paiement Cloud exige les conditions acceptées (case obligatoire, AVANT toute carte).
// (04/11) 2026-10-30 → 2026-11-04 : prix de l'article 6 à 24,99 € (décision de Nico du 03/11) — un changement de FOND.
//
// RÈGLE (11/11, C1, décision de la relecture) : une version acceptée VAUT si c'est une date AAAA-MM-JJ réelle ET si elle
// est ≥ la version minimale (CGU_CLOUD_VERSION_MINIMALE). Ni liste exacte ni égalité : une app plus récente que le serveur
// (date changée après le déploiement de la fonction, web parti avant elle) paie sans refus, une ancienne app aussi tant
// qu'elle est ≥ la minimale, et une REFORMULATION (version neuve, même fond) ne demande aucun redéploiement synchronisé.
// Refusées : vide, format faux, date impossible, < minimale (2026-10-30, l'ancien prix).
// Un changement de FOND relève la minimale, EN DEUX TEMPS : (1) la version neuve dans CGU_CLOUD_HISTORIQUE, minimale
// INCHANGÉE → déployer create-checkout-session, puis le web et l'OTA (l'ancienne et la neuve passent) ; (2) l'OTA partie,
// CGU_CLOUD_VERSION_MINIMALE = la version neuve → redéployer create-checkout-session (et livrer l'app, qui la ré-exporte) :
// l'ancienne acceptation est alors redemandée avant tout paiement Stripe.

// L'historique des versions, la plus récente en tête ; `changement` choisit la phrase de la ligne de version (table
// NOTES_DE_VERSION de src/cloud/conditionsCloud.js — une version sans phrase n'affiche que sa date).
// ⛔ La date de la version EN VIGUEUR ne s'écrit qu'ICI (première ligne) : le jour du push web, la date RÉELLE (heure de
// Paris) — et VERSION_LIVREE de scripts/cloud-executant-selftest.mjs, qui l'épingle.
export const CGU_CLOUD_HISTORIQUE = Object.freeze([
  Object.freeze({ version: "2026-11-11", changement: "reformulation_articles_4_9" }),
  Object.freeze({ version: "2026-11-04", changement: "prix_article_6" }),
  Object.freeze({ version: "2026-10-30", changement: "premiere_version" }),
]);
export const CGU_CLOUD_VERSION = CGU_CLOUD_HISTORIQUE[0].version;
// Le dernier changement de FOND (le prix à 24,99 €) : toute acceptation depuis vaut.
export const CGU_CLOUD_VERSION_MINIMALE = "2026-11-04";

/** Une version des conditions est-elle valable ? Date AAAA-MM-JJ réelle ET ≥ la version minimale. (pur) */
export function versionCguValable(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== v) return false;   // 2026-02-30 : refusée
  return v >= CGU_CLOUD_VERSION_MINIMALE;
}

/** La personne a-t-elle accepté une version valable des conditions ? (pur) */
export const conditionsCloudAcceptees = (profil) => versionCguValable(profil?.cloud_cgu_version);
