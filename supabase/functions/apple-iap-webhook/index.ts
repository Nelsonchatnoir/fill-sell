import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as x509 from "https://esm.sh/@peculiar/x509@1.9.0";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PREMIUM_PRODUCT_IDS = [
  "app.fillsell.premium.sub",
  "app.fillsell.premium.standard",
];

const PREMIUM_ON  = ["SUBSCRIBED", "DID_RENEW", "RESUBSCRIBE"];
const PREMIUM_OFF = ["EXPIRED", "REFUND", "REVOKE", "DID_FAIL_TO_RENEW"];

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

        if (autoRenewStatus !== 1) {
          console.log("[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS autoRenewStatus=0 — skipping (still active)");
          return new Response(JSON.stringify({ ok: true, skipped: "DID_CHANGE_RENEWAL_STATUS_cancelled" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        if (!renewalToken || !renewalProductId || !PREMIUM_PRODUCT_IDS.includes(renewalProductId)) {
          console.warn("[apple-iap-webhook] DID_CHANGE_RENEWAL_STATUS: missing token or non-premium product");
          return new Response(JSON.stringify({ ok: true, skipped: "missing_token_or_product" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        const upd: Record<string, unknown> = { is_premium: true };
        if (renewalOriginalTxId) upd.apple_original_transaction_id = renewalOriginalTxId;
        if (renewalProductId === "app.fillsell.premium.sub") upd.is_founder = true;
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
      console.warn("[apple-iap-webhook] No appAccountToken — cannot identify user");
      return new Response(JSON.stringify({ ok: true, skipped: "no appAccountToken" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!PREMIUM_PRODUCT_IDS.includes(productId)) {
      return new Response(JSON.stringify({ ok: true, skipped: "non-premium product" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let isPremium: boolean | null = null;
    if (PREMIUM_ON.includes(notificationType))  isPremium = true;
    if (PREMIUM_OFF.includes(notificationType)) isPremium = false;

    // DID_CHANGE_RENEWAL_STATUS avec signedTransactionInfo : lire autoRenewStatus
    if (isPremium === null && notificationType === "DID_CHANGE_RENEWAL_STATUS" && signedRenewalInfo) {
      try {
        const renewal = await verifyAndDecodeJWS(signedRenewalInfo);
        if (renewal.autoRenewStatus === 1) isPremium = true;
        // autoRenewStatus=0 → résilié, encore actif jusqu'à expiry → skip
      } catch {
        console.warn("[apple-iap-webhook] Could not decode signedRenewalInfo for DID_CHANGE_RENEWAL_STATUS");
      }
    }

    if (isPremium === null) {
      console.log(`[apple-iap-webhook] Unhandled type: ${notificationType} — skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: notificationType }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const update: Record<string, unknown> = { is_premium: isPremium };
    if (originalTransactionId) update.apple_original_transaction_id = originalTransactionId;
    if (isPremium && productId === "app.fillsell.premium.sub") update.is_founder = true;

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
