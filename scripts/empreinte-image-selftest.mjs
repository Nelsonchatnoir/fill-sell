// ═══════════════════════════════════════════════════════════════════════════
// Selftest de l'EMPREINTE D'IMAGE (2026-09-23)
//   node scripts/empreinte-image-selftest.mjs
//
// Le module testé est IMPORTÉ (supabase/functions/_shared/empreinte-image.ts)
// — le même que la fonction edge photo-empreinte. Il ne voit que des pixels :
// on lui en fabrique ici (aucune dépendance, aucun réseau) et on fige ce que
// les seuils promettent :
//   · une image et sa copie → distance 0, verdict « identique » ;
//   · la même image redimensionnée, légèrement décalée, un peu bruitée →
//     petite distance, toujours « identique » ;
//   · une image différente → grande distance, « differente » ;
//   · la même forme dans une autre couleur → dHash/pHash identiques (gris),
//     mais la SIGNATURE COULEUR diffère — c'est le cas des kits de Louis, et
//     c'est pour ça que la couleur du titre exclut AVANT la photo.
// Les seuils de production (identique ≤ 5/8, proche ≤ 10) viennent de la
// mesure du 23/09 sur le stock de Louis (voir l'en-tête du module).
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/empreinte-image.ts")).href);
const { empreinteDepuisRgba, comparerEmpreintes, hamming, SEUILS_EMPREINTE, meilleurAppariement } = M;

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// ── Fabrique d'images : une « photo » synthétique déterministe ─────────────
function image(w, h, peindre) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = peindre(x / w, y / h);
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
// Un objet clair sur fond sombre TEXTURÉ (rayures obliques : une vraie photo
// a de la matière partout — un dégradé pur rend dHash fragile au moindre
// bruit, ce qui ne dit rien des photos réelles), avec deux « détails ».
const scene = (teinte) => (u, v) => {
  const fond = 40 + 60 * v + 30 * Math.sin((u * 9 + v * 7) * Math.PI);
  const objet = (u - 0.5) ** 2 / 0.09 + (v - 0.55) ** 2 / 0.16 < 1;
  const detail = (u > 0.62 && u < 0.7 && v > 0.3 && v < 0.5) || ((u - 0.35) ** 2 + (v - 0.35) ** 2 < 0.004);
  if (detail) return [20, 20, 20];
  if (objet) return teinte(u, v);
  return [fond, fond, fond + 10];
};
// Deux teintes de MÊME luminance (BT.601 : 0,299 R + 0,587 G + 0,114 B ≈ 110)
// — c'est le cas des kits de Louis : même photo, la couleur change, le gris
// ne bouge pas. Le dégradé est appliqué aux deux de la même façon.
const rouge = scene((u) => [180 - 20 * u, 80, 80]);
const vert = scene((u) => [60, 145 - 10 * u, 60]);
const autre = (u, v) => { const damier = (Math.floor(u * 6) + Math.floor(v * 6)) % 2; return damier ? [230, 230, 230] : [30, 30, 30]; };

const decale = (peindre, dx, dy) => (u, v) => peindre(Math.min(1, Math.max(0, u + dx)), Math.min(1, Math.max(0, v + dy)));
let graine = 3;
const bruit = (peindre, amp) => (u, v) => { graine = (graine * 9301 + 49297) % 233280; const b = (graine / 233280 - 0.5) * amp; return peindre(u, v).map((c) => Math.min(255, Math.max(0, c + b))); };

const A = empreinteDepuisRgba(image(600, 800, rouge));
const A2 = empreinteDepuisRgba(image(600, 800, rouge));
const Apetit = empreinteDepuisRgba(image(150, 200, rouge));
const Adecale = empreinteDepuisRgba(image(600, 800, decale(rouge, 0.01, 0.01)));
const Abruit = empreinteDepuisRgba(image(600, 800, bruit(rouge, 12)));
const B = empreinteDepuisRgba(image(600, 800, vert));
const C = empreinteDepuisRgba(image(600, 800, autre));

console.log("\n[1] Forme des empreintes");
ok("dHash = 64 bits", /^[01]{64}$/.test(A.dhash), A.dhash);
ok("pHash = 64 bits", /^[01]{64}$/.test(A.phash), A.phash);
ok("signature couleur = 16 cellules (0-9, a, b, g)", /^[0-9abg]{16}$/.test(A.couleur), A.couleur);
ok("déterministe : deux calculs identiques", A.dhash === A2.dhash && A.phash === A2.phash && A.couleur === A2.couleur);

console.log("\n[2] Ce qui doit être « identique »");
for (const [nom, e] of [["copie", A2], ["réduite 4×", Apetit], ["bruitée", Abruit]]) {
  const c = comparerEmpreintes(A, e);
  ok(`${nom} → identique (d=${c.dhash}, p=${c.phash})`, c.verdict === "identique", JSON.stringify(c));
}
{
  // Un recadrage / décalage n'est PAS une preuve : c'est au mieux un indice.
  // (Sur le stock de Louis, deux prises de vue du même objet donnent 6-16.)
  const c = comparerEmpreintes(A, Adecale);
  ok(`décalée de 1 % → au moins « proche » (d=${c.dhash}, p=${c.phash})`, c.verdict !== "differente", JSON.stringify(c));
}

console.log("\n[3] Ce qui doit être « differente »");
{
  const c = comparerEmpreintes(A, C);
  ok(`une autre image → differente (d=${c.dhash}, p=${c.phash})`, c.verdict === "differente" && c.dhash > SEUILS_EMPREINTE.proche.dhash, JSON.stringify(c));
}

console.log("\n[4] Le cas des kits : même forme, autre couleur");
{
  const c = comparerEmpreintes(A, B);
  ok(`gris : dHash/pHash sous les seuils (d=${c.dhash}, p=${c.phash})`, c.dhash <= SEUILS_EMPREINTE.identique.dhash && c.phash <= SEUILS_EMPREINTE.identique.phash, JSON.stringify(c));
  ok(`couleur : la signature DIFFÈRE (${c.couleur} cellules)`, c.couleur >= 3, JSON.stringify(c));
  ok("… donc l'empreinte seule dirait « identique » : la couleur du titre doit exclure AVANT", c.verdict === "identique");
}

console.log("\n[5] Outils");
ok("hamming symétrique", hamming(A.dhash, C.dhash) === hamming(C.dhash, A.dhash));
ok("hamming de longueurs différentes = infini", hamming("01", "011") === Infinity);
ok("meilleurAppariement prend la paire la plus proche", meilleurAppariement([C, A], [B, C]).verdict === "identique");
ok("listes vides → differente", meilleurAppariement([], [A]).verdict === "differente");
ok("seuils figés : identique 5/8, proche 10", SEUILS_EMPREINTE.identique.dhash === 5 && SEUILS_EMPREINTE.identique.phash === 8 && SEUILS_EMPREINTE.proche.dhash === 10);

console.log(ko === 0 ? "\n[selftest:empreinte-image] OK\n" : `\n[selftest:empreinte-image] ÉCHEC — ${ko} vérification(s) en défaut.\n`);
process.exit(ko === 0 ? 0 : 1);
