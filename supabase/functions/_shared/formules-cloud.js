// ═══════════════════════════════════════════════════════════════════════════
// FORMULES AVEC CLOUD — LE CONTRAT PARTAGÉ (serveur + app), 11/11/2026, décisions de Nico
// ═══════════════════════════════════════════════════════════════════════════
// Premium, Pro et Business existent « Sans Cloud » (formules d'aujourd'hui, inchangées) et « Avec Cloud » : UN seul
// abonnement par compte, dans le même groupe (Apple « FillSell Plan », Google, Stripe), jamais deux abonnements.
// Le Cloud seul (24,99 €, `cloud`) reste vendu aux comptes qui l'ont déjà, tant que Nico ne l'a pas retiré.
//
// ⛔ ESSAI (correction de Nico du 11/11/2026, décision de 21:45, qui remplace sa réponse 7) : 7 jours gratuits
// UNIQUEMENT sur Premium + Cloud et Pro + Cloud. Business + Cloud est payé dès le premier jour, sur TOUS les canaux,
// y compris pour un abonné Business qui ajoute le Cloud. Raison : « 7 jours gratuits avec les quotas Business, c'est
// tout publier puis partir sans payer. » Apple : aucune offre d'introduction sur app.fillsell.business.cloud ;
// Google : aucune offre sur business-cloud-monthly ; Stripe : jamais de trial_period_days ni de schedule d'essai.
//
// AFFICHAGE : un prix ne s'écrit JAMAIS en dur à l'écran — web : le prix Stripe ; mobile : le prix formaté par la
// boutique. Les montants ci-dessous servent au comptage (mrr), aux selftests et au supplément « le Cloud pour 22 € /
// 20 € de plus » (décision 4 de Nico : un fait arithmétique, jamais une « économie »).
// Pur (Node + Deno), aucune dépendance.

export const FORMULES_CLOUD = Object.freeze(["premium_cloud", "pro_cloud", "business_cloud"]);

/** Le palier que porte chaque formule avec Cloud (les quotas et la republication suivent du palier). */
export const PALIER_DE_FORMULE = Object.freeze({ premium_cloud: "premium", pro_cloud: "pro", business_cloud: "business" });

/** La formule avec Cloud d'un palier (« standard » = Premium dans le code d'aujourd'hui). */
export const FORMULE_CLOUD_DU_PALIER = Object.freeze({ premium: "premium_cloud", standard: "premium_cloud", pro: "pro_cloud", business: "business_cloud" });

/** Badge « Notre conseil » (le mot du site) : Pro + Cloud. */
export const FORMULE_MISE_EN_AVANT = "pro_cloud";

export const ESSAI_JOURS = 7;
/** ⛔ Les SEULES formules qui ont un essai. Business + Cloud n'en a jamais. */
export const FORMULES_AVEC_ESSAI = Object.freeze(["premium_cloud", "pro_cloud"]);
/** Cette formule peut-elle porter un essai (règle de la formule ; le droit de la personne se juge à part, serveur) ? */
export const essaiPossiblePourFormule = (formule) => FORMULES_AVEC_ESSAI.includes(String(formule ?? ""));

/** Prix TTC France de référence par mois (comptage, selftests ; jamais affichés en dur). */
export const PRIX_AVEC_CLOUD_EUR = Object.freeze({ premium_cloud: 34.99, pro_cloud: 49.99, business_cloud: 79.99 });
/** « Le Cloud pour {n} € de plus » que la formule seule (décision 4). */
export const SUPPLEMENT_CLOUD_EUR = Object.freeze({ premium_cloud: 22, pro_cloud: 20, business_cloud: 20 });
export const supplementCloud = (formule) => SUPPLEMENT_CLOUD_EUR[String(formule ?? "")] ?? null;

/** Identifiants des boutiques (créés le 11/11 ; Apple dans le groupe « FillSell Plan » 22045363). */
export const PRODUITS_BOUTIQUES = Object.freeze({
  premium_cloud: Object.freeze({ apple: "app.fillsell.premium.cloud", google: "app.fillsell.premium.cloud", google_forfait: "premium-cloud-monthly", google_offre_essai: "premium-cloud-trial-7d" }),
  pro_cloud: Object.freeze({ apple: "app.fillsell.pro.cloud", google: "app.fillsell.pro.cloud", google_forfait: "pro-cloud-monthly", google_offre_essai: "pro-cloud-trial-7d" }),
  business_cloud: Object.freeze({ apple: "app.fillsell.business.cloud", google: "app.fillsell.business.cloud", google_forfait: "business-cloud-monthly", google_offre_essai: null }),
});

/** La formule avec Cloud d'un identifiant de produit Apple ou Google ; null sinon. (Stripe : par le prix, côté serveur.) */
export function formuleDuProduitBoutique(idProduit) {
  const id = String(idProduit ?? "").trim();
  if (!id) return null;
  for (const f of FORMULES_CLOUD) {
    const p = PRODUITS_BOUTIQUES[f];
    if (p.apple === id || p.google === id) return f;
  }
  return null;
}

/** Interrupteurs serveur par canal (coin_config) : absent, illisible ou ≠ 1 = FERMÉ (l'app garde l'offre d'aujourd'hui). */
export const CLE_INTERRUPTEUR_FORMULES = Object.freeze({ stripe: "cloud_formules_stripe", apple: "cloud_formules_apple", google: "cloud_formules_google" });
