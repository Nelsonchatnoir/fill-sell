// ═══════════════════════════════════════════════════════════════════════════
// Selftest « eBay voie API : les reprises du chien de garde se comptent depuis la relance » (19/11/2026)
//   npm run selftest:ebay-api-reprises
//
// LE TROU : reprendreProcessingMorts (ebay-api-worker) comptait les reprises sur toute la vie de la tâche. Une
// publication eBay déjà passée en échec (« interrompu 3 fois de suite », reprises_processing = 4) puis relancée par la
// personne repartait avec son compteur : à la première coupure suivante, 5 > 3, nouvel échec immédiat sous un message
// devenu faux. Une relance « par copie » héritait du compteur de la même façon (job c1d8a3eb, 19/11).
// LA RÈGLE (_shared/ebay-api-reprises.js) : un cycle commence à la relance de la personne ou à la création de la tâche ;
// une reprise d'avant le cycle ne compte plus ; le plafond ne change pas.
// CE QUE CE TEST VERROUILLE :
//   A. la règle pure (repriseProcessingSuivante) ;
//   B. la séquence du 19/11 rejouée avec le plafond lu dans ebay-api-worker : la relance rend un cycle entier ;
//   C. le câblage : reprendreProcessingMorts juge par la règle, plus par le compteur brut.
// Identifiants FICTIFS (selftest:donnees-clients).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const M = await charger("supabase/functions/_shared/ebay-api-reprises.js");
const suivante = (arg) => {
  if (typeof M.repriseProcessingSuivante !== "function") return { __absent: true };
  try { return M.repriseProcessingSuivante(arg); } catch (e) { return { __exception: String(e?.message ?? e) }; }
};
const T0 = Date.parse("2026-11-19T10:17:39Z");
const iso = (min) => new Date(T0 + min * 60_000).toISOString();

console.log("A. LA RÈGLE PURE");
ok(!M.__erreur, "module _shared/ebay-api-reprises.js chargé", M.__erreur);
ok(suivante({ pf: {}, creeLe: iso(0) }).n === 1, "tâche jamais reprise : reprise n° 1");
ok(suivante({ pf: { reprises_processing: 2, derniere_reprise_processing: iso(24) }, creeLe: iso(0) }).n === 3,
  "reprises du même cycle (après la création, sans relance) : le compteur continue");
const apresRelance = suivante({ pf: { reprises_processing: 4, derniere_reprise_processing: iso(48), derniere_relance_manuelle: iso(55) }, creeLe: iso(0) });
ok(apresRelance.n === 1 && apresRelance.nouveauCycle === true && apresRelance.faitesAvant === 4,
  "relance APRÈS la dernière reprise : nouveau cycle, reprise n° 1 (les 4 d'avant écartées)", JSON.stringify(apresRelance));
ok(suivante({ pf: { reprises_processing: 1, derniere_reprise_processing: iso(69), derniere_relance_manuelle: iso(55) }, creeLe: iso(0) }).n === 2,
  "reprise faite après la relance : elle compte (le cycle de la relance continue)");
ok(suivante({ pf: { reprises_processing: 4, derniere_reprise_processing: iso(48) }, creeLe: iso(70) }).n === 1,
  "copie (tâche créée après la dernière reprise de sa source) : nouveau cycle");
ok(suivante({ pf: { reprises_processing: 3 }, creeLe: iso(0) }).n === 4
  && suivante({ pf: { reprises_processing: 3, derniere_relance_manuelle: iso(5) }, creeLe: iso(0) }).n === 4,
  "compteur sans date de reprise : la règle d'avant (compteur + 1), même avec une relance");
ok(suivante({ pf: null, creeLe: null }).n === 1 && suivante({ pf: { reprises_processing: "abc" } }).n === 1
  && suivante().n === 1, "entrées absentes ou illisibles : reprise n° 1, jamais d'exception");

console.log("\nB. LA SÉQUENCE DU 19/11, PLAFOND LU DANS ebay-api-worker");
const worker = lire("supabase/functions/ebay-api-worker/index.ts");
const plafond = Number(/const PROCESSING_REPRISES_MAX = (\d+);/.exec(worker)?.[1]);
ok(Number.isInteger(plafond) && plafond > 0, `plafond lu : PROCESSING_REPRISES_MAX = ${plafond}`);
// Rejoue le chien de garde : à chaque coupure, la règle donne n ; n > plafond → échec, sinon remise en file.
function rejouer(pf, creeLe, coupures) {
  const issues = [];
  for (const min of coupures) {
    const r = suivante({ pf, creeLe });
    if (!Number.isFinite(r.n)) { issues.push("?"); continue; }
    pf.reprises_processing = r.n;
    pf.derniere_reprise_processing = iso(min);
    issues.push(r.n > plafond ? "failed" : "pending");
  }
  return issues;
}
const pf = {};
const cycle1 = rejouer(pf, iso(0), [12, 24, 36, 48]);
ok(cycle1.join(",") === "pending,pending,pending,failed", `avant la relance : ${cycle1.join(", ")} (3 remises en file, échec à la 4e coupure)`);
pf.derniere_relance_manuelle = iso(55);
const cycle2 = rejouer(pf, iso(0), [69]);
ok(cycle2[0] === "pending", `relance puis première coupure : ${cycle2[0]} (avant le correctif : failed, reprise 5)`);
const suite = rejouer(pf, iso(0), [81, 93, 105]);
ok(suite.join(",") === "pending,pending,failed", `le cycle de la relance va au plafond : ${[...cycle2, ...suite].join(", ")}`);

console.log("\nC. LE CÂBLAGE DANS ebay-api-worker");
const corps = /async function reprendreProcessingMorts\([\s\S]*?\n}\n/.exec(worker)?.[0] ?? "";
ok(corps.length > 0, "reprendreProcessingMorts trouvée");
ok(/import\s*\{[^}]*\brepriseProcessingSuivante\b[^}]*\}\s*from\s*"\.\.\/_shared\/ebay-api-reprises\.js"/.test(worker),
  "ebay-api-worker importe repriseProcessingSuivante de _shared/ebay-api-reprises.js");
ok(/repriseProcessingSuivante\(\{\s*pf[^}]*creeLe:\s*j\.created_at/.test(corps),
  "le chien de garde juge par la règle (platform_fields et date de création de la tâche)");
ok(!/\(Number\(pf\.reprises_processing\)\s*\|\|\s*0\)\s*\+\s*1/.test(corps), "plus de compteur brut « reprises_processing + 1 »");
ok(/pf\.reprises_processing = n;/.test(corps) && /pf\.derniere_reprise_processing = /.test(corps),
  "le compteur et la date de la reprise sont toujours écrits (le cycle suivant les relit)");
ok(/const epuise = n > PROCESSING_REPRISES_MAX;/.test(corps), "le plafond et l'échec nommé inchangés");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
