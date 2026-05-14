import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const { email } = await req.json();

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

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://fillsell.app/success",
      cancel_url: "https://fillsell.app/cancel",
      customer_email: email || undefined,
      subscription_data: {
        trial_period_days: 7,
        metadata: { plan_type: planType },
      },
      metadata: { plan_type: planType },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
