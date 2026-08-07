import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifierPaiement, alerterPaiementNonCredite } from "../_shared/payment-notify.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const FOUNDER_PRODUCT_ID = "app.fillsell.premium.sub";
const PRO_PRODUCT_ID = "app.fillsell.pro.sub";
const PREMIUM_PRODUCT_IDS = ["app.fillsell.premium.sub", "app.fillsell.premium.standard", PRO_PRODUCT_ID];

// Packs de Pépites (consumables) — montants crédités par product id. Doit
// rester aligné avec validate-coin-purchase et src/components/coinPacks.js.
// Le SKU .1150 crédite 1300 (rebalance 2026-07-14, SKU non renommable en prod).
const COIN_PRODUCTS: Record<string, number> = {
  "app.fillsell.coins.100": 100,
  "app.fillsell.coins.220": 220,
  "app.fillsell.coins.460": 460,
  "app.fillsell.coins.1150": 1300,
};

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

  // base64url OBLIGATOIRE (fix 2026-08-07) : un JWT s'encode en base64url,
  // jamais en base64 standard. Avec btoa nu, la signature RSA contient
  // quasi toujours des '+'/'/' et du padding '=' → assertion invalide →
  // pas d'access_token → « Bearer undefined » → 401 Publisher sur TOUS les
  // appels. Ce bug rendait la fonction incapable de marcher depuis sa
  // création, masqué jusqu'au 07/08 par la clé tronquée qui explosait avant.
  const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, signingInput);
  const jwt = `${header}.${payload}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) {
    // Sans cette garde, un refus du token endpoint devient « Bearer
    // undefined » et se déguise en 401 Publisher deux appels plus loin.
    throw new Error(`Google OAuth token: HTTP ${res.status} — ${JSON.stringify(tok).slice(0, 200)}`);
  }
  return tok.access_token;
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

    // ── Consumables : packs de Pépites (2026-07-28) ───────────────────────
    // Miroir du fix apple-iap-webhook du même jour : Play envoie un
    // oneTimeProductNotification pour chaque achat consumable, jusqu'ici
    // jeté (« not a subscription event »). Le filet client au lancement
    // (recoverAndroidCoinPurchases) compense, mais seulement si l'app est
    // rouverte — le crédit server-side ferme le trou pour de bon. Même
    // mécanique et même ref idempotente que validate-coin-purchase
    // (google:<orderId>) : rejeu croisé webhook/client/filet sans double
    // crédit. Pas de consume ici (opération client Billing) : l'achat reste
    // « owned » et le filet du prochain lancement le consommera
    // (validation → already_credited → consume).
    const otp = notification.oneTimeProductNotification;
    if (otp) {
      const otpToken = otp.purchaseToken as string | undefined;
      const sku = otp.sku as string | undefined;
      if (!sku || COIN_PRODUCTS[sku] == null) {
        console.warn("[google-play-webhook] oneTimeProduct inconnu — skipped —", JSON.stringify(otp));
        return new Response(JSON.stringify({ ok: true, skipped: "unknown_one_time_product" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      // notificationType : 1 = ONE_TIME_PRODUCT_PURCHASED, 2 = CANCELED
      if (otp.notificationType !== 1 || !otpToken) {
        console.warn("[google-play-webhook] oneTimeProduct non crédité — skipped —", JSON.stringify(otp));
        return new Response(JSON.stringify({ ok: true, skipped: `one_time_type_${otp.notificationType}` }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      const accessToken = await getGoogleAccessToken();
      const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${sku}/tokens/${otpToken}`;
      const apiRes = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!apiRes.ok) {
        // 500 → Pub/Sub réessaie (transitoire couvert)
        console.error("[google-play-webhook] Publisher API (products):", await apiRes.text());
        return new Response(JSON.stringify({ error: "Publisher API failed" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      const purchase = await apiRes.json();
      // purchaseState 0 = purchased (1 = cancelled, 2 = pending). Un PENDING
      // confirmé plus tard revient comme nouvelle notification PURCHASED.
      if (purchase.purchaseState !== 0) {
        console.log(`[google-play-webhook] oneTimeProduct state=${purchase.purchaseState} — skipped (sku=${sku})`);
        return new Response(JSON.stringify({ ok: true, skipped: `purchase_state_${purchase.purchaseState}` }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      const coinUserId = (purchase?.obfuscatedExternalAccountId
        ?? purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId) as string | undefined;
      if (!coinUserId) {
        // Payload complet : seule trace permettant un crédit manuel a posteriori.
        console.error("[google-play-webhook] oneTimeProduct sans obfuscatedExternalAccountId —", JSON.stringify(purchase));
        await alerterPaiementNonCredite({
          canal: "google", type: "pack", produit: sku,
          ref: (purchase?.orderId as string) ?? otpToken, rpc: null,
          erreur: "obfuscatedExternalAccountId absent : compte non identifiable. "
                + "Retrouver l'acheteur via l'orderId dans la Play Console.",
        });
        return new Response(JSON.stringify({ ok: true, skipped: "no_user_id" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      // Acknowledge best-effort (sinon Google rembourse au bout de 3 jours) —
      // même geste que validate-coin-purchase, idempotent côté Google.
      if (purchase.acknowledgementState === 0) {
        await fetch(`${apiUrl}:acknowledge`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: "{}",
        }).catch((e) => console.error("[google-play-webhook] acknowledge:", e));
      }
      const ref = `google:${purchase.orderId ?? otpToken}`;
      const { data: credit, error: rpcErr } = await supabaseAdmin.rpc("credit_purchased_coins", {
        p_user_id: coinUserId,
        p_amount: COIN_PRODUCTS[sku],
        p_ref: ref,
        p_metadata: { productId: sku, platform: "android", source: "google-play-webhook" },
      });
      if (rpcErr) {
        console.error("[google-play-webhook] credit_purchased_coins:", rpcErr.message, "—", JSON.stringify(otp));
        await alerterPaiementNonCredite({
          canal: "google", type: "pack", user_id: coinUserId, produit: sku,
          ref, rpc: null, erreur: rpcErr.message,
        });
        return new Response(JSON.stringify({ error: "credit_failed" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      console.log(`[google-play-webhook] oneTimeProduct crédité → userId=${coinUserId} sku=${sku} ref=${ref} →`, JSON.stringify(credit));
      // Google rejoue jusqu'au 200 : mail seulement si une ligne a été créée.
      if ((credit as { credited?: boolean })?.credited === true) {
        await notifierPaiement({
          canal: "google", type: "pack", user_id: coinUserId, produit: sku,
          pepites: COIN_PRODUCTS[sku], ref, rpc: credit,
        });
      }
      return new Response(JSON.stringify({ ok: true, credited: COIN_PRODUCTS[sku] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const sub = subscriptionNotification;
    if (!sub) {
      // Payload loggé : ne plus jamais jeter une notification en aveugle.
      console.log("[google-play-webhook] not a subscription event — skipped —", JSON.stringify(notification));
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
      // ── Encaissement non rattachable (2026-08-05) ────────────────────────
      // Aligné sur la branche oneTimeProduct ci-dessus, qui traitait déjà ce
      // cas correctement : payload complet dans les logs + alerte immédiate,
      // seule trace permettant de régulariser à la main via l'orderId.
      //
      // POURQUOI 200 ET NON UN 5xx — décision explicite :
      // l'absence d'obfuscatedExternalAccountId est une propriété de l'ACHAT
      // tel que l'API Publisher le renvoie, pas un aléa de transport.
      // Re-interroger le même token renverra éternellement le même payload :
      // un 5xx ferait rejouer Pub/Sub pendant ses 7 jours de rétention, une
      // alerte à chaque tentative, pour finir perdu quand même. Le réessai
      // n'a aucune chance d'aboutir, donc on acquitte et on alerte.
      // Les 5xx restent réservés à ce qui EST transitoire, et le sont déjà :
      // API Publisher injoignable (plus haut) et erreur d'écriture DB (plus
      // bas). Ne pas transformer ce 200 en 500 sans changer d'abord la
      // cause : ce serait rejouer un échec déterministe.
      console.error(
        "[google-play-webhook] abonnement sans obfuscatedExternalAccountId —",
        JSON.stringify({ notificationType, subscriptionId, purchase }),
      );
      await alerterPaiementNonCredite({
        canal: "google", type: "abonnement", produit: subscriptionId,
        ref: (purchase?.latestOrderId as string) ?? purchaseToken, rpc: null,
        erreur: "obfuscatedExternalAccountId absent : compte non identifiable. "
              + "Retrouver l'abonné via l'orderId dans la Play Console, puis "
              + "poser le droit à la main (aucun réessai Pub/Sub n'aboutira).",
      });
      return new Response(JSON.stringify({ ok: true, skipped: "no_user_id" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // ── Garde upgrade en place (2026-07-27) ─────────────────────────────────
    // Quand un abonnement est REMPLACÉ (upgrade Premium→Pro via
    // SubscriptionUpdateParams), Google émet un événement OFF (EXPIRED…) sur
    // l'ANCIEN token — parfois APRÈS le PURCHASED du nouveau (ordre Pub/Sub
    // non garanti). Sans garde, cet événement posthume écraserait is_premium
    // du Pro fraîchement activé. Règle : un événement OFF ne compte que s'il
    // porte sur le token COURANT du profil ; les événements ON réécrivent le
    // token courant (le client le fait aussi, mais le webhook peut arriver
    // avant).
    if (!isPremium) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("google_purchase_token").eq("id", userId).single();
      if (prof?.google_purchase_token && prof.google_purchase_token !== purchaseToken) {
        console.log(`[google-play-webhook] OFF ignoré : token remplacé (type=${notificationType} product=${subscriptionId} userId=${userId})`);
        return new Response(JSON.stringify({ ok: true, skipped: "stale_token_replaced" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
    }

    const update: Record<string, unknown> = { is_premium: isPremium };
    if (isPremium) {
      update.google_purchase_token = purchaseToken;
      update.google_product_id = subscriptionId;
    }
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

    // Pièces incluses au 1er achat et à chaque renouvellement.
    // Cycle par utilisateur (2026-07-28) : expiryTime — déjà présent dans la
    // réponse subscriptionsv2 récupérée plus haut — devient l'échéance du
    // prochain grant. C'est le store qui décide quand il encaisse, on ne
    // calcule jamais la date nous-mêmes. p_source "payment" : cet événement
    // EST la preuve de paiement (le sweep, lui, ne rattrape que 3 jours).
    if (isPremium) {
      const grantTier = subscriptionId === PRO_PRODUCT_ID ? "pro" : "premium";
      const expiryTime = purchase?.lineItems?.[0]?.expiryTime as string | undefined;
      const { data: grantRes, error: grantErr } = await supabaseAdmin.rpc("upgrade_monthly_grant", {
        p_user_id: userId,
        p_tier: grantTier,
        p_period_end: expiryTime ?? null,
        p_source: "payment",
      });
      if (grantErr) {
        console.error("[google-play-webhook] upgrade_monthly_grant:", grantErr.message);
        await alerterPaiementNonCredite({
          canal: "google", type: "abonnement", user_id: userId, produit: subscriptionId,
          ref: purchaseToken, rpc: null, erreur: grantErr.message,
        });
      } else if ((grantRes as { granted?: boolean })?.granted === true) {
        // granted=false = cycle déjà crédité (rejeu Pub/Sub) → pas de mail.
        await notifierPaiement({
          canal: "google", type: "abonnement", user_id: userId, produit: subscriptionId,
          pepites: (grantRes as { amount?: number })?.amount ?? null,
          ref: purchaseToken, rpc: grantRes,
        });
      }
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
