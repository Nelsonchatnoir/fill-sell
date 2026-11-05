// ═══════════════════════════════════════════════════════════════════════════
// Selftest « un mur de connexion lu dans « Mes annonces » Beebs pendant un RETRAIT est dit à la personne » (05/11, R1)
//   npm run selftest:beebs-mur-connexion-retrait
//
// LE CAS : f3aec8cc (d8b07167, « Peignoir spiderman », Beebs 34042975, vendu le 31/10). Pendant le retrait, la lecture
// de « Mes annonces » est renvoyée vers beebs.app/fr/auth sur ses deux onglets ; beebs.js nomme le mur
// (onglets[].mur = "connexion") et resumeLectureMesAnnonces le garde — mais le rapport disait « Page de l'annonce sans
// bouton « Supprimer l'annonce »… nouvel essai… rien à faire » : 4 tentatives brûlées, personne prévenue, l'annonce
// relue EN LIGNE (lecture_etat_retrait « active »). update-job-status ne déclenchait l'attente de session que sur le
// texte ou l'adresse de fin.
// CE QUE CE TEST VERROUILLE (côté SERVEUR seulement — l'extension n'est pas touchée) :
//   A. le juge du mur (_shared/retraits-en-retard.js) : le cas réel le reconnaît ; un onglet lu, aucun mur, une
//      suppression envoyée, une lecture d'un essai précédent ne le reconnaissent pas ;
//   B. update-job-status : 3e déclencheur de l'attente de session, même chemin que les deux autres (retrait Beebs
//      seulement, aucune tentative consommée, « En attente de ta connexion à Beebs… risque de double vente ») ;
//   C. le contrat avec l'extension (beebs.js nomme le mur, le résumé le garde) et l'écran « À régler » (un retrait en
//      attente de session y est une ligne « connexion »).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/retraits-en-retard.js")).href);
const RB = await import(pathToFileURL(join(ROOT, "src/utils/retraitsBloques.js")).href);

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// Les champs RÉELS de f3aec8cc (prod, 05/11, lecture seule), au plus près.
const ERREUR = "Page de l'annonce sans bouton « Supprimer l'annonce », et « Mes annonces » illisible en entier — rien n'a été touché, nouvel essai";
const LECTURE = {
  lu_le: "2026-10-31T15:43:03.883Z", verdict: "illisible",
  onglets: [
    { n: 0, ok: false, mur: "connexion", par: "fetch", http: 200, page: "en_verification", motif: "renvoyée vers www.beebs.app/fr/auth", annoncees: null },
    { n: 0, ok: false, mur: "connexion", par: "fetch", http: 200, page: "en_ligne", motif: "renvoyée vers www.beebs.app/fr/auth", annoncees: null },
  ],
};
const PF = { processing_since: "2026-10-31T15:42:35.259Z", needsUserAttempts: 4, beebs_lecture_mes_annonces: LECTURE,
  lecture_etat_retrait: { etat: "active", http: 200, lu_le: "2026-10-31T15:43:04.199Z", raison: null } };

console.log("[A] Le juge du mur");
{
  const m = M.murConnexionBeebsDeCeRapport(PF, ERREUR);
  ok(m && m.onglets === 2 && /beebs\.app\/fr\/auth/.test(m.motif), "f3aec8cc : mur de connexion lu par CE rapport (deux onglets renvoyés vers /fr/auth)", JSON.stringify(m));
  ok(M.murConnexionBeebsDeCeRapport(PF, "Nouvel essai automatique (tentative 4/5), rien à faire.") != null, "lecture datée de cette prise en main : reconnue sans le texte");
  const vieille = { ...PF, processing_since: "2026-10-31T17:00:00.000Z" };
  ok(M.murConnexionBeebsDeCeRapport(vieille, "Timeout : la page de l'annonce n'a pas répondu") == null, "lecture d'un essai précédent et un autre échec : rien (jamais un reste)");
  ok(M.murConnexionBeebsDeCeRapport(vieille, ERREUR) != null, "lecture identique non réécrite par le background, mais CE rapport parle de « Mes annonces » : reconnue");
  const unLu = { ...PF, beebs_lecture_mes_annonces: { ...LECTURE, onglets: [LECTURE.onglets[0], { ...LECTURE.onglets[1], ok: true, mur: undefined, motif: null, n: 12 }] } };
  ok(M.murConnexionBeebsDeCeRapport(unLu, ERREUR) == null, "un onglet lu : la session est bonne, pas de mur");
  const sansMur = { ...PF, beebs_lecture_mes_annonces: { ...LECTURE, onglets: LECTURE.onglets.map(({ mur: _m, ...o }) => ({ ...o, motif: "page vide" })) } };
  ok(M.murConnexionBeebsDeCeRapport(sansMur, ERREUR) == null, "illisible SANS mur nommé (page vide, anti-robot) : pas un mur de connexion");
  ok(M.murConnexionBeebsDeCeRapport({ ...PF, beebs_suppression_envoyee: { le: "2026-10-31T15:40:00Z", numero: "34042975" } }, ERREUR) == null,
    "suppression déjà envoyée sur ce retrait : jamais « encore en ligne » sans le savoir");
  ok(M.murConnexionBeebsDeCeRapport(null, ERREUR) == null && M.murConnexionBeebsDeCeRapport({}, ERREUR) == null, "sans lecture : rien");
}

console.log("\n[B] update-job-status : le 3e déclencheur");
{
  const U = lire("supabase/functions/update-job-status/index.ts");
  ok(/import \{ murConnexionBeebsDeCeRapport \} from "\.\.\/_shared\/retraits-en-retard\.js";/.test(U), "importe le juge (une seule règle avec l'ops-digest)");
  ok(/const murLectureBeebsS = nommeUnChampS \? null : murConnexionBeebsDeCeRapport\(pfBodyS, brutVerdict\);/.test(U), "lu sur le rapport de l'extension (son platform_fields, son message)");
  ok(/if \(parLeTexte \|\| peutEtreUnMur \|\| murLectureBeebsS\) \{/.test(U), "pré-filtre sans lecture : le mur lu suffit à relire le job");
  ok(/const parLaLecture = murLectureBeebsS != null && jrow\?\.platform === "beebs" && jrow\?\.action === "delete"\n\s*&& !pfBaseS\.beebs_suppression_envoyee;/.test(U),
    "un RETRAIT Beebs seulement, jamais après une suppression envoyée (lu en base)");
  ok(/if \(jrow\?\.platform && \(parLeTexte \|\| parLAdresse \|\| parLaLecture\)\) \{/.test(U), "même chemin que le texte et l'adresse");
  ok(/reconnu_par: parLeTexte \? "texte du verdict" : parLAdresse \? "adresse de fin" : "lecture de « Mes annonces » \(mur de connexion\)",/.test(U), "le marqueur dit ce qui a tranché (relisible en SQL)");
  // Le chemin commun, inchangé : aucune tentative consommée, pending, message du risque.
  const i = U.indexOf("if (jrow?.platform && (parLeTexte || parLAdresse || parLaLecture)) {");
  const bloc = U.slice(i, U.indexOf("raisonRequalif = `session ${jrow.platform} morte", i) + 200);
  ok(/needsUserAttempts: Number\(pfBase\.needsUserAttempts \?\? 0\) \|\| 0,/.test(bloc), "needsUserAttempts : la valeur EN BASE (ce passage n'est pas une tentative)");
  ok(/sondeProuveSession\(/.test(bloc) && /refus_passager: \{/.test(bloc), "session prouvée bonne après le mur : refus passager (3 / 6 / 10 min), comme les deux autres");
  ok(/statutEffectif = "pending";/.test(bloc) && !/statutEffectif = "needs_user"/.test(bloc), "attente de session : pending, jamais needs_user (relancée seule sur preuve de connexion)");
  ok(/`En attente de ta connexion à \$\{label\}\$\{ouSeConnecter\}\$\{geste\} : ton article est vendu mais son annonce est encore ` \+\n\s*`en ligne sur \$\{label\} \(risque de double vente\)\. Le retrait repartira tout seul dès que tu seras reconnecté\(e\)\.`/.test(bloc),
    "message du retrait : « En attente de ta connexion à Beebs dans Chrome : … encore en ligne sur Beebs (risque de double vente) »");
  ok(/const SESSION_REQUISE_RE = \/\^\(\?:Connexion\|Reconnexion\)\\s\+\\S\+\\s\+requise\/i;/.test(U) && /\|\| SESSION_REQUISE_RE\.test\(motifRepriseS\)\);/.test(U),
    "les deux autres déclencheurs sont inchangés");
}

console.log("\n[C] Le contrat avec l'extension et l'écran « À régler »");
{
  const B = lire("chrome-extension/content-scripts/beebs.js");
  ok(/if \(\/\\\/\(\?:auth\|login\|signin\|connexion\)\(\?:\\\/\|\$\)\/i\.test\(finale\.pathname\)\) out\.mur = "connexion";/.test(B), "beebs.js nomme le mur (page de connexion de Beebs)");
  ok(/\.\.\.\(p\.mur \? \{ mur: p\.mur \} : \{\}\),/.test(B), "resumeLectureMesAnnonces le garde, par onglet");
  ok(/lectureMesAnnonces: resumeLectureMesAnnonces\(preuve\.lecture, preuve\.verdict\)/.test(B), "le retrait le rend avec son résultat");
  const BG = lire("chrome-extension/background.js");
  ok(/pfS0\.beebs_lecture_mes_annonces = lu0;/.test(BG), "le background le pose sur le retrait (platform_fields.beebs_lecture_mes_annonces)");
  // Après le 3e déclencheur : pending + attente_session → une ligne « connexion » dans « À régler ».
  const apres = { action: "delete", status: "pending", platform: "beebs", created_at: "2026-10-31T13:09:00Z", platform_fields: { ...PF, attente_session: { platform: "beebs", reconnu_par: "lecture de « Mes annonces » (mur de connexion)" } } };
  ok(RB.retraitBloqueParConnexion(apres), "« À régler » : le retrait en attente de session est « bloqué par une connexion »");
  const avant = { action: "delete", status: "pending", platform: "beebs", created_at: "2026-10-31T13:09:00Z", error: ERREUR, platform_fields: PF };
  ok(!RB.retraitBloqueParConnexion(avant), "… alors qu'avant, le même retrait n'y était pas (le trou du 31/10)");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — le mur de connexion lu pendant un retrait Beebs est dit à la personne`);
process.exit(ko ? 1 : 0);
