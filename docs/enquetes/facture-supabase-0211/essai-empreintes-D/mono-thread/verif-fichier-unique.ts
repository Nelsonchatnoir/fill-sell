// La variante « fichier unique » (celle de la fonction) rend-elle les mêmes octets que Supabase ? 20 photos du test.
const g = globalThis as any; delete g.Worker; delete g.SharedArrayBuffer;
const [travail] = Deno.args;
const { default: VipsMono } = await import("file:///C:/Users/nicol/fill-and-sell/supabase/functions/essai-empreintes-d-test/vips-mono.mjs");
const m = await VipsMono(); if (m._essai_init() !== 0) throw new Error("init");
const L = JSON.parse(await Deno.readTextFile(`${travail}/donnees/test.json`)).slice(0, 20);
const id = async (u: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(u))).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
let ok = 0;
for (const l of L) {
  const b = `${travail}/donnees/test/${await id(l.url)}`; const o = await Deno.readFile(b + ".o"), r = await Deno.readFile(b + ".r");
  const p = m._malloc(o.length); m.HEAPU8.set(o, p); const pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(32);
  const c = m._essai_reduire(p, o.length, pp, pl, pi); const q = m.HEAPU32[pp >> 2], n = m.HEAPU32[pl >> 2];
  const d = m.HEAPU8.slice(q, q + n); m._essai_liberer(q); m._free(p); m._free(pp); m._free(pl); m._free(pi);
  if (c === 0 && d.length === r.length && d.every((v: number, i: number) => v === r[i])) ok++;
}
console.log("fichier unique : octets identiques", ok, "/", L.length);
Deno.exit(0);
