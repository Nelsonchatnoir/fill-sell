import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as x509 from "https://esm.sh/@peculiar/x509@1.9.0";

// Valide un achat IAP CONSUMABLE APPLE (pack de pièces) et crédite le wallet
// via credit_purchased_coins (idempotent sur la ref de transaction store).
// Auth : JWT utilisateur (verify_jwt=true au déploiement, comme get-pending-jobs).
// Déploiement : supabase functions deploy validate-coin-purchase
//
// ⚠️ APPLE UNIQUEMENT depuis le 2026-08-05. Google (packs ET abonnements) passe
// par validate-google-purchase, chemin unique. Ne pas réintroduire de branche
// android ici.

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

// getGoogleAccessToken a été SUPPRIMÉ ici le 2026-08-05 avec la branche
// android : plus aucun appel à l'API Publisher depuis cette fonction, qui est
// désormais Apple-only. Le helper vit dans validate-google-purchase et
// google-play-webhook (copié dans chacune à dessein — une edge function se
// déploie isolément, on ne les couple pas par un import partagé).

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

    const { platform, productId, receipt, jwsRepresentation } = await req.json();
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
    } else {
      // ⛔ Android N'ARRIVE PLUS ICI (2026-08-05). La branche android de cette
      // fonction a été retirée au profit de validate-google-purchase, qui porte
      // désormais le SEUL chemin Google (packs ET abonnements). Elle produisait
      // exactement le même crédit et la même réf idempotente google:<orderId> —
      // c'est bien pour ça qu'elle était retirable sans risque, et c'est aussi
      // pour ça qu'il ne faut pas la remettre : deux implémentations du même
      // paiement finissent par diverger, et cette divergence-là ne se voit
      // qu'au moment où quelqu'un est débité pour rien.
      // Appelants basculés le même jour : CoinStoreModal et le filet
      // recoverAndroidCoinPurchases (App.jsx).
      return json({ error: "invalid_platform", platform, hint: "android → validate-google-purchase" }, 400);
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
