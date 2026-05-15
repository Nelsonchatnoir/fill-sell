import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Admin client — SERVICE_ROLE_KEY bypasse le RLS sur toutes les tables
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);

    console.log("[cancel-subscription] User OK:", user.id);

    // Récupère stripe_customer_id depuis profiles (admin = bypass RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_premium")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[cancel-subscription] Profile introuvable:", profileError?.message);
      return new Response(JSON.stringify({ error: "Profil introuvable" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[cancel-subscription] Profile:", {
      stripe_customer_id: profile.stripe_customer_id,
      is_premium: profile.is_premium,
    });

    // Cas : pas de customer Stripe — force is_premium=false immédiatement
    if (!profile.stripe_customer_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ is_premium: false })
        .eq("id", user.id);
      console.log("[cancel-subscription] No Stripe customer — is_premium=false");
      return new Response(
        JSON.stringify({ success: true, period_end: null }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Récupère les abonnements actifs Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 5,
    });

    console.log("[cancel-subscription] Abonnements actifs:", subscriptions.data.length);

    let periodEnd: string | null = null;

    if (subscriptions.data.length > 0) {
      const canceled = await stripe.subscriptions.update(subscriptions.data[0].id, {
        cancel_at_period_end: true,
      });
      // current_period_end = date réelle de fin de période payée
      const d = new Date(canceled.current_period_end * 1000);
      periodEnd = `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`;
      console.log("[cancel-subscription] cancel_at_period_end=true, fin le:", periodEnd);
      await supabaseAdmin.from("profiles").update({ subscription_period_end: periodEnd }).eq("id", user.id);
    }

    // is_premium reste true — sera mis à false par le webhook customer.subscription.deleted

    return new Response(
      JSON.stringify({ success: true, period_end: periodEnd }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[cancel-subscription] Erreur inattendue:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
