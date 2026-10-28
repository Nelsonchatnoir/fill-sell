// `npm run selftest:brut-garde-depop-session` — LE MOTIF BRUT N'EST JAMAIS PERDU ; LA SESSION DEPOP ILLISIBLE N'EST
// PAS UN MOTIF INCONNU (28/10, point 11 — gatignol.pro, « Polo Province Of Canada », job 6584f843).
//
// Ce qui s'est passé (lu en base le 28/10) : huit essais du 26/10 23:37 au 27/10 19:05, tous arrêtés à l'étape
// « session » du connecteur ; le mur « configuration vendeur » de Depop vu le 26/10 23:39 et le 27/10 15:47 (Paris) ; la
// tâche relancée en ÉCLAIREUR à 18:48, deux « Session Depop illisible (reseau) » (18:49, 19:05) classés « motif
// inconnu » — reprises épuisées → « n'a pas abouti après plusieurs essais », la tâche hors de la carte « À régler »
// (eclaireur_le > mur vu), et de tous les bruts il ne restait que le dernier. Ce test tient :
//   A. error_technique garde l'historique de ses bruts (precedents, 5 au plus) — `brut` reste le dernier ;
//   B. pas-de-rouge : « Session Depop illisible (…) » après un mur vendeur VU → retour à l'attente du geste du compte
//      (source depop_vendeur, message du compte) — la tâche revient dans la carte ; sans mur : reprise espacée, puis
//      un message vrai (jamais « on ne sait pas ») ; un retrait n'est jamais arrêté ; les autres plateformes intactes ;
//   C. update-job-status : le brut est gardé dès que l'affichage le réécrit, après la question en français et avant
//      l'archive ; `pose_par` dit qui a réécrit ;
//   D. lens-analysis : une étiquette de chaussure multi-systèmes se lit sur sa ligne EUR (Air Max de mataich67 :
//      « 26 » — le CM d'une étiquette Nike — posé comme pointure d'un 41).
import { readFileSync } from "node:fs";
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";
import { errorTechniqueAvecHistorique, PRECEDENTS_MAX } from "../supabase/functions/_shared/erreurs-archivees.js";
import { attendVendeurDepop, MESSAGE_VENDEUR_DEPOP, SOURCE_VENDEUR_DEPOP, MOTIF_VENDEUR_DEPOP } from "../supabase/functions/_shared/vendeur-depop.js";

const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").split("\r\n").join("\n");
let ok = 0, ko = 0;
const dit = (nom, c, detail) => { if (c) ok++; else ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

console.log("\nA. error_technique : l'historique des bruts");
{
  const e1 = errorTechniqueAvecHistorique(null, "Session Depop illisible (reseau) : rien n'a été envoyé, nouvel essai plus tard.", "update-job-status (pas-de-rouge : inconnu_reprise → reprise)", "2026-10-27T16:49:35Z");
  dit("premier brut : brut, at, pose_par — pas d'historique", e1.brut.startsWith("Session Depop illisible") && e1.at === "2026-10-27T16:49:35Z" && !e1.precedents);
  const e2 = errorTechniqueAvecHistorique(e1, "Depop demande de terminer ta configuration de vendeur", "update-job-status (x)", "2026-10-27T17:05:31Z");
  dit("deuxième brut, différent : le premier passe dans precedents", e2.precedents?.length === 1 && e2.precedents[0].brut === e1.brut && e2.precedents[0].at === e1.at);
  const e3 = errorTechniqueAvecHistorique(e2, e2.brut, "update-job-status (x)", "2026-10-27T18:00:00Z");
  dit("même brut répété : rien de plus dans precedents", e3.precedents?.length === 1 && e3.at === "2026-10-27T18:00:00Z");
  let e = null;
  for (let i = 0; i < 9; i++) e = errorTechniqueAvecHistorique(e, `brut ${i}`, "p", `2026-10-27T1${i}:00:00Z`);
  dit(`plafond : ${PRECEDENTS_MAX} précédents au plus, les plus récents`, e.precedents.length === PRECEDENTS_MAX && e.precedents.at(-1).brut === "brut 7" && e.brut === "brut 8");
  dit("brut vide : error_technique inchangé", errorTechniqueAvecHistorique(e1, "  ", "p") === e1);
  dit("un ancien error_technique (sans precedents, pose_par figé) est relu tel quel",
    errorTechniqueAvecHistorique({ brut: "ancien", at: "2026-10-01T00:00:00Z", pose_par: "update-job-status (requalification affichage G1/G4)" }, "neuf", "p").precedents[0].pose_par === "update-job-status (requalification affichage G1/G4)");
}

console.log("\nB. pas-de-rouge : « Session Depop illisible »");
{
  const BRUT = "Session Depop illisible (reseau) : rien n'a été envoyé, nouvel essai plus tard.";
  const murVu = { quoi: MOTIF_VENDEUR_DEPOP, at: "2026-10-27T14:47:28.407Z", detail: MESSAGE_VENDEUR_DEPOP };
  const pfPolo = { last_diagnostic: murVu, needs_user_source: "relancer", vendeur_depop: { n: 5, eclaireur_le: "2026-10-27T17:48:01.873Z", retenue_le: "2026-10-27T12:21:18.668Z" }, pas_de_rouge_reprises: 3 };
  const s = classerEchec({ platform: "depop", action: "publish", brut: BRUT, reecrit: null, essais: 0, pf: pfPolo, reprises: 3 });
  dit("Polo (mur vendeur vu, éclaireur coupé à l'étape session) → l'attente du geste du compte, pas « plusieurs essais »",
    s.verdict === "a_toi" && s.statut === "needs_user" && s.source === SOURCE_VENDEUR_DEPOP && s.message === MESSAGE_VENDEUR_DEPOP, JSON.stringify(s));
  const apres = { platform: "depop", action: "publish", status: "needs_user", platform_fields: { ...pfPolo, needs_user_source: s.source } };
  dit("… et la tâche revient dans la carte « À régler » (relâchée seule quand Depop accepte le vendeur)", attendVendeurDepop(apres) === true);
  dit("avant le correctif, la même tâche n'y était plus (source « relancer », éclaireur après le mur)", attendVendeurDepop({ ...apres, platform_fields: pfPolo }) === false);
  const r0 = classerEchec({ platform: "depop", action: "publish", brut: BRUT, essais: 0, pf: {}, reprises: 0 });
  dit("sans mur vu : reprise espacée (15 min), motif nommé, coupure dite", r0.verdict === "reprise" && r0.motif === "depop_session_illisible" && r0.dansMinutes === 15 && /coupure réseau/.test(r0.message), JSON.stringify(r0));
  const r2 = classerEchec({ platform: "depop", action: "publish", brut: BRUT, essais: 0, pf: {}, reprises: 2 });
  dit("troisième reprise : 180 min", r2.verdict === "reprise" && r2.dansMinutes === 180, JSON.stringify(r2));
  const r3 = classerEchec({ platform: "depop", action: "publish", brut: BRUT, essais: 0, pf: {}, reprises: 3 });
  dit("reprises épuisées : un geste vrai (vérifier la connexion Depop), jamais « on ne sait pas »",
    r3.verdict === "a_toi" && r3.motif === "depop_session_illisible" && /connecté/.test(r3.message) && !/ne sait pas|plusieurs essais automatiques/.test(r3.message), r3.message);
  const http = classerEchec({ platform: "depop", action: "publish", brut: "Session Depop illisible (http_503) : rien n'a été envoyé, nouvel essai plus tard.", essais: 0, pf: {}, reprises: 0 });
  dit("« (http_503) » : même règle, la réponse dite", http.motif === "depop_session_illisible" && /réponse HTTP 503/.test(http.message), JSON.stringify(http));
  const ret = classerEchec({ platform: "depop", action: "delete", brut: BRUT, essais: 0, pf: { last_diagnostic: murVu }, reprises: 4 });
  dit("un RETRAIT n'est jamais arrêté sur ce raté technique (reprise)", ret.verdict === "reprise" && ret.statut === "pending", JSON.stringify(ret));
  const vinted = classerEchec({ platform: "vinted", action: "publish", brut: BRUT, essais: 0, pf: {}, reprises: 0 });
  dit("autre plateforme : inchangé (motif inconnu, comme avant)", vinted.motif === "inconnu_reprise", vinted.motif);
}

console.log("\nC. update-job-status : le brut gardé à chaque réécriture");
{
  const ujs = lire("supabase/functions/update-job-status/index.ts");
  dit("importe errorTechniqueAvecHistorique", /import \{ archiverErreur, errorTechniqueAvecHistorique \} from "\.\.\/_shared\/erreurs-archivees\.js";/.test(ujs));
  dit("plus de pose_par figé : il dit qui a réécrit (raisonRequalif)", !/pose_par: "update-job-status \(requalification affichage G1\/G4\)",/.test(ujs) && /`update-job-status \(\$\{raisonRequalif \?\? "requalification affichage G1\/G4"\}\)`/.test(ujs));
  const iQ = ujs.indexOf("UNE QUESTION SE POSE EN FRANÇAIS, AVEC DES CHOIX FERMÉS");
  const iB = ujs.indexOf("LE MOTIF BRUT EST TOUJOURS GARDÉ");
  const iA = ujs.indexOf("ARCHIVE DE L'ERREUR REMPLACÉE (2026-09-12");
  dit("le brut est gardé APRÈS la question en français et AVANT l'archive", iQ > 0 && iB > iQ && iA > iB);
  const bloc = ujs.slice(iB, iA);
  dit("… seulement quand l'affichage diffère du brut, jamais sur une erreur effacée, jamais deux fois",
    /if \(brutCorps && affiche && affiche !== brutCorps\)/.test(bloc) && /erreurTechniqueBrute == null/.test(bloc) && /String\(avantB\?\.brut \?\? ""\)\.trim\(\) !== brutCorps/.test(bloc));
  dit("… et jamais un point de panne (try/catch)", /\} catch \(e\) \{\s*console\.warn\("\[update-job-status\] brut gardé :"/.test(bloc));
}

console.log("\nD. lens-analysis : l'étiquette de chaussure multi-systèmes");
{
  const lens = lire("supabase/functions/lens-analysis/index.ts");
  dit("EN : la ligne EUR, jamais le CM seul", /is read on its EUR line, with its system \("EUR 41"\); CM, JP or mm is a foot LENGTH, never a shoe size/.test(lens));
  dit("FR : la même règle", /se lit sur sa ligne EUR, avec son système \(« EUR 41 »\) ; CM, JP ou mm est une LONGUEUR de pied, jamais une pointure/.test(lens));
}

console.log(`\n${ko === 0 ? "✓" : "✗"} brut-garde-depop-session : ${ok} contrôles verts, ${ko} rouges`);
process.exit(ko === 0 ? 0 : 1);
