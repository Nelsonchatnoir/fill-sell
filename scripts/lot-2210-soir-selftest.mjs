// ═══════════════════════════════════════════════════════════════════════════
// LOT DU 22/10 AU SOIR — preuve des points 1c, 3, 5 et 6 (rapport docs/enquetes/lot-2210-soir/RAPPORT.md)
// ═══════════════════════════════════════════════════════════════════════════
//   1c. Un achat Leboncoin annulé se voit dans l'app (7 jours, masquable) — jamais un second mail.
//   3.  Une annonce Leboncoin neuve (modération) ou un lien sans catégorie ne font plus croire « plus en ligne » ;
//       une boutique partagée entre deux comptes reliés se lit sans contradiction (base : migration 20261022200000).
//   5.  La synchro de la personne passe devant la file ENTRE DEUX TÂCHES ; garde absolue : jamais pendant une
//       republication entre retrait et recréation ; double garde : jamais « disparue » ni « vendue ? » pendant.
//   6.  La pause : rien ne part de ce qui n'a pas commencé ; un retrait (vente) n'est JAMAIS en pause ; une
//       republication retirée va au bout ; l'état se voit ; la reprise repart d'où elle s'est arrêtée.
import fs from "node:fs";
import {
  estFileEnPause, jobRetenuParPause, republicationEngagee, syncDemandeeParLaPersonne, passeAvantLaSynchro,
  messageFileEnPause, SYNC_DEVANT_FILE_MS,
} from "../supabase/functions/_shared/file-pause.js";
import { etatJob as etatDuJob, ETATS } from "../supabase/functions/_shared/etat-job.js";
import { achatsAnnulesAMontrer, texteAchatAnnule } from "../src/stock/achatsAnnules.js";
import { lireEtatFile, ETAT_FILE_VIDE } from "../src/stock/etatFile.js";
import { situationJob } from "../src/utils/fileDesJobs.js";
import { phraseLecturesOrigine } from "../src/publication/lectureOrigine.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const job = (x) => ({ id: "j", platform: "vinted", action: "publish", status: "pending", platform_fields: {}, created_at: "2026-10-22T18:00:00Z", ...x });

console.log("6. LA PAUSE");
ok(estFileEnPause({ file_pause: { active: true } }) && !estFileEnPause({ file_pause: { active: false } }) && !estFileEnPause(null), "lue dans platform_settings.file_pause.active");
ok(jobRetenuParPause(job({})) && jobRetenuParPause(job({ action: "republish", platform_fields: { republish_step: "a_capturer" } })), "publication et republication pas commencées : retenues");
ok(!jobRetenuParPause(job({ action: "delete" })), "⛔ un retrait (vente) n'est JAMAIS en pause");
ok(!jobRetenuParPause(job({ action: "republish", platform_fields: { republish_step: "deleted" } })), "une republication dont l'annonce est retirée va au bout");
ok(!jobRetenuParPause(job({ action: "republish", platform_fields: { republish_suppression_envoyee: { le: "x" } } })), "… comme celle dont le retrait est envoyé");
ok(!jobRetenuParPause(job({ status: "processing" })), "une tâche commencée n'est jamais coupée");
ok(/pause/.test(messageFileEnPause(3)) && /retraits après une vente continuent/.test(messageFileEnPause(3)), `la phrase dit que les retraits continuent (« ${messageFileEnPause(3)} »)`);
{
  const ctx = { filePause: true, maintenant: Date.parse("2026-10-22T18:30:00Z"), extension: { etat: "vivante" } };
  const e = etatDuJob(job({}), ctx);
  ok(e.etat === ETATS.EN_PAUSE && e.motif === "file_en_pause", `l'état d'une publication en pause se voit (${e.etat}/${e.motif})`);
  ok(etatDuJob(job({ action: "delete" }), ctx).motif !== "file_en_pause", "un retrait n'est jamais montré « en pause »");
  ok(etatDuJob(job({ action: "republish", platform_fields: { republish_step: "deleted" } }), ctx).motif === "remise_en_ligne", "une republication retirée se montre « en cours » (remise en ligne)");
  const s = situationJob(job({}), { ...ctx, lang: "fr", plateformesEnPause: new Set(), plafond: null, creneaux: null });
  ok(/pause/i.test(JSON.stringify(s)), "la file des jobs dit « en pause »", JSON.stringify(s).slice(0, 200));
}
ok(JSON.stringify(lireEtatFile({ ok: true, pause: true, depuis: "2026-10-22T18:00:00Z", en_pause: 4, synchro_attend_republication: [{ platform: "leboncoin", republication: "x" }] }))
  === JSON.stringify({ pause: true, depuis: "2026-10-22T18:00:00Z", en_pause: 4, synchro_attend_republication: [{ platform: "leboncoin", republication: "x" }] }), "l'app lit l'état de la file (RPC file_etat)");
ok(lireEtatFile(null) === ETAT_FILE_VIDE && lireEtatFile({ ok: false }) === ETAT_FILE_VIDE, "réponse illisible : file servie comme avant (jamais une pause inventée)");

console.log("5. LA SYNCHRO DE LA PERSONNE PASSE DEVANT, ENTRE DEUX TÂCHES");
ok(syncDemandeeParLaPersonne("bouton") && syncDemandeeParLaPersonne("app:redemande") && syncDemandeeParLaPersonne("bouton_distant"), "un geste de la personne (bouton, app)");
ok(!syncDemandeeParLaPersonne("cron") && !syncDemandeeParLaPersonne("veilleur") && !syncDemandeeParLaPersonne("serveur:lecture_origine"), "jamais la veille ni le serveur");
ok(SYNC_DEVANT_FILE_MS === 600000, "10 min au plus devant la file (jamais une file gelée par une demande que personne ne prend)");
ok(passeAvantLaSynchro(job({ action: "delete" })) && passeAvantLaSynchro(job({ action: "republish", platform_fields: { republish_step: "deleted" } })), "les retraits et les republications retirées passent quand même");
ok(!passeAvantLaSynchro(job({})) && !passeAvantLaSynchro(job({ action: "republish" })), "les publications attendent la synchro");
ok(republicationEngagee(job({ action: "republish", platform_fields: { deleted_at: "x" } })) && !republicationEngagee(job({ action: "publish", platform_fields: { deleted_at: "x" } })), "« engagée » = une republication dont le retrait est fait");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/out\.filter\(\(j\) => horsLigne\(j\) \|\| passeAvantLaSynchro\(j\)\)/.test(gpj), "serveur : la demande de la personne ne laisse partir que retraits et republications retirées");
  ok(/rpc\("republication_entre_retrait_et_recreation"/.test(gpj) && /RETENU — republication .* entre le retrait et la recréation/.test(gpj), "serveur : GARDE ABSOLUE — le relevé attend la remise en ligne");
  ok(/filePause = estFileEnPause\(/.test(gpj) && /if \(jobRetenuParPause\(j\)\) idsEnPause\.add/.test(gpj), "serveur : la pause retient ce qui n'a pas commencé");
  ok(/file_en_pause: filePause,/.test(gpj) && /releves_attente_republication:/.test(gpj), "serveur : la réponse dit la pause et le relevé qui attend");
  const bg = lire("chrome-extension/background.js");
  const debutBoucle = bg.indexOf("ENTRE DEUX TÂCHES TERMINÉES");
  const boucle = bg.slice(debutBoucle, bg.indexOf("emitProgress({ jobId: job.id, platform: job.platform, phase: \"processing\" });", debutBoucle));
  ok(/if \(i > 0 && !etapeDeleted\)/.test(boucle), "extension : on ne regarde qu'ENTRE deux tâches (jamais au milieu d'une)");
  ok(/const publication = \(job\.action === "publish" \|\| job\.action === "republish"\) && !engagee;/.test(boucle), "extension : seules les publications pas engagées s'arrêtent (retraits et republications retirées continuent)");
  // (29/10, lot B — boucle du poll) Le geste « Synchroniser » relance le poll 1,5 s après le cycle (selftest repoll-borne).
  ok(/demanderRepoll\(\{ raison: "synchro", cle: "synchro", geste: true \}\)/.test(boucle) && /armerRelanceApresCycle\(\);/.test(bg), "extension : la synchro part au poll qui suit, la file reprend seule");
  ok(/fileEnPauseServeur/.test(bg) && /fillsell_file_pause/.test(lire("chrome-extension/popup.js")), "extension : le popup dit « en pause »");
}

console.log("5. DOUBLE GARDE ET 3. BOUTIQUE PARTAGÉE (en base : 20261022200000)");
{
  const m = lire("supabase/migrations/20261022200000_file_synchro_boutique_partagee.sql");
  ok(/create trigger garde_releve_pendant_republication/.test(m) && /RELEVE_ATTEND_REPUBLICATION/.test(m), "un relevé lancé pendant la fenêtre est refusé (toutes versions de l'extension)");
  ok(/create trigger cross_post_jobs_zz_alerte_tenue/.test(m) && /alerte_ecartee/.test(m), "« Plus en ligne — Vendue ? » jamais posée sur un article en republication");
  ok(/create trigger inventaire_zz_disparu_garde_republication/.test(m), "un article Vinted en republication n'est jamais daté « disparu »");
  ok(/AND public\.republication_engagee\(r\.user_id, ap\.inventaire_id, r\.platform\) IS NULL/.test(m), "un relevé ne constate jamais l'absence d'une annonce en republication");
  ok(/copie_remplacee_par_compte_relie/.test(m) && /sous l'annonce/.test(m), "boutique partagée : la copie remplacée par celle du compte relié est close en le disant (jamais « vendue ? »)");
  ok(/create or replace function public\.retraits_beebs_rearmer_revus/.test(m), "1e : un retrait Beebs clos sans preuve et revu en ligne est réarmé");
}

console.log("3. LEBONCOIN : NI LA MODÉRATION NI UN LIEN SANS CATÉGORIE NE FONT « PLUS EN LIGNE »");
{
  const bg = lire("chrome-extension/background.js");
  ok(/const LBC_MODERATION_MS = 2 \* 3600_000;/.test(bg) && /raison: "moderation_recente"/.test(bg), "une annonce publiée il y a moins de 2 h qui répond 410 : « inconnu », jamais mémorisée morte");
  ok(/url = `https:\/\/www\.leboncoin\.fr\/vi\/\$\{lienSansCategorie\[1\]\}\.htm`;/.test(bg), "un lien « /ad/<id> » (404 chez Leboncoin) est lu sous « /vi/<id>.htm »");
  ok(/async function oublierLbcMorteSiRevue\(/.test(bg), "une mémoire « morte » plus ancienne qu'un relevé qui l'a vue en ligne est oubliée");
}

console.log("1c. UN ACHAT ANNULÉ SE VOIT — AUCUN MAIL");
{
  const M = Date.parse("2026-10-22T18:00:00Z");
  const l = (x) => ({ id: 1, motif: "transaction_annulee_leboncoin", supprimee_le: "2026-10-22T10:00:00Z", titre: "CD Mission: Impossible", plateforme_code: "leboncoin", ...x });
  ok(achatsAnnulesAMontrer([l({})], [], M).length === 1, "un achat annulé de moins de 7 jours se montre");
  ok(achatsAnnulesAMontrer([l({ supprimee_le: "2026-10-10T10:00:00Z" })], [], M).length === 0, "plus de 7 jours : plus montré");
  ok(achatsAnnulesAMontrer([l({})], ["1"], M).length === 0, "« Vu » le masque");
  ok(achatsAnnulesAMontrer([l({ motif: "doublon" })], [], M).length === 0, "seules les annulations d'achat");
  const t = texteAchatAnnule(l({}));
  ok(/Achat annulé sur Leboncoin/.test(t.titre) && /revenu dans ton stock/.test(t.texte) && /Rien à faire/.test(t.texte), `la phrase (« ${t.titre} — ${t.texte} »)`);
  const src = lire("src/stock/achatsAnnules.js");
  ok(!/functions\.invoke|send-email|envoyer_mail|email_logs/.test(src), "⛔ aucun mail : l'app le dit, rien d'autre");
}

console.log("8. LA LIGNE DU STOCK PENDANT LA LECTURE D'ORIGINE");
{
  const p = phraseLecturesOrigine([{ inventaire_id: 1 }, { inventaire_id: 2 }]);
  ok(/2 articles : lecture de leur annonce d'origine/.test(p.titre) && /Rien à faire/.test(p.texte) && !/erreur/i.test(p.texte), `jamais une erreur (« ${p.titre} »)`);
  ok(phraseLecturesOrigine([]) === null, "rien à lire : pas de ligne");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ lot du 22/10 au soir : pause, synchro devant la file, gardes, Leboncoin, achat annulé");
