import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { notifierPaiement, alerterPaiementNonCredite, signalerNotificationStoreInconnue, journaliserNotificationStore, completerJournalStore, signalerRemboursementStore } from "../_shared/payment-notify.ts";
import { decisionGoogle, decisionGoogleRemboursement, ligneJournal, lireEnveloppePubSub, empreinteJeton, isoOuNull, issueDeLaReponse, uuidOuNull } from "../_shared/notifications-stores.js";
import { palierDuProfil } from "../_shared/palier.js";
import { lectureCloudGoogle, ecritureCloudStore, PRODUIT_CLOUD_GOOGLE } from "../_shared/cloud-option.js";
import { profilCloudPourStore } from "../_shared/cloud-essai-store.ts";
import { verifierJetonPubSub } from "../_shared/pubsub-oidc.ts";
// (30/10, lot D point 2) Un canal qui s'arrête ne retire que SON droit ; Stripe relu en lecture seule.
import { patchArretGoogle } from "../_shared/droits-canaux.js";
import { rangStripeDuClient } from "../_shared/stripe-rang-vivant.ts";

// Les colonnes du profil dont l'arrêt du canal Google a besoin (canal, autres canaux, drapeaux).
const COLONNES_ARRET_GOOGLE = "id, google_purchase_token, google_product_id, apple_original_transaction_id, stripe_customer_id, is_premium, is_pro, is_business, subscription_period_end";

/** Arrête le canal Google d'un profil (pur + écriture) : les drapeaux = le plus haut des AUTRES canaux vivants. */
// deno-lint-ignore no-explicit-any
async function arreterCanalGoogle(prof: any, { terminal, produit, raison }: { terminal: boolean; produit: string | null; raison: string }) {
  const rangStripe = await rangStripeDuClient(prof?.stripe_customer_id ?? null);   // lance si Stripe ne répond pas
  const { patch, rangAutres } = patchArretGoogle(prof, { terminal, rangStripe, produit });
  const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", prof.id).eq("google_purchase_token", prof.google_purchase_token);
  if (error) throw new Error(error.message);
  console.log(`[google-play-webhook] canal Google ARRÊTÉ (${raison}${terminal ? ", effacé" : ", jeton gardé pour la reprise"}) → userId=${prof.id} ; autres canaux : rang ${rangAutres} (Stripe ${rangStripe})`, JSON.stringify(patch)); // le patch ne porte jamais un jeton : null ou absent
  return patch;
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── (25/10, point 4 « Revenus ») QUI APPELLE ? ────────────────────────────────
// verify_jwt = false (Pub/Sub n'a pas de session Supabase) : la garde est ICI, et il n'y en avait aucune.
// « observer » (défaut) : le jeton OIDC joint par Pub/Sub est vérifié, son verdict journalisé, RIEN n'est
// refusé — le jour où Nico active l'authentification sur l'abonnement push, on lit des lignes « oidc_ok »
// avant d'exiger. « exiger » (GOOGLE_PUBSUB_AUTH=exiger) : un appel sans jeton Google valide du compte de
// service attendu → 401, journalisé avec son motif, rien d'appliqué, aucune alerte (Pub/Sub, lui, réessaie).
const MODE_AUTH = Deno.env.get("GOOGLE_PUBSUB_AUTH") === "exiger" ? "exiger" : "observer";
const AUDIENCE_PUBSUB = Deno.env.get("GOOGLE_PUBSUB_AUDIENCE") ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-play-webhook`;
const COMPTE_PUBSUB = Deno.env.get("GOOGLE_PUBSUB_SA_EMAIL") ?? null;

type Contexte = { appelId: string; maj: Record<string, unknown> };
const json = (status: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });
// (25/10) Les journaux de la fonction ne portent plus de jeton d'achat en clair (la base garde son empreinte).
const sansJeton = (v: unknown) => JSON.stringify(v, (k, x) => (/purchasetoken/i.test(k) && typeof x === "string" ? "‹jeton›" : x));

const FOUNDER_PRODUCT_ID = "app.fillsell.premium.sub";
const PRO_PRODUCT_ID = "app.fillsell.pro.sub";
// Business (2026-08-08) : flags CUMULATIFS — un Business porte is_premium +
// is_pro + is_business. En rejoignant PREMIUM_PRODUCT_IDS, il suit les mêmes
// PREMIUM_ON/OFF_TYPES et le même traitement CANCELED que les autres paliers.
const BUSINESS_PRODUCT_ID = "app.fillsell.business.sub";
const PREMIUM_PRODUCT_IDS = ["app.fillsell.premium.sub", "app.fillsell.premium.standard", PRO_PRODUCT_ID, BUSINESS_PRODUCT_ID];

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

// (29/10) Le compte d'un jeton d'achat : le jeton COURANT du profil d'abord (abonnement), sinon le dernier appel
// journalisé portant la même empreinte et un compte (pack, ou abonnement remplacé). Jamais deviné : 0 ou 2 profils
// pour un même jeton → la voie du journal, puis rien.
// deno-lint-ignore no-explicit-any
async function compteDuJetonGoogle(jeton: string | null, empreinte: string | null): Promise<any | null> {
  const colonnes = "id, email, google_product_id, is_premium, is_pro, is_business, is_comped";
  try {
    if (jeton) {
      const { data } = await supabaseAdmin.from("profiles").select(colonnes).eq("google_purchase_token", jeton).limit(2);
      if (Array.isArray(data) && data.length === 1) return data[0];
    }
    if (empreinte) {
      const { data: j } = await supabaseAdmin.from("stores_notifications_journal").select("user_id")
        .eq("canal", "google").eq("jeton_empreinte", empreinte).not("user_id", "is", null)
        .order("recu_le", { ascending: false }).limit(1);
      const uid = Array.isArray(j) ? j[0]?.user_id ?? null : null;
      if (uid) {
        const { data } = await supabaseAdmin.from("profiles").select(colonnes).eq("id", uid).maybeSingle();
        return data ?? null;
      }
    }
  } catch (e) {
    console.error("[google-play-webhook] compte du jeton illisible :", (e as Error)?.message ?? e);
  }
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  // ── (25/10, Revenus) UN APPEL = UNE LIGNE AU JOURNAL, QUOI QU'IL ARRIVE ──────
  // Avant : la ligne n'était écrite qu'APRÈS décodage — un appel sans `message.data` (200) ou illisible (500)
  // ne laissait aucune trace, et l'issue (effet_applique) restait vide. Maintenant la ligne naît avant tout
  // décodage ; l'issue — code HTTP, motif (traite / ignore:<raison> / rejet / erreur), compte, échéance et
  // état lus chez Google — la complète à la sortie, par appel_id. Deux écritures bornées (2 s, puis 1 s), avalées.
  const ctx: Contexte = { appelId: crypto.randomUUID(), maj: {} };
  const res = await traiter(req, ctx);
  let texte = "";
  try { texte = await res.clone().text(); } catch { texte = ""; }
  await completerJournalStore(supabaseAdmin, ctx.appelId, { ...ctx.maj, ...issueDeLaReponse(res.status, texte) });
  return res;
});

async function traiter(req: Request, ctx: Contexte): Promise<Response> {
  try {
    const brut = await req.text();
    // deno-lint-ignore no-explicit-any
    let body: any = null, corpsLisible = true;
    try { body = JSON.parse(brut); } catch { corpsLisible = false; }
    const enveloppe = lireEnveloppePubSub(body);
    const verif = await verifierJetonPubSub(req.headers.get("authorization"), { audience: AUDIENCE_PUBSUB, email: COMPTE_PUBSUB });

    // Google envoie le message Pub/Sub encodé en base64
    // deno-lint-ignore no-explicit-any
    let notification: any = null;
    let illisible: string | null = !corpsLisible ? "corps_illisible" : !enveloppe.dataB64 ? "sans_donnees" : null;
    if (!illisible) {
      try { notification = JSON.parse(atob(enveloppe.dataB64!)); }
      catch (e) { illisible = `donnees_illisibles: ${(e as Error)?.message ?? e}`.slice(0, 200); }
      if (!illisible && notification == null) illisible = "donnees_vides"; // (avant : TypeError → 500, idem)
    }
    const jeton = (notification?.subscriptionNotification?.purchaseToken ?? notification?.oneTimeProductNotification?.purchaseToken
      ?? notification?.voidedPurchaseNotification?.purchaseToken ?? null) as string | null;
    const typeBrut = notification?.subscriptionNotification?.notificationType ?? notification?.oneTimeProductNotification?.notificationType;
    const complements: Record<string, unknown> = {
      appel_id: ctx.appelId, message_id: enveloppe.messageId, publie_le: enveloppe.publieLe, abonnement_pubsub: enveloppe.abonnement,
      package_name: typeof notification?.packageName === "string" ? notification.packageName.slice(0, 100) : null,
      evenement_le: isoOuNull(notification?.eventTimeMillis),
      type_store: typeBrut == null || !Number.isFinite(Number(typeBrut)) ? null : Number(typeBrut),
      jeton_empreinte: await empreinteJeton(jeton), test: !!notification?.testNotification, verification: verif.verification,
    };

    if (illisible) {
      await journaliserNotificationStore(supabaseAdmin, ligneJournal({
        canal: "google", type: "illisible", decision: null, detail: { erreur: illisible, attributs: enveloppe.attributs }, complements,
      }));
      if (MODE_AUTH === "exiger" && !verif.ok) return json(401, { error: "unauthorized" });
      // Comportements d'avant, inchangés : sans `message.data` → 200 (rien à rejouer) ; illisible → 500.
      if (illisible === "sans_donnees") return json(200, { ok: true, skipped: "no message data" });
      return json(500, { error: illisible });
    }

    const { packageName, subscriptionNotification } = notification;

    // ── (12/10, A8) CHAQUE NOTIFICATION EST ENREGISTRÉE ; UNE INCONNUE EST SIGNALÉE ──
    // (_shared/notifications-stores.js) Abonnement : la décision de la table ;
    // achat ponctuel (pack) : 1 = achat, 2 = annulation ; test : sans effet ;
    // remboursement (voidedPurchaseNotification, 29/10) : alerte « Remboursement » ;
    // tout le reste : inconnu → alerte à support@, rien d'appliqué. Le traitement qui suit est
    // celui d'avant (plus la mise en pause, ci-dessous).
    {
      const otpJ = notification.oneTimeProductNotification;
      const subJ = subscriptionNotification;
      let typeJ = "inconnu", sousTypeJ: string | null = null;
      let decisionJ: { effet: string | null; connu: boolean };
      if (subJ) { const d = decisionGoogle(subJ.notificationType); typeJ = "abonnement"; sousTypeJ = d.nom; decisionJ = d; }
      else if (otpJ) { typeJ = "achat_ponctuel"; sousTypeJ = String(otpJ.notificationType); decisionJ = otpJ.notificationType === 1 ? { effet: "pack", connu: true } : otpJ.notificationType === 2 ? { effet: "aucun_effet", connu: true } : { effet: null, connu: false }; }
      else if (notification.testNotification) { typeJ = "test"; decisionJ = { effet: "aucun_effet", connu: true }; }
      // (29/10) Un remboursement est CONNU : signalé comme tel plus bas, jamais « inconnu » ni « paiement non enregistré ».
      else if (notification.voidedPurchaseNotification) { typeJ = "achat_annule"; sousTypeJ = `produit_${notification.voidedPurchaseNotification.productType ?? "?"}_remboursement_${notification.voidedPurchaseNotification.refundType ?? "?"}`; decisionJ = decisionGoogleRemboursement(notification.voidedPurchaseNotification); }
      else { decisionJ = { effet: null, connu: false }; }
      const produitJ = (subJ?.subscriptionId ?? otpJ?.sku ?? null) as string | null;
      await journaliserNotificationStore(supabaseAdmin, ligneJournal({
        canal: "google", type: typeJ, sousType: sousTypeJ, decision: decisionJ, produit: produitJ,
        transaction: (notification.voidedPurchaseNotification?.orderId ?? null) as string | null,
        detail: { eventTimeMillis: notification.eventTimeMillis ?? null, attributs: enveloppe.attributs },
        complements,
      }));
      // (25/10) Jeton refusé en mode « exiger » : la ligne est écrite ci-dessus, rien d'appliqué, aucune
      // alerte (un « inconnu » forgé ne déclenche plus de mail à support@).
      if (MODE_AUTH === "exiger" && !verif.ok) return json(401, { error: "unauthorized" });
      if (!decisionJ.connu) {
        await signalerNotificationStoreInconnue({ canal: "google", type: typeJ, sous_type: sousTypeJ, produit: produitJ, ref: (notification.voidedPurchaseNotification?.orderId ?? null) as string | null });
      }
    }

    // ── (29/10, boncoin59300) REMBOURSEMENT GOOGLE : SIGNALÉ COMME TEL, COMPTE RETROUVÉ PAR LE JETON ──
    // Rien n'est appliqué ici : le droit d'un abonnement tombe par SUBSCRIPTION_REVOKED / EXPIRED (envoyées à
    // part, parfois dans la même seconde) ; les Pépites d'un pack remboursé restent créditées (décision humaine).
    const annule = notification.voidedPurchaseNotification;
    if (annule) {
      const d = decisionGoogleRemboursement(annule);
      const compte = await compteDuJetonGoogle(typeof annule.purchaseToken === "string" ? annule.purchaseToken : null,
        (complements.jeton_empreinte as string | null) ?? null);
      ctx.maj.user_id = uuidOuNull(compte?.id);
      ctx.maj.transaction_id = (annule.orderId as string | undefined) ?? null;
      ctx.maj.effet_applique = "remboursement_signale";
      const palier = compte ? palierDuProfil(compte) : null;
      await signalerRemboursementStore({
        canal: "google", nature: "remboursement", type: d.type as "pack" | "abonnement", partiel: d.partiel,
        user_id: compte?.id ?? null, email: compte?.email ?? null,
        produit: d.type === "abonnement" ? (compte?.google_product_id ?? null) : null,
        ref: (annule.orderId as string | undefined) ?? null, palier,
        droit: d.type === "pack"
          ? "Pépites du pack NON reprises (à décider)"
          : palier && palier !== "gratuit" ? "encore ouvert à l'instant de l'alerte : SUBSCRIPTION_REVOKED le retire (à vérifier)" : "retiré",
      });
      console.log(`[google-play-webhook] remboursement ${d.nom} commande=${annule.orderId ?? "?"} → compte=${compte?.id ?? "INTROUVABLE"} palier=${palier ?? "?"}`);
      // (30/10, lot D point 2 — BONCOIN) Un ABONNEMENT remboursé sur le jeton COURANT du profil : le canal Google
      // s'arrête et s'efface, comme sur REVOKED (idempotent si REVOKED est déjà passé : le jeton n'y est plus).
      if (d.type === "abonnement" && compte?.id && typeof annule.purchaseToken === "string") {
        const { data: profR } = await supabaseAdmin.from("profiles").select(COLONNES_ARRET_GOOGLE).eq("id", compte.id).maybeSingle();
        if (profR?.google_purchase_token && profR.google_purchase_token === annule.purchaseToken) {
          try {
            await arreterCanalGoogle(profR, { terminal: true, produit: profR.google_product_id ?? null, raison: "remboursement" });
            ctx.maj.effet_applique = "remboursement_canal_efface";
          } catch (e) {
            console.error("[google-play-webhook] remboursement : arrêt du canal impossible —", (e as Error)?.message ?? e);
            return json(500, { error: "arret_canal_impossible" });
          }
        }
      }
      return json(200, { ok: true, remboursement: d.nom });
    }

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
        console.warn("[google-play-webhook] oneTimeProduct inconnu — skipped —", sansJeton(otp));
        return new Response(JSON.stringify({ ok: true, skipped: "unknown_one_time_product" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      // notificationType : 1 = ONE_TIME_PRODUCT_PURCHASED, 2 = CANCELED
      if (otp.notificationType !== 1 || !otpToken) {
        console.warn("[google-play-webhook] oneTimeProduct non crédité — skipped —", sansJeton(otp));
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
      // (25/10) Au journal de cet appel : la commande et l'environnement (achat de testeur ou réel).
      ctx.maj.transaction_id = (purchase?.orderId as string | undefined) ?? null;
      ctx.maj.environnement = purchase?.purchaseType === 0 ? "test" : "production";
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
      ctx.maj.user_id = uuidOuNull(coinUserId);
      if (!coinUserId) {
        // Payload complet : seule trace permettant un crédit manuel a posteriori.
        console.error("[google-play-webhook] oneTimeProduct sans obfuscatedExternalAccountId —", sansJeton(purchase));
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
        console.error("[google-play-webhook] credit_purchased_coins:", rpcErr.message, "—", sansJeton(otp));
        await alerterPaiementNonCredite({
          canal: "google", type: "pack", user_id: coinUserId, produit: sku,
          ref, rpc: null, erreur: rpcErr.message,
        });
        return new Response(JSON.stringify({ error: "credit_failed" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      console.log(`[google-play-webhook] oneTimeProduct crédité → userId=${coinUserId} sku=${sku} ref=${ref} →`, JSON.stringify(credit));
      ctx.maj.effet_applique = (credit as { credited?: boolean })?.credited === true ? "pack" : "pack_deja_credite";
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
      console.log("[google-play-webhook] not a subscription event — skipped —", sansJeton(notification));
      return new Response(JSON.stringify({ ok: true, skipped: "not a subscription event" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const { notificationType, purchaseToken, subscriptionId } = sub;

    // (04/10) L'option Cloud (app.fillsell.cloud.sub) passe aussi : traitée plus bas.
    if (!PREMIUM_PRODUCT_IDS.includes(subscriptionId) && subscriptionId !== PRODUIT_CLOUD_GOOGLE) {
      return new Response(JSON.stringify({ ok: true, skipped: "non-premium product" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Types Google Play :
    // 1=RECOVERED 2=RENEWED 4=PURCHASED 7=RESTARTED → premium ON
    // 5=ON_HOLD 12=REVOKED 13=EXPIRED → premium OFF (29/10 : numéros remis dans l'ordre de Google — le journal
    // du 29/10 10:04 dit type 12 = SUBSCRIPTION_REVOKED, 13 = SUBSCRIPTION_EXPIRED ; les deux coupaient déjà)
    // 3=CANCELED → traitement DÉDIÉ plus bas (2026-08-08) : chez Google,
    // CANCELED signifie seulement « renouvellement auto désactivé » — l'abonné
    // GARDE son accès jusqu'à expiryTime. La perte réelle arrive en 12 ou 13.
    // Le rangement historique de 3 dans PREMIUM_OFF_TYPES coupait le droit à
    // la seconde de l'annulation, sur un mois pourtant payé.
    // (29/10, Nico : « un impayé repasse en gratuit », tous canaux) 6=IN_GRACE_PERIOD coupe aussi : le paiement a
    // échoué, Google réessaie — comme past_due chez Stripe et DID_FAIL_TO_RENEW chez Apple. Le droit revient seul
    // au paiement (1 = RECOVERED, 2 = RENEWED).
    const PREMIUM_ON_TYPES  = [1, 2, 4, 7];
    // (12/10, A8) + 10 = SUBSCRIPTION_PAUSED : l'abonnement mis en pause par la
    // personne n'est plus payé — le droit s'arrête, comme ON_HOLD ; la reprise
    // arrive en 1 = RECOVERED (déjà « on »). Table : _shared/notifications-stores.js.
    const PREMIUM_OFF_TYPES = [5, 6, 10, 12, 13];
    const CANCELED_TYPE = 3;

    let isPremium: boolean | null = null;
    if (PREMIUM_ON_TYPES.includes(notificationType))  isPremium = true;
    if (PREMIUM_OFF_TYPES.includes(notificationType)) isPremium = false;

    if (isPremium === null && notificationType !== CANCELED_TYPE) {
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
    // (25/10, Revenus) Ce que Google dit de l'abonnement, au journal de cet appel — l'échéance (expiryTime)
    // et le renouvellement auto de la ligne du produit notifié, l'état, la commande, le compte.
    {
      // deno-lint-ignore no-explicit-any
      const lignes = (purchase?.lineItems ?? []) as Array<Record<string, any>>;
      const ligneJ = lignes.find((l) => l?.productId === subscriptionId) ?? lignes[0];
      ctx.maj.user_id = uuidOuNull(userId);
      ctx.maj.transaction_id = (purchase?.latestOrderId as string | undefined) ?? null;
      ctx.maj.etat_store = (purchase?.subscriptionState as string | undefined) ?? null;
      ctx.maj.fin_periode = isoOuNull(ligneJ?.expiryTime);
      ctx.maj.renouvellement_auto = typeof ligneJ?.autoRenewingPlan?.autoRenewEnabled === "boolean" ? ligneJ.autoRenewingPlan.autoRenewEnabled : null;
      ctx.maj.environnement = purchase?.testPurchase ? "test" : "production";
    }

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
        sansJeton({ notificationType, subscriptionId, purchase }),
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

    // ── L'OPTION CLOUD — app.fillsell.cloud.sub (04/10/2026) ────────────────
    // Forfait cloud-monthly, offre cloud-trial-3d (essai 7 JOURS depuis le
    // 04/10 nuit, l'identifiant ne se renomme pas). PURCHASED (4)
    // avec l'offre → essai (dates, option pas payée) ; RENEWED / RECOVERED /
    // RESTARTED → payée ; EXPIRED / REVOKED / ON_HOLD → retirée ; CANCELED (3)
    // → renouvellement coupé, accès conservé. Garde « référence remplacée » sur
    // cloud_ref (jamais sur google_purchase_token, qui est celui du palier).
    // Les règles sont dans _shared/cloud-option.js.
    const lectureCloud = lectureCloudGoogle(subscriptionId, purchase, notificationType);
    if (lectureCloud) {
      const sens = notificationType === CANCELED_TYPE ? "annulation" : isPremium ? "on" : "off";
      const profilCloud = await profilCloudPourStore(supabaseAdmin, userId);
      const { update, motif } = ecritureCloudStore({
        canal: "google", lecture: lectureCloud, sens, ref: purchaseToken, profil: profilCloud ?? {},
      });
      if (update && motif === "essai_deja_pris") {
        console.warn(`[google-play-webhook] essai Cloud REFUSÉ : ce compte a déjà eu son essai (autre canal) — Cloud démarrera au premier paiement`);
      }
      if (!update) {
        console.log(`[google-play-webhook] Cloud ${sens} ignoré (${motif}) → userId=${userId}`);
        return new Response(JSON.stringify({ ok: true, skipped: motif }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      const { error: cloudErr } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
      if (cloudErr) {
        console.error("[google-play-webhook] DB error (cloud):", cloudErr.message);
        return new Response(JSON.stringify({ error: cloudErr.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      console.log(`[google-play-webhook] Cloud type=${notificationType} ${sens}${lectureCloud.essai ? " (essai)" : ""} → userId=${userId}`, JSON.stringify(update));
      ctx.maj.effet_applique = `cloud_${sens}`;
      return new Response(JSON.stringify({ ok: true, cloud: true, sens }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // ── Type 3 (CANCELED) : renouvellement coupé, accès CONSERVÉ ────────────
    // (2026-08-08) On ne touche PAS à is_premium : l'abonné a payé jusqu'à
    // expiryTime. On pose seulement l'intention d'annulation et la fin de
    // période — la rétrogradation effective restera portée par EXPIRED (12)
    // ou REVOKED (13). Même garde « token remplacé » que la branche OFF :
    // un CANCELED posthume sur un token remplacé (upgrade) ne veut rien dire.
    if (notificationType === CANCELED_TYPE) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("google_purchase_token").eq("id", userId).single();
      // (30/10, lot D) Jeton ABSENT aussi : le canal Google a déjà été arrêté et effacé — un CANCELED tardif ne
      // doit pas poser de fin de période sur un profil qui ne paie plus par Google.
      if (prof?.google_purchase_token !== purchaseToken) {
        console.log(`[google-play-webhook] CANCELED ignoré : jeton ${prof?.google_purchase_token ? "remplacé" : "déjà retiré"} (product=${subscriptionId} userId=${userId})`);
        return new Response(JSON.stringify({ ok: true, skipped: "stale_token_replaced" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      const finPeriode = purchase?.lineItems?.[0]?.expiryTime as string | undefined;
      const { error: cErr } = await supabaseAdmin.from("profiles").update({
        subscription_cancel_at_period_end: true,
        subscription_period_end: finPeriode ?? null,
      }).eq("id", userId);
      if (cErr) {
        console.error("[google-play-webhook] DB error (canceled):", cErr.message);
        return new Response(JSON.stringify({ error: cErr.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      console.log(`[google-play-webhook] type=3 CANCELED → userId=${userId} accès conservé jusqu'à ${finPeriode ?? "(expiryTime absent)"}`);
      ctx.maj.effet_applique = "annulation";
      return new Response(JSON.stringify({ ok: true, cancel_at_period_end: true }), {
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
        .from("profiles").select(COLONNES_ARRET_GOOGLE).eq("id", userId).single();
      // (30/10, lot D) Jeton ABSENT aussi : canal déjà arrêté et effacé (un OFF tardif ne touche plus à rien).
      if (prof?.google_purchase_token !== purchaseToken) {
        console.log(`[google-play-webhook] OFF ignoré : jeton ${prof?.google_purchase_token ? "remplacé" : "déjà retiré"} (type=${notificationType} product=${subscriptionId} userId=${userId})`);
        return new Response(JSON.stringify({ ok: true, skipped: prof?.google_purchase_token ? "stale_token_replaced" : "jeton_deja_retire" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      // ── (30/10, lot D point 2 — BONCOIN) L'ARRÊT NE RETIRE QUE LE DROIT GOOGLE ──────────────────────────
      // Avant : is_premium (et pro / business) à false, quel que soit l'autre canal, et le jeton GARDÉ — un profil
      // remboursé par Google semblait payer encore par Google (le paiement web le croyait abonné). Désormais :
      // les drapeaux = le plus haut des AUTRES canaux vivants (Stripe relu, Apple) ; sur un arrêt TERMINAL
      // (12 REVOKED, 13 EXPIRED) le canal Google s'efface (jeton, produit, fin). Passager (5, 6, 10) : jeton gardé,
      // la reprise (1 RECOVERED) arrive dessus.
      try {
        await arreterCanalGoogle(prof, { terminal: notificationType === 12 || notificationType === 13, produit: subscriptionId, raison: `type ${notificationType}` });
      } catch (e) {
        console.error("[google-play-webhook] arrêt du canal impossible :", (e as Error)?.message ?? e);
        return new Response(JSON.stringify({ error: "arret_canal_impossible" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      ctx.maj.effet_applique = "off";
      return new Response(JSON.stringify({ ok: true, premium: false }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const update: Record<string, unknown> = { is_premium: isPremium };
    if (isPremium) {
      update.google_purchase_token = purchaseToken;
      update.google_product_id = subscriptionId;
      // (2026-08-08) Fin de période enfin visible côté DB pour les abonnés
      // Google (jamais renseignée jusqu'ici), et annulation levée : un ON
      // (achat, renouvellement, réactivation) repart sur un cycle actif —
      // sans quoi le traitement du type 3 ci-dessus serait incohérent.
      const finPeriode = purchase?.lineItems?.[0]?.expiryTime as string | undefined;
      if (finPeriode) update.subscription_period_end = finPeriode;
      update.subscription_cancel_at_period_end = false;
    }
    if (isPremium && subscriptionId === FOUNDER_PRODUCT_ID) update.is_founder = true;
    // Pro : le flag suit l'état de l'abonnement (ON → true, OFF → false)
    if (subscriptionId === PRO_PRODUCT_ID) update.is_pro = isPremium;
    // Business : cumulatif — pose/retire is_pro ET is_business ensemble.
    if (subscriptionId === BUSINESS_PRODUCT_ID) {
      update.is_pro = isPremium;
      update.is_business = isPremium;
    }

    const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
    if (error) {
      console.error("[google-play-webhook] DB error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
    ctx.maj.effet_applique = isPremium ? "on" : "off";

    // Pièces incluses au 1er achat et à chaque renouvellement.
    // Cycle par utilisateur (2026-07-28) : expiryTime — déjà présent dans la
    // réponse subscriptionsv2 récupérée plus haut — devient l'échéance du
    // prochain grant. C'est le store qui décide quand il encaisse, on ne
    // calcule jamais la date nous-mêmes. p_source "payment" : cet événement
    // EST la preuve de paiement (le sweep, lui, ne rattrape que 3 jours).
    if (isPremium) {
      const grantTier = subscriptionId === BUSINESS_PRODUCT_ID ? "business"
        : subscriptionId === PRO_PRODUCT_ID ? "pro" : "premium";
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
}
