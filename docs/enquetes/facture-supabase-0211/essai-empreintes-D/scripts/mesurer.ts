// ═══════════════════════════════════════════════════════════════════════════
// ESSAI D, étape 3 — temps et mémoire sur les PLUS GROSSES photos du bucket :
// démarrage de wasm-vips, puis par photo : reproduction (même pipeline que
// reproduire.ts, sans le contrôle de périmètre) + empreinte de la prod
// (decoderEmpreinte importé tel quel). Un seul processus ; arrêt sous 1,5 Go libres.
// Usage : deno run --allow-read --allow-net --allow-env --allow-sys mesurer.ts <dossier>
// ═══════════════════════════════════════════════════════════════════════════
const mo = () => Math.round(Deno.memoryUsage().rss / 2 ** 20);
const rss0 = mo();
let t = performance.now();
const { default: Vips } = await import("../lib-wasm-vips-0.0.19/vips-es6.js");
const vips = await Vips({ dynamicLibraries: [] });
vips.concurrency(1);
if (Deno.env.get("SANS_CACHE")) vips.Cache.max(0); // le cache d’opérations de libvips garde des images en vie
const initMs = Math.round(performance.now() - t);
const rssInit = mo();
const { decoderEmpreinte } = await import("file:///C:/Users/nicol/fill-and-sell/supabase/functions/_shared/empreinte-telechargement.ts");
await decoderEmpreinte(new Uint8Array(await Deno.readFile(`donnees/test/${[...Deno.readDirSync("donnees/test")].find((e) => e.name.endsWith(".r"))!.name}`)));
console.log(JSON.stringify({ rss_depart_mo: rss0, init_wasm_vips_ms: initMs, rss_apres_init_mo: rssInit, rss_apres_imagescript_mo: mo() }));

const echelle = (a: number, s: number) => Math.round(a * s);
// deno-lint-ignore no-explicit-any
function reproduire(buf: Uint8Array, a: Record<string, unknown>): Uint8Array {
  // deno-lint-ignore no-explicit-any
  const lib: any[] = []; const g = (im: any) => { lib.push(im); return im; };
  try {
    const tete = g(vips.Image.newFromBuffer(buf));
    const chargeur = tete.getString("vips-loader");
    a.format = chargeur.replace("load_buffer", ""); a.W = tete.width; a.H = tete.height; a.bandes = tete.bands; a.mpx = +(tete.width * tete.height / 1e6).toFixed(1);
    let s = 1 / Math.max(tete.width / 400, tete.height / 400); if (s > 1) s = 1;
    let im = tete, ws = s, hs = s;
    const pre = Math.min(tete.width / echelle(tete.width, s), tete.height / echelle(tete.height, s));
    const js = pre >= 8 ? 8 : pre >= 4 ? 4 : pre >= 2 ? 2 : 1;
    if (js > 1 && chargeur.startsWith("jpegload")) {
      im = g(vips.Image.newFromBuffer(buf, "", { shrink: js }));
      ws = (tete.width / im.width) * s; hs = (tete.height / im.height) * s;
    }
    a.js = js;
    if (ws !== 1 || hs !== 1) im = g(im.resize(ws, { vscale: hs }));
    if (im.getTypeof("icc-profile-data")) im = g(im.iccTransform("srgb", { embedded: true }));
    im = g(im.copy());
    for (const f of im.getFields()) if (/^(exif-|xmp-data|iptc-data|icc-profile-data|orientation)/.test(f)) im.remove(f);
    return chargeur.startsWith("pngload") ? im.writeToBuffer(".png", { filter: "all" }) : im.writeToBuffer(".jpg", { Q: 80, interlace: true });
  } finally { for (const x of lib.reverse()) { try { x.delete(); } catch { /* */ } } }
}

const [dossier] = Deno.args;
const res: Array<Record<string, unknown>> = [];
let rssMax = mo();
for (const e of [...Deno.readDirSync(dossier)].filter((e) => e.name.endsWith(".o")).sort((x, y) => x.name < y.name ? -1 : 1)) {
  const libre = Deno.systemMemoryInfo().free / 2 ** 30;
  if (libre < 1.5) { console.log(`ARRÊT : mémoire libre ${libre.toFixed(2)} Go`); break; }
  const buf = await Deno.readFile(`${dossier}/${e.name}`);
  const a: Record<string, unknown> = { octets: buf.length };
  try {
    t = performance.now();
    const d = reproduire(buf, a);
    a.reduction_ms = Math.round(performance.now() - t);
    t = performance.now();
    await decoderEmpreinte(d);
    a.empreinte_ms = Math.round(performance.now() - t);
    a.total_ms = (a.reduction_ms as number) + (a.empreinte_ms as number);
  } catch (err) { a.erreur = String((err as Error)?.message ?? err).slice(0, 160); }
  a.rss_mo = mo(); rssMax = Math.max(rssMax, a.rss_mo as number);
  a.vips_pointe_mo = +(vips.Stats.memHighwater() / 2 ** 20).toFixed(1); // pixels suivis par libvips (cumul : la pointe depuis le départ)
  res.push(a);
}
const parFormat: Record<string, unknown> = {};
for (const f of [...new Set(res.map((r) => r.format))]) {
  const l = res.filter((r) => r.format === f && r.total_ms != null);
  const ms = l.map((r) => r.total_ms as number).sort((x, y) => x - y);
  parFormat[String(f)] = { photos: l.length, mpx_max: Math.max(...l.map((r) => r.mpx as number)), octets_max: Math.max(...l.map((r) => r.octets as number)),
    ms_mediane: ms[ms.length >> 1], ms_max: ms.at(-1), erreurs: res.filter((r) => r.format === f && r.erreur).length };
}
console.log(JSON.stringify({ photos: res.length, rss_max_mo: rssMax, pointe_libvips_mo: Math.max(...res.map((r) => r.vips_pointe_mo as number)), memoire_wasm_mo: vips.HEAPU8 ? vips.HEAPU8.length / 2 ** 20 : "?", par_format: parFormat }));
console.log(JSON.stringify(res.sort((x, y) => (y.total_ms as number ?? 0) - (x.total_ms as number ?? 0)).slice(0, 5)));
Deno.exit(0);
