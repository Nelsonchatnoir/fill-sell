import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  try {
    // product : undefined → abonnement Premium standard (comportement historique) ;
    // "pro" → abonnement Pro 29,99 €/mois ;
    // "coins_100"|"coins_220"|"coins_460"|"coins_1150" → pack de pièces one-shot.
    const { email, product } = await req.json();

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
      const packPriceId = Deno.env.get(pack.envKey);
      if (!packPriceId) {
        return new Response(JSON.stringify({ error: "pack_price_not_configured", pack: product }), {
          status: 500, headers: { "Content-Type": "application/json", ...CORS },
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

    // ── Abonnements : standard 12,99 € ou Pro 29,99 € ──
    // Plus AUCUN essai gratuit (2026-07-22) : l'essai 7 jours Premium est
    // supprimé (il ne restait posé qu'ici, jamais sur le Price Stripe). Pro
    // n'en a jamais eu (les 600 pièces mensuelles seraient arbitrables :
    // s'abonner, brûler les pièces, annuler).
    const isProPlan = product === "pro";
    const priceId = isProPlan
      ? Deno.env.get("STRIPE_PRICE_PRO")!
      : Deno.env.get("STRIPE_PRICE_STANDARD")!;
    const planType = isProPlan ? "pro" : "standard";

    // Réutilise le customer Stripe existant (historique de facturation unifié —
    // et à l'époque de l'essai 7 jours, c'était aussi la garde anti-2ème trial).
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("email", verifiedEmail)
      .single();
    // Validation live AVANT usage : un ID de test ferait aussi échouer
    // stripe.subscriptions.list du chemin upgrade Premium→Pro ci-dessous.
    const existingCustomerId = await validCustomerIdOrNull(
      profile?.stripe_customer_id ?? null,
      authUser.id
    );

    // ── Upgrade Premium→Pro in situ (2026-07-23) ─────────────────────────────
    // Si le customer a DÉJÀ un abonnement Stripe vivant (Premium standard ou
    // Founder 9,99 legacy), un checkout Pro créerait un SECOND abonnement :
    // double facturation 12,99 + 29,99, et l'annulation de l'un des deux
    // coupait tous les flags (ancien subscription.deleted). On bascule donc
    // l'abonnement EXISTANT sur le price Pro (proration facturée immédiatement,
    // error_if_incomplete = si la carte refuse, Stripe annule l'update et on
    // ressort en erreur SANS toucher aux flags). Aucun customer.subscription
    // .created — le webhook ne voit qu'un updated (actif) + invoice.paid.
    if (isProPlan && existingCustomerId) {
      const { data: existingSubs } = await stripe.subscriptions.list({
        customer: existingCustomerId,
        limit: 20, // par défaut Stripe exclut les canceled ; on refiltre quand même
      });
      const live = (existingSubs ?? []).filter(
        (s: Stripe.Subscription) => s.status === "active" || s.status === "trialing"
      );
      const isProSub = (s: Stripe.Subscription) =>
        s.metadata?.plan_type === "pro" ||
        s.items?.data?.some((it: Stripe.SubscriptionItem) => it.price?.id === priceId);

      if (live.some(isProSub)) {
        // Déjà Pro (double clic, ou flag client désynchronisé) : rien à vendre.
        return new Response(JSON.stringify({ already_pro: true }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }

      const target = live.find((s: Stripe.Subscription) => !isProSub(s));
      if (target) {
        const item = target.items.data[0];
        await stripe.subscriptions.update(target.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "always_invoice",
          payment_behavior: "error_if_incomplete",
          // Un Premium en cours d'annulation qui upgrade veut manifestement rester :
          cancel_at_period_end: false,
          metadata: { ...(target.metadata ?? {}), plan_type: "pro" },
        });
        // Miroir de checkout.session.completed (qui ne firera PAS ici — pas de
        // session Checkout) : flags + Pépites du mois. upgrade_monthly_grant
        // (2026-07-23) complète la différence premium→pro si le grant du mois
        // est déjà passé (l'ancien grant_monthly_coins répondait already_granted
        // et l'upgradé restait au grant Premium jusqu'au 1er).
        await supabase
          .from("profiles")
          .update({ is_premium: true, is_pro: true, stripe_customer_id: existingCustomerId })
          .eq("id", authUser.id);
        const { data: grantRes, error: grantErr } = await supabase.rpc("upgrade_monthly_grant", {
          p_user_id: authUser.id,
          p_tier: "pro",
        });
        if (grantErr) console.error("[checkout] upgrade grant failed:", grantErr.message);
        else console.log("[checkout] upgraded sub", target.id, "to pro — grant:", JSON.stringify(grantRes));
        return new Response(JSON.stringify({ upgraded: true }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      // Aucun abonnement Stripe vivant (customer d'un vieux pack de pièces ou
      // d'un abonnement résilié) : checkout Pro classique ci-dessous.
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://fillsell.app/success",
      cancel_url: "https://fillsell.app/cancel",
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: verifiedEmail || undefined }),
      subscription_data: { metadata: { plan_type: planType } },
      metadata: { plan_type: planType },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
