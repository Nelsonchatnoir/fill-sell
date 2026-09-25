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
import { empreinteDepuisRgba, type Empreinte } from "./empreinte-image.ts";

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

export async function decoderEmpreinte(buf: Uint8Array): Promise<Empreinte & { largeur: number; hauteur: number }> {
  const { decode } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
  // deno-lint-ignore no-explicit-any
  const img: any = await decode(buf);
  const width = Number(img?.width), height = Number(img?.height);
  if (!width || !height) throw new Error("image illisible");
  if (width * height > MAX_PIXELS) throw new Error(`trop de pixels (${width}×${height})`);
  const e = empreinteDepuisRgba({ data: img.bitmap as Uint8ClampedArray, width, height });
  return { ...e, largeur: width, hauteur: height };
}

/** L'empreinte d'une URL : la variante la moins chère d'abord, l'originale ensuite. */
export async function empreinterUrl(url: string, supabaseUrl: string): Promise<Empreinte & { largeur: number; hauteur: number }> {
  const reduite = urlTransformee(url, supabaseUrl);
  const essais = reduite ? [reduite, url] : [urlAllegee(url), url];
  let derniere: unknown = null;
  for (const u of [...new Set(essais)]) {
    try { return await decoderEmpreinte(await telecharger(u)); } catch (e) { derniere = e; }
  }
  throw derniere ?? new Error("échec");
}
