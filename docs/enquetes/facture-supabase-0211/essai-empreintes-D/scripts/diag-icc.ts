// Pour chaque photo à profil ICC d'un jeu : description du profil ; identique sans conversion ? avec conversion sRGB après réduction ?
import Vips from "../lib-wasm-vips-0.0.19/vips-es6.js";
const vips = await Vips({ dynamicLibraries: [] });
vips.concurrency(1);
const [jeu] = Deno.args;
const fin = (im: any) => { const c = im.copy(); for (const f of c.getFields()) if (/^(exif-|xmp-data|iptc-data|icc-profile-data|orientation)/.test(f)) c.remove(f); return c.writeToBuffer(".jpg", { Q: 80, interlace: true }); };
const desc = (icc: Uint8Array) => {
  const v = new DataView(icc.buffer, icc.byteOffset, icc.byteLength); const n = v.getUint32(128);
  for (let i = 0; i < n; i++) { const sig = v.getUint32(132 + 12 * i), off = v.getUint32(136 + 12 * i), len = v.getUint32(140 + 12 * i);
    if (sig === 0x64657363) { const t = new TextDecoder("latin1").decode(icc.slice(off, off + len)); 
      if (t.startsWith("desc")) return t.slice(12, 12 + v.getUint32(off + 8) - 1);
      if (t.startsWith("mluc")) { const o2 = v.getUint32(off + 20), l2 = v.getUint32(off + 16); return new TextDecoder("utf-16be").decode(icc.slice(off + o2, off + o2 + l2)); } } }
  return "?";
};
for await (const e of Deno.readDir(`donnees/${jeu}`)) {
  if (!e.name.endsWith(".o")) continue;
  const b = `donnees/${jeu}/${e.name.slice(0, -2)}`;
  const o = await Deno.readFile(b + ".o"), r = await Deno.readFile(b + ".r");
  const t = vips.Image.newFromBuffer(o);
  if (!t.getTypeof("icc-profile-data") || !/^jpegload/.test(t.getString("vips-loader"))) { t.delete(); continue; }
  const icc = t.getBlob("icc-profile-data");
  const W = t.width, H = t.height; const s = Math.min(1, 400 / Math.max(W, H));
  const pre = Math.min(W / Math.round(W * s), H / Math.round(H * s)); const js = pre >= 8 ? 8 : pre >= 4 ? 4 : pre >= 2 ? 2 : 1;
  const l = js > 1 ? vips.Image.newFromBuffer(o, "", { shrink: js }) : t;
  const ws = (W / l.width) * s, hs = (H / l.height) * s;
  const z = ws !== 1 || hs !== 1 ? l.resize(ws, { vscale: hs }) : l;
  const eq = (d: Uint8Array) => d.length === r.length && d.every((v, i) => v === r[i]);
  const sans = eq(fin(z)); let avec: boolean | string;
  try { avec = eq(fin(z.iccTransform("srgb", { embedded: true }))); } catch (err) { avec = "erreur " + String(err).slice(0, 60); }
  console.log(e.name.slice(0, 8), icc.byteLength, JSON.stringify(desc(icc)), "sans:", sans, "avec:", avec);
}
Deno.exit(0);
