// ═══════════════════════════════════════════════════════════════════════════
// photo-empreinte — les empreintes d'images, à la demande, mises en cache
// (2026-09-23, chantier « comparer les photos pour rapprocher avec certitude »)
// ═══════════════════════════════════════════════════════════════════════════
// APPELANT : l'app (JWT utilisateur) — l'alerte « un article qui ressemble »
// et l'écran de rattachement demandent les empreintes des quelques photos
// qu'ils comparent. verify_jwt reste à TRUE (défaut) : l'appel porte toujours
// un JWT utilisateur, et on le relit ici (getUser) pour refuser un jeton
// anonyme.
//
// CE QU'ELLE FAIT : pour chaque URL reçue, rend l'empreinte (dHash, pHash,
// signature couleur — _shared/empreinte-image.ts) depuis la table
// photo_empreintes si elle y est, sinon télécharge, décode (imagescript, épinglé
// 1.3.0, import dynamique comme lens-analysis), calcule, écrit, rend.
//
// COÛT MAÎTRISÉ, par construction :
//   · 40 URL par appel au plus, 8 Mo par image, 6 Mpx décodés par image,
//     15 s par téléchargement, 20 s de budget total — au-delà on rend ce qui
//     est fait et `restantes` ;
//   · hôtes en LISTE FERMÉE (les CDN des plateformes + notre bucket public) :
//     sans elle, une fonction authentifiée serait un proxy de téléchargement ;
//   · une empreinte calculée ne l'est plus jamais (clé = URL) ;
//   · rien de personnel dans la table : une URL publique et 3 chaînes de bits.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { empreinteDepuisRgba, type Empreinte } from "../_shared/empreinte-image.ts";

const MAX_URLS = 40;
const MAX_OCTETS = 8 * 1024 * 1024;
const MAX_PIXELS = 6_000_000;
const TIMEOUT_MS = 15_000;
const BUDGET_MS = 20_000;

const CDN_DOMAINES = ["vinted.net", "vinted.fr", "vinted.com", "leboncoin.fr", "beebs.app", "ebayimg.com"];
const CDN_HOTES_EXACTS = ["d2f61lx5s6m7uh.cloudfront.net"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function hoteAutorise(url: string, supabaseUrl: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (CDN_HOTES_EXACTS.includes(h)) return true;
  if (CDN_DOMAINES.some((d) => h === d || h.endsWith("." + d))) return true;
  try {
    const s = new URL(supabaseUrl);
    if (h === s.hostname && u.pathname.startsWith("/storage/v1/object/public/listing-photos/")) return true;
  } catch { /* URL Supabase illisible : on ne l'autorise pas */ }
  return false;
}

/** Une variante plus légère de la même image, quand le CDN en sert une (eBay). */
function urlAllegee(url: string): string {
  return url.replace(/(i\.ebayimg\.com\/images\/g\/[^/]+\/)s-l\d+(\.\w+)$/, "$1s-l500$2");
}

/** Notre bucket public, par le service de transformation du Storage : rend une
 *  image JPEG/PNG réduite — c'est ce qui décode les WebP que le rapatriement
 *  écrit (rapatrie-fiche/…webp) et qu'imagescript ne lit pas (mesuré le
 *  23/09 : 3 échecs sur 473, tous des .webp de notre bucket). null hors bucket. */
function urlTransformee(url: string, supabaseUrl: string): string | null {
  try {
    const u = new URL(url);
    const s = new URL(supabaseUrl);
    if (u.hostname !== s.hostname) return null;
    const m = u.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/render/image/public/${m[1]}/${m[2]}?width=800&height=800&resize=contain&quality=80`;
  } catch {
    return null;
  }
}

async function telecharger(url: string): Promise<Uint8Array> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // Accept sans WebP : imagescript ne le décode pas, et les CDN qui négocient
    // le format (Storage, Leboncoin) servent alors du JPEG/PNG.
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

async function calculer(buf: Uint8Array): Promise<Empreinte & { largeur: number; hauteur: number }> {
  // Import dynamique, épinglé : une indisponibilité du décodeur ne doit pas
  // empêcher la fonction de démarrer (même choix que lens-analysis/images.ts).
  const { decode } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
  // deno-lint-ignore no-explicit-any
  const img: any = await decode(buf);
  const width = Number(img?.width), height = Number(img?.height);
  if (!width || !height) throw new Error("image illisible");
  if (width * height > MAX_PIXELS) throw new Error(`trop de pixels (${width}×${height})`);
  const e = empreinteDepuisRgba({ data: img.bitmap as Uint8ClampedArray, width, height });
  return { ...e, largeur: width, hauteur: height };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST attendu" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } = { user: null } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "non authentifié" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  let body: { urls?: unknown } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map((u) => String(u ?? "").trim()).filter(Boolean))].slice(0, MAX_URLS);
  const admin = createClient(supabaseUrl, service);
  const empreintes: Record<string, Empreinte & { largeur?: number | null; hauteur?: number | null }> = {};
  const echecs: Array<{ url: string; motif: string }> = [];
  const debut = Date.now();

  // 1. Le cache : tout ce qui est déjà calculé revient sans un octet téléchargé.
  if (urls.length) {
    const { data: connues } = await admin.from("photo_empreintes").select("url, dhash, phash, couleur, largeur, hauteur").in("url", urls);
    for (const r of (connues ?? []) as Array<Record<string, unknown>>) {
      empreintes[String(r.url)] = { dhash: String(r.dhash), phash: String(r.phash), couleur: String(r.couleur ?? ""), largeur: r.largeur as number | null, hauteur: r.hauteur as number | null };
    }
  }

  // 2. Le reste, dans le budget.
  let restantes = 0;
  for (const url of urls) {
    if (empreintes[url]) continue;
    if (Date.now() - debut > BUDGET_MS) { restantes++; continue; }
    if (!hoteAutorise(url, supabaseUrl)) { echecs.push({ url, motif: "hôte hors liste" }); continue; }
    try {
      let e: Empreinte & { largeur: number; hauteur: number };
      try {
        e = await calculer(await telecharger(urlAllegee(url)));
      } catch (premiere) {
        // Second essai par la transformation du Storage (WebP de notre bucket,
        // image trop grande) — hors bucket, l'échec d'origine est rendu.
        const t2 = urlTransformee(url, supabaseUrl);
        if (!t2) throw premiere;
        e = await calculer(await telecharger(t2));
      }
      empreintes[url] = e;
      await admin.from("photo_empreintes").upsert({
        url, dhash: e.dhash, phash: e.phash, couleur: e.couleur, largeur: e.largeur, hauteur: e.hauteur,
        source: "photo-empreinte", calculee_le: new Date().toISOString(),
      }, { onConflict: "url" });
    } catch (e) {
      echecs.push({ url, motif: String((e as Error)?.message ?? e).slice(0, 120) });
    }
  }

  return new Response(JSON.stringify({ empreintes, echecs, restantes, duree_ms: Date.now() - debut }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
