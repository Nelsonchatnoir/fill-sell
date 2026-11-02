// ═══════════════════════════════════════════════════════════════════════════
// essai-empreintes-d-test — FONCTION DE TEST de l'essai D (02/11), appelée par
// PERSONNE en prod. Rien n'est écrit en base, rien n'est branché : la
// transformation Supabase reste celle de la prod.
// ═══════════════════════════════════════════════════════════════════════════
// Elle refait, DANS une fonction Supabase, la transformation de Supabase
// (imgproxy : fit 400×400, quality 80) avec libvips 8.18.7 compilé sur UN SEUL
// THREAD (vips-mono.mjs, WebAssembly embarqué : ni Web Worker ni
// SharedArrayBuffer), puis calcule l'empreinte avec le module de la prod
// (decoderEmpreinte, importé tel quel). Elle rend, par photo : le code
// (0 = fait, 1 = hors périmètre → resterait à Supabase), l'empreinte, le
// sha256 de l'image réduite, les temps et la mémoire mesurés ici.
// Recette et preuves : docs/enquetes/facture-supabase-0211/essai-empreintes-D/.
//
// Garde : en-tête x-essai-d dont le SHA-256 vaut JETON_SHA256 (le jeton lui-même
// n'est écrit nulle part dans le dépôt ni dans les secrets ; verify_jwt false :
// aucun appelant de l'app). Photos du bucket listing-photos seulement, 8 par appel au plus.
import VipsMono from "./vips-mono.mjs";
import { decoderEmpreinte, telecharger } from "../_shared/empreinte-telechargement.ts";

const JETON_SHA256 = "0068c77baba43a3fd8bb1a533b42c5f1d6e82d96311e8eba835d2582a05c8ee1";
const PREFIXE = `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/storage/v1/object/public/listing-photos/`;
const MAX_PHOTOS = 8;

// deno-lint-ignore no-explicit-any
let m: any = null;
let demarrage: Record<string, unknown> | null = null;

const memoire = () => {
  try {
    const u = Deno.memoryUsage();
    return { rss_mo: +(u.rss / 2 ** 20).toFixed(1), tas_mo: +(u.heapUsed / 2 ** 20).toFixed(1), externe_mo: +(u.external / 2 ** 20).toFixed(1) };
  } catch {
    return null;
  }
};

async function charger() {
  if (m) return false;
  const avant = memoire();
  const t = performance.now();
  m = await VipsMono();
  if (m._essai_init() !== 0) throw new Error("essai_init : " + m.UTF8ToString(m._essai_erreur()));
  demarrage = { ms: Math.round(performance.now() - t), memoire_avant: avant, memoire_apres: memoire(), wasm_mo: m.HEAPU8.length / 2 ** 20 };
  return true;
}

function reduire(o: Uint8Array) {
  const p = m._malloc(o.length);
  m.HEAPU8.set(o, p);
  const pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(4 * 8);
  try {
    const code = m._essai_reduire(p, o.length, pp, pl, pi);
    const infos = Array.from(m.HEAP32.subarray(pi >> 2, (pi >> 2) + 8)) as number[];
    if (code !== 0) return { code, infos, erreur: code < 0 ? m.UTF8ToString(m._essai_erreur()) : "hors périmètre" };
    const q = m.HEAPU32[pp >> 2], n = m.HEAPU32[pl >> 2];
    const octets = m.HEAPU8.slice(q, q + n) as Uint8Array;
    m._essai_liberer(q);
    return { code, infos, octets };
  } finally {
    m._free(p); m._free(pp); m._free(pl); m._free(pi);
  }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  const jeton = req.headers.get("x-essai-d") ?? "";
  if (!jeton || hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton))) !== JETON_SHA256) {
    return new Response("interdit", { status: 403 });
  }
  let urls: unknown;
  try { ({ urls } = await req.json()); } catch { /* corps illisible */ }
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > MAX_PHOTOS) {
    return Response.json({ erreur: `urls : 1 à ${MAX_PHOTOS} photos` }, { status: 400 });
  }
  const froid = await charger();
  const photos = [];
  for (const url of urls) {
    const a: Record<string, unknown> = { url };
    try {
      if (typeof url !== "string" || !url.startsWith(PREFIXE)) throw new Error("hors bucket listing-photos");
      const o = await telecharger(url);
      a.octets_originale = o.length;
      let t = performance.now();
      const r = reduire(o);
      a.reduction_ms = Math.round(performance.now() - t);
      a.code = r.code;
      a.infos = r.infos;
      if (r.code === 0) {
        a.sha256 = hex(await crypto.subtle.digest("SHA-256", new Uint8Array(r.octets!)));
        a.octets_reduite = r.octets!.length;
        t = performance.now();
        const e = await decoderEmpreinte(r.octets!);
        a.empreinte_ms = Math.round(performance.now() - t);
        a.empreinte = { dhash: e.dhash, phash: e.phash, couleur: e.couleur, variantes: e.variantes, largeur: e.largeur, hauteur: e.hauteur };
      } else if (r.erreur) a.erreur = r.erreur;
    } catch (e) {
      a.erreur = String((e as Error)?.message ?? e).slice(0, 200);
    }
    a.memoire = memoire();
    a.wasm_mo = m.HEAPU8.length / 2 ** 20;
    photos.push(a);
  }
  return Response.json({ froid, demarrage, photos, pointe_libvips_mo: +(m._essai_pointe_libvips() / 2 ** 20).toFixed(1), memoire_fin: memoire() });
});
