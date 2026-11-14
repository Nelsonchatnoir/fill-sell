// ═══════════════════════════════════════════════════════════════════════════
// CHANGER DE FORMULE PENDANT UN ESSAI, OU EN PERDANT LE CLOUD (14/11/2026, bloc F — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel (13e274de, 14/11) : essai Pro + Cloud par Klarna à 00:39 ; à 01:27 un clic « Business » dans la modale de plan
// a remplacé Pro + Cloud par Business seul sur l'abonnement EN ESSAI (create-checkout-session, montée « in situ » :
// proration sur un essai = 0 €, mise à jour appliquée) — sans fenêtre, sans paiement, essai gardé, Cloud sorti de Stripe.
// Règle de Nico, sur tous les canaux :
//   · un client en essai (Cloud ou non) qui choisit une autre formule voit d'abord une fenêtre : « Ton essai gratuit
//     s'arrête : tu seras débité maintenant de X € », le montant EXACT (aperçu de facture Stripe) ;
//   · un client qui a le Cloud (essai ou payé) se voit proposer la version « + Cloud » de la formule choisie, à son vrai
//     prix ; la formule seule reste proposée, marquée « sans Cloud : tu ne pourras plus publier sans ordinateur » ;
//   · sans confirmation, rien ne change ; confirmé : l'essai s'arrête (trial_end « now »), le paiement est pris tout de
//     suite, la formule est appliquée — et seulement si le paiement passe (payment_behavior « pending_if_incomplete » :
//     prouvé en mode test le 14/11 — carte acceptée → appliqué et payé ; carte refusée ou 3-D Secure → l'abonnement reste
//     tel quel, en essai, au prix d'avant, une facture ouverte à régler) ;
//   · plus jamais un changement qui fait sauter le Cloud sans le dire, ni qui garde l'essai gratuit.
// Pur (Deno + Node) : scripts/changement-formule-essai-selftest.mjs.
import { estFormuleCloud, formuleCloudDuPalier } from "./formules-serveur.js";

/**
 * Faut-il la fenêtre de confirmation avant de changer l'abonnement `abonnement` (Stripe) de `formuleActuelle` vers
 * `formuleVers` ? `formuleActuelle` / `formuleVers` : noms Stripe (standard, pro, business, premium_cloud, pro_cloud,
 * business_cloud ; « cloud » = le Cloud seul).
 * @returns {{ essai: boolean, perdCloud: boolean, aConfirmer: boolean, alternativeCloud: string|null }}
 */
export function changementAConfirmer({ abonnement, formuleActuelle, formuleVers, confirme = false }) {
  const essai = abonnement?.status === "trialing";
  const cloudAvant = formuleActuelle === "cloud" || estFormuleCloud(formuleActuelle);
  const perdCloud = cloudAvant && !estFormuleCloud(formuleVers);
  // La même formule « + Cloud » — jamais celle qu'on a déjà (« retirer le Cloud » de Pro + Cloud : garder = ne rien changer).
  const alt = perdCloud ? formuleCloudDuPalier(formuleVers) : null;
  const alternativeCloud = alt && alt !== formuleActuelle ? alt : null;
  return { essai, perdCloud, aConfirmer: (essai || perdCloud) && confirme !== true, alternativeCloud };
}

/** Les paramètres Stripe du changement CONFIRMÉ : payé tout de suite, appliqué seulement s'il est payé, l'essai arrêté. */
export function parametresChangement({ itemId, prix, essai }) {
  return {
    items: [{ id: itemId, price: prix }],
    proration_behavior: "always_invoice",
    payment_behavior: "pending_if_incomplete",
    ...(essai ? { trial_end: "now" } : {}),
    expand: ["latest_invoice"],
  };
}

/** L'aperçu de facture (invoices.retrieveUpcoming) qui donne le montant EXACT débité au changement. */
export function requeteDevis({ client, abonnementId, itemId, prix, essai }) {
  return {
    customer: client,
    subscription: abonnementId,
    subscription_items: [{ id: itemId, price: prix }],
    subscription_proration_behavior: "always_invoice",
    ...(essai ? { subscription_trial_end: "now" } : {}),
  };
}

/**
 * La réponse rendue à l'app quand la fenêtre est nécessaire (aucun changement fait).
 * @param {{ formule: string|null, devis: { montant: number, devise?: string }|null, alternative?: { formule: string|null, montant: number }|null, essai: boolean, perdCloud: boolean }} p
 */
export function reponseConfirmation({ formule, devis, alternative = null, essai, perdCloud }) {
  return {
    confirmation_requise: true,
    formule,
    devis: {
      formule,
      montant_centimes: Number.isFinite(devis?.montant) ? devis.montant : null,
      devise: devis?.devise ?? "eur",
      essai: essai === true,
      perd_cloud: perdCloud === true,
      alternative: alternative ? { formule: alternative.formule, montant_centimes: Number.isFinite(alternative.montant) ? alternative.montant : null } : null,
    },
  };
}

/**
 * (14/11/2026, bloc F) Les SEULES clés de métadonnées à réécrire pour que `formule` et `plan_type` suivent le prix d'un
 * abonnement Stripe (null = rien à écrire). Stripe fusionne les clés : jamais l'instantané entier recopié (deux appels qui
 * le recopient chacun s'annulent — la `formule` effacée par le premier revenait avec le second).
 * @param {Record<string, string>} meta  les métadonnées lues
 * @param {{ formule: string|null, plan: string|null }} cible  la formule avec Cloud du prix (null = aucune), son palier
 * @returns {Record<string, string>|null}
 */
export function metadonneesARealigner(meta, { formule, plan }) {
  const m = meta ?? {};
  const out = {};
  if ((m.formule || null) !== (formule || null)) out.formule = formule ?? "";
  if (plan && m.plan_type !== plan) out.plan_type = plan;
  return Object.keys(out).length ? out : null;
}

/**
 * (14/11/2026, bloc F) Les métadonnées posées APRÈS une montée de palier « in situ » payée : le palier ; et si l'abonnement
 * portait une formule avec Cloud, la formule effacée (le prix choisi n'a plus de Cloud) et l'essai marqué fini.
 * Seulement les clés qui changent (Stripe fusionne).
 */
export function metadonneesApresMontee({ plan, avaitFormuleCloud }) {
  return { plan_type: plan, ...(avaitFormuleCloud ? { formule: "", essai_cloud: "0" } : {}) };
}

// ═══════════════════════════════════════════════════════════════════════════
// KLARNA RETIRÉ DE TOUS LES PAIEMENTS STRIPE (14/11/2026 13:00, décision 8 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Abonnements, essais, packs, changements de formule : plus jamais Klarna. Les abonnements EXISTANTS déjà payés par
// Klarna (13e274de compris) ne sont pas touchés : leurs renouvellements restent prélevés normalement.
/** À répandre dans CHAQUE session Checkout (prouvé en mode test le 14/11 : card, klarna, link, amazon_pay → sans klarna). */
export const SANS_KLARNA = Object.freeze({ excluded_payment_method_types: ["klarna"] });
/** Les moyens de la facture d'un changement quand le moyen enregistré est Klarna (la page de la facture les propose). */
export const MOYENS_SANS_KLARNA = Object.freeze(["card", "link"]);

/** Le type du moyen de paiement par défaut d'un abonnement (lu : abonnement, puis client), ou null. */
export async function typeMoyenParDefaut(stripe, abonnement) {
  try {
    const sub = await stripe.subscriptions.retrieve(abonnement.id, { expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"] });
    const pm = sub?.default_payment_method ?? sub?.customer?.invoice_settings?.default_payment_method ?? null;
    return pm && typeof pm === "object" && typeof pm.type === "string" ? pm.type : null;
  } catch { return null; }
}

/**
 * Le changement de formule CONFIRMÉ, jamais prélevé par Klarna. Moyen enregistré = Klarna : l'abonnement est d'abord
 * restreint à carte / Link (un `pending_if_incomplete` n'accepte pas payment_settings — prouvé en mode test), la facture
 * du changement ne peut donc plus partir sur Klarna (elle reste à régler sur sa page, par carte : rien ne change tant
 * qu'elle n'est pas payée), puis l'abonnement retrouve son réglage d'avant (ses renouvellements restent prélevés comme
 * avant). Tout autre moyen : le changement tel quel.
 */
export async function changerSansKlarna(stripe, abonnement, parametres) {
  const type = await typeMoyenParDefaut(stripe, abonnement);
  if (type !== "klarna") return stripe.subscriptions.update(abonnement.id, parametres);
  const avant = abonnement?.payment_settings?.payment_method_types ?? null;
  await stripe.subscriptions.update(abonnement.id, { payment_settings: { payment_method_types: [...MOYENS_SANS_KLARNA] } });
  try {
    return await stripe.subscriptions.update(abonnement.id, parametres);
  } finally {
    try {
      await stripe.subscriptions.update(abonnement.id, { payment_settings: { payment_method_types: Array.isArray(avant) && avant.length ? avant : "" } });
    } catch (e) { console.error(`[klarna] réglage d'avant non rendu sur ${abonnement.id} : ${e?.message ?? e}`); }
  }
}
