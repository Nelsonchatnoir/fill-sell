import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { notifierPaiement, alerterPaiementNonCredite, signalerPaiementEchoue } from "../_shared/payment-notify.ts";
import { drapeauxDepuisStripe, miseAJourProfilDepuisStripe, estAbonnementCloud } from "../_shared/cloud-option.js";
import { faitsEchec } from "../_shared/paiement-echoue.js";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// ── L'OPTION « FILLSELL CLOUD » (04/10/2026) ─────────────────────────────────
// Un abonnement Stripe À PART (prix STRIPE_PRICE_CLOUD, 20 €/mois, essai 7 j,
// metadata.option = "cloud"), ouvert à tous, comptes Free compris. Il ne pose
// JAMAIS is_premium / is_pro / is_business, ne crédite AUCUN quota, et continue
// si le palier tombe. Règles : _shared/cloud-option.js (testé par
// scripts/option-cloud-selftest.mjs).
function prixConnus() {
  return {
    standard: Deno.env.get("STRIPE_PRICE_STANDARD") ?? "",
    pro: Deno.env.get("STRIPE_PRICE_PRO") ?? "",
    business: Deno.env.get("STRIPE_PRICE_BUSINESS") ?? "",
    cloud: Deno.env.get("STRIPE_PRICE_CLOUD") ?? "",
  };
}

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

// ── LA FACTURE D'UNE MONTÉE DE PALIER (2026-09-24, Jocabroc / Klarna) ────────
// create-checkout-session bascule l'abonnement existant en
// `pending_if_incomplete` : la montée ne s'applique qu'une fois la facture de
// différence PAYÉE — sur-le-champ (carte), ou par le client sur la page Stripe
// (Klarna, Amazon Pay, Link, 3-D Secure…). C'est ICI, sur invoice.paid, que le
// palier se pose alors : flags et Pépites, jamais avant le paiement.
// Le palier visé se lit sur la marque posée par create-checkout-session
// (metadata.fillsell_upgrade_vers) ; à défaut (montée payée à l'instant, avant
// que la marque ne soit posée), sur les lignes POSITIVES d'une facture de
// changement d'abonnement (billing_reason subscription_update).
// ⚠️ DEUX FORMES D'OBJETS (relevé le 24/09) : l'endpoint Stripe rend ses
//    événements au format d'API `2026-03-25.dahlia`, pas au 2023-10-16 du SDK.
//    Là, `invoice.subscription` et `line.price` n'existent plus : l'abonnement
//    est sous `parent.subscription_details.subscription`, le prix sous
//    `pricing.price_details.price`. On lit les deux.
// deno-lint-ignore no-explicit-any
function prixDeLigne(l: any): string | null {
  return l?.price?.id ?? l?.pricing?.price_details?.price ?? null;
}
// deno-lint-ignore no-explicit-any
function abonnementDeFacture(invoice: any): string | null {
  const s = invoice?.subscription ?? invoice?.parent?.subscription_details?.subscription ?? null;
  return typeof s === "string" ? s : (s?.id ?? null);
}
function planDeMontee(invoice: Stripe.Invoice): "pro" | "business" | null {
  const marque = String(invoice.metadata?.fillsell_upgrade_vers ?? "");
  if (marque === "pro" || marque === "business") return marque;
  if (invoice.billing_reason !== "subscription_update") return null;
  const lignes = invoice.lines?.data ?? [];
  const porte = (envKey: string) => {
    const priceId = Deno.env.get(envKey) ?? "";
    return !!priceId && lignes.some((l: Stripe.InvoiceLineItem) => (l.amount ?? 0) > 0 && prixDeLigne(l) === priceId);
  };
  if (porte("STRIPE_PRICE_BUSINESS")) return "business";
  if (porte("STRIPE_PRICE_PRO")) return "pro";
  return null;
}

// Le palier d'un abonnement lu sur son PRIX seul (jamais sa métadonnée) : c'est
// lui qui fait foi après une mise à jour en attente appliquée.
function planDuPrix(s: Stripe.Subscription): string | null {
  const ids = (s.items?.data ?? []).map((it: Stripe.SubscriptionItem) => it.price?.id ?? "");
  for (const [plan, envKey] of [["business", "STRIPE_PRICE_BUSINESS"], ["pro", "STRIPE_PRICE_PRO"], ["standard", "STRIPE_PRICE_STANDARD"]] as const) {
    const priceId = Deno.env.get(envKey) ?? "";
    if (priceId && ids.includes(priceId)) return plan;
  }
  return null;
}

async function recomputeStripeFlags(supabase: any, customerId: string) {
  const { data: subs } = await stripe.subscriptions.list({ customer: customerId, limit: 20 });
  // ⚠️ is_business RECALCULÉ ICI, et pas seulement posé à l'achat (2026-08-09).
  // Sans cette ligne, la résiliation d'un Business Stripe faisait tomber
  // is_premium et is_pro mais laissait is_business à TRUE — pour toujours, et
  // en silence : un ex-abonné gardait le nom du palier, son grant de 3000 au
  // renouvellement (invoice.paid lit is_business en premier) et les avantages
  // qui s'y brancheront. C'est exactement la classe du « premium fantôme »
  // corrigée le 25/07, une couche plus haut.
  // Flags CUMULATIFS : un Business vaut aussi Pro — sans quoi un abonnement
  // Business seul laisserait is_pro à false et fermerait toutes les gates
  // écrites en isPro.
  //
  // (04/10) Le calcul vit dans drapeauxDepuisStripe : mêmes règles qu'avant
  // pour les paliers (tout abonnement vivant hors Cloud vaut premium ; pro /
  // business par métadonnée plan_type, prix en repli ; vivant = active |
  // trialing | past_due). Les abonnements Cloud (metadata.option = "cloud")
  // n'y entrent JAMAIS : ils posent is_cloud et l'essai, rien d'autre — Cloud
  // seul ne rend jamais premium, et Cloud continue si le palier tombe. Les
  // colonnes Cloud ne bougent que si Stripe porte l'option (ou personne).
  const d = drapeauxDepuisStripe(subs ?? [], prixConnus());
  const { data: prof } = await supabase
    .from("profiles").select("cloud_canal").eq("stripe_customer_id", customerId).maybeSingle();
  const update = miseAJourProfilDepuisStripe(d, prof?.cloud_canal ?? null);
  await supabase.from("profiles").update(update).eq("stripe_customer_id", customerId);
  console.log(
    "[webhook] recomputed flags for", customerId,
    "live subs:", (subs ?? []).filter((s: Stripe.Subscription) => ["active", "trialing", "past_due"].includes(s.status)).length,
    "→", JSON.stringify(update)
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
      // Conversion TikTok RETIRÉE le 7 septembre 2026 (décision Nico) : plus
      // aucune donnée d'achat ne part vers une régie publicitaire.
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── L'ABONNEMENT CLOUD (04/10/2026) ─────────────────────────────────────
    // ⛔ AVANT le chemin des paliers, qui pose is_premium = true pour toute
    // session d'abonnement. Une session Cloud ne pose QUE les colonnes Cloud
    // (relues chez Stripe) et ne crédite aucun quota.
    if (session.metadata?.option === "cloud") {
      const cible = session.metadata?.fillsell_user_id || null;
      const { data: qui } = cible
        ? await supabase.from("profiles").select("id").eq("id", cible).maybeSingle()
        : await supabase.from("profiles").select("id").eq("email", email ?? "").maybeSingle();
      if (qui?.id) {
        await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", qui.id);
        // ── LE 4e VERROU : LA CARTE (05/10) ─────────────────────────────────
        // Un essai Cloud = une carte. Son empreinte Stripe (card.fingerprint),
        // hachée en base (cloud_essai_noter_carte), déjà vue sur l'essai d'un
        // AUTRE compte → l'abonnement d'essai est annulé SUR-LE-CHAMP (rien
        // n'est prélevé), l'essai compte comme pris, et la raison est écrite
        // pour que l'app la dise. Best-effort sur la LECTURE de la carte (une
        // carte illisible ne bloque pas un client), jamais sur le verdict.
        let carteRefusee = false;
        if (session.metadata?.essai_cloud === "1" && session.subscription) {
          try {
            const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
            const sub = await stripe.subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
            let pm = sub.default_payment_method as Stripe.PaymentMethod | string | null;
            if (!pm || typeof pm === "string") {
              const client = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] }) as Stripe.Customer;
              pm = (client.invoice_settings?.default_payment_method ?? null) as Stripe.PaymentMethod | string | null;
            }
            const empreinte = pm && typeof pm !== "string" ? pm.card?.fingerprint ?? null : null;
            if (!empreinte) {
              console.warn(`[webhook] essai Cloud ${subId} : empreinte de carte illisible — verrou carte non appliqué`);
            } else {
              const { data: verdict, error: errCarte } = await supabase.rpc("cloud_essai_noter_carte", { p_user: qui.id, p_carte: empreinte });
              if (errCarte) console.error(`[webhook] cloud_essai_noter_carte : ${errCarte.message}`);
              else if (verdict?.ok === false && verdict?.raison === "carte_deja_vue") {
                await stripe.subscriptions.cancel(subId);
                carteRefusee = true;
                console.log(`[webhook] essai Cloud ${subId} ANNULÉ : carte déjà utilisée pour l'essai d'un autre compte (rien prélevé)`);
              }
            }
          } catch (e) {
            console.error(`[webhook] verrou carte de l'essai Cloud : ${(e as Error)?.message ?? e}`);
          }
        }
        await recomputeStripeFlags(supabase, customerId);
        if (carteRefusee) {
          await supabase.from("profiles").update({ cloud_essai_refus: "carte_deja_vue" }).eq("id", qui.id);
        }
        console.log(`[webhook] abonnement Cloud créé → user=${qui.id} session=${session.id} essai=${session.metadata?.essai_cloud ?? "?"}${carteRefusee ? " (refusé : carte déjà vue)" : ""}`);
      } else {
        console.error(`[webhook] session Cloud ${session.id} : compte introuvable (user=${cible ?? "?"}, email=${email ?? "?"})`);
        await alerterPaiementNonCredite({
          canal: "stripe", type: "abonnement", email: email ?? null, produit: "cloud",
          ref: `stripe:${session.id}`, rpc: null,
          erreur: "Abonnement Cloud (essai ou payé) sans compte FillSell retrouvé.",
        });
      }
      return new Response(JSON.stringify({ received: true, cloud: true }), {
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

    // Conversion TikTok RETIRÉE le 7 septembre 2026 (décision Nico).
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
    // ── LA FACTURE D'UN ABONNEMENT CLOUD (04/10/2026) ───────────────────────
    // Fin d'essai (première facture à 20 €), renouvellement, ou facture à 0 € de
    // la création : on relit les colonnes Cloud chez Stripe et on SORT — le
    // chemin des paliers ci-dessous créditerait les quotas du palier du compte
    // sur une facture Cloud.
    const subIdFacture = abonnementDeFacture(invoice);
    if (subIdFacture) {
      try {
        const sub = await stripe.subscriptions.retrieve(subIdFacture);
        if (estAbonnementCloud(sub, prixConnus())) {
          await recomputeStripeFlags(supabase, customerId);
          console.log(`[webhook] facture Cloud ${invoice.id} (${sub.id}, statut ${sub.status}, ${invoice.amount_paid ?? "?"} ${invoice.currency ?? ""}) : colonnes Cloud relues, aucun quota`);
          return new Response(JSON.stringify({ received: true, cloud: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.error(`[webhook] abonnement ${subIdFacture} de la facture ${invoice.id} illisible : ${(e as Error)?.message ?? e}`);
      }
    }
    // ── MONTÉE DE PALIER PAYÉE (2026-09-24) ─────────────────────────────────
    // Le paiement de la différence est CONFIRMÉ : c'est maintenant, et
    // seulement maintenant, que le palier se pose. Flags CUMULATIFS (Business ⊇
    // Pro ⊇ Premium), métadonnée de l'abonnement et annulation programmée levée
    // — celles-ci seulement une fois la mise à jour réellement appliquée (plus
    // de pending_update), sinon customer.subscription.updated s'en charge.
    const montee = planDeMontee(invoice);
    if (montee) {
      const { error: flagsErr } = await supabase
        .from("profiles")
        .update({ is_premium: true, is_pro: true, ...(montee === "business" ? { is_business: true } : {}) })
        .eq("stripe_customer_id", customerId);
      if (flagsErr) console.error(`[webhook] montée ${montee} payée — flags non posés : ${flagsErr.message}`);
      const subId = abonnementDeFacture(invoice);
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          if (!sub.pending_update && (sub.metadata?.plan_type !== montee || sub.cancel_at_period_end)) {
            await stripe.subscriptions.update(subId, {
              metadata: { ...(sub.metadata ?? {}), plan_type: montee },
              cancel_at_period_end: false,
            });
          }
        } catch (e) {
          const se = e as { code?: string; message?: string };
          console.error(`[webhook] montée ${montee} payée — metadata de ${subId} non posée : code=${se?.code ?? "?"} message=${se?.message ?? e}`);
        }
      }
      console.log(`[webhook] montée de palier PAYÉE → ${montee} (facture ${invoice.id}, customer ${customerId}, ${invoice.amount_paid ?? "?"} ${invoice.currency ?? ""})`);
    }
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
      // Une montée payée donne SON palier, quel que soit l'ordre d'arrivée des
      // événements (les flags viennent d'être posés juste au-dessus).
      const tier = montee ?? (profs[0].is_business ? "business" : profs[0].is_pro ? "pro" : "premium");
      // Fin de la période facturée = échéance du prochain grant. C'est LE
      // signal de renouvellement : depuis le cycle par utilisateur, un compte
      // à canal de paiement n'est plus crédité que sur cet événement (le sweep
      // ne rattrape qu'un retard de 3 jours). D'où p_source: "payment".
      // ⛔ La fin de période la PLUS TARDIVE des lignes, jamais la ligne 0
      // (2026-09-26, XEWER recalé sur le 1er du mois) : sur une facture de
      // proration, Stripe range TOUJOURS le crédit « Temps non utilisé » en
      // premier (relevé sur les 41 factures du compte). Quand l'ancrage de
      // facturation change, ce crédit s'arrête à l'ANCIENNE échéance : lue en
      // ligne 0, elle reposait next_grant_at sur l'ancien cycle et le balayage
      // y aurait fait une seconde recharge. Neutre partout ailleurs : facture à
      // une ligne = même valeur ; les 4 factures multi-lignes de l'historique
      // (montées de palier) ont toutes leurs lignes sur la même échéance.
      const finsDeLignes = (invoice.lines?.data ?? [])
        // deno-lint-ignore no-explicit-any
        .map((l: any) => l?.period?.end)
        .filter((e: unknown): e is number => typeof e === "number" && e > 0);
      const invPeriodEnd = finsDeLignes.length > 0 ? Math.max(...finsDeLignes) : invoice.period_end;
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

    // ── LE PRIX A CHANGÉ : UNE MONTÉE EN ATTENTE VIENT D'ÊTRE APPLIQUÉE
    //    (2026-09-24) ─────────────────────────────────────────────────────────
    // Filet d'invoice.paid : si la facture est arrivée avant que Stripe
    // n'applique la mise à jour, la métadonnée de palier n'a pas pu suivre. Le
    // prix fait foi : métadonnée réalignée (le rang de create-checkout-session
    // la lit en premier) et flags recalculés depuis Stripe. Jamais pendant une
    // mise à jour encore en attente — rien n'est payé.
    const precedent = ((event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes) ?? {};
    const prixChange = "items" in precedent || "plan" in precedent;
    // (04/10) Un abonnement Cloud se relit à chaque changement (fin d'essai,
    // résiliation programmée ou levée, impayé) et ne passe JAMAIS par le
    // réalignement de métadonnée de palier ci-dessous.
    if (estAbonnementCloud(subscription, prixConnus())) {
      // Arrêt demandé PENDANT l’essai (portail Stripe, dashboard) : effet immédiat,
      // comme le bouton de l’app (palier.js : rien facturé, l’essai s’arrête).
      if (status === "trialing" && cancelAtPeriodEnd) {
        try {
          await stripe.subscriptions.cancel(subscription.id);
          console.log(`[webhook] essai Cloud ${subscription.id} arrêté tout de suite (résiliation pendant l’essai)`);
        } catch (e) {
          console.error(`[webhook] arrêt immédiat de l’essai Cloud ${subscription.id} impossible : ${(e as Error)?.message ?? e}`);
        }
      }
      console.log(`[webhook] abonnement Cloud ${subscription.id} mis à jour (statut ${status}, annulation ${cancelAtPeriodEnd}) → relecture`);
      await recomputeStripeFlags(supabase, customerId);
      return new Response(JSON.stringify({ received: true, cloud: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (prixChange && !subscription.pending_update
        && (status === "active" || status === "trialing" || status === "past_due")) {
      const plan = planDuPrix(subscription);
      if (plan && subscription.metadata?.plan_type !== plan) {
        try {
          await stripe.subscriptions.update(subscription.id, { metadata: { ...(subscription.metadata ?? {}), plan_type: plan } });
        } catch (e) {
          const se = e as { code?: string; message?: string };
          console.error(`[webhook] metadata de palier non réalignée sur ${subscription.id} : code=${se?.code ?? "?"} message=${se?.message ?? e}`);
        }
      }
      await recomputeStripeFlags(supabase, customerId);
    }

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
    // ── MONTÉE DE PALIER EN ATTENTE DE VALIDATION (2026-09-24) ──────────────
    // Une facture de différence (billing_reason subscription_update) qui
    // réclame une action du client n'est PAS un échec : create-checkout-session
    // vient d'ouvrir sa page Stripe au client, qui la valide lui-même. Aucun
    // mail « paiement échoué », aucune alerte : s'il abandonne, Stripe annule la
    // facture et la mise à jour à l'échéance, et il reste à son palier.
    if (invoice.billing_reason === "subscription_update") {
      console.log(`[webhook] ${event.type} sur la facture de MONTÉE ${invoice.id} : le client valide sur la page Stripe — ni mail ni alerte`);
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── POURQUOI LE MAIL CLIENT N'EST JAMAIS PARTI (relevé du 19/09/2026) ────
    // Zéro ligne 'payment_failed:%' dans email_logs depuis la mise en service
    // du 07/08, alors que des échecs RÉELS ont eu lieu (05/09 et 08/09, tous
    // deux traités à la main ensuite). La cause n'est ni Stripe, ni la dédup :
    // email-tunnel n'envoie au client que si user_id ET email sont présents,
    // et user_id arrivait à NULL.
    //
    // profiles.stripe_customer_id n'est écrit qu'APRÈS un paiement abouti
    // (checkout.session.completed / invoice.paid) ou sur le chemin d'upgrade
    // in situ. Une PREMIÈRE souscription qui échoue ne l'a donc jamais écrit :
    // la recherche par customer id ne rend rien, et tous les échecs observés
    // étaient précisément des premières souscriptions. L'alerte ops partait
    // bien (elle, ne dépend de rien) — c'est pour ça que l'incident était vu
    // sans que le client soit prévenu.
    //
    // Second filet : l'ADRESSE de la facture. C'est celle que la personne a
    // saisie dans Checkout, et elle existe dès la première tentative.
    let userId: string | null = null;
    let lang: string | null = null;
    let emailCompte: string | null = null;
    if (customerId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, lang, email")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      userId = prof?.id ?? null;
      lang = prof?.lang ?? null;
      emailCompte = prof?.email ?? null;
    }
    const emailFacture = invoice.customer_email ?? null;
    if (!userId && emailFacture) {
      const adresse = emailFacture.trim().toLowerCase();
      const { data: parMail } = await supabase
        .from("profiles")
        .select("id, lang, email")
        .ilike("email", adresse)
        .maybeSingle();
      if (parMail?.id) {
        userId = parMail.id;
        lang = lang ?? parMail.lang ?? null;
        emailCompte = emailCompte ?? parMail.email ?? null;
        console.log(`[webhook] compte retrouvé par adresse (pas de stripe_customer_id) : ${userId}`);
      }
    }

    // ── LES FAITS, RELUS CHEZ STRIPE (05/10/2026) ───────────────────────────
    // L'événement arrive au format d'API de l'endpoint (2026-03-25.dahlia,
    // relevé du 24/09, cf. abonnementDeFacture) : ni `payment_intent` ni
    // `subscription` à la racine de la facture — la cause fine ne se lisait
    // donc jamais (« autre », ou « 3ds » sur action_required). On RELIT la
    // facture par le SDK, épinglé au 2023-10-16 (payment_intent, subscription,
    // status, hosted_invoice_url, next_payment_attempt, lignes et périodes),
    // puis son abonnement (trial_end, status, option Cloud). Une lecture ratée
    // = l'événement seul, jamais un blocage : le mail part, sans bouton de
    // facture s'il n'y en a pas. Règles et textes : _shared/paiement-echoue.js.
    // deno-lint-ignore no-explicit-any
    let facture: any = invoice;
    try {
      if (invoice.id) facture = await stripe.invoices.retrieve(invoice.id);
    } catch (e) {
      console.warn(`[webhook] facture ${invoice.id} non relue, l'événement seul fait foi : ${(e as Error)?.message ?? e}`);
    }
    // deno-lint-ignore no-explicit-any
    let abonnement: any = null;
    const subEchec = abonnementDeFacture(facture) ?? abonnementDeFacture(invoice);
    if (subEchec) {
      try {
        abonnement = await stripe.subscriptions.retrieve(subEchec);
      } catch (e) {
        console.warn(`[webhook] abonnement ${subEchec} non relu (ni fin d'essai, ni « reste actif ») : ${(e as Error)?.message ?? e}`);
      }
    }

    // Cause FINE via le PaymentIntent : authentication_required ≠ carte
    // refusée — pour le client, ça change tout (l'un se règle en revalidant,
    // l'autre en changeant de carte). Lecture best-effort : une cause
    // illisible donne 'autre', jamais un blocage.
    let cause: "3ds" | "carte_refusee" | "carte_expiree" | "autre" =
      event.type === "invoice.payment_action_required" ? "3ds" : "autre";
    let code: string | null = null;
    try {
      // deno-lint-ignore no-explicit-any
      const piBrut = facture?.payment_intent ?? (invoice as any)?.payment_intent ?? null;
      const piId = typeof piBrut === "string" ? piBrut : (piBrut?.id ?? null);
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
      return !!priceId && (facture?.lines?.data ?? invoice.lines?.data ?? []).some(
        (l: Stripe.InvoiceLineItem) => prixDeLigne(l) === priceId
      );
    };
    const estCloud = abonnement ? estAbonnementCloud(abonnement, prixConnus()) : portePrix("STRIPE_PRICE_CLOUD");
    const nomPlan = estCloud ? "Cloud"
      : portePrix("STRIPE_PRICE_BUSINESS") ? "Business"
      : portePrix("STRIPE_PRICE_PRO") ? "Pro"
      : "Premium";
    // Fin d'essai = billing_reason subscription_cycle + une ligne dont
    // period.start === abonnement.trial_end ; bouton = hosted_invoice_url d'une
    // facture ouverte (jamais pour une souscription) ; relance =
    // next_payment_attempt ; « reste actif » = abonnement active | past_due.
    const faits = faitsEchec({ facture, abonnement, estCloud });
    console.log(
      `[webhook] échec ${invoice.id} : cause=${cause} contexte=${faits.contexte} ` +
      `bouton=${faits.contexte === "souscription" ? "app" : faits.lien_facture ? "facture" : "aucun"} ` +
      `relance=${faits.relance_le ?? "aucune"} actif=${faits.abonnement_actif} offre=${faits.offre ?? "-"}`
    );
    await signalerPaiementEchoue({
      user_id: userId,
      // L'adresse de la facture d'abord (celle que la personne vient de
      // saisir), le profil en repli — une facture sans customer_email ne doit
      // plus faire sauter le mail.
      email: emailFacture ?? emailCompte,
      lang,
      invoice_id: invoice.id,
      cause,
      code,
      contexte: faits.contexte as "souscription" | "renouvellement" | "fin_essai",
      montant: invoice.amount_due != null
        ? `${(invoice.amount_due / 100).toFixed(2)} ${(invoice.currency ?? "eur").toUpperCase()}`
        : null,
      plan: nomPlan,
      lien_facture: faits.lien_facture,
      relance_le: faits.relance_le,
      abonnement_actif: faits.abonnement_actif,
      offre: faits.offre,
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
