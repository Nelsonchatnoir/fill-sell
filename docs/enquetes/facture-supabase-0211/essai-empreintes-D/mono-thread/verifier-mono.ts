// ═══════════════════════════════════════════════════════════════════════════
// ESSAI D, UN SEUL THREAD — revérification locale sur les MÊMES 200 photos.
// Comme dans une fonction Supabase : ni Worker ni SharedArrayBuffer (retirés
// AVANT de charger le module). Pour chaque photo : octets reproduits == octets
// servis par Supabase ? empreinte (decoderEmpreinte de la prod, importé tel
// quel) == empreinte stockée en base ?
// Usage : deno run --allow-read --allow-net --allow-env --allow-sys verifier-mono.ts <dossier module> <dossier de travail> <jeu>
// ═══════════════════════════════════════════════════════════════════════════
// deno-lint-ignore no-explicit-any
const g = globalThis as any;
delete g.Worker;
delete g.SharedArrayBuffer;

const [dossierModule, travail, jeu] = Deno.args;
const { default: VipsMono } = await import(`file:///${dossierModule}/vips-mono.mjs`);
const { decoderEmpreinte } = await import("file:///C:/Users/nicol/fill-and-sell/supabase/functions/_shared/empreinte-telechargement.ts");

let t = performance.now();
const m = await VipsMono({ wasmBinary: await Deno.readFile(`${dossierModule}/vips-mono.wasm`) });
if (m._essai_init() !== 0) throw new Error("essai_init : " + m.UTF8ToString(m._essai_erreur()));
const demarrageMs = Math.round(performance.now() - t);
const memDepart = m.HEAPU8.length;

/** La transformation, dans le module : rend { code, octets, infos }. */
function reduire(o: Uint8Array) {
  const p = m._malloc(o.length);
  m.HEAPU8.set(o, p);
  const pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(4 * 8);
  try {
    const code = m._essai_reduire(p, o.length, pp, pl, pi);
    const infos = Array.from(m.HEAP32.subarray(pi >> 2, (pi >> 2) + 8));
    if (code !== 0) return { code, infos, erreur: code < 0 ? m.UTF8ToString(m._essai_erreur()) : "hors périmètre" };
    const q = m.HEAPU32[pp >> 2], n = m.HEAPU32[pl >> 2];
    const octets = m.HEAPU8.slice(q, q + n);
    m._essai_liberer(q);
    return { code, infos, octets };
  } finally {
    m._free(p); m._free(pp); m._free(pl); m._free(pi);
  }
}

const canon = (v: unknown): string => v && typeof v === "object" && !Array.isArray(v)
  ? "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}"
  : JSON.stringify(v);
const id = async (u: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(u))).slice(0, 8)]
  .map((b) => b.toString(16).padStart(2, "0")).join("");

const lignes: Array<Record<string, unknown>> = JSON.parse(await Deno.readTextFile(`${travail}/donnees/${jeu}.json`));
let n = 0, octetsId = 0, empId = 0, hors = 0, erreurs = 0;
const ms: number[] = [];
const ecarts: unknown[] = [];
for (const l of lignes) {
  if (Deno.systemMemoryInfo().free / 2 ** 30 < 1.5) { console.log("ARRÊT : mémoire libre sous 1,5 Go"); break; }
  const base = `${travail}/donnees/${jeu}/${await id(String(l.url))}`;
  const o = await Deno.readFile(base + ".o"), r = await Deno.readFile(base + ".r");
  t = performance.now();
  const res = reduire(o);
  ms.push(performance.now() - t);
  n++;
  if (res.code === 1) { hors++; continue; }
  if (res.code !== 0) { erreurs++; ecarts.push({ base: base.slice(-16), erreur: res.erreur }); continue; }
  const d = res.octets!;
  const memesOctets = d.length === r.length && d.every((v: number, i: number) => v === r[i]);
  if (memesOctets) octetsId++;
  const e = await decoderEmpreinte(d);
  const pareil = canon({ dhash: e.dhash, phash: e.phash, couleur: e.couleur, variantes: canon(e.variantes) })
    === canon({ dhash: l.dhash, phash: l.phash, couleur: l.couleur, variantes: canon(l.variantes) });
  if (pareil) empId++;
  else ecarts.push({ base: base.slice(-16), infos: res.infos, octets_identiques: memesOctets });
  if (!memesOctets && !res.infos[4]) ecarts.push({ base: base.slice(-16), jpeg_octets_differents: true, infos: res.infos });
}
ms.sort((a, b) => a - b);
console.log(JSON.stringify({
  jeu, photos: n, empreintes_identiques: empId, octets_identiques: octetsId, hors_perimetre: hors, erreurs,
  demarrage_ms: demarrageMs, memoire_wasm_depart_mo: +(memDepart / 2 ** 20).toFixed(1), memoire_wasm_fin_mo: +(m.HEAPU8.length / 2 ** 20).toFixed(1),
  pointe_libvips_mo: +(m._essai_pointe_libvips() / 2 ** 20).toFixed(1),
  ms_mediane: Math.round(ms[ms.length >> 1]), ms_max: Math.round(ms.at(-1)!),
  sans_worker: typeof g.Worker === "undefined", sans_sab: typeof g.SharedArrayBuffer === "undefined",
}));
for (const e of ecarts.slice(0, 10)) console.log(JSON.stringify(e));
Deno.exit(0);
