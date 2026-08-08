import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifierPaiement, alerterPaiementNonCredite } from "../_shared/payment-notify.ts";

// Validation serveur d'un achat Google Play — équivalent strict de
// validate-apple-receipt, côté Android (2026-08-05).
//
// POURQUOI CETTE FONCTION EXISTE
// Jusqu'ici le chemin Android était le SEUL chemin payant du produit (trois
// canaux, deux stores) à accorder un droit depuis le CLIENT :
// App.jsx faisait `supabase.from('profiles').update({is_premium:true, …})`
// avec le JWT de l'utilisateur. Deux conséquences :
//   1. l'écriture était refusée (42501) — is_premium/is_pro/
//      google_purchase_token/google_product_id ne sont pas dans le GRANT
//      UPDATE colonne-scopé de `authenticated` — et le refus n'était pas lu,
//      d'où l'écran « Bienvenue dans Premium » sur un achat perdu ;
//   2. si on avait « réparé » en élargissant le GRANT, n'importe qui se
//      serait passé Premium avec son propre JWT.
// ⛔ LE GRANT NE DOIT JAMAIS ÊTRE ÉLARGI À CES COLONNES. Le refus 42501 est
//    la garde, pas le bug. C'est l'écriture client qui a disparu.
//
// Déploiement : supabase functions deploy validate-google-purchase
// (verify_jwt reste à TRUE — ce n'est pas un webhook, c'est un appel client.)

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const PACKAGE_NAME = "app.fillsell.app";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Identifiants Google Play. Le Pro iOS (app.fillsell.pro2.sub) n'arrive
// JAMAIS ici : côté Play, le produit Pro est et reste app.fillsell.pro.sub
// (cf. src/lib/iap.js — ne jamais aligner les deux stores).
const FOUNDER_PRODUCT_ID = "app.fillsell.premium.sub";
const STANDARD_PRODUCT_ID = "app.fillsell.premium.standard";
const PRO_PRODUCT_ID = "app.fillsell.pro.sub";
const SUB_PRODUCT_IDS = [FOUNDER_PRODUCT_ID, STANDARD_PRODUCT_ID, PRO_PRODUCT_ID];

// Packs de Pépites (consumables). Doit rester aligné avec
// validate-coin-purchase, google-play-webhook et src/components/coinPacks.js.
// Le SKU .1150 crédite 1300 (rebalance 2026-07-14, SKU non renommable).
const COIN_PRODUCTS: Record<string, number> = {
  "app.fillsell.coins.100": 100,
  "app.fillsell.coins.220": 220,
  "app.fillsell.coins.460": 460,
  "app.fillsell.coins.1150": 1300,
};

// Prix TTC/mois — Founder = tarif legacy grandfathered (miroir de
// validate-apple-receipt, sert uniquement à l'événement TikTok).
const SUB_PRICES: Record<string, number> = {
  [FOUNDER_PRODUCT_ID]: 9.99,
  [STANDARD_PRODUCT_ID]: 12.99,
  [PRO_PRODUCT_ID]: 29.99,
};

// États subscriptionsv2 valant « abonnement payé et en cours ».
// SUBSCRIPTION_STATE_CANCELED en fait PARTIE (2026-08-08) : chez Google,
// CANCELED = renouvellement auto désactivé, l'abonnement COURT toujours
// jusqu'à expiryTime — une annulation ne retire pas l'accès déjà payé. La
// rétrogradation reste portée par les états réellement terminaux, signalés
// au webhook par EXPIRED (12) et REVOKED (13). L'ancien commentaire (« le
// webhook traite le type 3 en PREMIUM_OFF, les deux chemins doivent dire la
// même chose ») décrivait un bug partagé : depuis google-play-webhook v21,
// le type 3 pose seulement subscription_cancel_at_period_end — et ce fichier
// fait pareil, sinon un simple lancement d'app rétrograderait l'annulé.
const ETATS_ACTIFS = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"];

// Même mécanique de service account que google-play-webhook et
// validate-coin-purchase (copiée à dessein : chaque edge function se déploie
// isolément, on ne partage pas un helper qui les couplerait).
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
    false, ["sign"],
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
    // ── 1. Authentification ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "JWT manquant" }, 401);

    const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
    if (authErr || !authUser) return json({ error: "Token invalide ou expiré" }, 401);

    const { productId, purchaseToken, userId } = await req.json();
    if (!productId || !purchaseToken || !userId) {
      return json({ error: "productId, purchaseToken et userId requis" }, 400);
    }
    if (userId !== authUser.id) {
      return json({ error: "userId ne correspond pas au JWT" }, 403);
    }

    // Le TYPE est déduit du productId, jamais lu dans la requête : un client
    // ne doit pas pouvoir faire valider un pack via l'endpoint abonnement.
    const estAbonnement = SUB_PRODUCT_IDS.includes(productId);
    const coins = COIN_PRODUCTS[productId];
    if (!estAbonnement && coins == null) {
      return json({ error: "unknown_product", productId }, 400);
    }

    const accessToken = await getGoogleAccessToken();

    // ── 2A. Produit ponctuel (pack de Pépites) ─────────────────────────────
    if (!estAbonnement) {
      const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${productId}/tokens/${purchaseToken}`;
      const apiRes = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!apiRes.ok) {
        console.error("[validate-google-purchase] Publisher API (products):", await apiRes.text());
        return json({ error: "google_validation_failed" }, 400);
      }
      const purchase = await apiRes.json();
      if (purchase.purchaseState !== 0) {
        return json({ error: "purchase_not_completed", state: purchase.purchaseState }, 400);
      }

      // Le token doit appartenir à l'appelant. Google renvoie l'identifiant
      // que le client a posé au lancement du flow (setObfuscatedAccountId).
      const proprietaire = (purchase?.obfuscatedExternalAccountId
        ?? purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId) as string | undefined;
      if (proprietaire && proprietaire !== userId) {
        console.error(`[validate-google-purchase] token d'un autre compte — appelant=${userId} achat=${proprietaire}`);
        return json({ error: "purchase_belongs_to_another_account" }, 403);
      }

      // Acknowledge best-effort : sans lui Google rembourse au bout de 3 jours.
      if (purchase.acknowledgementState === 0) {
        await fetch(`${apiUrl}:acknowledge`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: "{}",
        }).catch((e) => console.error("[validate-google-purchase] acknowledge:", e));
      }

      // Idempotence : MÊME ref que validate-coin-purchase et que la branche
      // oneTimeProduct du webhook (google:<orderId>) — un achat qui repasse
      // par deux chemins ne peut pas être crédité deux fois.
      const ref = `google:${purchase.orderId ?? purchaseToken}`;
      const { data: credit, error: rpcErr } = await supabaseAdmin.rpc("credit_purchased_coins", {
        p_user_id: userId,
        p_amount: coins,
        p_ref: ref,
        p_metadata: { productId, platform: "android", source: "validate-google-purchase" },
      });
      if (rpcErr) {
        console.error("[validate-google-purchase] credit_purchased_coins:", rpcErr.message);
        await alerterPaiementNonCredite({
          canal: "google", type: "pack", user_id: userId, produit: productId,
          ref, rpc: null, erreur: rpcErr.message,
        });
        return json({ error: "credit_failed" }, 500);
      }
      if ((credit as { credited?: boolean })?.credited === true) {
        await notifierPaiement({
          canal: "google", type: "pack", user_id: userId, produit: productId,
          pepites: coins, ref, rpc: credit,
        });
      }
      console.log(`[validate-google-purchase] pack user=${userId} product=${productId} ref=${ref} →`, JSON.stringify(credit));
      return json({ ok: true, type: "pack", coins, ...(credit as Record<string, unknown>) });
    }

    // ── 2B. Abonnement ─────────────────────────────────────────────────────
    const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    const apiRes = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!apiRes.ok) {
      console.error("[validate-google-purchase] Publisher API (subscriptionsv2):", await apiRes.text());
      return json({ error: "google_validation_failed" }, 400);
    }
    const purchase = await apiRes.json();

    const proprietaire = purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId as string | undefined;
    if (proprietaire && proprietaire !== userId) {
      console.error(`[validate-google-purchase] abonnement d'un autre compte — appelant=${userId} achat=${proprietaire}`);
      return json({ error: "purchase_belongs_to_another_account" }, 403);
    }

    // Le produit annoncé par le client doit être celui que Google facture.
    const ligne = (purchase?.lineItems ?? [])[0];
    const produitReel = ligne?.productId as string | undefined;
    if (produitReel && produitReel !== productId) {
      return json({ error: "product_mismatch", productId: produitReel }, 400);
    }

    const etat = purchase?.subscriptionState as string | undefined;
    const actif = ETATS_ACTIFS.includes(etat ?? "");

    if (!actif) {
      // ── On ne RETIRE un droit que si ce token EST la source enregistrée ──
      // Un abonnement mort ne prouve rien sur les autres canaux : un abonné
      // Stripe, un premium Apple ou un is_comped ne doit pas être rétrogradé
      // parce qu'un vieux token Play traîne sur l'appareil. Même garde que
      // google-play-webhook (« stale_token_replaced »). Les rétrogradations
      // de plein droit restent le métier du webhook, qui reçoit EXPIRED et
      // REVOKED avec le contexte complet.
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("google_purchase_token").eq("id", userId).maybeSingle();
      if (prof?.google_purchase_token === purchaseToken) {
        const { error: dErr } = await supabaseAdmin
          .from("profiles").update({ is_premium: false, is_pro: false }).eq("id", userId);
        if (dErr) console.error("[validate-google-purchase] rétrogradation:", dErr.message);
      }
      console.log(`[validate-google-purchase] user=${userId} product=${productId} état=${etat} → non actif`);
      return json({ ok: true, type: "abonnement", is_premium: false, state: etat ?? "unknown" });
    }

    const estPro = productId === PRO_PRODUCT_ID;
    const expiryTime = ligne?.expiryTime as string | undefined;
    const update: Record<string, unknown> = {
      is_premium: true,
      google_purchase_token: purchaseToken,
      google_product_id: productId,
      // Miroir de la branche ON de google-play-webhook v21. CANCELED = accès
      // conservé mais intention d'annulation posée ; tout autre état actif la
      // lève. subscription_period_end est une colonne TEXT : on écrit la
      // chaîne ISO telle que Google la renvoie, sans cast.
      subscription_cancel_at_period_end: etat === "SUBSCRIPTION_STATE_CANCELED",
    };
    if (expiryTime) update.subscription_period_end = expiryTime;
    if (estPro) update.is_pro = true;
    if (productId === FOUNDER_PRODUCT_ID) update.is_founder = true;

    const { error: upErr } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
    if (upErr) {
      // Ici l'utilisateur a payé et n'a rien : c'est exactement le cas qu'il
      // faut voir dans la minute, pas au digest du lendemain.
      console.error("[validate-google-purchase] écriture profil:", upErr.message);
      await alerterPaiementNonCredite({
        canal: "google", type: "abonnement", user_id: userId, produit: productId,
        ref: (purchase?.latestOrderId as string) ?? purchaseToken, rpc: null,
        erreur: `écriture profiles refusée : ${upErr.message}`,
      });
      return json({ error: "profile_update_failed" }, 500);
    }

    // Pépites incluses. Idempotent par cycle (next_grant_at + ref unique dans
    // coin_ledger) : le webhook peut rejouer le même événement, ou l'inverse,
    // sans jamais créditer deux fois. p_source 'payment' : cet appel EST
    // adossé à un achat vérifié auprès de Google.
    const { data: grantRes, error: grantErr } = await supabaseAdmin.rpc("upgrade_monthly_grant", {
      p_user_id: userId,
      p_tier: estPro ? "pro" : "premium",
      p_period_end: expiryTime ?? null,
      p_source: "payment",
    });
    if (grantErr) {
      // Le droit est posé, seules les Pépites manquent : on alerte mais on ne
      // renvoie pas d'erreur, sinon le client afficherait un échec sur un
      // abonnement pourtant actif.
      console.error("[validate-google-purchase] upgrade_monthly_grant:", grantErr.message);
      await alerterPaiementNonCredite({
        canal: "google", type: "abonnement", user_id: userId, produit: productId,
        ref: (purchase?.latestOrderId as string) ?? purchaseToken, rpc: null,
        erreur: grantErr.message,
      });
    } else if ((grantRes as { granted?: boolean })?.granted === true) {
      // granted=false = cycle déjà crédité (le webhook est passé avant) → pas
      // de second mail pour le même encaissement.
      await notifierPaiement({
        canal: "google", type: "abonnement", user_id: userId, produit: productId,
        pepites: (grantRes as { amount?: number })?.amount ?? null,
        ref: (purchase?.latestOrderId as string) ?? purchaseToken, rpc: grantRes,
      });
      // Conversion : même événement que validate-apple-receipt, et seulement
      // sur un cycle réellement crédité (jamais sur un rejeu).
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tiktok-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "Purchase", value: SUB_PRICES[productId] ?? 12.99, currency: "EUR" }),
      }).catch((e) => console.error("[validate-google-purchase] tiktok-event:", e));
    }

    console.log(`[validate-google-purchase] user=${userId} product=${productId} état=${etat} is_pro=${estPro} grant=`, JSON.stringify(grantRes));
    return json({ ok: true, type: "abonnement", is_premium: true, is_pro: estPro, state: etat });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[validate-google-purchase] unhandled:", msg);
    return json({ error: msg }, 500);
  }
});
