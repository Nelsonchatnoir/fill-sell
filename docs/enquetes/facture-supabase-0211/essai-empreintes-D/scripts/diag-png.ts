import Vips from "../lib-wasm-vips-0.0.19/vips-es6.js";
const vips = await Vips({ dynamicLibraries: [] });
vips.concurrency(1);
for (const b of Deno.args) {
  const o = await Deno.readFile(b + ".o"), r = await Deno.readFile(b + ".r");
  const t = vips.Image.newFromBuffer(o); const s = 400 / Math.max(t.width, t.height);
  const z = t.resize(s).copy(); for (const f of z.getFields()) if (/^(exif-|xmp-data|iptc-data|icc-profile-data|orientation)/.test(f)) z.remove(f);
  const eq = (d: Uint8Array) => d.length === r.length && d.every((v, i) => v === r[i]);
  const essais: Record<string, object> = { defaut: {}, all: { filter: "all" }, all_c6: { filter: "all", compression: 6 }, all_c9: { filter: "all", compression: 9 }, all_c7: { filter: "all", compression: 7 }, all_c8: { filter: "all", compression: 8 } };
  console.log(b.slice(-16), r.length, Object.entries(essais).map(([k, v]) => { const d = z.writeToBuffer(".png", v); return `${k}:${d.length}${eq(d) ? "=" : ""}`; }).join(" "));
}
Deno.exit(0);
