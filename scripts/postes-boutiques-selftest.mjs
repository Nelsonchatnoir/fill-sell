// Selftest — deux postes, deux boutiques Vinted, un compte FillSell (18/10, lot 6 — Louis).
//   npm run selftest:postes-boutiques
// Louis veut son Vinted Pro (@evat 371531) sur son PC et son Vinted perso (@neyenonie 247512093) sur une VM, un seul
// compte Leboncoin. Ce qui est garanti (_shared/poste-extension.ts, get-pending-jobs, update-job-status) :
//   1. un job Vinted d'une boutique tenue par un AUTRE poste vivant est laissé à ce poste (il reste en file) ;
//   2. un seul poste vivant, une seule boutique, ou l'identité du poste inconnue : RIEN ne change ;
//   3. la boutique « auto » d'une publication sans boutique, posée par l'autre poste, ne bascule pas à chaque poll ;
//   4. le mur Leboncoin de la VM ne tombe plus toutes les 2 h quand le PC réussit sur Leboncoin (7 jours) ;
//   5. ce que le poste dit au poll (≥ 0.6.126) est relu et borné ; les gardes de l'extension donnent sa boutique.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  identiteVintedDuPoste, routageBoutiquesActif, posteLaisseJobVinted, boutiqueAutoTenueParAutrePoste,
  murDuPosteTient, posteSeDitDeconnecte, patchPosteDuPoll, identiteVintedDesGardes, posteCourt,
} from "../supabase/functions/_shared/poste-extension.ts";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("postes-boutiques-selftest");

const T = Date.parse("2026-10-18T12:00:00Z");
const il = (min) => new Date(T - min * 60_000).toISOString();
const PRO = "371531", PERSO = "247512093";
const PC = "11111111-aaaa-bbbb-cccc-000000000001", VM = "22222222-aaaa-bbbb-cccc-000000000002";
const postes = (x = {}) => ({
  [PC]: { le: il(1), vinted_user_id: PRO, vinted_le: il(5), vinted_source: "poll", ...(x.pc ?? {}) },
  [VM]: { le: il(2), vinted_user_id: PERSO, vinted_le: il(3), vinted_source: "garde", ...(x.vm ?? {}) },
});

cas("identité du poste : fraîche (30 min) seulement, un numéro Vinted seulement", () => {
  assert.equal(identiteVintedDuPoste(postes()[PC], T), PRO);
  assert.equal(identiteVintedDuPoste({ vinted_user_id: PRO, vinted_le: il(31) }, T), null, "trop vieille : inconnue");
  assert.equal(identiteVintedDuPoste({ vinted_user_id: "evat", vinted_le: il(1) }, T), null, "un pseudo n'est pas une preuve");
  assert.equal(identiteVintedDuPoste({}, T), null);
  assert.equal(identiteVintedDuPoste(null, T), null);
});

cas("le routage ne s'allume qu'avec DEUX postes vivants (15 min) ET DEUX boutiques confirmées", () => {
  assert.equal(routageBoutiquesActif(postes(), 2, T), true);
  assert.equal(routageBoutiquesActif(postes(), 1, T), false, "une boutique : rien ne change");
  assert.equal(routageBoutiquesActif(postes({ vm: { le: il(16) } }), 2, T), false, "la VM n'a pas pollé depuis 16 min : un seul poste vivant");
  assert.equal(routageBoutiquesActif({ [PC]: postes()[PC] }, 2, T), false, "un seul poste : rien ne change");
});

cas("la VM (perso) laisse le job d'@evat au PC qui l'a ouverte ; le PC le garde ; un job perso reste à la VM", () => {
  const P = postes();
  assert.deepEqual(posteLaisseJobVinted({ postes: P, session: VM, identiteMoi: PERSO, boutiqueJob: PRO, maintenant: T }), { laisser: true, autre: PC });
  assert.deepEqual(posteLaisseJobVinted({ postes: P, session: PC, identiteMoi: PRO, boutiqueJob: PRO, maintenant: T }), { laisser: false, autre: null });
  assert.deepEqual(posteLaisseJobVinted({ postes: P, session: PC, identiteMoi: PRO, boutiqueJob: PERSO, maintenant: T }), { laisser: true, autre: VM });
});

cas("aucune preuve, aucun autre poste sur la bonne boutique : le job est servi comme AVANT (gardes d'avant)", () => {
  const P = postes();
  assert.equal(posteLaisseJobVinted({ postes: P, session: VM, identiteMoi: null, boutiqueJob: PRO, maintenant: T }).laisser, false, "identité de ce poste inconnue");
  assert.equal(posteLaisseJobVinted({ postes: P, session: VM, identiteMoi: PERSO, boutiqueJob: "", maintenant: T }).laisser, false, "boutique du job inconnue");
  assert.equal(posteLaisseJobVinted({ postes: postes({ pc: { vinted_le: il(40) } }), session: VM, identiteMoi: PERSO, boutiqueJob: PRO, maintenant: T }).laisser, false, "identité du PC trop vieille");
  assert.equal(posteLaisseJobVinted({ postes: postes({ pc: { le: il(20) } }), session: VM, identiteMoi: PERSO, boutiqueJob: PRO, maintenant: T }).laisser, false, "PC endormi : la VM le reçoit, ses gardes locales jugent (jamais une file morte)");
  assert.equal(posteLaisseJobVinted({ postes: postes({ pc: { vinted_user_id: "999" } }), session: VM, identiteMoi: PERSO, boutiqueJob: PRO, maintenant: T }).laisser, false, "personne n'a @evat ouverte");
});

cas("la boutique « auto » posée par l'autre poste vivant (toujours sur elle) ne bascule pas", () => {
  const P = postes();
  const auto = { source: "session", poste: posteCourt(PC), le: il(2) };
  assert.equal(boutiqueAutoTenueParAutrePoste({ postes: P, session: VM, auto, boutiqueJob: PRO, maintenant: T }), true);
  assert.equal(boutiqueAutoTenueParAutrePoste({ postes: P, session: PC, auto, boutiqueJob: PRO, maintenant: T }), false, "posée par moi : recalculable");
  assert.equal(boutiqueAutoTenueParAutrePoste({ postes: postes({ pc: { vinted_user_id: PERSO } }), session: VM, auto, boutiqueJob: PRO, maintenant: T }), false, "le PC a changé de boutique : recalculable");
  assert.equal(boutiqueAutoTenueParAutrePoste({ postes: P, session: VM, auto: { source: "defaut" }, boutiqueJob: PRO, maintenant: T }), false, "boutique par défaut : pas concernée");
  assert.equal(boutiqueAutoTenueParAutrePoste({ postes: P, session: VM, auto: { source: "session" }, boutiqueJob: PRO, maintenant: T }), false, "ancienne trace sans poste : comme avant");
});

cas("mur Leboncoin de la VM : 2 h comme avant ; au-delà, il TIENT tant que le PC (vivant) réussit sur Leboncoin depuis 7 jours", () => {
  const vm = { le: il(1), mur_leboncoin: il(150) };
  const avecPcOk = { [VM]: vm, [PC]: { le: il(1), ok_leboncoin: il(60 * 24 * 3) } };
  assert.equal(murDuPosteTient({ moi: { le: il(1), mur_leboncoin: il(30) }, pf: "leboncoin", postes: {}, session: VM, maintenant: T }), true, "< 2 h : tient");
  assert.equal(murDuPosteTient({ moi: vm, pf: "leboncoin", postes: avecPcOk, session: VM, maintenant: T }), true, "> 2 h, le PC a réussi il y a 3 jours : tient");
  assert.equal(murDuPosteTient({ moi: vm, pf: "leboncoin", postes: { [VM]: vm, [PC]: { le: il(1), ok_leboncoin: il(60 * 24 * 8) } }, session: VM, maintenant: T }), false, "réussite du PC de plus de 7 jours : tombe comme avant");
  assert.equal(murDuPosteTient({ moi: vm, pf: "leboncoin", postes: { [VM]: vm, [PC]: { le: il(20), ok_leboncoin: il(60) } }, session: VM, maintenant: T }), false, "PC endormi : tombe comme avant");
  assert.equal(murDuPosteTient({ moi: { ...vm, ok_leboncoin: il(10) }, pf: "leboncoin", postes: avecPcOk, session: VM, maintenant: T }), false, "réussite de la VM après le mur : levé");
  assert.equal(murDuPosteTient({ moi: { ...vm, sessions: { leboncoin: true, lu_le: il(5) } }, pf: "leboncoin", postes: avecPcOk, session: VM, maintenant: T }), false, "sa sonde (0.6.126) voit Leboncoin connecté après le mur : levé");
  assert.equal(murDuPosteTient({ moi: { le: il(1) }, pf: "leboncoin", postes: avecPcOk, session: VM, maintenant: T }), false, "jamais de mur : rien");
  assert.equal(posteSeDitDeconnecte({ sessions: { leboncoin: false, lu_le: il(5) } }, "leboncoin", T), true);
  assert.equal(posteSeDitDeconnecte({ sessions: { leboncoin: null, lu_le: il(5) } }, "leboncoin", T), false, "inconnu : rien");
  assert.equal(posteSeDitDeconnecte({ sessions: { leboncoin: false, lu_le: il(20) } }, "leboncoin", T), false, "trop vieux : rien");
  assert.equal(posteSeDitDeconnecte({}, "leboncoin", T), false, "extension d'avant : rien");
});

cas("ce que le poste dit au poll (≥ 0.6.126) : relu, borné ; une extension d'avant ne dit rien", () => {
  assert.deepEqual(patchPosteDuPoll({ vinted_identite: { user_id: PRO, lu_le: il(2) } }, T), { vinted_user_id: PRO, vinted_le: il(2), vinted_source: "poll" });
  assert.deepEqual(patchPosteDuPoll({ vinted_identite: { user_id: PRO, lu_le: il(20) } }, T), {}, "plus de 15 min : ignorée");
  assert.deepEqual(patchPosteDuPoll({ vinted_identite: { user_id: "evat", lu_le: il(1) } }, T), {});
  assert.deepEqual(patchPosteDuPoll({ sessions_poste: { leboncoin: true, vinted: "oui", lu_le: il(1) } }, T),
    { sessions: { lu_le: il(1), vinted: null, leboncoin: true, beebs: null, depop: null, ebay: null } });
  assert.deepEqual(patchPosteDuPoll({}, T), {});
  assert.deepEqual(patchPosteDuPoll(null, T), {});
});

cas("les gardes de l'extension (son onglet) donnent la boutique du poste — 15 min, numéro seulement", () => {
  assert.deepEqual(identiteVintedDesGardes({ garde_boutique: { at: il(1), verdict: "boutique_ok", boutique_article: PRO, boutique_connectee: PRO } }, T), { user_id: PRO, le: il(1) });
  assert.deepEqual(identiteVintedDesGardes({ garde_boutique: { at: il(9), boutique_connectee: PERSO }, garde_boutique_depot: { at: il(2), boutique_lue: PRO } }, T), { user_id: PRO, le: il(2) }, "la plus récente");
  assert.equal(identiteVintedDesGardes({ garde_boutique: { at: il(1), verdict: "identite_inconnue_capture_seule", boutique_connectee: null } }, T), null);
  assert.equal(identiteVintedDesGardes({ garde_boutique: { at: il(16), boutique_connectee: PRO } }, T), null);
  assert.equal(identiteVintedDesGardes(null, T), null);
});

cas("branchements : get-pending-jobs (routage, auto, murs, poll) et update-job-status (dépôt, gardes)", () => {
  const G = lire("supabase/functions/get-pending-jobs/index.ts");
  assert.ok(/Object\.assign\(patchPoste, patchPosteDuPoll\(body\)\);/.test(G), "le poll est lu");
  assert.ok(/const routage = !!sessionId && routageBoutiquesActif\(postesRoutage, loginsDesBoutiques\(profil\?\.vinted_sync_pin\)\.size\);/.test(G));
  assert.ok(/const identitePoste = routage \? identiteVintedDuPoste\(postesRoutage\[String\(sessionId\)\]\) : null;/.test(G), "un seul poste : identité du compte, comme avant");
  assert.ok(/boutiqueSession: identitePoste \?\? identite\?\.user_id \?\? null,/.test(G), "boutique auto = celle de CE poste quand elle est connue");
  assert.ok(/if \(r\.laisser && r\.autre\) \{ laissesAutrePoste\.set\(String\(j\.id\), r\.autre\); continue; \}/.test(G));
  assert.ok(/murDuPosteTient\(\{ moi: p, pf, postes: postesDuCompte, session: sid \}\) \|\| posteSeDitDeconnecte\(p, pf\)/.test(G));
  // La garde de boutique d'avant reste celle du COMPTE (jamais un « à toi » de plus).
  assert.ok(/boutiqueArticle: origine, boutiqueSession: identite\?\.user_id,\n\s+boutiques: profil\?\.vinted_sync_pin\?\.boutiques, lectureFiable: fiable, sessionRequise: false,/.test(G));
  const U = lire("supabase/functions/update-job-status/index.ts");
  assert.ok(/const lue = identiteVintedDesGardes\(g\);/.test(U));
  assert.ok(/vinted_source: "garde"/.test(U) && /vinted_source: "depot"/.test(U));
});

console.log(`postes-boutiques-selftest : ${n} cas verts`);
