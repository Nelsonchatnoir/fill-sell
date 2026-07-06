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

    // ── Pack de pièces (mode payment) : créditer et sortir — pas un abonnement ──
    // Idempotent : ref stripe:<session.id>, un event rejoué ne crédite pas deux fois.
    if (session.metadata?.purchase_type === "coins") {
      const coins = parseInt(session.metadata?.coins ?? "0", 10);
      const packUserId = session.metadata?.user_id;
      if (packUserId && coins > 0) {
        const { data: credit, error: creditErr } = await supabase.rpc("credit_purchased_coins", {
          p_user_id: packUserId,
          p_amount: coins,
          p_ref: `stripe:${session.id}`,
          p_metadata: { pack: session.metadata?.coin_pack ?? null, amount_total: session.amount_total },
        });
        if (creditErr) console.error("[webhook] credit coins failed:", creditErr.message);
        else console.log(`[webhook] coins pack → user=${packUserId} coins=${coins}`, JSON.stringify(credit));
      } else {
        console.error("[webhook] coins session without user_id/coins metadata:", session.id);
      }
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tiktok-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "Purchase", value: (session.amount_total ?? 0) / 100, currency: "EUR" }),
      }).catch(() => {});
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

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
      if (planType === "pro") {
        profileUpdate.is_pro = true;
      }

      await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("email", email);

      // Atomically increment founder slot counter
      if (planType === "founder") {
        await supabase.rpc("increment_founder_slots");
      }

      // Pièces incluses créditées dès l'activation (idempotent par mois calendaire)
      const grantTier = planType === "pro" ? "pro" : "premium";
      const { error: grantErr } = await supabase.rpc("grant_monthly_coins", {
        p_user_id: users[0].id,
        p_tier: grantTier,
      });
      if (grantErr) console.error("[webhook] grant_monthly_coins:", grantErr.message);
    }

    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tiktok-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "Purchase", value: 9.99, currency: "EUR" }),
    }).catch(() => {});
  }

  // Renouvellements d'abonnement : re-crédit mensuel des pièces incluses
  // (idempotent par mois). ⚠️ Nécessite d'activer l'événement invoice.paid
  // sur l'endpoint webhook dans le dashboard Stripe.
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, is_pro")
      .eq("stripe_customer_id", customerId)
      .limit(1);
    if (profs && profs.length > 0) {
      const tier = profs[0].is_pro ? "pro" : "premium";
      const { error: grantErr } = await supabase.rpc("grant_monthly_coins", {
        p_user_id: profs[0].id,
        p_tier: tier,
      });
      if (grantErr) console.error("[webhook] invoice.paid grant:", grantErr.message);
      else console.log(`[webhook] invoice.paid grant → user=${profs[0].id} tier=${tier}`);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    console.log("[webhook] subscription.deleted for customer:", customerId);

    await supabase
      .from("profiles")
      .update({ is_premium: false, is_pro: false, subscription_cancel_at_period_end: false })
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
        .update({ is_premium: false, is_pro: false, subscription_cancel_at_period_end: false })
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
