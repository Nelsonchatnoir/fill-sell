/**
 * apple-lookup-subscriptions.ts — Deno one-shot script
 *
 * Recherche les originalTransactionIds Apple pour deux appAccountTokens (UUIDs Supabase).
 *
 * Usage (PowerShell) :
 *   1. Colle ta clé privée dans apple-key.p8 (voir ce fichier)
 *   2. Lance :
 *      $env:APPLE_API_KEY_ID = "XXXXXXXXXX"
 *      $env:APPLE_ISSUER_ID  = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 *      deno run --allow-net --allow-env --allow-read apple-lookup-subscriptions.ts
 *
 * La clé privée est lue depuis ./apple-key.p8 (pas depuis une variable d'env)
 * pour éviter les problèmes d'encodage PowerShell avec les sauts de ligne.
 */

const KEY_ID    = Deno.env.get("APPLE_API_KEY_ID")!;
const ISSUER_ID = Deno.env.get("APPLE_ISSUER_ID")!;
const BUNDLE_ID = "app.fillsell.app";

// Lecture de la clé depuis le fichier — évite les corruptions PowerShell $env:
const KEY_FILE = "./apple-key.p8";
let PRIVATE_KEY: string;
try {
  PRIVATE_KEY = (await Deno.readTextFile(KEY_FILE)).replace(/\\n/g, '\n').trim();
} catch {
  console.error(`❌  Impossible de lire ${KEY_FILE}`);
  console.error("    Colle ta clé privée Apple dans apple-key.p8 (voir ce fichier).");
  Deno.exit(1);
}

const APP_ACCOUNT_TOKENS = [
  "11d24f27-2fc3-4f24-a0ed-1fc9d7c88cd9",
  "04add897-d03f-4ec3-9730-c2208c5ae678",
];

// ── JWT generation ──────────────────────────────────────────────────────────

function toB64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const payload = {
    iss: ISSUER_ID,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: BUNDLE_ID,
  };

  const h = toB64url(JSON.stringify(header));
  const p = toB64url(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;

  // Strip PEM headers — garde uniquement les caractères base64 valides
  const pem = PRIVATE_KEY
    .replace(/-----[^-]+-----/g, "")
    .replace(/[^A-Za-z0-9+/]/g, "");
  const pemPadded = pem + "=".repeat((4 - pem.length % 4) % 4);
  console.log(`  [debug] pem length=${pem.length} chars, sample="${pem.slice(0, 20)}…"`);
  const keyBytes = Uint8Array.from(atob(pemPadded), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = toB64url(new Uint8Array(sigBuf));
  return `${h}.${p}.${sig}`;
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function get(url: string, jwt: string, label: string) {
  console.log(`\n  → ${label}`);
  console.log(`    GET ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const text = await res.text();
  console.log(`    Status : ${res.status}`);
  try {
    const json = JSON.parse(text);
    console.log("    Body   :", JSON.stringify(json, null, 4).replace(/\n/g, "\n    "));
    return { status: res.status, json };
  } catch {
    console.log("    Body   :", text.slice(0, 300));
    return { status: res.status, json: null };
  }
}

// Decode JWS payload (no signature verification — read-only inspection)
function decodeJWSPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

if (!KEY_ID || !ISSUER_ID || !PRIVATE_KEY) {
  console.error("❌  Variables manquantes : APPLE_API_KEY_ID, APPLE_ISSUER_ID, APPLE_API_PRIVATE_KEY");
  Deno.exit(1);
}

console.log(`  KEY_ID    : ${KEY_ID || "(non défini)"}`);
console.log(`  ISSUER_ID : ${ISSUER_ID || "(non défini)"}`);
console.log(`  BUNDLE_ID : ${BUNDLE_ID}`);
console.log("🔑  Génération du JWT Apple App Store Server API…");
const jwt = await generateJWT();
console.log("✅  JWT généré\n");

const PROD    = "https://api.storekit.itunes.apple.com";
const SANDBOX = "https://api.storekit-sandbox.itunes.apple.com";

const results: Record<string, string | null> = {};

for (const token of APP_ACCOUNT_TOKENS) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`appAccountToken : ${token}`);
  console.log(`${"═".repeat(70)}`);

  // ── 1. Lookup by orderId (Apple order ID ≠ UUID, probablement 404)
  await get(`${PROD}/inApps/v1/lookup/${token}`,    jwt, "lookup/orderId (prod)");
  await get(`${SANDBOX}/inApps/v1/lookup/${token}`, jwt, "lookup/orderId (sandbox)");

  // ── 2. History V2 avec appAccountToken en query param (sans transactionId path)
  //    → Apple répond 400 ou 404 si pas supporté sans transactionId
  await get(`${PROD}/inApps/v2/history?appAccountToken=${token}`,    jwt, "history V2 ?appAccountToken (prod)");
  await get(`${SANDBOX}/inApps/v2/history?appAccountToken=${token}`, jwt, "history V2 ?appAccountToken (sandbox)");

  // ── 3. Subscriptions par appAccountToken (endpoint expérimental — peut 404)
  await get(`${PROD}/inApps/v1/subscriptions/${token}`,    jwt, "subscriptions/{appAccountToken} (prod)");
  await get(`${SANDBOX}/inApps/v1/subscriptions/${token}`, jwt, "subscriptions/{appAccountToken} (sandbox)");

  // ── 4. Transactions par appAccountToken (API v2 récente)
  const r4p = await get(`${PROD}/inApps/v2/transactions/${token}`,    jwt, "transactions/{appAccountToken} (prod)");
  const r4s = await get(`${SANDBOX}/inApps/v2/transactions/${token}`, jwt, "transactions/{appAccountToken} (sandbox)");

  // Tenter d'extraire originalTransactionId si la réponse contient des JWS
  for (const r of [r4p, r4s]) {
    if (r.json) {
      // Chercher signedTransactions[]
      const txs: string[] = r.json.signedTransactions ?? r.json.transactions ?? [];
      for (const jws of txs) {
        if (typeof jws === "string") {
          const decoded = decodeJWSPayload(jws);
          if (decoded?.originalTransactionId) {
            const otid = decoded.originalTransactionId as string;
            console.log(`\n  ✅  originalTransactionId trouvé : ${otid}`);
            console.log(`      productId   : ${decoded.productId}`);
            console.log(`      bundleId    : ${decoded.bundleId}`);
            results[token] = otid;
          }
        }
      }
    }
  }
}

// ── Résumé final ────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(70)}`);
console.log("RÉSUMÉ — originalTransactionIds");
console.log(`${"═".repeat(70)}`);
for (const [token, otid] of Object.entries(results)) {
  if (otid) {
    console.log(`✅  ${token}  →  ${otid}`);
  } else {
    console.log(`❌  ${token}  →  non trouvé via API`);
  }
}
if (Object.values(results).some((v) => v)) {
  console.log(`
Pour mettre à jour la base :
  UPDATE profiles SET apple_original_transaction_id = '<otid>' WHERE id = '<uuid>';
`);
}
