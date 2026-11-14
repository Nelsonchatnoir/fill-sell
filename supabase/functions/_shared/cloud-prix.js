// ═══════════════════════════════════════════════════════════════════════════
// LE PRIX DE FILLSELL CLOUD, LU À LA SOURCE DU CANAL — règles pures
// (07/11/2026 soir, essai bac à sable Apple de Nico, compte de test Nicotest)
// ═══════════════════════════════════════════════════════════════════════════
// Constat de Nico (07/11 19:11) : le mail de la veille citait l'ancien prix,
// écrit en dur, « prélevés sur la carte que tu as enregistrée », à un client
// Apple (email-tunnel v82 du 29/10, d'avant le 24,99 du 04/11). Règle :
// un mail ne cite JAMAIS un montant écrit en dur. Le prix vient de la SOURCE
// du canal qui facture, lue au moment du mail, sinon le mail ne cite AUCUN
// montant (une phrase sans montant vaut mieux qu'un faux montant).
//
// LA SOURCE, PAR CANAL — ce qui sera prélevé à la PROCHAINE échéance :
//   · Stripe : l'abonnement (cloud_ref = sub_…) relu par l'API, prix de ses
//     éléments (price.unit_amount × quantity, price.currency). Une remise
//     (discount / discounts) ou une période autre que « 1 mois » → muette :
//     le montant de la prochaine facture ne serait plus « X par mois ».
//   · Apple : App Store Server API, Get All Subscription Statuses
//     (/inApps/v1/subscriptions/{originalTransactionId} = cloud_ref), le
//     RENOUVELLEMENT signé (JWSRenewalInfoDecodedPayload.renewalPrice, en
//     millièmes, + currency). ⚠ Pas le prix de la TRANSACTION
//     (JWSTransactionDecodedPayload.price) : pendant l'essai, la transaction
//     est l'offre d'introduction GRATUITE (offerDiscountType FREE_TRIAL) et
//     son prix vaut 0 — abonnements-stores-audit l'écarte déjà pour le MRR.
//     Production d'abord, bac à sable sur un 404 (comme apple-subscription-status).
//     La réponse vient de l'API d'Apple, en HTTPS, appelée avec NOTRE jeton :
//     le JWS est lu sans revérifier la chaîne x5c (même lecture
//     qu'abonnements-stores-audit) ; une notification reçue, elle, se vérifie.
//   · Google : purchases.subscriptionsv2 (cloud_ref = purchaseToken),
//     lineItems[].autoRenewingPlan.recurringPrice (Money : units + nanos,
//     currencyCode). Un changement de prix en cours (priceChangeDetails) →
//     muette.
//   · Renouvellement coupé À LA SOURCE (Stripe cancel_at_period_end / cancel_at,
//     Apple autoRenewStatus 0 ou abonnement expiré / révoqué, Google
//     autoRenewEnabled false ou abonnement annulé / expiré) → renouvelle: false :
//     rien ne sera prélevé, le rappel « continue à … » ne part pas.
//
// ⛔ Aucun montant écrit dans ce fichier : il ne connaît que des formats et
//    des règles. Testé sans réseau : scripts/cloud-mails-canaux-selftest.mjs.
// Branché par _shared/cloud-prix-source.ts (Deno : clés, jetons, fetch).

import { PRODUIT_CLOUD_APPLE, PRODUIT_CLOUD_GOOGLE, estAbonnementCloud } from "./cloud-option.js";
// (11/11/2026, offres Cloud) Les formules avec Cloud : la même source (abonnement Stripe, renouvellement Apple, achat
// Google), plus le NOM de la formule lu à la source (`formule`) pour les mails ; l'essai du Cloud d'un abonné Stripe
// (schedule) → muette « essai_abonne » : le prix de la formule qui suivra n'est pas celui de l'abonnement d'aujourd'hui.
import { formuleDuProduit, estFormuleCloud, essaiCloudAbonneStripe, formuleDAbonnementStripe } from "./formules-serveur.js";
const formuleDuProduitCloud = (id) => { const f = formuleDuProduit(id); return f && estFormuleCloud(f.formule) ? f.formule : null; };

export const BUNDLE_APPLE = "app.fillsell.app";
export const PACKAGE_GOOGLE = "app.fillsell.app";
export const APPLE_API_PRODUCTION = "https://api.storekit.itunes.apple.com";
export const APPLE_API_BAC_A_SABLE = "https://api.storekit-sandbox.itunes.apple.com";
export const STRIPE_API = "https://api.stripe.com/v1";
export const GOOGLE_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
/** Un appel de lecture ne retient jamais le passage horaire plus de 5 s. */
export const DELAI_LECTURE_MS = 5000;

export const SOURCES = Object.freeze({
  stripe: "stripe:subscription.items.price",
  apple: "apple:renewalInfo.renewalPrice",
  google: "google:subscriptionsv2.recurringPrice",
});

// Devises sans décimale et à trois décimales chez Stripe (montants en plus petite unité).
const STRIPE_ZERO_DECIMALE = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const STRIPE_TROIS_DECIMALES = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

const DEVISE = /^[A-Z]{3}$/;
const entier = (v) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : null);

/** Un prix exploitable : montant > 0 fini, devise ISO 4217. Sinon null. */
export function prixValide(prix) {
  if (!prix || typeof prix !== "object") return null;
  const montant = Number(prix.montant);
  const devise = String(prix.devise ?? "").toUpperCase();
  if (!Number.isFinite(montant) || montant <= 0 || !DEVISE.test(devise)) return null;
  return { montant: Math.round(montant * 1000) / 1000, devise };
}

/**
 * Le prix écrit dans la langue du mail : « 24,99 € » (fr) / « €24.99 » (en),
 * par Intl (espace insécable du français compris). Prix illisible → null :
 * l'appelant écrit alors une phrase SANS montant.
 */
export function formatPrix(prix, lang = "fr") {
  const p = prixValide(prix);
  if (!p) return null;
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", { style: "currency", currency: p.devise }).format(p.montant);
  } catch {
    return null;
  }
}

const lecture = (canal, prix, renouvelle) => {
  const p = prixValide(prix);
  return { canal, prix: p, renouvelle, source: SOURCES[canal] ?? "aucune", raison: p ? null : "prix_illisible" };
};
/** La source n'a rien dit d'exploitable : aucun montant, renouvellement inconnu. */
export const muette = (canal, raison, extra = {}) => ({ canal: canal ?? null, prix: null, renouvelle: null, source: SOURCES[canal] ?? "aucune", raison, ...extra });

// ── Stripe ────────────────────────────────────────────────────────────────────
/**
 * L'abonnement Stripe relu → { prix, renouvelle, raison }. `prix` : la table des prix Stripe (prixStripe()), quand
 * l'appelant la connaît.
 * ⛔ (14/11/2026, bloc F) Avec la table, la formule se lit sur le PRIX (jamais une métadonnée restée d'avant) ; et un
 * abonnement qui ne porte PLUS le Cloud (ni Cloud seul, ni formule avec Cloud par son prix, ni essai d'abonné) ne
 * renouvelle aucun Cloud : renouvelle false, aucun montant — le mail de la veille ne part pas. Cas 13e274de : Pro + Cloud
 * passé à Business seul pendant l'essai, métadonnée « pro_cloud » restée → « Pro + Cloud continue à 59,99 € », faux.
 */
export function prixDepuisStripe(sub, prix = null) {
  if (!sub || typeof sub !== "object" || !sub.items) return muette("stripe", "abonnement_illisible");
  const ea = essaiCloudAbonneStripe(sub);
  // (13/11/2026, décision de Nico) L'essai d'un abonné arrêté depuis l'app (essai_cloud_sans_suite) : rien ne suit.
  if (ea) return { ...muette("stripe", "essai_abonne"), renouvelle: sub.cancel_at_period_end === true || ea.sansSuite === true ? false : true, formule: ea.formule, abonne: true };
  const table = prix && typeof prix === "object" && Object.keys(prix).length > 0 ? prix : null;
  if (table) {
    const formuleDuPrix = formuleDAbonnementStripe(sub, table);
    if (!estAbonnementCloud(sub, table) && !estFormuleCloud(formuleDuPrix)) return { ...muette("stripe", "abonnement_sans_cloud"), renouvelle: false };
    return estFormuleCloud(formuleDuPrix) ? { ...prixDepuisStripeBrut(sub), formule: formuleDuPrix } : prixDepuisStripeBrut(sub);
  }
  const formule = estFormuleCloud(sub?.metadata?.formule) ? sub.metadata.formule : null;
  return formule ? { ...prixDepuisStripeBrut(sub), formule } : prixDepuisStripeBrut(sub);
}
function prixDepuisStripeBrut(sub) {
  const statut = String(sub.status ?? "");
  if (["canceled", "incomplete_expired", "unpaid"].includes(statut) || sub.cancel_at_period_end === true || sub.cancel_at != null) {
    return { ...muette("stripe", "ne_renouvelle_pas"), renouvelle: false };
  }
  const remise = sub.discount != null || (Array.isArray(sub.discounts) && sub.discounts.length > 0);
  if (remise) return { ...muette("stripe", "remise"), renouvelle: true };
  const items = sub.items?.data ?? [];
  if (!Array.isArray(items) || items.length === 0) return { ...muette("stripe", "sans_element"), renouvelle: true };
  let total = 0;
  let devise = null;
  for (const it of items) {
    const p = it?.price ?? it?.plan ?? null;
    const unite = entier(p?.unit_amount ?? p?.amount);
    const quantite = it?.quantity == null ? 1 : entier(it.quantity);
    const cur = String(p?.currency ?? "").toUpperCase();
    const rec = p?.recurring ?? (p?.interval ? { interval: p.interval, interval_count: p.interval_count } : null);
    if (unite == null || unite < 0 || quantite == null || quantite < 1 || !DEVISE.test(cur)) return { ...muette("stripe", "prix_illisible"), renouvelle: true };
    if (rec?.interval !== "month" || Number(rec?.interval_count ?? 1) !== 1) return { ...muette("stripe", "periode_autre_que_mensuelle"), renouvelle: true };
    if (devise && devise !== cur) return { ...muette("stripe", "devises_melangees"), renouvelle: true };
    devise = cur;
    total += unite * quantite;
  }
  const div = STRIPE_ZERO_DECIMALE.has(devise) ? 1 : STRIPE_TROIS_DECIMALES.has(devise) ? 1000 : 100;
  return lecture("stripe", { montant: total / div, devise }, true);
}

// ── Apple ─────────────────────────────────────────────────────────────────────
/** Le JWS lu (sans revérifier : réponse HTTPS de l'API d'Apple à notre jeton). Illisible → null. */
export function charge(jws) {
  try {
    const b64 = String(jws).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "="));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

/**
 * Le renouvellement signé d'Apple (JWSRenewalInfoDecodedPayload) → { prix, renouvelle }.
 * statut : celui de lastTransactions (1 actif, 2 expiré, 3 relance de facturation, 4 délai de grâce, 5 révoqué).
 */
export function prixDepuisAppleRenouvellement(ri, statut = null) {
  if (!ri || typeof ri !== "object") return muette("apple", "renouvellement_illisible");
  const produit = ri.autoRenewProductId ?? ri.productId ?? null;
  const formule = formuleDuProduitCloud(produit);
  if (produit !== PRODUIT_CLOUD_APPLE && !formule) return muette("apple", "autre_produit");
  return formule ? { ...prixAppleBrut(ri, statut), formule } : prixAppleBrut(ri, statut);
}
function prixAppleBrut(ri, statut) {
  if (Number(statut) === 2 || Number(statut) === 5) return { ...muette("apple", "expire_ou_revoque"), renouvelle: false };
  if (Number(ri.autoRenewStatus) === 0) return { ...muette("apple", "ne_renouvelle_pas"), renouvelle: false };
  // Une offre promotionnelle, un code d'offre ou une offre de reconquête (2, 3, 4) s'applique à la prochaine
  // échéance : renewalPrice est alors le prix de l'offre, pas « X par mois ». (1 = l'introduction : l'essai
  // gratuit, qui est la période EN COURS ; l'échéance suivante est au prix plein.)
  if (ri.offerType != null && Number(ri.offerType) !== 1) return { ...muette("apple", "offre_au_renouvellement"), renouvelle: true };
  const milli = entier(ri.renewalPrice);
  const devise = String(ri.currency ?? "").toUpperCase();
  if (milli == null || milli <= 0 || !DEVISE.test(devise)) return { ...muette("apple", "prix_absent"), renouvelle: true };
  return lecture("apple", { montant: milli / 1000, devise }, true);
}

/** La réponse de Get All Subscription Statuses → la ligne de cet abonnement (originalTransactionId = ref). */
export function prixDepuisAppleStatuts(reponse, ref) {
  const lignes = (Array.isArray(reponse?.data) ? reponse.data : []).flatMap((g) => (Array.isArray(g?.lastTransactions) ? g.lastTransactions : []));
  const env = typeof reponse?.environment === "string" ? reponse.environment : null;
  const lues = lignes.map((l) => ({ l, ri: charge(l?.signedRenewalInfo) }));
  const sienne = lues.find(({ l }) => String(l?.originalTransactionId ?? "") === String(ref))
    ?? lues.find(({ ri }) => (ri?.autoRenewProductId ?? ri?.productId) === PRODUIT_CLOUD_APPLE || formuleDuProduitCloud(ri?.autoRenewProductId ?? ri?.productId))
    ?? null;
  if (!sienne) return muette("apple", "abonnement_absent_de_la_reponse", { environnement: env });
  return { ...prixDepuisAppleRenouvellement(sienne.ri, sienne.l?.status ?? null), environnement: env };
}

// ── Google ────────────────────────────────────────────────────────────────────
/** L'achat subscriptionsv2 → { prix, renouvelle }. */
export function prixDepuisGoogle(achat) {
  if (!achat || typeof achat !== "object") return muette("google", "achat_illisible");
  const etat = String(achat.subscriptionState ?? "");
  const ligne = (Array.isArray(achat.lineItems) ? achat.lineItems : []).find((l) => l?.productId === PRODUIT_CLOUD_GOOGLE || formuleDuProduitCloud(l?.productId)) ?? null;
  if (!ligne) return muette("google", "autre_produit");
  const formule = formuleDuProduitCloud(ligne.productId);
  return formule ? { ...prixGoogleBrut(etat, ligne), formule } : prixGoogleBrut(etat, ligne);
}
function prixGoogleBrut(etat, ligne) {
  const plan = ligne.autoRenewingPlan ?? null;
  if (["SUBSCRIPTION_STATE_CANCELED", "SUBSCRIPTION_STATE_EXPIRED"].includes(etat) || !plan || plan.autoRenewEnabled === false) {
    return { ...muette("google", "ne_renouvelle_pas"), renouvelle: false };
  }
  if (plan.priceChangeDetails != null) return { ...muette("google", "changement_de_prix"), renouvelle: true };
  const rp = plan.recurringPrice ?? null;
  const unites = entier(rp?.units ?? 0);
  const nanos = rp?.nanos == null ? 0 : entier(rp.nanos);
  const devise = String(rp?.currencyCode ?? "").toUpperCase();
  if (!rp || unites == null || nanos == null || !DEVISE.test(devise)) return { ...muette("google", "prix_absent"), renouvelle: true };
  return lecture("google", { montant: Math.round((unites + nanos / 1e9) * 1000) / 1000, devise }, true);
}

// ── La lecture, canal par canal (dépendances injectées : fetch, clé, jetons) ──
/**
 * Lit le prix de la prochaine échéance Cloud À LA SOURCE. Ne lève jamais :
 * tout échec rend une lecture muette (aucun montant).
 * @param {{ canal: string | null, ref: string | null, deps: {
 *   fetch: (url: string, init?: any) => Promise<any>, cleStripe?: string, prixStripe?: Record<string, string>,
 *   jetonApple?: () => Promise<string>, jetonGoogle?: () => Promise<string>, delaiMs?: number } }} p
 * @returns {Promise<{ canal: string | null, prix: { montant: number, devise: string } | null,
 *   renouvelle: boolean | null, source: string, raison: string | null, environnement?: string | null }>}
 */
export async function lirePrixCloud({ canal, ref, deps }) {
  const r = String(ref ?? "").trim();
  if (!["stripe", "apple", "google"].includes(String(canal))) return muette(canal, "canal_sans_source");
  if (!deps || typeof deps.fetch !== "function") return muette(canal, "lecture_indisponible");
  const delai = Number(deps.delaiMs) > 0 ? Number(deps.delaiMs) : DELAI_LECTURE_MS;
  // Le délai borne l'appel ET la lecture du corps : le signal coupe la requête, la course rend la main même si
  // l'appel l'ignore.
  const lire = async (url, init = {}) => {
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    let t = null;
    const delaiDepasse = new Promise((_, rejeter) => {
      t = setTimeout(() => { ac?.abort(); rejeter(new Error("abort: delai_depasse")); }, delai);
    });
    try {
      const res = await Promise.race([deps.fetch(url, { ...init, ...(ac ? { signal: ac.signal } : {}) }), delaiDepasse]);
      const corps = res?.ok ? await Promise.race([res.json(), delaiDepasse]) : null;
      return { ok: !!res?.ok, status: res?.status ?? null, corps };
    } finally {
      if (t) clearTimeout(t);
    }
  };
  // Un jeton (JWT Apple signé ici, jeton Google demandé à oauth2) est borné par le même délai.
  const jetonBorne = async (f) => {
    let t = null;
    try {
      return await Promise.race([f(), new Promise((_, rejeter) => { t = setTimeout(() => rejeter(new Error("abort: delai_depasse")), delai); })]);
    } finally {
      if (t) clearTimeout(t);
    }
  };
  try {
    if (canal === "stripe") {
      if (!/^sub_[A-Za-z0-9]+$/.test(r)) return muette(canal, "reference_illisible");
      if (!deps.cleStripe) return muette(canal, "cle_absente");
      // (14/11/2026, bloc F) Le moyen de paiement par défaut avec : le mail de la veille le nomme (jamais « la carte » pour Klarna).
      const res = await lire(`${STRIPE_API}/subscriptions/${r}?expand[]=default_payment_method`, { headers: { Authorization: `Bearer ${deps.cleStripe}` } });
      if (!res.ok) return muette(canal, `stripe_http_${res.status ?? "?"}`);
      // (12/11, point 4a) L'environnement de l'abonnement relu : un abonnement du mode test n'a jamais de mail client.
      const pm = res.corps?.default_payment_method;
      const moyen = pm && typeof pm === "object" && typeof pm.type === "string" ? pm.type : null;
      return { ...prixDepuisStripe(res.corps, deps.prixStripe ?? null), moyen, environnement: res.corps?.livemode === false ? "test" : "production" };
    }
    if (canal === "apple") {
      if (!/^\d+$/.test(r)) return muette(canal, "reference_illisible");
      if (typeof deps.jetonApple !== "function") return muette(canal, "jeton_absent");
      const jwt = await jetonBorne(deps.jetonApple);
      const entete = { headers: { Authorization: `Bearer ${jwt}` } };
      let res = await lire(`${APPLE_API_PRODUCTION}/inApps/v1/subscriptions/${r}`, entete);
      // 404 en production = transaction du bac à sable (comptes de test).
      if (res.status === 404) res = await lire(`${APPLE_API_BAC_A_SABLE}/inApps/v1/subscriptions/${r}`, entete);
      if (!res.ok) return muette(canal, `apple_http_${res.status ?? "?"}`);
      return prixDepuisAppleStatuts(res.corps, r);
    }
    // google
    if (!r || /[\s/]/.test(r)) return muette(canal, "reference_illisible");
    if (typeof deps.jetonGoogle !== "function") return muette(canal, "jeton_absent");
    const jeton = await jetonBorne(deps.jetonGoogle);
    const res = await lire(`${GOOGLE_API}/applications/${PACKAGE_GOOGLE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(r)}`,
      { headers: { Authorization: `Bearer ${jeton}` } });
    if (!res.ok) return muette(canal, `google_http_${res.status ?? "?"}`);
    // (12/11, point 4a) L'achat d'un testeur de licence porte testPurchase : jamais de mail client.
    return { ...prixDepuisGoogle(res.corps), environnement: res.corps?.testPurchase != null ? "test" : "production" };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return muette(canal, /abort/i.test(m) ? "delai_depasse" : `erreur:${m.slice(0, 80)}`);
  }
}
