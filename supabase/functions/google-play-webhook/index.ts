import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const FOUNDER_PRODUCT_ID = "app.fillsell.premium.sub";
const PRO_PRODUCT_ID = "app.fillsell.pro.sub";
const PREMIUM_PRODUCT_IDS = ["app.fillsell.premium.sub", "app.fillsell.premium.standard", PRO_PRODUCT_ID];

// Génère un JWT signé avec le service account Google pour appeler l'API Publisher
async function getGoogleAccessToken(): Promise<string> {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
  const rawKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")!;

  const pemBody = rawKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, signingInput);
  const jwt = `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const { access_token } = await res.json();
  return access_token;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();

    // Google envoie le message Pub/Sub encodé en base64
    const dataB64 = body?.message?.data as string | undefined;
    if (!dataB64) {
      return new Response(JSON.stringify({ ok: true, skipped: "no message data" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const notification = JSON.parse(atob(dataB64));
    const { packageName, subscriptionNotification } = notification;

    const sub = subscriptionNotification;
    if (!sub) {
      return new Response(JSON.stringify({ ok: true, skipped: "not a subscription event" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const { notificationType, purchaseToken, subscriptionId } = sub;

    if (!PREMIUM_PRODUCT_IDS.includes(subscriptionId)) {
      return new Response(JSON.stringify({ ok: true, skipped: "non-premium product" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Types Google Play :
    // 1=RECOVERED 2=RENEWED 4=PURCHASED 7=RESTARTED → premium ON
    // 3=CANCELED 5=ON_HOLD 6=IN_GRACE_PERIOD 12=EXPIRED 13=REVOKED → premium OFF
    const PREMIUM_ON_TYPES  = [1, 2, 4, 7];
    const PREMIUM_OFF_TYPES = [3, 5, 12, 13];

    let isPremium: boolean | null = null;
    if (PREMIUM_ON_TYPES.includes(notificationType))  isPremium = true;
    if (PREMIUM_OFF_TYPES.includes(notificationType)) isPremium = false;

    if (isPremium === null) {
      console.log(`[google-play-webhook] Unhandled notificationType=${notificationType} — skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: `type_${notificationType}` }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Vérifier l'achat via l'API Google Publisher pour récupérer obfuscatedExternalAccountId
    const accessToken = await getGoogleAccessToken();
    const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    const apiRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("[google-play-webhook] Publisher API error:", errText);
      return new Response(JSON.stringify({ error: "Publisher API failed" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const purchase = await apiRes.json();
    // obfuscatedExternalAccountId = user.id Supabase passé via appAccountToken dans purchasePremium
    const userId = purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId as string | undefined;

    if (!userId) {
      console.warn("[google-play-webhook] No obfuscatedExternalAccountId in purchase");
      return new Response(JSON.stringify({ ok: true, skipped: "no userId" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const update: Record<string, unknown> = { is_premium: isPremium };
    if (isPremium && subscriptionId === FOUNDER_PRODUCT_ID) update.is_founder = true;
    // Pro : le flag suit l'état de l'abonnement (ON → true, OFF → false)
    if (subscriptionId === PRO_PRODUCT_ID) update.is_pro = isPremium;

    const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
    if (error) {
      console.error("[google-play-webhook] DB error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    // Pièces incluses au 1er achat et à chaque renouvellement (idempotent par mois)
    if (isPremium) {
      const grantTier = subscriptionId === PRO_PRODUCT_ID ? "pro" : "premium";
      const { error: grantErr } = await supabaseAdmin.rpc("grant_monthly_coins", {
        p_user_id: userId,
        p_tier: grantTier,
      });
      if (grantErr) console.error("[google-play-webhook] grant_monthly_coins:", grantErr.message);
    }

    console.log(`[google-play-webhook] type=${notificationType} product=${subscriptionId} → userId=${userId} is_premium=${isPremium} is_founder=${update.is_founder ?? false}`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[google-play-webhook] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
