// ═══════════════════════════════════════════════════════════════════════════
// FORMULES AVEC CLOUD — LES RÈGLES DU SERVEUR (11/11/2026, décisions de Nico) — pur, Node + Deno, aucune dépendance réseau
// ═══════════════════════════════════════════════════════════════════════════
// Le contrat partagé avec l'app est formules-cloud.js (noms, produits des boutiques, essai, interrupteurs) : jamais
// redéfini ici. Ce module ajoute ce que seul le serveur sait faire :
//   · LES PRIX STRIPE, À UN SEUL ENDROIT : les secrets STRIPE_PRICE_* étaient copiés dans cinq fonctions
//     (create-checkout-session, stripe-webhook, cancel-subscription, changer-formule, _shared/stripe-rang-vivant.ts) ;
//     ils se lisent désormais par prixStripeDepuis (et _shared/prix-stripe.ts côté Deno), avec les trois prix neufs ;
//   · formuleDuProduit : un prix Stripe OU un identifiant de boutique → { formule, palier, cloud, rang } — la seule
//     lecture utilisée par les trois canaux (Stripe, Apple, Google), le comptage (mrr.js) et les mails ;
//   · ⛔ L'ESSAI : seulement Premium + Cloud et Pro + Cloud (essaiPossiblePourFormule) — jamais Business + Cloud, sur aucun
//     chemin (Checkout, schedule d'un abonné, « 7 jours offerts », semaine gratuite d'une boutique) ;
//   · la voie d'un achat web (voieFormuleStripe) : jamais deux abonnements, un abonné reste sur son canal ;
//   · les interrupteurs par canal (coin_config.cloud_formules_<canal>) : absent ou ≠ 1 = fermé, sauf pour un témoin
//     (profiles.beta_flags.cloud, posé par le serveur seul) ;
//   · les conditions du Cloud : une formule avec Cloud exige une acceptation ≥ la version qui décrit les formules.
import {
  FORMULES_CLOUD, PALIER_DE_FORMULE, essaiPossiblePourFormule, formuleDuProduitBoutique, CLE_INTERRUPTEUR_FORMULES, ESSAI_JOURS,
} from './formules-cloud.js';
import { CGU_CLOUD_HISTORIQUE, versionCguValable } from './cloud-conditions.js';
import { drapeauxDuRang } from './droits-canaux.js';

export { FORMULES_CLOUD, essaiPossiblePourFormule, ESSAI_JOURS };

// ── 1. LES PRIX STRIPE ───────────────────────────────────────────────────────────────────────────────────────────────
/** Les secrets Supabase qui portent un identifiant de prix Stripe (un seul tableau pour toutes les fonctions). */
export const SECRETS_PRIX_STRIPE = Object.freeze({
  standard: 'STRIPE_PRICE_STANDARD',
  pro: 'STRIPE_PRICE_PRO',
  business: 'STRIPE_PRICE_BUSINESS',
  cloud: 'STRIPE_PRICE_CLOUD',
  premium_cloud: 'STRIPE_PRICE_PREMIUM_CLOUD',
  pro_cloud: 'STRIPE_PRICE_PRO_CLOUD',
  business_cloud: 'STRIPE_PRICE_BUSINESS_CLOUD',
});
/** Les prix LIVE créés le 11/11/2026 (21:19-21:22, lus par l'API) — DONNÉES pour les selftests et le rapport ; le code
 *  ne les lit jamais : il lit les secrets (à poser par Nico). Tous mensuels, en EUR, sans essai sur le prix. */
export const PRIX_STRIPE_LIVE_1111 = Object.freeze({
  premium_cloud: Object.freeze({ prix: 'price_1UahzRQZRA77vrWJUC2gXx06', produit: 'prod_Vbvr01QAVRBgB0', eur: 34.99 }),
  pro_cloud: Object.freeze({ prix: 'price_1Uai1KQZRA77vrWJZxj33yC9', produit: 'prod_VbvteRqqOoylv3', eur: 49.99 }),
  business_cloud: Object.freeze({ prix: 'price_1Uai2nQZRA77vrWJZgYHM3eu', produit: 'prod_VbvuNdV201jBqb', eur: 79.99 }),
});
/** Les prix connus, lus par `lire(nomDuSecret)` (Deno.env.get côté edge) ; absent = '' (jamais reconnu). */
export function prixStripeDepuis(lire) {
  const out = {};
  for (const [cle, secret] of Object.entries(SECRETS_PRIX_STRIPE)) {
    let v = '';
    try { v = String(lire(secret) ?? '').trim(); } catch { v = ''; }
    out[cle] = v;
  }
  return out;
}

// ── 2. FORMULE DU PRODUIT ────────────────────────────────────────────────────────────────────────────────────────────
const RANG = Object.freeze({ premium: 1, pro: 2, business: 3 });
const fiche = (formule, extra = {}) => {
  if (formule === 'cloud') return Object.freeze({ formule: 'cloud', palier: null, cloud: true, rang: 0, ...extra });
  const palier = PALIER_DE_FORMULE[formule] ?? formule;
  return Object.freeze({ formule, palier, cloud: FORMULES_CLOUD.includes(formule), rang: RANG[palier] ?? 0, ...extra });
};
// Les produits des boutiques d'avant les formules (src/lib/iap.js) : Founder (fermé), Premium, Pro (iPhone pro2, Android
// pro), Business, et le Cloud seul (groupe « FillSell Cloud » chez Apple, cloud-monthly chez Google).
const PRODUITS_PALIERS = Object.freeze({
  'app.fillsell.premium.sub': ['premium', { founder: true }],
  'app.fillsell.premium.standard': ['premium', {}],
  'app.fillsell.pro2.sub': ['pro', {}],
  'app.fillsell.pro.sub': ['pro', {}],
  'app.fillsell.business.sub': ['business', {}],
  'app.fillsell.cloud.sub': ['cloud', {}],
});

/**
 * LA lecture d'un produit, sur les trois canaux : un identifiant de prix Stripe (`prix` : prixStripeDepuis) ou un
 * identifiant de produit Apple / Google. Rend { formule, palier, cloud, rang } — formule : 'premium' | 'pro' |
 * 'business' | 'premium_cloud' | 'pro_cloud' | 'business_cloud' | 'cloud' (le Cloud seul : palier null, rang 0) — ou
 * null (inconnu, pack de Pépites, prix d'un autre produit). Pur.
 */
export function formuleDuProduit(id, prix = {}) {
  const v = String(id ?? '').trim();
  if (!v) return null;
  for (const f of FORMULES_CLOUD) if (prix?.[f] && v === prix[f]) return fiche(f);
  if (prix?.business && v === prix.business) return fiche('business');
  if (prix?.pro && v === prix.pro) return fiche('pro');
  if (prix?.standard && v === prix.standard) return fiche('premium');
  if (prix?.founder && v === prix.founder) return fiche('premium', { founder: true });
  if (prix?.cloud && v === prix.cloud) return fiche('cloud');
  const fb = formuleDuProduitBoutique(v);
  if (fb) return fiche(fb);
  const p = PRODUITS_PALIERS[v];
  return p ? fiche(p[0], p[1]) : null;
}
export const estFormuleCloud = (f) => FORMULES_CLOUD.includes(String(f ?? ''));
/** Le plan_type Stripe d'une formule (« standard » = Premium dans les métadonnées d'aujourd'hui). */
export function planTypeDeFormule(f) {
  const p = PALIER_DE_FORMULE[f] ?? f;
  return p === 'premium' ? 'standard' : (p === 'pro' || p === 'business' ? p : null);
}
/** Le palier passé à upgrade_monthly_grant ('premium' | 'pro' | 'business'). */
export const grantDeFormule = (f) => PALIER_DE_FORMULE[f] ?? (['premium', 'pro', 'business'].includes(f) ? f : null);
/** La formule avec Cloud d'un palier ('standard' | 'founder' = Premium). */
export function formuleCloudDuPalier(p) {
  const x = p === 'standard' || p === 'founder' ? 'premium' : p;
  return x === 'premium' || x === 'pro' || x === 'business' ? `${x}_cloud` : null;
}
/** Le nom dit au client : « Pro + Cloud », « Premium », « FillSell Cloud » (le Cloud seul). */
export function nomDeFormule(f) {
  if (f === 'cloud') return 'FillSell Cloud';
  const p = PALIER_DE_FORMULE[f] ?? (f === 'standard' || f === 'founder' ? 'premium' : f);
  const nom = p === 'business' ? 'Business' : p === 'pro' ? 'Pro' : p === 'premium' ? 'Premium' : null;
  if (!nom) return null;
  return estFormuleCloud(f) ? `${nom} + Cloud` : nom;
}

// ── 3. STRIPE : LA FORMULE D'UN ABONNEMENT ───────────────────────────────────────────────────────────────────────────
const prixDeLArticle = (it) => it?.price?.id ?? (typeof it?.price === 'string' ? it.price : null) ?? it?.plan?.id ?? null;
/** La formule avec Cloud lue dans des métadonnées (posées par create-checkout-session) ; null sinon. */
export const formuleDeMetadonnees = (meta) => (estFormuleCloud(meta?.formule) ? meta.formule : null);
/**
 * La formule AVEC CLOUD d'un abonnement Stripe, ou null. Le PRIX fait foi (après un retrait du Cloud ou une descente,
 * le prix change avant la métadonnée) : un prix de formule → elle ; un prix de palier connu → null ; aucun prix connu
 * (édition à la main) → la métadonnée `formule`.
 */
export function formuleDAbonnementStripe(sub, prix = {}) {
  const ids = (sub?.items?.data ?? []).map(prixDeLArticle).filter(Boolean);
  for (const id of ids) {
    const f = formuleDuProduit(id, prix);
    if (f && estFormuleCloud(f.formule)) return f.formule;
  }
  if (ids.some((id) => formuleDuProduit(id, prix))) return null;
  return formuleDeMetadonnees(sub?.metadata);
}
/**
 * L'essai du Cloud d'un ABONNÉ Stripe (décision 6 : il ne paie que sa formule 7 jours, puis la formule avec Cloud),
 * posé par create-checkout-session sur l'abonnement : métadonnées essai_cloud_formule / essai_cloud_debut /
 * essai_cloud_fin (secondes). Rend { formule, debut, fin } (ISO) ou null.
 */
export function essaiCloudAbonneStripe(sub, maintenant = Date.now()) {
  const m = sub?.metadata ?? {};
  const formule = estFormuleCloud(m.essai_cloud_formule) ? m.essai_cloud_formule : null;
  const d = Number(m.essai_cloud_debut), f = Number(m.essai_cloud_fin);
  if (!formule || !essaiPossiblePourFormule(formule) || !(d > 0) || !(f > d)) return null;
  // Une métadonnée restée après la fin de l'essai (plus d'un jour) ne dit plus rien.
  if (f * 1000 < Number(maintenant) - 86_400_000) return null;
  // (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) `essai_cloud_sans_suite: "1"`, posé par
  // cancel-subscription avec le schedule rendu : l'essai court jusqu'à sa fin, rien ne suit (jamais la formule avec Cloud).
  return { formule, debut: new Date(d * 1000).toISOString(), fin: new Date(f * 1000).toISOString(),
    ...(m.essai_cloud_sans_suite === '1' ? { sansSuite: true } : {}) };
}

// ── 4. ⛔ L'ESSAI ────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Un essai de 7 jours est-il ACCORDÉ pour cette formule et cette personne ? La formule d'abord (jamais Business +
 * Cloud), puis le droit de la personne, jugé à part par le serveur (un essai Cloud par personne, préparation fraîche
 * et ses verrous : appareil, compte de plateforme, carte). Pur.
 */
export function essaiFormuleAccorde({ formule, essaiPermis }) {
  return essaiPossiblePourFormule(formule) && essaiPermis === true;
}

// ── 5. LA VOIE D'UN ACHAT WEB (create-checkout-session) ──────────────────────────────────────────────────────────────
/**
 * Que faire d'une demande web de formule avec Cloud ? (pur) — jamais deux abonnements, un abonné reste sur son canal.
 *   p.formule         'premium_cloud' | 'pro_cloud' | 'business_cloud'
 *   p.boutique        { canal, rang } d'un abonnement de palier Apple / Google vivant, ou null
 *   p.cloudBoutique   'apple' | 'google' si un Cloud seul VIVANT est tenu par une boutique, sinon null
 *   p.palierStripe    l'abonnement de palier (ou de formule) Stripe vivant : { id, status, rang, formule, schedule,
 *                          pending_update, cancel_at_period_end }, ou null
 *   p.cloudSeulStripe l'abonnement Cloud seul Stripe vivant : { id, status }, ou null
 *   p.essaiPermis     le droit de la personne à l'essai du Cloud (un par personne, préparation, verrous)
 * @returns {{ voie: 'refus'|'deja'|'checkout'|'changement_prix'|'essai_abonne', motif?: string, canal?: string, essai?: boolean,
 *             cible?: string, prorata?: 'immediat'|'aucun', finEssai?: boolean }}
 * @param {{ formule: string, boutique?: any, cloudBoutique?: any, palierStripe?: any, cloudSeulStripe?: any, essaiPermis?: boolean }} p
 */
export function voieFormuleStripe(p) {
  const { formule, boutique = null, cloudBoutique = null, palierStripe = null, cloudSeulStripe = null, essaiPermis = false } = p;
  if (!estFormuleCloud(formule)) return { voie: 'refus', motif: 'formule_inconnue' };
  const rangVise = RANG[PALIER_DE_FORMULE[formule]];
  // Un abonné Apple / Google reste sur son canal : il change de formule dans l'app iPhone / Android.
  if (boutique?.canal) return { voie: 'refus', motif: 'abonnement_boutique', canal: boutique.canal };
  if (cloudBoutique) return { voie: 'refus', motif: 'cloud_boutique', canal: cloudBoutique };
  // Deux abonnements Stripe vivants (palier + Cloud seul) : les fusionner est un geste du support, jamais automatique.
  if (palierStripe && cloudSeulStripe) return { voie: 'refus', motif: 'deux_abonnements', canal: 'stripe' };
  if (palierStripe) {
    if (palierStripe.formule === formule) return { voie: 'deja', canal: 'stripe' };
    if (palierStripe.schedule) return { voie: 'refus', motif: 'changement_prevu', canal: 'stripe' };
    if (palierStripe.pending_update) return { voie: 'refus', motif: 'montee_en_attente', canal: 'stripe' };
    const rang = Number(palierStripe.rang) || 0;
    // Plus bas que la formule d'aujourd'hui : c'est une descente, programmée à la fin de la période (changer-formule).
    if (rangVise < rang || (rangVise === rang && estFormuleCloud(palierStripe.formule))) {
      return { voie: 'refus', motif: 'descente_par_changer_formule', canal: 'stripe' };
    }
    // Même palier, jamais eu le Cloud : 7 jours de Cloud en payant seulement sa formule, puis la formule avec Cloud
    // (décision 6, Premium et Pro seulement). ⛔ Business + Cloud : jamais (essaiPossiblePourFormule).
    if (rangVise === rang && palierStripe.status === 'active' && palierStripe.cancel_at_period_end !== true
        && essaiFormuleAccorde({ formule, essaiPermis })) {
      return { voie: 'essai_abonne', cible: palierStripe.id, canal: 'stripe', essai: true };
    }
    // Sinon (essai déjà pris, Business, palier supérieur) : le même abonnement change de prix, au prorata, tout de suite.
    // ⛔ (14/11/2026, bloc F — décision de Nico) PENDANT UN ESSAI (trialing), quelle que soit la formule visée : l'essai
    // s'arrête là et la formule est payée tout de suite (finEssai) — après la fenêtre qui dit le montant exact
    // (_shared/changement-formule.js). Plus jamais « l'essai continue au prix choisi ».
    if (palierStripe.status === 'trialing') {
      return { voie: 'changement_prix', cible: palierStripe.id, canal: 'stripe', essai: false, prorata: 'immediat', finEssai: true };
    }
    return { voie: 'changement_prix', cible: palierStripe.id, canal: 'stripe', essai: false, prorata: 'immediat' };
  }
  if (cloudSeulStripe) {
    // Le client du Cloud seul passe à une formule avec Cloud : le MÊME abonnement change de prix, au prorata, tout de suite.
    // ⛔ (14/11/2026, bloc F) Pendant son essai : l'essai s'arrête là, la formule est payée tout de suite (finEssai), après
    // la fenêtre du montant exact.
    if (cloudSeulStripe.status === 'trialing') {
      return { voie: 'changement_prix', cible: cloudSeulStripe.id, canal: 'stripe', essai: false, prorata: 'immediat', finEssai: true };
    }
    return { voie: 'changement_prix', cible: cloudSeulStripe.id, canal: 'stripe', essai: false, prorata: 'immediat' };
  }
  return { voie: 'checkout', canal: 'stripe', essai: essaiFormuleAccorde({ formule, essaiPermis }) };
}

/** Le refus, dit au client (fr / en) : le canal où il change de formule. */
export function messageVoieFormule(r, lang = 'fr') {
  const en = lang === 'en';
  const app = r?.canal === 'apple' ? (en ? 'the FillSell app on your iPhone' : "l'app FillSell sur ton iPhone")
    : r?.canal === 'google' ? (en ? 'the FillSell app on your Android phone' : "l'app FillSell sur ton téléphone Android") : null;
  switch (r?.motif) {
    case 'abonnement_boutique':
      // (12/11, point 4c de Nico) La boutique qui facture n'a pas les formules (interrupteur du canal fermé) : jamais
      // « change de formule dans l'app sur ton iPhone », où rien n'existe. (13/11, décision de Nico : « on ouvre partout »)
      // Les textes « … y arrivent bientôt : Apple est en train de les valider » sont RETIRÉS : un canal fermé (retour arrière
      // seulement) reçoit la phrase neutre, sans promesse.
      if (r.ferme === true) break;
      // (13/11/2026, décision de Nico) Le Cloud se prend AUSSI seul, ici, en plus de la formule de la boutique : la phrase
      // le propose quand le compte n'a pas encore le Cloud (`cloudSeulPossible`, posé par create-checkout-session).
      if (r.cloudSeulPossible === true) {
        return en ? `Your plan is managed by ${r.canal === 'apple' ? 'the App Store' : 'Google Play'}: a plan with Cloud here would be a second plan. To add the Cloud, take FillSell Cloud on its own, here: it comes on top of your plan. Or switch to the Cloud version of your plan in ${app}. Nothing was charged.`
          : `Ta formule est gérée par ${r.canal === 'apple' ? "l'App Store" : 'Google Play'} : une formule avec Cloud prise ici en ferait une seconde. Pour ajouter le Cloud, prends FillSell Cloud seul, ici : il s'ajoute à ta formule. Ou passe à la version avec Cloud de ta formule dans ${app}. Rien n'a été débité.`;
      }
      return en ? `Your subscription is managed by ${r.canal === 'apple' ? 'the App Store' : 'Google Play'}: change plans in ${app}. Nothing was charged.`
        : `Ton abonnement est géré par ${r.canal === 'apple' ? "l'App Store" : 'Google Play'} : change de formule dans ${app}. Rien n'a été débité.`;
    case 'cloud_boutique':
    case 'deux_abonnements': {
      // (13/11/2026, décision de Nico — « jamais deux fois le Cloud : proposer le changement, pas un refus sec ») Le compte a
      // DÉJÀ FillSell Cloud seul (App Store / Google Play : 'cloud_boutique' ; par carte, à côté d'une formule Stripe :
      // 'deux_abonnements' — une formule + le Cloud seul, c'est normal) : une formule avec Cloud le ferait payer deux fois.
      // La phrase dit ce qui existe et propose la formule SANS Cloud, qui s'ajoute au Cloud déjà là. Avant : la phrase
      // neutre (« Cette formule n'est pas disponible ») ou « Tu as deux abonnements : écris-nous ».
      const par = r?.motif === 'deux_abonnements' ? (en ? 'by card, on the web' : 'par carte, sur le web')
        : r?.canal === 'apple' ? (en ? 'through the App Store' : "par l'App Store") : r?.canal === 'google' ? (en ? 'through Google Play' : 'par Google Play') : null;
      return en ? `You already have FillSell Cloud${par ? ` (${par})` : ''}: a plan with Cloud would make you pay for the Cloud twice. Choose the plan without Cloud (Premium, Pro or Business): it comes on top of your Cloud. Nothing was charged.`
        : `Tu as déjà FillSell Cloud${par ? ` (${par})` : ''} : une formule avec Cloud te le ferait payer deux fois. Choisis la formule sans Cloud (Premium, Pro ou Business) : elle s'ajoute à ton Cloud. Rien n'a été débité.`;
    }
    case 'changement_prevu':
      return en ? 'A plan change is already scheduled: cancel it in Settings › Subscription, then try again. Nothing was charged.'
        : "Un changement de formule est déjà prévu : annule-le dans Réglages › Abonnement, puis recommence. Rien n'a été débité.";
    case 'montee_en_attente':
      return en ? 'A plan change is waiting for your payment: finish it first. Nothing more was charged.'
        : "Un changement de formule attend ton paiement : termine-le d'abord. Rien de plus n'a été débité.";
    case 'descente_par_changer_formule':
      return en ? 'Moving to a lower plan happens at the end of your period: choose it in Settings › Subscription › Other plans. Nothing was charged.'
        : "Passer à une formule inférieure se fait à la fin de ta période : choisis-la dans Réglages › Abonnement › Autres formules. Rien n'a été débité.";
    default:
      break;
  }
  return en ? 'This plan is not available right now. Nothing was charged.' : "Cette formule n'est pas disponible pour le moment. Rien n'a été débité.";
}

// ── 6. LES PARAMÈTRES STRIPE ─────────────────────────────────────────────────────────────────────────────────────────
// 31 min : la place gardée par la préparation (cloud_essai_preparer_moi, 30 min) — même règle que le Cloud seul.
export const EXPIRATION_CHECKOUT_FORMULE_S = 31 * 60;
/** Les métadonnées d'une formule avec Cloud (session ET abonnement) : plan_type (les paliers les lisent), formule. */
export function metadonneesFormule({ formule, essai = false, userId = '' }) {
  return { plan_type: planTypeDeFormule(formule), formule, essai_cloud: essai ? '1' : '0', fillsell_user_id: userId ?? '' };
}
/** La session Checkout d'une formule avec Cloud. ⛔ Jamais d'essai pour une formule qui n'en a pas (lève). */
export function parametresCheckoutFormule({ formule, prixFormule, essai = false, userId, maintenant = Date.now() }) {
  if (!estFormuleCloud(formule)) throw new Error(`formule inconnue : ${formule}`);
  if (!prixFormule) throw new Error(`prix absent pour ${formule}`);
  if (essai && !essaiPossiblePourFormule(formule)) throw new Error(`essai interdit sur ${formule}`);
  const metadata = metadonneesFormule({ formule, essai, userId });
  return {
    expires_at: Math.floor(maintenant / 1000) + EXPIRATION_CHECKOUT_FORMULE_S,
    mode: 'subscription',
    line_items: [{ price: prixFormule, quantity: 1 }],
    payment_method_collection: 'always',
    subscription_data: {
      metadata,
      ...(essai ? { trial_period_days: ESSAI_JOURS, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}),
    },
    metadata,
  };
}
/** Les articles d'une phase de schedule, réécrits pour une mise à jour (prix + quantité). */
const articlesDePhase = (phase) => (phase?.items ?? []).map((it) => ({ price: prixDeLArticle(it), quantity: it.quantity ?? 1 }));
/** Les remises d'une phase, gardées telles quelles (décision 11 : la remise reste sur l'abonnement). */
const remisesDePhase = (phase) => (phase?.discounts ?? [])
  .map((d) => (d?.discount ? { discount: typeof d.discount === 'string' ? d.discount : d.discount.id }
    : d?.coupon ? { coupon: typeof d.coupon === 'string' ? d.coupon : d.coupon.id }
    : d?.promotion_code ? { promotion_code: typeof d.promotion_code === 'string' ? d.promotion_code : d.promotion_code.id } : null))
  .filter(Boolean);
/**
 * L'essai du Cloud d'un ABONNÉ Stripe (décision 6) : un subscription schedule posé sur SON abonnement —
 * phase 1 = son abonnement tel qu'il est, 7 jours (le Cloud tourne : cloud_essai_*), phase 2 = la formule avec Cloud,
 * la différence au prorata ajoutée à la PROCHAINE facture (create_prorations : aucun débit hors échéance), puis
 * l'abonnement continue seul. ⛔ Jamais pour Business + Cloud (lève). Rend { phases, end_behavior, essai }.
 */
export function parametresEssaiCloudAbonne({ formule, abonnement, schedule, prix, maintenant = Date.now() }) {
  if (!estFormuleCloud(formule)) throw new Error(`formule inconnue : ${formule}`);
  if (!essaiPossiblePourFormule(formule)) throw new Error(`essai interdit sur ${formule}`);
  const prixVers = prix?.[formule];
  if (!prixVers) throw new Error(`prix absent pour ${formule}`);
  const phase0 = schedule?.phases?.[0];
  if (!phase0) throw new Error('essai abonné : schedule sans phase courante');
  const articles = articlesDePhase(phase0);
  if (!articles.length || articles.some((a) => !a.price)) throw new Error('essai abonné : articles illisibles');
  const debut = Math.floor(maintenant / 1000);
  const fin = debut + ESSAI_JOURS * 86_400;
  const meta = { ...(abonnement?.metadata ?? {}) };
  const remises = remisesDePhase(phase0);
  const metaEssai = { ...meta, essai_cloud_formule: formule, essai_cloud_debut: String(debut), essai_cloud_fin: String(fin) };
  const { essai_cloud_formule: _a, essai_cloud_debut: _b, essai_cloud_fin: _c, ...metaApres } = meta;
  return {
    end_behavior: 'release',
    phases: [
      { items: articles, start_date: phase0.start_date, end_date: fin, metadata: metaEssai, proration_behavior: 'none',
        ...(remises.length ? { discounts: remises } : {}) },
      { items: [{ price: prixVers, quantity: 1 }], iterations: 1, proration_behavior: 'create_prorations',
        // Les clés de l'essai VIDÉES (Stripe les retire) : après la phase 2, plus rien ne dit « essai en cours ».
        metadata: { ...metaApres, essai_cloud_formule: '', essai_cloud_debut: '', essai_cloud_fin: '', plan_type: planTypeDeFormule(formule), formule, essai_cloud: '1' },
        ...(remises.length ? { discounts: remises } : {}) },
    ],
    essai: { formule, debut: new Date(debut * 1000).toISOString(), fin: new Date(fin * 1000).toISOString() },
  };
}

// ── 7. LES INTERRUPTEURS PAR CANAL ───────────────────────────────────────────────────────────────────────────────────
export const CLES_INTERRUPTEURS_FORMULES = CLE_INTERRUPTEUR_FORMULES;
/** Le canal des formules est-il ouvert POUR CE COMPTE ? La valeur de coin_config (absente ou ≠ 1 = fermé), ou un témoin. */
export function formulesOuvertesPour({ valeur, temoin = false }) {
  return Number(valeur) === 1 || temoin === true;
}
/** Le compte est-il un témoin du Cloud (profiles.beta_flags.cloud, posé par le serveur seul) ? */
export const temoinCloud = (profil) => (profil?.beta_flags ?? null)?.cloud === true;

// ── 8. LES CONDITIONS DU CLOUD ───────────────────────────────────────────────────────────────────────────────────────
/** La ligne de CGU_CLOUD_HISTORIQUE (cloud-conditions.js) qui décrit les formules avec Cloud porte ce changement. */
export const CHANGEMENT_CGU_FORMULES = 'formules_cloud_article_6';
/** La version des conditions qui décrit les formules avec Cloud, ou null tant qu'elle n'est pas écrite (= fermé). */
export const versionCguFormules = (historique = CGU_CLOUD_HISTORIQUE) =>
  (historique ?? []).find((v) => v?.changement === CHANGEMENT_CGU_FORMULES)?.version ?? null;
/**
 * Une formule avec Cloud s'achète-t-elle sous ces conditions ? Une acceptation valable (cloud-conditions.js) ET ≥ la
 * version qui décrit les formules : personne n'achète une formule avec Cloud sur les anciennes conditions. Tant que
 * cette version n'existe pas, tout est refusé (échec fermé).
 */
export function conditionsFormulesAcceptees(profil, historique = CGU_CLOUD_HISTORIQUE) {
  const min = versionCguFormules(historique);
  const v = profil?.cloud_cgu_version;
  return Boolean(min) && versionCguValable(v) && String(v) >= min;
}

// ── 9. LE CLOUD SEUL N'EST PLUS VENDU À UN NOUVEAU ───────────────────────────────────────────────────────────────────
/** Le compte a-t-il DÉJÀ eu le Cloud (même règle que aDejaEuLeCloud de l'app) ? */
export function aDejaEuLeCloudServeur(p) {
  if (!p) return false;
  return Boolean(p.is_cloud || p.cloud_essai_debut || p.cloud_essai_fin || p.cloud_essai_arrete || p.cloud_essai_refus
    || p.cloud_periode_fin || p.cloud_ref || p.cloud_canal);
}
/** product "cloud" (anciens paquets web / OTA) : refusé à un compte qui ne l'a jamais eu quand les formules sont ouvertes.
 *  (13/11/2026, décision de Nico — « le Cloud seul en complément, sur n'importe quel canal ») JAMAIS à un abonné : une
 *  formule vivante (Premium, Pro ou Business, sur tout canal : `formuleVivante`, compterFormules de un-seul-abonnement.js)
 *  prend le Cloud seul en plus. Seul un compte SANS formule reste orienté vers les formules avec Cloud (11/11, inchangé). */
export function cloudSeulRefuse({ profil, formulesOuvertes, formuleVivante = false }) {
  if (formuleVivante === true) return false;
  return formulesOuvertes === true && !aDejaEuLeCloudServeur(profil);
}

// ── 10. LES BOUTIQUES : CE QU'UN ACHAT DE FORMULE OUVRE ──────────────────────────────────────────────────────────────
/**
 * Les droits d'une transaction de boutique (Apple ou Google) sur un produit de palier ou de formule (pur).
 *   essaiBoutique : la période en cours est une semaine gratuite de la boutique ;
 *   verdictEssai  : verdictEssaiStore (cloud-option.js) — ok faux = l'essai FillSell a déjà été pris (ou refusé).
 * Rend { formule, rang, cloud, ouvrir, raison } :
 *   ouvrir faux = RIEN ne monte pendant cette semaine gratuite (décision 8 : droits au 1er paiement réel ; ⛔ Business +
 *   Cloud n'a aucun essai, une semaine gratuite qui arriverait quand même n'ouvre rien).
 */
export function droitsAchatBoutique({ produit, essaiBoutique = false, verdictEssai = { ok: true } }) {
  const f = formuleDuProduit(produit);
  if (!f || f.formule === 'cloud') return null;
  if (essaiBoutique && f.cloud && !essaiPossiblePourFormule(f.formule)) {
    return { ...f, ouvrir: false, raison: 'essai_interdit_formule' };
  }
  if (essaiBoutique && f.cloud && verdictEssai?.ok === false) {
    return { ...f, ouvrir: false, raison: verdictEssai.raison ?? 'essai_deja_pris' };
  }
  return { ...f, ouvrir: true, raison: null };
}
/** Aucun crédit mensuel pendant un essai, sur aucun canal : la période en cours est-elle gratuite ? (pur) */
export function periodeGratuite({ statutStripe = null, montantPaye = null, essaiBoutique = false } = {}) {
  if (statutStripe === 'trialing') return true;
  if (essaiBoutique === true) return true;
  if (montantPaye != null && Number(montantPaye) === 0) return true;
  return false;
}

/**
 * (11/11) Un événement de boutique sur un produit du groupe des paliers, quand LE PRODUIT FAIT FOI (formule avec Cloud ;
 * ou produit sans Cloud quand le Cloud de la boutique est lié à cet abonnement — retrait du Cloud — ou qu'un changement
 * de formule a été annoncé). Pur.
 *   sens 'on'  : achat, renouvellement (DID_RENEW / RENEWED : le produit RENOUVELÉ), montée ; 'off' : expiré, remboursé,
 *                révoqué, impayé.
 *   rangAutres : le rang des AUTRES canaux vivants (Stripe relu, l'autre boutique) — jamais descendre sous eux.
 * Rend { drapeaux (null = rien ne change), credit (crédit du mois : jamais pendant un essai), cloud ('ecrire' | 'couper' |
 * 'rien' | null), ouvrir, raison, formule }.
 */
export function planAchatBoutique({ produit, sens, essaiBoutique = false, verdictEssai = { ok: true }, rangAutres = 0, cloudLie = false }) {
  const f = formuleDuProduit(produit);
  if (!f || f.formule === 'cloud') return null;
  const autres = Math.max(0, Number(rangAutres) || 0);
  if (sens === 'off') {
    return { drapeaux: drapeauxDuRang(autres), credit: false, cloud: f.cloud || cloudLie ? 'couper' : null, ouvrir: false, raison: 'arret', formule: f.formule };
  }
  if (sens !== 'on') return null;
  const d = droitsAchatBoutique({ produit, essaiBoutique, verdictEssai });
  return {
    drapeaux: d.ouvrir ? drapeauxDuRang(Math.max(d.rang, autres)) : null,
    credit: d.ouvrir && essaiBoutique !== true,
    cloud: f.cloud ? (d.ouvrir ? 'ecrire' : 'rien') : (cloudLie ? 'couper' : null),
    ouvrir: d.ouvrir, raison: d.raison, formule: f.formule,
  };
}
/** Le palier d'une formule pour les colonnes formule_prevue (contrainte de prod : 'premium' | 'pro' seulement) ; null sinon. */
export function formulePrevueEcrivable(f) {
  const p = PALIER_DE_FORMULE[f] ?? (f === 'standard' || f === 'founder' ? 'premium' : f);
  return p === 'premium' || p === 'pro' ? p : null;
}
