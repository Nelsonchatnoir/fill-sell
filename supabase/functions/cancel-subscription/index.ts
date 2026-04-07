import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // Extrait le JWT user depuis le header Authorization
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    if (!jwt) {
      return new Response(JSON.stringify({ error: "JWT manquant" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Vérifie le JWT et récupère l'user via le client admin (fiable, bypass RLS)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      console.error("[cancel-subscription] JWT invalide:", authError?.message);
      return new Response(JSON.stringify({ error: "Token invalide ou expiré" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

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

    // Cas : pas de customer Stripe — force is_premium=false
    if (!profile.stripe_customer_id) {
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ is_premium: false })
        .eq("id", user.id);
      console.log("[cancel-subscription] No Stripe customer — UPDATE:", upErr?.message ?? "OK");
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
      if (canceled.cancel_at) {
        periodEnd = new Date(canceled.cancel_at * 1000).toLocaleDateString("fr-FR");
      }
      console.log("[cancel-subscription] Stripe annulé, fin le:", periodEnd);
    }

    // UPDATE is_premium=false via service role (bypass RLS garanti)
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ is_premium: false })
      .eq("id", user.id);

    if (updateError) {
      console.error("[cancel-subscription] UPDATE profiles FAILED:", updateError.message);
      return new Response(
        JSON.stringify({ error: "Échec mise à jour profil : " + updateError.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    console.log("[cancel-subscription] is_premium=false écrit pour user:", user.id);

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
