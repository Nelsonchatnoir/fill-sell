// Autotest : UN ARTICLE BLOQUÉ NE RETIENT JAMAIS LES AUTRES (11/10/2026, Rémi et hu.anastasia).
//
//     npm run selftest:files-repartent
//
// 1. hu.anastasia : un relevé BEEBS demandé par l'app (13:06:54, session Beebs
//    morte, pris seulement à 13:36) a gelé ses 215 republications VINTED
//    pendant 4 polls — la règle « la sync passe devant » retenait TOUS les
//    jobs, de TOUTES les plateformes. Désormais : seulement ceux de SA
//    plateforme, et seulement une demande FRAÎCHE (30 min, dressing compris).
// 2. Rémi (3 boutiques) : 10 republications de @celineetmarie en pause
//    « introuvable_indetermine » alors que leurs annonces étaient en ligne —
//    capturées pendant que Chrome était sur @narema75, sonde users/current en
//    403 (identité illisible). Désormais : (a) la boutique lue SUR LA PAGE par
//    la dernière capture est une source d'identité ; (b) une telle pause se
//    lève seule dès que la bonne boutique est vue connectée — jamais avant,
//    jamais sur une autre, deux fois au plus par tâche.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
const I = await charger("supabase/functions/_shared/introuvable-boutique.js");
const B = await charger("supabase/functions/_shared/boutique-connectee.js");
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");

console.log("1. hu.anastasia : un relevé ne retient que SA plateforme");
const i1 = gpj.indexOf("UN RELEVÉ NE RETIENT QUE SA PLATEFORME");
const bloc1 = gpj.slice(i1, gpj.indexOf("RETENUE D'EXÉCUTION des republications", i1));
ok(i1 > 0 && /if \(syncCommand && syncCommandFrais\) plateformesRelevees\.add\("vinted"\);/.test(bloc1),
  "le relevé du dressing ne retient que Vinted, et seulement frais");
ok(/for \(const c of syncCommandsAnnonces\) if \(relevesFrais\.has\(c\.id\)\) plateformesRelevees\.add\(c\.platform\);/.test(bloc1),
  "un relevé d'annonces ne retient que sa plateforme, et seulement frais");
// (22/10 soir, point 5 — décision de Nico) Une synchro DEMANDÉE PAR LA PERSONNE il y a moins de 10 min passe devant
// toute la file de publications (retraits et republications retirées partent quand même) ; sinon, la règle du 11/10
// reste entière : un relevé ne retient que SA plateforme.
ok(/: out\.filter\(\(j\) => horsLigne\(j\) \|\| !plateformesRelevees\.has\(String\(j\.platform\)\)\);/.test(bloc1)
  && /out = personneDevant\s*\? out\.filter\(\(j\) => horsLigne\(j\) \|\| passeAvantLaSynchro\(j\)\)/.test(bloc1),
  "les jobs des AUTRES plateformes partent dans ce cycle ; une annonce hors ligne ('deleted') jamais retenue");
ok(/if \(ageCmd < SYNC_DEVANT_FILE_MS && syncDemandeeParLaPersonne\(/.test(gpj),
  "seule une demande de la personne de moins de 10 min passe devant toute la file (jamais une file gelée)");
ok(!/out = out\.filter\(horsLigne\);/.test(gpj), "plus aucune retenue de TOUS les jobs derrière un relevé");
ok(/const ageCmd = Date\.now\(\) - Date\.parse\(String\(\(cmds\[0\] as \{ queued_at\?: unknown \}\)\.queued_at \?\? ""\)\);\s*syncCommandFrais = ageCmd < 30 \* 60_000;/.test(gpj)
  && /\.select\("id, queued_at(?:, declencheur)?"\)\s*\.eq\("kind", "dressing"\)/.test(gpj), "le relevé du dressing ne retient plus jusqu'à 6 h : 30 min au plus");
// Le cas rejoué, en logique : relevé Beebs frais, 215 republications Vinted.
const held = (jobs, plats) => jobs.filter((j) => !(j.action === "republish" && j.step === "deleted") && plats.has(j.platform));
const file = Array.from({ length: 215 }, (_, k) => ({ id: k, platform: "vinted", action: "republish", step: "a_capturer" }));
ok(held(file, new Set(["beebs"])).length === 0, "relevé Beebs frais : 0 des 215 republications Vinted retenue (avant : 215)");
ok(held([...file, { platform: "beebs", action: "publish" }], new Set(["beebs"])).length === 1, "relevé Beebs frais : seul le job Beebs attend le relevé");

console.log("2. Rémi : la boutique lue par la capture est une identité");
const T0 = Date.parse("2026-10-11T11:40:00Z");
const sondeVieille = { checked_at: "2026-10-10T13:25:00Z", vinted_identite: { user_id: "295151754", login: "narema75" } };
const capture = { session: "36325065", login_session: "celineetmarie", lu_le: "2026-10-11T11:36:20Z" };
const vu = B.boutiqueConnecteeVinted({ sessions: sondeVieille, run: null, capture, maintenant: T0 });
ok(vu && vu.userId === "36325065" && vu.source === "capture" && vu.fraiche, "capture de 13:36 (celineetmarie) : plus récente que la sonde → identité fraîche");
ok(B.boutiqueConnecteeVinted({ sessions: sondeVieille, run: null, capture: null, maintenant: T0 })?.fraiche === false, "sans capture : sonde périmée → pas fraîche (comme avant)");
ok(B.boutiqueConnecteeVinted({ sessions: null, run: null, capture: { session: "36325065", lu_le: "2026-10-11T10:00:00Z" }, maintenant: T0 })?.fraiche === false,
  "une capture de plus de 30 min ne décide pas");
ok(B.boutiqueConnecteeVinted({ sessions: null, run: null, maintenant: T0 }) === null, "rien de relevé : null, on ne devine pas");
ok(/const vu = boutiqueConnecteeVinted\(\{ sessions, run, capture \}\);/.test(gpj) && /derniereCaptureBoutique\(\),/.test(gpj),
  "la garde de boutique du serveur lit aussi la capture");
ok(/from\("vinted_republish_captures"\)[\s\S]{0,200}\.gte\("captured_at", new Date\(Date\.now\(\) - 30 \* 60_000\)/.test(gpj), "capture lue sur 30 min seulement");

console.log("3. Rémi : la pause « introuvable » posée sous une identité illisible se lève seule");
// Le job e159d1e1, tel qu'en base le 11/10 13:40.
const pause = {
  status: "needs_user", platform: "vinted", action: "republish",
  platform_fields: {
    needs_user_source: "introuvable_indetermine", republish_step: "a_capturer",
    introuvable_404: { at: "2026-10-11T11:02:19.799Z", boutique_article: "36325065", etape: "a_capturer", identite: null, verdict: "identite_inconnue" },
    introuvable_indetermine: { depuis: "2026-10-11T09:00:19.184Z", n: 4, verdict: "identite_inconnue" },
    next_action_after: "2026-10-11T10:03:18.721Z",
  },
};
const bonne = { userId: "36325065", fraiche: true, source: "capture" };
const d = I.leverPauseIntrouvable(pause, bonne, "36325065");
ok(d.lever && d.boutique === "36325065", "celineetmarie vue connectée : la pause se lève");
ok(!I.leverPauseIntrouvable(pause, { userId: "295151754", fraiche: true, source: "sonde" }, "36325065").lever, "narema75 connectée : la pause reste (jamais sur une autre boutique)");
ok(!I.leverPauseIntrouvable(pause, { userId: "36325065", fraiche: false }, "36325065").lever, "identité périmée : la pause reste (jamais avant)");
ok(!I.leverPauseIntrouvable(pause, null, "36325065").lever, "aucune identité : la pause reste");
const disparue = structuredClone(pause); disparue.platform_fields.introuvable_404.verdict = "disparue"; disparue.platform_fields.introuvable_indetermine.verdict = "disparue";
ok(!I.leverPauseIntrouvable(disparue, bonne, "36325065").lever, "404 sous la BONNE boutique (vraie disparition) : jamais levée");
const retiree = structuredClone(pause); retiree.platform_fields.republish_step = "deleted";
ok(!I.leverPauseIntrouvable(retiree, bonne, "36325065").lever, "après un retrait : hors de cette règle");
const deuxFois = structuredClone(pause); deuxFois.platform_fields.introuvable_leve = { n: 2 };
ok(!I.leverPauseIntrouvable(deuxFois, bonne, "36325065").lever, "deux levées déjà faites : plus jamais (aucune boucle)");
const sansBoutique = structuredClone(pause); delete sansBoutique.platform_fields.introuvable_404.boutique_article;
ok(!I.leverPauseIntrouvable(sansBoutique, bonne, null).lever && I.leverPauseIntrouvable(sansBoutique, bonne, "36325065").lever,
  "boutique de l'article : celle notée par la pause, sinon celle de la fiche — jamais devinée");
ok(!I.leverPauseIntrouvable({ ...pause, platform_fields: { ...pause.platform_fields, needs_user_source: "boutique_etrangere" } }, bonne, "36325065").lever,
  "une autre pause : non concernée");
const suite = I.champsApresLevee(pause.platform_fields, "36325065", bonne, new Date(T0));
ok(!suite.needs_user_source && !suite.introuvable_indetermine && !suite.introuvable_404 && !suite.next_action_after
  && suite.introuvable_leve.n === 1 && suite.introuvable_leve.boutique === "36325065" && suite.republish_step === "a_capturer",
  "levée : compteurs remis à zéro, étape a_capturer gardée, trace introuvable_leve");
const iL = gpj.indexOf("« INTROUVABLE » SOUS UNE IDENTITÉ ILLISIBLE = ATTENTE");
const blocL = gpj.slice(iL, gpj.indexOf("const lireFile = () => userClient", iL));
ok(iL > 0 && /\.eq\("platform_fields->>needs_user_source", "introuvable_indetermine"\)/.test(blocL)
  && /leverPauseIntrouvable\(pz as never, vuI/.test(blocL) && /update\(\{ status: "pending", error: null, platform_fields: suite \}\)/.test(blocL)
  && /\.eq\("status", "needs_user"\)/.test(blocL), "câblage gpj : avant la lecture de la file, compare-and-swap sur needs_user");

console.log("4. le compte-gouttes : une tâche reportée ne reprend jamais la tête de la file");
const iP = gpj.indexOf("let heldPipeline = 0;");
const blocP = gpj.slice(iP, gpj.indexOf("heldPipeline = avant - out.length;", iP));
ok(iP > 0 && /const placeDansLaFile = \(j: \{ platform_fields: unknown; created_at\?: unknown \}\) => \{/.test(blocP)
  && /return Math\.max\(Number\.isFinite\(naa\) \? naa : 0, Number\.isFinite\(cree\) \? cree : 0\);/.test(blocP)
  && /cands\.reduce\(\(a, b\) => \(placeDansLaFile\(b\) < placeDansLaFile\(a\) \? b : a\)\)/.test(blocP)
  && !/filePipeline\.find\(/.test(blocP), "le candidat = la plus ancienne place dans la file (création, ou fin d'attente)");
// La file de Rémi rejouée : une tâche en échec (404, attente échue à 12:46) et
// cinq tâches jamais servies, créées le 07/10 après elle.
const place = (j) => Math.max(Date.parse(j.naa ?? "") || 0, Date.parse(j.cree) || 0);
const fileR = [
  { id: "8f76d346", cree: "2026-10-07T08:23:00Z", naa: "2026-10-11T10:46:00Z" },
  ...["c78ca8c4", "55991165", "9fc7af3c", "ad794e50", "857f60c1"].map((id, k) => ({ id, cree: `2026-10-07T08:${30 + k}:00Z` })),
];
const elu = fileR.reduce((a, b) => (place(b) < place(a) ? b : a));
ok(elu.id === "c78ca8c4", "file de Rémi : la tâche reportée (8f76d346) passe APRÈS les cinq jamais servies (avant : elle reprenait la tête)");
ok(fileR.filter((j) => !j.naa).every((j) => place(j) < place(fileR[0])), "aucune tâche jamais servie n'attend derrière une tâche en échec");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
