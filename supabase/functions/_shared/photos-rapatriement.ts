// ═══════════════════════════════════════════════════════════════════════════
// Photos — rapatriement chez nous AVANT une publication par API (06/09/2026)
//
// Décision Nico (06/09) : rien à l'import (33 963 articles en stock ne
// tiennent que par des URLs CDN Vinted signées — mesurées vivantes après un
// mois, 200 image/jpeg) ; UNIQUEMENT un filet à la publication API : toute
// URL qui n'est pas dans notre Storage est copiée dans le bucket
// listing-photos avant d'appeler eBay. eBay copie de toute façon les images
// sur i.ebayimg.com au publish (prouvé sur l'annonce 820093913142) — le
// filet ne sert qu'à ne pas dépendre d'une URL tierce le jour J.
// ≈ 0,3 Go/mois au rythme des publications eBay (30 j : 112 annonces, 719 photos).
//
// Même mécanique que handler-watch (rapatriePhoto) : 15 s, ≤ 10 Mo, image/*,
// deux tentatives sur échec transitoire. Best-effort : une photo qui ne se
// rapatrie pas garde son URL d'origine (eBay dira si elle est morte).
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PHOTO_BUCKET = "listing-photos";
const PHOTO_MAX_OCTETS = 10 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 15_000;

export function estChezNous(u: string): boolean {
  try {
    const url = new URL(u);
    return url.hostname === (Deno.env.get("SUPABASE_URL") ? new URL(Deno.env.get("SUPABASE_URL")!).hostname : "tojihnuawsoohlolangc.supabase.co")
      && url.pathname.startsWith("/storage/v1/object/public/");
  } catch { return false; }
}

export async function rapatrierPhoto(admin: SupabaseClient, src: string, dest: string): Promise<{ url: string | null; motif?: string }> {
  let dernier = "";
  for (let tentative = 1; tentative <= 2; tentative++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PHOTO_TIMEOUT_MS);
    let transitoire = false;
    try {
      const resp = await fetch(src, { signal: ctl.signal });
      if (!resp.ok) {
        transitoire = resp.status >= 500 || resp.status === 429 || resp.status === 408;
        dernier = `HTTP ${resp.status}`;
      } else {
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const contentType = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
        if (!bytes.byteLength || bytes.byteLength > PHOTO_MAX_OCTETS) { dernier = `taille hors bornes (${bytes.byteLength} octets)`; }
        else if (!contentType.startsWith("image/")) { dernier = `pas une image (${contentType})`; }
        else {
          const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
          const path = `${dest}.${ext}`;
          const { error: upErr } = await admin.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: true });
          if (upErr) { transitoire = true; dernier = `upload : ${upErr.message}`; }
          else return { url: admin.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string };
        }
      }
    } catch (e) {
      transitoire = true;
      dernier = (e as Error)?.name === "AbortError" ? `timeout ${PHOTO_TIMEOUT_MS / 1000}s` : String((e as Error)?.message ?? e);
    } finally {
      clearTimeout(timer);
    }
    if (!transitoire) break;
    if (tentative === 1) await new Promise((r) => setTimeout(r, 400));
  }
  return { url: null, motif: dernier };
}

export interface Rapatriement { urls: string[]; rapatriees: number; deja_chez_nous: number; echecs: Array<{ src: string; motif: string }>; }

// Toutes les URLs d'un job : celles déjà chez nous passent telles quelles,
// les autres sont copiées sous rapatrie/<user>/<inventaire>/<n>. L'ordre est
// conservé (la 1re photo reste la photo principale).
export async function rapatrierPhotosPublication(admin: SupabaseClient, urls: string[], userId: string, inventaireId: number | string): Promise<Rapatriement> {
  const out: string[] = [];
  const echecs: Rapatriement["echecs"] = [];
  let rapatriees = 0, dejaChezNous = 0;
  for (let i = 0; i < urls.length; i++) {
    const src = urls[i];
    if (estChezNous(src)) { out.push(src); dejaChezNous++; continue; }
    const r = await rapatrierPhoto(admin, src, `rapatrie/${userId}/${inventaireId}/${i + 1}`);
    if (r.url) { out.push(r.url); rapatriees++; }
    else { out.push(src); echecs.push({ src: src.slice(0, 120), motif: r.motif ?? "?" }); }
  }
  return { urls: out, rapatriees, deja_chez_nous: dejaChezNous, echecs };
}
