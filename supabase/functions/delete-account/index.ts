import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost"];

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
    // 1. JWT extraction
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    console.log("[delete-account] JWT présent:", !!jwt, "longueur:", jwt.length);

    if (!jwt) {
      return new Response(JSON.stringify({ error: "JWT manquant" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 2. Validation JWT → récupération user
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    console.log("[delete-account] getUser →", authUser ? `userId=${authUser.id}` : "null", authError ? `erreur=${authError.message}` : "");

    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Token invalide ou expiré" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const userId = authUser.id;

    // 3. Annulation abonnement Stripe avant suppression du profil
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profile?.stripe_customer_id) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: "all",
          limit: 10,
        });
        const toCancel = subs.data.filter(s => s.status !== "canceled");
        for (const sub of toCancel) {
          await stripe.subscriptions.cancel(sub.id);
          console.log(`[delete-account] Stripe sub annulé: ${sub.id} (${sub.status}) customer=${profile.stripe_customer_id}`);
        }
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error("[delete-account] Erreur annulation Stripe (non bloquant):", msg);
      }
    }

    // 4. Suppression des données utilisateur (FK constraints)
    console.log("[delete-account] Suppression données userId:", userId);
    await supabaseAdmin.from('inventaire').delete().eq('user_id', userId);
    await supabaseAdmin.from('ventes').delete().eq('user_id', userId);
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    // 5. Suppression auth user
    console.log("[delete-account] Tentative suppression auth userId:", userId);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[delete-account] deleteUser ERREUR:", deleteError.message, "status:", deleteError.status);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[delete-account] Compte supprimé avec succès:", userId);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[delete-account] Erreur inattendue:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
