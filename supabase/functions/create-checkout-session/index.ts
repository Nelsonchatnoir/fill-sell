import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { choisirClientExistant, trierSessionsOuvertes, abonnementRemplacable, causeEchec } from "../_shared/paiement-stripe.js";
import { estAbonnementCloud, essaiCloudPermis, parametresCheckoutCloud, sessionEstCloud, ESSAI_CLOUD_JOURS } from "../_shared/cloud-option.js";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

// Packs de pièces — le PRIX vient du price ID Stripe (secret), la QUANTITÉ
// créditée est celle-ci : elle part en metadata.coins et c'est stripe-webhook
// qui l'applique via credit_purchased_coins. Doit rester alignée avec
// src/components/coinPacks.js et validate-coin-purchase.
//
// ⚠️ 2026-07-14 : coins_1150 crédite désormais 1300 Pépites (prix Stripe
// INCHANGÉ, 49,99 € — aucun price ID à recréer). La clé garde « 1150 » car elle
// correspond au SKU des stores, déjà enregistré.
const COIN_PACKS: Record<string, { envKey: string; coins: number }> = {
  coins_100:  { envKey: "STRIPE_PRICE_COINS_100",  coins: 100 },
  coins_220:  { envKey: "STRIPE_PRICE_COINS_220",  coins: 220 },
  coins_460:  { envKey: "STRIPE_PRICE_COINS_460",  coins: 460 },
  coins_1150: { envKey: "STRIPE_PRICE_COINS_1150", coins: 1300 },
};

// ── Abonnements : UN SEUL mapping (2026-08-09) ───────────────────────────────
// Remplace les ternaires `isProPlan ? … : …` qui codaient « il n'existe que
// deux plans » à quatre endroits du fichier. Même patron que COIN_PACKS.
//
//   envKey    : secret Supabase portant le price ID Stripe du palier.
//   planType  : valeur écrite dans metadata.plan_type — c'est LE signal lu par
//               stripe-webhook (recomputeStripeFlags + checkout.session
//               .completed). Historique : le Premium standard s'appelle
//               "standard" côté Stripe et "premium" côté grants, d'où grantTier.
//   grantTier : palier passé à upgrade_monthly_grant, qui n'accepte que
//               'free'|'premium'|'pro'|'business' (migration 20260808214000).
//   rang      : ÉCHELLE. C'est elle qui rend l'upgrade in situ correct pour
//               plus de deux paliers — cf. le bloc d'upgrade plus bas.
const SUB_PLANS: Record<string, { envKey: string; planType: string; grantTier: string; rang: number }> = {
  standard: { envKey: "STRIPE_PRICE_STANDARD", planType: "standard", grantTier: "premium",  rang: 1 },
  pro:      { envKey: "STRIPE_PRICE_PRO",      planType: "pro",      grantTier: "pro",      rang: 2 },
  business: { envKey: "STRIPE_PRICE_BUSINESS", planType: "business", grantTier: "business", rang: 3 },
};

// Rang d'un abonnement Stripe VIVANT, lu dans l'ordre décroissant des paliers :
// metadata.plan_type d'abord (posé par nous), price ID en second (les
// abonnements antérieurs à la pose de metadata, et les éditions manuelles du
// dashboard). 0 = abonnement d'un palier non reconnu (Founder legacy compris,
// qui vaut Premium : rang 1 par son price ? non — il n'a pas de price connu ici,
// il ressort donc à 0 et sera traité comme « à faire monter », ce qui est le
// comportement voulu : un Founder 9,99 qui achète Pro doit basculer en place).
function rangAbonnement(s: Stripe.Subscription): number {
  // (04/10) Un abonnement Cloud n'est pas un palier : hors de l'échelle.
  if (estAbonnementCloud(s, prixConnus())) return -1;
  const parMeta = Object.values(SUB_PLANS).find((p) => p.planType === s.metadata?.plan_type);
  if (parMeta) return parMeta.rang;
  for (const plan of Object.values(SUB_PLANS)) {
    const priceId = Deno.env.get(plan.envKey);
    if (priceId && s.items?.data?.some((it: Stripe.SubscriptionItem) => it.price?.id === priceId)) {
      return plan.rang;
    }
  }
  return 0;
}

// ── L'OPTION « FILLSELL CLOUD » (04/10/2026) ─────────────────────────────────
// `product: "cloud"` → un abonnement Stripe À PART (secret STRIPE_PRICE_CLOUD,
// 20 €/mois), ouvert à TOUS les comptes, Free compris ; carte obligatoire ;
// essai 7 jours si ce compte n'en a jamais pris (garde serveur
// essaiCloudPermis). Il ne touche jamais l'abonnement du palier, et les
// chemins de palier ci-dessous ne touchent jamais un abonnement Cloud
// (metadata.option = "cloud" : hors du rang, hors des montées, hors des
// sessions et abonnements « en attente » remplacés).
function prixConnus() {
  return {
    standard: Deno.env.get("STRIPE_PRICE_STANDARD") ?? "",
    pro: Deno.env.get("STRIPE_PRICE_PRO") ?? "",
    business: Deno.env.get("STRIPE_PRICE_BUSINESS") ?? "",
    cloud: Deno.env.get("STRIPE_PRICE_CLOUD") ?? "",
  };
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Self-heal des customer IDs invalides (2026-07-24) ────────────────────────
// Un stripe_customer_id de MODE TEST (écrit en base pendant la phase de dev)
// ou supprimé fait échouer stripe.checkout.sessions.create avec la clé live
// (« No such customer … a similar object exists in test mode ») AVANT même
// l'ouverture du Checkout — vécu sur les packs de Pépites. On valide donc
// l'ID stocké ; s'il n'existe pas en live, on le purge du profil et on
// retourne null → le checkout repart en customer_email, et stripe-webhook
// (checkout.session.completed) re-remplira le champ avec le customer LIVE.
async function validCustomerIdOrNull(customerId: string | null, userId: string): Promise<string | null> {
  if (!customerId) return null;
  try {
    const c = await stripe.customers.retrieve(customerId);
    if ((c as { deleted?: boolean }).deleted) throw new Error("customer deleted");
    return customerId;
  } catch (err) {
    console.warn(`[checkout] stripe_customer_id ${customerId} invalide en live (${err.message}) — purgé du profil ${userId}`);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: null })
      .eq("id", userId);
    if (error) console.error("[checkout] purge stripe_customer_id failed:", error.message);
    return null;
  }
}

// ── Garde-fou price archivé (2026-07-26) ─────────────────────────────────────
// « The price specified is inactive » : éditer un tarif dans le dashboard
// Stripe CRÉE un nouveau price et ARCHIVE l'ancien — le secret STRIPE_PRICE_*
// devient silencieusement invalide et le Checkout casse pour tout le monde
// (vécu le 26/07 : STRIPE_PRICE_STANDARD datait du 14/05, son price avait été
// remplacé lors d'une édition de tarif ; un utilisateur a cliqué 7× sans
// pouvoir payer). On vérifie donc le price AVANT d'ouvrir la session : erreur
// propre `payment_unavailable` pour le front + log qui nomme le secret à
// reposer, au lieu de l'erreur Stripe brute en anglais.
async function activePriceOrNull(priceId: string | undefined, secretName: string): Promise<string | null> {
  if (!priceId) {
    console.error(`[checkout] ${secretName} absent des secrets`);
    return null;
  }
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!(price as Stripe.Price).active) {
      console.error(`[checkout] ${secretName}=${priceId} est ARCHIVÉ chez Stripe — reposer le price actif : npx supabase secrets set ${secretName}=price_…`);
      return null;
    }
    return priceId;
  } catch (err) {
    console.error(`[checkout] ${secretName}=${priceId} introuvable chez Stripe (${err.message})`);
    return null;
  }
}

// ── Une montée de palier DÉJÀ en attente de paiement (2026-09-24) ─────────────
// Double clic, retour arrière depuis la page Stripe : si l'abonnement porte une
// mise à jour en attente dont la facture ouverte vise CE palier, on renvoie sa
// page — jamais une seconde facture. Autre palier, ou rien d'ouvert : null.
async function pageDeLaMonteeEnAttente(sub: Stripe.Subscription, planType: string): Promise<string | null> {
  if (!sub.pending_update || !sub.latest_invoice) return null;
  try {
    const id = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice.id;
    const facture = await stripe.invoices.retrieve(id);
    if (facture.status !== "open") return null;
    if (String(facture.metadata?.fillsell_upgrade_vers ?? "") !== planType) return null;
    return facture.hosted_invoice_url ?? null;
  } catch (e) {
    console.warn(`[checkout] montée en attente illisible sur ${sub.id} : ${(e as Error)?.message ?? e}`);
    return null;
  }
}

// ── UN SEUL CLIENT STRIPE PAR COMPTE FILLSELL (01/10/2026) ────────────────────
// Avant : sans stripe_customer_id au profil (il n'est écrit qu'au premier
// paiement RÉUSSI, par le webhook), chaque clic ouvrait un Checkout en
// customer_email — donc un NOUVEAU client Stripe à chaque essai. 6 adresses en
// double relevées le 01/10 ; chez 9cdr9rm4rn et nicolas.menar, la même carte
// réapparue sur un 2e client deux minutes après un refus a été bloquée par
// Radar (« highest »). Désormais : l'identifiant du profil s'il est valide,
// sinon le client existant de l'adresse, sinon UN client créé une fois (clé
// d'idempotence par compte et par adresse : un double clic ne fait pas deux
// clients).
// ⚠️ On n'écrit PAS ce client dans profiles avant un paiement réussi : un
//    profil porteur d'un stripe_customer_id passe par recomputeStripeFlags
//    (stripe-webhook) à chaque événement d'abonnement — l'expiration d'un
//    essai raté y remettrait is_premium à false, y compris chez quelqu'un
//    qui a payé ensuite par Apple (9cdr9rm4rn : Premium Apple à 14:05).
//    Le webhook continue d'écrire l'identifiant au premier paiement réussi.
async function resoudreClient(stocke: string | null, userId: string, email: string | null): Promise<string> {
  const valide = await validCustomerIdOrNull(stocke, userId);
  if (valide) return valide;
  if (email) {
    const { data } = await stripe.customers.list({ email, limit: 10 });
    const existant = choisirClientExistant(data, userId);
    if (existant) return existant;
  }
  const cree = await stripe.customers.create(
    { ...(email ? { email } : {}), metadata: { fillsell_user_id: userId } },
    { idempotencyKey: `fillsell-client-${userId}-${email ?? ""}`.slice(0, 255) },
  );
  console.log(`[checkout] client Stripe créé pour ${userId} : ${cree.id}`);
  return cree.id;
}

// ── UNE SESSION OUVERTE SE ROUVRE, LES AUTRES SONT REMPLACÉES (01/10/2026) ────
// Revenir dans l'app et recliquer rouvre la MÊME page de paiement (même
// abonnement en attente, aucun doublon). Une demande différente (autre palier,
// ou « payer par carte » après un refus) expire les sessions ouvertes du client
// et annule leurs abonnements « incomplete » — jamais un autre statut
// (abonnementRemplacable : rien d'actif, rien en cours de paiement).
// (04/10) `concerne` : ne remplacer que les abonnements de la même nature
// (Cloud ou palier) — ouvrir Cloud n'annule jamais un palier en attente.
async function remplacerSessions(sessions: Stripe.Checkout.Session[], customerId: string, concerne: (s: Stripe.Subscription) => boolean = () => true): Promise<void> {
  for (const s of sessions) {
    try { await stripe.checkout.sessions.expire(s.id); }
    catch (e) { console.warn(`[checkout] session ${s.id} non expirée : ${(e as Error)?.message ?? e}`); }
  }
  try {
    const { data: enAttente } = await stripe.subscriptions.list({
      customer: customerId, status: "incomplete", limit: 10, expand: ["data.latest_invoice.payment_intent"],
    });
    for (const sub of enAttente ?? []) {
      if (!abonnementRemplacable(sub) || !concerne(sub)) continue;
      await stripe.subscriptions.cancel(sub.id);
      console.log(`[checkout] abonnement en attente ${sub.id} (${customerId}) annulé : remplacé par une nouvelle tentative`);
    }
  } catch (e) {
    console.warn(`[checkout] abonnements en attente de ${customerId} non relus : ${(e as Error)?.message ?? e}`);
  }
}

// ── LE RETOUR DE LA PAGE DE PAIEMENT DIT CE QUI S'EST PASSÉ (01/10/2026) ──────
// /cancel?session_id=… appelle ce diagnostic : la cause de la DERNIÈRE
// tentative (banque qui demande une validation, Klarna, Radar, refus de la
// banque, rien tenté), pour que l'app la dise sans jargon et propose un autre
// moyen. Lecture seule ; seule la personne de la session peut la lire.
async function diagnostiquerSession(sessionId: unknown, user: { id: string; email?: string }, CORS: Record<string, string>): Promise<Response> {
  const repondre = (o: unknown, status = 200) => new Response(JSON.stringify(o), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });
  if (typeof sessionId !== "string" || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) return repondre({ cause: "inconnue" });
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    const adresse = (user.email ?? "").toLowerCase();
    const aLui = s.metadata?.fillsell_user_id === user.id
      || (!!adresse && [s.customer_details?.email, s.customer_email].some((e) => (e ?? "").toLowerCase() === adresse));
    if (!aLui) return repondre({ cause: "inconnue" }, 403);
    const plan = s.metadata?.plan_type ?? null;
    if (s.status === "complete") return repondre({ cause: "payee", plan });
    const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
    if (!customerId) return repondre({ cause: "aucune_tentative", plan });
    // Les tentatives faites DEPUIS l'ouverture de cette session, la plus récente d'abord.
    const { data: intents } = await stripe.paymentIntents.list({ customer: customerId, created: { gte: s.created - 5 }, limit: 5 });
    const pi = intents?.[0] ?? null;
    let charge: Stripe.Charge | null = null;
    const chargeId = typeof pi?.latest_charge === "string" ? pi.latest_charge : null;
    if (chargeId && (!pi?.last_payment_error || pi.last_payment_error.charge === chargeId)) {
      try { charge = await stripe.charges.retrieve(chargeId); } catch { /* cause sans le détail du paiement */ }
    }
    const cause = causeEchec(pi, charge);
    console.log(`[checkout] diagnostic ${sessionId} (${user.id}) : ${cause}`);
    return repondre({ cause, plan });
  } catch (e) {
    console.warn(`[checkout] diagnostic ${String(sessionId)} illisible : ${(e as Error)?.message ?? e}`);
    return repondre({ cause: "inconnue" });
  }
}

// Le client ne lit JAMAIS l'erreur Stripe brute : un code stable pour le front,
// et la phrase, en français et en anglais, que l'app peut afficher telle quelle.
function reponseErreurPaiement(CORS: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: "paiement_impossible",
    message_fr: "Le paiement n'a pas pu s'ouvrir. Rien n'a été débité : réessaie dans un instant. Si ça recommence, écris-nous depuis Réglages › Aide.",
    message_en: "The payment could not be opened. Nothing was charged: try again in a moment. If it happens again, write to us from Settings › Help.",
  }), {
    status: 500,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !authUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Pour le journal d'échec : ce que la personne demandait.
  let produitDemande: string | null = null;
  try {
    // product : undefined → abonnement Premium standard (comportement historique) ;
    // "pro" → Pro 29,99 €/mois ; "business" → Business 59,99 €/mois (2026-08-09) ;
    // "coins_100"|"coins_220"|"coins_460"|"coins_1150" → pack de pièces one-shot.
    // promo (2026-09-26) : code arrivé par un lien d'e-mail (?offre=, cf.
    // src/lib/offreMail.js) — appliqué au Checkout d'abonnement plus bas.
    // carte_3ds (01/10) : « Payer par carte » après un refus — la session
    // demande le 3D Secure sur la carte tapée. lang : la phrase de la page de
    // paiement. action "diagnostic" + session_id : le retour de /cancel.
    const { email, product, promo, carte_3ds, lang, action, session_id } = await req.json();
    produitDemande = typeof product === "string" ? product : null;
    if (action === "diagnostic") return await diagnostiquerSession(session_id, authUser, CORS);

    if (email && authUser.email && email !== authUser.email) {
      return new Response(JSON.stringify({ error: "Email mismatch" }), {
        status: 403, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    const verifiedEmail = authUser.email ?? email;

    // Programme Founder fermé aux nouveaux (2026-07) : plus de lecture de
    // founder_config, tout nouveau checkout part sur le plan standard.
    // Les renouvellements des Founders existants passent par stripe-webhook,
    // qui reste inchangé.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Packs de pièces : paiement one-shot (commission ~3% vs 30% stores) ──
    // Le crédit est fait par stripe-webhook (checkout.session.completed,
    // metadata.purchase_type = "coins") via credit_purchased_coins, idempotent
    // sur stripe:<session.id>.
    if (typeof product === "string" && COIN_PACKS[product]) {
      const pack = COIN_PACKS[product];
      const packPriceId = await activePriceOrNull(Deno.env.get(pack.envKey), pack.envKey);
      if (!packPriceId) {
        return new Response(JSON.stringify({ error: "payment_unavailable", pack: product }), {
          status: 503, headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      const { data: packProfile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("email", verifiedEmail)
        .single();
      const packCustomerId = await validCustomerIdOrNull(
        packProfile?.stripe_customer_id ?? null,
        authUser.id
      );
      const packSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: packPriceId, quantity: 1 }],
        // Champ « code promo » au Checkout (2026-07-26) — geste commercial
        // possible via les promotion codes du dashboard Stripe.
        allow_promotion_codes: true,
        success_url: "https://fillsell.app/success",
        cancel_url: "https://fillsell.app/cancel",
        ...(packCustomerId
          ? { customer: packCustomerId }
          : { customer_email: verifiedEmail || undefined }),
        metadata: { purchase_type: "coins", coin_pack: product, coins: String(pack.coins), user_id: authUser.id },
      });
      return new Response(JSON.stringify({ url: packSession.url }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // ── L'ABONNEMENT CLOUD, À PART (04/10/2026) ──────────────────────────────
    if (product === "cloud") {
      const cloudPriceId = await activePriceOrNull(Deno.env.get("STRIPE_PRICE_CLOUD"), "STRIPE_PRICE_CLOUD");
      if (!cloudPriceId) {
        return new Response(JSON.stringify({ error: "payment_unavailable", option: "cloud" }), {
          status: 503, headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      const { data: profilCloud } = await supabase
        .from("profiles").select("stripe_customer_id, is_cloud, cloud_canal, cloud_essai_debut").eq("id", authUser.id).single();
      if (profilCloud?.is_cloud === true && profilCloud?.cloud_canal && profilCloud.cloud_canal !== "stripe") {
        // Déjà pris dans l'App Store ou Google Play : jamais un second abonnement.
        return new Response(JSON.stringify({ already_cloud: true, canal: profilCloud.cloud_canal }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      const clientCloud = await resoudreClient(profilCloud?.stripe_customer_id ?? null, authUser.id, verifiedEmail ?? null);
      const { data: tousLesAbos } = await stripe.subscriptions.list({ customer: clientCloud, status: "all", limit: 30 });
      const dejaCloud = (tousLesAbos ?? []).find((x: Stripe.Subscription) =>
        estAbonnementCloud(x, prixConnus()) && ["active", "trialing", "past_due"].includes(x.status));
      if (dejaCloud) {
        return new Response(JSON.stringify({ already_cloud: true, canal: "stripe", essai: dejaCloud.status === "trialing" }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      // Un seul essai par compte : la ligne profiles ET l'historique Stripe.
      const essai = essaiCloudPermis(profilCloud ?? {}, tousLesAbos ?? [], prixConnus());
      let ouvertesCloud: Stripe.Checkout.Session[] = [];
      try {
        const { data } = await stripe.checkout.sessions.list({ customer: clientCloud, status: "open", limit: 10 });
        ouvertesCloud = (data ?? []).filter((x: Stripe.Checkout.Session) => sessionEstCloud(x));
      } catch (e) {
        console.warn(`[checkout] sessions Cloud ouvertes de ${clientCloud} non relues : ${(e as Error)?.message ?? e}`);
      }
      const tri = trierSessionsOuvertes(ouvertesCloud, { planType: "cloud", carte3ds: carte_3ds === true, codePromo: "" });
      if (tri.aReprendre && (tri.aReprendre.metadata?.essai_cloud === "1") === essai) {
        return new Response(JSON.stringify({ url: tri.aReprendre.url, reprise: true, option: "cloud" }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      await remplacerSessions(ouvertesCloud, clientCloud, (x) => estAbonnementCloud(x, prixConnus()));
      const base = parametresCheckoutCloud({ prixCloud: cloudPriceId, essai, userId: authUser.id });
      const sessionCloud = await stripe.checkout.sessions.create({
        ...base,
        customer: clientCloud,
        success_url: "https://fillsell.app/success",
        cancel_url: "https://fillsell.app/cancel?session_id={CHECKOUT_SESSION_ID}",
        ...(carte_3ds === true ? {
          payment_method_options: { card: { request_three_d_secure: "any" } },
          metadata: { ...base.metadata, fillsell_carte_3ds: "1" },
        } : {}),
      } as Stripe.Checkout.SessionCreateParams);
      console.log(`[checkout] abonnement Cloud pour ${authUser.id} : essai ${essai ? `${ESSAI_CLOUD_JOURS} jours` : "déjà pris, payé tout de suite"}`);
      return new Response(JSON.stringify({ url: sessionCloud.url, option: "cloud", essai }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // ── Abonnements : standard 12,99 €, Pro 29,99 € ou Business 59,99 € ──
    // Plus AUCUN essai gratuit (2026-07-22) : l'essai 7 jours Premium est
    // supprimé (il ne restait posé qu'ici, jamais sur le Price Stripe). Pro
    // n'en a jamais eu (les 600 pièces mensuelles seraient arbitrables :
    // s'abonner, brûler les pièces, annuler).
    // Palier demandé. Toute valeur inconnue retombe sur `standard` — c'est le
    // comportement historique (product absent = Premium), conservé tel quel.
    const plan = SUB_PLANS[String(product ?? "")] ?? SUB_PLANS.standard;
    // Vérifié actif AVANT toute session ou upgrade in situ (le chemin upgrade
    // ci-dessous pousse le même priceId dans subscriptions.update).
    // Business tant que STRIPE_PRICE_BUSINESS n'est pas posé : erreur PROPRE
    // (payment_unavailable → message FR/EN côté client), jamais un checkout au
    // prix d'un autre palier.
    const priceId = await activePriceOrNull(Deno.env.get(plan.envKey), plan.envKey);
    if (!priceId) {
      return new Response(JSON.stringify({ error: "payment_unavailable" }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    const planType = plan.planType;

    // Réutilise le customer Stripe existant (historique de facturation unifié —
    // et à l'époque de l'essai 7 jours, c'était aussi la garde anti-2ème trial).
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("email", verifiedEmail)
      .single();
    // Validation live AVANT usage : un ID de test ferait aussi échouer
    // stripe.subscriptions.list du chemin upgrade Premium→Pro ci-dessous.
    // (01/10) Plus jamais « pas de client » : celui du profil, sinon celui de
    // l'adresse, sinon un seul créé (cf. resoudreClient).
    const existingCustomerId = await resoudreClient(
      profile?.stripe_customer_id ?? null,
      authUser.id,
      verifiedEmail ?? null,
    );

    // ── Upgrade Premium→Pro in situ (2026-07-23) ─────────────────────────────
    // Si le customer a DÉJÀ un abonnement Stripe vivant (Premium standard ou
    // Founder 9,99 legacy), un checkout Pro créerait un SECOND abonnement :
    // double facturation 12,99 + 29,99, et l'annulation de l'un des deux
    // coupait tous les flags (ancien subscription.deleted). On bascule donc
    // l'abonnement EXISTANT sur le price Pro (proration facturée immédiatement ;
    // depuis le 24/09, pending_if_incomplete : la bascule n'a lieu qu'une fois
    // la différence PAYÉE — sur-le-champ, ou par le client sur la page Stripe
    // de la facture, cf. le bloc plus bas). Aucun customer.subscription
    // .created — le webhook ne voit qu'un updated (actif) + invoice.paid.
    //
    // ⚠️ RANG, PAS BOOLÉEN (2026-08-09, à l'ajout de Business). La version
    // d'origine ne connaissait que « est-ce l'abonnement Pro ? » : appliquée
    // telle quelle à trois paliers, elle aurait répondu `already_pro: true` à
    // un Pro qui achète Business — Business n'aurait JAMAIS pu se vendre par
    // le web. On compare donc des rangs : on ne bascule que vers le HAUT, et
    // « déjà au moins ce palier » sort proprement sans rien facturer.
    if (plan.rang > 1 && existingCustomerId) {
      const { data: existingSubs } = await stripe.subscriptions.list({
        customer: existingCustomerId,
        limit: 20, // par défaut Stripe exclut les canceled ; on refiltre quand même
      });
      const live = (existingSubs ?? []).filter(
        (s: Stripe.Subscription) => (s.status === "active" || s.status === "trialing")
          && !estAbonnementCloud(s, prixConnus()) // (04/10) jamais la cible d'une montée
      );

      if (live.some((s: Stripe.Subscription) => rangAbonnement(s) >= plan.rang)) {
        // Déjà à ce palier ou au-dessus (double clic, flag client désynchronisé,
        // ou tentative de « downgrade » qui n'existe pas ici) : rien à vendre.
        // already_pro conservé pour les clients déjà déployés qui ne lisent que
        // cette clé ; `tier` dit lequel, pour ceux d'après.
        return new Response(JSON.stringify({ already_pro: true, tier: planType }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }

      // Cible = un abonnement vivant STRICTEMENT en dessous du palier visé.
      const target = live.find((s: Stripe.Subscription) => rangAbonnement(s) < plan.rang);
      if (target) {
        const item = target.items.data[0];
        // ══ PASSAGE DE PALIER : PAYÉ D'ABORD, APPLIQUÉ ENSUITE (2026-09-24) ══
        // Jocabroc (Premium payé par KLARNA via Checkout le 21/09) veut passer
        // Pro depuis le web : 5 essais, 5 HTTP 500. L'ancien appel forçait
        // `payment_behavior: "error_if_incomplete"` : Stripe tente de prélever
        // la différence SANS le client ; Klarna (comme Amazon Pay, Link banque,
        // une carte qui réclame 3-D Secure…) exige que le client valide — la
        // tentative échoue, Stripe annule tout (PaymentIntent annulé,
        // failed_invoice, facture supprimée, 0 € débité) et l'erreur remontait
        // brute, sans une ligne de journal.
        //
        // DÉSORMAIS : `pending_if_incomplete` — la mise à jour du prix ne
        // s'applique QUE si la facture de différence est payée :
        //   · prélevée sur-le-champ (carte sans authentification) → appliquée
        //     tout de suite : le chemin d'avant, flags et Pépites posés ici,
        //     exactement comme avant ;
        //   · paiement à valider → RIEN ne change sur l'abonnement (prix,
        //     flags, grant) ; on renvoie la PAGE STRIPE de la facture (même
        //     forme `{ url }` qu'un Checkout : le front l'ouvre déjà). Le client
        //     valide lui-même ; au paiement, Stripe applique la mise à jour et
        //     stripe-webhook (invoice.paid) pose flags + Pépites.
        //   · abandon → Stripe annule (void) la facture et jette la mise à jour
        //     à l'échéance (23 h au plus) ; la facture est passée en
        //     `auto_advance: false` : aucune relance, aucun nouveau prélèvement.
        //     Le client reste Premium, exactement comme avant.
        // ⛔ Jamais deux abonnements : c'est LE MÊME abonnement qui change de prix.
        // ⛔ Jamais deux factures : une montée déjà en attente vers ce palier
        //    renvoie SA page (double clic, retour arrière) ; vers un autre palier,
        //    Stripe annule l'ancienne facture en posant la nouvelle.
        const pageEnAttente = await pageDeLaMonteeEnAttente(target, planType);
        if (pageEnAttente) {
          console.log(`[checkout] montée ${target.id} → ${planType} déjà en attente de paiement — page existante renvoyée`);
          return new Response(JSON.stringify({ url: pageEnAttente, paiement_a_valider: true, tier: planType }), {
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const upgraded = await stripe.subscriptions.update(target.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
          expand: ["latest_invoice"],
        });
        const factureMontee = (upgraded.latest_invoice && typeof upgraded.latest_invoice === "object")
          ? upgraded.latest_invoice as Stripe.Invoice : null;
        if (upgraded.pending_update) {
          // Paiement à VALIDER par le client : aucun flag, aucune Pépite, aucun
          // changement de prix tant que la facture n'est pas payée.
          if (factureMontee?.id) {
            try {
              await stripe.invoices.update(factureMontee.id, {
                auto_advance: false,
                metadata: { fillsell_upgrade_vers: planType, fillsell_user_id: authUser.id },
              });
            } catch (e) {
              const se = e as { code?: string; message?: string };
              console.error(`[checkout] facture de montée ${factureMontee.id} : auto_advance/metadata non posés — code=${se?.code ?? "?"} message=${se?.message ?? e}`);
            }
          }
          const page = factureMontee?.hosted_invoice_url ?? null;
          console.log(`[checkout] montée ${target.id} → ${planType} EN ATTENTE du paiement client (facture ${factureMontee?.id ?? "?"}, ${factureMontee?.amount_due ?? "?"} ${factureMontee?.currency ?? ""}, expire ${upgraded.pending_update.expires_at ? new Date(upgraded.pending_update.expires_at * 1000).toISOString() : "?"})`);
          if (!page) {
            console.error(`[checkout] montée ${target.id} en attente SANS page de paiement (facture ${factureMontee?.id ?? "?"})`);
            return reponseErreurPaiement(CORS);
          }
          return new Response(JSON.stringify({ url: page, paiement_a_valider: true, tier: planType }), {
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        // Payé sur-le-champ : la mise à jour est appliquée. Métadonnée de palier
        // et annulation programmée levée (« un Premium en cours d'annulation qui
        // upgrade veut manifestement rester ») — posées APRÈS le paiement, dans
        // un second appel : une mise à jour en attente ne les porte pas.
        try {
          await stripe.subscriptions.update(target.id, {
            cancel_at_period_end: false,
            metadata: { ...(target.metadata ?? {}), plan_type: planType },
          });
        } catch (e) {
          const se = e as { code?: string; message?: string };
          console.error(`[checkout] montée ${target.id} payée — metadata/cancel_at_period_end non posés : code=${se?.code ?? "?"} message=${se?.message ?? e}`);
        }
        // Miroir de checkout.session.completed (qui ne firera PAS ici — pas de
        // session Checkout) : flags + Pépites du mois. upgrade_monthly_grant
        // (2026-07-23) complète la différence premium→pro si le grant du mois
        // est déjà passé (l'ancien grant_monthly_coins répondait already_granted
        // et l'upgradé restait au grant Premium jusqu'au 1er).
        // Flags CUMULATIFS (cf. migration 20260808213000) : Business ⊇ Pro ⊇
        // Premium. On pose donc TOUS les flags jusqu'au palier atteint — un
        // is_business sans is_pro laisserait passer à côté toutes les gates
        // écrites en isPro.
        await supabase
          .from("profiles")
          .update({
            is_premium: true,
            is_pro: true,
            ...(plan.rang >= 3 ? { is_business: true } : {}),
            stripe_customer_id: existingCustomerId,
          })
          .eq("id", authUser.id);
        // L'upgrade en place ouvre une période neuve : current_period_end de
        // l'abonnement modifié réaligne l'échéance du grant sur la nouvelle
        // facturation (cycle par utilisateur, 2026-07-28). proration_behavior
        // "always_invoice" déclenchera aussi invoice.paid, qui poserait la même
        // date — les deux chemins sont idempotents, celui-ci évite juste de
        // dépendre de l'activation de cet événement côté dashboard Stripe.
        const { data: grantRes, error: grantErr } = await supabase.rpc("upgrade_monthly_grant", {
          p_user_id: authUser.id,
          p_tier: plan.grantTier,
          p_period_end: upgraded?.current_period_end
            ? new Date(upgraded.current_period_end * 1000).toISOString()
            : null,
          p_source: "payment",
        });
        if (grantErr) console.error("[checkout] upgrade grant failed:", grantErr.message);
        else console.log(`[checkout] upgraded sub ${target.id} to ${planType} — grant:`, JSON.stringify(grantRes));
        return new Response(JSON.stringify({ upgraded: true, tier: planType }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      // Aucun abonnement Stripe vivant (customer d'un vieux pack de pièces ou
      // d'un abonnement résilié) : checkout Pro classique ci-dessous.
    }

    const carte3ds = carte_3ds === true;
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Champ « code promo » au Checkout (2026-07-26). L'upgrade Premium→Pro
      // in situ ci-dessus n'est PAS concerné : subscriptions.update, aucune
      // session Checkout (une remise là-bas passerait par `discounts`).
      allow_promotion_codes: true,
      success_url: "https://fillsell.app/success",
      // (01/10) Le retour porte la session : /cancel en lit la cause
      // (action "diagnostic") et propose un autre moyen de paiement.
      cancel_url: "https://fillsell.app/cancel?session_id={CHECKOUT_SESSION_ID}",
      customer: existingCustomerId,
      subscription_data: { metadata: { plan_type: planType, fillsell_user_id: authUser.id } },
      metadata: { plan_type: planType, fillsell_user_id: authUser.id, ...(carte3ds ? { fillsell_carte_3ds: "1" } : {}) },
      // ── 3D SECURE : LA SORTIE DITE SUR LA PAGE MÊME (01/10) ──────────────
      // Un portefeuille (Apple Pay) refusé par la banque faute
      // d'authentification (authentication_required, 1A) ne peut pas passer
      // par le 3D Secure : la carte tapée, elle, le peut — c'est ainsi que
      // nicolas.menar a payé le 30/09. Une phrase, sous le bouton de paiement.
      custom_text: {
        submit: {
          message: lang === "en"
            ? "Payment declined? Choose “Card” and type its number: your bank will ask you to confirm (3D Secure)."
            : "Paiement refusé ? Choisis « Carte » et tape son numéro : ta banque te demandera de valider (3D Secure).",
        },
      },
      // « Payer par carte » après un refus : le 3D Secure est demandé d'office
      // sur la carte tapée (le premier paiement est fait en présence de la
      // personne, sur la page Stripe — jamais un prélèvement automatique).
      ...(carte3ds ? { payment_method_options: { card: { request_three_d_secure: "any" } } } : {}),
    };

    // ── Code promo APPLIQUÉ d'office (2026-09-26, blast FILLSELL50) ─────────
    // Le lien du mail porte le code : la personne ne doit rien avoir à taper.
    // On le résout auprès de Stripe (code ACTIF uniquement) et on le passe en
    // `discounts` — Stripe interdit `discounts` et `allow_promotion_codes`
    // ensemble, d'où le retrait du second.
    // Tout ce qui cloche retombe sur le Checkout d'avant, champ code promo
    // compris : code inconnu/expiré, ou conditions du coupon non remplies
    // (« première commande » : un ancien client qui a déjà payé est refusé
    // par Stripe à la création de session). Un bouton de mail qui mène à une
    // erreur coûte plus cher qu'un prix plein.
    let promotionCodeId: string | null = null;
    const codePromo = typeof promo === "string" ? promo.trim() : "";
    if (codePromo && /^[A-Za-z0-9_-]{3,40}$/.test(codePromo)) {
      try {
        const { data: codes } = await stripe.promotionCodes.list({ code: codePromo, active: true, limit: 1 });
        promotionCodeId = codes?.[0]?.id ?? null;
        if (!promotionCodeId) console.warn(`[checkout] code promo « ${codePromo} » inconnu ou inactif — Checkout sans remise`);
      } catch (e) {
        const se = e as { code?: string; message?: string };
        console.error(`[checkout] code promo « ${codePromo} » illisible — code=${se?.code ?? "?"} message=${se?.message ?? e}`);
      }
    }

    // ── LA MÊME DEMANDE ROUVRE LA MÊME PAGE ; UNE AUTRE LA REMPLACE (01/10) ──
    // Revenir dans l'app et recliquer ne crée plus ni client, ni session, ni
    // abonnement en attente de plus (cf. trierSessionsOuvertes).
    let ouvertes: Stripe.Checkout.Session[] = [];
    try {
      const { data } = await stripe.checkout.sessions.list({ customer: existingCustomerId, status: "open", limit: 10 });
      ouvertes = (data ?? []).filter((x: Stripe.Checkout.Session) => !sessionEstCloud(x)); // (04/10) Cloud à part
    } catch (e) {
      console.warn(`[checkout] sessions ouvertes de ${existingCustomerId} non relues : ${(e as Error)?.message ?? e}`);
    }
    const { aReprendre, aRemplacer } = trierSessionsOuvertes(ouvertes, {
      planType, carte3ds, codePromo: promotionCodeId ? codePromo : "",
    });
    if (aReprendre) {
      console.log(`[checkout] session ouverte ${aReprendre.id} rouverte pour ${authUser.id} (${planType}${carte3ds ? ", carte + 3D Secure" : ""})`);
      return new Response(JSON.stringify({ url: aReprendre.url, reprise: true }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    await remplacerSessions(aRemplacer, existingCustomerId, (x) => !estAbonnementCloud(x, prixConnus()));

    let session: Stripe.Checkout.Session;
    if (promotionCodeId) {
      const { allow_promotion_codes: _sansChamp, ...sansChamp } = sessionParams;
      try {
        session = await stripe.checkout.sessions.create({
          ...sansChamp,
          discounts: [{ promotion_code: promotionCodeId }],
          metadata: { ...sessionParams.metadata, code_promo: codePromo },
        });
        console.log(`[checkout] ${authUser.id} → ${planType} avec code promo ${codePromo}`);
      } catch (e) {
        const se = e as { code?: string; message?: string };
        console.warn(`[checkout] code promo ${codePromo} refusé pour ${authUser.id} (code=${se?.code ?? "?"} message=${se?.message ?? e}) — Checkout sans remise`);
        session = await stripe.checkout.sessions.create(sessionParams);
      }
    } else {
      session = await stripe.checkout.sessions.create(sessionParams);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    // ⛔ PLUS JAMAIS UN 500 MUET (2026-09-24, Jocabroc : 5 échecs, zéro ligne de
    //    journal). Tout échec est journalisé avec ce que Stripe en dit — type,
    //    code, code de refus, identifiant de requête — et le client reçoit une
    //    phrase claire, jamais le message brut.
    const e = err as {
      type?: string; code?: string; decline_code?: string; statusCode?: number;
      requestId?: string; message?: string; raw?: { message?: string };
    };
    console.error("[checkout] ÉCHEC", JSON.stringify({
      user: authUser.id,
      produit: produitDemande,
      type: e?.type ?? null,
      code: e?.code ?? null,
      decline_code: e?.decline_code ?? null,
      statusCode: e?.statusCode ?? null,
      requestId: e?.requestId ?? null,
      message: e?.message ?? String(err),
    }));
    return reponseErreurPaiement(CORS);
  }
});
