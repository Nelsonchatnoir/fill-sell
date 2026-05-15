import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
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
    const { email } = await req.json();

    if (email && authUser.email && email !== authUser.email) {
      return new Response(JSON.stringify({ error: "Email mismatch" }), {
        status: 403, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    const verifiedEmail = authUser.email ?? email;

    // Determine plan type based on founder slots availability
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: config } = await supabase
      .from("founder_config")
      .select("slots_total, slots_used")
      .eq("id", 1)
      .single();

    const slotsRemaining = config ? config.slots_total - config.slots_used : 0;
    const isFounderSlot = slotsRemaining > 0;
    const priceId = isFounderSlot
      ? Deno.env.get("STRIPE_PRICE_FOUNDER")!
      : Deno.env.get("STRIPE_PRICE_STANDARD")!;
    const planType = isFounderSlot ? "founder" : "standard";

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
            subscription_data: { trial_period_days: 7, metadata: { plan_type: planType } },
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
