// Gros JPEG : sha256 de la fonction == sha256 du module local (même binaire, sur l'originale déjà téléchargée) ?
const g = globalThis as any; delete g.Worker; delete g.SharedArrayBuffer;
const [travail] = Deno.args;
const { default: VipsMono } = await import("file:///C:/Users/nicol/wvst/module/vips-mono.mjs");
const m = await VipsMono({ wasmBinary: await Deno.readFile("C:/Users/nicol/wvst/module/vips-mono.wasm") }); m._essai_init();
const F = JSON.parse(await Deno.readTextFile(`${travail}/donnees/gros-jpeg-fonction.json`));
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const id = async (u: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(u))).slice(0, 16);
let ok = 0;
for (const f of F) {
  const o = await Deno.readFile(`${travail}/donnees/gros/${await id(f.url)}.o`);
  const p = m._malloc(o.length); m.HEAPU8.set(o, p); const pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(32);
  m._essai_reduire(p, o.length, pp, pl, pi); const q = m.HEAPU32[pp >> 2], n = m.HEAPU32[pl >> 2];
  if (hex(await crypto.subtle.digest("SHA-256", m.HEAPU8.slice(q, q + n))) === f.sha256) ok++;
  m._essai_liberer(q); m._free(p); m._free(pp); m._free(pl); m._free(pi);
}
console.log("gros JPEG : fonction == module local", ok, "/", F.length);
Deno.exit(0);
