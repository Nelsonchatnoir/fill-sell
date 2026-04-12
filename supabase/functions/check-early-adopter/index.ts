import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const coupon = await stripe.coupons.retrieve("EARLY50");
    const total = 50;
    const used = coupon.times_redeemed ?? 0;
    const remaining = Math.max(0, total - used);
    const available = coupon.valid === true && remaining > 0;

    return new Response(JSON.stringify({ available, remaining, total }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ available: false, remaining: 0, total: 50 }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
