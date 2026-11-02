// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉCHARGER ET EMPREINTER UNE PHOTO, À COÛT MAÎTRISÉ (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Les mêmes règles que photo-empreinte (liste FERMÉE d'hôtes, poids et pixels
// bornés, variantes allégées), extraites pour la fonction doublons-balayage.
// ⛔ photo-empreinte n'est PAS modifiée : elle garde sa copie de ces règles.
// Différence voulue : les photos de NOTRE bucket passent d'abord par la
// transformation du Storage (400 px) — le décodage coûte du CPU (2 s par
// requête au plus) et une empreinte se calcule sur 32×32 pixels : décoder
// 12 Mpx pour en garder 1 024 ne sert à rien.
import { empreinteDepuisRgba, variantesDepuisRgba, type Empreinte, type Variantes } from "./empreinte-image.ts";

export const MAX_OCTETS = 8 * 1024 * 1024;
export const MAX_PIXELS = 6_000_000;
export const TIMEOUT_MS = 15_000;

const CDN_DOMAINES = ["vinted.net", "vinted.fr", "vinted.com", "leboncoin.fr", "beebs.app", "ebayimg.com"];
const CDN_HOTES_EXACTS = ["d2f61lx5s6m7uh.cloudfront.net", "media-photos.depop.com"];

/** Hôtes en liste fermée : sans elle, la fonction serait un proxy de téléchargement. */
export function hoteAutorise(url: string, supabaseUrl: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (CDN_HOTES_EXACTS.includes(h)) return true;
  if (CDN_DOMAINES.some((d) => h === d || h.endsWith("." + d))) return true;
  try {
    const s = new URL(supabaseUrl);
    if (h === s.hostname && u.pathname.startsWith("/storage/v1/object/public/listing-photos/")) return true;
  } catch { /* URL Supabase illisible : refus */ }
  return false;
}

/** eBay sert la même image en 500 px. */
export function urlAllegee(url: string): string {
  return url.replace(/(i\.ebayimg\.com\/images\/g\/[^/]+\/)s-l\d+(\.\w+)$/, "$1s-l500$2");
}

/** Notre bucket, réduit par le Storage (JPEG) — null hors bucket. */
export function urlTransformee(url: string, supabaseUrl: string, cote = 400): string | null {
  try {
    const u = new URL(url);
    const s = new URL(supabaseUrl);
    if (u.hostname !== s.hostname) return null;
    const m = u.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/render/image/public/${m[1]}/${m[2]}?width=${cote}&height=${cote}&resize=contain&quality=80`;
  } catch {
    return null;
  }
}

export async function telecharger(url: string): Promise<Uint8Array> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { Accept: "image/jpeg,image/png,image/*;q=0.5,*/*;q=0.1" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = r.headers.get("content-type") ?? "";
    if (!/^image\//i.test(type)) throw new Error(`type ${type || "inconnu"}`);
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX_OCTETS) throw new Error(`trop lourde (${len} o)`);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > MAX_OCTETS) throw new Error(`trop lourde (${buf.byteLength} o)`);
    return buf;
  } finally {
    clearTimeout(t);
  }
}

// ── WEBP (2026-09-30) ─────────────────────────────────────────────────────
// imagescript ne lit pas le WebP : « Unsupported image type » sur 1 569 photos
// Opla (CloudFront, toutes en .webp) et 119 Beebs. Une fiche importée d'Opla
// n'avait donc JAMAIS d'empreinte, et aucune fusion par la photo ne pouvait la
// voir. Le WebP passe par le décodeur de libwebp (WASM, @jsquash/webp 1.4.0,
// épinglé). Mesuré : la photo Opla d'un article et sa photo Vinted donnent
// dHash 0 / pHash 0.
const WEBP_WASM = "https://cdn.jsdelivr.net/npm/@jsquash/webp@1.4.0/codec/dec/webp_dec.wasm";
// deno-lint-ignore no-explicit-any
let webpPret: Promise<(b: ArrayBuffer) => Promise<any>> | null = null;
function decodeurWebp() {
  if (!webpPret) {
    webpPret = (async () => {
      // Le décodeur rend un ImageData, absent du runtime edge.
      // deno-lint-ignore no-explicit-any
      const g = globalThis as any;
      if (!g.ImageData) {
        g.ImageData = class { data: Uint8ClampedArray; width: number; height: number;
          constructor(d: Uint8ClampedArray, w: number, h: number) { this.data = d; this.width = w; this.height = h; } };
      }
      const mod = await import("https://esm.sh/@jsquash/webp@1.4.0/decode.js");
      const r = await fetch(WEBP_WASM);
      if (!r.ok) throw new Error(`décodeur WebP : HTTP ${r.status}`);
      await mod.init(await WebAssembly.compile(await r.arrayBuffer()));
      return mod.default;
    })().catch((e) => { webpPret = null; throw e; });
  }
  return webpPret;
}
/** « RIFF????WEBP » : les 12 premiers octets d'un fichier WebP. */
export function estWebp(buf: Uint8Array): boolean {
  return buf.byteLength > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

// ── LE TEMPS DE CALCUL D'UN APPEL (15/10, P18) ───────────────────────────
// Une fonction edge a 2 s de CPU par requête. Mesuré du 14/10 12:00 au 15/10
// 12:00 (journaux d'empreintes-urls) : 1 117 ms en moyenne pour un appel de
// 6 photos, 45 appels coupés « CPU Time exceeded » (2 007 à 2 364 ms) — le
// décodage fait presque tout (banc local : 70 ms par million de pixels, une
// photo Vinted 0,85 Mpx, une photo de 6 Mpx 437 ms ; plus lent sur le serveur).
// Un appel coupé perd la photo en cours ET les suivantes.
// Deux règles, mêmes empreintes qu'avant (rien ne change dans le calcul) :
//   · une image trop grande est refusée AVANT d'être décodée — même verdict,
//     même motif que le contrôle d'après décodage (lu dans l'en-tête JPEG ou
//     PNG ; en-tête illisible ou WebP : le contrôle d'après décodage reste) ;
//   · un appel qui porte un budget ne commence pas un décodage qu'il n'a plus
//     le temps de finir (estimé sur les pixels de l'image, à la vitesse
//     mesurée dans CET appel) : la photo est REMISE, jamais un échec — elle
//     reste sans empreinte et l'appelant la redemande. Le premier décodage
//     d'un appel part toujours : chaque appel avance.

/** Largeur et hauteur lues dans l'en-tête (JPEG, PNG), sans décoder — null si l'en-tête n'est pas lu. */
export function dimensionsEnTete(buf: Uint8Array): { largeur: number; hauteur: number } | null {
  const n = buf.byteLength;
  // PNG : signature de 8 octets, puis le bloc IHDR (largeur, hauteur : 4 octets chacune).
  if (n >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      && buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52) {
    const largeur = ((buf[16] << 24) >>> 0) + (buf[17] << 16) + (buf[18] << 8) + buf[19];
    const hauteur = ((buf[20] << 24) >>> 0) + (buf[21] << 16) + (buf[22] << 8) + buf[23];
    return largeur > 0 && hauteur > 0 ? { largeur, hauteur } : null;
  }
  // JPEG : FF D8, puis les segments jusqu'au premier « début de trame » (SOF).
  if (n >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 3 < n) {
      if (buf[i] !== 0xff) return null;
      const m = buf[i + 1];
      if (m === 0xff) { i++; continue; }                                   // octet de remplissage
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; }    // marqueurs sans longueur
      if (m === 0xd9 || m === 0xda) return null;                          // fin, ou données avant toute trame
      const longueur = (buf[i + 2] << 8) | buf[i + 3];
      if (longueur < 2) return null;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        if (i + 8 >= n) return null;
        const hauteur = (buf[i + 5] << 8) | buf[i + 6], largeur = (buf[i + 7] << 8) | buf[i + 8];
        return largeur > 0 && hauteur > 0 ? { largeur, hauteur } : null;
      }
      i += 2 + longueur;
    }
  }
  return null;
}

/** Le temps de calcul d'un appel : budget (ms), consommé, pixels et décodages déjà faits. */
export type BudgetDecodage = { budgetMs: number; consommeMs: number; pixels: number; decodages: number };
export const budgetDecodage = (budgetMs: number): BudgetDecodage => ({ budgetMs, consommeMs: 0, pixels: 0, decodages: 0 });
/** La photo est remise à l'appel suivant (budget atteint) : ce n'est JAMAIS un échec de la photo. */
export class DecodageRemis extends Error {
  constructor() { super("budget de calcul de l'appel atteint : photo remise"); this.name = "DecodageRemis"; }
}

// ── UN ÉCHEC PASSAGER N'EST PAS UNE PHOTO ILLISIBLE (15/10, P16) ────────────
// Toute URL notée dans photo_empreintes_echecs est « illisible » pour le moteur
// de rapprochement et pour fusion_photo_tick : sa fiche part sans photo, et la
// paire devient « titre_sans_photo ». Or 498 de ces échecs (ferreirasab : 139)
// étaient des « HTTP 429 » de NOTRE stockage, sous une rafale de 100 appels de
// 6 photos ; 47 un décodeur pas encore prêt. Désormais : notre stockage ou la
// plateforme qui dit « plus tard » (408, 425, 429, 5xx), un réseau coupé, un
// délai dépassé ou un décodeur pas prêt = un échec PASSAGER — jamais noté, la
// photo reste à faire et l'appelant la redemande (dans ses propres bornes :
// passages comptés, relances espacées). Une version de la photo qui échoue
// pour une raison passagère suffit : l'autre version qui dirait « trop de
// pixels » (l'originale de 12 Mpx derrière une version réduite refusée en 429)
// ne la condamne plus.
const RE_PASSAGER = /^HTTP (408|425|429|5\d\d)\b|error sending request|connection (reset|closed|refused)|timed? ?out|AbortError|aborted|Cannot access '[A-Za-z]+' before initialization|décodeur WebP : HTTP/i;
export function estPassager(motif: string): boolean { return RE_PASSAGER.test(String(motif ?? "")); }
/** L'échec d'une photo pour une raison PASSAGÈRE : jamais noté en échec, la photo est redemandée. */
export class EchecPassager extends Error {
  constructor(motif: string) { super(motif); this.name = "EchecPassager"; }
}

export async function decoderEmpreinte(buf: Uint8Array, budget?: BudgetDecodage): Promise<Empreinte & { largeur: number; hauteur: number; variantes: Variantes }> {
  const dim = dimensionsEnTete(buf);
  if (dim && dim.largeur * dim.hauteur > MAX_PIXELS) throw new Error(`trop de pixels (${dim.largeur}×${dim.hauteur})`);
  if (budget && budget.decodages > 0) {
    const moyenne = budget.consommeMs / budget.decodages;
    const estime = dim && budget.pixels > 0
      ? dim.largeur * dim.hauteur * (budget.consommeMs / budget.pixels)
      : Math.max(300, 2 * moyenne);
    if (budget.consommeMs + estime > budget.budgetMs) throw new DecodageRemis();
  }
  const debut = performance.now();
  try {
    return await decoderSansBudget(buf);
  } finally {
    if (budget) {
      budget.consommeMs += performance.now() - debut;
      budget.decodages++;
      budget.pixels += dim ? dim.largeur * dim.hauteur : 0;
    }
  }
}

async function decoderSansBudget(buf: Uint8Array): Promise<Empreinte & { largeur: number; hauteur: number; variantes: Variantes }> {
  // deno-lint-ignore no-explicit-any
  let data: any, width: number, height: number;
  if (estWebp(buf)) {
    const decode = await decodeurWebp();
    const img = await decode(buf.slice().buffer);
    width = Number(img?.width); height = Number(img?.height); data = img?.data;
  } else {
    const { decode } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    // deno-lint-ignore no-explicit-any
    const img: any = await decode(buf);
    width = Number(img?.width); height = Number(img?.height); data = img?.bitmap;
  }
  if (!width || !height || !data) throw new Error("image illisible");
  if (width * height > MAX_PIXELS) throw new Error(`trop de pixels (${width}×${height})`);
  const img = { data: data as Uint8ClampedArray, width, height };
  const e = empreinteDepuisRgba(img);
  // (08/10) Les lectures du centre : même image décodée, aucun téléchargement de plus.
  const variantes = variantesDepuisRgba(img);
  return { ...e, largeur: width, hauteur: height, variantes };
}

/** L'empreinte d'une URL : la variante la moins chère d'abord, l'originale ensuite. */
export async function empreinterUrl(url: string, supabaseUrl: string, budget?: BudgetDecodage): Promise<Empreinte & { largeur: number; hauteur: number; variantes: Variantes }> {
  const reduite = urlTransformee(url, supabaseUrl);
  const essais = reduite ? [reduite, url] : [urlAllegee(url), url];
  let derniere: unknown = null;
  let passager: string | null = null;
  for (const u of [...new Set(essais)]) {
    try { return await decoderEmpreinte(await telecharger(u), budget); } catch (e) {
      if (e instanceof DecodageRemis) throw e; // remise : on n'essaie pas une autre version de la photo
      const err = e as Error;
      const motif = err?.name === "AbortError" ? `AbortError (${TIMEOUT_MS / 1000} s)` : String(err?.message ?? e);
      if (!passager && estPassager(motif)) passager = motif;
      derniere = e;
    }
  }
  if (passager) throw new EchecPassager(passager);
  throw derniere ?? new Error("échec");
}
