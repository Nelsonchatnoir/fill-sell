// Selftest VERROU — la retouche photo OpenAI : modèle, repli, coût (14/11/2026, lot de Nico, point 2).
//   npm run selftest:retouche-modele
// Le banc du 14/11 (10 vraies photos des comptes de Nico et d'Ornella) : gpt-image-2 = gpt-image-2.5-flare =
// gpt-image-2.5-sunburst = 0,0171 $ la photo ; la famille 2.6 = 0,0360 $. Aucun modèle moins cher à qualité égale :
// gpt-image-2 reste le principal. Garde-fous de Nico : la retouche ne tombe jamais en panne (repli sur un modèle encore
// en service, jamais d'erreur au client) ; le coût par retouche ne dépasse jamais celui d'aujourd'hui ; le nom du modèle
// est écrit dans chaque ligne photo_retouche. Ce test casse si l'un d'eux revient en arrière.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import * as R from "../supabase/functions/_shared/retouche-photo.ts";

let n = 0;
const cas = async (nom: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const lire = (p: string) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url)).replace(/\r\n/g, "\n");
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
console.log("retouche-modele-selftest");

await cas("les prompts sont ceux d'avant, à l'octet près (déplacés de generate-listing, jamais réécrits)", async () => {
  assertEquals(await sha(R.PROMPT_RETOUCHE_LEGERE), "4ff627684221ccdff0df5d81c23791fe68ca63b055d9cd8a8aa3abb70ccc4e80");
  assertEquals(await sha(R.CLAUSE_FOND_OBJET), "a655d717d2487ec854d9b1abcac6c76a016703220cabce246bfec8918afddc47");
  assertEquals(await sha(R.CLAUSE_FOND_VETEMENT), "c00cf8b42c6be2949a4575099eef45574fadff6ac1457b92f23ed88aca070ab7");
  assertEquals(await sha(JSON.stringify(R.FONDS_RETOUCHE)), "304372894bca4bd17315b54ac58767712296076c2fd072c92a51d16ff5d09925");
});

await cas("la chaîne : gpt-image-2 d'abord (inchangé), puis gpt-image-2.5-flare ; jamais la famille 2.6 (2× plus chère)", () => {
  assertEquals([...R.CHAINE_RETOUCHE], ["gpt-image-2", "gpt-image-2.5-flare"]);
  assert(R.CHAINE_RETOUCHE.every((m) => !m.startsWith("gpt-image-2.6")));
  assertEquals(R.REGLAGES_MODELE["gpt-image-2"]?.complexity, undefined);
  assertEquals(R.REGLAGES_MODELE["gpt-image-2.5-flare"]?.complexity, undefined);
});

await cas("jamais plus cher : chaque modèle de la chaîne a un tarif ≤ celui de gpt-image-2, poste par poste", () => {
  const ref = R.TARIFS_IMAGE_USD_PAR_MTOK["gpt-image-2"];
  assertEquals(ref, { texteEntree: 5, imageEntree: 8, sortie: 30 });
  for (const m of R.CHAINE_RETOUCHE) {
    const t = R.TARIFS_IMAGE_USD_PAR_MTOK[m];
    assert(t && t.texteEntree <= ref.texteEntree && t.imageEntree <= ref.imageEntree && t.sortie <= ref.sortie, m);
  }
  // Les jetons mesurés au banc (moyenne d'une photo) → 0,0171 $, comme la prod (0,0162 $ la photo sur 30 jours).
  const c = R.coutImageUsd("gpt-image-2", { texte: 164, image: 1297, sortie: 196 });
  assert(Math.abs(c - 0.017076) < 1e-6, String(c));
  assertEquals(R.coutImageUsd("gpt-image-2.5-flare", { texte: 164, image: 1297, sortie: 196 }), c);
});

await cas("les dates d'arrêt OpenAI : la retouche n'appelle jamais un modèle arrêté, et ne s'arrête jamais", () => {
  assertEquals(R.ARRETS_MODELES["gpt-image-2"], "2027-02-10");
  for (const m of ["gpt-image-1-mini", "gpt-image-1.5", "chatgpt-image-latest"]) assertEquals(R.ARRETS_MODELES[m], "2026-12-01");
  const a = (iso: string) => R.modelesEnService(R.CHAINE_RETOUCHE, new Date(iso));
  assertEquals(a("2026-11-14T20:00:00Z"), ["gpt-image-2", "gpt-image-2.5-flare"]);
  assertEquals(a("2026-12-01T10:00:00Z"), ["gpt-image-2", "gpt-image-2.5-flare"], "le 01/12 ne touche pas la chaîne");
  assertEquals(a("2027-02-09T22:30:00Z"), ["gpt-image-2", "gpt-image-2.5-flare"], "le 09/02 à 23:30 de Paris : encore là");
  assertEquals(a("2027-02-09T23:30:00Z"), ["gpt-image-2.5-flare"], "le 10/02 à 00:30 de Paris : gpt-image-2 sort seul");
  assertEquals(R.modelesEnService(["gpt-image-1.5", "gpt-image-2"], new Date("2026-12-01T00:00:00Z")), ["gpt-image-2"]);
  // Aucun modèle de la chaîne ne s'arrête sans successeur : le dernier n'a pas de date d'arrêt connue.
  assertEquals(R.ARRETS_MODELES[R.CHAINE_RETOUCHE[R.CHAINE_RETOUCHE.length - 1]], undefined);
});

// Faux OpenAI : une réponse par modèle, les formulaires reçus gardés.
type Rep = { status: number; corps: unknown };
function fauxOpenai(reponses: Record<string, Rep | "lever" | "abandon">) {
  const recus: Array<Record<string, string>> = [];
  const fetchFn = (async (_u: string, init?: RequestInit) => {
    const form = init?.body as FormData;
    const champs: Record<string, string> = {};
    for (const [k, v] of form.entries()) champs[k] = typeof v === "string" ? v : `<fichier ${(v as File).name}>`;
    recus.push(champs);
    const r = reponses[champs.model];
    if (r === "lever") throw new TypeError("connexion coupée");
    if (r === "abandon") { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    return new Response(typeof r.corps === "string" ? r.corps : JSON.stringify(r.corps), { status: r.status });
  }) as typeof fetch;
  return { recus, fetchFn };
}
const IMAGE = { status: 200, corps: { data: [{ b64_json: "QUJD" }], usage: { input_tokens: 1461, output_tokens: 196, input_tokens_details: { text_tokens: 164, image_tokens: 1297 } } } };
const base = { cle: "k", blob: new Blob([new Uint8Array([1, 2, 3])]), prompt: "P", qualite: "low", taille: "1024x1024" };

await cas("le cas normal : UN appel, gpt-image-2, les réglages d'aujourd'hui, les jetons facturés lus", async () => {
  const f = fauxOpenai({ "gpt-image-2": IMAGE });
  const r = await R.retoucherPhoto({ ...base, prompt: R.PROMPT_RETOUCHE_LEGERE, fetchFn: f.fetchFn });
  assert(r.ok);
  assertEquals(r.modele, "gpt-image-2");
  assertEquals(r.usage, { texte: 164, image: 1297, sortie: 196 });
  assertEquals(f.recus, [{ model: "gpt-image-2", prompt: R.PROMPT_RETOUCHE_LEGERE, n: "1", size: "1024x1024", quality: "low", "image[]": "<fichier product.jpg>" }]);
});

await cas("modèle refusé ou arrêté (404, 400 « model ») ou panne (500, 429) : le repli gpt-image-2.5-flare rend la photo", async () => {
  for (const echec of [
    { status: 404, corps: { error: { code: "model_not_found", message: "The model gpt-image-2 does not exist" } } },
    { status: 400, corps: { error: { message: "The model gpt-image-2 has been deprecated and shut down." } } },
    { status: 500, corps: "erreur interne" },
    { status: 429, corps: { error: { code: "rate_limit_exceeded" } } },
  ]) {
    const vus: string[] = [];
    const f = fauxOpenai({ "gpt-image-2": echec, "gpt-image-2.5-flare": IMAGE });
    const r = await R.retoucherPhoto({ ...base, fetchFn: f.fetchFn, surEchec: ({ modele, http }) => { vus.push(`${modele}:${http}`); } });
    assert(r.ok, `repli après ${echec.status}`);
    assertEquals(r.modele, "gpt-image-2.5-flare");
    assertEquals(r.essais.map((e) => e.modele), ["gpt-image-2", "gpt-image-2.5-flare"]);
    assertEquals(vus, [`gpt-image-2:${echec.status}`], "l'échec est noté pour l'ops-digest");
    assert(!("complexity" in f.recus[1]), "le repli part avec les mêmes réglages");
    assertEquals(f.recus[1].quality, "low");
  }
});

await cas("une coupure réseau passe aussi au repli ; un abandon (échéance) arrête tout : la photo d'origine part", async () => {
  const f1 = fauxOpenai({ "gpt-image-2": "lever", "gpt-image-2.5-flare": IMAGE });
  const r1 = await R.retoucherPhoto({ ...base, fetchFn: f1.fetchFn });
  assert(r1.ok && r1.modele === "gpt-image-2.5-flare");
  const f2 = fauxOpenai({ "gpt-image-2": "abandon", "gpt-image-2.5-flare": IMAGE });
  const r2 = await R.retoucherPhoto({ ...base, fetchFn: f2.fetchFn });
  assert(!r2.ok);
  assertEquals(f2.recus.length, 1);
  const ctl = new AbortController(); ctl.abort();
  const f3 = fauxOpenai({ "gpt-image-2": IMAGE });
  assertEquals((await R.retoucherPhoto({ ...base, fetchFn: f3.fetchFn, signal: ctl.signal })).ok, false);
  assertEquals(f3.recus.length, 0);
});

await cas("jamais payé deux fois : refus de modération ou réponse facturée sans image → pas de second appel", async () => {
  const f1 = fauxOpenai({ "gpt-image-2": { status: 400, corps: { error: { code: "moderation_blocked", message: "Your request was rejected by the safety system" } } }, "gpt-image-2.5-flare": IMAGE });
  const r1 = await R.retoucherPhoto({ ...base, fetchFn: f1.fetchFn });
  assert(!r1.ok);
  assertEquals(f1.recus.length, 1);
  const f2 = fauxOpenai({ "gpt-image-2": { status: 200, corps: { data: [{}], usage: { input_tokens: 10, output_tokens: 196 } } }, "gpt-image-2.5-flare": IMAGE });
  const r2 = await R.retoucherPhoto({ ...base, fetchFn: f2.fetchFn });
  assert(!r2.ok);
  assertEquals(f2.recus.length, 1);
  // Les deux modèles en panne : deux essais, puis la photo d'origine (aucune erreur au client).
  const f3 = fauxOpenai({ "gpt-image-2": { status: 503, corps: "" }, "gpt-image-2.5-flare": { status: 502, corps: "" } });
  const r3 = await R.retoucherPhoto({ ...base, fetchFn: f3.fetchFn });
  assert(!r3.ok);
  assertEquals(f3.recus.length, 2);
  assertEquals(R.repliPermis(400, '{"error":{"message":"Invalid value for size"}}'), false);
});

await cas("generate-listing passe par le module : mêmes réglages, coût au tarif du modèle, modèle écrit dans photo_retouche", () => {
  const gl = lire("supabase/functions/generate-listing/index.ts");
  assert(!gl.includes('form.append("model", "gpt-image-2")'), "plus d'appel OpenAI écrit à la main");
  assert(!gl.includes("https://api.openai.com/v1/images/edits"));
  assert(gl.includes('const r = await retoucherPhoto({\n            cle: OPENAI_KEY, blob: srcBlob, prompt: promptToUse, qualite: qualityToUse, taille: "1024x1024",\n            signal: ctlRetouche.signal,'));
  assert(gl.includes('const qualityToUse = isLight ? "low" : "medium";'), "réglages de qualité inchangés");
  assert(gl.includes("const OPENAI_IMG_PROMPT_LIGHT = PROMPT_RETOUCHE_LEGERE;"));
  assert(gl.includes("if (!r.ok) return { type: idx === 0 ? \"original\" : `photo_${idx}`, url: photoUrl };"), "tous les modèles en échec : la photo d'origine");
  assert(gl.includes("cost.img_usd += coutImageUsd(r.modele, r.usage);"));
  assert(gl.includes('openai_model: modelesServis.length ? modelesServis.join(",") : null,'));
  assert(gl.includes("openai_modeles: cost.img_modeles,") && gl.includes("repli_modele: cost.img_replis,"));
  assert(gl.includes('cost_source: usageComplet ? "usage_api" : "estimation_constantes",'));
  // Le quota de retouche du palier reste lu AVANT tout appel image, comme avant.
  assert(gl.indexOf("quota_retouche_atteint") < gl.indexOf("const r = await retoucherPhoto({"));
});

console.log(`retouche-modele-selftest : ${n} cas verts`);
