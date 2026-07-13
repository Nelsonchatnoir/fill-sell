import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Valide un achat IAP CONSUMABLE (pack de pièces) et crédite le wallet via
// credit_purchased_coins (idempotent sur la ref de transaction store).
// Auth : JWT utilisateur (verify_jwt=true au déploiement, comme get-pending-jobs).
// Déploiement : supabase functions deploy validate-coin-purchase

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const PACKAGE_NAME = "app.fillsell.app";

// Packs validés (grille 2026-07-06) : montants crédités par product id.
const COIN_PRODUCTS: Record<string, number> = {
  "app.fillsell.coins.100": 100,
  "app.fillsell.coins.220": 220,
  "app.fillsell.coins.460": 460,
  "app.fillsell.coins.1150": 1150,
};

async function verifyWithApple(receipt: string, url: string): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receipt,
      "password": Deno.env.get("APPLE_SHARED_SECRET")!,
    }),
  });
  return res.json();
}

// Même mécanique service account que google-play-webhook
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
  const origin = req.headers.get("origin") ?? "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { platform, productId, receipt, purchaseToken } = await req.json();
    const coins = COIN_PRODUCTS[productId as string];
    if (!coins) return json({ error: "unknown_product", productId }, 400);

    let ref: string | null = null;

    if (platform === "ios") {
      if (!receipt) return json({ error: "missing_receipt" }, 400);
      let appleData = await verifyWithApple(receipt, "https://buy.itunes.apple.com/verifyReceipt");
      // 21007 = reçu sandbox envoyé en prod → retenter sur sandbox
      if (appleData.status === 21007) {
        appleData = await verifyWithApple(receipt, "https://sandbox.itunes.apple.com/verifyReceipt");
      }
      if (appleData.status !== 0) {
        return json({ error: "apple_validation_failed", status: appleData.status }, 400);
      }
      // Consumable : chercher la transaction la plus récente du produit dans le reçu
      const inApp: any[] = appleData.receipt?.in_app ?? [];
      const matches = inApp
        .filter((t) => t.product_id === productId)
        .sort((a, b) => Number(b.purchase_date_ms ?? 0) - Number(a.purchase_date_ms ?? 0));
      const tx = matches[0];
      if (!tx?.transaction_id) return json({ error: "product_not_in_receipt", productId }, 400);
      ref = `apple:${tx.transaction_id}`;
    } else if (platform === "android") {
      if (!purchaseToken) return json({ error: "missing_purchase_token" }, 400);
      const accessToken = await getGoogleAccessToken();
      const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${productId}/tokens/${purchaseToken}`;
      const apiRes = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!apiRes.ok) {
        console.error("[validate-coin-purchase] Publisher API:", await apiRes.text());
        return json({ error: "google_validation_failed" }, 400);
      }
      const purchase = await apiRes.json();
      // purchaseState 0 = purchased (1 = cancelled, 2 = pending)
      if (purchase.purchaseState !== 0) {
        return json({ error: "purchase_not_completed", state: purchase.purchaseState }, 400);
      }
      // Acknowledge best-effort (sinon Google rembourse au bout de 3 jours)
      if (purchase.acknowledgementState === 0) {
        await fetch(`${apiUrl}:acknowledge`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: "{}",
        }).catch((e) => console.error("[validate-coin-purchase] acknowledge:", e));
      }
      ref = `google:${purchase.orderId ?? purchaseToken}`;
    } else {
      return json({ error: "invalid_platform" }, 400);
    }

    const { data: credit, error: rpcErr } = await adminClient.rpc("credit_purchased_coins", {
      p_user_id: user.id,
      p_amount: coins,
      p_ref: ref,
      p_metadata: { productId, platform },
    });
    if (rpcErr) {
      console.error("[validate-coin-purchase] credit rpc:", rpcErr.message);
      return json({ error: "credit_failed" }, 500);
    }

    // already_credited = reçu rejoué : réponse 200 idempotente, pas une erreur
    console.log(`[validate-coin-purchase] user=${user.id} product=${productId} ref=${ref} →`, JSON.stringify(credit));
    return json({ ok: true, coins, ...credit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[validate-coin-purchase] unhandled:", msg);
    return json({ error: msg }, 500);
  }
});
