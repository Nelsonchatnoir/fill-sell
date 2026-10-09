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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
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
      // (09/10) le site d'inscription : un compte étranger n'est jamais publié sur ebay.fr
      ebay_site: identite.site ?? null,
      ebay_site_lu_le: new Date().toISOString(),
      refresh_token: json.refresh_token,
      access_token: json.access_token,
      expires_at: accessExp.iso,
      refresh_token_expires_at: refreshExp.iso,
      scopes: [...SCOPES_DEMANDES],
      connected_at: new Date().toISOString(),
      revoked_at: null,
      revoked_reason: null,
    };
    // ── UN AUTRE COMPTE eBay QUE CELUI D'AVANT (03/10, point 21 — Louis) ──────
    // L'upsert gardait les réglages du compte précédent : ses politiques de
    // vente, son état vendeur, son lieu d'expédition — des identifiants qui
    // n'existent pas chez le nouveau compte (chaque publication aurait été
    // refusée). Quand l'identité eBay CHANGE (pseudo ou EIAS prouvés des deux
    // côtés), ces réglages repartent de zéro : le parcours eBay les redemande.
    // Identité inconnue d'un côté = rien de prouvé = rien d'effacé.
    try {
      const { data: avant } = await admin.from("ebay_accounts")
        .select("ebay_user_id, ebay_eias_token").eq("user_id", userId).maybeSingle();
      const a = (avant ?? null) as { ebay_user_id?: string | null; ebay_eias_token?: string | null } | null;
      const memePseudo = a?.ebay_user_id && identite.username
        ? a.ebay_user_id.toLowerCase() === identite.username.toLowerCase() : null;
      const memeEias = a?.ebay_eias_token && identite.eiasToken ? a.ebay_eias_token === identite.eiasToken : null;
      if (memePseudo === false || memeEias === false) {
        Object.assign(ligne, {
          fulfillment_policy_id: null, payment_policy_id: null, return_policy_id: null,
          seller_state: null, seller_state_at: null, merchant_location_key: null,
        });
        console.log(`[ebay-oauth-callback] user=${userId} : AUTRE compte eBay que le précédent (@${a?.ebay_user_id ?? "?"} → @${identite.username ?? "?"}) — politiques, état vendeur et lieu d'expédition remis à zéro`);
      }
    } catch (e) {
      console.warn(`[ebay-oauth-callback] lecture du compte précédent impossible : ${(e as Error)?.message ?? e} — réglages gardés`);
    }
    let { error } = await admin.from("ebay_accounts").upsert(ligne, { onConflict: "user_id" });
    // Colonne ebay_eias_token pas encore posée (migration 20260905220811 à
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
    // ── LA VOIE API S'OUVRE ICI, ET SEULEMENT ICI (2026-09-08, décision Nico) ──
    // Un compte passe en voie API quand sa connexion OAuth est ÉTABLIE (jeton
    // échangé, ligne écrite) ET PROUVÉE : GetUser (Trading) a répondu avec un
    // pseudo — la seule requête authentifiée eBay de ce flux. Sans preuve, le
    // compte est stocké mais le drapeau ne bouge pas : la voie extension reste
    // la sienne, rien n'est perdu. Jamais d'activation en masse : une ligne,
    // ce user. Le trigger cross_post_jobs_voie_ebay garde de toute façon la
    // dernière garde (3 politiques + état vendeur) à l'insert de chaque job.
    if (identite.username) {
      const { error: ePf } = await admin.from("profiles").update({ ebay_voie_api: true }).eq("id", userId);
      if (ePf) console.warn(`[ebay-oauth-callback] ebay_voie_api non posé pour ${userId} : ${ePf.message}`);
      else console.log(`[ebay-oauth-callback] ebay_voie_api=true posé pour ${userId} (connexion prouvée par GetUser)`);
    } else {
      console.warn(`[ebay-oauth-callback] connexion stockée SANS preuve GetUser pour ${userId} — drapeau ebay_voie_api inchangé`);
    }
    // (05/10) La vente vue à la commande : le compte qui vient d'être relié
    // s'abonne à ORDER_CONFIRMATION (ebay-notifications, action « abonner »).
    // Borné à 8 s, jamais bloquant : un échec laisse la veille Browse, comme
    // avant, et l'action se relance à la main pour tous les comptes.
    try {
      const secret = Deno.env.get("CRON_SECRET")?.trim() ?? "";
      if (secret) {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ebay-notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": secret },
          body: JSON.stringify({ action: "abonner", user_id: userId }),
          signal: AbortSignal.timeout(8000),
        });
        console.log(`[ebay-oauth-callback] abonnement ORDER_CONFIRMATION demandé pour ${userId} → HTTP ${r.status}`);
      }
    } catch (e) {
      console.warn(`[ebay-oauth-callback] abonnement ORDER_CONFIRMATION non demandé (${(e as Error)?.message ?? e}) — la veille Browse reste`);
    }
    return retour("ok");
  } catch (err) {
    console.error("[ebay-oauth-callback] erreur inattendue :", (err as Error)?.message ?? err);
    return retour("erreur", "inattendue");
  }
});
