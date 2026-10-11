import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AppleKeyError, chargerCléApple, genererJWTApple } from "../_shared/apple-jwt.ts";

// Relecture de l'historique App Store Server Notifications V2 (180 jours max).
// Créée le 2026-07-28 (incident raraajaws : pack d'unités payé jamais
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
  // Secret lu dans l'environnement (même convention qu'email-tunnel,
  // handler-watch et ops-digest) : cette fonction expose des appAccountToken
  // (= identifiants utilisateurs), des transactionId et des montants — sa garde
  // n'a rien à faire en clair dans le dépôt.
  // Absence de secret = refus, jamais d'ouverture par défaut.
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    if (!expected) console.error("[apple-notification-history] CRON_SECRET absent — accès refusé");
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

    // ── (12/10, A8) L'HISTORIQUE COMPLET D'UN ABONNEMENT, DÉCODÉ ─────────────
    // POST { historique: "<originalTransactionId>" } → toutes ses transactions
    // (App Store Server API v2, /inApps/v2/history), champs Apple tels quels :
    // produit, dates, prix, isUpgraded, revocationDate/Reason (prorata d'un
    // passage de palier), offres. Lecture seule — c'est ce qu'on montre avant
    // de rejouer une notification jetée (Ciddjy, 07/10).
    if (typeof body.historique === "string" && /^[0-9]{6,30}$/.test(body.historique)) {
      const transactions: Array<Record<string, unknown>> = [];
      let revision: string | undefined;
      let tours = 0;
      do {
        const url = new URL(`${APPLE_PROD_URL}/inApps/v2/history/${body.historique}`);
        url.searchParams.set("sort", "ASCENDING");
        if (revision) url.searchParams.set("revision", revision);
        const r = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
        if (!r.ok) {
          return new Response(JSON.stringify({ error: `apple_${r.status}`, detail: (await r.text()).slice(0, 500) }), {
            status: 502, headers: { "Content-Type": "application/json" },
          });
        }
        const page = await r.json();
        for (const s of page.signedTransactions ?? []) {
          try { transactions.push(decodeJWSPayload(s as string)); }
          catch (e) { transactions.push({ decodeError: String((e as Error)?.message ?? e) }); }
        }
        revision = page.hasMore ? page.revision : undefined;
        tours++;
      } while (revision && tours < 20);
      return new Response(JSON.stringify({ count: transactions.length, transactions }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── (12/10, A8) LA NOTIFICATION DE TEST D'APPLE — LE WEBHOOK VÉRIFIE-T-IL ENCORE ? ──
    // POST { test_notification: "envoyer" } → Apple envoie une notification TEST,
    // SIGNÉE, à l'URL de production d'apple-iap-webhook ; rend son jeton.
    // POST { test_notification: "<jeton>" } → ce qu'Apple a reçu de notre webhook
    // (sendAttempts : SUCCESS = HTTP 200, donc signature vérifiée). C'est la
    // preuve, après un déploiement du webhook, que la vérification de signature
    // (@peculiar/x509, résolu par esm.sh à chaque déploiement) marche toujours.
    // Une TEST n'a aucun effet sur aucun compte.
    if (typeof body.test_notification === "string") {
      const envoyer = body.test_notification === "envoyer";
      if (!envoyer && !/^[A-Za-z0-9._-]{8,200}$/.test(body.test_notification)) {
        return new Response(JSON.stringify({ error: "jeton illisible" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const url = envoyer
        ? `${APPLE_PROD_URL}/inApps/v1/notifications/test`
        : `${APPLE_PROD_URL}/inApps/v1/notifications/test/${body.test_notification}`;
      const r = await fetch(url, { method: envoyer ? "POST" : "GET", headers: { Authorization: `Bearer ${jwt}` } });
      const texte = await r.text();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: `apple_${r.status}`, detail: texte.slice(0, 500) }), { status: 502, headers: { "Content-Type": "application/json" } });
      }
      const rep = JSON.parse(texte || "{}");
      let notification: Record<string, unknown> | null = null;
      try { notification = rep.signedPayload ? decodeJWSPayload(rep.signedPayload) : null; } catch { notification = null; }
      return new Response(JSON.stringify({
        testNotificationToken: rep.testNotificationToken ?? body.test_notification,
        type: notification?.notificationType ?? null, uuid: notification?.notificationUUID ?? null,
        sendAttempts: rep.sendAttempts ?? null,
      }), { headers: { "Content-Type": "application/json" } });
    }

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
          // (12/10, A8) `transactionId` + `brut: true` : la notification
          // SIGNÉE par Apple, telle quelle — pour la rejouer dans
          // apple-iap-webhook (qui revérifie la signature) quand un défaut du
          // webhook l'avait jetée (passage Premium → Pro de Ciddjy, 07/10).
          if (body.transactionId && String(tx.transactionId ?? "") !== String(body.transactionId)) continue;
          notifications.push({
            ...(body.brut === true && body.transactionId ? { signedPayload: item.signedPayload } : {}),
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

    // keyVariant : quel nettoyage a rendu le secret lisible. « brut/entête-strict/
    // base64 » = le secret en base est propre ; toute autre valeur = il n'a été
    // sauvé que par le filet, mieux vaut le re-poser proprement.
    const { variante: keyVariant } = await chargerCléApple();
    return new Response(JSON.stringify({ count: notifications.length, pages, keyVariant, notifications }), {
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
