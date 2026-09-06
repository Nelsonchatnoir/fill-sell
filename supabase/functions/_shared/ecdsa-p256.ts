// ═══════════════════════════════════════════════════════════════════════════
// ECDSA P-256 — vérification interne, sans crypto.subtle.verify (06/09/2026)
//
// POURQUOI : eBay signe ses notifications en ECDSA sur P-256 avec un digest
// SHA-1 (la clé publique rendue par getPublicKey annonce digest "SHA1"). Le
// runtime Deno de Supabase (WebCrypto sur `ring`) n'implémente ECDSA qu'avec
// SHA-256/SHA-384 : `crypto.subtle.verify({ name: "ECDSA", hash: "SHA-1" })`
// lève « Not implemented » — verdict « indéterminée » sur le test eBay du
// 06/09 09:47. `crypto.subtle.digest("SHA-1")`, lui, est supporté.
//
// Ce module ne dépend d'AUCUNE primitive courbe du runtime : arithmétique
// BigInt sur la courbe, digest fourni par l'appelant. Il est testable hors
// Deno (Node) avec des signatures produites par node:crypto — c'est ainsi
// qu'il a été vérifié avant déploiement (scripts/ecdsa-p256-selftest.mjs).
//
// Périmètre volontairement étroit : P-256 uniquement (OID 1.2.840.10045.3.1.7,
// celui des clés eBay « MFkw… »). Toute autre courbe → erreur explicite, que
// l'appelant traduit en « indéterminée ».
// ═══════════════════════════════════════════════════════════════════════════

// ── Paramètres de la courbe secp256r1 (FIPS 186-4 D.1.2.3) ──────────────────
const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const A = P - 3n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

const OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1";
const OID_PRIME256V1 = "1.2.840.10045.3.1.7";

type Point = { x: bigint; y: bigint } | null; // null = point à l'infini

function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

// Inverse modulaire par Euclide étendu (m premier ou pas, pgcd = 1 exigé).
function inverseMod(a: bigint, m: bigint): bigint {
  let [ancien, actuel] = [mod(a, m), m];
  let [x0, x1] = [1n, 0n];
  while (actuel !== 0n) {
    const q = ancien / actuel;
    [ancien, actuel] = [actuel, ancien - q * actuel];
    [x0, x1] = [x1, x0 - q * x1];
  }
  if (ancien !== 1n) throw new Error("inverse modulaire inexistant");
  return mod(x0, m);
}

function surLaCourbe(pt: Point): boolean {
  if (!pt) return false;
  const { x, y } = pt;
  if (x < 0n || x >= P || y < 0n || y >= P) return false;
  return mod(y * y - (x * x * x + A * x + B), P) === 0n;
}

function additionner(p1: Point, p2: Point): Point {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1.x === p2.x) {
    if (mod(p1.y + p2.y, P) === 0n) return null; // p1 = -p2
    // doublement
    const l = mod((3n * p1.x * p1.x + A) * inverseMod(2n * p1.y, P), P);
    const x = mod(l * l - 2n * p1.x, P);
    const y = mod(l * (p1.x - x) - p1.y, P);
    return { x, y };
  }
  const l = mod((p2.y - p1.y) * inverseMod(p2.x - p1.x, P), P);
  const x = mod(l * l - p1.x - p2.x, P);
  const y = mod(l * (p1.x - x) - p1.y, P);
  return { x, y };
}

function multiplier(k: bigint, pt: Point): Point {
  let resultat: Point = null;
  let base: Point = pt;
  let e = k;
  while (e > 0n) {
    if (e & 1n) resultat = additionner(resultat, base);
    base = additionner(base, base);
    e >>= 1n;
  }
  return resultat;
}

function octetsVersBigInt(o: Uint8Array): bigint {
  let r = 0n;
  for (const b of o) r = (r << 8n) | BigInt(b);
  return r;
}

// ── DER minimal (longueurs définies seulement) ──────────────────────────────
interface Tlv { tag: number; contenu: Uint8Array; fin: number; }

function lireTlv(d: Uint8Array, i: number): Tlv {
  const tag = d[i];
  if (tag === undefined) throw new Error("DER tronqué");
  let len = d[i + 1];
  let pos = i + 2;
  if (len === undefined) throw new Error("DER tronqué");
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error("DER longueur inattendue");
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | d[pos++];
  }
  if (pos + len > d.length) throw new Error("DER : contenu hors limites");
  return { tag, contenu: d.subarray(pos, pos + len), fin: pos + len };
}

function decoderOid(contenu: Uint8Array): string {
  const parts: number[] = [];
  let v = 0;
  for (let i = 0; i < contenu.length; i++) {
    v = (v << 7) | (contenu[i] & 0x7f);
    if (!(contenu[i] & 0x80)) { parts.push(v); v = 0; }
  }
  const first = parts.shift() ?? 0;
  return [Math.floor(first / 40), first % 40, ...parts].join(".");
}

// SubjectPublicKeyInfo → point Q. Exige ecPublicKey + prime256v1 et un point
// non compressé (0x04 || X || Y).
export function cleSpkiVersPoint(spki: Uint8Array): { x: bigint; y: bigint } {
  const seq = lireTlv(spki, 0);
  if (seq.tag !== 0x30) throw new Error("SPKI : SEQUENCE attendue");
  const algo = lireTlv(seq.contenu, 0);
  if (algo.tag !== 0x30) throw new Error("SPKI : AlgorithmIdentifier attendu");
  const oid1 = lireTlv(algo.contenu, 0);
  if (oid1.tag !== 0x06) throw new Error("SPKI : OID d'algorithme attendu");
  const typeCle = decoderOid(oid1.contenu);
  if (typeCle !== OID_EC_PUBLIC_KEY) throw new Error(`SPKI : clé non EC (${typeCle})`);
  const oid2 = lireTlv(algo.contenu, oid1.fin);
  if (oid2.tag !== 0x06) throw new Error("SPKI : OID de courbe attendu");
  const courbe = decoderOid(oid2.contenu);
  if (courbe !== OID_PRIME256V1) throw new Error(`courbe non gérée (${courbe}), P-256 attendue`);
  const bits = lireTlv(seq.contenu, algo.fin);
  if (bits.tag !== 0x03) throw new Error("SPKI : BIT STRING attendu");
  const pt = bits.contenu.subarray(1); // premier octet = bits inutilisés (0)
  if (pt.length !== 65 || pt[0] !== 0x04) throw new Error("SPKI : point non compressé de 65 octets attendu");
  const q = { x: octetsVersBigInt(pt.subarray(1, 33)), y: octetsVersBigInt(pt.subarray(33, 65)) };
  if (!surLaCourbe(q)) throw new Error("SPKI : le point n'est pas sur P-256");
  return q;
}

// Signature DER (SEQUENCE { INTEGER r, INTEGER s }) → { r, s }.
export function signatureDerVersRS(der: Uint8Array): { r: bigint; s: bigint } {
  const seq = lireTlv(der, 0);
  if (seq.tag !== 0x30 || seq.fin !== der.length) throw new Error("signature DER : SEQUENCE attendue");
  const ri = lireTlv(seq.contenu, 0);
  if (ri.tag !== 0x02) throw new Error("signature DER : INTEGER r attendu");
  const si = lireTlv(seq.contenu, ri.fin);
  if (si.tag !== 0x02 || si.fin !== seq.contenu.length) throw new Error("signature DER : INTEGER s attendu");
  return { r: octetsVersBigInt(ri.contenu), s: octetsVersBigInt(si.contenu) };
}

// Vérification ECDSA (FIPS 186-4 §6.4.2). `digest` = condensé du message
// (SHA-1 : 20 octets, SHA-256 : 32) — tronqué aux bits de N si plus long.
export function verifierEcdsaP256(q: { x: bigint; y: bigint }, digest: Uint8Array, r: bigint, s: bigint): boolean {
  if (!surLaCourbe(q)) return false;
  if (r < 1n || r >= N || s < 1n || s >= N) return false;
  let e = octetsVersBigInt(digest);
  const bitsN = N.toString(2).length;
  const bitsDigest = digest.length * 8;
  if (bitsDigest > bitsN) e >>= BigInt(bitsDigest - bitsN);
  const w = inverseMod(s, N);
  const u1 = mod(e * w, N);
  const u2 = mod(r * w, N);
  const pt = additionner(multiplier(u1, { x: GX, y: GY }), multiplier(u2, q));
  if (!pt) return false;
  return mod(pt.x, N) === r;
}
