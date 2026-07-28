import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Relecture de l'historique App Store Server Notifications V2 (180 jours max).
// Créée le 2026-07-28 (incident raraajaws : pack de Pépites payé jamais
// crédité, notification ONE_TIME_CHARGE jetée par apple-iap-webhook).
// Usage : outil d'admin + source du monitoring ops-digest (croisement avec
// les refs apple:% de coin_ledger).
//
// Auth : header x-cron-secret (même garde que le trigger email-tunnel — les
// appels ne viennent que de nous ou de pg_net). Déploiement --no-verify-jwt.
//
// Appel : POST { startDate?: ISO, endDate?: ISO, notificationType?: string }
// → { count, notifications: [{ type, subtype, productId, transactionId,
//     originalTransactionId, appAccountToken, purchasedAt, price, currency }] }

const BUNDLE_ID      = "app.fillsell.app";
const APPLE_PROD_URL = "https://api.storekit.itunes.apple.com";
const CRON_SECRET    = "fs-cron-2026-tunnel";

async function generateAppleJWT(): Promise<string> {
  const keyId    = Deno.env.get("APPLE_API_KEY_ID")!;
  const issuerId = Deno.env.get("APPLE_ISSUER_ID")!;
  const pem      = Deno.env.get("APPLE_API_PRIVATE_KEY")!;

  // Nettoyage GÉNÉRIQUE : le secret réel est stocké avec des séparateurs « ~ »
  // à la place des sauts de ligne (constaté au 1er run : badchars ["-","~"]) —
  // on retire tout en-tête/pied -----…----- puis tout caractère hors base64,
  // plutôt que de pattern-matcher un format de PEM précis.
  // Secret stocké dans un format mangé (constaté runs 1-5) : séparateurs « ~ »,
  // en-têtes à nombre de tirets non standard, et corps en base64URL — les « - »
  // du corps sont des DONNÉES (un filtre naïf les supprimait et corrompait le
  // DER après ~30 octets : début plausible puis « curve mismatch »). On retire
  // les en-têtes par regex tolérante (1+ tirets, espace ou ~ entre les mots),
  // on garde -/_ comme données, puis conversion base64url → base64 standard.
  const pemContent = pem
    .replace(/-+\s*~*BEGIN[\s~]*PRIVATE[\s~]*KEY[\s~]*-+/gi, "")
    .replace(/-+\s*~*END[\s~]*PRIVATE[\s~]*KEY[\s~]*-+/gi, "")
    .replace(/[^A-Za-z0-9+/=_-]/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  // Le DER du secret est un PKCS#8 non minimal (paramètres de courbe
  // redondants → « curve mismatch » à l'import WebCrypto, constaté au run 4).
  // On ne se bat pas avec le format : on extrait le scalaire privé de 32
  // octets (motif ECPrivateKey : 02 01 01 04 20 <d>) et on reconstruit un
  // PKCS#8 P-256 minimal connu-bon.
  let d: Uint8Array | null = null;
  for (let i = 0; i + 37 <= rawDer.length; i++) {
    if (rawDer[i] === 0x02 && rawDer[i + 1] === 0x01 && rawDer[i + 2] === 0x01 &&
        rawDer[i + 3] === 0x04 && rawDer[i + 4] === 0x20) {
      d = rawDer.slice(i + 5, i + 37);
      break;
    }
  }
  if (!d) {
    // Constaté le 2026-07-28 : le secret actuel est CORROMPU en base (OID de
    // courbe altéré 2a8648ce3d016107, ECPrivateKey commençant par 0x16 — des
    // caractères ont été perdus/remplacés par « ~ » à l'enregistrement).
    // Conséquence : apple-subscription-status n'a jamais pu fonctionner non
    // plus. Remède : re-poser APPLE_API_PRIVATE_KEY depuis le .p8 original
    // (supabase secrets set), cette fonction marchera alors telle quelle.
    const head = Array.from(rawDer.slice(0, 30)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    throw new Error(`apple_private_key_secret_corrupted len=${rawDer.length} head30=${head} — re-poser APPLE_API_PRIVATE_KEY depuis le .p8`);
  }
  const der = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00,
    0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20, ...d,
  ]);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64  = b64url({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payloadB64 = b64url({ iss: issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1", bid: BUNDLE_ID });
  const signingInput = `${headerB64}.${payloadB64}`;
  const rawSig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(rawSig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${signingInput}.${sigB64}`;
}

// Décodage SANS re-vérification de chaîne : la réponse vient de l'API Apple
// en TLS direct — contrairement au webhook (entrée publique), pas de risque
// de payload forgé ici.
function decodeJWSPayload(jws: string): Record<string, unknown> {
  const payloadB64 = jws.split(".")[1];
  const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "=");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Défaut : depuis le lancement du store de packs (06/07) — sous les 180 j.
    const startDate = body.startDate ? Date.parse(body.startDate) : Date.parse("2026-07-01T00:00:00Z");
    const endDate   = body.endDate   ? Date.parse(body.endDate)   : Date.now();

    const jwt = await generateAppleJWT();
    const notifications: Array<Record<string, unknown>> = [];
    let paginationToken: string | undefined;
    let pages = 0;

    do {
      const url = new URL(`${APPLE_PROD_URL}/inApps/v1/notifications/history`);
      if (paginationToken) url.searchParams.set("paginationToken", paginationToken);
      const payload: Record<string, unknown> = { startDate, endDate };
      if (body.notificationType) payload.notificationType = body.notificationType;
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        return new Response(JSON.stringify({ error: `apple_${r.status}`, detail: t.slice(0, 500) }), {
          status: 502, headers: { "Content-Type": "application/json" },
        });
      }
      const page = await r.json();
      for (const item of page.notificationHistory ?? []) {
        try {
          const notif = decodeJWSPayload(item.signedPayload as string);
          const data = notif.data as Record<string, unknown> | undefined;
          const txJws = data?.signedTransactionInfo as string | undefined;
          const tx = txJws ? decodeJWSPayload(txJws) : {};
          notifications.push({
            type: notif.notificationType,
            subtype: notif.subtype ?? null,
            productId: tx.productId ?? null,
            transactionId: tx.transactionId ?? null,
            originalTransactionId: tx.originalTransactionId ?? null,
            appAccountToken: tx.appAccountToken ?? null,
            purchasedAt: tx.purchaseDate ? new Date(tx.purchaseDate as number).toISOString() : null,
            price: tx.price ?? null,
            currency: tx.currency ?? null,
          });
        } catch (e) {
          notifications.push({ decodeError: String((e as Error)?.message ?? e) });
        }
      }
      paginationToken = page.hasMore ? page.paginationToken : undefined;
      pages++;
    } while (paginationToken && pages < 50);

    return new Response(JSON.stringify({ count: notifications.length, pages, notifications }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[apple-notification-history]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
