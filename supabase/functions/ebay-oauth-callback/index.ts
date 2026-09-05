// ═══════════════════════════════════════════════════════════════════════════
// ebay-oauth-callback — LOT 0 (05/09/2026)
//
// ⚠️ NOM IMPOSÉ par la configuration du RuName chez eBay (Auth accepted URL =
// https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-oauth-callback).
// Le renommer casse le parcours tant que Nico n'a pas changé le champ eBay.
//
// eBay redirige le NAVIGATEUR de l'utilisateur ici avec ?code=…&state=… après
// consentement. Aucun JWT Supabase ne voyage dans cette redirection : la
// fonction est en verify_jwt = FALSE (config.toml) et l'identité vient du
// `state` signé par ebay-oauth-start (HMAC, clé = client_secret, 15 min).
//
// Ce qu'elle fait, dans l'ordre :
//   1. vérifie le state → user_id FillSell (sinon : retour app « erreur ») ;
//   2. échange le code contre les jetons — ICI, jamais dans le navigateur ;
//   3. stocke dans ebay_accounts (service_role, upsert sur user_id — une
//      reconnexion remplace les jetons et lève revoked_at) ;
//   4. renvoie le navigateur sur APP_ORIGIN/ebay/retour?etat=ok|refus|erreur.
// Aucun jeton, aucun code ne figure dans l'URL de retour — seulement un état.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  APP_ORIGIN,
  dateExpiration,
  echangerCode,
  lireIdentiteEbay,
  lireEnvEbay,
  lireIdentifiants,
  REPLI_ACCESS_S,
  REPLI_REFRESH_S,
  SCOPES_DEMANDES,
  verifierState,
} from "../_shared/ebay-oauth.ts";

function retour(etat: "ok" | "refus" | "erreur", motif?: string): Response {
  const u = new URL(`${APP_ORIGIN}/ebay/retour`);
  u.searchParams.set("etat", etat);
  if (motif) u.searchParams.set("motif", motif.replace(/[^a-z0-9_]/gi, "_").slice(0, 40));
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Méthode non autorisée", { status: 405 });
  const params = new URL(req.url).searchParams;

  // Refus côté eBay (l'utilisateur a cliqué « Refuser ») : rien à stocker.
  if (params.get("error")) {
    console.log(`[ebay-oauth-callback] refus eBay : ${params.get("error")}`);
    return retour("refus");
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return retour("erreur", "parametres_absents");

  const ids = lireIdentifiants();
  if (!ids.complet) return retour("erreur", "config_incomplete");

  const verdict = await verifierState(state, ids.clientSecret);
  if (!verdict.ok) {
    console.warn(`[ebay-oauth-callback] state refusé : ${verdict.motif}`);
    return retour("erreur", verdict.motif);
  }
  const userId = verdict.userId;
  const env = lireEnvEbay();

  try {
    const { http, json } = await echangerCode(env, ids.clientId, ids.clientSecret, ids.ruName, code);
    if (http < 200 || http >= 300 || !json.access_token || !json.refresh_token) {
      console.warn(`[ebay-oauth-callback] échange refusé : HTTP ${http} ${json.error ?? ""} ${json.error_description ?? ""}`);
      return retour("erreur", json.error ?? `http_${http}`);
    }
    const accessExp = dateExpiration(json.expires_in, REPLI_ACCESS_S);
    const refreshExp = dateExpiration(json.refresh_token_expires_in, REPLI_REFRESH_S);
    console.log(`[ebay-oauth-callback] jetons obtenus user=${userId} env=${env} access=${json.expires_in ?? "?"}s(${accessExp.source}) refresh=${json.refresh_token_expires_in ?? "?"}s(${refreshExp.source})`);

    // Identité eBay : pseudo (affichage) + EIASToken (immuable, clé
    // d'effacement pour Marketplace Account Deletion). Best-effort, jamais
    // bloquant.
    const identite = await lireIdentiteEbay(env, json.access_token);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ligne: Record<string, unknown> = {
      user_id: userId,
      ebay_user_id: identite.username,
      ebay_eias_token: identite.eiasToken,
      refresh_token: json.refresh_token,
      access_token: json.access_token,
      expires_at: accessExp.iso,
      refresh_token_expires_at: refreshExp.iso,
      scopes: [...SCOPES_DEMANDES],
      connected_at: new Date().toISOString(),
      revoked_at: null,
      revoked_reason: null,
    };
    let { error } = await admin.from("ebay_accounts").upsert(ligne, { onConflict: "user_id" });
    // Colonne ebay_eias_token pas encore posée (migration 20260906090000 à
    // appliquer par Nico) : la connexion ne doit PAS casser pour autant.
    if (error && /ebay_eias_token/i.test(error.message)) {
      console.warn("[ebay-oauth-callback] colonne ebay_eias_token absente — écriture sans elle");
      delete ligne.ebay_eias_token;
      ({ error } = await admin.from("ebay_accounts").upsert(ligne, { onConflict: "user_id" }));
    }
    if (error) {
      console.error(`[ebay-oauth-callback] écriture ebay_accounts refusée : ${error.message}`);
      return retour("erreur", "stockage");
    }
    console.log(`[ebay-oauth-callback] compte relié user=${userId} pseudo=${identite.username ? "oui" : "non"} eias=${identite.eiasToken ? "oui" : "non"}`);
    return retour("ok");
  } catch (err) {
    console.error("[ebay-oauth-callback] erreur inattendue :", (err as Error)?.message ?? err);
    return retour("erreur", "inattendue");
  }
});
