// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « FILLSELL CLOUD » VUE PAR LES PAIEMENTS — règles pures (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Importé par stripe-webhook, create-checkout-session, cancel-subscription,
// apple-iap-webhook, google-play-webhook, validate-apple-receipt,
// validate-google-purchase — et par `scripts/option-cloud-selftest.mjs` (node,
// sans réseau). Aucune dépendance, aucun appel réseau.
//
// DÉCISIONS FINALES DE NICO (04/10 nuit) :
//  · Cloud = abonnement SÉPARÉ, 20,00 €/mois, essai gratuit de 7 JOURS, carte
//    obligatoire.
//  · Ouvert à TOUS, comptes Free compris : Cloud se prend SEUL. Le compte garde
//    les quotas de son palier (Free : 5 annonces). Cumulable avec Premium / Pro
//    / Business.
//  · Aucun essai de palier, aucun produit combiné. Rien ne change sur les
//    produits des paliers.
//  · Si le palier prend fin, le compte repasse en Free et Cloud CONTINUE.
//
// GARDE-FOUS :
//  · colonnes propres à Cloud (is_cloud, cloud_essai_*, cloud_canal, cloud_ref,
//    cloud_periode_fin, cloud_arret_fin_periode) ;
//  · is_premium / is_pro / is_business ne viennent JAMAIS d'un abonnement Cloud ;
//  · côté Stripe, un abonnement Cloud porte `metadata.option = "cloud"` et
//    n'entre jamais dans le rang des paliers (rangAbonnement, montée de palier) ;
//  · un seul essai par compte côté Stripe (garde serveur) ; Apple (une offre
//    d'introduction par identifiant Apple et par groupe) et Google (offre
//    « nouveaux clients de ce produit ») le garantissent eux-mêmes.
//
// ALIGNÉ sur src/utils/palier.js (branche conception/cloud-option, règles
// validées 83/83) : mêmes colonnes, même état. Arrêter l'essai = effet
// IMMÉDIAT, rien facturé (cloud_essai_arrete, fin ramenée à l'arrêt) ; arrêter
// une fois payée = tourne jusqu'à cloud_periode_fin (cloud_arret_fin_periode).
//
// UN SEUL ESSAI PAR COMPTE FILLSELL, TOUS CANAUX CONFONDUS : Apple et Google
// donnent leur propre semaine gratuite par compte de store, sans rien savoir
// des autres canaux. Le serveur ne l'ACTIVE pas si le compte a déjà eu un essai
// ailleurs (verdictEssaiStore) : Cloud démarre au premier paiement réel.
// Stripe : Checkout sans essai (essaiCloudPermis lit la même colonne).
//
// ⛔ Ce module ne lit ni n'écrit la base : il rend des décisions que l'appelant
//    applique (migration 20261004233000).

export const ESSAI_CLOUD_JOURS = 7;
export const JOUR_MS = 86_400_000;

// ── Identifiants des stores ───────────────────────────────────────────────────
export const PRODUIT_CLOUD_APPLE = "app.fillsell.cloud.sub";   // groupe « FillSell Cloud », Apple ID 6819067675
export const PRODUIT_CLOUD_GOOGLE = "app.fillsell.cloud.sub";
export const FORFAIT_CLOUD_GOOGLE = "cloud-monthly";
// ⚠️ L'identifiant dit « 3d » mais l'offre porte 7 jours depuis le 04/10 nuit :
// Google a laissé modifier la durée, et un identifiant ne se renomme jamais.
export const OFFRE_ESSAI_CLOUD_GOOGLE = "cloud-trial-3d";

export const CANAUX = Object.freeze(["stripe", "apple", "google", "offert"]);

// ── Outils ────────────────────────────────────────────────────────────────────
const instant = (v) => {
  if (v == null || v === "") return null;
  const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const iso = (t) => (t == null ? null : new Date(t).toISOString());
const secondesIso = (s) => (typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString() : null);

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'ÉTAT CLOUD D'UN COMPTE
// ═══════════════════════════════════════════════════════════════════════════
//   etat   : 'aucun' | 'essai' | 'paye' | 'essai_termine'
//   actif  : un navigateur Cloud doit-il tourner pour ce compte ?
// Le palier n'entre PAS dans le calcul : Cloud tourne avec ou sans palier, et
// les quotas restent ceux du palier (Free compris).
/** @param {any} p @param {number | string | Date} [maintenant] */
export function etatCloud(p, maintenant = Date.now()) {
  // Miroir de cloudDuProfil (palier.js) avec CLOUD_EXIGE_UN_PALIER = false :
  // l'état « suspendu » n'existe plus, le palier n'entre pas dans le calcul.
  const now = instant(maintenant) ?? Date.now();
  const debut = instant(p?.cloud_essai_debut);
  const fin = instant(p?.cloud_essai_fin);
  const essaiPris = debut != null;
  const essaiEnCours = debut != null && fin != null && debut <= now && now < fin && p?.cloud_essai_arrete !== true;
  const paye = p?.is_cloud === true;
  const periodeFin = instant(p?.cloud_periode_fin);
  const base = {
    essaiPris,
    essaiArrete: essaiPris && p?.cloud_essai_arrete === true,
    essaiFin: iso(fin),
    joursRestants: null,
    periodeFin: paye && periodeFin != null ? iso(periodeFin) : null,
    arretPrevuLe: paye && p?.cloud_arret_fin_periode === true && periodeFin != null ? iso(periodeFin) : null,
  };
  if (paye) return { ...base, etat: "paye", actif: true };
  if (essaiEnCours) {
    return { ...base, etat: "essai", actif: true, joursRestants: Math.max(1, Math.ceil((fin - now) / JOUR_MS)) };
  }
  if (essaiPris && (p?.cloud_essai_arrete === true || (fin != null && now >= fin))) return { ...base, etat: "essai_termine", actif: false };
  return { ...base, etat: "aucun", actif: false };
}

/**
 * UN SEUL ESSAI PAR COMPTE, TOUS CANAUX : un essai de store (Apple, Google)
 * peut-il être ACTIVÉ ? Oui s'il n'y a jamais eu d'essai, ou si c'est le même
 * (même canal, même référence : rejeu de l'événement). Sinon Cloud n'est PAS
 * activé gratuitement : il démarre au premier paiement réel.
 * @returns {{ ok: boolean, raison: string | null }}
 */
export function verdictEssaiStore(profil, canal, ref) {
  // (05/10) La PRÉPARATION a refusé l'essai (appareil ou compte de plateforme
  // déjà vus sur l'essai d'un autre compte — cloud_essai_permis, lu par
  // _shared/cloud-essai-store.ts) : la semaine du store n'est pas activée.
  if (profil?.cloud_essai_debut == null) {
    return profil?.cloud_essai_interdit === true ? { ok: false, raison: "essai_interdit" } : { ok: true, raison: null };
  }
  if (profil?.cloud_canal === canal && ref != null && profil?.cloud_ref === ref) return { ok: true, raison: null };
  return { ok: false, raison: "essai_deja_pris" };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. STRIPE — un abonnement Cloud À PART
// ═══════════════════════════════════════════════════════════════════════════
const RANG = Object.freeze({ standard: 1, premium: 1, founder: 1, pro: 2, business: 3 });

function prixDeLArticle(it) {
  return it?.price?.id ?? (typeof it?.price === "string" ? it.price : null) ?? it?.plan?.id ?? null;
}

/**
 * Un abonnement Stripe est-il celui de l'option Cloud ? La métadonnée d'abord
 * (posée par create-checkout-session), le prix en repli (abonnement édité dans
 * le dashboard) : tous ses articles sont au prix Cloud.
 */
export function estAbonnementCloud(sub, prix = {}) {
  if (sub?.metadata?.option === "cloud") return true;
  const items = sub?.items?.data ?? [];
  return !!prix.cloud && items.length > 0 && items.every((it) => prixDeLArticle(it) === prix.cloud);
}

/**
 * Lecture d'un abonnement Stripe : palier porté (métadonnée d'abord, prix en
 * repli — même ordre que rangAbonnement) OU option Cloud. Jamais les deux.
 */
export function litAbonnementStripe(sub, prix = {}) {
  const status = sub?.status ?? null;
  const vivant = status === "active" || status === "past_due" || status === "trialing";
  const cloud = estAbonnementCloud(sub, prix);
  let palier = null;
  if (!cloud) {
    const ids = (sub?.items?.data ?? []).map(prixDeLArticle);
    const meta = sub?.metadata?.plan_type;
    if (meta === "business" || meta === "pro" || meta === "standard") palier = meta;
    else if (meta === "premium" || meta === "founder") palier = "standard";
    if (prix.business && ids.includes(prix.business)) palier = "business";
    else if (prix.pro && ids.includes(prix.pro)) palier = "pro";
    else if (prix.standard && ids.includes(prix.standard)) palier = palier ?? "standard";
  }
  return {
    id: sub?.id ?? null,
    status,
    vivant,
    cloud,
    palier,
    rang: cloud ? -1 : (palier ? RANG[palier] : 0),
    essai: status === "trialing",
    trial_start: secondesIso(sub?.trial_start),
    trial_end: secondesIso(sub?.trial_end),
    // Terminé AVANT la fin de son essai (1 min de marge) : l'essai a été arrêté.
    essai_arrete_le: (typeof sub?.ended_at === "number" && typeof sub?.trial_end === "number" && sub.ended_at < sub.trial_end - 60)
      ? secondesIso(sub.ended_at) : null,
    cancel_at_period_end: sub?.cancel_at_period_end === true,
    current_period_end: secondesIso(sub?.current_period_end),
  };
}

/**
 * Les drapeaux d'un client Stripe depuis TOUS ses abonnements.
 *  · paliers : exactement la règle d'avant (tout abonnement vivant NON Cloud
 *    vaut premium — Founder legacy compris ; pro/business par métadonnée ou
 *    prix) ;
 *  · Cloud : is_cloud = un abonnement Cloud active/past_due ; l'essai (trialing)
 *    date cloud_essai_debut/fin et fait tourner Cloud sans is_cloud.
 */
export function drapeauxDepuisStripe(subs, prix = {}) {
  const lus = (subs ?? []).map((s) => litAbonnementStripe(s, prix));
  const vivants = lus.filter((l) => l.vivant);
  const paliers = vivants.filter((l) => !l.cloud);
  const clouds = vivants.filter((l) => l.cloud);
  const cloudPaye = clouds.find((l) => !l.essai) ?? null;
  const cloudEssai = clouds.find((l) => l.essai) ?? null;
  const porteur = cloudPaye ?? cloudEssai;
  // Le dernier abonnement Cloud arrêté pendant son essai (s'il n'y a plus rien de vivant).
  const arrete = porteur ? null
    : lus.filter((l) => l.cloud && l.essai_arrete_le).sort((a, b) => (a.essai_arrete_le < b.essai_arrete_le ? 1 : -1))[0] ?? null;
  const hasBusiness = paliers.some((l) => l.palier === "business");
  const hasPro = paliers.some((l) => l.palier === "pro");
  return {
    is_premium: paliers.length > 0,
    is_pro: hasPro || hasBusiness,
    is_business: hasBusiness,
    subscription_cancel_at_period_end: paliers.length > 0 && paliers.every((l) => l.cancel_at_period_end),
    is_cloud: !!cloudPaye,
    cloud_ref: porteur?.id ?? null,
    cloud_periode_fin: porteur ? (porteur.essai ? porteur.trial_end : porteur.current_period_end) : null,
    cloud_arret_fin_periode: porteur ? porteur.cancel_at_period_end : false,
    cloud_essai_debut: cloudEssai?.trial_start ?? null,
    cloud_essai_fin: cloudEssai?.trial_end ?? null,
    cloud_vivant: !!porteur,
    cloud_essai_arrete_le: arrete?.essai_arrete_le ?? null,
    cloud_essai_debut_arrete: arrete?.trial_start ?? null,
  };
}

/**
 * Ce qu'on ÉCRIT dans profiles depuis les drapeaux Stripe. Les colonnes Cloud
 * ne bougent que si l'option est portée par Stripe (ou par personne) : un Cloud
 * pris dans l'App Store n'est jamais effacé par un événement Stripe.
 */
export function miseAJourProfilDepuisStripe(d, canalActuel) {
  /** @type {Record<string, any>} */
  const update = {
    is_premium: d.is_premium,
    is_pro: d.is_pro,
    is_business: d.is_business,
    subscription_cancel_at_period_end: d.subscription_cancel_at_period_end,
  };
  if (d.cloud_vivant) {
    update.is_cloud = d.is_cloud;
    update.cloud_canal = "stripe";
    update.cloud_ref = d.cloud_ref;
    update.cloud_periode_fin = d.cloud_periode_fin;
    update.cloud_arret_fin_periode = d.cloud_arret_fin_periode;
    if (d.cloud_essai_debut) { update.cloud_essai_debut = d.cloud_essai_debut; update.cloud_essai_fin = d.cloud_essai_fin; }
  } else if (canalActuel == null || canalActuel === "stripe") {
    // Plus rien chez Stripe : l'option tombe. L'essai pris reste écrit (un seul par compte).
    update.is_cloud = false;
    update.cloud_periode_fin = null;
    update.cloud_arret_fin_periode = false;
    if (d.cloud_essai_arrete_le) {
      // Essai arrêté par la personne : effet immédiat, l'essai reste « pris ».
      update.cloud_essai_arrete = true;
      update.cloud_essai_fin = d.cloud_essai_arrete_le;
      if (d.cloud_essai_debut_arrete) update.cloud_essai_debut = d.cloud_essai_debut_arrete;
    }
  }
  return update;
}

/** Un seul essai Cloud par compte : la ligne profiles ET l'historique Stripe du client. */
export function essaiCloudPermis(p, abonnementsStripe = [], prix = {}) {
  if (p?.cloud_essai_debut != null) return false;
  if (p?.is_cloud === true) return false;
  return !(abonnementsStripe ?? []).some((s) =>
    estAbonnementCloud(s, prix) && (s?.trial_start != null || s?.metadata?.essai_cloud === "1"));
}

/** Les paramètres de la session Checkout de l'abonnement Cloud (carte obligatoire, essai 7 j si permis). */
export function parametresCheckoutCloud({ prixCloud, essai, userId }) {
  const metadata = { option: "cloud", plan_type: "cloud", essai_cloud: essai ? "1" : "0", fillsell_user_id: userId ?? "" };
  return {
    mode: "subscription",
    line_items: [{ price: prixCloud, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: {
      metadata,
      ...(essai ? {
        trial_period_days: ESSAI_CLOUD_JOURS,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      } : {}),
    },
    metadata,
  };
}

/** Une session Checkout ouverte est-elle celle de l'option Cloud ? (jamais reprise pour un palier, ni l'inverse) */
export function sessionEstCloud(s) {
  return s?.metadata?.option === "cloud";
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. APPLE — signedTransactionInfo (JWS vérifié par l'appelant)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Le produit Cloud ? Rend { essai, debut, fin, original } ou null. L'essai =
 * offre d'introduction (offerType 1, gratuite) ; la conversion arrive en
 * DID_RENEW sans offerType.
 */
export function lectureCloudApple(tx) {
  if (tx?.productId !== PRODUIT_CLOUD_APPLE) return null;
  const essai = Number(tx?.offerType) === 1 && (tx?.offerDiscountType == null || tx?.offerDiscountType === "FREE_TRIAL");
  return {
    essai,
    debut: iso(instant(tx?.purchaseDate)),
    fin: iso(instant(tx?.expiresDate)),
    original: tx?.originalTransactionId ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GOOGLE — purchases.subscriptionsv2 + type de notification RTDN
// ═══════════════════════════════════════════════════════════════════════════
export const GOOGLE_PURCHASED = 4;
/**
 * Rend { essai, debut, fin, offre } ou null si ce n'est pas le produit Cloud.
 * L'essai : l'offre d'essai portée par la ligne ET un ACHAT (type 4) — un
 * RENEWED (2) est payé même si offerId reste sur la ligne. Sans type
 * (validation côté app), la durée fait foi : au plus 8 jours.
 * @param {string} subscriptionId @param {any} purchase @param {number | null} [notificationType]
 */
export function lectureCloudGoogle(subscriptionId, purchase, notificationType = null) {
  if (subscriptionId !== PRODUIT_CLOUD_GOOGLE) return null;
  const ligne = (purchase?.lineItems ?? [])[0] ?? {};
  const offre = ligne?.offerDetails?.offerId ?? null;
  const debut = iso(instant(purchase?.startTime));
  const fin = iso(instant(ligne?.expiryTime));
  let essai = false;
  if (offre === OFFRE_ESSAI_CLOUD_GOOGLE) {
    if (notificationType != null) essai = Number(notificationType) === GOOGLE_PURCHASED;
    else {
      const d = instant(debut); const f = instant(fin);
      essai = d != null && f != null && f - d <= (ESSAI_CLOUD_JOURS + 1) * JOUR_MS;
    }
  }
  return { essai, debut, fin, offre };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CE QU'ON ÉCRIT pour un événement de store (Apple comme Google)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * `sens` : 'on' | 'off' | 'annulation' | 'reprise' ; `ref` : originalTransactionId
 * ou purchaseToken ; `profil` : la ligne actuelle (garde du canal et de la
 * référence). Rend { update, motif } — update = null quand l'événement ne doit
 * RIEN écrire. Ne touche JAMAIS aux colonnes de palier.
 */
export function ecritureCloudStore({ canal, lecture, sens, ref, profil, maintenant = Date.now() }) {
  const sien = profil?.cloud_canal == null || profil?.cloud_canal === canal;
  const memeRef = profil?.cloud_ref == null || ref == null || profil?.cloud_ref === ref;
  if (sens !== "on" && (!sien || !memeRef)) {
    return { update: null, motif: "reference_autre_canal_ou_remplacee" };
  }
  const now = instant(maintenant) ?? Date.now();
  /** @type {Record<string, any>} */
  const update = {};
  let motif = null;
  if (sens === "on") {
    update.cloud_canal = canal;
    update.cloud_ref = ref ?? null;
    update.cloud_periode_fin = lecture?.fin ?? null;
    update.cloud_arret_fin_periode = false;
    if (lecture?.essai) {
      update.is_cloud = false;
      const v = verdictEssaiStore(profil, canal, ref);
      if (v.ok) {
        update.cloud_essai_debut = lecture.debut;
        update.cloud_essai_fin = lecture.fin;
      } else {
        // Second essai (autre canal) : PAS activé gratuitement. Cloud démarre au
        // premier paiement réel (DID_RENEW / RENEWED). L'essai déjà pris reste.
        motif = v.raison;
      }
    } else {
      update.is_cloud = true;
    }
  } else if (sens === "off") {
    update.is_cloud = false;
    update.cloud_periode_fin = lecture?.fin ?? null;
  } else if (sens === "annulation") {
    const fin = instant(profil?.cloud_essai_fin);
    const enEssai = profil?.is_cloud !== true && profil?.cloud_essai_debut != null && fin != null && now < fin && profil?.cloud_essai_arrete !== true;
    if (enEssai) {
      // Arrêt PENDANT l'essai : effet IMMÉDIAT, rien facturé (la personne vient
      // de couper le renouvellement, le store ne débitera pas).
      update.cloud_essai_arrete = true;
      update.cloud_essai_fin = new Date(now).toISOString();
    } else {
      // Payée : tourne jusqu'à la fin de la période, puis s'arrête.
      update.cloud_arret_fin_periode = true;
      if (lecture?.fin) update.cloud_periode_fin = lecture.fin;
    }
  } else if (sens === "reprise") {
    update.cloud_arret_fin_periode = false;
  }
  return { update, motif };
}
