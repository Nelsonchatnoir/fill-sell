import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifierPaiement, alerterPaiementNonCredite, signalerPaiementEchoue } from "../_shared/payment-notify.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Recalcule is_premium/is_pro depuis les abonnements Stripe RESTANTS du
// customer (2026-07-23) — remplace les remises à zéro aveugles : un customer
// historique peut avoir DEUX abonnements (bug double-abo Premium→Pro, corrigé
// dans create-checkout-session le même jour), et la suppression de l'un ne
// doit jamais couper l'autre. Le plan supprimé est identifié par ce qui
// RESTE : price Pro (STRIPE_PRICE_PRO) ou metadata.plan_type='pro' → is_pro ;
// n'importe quel abonnement vivant → is_premium. is_founder n'est JAMAIS
// touché (marqueur de prix legacy sans effet sur l'accès, cf. CLAUDE.md).
//
// « Vivant » inclut past_due (2026-07-25, cas réel Mériné) : pendant la
// fenêtre de retry Stripe (dunning, jusqu'à ~1 mois), l'abonnement n'est PAS
// résilié — un client en retard de paiement garde son statut tant que Stripe
// n'a pas tranché. Seuls les états terminaux font perdre le premium :
// canceled (abonnement supprimé → subscription.deleted) et unpaid /
// incomplete_expired (issues de dunning épuisé → subscription.updated), qui
// déclenchent tous ce recalcul et n'y comptent pas comme vivants.
// deno-lint-ignore no-explicit-any
// Un abonnement vivant porte-t-il CE palier ? metadata.plan_type d'abord
// (posé par create-checkout-session), price ID en repli (abonnements créés
// avant la pose de metadata, ou édités à la main dans le dashboard).
function portePlan(s: Stripe.Subscription, planType: string, envKey: string): boolean {
  if (s.metadata?.plan_type === planType) return true;
  const priceId = Deno.env.get(envKey) ?? "";
  return !!priceId && !!s.items?.data?.some((it: Stripe.SubscriptionItem) => it.price?.id === priceId);
}

async function recomputeStripeFlags(supabase: any, customerId: string) {
  const { data: subs } = await stripe.subscriptions.list({ customer: customerId, limit: 20 });
  const live = (subs ?? []).filter(
    (s: Stripe.Subscription) =>
      s.status === "active" || s.status === "trialing" || s.status === "past_due"
  );
  const hasBusiness = live.some((s: Stripe.Subscription) => portePlan(s, "business", "STRIPE_PRICE_BUSINESS"));
  const hasPro = live.some((s: Stripe.Subscription) => portePlan(s, "pro", "STRIPE_PRICE_PRO"));
  // ⚠️ is_business RECALCULÉ ICI, et pas seulement posé à l'achat (2026-08-09).
  // Sans cette ligne, la résiliation d'un Business Stripe faisait tomber
  // is_premium et is_pro mais laissait is_business à TRUE — pour toujours, et
  // en silence : un ex-abonné gardait le nom du palier, son grant de 3000 au
  // renouvellement (invoice.paid lit is_business en premier) et les avantages
  // qui s'y brancheront. C'est exactement la classe du « premium fantôme »
  // corrigée le 25/07, une couche plus haut.
  // Flags CUMULATIFS : un Business vaut aussi Pro — d'où le `|| hasBusiness`,
  // sans quoi un abonnement Business seul laisserait is_pro à false et
  // fermerait toutes les gates écrites en isPro.
  const update = {
    is_premium: live.length > 0,
    is_pro: hasPro || hasBusiness,
    is_business: hasBusiness,
    subscription_cancel_at_period_end:
      live.length > 0 && live.every((s: Stripe.Subscription) => s.cancel_at_period_end),
  };
  await supabase.from("profiles").update(update).eq("stripe_customer_id", customerId);
  console.log(
    "[webhook] recomputed flags for", customerId,
    "live subs:", live.length, "→", JSON.stringify(update)
  );
}

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
        const montantPack = session.amount_total != null
          ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}`
          : null;
        if (creditErr) {
          console.error("[webhook] credit coins failed:", creditErr.message);
          await alerterPaiementNonCredite({
            canal: "stripe", type: "pack", user_id: packUserId, email: email ?? null,
            produit: session.metadata?.coin_pack ?? `${coins} Pépites`,
            montant: montantPack, ref: `stripe:${session.id}`, rpc: null, erreur: creditErr.message,
          });
        } else {
          console.log(`[webhook] coins pack → user=${packUserId} coins=${coins}`, JSON.stringify(credit));
          // credited=false = event Stripe rejoué, déjà crédité → pas de mail.
          if ((credit as { credited?: boolean })?.credited === true) {
            await notifierPaiement({
              canal: "stripe", type: "pack", user_id: packUserId, email: email ?? null,
              produit: session.metadata?.coin_pack ?? `${coins} Pépites`,
              montant: montantPack, pepites: coins, ref: `stripe:${session.id}`, rpc: credit,
            });
          }
        }
      } else {
        console.error("[webhook] coins session without user_id/coins metadata:", session.id);
        // Paiement encaissé par Stripe mais métadonnées inexploitables : sans
        // user_id ni montant de Pépites, aucun crédit possible automatiquement.
        await alerterPaiementNonCredite({
          canal: "stripe", type: "pack", email: email ?? null,
          produit: session.metadata?.coin_pack ?? null,
          montant: session.amount_total != null
            ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}`
            : null,
          ref: `stripe:${session.id}`, rpc: null,
          erreur: "Session de pack sans user_id ou sans nombre de Pépites dans les métadonnées.",
        });
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
      // Flags CUMULATIFS (migration 20260808213000) : Business ⊇ Pro ⊇ Premium.
      // Un Business reçoit donc AUSSI is_pro — sinon toutes les gates écrites
      // en isPro (republication auto, outils Excel avancés…) se fermeraient
      // pour le palier le plus cher.
      if (planType === "pro" || planType === "business") {
        profileUpdate.is_pro = true;
      }
      if (planType === "business") {
        profileUpdate.is_business = true;
      }

      await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("email", email);

      // Atomically increment founder slot counter
      if (planType === "founder") {
        await supabase.rpc("increment_founder_slots");
      }

      // Pièces incluses créditées dès l'activation. Depuis le cycle par
      // utilisateur (2026-07-28), on transmet AUSSI l'échéance réelle du
      // store : current_period_end de l'abonnement fraîchement créé fixe la
      // date du prochain grant. Sans elle, le cycle retomberait sur la date
      // d'inscription — pas faux, mais décalé par rapport à la facturation.
      // Lecture tolérante : un échec ici ne doit jamais empêcher le crédit,
      // la RPC sait retomber sur l'ancrage.
      let periodEnd: string | null = null;
      try {
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          if (sub?.current_period_end) {
            periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          }
        }
      } catch (e) {
        console.error("[webhook] current_period_end illisible:", (e as Error)?.message);
      }
      // 'business' TESTÉ EN PREMIER : upgrade_monthly_grant n'accepte que
      // 'free'|'premium'|'pro'|'business' (migration 20260808214000) et le
      // grant Business vaut 3000 (coin_config.monthly_grant_business). Sans ce
      // cran, un abonné Business payé 59,99 € recevait le grant Premium.
      const grantTier = planType === "business" ? "business" : planType === "pro" ? "pro" : "premium";
      const { data: grantRes, error: grantErr } = await supabase.rpc("upgrade_monthly_grant", {
        p_user_id: users[0].id,
        p_tier: grantTier,
        p_period_end: periodEnd,
        p_source: "payment",
      });
      const montantAbo = session.amount_total != null
        ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}`
        : null;
      if (grantErr) {
        console.error("[webhook] upgrade_monthly_grant:", grantErr.message);
        await alerterPaiementNonCredite({
          canal: "stripe", type: "abonnement", user_id: users[0].id, email: email ?? null,
          produit: planType, montant: montantAbo, ref: `stripe:${session.id}`,
          rpc: null, erreur: grantErr.message,
        });
      } else if ((grantRes as { granted?: boolean })?.granted === true) {
        await notifierPaiement({
          canal: "stripe", type: "abonnement", user_id: users[0].id, email: email ?? null,
          produit: planType, montant: montantAbo,
          pepites: (grantRes as { amount?: number })?.amount ?? null,
          ref: `stripe:${session.id}`, rpc: grantRes,
        });
      }
    }

    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tiktok-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "Purchase", value: 9.99, currency: "EUR" }),
    }).catch(() => {});
  }

  // Renouvellements d'abonnement : re-crédit des pièces incluses, idempotent
  // par période. Activation de l'événement VÉRIFIÉE dans le dashboard le
  // 2026-07-28 — l'endpoint « Fill & Sell webhook » écoute bien les quatre
  // événements que ce fichier traite : checkout.session.completed,
  // customer.subscription.deleted, customer.subscription.updated, invoice.paid.
  // C'est la configuration Stripe qui fait foi : si quelqu'un la modifie, les
  // abonnés cessent d'être crédités et ops-digest le signale (section 6,
  // « renouvellement non constaté »).
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, is_pro, is_business")
      .eq("stripe_customer_id", customerId)
      .limit(1);
    if (profs && profs.length > 0) {
      // upgrade_monthly_grant : identique à grant_monthly_coins au 1er du mois
      // (délégation si mois vierge) ; en cours de mois, la facture de proration
      // d'un upgrade sert de filet si le top-up synchrone de
      // create-checkout-session a raté (idempotent, no-op sinon).
      // is_business testé d'abord (2026-08-08) : Business n'existe pas côté
      // Stripe, mais un Business mobile qui porterait AUSSI un abonnement
      // Stripe résiduel ne doit pas voir son grant rétrogradé à 'pro'.
      const tier = profs[0].is_business ? "business" : profs[0].is_pro ? "pro" : "premium";
      // Fin de la période facturée = échéance du prochain grant. C'est LE
      // signal de renouvellement : depuis le cycle par utilisateur, un compte
      // à canal de paiement n'est plus crédité que sur cet événement (le sweep
      // ne rattrape qu'un retard de 3 jours). D'où p_source: "payment".
      const invPeriodEnd = invoice.lines?.data?.[0]?.period?.end ?? invoice.period_end;
      const { data: grantRes, error: grantErr } = await supabase.rpc("upgrade_monthly_grant", {
        p_user_id: profs[0].id,
        p_tier: tier,
        p_period_end: invPeriodEnd ? new Date(invPeriodEnd * 1000).toISOString() : null,
        p_source: "payment",
      });
      const montantFacture = invoice.amount_paid != null
        ? `${(invoice.amount_paid / 100).toFixed(2)} ${(invoice.currency ?? "eur").toUpperCase()}`
        : null;
      if (grantErr) {
        console.error("[webhook] invoice.paid grant:", grantErr.message);
        await alerterPaiementNonCredite({
          canal: "stripe", type: "abonnement", user_id: profs[0].id, produit: tier,
          montant: montantFacture, ref: invoice.id ?? null, rpc: null, erreur: grantErr.message,
        });
      } else {
        console.log(`[webhook] invoice.paid grant → user=${profs[0].id} tier=${tier}`);
        // granted=false : facture de proration ou event rejoué sur un cycle
        // déjà crédité — le renouvellement n'a rien ajouté, donc pas de mail.
        if ((grantRes as { granted?: boolean })?.granted === true) {
          await notifierPaiement({
            canal: "stripe", type: "abonnement", user_id: profs[0].id, produit: tier,
            montant: montantFacture,
            pepites: (grantRes as { amount?: number })?.amount ?? null,
            ref: invoice.id ?? null, rpc: grantRes,
          });
        }
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    console.log(
      "[webhook] subscription.deleted for customer:", customerId,
      "plan_type:", subscription.metadata?.plan_type ?? "?",
      "price:", subscription.items?.data?.[0]?.price?.id ?? "?"
    );

    // Plus JAMAIS is_premium/is_pro à false en bloc : l'abonnement supprimé a
    // déjà le statut canceled, recomputeStripeFlags ne compte que ce qui reste.
    // Un seul abonnement existait → tout tombe (correct) ; un double historique
    // Premium+Pro → l'autre survit.
    await recomputeStripeFlags(supabase, customerId);
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const status = subscription.status;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;

    console.log("[webhook] subscription.updated for customer:", customerId, "status:", status, "cancel_at_period_end:", cancelAtPeriodEnd);

    if (status === "unpaid" || status === "incomplete_expired") {
      // Même logique que subscription.deleted : recalcul depuis ce qui reste
      // de vivant, jamais de double remise à zéro aveugle (un double-abo
      // historique dont SEUL le Premium tombe en unpaid garde son Pro).
      await recomputeStripeFlags(supabase, customerId);
    } else {
      await supabase
        .from("profiles")
        .update({ subscription_cancel_at_period_end: cancelAtPeriodEnd })
        .eq("stripe_customer_id", customerId);
    }
  }

  // ── Échec de paiement client (2026-08-07, cas Matt) ─────────────────────────
  // Deux événements, deux nuances du même trou :
  //   · invoice.payment_failed : la tentative a eu lieu et a échoué (carte
  //     refusée, expirée, 3DS refusé par la banque) — souscription OU
  //     renouvellement (billing_reason les distingue) ;
  //   · invoice.payment_action_required : la banque attend une validation
  //     3D Secure que le client n'a jamais faite (le cas Matt exactement).
  // ⚠️ Ces événements doivent AUSSI être cochés sur l'endpoint dans le
  // dashboard Stripe — sans ça, ce code ne reçoit rien. La ligne de log
  // ci-dessous est le témoin de bout en bout : un « Send test event » depuis
  // le dashboard doit la faire apparaître dans les logs de la fonction ET
  // déclencher l'alerte ops (avec « compte introuvable », normal sur un
  // event de test aux données factices).
  // Le mail client, l'alerte Nico et la dédup par facture vivent dans
  // email-tunnel (mode payment_failed) — ici on ne fait qu'établir les FAITS
  // (qui, quelle cause, quel contexte) puis signaler. Toujours 200 à Stripe :
  // un échec de notification ne doit jamais faire rejouer l'événement.
  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = (invoice.customer as string | null) ?? null;
    console.log(
      `[webhook] échec de paiement reçu: ${event.type} facture=${invoice.id} ` +
      `customer=${customerId ?? "?"} billing_reason=${invoice.billing_reason ?? "?"} ` +
      `amount_due=${invoice.amount_due ?? "?"}`
    );

    let userId: string | null = null;
    let lang: string | null = null;
    if (customerId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, lang")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      userId = prof?.id ?? null;
      lang = prof?.lang ?? null;
    }

    // Cause FINE via le PaymentIntent : authentication_required ≠ carte
    // refusée — pour le client, ça change tout (l'un se règle en revalidant,
    // l'autre en changeant de carte). Lecture best-effort : une cause
    // illisible donne 'autre', jamais un blocage.
    let cause: "3ds" | "carte_refusee" | "carte_expiree" | "autre" =
      event.type === "invoice.payment_action_required" ? "3ds" : "autre";
    let code: string | null = null;
    try {
      const piId = invoice.payment_intent as string | null;
      if (piId) {
        const pi = await stripe.paymentIntents.retrieve(piId);
        const err = pi.last_payment_error;
        if (pi.status === "requires_action" || err?.code === "authentication_required") {
          cause = "3ds";
        } else if (err?.code === "expired_card" || err?.decline_code === "expired_card") {
          cause = "carte_expiree";
        } else if (err?.code === "card_declined") {
          cause = "carte_refusee";
          code = err?.decline_code ?? null;
        } else if (err) {
          code = err.code ?? null;
        }
      }
    } catch (e) {
      console.warn("[webhook] PaymentIntent illisible (cause générique):", (e as Error)?.message);
    }

    // Libellé du plan dans le mail d'échec — purement informatif, mais il doit
    // nommer le bon palier : Business d'abord (le plus cher, celui dont l'échec
    // coûte le plus à laisser filer).
    const portePrix = (envKey: string) => {
      const priceId = Deno.env.get(envKey) ?? "";
      return !!priceId && (invoice.lines?.data ?? []).some(
        (l: Stripe.InvoiceLineItem) => l.price?.id === priceId
      );
    };
    const nomPlan = portePrix("STRIPE_PRICE_BUSINESS") ? "Business"
      : portePrix("STRIPE_PRICE_PRO") ? "Pro"
      : "Premium";
    await signalerPaiementEchoue({
      user_id: userId,
      email: invoice.customer_email ?? null,
      lang,
      invoice_id: invoice.id,
      cause,
      code,
      contexte: invoice.billing_reason === "subscription_create" ? "souscription" : "renouvellement",
      montant: invoice.amount_due != null
        ? `${(invoice.amount_due / 100).toFixed(2)} ${(invoice.currency ?? "eur").toUpperCase()}`
        : null,
      plan: nomPlan,
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
