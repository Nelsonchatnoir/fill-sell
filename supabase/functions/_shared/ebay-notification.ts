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
// VERDICT EN TROIS ÉTATS, jamais deux :
//   · "valide"        → on traite ;
//   · "invalide"      → crypto.subtle.verify a rendu false avec une clé et une
//                       signature correctement décodées : on NE traite PAS ;
//   · "indeterminee"  → tout le reste (en-tête absent ou illisible, clé
//                       injoignable, courbe/digest non supportés, DER inattendu).
//                       L'appelant décide ; pour la suppression de compte on
//                       TRAITE quand même (fail-open) : effacer une ligne
//                       ebay_accounts coûte une reconnexion, ne pas l'effacer
//                       coûte la conformité. Le verdict et son détail partent
//                       en log pour que le « Send Test Notification » du portail
//                       eBay dise si cette vérification est juste.
// ═══════════════════════════════════════════════════════════════════════════
import { hotes, type EbayEnv } from "./ebay-oauth.ts";

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

// Signature ECDSA DER (SEQUENCE { INTEGER r, INTEGER s }) → r||s brut, taille
// fixe par coordonnée (32 pour P-256). STRICT : toute structure inattendue
// lève — mieux « indéterminée » qu'un faux « invalide ».
function derVersBrut(der: Uint8Array, taille: number): Uint8Array {
  let i = 0;
  const lireLongueur = (): number => {
    let len = der[i++];
    if (len === undefined) throw new Error("DER tronqué");
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0 || n > 4) throw new Error("DER longueur inattendue");
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | der[i++];
    }
    return len;
  };
  if (der[i++] !== 0x30) throw new Error("DER : SEQUENCE attendue");
  const seqLen = lireLongueur();
  if (i + seqLen !== der.length) throw new Error("DER : longueur de séquence incohérente");
  const lireEntier = (): Uint8Array => {
    if (der[i++] !== 0x02) throw new Error("DER : INTEGER attendu");
    const len = lireLongueur();
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > taille && v[0] === 0) v = v.slice(1);
    if (v.length > taille) throw new Error("DER : entier plus long que la courbe");
    const out = new Uint8Array(taille);
    out.set(v, taille - v.length);
    return out;
  };
  const r = lireEntier();
  const s = lireEntier();
  if (i !== der.length) throw new Error("DER : octets résiduels");
  const out = new Uint8Array(taille * 2);
  out.set(r, 0);
  out.set(s, taille);
  return out;
}

const COURBES: Array<{ nom: string; taille: number }> = [
  { nom: "P-256", taille: 32 },
  { nom: "P-384", taille: 48 },
  { nom: "P-521", taille: 66 },
];

function nomHash(digest: string | undefined): string {
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
    const hash = nomHash(cle.digest ?? meta.digest);
    const spki = pemVersSpki(cle.key);
    const sigDer = b64VersOctets(sigB64);

    // Courbe inconnue à l'avance : on importe avec chacune, la bonne accepte.
    let derniereErreur = "";
    for (const courbe of COURBES) {
      let clePub: CryptoKey;
      try {
        clePub = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: courbe.nom }, false, ["verify"]);
      } catch (e) {
        derniereErreur = `import ${courbe.nom} : ${(e as Error).message}`;
        continue;
      }
      const brut = derVersBrut(sigDer, courbe.taille);
      const ok = await crypto.subtle.verify({ name: "ECDSA", hash: { name: hash } }, clePub, brut, corpsBrut);
      return ok
        ? { verdict: "valide", detail: `${courbe.nom}/${hash}`, kid }
        : { verdict: "invalide", detail: `signature refusée (${courbe.nom}/${hash})`, kid };
    }
    return { verdict: "indeterminee", detail: `aucune courbe n'accepte la clé — ${derniereErreur}`, kid };
  } catch (e) {
    return { verdict: "indeterminee", detail: (e as Error)?.message ?? String(e), kid: kid || undefined };
  }
}
