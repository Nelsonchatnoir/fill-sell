import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as x509 from "https://esm.sh/@peculiar/x509@1.9.0";
import { notifierPaiement, alerterPaiementNonCredite } from "../_shared/payment-notify.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Pro iOS : app.fillsell.pro.sub est resté bloqué en review Apple sans jamais
// être rattaché à un binaire (piège App Store Connect) — remplacé par
// app.fillsell.pro2.sub, soumis avec la 2.3 (2026-07-27). L'ancien id reste
// reconnu ici : des achats sandbox de dev peuvent exister, et ça ne coûte
// rien. Google Play garde app.fillsell.pro.sub — produit distinct, ce webhook
// n'en voit jamais.
const PRO_PRODUCT_IDS = ["app.fillsell.pro2.sub", "app.fillsell.pro.sub"];
// Business (2026-08-08) : MÊME id que Google Play — l'accident pro2 était une
// exception ASC, pas une convention. Flags CUMULATIFS : un Business porte
// is_premium + is_pro + is_business.
const BUSINESS_PRODUCT_IDS = ["app.fillsell.business.sub"];
const PREMIUM_PRODUCT_IDS = [
  "app.fillsell.premium.sub",
  "app.fillsell.premium.standard",
  ...PRO_PRODUCT_IDS,
  ...BUSINESS_PRODUCT_IDS,
];

const PREMIUM_ON  = ["SUBSCRIBED", "DID_RENEW", "RESUBSCRIBE"];
const PREMIUM_OFF = ["EXPIRED", "REFUND", "REVOKE", "DID_FAIL_TO_RENEW"];

// Packs de Pépites (consumables) — montants crédités par product id. Doit
// rester aligné avec validate-coin-purchase et src/components/coinPacks.js.
// Le SKU .1150 crédite 1300 (rebalance 2026-07-14, SKU non renommable en prod).
const COIN_PRODUCTS: Record<string, number> = {
  "app.fillsell.coins.100": 100,
  "app.fillsell.coins.220": 220,
  "app.fillsell.coins.460": 460,
  "app.fillsell.coins.1150": 1300,
};

// SHA-256 fingerprint of Apple Root CA - G3 (valid 2014–2039)
// Source: https://www.apple.com/certificateauthority/ + confirmed via developer.apple.com forums
const APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

function b64ToUint8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64urlToUint8(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "=");
  return b64ToUint8(padded);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verifies a JWS signed by Apple (App Store Server Notifications V2):
 *   1. Checks root cert fingerprint == Apple Root CA G3
 *   2. Verifies every cert in the x5c chain is signed by the next one
 *   3. Verifies the JWS signature with the leaf cert's public key
 * Throws on any failure — caller should treat this as a spoofed request.
 */
async function verifyAndDecodeJWS(jws: string): Promise<Record<string, unknown>> {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(
    new TextDecoder().decode(b64urlToUint8(headerB64))
  ) as { alg?: string; x5c?: string[] };

  if (header.alg !== "ES256") throw new Error(`Unexpected JWS algorithm: ${header.alg}`);

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new Error("x5c must contain at least 2 certificates");
  }

  // x5c uses standard base64 (not base64url): pass directly to X509Certificate
  const certs = x5c.map((b64) => new x509.X509Certificate(b64ToUint8(b64)));
  const leaf = certs[0];
  const root = certs[certs.length - 1];

  // Step 1 — root CA fingerprint
  const rootThumb = await root.getThumbprint("SHA-256");
  const rootHex = toHex(rootThumb);
  if (rootHex !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error(`Root CA fingerprint mismatch: got ${rootHex}`);
  }

  // Step 2 — certificate chain: each cert signed by the next
  for (let i = 0; i < certs.length - 1; i++) {
    const valid = await certs[i].verify({ publicKey: certs[i + 1] });
    if (!valid) throw new Error(`Certificate chain broken at position ${i}`);
  }

  // Step 3 — JWS signature with leaf public key (ECDSA P-256)
  const leafKey = await crypto.subtle.importKey(
    "spki",
    leaf.publicKey.rawData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlToUint8(signatureB64);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    leafKey,
    signature,
    signingInput
  );
  if (!valid) throw new Error("JWS signature verification failed");

  return JSON.parse(new TextDecoder().decode(b64urlToUint8(payloadB64)));
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const signedPayload = body?.signedPayload as string | undefined;

    if (!signedPayload) {
      return new Response(JSON.stringify({ error: "Missing signedPayload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify and decode the outer notification envelope
    let notification: Record<string, unknown>;
    try {
      notification = await verifyAndDecodeJWS(signedPayload);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[apple-iap-webhook] Rejected — outer JWS invalid:", msg);
      return new Response(JSON.stringify({ error: "Signature verification failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const notificationType = notification.notificationType as string;
    const data = notification.data as Record<string, unknown> | undefined;

    const signedTransactionInfo = data?.signedTransactionInfo as string | undefined;
    const signedRenewalInfo     = data?.signedRenewalInfo     as string | undefined;

    if (!signedTransactionInfo) {
      // DID_CHANGE_RENEWAL_STATUS peut arriver sans signedTransactionInfo
      if (notificationType === "DID_CHANGE_RENEWAL_STATUS" && signedRenewalInfo) {
        let renewal: Record<string, unknown>;
        try {
          renewal = await verifyAndDecodeJWS(signedRenewalInfo);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[apple-iap-webhook] Rejected — renewal JWS invalid:", msg);
          return new Response(JSON.stringify({ error: "Renewal JWS verification failed" }), {
            status: 403, headers: { "Content-Type": "application/json" },
          });
        }
        const autoRenewStatus     = renewal.autoRenewStatus     as number | undefined;
        const renewalToken        = renewal.appAccountToken     as string | undefined;
        const renewalProductId    = (renewal.productId || renewal.autoRenewProductId) as string | undefined;
        const renewalOriginalTxId = renewal.originalTransactionId as string | undefined;

        if (!renewalToken || !renewalProductId || !PREMIUM_PRODUCT_IDS.includes(renewalProductId)) {
          console.warn("[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS: missing token or non-premium product");
          return new Response(JSON.stringify({ ok: true, skipped: "missing_token_or_product" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        if (autoRenewStatus !== 1) {
          // Résiliation — miroir du type 3 CANCELED de google-play-webhook :
          // on note l'annulation SANS toucher aux flags d'accès (is_premium,
          // is_pro, is_founder, is_business) — l'abonné a payé jusqu'à la fin
          // de sa période. La rétrogradation reste portée exclusivement par
          // EXPIRED / REFUND / REVOKE / DID_FAIL_TO_RENEW.
          // renewalDate = fin de la période en cours (ms epoch), seul champ de
          // fin de période du signedRenewalInfo vérifié — même format ISO que
          // l'expiryTime Google dans subscription_period_end (colonne TEXT).
          const renewalDate = renewal.renewalDate as number | undefined;
          if (renewalDate == null) {
            console.warn("[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS cancel: renewalDate absent — subscription_period_end=null");
          }
          const { error: cancelErr } = await supabaseAdmin.from("profiles").update({
            subscription_cancel_at_period_end: true,
            subscription_period_end: renewalDate != null ? new Date(renewalDate).toISOString() : null,
          }).eq("id", renewalToken);
          if (cancelErr) {
            console.error("[apple-iap-webhook] DB error (cancel):", cancelErr.message);
            return new Response(JSON.stringify({ error: cancelErr.message }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
          console.log(`[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS cancelled → userId=${renewalToken} accès conservé jusqu'à ${renewalDate != null ? new Date(renewalDate).toISOString() : "(renewalDate absent)"}`);
          return new Response(JSON.stringify({ ok: true, cancel_at_period_end: true }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        const upd: Record<string, unknown> = { is_premium: true, subscription_cancel_at_period_end: false };
        if (renewalOriginalTxId) upd.apple_original_transaction_id = renewalOriginalTxId;
        if (renewalProductId === "app.fillsell.premium.sub") upd.is_founder = true;
        if (PRO_PRODUCT_IDS.includes(renewalProductId)) upd.is_pro = true;
        if (BUSINESS_PRODUCT_IDS.includes(renewalProductId)) { upd.is_pro = true; upd.is_business = true; }
        const { error } = await supabaseAdmin.from("profiles").update(upd).eq("id", renewalToken);
        if (error) {
          console.error("[apple-iap-webhook] DB error:", error.message);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        console.log(`[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS re-enabled → userId=${renewalToken} is_premium=true`);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, skipped: "no transaction" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Also verify the inner signedTransactionInfo
    let tx: Record<string, unknown>;
    try {
      tx = await verifyAndDecodeJWS(signedTransactionInfo);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[apple-iap-webhook] Rejected — transaction JWS invalid:", msg);
      return new Response(JSON.stringify({ error: "Transaction signature verification failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const appAccountToken        = tx.appAccountToken as string | undefined;
    const productId              = tx.productId as string;
    const originalTransactionId = tx.originalTransactionId as string | undefined;

    // Log immédiat — visible même si la suite échoue et qu'Apple réessaie
    console.log(
      `[apple-iap-webhook] received type=${notificationType} product=${productId} originalTransactionId=${originalTransactionId} appAccountToken=${appAccountToken ?? "MISSING"}`
    );

    if (!appAccountToken) {
      // Payload complet : c'est la SEULE trace qui permette un crédit manuel
      // a posteriori (transactionId + productId) quand l'utilisateur est
      // inidentifiable ici. Ne jamais réduire ce log.
      console.error("[apple-iap-webhook] No appAccountToken — cannot identify user — tx=", JSON.stringify(tx));
      // Payload inexploitable : de l'argent a pu être encaissé sans qu'on
      // sache pour qui. C'est exactement le cas à ne jamais laisser passer.
      if (COIN_PRODUCTS[productId] != null || PREMIUM_PRODUCT_IDS.includes(productId)) {
        await alerterPaiementNonCredite({
          canal: "apple",
          type: COIN_PRODUCTS[productId] != null ? "pack" : "abonnement",
          produit: productId,
          ref: (tx.transactionId as string) ?? null,
          erreur: "appAccountToken absent : impossible d'identifier le compte. "
                + "Retrouver l'utilisateur via la transaction dans App Store Connect.",
          rpc: null,
        });
      }
      return new Response(JSON.stringify({ ok: true, skipped: "no appAccountToken" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Consumables : packs de Pépites (2026-07-28) ───────────────────────
    // Apple envoie ONE_TIME_CHARGE pour chaque achat consumable. Jusqu'ici la
    // notification était jetée (« Unhandled type ») : si le client échouait
    // après facturation (app tuée, purchaseProduct rejeté pendant la feuille
    // de paiement) ET que le filet StoreKit ratait — il rate structurellement,
    // le plugin finish() la transaction AVANT de notifier le JS —, l'achat
    // était payé sans jamais être crédité. Vécu le 28/07 (pack 100 débité,
    // zéro appel à validate-coin-purchase, notification reçue ici et jetée).
    // Crédit avec la MÊME ref idempotente que validate-coin-purchase
    // (apple:<transactionId>) : webhook, client et filet peuvent tous rejouer,
    // credit_purchased_coins ne crédite qu'une seule fois.
    if (COIN_PRODUCTS[productId] != null) {
      if (notificationType !== "ONE_TIME_CHARGE") {
        // REFUND/CONSUMPTION_REQUEST d'un pack… : jamais de crédit ici, mais
        // payload loggé en entier (un remboursement de pack se traite à la main).
        console.warn(`[apple-iap-webhook] coin product, type=${notificationType} — skipped — tx=`, JSON.stringify(tx));
        return new Response(JSON.stringify({ ok: true, skipped: `coin_${notificationType}` }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      const montant = tx.price != null && tx.currency
        ? `${(Number(tx.price) / 1000).toFixed(2)} ${tx.currency}`
        : null;
      const transactionId = tx.transactionId as string | undefined;
      if (!transactionId) {
        console.error("[apple-iap-webhook] ONE_TIME_CHARGE sans transactionId — tx=", JSON.stringify(tx));
        await alerterPaiementNonCredite({
          canal: "apple", type: "pack", user_id: appAccountToken, produit: productId,
          montant, ref: null, rpc: null,
          erreur: "ONE_TIME_CHARGE sans transactionId : aucune référence idempotente possible.",
        });
        return new Response(JSON.stringify({ ok: true, skipped: "coin_no_transaction_id" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      const { data: credit, error: rpcErr } = await supabaseAdmin.rpc("credit_purchased_coins", {
        p_user_id: appAccountToken,
        p_amount: COIN_PRODUCTS[productId],
        p_ref: `apple:${transactionId}`,
        p_metadata: { productId, platform: "ios", source: "apple-iap-webhook" },
      });
      if (rpcErr) {
        // 500 → Apple réessaie (transitoire couvert). already_credited n'est
        // PAS une erreur RPC : rejeu client/webhook → réponse 200 idempotente.
        console.error("[apple-iap-webhook] credit_purchased_coins:", rpcErr.message, "— tx=", JSON.stringify(tx));
        await alerterPaiementNonCredite({
          canal: "apple", type: "pack", user_id: appAccountToken, produit: productId,
          montant, ref: `apple:${transactionId}`, rpc: null, erreur: rpcErr.message,
        });
        return new Response(JSON.stringify({ error: "credit_failed" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      console.log(`[apple-iap-webhook] ONE_TIME_CHARGE crédité → userId=${appAccountToken} product=${productId} ref=apple:${transactionId} →`, JSON.stringify(credit));
      // Mail UNIQUEMENT si une ligne a réellement été créée : Apple rejoue sa
      // notification jusqu'à recevoir un 200, et credited=false signale
      // précisément un rejeu déjà idempotent (already_credited).
      if ((credit as { credited?: boolean })?.credited === true) {
        await notifierPaiement({
          canal: "apple", type: "pack", user_id: appAccountToken, produit: productId,
          montant, pepites: COIN_PRODUCTS[productId], ref: `apple:${transactionId}`, rpc: credit,
        });
      }
      return new Response(JSON.stringify({ ok: true, credited: COIN_PRODUCTS[productId] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    if (!PREMIUM_PRODUCT_IDS.includes(productId)) {
      console.warn(`[apple-iap-webhook] unknown product ${productId} — skipped — tx=`, JSON.stringify(tx));
      return new Response(JSON.stringify({ ok: true, skipped: "non-premium product" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let isPremium: boolean | null = null;
    if (PREMIUM_ON.includes(notificationType))  isPremium = true;
    if (PREMIUM_OFF.includes(notificationType)) isPremium = false;

    // DID_CHANGE_RENEWAL_STATUS avec signedTransactionInfo : lire autoRenewStatus
    let cancelAtPeriodEnd = false;
    if (isPremium === null && notificationType === "DID_CHANGE_RENEWAL_STATUS" && signedRenewalInfo) {
      try {
        const renewal = await verifyAndDecodeJWS(signedRenewalInfo);
        if (renewal.autoRenewStatus === 1) isPremium = true;
        else cancelAtPeriodEnd = true; // résilié, encore actif jusqu'à expiry
      } catch {
        console.warn("[apple-iap-webhook] Could not decode signedRenewalInfo for DID_CHANGE_RENEWAL_STATUS");
      }
    }

    if (cancelAtPeriodEnd) {
      // Résiliation — miroir du type 3 CANCELED de google-play-webhook : on
      // note l'annulation SANS toucher aux flags d'accès (is_premium, is_pro,
      // is_founder, is_business) — l'abonné a payé jusqu'à la fin de sa
      // période. La rétrogradation reste portée exclusivement par
      // EXPIRED / REFUND / REVOKE / DID_FAIL_TO_RENEW.
      // expiresDate (ms epoch) vient du signedTransactionInfo déjà vérifié —
      // même format ISO que l'expiryTime Google (colonne TEXT).
      const expiresDate = tx.expiresDate as number | undefined;
      if (expiresDate == null) {
        console.warn("[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS cancel: expiresDate absent — subscription_period_end=null");
      }
      const { error: cancelErr } = await supabaseAdmin.from("profiles").update({
        subscription_cancel_at_period_end: true,
        subscription_period_end: expiresDate != null ? new Date(expiresDate).toISOString() : null,
      }).eq("id", appAccountToken);
      if (cancelErr) {
        console.error("[apple-iap-webhook] DB error (cancel):", cancelErr.message);
        return new Response(JSON.stringify({ error: cancelErr.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      console.log(`[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS cancelled → userId=${appAccountToken} accès conservé jusqu'à ${expiresDate != null ? new Date(expiresDate).toISOString() : "(expiresDate absent)"}`);
      return new Response(JSON.stringify({ ok: true, cancel_at_period_end: true }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    if (isPremium === null) {
      console.log(`[apple-iap-webhook] Unhandled type: ${notificationType} — skipping — tx=`, JSON.stringify(tx));
      return new Response(JSON.stringify({ ok: true, skipped: notificationType }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const update: Record<string, unknown> = { is_premium: isPremium };
    // ON (achat, renouvellement, réactivation) → annulation levée, sans quoi
    // un compte réactivé resterait marqué annulé pour toujours (miroir Google).
    if (isPremium) update.subscription_cancel_at_period_end = false;
    if (originalTransactionId) update.apple_original_transaction_id = originalTransactionId;
    if (isPremium && productId === "app.fillsell.premium.sub") update.is_founder = true;
    // Pro : le flag suit l'état de l'abonnement (ON → true, OFF → false)
    if (PRO_PRODUCT_IDS.includes(productId)) update.is_pro = isPremium;
    // Business : cumulatif — pose/retire is_pro ET is_business ensemble.
    if (BUSINESS_PRODUCT_IDS.includes(productId)) {
      update.is_pro = isPremium;
      update.is_business = isPremium;
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", appAccountToken);

    if (error) {
      console.error("[apple-iap-webhook] DB error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pièces incluses au 1er achat et à chaque renouvellement.
    // Cycle par utilisateur (2026-07-28) : expiresDate — déjà présent dans le
    // signedTransactionInfo qu'on vient de vérifier — devient l'échéance du
    // prochain grant. C'est le store qui décide quand il encaisse, on ne
    // calcule jamais la date nous-mêmes. p_source "payment" : cet événement
    // EST la preuve de paiement (le sweep, lui, ne rattrape que 3 jours).
    if (isPremium) {
      const grantTier = BUSINESS_PRODUCT_IDS.includes(productId) ? "business"
        : PRO_PRODUCT_IDS.includes(productId) ? "pro" : "premium";
      const expiresDate = tx.expiresDate as number | undefined;
      const montantAbo = tx.price != null && tx.currency
        ? `${(Number(tx.price) / 1000).toFixed(2)} ${tx.currency}`
        : null;
      const { data: grantRes, error: grantErr } = await supabaseAdmin.rpc("upgrade_monthly_grant", {
        p_user_id: appAccountToken,
        p_tier: grantTier,
        p_period_end: expiresDate ? new Date(expiresDate).toISOString() : null,
        p_source: "payment",
      });
      if (grantErr) {
        console.error("[apple-iap-webhook] upgrade_monthly_grant:", grantErr.message);
        await alerterPaiementNonCredite({
          canal: "apple", type: "abonnement", user_id: appAccountToken, produit: productId,
          montant: montantAbo, ref: originalTransactionId ?? null, rpc: null, erreur: grantErr.message,
        });
      } else if ((grantRes as { granted?: boolean })?.granted === true) {
        // granted=false = déjà crédité pour ce cycle (rejeu Apple) → pas de mail.
        await notifierPaiement({
          canal: "apple", type: "abonnement", user_id: appAccountToken, produit: productId,
          montant: montantAbo,
          pepites: (grantRes as { amount?: number })?.amount ?? null,
          ref: originalTransactionId ?? null, rpc: grantRes,
        });
      }
    }

    console.log(
      `[apple-iap-webhook] ${notificationType} → userId=${appAccountToken} is_premium=${isPremium} product=${productId} originalTransactionId=${originalTransactionId}`
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[apple-iap-webhook] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
