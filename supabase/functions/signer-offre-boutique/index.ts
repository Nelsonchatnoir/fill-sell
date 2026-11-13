// ═══════════════════════════════════════════════════════════════════════════
// SIGNER-OFFRE-BOUTIQUE — L'ESSAI DU CLOUD POUR LES ABONNÉS APP STORE / GOOGLE PLAY (13/11/2026) — ⛔ INACTIF
// ═══════════════════════════════════════════════════════════════════════════
// 3e réponse de Nico, point f : préparé pour le PROCHAIN binaire, rien de soumis. Tant que le secret
// ESSAI_ABONNES_BOUTIQUE n'est pas « 1 », la fonction répond 409 « ferme » et ne lit rien (ni profil, ni Stripe, ni clé).
// Ouverte : elle juge l'éligibilité (règle du web, décision 6 : même palier, Premium + Cloud ou Pro + Cloud, un seul
// abonnement vivant sur CE canal, essai du Cloud jamais pris et préparation fraîche) puis :
//   · Apple → la signature de l'offre promotionnelle (clé d'achats intégrés APPLE_API_PRIVATE_KEY / APPLE_API_KEY_ID —
//     _shared/apple-jwt.ts), pour Product.PurchaseOption.promotionalOffer ;
//   · Google → l'identifiant de l'offre « déterminée par le développeur » (aucune signature chez Google).
// Rien n'est écrit : les droits de l'essai viennent, comme aujourd'hui, des webhooks (apple-iap-webhook, google-play-webhook)
// à la transaction réelle. Appelant = l'app avec la session (verify_jwt true) ; elle ne parle que de SON compte.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { chargerCléApple } from "../_shared/apple-jwt.ts";
import { essaiAbonneBoutiquePermis, signerOffrePromoApple, PRODUITS_APPLE_ESSAI_ABONNE } from "../_shared/offre-essai-abonne.js";
import { abonnementsVivants } from "../_shared/un-seul-abonnement.js";
import { essaiCloudPermis, litAbonnementStripe } from "../_shared/cloud-option.js";
import { prixStripe } from "../_shared/prix-stripe.ts";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const COLONNES = "stripe_customer_id, google_purchase_token, google_product_id, apple_original_transaction_id, is_premium, is_pro, is_business, "
  + "subscription_period_end, cloud_canal, cloud_ref, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_essai_refus, cloud_periode_fin, cloud_formule";

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // ⛔ L'interrupteur d'abord : fermé = rien lu, rien signé.
  if (Deno.env.get("ESSAI_ABONNES_BOUTIQUE") !== "1") return json({ error: "ferme" }, 409);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "JWT manquant" }, 401);
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);
    const corps = await req.json().catch(() => ({}));
    const canal = String(corps?.canal ?? "");
    const formule = String(corps?.formule ?? "");

    const { data: lu } = await admin.from("profiles").select(COLONNES).eq("id", user.id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const p = (lu ?? null) as Record<string, any> | null;
    // Stripe relu (lecture) : un abonné par carte n'a rien à faire ici (le web a son essai d'abonné).
    let subs: unknown[] = [];
    if (p?.stripe_customer_id) {
      const r = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(p.stripe_customer_id)}&status=all&limit=30`,
        { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY") ?? ""}` }, signal: AbortSignal.timeout(8_000) });
      if (!r.ok) return json({ error: "stripe_illisible" }, 503);
      subs = ((await r.json())?.data ?? []) as unknown[];
    }
    const prix = prixStripe();
    const vivants = abonnementsVivants({ profil: p, stripe: subs.map((s) => ({ ...litAbonnementStripe(s, prix), status: (s as { status?: string })?.status ?? null })) });
    const { data: permisCloud } = await admin.rpc("cloud_essai_permis", { p_user: user.id });
    const essaiPermis = permisCloud?.fraiche === true && permisCloud?.permis === true && essaiCloudPermis(p ?? {}, subs, prix);
    const d = essaiAbonneBoutiquePermis({ canal: canal as "apple" | "google", formule, vivants, essaiPermis });
    if (!d.permis) return json({ permis: false, raison: d.raison });

    if (canal === "google") return json({ permis: true, canal, offerIdentifier: d.offre });
    const { clé } = await chargerCléApple();
    const offre = await signerOffrePromoApple({
      cle: clé, keyId: Deno.env.get("APPLE_API_KEY_ID") ?? "", productId: (PRODUITS_APPLE_ESSAI_ABONNE as Record<string, string>)[formule],
      offerId: d.offre, appAccountToken: user.id, nonce: crypto.randomUUID(), timestamp: Date.now(),
    });
    console.log(`[signer-offre-boutique] ${user.id} : offre ${d.offre} signée pour ${formule} (Apple)`);
    return json({ permis: true, canal, promotionalOffer: offre });
  } catch (e) {
    console.error("[signer-offre-boutique] erreur :", (e as Error)?.message ?? e);
    return json({ error: "erreur" }, 500);
  }
});
