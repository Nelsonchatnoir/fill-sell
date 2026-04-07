import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Admin client avec service role — bypass RLS pour tous les accès DB
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // Récupère l'access_token du user depuis le body
    const body = await req.json();
    const accessToken: string | undefined = body?.access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "access_token manquant" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Vérifie l'identité du user via son JWT
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("[cancel-subscription] Auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Utilisateur non authentifié" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[cancel-subscription] User authenticated:", user.id);

    // Récupère stripe_customer_id depuis profiles (admin = bypass RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_premium")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[cancel-subscription] Profile fetch failed:", profileError?.message);
      return new Response(JSON.stringify({ error: "Profil introuvable" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[cancel-subscription] Profile:", { stripe_customer_id: profile.stripe_customer_id, is_premium: profile.is_premium });

    // Cas : pas de customer Stripe — force is_premium=false quand même
    if (!profile.stripe_customer_id) {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ is_premium: false })
        .eq("id", user.id);
      console.log("[cancel-subscription] No stripe_customer_id — UPDATE result:", updateError?.message ?? "OK");
      return new Response(
        JSON.stringify({ success: true, period_end: null }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Récupère les abonnements Stripe actifs
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 5,
    });

    console.log("[cancel-subscription] Active subscriptions:", subscriptions.data.length);

    let periodEnd: string | null = null;

    if (subscriptions.data.length > 0) {
      // Annule avec cancel_at_period_end pour garder l'accès jusqu'à la fin
      const canceled = await stripe.subscriptions.update(subscriptions.data[0].id, {
        cancel_at_period_end: true,
      });
      if (canceled.cancel_at) {
        periodEnd = new Date(canceled.cancel_at * 1000).toLocaleDateString("fr-FR");
      }
      console.log("[cancel-subscription] Subscription cancelled, period_end:", periodEnd);
    }

    // UPDATE is_premium=false via service role (bypass RLS)
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ is_premium: false })
      .eq("id", user.id);

    if (updateError) {
      console.error("[cancel-subscription] UPDATE profiles FAILED:", updateError.message);
      return new Response(JSON.stringify({ error: "Échec mise à jour profil : " + updateError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[cancel-subscription] is_premium=false OK for user:", user.id);

    return new Response(
      JSON.stringify({ success: true, period_end: periodEnd }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[cancel-subscription] Unexpected error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
