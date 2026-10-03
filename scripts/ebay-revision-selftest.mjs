// Autotest — réviser une annonce eBay en ligne qu'une règle corrigée aurait
// faite autrement (03/10, point 12) — `npm run selftest:ebay-revision`
// Jean de Patrick (job b26c3d40, eBay 237102208161) : publié « 34 » (la
// LONGUEUR de « 35/34 » lue comme un 34 français), fiche « W34 | FR 44 ».
// Révisé le 03/10 par l'action `reviser_annonce` du worker : relu « 44 » sur
// l'annonce publique (Browse) et sur la page eBay.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { tailleDansGrille } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/tailles.js")).href);
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Grille RÉELLE de la catégorie 11483 (ebay_item_aspects, aspect « Taille », lue le 03/10).
const GRILLE_11483 = ["2XS","XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL","7XL","8XL","32","34","36","37","38","39","40","42","44","46","48","50","52","54","56","58","60","62","64","66","68","70","Taille unique","UK 26","UK 28","UK 30","UK 32","UK 34","UK 36","UK 38","UK 40","UK 42","UK 44","US 26","US 28","US 30","US 32","US 34","US 36","US 38","US 40","US 42","US 44"];

console.log("\n1. LA RÈGLE CORRIGÉE (f514b52) SUR LA FICHE DE PATRICK");
ok(tailleDansGrille("W34 | FR 44", GRILLE_11483)?.valeur === "44", "« W34 | FR 44 » → « 44 » (la taille française de la fiche)");
ok(tailleDansGrille("35/34", GRILLE_11483) === null, "« 35/34 » seul → question, jamais « 34 »");
ok(tailleDansGrille("W34", GRILLE_11483) === null, "« W34 » seul → question (jamais le 34 français ni l'US 34)");

console.log("\n2. L'ACTION DU WORKER : PRUDENTE, VÉRIFIÉE");
const w = lire("supabase/functions/ebay-api-worker/index.ts");
const f = w.slice(w.indexOf("async function reviserAnnonce("), w.indexOf("// LE VENDEUR DES ANNONCES LUES AU HUB"));
ok(/if \(body\.action === "reviser_annonce"\) return json\(await reviserAnnonce\(admin, env, body as Record<string, unknown>\)\);/.test(w), "action « reviser_annonce » (garde x-cron-secret du worker)");
ok(/job\.voie !== "api" \|\| job\.status !== "published"/.test(f), "seulement une annonce publiée par l'API (SKU, offre, numéro)");
ok(/if \(String\(pf\.taille \?\? ""\) !== attendu\) return \{ ok: false, motif: "taille_actuelle_differente"/.test(f), "la valeur actuelle attendue doit être celle du job, sinon rien");
ok(/tailleDansGrille\(tailleFiche, grille\)/.test(f) && /if \(!t\) return \{ ok: false, motif: "taille_non_traduisible"/.test(f), "la nouvelle taille vient de la règle du dépôt, jamais d'ailleurs ; intraduisible → rien");
ok(/if \(dryRun\) return \{ ok: true, dry_run: true/.test(f), "essai à blanc possible");
ok(/product: \{ \.\.\.item\.product, aspects: \{ \.\.\.\(item\.product\?\.aspects \?\? \{\}\), Taille: \[String\(c\.vers\)\] \} \}/.test(f)
  && /availability: item\.availability, condition: item\.condition/.test(f), "l'article relu est renvoyé tel quel, seule la Taille change");
ok(/get_item_by_legacy_id\?legacy_item_id=\$\{listingId\}/.test(f) && /pf\.revision_annonce = \{/.test(f), "relecture de l'annonce publique et trace sur le job");
ok(!/cron|setInterval|veillerVentesEbay\(admin, env\);[\s\S]*reviserAnnonce\(/.test(f), "jamais lancée en masse ni en automatique (mesuré : 15 écarts sur 16 sont des écritures équivalentes)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ révision eBay : la règle corrigée, sur une annonce désignée, relue");
