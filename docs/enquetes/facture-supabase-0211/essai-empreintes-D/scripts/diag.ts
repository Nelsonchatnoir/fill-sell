// Diagnostic d'une photo : profil ICC et variantes du pipeline.
import Vips from "../lib-wasm-vips-0.0.19/vips-es6.js";
const vips = await Vips({ dynamicLibraries: [] });
vips.concurrency(1);
const [b] = Deno.args;
const o = await Deno.readFile(b + ".o"), r = await Deno.readFile(b + ".r");
const t = vips.Image.newFromBuffer(o);
const icc = t.getTypeof("icc-profile-data") ? t.getBlob("icc-profile-data") : null;
if (icc) { const s = new TextDecoder("latin1").decode(icc); console.log("ICC", icc.byteLength, "o", JSON.stringify(s.slice(0, 128).replace(/[^\x20-\x7e]/g, ".")), "desc:", (s.match(/desc[\s\S]{0,80}/) || [""])[0].replace(/[^\x20-\x7e]/g, ".")); }
const eq = (d: Uint8Array) => d.length === r.length && d.every((v, i) => v === r[i]);
const fin = (im: any) => { const c = im.copy(); for (const f of c.getFields()) if (/^(exif-|xmp-data|iptc-data|icc-profile-data|orientation)/.test(f)) c.remove(f); return c.writeToBuffer(".jpg", { Q: 80, interlace: true }); };
const W = t.width, H = t.height, s = 400 / Math.max(W, H);
const l2 = vips.Image.newFromBuffer(o, "", { shrink: 2 });
const ws = (W / l2.width) * s, hs = (H / l2.height) * s;
const essais: Record<string, () => any> = {
  base: () => l2.resize(ws, { vscale: hs }),
  icc_avant: () => l2.iccTransform("srgb", { embedded: true }).resize(ws, { vscale: hs }),
  icc_apres: () => l2.resize(ws, { vscale: hs }).iccTransform("srgb", { embedded: true }),
  icc_import_export_avant: () => l2.iccImport({ embedded: true, pcs: "xyz" }).resize(ws, { vscale: hs }).iccExport({ output_profile: "srgb" }),
  icc_import_avant_export_apres_lab: () => l2.iccImport({ embedded: true }).resize(ws, { vscale: hs }).iccExport({ output_profile: "srgb" }),
  egal: () => l2.resize(s * W / l2.width),
};
for (const [k, f] of Object.entries(essais)) { try { const d = fin(f()); console.log(k, d.length, r.length, eq(d)); } catch (e) { console.log(k, "erreur", String(e).slice(0, 120)); } }
Deno.exit(0);
