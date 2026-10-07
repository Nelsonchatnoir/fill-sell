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
const CDN_HOTES_EXACTS = ["d2f61lx5s6m7uh.cloudfront.net"];

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

export async function decoderEmpreinte(buf: Uint8Array): Promise<Empreinte & { largeur: number; hauteur: number; variantes: Variantes }> {
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
export async function empreinterUrl(url: string, supabaseUrl: string): Promise<Empreinte & { largeur: number; hauteur: number; variantes: Variantes }> {
  const reduite = urlTransformee(url, supabaseUrl);
  const essais = reduite ? [reduite, url] : [urlAllegee(url), url];
  let derniere: unknown = null;
  for (const u of [...new Set(essais)]) {
    try { return await decoderEmpreinte(await telecharger(u)); } catch (e) { derniere = e; }
  }
  throw derniere ?? new Error("échec");
}
