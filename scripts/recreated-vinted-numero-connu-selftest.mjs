// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une republication Vinted « recreated » dont le numéro est connu » (12/11, lot « zéro problème », N1)
//   npm run selftest:recreated-vinted-numero-connu
//
// LE CAS (11/11, 13:24-13:27 heure de Paris, prouvé par les journaux) : deux republications Vinted, comptes 82e64f14
// (tâche 67cd1c77) et 8a2eba68 (tâche 46569b9d), à la même minute. Retrait de l'ancienne annonce, envoi, onglet renvoyé
// au profil ; la relecture du dressing retrouve la nouvelle annonce par son NUMÉRO (10761660236, 10761658712) —
// `cloreRepublishSurAnnonceExistante` pose l'étape « recreated » et le numéro, puis l'écriture « published » tombe sur
// une panne de la plateforme (update-job-status : 503/504 de 13:24:30 à 13:27, aucune requête servie entre) : l'exception
// rejoint `retenirDepotIncertain`, qui écrit « pending » AVEC l'étape « recreated » et le numéro, sans
// platform_listing_id ; la fiche reste sur l'ANCIEN numéro (supprimé). Depuis : jamais close, jamais servie, jamais dite
// (get-pending-jobs la met de côté ; `decisionRecreatedSansNumero` rendait « rien — le dressing tranche » pour Vinted ;
// le dressing ne tranche qu'à l'étape « deleted »). La nouvelle annonce 10761660236 est vue « active » par les relevés
// du 11/11 13:50 et du 12/11 15:57 (instantanés sans fiche) : une vente sur Vinted ne retrouverait pas la fiche.
//
// CE QUE CE TEST VERROUILLE (_shared/etape-recreated-sans-numero.js, handler-watch, get-pending-jobs) :
//   A. numéro EXACT (new_vinted_item_id ≠ ancien, plus grand que l'ancien) vu « active » par un relevé APRÈS le retrait →
//      « clore » : published sur ce numéro, fiche passée au nouveau numéro (compare-and-set sur l'ancien) ;
//   B. sans preuve : rien avant 6 h (le relevé tranche), la question honnête au bout de 6 h (lien du numéro connu) ;
//      JAMAIS « reprendre » (aucun second dépôt) ; une question déjà posée n'est jamais réécrite ;
//   C. jamais clos : instantané d'avant le retrait (numéro qui existait déjà), statut autre que « active », autre numéro,
//      numéro plus petit que l'ancien ; deux fiches pour un numéro, fiche vendue/supprimée, fiche sur un 3e numéro → question ;
//   D. le patch : published, platform_listing_id, lien, attentes effacées, trace ; la question : needs_user, source
//      « recreation_deja_partie », lien du numéro ;
//   E. handler-watch et get-pending-jobs lisent l'instantané du numéro exact et les fiches qui le portent, déplacent la
//      fiche AVANT d'écrire la tâche, et n'écrivent rien quand le déplacement échoue.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/etape-recreated-sans-numero.js")).href);

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const H = 3600_000;

// Les deux tâches réelles (platform_fields relus en base le 13/11, clés utiles seulement).
const job67 = {
  id: "67cd1c77-eb3b-48b2-8cae-e54e833448b1", user_id: "82e64f14-4d39-4385-b871-ced4cf4c9b76", inventaire_id: 1793287258996,
  platform: "vinted", action: "republish", status: "pending", published_at: null, platform_listing_id: null, listing_url: null,
  error: "Vinted a affiché ton profil juste après l'envoi de ton annonce : FillSell vérifie que ta nouvelle annonce est bien en ligne avant tout nouvel envoi. Rien à faire de ton côté.",
  created_at: "2026-11-11T10:16:09.945Z",
  platform_fields: {
    republish_step: "recreated", vinted_item_id: "10724502193", old_vinted_item_id: "10724502193", new_vinted_item_id: "10761660236",
    recreated_at: "2026-11-11T12:26:15.655Z", deleted_at: "2026-11-11T12:24:21.000Z", deleted_at_client: "2026-11-11T12:24:22.255Z",
    suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-11-11T12:24:21.000Z", http: 200 },
    recreation_envois: ["2026-11-11T12:24:21.000Z", "2026-11-11T12:24:44.935Z"], recreation_tentee: { at: "2026-11-11T12:24:44.935Z", n: 1, une_passe: true },
    vinted_account_id: "3124812123",
    reconciliation: "recréation confirmée par son numéro, retrouvé au dressing (onglet renvoyé au profil par Vinted)",
    depot_incertain: { at: "2026-11-11T12:27:02.741Z", motif: "redirection_profil_sans_copie_lue" },
    next_action_after: "2026-11-11T12:42:02.741Z", processing_since: "2026-11-11T12:23:14.231Z",
  },
};
const job46 = {
  id: "46569b9d-d6a2-40a5-808f-966e9fd1b765", user_id: "8a2eba68-7a2d-4fc1-aab0-aba23189c33b", inventaire_id: 1791219042952003,
  platform: "vinted", action: "republish", status: "pending", published_at: null, platform_listing_id: null, listing_url: null,
  error: job67.error, created_at: "2026-11-10T19:37:10.350Z",
  platform_fields: {
    republish_step: "recreated", vinted_item_id: "10541054198", old_vinted_item_id: "10541054198", new_vinted_item_id: "10761658712",
    recreated_at: "2026-11-11T12:26:07.565Z", deleted_at: "2026-11-11T12:24:20.000Z",
    suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-11-11T12:24:20.000Z", http: 200 },
    recreation_envois: ["2026-11-11T12:24:20.000Z", "2026-11-11T12:24:36.491Z"], vinted_account_id: "3147716342",
    reconciliation: "recréation confirmée par son numéro, retrouvé au dressing (onglet renvoyé au profil par Vinted)",
    depot_incertain: { at: "2026-11-11T12:27:00.567Z", motif: "redirection_profil_sans_copie_lue" },
    next_action_after: "2026-11-11T12:42:00.567Z",
  },
};
// Les instantanés réels du dressing de 82e64f14 pour le numéro 10761660236 (inventaire_id NULL : annonce sans fiche).
const snaps67 = [
  { vinted_item_id: "10761660236", status: "active", captured_at: "2026-11-11T12:50:06.303Z" },
  { vinted_item_id: "10761660236", status: "active", captured_at: "2026-11-12T14:57:21.820Z" },
];
const fiche67 = { ficheExiste: true, ficheStatut: "stock", ficheVintedId: "10724502193", fichesAvecNouveau: [] };
const fiche46 = { ficheExiste: true, ficheStatut: "stock", ficheVintedId: "10541054198", fichesAvecNouveau: [] };
const LE_13 = Date.parse("2026-11-13T08:00:00Z");

console.log("[A] le numéro exact vu « active » après le retrait : published + fiche au bon numéro");
{
  const d = M.decisionRecreatedSansNumero(job67, { ...fiche67, instantanes: snaps67, maintenant: LE_13 });
  ok(d.verdict === "clore" && d.listing_id === "10761660236", "67cd1c77 (82e64f14) : 10761660236 vu « active » le 11/11 13:50 → « clore » (HEAD : « rien », bloquée pour toujours)", JSON.stringify(d));
  ok(d.url === "https://www.vinted.fr/items/10761660236", "lien de la nouvelle annonce", d.url);
  ok(d.fiche && d.fiche.id === 1793287258996 && d.fiche.de === "10724502193" && d.fiche.vers === "10761660236",
    "la fiche passe de l'ancien numéro au nouveau (compare-and-set sur l'ancien)", JSON.stringify(d.fiche));
  const avant = M.decisionRecreatedSansNumero(job67, { ...fiche67, instantanes: snaps67, maintenant: Date.parse("2026-11-11T12:30:00Z") });
  ok(avant.verdict === "clore", "la preuve suffit, quelle que soit l'heure (pas d'attente de 6 h)", JSON.stringify(avant));
  const dejaBonne = M.decisionRecreatedSansNumero(job67, { ficheExiste: true, ficheStatut: "stock", ficheVintedId: "10761660236", instantanes: [], maintenant: LE_13 });
  ok(dejaBonne.verdict === "clore" && !dejaBonne.fiche, "fiche déjà sur le nouveau numéro : close, aucun déplacement (règle du 30/10 gardée)", JSON.stringify(dejaBonne));
  const nu = { ...job67, status: "needs_user", platform_fields: { ...job67.platform_fields, needs_user_source: "recreation_deja_partie", recreated_sans_numero: { verdict: "question", code: "sans_preuve" } } };
  ok(M.decisionRecreatedSansNumero(nu, { ...fiche67, instantanes: snaps67, maintenant: LE_13 }).verdict === "clore", "une question déjà posée se clôt dès que la preuve arrive (handler-watch)");
}

console.log("\n[B] sans preuve : le relevé tranche, la question au bout de 6 h, jamais un second dépôt");
{
  const tot = M.decisionRecreatedSansNumero(job46, { ...fiche46, instantanes: [], maintenant: Date.parse("2026-11-11T15:00:00Z") });
  ok(tot.verdict === "rien", "46569b9d (8a2eba68) le 11/11 16:00 (moins de 6 h) : rien, le relevé tranchera", JSON.stringify(tot));
  const tard = M.decisionRecreatedSansNumero(job46, { ...fiche46, instantanes: [], maintenant: LE_13 });
  ok(tard.verdict === "question" && tard.code === "sans_preuve", "46569b9d le 13/11 (aucun relevé depuis le 10/11) : la question honnête", JSON.stringify(tard));
  ok(/https:\/\/www\.vinted\.fr\/items\/10761658712/.test(tard.message ?? "") && /rien n'est redéposé|Rien n'a été redéposé|rien ne sera redéposé/i.test(tard.message ?? ""),
    "la question donne le lien du numéro connu et dit qu'aucun redépôt n'est fait", tard.message);
  ok(/11\/11 à 13:26/.test(tard.message ?? ""), "heure de Paris dans la question (13:26, jamais l'heure UTC)", tard.message);
  ok(!/ordinateur|Chrome/.test(tard.message ?? ""), "la question ne parle ni d'ordinateur ni de Chrome", tard.message);
  const relance = { ...job46, platform_fields: { ...job46.platform_fields, derniere_relance_manuelle: "2026-11-13T07:00:00Z" } };
  ok(M.decisionRecreatedSansNumero(relance, { ...fiche46, instantanes: [], maintenant: LE_13 }).verdict === "rien", "relancée par la personne il y a 1 h : les 6 h repartent de la relance");
  const posee = { ...job46, status: "needs_user", platform_fields: { ...job46.platform_fields, needs_user_source: "recreation_deja_partie", recreated_sans_numero: { verdict: "question", code: "sans_preuve" } } };
  ok(M.decisionRecreatedSansNumero(posee, { ...fiche46, instantanes: [], maintenant: LE_13 }).verdict === "rien", "question déjà posée, toujours sans preuve : rien (aucune ligne réécrite)");
  const autreNu = { ...job46, status: "needs_user", error: "Étape de republication inconnue : recreated" };
  ok(M.decisionRecreatedSansNumero(autreNu, { ...fiche46, instantanes: [], maintenant: LE_13 }).verdict === "rien", "needs_user d'une autre cause, sans preuve : la question n'écrase rien");
  let jamais = true;
  for (const t of [0, 1, 6, 7, 48, 500]) {
    for (const j of [job46, job67]) {
      const v = M.decisionRecreatedSansNumero(j, { ...fiche46, instantanes: [], maintenant: Date.parse(j.platform_fields.recreated_at) + t * H }).verdict;
      if (v === "reprendre") jamais = false;
    }
  }
  ok(jamais, "Vinted : JAMAIS « reprendre » (aucun second dépôt), à toute heure");
}

console.log("\n[C] jamais clos sans la preuve exacte ; le doute devient une question");
{
  const base = { ...fiche67, maintenant: LE_13 };
  ok(M.decisionRecreatedSansNumero(job67, { ...base, instantanes: [{ ...snaps67[0], captured_at: "2026-11-10T13:44:02Z" }, snaps67[1]] }).verdict !== "clore",
    "numéro déjà vu AVANT le retrait de l'ancienne annonce : ce n'est pas notre remise en ligne → jamais clos");
  ok(M.decisionRecreatedSansNumero(job67, { ...base, instantanes: snaps67.map((s) => ({ ...s, status: "draft" })) }).verdict !== "clore", "instantané « draft » : jamais une preuve");
  ok(M.decisionRecreatedSansNumero(job67, { ...base, instantanes: snaps67.map((s) => ({ ...s, vinted_item_id: "10761660237" })) }).verdict !== "clore", "autre numéro : jamais une preuve (un numéro, jamais un titre)");
  ok(M.decisionRecreatedSansNumero(job67, { ...base, instantanes: [{ vinted_item_id: "10724502193", status: "active", captured_at: "2026-11-12T14:57:21Z" }] }).verdict !== "clore", "l'ANCIEN numéro vu : jamais une preuve");
  const petit = { ...job67, platform_fields: { ...job67.platform_fields, new_vinted_item_id: "10724502100" } };
  ok(M.decisionRecreatedSansNumero(petit, { ...base, instantanes: [{ vinted_item_id: "10724502100", status: "active", captured_at: "2026-11-12T14:57:21Z" }] }).verdict !== "clore",
    "numéro plus petit que l'ancien (né avant lui) : jamais clos");
  const dbl = M.decisionRecreatedSansNumero(job67, { ...base, fichesAvecNouveau: [1799999999999], instantanes: snaps67 });
  ok(dbl.verdict === "question" && dbl.code === "fiche_double" && /fusionne/i.test(dbl.message ?? ""), "une AUTRE fiche porte déjà le nouveau numéro : question (fusionner), jamais un déplacement", JSON.stringify(dbl));
  const vendue = M.decisionRecreatedSansNumero(job67, { ...base, ficheStatut: "vendu", instantanes: snaps67 });
  ok(vendue.verdict === "question" && vendue.code === "fiche_finie" && /retire-la sur Vinted/.test(vendue.message ?? ""), "fiche vendue, nouvelle annonce en ligne : question (risque de double vente dit)", JSON.stringify(vendue));
  const sansFiche = M.decisionRecreatedSansNumero({ ...job67, inventaire_id: null }, { ficheExiste: false, instantanes: snaps67, maintenant: LE_13 });
  ok(sansFiche.verdict === "question" && sansFiche.code === "fiche_finie", "fiche supprimée, nouvelle annonce en ligne : question", JSON.stringify(sansFiche));
  ok(M.decisionRecreatedSansNumero(job67, { ...base, ficheExiste: null, instantanes: snaps67 }).verdict === "rien", "fiche illisible (lecture en échec) : rien ce passage, jamais une question à tort");
  const troisieme = M.decisionRecreatedSansNumero(job67, { ...base, ficheVintedId: "10800000000", instantanes: snaps67 });
  ok(troisieme.verdict === "question" && troisieme.code === "fiche_autre_numero", "fiche passée sur un 3e numéro entre-temps : question, rien déplacé", JSON.stringify(troisieme));
  const lbc = { ...job67, platform: "leboncoin" };
  const avecI = M.decisionRecreatedSansNumero(lbc, { lignes: [], releveDebut: null, ficheStatut: "stock", instantanes: snaps67, maintenant: LE_13 });
  const sansI = M.decisionRecreatedSansNumero(lbc, { lignes: [], releveDebut: null, ficheStatut: "stock" });
  ok(JSON.stringify(avecI) === JSON.stringify(sansI) && avecI.verdict === "reprendre", "Leboncoin : règle du 30/10 inchangée (les instantanés Vinted ne comptent pas)", JSON.stringify([avecI, sansI]));
}

console.log("\n[D] les écritures");
{
  const d = M.decisionRecreatedSansNumero(job67, { ...fiche67, instantanes: snaps67, maintenant: LE_13 });
  const p = M.patchRecreatedSansNumero(job67, d, { par: "test", maintenant: "2026-11-13T08:00:00.000Z" });
  ok(p?.status === "published" && p.platform_listing_id === "10761660236" && p.listing_url === "https://www.vinted.fr/items/10761660236" && p.error === null,
    "clore : published, numéro et lien posés, message effacé", JSON.stringify({ s: p?.status, id: p?.platform_listing_id, url: p?.listing_url }));
  ok(p?.published_at === "2026-11-11T12:26:15.655Z", "published_at = l'heure de la recréation", p?.published_at);
  ok(p && !p.platform_fields.depot_incertain && !p.platform_fields.next_action_after && !p.platform_fields.recreation_attente_releve && p.platform_fields.new_vinted_item_id === "10761660236",
    "attentes effacées (dépôt incertain, échéance), nouveau numéro gardé", JSON.stringify(Object.keys(p?.platform_fields ?? {})));
  ok(p?.platform_fields.recreated_sans_numero?.preuve?.captured_at === "2026-11-11T12:50:06.303Z" && p.platform_fields.recreated_sans_numero?.fiche?.vers === "10761660236",
    "trace : l'instantané qui prouve et le déplacement de la fiche", JSON.stringify(p?.platform_fields.recreated_sans_numero));
  ok(Array.isArray(p?.platform_fields.erreurs_archivees) && p.platform_fields.erreurs_archivees.length >= 1, "l'ancien message est archivé, jamais perdu");
  const q = M.decisionRecreatedSansNumero(job46, { ...fiche46, instantanes: [], maintenant: LE_13 });
  const pq = M.patchRecreatedSansNumero(job46, q, { par: "test", maintenant: "2026-11-13T08:00:00.000Z" });
  ok(pq?.status === "needs_user" && pq.platform_fields.needs_user_source === "recreation_deja_partie" && pq.error === q.message,
    "question : needs_user « recreation_deja_partie », le message dit", JSON.stringify({ s: pq?.status, src: pq?.platform_fields?.needs_user_source }));
  ok(pq?.platform_fields.recreation_deja_partie?.copies?.[0] === "10761658712" && pq.platform_fields.republish_step === "recreated" && pq.platform_listing_id === undefined,
    "question : le numéro connu gardé, l'étape inchangée, aucun numéro posé sur la tâche", JSON.stringify(pq?.platform_fields?.recreation_deja_partie));
  ok(typeof M.ficheARattacherVinted === "function" && M.ficheARattacherVinted(d)?.vers === "10761660236" && M.ficheARattacherVinted(q) === null, "ficheARattacherVinted : seulement pour « clore » avec un déplacement");
}

console.log("\n[E] handler-watch et get-pending-jobs : lecture du numéro exact, fiche d'abord");
for (const f of ["supabase/functions/handler-watch/index.ts", "supabase/functions/get-pending-jobs/index.ts"]) {
  const src = lire(f);
  const i = src.indexOf("decisionRecreatedSansNumero(j,");
  const bloc = src.slice(Math.max(0, i - 4200), i + 3200);
  ok(/from\("vinted_listing_snapshots"\)\s*\.select\("vinted_item_id, status, captured_at"\)[\s\S]{0,200}\.eq\("vinted_item_id", nouveauV\)/.test(bloc),
    `${f.split("/")[2]} : instantanés du numéro EXACT (index user_id, vinted_item_id)`);
  ok(/from\("inventaire"\)\.select\("id"\)[\s\S]{0,120}\.eq\("vinted_item_id", nouveauV\)/.test(bloc), `${f.split("/")[2]} : les fiches qui portent déjà ce numéro`);
  ok(/instantanes:/.test(bloc) && /fichesAvecNouveau:/.test(bloc) && /ficheExiste: j\.inventaire_id == null \? false : \((f|fiche) \? true : null\)/.test(bloc), `${f.split("/")[2]} : le juge reçoit instantanés, fiches, existence de la fiche`);
  const iFiche = bloc.indexOf("ficheARattacherVinted(d)");
  const iJob = bloc.indexOf('from("cross_post_jobs").update(patch)');
  ok(iFiche > 0 && iJob > iFiche, `${f.split("/")[2]} : la fiche est déplacée AVANT l'écriture de la tâche`);
  ok(/\.eq\("vinted_item_id", aRattacher\.de\)|\.is\("vinted_item_id", null\)/.test(bloc) && /if \(!deplacee(?:\?\.length)?\)/.test(bloc), `${f.split("/")[2]} : compare-and-set sur l'ancien numéro ; échec → rien écrit`);
}
{
  const src = lire("supabase/functions/handler-watch/index.ts");
  ok(/\.in\("status", \["pending", "needs_user"\]\)\.eq\("action", "republish"\)\s*\.eq\("platform_fields->>republish_step", "recreated"\)/.test(src),
    "handler-watch relit les tâches existantes (pending ET needs_user) : la règle les répare, jamais une main");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — une republication Vinted « recreated » au numéro connu : close sur la preuve exacte, sinon une question, jamais un second dépôt`);
process.exit(ko ? 1 : 0);
