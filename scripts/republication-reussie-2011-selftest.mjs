// Verrou « une republication réussie ne se défait jamais par un rapport tardif » (20/11, point 3 de Nico — gjehly).
//
// 20 republications Vinted de gjehly (17/11 18:03 → 20/11 07:12) ont réussi (recreated, published, nouvelle annonce
// relue en ligne), puis un « failed » d'une exécution périmée (lecture de l'ANCIENNE annonce, 404) les remettait à
// « a_capturer » (pas-de-rouge : inconnu_reprise → reprise). Ce test échoue si :
//   1. la règle (_shared/republication-reussie.js) laisse passer un « failed », « pending » ou « needs_user » sur une
//      republication published/recreated — ou bloque ce qui doit passer (réarmement serveur, étape en cours, publication
//      simple, rapport « published ») ;
//   2. update-job-status ne l'applique plus juste après la réservation (avant toute requalification pas-de-rouge),
//      ou plus en 409 ;
//   3. les journaux réels des tâches 0c4a0ca7 et 222227a3 ne seraient plus refusés.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rapportTardifSurRepublicationReussie as tardif, STATUTS_TARDIFS, MESSAGE_REPUBLICATION_DEJA_REUSSIE }
  from "../supabase/functions/_shared/republication-reussie.js";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => fs.readFileSync(path.join(racine, f), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) ko++; };

console.log("1. La règle");
const reussie = { republish_step: "recreated", vinted_item_id: "10769248285" };
for (const s of ["failed", "pending", "needs_user"]) {
  ok(tardif({ statutEnBase: "published", statutDemande: s, action: "republish", pf: reussie }), `« ${s} » sur une republication réussie : refusé`);
}
ok(!tardif({ statutEnBase: "published", statutDemande: "published", action: "republish", pf: reussie }), "un « published » de plus passe (rien ne se défait)");
ok(!tardif({ statutEnBase: "pending", statutDemande: "failed", action: "republish", pf: { republish_step: "a_capturer" } }),
  "réarmée par le serveur pour un créneau suivant (pending) : ses rapports passent");
ok(!tardif({ statutEnBase: "published", statutDemande: "failed", action: "republish", pf: { republish_step: "deleted" } }),
  "étape autre que « recreated » : on ne juge pas ici");
ok(!tardif({ statutEnBase: "published", statutDemande: "needs_user", action: "publish", pf: { } }), "une publication simple : hors de cette règle");
ok(!tardif({ statutEnBase: "published", statutDemande: "failed", action: "republish", pf: null }), "champs illisibles : on ne juge pas");
ok(STATUTS_TARDIFS.size === 3 && /déjà réussi/.test(MESSAGE_REPUBLICATION_DEJA_REUSSIE), "trois statuts tardifs, message clair");

console.log("2. Le branchement dans update-job-status");
const UJS = lire("supabase/functions/update-job-status/index.ts");
const iResa = UJS.indexOf('if (!reservation?.ok) return json({ error: reservation?.reason || "Ce job n\'est plus réservé à ce poste." }, 409);');
const iGarde = UJS.indexOf('if (reservation.statut === "published" && STATUTS_TARDIFS.has(String(status))) {');
const iAnnulee = UJS.indexOf('if (reservation.statut === "cancelled" && status !== "published") {');
const iPdr = UJS.indexOf("pas-de-rouge : ");
ok(iResa > 0 && iGarde > iResa && iGarde < iAnnulee && iGarde < iPdr, "la garde suit la réservation et précède toute requalification");
const bloc = UJS.slice(iGarde, iAnnulee);
ok(/rapportTardifSurRepublicationReussie\(\{ statutEnBase: reservation\.statut, statutDemande: status, action: jPub\.action, pf: jPub\.platform_fields \}\)/.test(bloc)
  && /return json\(\{ error: MESSAGE_REPUBLICATION_DEJA_REUSSIE, deja_reussie: true \}, 409\);/.test(bloc) && !/\.update\(/.test(bloc),
  "refus 409 sans aucune écriture");
ok(/import \{ rapportTardifSurRepublicationReussie, STATUTS_TARDIFS, MESSAGE_REPUBLICATION_DEJA_REUSSIE \} from "\.\.\/_shared\/republication-reussie\.js";/.test(UJS), "importée depuis _shared");

console.log("3. Les journaux réels (20/11)");
// 0c4a0ca7 : recreated/published 03:38:29Z, « failed » tardif 03:42:49Z ; 222227a3 : published 06:58:38Z, « failed » 06:59:42Z.
for (const [id, pf] of [["0c4a0ca7", { republish_step: "recreated", vinted_item_id: "10769248285" }], ["222227a3", { republish_step: "recreated", vinted_item_id: "10804741521" }]]) {
  ok(tardif({ statutEnBase: "published", statutDemande: "failed", action: "republish", pf }), `${id} : le « failed » tardif est refusé`);
}

if (ko) { console.log(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ une republication réussie ne se défait jamais par un rapport tardif");
