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
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";

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

// ═══════════════════════════════════════════════════════════════════════════
// Hôtes des plateformes dont on IMPORTE des annonces (19/09/2026)
//
// Pourquoi cette liste existe. Un article importé d'un relevé garde les URLs
// de la plateforme d'origine. Au moment de publier AILLEURS, le content script
// lit la photo par `fetch()` DEPUIS la page de dépôt (urlToFile) : il est donc
// soumis au CORS de l'hôte de l'image, quoi qu'autorise le manifeste. Un CDN
// qui ne sert pas d'en-tête `Access-Control-Allow-Origin` rend « Failed to
// fetch » et la publication tombe.
//
// Mesuré le 19/09 depuis une origine tierce (les quatre URLs vivantes) :
//   · cdn.beebs.app                  fetch REFUSÉ (pas d'ACAO) · <img> OK 700×700
//   · img.leboncoin.fr               fetch 200
//   · i.ebayimg.com                  fetch 200
//   · d2f61lx5s6m7uh.cloudfront.net  fetch 200
//   · images1.vinted.net             fetch REFUSÉ (déjà documenté, 06/08)
// L'image est PUBLIQUE dans tous les cas (elle se charge en <img>) : ce n'est
// ni un jeton, ni un referer, ni une expiration, ni le réseau — c'est le CORS,
// et il peut changer côté plateforme sans nous prévenir. C'est ce qui est
// arrivé à Beebs : d'où une liste qui couvre les CINQ sources d'import, pas
// seulement celle qui refuse aujourd'hui.
//
// Recensement de `inventaire.photos` au 19/09 (parc entier) — c'est la liste
// complète des hôtes présents, aucun autre :
//   images1.vinted.net 313 493 · img.leboncoin.fr 245 · cdn.beebs.app 210
//   · i.ebayimg.com 57 · d2f61lx5s6m7uh.cloudfront.net 4
//
// ⛔ LISTE FERMÉE, et elle doit le rester : ces prédicats gardent des fonctions
// qui TÉLÉCHARGENT une URL et l'écrivent dans notre bucket. Un joker en
// ferait un proxy de téléchargement arbitraire. En particulier
// `cloudfront.net` est MUTUALISÉ (n'importe qui y sert n'importe quoi) : la
// distribution d'Opla est nommée à l'hôte EXACT, jamais en `*.cloudfront.net`.
// Sa valeur est la même qu'`OPLA_CDN_IMAGES` (chrome-extension/content-scripts/opla.js).
// ═══════════════════════════════════════════════════════════════════════════
const CDN_DOMAINES_PLATEFORMES = ["vinted.net", "vinted.fr", "vinted.com", "leboncoin.fr", "beebs.app", "ebayimg.com"];
const CDN_HOTES_EXACTS = ["d2f61lx5s6m7uh.cloudfront.net"];

export function estCdnPlateforme(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const h = url.hostname.toLowerCase();
    if (CDN_HOTES_EXACTS.includes(h)) return true;
    return CDN_DOMAINES_PLATEFORMES.some((d) => h === d || h.endsWith(`.${d}`));
  } catch { return false; }
}

// Les CDN de plateformes AUTRES que Vinted. Le partage est volontaire :
// · Vinted reste EXCLU du rapatriement de masse — décision Nico du 06/09,
//   c'est une question de volume (313 493 photos en base contre 516 pour
//   toutes les autres plateformes réunies, relevé du 19/09), pas de principe ;
// · ces 516-là, elles, sont rapatriables d'un bloc, et il le faut : l'une des
//   quatre (Beebs) refuse déjà le CORS, donc ses photos ne sont réutilisables
//   NULLE PART tant qu'elles restent chez elle.
export function estCdnPlateformeHorsVinted(u: unknown): u is string {
  if (!estCdnPlateforme(u)) return false;
  try {
    const h = new URL(u as string).hostname.toLowerCase();
    return !["vinted.net", "vinted.fr", "vinted.com"].some((d) => h === d || h.endsWith(`.${d}`));
  } catch { return false; }
}
