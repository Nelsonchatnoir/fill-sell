import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";

// ═══════════════════════════════════════════════════════════════════════════
// « MES FACTURES » — une session du portail de facturation Stripe (18/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Appelée par Réglages › Abonnement › Mes factures, pour les abonnés WEB
// seulement : un abonnement souscrit dans l'App Store ou Google Play n'a pas
// de facture chez nous, c'est la boutique qui la porte (l'app renvoie donc
// vers l'historique d'achats Apple / Google, sans passer par ici).
//
// CE QUE CETTE FONCTION FAIT, ET RIEN D'AUTRE : elle échange un JWT
// utilisateur contre une URL de portail à usage unique. Elle ne crée pas
// d'abonnement, n'en résilie aucun (c'est cancel-subscription), n'écrit rien
// en base et ne renvoie jamais autre chose qu'une URL.
//
// ⚠️ verify_jwt reste à TRUE — déploiement NORMAL, sans --no-verify-jwt :
// l'appelant est un utilisateur connecté, pas Stripe ni pg_net. Ne pas
// l'ajouter à la liste --no-verify-jwt de CLAUDE.md.
//
// ⚠️ Le portail exige une CONFIGURATION active dans le dashboard Stripe
// (Billing › Customer portal). Si elle manque, Stripe refuse la création : on
// rend alors une erreur claire, et l'app retombe sur sa phrase de repli
// (« tes factures partent par e-mail à chaque prélèvement ») — jamais un
// bouton muet.

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le
// développement casse dès le PRÉFLIGHT CORS. Même liste que les autres
// fonctions appelées par l'app.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Admin client — SERVICE_ROLE_KEY bypasse le RLS (lecture de stripe_customer_id).
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profil, error } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[stripe-portal] profil illisible :", error.message);
      return json({ error: "profil_illisible" }, 500);
    }
    // Jamais payé par le web : il n'y a rien à ouvrir, et l'app ne propose
    // d'ailleurs la ligne que si un client Stripe existe. Ceinture.
    if (!profil?.stripe_customer_id) return json({ error: "aucun_client_stripe" }, 404);

    // Retour : l'origine de l'appelant si on la connaît, sinon le site. Une
    // URL arbitraire ne passe pas — c'est une redirection ouverte sinon.
    let retour = "https://fillsell.app";
    try {
      const corps = await req.json();
      const demande = String(corps?.retour ?? "");
      if (ALLOWED_ORIGINS.includes(demande)) retour = demande;
    } catch { /* pas de corps : on garde le site */ }

    const session = await stripe.billingPortal.sessions.create({
      customer: profil.stripe_customer_id,
      return_url: retour,
    });

    console.log("[stripe-portal] portail ouvert pour", user.id);
    return json({ url: session.url });
  } catch (err) {
    // Cas le plus probable en production : « No configuration provided » —
    // le portail n'est pas configuré dans le dashboard Stripe.
    console.error("[stripe-portal] échec :", (err as Error)?.message ?? err);
    return json({ error: (err as Error)?.message ?? "erreur" }, 500);
  }
});
