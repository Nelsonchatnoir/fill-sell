// ═══════════════════════════════════════════════════════════════════════════
// ESSAI D — la transformation Supabase (imgproxy : fit 400×400, q80) refaite
// avec libvips en WebAssembly (wasm-vips 0.0.19 = libvips 8.18.7, mozjpeg),
// puis l'empreinte calculée par le code de la prod (decoderEmpreinte, importé
// TEL QUEL du dépôt). Rien n'est écrit ailleurs que dans le dossier de travail.
//
// Pour chaque photo du jeu : octets reproduits == octets servis par Supabase ?
// empreinte (dHash, pHash, couleur, variantes) == empreinte stockée en base ?
// Un seul processus ; arrêt si la mémoire libre passe sous 1,5 Go.
// Usage : deno run --allow-read --allow-write --allow-net --allow-env reproduire.ts <jeu>
// ═══════════════════════════════════════════════════════════════════════════
import Vips from "../lib-wasm-vips-0.0.19/vips-es6.js";
import { decoderEmpreinte } from "file:///C:/Users/nicol/fill-and-sell/supabase/functions/_shared/empreinte-telechargement.ts";

const vips = await Vips({ dynamicLibraries: [] });
vips.concurrency(1);
const [jeu] = Deno.args;
const lignes: Array<Record<string, unknown>> = JSON.parse(await Deno.readTextFile(`donnees/${jeu}.json`));
const sortie = `donnees/${jeu}-resultat.ndjson`;
await Deno.writeTextFile(sortie, "");

const id = async (u: string) => {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(u)));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const canon = (v: unknown): string => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(v);
};
const memoireLibreGo = () => {
  const m = Deno.systemMemoryInfo();
  return (m.available > 0 ? Math.min(m.available, m.free) : m.free) / 2 ** 30; // Windows : « available » vaut 0
};

// imath.Scale d'imgproxy : arrondi au plus proche.
const echelle = (a: number, s: number) => Math.round(a * s);
const reductionJpeg = (s: number) => (s >= 8 ? 8 : s >= 4 ? 4 : s >= 2 ? 2 : 1);

/** Le pipeline d'imgproxy (v3) pour resizing_type:fit, 400×400, sans agrandissement, quality 80. */
// deno-lint-ignore no-explicit-any
function reproduire(buf: Uint8Array, a: Record<string, unknown>): Uint8Array {
  // deno-lint-ignore no-explicit-any
  const aLiberer: any[] = [];
  // deno-lint-ignore no-explicit-any
  const garde = (im: any) => { aLiberer.push(im); return im; };
  try {
    const tete = garde(vips.Image.newFromBuffer(buf));
    const chargeur = tete.getString("vips-loader");
    const orientation = tete.getTypeof("orientation") ? tete.getInt("orientation") : 1;
    let angle = 0;
    if (orientation === 3 || orientation === 4) angle = 180;
    if (orientation === 5 || orientation === 6) angle = 90;
    if (orientation === 7 || orientation === 8) angle = 270;
    const retourne = [2, 4, 5, 7].includes(orientation);
    const couche = angle % 180 !== 0;
    const srcW = couche ? tete.height : tete.width, srcH = couche ? tete.width : tete.height;
    // fit : la plus forte des deux réductions, jamais d'agrandissement
    let s = 1 / Math.max(srcW / 400, srcH / 400);
    if (s > 1) s = 1;
    let wscale = s, hscale = s;
    let im = tete;
    // réduction au chargement (JPEG : facteur 2, 4 ou 8 du décodeur)
    const pre = Math.min(srcW / echelle(srcW, s), srcH / echelle(srcH, s));
    let js = 1;
    if (pre > 1 && /^jpegload/.test(chargeur)) {
      js = reductionJpeg(pre);
      if (js > 1) {
        im = garde(vips.Image.newFromBuffer(buf, "", { shrink: js }));
        const nW = couche ? im.height : im.width, nH = couche ? im.width : im.height;
        wscale = (srcW / nW) * s;
        hscale = (srcH / nH) * s;
      }
    }
    a.chargeur = chargeur; a.orientation = orientation; a.W = tete.width; a.H = tete.height; a.js = js;
    a.bandes = tete.bands; a.interp = tete.interpretation; a.icc = !!tete.getTypeof("icc-profile-data");
    // Périmètre PROUVÉ : JPEG ou PNG, 3 bandes 8 bits sRGB, sans rotation EXIF. Le reste (orientation ≠ 1,
    // gris, CMJN, transparence, WebP…) n'a aucune référence gratuite ce cycle : il resterait à Supabase.
    if (!/^(jpegload|pngload)/.test(chargeur) || tete.bands !== 3 || tete.format !== "uchar" || tete.interpretation !== "srgb" || orientation !== 1) {
      throw new Error(`hors périmètre (${chargeur}, ${tete.bands} bandes, ${tete.format}, ${tete.interpretation}, orientation ${orientation})`);
    }
    if (wscale !== 1 || hscale !== 1) {
      const [ws, hs] = couche ? [hscale, wscale] : [wscale, hscale];
      a.ws = ws; a.hs = hs;
      im = garde(im.resize(ws, { vscale: hs }));
    }
    if (angle) im = garde(im.rot(angle === 90 ? "d90" : angle === 180 ? "d180" : "d270"));
    if (retourne) im = garde(im.flip("horizontal"));
    // profil ICC intégré : converti en sRGB APRÈS la réduction (mise au point : 11/11 photos à profil identiques)
    if (im.getTypeof("icc-profile-data")) im = garde(im.iccTransform("srgb", { embedded: true }));
    // métadonnées : rien de l'originale ne repart (l'EXIF minimal est celui que libvips écrit)
    im = garde(im.copy());
    for (const champ of im.getFields()) {
      if (/^(exif-|xmp-data|iptc-data|icc-profile-data|orientation)/.test(champ)) im.remove(champ);
    }
    if (/^pngload/.test(chargeur)) return im.writeToBuffer(".png", { filter: "all" });
    return im.writeToBuffer(".jpg", { Q: 80, interlace: true });
  } finally {
    for (const x of aLiberer.reverse()) { try { x.delete(); } catch { /* déjà libérée */ } }
  }
}

/** Écart de pixels entre deux images (décodées par libvips) : nombre de valeurs différentes, écart max. */
function ecartPixels(x: Uint8Array, y: Uint8Array) {
  const a = vips.Image.newFromBuffer(x), b = vips.Image.newFromBuffer(y);
  try {
    if (a.width !== b.width || a.height !== b.height || a.bands !== b.bands) return { dims: `${a.width}×${a.height}×${a.bands} / ${b.width}×${b.height}×${b.bands}` };
    const pa = a.writeToMemory(), pb = b.writeToMemory();
    let n = 0, max = 0;
    for (let i = 0; i < pa.length; i++) { const d = Math.abs(pa[i] - pb[i]); if (d) { n++; if (d > max) max = d; } }
    return { valeurs: pa.length, differentes: n, max };
  } finally { a.delete(); b.delete(); }
}

let n = 0, octetsIdentiques = 0, empreintesIdentiques = 0, refConforme = 0;
const t0 = performance.now();
for (const l of lignes) {
  const libre = memoireLibreGo();
  if (libre < 1.5) { console.log(`ARRÊT : mémoire libre ${libre.toFixed(2)} Go`); break; }
  const url = String(l.url);
  const base = `donnees/${jeu}/${(await id(url)).slice(0, 16)}`;
  const a: Record<string, unknown> = { id: base.slice(-16) };
  try {
    const o = await Deno.readFile(base + ".o"), r = await Deno.readFile(base + ".r");
    const t = performance.now();
    const d = reproduire(o, a);
    a.ms = Math.round(performance.now() - t);
    a.octets_ref = r.length; a.octets_d = d.length;
    a.octets_identiques = d.length === r.length && d.every((v, i) => v === r[i]);
    if (!a.octets_identiques) a.pixels = ecartPixels(d, r);
    const stockee = { dhash: l.dhash, phash: l.phash, couleur: l.couleur, variantes: canon(l.variantes) };
    const er = await decoderEmpreinte(r), ed = await decoderEmpreinte(d);
    const sig = (e: typeof er) => ({ dhash: e.dhash, phash: e.phash, couleur: e.couleur, variantes: canon(e.variantes) });
    a.ref_conforme_base = canon(sig(er)) === canon(stockee);
    a.empreinte_identique = canon(sig(ed)) === canon(stockee);
    if (!a.empreinte_identique) {
      const h = (x: string, y: string) => [...x].filter((c, i) => c !== y[i]).length;
      a.ecart = { dhash: h(ed.dhash, String(l.dhash)), phash: h(ed.phash, String(l.phash)), couleur: ed.couleur === l.couleur ? 0 : 1, variantes: canon(ed.variantes) === stockee.variantes ? 0 : 1 };
    }
    a.dims = `${ed.largeur}×${ed.hauteur}`;
    n++;
    if (a.octets_identiques) octetsIdentiques++;
    if (a.empreinte_identique) empreintesIdentiques++;
    if (a.ref_conforme_base) refConforme++;
  } catch (e) {
    a.erreur = String((e as Error)?.message ?? e);
  }
  await Deno.writeTextFile(sortie, JSON.stringify(a) + "\n", { append: true });
}
console.log(JSON.stringify({ jeu, photos: n, octets_identiques: octetsIdentiques, empreintes_identiques: empreintesIdentiques,
  reference_conforme_a_la_base: refConforme, secondes: Math.round((performance.now() - t0) / 1000), memoire_libre_fin_go: +memoireLibreGo().toFixed(2) }));
Deno.exit(0);
