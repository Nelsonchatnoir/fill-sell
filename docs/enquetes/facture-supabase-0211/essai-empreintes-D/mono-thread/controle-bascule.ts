// Contrôle après la bascule (03/11) : des empreintes faites par le module EN PROD (photo_empreintes.source =
// 'empreintes-urls:maison') comparées à ce que Supabase aurait produit — la version réduite servie par la
// transformation (mêmes paramètres, même Accept que la prod : urlTransformee + telecharger), empreintée par le
// module de la prod (decoderEmpreinte). En plus : les octets du module local = les octets de Supabase ?
// Entrée : un JSON HORS dépôt (url, dhash, phash, couleur, largeur, hauteur, variantes), 20 lignes au plus.
// Rien n'est écrit en base ni sur le disque (photos en mémoire seulement).
//   deno run --allow-read --allow-net controle-bascule.ts <lignes.json>
import { decoderEmpreinte, telecharger, urlTransformee } from "../../../../../supabase/functions/_shared/empreinte-telechargement.ts";

const SUPABASE_URL = "https://tojihnuawsoohlolangc.supabase.co";
const lignes = JSON.parse(await Deno.readTextFile(Deno.args[0])).slice(0, 20);
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
const { default: VipsMono } = await import("../../../../../supabase/functions/_shared/vips-mono/vips-mono.mjs");
// deno-lint-ignore no-explicit-any
const m: any = await VipsMono();
if (m._essai_init() !== 0) throw new Error("module");
const reduire = (o: Uint8Array) => {
  const p = m._malloc(o.length), pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(32);
  m.HEAPU8.set(o, p);
  const code = m._essai_reduire(p, o.length, pp, pl, pi);
  const q = m.HEAPU32[pp >> 2], k = m.HEAPU32[pl >> 2];
  const octets = code === 0 ? m.HEAPU8.slice(q, q + k) as Uint8Array : null;
  if (code === 0) m._essai_liberer(q);
  m._free(p); m._free(pp); m._free(pl); m._free(pi);
  return octets;
};
// jsonb range les clés à sa façon : on compare clés triées.
const canon = (v: unknown): unknown => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
const memes = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
let identiques = 0, octetsIdentiques = 0;
const ecarts: string[] = [];
for (const [i, l] of lignes.entries()) {
  const supa = await telecharger(urlTransformee(l.url, SUPABASE_URL)!);
  const e = await decoderEmpreinte(supa);
  const champs = ["dhash", "phash", "couleur", "largeur", "hauteur", "variantes"].filter((c) => !memes((e as Record<string, unknown>)[c], l[c]));
  if (!champs.length) identiques++; else ecarts.push(`#${i + 1} : ${champs.join(", ")}`);
  const local = reduire(await telecharger(l.url));
  if (local && await hex(local) === await hex(supa)) octetsIdentiques++;
}
console.log(JSON.stringify({ photos: lignes.length, empreintes_identiques: identiques, octets_identiques: octetsIdentiques, ecarts }));
Deno.exit(0);
