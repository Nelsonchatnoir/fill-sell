// ═══════════════════════════════════════════════════════════════════════════
// UNE ATTENTE CLOSE NE LAISSE AUCUN MARQUEUR (25/10, Thibault 44d125ac) — `npm run selftest:etat-terminal`
// ═══════════════════════════════════════════════════════════════════════════
// Republication Vinted « Short » publiée le 25/10 à 11:03 avec les marqueurs d'une pause du 24/10 (needs_user_source,
// needs_user_sans_motif, error_technique, compteurs). Exécute le code LIVRÉ (_shared/etat-terminal.js,
// republication-finie.js) sur la vraie forme de la tâche, puis vérifie que chaque écrivain le branche.
//   1. champsAttenteClose : marqueurs retirés, brut et message ARCHIVÉS (jamais perdus), traces intactes,
//      processing_since gardé (il est lu), rien à réécrire sur une ligne propre, idempotent, jamais de doublon.
//   2. debutAttente : le réveil par capture ne compare plus à la création de la tâche — la capture même qui avait
//      provoqué la pause ne la défait plus.
//   3. La séquence needs_user (capture > 24 h) → réveil → published : une tâche finie SANS aucun marqueur.
//   4. champsRepublicationFinie : la même liste, le brut archivé (il était jeté).
//   5. Le câblage : update-job-status (published / deleted), handler-watch (réveil), ebay-api-worker (marquer).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const importer = (p) => import(pathToFileURL(join(RACINE, p)).href);
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

const { champsAttenteClose, CLES_ATTENTE_CLOSE, debutAttente, porteMarqueursAttente, STATUTS_FINIS_REUSSIS } = await importer("supabase/functions/_shared/etat-terminal.js");
const { champsRepublicationFinie } = await importer("supabase/functions/_shared/republication-finie.js");
const { ENTREES_MAX } = await importer("supabase/functions/_shared/erreurs-archivees.js");

// La tâche 44d125ac telle que relue en base le 25/10 (thibault.md §1), clés utiles.
const BRUT = "Republication en pause AVANT toute suppression : ta capture datait de plus de 24 h et la nouvelle capture a échoué : onglet de travail Vinted : Timeout: la page de dépôt n'a pas fini de charger. Rien n'a été touché, ton annonce est intacte.";
const MESSAGE = "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis l'app.";
const thibault = () => ({
  republish_step: "recreated", vinted_item_id: "10389680588", old_vinted_item_id: "10389680588", new_vinted_item_id: "10522043426",
  capture_id: "18143", deleted_at: "2026-10-25T10:03:15.000Z", deleted_at_serveur: "2026-10-25T10:03:15.000Z",
  suppression_verdict: { http: 200, conclusion: "supprimee", date_serveur: "2026-10-25T10:03:15Z" },
  recreation_envois: ["2026-10-25T10:03:15.000Z", "2026-10-25T10:03:26.768Z"], recreated_at: "2026-10-25T10:03:28.053Z",
  reconciliation: "recréation confirmée par son numéro, retrouvé au dressing",
  needs_user_source: "relancer",
  needs_user_sans_motif: { le: "2026-10-24T10:17:33.023Z", par: "update-job-status", source_posee: "relancer", message: MESSAGE },
  error_technique: { at: "2026-10-24T10:17:32.968Z", pose_par: "update-job-status (requalification affichage G1/G4)", brut: BRUT },
  needs_user_vu_le: "2026-10-24T10:18:01.366Z", needs_user_tick_le: "2026-10-24T10:18:01.366Z", needs_user_vu_erreur: MESSAGE, needs_user_actif_ms: 0,
  processing_since: "2026-10-25T10:02:29Z",
  reveille_par_capture: "17240", reveille_par_capture_le: "2026-10-24T10:18:01.366Z", remis_en_file_le: "2026-10-24T10:18:07.776Z",
  needsUserBoucle: { n: 1 }, needsUserAttempts: 1,
  erreurs_archivees: [
    { le: "2026-10-25T09:55:44Z", statut: "pending", erreur: "En attente : … Samsung…", par: "get-pending-jobs" },
    { le: "2026-10-25T10:03:30.909Z", statut: "pending", erreur: "En file : ta republication passera à son tour…", par: "update-job-status → published" },
  ],
});

console.log("1. champsAttenteClose — la tâche de Thibault");
{
  const pf0 = thibault();
  const { pf, change, retirees } = champsAttenteClose(pf0, { par: "update-job-status → published" });
  ok(change === true, "il y a quelque chose à écrire");
  for (const k of [...CLES_ATTENTE_CLOSE, "error_technique"]) ok(!(k in pf), `« ${k} » retiré`);
  ok(retirees.includes("needs_user_source") && retirees.includes("error_technique") && retirees.includes("needs_user_sans_motif"), "les clés retirées sont nommées", retirees.join(","));
  ok(pf.erreurs_archivees.length === 4, "brut et message archivés : 2 → 4 entrées", String(pf.erreurs_archivees.length));
  const brut = pf.erreurs_archivees.find((e) => e.erreur === BRUT);
  ok(brut && brut.du === "2026-10-24T10:17:32.968Z" && /error_technique/.test(brut.par), "le brut technique archivé avec sa date d'origine", JSON.stringify(brut));
  const msg = pf.erreurs_archivees.find((e) => e.erreur === MESSAGE);
  ok(msg && msg.statut === "needs_user" && msg.du === "2026-10-24T10:18:01.366Z", "le message de l'attente (perdu par le réveil du 24/10) archivé", JSON.stringify(msg));
  ok(pf.processing_since === pf0.processing_since, "processing_since GARDÉ (lu sur les tâches finies : dernier succès, horloge, frise)");
  for (const k of ["republish_step", "suppression_verdict", "recreation_envois", "recreated_at", "reconciliation", "reveille_par_capture", "remis_en_file_le", "needsUserBoucle", "needsUserAttempts", "capture_id", "deleted_at"]) {
    ok(JSON.stringify(pf[k]) === JSON.stringify(pf0[k]), `trace intacte : ${k}`);
  }
  ok(JSON.stringify(pf0) === JSON.stringify(thibault()), "l'objet reçu n'est jamais modifié en place");
  ok(!porteMarqueursAttente(pf) && porteMarqueursAttente(pf0), "porteMarqueursAttente : avant oui, après non");
  const deux = champsAttenteClose(pf, { par: "update-job-status → published" });
  ok(deux.change === false && JSON.stringify(deux.pf) === JSON.stringify(pf), "idempotent : une seconde fermeture n'a rien à écrire (aucune ligne inchangée réécrite)");
  const propre = champsAttenteClose({ republish_step: "recreated", processing_since: "x" }, { par: "t" });
  ok(propre.change === false && !("erreurs_archivees" in propre.pf), "tâche propre : rien à écrire, aucune archive vide créée");
  // Le brut déjà archivé ailleurs (pas en dernière position) n'est jamais dupliqué.
  const deja = champsAttenteClose({ ...thibault(), erreurs_archivees: [{ le: "x", statut: "needs_user", erreur: BRUT, par: "y" }, { le: "z", statut: "pending", erreur: "autre", par: "w" }] }, { par: "t" });
  ok(deja.pf.erreurs_archivees.filter((e) => e.erreur === BRUT).length === 1, "un brut déjà archivé n'est jamais dupliqué");
  const plein = champsAttenteClose({ ...thibault(), erreurs_archivees: Array.from({ length: ENTREES_MAX }, (_, k) => ({ le: "x", statut: "pending", erreur: `e${k}`, par: "p" })) }, { par: "t" });
  ok(plein.pf.erreurs_archivees.length === ENTREES_MAX && plein.pf.erreurs_archivees.at(-1).erreur === MESSAGE, `archive plafonnée à ${ENTREES_MAX}, les plus récentes gardées`);
  const brutTexte = champsAttenteClose({ error_technique: "texte brut seul" }, { par: "t" });
  ok(brutTexte.pf.erreurs_archivees?.[0]?.erreur === "texte brut seul" && !("error_technique" in brutTexte.pf), "un error_technique en texte (ancienne forme) est archivé aussi");
  ok(STATUTS_FINIS_REUSSIS.join(",") === "published,deleted,sold", "les statuts finis réussis : published, deleted, sold");
}

console.log("\n2. debutAttente — le réveil par capture compare au GEL, plus à la création");
{
  const pf = thibault();
  const gel = debutAttente(pf, "2026-10-23T07:11:04Z");
  ok(gel === "2026-10-24T10:18:01.366Z", "le gel de Thibault : 24/10 12:18 Paris (première observation de l'attente)", gel);
  const capture17240 = "2026-10-23T07:25:34Z";   // la capture que l'extension venait de juger trop vieille
  const capture18143 = "2026-10-25T08:24:17Z";
  ok(!(capture17240 > gel), "la capture 17240 (23/10) ne réveille plus la pause qu'elle a provoquée (35 s après sa pose, le 24/10)");
  ok(capture18143 > gel, "une capture faite APRÈS le gel (18143, 25/10) la réveille");
  ok(capture17240 > "2026-10-23T07:11:04Z", "… alors que la comparaison d'avant (création de la tâche) la laissait passer");
  ok(debutAttente({}, "2026-10-23T07:11:04Z") === "2026-10-23T07:11:04Z", "sans marqueur : la création, comme avant");
  ok(debutAttente({ error_technique: { at: "2026-10-01T00:00:00Z" }, needs_user_vu_le: "2026-10-02T00:00:00Z" }, null) === "2026-10-02T00:00:00.000Z", "le plus récent des marqueurs");
}

console.log("\n3. La séquence needs_user (capture > 24 h) → réveil → published");
{
  const { archiverErreur } = await importer("supabase/functions/_shared/erreurs-archivees.js");
  // Le réveil (handler-watch) : motif archivé, puis attente close.
  const avantReveil = thibault();
  delete avantReveil.recreated_at;
  const reveil = champsAttenteClose({ ...avantReveil, erreurs_archivees: archiverErreur(avantReveil.erreurs_archivees, MESSAGE, "needs_user", "handler-watch (réveil par capture fraîche)") },
    { par: "handler-watch (réveil par capture fraîche)" }).pf;
  ok(!porteMarqueursAttente(reveil), "après le réveil : plus aucun marqueur (error_technique et needs_user_sans_motif compris)");
  // Puis l'extension publie : elle renvoie le platform_fields complet (ici celui du réveil + ses champs de dépôt).
  const corps = { ...reveil, republish_step: "recreated", recreated_at: "2026-10-25T10:03:28.053Z", processing_since: "2026-10-25T10:02:29Z" };
  const fin = champsAttenteClose(corps, { par: "update-job-status → published" });
  ok(!porteMarqueursAttente(fin.pf) && fin.change === false, "published : rien à retirer (la règle a tenu à chaque étape)");
  ok(fin.pf.erreurs_archivees.some((e) => e.erreur === BRUT) && fin.pf.erreurs_archivees.some((e) => e.erreur === MESSAGE), "erreurs_archivees garde le brut ET le message");
  // L'extension d'avant 0.6.144 renvoie encore un vieux platform_fields avec les marqueurs : published les retire.
  const vieux = champsAttenteClose({ ...thibault() }, { par: "update-job-status → published" });
  ok(!porteMarqueursAttente(vieux.pf), "un poste qui renvoie les vieux marqueurs : published les retire quand même (point de passage unique)");
}

console.log("\n4. champsRepublicationFinie — la même liste, le brut archivé");
{
  const pf = champsRepublicationFinie(thibault(), "10522043426", "handler-watch (republication recréée)", "2026-10-25T11:00:00Z");
  ok(!porteMarqueursAttente(pf), "aucun marqueur d'attente");
  ok(pf.erreurs_archivees.some((e) => e.erreur === BRUT), "le brut technique ARCHIVÉ (il était jeté)");
  ok(!("needsUserAttempts" in pf) && !("processing_since" in pf), "propre à cette clôture : essais et prise en charge retirés, comme avant");
  ok(pf.republication_finie?.annonce === "10522043426" && pf.republish_step === "recreated", "republication_finie posée, l'étape gardée");
}

console.log("\n5. Le câblage");
{
  const uj = lire("supabase/functions/update-job-status/index.ts");
  const bloc = uj.slice(uj.indexOf("UNE TÂCHE FINIE N'ATTEND PLUS PERSONNE"), uj.indexOf("UNE TÂCHE FINIE N'ATTEND PLUS PERSONNE") + 2200);
  ok(/import \{ champsAttenteClose \} from "\.\.\/_shared\/etat-terminal\.js";/.test(uj), "update-job-status importe la liste unique");
  ok(/if \(statutEffectif === "published" \|\| statutEffectif === "deleted"\) \{/.test(bloc) && /champsAttenteClose\(pfT, \{ par: `update-job-status → \$\{statutEffectif\}` \}\)/.test(bloc)
    && /if \(close\.change\) \{/.test(bloc), "update-job-status : toute entrée en published / deleted ferme l'attente (ligne inchangée jamais réécrite)");
  ok(uj.indexOf("UNE TÂCHE FINIE N'ATTEND PLUS PERSONNE") > uj.indexOf("ARCHIVE DE L'ERREUR REMPLACÉE")
    && uj.indexOf("UNE TÂCHE FINIE N'ATTEND PLUS PERSONNE") < uj.indexOf('adminReservation.rpc("ecrire_statut_job_extension"'), "… après l'archive de l'erreur, avant l'écriture");
  ok(/select\("platform_fields"\)\.eq\("id", jobId\)/.test(bloc), "… sans platform_fields dans le corps : ceux de la base, relus");
  const hw = lire("supabase/functions/handler-watch/index.ts");
  const reveil = hw.slice(hw.indexOf("UNE CAPTURE FRAÎCHE ET VALIDE RÉVEILLE LE JOB"), hw.indexOf("UNE TAILLE REFUSÉE QUE LE SERVEUR SAIT DÉSORMAIS SERVIR"));
  // (25/10, décision de Nico : « pour la republication on ne touche à rien, on laisse tel quel ») le moment du réveil
  // reste celui d'avant : la capture postérieure à la CRÉATION de la tâche. debutAttente reste exporté (testé plus haut).
  ok(!/debutAttente/.test(reveil) && /\.gt\("captured_at", String\(j\.created_at\)\)/.test(reveil),
    "handler-watch : le moment du réveil par capture est INCHANGÉ (postérieure à la création de la tâche) — décision de Nico");
  ok(/\.\.\.champsAttenteClose\(\{/.test(reveil) && /"handler-watch \(réveil par capture fraîche\)"/.test(reveil), "handler-watch : le réveil ferme l'attente par la liste unique, le motif archivé");
  const ew = lire("supabase/functions/ebay-api-worker/index.ts");
  ok(/if \(patch\.status === "published" \|\| patch\.status === "deleted"\) pf = champsAttenteClose\(pf, \{ par: `ebay-api-worker → \$\{patch\.status\}` \}\)\.pf;/.test(ew),
    "ebay-api-worker : marquer() ferme l'attente à toute entrée en published / deleted");
  const rf = lire("supabase/functions/_shared/republication-finie.js");
  ok(/import \{ champsAttenteClose \} from "\.\/etat-terminal\.js";/.test(rf) && /champsAttenteClose\(pf, \{ par: posePar \}\)/.test(rf), "republication-finie.js : la liste unique");
}

console.log(`\n${rouges ? "✗" : "✓"} attente close : ${verts} contrôle(s) vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
