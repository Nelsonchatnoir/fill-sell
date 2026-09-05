// ═══════════════════════════════════════════════════════════════════════════
// ebay-oauth-start — LOT 0 « Connecter mon compte eBay » (05/09/2026)
//
// Rend l'URL de consentement eBay pour l'utilisateur authentifié. C'est tout.
// Le `state` est signé côté serveur (HMAC, clé = client_secret) et porte
// l'identité FillSell : le callback saura à QUI rattacher les jetons sans
// rien demander au navigateur.
//
// verify_jwt = TRUE (config.toml) : seul un utilisateur connecté à FillSell
// obtient une URL — un state ne se fabrique jamais pour un anonyme.
// Le client_secret ne sort pas d'ici : il ne sert qu'à signer.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { lireEnvEbay, lireIdentifiants, signerState, urlConsentement, SCOPES_DEMANDES } from "../_shared/ebay-oauth.ts";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Session invalide" }, 401);

    const ids = lireIdentifiants();
    if (!ids.complet) {
      return json({ error: "Connexion eBay indisponible : identifiants d'application absents des secrets (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)." }, 503);
    }
    const env = lireEnvEbay();
    const state = await signerState(user.id, ids.clientSecret);
    const url = urlConsentement(env, ids.clientId, ids.ruName, state);
    console.log(`[ebay-oauth-start] user=${user.id} env=${env} scopes=${SCOPES_DEMANDES.length}`);
    return json({ url, env, scopes: SCOPES_DEMANDES });
  } catch (err) {
    console.error("[ebay-oauth-start] erreur inattendue :", (err as Error)?.message ?? err);
    return json({ error: "Erreur inattendue" }, 500);
  }
});
