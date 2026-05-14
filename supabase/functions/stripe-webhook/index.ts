import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEventAsync
      ? await stripe.webhooks.constructEventAsync(
          body,
          signature!,
          Deno.env.get("STRIPE_WEBHOOK_SECRET")!
        )
      : stripe.webhooks.constructEvent(
          body,
          signature!,
          Deno.env.get("STRIPE_WEBHOOK_SECRET")!
        );
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email;
    const customerId = session.customer as string;
    const planType = session.metadata?.plan_type ?? "standard";

    if (!email) {
      return new Response("No email found", { status: 400 });
    }

    const { data: users } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .limit(1);

    if (users && users.length > 0) {
      const profileUpdate: Record<string, unknown> = {
        is_premium: true,
        stripe_customer_id: customerId,
      };
      // is_founder is set once and NEVER cleared — only set on founder plan
      if (planType === "founder") {
        profileUpdate.is_founder = true;
      }

      await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("email", email);

      // Atomically increment founder slot counter
      if (planType === "founder") {
        await supabase.rpc("increment_founder_slots");
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    console.log("[webhook] subscription.deleted for customer:", customerId);

    await supabase
      .from("profiles")
      .update({ is_premium: false, subscription_cancel_at_period_end: false })
      .eq("stripe_customer_id", customerId);
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const status = subscription.status;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;

    console.log("[webhook] subscription.updated for customer:", customerId, "status:", status, "cancel_at_period_end:", cancelAtPeriodEnd);

    if (status === "unpaid" || status === "incomplete_expired") {
      await supabase
        .from("profiles")
        .update({ is_premium: false, subscription_cancel_at_period_end: false })
        .eq("stripe_customer_id", customerId);
    } else {
      await supabase
        .from("profiles")
        .update({ subscription_cancel_at_period_end: cancelAtPeriodEnd })
        .eq("stripe_customer_id", customerId);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
