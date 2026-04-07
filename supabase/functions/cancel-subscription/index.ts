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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // Récupère le JWT utilisateur
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Client avec le token utilisateur pour vérifier l'identité
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Utilisateur non trouvé" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Client service role pour lire/écrire profiles
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Récupère le stripe_customer_id depuis profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_premium")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profil introuvable" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!profile.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "Aucun abonnement Stripe associé" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Récupère les abonnements actifs du client Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 5,
    });

    if (subscriptions.data.length === 0) {
      // Pas d'abonnement actif — force is_premium=false quand même
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ is_premium: false })
        .eq("id", user.id);
      if (updateError) console.error("[cancel-subscription] UPDATE profiles (no active sub):", updateError.message);
      else console.log("[cancel-subscription] No active sub — is_premium set to false for user:", user.id);

      return new Response(
        JSON.stringify({ success: true, period_end: null }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Annule tous les abonnements actifs (cancel_at_period_end = true)
    const canceledAt: number[] = [];
    for (const sub of subscriptions.data) {
      const canceled = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
      canceledAt.push(canceled.cancel_at as number);
    }

    // Met is_premium à false dans profiles (service role bypass RLS)
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ is_premium: false })
      .eq("id", user.id);

    if (updateError) {
      console.error("[cancel-subscription] UPDATE profiles failed:", updateError.message);
      return new Response(JSON.stringify({ error: "Échec mise à jour profil : " + updateError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    console.log("[cancel-subscription] is_premium set to false for user:", user.id);

    const periodEnd = canceledAt[0]
      ? new Date(canceledAt[0] * 1000).toLocaleDateString("fr-FR")
      : null;

    return new Response(
      JSON.stringify({ success: true, period_end: periodEnd }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
