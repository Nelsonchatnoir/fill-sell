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
import { readFileSync } from "node:fs";
import {
  valeurProuveeParJob, valeursProuvees, estIsbnCaptureNonStandard, valeurIsbnCapturee, PREUVES_ISBN_ETABLIES,
  formeIsbnCapture, posteRemetIsbnCapture, valeurIsbnRefuseeParJob, valeursIsbnRefusees, attenteIsbnCapture,
  MESSAGE_ISBN_MISE_A_JOUR, MESSAGE_ISBN_A_VERIFIER,
} from "../supabase/functions/_shared/isbn-capture-preuve.js";
import { BUILD_ISBN_10_TEL_QUEL, BUILD_ISBN_CAPTURE_TEL_QUEL, correctifPourJob, posteAJour, buildMsDe } from "../supabase/functions/_shared/correctifs-extension.js";
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

// 7. (02/10) Les preuves ÉTABLIES ne se relisent plus en base : une lecture
//    en échec (57014 le 01/10 à 22:31) ne peut plus faire « jamais prouvée ».
{
  const etablies = Object.keys(PREUVES_ISBN_ETABLIES);
  ok(etablies.includes("0000000000000"), "0000000000000 est une preuve établie (279c046f, da12dfa5)");
  ok(etablies.every((v) => v === valeurIsbnCapturee(v) && estIsbnCaptureNonStandard(v)), "chaque preuve établie est une valeur non standard sous sa forme comparable");
  ok(valeurProuveeParJob(gobelins()) === "0000000000000" && etablies.includes(valeurProuveeParJob(gobelins())), "la preuve établie est bien celle que les faits de gobelins prouvent");
  ok(Object.isFrozen(PREUVES_ISBN_ETABLIES), "le registre ne se modifie pas à l'exécution");
}

// ── (25/10, décision de Nico) LA VALEUR D'ORIGINE PART TELLE QUELLE ─────────
// Rég (6f1b1f70) et Vincent A. (×29) : capture « 0000000000 » (10 zéros), postes
// en 0.6.141 — retenus « valeur jamais prouvée » depuis le 18/10.
const B069 = "2026-09-26T21:00:00Z+0000000 · v0.6.69";
const B141 = "2026-10-24T21:18:48Z+a07091c";
const B143 = "2099-01-01T00:00:00Z+0000000 · v0.6.143"; // le BUILD_ID que Nico posera au paquet
console.log("\n8. La forme × le build : ce que le poste sait remettre");
ok(formeIsbnCapture("0000000000000") === "13" && formeIsbnCapture("0000000000") === "10", "13 chiffres / 10 caractères");
ok(formeIsbnCapture("123456789x") === "10" && formeIsbnCapture(" 000-000-0000 ") === "10", "X final (minuscule comprise), tirets et espaces retirés");
ok(formeIsbnCapture("00") === null && formeIsbnCapture("000000000000") === null && formeIsbnCapture("") === null && formeIsbnCapture("ABCDEFGHIJ") === null,
  "« 00 », 12 chiffres, vide, lettres : aucune forme remise");
ok(BUILD_ISBN_10_TEL_QUEL === "2099-01-01T00:00:00Z" || buildMsDe(BUILD_ISBN_10_TEL_QUEL) > buildMsDe(B141),
  `BUILD_ISBN_10_TEL_QUEL = « 2099 » tant que le paquet 0.6.143 n'est pas posé (rien n'est débloqué), puis son BUILD_ID, postérieur à la 0.6.141 (${BUILD_ISBN_10_TEL_QUEL})`);
ok(posteRemetIsbnCapture("0000000000000", B141) && !posteRemetIsbnCapture("0000000000000", B069), "13 chiffres : 0.6.141 oui, 0.6.69 non (avant BUILD_ISBN_CAPTURE_TEL_QUEL)");
ok(posteRemetIsbnCapture("0000000000000", BUILD_ISBN_CAPTURE_TEL_QUEL), "13 chiffres : le build du correctif lui-même");
ok(!posteRemetIsbnCapture("0000000000", B141), "10 caractères : 0.6.141 NON — sa sonde reste désarmée, "+'"isbn": null après le retrait');
ok(posteRemetIsbnCapture("0000000000", B143) && posteRemetIsbnCapture("123456789X", B143), "10 caractères : le paquet qui arme la sonde sur 10 caractères, oui");
ok(!posteRemetIsbnCapture("00", B143) && !posteRemetIsbnCapture("0000000000", null) && !posteRemetIsbnCapture("0000000000", "poste ?"), "autre forme, build absent ou illisible : non");

console.log("\n9. Le disjoncteur : un refus de Vinted sur CE compte, qui dit quelque chose de la valeur");
const refus = (surcharge = {}, pf = {}) => ({
  platform: "vinted", action: "republish", status: "needs_user", handler_build: B141,
  platform_fields: {
    republish_step: "deleted",
    last_diagnostic: 'refus serveur HTTP 400 (/api/v2/item_upload/items) || isbn dans le corps du POST : « …"isbn":"0000000000000"… » || réponse : {"code":99,"message":"Erreurs trouvées","message_code":"validation_error","errors":[{"field":"isbn","value":"Merci d\'entrer un numéro ISBN valide"}],"payload":{}}',
    republish_snapshot: { isbn: "0000000000000" },
    ...pf,
  },
  ...surcharge,
});
ok(valeurIsbnRefuseeParJob(refus()) === "0000000000000", "refus « isbn » d'une republication non publiée, poste qui remettait la valeur : compté");
ok(valeurIsbnRefuseeParJob(refus({}, { last_diagnostic: null, server_required_fields: [{ key: "isbn", label: "ISBN" }] })) === "0000000000000", "refus lu dans les requis du refus (server_required_fields)");
ok(valeurIsbnRefuseeParJob(refus({ status: "published" })) === null, "refusée puis recréée (« gobelins » 279c046f) : pas un refus de la valeur");
ok(valeurIsbnRefuseeParJob(refus({}, { vintedAspects: { isbn: "9782811600174" } })) === null, "la personne a répondu : c'est sa réponse qui est partie");
ok(valeurIsbnRefuseeParJob(refus({}, { republish_snapshot: { isbn: "0000000000" } })) === null, "10 caractères refusés par un 0.6.141 : il ne pouvait pas l'envoyer ("+'"isbn": null) — ne dit rien d\'elle');
ok(valeurIsbnRefuseeParJob(refus({ handler_build: B143 }, { republish_snapshot: { isbn: "0000000000" } })) === "0000000000", "10 caractères refusés par un poste qui les remet : compté");
ok(valeurIsbnRefuseeParJob(refus({}, { last_diagnostic: "photos confirmées en 3 ms" })) === null, "aucun refus sur « isbn » : rien");
ok(valeurIsbnRefuseeParJob(refus({ platform: "leboncoin" })) === null && valeurIsbnRefuseeParJob(refus({}, { republish_snapshot: { isbn: "9782811600174" } })) === null,
  "autre plateforme, ISBN valide : rien");
ok(valeurIsbnRefuseeParJob(refus({}, { last_diagnostic: { quoi: 'x "field":"isbn" y' } })) === "0000000000000", "diagnostic objet : lu aussi");
{
  const s = valeursIsbnRefusees([refus(), refus({ status: "published" }), refus({}, { republish_snapshot: { isbn: "1111111111111" } })]);
  ok(s.size === 2 && s.has("0000000000000") && s.has("1111111111111"), `valeurs refusées du compte : ${[...s].join(", ")}`);
}

console.log("\n10. Ce que la retenue attend — et la phrase, jamais « mets à jour »");
ok(attenteIsbnCapture("0000000000", B141, new Set()) === "mise_a_jour_extension", "10 zéros sur 0.6.141 : attend le poste à jour");
ok(attenteIsbnCapture("0000000000", B143, new Set()) === null, "10 zéros sur le paquet qui les remet : elle PART");
ok(attenteIsbnCapture("0000000000000", B141, new Set()) === null, "13 zéros sur 0.6.141 : elle part (plus de preuve valeur par valeur)");
ok(attenteIsbnCapture("1111111111111", B141, new Set()) === null, "une valeur jamais vue chez Vinted part aussi : la valeur d'origine, telle quelle");
ok(attenteIsbnCapture("0000000000000", B141, new Set(["0000000000000"])) === "refus_vinted_du_compte", "refusée sur ce compte : retenue, annonce intacte");
ok(attenteIsbnCapture("00", B143, new Set()) === "forme_non_remise", "« 00 » : jamais (ni 10 ni 13 caractères)");
ok(attenteIsbnCapture("0000000000000", B069, new Set()) === "mise_a_jour_extension", "13 zéros sur 0.6.69 : attend le poste à jour");
const MET_A_JOUR_RE = /mets?[- ]la à jour|mets à jour|mettre à jour|ferme Chrome/i;
ok(/^En file : cette republication part dès que ton extension FillSell se sera mise à jour toute seule — rien à faire\./.test(MESSAGE_ISBN_MISE_A_JOUR)
  && /intacte/.test(MESSAGE_ISBN_MISE_A_JOUR) && !MET_A_JOUR_RE.test(MESSAGE_ISBN_MISE_A_JOUR), "poste trop ancien : « En file … toute seule — rien à faire », annonce intacte, aucun geste");
ok(!MET_A_JOUR_RE.test(MESSAGE_ISBN_A_VERIFIER) && /intacte/.test(MESSAGE_ISBN_A_VERIFIER), "autre attente : neutre, annonce intacte");
{
  // Les 30 retenues réelles (toutes « 0000000000 ») : 0.6.141 → retenues, message vrai ; paquet 0.6.143 → toutes partent.
  const trente = Array.from({ length: 30 }, () => "0000000000");
  ok(trente.every((v) => attenteIsbnCapture(v, B141, new Set()) === "mise_a_jour_extension"), "les 30 sur 0.6.141 : retenues, « En file »");
  ok(trente.every((v) => attenteIsbnCapture(v, B143, new Set()) === null), "les 30 sur le paquet 0.6.143 : toutes servies (levée au premier poll)");
}

console.log("\n11. Une recréation arrêtée sur "+'"isbn": null avec 10 caractères repart avec le paquet 0.6.143 (correctif)');
{
  const arretee = {
    id: "x", platform: "vinted", action: "republish", status: "needs_user", handler_build: B141,
    error: "Vinted a refusé la remise en ligne : Merci d'entrer un numéro ISBN valide",
    platform_fields: {
      republish_step: "deleted", republish_snapshot: { isbn: "0000000000" },
      last_diagnostic: 'refus serveur HTTP 400 || isbn dans le corps du POST : (forme non reconnue : « …,"catalog_id":2320,"isbn":null,"is_unisex":false… ») || réponse : Merci d\'entrer un numéro ISBN valide',
    },
  };
  const c = correctifPourJob(arretee);
  ok(c?.cle === "vinted_isbn_10_tel_quel" && c.version === "0.6.143", `reconnue : ${c?.cle}`);
  ok(!posteAJour(B141, c) && posteAJour(B143, c), "relancée seulement par un poste qui arme la sonde sur 10 caractères (« 2099 » d'ici là)");
  ok(correctifPourJob({ ...arretee, platform_fields: { ...arretee.platform_fields, republish_snapshot: { isbn: "2724278445" } } }) === null,
    "ISBN-10 VALIDE (il part converti en 13 chiffres) : pas ce défaut");
  ok(correctifPourJob({ ...arretee, platform_fields: { ...arretee.platform_fields, vintedAspects: { isbn: "9782811600174" } } }) === null, "la personne a répondu : pas ce défaut");
  const treize = { ...arretee, handler_build: B069, platform_fields: { ...arretee.platform_fields, republish_snapshot: { isbn: "0000000000000" } } };
  ok(correctifPourJob(treize)?.cle === "vinted_isbn_capture_tel_quel", "13 zéros arrêtés par la 0.6.69 : l'entrée du 27/09, inchangée");
}

console.log("\n12. get-pending-jobs : la garde est posteRemetIsbnCapture && !refusDuCompte — plus de preuve valeur par valeur");
{
  const gpj = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
  const debut = gpj.indexOf("let heldIsbnCapture = 0;");
  const bloc = gpj.slice(debut, gpj.indexOf("let heldPipeline = 0;", debut));
  ok(debut > 0 && bloc.includes("attenteIsbnCapture(v, buildDuPoll, refusDuCompte)") && bloc.includes("posteRemetIsbnCapture(valeurDe(j), buildDuPoll)"),
    "la garde : ce que le poste remet, et le disjoncteur du compte");
  ok(!/valeursProuvees\(|PREUVES_ISBN_CAPTURE|\["banc_isbn_capture"\]|republish_snapshot->>isbn\.in\./.test(gpj), "plus de preuve valeur par valeur, plus de banc, plus de balayage de cross_post_jobs");
  ok(/\.eq\("user_id", user\.id\)\.eq\("platform", "vinted"\)\.eq\("action", "republish"\)\.neq\("status", "published"\)/.test(bloc), "les refus se lisent sur CE compte seulement");
  ok(/if \(!attente && refusIsbnIllisible\) \{ retenus\.add\(String\(j\.id\)\); continue; \}/.test(bloc), "lecture en échec : retenue CE passage, rien écrit");
  ok(bloc.includes('attente === "mise_a_jour_extension" ? MESSAGE_ISBN_MISE_A_JOUR : MESSAGE_ISBN_A_VERIFIER'), "le message de la retenue dit ce qu'elle attend");
  ok(bloc.includes('leverRetenueServeur(pf, maintenant, "poste_remet_la_valeur")'), "levée seule au premier poll d'un poste à jour");
  ok(/normalizeIsbn\(snap\?\.isbn\)\.ok \|\| posteIsbnTelQuel\(snap\?\.isbn\)/.test(gpj) && /texte\(snap\?\.isbn\) && posteIsbnTelQuel\(snap\?\.isbn\)/.test(gpj)
    && /const posteIsbnTelQuel = \(isbn: unknown\) => posteRemetIsbnCapture\(isbn, buildDuPoll\);/.test(gpj),
    "les deux autres usages (déduction, requis de la destination) jugent CETTE valeur : 10 zéros ne partent jamais vers un vieux poste");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
