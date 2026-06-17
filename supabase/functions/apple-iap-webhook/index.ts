import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function b64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

function decodeJWSPayload(jws: string): Record<string, unknown> {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");
  return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
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

    const notification = decodeJWSPayload(signedPayload);
    const notificationType = notification.notificationType as string;
    const data = notification.data as Record<string, unknown> | undefined;

    const signedTransactionInfo = data?.signedTransactionInfo as string | undefined;
    if (!signedTransactionInfo) {
      return new Response(JSON.stringify({ ok: true, skipped: "no transaction" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tx = decodeJWSPayload(signedTransactionInfo);
    const appAccountToken = tx.appAccountToken as string | undefined;
    const productId       = tx.productId as string;

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

    if (isPremium === null) {
      console.log(`[apple-iap-webhook] Unhandled type: ${notificationType} — skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: notificationType }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_premium: isPremium })
      .eq("id", appAccountToken);

    if (error) {
      console.error("[apple-iap-webhook] DB error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(
      `[apple-iap-webhook] ${notificationType} → userId=${appAccountToken} is_premium=${isPremium} product=${productId}`
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
