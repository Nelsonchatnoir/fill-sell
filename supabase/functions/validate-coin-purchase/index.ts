import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as x509 from "https://esm.sh/@peculiar/x509@1.9.0";

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

// Montants CRÉDITÉS par product id (iOS / Android). Doit rester aligné avec
// src/components/coinPacks.js (affichage) et create-checkout-session (web).
//
// ⚠️ 2026-07-14 : le SKU app.fillsell.coins.1150 crédite désormais 1300 Pépites,
// pas 1150 — prix inchangé (49,99 €). Le nom du SKU garde « 1150 » car il est
// déjà enregistré chez Apple et Google : on ne renomme pas un SKU en production.
// Motif : à 1150, la remise réelle (12,9 %) égalait celle du pack 460, le gros
// pack n'apportait donc rien. À 1300 elle passe à 22,9 %.
const COIN_PRODUCTS: Record<string, number> = {
  "app.fillsell.coins.100": 100,
  "app.fillsell.coins.220": 220,
  "app.fillsell.coins.460": 460,
  "app.fillsell.coins.1150": 1300,
};

// ── Vérification JWS StoreKit 2 (App Store Server API v2) ────────────────────
// Sur appareil réel, le plugin ne fournit souvent qu'un `jwsRepresentation`
// (transaction signée), pas le reçu classique. On le vérifie cryptographiquement,
// avec le MÊME helper éprouvé que apple-iap-webhook (copié tel quel volontairement
// plutôt que partagé : chaque edge function se déploie isolément). Toute anomalie
// lève → l'appelant doit traiter la requête comme falsifiée.
//
// SHA-256 du fingerprint de l'Apple Root CA - G3 (valide 2014–2039).
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

  // x5c uses standard base64 (not base64url)
  const certs = x5c.map((b64) => new x509.X509Certificate(b64ToUint8(b64)));
  const leaf = certs[0];
  const root = certs[certs.length - 1];

  // 1 — empreinte du root CA == Apple Root CA G3
  const rootHex = toHex(await root.getThumbprint("SHA-256"));
  if (rootHex !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error(`Root CA fingerprint mismatch: got ${rootHex}`);
  }
  // 2 — chaîne de certificats : chaque cert signé par le suivant
  for (let i = 0; i < certs.length - 1; i++) {
    const valid = await certs[i].verify({ publicKey: certs[i + 1] });
    if (!valid) throw new Error(`Certificate chain broken at position ${i}`);
  }
  // 3 — signature JWS avec la clé publique du leaf (ECDSA P-256)
  const leafKey = await crypto.subtle.importKey(
    "spki", leaf.publicKey.rawData,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
  );
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    leafKey, b64urlToUint8(signatureB64), signingInput
  );
  if (!valid) throw new Error("JWS signature verification failed");

  return JSON.parse(new TextDecoder().decode(b64urlToUint8(payloadB64)));
}

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

    const { platform, productId, receipt, jwsRepresentation, purchaseToken } = await req.json();
    const coins = COIN_PRODUCTS[productId as string];
    if (!coins) return json({ error: "unknown_product", productId }, 400);

    let ref: string | null = null;

    if (platform === "ios") {
      if (receipt) {
        // ── Chemin LEGACY : reçu App Store classique (verifyReceipt) ──
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
      } else if (jwsRepresentation) {
        // ── Chemin StoreKit 2 : transaction signée JWS (App Store Server API v2) ──
        // Le transaction_id extrait est IDENTIQUE à celui du reçu legacy pour le
        // même achat → la réf idempotente apple:<txid> reste cohérente entre les
        // deux chemins (pas de double crédit si un achat repasse par l'autre voie).
        let tx: Record<string, unknown>;
        try {
          tx = await verifyAndDecodeJWS(jwsRepresentation as string);
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          console.error("[validate-coin-purchase] JWS invalide:", m);
          return json({ error: "jws_validation_failed" }, 400);
        }
        if (tx.bundleId !== PACKAGE_NAME) {
          return json({ error: "bundle_mismatch", bundleId: tx.bundleId }, 400);
        }
        if (tx.productId !== productId) {
          return json({ error: "product_mismatch", productId: tx.productId }, 400);
        }
        const transactionId = tx.transactionId as string | undefined;
        if (!transactionId) return json({ error: "jws_no_transaction_id" }, 400);
        ref = `apple:${transactionId}`;
      } else {
        return json({ error: "missing_receipt" }, 400);
      }
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
