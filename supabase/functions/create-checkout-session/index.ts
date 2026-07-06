import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost"];

// Packs de pièces (grille 2026-07-06) — price IDs Stripe à créer dans le
// dashboard puis renseigner dans les secrets edge functions.
const COIN_PACKS: Record<string, { envKey: string; coins: number }> = {
  coins_100:  { envKey: "STRIPE_PRICE_COINS_100",  coins: 100 },
  coins_220:  { envKey: "STRIPE_PRICE_COINS_220",  coins: 220 },
  coins_460:  { envKey: "STRIPE_PRICE_COINS_460",  coins: 460 },
  coins_1150: { envKey: "STRIPE_PRICE_COINS_1150", coins: 1150 },
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
      const packSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: packPriceId, quantity: 1 }],
        success_url: "https://fillsell.app/success",
        cancel_url: "https://fillsell.app/cancel",
        ...(packProfile?.stripe_customer_id
          ? { customer: packProfile.stripe_customer_id }
          : { customer_email: verifiedEmail || undefined }),
        metadata: { purchase_type: "coins", coin_pack: product, coins: String(pack.coins), user_id: authUser.id },
      });
      return new Response(JSON.stringify({ url: packSession.url }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // ── Abonnements : standard 12,99 € ou Pro 29,99 € ──
    // Pas d'essai gratuit sur Pro : les 800 pièces mensuelles sont créditées dès
    // le paiement (un trial serait arbitrable : s'abonner, brûler les pièces, annuler).
    const isProPlan = product === "pro";
    const priceId = isProPlan
      ? Deno.env.get("STRIPE_PRICE_PRO")!
      : Deno.env.get("STRIPE_PRICE_STANDARD")!;
    const planType = isProPlan ? "pro" : "standard";

    // Réutilise le customer Stripe existant pour bloquer un 2ème trial
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("email", verifiedEmail)
      .single();
    const existingCustomerId = profile?.stripe_customer_id ?? null;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://fillsell.app/success",
      cancel_url: "https://fillsell.app/cancel",
      ...(existingCustomerId
        ? {
            customer: existingCustomerId,
            subscription_data: { metadata: { plan_type: planType } },
          }
        : {
            customer_email: verifiedEmail || undefined,
            subscription_data: { ...(isProPlan ? {} : { trial_period_days: 7 }), metadata: { plan_type: planType } },
          }
      ),
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
