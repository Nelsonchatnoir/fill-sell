// ═══════════════════════════════════════════════════════════════════════════
// LE JETON OIDC D'UN PUSH PUB/SUB AUTHENTIFIÉ (25/10, point 4 « Revenus »)
// ═══════════════════════════════════════════════════════════════════════════
// google-play-webhook tourne en verify_jwt = false (Pub/Sub n'a pas de session Supabase) et ne vérifiait
// RIEN : n'importe qui pouvait lui poster une notification (le type — RENEWED, EXPIRED… — est lu dans le
// message, seul le jeton d'achat est relu chez Google). Quand l'authentification est activée sur
// l'abonnement push (console Google Cloud, geste de Nico), Pub/Sub joint `Authorization: Bearer <JWT>` :
// un jeton d'identité signé par Google (RS256), aud = l'audience réglée, email = le compte de service choisi.
// ⛔ Vérifier la signature et l'audience NE SUFFIT PAS : n'importe quel compte Google peut se faire signer un
// jeton pour notre URL. Le compte de service attendu (GOOGLE_PUBSUB_SA_EMAIL) est OBLIGATOIRE pour dire « ok ».
// Aucun import distant (WebCrypto + fetch) : selftest imports-epingles inchangé.

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const EMETTEURS = ["https://accounts.google.com", "accounts.google.com"];
const MARGE_S = 300; // décalage d'horloge toléré

type Jwk = { kid?: string; kty?: string; n?: string; e?: string };
let cache: { cles: Record<string, Jwk>; expire: number } | null = null;

async function clesGoogle(forcer = false): Promise<Record<string, Jwk>> {
  if (!forcer && cache && cache.expire > Date.now()) return cache.cles;
  const r = await fetch(CERTS_URL, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`certs_${r.status}`);
  const j = await r.json();
  const cles: Record<string, Jwk> = {};
  for (const k of (j?.keys ?? []) as Jwk[]) if (k?.kid && k.kty === "RSA" && k.n && k.e) cles[k.kid] = k;
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cache = { cles, expire: Date.now() + Math.min(Math.max(maxAge, 60), 6 * 3600) * 1000 };
  return cles;
}

function octets(b64url: string): Uint8Array {
  const b = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b.padEnd(b.length + (4 - (b.length % 4)) % 4, "=")), (c) => c.charCodeAt(0));
}

export type VerificationPubSub = { ok: boolean; verification: string; email: string | null };

/**
 * verification : « oidc_ok » | « oidc_absent » | « oidc_refuse:<raison> » (illisible, algorithme,
 * certs_injoignables, cle_inconnue, signature, emetteur, audience, expire, futur, compte, compte_non_configure).
 * Ne lève jamais : toute panne devient un refus motivé (et le mode « observer » du webhook ne refuse rien).
 */
export async function verifierJetonPubSub(
  authorization: string | null,
  attendu: { audience: string; email: string | null },
): Promise<VerificationPubSub> {
  const refus = (raison: string, email: string | null = null): VerificationPubSub => ({ ok: false, verification: `oidc_refuse:${raison}`, email });
  try {
    const m = /^Bearer\s+([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)$/i.exec((authorization ?? "").trim());
    if (!authorization) return { ok: false, verification: "oidc_absent", email: null };
    if (!m) return refus("illisible");
    const [h, c, s] = m[1].split(".");
    let entete: Record<string, unknown>, charge: Record<string, unknown>;
    try {
      entete = JSON.parse(new TextDecoder().decode(octets(h)));
      charge = JSON.parse(new TextDecoder().decode(octets(c)));
    } catch { return refus("illisible"); }
    const email = typeof charge.email === "string" ? charge.email : null;
    if (entete.alg !== "RS256" || typeof entete.kid !== "string") return refus("algorithme", email);
    let cles: Record<string, Jwk>;
    try { cles = await clesGoogle(); } catch { return refus("certs_injoignables", email); }
    let jwk = cles[entete.kid];
    if (!jwk) { try { jwk = (await clesGoogle(true))[entete.kid]; } catch { /* rotation : relu une fois */ } }
    if (!jwk) return refus("cle_inconnue", email);
    const cle = await crypto.subtle.importKey(
      "jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    const signee = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cle, octets(s) as BufferSource, new TextEncoder().encode(`${h}.${c}`));
    if (!signee) return refus("signature", email);
    const maintenant = Math.floor(Date.now() / 1000);
    if (!EMETTEURS.includes(String(charge.iss ?? ""))) return refus("emetteur", email);
    const aud = Array.isArray(charge.aud) ? charge.aud : [charge.aud];
    if (!aud.includes(attendu.audience)) return refus("audience", email);
    if (typeof charge.exp !== "number" || charge.exp + MARGE_S < maintenant) return refus("expire", email);
    if (typeof charge.iat === "number" && charge.iat - MARGE_S > maintenant) return refus("futur", email);
    if (!attendu.email) return refus("compte_non_configure", email);
    if (email !== attendu.email || charge.email_verified !== true) return refus("compte", email);
    return { ok: true, verification: "oidc_ok", email };
  } catch {
    return refus("illisible");
  }
}
