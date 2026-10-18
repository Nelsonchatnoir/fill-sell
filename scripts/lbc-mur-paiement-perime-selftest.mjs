// Autotest : LEBONCOIN — UN MUR « VALIDER ET PAYER » PÉRIMÉ NE DÉCLASSE PLUS UNE QUESTION (18/10, job b1b9bb68).
//
//     npm run selftest:lbc-mur-paiement-perime
//
// Job b1b9bb68 (compte pro 7373c96c) : last_diagnostic « lbc_options_payant_seulement » du 14/10 03:16,
// resté sur le job ; l'essai du 18/10 (processing_since 12:13) pose la question « Poids du colis* » —
// update-job-status la déclassait en « relancer » (needsUserField retiré) sur ce diagnostic périmé.
// Ce qu'il prouve, sans réseau ni base : le bloc « LE MUR VALIDER ET PAYER… » d'update-job-status,
// EXÉCUTÉ tel qu'il est écrit (extrait du fichier), ne déclasse que sur un mur vu pendant CET essai ;
//   · mur périmé (vu avant la prise en charge, plus de 5 s) → la question reste ;
//   · mur vu pendant l'essai → déclassé comme avant (règle du 17/10, DeadRoz) ;
//   · sans date lisible (processing_since ou at) → la règle d'avant ;
//   · processing_since absent du platform_fields envoyé → celui du job en base.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };

const ujs = lire("supabase/functions/update-job-status/index.ts");
const debut = ujs.indexOf("    if (statutEffectif === \"needs_user\" && patch.platform_fields && typeof patch.platform_fields === \"object\") {\n      const pfMur");
const fin = debut >= 0 ? ujs.indexOf("\n    }\n", debut) : -1;
ok(debut > 0 && fin > debut, "bloc « mur Valider et payer » trouvé dans update-job-status");
const bloc = debut > 0 && fin > debut ? ujs.slice(debut, fin + 6) : "";
ok(/const debutEssaiMur = Date\.parse\(String\(pfMur\["processing_since"\] \?\? pfDuJob\?\.\["processing_since"\] \?\? ""\)\);/.test(bloc), "le début de l'essai : processing_since envoyé, sinon celui du job");
ok(/const murPerime = Number\.isFinite\(debutEssaiMur\) && Number\.isFinite\(murVuLe\) && murVuLe < debutEssaiMur - 5000;/.test(bloc), "périmé = vu plus de 5 s avant la prise en charge");
ok(/if \(!murPerime && MOTIFS_LBC_PAIEMENT\.includes\(String\(diagMur\?\.\["quoi"\] \?\? ""\)\)\) \{/.test(bloc), "le déclassement exige un mur NON périmé");

// Le bloc, exécuté tel quel (le TypeScript des « as » retiré).
const js = bloc.replace(/ as Record<string, unknown>( \| undefined)?/g, "");
const { MOTIFS_LBC_PAIEMENT, MARQUEURS_QUESTION_PASSEE } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/lbc-forfait.js")).href);
const executer = new Function("statutEffectif", "patch", "pfDuJob", "MOTIFS_LBC_PAIEMENT", "MARQUEURS_QUESTION_PASSEE", "user", "jobId", "console",
  `${js}\nreturn patch;`);
const muet = { log() {} };
const question = { field_key: "estimated_parcel_weight", field_label: "Poids du colis*", allowed_values: ["0 - 1 kg", "1 - 2 kg"] };
const jouer = (pf, pfDuJob = null, statut = "needs_user") => executer(statut, { platform_fields: { ...pf } }, pfDuJob, MOTIFS_LBC_PAIEMENT, MARQUEURS_QUESTION_PASSEE, { id: "u" }, "j", muet).platform_fields;

// Le cas réel b1b9bb68.
const reel = {
  needs_user_source: "champ_a_choisir", needsUserField: question, processing_since: "2026-10-18T12:13:19.659Z",
  last_diagnostic: { at: "2026-10-14T03:16:36.922Z", quoi: "lbc_options_payant_seulement", detail: "Leboncoin ne propose aucune option gratuite…" },
};
const r1 = jouer(reel);
ok(r1.needs_user_source === "champ_a_choisir" && r1.needsUserField?.field_key === "estimated_parcel_weight", "b1b9bb68 : mur du 14/10, essai du 18/10 → la question « Poids du colis* » reste", r1);
const r2 = jouer({ ...reel, last_diagnostic: { ...reel.last_diagnostic, at: "2026-10-18T12:14:02.000Z" } });
ok(r2.needs_user_source === "relancer" && !("needsUserField" in r2), "mur vu PENDANT l'essai → déclassé « relancer » comme avant (17/10)", r2);
const r3 = jouer({ ...reel, last_diagnostic: { ...reel.last_diagnostic, at: "2026-10-18T12:13:16.000Z" } });
ok(r3.needs_user_source === "relancer", "5 s de marge d'horloge : un mur 3 s avant la prise en charge compte encore");
const r4 = jouer({ ...reel, processing_since: undefined });
ok(r4.needs_user_source === "relancer", "sans processing_since lisible : la règle d'avant (déclassé)");
const r5 = jouer({ ...reel, processing_since: undefined }, { processing_since: "2026-10-18T12:13:19.659Z" });
ok(r5.needs_user_source === "champ_a_choisir", "processing_since absent de l'envoi : celui du job en base fait foi");
const r6 = jouer({ ...reel, last_diagnostic: { quoi: "lbc_options_payant_seulement" } });
ok(r6.needs_user_source === "relancer", "mur sans date : la règle d'avant");
const r7 = jouer({ ...reel, last_diagnostic: { at: "2026-10-14T03:16:36.922Z", quoi: "autre_chose" } });
ok(r7.needs_user_source === "champ_a_choisir", "un autre diagnostic : rien ne bouge");
const r8 = jouer(reel, null, "pending");
ok(r8.needs_user_source === "champ_a_choisir", "hors needs_user : rien ne bouge");

console.log(ko ? `\n❌ selftest:lbc-mur-paiement-perime — ${ko} échec(s)` : "\n[selftest:lbc-mur-paiement-perime] OK — un mur de paiement d'un essai précédent ne déclasse plus la question de l'essai en cours.");
process.exit(ko ? 1 : 0);
