import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AppleKeyError, genererJWTApple } from "../_shared/apple-jwt.ts";

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

// Chargement de la clé : voir ../_shared/apple-jwt.ts (nettoyages candidats +
// diagnostic explicite). La clé DOIT venir de la section « Achat intégré »
// d'App Store Connect — une clé d'équipe donne un 401 sur cette API.

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

    const jwt = await genererJWTApple(BUNDLE_ID);
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
    // Sur défaut de clé, on renvoie le diagnostic (longueurs, modulo, préfixe
    // structurel) : c'est ce qui a manqué le 28/07 où un « InvalidEncoding »
    // nu a fait perdre des heures.
    const diag = err instanceof AppleKeyError ? err.diag : undefined;
    console.error("[apple-notification-history]", msg, diag ? JSON.stringify(diag) : "");
    return new Response(JSON.stringify({ error: msg, ...(diag ? { diag } : {}) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
