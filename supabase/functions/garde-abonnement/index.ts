// ═══════════════════════════════════════════════════════════════════════════
// GARDE-ABONNEMENT — « UN SEUL ABONNEMENT ACTIF PAR COMPTE, TOUS CANAUX » AVANT LA FEUILLE D'UNE BOUTIQUE (13/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// 3e réponse de Nico, point a. L'app iPhone / Android l'appelle AVANT d'ouvrir la feuille de l'App Store / Google Play
// (achat d'un forfait, d'une formule avec Cloud ou du Cloud seul) : un achat de boutique ne se refuse plus après coup —
// l'argent est parti. Cas réels : c7c382b7 (Pro par carte, puis Cloud seul pris sur iPhone le 12/11), f0acd3af (Pro App
// Store, puis Cloud seul App Store le 09/11). Le web est gardé par create-checkout-session lui-même.
// LECTURE SEULE : le profil, les abonnements Stripe du client (aucun client créé), l'abonnement Google relu. Rien n'est
// écrit nulle part. Appelant = l'app avec la session de la personne (verify_jwt true) ; elle ne parle que de SON compte.
// Réponse : { permis, voie | motif, canal, message_fr, message_en, vivants } ; une lecture impossible (Stripe muet) →
// { permis: null } : l'app applique alors sa preuve locale (lib/gardeAchat.js), jamais un « permis » inventé ici.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { jetonGooglePlay } from "../_shared/google-play-token.ts";
import { abonnementGoogleActif } from "../_shared/droits-canaux.js";
import { litAbonnementStripe } from "../_shared/cloud-option.js";
import { prixStripe } from "../_shared/prix-stripe.ts";
import { abonnementsVivants, decisionAchat, messageUnSeulAbonnement, ACHATS, CANAUX_ABONNEMENT } from "../_shared/un-seul-abonnement.js";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const COLONNES = "stripe_customer_id, google_purchase_token, google_product_id, apple_original_transaction_id, is_premium, is_pro, is_business, "
  + "subscription_period_end, cloud_canal, cloud_ref, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Une lecture Stripe (REST, GET seulement). Lance si Stripe ne répond pas. */
async function lireStripe(chemin: string): Promise<unknown[]> {
  const cle = Deno.env.get("STRIPE_SECRET_KEY");
  if (!cle) throw new Error("STRIPE_SECRET_KEY absente");
  const r = await fetch(`https://api.stripe.com/v1/${chemin}`, { headers: { Authorization: `Bearer ${cle}` }, signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`Stripe ${chemin.split("?")[0]} → HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.data) ? j.data : [];
}
/** Les abonnements Stripe du compte, en LECTURE (aucun client créé) : ceux de profiles.stripe_customer_id, sinon ceux des
 *  clients Stripe qui portent l'adresse du compte (un premier paiement n'écrit le client sur le profil qu'une fois payé). */
async function abonnementsStripe(customerId: string | null, email: string | null): Promise<unknown[]> {
  const clients = customerId ? [customerId]
    : email ? (await lireStripe(`customers?email=${encodeURIComponent(email)}&limit=3`)).map((c) => (c as { id?: string })?.id).filter(Boolean) as string[] : [];
  const tous: unknown[] = [];
  for (const c of clients) tous.push(...await lireStripe(`subscriptions?customer=${encodeURIComponent(c)}&status=all&limit=30`));
  return tous;
}

async function googleActifRelu(jeton: string | null | undefined): Promise<boolean | null> {
  if (!jeton) return null;
  try {
    const acces = await jetonGooglePlay();
    const rg = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.fillsell.app/purchases/subscriptionsv2/tokens/${encodeURIComponent(String(jeton))}`,
      { headers: { Authorization: `Bearer ${acces}` }, signal: AbortSignal.timeout(6_000) });
    if (rg.ok) return abonnementGoogleActif(await rg.json());
    if (rg.status === 404 || rg.status === 410) return false;
  } catch (e) {
    console.warn("[garde-abonnement] abonnement Google illisible :", (e as Error)?.message ?? e);
  }
  return null;
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "JWT manquant" }, 401);
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);
    const corps = await req.json().catch(() => ({}));
    const canal = String(corps?.canal ?? "");
    const achat = String(corps?.achat ?? "");
    if (!CANAUX_ABONNEMENT.includes(canal) || !ACHATS.includes(achat)) return json({ error: "canal_ou_achat_inconnu" }, 400);

    const { data: profil, error: errP } = await admin.from("profiles").select(COLONNES).eq("id", user.id).maybeSingle();
    if (errP) {
      console.error("[garde-abonnement] profil illisible :", errP.message);
      return json({ permis: null, raison: "profil_illisible" });
    }
    // deno-lint-ignore no-explicit-any
    const p = (profil ?? {}) as Record<string, any>;
    let stripeLus: unknown[] = [];
    try {
      const prix = prixStripe();
      stripeLus = (await abonnementsStripe(p.stripe_customer_id ?? null, user.email ?? null)).map((s) => ({ ...litAbonnementStripe(s, prix), status: (s as { status?: string })?.status ?? null }));
    } catch (e) {
      console.error(`[garde-abonnement] ${user.id} : Stripe illisible (${(e as Error)?.message ?? e}) — l'app décide sur sa preuve locale`);
      return json({ permis: null, raison: "stripe_illisible" });
    }
    const googleActif = await googleActifRelu(p.google_purchase_token);
    const vivants = abonnementsVivants({ profil: p, stripe: stripeLus, googleActif });
    const d = decisionAchat({ canal, achat, vivants });
    console.log(`[garde-abonnement] ${user.id} : ${achat} sur ${canal} → ${d.permis ? `permis (${d.voie})` : `REFUSÉ (${d.motif}, ${d.canal})`} — vivants : ${vivants.map((v) => `${v.canal}/${v.type}`).join(", ") || "aucun"}`);
    return json({
      ...d,
      message_fr: messageUnSeulAbonnement(d, "fr"), message_en: messageUnSeulAbonnement(d, "en"),
      vivants: vivants.map((v) => ({ canal: v.canal, type: v.type })),
    });
  } catch (e) {
    console.error("[garde-abonnement] erreur :", (e as Error)?.message ?? e);
    return json({ permis: null, raison: "erreur" });
  }
});
