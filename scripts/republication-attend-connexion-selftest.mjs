// selftest:republication-attend-connexion — VERROU du 15/11/2026 (compte af37fa49, Pro + Cloud payante).
//
// Le cas : la republication Beebs 3382b821 « Bottines Nike enfant 25 noir » arrêtée à l'étape 'deleted' depuis le
// 11/11 16:51 — ancienne annonce retirée par son PC, nouvelle jamais recréée parce que Beebs n'est pas connecté à son
// Cloud (aucune ligne Beebs dans cloud_coffre). Trois défauts, une règle (_shared/recreation-attend-connexion.js) :
//   (a) sa copie Cloud restait en 0.6.189 : l'extension différait la 0.6.191 pour ce job que personne ne servait ;
//   (b) rien ne le disait : pas de message, pas de ligne « À régler », pas de reprise à la connexion ;
//   (c) ses republications Leboncoin (0ff8f06e) et Vinted (20a1d4d2) du MÊME article restaient retenues.
// Ce verrou CASSE si l'un des trois revient. Rouge sur le code d'avant (b442076^… c3cb2d7 : module absent, règle 4 sans
// exception, gpj sans retenues_deleted pour un job non servi), vert après.
//
//   node --import ./scripts/loader-ext.mjs scripts/republication-attend-connexion-selftest.mjs
import { readFileSync } from "node:fs";

let echecs = 0, n = 0;
const ok = (c, m, extra = "") => { n++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.error(`  ✗ ${m}${extra ? ` — ${extra}` : ""}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

let R = null, H = null;
try { R = await import("../supabase/functions/_shared/recreation-attend-connexion.js"); } catch (e) { ok(false, "le module _shared/recreation-attend-connexion.js existe", String(e?.message ?? e)); }
try { H = await import("../supabase/functions/_shared/retenue-hors-ligne.js"); } catch (e) { ok(false, "retenue-hors-ligne.js se charge", String(e?.message ?? e)); }

// Le décor : l'état de prod relu le 15/11 à 19:40 (heure de Paris).
const MAINTENANT = Date.parse("2026-11-15T18:40:00Z");
const BEEBS = {
  id: "3382b821-2f41-4e91-8fe3-c7c7adf76734", user_id: "af37fa49", platform: "beebs", action: "republish", status: "pending",
  inventaire_id: 1793132125939, title: "Bottines Nike enfant 25 noir", error: null, created_at: "2026-11-10T20:49:23Z",
  platform_fields: { republish_step: "deleted", deleted_at: "2026-11-11T16:51:00.487Z", deleted_at_serveur: "2026-11-11T16:51:00.487Z",
    next_action_after: "2026-11-11T16:55:21.095Z" },
};
const COFFRE_DORIANE = [
  { plateforme: "vinted", connecte: true }, { plateforme: "fillsell", connecte: true }, { plateforme: "leboncoin", connecte: true },
];
const LBC = { id: "0ff8f06e", platform: "leboncoin", action: "republish", status: "pending", inventaire_id: 1793132125939,
  platform_fields: { republish_step: "captured", retenue_hors_ligne: { job: BEEBS.id, titre: "Bottines Nike enfant 25 noir" } } };
const VINTED = { id: "20a1d4d2", platform: "vinted", action: "republish", status: "pending", inventaire_id: 1793132125939,
  platform_fields: { republish_step: "captured", retenue_hors_ligne: { job: BEEBS.id, titre: "Bottines Nike enfant 25 noir" } } };
const AUTRE_BEEBS = { id: "26558b28", platform: "beebs", action: "republish", status: "pending", inventaire_id: 1793643385945,
  platform_fields: { republish_step: "captured" } };

if (R) {
  console.log("▸ (b) l'annonce hors ligne est DITE, puis remise en ligne seule à la connexion");
  ok(R.doitAttendreConnexion(BEEBS, { cloudVoie: true, coffre: COFFRE_DORIANE, maintenant: MAINTENANT }), "Beebs absent du coffre d'un compte au Cloud : « à toi de jouer »");
  ok(!R.doitAttendreConnexion(BEEBS, { cloudVoie: true, coffre: [...COFFRE_DORIANE, { plateforme: "beebs", connecte: true }], maintenant: MAINTENANT }), "Beebs connecté au Cloud : rien (la recréation part)");
  ok(R.doitAttendreConnexion(BEEBS, { cloudVoie: true, coffre: [...COFFRE_DORIANE, { plateforme: "beebs", connecte: false }], maintenant: MAINTENANT }), "Beebs « à reconnecter » au coffre : dite aussi");
  ok(!R.doitAttendreConnexion(BEEBS, { cloudVoie: true, coffre: null, maintenant: MAINTENANT }), "coffre illisible : rien (jamais sur un doute)");
  ok(!R.doitAttendreConnexion(BEEBS, { cloudVoie: false, coffre: COFFRE_DORIANE, maintenant: MAINTENANT }), "compte sans Cloud actif : rien ici (l'ordinateur a son attente de session)");
  ok(!R.doitAttendreConnexion(BEEBS, { cloudVoie: null, coffre: COFFRE_DORIANE, maintenant: MAINTENANT }), "drapeau illisible : rien");
  ok(!R.doitAttendreConnexion({ ...BEEBS, status: "processing" }, { cloudVoie: true, coffre: COFFRE_DORIANE, maintenant: MAINTENANT }), "jamais un job en cours");
  ok(!R.doitAttendreConnexion({ ...BEEBS, platform_fields: { ...BEEBS.platform_fields, republish_step: "captured" } }, { cloudVoie: true, coffre: COFFRE_DORIANE, maintenant: MAINTENANT }), "jamais avant le retrait (l'annonce est en ligne)");
  ok(!R.doitAttendreConnexion({ ...BEEBS, platform_fields: { ...BEEBS.platform_fields, deleted_at_serveur: new Date(MAINTENANT - 5 * 60_000).toISOString() } }, { cloudVoie: true, coffre: COFFRE_DORIANE, maintenant: MAINTENANT }), "retirée il y a 5 min : la remise en ligne a sa chance d'abord");
  ok(!R.doitAttendreConnexion({ ...BEEBS, platform: "ebay" }, { cloudVoie: true, coffre: [], maintenant: MAINTENANT }), "eBay (API) n'entre pas ici");

  const p = R.patchAttendConnexion(BEEBS, { maintenant: MAINTENANT });
  ok(p.status === "needs_user" && p.platform_fields.needs_user_source === R.SOURCE_RECREATION_ATTEND_CONNEXION, "needs_user, source nommée");
  ok(p.platform_fields.republish_step === "deleted" && p.platform_fields.deleted_at_serveur === BEEBS.platform_fields.deleted_at_serveur, "l'étape et la preuve du retrait restent (la reprise recrée, jamais un nouveau retrait)");
  ok(!("next_action_after" in p.platform_fields), "l'échéance périmée part");
  ok(/^Connexion Beebs requise : /.test(p.error), "message ancré « Connexion Beebs requise »", p.error);
  ok(/« Bottines Nike enfant 25 noir »/.test(p.error) && /hors ligne sur Beebs depuis le 11\/11/.test(p.error), "il nomme l'annonce, dit « hors ligne », et depuis quand (heure de Paris)", p.error);
  ok(/Connecte Beebs dans l'app/.test(p.error) && /remise en ligne toute seule/.test(p.error) && /Rien n'est perdu/.test(p.error), "le geste, et qu'elle reviendra seule", p.error);
  ok(!/ordinateur|Chrome|extension/i.test(p.error), "jamais l'ordinateur ni Chrome pour un client du Cloud", p.error);

  const pose = { ...BEEBS, status: "needs_user", error: p.error, platform_fields: p.platform_fields };
  ok(!R.leveeAttendConnexion(pose, { cloudVoie: true, coffre: COFFRE_DORIANE }), "toujours pas connecté : on attend");
  ok(R.leveeAttendConnexion(pose, { cloudVoie: true, coffre: [...COFFRE_DORIANE, { plateforme: "beebs", connecte: true }] }), "Beebs connecté au Cloud : levée");
  ok(R.leveeAttendConnexion(pose, { cloudVoie: false, coffre: null }), "Cloud plus actif : levée (l'ordinateur reprend)");
  ok(!R.leveeAttendConnexion(pose, { cloudVoie: true, coffre: null }), "coffre illisible : rien ne bouge");
  ok(!R.leveeAttendConnexion({ ...pose, platform_fields: { ...pose.platform_fields, needs_user_source: "connexion" } }, { cloudVoie: false }), "une autre source n'est jamais touchée");
  const l = R.patchLeveeAttendConnexion(pose, { maintenant: MAINTENANT });
  ok(l.status === "pending" && l.error === null && l.platform_fields.republish_step === "deleted", "levée : en file, à l'étape 'deleted' (la recréation)");
  ok(!("needs_user_source" in l.platform_fields) && l.platform_fields.recreation_attend_connexion_levee?.pose, "la marque part, la trace reste");

  console.log("▸ (b) l'app et le serveur lisent le même mur");
  const stock = lire("src/tabs/StockTab.jsx");
  const ancre = stock.match(/beebs:\s*(\/\^Connexion Beebs requise\/i)/);
  ok(!!ancre && /^Connexion Beebs requise/i.test(p.error), "StockTab (MUR_CONNEXION_ANCRE) : bouton « Me connecter » — celui du Cloud pour un client Cloud (BoutonMeConnecter)");
  const hw = lire("supabase/functions/handler-watch/index.ts");
  ok(/beebs: \/\^Connexion Beebs requise\/i,/.test(hw), "handler-watch (MUR_CONNEXION) : la reprise après reconnexion la voit aussi");
  ok(/^(Connexion|Reconnexion) \S+ requise/i.test(p.error), "relancer_jobs_connexion (base) : même ancre");
  try {
    const { causeARegler } = await import("../src/utils/erreursVisibles.js");
    ok(causeARegler(pose) === "completer", "« À régler » la montre (completer)", String(causeARegler(pose)));
  } catch (e) { ok(false, "erreursVisibles se charge (node --import ./scripts/loader-ext.mjs)", String(e?.message ?? e)); }
  const { PLATEFORMES_CLOUD_VOIE } = await import("../supabase/functions/_shared/cloud-voie.js");
  ok(JSON.stringify([...R.PLATEFORMES_CLOUD]) === JSON.stringify([...PLATEFORMES_CLOUD_VOIE]), "même liste de plateformes que cloud-voie.js");
  ok(/doitAttendreConnexion\(j, /.test(hw) && /patchAttendConnexion\(j, /.test(hw) && /leveeAttendConnexion\(j, e\)/.test(hw) && /patchLeveeAttendConnexion\(j, /.test(hw), "handler-watch pose ET lève (cron, sans poste vivant)");
  ok(/\.eq\("status", "pending"\)\s*\n?\s*\.eq\("platform_fields->>republish_step", "deleted"\)\.select\("id"\)/.test(hw), "pose en compare-and-swap (pending, étape 'deleted')");

  console.log("▸ (a) la mise à jour de l'extension n'attend jamais indéfiniment");
  ok(JSON.stringify(R.retenuesDeletedPourLaMiseAJour([BEEBS], new Set(), MAINTENANT)) === JSON.stringify([BEEBS.id]), "non servie à ce poste : rendue dans retenues_deleted");
  const fraiche = { ...BEEBS, id: "frais", platform_fields: { ...BEEBS.platform_fields, deleted_at_serveur: new Date(MAINTENANT - 10 * 60_000).toISOString() } };
  ok(R.retenuesDeletedPourLaMiseAJour([fraiche], new Set(["frais"]), MAINTENANT).length === 0, "servie à ce poll et retirée il y a 10 min : elle tourne, la mise à jour attend (prudence d'origine)");
  ok(R.retenuesDeletedPourLaMiseAJour([{ ...fraiche, platform_fields: { ...fraiche.platform_fields, deleted_at_serveur: new Date(MAINTENANT - 3 * 3600_000).toISOString() } }], new Set(["frais"]), MAINTENANT).length === 1, `servie mais retirée depuis plus de ${R.LIMITE_MAJ_DIFFEREE_MS / 3600_000} h : la limite tombe`);
  ok(R.retenuesDeletedPourLaMiseAJour([{ ...BEEBS, status: "processing" }], new Set(), MAINTENANT).length === 0, "un job EN COURS diffère toujours (la règle du 12/08)");
  // L'extension servie (0.6.189 au Cloud de Doriane, 0.6.191) : la règle qu'elle applique, relue dans son source.
  const bg = lire("chrome-extension/background.js");
  ok(/noterRetenuesDeletedServeur\(rep\.retenues_deleted\)/.test(bg) && /if \(retenueDeletedParLeServeur\(j\.id\)\) return false;/.test(bg) && /if \(j\.status === "processing"\) return true;/.test(bg),
    "l'extension ne compte plus « en jeu » ce que le serveur rend dans retenues_deleted (≥ 0.6.153) ; 'processing' la diffère");
  // Ce que l'extension aurait décidé pour Doriane, avec la réponse du serveur d'avant et d'après.
  const enJeu = (jobs, retenues) => jobs.filter((j) => j.status === "processing" || (!retenues.includes(j.id) && !(Date.parse(j.platform_fields.next_action_after ?? "") > MAINTENANT)));
  ok(enJeu([BEEBS], []).length === 1, "décor : sans la règle, la 0.6.191 était différée (« 1 republication à l'étape 'deleted' »)");
  ok(enJeu([BEEBS], R.retenuesDeletedPourLaMiseAJour([BEEBS], new Set(), MAINTENANT)).length === 0, "avec la règle : plus rien ne la diffère");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const iRegle = gpj.indexOf("retenuesDeletedPourLaMiseAJour(lignesDel,");
  const iRetour = gpj.indexOf("retenues_deleted: [...retenuesDeleted],");
  ok(iRegle > 0 && iRetour > iRegle, "get-pending-jobs applique la règle juste avant de répondre (sur la file réellement servie)");
  ok(/\.eq\("action", "republish"\)\.eq\("status", "pending"\)\s*\n\s*\.eq\("platform_fields->>republish_step", "deleted"\)\.limit\(20\)/.test(gpj), "une lecture bornée (20), seulement les republications en attente");
}

if (H && R) {
  console.log("▸ (c) les autres plateformes du même article ne sont plus retenues");
  const pose = { ...BEEBS, ...R.patchAttendConnexion(BEEBS, { maintenant: MAINTENANT }) };
  ok(H.frereHorsLigne(LBC, [pose]) === null, "Leboncoin du même article : plus retenu par Beebs qui attend sa connexion");
  ok(H.frereHorsLigne(VINTED, [pose]) === null, "Vinted du même article : plus retenu non plus");
  ok(H.frereHorsLigne(AUTRE_BEEBS, [pose])?.id === BEEBS.id, "GARDE VOLONTAIRE gardée : une seule annonce hors ligne PAR PLATEFORME (les autres Beebs attendent, elle passe la première)");
  ok(!H.idsQuiRetiennent("leboncoin", [pose], LBC.inventaire_id).has(BEEBS.id), "la retenue posée sur Leboncoin se lève (idsQuiRetiennent)");
  ok(H.retenueLevee(LBC.platform_fields, H.idsQuiRetiennent("leboncoin", [pose], LBC.inventaire_id), MAINTENANT)?.retirer.includes("retenue_hors_ligne"), "… et retenueLevee la retire (message « En file »)");
  ok(H.idsQuiRetiennent("beebs", [pose], AUTRE_BEEBS.inventaire_id).has(BEEBS.id), "la retenue Beebs, elle, reste vraie");
  // Règle 4 du 05/11 intacte pour une remise en ligne EN COURS.
  ok(H.frereHorsLigne(LBC, [BEEBS])?.id === BEEBS.id, "remise en ligne EN COURS (pending, sans attente) : le même article reste retenu (règle 4, Mickey du 05/11)");
  const attenteCourte = { ...BEEBS, platform_fields: { ...BEEBS.platform_fields, attente_session: { depuis: new Date(MAINTENANT - 5 * 60_000).toISOString() } } };
  ok(H.frereHorsLigne(LBC, [attenteCourte])?.id === BEEBS.id, "attente de session (pending) : encore « en cours », règle 4");
  // 7cecc29c (15/11, autre compte, ordinateur) : marque attente_session du 11/11 restée sur une republication Leboncoin
  // en REPRISE après interruption — la croire « en attente de connexion » aurait retiré le même article de Beebs.
  const marqueQuiTraine = { id: "7cecc29c", platform: "leboncoin", inventaire_id: 42, error: "Reprise après interruption : ton ordinateur ou Chrome s'est arrêté juste après le retrait de l'annonce",
    platform_fields: { republish_step: "deleted", deleted_at_serveur: "2026-11-15T15:29:26.272Z", attente_session: { depuis: "2026-11-11T15:01:16.854Z" } } };
  ok(H.frereHorsLigne({ id: "66059c76", platform: "beebs", inventaire_id: 42, platform_fields: { republish_step: "captured" } }, [marqueQuiTraine])?.id === "7cecc29c",
    "une vieille marque attente_session ne vaut jamais « attend une connexion » (7cecc29c : le même article reste retenu)");
  ok(!R.attendUneConnexion(marqueQuiTraine) && R.attendUneConnexion(pose), "attendUneConnexion : la source posée par le serveur, et elle seule");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/\.eq\("status", "needs_user"\)\s*\n\s*\.eq\("platform_fields->>republish_step", "deleted"\)\s*\n\s*\.eq\("platform_fields->>needs_user_source", SOURCE_RECREATION_ATTEND_CONNEXION\)\.limit\(20\)/.test(gpj)
    && /\.\.\.\(\(horsLigneAttenteConnexion \?\? \[\]\)/.test(gpj), "get-pending-jobs la compte hors ligne (sa plateforme reste retenue jusqu'à sa remise en ligne)");
  ok(gpj.includes('frere["inventaire_id"] != null && !attendUneConnexion(frere) ?'), "les autres en file : jamais le même article pour une annonce qui attend une connexion");
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${n}` : `\n✓ ${n} vérifications`);
process.exit(echecs ? 1 : 0);
