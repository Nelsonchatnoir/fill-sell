// selftest:empreintes-maison — (03/11) empreintes-urls réduit les photos de NOTRE
// bucket avec libvips sur un seul thread (_shared/empreinte-maison.ts) au lieu de
// la transformation de Supabase (≈ 235 à 390 $ par cycle), même empreinte au bit près
// (essai D : 200/200 local, 12/12 dans une fonction). Ce test fige :
//   1. le module : celui de l'essai D, octet pour octet ; ni Worker ni SharedArrayBuffer ;
//   2. le périmètre prouvé, lu dans l'en-tête : JPEG 8 bits 3 composantes complet, PNG RVB
//      8 bits sans transparence ni profil ni entrelacement complet, réduit, ≤ 2 560 px ;
//   3. la même empreinte que sur les octets de l'oracle (wasm-vips 0.0.19 à threads, prouvé
//      identique à Supabase) ; hors périmètre, erreur, manque de temps : Repli (→ Supabase),
//      jamais une empreinte ; une remise reste une remise ;
//   4. empreintes-urls : interrupteur coin_config (1 = maison, sinon Supabase), 5 URL par appel,
//      les suivantes remises, tout repli calculé chez Supabase comme avant, source tracée ;
//   5. le chemin Supabase (doublons-balayage, photo-empreinte, empreinterUrl) inchangé.
//
//   npm run selftest:empreintes-maison
import {
  BUDGET_CALCUL_MS, calculMaison, CLE_MOTEUR_MAISON, COTE_MAX, empreinterOctetsMaison, perimetre, Repli, SOURCE_MAISON,
} from "../supabase/functions/_shared/empreinte-maison.ts";
import { budgetDecodage, DecodageRemis, decoderEmpreinte } from "../supabase/functions/_shared/empreinte-telechargement.ts";

let n = 0, ko = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { n++; console.log(`  ✓ ${msg}`); } else { ko++; console.error(`  ✗ ${msg}`); } };
const racine = new URL("../", import.meta.url);
const lire = (p: string) => Deno.readTextFileSync(new URL(p, racine)).replace(/\r\n/g, "\n");
const git = (ref: string, p: string) => new TextDecoder().decode(
  new Deno.Command("git", { args: ["show", `${ref}:${p}`], cwd: racine, stdout: "piped" }).outputSync().stdout).replace(/\r\n/g, "\n");
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
const F = (f: string) => Deno.readFileSync(new URL(`scripts/fixtures/essai-d-mono/${f}`, racine));
const repli = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e; } };

// ── PNG synthétiques (aucune photo client) ─────────────────────────────────
const CRC = new Uint32Array(256).map((_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloc = (type: string, data: Uint8Array) => {
  const t = new TextEncoder().encode(type), o = new Uint8Array(12 + data.length), v = new DataView(o.buffer);
  v.setUint32(0, data.length); o.set(t, 4); o.set(data, 8); v.setUint32(8 + data.length, crc32(o.subarray(4, 8 + data.length)));
  return o;
};
const zlib = async (b: Uint8Array) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
async function png(w: number, h: number, { couleur = 2, entrelace = 0, avant = [] as Uint8Array[] } = {}) {
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h); ihdr[8] = 8; ihdr[9] = couleur; ihdr[12] = entrelace;
  const brut = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (1 + w * 3) + 1 + x * 3;
    brut[i] = (x * 255 / w) | 0; brut[i + 1] = (y * 255 / h) | 0; brut[i + 2] = ((x + y) * 3) & 255;
  }
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc("IHDR", ihdr), ...avant,
    bloc("IDAT", await zlib(brut)), bloc("IEND", new Uint8Array())];
  const o = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let k = 0; for (const p of parts) { o.set(p, k); k += p.length; }
  return o;
}
/** Un JPEG dont l'en-tête annonce (largeur, hauteur, composantes, trame) — pour le périmètre seulement. */
const entete = (w: number, h: number, comp = 3, sof = 0xc0, bits = 8) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
  0xff, sof, 0x00, 0x11, bits, h >> 8, h & 255, w >> 8, w & 255, comp, 0x01, 0x22, 0x00, 0xff, 0xd9]);

// ── 1. Le module ───────────────────────────────────────────────────────────
console.log("1. Le module : celui de l'essai D, sur un seul thread");
const fichier = Deno.readFileSync(new URL("supabase/functions/_shared/vips-mono/vips-mono.mjs", racine));
ok(await hex(fichier) === "93fde86d6d45b273843f899968449d98b27a03425c16b2c5d201ea1348e46711",
  "vips-mono.mjs : octet pour octet celui de essai-empreintes-d-test (12/12 identiques dans une fonction)");
const texte = new TextDecoder("latin1").decode(fichier);
ok(!/new Worker|SharedArrayBuffer/.test(texte), "ni Web Worker ni SharedArrayBuffer");
ok(/import VipsMono from "\.\/vips-mono\/vips-mono\.mjs";/.test(lire("supabase/functions/_shared/empreinte-maison.ts")), "empreinte-maison.ts charge ce module-là");

// ── 2. Le périmètre ────────────────────────────────────────────────────────
console.log("2. Le périmètre prouvé, lu dans l'en-tête");
const a = F("a-1600x1200.jpg"), b = F("b-1366x1024.jpg"), c = F("c-120x90-alpha.png");
const motif = (o: Uint8Array) => { const p = perimetre(o); return "motif" in p ? p.motif : ""; };
ok(JSON.stringify(perimetre(a)) === JSON.stringify({ largeur: 1600, hauteur: 1200 }) && !motif(b), "JPEG 1600×1200 et 1366×1024 : dans le périmètre");
ok(/PNG : profondeur 8, couleur 6/.test(motif(c)), "PNG à transparence (RVBA) : Supabase");
const pngRvb = await png(640, 480);
ok(JSON.stringify(perimetre(pngRvb)) === JSON.stringify({ largeur: 640, hauteur: 480 }), "PNG RVB 8 bits, complet : dans le périmètre");
ok(motif(await png(640, 480, { avant: [bloc("tRNS", new Uint8Array(6))] })) === "PNG à transparence", "PNG RVB avec couleur transparente (tRNS) : Supabase");
ok(motif(await png(640, 480, { avant: [bloc("iCCP", new Uint8Array(8))] })) === "PNG avec profil", "PNG avec profil ICC : Supabase");
ok(motif(await png(640, 480, { entrelace: 1 })) === "PNG entrelacé", "PNG entrelacé : Supabase");
ok(/couleur 0/.test(motif(await png(640, 480, { couleur: 0 }))), "PNG gris : Supabase");
ok(motif(pngRvb.slice(0, pngRvb.length - 12)) === "PNG : fin de fichier absente", "PNG tronqué : Supabase");
ok(motif(a.slice(0, a.length - 100)) === "JPEG : fin de fichier absente", "JPEG tronqué : Supabase");
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
ok(/ni JPEG ni PNG/.test(motif(webp)) && /ni JPEG ni PNG/.test(motif(new Uint8Array([1, 2, 3]))), "WebP, octets inconnus : Supabase");
ok(!motif(entete(COTE_MAX, COTE_MAX)) && /très grande image/.test(motif(entete(COTE_MAX + 1, 1000))), `très grande image (> ${COTE_MAX} px) : Supabase`);
ok(/sans réduction \(400×300\)/.test(motif(entete(400, 300))) && !motif(entete(401, 300)), "image sans réduction (≤ 400 px) : Supabase");
ok(/1 composante/.test(motif(entete(800, 600, 1))) && /4 composante/.test(motif(entete(800, 600, 4))), "JPEG gris, JPEG CMJN : Supabase");
ok(/12 bits/.test(motif(entete(800, 600, 3, 0xc0, 12))) && /trame c3/.test(motif(entete(800, 600, 3, 0xc3))) && /trame c9/.test(motif(entete(800, 600, 3, 0xc9))),
  "JPEG 12 bits, sans perte, arithmétique : Supabase");
ok(!motif(entete(800, 600, 3, 0xc1)) && !motif(entete(800, 600, 3, 0xc2)), "JPEG séquentiel étendu et progressif : dans le périmètre");

// ── 3. Les empreintes ──────────────────────────────────────────────────────
console.log("3. La même empreinte que sur les octets de Supabase ; sinon Repli");
// L'oracle : les octets de wasm-vips 0.0.19 à threads (pipeline prouvé identique à Supabase, 200/200).
const { default: VipsMono } = await import("../supabase/functions/_shared/vips-mono/vips-mono.mjs");
// deno-lint-ignore no-explicit-any
const m: any = await VipsMono();
ok(m._essai_init() === 0, "le module démarre");
const reduire = (o: Uint8Array) => {
  const p = m._malloc(o.length), pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(32);
  m.HEAPU8.set(o, p);
  const code = m._essai_reduire(p, o.length, pp, pl, pi);
  const q = m.HEAPU32[pp >> 2], k = m.HEAPU32[pl >> 2];
  const octets = code === 0 ? m.HEAPU8.slice(q, q + k) as Uint8Array : null;
  if (code === 0) m._essai_liberer(q);
  m._free(p); m._free(pp); m._free(pl); m._free(pi);
  return { code, octets };
};
const ra = reduire(a), rb = reduire(b);
ok(await hex(ra.octets!) === "861d3d5825e32726cf18fa5db0c29097dec1858d70c98f2b6ac98e971eedb91f"
  && await hex(rb.octets!) === "e3c8c726e6dc1c4337c2d30e0d6605fd7ef09a92497c02a7838c37f7f1f4868c", "réduites A et B : octets identiques à l'oracle");
const ea = await empreinterOctetsMaison(a, budgetDecodage(1_000), calculMaison());
const eb = await empreinterOctetsMaison(b, budgetDecodage(1_000), calculMaison());
ok(JSON.stringify(ea) === JSON.stringify(await decoderEmpreinte(ra.octets!)) && JSON.stringify(eb) === JSON.stringify(await decoderEmpreinte(rb.octets!)),
  "empreinte maison = empreinte de la prod sur les octets de l'oracle, au bit près (dHash, pHash, couleur, variantes, taille)");
ok(ea.largeur === 400 && ea.hauteur === 300 && eb.largeur === 400 && eb.hauteur === 300, "réduites de 400 px au grand côté (« fit »)");
const ep = await empreinterOctetsMaison(pngRvb, budgetDecodage(1_000), calculMaison());
ok(ep.largeur === 400 && ep.hauteur === 300 && typeof ep.dhash === "string", "PNG RVB : réduit et empreinté (PNG)");
const calcul = calculMaison();
await empreinterOctetsMaison(a, budgetDecodage(1_000), calcul);
ok(calcul.reductions === 1 && calcul.ms > 0 && calcul.pixels === 1600 * 1200, "le temps du module est mesuré (réductions, ms, pixels)");
let r = await repli(empreinterOctetsMaison(c, budgetDecodage(1_000), calculMaison()));
ok(r instanceof Repli && r.categorie === "perimetre", "PNG à transparence → Repli (périmètre), aucune empreinte");
r = await repli(empreinterOctetsMaison(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), budgetDecodage(1_000), calculMaison()));
ok(r instanceof Repli, "octets illisibles → Repli, aucune empreinte");
r = await repli(empreinterOctetsMaison(entete(800, 600), budgetDecodage(1_000), calculMaison()));
ok(r instanceof Repli && r.categorie === "module", "en-tête correct mais image illisible : le module répond « erreur » → Repli");
r = await repli(empreinterOctetsMaison(a, budgetDecodage(1_000), { ms: BUDGET_CALCUL_MS - 50, pixels: 1_000, reductions: 1, lent: false }));
ok(r instanceof Repli && r.categorie === "temps", "temps de l'appel bientôt atteint → Repli (la photo part chez Supabase)");
r = await repli(empreinterOctetsMaison(a, budgetDecodage(1_000), { ...calculMaison(), lent: true }));
ok(r instanceof Repli && r.categorie === "temps", "après une réduction lente, le module n'est plus utilisé dans l'appel → Repli");
const epuise = budgetDecodage(1_000);
epuise.decodages = 1; epuise.consommeMs = 1; epuise.pixels = 1; // 1 ms par pixel : le décodage de 120 000 px n'entre plus
r = await repli(empreinterOctetsMaison(a, epuise, calculMaison()));
ok(r instanceof DecodageRemis, "budget de décodage atteint : remise (jamais un échec, jamais une empreinte)");

// ── 4. empreintes-urls ─────────────────────────────────────────────────────
console.log("4. empreintes-urls : interrupteur, 5 URL, repli chez Supabase");
const f = lire("supabase/functions/empreintes-urls/index.ts");
ok(CLE_MOTEUR_MAISON === "empreintes_moteur_maison" && /admin\.from\("coin_config"\)\.select\("value"\)\.eq\("key", CLE_MOTEUR_MAISON\)\.maybeSingle\(\)/.test(f),
  "interrupteur relu dans coin_config à chaque appel (empreintes_moteur_maison)");
ok(/const maison = !eMoteur && Number\(\(moteur as \{ value\?: unknown \} \| null\)\?\.value\) === 1;/.test(f), "1 = maison ; 0, absente ou illisible = Supabase");
ok(/const MAX_URLS = 5;/.test(f) && /const urls = recues\.slice\(0, MAX_URLS\);/.test(f) && /let restantes = recues\.length - urls\.length;/.test(f),
  "5 URL par appel ; les suivantes comptées « restantes » (redemandées par l'appelant)");
ok(/if \(maison && bucket\) \{/.test(f) && /const bucket = urlTransformee\(url, supabaseUrl\) !== null;/.test(f), "le module ne voit que les photos de notre bucket");
const iMaison = f.indexOf("e = await empreinterMaison(url, decodage, calcul);");
const iRemise = f.indexOf("if (err instanceof DecodageRemis) throw err;", iMaison);
const iSupa = f.indexOf("if (!e) e = await empreinterUrl(url, supabaseUrl, decodage);");
ok(iMaison > 0 && iRemise > iMaison && iSupa > iRemise && f.indexOf("echecs.push", iMaison) > iSupa,
  "tout repli du module (sauf une remise) repart chez Supabase AVANT toute écriture d'échec");
ok(/source: parLeModule \? SOURCE_MAISON : "empreintes-urls"/.test(f) && SOURCE_MAISON === "empreintes-urls:maison", "photo_empreintes.source trace le moteur");
ok(/moteur: maison \? "maison" : "supabase", par_maison: parMaison, par_supabase: parSupabase/.test(f), "la réponse et le journal disent le moteur et la part de chacun");

// ── 5. Le chemin Supabase inchangé ─────────────────────────────────────────
console.log("5. Le chemin Supabase, inchangé");
for (const p of [
  "supabase/functions/_shared/empreinte-telechargement.ts",
  "supabase/functions/_shared/empreinte-image.ts",
  "supabase/functions/photo-empreinte/index.ts",
  "supabase/functions/doublons-balayage/index.ts",
]) ok(lire(p) === git("2526250", p), `${p} : identique à 2526250`);
ok(/const reduite = urlTransformee\(url, supabaseUrl\);/.test(lire("supabase/functions/_shared/empreinte-telechargement.ts")),
  "empreinterUrl passe toujours par la transformation de Supabase (le filet)");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n + ko}` : `\n✓ empreintes maison : ${n} vérifications vertes`);
Deno.exit(ko ? 1 : 0);
