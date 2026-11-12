import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { lectureCloudApple, ecritureCloudStore } from "../_shared/cloud-option.js";
import { profilCloudPourStore } from "../_shared/cloud-essai-store.ts";
// (11/11/2026, offres Cloud) Les formules avec Cloud (groupe « FillSell Plan ») : palier + Cloud dans le même reçu.
import { formuleDuProduit, essaiPossiblePourFormule } from "../_shared/formules-serveur.js";
import { PRODUITS_BOUTIQUES } from "../_shared/formules-cloud.js";
import { verdictEssaiStore } from "../_shared/cloud-option.js";

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BUNDLE_ID = "app.fillsell.app";
const FOUNDER_PRODUCT_ID = "app.fillsell.premium.sub";
const STANDARD_PRODUCT_ID = "app.fillsell.premium.standard";
// Pro iOS : app.fillsell.pro.sub est resté bloqué en review Apple sans jamais
// être rattaché à un binaire — remplacé par app.fillsell.pro2.sub (soumis avec
// la 2.3, 2026-07-27). L'ancien id reste reconnu (achats sandbox de dev
// possibles). Fonction Apple-only : le produit Google Play homonyme n'arrive
// jamais ici.
const PRO_PRODUCT_IDS = ["app.fillsell.pro2.sub", "app.fillsell.pro.sub"];
// Business (2026-08-08) : même id que Google Play. Flags CUMULATIFS
// (is_premium + is_pro + is_business).
const BUSINESS_PRODUCT_IDS = ["app.fillsell.business.sub"];
// (11/11) + les trois formules avec Cloud (même groupe Apple) : leur palier se lit par formuleDuProduit.
const FORMULES_APPLE: string[] = (Object.values(PRODUITS_BOUTIQUES) as Array<{ apple: string }>).map((p) => p.apple);
const PREMIUM_PRODUCT_IDS = [FOUNDER_PRODUCT_ID, STANDARD_PRODUCT_ID, ...PRO_PRODUCT_IDS, ...BUSINESS_PRODUCT_IDS, ...FORMULES_APPLE];

// (La table des prix par produit ne servait qu'à la valeur de l'événement
// TikTok, retiré le 7 septembre 2026 : elle est supprimée avec lui. Le montant
// réellement encaissé est chez Apple, pas ici.)

async function verifyWithApple(receipt: string, url: string): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receipt,
      "password": Deno.env.get("APPLE_SHARED_SECRET")!,
      "exclude-old-transactions": true,
    }),
  });
  return res.json();
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    if (!jwt) {
      return new Response(JSON.stringify({ error: "JWT manquant" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Token invalide ou expiré" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { receipt, userId, option } = await req.json();
    // (07/11, Nico) « Restaurer les achats » d'un Cloud pris SEUL (Free + Cloud) : option « cloud » = seule l'option
    // du reçu s'écrit ; la formule du profil (is_premium, is_pro, is_business, échéance, Founder) n'est JAMAIS touchée —
    // une formule prise ailleurs (Stripe, Google) ne doit pas tomber parce que le reçu Apple n'en porte pas.
    const seulementCloud = option === "cloud";

    if (!receipt || !userId) {
      return new Response(JSON.stringify({ error: "receipt et userId requis" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (userId !== authUser.id) {
      return new Response(JSON.stringify({ error: "userId ne correspond pas au JWT" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let appleData = await verifyWithApple(receipt, "https://buy.itunes.apple.com/verifyReceipt");

    // status 21007 = sandbox receipt sent to production → retry on sandbox
    if (appleData.status === 21007) {
      appleData = await verifyWithApple(receipt, "https://sandbox.itunes.apple.com/verifyReceipt");
    }

    if (appleData.status !== 0) {
      console.error("[validate-apple-receipt] Apple status:", appleData.status);
      if (seulementCloud) {
        return new Response(JSON.stringify({ success: false, error: "receipt_invalide", is_cloud: false }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      await supabaseAdmin.from("profiles").update({ is_premium: false }).eq("id", userId);
      return new Response(JSON.stringify({ success: true, is_premium: false }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const bundleId = appleData.receipt?.bundle_id;
    if (bundleId !== BUNDLE_ID) {
      console.error("[validate-apple-receipt] bundle_id mismatch:", bundleId);
      return new Response(JSON.stringify({ error: "bundle_id invalide" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const inApp: any[] = appleData.latest_receipt_info ?? appleData.receipt?.in_app ?? [];
    const now = Date.now();

    const activeSub = inApp.find((tx: any) => {
      if (!PREMIUM_PRODUCT_IDS.includes(tx.product_id)) return false;
      const expires = tx.expires_date_ms ? parseInt(tx.expires_date_ms) : 0;
      return expires > now;
    });

    // (11/11) Une formule avec Cloud en semaine gratuite REFUSÉE (⛔ Business + Cloud n'a pas d'essai ; essai FillSell déjà
    // pris ou verrous de la préparation, décision 8) : rien ne monte avant le premier paiement réel.
    const formuleA = activeSub ? formuleDuProduit(activeSub.product_id) : null;
    const essaiA = activeSub?.is_trial_period === "true";
    const profilCloudA = formuleA?.cloud ? await profilCloudPourStore(supabaseAdmin, userId) : null;
    const refusEssaiA = !!formuleA?.cloud && essaiA
      && (!essaiPossiblePourFormule(formuleA.formule) || verdictEssaiStore(profilCloudA ?? {}, "apple", activeSub?.original_transaction_id ?? null).ok === false);
    const isPremium = !!activeSub && !refusEssaiA;
    const isFounderPurchase = isPremium && activeSub!.product_id === FOUNDER_PRODUCT_ID;
    const isBusinessPurchase = isPremium && (BUSINESS_PRODUCT_IDS.includes(activeSub!.product_id) || (formuleA?.cloud === true && formuleA.rang === 3));
    const isProPurchase = (isPremium && (PRO_PRODUCT_IDS.includes(activeSub!.product_id) || (formuleA?.cloud === true && formuleA.rang >= 2))) || isBusinessPurchase;

    // Même logique que apple-iap-webhook : is_pro suit l'abonnement Pro actif,
    // et l'originalTransactionId est capturé dès qu'il est présent (tout produit).
    // Business : cumulatif (is_pro + is_business posés ensemble).
    const update: Record<string, unknown> = { is_premium: isPremium };
    // (11/11) Semaine gratuite refusée : les drapeaux ne bougent pas (un abonné garde ce qu'il avait, rien ne monte).
    if (refusEssaiA) delete update.is_premium;
    if (isProPurchase) update.is_pro = true;
    if (isBusinessPurchase) update.is_business = true;
    if (activeSub?.original_transaction_id) {
      update.apple_original_transaction_id = activeSub.original_transaction_id;
    }
    // (25/10, point 4 « Revenus ») L'échéance et le renouvellement auto, lus dans le reçu qu'Apple vient de
    // valider (latest_receipt_info + pending_renewal_info) : même colonne, même format ISO que les webhooks.
    if (activeSub?.expires_date_ms) {
      const fin = new Date(parseInt(activeSub.expires_date_ms)).toISOString();
      if (!Number.isNaN(Date.parse(fin))) update.subscription_period_end = fin;
      const renouv = (appleData.pending_renewal_info ?? [])
        .find((r: any) => r?.original_transaction_id === activeSub.original_transaction_id);
      if (renouv?.auto_renew_status === "0" || renouv?.auto_renew_status === "1") {
        update.subscription_cancel_at_period_end = renouv.auto_renew_status === "0";
      }
    }

    // ── L'OPTION CLOUD dans le même reçu (04/10) : restauration / validation ──
    // Groupe « FillSell Cloud », à part du palier. La transaction la plus
    // récente du produit fait foi ; is_trial_period du reçu historique vaut
    // l'offre d'introduction (essai 1 semaine). Une option portée par un autre
    // canal n'est pas touchée (ecritureCloudStore).
    let majCloudLue: Record<string, unknown> | null = null;
    const txCloud = inApp
      .filter((tx: any) => lectureCloudApple({ productId: tx.product_id }))
      .sort((a: any, b: any) => parseInt(b.expires_date_ms ?? "0") - parseInt(a.expires_date_ms ?? "0"))[0];
    if (txCloud) {
      const expiresCloud = parseInt(txCloud.expires_date_ms ?? "0") || 0;
      const lecture = lectureCloudApple({
        productId: txCloud.product_id,
        offerType: txCloud.is_trial_period === "true" ? 1 : undefined,
        purchaseDate: parseInt(txCloud.purchase_date_ms ?? "0") || undefined,
        expiresDate: expiresCloud || undefined,
        originalTransactionId: txCloud.original_transaction_id,
      })!;
      const profilCloud = await profilCloudPourStore(supabaseAdmin, userId);
      const { update: majCloud, motif } = ecritureCloudStore({
        canal: "apple", lecture, sens: expiresCloud > now ? "on" : "off",
        ref: txCloud.original_transaction_id ?? null, profil: profilCloud ?? {},
      });
      if (majCloud) Object.assign(update, majCloud);
      else console.log(`[validate-apple-receipt] option Cloud du reçu ignorée (${motif})`);
      majCloudLue = majCloud ?? null;
    }
    // (11/11) Le Cloud d'une formule avec Cloud (même transaction que le palier) : essai = semaine gratuite permise.
    if (formuleA?.cloud && activeSub && !seulementCloud) {
      const lectureA = lectureCloudApple({
        productId: "app.fillsell.cloud.sub", offerType: essaiA ? 1 : undefined,
        purchaseDate: parseInt(activeSub.purchase_date_ms ?? "0") || undefined, expiresDate: parseInt(activeSub.expires_date_ms ?? "0") || undefined,
        originalTransactionId: activeSub.original_transaction_id,
      })!;
      if (refusEssaiA) console.log(`[validate-apple-receipt] ${formuleA.formule} en semaine gratuite refusée : ni palier ni Cloud avant le premier paiement`);
      else {
        const { update: majF, motif: motifF } = ecritureCloudStore({ canal: "apple", lecture: lectureA, sens: "on", ref: activeSub.original_transaction_id ?? null, profil: profilCloudA ?? {} });
        if (majF) Object.assign(update, majF, { cloud_formule: formuleA.formule });
        else console.log(`[validate-apple-receipt] Cloud de ${formuleA.formule} ignoré (${motifF})`);
      }
    }
    if (seulementCloud) {
      // L'option seule : rien d'autre ne s'écrit (ni formule, ni Founder).
      if (majCloudLue) await supabaseAdmin.from("profiles").update(majCloudLue).eq("id", userId);
      console.log(`[validate-apple-receipt] option cloud seule userId=${userId} cloud=${txCloud ? (majCloudLue ? "ecrite" : "ignoree") : "absente"}`);
      return new Response(JSON.stringify({ success: true, is_cloud: majCloudLue?.is_cloud === true, cloud: txCloud ? (majCloudLue ? "ecrite" : "ignoree") : "absente" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    await supabaseAdmin.from("profiles").update(update).eq("id", userId);

    // Conversion TikTok RETIRÉE le 7 septembre 2026 (décision Nico).
    // ⚠️ Cet appel-ci était `await` SANS `.catch()` : une panne réseau vers
    // TikTok pouvait faire échouer la validation d'un achat Apple déjà
    // encaissé. Le retirer supprime ce chemin d'échec au passage.

    if (isFounderPurchase) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("is_founder").eq("id", userId).single();
      if (!profile?.is_founder) {
        await supabaseAdmin.from("profiles").update({ is_founder: true }).eq("id", userId);
        const { data: fc } = await supabaseAdmin.from("founder_config").select("slots_used").eq("id", 1).single();
        await supabaseAdmin.from("founder_config").update({ slots_used: (fc?.slots_used ?? 0) + 1 }).eq("id", 1);
      }
    }

    console.log(`[validate-apple-receipt] userId=${userId} is_premium=${isPremium} is_founder=${isFounderPurchase} is_pro=${isProPurchase} is_business=${isBusinessPurchase} product=${activeSub?.product_id ?? "none"}`);

    return new Response(JSON.stringify({ success: true, is_premium: isPremium }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[validate-apple-receipt] Erreur inattendue:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
