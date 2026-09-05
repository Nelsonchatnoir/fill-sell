// ═══════════════════════════════════════════════════════════════════════════
// eBay par API — socle OAuth partagé (lot 0, 05/09/2026)
//
// Utilisé par ebay-oauth-start (URL de consentement), ebay-oauth-callback
// (échange code → jetons, stockage) et ebay-account (état vendeur, lot 1).
// Les lots suivants (worker serveur de publication) liront le jeton par
// obtenirAccessToken() — c'est le SEUL chemin autorisé vers un jeton vendeur.
//
// GARDE-FOUS (brief Nico, 05/09) :
//   · le client_secret ne sort JAMAIS d'ici : ni au navigateur, ni à
//     l'extension. Il sert à l'échange, au refresh et à signer le `state` ;
//   · aucun mot de passe eBay n'est transporté : le protocole n'en a pas ;
//   · on ne demande au consentement QUE les scopes nécessaires — la liste
//     SCOPES_DEMANDES est la source unique, l'écran eBay liste ce qu'on
//     demande, pas ce que le keyset autorise ;
//   · sell.finances a été retiré du keyset volontairement : jamais ici.
//
// DURÉES DE JETON : la doc annonce access ≈ 2 h (7 200 s) et refresh ≈ 18 mois
// (47 304 000 s) — valeurs recoupées le 05/09 par les extraits de la doc, la
// page elle-même refusant toute lecture hors session navigateur. On ne code
// AUCUNE durée : `expires_in` et `refresh_token_expires_in` sont lus dans la
// réponse d'eBay à chaque échange/refresh, et c'est ce qui est stocké. Repli
// si un champ manque : 2 h / 18 mois, marqués `repli` dans la trace.
//
// RÉVOCATION : le vendeur peut révoquer depuis eBay sans nous prévenir. Un
// refresh refusé (invalid_grant) est un état NORMAL → revoked_at stampé,
// l'app affiche « à reconnecter ». Jamais une erreur technique.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EbayEnv = "production" | "sandbox";

export function lireEnvEbay(): EbayEnv {
  const brut = (Deno.env.get("EBAY_ENV") ?? "production").trim().toLowerCase();
  return brut === "sandbox" ? "sandbox" : "production";
}

export function hotes(env: EbayEnv) {
  return env === "sandbox"
    ? { api: "https://api.sandbox.ebay.com", apiz: "https://apiz.sandbox.ebay.com", auth: "https://auth.sandbox.ebay.com" }
    : { api: "https://api.ebay.com", apiz: "https://apiz.ebay.com", auth: "https://auth.ebay.com" };
}

// RuName de production configuré chez eBay (Auth accepted URL =
// …/functions/v1/ebay-oauth-callback). Surchargeable par le secret EBAY_RUNAME
// si le RuName change — la valeur par défaut est celle relevée par Nico le 05/09.
export const RUNAME_DEFAUT = "Nicolas_Svobodn-NicolasS-FillSe-myiefmg";

export function lireIdentifiants() {
  const clientId = Deno.env.get("EBAY_CLIENT_ID")?.trim() ?? "";
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET")?.trim() ?? "";
  const ruName = Deno.env.get("EBAY_RUNAME")?.trim() || RUNAME_DEFAUT;
  return { clientId, clientSecret, ruName, complet: Boolean(clientId && clientSecret) };
}

// ── Scopes demandés au consentement — SOURCE UNIQUE (arbitrage Nico, 05/09) ─
// Un refresh token porte les scopes du consentement : tout scope ajouté plus
// tard forcerait CHAQUE vendeur relié à reconnecter. On demande donc dès le
// lot 0 tout ce que les lots 0-4 utiliseront, et RIEN d'autre :
//   · api_scope                          socle
//   · sell.account                       lot 1 — privilèges, programmes,
//                                        politiques (création sur action explicite)
//   · sell.inventory                     lot 2 — publier sans Chrome
//   · sell.fulfillment                   lot 3 — détecter les ventes
//   · commerce.notification.subscription lot 3 — webhooks eBay (retrait des
//                                        autres plateformes à la vente)
// ⛔ GARDE-FOU : ne JAMAIS ajouter sell.finances (retiré du keyset exprès),
// sell.marketing, commerce.message ni aucun autre — le keyset les autorise
// peut-être, on ne les demande pas. L'écran de consentement liste ce qu'on
// demande, pas ce que le keyset permet.
export const SCOPES_DEMANDES: readonly string[] = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
];

// ── Origine de l'app, pour l'atterrissage après le callback ─────────────────
export const APP_ORIGIN = Deno.env.get("FILLSELL_APP_ORIGIN")?.trim() || "https://fillsell.app";

// ── state signé (HMAC-SHA256, clé = client_secret) ──────────────────────────
// Le state lie la demande de consentement à l'utilisateur FillSell authentifié
// et expire en 15 min. Sans table d'états : eBay n'émet un code que pour UN
// state, et le code est à usage unique — rejouer un state ne donne rien.
const STATE_VALIDITE_MS = 15 * 60 * 1000;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmac(cle: string, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(cle), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}

export async function signerState(userId: string, cle: string): Promise<string> {
  const exp = Date.now() + STATE_VALIDITE_MS;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const corps = b64url(new TextEncoder().encode(JSON.stringify({ u: userId, e: exp, n: nonce })));
  const sig = b64url(await hmac(cle, corps));
  return `${corps}.${sig}`;
}

export async function verifierState(state: string, cle: string): Promise<{ ok: true; userId: string } | { ok: false; motif: string }> {
  const [corps, sig] = String(state ?? "").split(".");
  if (!corps || !sig) return { ok: false, motif: "state_illisible" };
  const attendu = b64url(await hmac(cle, corps));
  if (attendu.length !== sig.length) return { ok: false, motif: "state_signature" };
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return { ok: false, motif: "state_signature" };
  let payload: { u?: string; e?: number };
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(corps))); }
  catch { return { ok: false, motif: "state_illisible" }; }
  if (!payload.u || typeof payload.e !== "number") return { ok: false, motif: "state_illisible" };
  if (Date.now() > payload.e) return { ok: false, motif: "state_expire" };
  return { ok: true, userId: payload.u };
}

// ── URL de consentement ─────────────────────────────────────────────────────
export function urlConsentement(env: EbayEnv, clientId: string, ruName: string, state: string): string {
  const u = new URL(`${hotes(env).auth}/oauth2/authorize`);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", ruName);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES_DEMANDES.join(" "));
  u.searchParams.set("state", state);
  // prompt=login : eBay redemande l'identifiant du compte — c'est voulu, un
  // vendeur multi-comptes doit pouvoir choisir LEQUEL il relie (leçon des
  // dressings Vinted croisés).
  u.searchParams.set("prompt", "login");
  return u.toString();
}

// ── Échange / refresh au endpoint token ─────────────────────────────────────
export interface ReponseToken {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

async function posterToken(env: EbayEnv, clientId: string, clientSecret: string, corps: URLSearchParams): Promise<{ http: number; json: ReponseToken }> {
  const r = await fetch(`${hotes(env).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: corps.toString(),
  });
  const texte = await r.text();
  let json: ReponseToken = {};
  try { json = JSON.parse(texte); } catch { json = { error: "reponse_non_json", error_description: texte.slice(0, 200) }; }
  return { http: r.status, json };
}

export function echangerCode(env: EbayEnv, clientId: string, clientSecret: string, ruName: string, code: string) {
  return posterToken(env, clientId, clientSecret, new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: ruName,
  }));
}

export function rafraichir(env: EbayEnv, clientId: string, clientSecret: string, refreshToken: string, scopes: readonly string[]) {
  return posterToken(env, clientId, clientSecret, new URLSearchParams({
    grant_type: "refresh_token", refresh_token: refreshToken, scope: scopes.join(" "),
  }));
}

// Replis SI eBay omet la durée (documentés : 2 h / 18 mois) — jamais utilisés
// quand la réponse la porte, et tracés dans `source`.
export const REPLI_ACCESS_S = 7200;
export const REPLI_REFRESH_S = 47304000;

export function dateExpiration(secondes: number | undefined, repli: number): { iso: string; source: "ebay" | "repli" } {
  const fourni = typeof secondes === "number" && secondes > 0;
  const s = fourni ? (secondes as number) : repli;
  return { iso: new Date(Date.now() + s * 1000).toISOString(), source: fourni ? "ebay" : "repli" };
}

// ── Ligne ebay_accounts (service_role seul) ─────────────────────────────────
export interface CompteEbay {
  user_id: string;
  ebay_user_id: string | null;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  refresh_token_expires_at: string | null;
  scopes: string[];
  connected_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  seller_state: Record<string, unknown> | null;
  seller_state_at: string | null;
  fulfillment_policy_id: string | null;
  payment_policy_id: string | null;
  return_policy_id: string | null;
}

export async function lireCompte(admin: SupabaseClient, userId: string): Promise<{ compte: CompteEbay | null; erreur: string | null }> {
  const { data, error } = await admin.from("ebay_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error) return { compte: null, erreur: error.message };
  return { compte: (data as CompteEbay | null) ?? null, erreur: null };
}

// Vue PUBLIQUE d'un compte : ce que l'app a le droit de voir. AUCUN jeton.
export function etatPublic(compte: CompteEbay | null) {
  if (!compte) {
    return {
      connecte: false, a_reconnecter: false, motif_reconnexion: null, ebay_user_id: null, connected_at: null,
      scopes_manquants: [...SCOPES_DEMANDES], seller_state: null, seller_state_at: null, politiques: null,
    };
  }
  const refreshMort = compte.refresh_token_expires_at ? Date.parse(compte.refresh_token_expires_at) < Date.now() : false;
  const aReconnecter = Boolean(compte.revoked_at) || refreshMort;
  const scopesManquants = SCOPES_DEMANDES.filter((s) => !(compte.scopes ?? []).includes(s));
  return {
    connecte: !aReconnecter,
    a_reconnecter: aReconnecter,
    motif_reconnexion: compte.revoked_at ? (compte.revoked_reason ?? "revoque") : refreshMort ? "refresh_expire" : null,
    ebay_user_id: compte.ebay_user_id,
    connected_at: compte.connected_at,
    scopes_manquants: scopesManquants,
    seller_state: compte.seller_state,
    seller_state_at: compte.seller_state_at,
    politiques: {
      fulfillment: compte.fulfillment_policy_id,
      payment: compte.payment_policy_id,
      return: compte.return_policy_id,
    },
  };
}

// ── Jeton d'accès valide, rafraîchi si besoin — SEUL chemin vers un jeton ───
export type ResultatToken =
  | { ok: true; token: string; compte: CompteEbay }
  | { ok: false; motif: "non_connecte" | "revoque" | "refresh_echoue" | "config_incomplete" | "base"; detail?: string; compte: CompteEbay | null };

const MARGE_REFRESH_MS = 120 * 1000;

export async function obtenirAccessToken(admin: SupabaseClient, userId: string): Promise<ResultatToken> {
  const { compte, erreur } = await lireCompte(admin, userId);
  if (erreur) return { ok: false, motif: "base", detail: erreur, compte: null };
  if (!compte) return { ok: false, motif: "non_connecte", compte: null };
  if (compte.revoked_at) return { ok: false, motif: "revoque", detail: compte.revoked_reason ?? undefined, compte };

  const encoreValide = compte.access_token && compte.expires_at && Date.parse(compte.expires_at) - Date.now() > MARGE_REFRESH_MS;
  if (encoreValide) return { ok: true, token: compte.access_token as string, compte };

  const ids = lireIdentifiants();
  if (!ids.complet) return { ok: false, motif: "config_incomplete", compte };
  const env = lireEnvEbay();
  const scopes = compte.scopes?.length ? compte.scopes : SCOPES_DEMANDES;
  const { http, json } = await rafraichir(env, ids.clientId, ids.clientSecret, compte.refresh_token, scopes);

  if (http >= 200 && http < 300 && json.access_token) {
    const exp = dateExpiration(json.expires_in, REPLI_ACCESS_S);
    await admin.from("ebay_accounts").update({ access_token: json.access_token, expires_at: exp.iso }).eq("user_id", userId);
    return { ok: true, token: json.access_token, compte: { ...compte, access_token: json.access_token, expires_at: exp.iso } };
  }

  // invalid_grant = refresh token révoqué côté eBay ou expiré : état NORMAL.
  // On le stampe pour que l'app dise « à reconnecter » — et rien d'autre.
  const motif = String(json.error ?? `http_${http}`);
  if (motif === "invalid_grant" || http === 400 || http === 401) {
    await admin.from("ebay_accounts").update({
      revoked_at: new Date().toISOString(),
      revoked_reason: motif === "invalid_grant" ? "revoque_ou_expire" : `refresh_${motif}`,
      access_token: null,
    }).eq("user_id", userId);
    return { ok: false, motif: "revoque", detail: motif, compte };
  }
  // Autre (5xx eBay, réseau) : transitoire — on ne touche pas à la ligne.
  return { ok: false, motif: "refresh_echoue", detail: `${http} ${motif} ${json.error_description ?? ""}`.trim(), compte };
}

// ── Appel REST eBay avec un jeton vendeur ───────────────────────────────────
export interface ReponseEbay { http: number; json: unknown; texte: string; }

export async function appelEbay(
  env: EbayEnv,
  token: string,
  chemin: string,
  init: { method?: string; body?: unknown; marketplace?: string; hote?: "api" | "apiz" } = {},
): Promise<ReponseEbay> {
  const base = hotes(env)[init.hote ?? "api"];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Accept-Language": "fr-FR",
    "Content-Language": "fr-FR",
    "X-EBAY-C-MARKETPLACE-ID": init.marketplace ?? "EBAY_FR",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${base}${chemin}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const texte = await r.text();
  let json: unknown = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  return { http: r.status, json, texte };
}

// Premier message d'erreur d'une réponse eBay REST ({ errors: [{ message,
// longMessage }] }) — affiché TEL QUEL à l'utilisateur quand une création de
// politique est refusée : c'est eBay qui sait pourquoi, pas nous.
export function messageErreurEbay(json: unknown, texte: string): string {
  const errs = (json as { errors?: Array<{ message?: string; longMessage?: string }> } | null)?.errors;
  if (Array.isArray(errs) && errs.length) return String(errs[0].longMessage ?? errs[0].message ?? "").slice(0, 300) || texte.slice(0, 200);
  return texte.slice(0, 200);
}

// Identité du compte eBay — BEST-EFFORT. L'Identity API exige un scope de plus
// (commerce.identity.readonly) qu'on ne demande pas ; le Trading API GetUser
// accepte le jeton OAuth (en-tête X-EBAY-API-IAF-TOKEN) et rend, vérifié dans
// la référence GetUser le 06/09 :
//   · <UserID>    : le pseudo public — il peut CHANGER ;
//   · <EIASToken> : l'identifiant IMMUABLE du vendeur — c'est lui que porte
//                   aussi la notification Marketplace Account Deletion
//                   (data.eiasToken), donc la clé de rapprochement pour effacer.
// DetailLevel ReturnAll pour être sûr d'avoir l'EIASToken (relevé le 05/09 en
// ReturnSummary : UserID présent, EIASToken non vérifié). Si l'appel refuse,
// les deux restent NULL et rien ne casse (le pseudo n'est qu'un confort
// d'affichage, l'effacement retombe sur le pseudo).
export interface IdentiteEbay { username: string | null; eiasToken: string | null; }

export async function lireIdentiteEbay(env: EbayEnv, token: string): Promise<IdentiteEbay> {
  try {
    const r = await fetch(`${hotes(env).api}/ws/api.dll`, {
      method: "POST",
      headers: {
        "X-EBAY-API-IAF-TOKEN": token,
        "X-EBAY-API-CALL-NAME": "GetUser",
        "X-EBAY-API-SITEID": "71",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
        "Content-Type": "text/xml",
      },
      body: '<?xml version="1.0" encoding="utf-8"?><GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents"><DetailLevel>ReturnAll</DetailLevel></GetUserRequest>',
    });
    const xml = await r.text();
    const u = xml.match(/<UserID>([^<]{1,64})<[/]UserID>/);
    const e = xml.match(/<EIASToken>([^<]{1,200})<[/]EIASToken>/);
    return { username: u ? u[1] : null, eiasToken: e ? e[1] : null };
  } catch {
    return { username: null, eiasToken: null };
  }
}
