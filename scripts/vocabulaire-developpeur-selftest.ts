// Selftest : le filet « vocabulaire de développeur », passé sur le PARC RÉEL.
//   deno run --allow-read scripts/vocabulaire-developpeur-selftest.ts
//
// POURQUOI CE TEST EXISTE, ET POURQUOI IL LIT UN CORPUS FIGÉ.
// En écrivant ce filet, le motif a été retapé dans un script jetable : un
// « \[object Object\] » y est devenu « [object Object] », soit une CLASSE DE
// CARACTÈRES qui matche la lettre « o ». Passage à blanc : 235 formes sur 237
// requalifiées — 12 243 jobs, dont « Annonce retirée par le vendeur — pas une
// vente ». Un filet trop large ne fuit pas : il EFFACE tous les bons messages.
//
// Le corpus (scripts/corpus/messages-parc-2026-09-21.json) est l'intégralité
// des formes de message distinctes de cross_post_jobs au 21/09/2026 :
// 237 formes, 12 246 jobs. Le test exige que le filet n'en attrape QUE celles
// qui portent réellement du vocabulaire de développeur — nommées ici une par
// une. Toute nouvelle prise fait rougir le test : c'est le but.

import {
  marqueurDeDeveloppeur,
  porteDuVocabulaireDeDeveloppeur,
} from "../supabase/functions/_shared/vocabulaire-developpeur.ts";

let ko = 0;
const ok = (nom: string, cond: boolean, detail = "") => {
  if (!cond) ko++;
  console.log(`  ${cond ? "ok  " : "⚠ KO"} ${nom}${detail ? " — " + detail : ""}`);
};

console.log("=== 1. CE QUI NE DOIT JAMAIS ATTEINDRE UN ÉCRAN ===");
const DOIT_PRENDRE: Array<[string, string]> = [
  ["chemin de fichier (job 7678a1ed, adamchocho13)",
   "Formulaire eBay non atteint (page actuelle: /lstng/error). categoryId=139971 probablement refusé par /sl/list — vérifier l'id dans src/utils/ebayCategories.js (arbre docs/ebay-categories-raw.txt)."],
  ["nom de fonction serveur (seghirdeborah711, 17/09)", "update-job-status → HTTP 520"],
  ["identifiant interne seul", "Le champ field_key est absent de la capture."],
  ["route de plateforme", "La page /items/new n'a jamais répondu."],
  ["fragment de DOM", "document.querySelector('[data-testid=submit]') est resté null."],
  ["exception JavaScript", "TypeError: t is not a function"],
  ["objet craché", "Refus de la plateforme : [object Object]"],
  ["fichier de code nommé", "échec dans vintedCategories.js"],
];
for (const [nom, texte] of DOIT_PRENDRE) {
  ok(nom, porteDuVocabulaireDeDeveloppeur(texte), `marqueur « ${marqueurDeDeveloppeur(texte)} »`);
}

console.log("=== 2. RIEN DU TOUT ===");
ok("chaîne vide", !porteDuVocabulaireDeDeveloppeur(""));
ok("null", !porteDuVocabulaireDeDeveloppeur(null));
ok("pas une chaîne", !porteDuVocabulaireDeDeveloppeur(42));
ok("marqueur d'un texte propre = null", marqueurDeDeveloppeur("Ton annonce est intacte.") === null);

console.log("=== 3. LE PARC RÉEL — 237 formes, 12 246 jobs ===");
// Les SEULES formes du parc qui doivent être attrapées, reconnues par un
// fragment stable de leur texte. Tout le reste doit passer INTACT.
const PRISES_ATTENDUES = [
  "src/utils/ebayCategories.js",   // adamchocho13, 21/09
  "update-job-status → HTTP 520",  // seghirdeborah711, 17/09
];
const corpus: Array<{ t: string; p: string; n: number; c: number }> = JSON.parse(
  await Deno.readTextFile(new URL("./corpus/messages-parc-2026-09-21.json", import.meta.url)),
);
const formes = corpus.length;
const jobs = corpus.reduce((s, x) => s + x.n, 0);
const prises = corpus.filter((x) => porteDuVocabulaireDeDeveloppeur(x.t));
const attendues = prises.filter((x) => PRISES_ATTENDUES.some((f) => x.t.includes(f)));
const surprises = prises.filter((x) => !PRISES_ATTENDUES.some((f) => x.t.includes(f)));

ok(`corpus intact (${formes} formes, ${jobs} jobs)`, formes === 237 && jobs === 12246);
ok(`les ${PRISES_ATTENDUES.length} fuites connues sont attrapées`,
  attendues.length === PRISES_ATTENDUES.length, `${attendues.length} prise(s)`);
ok("AUCUNE autre forme du parc n'est attrapée",
  surprises.length === 0,
  surprises.length ? `${surprises.length} forme(s), ${surprises.reduce((s, x) => s + x.n, 0)} jobs` : "0");
for (const s of surprises.slice(0, 12)) {
  console.log(`      ↳ ${s.n} job(s) · ${s.p} · marqueur « ${marqueurDeDeveloppeur(s.t)} »`);
  console.log(`        ${s.t.slice(0, 160).replace(/\s+/g, " ")}`);
}

console.log(ko ? `\n⚠ ${ko} CAS EN ECHEC` : "\n✓ TOUS LES CAS PASSENT");
if (ko) Deno.exit(1);
