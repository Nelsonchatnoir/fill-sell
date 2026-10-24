// Autotest — les dépôts Beebs suspects d'un compte se tranchent EN ENTIER — `npm run selftest:depot-cycle-entier`
// (_shared/depot-sans-numero.js, jugerCycleDepots ; get-pending-jobs).
// Données RELEVÉES en base le 25/10 (fixture) : Ciddjy (eacbe32c), cycle get-pending-jobs du 20/10 14:47:04 UTC,
// neuf pyjamas dont le dernier essai a pu partir ; quatre annonces apparues (34202692, 34202769, 34202839, 34202871),
// celles de quatre de ces dépôts (photos de la copie à 0 bit). Le code d'avant jugeait un par un contre un relevé
// figé : les quatre autres recevaient la question « une annonce pourrait être cet article », liens vers d'AUTRES fiches.
import fs from "node:fs";
import { jugerCycleDepots, rattacherParPhotos, candidatesDuDepot } from "../supabase/functions/_shared/depot-sans-numero.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const F = JSON.parse(fs.readFileSync(new URL("./fixtures/depots-cycle-ciddjy-2010.json", import.meta.url), "utf8"));
const emp = (u) => (F.empreintes[u] ? { url: u, ...F.empreintes[u] } : undefined);
const court = (id) => String(id).slice(0, 8);

console.log("\n1. LE CODE D'AVANT (un par un, relevé figé) REPRODUIT LES QUATRE QUESTIONS DU 20/10");
const questionsAvant = [];
for (const d of F.depots) {
  const c = candidatesDuDepot(d, F.lignes);
  if (c.length && !rattacherParPhotos({ depots: [d], lignes: F.lignes, empreinte: emp }).get(d.id)) questionsAvant.push(court(d.id));
}
ok(JSON.stringify(questionsAvant) === JSON.stringify(F.attendu.questions_du_code_d_avant), "1819ed99, 23ef4d54, 5871f48a, 39b1a35e : question", JSON.stringify(questionsAvant));

console.log("\n2. LE CYCLE ENTIER : QUATRE RATTACHÉS PAR LES PHOTOS, CINQ SANS CANDIDATE");
const r = jugerCycleDepots({ depots: F.depots, lignes: F.lignes, empreinte: emp });
const rat = Object.fromEntries([...r.rattaches].map(([k, v]) => [court(k), v.listing_id]));
ok(JSON.stringify(rat) === JSON.stringify(F.attendu.rattaches), "chaque annonce à son dépôt (photos de NOTRE copie, mutuel)", JSON.stringify(rat));
ok(JSON.stringify(r.aucune.map(court).sort()) === JSON.stringify([...F.attendu.aucune].sort()), "les cinq autres : aucune candidate restante → redépôt autorisé", JSON.stringify(r.aucune.map(court)));
ok(r.question.size === 0, "aucune question : aucune annonce d'une AUTRE fiche n'est montrée comme « peut-être lui »");

console.log("\n3. LE DOUTE RESTE UN DOUTE");
const sansPhotos = jugerCycleDepots({ depots: F.depots, lignes: F.lignes, empreinte: () => undefined });
ok(sansPhotos.rattaches.size === 0 && sansPhotos.question.size === 8, "sans empreintes : rien n'est rattaché, les huit dépôts à candidates gardent la question", `${sansPhotos.rattaches.size} / ${sansPhotos.question.size}`);
const d0 = F.depots.find((d) => court(d.id) === "1cbd7e07");
const jumeau = { ...d0, id: "00000000-0000-0000-0000-0000000000aa" };
const deux = jugerCycleDepots({ depots: [d0, jumeau], lignes: F.lignes, empreinte: emp });
ok(!deux.rattaches.size && deux.question.has(d0.id) && deux.question.has(jumeau.id), "deux dépôts aux mêmes photos : l'annonce n'est à aucun, la question reste (deux exemplaires)");
const seul = jugerCycleDepots({ depots: [F.depots.find((d) => court(d.id) === "1819ed99")], lignes: F.lignes, empreinte: emp });
ok(seul.question.size === 1, "seul dans son cycle, un dépôt dont les candidates sont « autre » garde la question (la règle ne change que le cycle)");

console.log("\n4. GET-PENDING-JOBS L'APPLIQUE");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
ok(/jugerCycleDepots\(\{ depots: aJuger\.map/.test(gpj), "le cycle est jugé en une fois");
ok(/ligne\.job_id = idJ;/.test(gpj), "un rattachement suit la ligne en mémoire");
ok(/declencheur: "serveur:verif_redepot"/.test(gpj) && /needs_user_source: "depot_deja_parti"/.test(gpj), "relevé demandé et question inchangés");

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\nTOUT VERT");
