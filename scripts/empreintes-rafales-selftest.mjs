// VERROU (12/11/2026, point 5, GO de Nico) : PAS PLUS DE 10 APPELS D'EMPREINTES À LA FOIS, ET LE CLIENT NE VA PAS PLUS LENTEMENT.
//
//     npm run selftest:empreintes-rafales
//
// Preuve de la cause (journaux, 24 h au 12/11) : empreintes-urls échoue en 546 pendant les rafales (0 % à 1–3 appels par
// minute, 25 à 28 % à 13 et plus) ; 87 % des appels viennent de rapprochement_v3_empreinter (30 appels de 6 photos d'un coup).
//   A. En base (Postgres jetable, définition de prod) : 180 photos → 10 appels de 5 au plus ; une demande plus grosse est
//      bornée, jamais refusée.
//   B. Le débit du client gardé par la fonction rapprochement : 50 photos par passe (= 10 × 5), relues après 4 s ; une chaîne
//      qui attend ses photos a 40 relances (2 000 photos, sous les 60 appels edge → edge par minute) ; la tolérance « sans
//      progrès » garde ses 72 s.
//   C. fusion_photo_tick inchangée (6 appels de 4 au plus, une fois par minute : sous la borne).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const existe = (p) => fs.existsSync(join(ROOT, p));
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };
const nombre = (src, nom) => { const m = new RegExp(`const ${nom} = ([\\d_]+);`).exec(src); return m ? Number(m[1].replace(/_/g, "")) : null; };

console.log("A. En base : 10 appels de 5 au plus");
const MIG = "supabase/migrations/20261112160000_empreintes_rafales_bornees.sql";
ok(existe(MIG) && existe("supabase/rollbacks/20261112160000_empreintes_rafales_bornees_INVERSE.sql"), "la migration et son inverse existent");
if (existe(MIG)) {
  const B = await import(pathToFileURL(join(ROOT, "scripts/essais/20261112160000_banc.mjs")).href);
  const { c, arreter } = await B.demarrer(56000 + Math.floor(Math.random() * 1500));
  try {
    const avant = await B.demande(c, 180);
    ok(avant.appels === 30, "AVANT (prod) : 180 photos = 30 appels d'un coup — la rafale reproduite", avant);
    await c.query(B.lire(B.MIGRATION));
    const apres = await B.demande(c, 180);
    ok(apres.appels === 10 && apres.tailles.join() === "5" && apres.r.photos === 50, "APRÈS : 10 appels de 5, 50 photos ; le reste part à la relance", apres);
    const gros = await B.demande(c, 500, 8, 200);
    ok(gros.appels === 10 && gros.tailles.join() === "5", "une demande de 8 × 200 est bornée à 10 × 5", gros);
  } finally { await arreter(); }
}

console.log("B. Le débit du client gardé (fonction rapprochement)");
const rap = lire("supabase/functions/rapprochement/index.ts");
const parPasse = nombre(rap, "PHOTOS_PAR_PASSE"), relance = nombre(rap, "RELANCE_PHOTOS_MS"), relMaxPh = nombre(rap, "RELANCES_MAX_PHOTOS"),
  passMax = nombre(rap, "PASSAGES_PHOTOS_MAX");
ok(parPasse === 50, "50 photos par passe : ce que la base envoie en une fois (10 × 5), rien de plus", parPasse);
ok(relance === 4000, "relues après 4 s (10 appels finissent en ~1,5 s ; 12 s quand il y en avait 30)", relance);
ok(relMaxPh != null && relMaxPh * parPasse >= 2000 && Math.ceil(60_000 / relance) < 60, "une chaîne de photos : 40 relances (2 000 photos), ~15 par minute, sous les 60 appels edge → edge", { relMaxPh, parPasse });
ok(passMax != null && passMax * relance >= 72_000, "jamais classé sans ses photos plus tôt qu'avant : 18 relectures × 4 s ≥ 72 s (6 × 12 s)", { passMax, relance });
ok(/photosEnRoute = true; relanceApres = Math\.max\(relanceApres, RELANCE_PHOTOS_MS\)/.test(rap)
  && /rang < \(enTranches \? RELANCES_MAX_TRANCHES : photosEnRoute \? RELANCES_MAX_PHOTOS : RELANCES_MAX\)/.test(rap), "la borne de relances des photos ne vaut que pour une chaîne qui attend ses photos");
// Débit théorique, pour la trace : avant 30 appels × 5 utiles × 73 % / (12 s + ~2 s) ≈ 7,8 photos/s ; après 10 × 5 × ~94 % / (4 s + ~2 s) ≈ 7,8.
const avant = (30 * 5 * 0.73) / 14, apres = (10 * 5 * 0.94) / 6;
ok(apres >= avant * 0.95, `débit attendu par chaîne : ${apres.toFixed(1)} photos/s contre ${avant.toFixed(1)} (échecs mesurés : 27 % en rafale de 30, ~6 % à 10)`);

console.log("C. fusion_photo_tick inchangée");
ok(!/fusion_photo_tick/.test(existe(MIG) ? lire(MIG).replace(/^--.*$/gm, "") : "fusion_photo_tick"), "la migration ne réécrit que rapprochement_v3_empreinter");

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
