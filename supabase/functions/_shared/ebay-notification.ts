// ═══════════════════════════════════════════════════════════════════════════
// eBay — vérification des notifications signées (Marketplace Account Deletion)
// 06/09/2026. Doc relue dans Chrome le 05/09 soir (guide « Marketplace User
// Account Deletion » + Notification API getPublicKey) :
//   1. l'en-tête x-ebay-signature est du Base64 d'un JSON
//      { alg: "ecdsa", kid: "<id de clé>", signature: "<Base64>", digest: "SHA1" } ;
//   2. GET /commerce/notification/v1/public_key/{kid} (jeton APPLICATION,
//      client credentials, scope api_scope) rend { key, algorithm, digest } ;
//      la clé est à mettre en cache (~1 h) — jamais un appel par notification ;
//   3. la signature ECDSA (DER, comme la produit Java) se vérifie sur le CORPS
//      BRUT de la requête avec le digest annoncé par la clé.
//
// ⚠️ 06/09 09:47 — premier test eBay : « signature indéterminée (Not
// implemented) ». La brique fautive était crypto.subtle.verify : le WebCrypto
// du runtime Deno de Supabase (ring) n'accepte pour ECDSA que SHA-256/384,
// jamais SHA-1 — le digest d'eBay. L'import SPKI et la courbe P-256 passaient.
// Remplacée par une vérification ECDSA P-256 interne (_shared/ecdsa-p256.ts,
// BigInt, testée hors Deno avec des signatures node:crypto) ; le SHA-1 du
// corps vient de crypto.subtle.digest, qui lui est supporté.
//
// VERDICT EN TROIS ÉTATS, jamais deux :
//   · "valide"        → on traite ;
//   · "invalide"      → clé et signature correctement décodées, mais la
//                       vérification mathématique rend faux : on NE traite PAS ;
//   · "indeterminee"  → tout le reste (en-tête absent ou illisible, clé
//                       injoignable, courbe/digest non gérés, DER inattendu).
//                       L'appelant décide ; pour la suppression de compte on
//                       TRAITE quand même (fail-open) : effacer une ligne
//                       ebay_accounts coûte une reconnexion, ne pas l'effacer
//                       coûte la conformité. Le verdict et son détail partent
//                       en log pour que le « Send Test Notification » du portail
//                       eBay dise si cette vérification est juste.
// ═══════════════════════════════════════════════════════════════════════════
import { hotes, type EbayEnv } from "./ebay-oauth.ts";
import { cleSpkiVersPoint, signatureDerVersRS, verifierEcdsaP256 } from "./ecdsa-p256.ts";

export type VerdictSignature = { verdict: "valide" | "invalide" | "indeterminee"; detail: string; kid?: string };

// ── Jeton d'APPLICATION (client credentials) — cache par isolat ─────────────
let appTokenCache: { token: string; exp: number } | null = null;

export async function obtenirAppToken(env: EbayEnv, clientId: string, clientSecret: string): Promise<string> {
  if (appTokenCache && appTokenCache.exp - Date.now() > 60_000) return appTokenCache.token;
  const r = await fetch(`${hotes(env).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString(),
  });
  const json = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !json.access_token) throw new Error(`app token refusé : HTTP ${r.status} ${json.error ?? ""}`);
  appTokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 7200) * 1000 };
  return json.access_token;
}

// ── Clé publique eBay — cache 1 h par kid ───────────────────────────────────
interface ClePublique { key: string; algorithm?: string; digest?: string; }
const cleCache = new Map<string, { cle: ClePublique; exp: number }>();

async function obtenirClePublique(env: EbayEnv, clientId: string, clientSecret: string, kid: string): Promise<ClePublique> {
  const enCache = cleCache.get(kid);
  if (enCache && enCache.exp > Date.now()) return enCache.cle;
  const token = await obtenirAppToken(env, clientId, clientSecret);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${hotes(env).api}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`getPublicKey HTTP ${r.status}`);
    const cle = await r.json() as ClePublique;
    if (!cle?.key) throw new Error("getPublicKey sans champ key");
    cleCache.set(kid, { cle, exp: Date.now() + 60 * 60 * 1000 });
    return cle;
  } finally {
    clearTimeout(timer);
  }
}

// ── Décodages ───────────────────────────────────────────────────────────────
function b64VersOctets(b64: string): Uint8Array {
  const propre = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const pad = propre.length % 4 === 0 ? "" : "=".repeat(4 - (propre.length % 4));
  return Uint8Array.from(atob(propre + pad), (c) => c.charCodeAt(0));
}

// PEM (avec ou sans retours à la ligne) → octets SPKI.
function pemVersSpki(pem: string): Uint8Array {
  const corps = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  if (!corps) throw new Error("clé publique vide");
  return b64VersOctets(corps);
}

// Digest annoncé par la clé (« SHA1 ») → nom WebCrypto pour subtle.digest,
// qui supporte SHA-1 (contrairement à subtle.verify en ECDSA).
function nomDigest(digest: string | undefined): "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512" {
  const d = String(digest ?? "SHA1").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (d === "SHA1") return "SHA-1";
  if (d === "SHA256") return "SHA-256";
  if (d === "SHA384") return "SHA-384";
  if (d === "SHA512") return "SHA-512";
  throw new Error(`digest inconnu : ${digest}`);
}

// ── Vérification ────────────────────────────────────────────────────────────
export async function verifierSignatureNotification(
  corpsBrut: Uint8Array,
  enTeteSignature: string | null,
  env: EbayEnv,
  clientId: string,
  clientSecret: string,
): Promise<VerdictSignature> {
  if (!enTeteSignature) return { verdict: "indeterminee", detail: "en-tête x-ebay-signature absent" };
  let kid = "";
  try {
    const meta = JSON.parse(new TextDecoder().decode(b64VersOctets(enTeteSignature))) as { kid?: string; signature?: string; digest?: string; alg?: string };
    kid = String(meta.kid ?? "");
    const sigB64 = String(meta.signature ?? "");
    if (!kid || !sigB64) return { verdict: "indeterminee", detail: "en-tête sans kid ou sans signature" };
    if (!clientId || !clientSecret) return { verdict: "indeterminee", detail: "identifiants d'application absents", kid };

    const cle = await obtenirClePublique(env, clientId, clientSecret, kid);
    if (cle.algorithm && !/ecdsa/i.test(cle.algorithm)) return { verdict: "indeterminee", detail: `algorithme non géré : ${cle.algorithm}`, kid };
    const digestNom = nomDigest(cle.digest ?? meta.digest);

    // Clé → point P-256 ; signature DER → (r, s) ; condensé du corps brut.
    const q = cleSpkiVersPoint(pemVersSpki(cle.key));
    const { r, s } = signatureDerVersRS(b64VersOctets(sigB64));
    const condense = new Uint8Array(await crypto.subtle.digest(digestNom, corpsBrut));

    const ok = verifierEcdsaP256(q, condense, r, s);
    return ok
      ? { verdict: "valide", detail: `P-256/${digestNom} (vérification interne)`, kid }
      : { verdict: "invalide", detail: `signature refusée (P-256/${digestNom}, vérification interne)`, kid };
  } catch (e) {
    return { verdict: "indeterminee", detail: (e as Error)?.message ?? String(e), kid: kid || undefined };
  }
}
