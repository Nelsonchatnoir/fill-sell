// Images SYNTHÉTIQUES (aucune photo client) + sortie attendue par le pipeline de l'essai D avec wasm-vips 0.0.19 à threads.
import Vips from "file:///C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-fill-and-sell/e61879de-d10e-46a7-8e7f-06cb99d1641b/scratchpad/essaiD/lib-wasm-vips-0.0.19/vips-es6.js";
const vips = await Vips({ dynamicLibraries: [] }); vips.concurrency(1);
const D = "C:/Users/nicol/fill-and-sell/scripts/fixtures/essai-d-mono";
const motif = (w: number, h: number) => {
  const xyz = vips.Image.xyz(w, h);
  const x = xyz.extractBand(0), y = xyz.extractBand(1);
  const r = x.multiply(255 / w), g = y.multiply(255 / h), b = x.add(y).multiply(0.37).sin().multiply(120).add(128);
  return r.bandjoin([g, b]).cast("uchar").copy({ interpretation: "srgb" });
};
const a = motif(1600, 1200).writeToBuffer(".jpg", { Q: 92 });
const b = motif(1366, 1024).writeToBuffer(".jpg", { Q: 92 });
const c = motif(120, 90).bandjoin(255).copy({ interpretation: "srgb" }).writeToBuffer(".png");
await Deno.writeFile(`${D}/a-1600x1200.jpg`, a); await Deno.writeFile(`${D}/b-1366x1024.jpg`, b); await Deno.writeFile(`${D}/c-120x90-alpha.png`, c);
const reproduire = (buf: Uint8Array) => {
  const t = vips.Image.newFromBuffer(buf); const W = t.width, H = t.height;
  let s = 1 / Math.max(W / 400, H / 400); if (s > 1) s = 1;
  const pre = Math.min(W / Math.round(W * s), H / Math.round(H * s)); const js = pre >= 8 ? 8 : pre >= 4 ? 4 : pre >= 2 ? 2 : 1;
  let im = t, ws = s, hs = s;
  if (js > 1) { im = vips.Image.newFromBuffer(buf, "", { shrink: js }); ws = (W / im.width) * s; hs = (H / im.height) * s; }
  if (ws !== 1 || hs !== 1) im = im.resize(ws, { vscale: hs });
  if (im.getTypeof("icc-profile-data")) im = im.iccTransform("srgb", { embedded: true });
  im = im.copy(); for (const f of im.getFields()) if (/^(exif-|xmp-data|iptc-data|icc-profile-data|orientation)/.test(f)) im.remove(f);
  return im.writeToBuffer(".jpg", { Q: 80, interlace: true });
};
const hex = async (x: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", x))].map((v) => v.toString(16).padStart(2, "0")).join("");
console.log(JSON.stringify({ a: await hex(reproduire(a)), b: await hex(reproduire(b)), tailles: [a.length, b.length, c.length] }));
Deno.exit(0);
