// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « FILLSELL CLOUD » VUE PAR LES PAIEMENTS — règles pures (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Importé par stripe-webhook, create-checkout-session, cancel-subscription,
// apple-iap-webhook, google-play-webhook, validate-apple-receipt,
// validate-google-purchase — et par le selftest `scripts/option-cloud-selftest.mjs`
// (node, sans réseau). Aucune dépendance, aucun appel réseau : tout ce qui
// décide se teste ici.
//
// LES DÉCISIONS DE NICO (04/10, finales) :
//  · Cloud est une OPTION à 20 €/mois, prise EN PLUS d'un palier payant
//    (Premium 12,99 / Pro 29,99 / Business 59,99). JAMAIS vendue seule.
//  · Parcours : palier + Cloud, carte obligatoire, ESSAI DE 3 JOURS à 0 € —
//    Cloud exécute avec les QUOTAS DU GRATUIT (les drapeaux de palier restent
//    à false pendant l'essai, c'est ce qui bride) ; au jour 3, débit du palier
//    ET de l'option, quotas complets. Sauf résiliation avant.
//  · Un seul essai par compte (la garde serveur ; les stores en posent une
//    autre par identifiant Apple / compte Google).
//  · Si le palier prend fin, Cloud cesse d'exécuter : chez Stripe l'option
//    vit DANS l'abonnement du palier (un article de plus), elle tombe avec lui ;
//    chez Apple et Google on ne peut pas résilier à la place de la personne :
//    l'état devient « suspendu » et l'app prévient.
//
// LES TROIS CANAUX :
//  · Stripe : UN abonnement, deux articles (prix du palier + prix Cloud). L'essai
//    est celui de l'abonnement (`trial_period_days`), donc des deux articles à la
//    fois — exactement « palier gratuit seulement quand Cloud est pris ».
//    Un abonné déjà payant ajoute l'option comme article (payé tout de suite,
//    au prorata), sans essai.
//  · Apple : produit `app.fillsell.cloud.sub` (groupe « FillSell Cloud »,
//    offre d'introduction gratuite 3 jours) pour un abonné d'un palier existant ;
//    pour « palier + Cloud » en un achat, des produits combinés dans ce même
//    groupe sont PROPOSÉS (non créés) : voir PRODUITS_PALIER_CLOUD_APPLE.
//  · Google : produit `app.fillsell.cloud.sub`, forfait `cloud-monthly`, offre
//    `cloud-trial-3d` ; pour les paliers, des offres « éligibilité décidée par le
//    développeur » suffixées `-cloud-trial-3d` sont PROPOSÉES (non créées).
//
// ⛔ Ce module ne lit ni n'écrit la base : il rend des décisions que l'appelant
//    applique. Les colonnes visées (migration 20261004233000) : is_cloud,
//    cloud_essai_debut, cloud_essai_fin, cloud_canal, cloud_ref,
//    cloud_fin_periode, cloud_annule_fin_periode.

export const ESSAI_CLOUD_JOURS = 3;
export const JOUR_MS = 86_400_000;

// ── Identifiants des stores ───────────────────────────────────────────────────
export const PRODUIT_CLOUD_APPLE = "app.fillsell.cloud.sub";   // créé le 04/10, Apple ID 6819067675
export const PRODUIT_CLOUD_GOOGLE = "app.fillsell.cloud.sub";  // créé le 04/10
export const FORFAIT_CLOUD_GOOGLE = "cloud-monthly";
export const OFFRE_ESSAI_CLOUD_GOOGLE = "cloud-trial-3d";
// Offres « palier + Cloud » côté Google (PROPOSÉES, non créées) : une par
// forfait de palier, éligibilité décidée par le développeur, essai 3 jours.
export const SUFFIXE_OFFRE_PALIER_AVEC_CLOUD = "-cloud-trial-3d";
// Produits combinés côté Apple (PROPOSÉS, non créés) : dans le groupe
// « FillSell Cloud », avec l'offre d'introduction gratuite 3 jours.
export const PRODUITS_PALIER_CLOUD_APPLE = Object.freeze({
  "app.fillsell.premium_cloud.sub": "premium",
  "app.fillsell.pro_cloud.sub": "pro",
  "app.fillsell.business_cloud.sub": "business",
});

export const CANAUX = Object.freeze(["stripe", "apple", "google", "offert"]);

// ── Outils ────────────────────────────────────────────────────────────────────
const instant = (v) => {
  if (v == null || v === "") return null;
  const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const iso = (t) => (t == null ? null : new Date(t).toISOString());
const secondesIso = (s) => (typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString() : null);

/** Un palier payant est posé sur cette ligne `profiles` ? (même expression que partout : is_premium OR is_pro OR is_comped, Business compris) */
export function palierPayant(p) {
  return p?.is_business === true || p?.is_pro === true || p?.is_premium === true || p?.is_comped === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'ÉTAT CLOUD D'UN COMPTE — ce que le serveur rend, ce que l'app affiche
// ═══════════════════════════════════════════════════════════════════════════
//   etat   : 'aucun' | 'essai' | 'paye' | 'essai_termine' | 'suspendu'
//   actif  : un navigateur Cloud doit-il tourner pour ce compte ?
//   quotas : 'gratuit' pendant l'essai (bridage), sinon le palier.
// L'essai PRIME : il a été ouvert carte en main, palier + Cloud ; le palier n'est
// pas encore facturé, donc ses drapeaux sont à false — ce n'est PAS une
// suspension. (Écart assumé avec cloudDuProfil de la branche conception, qui
// suspendait l'essai sans palier : à réaligner le même jour.)
export function etatCloud(p, maintenant = Date.now()) {
  const now = instant(maintenant) ?? Date.now();
  const debut = instant(p?.cloud_essai_debut);
  const fin = instant(p?.cloud_essai_fin);
  const essaiPris = debut != null;
  const essaiEnCours = debut != null && fin != null && debut <= now && now < fin;
  const paye = p?.is_cloud === true;
  const palier = palierPayant(p);
  const base = { essaiPris, essaiFin: iso(fin), joursRestants: null };
  if (essaiEnCours) {
    return { ...base, etat: "essai", actif: true, quotas: "gratuit", joursRestants: Math.max(1, Math.ceil((fin - now) / JOUR_MS)) };
  }
  if (paye && palier) return { ...base, etat: "paye", actif: true, quotas: "palier" };
  if (paye && !palier) return { ...base, etat: "suspendu", actif: false, quotas: "gratuit" };
  if (essaiPris && fin != null && now >= fin) return { ...base, etat: "essai_termine", actif: false, quotas: "gratuit" };
  return { ...base, etat: "aucun", actif: false, quotas: palier ? "palier" : "gratuit" };
}

/** L'essai « palier + Cloud » peut-il être OUVERT à ce compte ? Un seul par compte, quel que soit le canal. */
export function essaiCloudPermis(p, abonnementsStripe = [], prix = {}) {
  if (p?.cloud_essai_debut != null) return false;
  if (p?.is_cloud === true) return false;
  // Filet : un abonnement Stripe (même résilié) qui a déjà porté l'essai Cloud.
  return !(abonnementsStripe ?? []).some((s) => {
    if (s?.metadata?.essai_cloud === "1") return true;
    const lu = litAbonnementStripe(s, prix);
    return lu.cloud && s?.trial_start != null;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. STRIPE — un abonnement, deux articles
// ═══════════════════════════════════════════════════════════════════════════
const RANG = Object.freeze({ standard: 1, premium: 1, pro: 2, business: 3 });

function prixDeLArticle(it) {
  return it?.price?.id ?? (typeof it?.price === "string" ? it.price : null) ?? it?.plan?.id ?? null;
}

/** L'article du PALIER d'un abonnement (jamais celui de l'option). */
export function itemPalier(sub, prix = {}) {
  const ids = [prix.business, prix.pro, prix.standard].filter(Boolean);
  const items = sub?.items?.data ?? [];
  return items.find((it) => ids.includes(prixDeLArticle(it)))
    ?? items.find((it) => prixDeLArticle(it) !== prix.cloud && it?.metadata?.option !== "cloud")
    ?? null;
}

/** L'article de l'OPTION Cloud d'un abonnement, s'il y est. */
export function itemCloud(sub, prix = {}) {
  const items = sub?.items?.data ?? [];
  return items.find((it) => (prix.cloud && prixDeLArticle(it) === prix.cloud) || it?.metadata?.option === "cloud") ?? null;
}

/**
 * Lecture d'un abonnement Stripe : palier porté (métadonnée d'abord, prix en
 * repli — même ordre que rangAbonnement), option Cloud, essai en cours.
 */
export function litAbonnementStripe(sub, prix = {}) {
  const status = sub?.status ?? null;
  const vivant = status === "active" || status === "past_due" || status === "trialing";
  const ids = (sub?.items?.data ?? []).map(prixDeLArticle);
  let palier = null;
  const meta = sub?.metadata?.plan_type;
  if (meta === "business" || meta === "pro" || meta === "standard") palier = meta;
  else if (meta === "premium" || meta === "founder") palier = "standard";
  if (prix.business && ids.includes(prix.business)) palier = "business";
  else if (prix.pro && ids.includes(prix.pro)) palier = "pro";
  else if (prix.standard && ids.includes(prix.standard)) palier = palier ?? "standard";
  const cloud = !!itemCloud(sub, prix);
  const essai = status === "trialing";
  return {
    id: sub?.id ?? null,
    status,
    vivant,
    palier,
    rang: palier ? RANG[palier] : 0,
    cloud,
    essai,
    trial_start: secondesIso(sub?.trial_start),
    trial_end: secondesIso(sub?.trial_end),
    cancel_at_period_end: sub?.cancel_at_period_end === true,
    current_period_end: secondesIso(sub?.current_period_end),
  };
}

/**
 * Les drapeaux d'un client Stripe depuis TOUS ses abonnements (remplace le
 * calcul de recomputeStripeFlags, qu'il étend à l'option) :
 *  · palier : un abonnement vivant qui porte un palier — SAUF l'essai « palier +
 *    Cloud » (trialing + article Cloud) : quotas du gratuit, drapeaux à false ;
 *    un trialing SANS Cloud (historique, aucun aujourd'hui) compte comme avant ;
 *  · is_cloud : un abonnement actif/past_due qui porte l'option ET un palier ;
 *  · essai : l'abonnement trialing qui porte l'option donne cloud_essai_debut/fin
 *    (trial_start / trial_end) — jamais effacés ici (un seul essai par compte) ;
 *  · a_resilier : les abonnements vivants qui portent l'option SANS palier
 *    (« Cloud jamais seul » : jamais produit par nos chemins, édition manuelle
 *    du dashboard) — l'appelant les résilie.
 */
export function drapeauxDepuisStripe(subs, prix = {}) {
  const lus = (subs ?? []).map((s) => litAbonnementStripe(s, prix));
  const vivants = lus.filter((l) => l.vivant);
  const essaiCloud = vivants.filter((l) => l.essai && l.cloud);
  const palierVivant = vivants.filter((l) => l.palier && !(l.essai && l.cloud));
  const cloudPaye = vivants.filter((l) => l.cloud && l.palier && !l.essai);
  const sansPalier = vivants.filter((l) => l.cloud && !l.palier);
  const hasBusiness = palierVivant.some((l) => l.palier === "business");
  const hasPro = palierVivant.some((l) => l.palier === "pro");
  const porteur = cloudPaye[0] ?? essaiCloud[0] ?? null;
  const essai = essaiCloud[0] ?? null;
  const out = {
    is_premium: palierVivant.length > 0,
    is_pro: hasPro || hasBusiness,
    is_business: hasBusiness,
    is_cloud: cloudPaye.length > 0,
    subscription_cancel_at_period_end: vivants.length > 0 && vivants.every((l) => l.cancel_at_period_end),
    cloud_annule_fin_periode: porteur ? porteur.cancel_at_period_end : false,
    cloud_ref: porteur?.id ?? null,
    cloud_fin_periode: porteur ? (porteur.essai ? porteur.trial_end : porteur.current_period_end) : null,
    cloud_essai_debut: essai?.trial_start ?? null,
    cloud_essai_fin: essai?.trial_end ?? null,
    essai_en_cours: !!essai,
    a_resilier: sansPalier.map((l) => l.id).filter(Boolean),
  };
  return out;
}

/**
 * Ce qu'on ÉCRIT dans profiles depuis les drapeaux Stripe, en respectant le
 * canal : les colonnes Cloud ne bougent que si l'option est portée par Stripe
 * (ou par personne). Un Cloud pris dans l'App Store avec un palier Stripe n'est
 * jamais effacé par un événement Stripe.
 */
export function miseAJourProfilDepuisStripe(d, canalActuel) {
  /** @type {Record<string, any>} */
  const update = {
    is_premium: d.is_premium,
    is_pro: d.is_pro,
    is_business: d.is_business,
    subscription_cancel_at_period_end: d.subscription_cancel_at_period_end,
  };
  const stripePorte = d.is_cloud || d.essai_en_cours;
  if (stripePorte) {
    update.is_cloud = d.is_cloud;
    update.cloud_canal = "stripe";
    update.cloud_ref = d.cloud_ref;
    update.cloud_fin_periode = d.cloud_fin_periode;
    update.cloud_annule_fin_periode = d.cloud_annule_fin_periode;
    if (d.cloud_essai_debut) { update.cloud_essai_debut = d.cloud_essai_debut; update.cloud_essai_fin = d.cloud_essai_fin; }
  } else if (canalActuel == null || canalActuel === "stripe") {
    // Plus rien chez Stripe : l'option tombe (le palier est tombé, ou l'article
    // a été retiré). L'essai pris reste écrit : un seul par compte.
    update.is_cloud = false;
    update.cloud_fin_periode = null;
    update.cloud_annule_fin_periode = false;
  }
  return update;
}

/** Les paramètres d'une session Checkout « palier + Cloud » (carte obligatoire, essai 3 jours si permis). */
export function parametresCheckoutAvecCloud({ prixPalier, prixCloud, essai }) {
  const subscription_data = {
    metadata: { avec_cloud: "1", essai_cloud: essai ? "1" : "0" },
    ...(essai ? {
      trial_period_days: ESSAI_CLOUD_JOURS,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    } : {}),
  };
  return {
    line_items: [{ price: prixPalier, quantity: 1 }, { price: prixCloud, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data,
    metadata: { avec_cloud: "1", essai_cloud: essai ? "1" : "0" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. APPLE — signedTransactionInfo (JWS vérifié par l'appelant)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Un produit du groupe « FillSell Cloud » ? Rend { produit, cloud, palier,
 * essai, debut, fin, original } ou null. L'essai = offre d'introduction
 * (offerType 1) : la première transaction, gratuite 3 jours ; la conversion
 * arrive en DID_RENEW sans offerType.
 */
export function lectureCloudApple(tx) {
  const produit = tx?.productId;
  if (!produit) return null;
  const palier = PRODUITS_PALIER_CLOUD_APPLE[produit] ?? null;
  if (produit !== PRODUIT_CLOUD_APPLE && !palier) return null;
  const essai = Number(tx?.offerType) === 1 && (tx?.offerDiscountType == null || tx?.offerDiscountType === "FREE_TRIAL");
  return {
    produit,
    cloud: true,
    palier,
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
 * Rend { cloud, palier, essai, debut, fin, offre } ou null si le produit ne
 * concerne pas l'option. `palierDuProduit(subscriptionId)` est fourni par
 * l'appelant pour les offres « palier + Cloud » (produits de palier existants).
 * L'essai : l'offre d'essai portée par la ligne ET un ACHAT (type 4) — un
 * RENEWED (2) après l'essai est payé même si offerId reste sur la ligne. Sans
 * type (validation côté app), la durée fait foi : au plus 4 jours.
 */
/**
 * @param {string} subscriptionId
 * @param {any} purchase
 * @param {number | null} [notificationType]
 * @param {(id: string) => (string | null)} [palierDuProduit]
 */
export function lectureCloudGoogle(subscriptionId, purchase, notificationType = null, palierDuProduit = (_id) => null) {
  const ligne = (purchase?.lineItems ?? [])[0] ?? {};
  const offre = ligne?.offerDetails?.offerId ?? null;
  const estCloud = subscriptionId === PRODUIT_CLOUD_GOOGLE;
  const palier = estCloud ? null : palierDuProduit(subscriptionId);
  const offrePalierAvecCloud = !!offre && !estCloud && offre.endsWith(SUFFIXE_OFFRE_PALIER_AVEC_CLOUD);
  if (!estCloud && !offrePalierAvecCloud) return null;
  const debut = iso(instant(purchase?.startTime));
  const fin = iso(instant(ligne?.expiryTime));
  const offreEssai = estCloud ? offre === OFFRE_ESSAI_CLOUD_GOOGLE : offrePalierAvecCloud;
  let essai = false;
  if (offreEssai) {
    if (notificationType != null) essai = Number(notificationType) === GOOGLE_PURCHASED;
    else {
      const d = instant(debut); const f = instant(fin);
      essai = d != null && f != null && f - d <= 4 * JOUR_MS;
    }
  }
  return { cloud: estCloud, palier: palier ?? (offrePalierAvecCloud ? palierDuProduit(subscriptionId) : null), essai, debut, fin, offre };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CE QU'ON ÉCRIT pour un événement de store (Apple comme Google)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * `lecture` vient de lectureCloudApple / lectureCloudGoogle ; `sens` : 'on' |
 * 'off' | 'annulation' | 'reprise' ; `ref` : originalTransactionId ou
 * purchaseToken ; `profil` : la ligne actuelle (garde du canal et de la
 * référence). Rend { update, grantPalier } — update = null quand l'événement
 * ne doit RIEN écrire (référence périmée d'un autre canal).
 */
export function ecritureCloudStore({ canal, lecture, sens, ref, profil }) {
  const sien = profil?.cloud_canal == null || profil?.cloud_canal === canal;
  const memeRef = profil?.cloud_ref == null || ref == null || profil?.cloud_ref === ref;
  if (sens === "off" || sens === "annulation" || sens === "reprise") {
    // Un événement négatif ne vaut que pour l'option portée par CE canal et CETTE
    // référence (miroir de la garde « token remplacé » des paliers).
    if (!sien || !memeRef) return { update: null, grantPalier: null, motif: "reference_autre_canal_ou_remplacee" };
  }
  /** @type {Record<string, any>} */
  const update = {};
  let grantPalier = null;
  if (sens === "on") {
    update.cloud_canal = canal;
    update.cloud_ref = ref ?? null;
    update.cloud_fin_periode = lecture.fin ?? null;
    update.cloud_annule_fin_periode = false;
    if (lecture.essai) {
      update.is_cloud = false;
      update.cloud_essai_debut = lecture.debut;
      update.cloud_essai_fin = lecture.fin;
      // Produit combiné en essai : le palier n'est PAS facturé → quotas du gratuit, aucun drapeau de palier.
    } else {
      update.is_cloud = true;
      if (lecture.palier) {
        update.is_premium = true;
        update.is_pro = lecture.palier === "pro" || lecture.palier === "business";
        update.is_business = lecture.palier === "business";
        grantPalier = lecture.palier;
      }
    }
  } else if (sens === "off") {
    update.is_cloud = false;
    update.cloud_fin_periode = lecture?.fin ?? null;
    if (lecture?.palier) { update.is_premium = false; update.is_pro = false; update.is_business = false; }
  } else if (sens === "annulation") {
    update.cloud_annule_fin_periode = true;
    if (lecture?.fin) update.cloud_fin_periode = lecture.fin;
  } else if (sens === "reprise") {
    update.cloud_annule_fin_periode = false;
  }
  return { update, grantPalier, motif: null };
}

/** Le texte de l'avertissement quand le palier a pris fin et que l'option court encore (Apple / Google). */
export function avertissementCloudSuspendu(canal, lang = "fr") {
  const ou = canal === "apple" ? (lang === "en" ? "the App Store" : "l'App Store")
    : canal === "google" ? "Google Play" : (lang === "en" ? "your subscription" : "ton abonnement");
  if (lang === "en") {
    return `Your Cloud option is paused: it only runs with a Premium, Pro or Business plan. Take a plan again to resume it, or cancel the option in ${ou} so you are not charged next month.`;
  }
  return `Ton option Cloud est en pause : elle ne tourne qu'avec un palier Premium, Pro ou Business. Reprends un palier pour la relancer, ou résilie l'option dans ${ou} pour ne pas être débité le mois prochain.`;
}
