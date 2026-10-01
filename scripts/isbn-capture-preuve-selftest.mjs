// ── AUTOTEST : L'ISBN CAPTURÉ NON STANDARD, PROUVÉ PAR LES FAITS ─────────────
// (2026-10-01, carhoa — supabase/functions/_shared/isbn-capture-preuve.js et
// src/utils/retenueServeur.js)
// Rejoue la forme RÉELLE des jobs de Carole :
//   1. « gobelins » (279c046f) — recréé par la 0.6.75, constaté dans le
//      dressing après coupure du canal, SANS marqueur : c'est une preuve ;
//   2. « Bretagne » (2286228e) — recréé, mais par la 0.6.36 (avant le build
//      qui remet la capture telle quelle) : pas une preuve ;
//   3. une réponse de la personne dans vintedAspects.isbn : pas une preuve ;
//   4. le marqueur du chemin direct prouve sa valeur ;
//   5. une preuve vaut pour SA valeur ;
//   6. la retenue se pose datée une fois, l'ancien marqueur est converti, la
//      levée laisse une trace, et l'app ne la lit que sur une republication
//      pending encore en ligne.
//   node scripts/isbn-capture-preuve-selftest.mjs
import { valeurProuveeParJob, valeursProuvees, estIsbnCaptureNonStandard, valeurIsbnCapturee } from "../supabase/functions/_shared/isbn-capture-preuve.js";
import { retenueServeurDuJob, retenueServeurDe, poserRetenueServeur, leverRetenueServeur, RETENUE_ISBN_CAPTURE, phraseRetenueServeur } from "../src/utils/retenueServeur.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const B075 = "2026-09-27T20:16:30Z+66a8887 · v0.6.75";
const B036 = "2026-09-14T10:45:36Z+17f8210 · v0.6.36";
const gobelins = (surcharge = {}, pf = {}) => ({
  id: "279c046f-c63c-42c4-9536-ec55fcdb9e04", platform: "vinted", action: "republish", status: "published",
  handler_build: B075,
  platform_fields: {
    republish_step: "recreated", capture_id: 8609,
    reconciliation: "recréation confirmée dans le dressing après coupure du canal",
    republish_snapshot: { isbn: "0000000000000", categoryPath: ["Livres et médias", "Livres", "Non-fiction"] },
    ...pf,
  },
  ...surcharge,
});

console.log("\n── ISBN CAPTURÉ NON STANDARD : LA PREUVE SE LIT SUR LES FAITS ──");

console.log("\n0. Ce qui est « non standard »");
ok(estIsbnCaptureNonStandard("0000000000000"), "« 0000000000000 » (remplissage Vinted)");
ok(estIsbnCaptureNonStandard("9782811600175"), "clé de contrôle fausse");
ok(!estIsbnCaptureNonStandard("9782811600174"), "un ISBN valide ne l'est pas");
ok(!estIsbnCaptureNonStandard("2-902634-36-6"), "un ISBN-10 valide à tirets ne l'est pas");
ok(!estIsbnCaptureNonStandard(""), "une valeur absente ne l'est pas (garde « requis de la destination »)");
ok(valeurIsbnCapturee(" 000-0000000000 ") === "0000000000000", "forme comparable sans espaces ni tirets");

console.log("\n1. « gobelins » : recréé par la 0.6.75, sans marqueur — PREUVE");
ok(valeurProuveeParJob(gobelins()) === "0000000000000", "valeur prouvée : 0000000000000");

console.log("\n2. « Bretagne » : recréé par la 0.6.36 — pas une preuve");
ok(valeurProuveeParJob(gobelins({ handler_build: B036 })) === null, "build plus ancien que le tel quel");
ok(valeurProuveeParJob(gobelins({ handler_build: null })) === null, "build illisible");

console.log("\n3. Ce qui n'est pas une preuve");
ok(valeurProuveeParJob(gobelins({}, { vintedAspects: { isbn: "9782811600174" } })) === null, "la personne a répondu : c'est sa réponse qui est partie");
ok(valeurProuveeParJob(gobelins({ status: "pending" })) === null, "pas publié");
ok(valeurProuveeParJob(gobelins({}, { republish_step: "deleted" })) === null, "pas recréé");
ok(valeurProuveeParJob(gobelins({ platform: "leboncoin" })) === null, "autre plateforme");
ok(valeurProuveeParJob(gobelins({}, { republish_snapshot: { isbn: "9782811600174" } })) === null, "copie à ISBN valide : rien à prouver");

console.log("\n4. Le marqueur du chemin direct prouve sa valeur");
ok(valeurProuveeParJob(gobelins({ handler_build: B036 }, { republish_step: "recreated", isbn_capture_tel_quel: { valeur: "0000000000000", le: "2026-10-01" } })) === "0000000000000", "marqueur");

console.log("\n5. Une preuve vaut pour SA valeur");
{
  const s = valeursProuvees([gobelins(), gobelins({ handler_build: B036 }, { republish_snapshot: { isbn: "1111111111111" } })]);
  ok(s.has("0000000000000") && !s.has("1111111111111") && s.size === 1, `prouvées : ${[...s].join(", ")}`);
}

console.log("\n6. La retenue serveur : posée, convertie, levée, lue");
{
  const t0 = "2026-09-28T07:34:48.573Z";
  const t1 = "2026-10-01T16:00:00.000Z";
  // L'ancien marqueur des six jobs de Carole
  const ancien = { republish_step: "captured", capture_id: 8612, retenue_isbn_capture: { depuis: t0, isbn_capture: "0000000000000", motif: "attente_preuve_recreation" } };
  const job = { action: "republish", status: "pending", platform_fields: ancien };
  ok(retenueServeurDuJob(job)?.motif === RETENUE_ISBN_CAPTURE && retenueServeurDuJob(job)?.depuis === t0, "l'ancien marqueur se lit comme une retenue, datée du 28/09");
  const pose = poserRetenueServeur(ancien, RETENUE_ISBN_CAPTURE, t1, { isbn_capture: "0000000000000" });
  ok(pose && !("retenue_isbn_capture" in pose) && pose.retenue_serveur.depuis === t0, "convertie à la première écriture, date d'origine gardée");
  ok(poserRetenueServeur(pose, RETENUE_ISBN_CAPTURE, t1) === null, "déjà posée : rien à écrire (datée une fois)");
  const leve = leverRetenueServeur(pose, t1, "preuve");
  ok(leve && !("retenue_serveur" in leve) && leve.retenue_levee.depuis === t0 && leve.retenue_levee.par === "preuve", "levée avec trace");
  ok(leverRetenueServeur({ republish_step: "captured" }, t1, "preuve") === null, "rien à lever : null");
  ok(retenueServeurDuJob({ action: "republish", status: "processing", platform_fields: pose }) === null, "processing : la carte dit le travail, pas l'attente");
  ok(retenueServeurDuJob({ action: "republish", status: "pending", platform_fields: { ...pose, republish_step: "deleted" } }) === null, "étape 'deleted' : jamais « intacte »");
  ok(retenueServeurDuJob({ action: "publish", status: "pending", platform_fields: pose }) === null, "une publication n'est pas une republication");
  ok(retenueServeurDe({}) === null, "aucun marqueur : null");
  const ph = phraseRetenueServeur(true);
  ok(/intacte sur Vinted/.test(ph.detail) && ph.court === "En attente", `phrase : « ${ph.court} » — ${ph.titre}`);
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
