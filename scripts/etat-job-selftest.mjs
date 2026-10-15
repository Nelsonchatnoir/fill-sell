// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN JOB, UNE SEULE FOIS — preuve (16/10/2026)
//   node scripts/etat-job-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// supabase/functions/_shared/etat-job.js est LA source : chaque statut
// technique va vers un seul des six mots (En file · En cours · Fait · À toi de
// jouer · En pause · Arrêtée), l'app (fileDesJobs, barres, pastilles) et
// l'extension (copie générée chrome-extension/etat-job.js) ne font qu'afficher.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const E = await imp("supabase/functions/_shared/etat-job.js");
const F = await imp("src/utils/fileDesJobs.js");
const { pastilleCourte } = await imp("src/stock/regles.js");
const { genererEtatJobExtension, CIBLE } = await imp("scripts/gen-etat-job-extension.mjs");

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const M = Date.parse("2026-10-16T08:00:00Z");
const iso = (min) => new Date(M + min * 60000).toISOString();
let n = 0;
const job = (x) => ({ id: `j${++n}`, inventaire_id: 1, platform: "vinted", action: "publish", status: "pending", created_at: iso(-30), platform_fields: {}, error: null, voie: "extension", ...x });
const ctx = { maintenant: M, extension: { etat: "vivante" } };
const e = (j, c = ctx) => E.etatJob(j, c);

console.log("1. SIX MOTS, LES MÊMES PARTOUT");
ok(Object.keys(E.LIBELLES.fr).join(",") === "en_file,en_cours,fait,a_toi,en_pause,arretee", "six états, pas un de plus");
ok(E.libelleEtat("a_toi") === "À toi de jouer" && E.libelleEtat("a_toi", "en") === "Your move", "« À toi de jouer » / « Your move »");
ok(E.libelleEtat("n'importe quoi") === "En file", "un état inconnu retombe sur « En file » (jamais un trou)");

console.log("2. CHAQUE STATUT TECHNIQUE VA VERS UN SEUL ÉTAT");
const cas = [
  [job({}), "en_file", "tour", "pending servable"],
  [job({ voie: "api", platform: "ebay" }), "en_file", "serveurs", "pending par nos serveurs"],
  [job({ status: "processing" }), "en_cours", "ordinateur", "processing"],
  [job({ status: "processing", voie: "api" }), "en_cours", "serveurs", "processing par l'API"],
  [job({ action: "republish", platform_fields: { republish_step: "deleted", deleted_at: iso(-2) } }), "en_cours", "remise_en_ligne", "hors ligne entre retrait et remise en ligne"],
  [job({ status: "published" }), "fait", "publiee", "published"],
  [job({ status: "sold" }), "fait", "vendue", "sold"],
  [job({ status: "dry_run_completed" }), "fait", "publiee", "dry run"],
  [job({ action: "delete", status: "deleted" }), "fait", "retiree", "retrait fait"],
  [job({ action: "republish", status: "processing", platform_fields: { republish_step: "recreated" } }), "fait", "republiee", "republication recréée"],
  [job({ status: "failed" }), "a_toi", "pas_partie", "failed : pas partie, à relancer"],
  [job({ status: "cancelled" }), "arretee", "arretee", "cancelled"],
  [job({ action: "republish", platform_fields: { arret_utilisateur: { le: iso(-1) } } }), "arretee", "arretee", "arrêt demandé par la personne"],
  [job({ status: "needs_user", error: "Taille manquante" }), "a_toi", "geste", "needs_user : une question"],
  [job({ status: "needs_user", platform_fields: { needs_user_source: "opla_acces" }, platform: "opla" }), "a_toi", "opla", "Opla à autoriser"],
  [job({ status: "needs_user", platform_fields: { needs_user_source: "depop_acces" }, platform: "depop" }), "a_toi", "depop", "Depop à autoriser"],
  [job({ status: "needs_user", platform_fields: { needs_user_source: "connexion" } }), "a_toi", "connexion", "needs_user connexion"],
  [job({ status: "needs_user", platform_fields: { needs_user_source: "ebay_connexion_requise" }, platform: "ebay" }), "a_toi", "connexion", "eBay à relier"],
  [job({ status: "needs_user", platform_fields: { needs_user_source: "introuvable_a_confirmer" }, action: "republish" }), "en_pause", "releve", "« plus en ligne » à confirmer par un relevé"],
  [job({ status: "needs_user", platform_fields: { needs_user_source: "ebay_site_etranger" }, platform: "ebay" }), "en_pause", "ebay_etranger", "eBay sur un site étranger"],
  [job({ status: "needs_user", platform_fields: { needs_user_source: "plateforme_ecartee" } }), "en_pause", "ecartee", "plateforme écartée"],
  [job({ status: "needs_user", action: "republish", error: "Republication en pause AVANT tout retrait : Leboncoin a bloqué notre lecture par une protection anti-robot.", platform_fields: { needs_user_source: "relancer", republish_step: "a_capturer" } }), "en_pause", "technique", "pause technique avant retrait"],
  [job({ status: "needs_user", action: "republish", platform_fields: { needs_user_source: "boutique_etrangere", boutique_etrangere: { motif: "boutique_etrangere", article: "1", login_article: "ornella-vend", pose_par: "handler-watch (origine prouvée du job)" } } }), "en_pause", "boutique", "autre boutique prouvée"],
  [job({ error: "En attente de ta connexion à Vinted", platform_fields: { attente_session: { depuis: iso(-5) } } }), "a_toi", "connexion", "pending qui attend une connexion"],
  [job({ action: "republish", platform_fields: { republish_step: "captured", retenue_serveur: { motif: "isbn_capture_non_standard", depuis: iso(-10) } } }), "en_pause", "retenue_serveur", "retenue serveur"],
  [job({ action: "delete", platform_fields: { retenue_serveur: { motif: "boutique_origine_inconnue", boutiques: ["@a"] } } }), "en_pause", "boutiques_a_ouvrir", "boutique d'origine inconnue"],
  [job({ action: "republish", platform_fields: { republish_step: "captured", attente_boutique: { login: "louis" } } }), "en_pause", "boutique", "attente de boutique (extension)"],
  [job({ error: "x", platform_fields: { next_action_after: iso(20) } }), "en_pause", "essai", "nouvel essai programmé"],
  [job({ error: "Vinted n'a pas répondu" }), "en_pause", "essai", "une erreur sans échéance : nouvel essai"],
  [job({ platform_fields: { gel_livres_le: iso(-100) }, action: "republish" }), "en_pause", "gel", "gel livres"],
];
for (const [j, etat, motif, titre] of cas) {
  const v = e(j);
  ok(v.etat === etat && v.motif === motif, `${titre} → ${etat} (${motif})`, `reçu ${v.etat} (${v.motif})`);
}
ok(e(job({}), { ...ctx, extension: { etat: "eteinte" } }).motif === "ordinateur" && e(job({}), { ...ctx, extension: { etat: "eteinte" } }).etat === "en_pause", "ordinateur éteint → en pause (ordinateur)");
ok(e(job({}), { ...ctx, extension: { etat: "session_expiree" } }).motif === "ordinateur_session", "session de l'extension expirée → en pause (ordinateur_session)");
ok(e(job({}), { ...ctx, extensionAMettreAJour: true }).motif === "mise_a_jour", "extension à mettre à jour → en pause");
ok(e(job({ platform: "beebs" }), { ...ctx, plateformesEnPause: new Set(["beebs"]) }).motif === "plateforme", "plateforme en pause chez nous → en pause");
ok(e(job({ action: "republish" }), { ...ctx, plafond: { retenue: true, motif: "plafond" } }).motif === "limite_jour", "limite du jour → en pause");
ok(e(job({ action: "republish" }), { ...ctx, plafond: { retenue: true, motif: "pause" } }).motif === "rythme", "rythme → en pause");
ok(e(job({ action: "republish", platform_fields: { republish_source: "auto" } }), { ...ctx, creneaux: { vinted: { actif: true, dans_creneau: false } } }).motif === "creneau", "hors créneau → en pause");
ok(e(job({ action: "republish", platform_fields: { republish_source: "auto" } }), { ...ctx, creneaux: { vinted: { actif: false } } }).motif === "auto_en_pause", "module auto en pause → en pause");
ok(e(job({ platform: "opla" }), { ...ctx, oplaAAutoriser: true }).motif === "opla", "Opla à autoriser (verdict serveur) → à toi de jouer");
ok(E.jobFini(job({ status: "published" })) && !E.jobFini(job({})), "jobFini : fini / vivant");

console.log("3. LE TON SUIT L'ÉTAT");
ok(E.tonEtat("fait") === "ok" && E.tonEtat("a_toi") === "regler" && E.tonEtat("a_toi", "pas_partie") === "echec" && E.tonEtat("en_pause") === "neutre", "ok / regler / echec (pas partie) / neutre");

console.log("4. L'APP NE DÉCIDE PLUS : LA FILE ET LES PASTILLES REPRENNENT L'ÉTAT");
for (const [j] of cas) {
  if (E.jobFini(j)) continue;
  const s = F.situationJob(j, { ...ctx, lang: "fr" });
  const v = e(j);
  ok(s.etat === v.etat && s.groupe === v.etat, `file : ${v.etat} (${v.motif}) → groupe ${s.groupe}`, s.raison);
}
ok(pastilleCourte({ genre: "a_regler", plateforme: "leboncoin" }, "fr").texte === "À toi de jouer · LBC", "pastille à régler → « À toi de jouer · LBC »");
ok(pastilleCourte({ genre: "echec", nombre: 2 }, "fr").texte === "À toi de jouer · 2" && pastilleCourte({ genre: "echec" }, "fr").ton === "echec", "pastille échec → « À toi de jouer », rouge");
ok(pastilleCourte({ genre: "en_cours" }, "fr").texte === "En cours" && pastilleCourte({ genre: "confirmation", plateforme: "beebs" }, "fr").texte === "En cours · Beebs", "pastille en cours / vérification → « En cours »");
ok(pastilleCourte({ genre: "attente", jours: 3 }, "fr").texte === "En pause · 3 j" && pastilleCourte({ genre: "pause" }, "fr").texte === "En pause", "pastille attente / pause → « En pause »");
ok(pastilleCourte({ genre: "en_file", plateforme: "opla" }, "fr").texte === "En file · Opla", "pastille en file");
ok(pastilleCourte({ genre: "orpheline" }, "fr").texte === "À toi de jouer", "pastille orpheline → « À toi de jouer »");

console.log("5. L'EXTENSION EMBARQUE LA MÊME RÈGLE, GÉNÉRÉE — JAMAIS RECOPIÉE À LA MAIN");
const copie = fs.readFileSync(join(ROOT, CIBLE), "utf8");
ok(copie === genererEtatJobExtension(), `${CIBLE} est à jour (sinon : node scripts/gen-etat-job-extension.mjs)`);
{
  const bac = {};
  new Function("globalThis", copie)(bac);
  const X = bac.FILLSELL_ETAT_JOB;
  ok(X && typeof X.etatJob === "function", "la copie publie globalThis.FILLSELL_ETAT_JOB.etatJob");
  const memes = cas.every(([j]) => { const a = X.etatJob(j, ctx), b = e(j); return a.etat === b.etat && a.motif === b.motif; });
  ok(memes, "sur les mêmes jobs, la copie rend exactement les mêmes états");
  ok(X.libelleEtat("en_pause") === "En pause" && X.sansEstimation("Reprise automatique dans ~5 min.") === "Reprise automatique.", "libellés et nettoyage des estimations : identiques");
}

console.log("6. AUCUNE ESTIMATION NE PASSE");
const nettoyes = [
  ["Ton annonce est intacte. Reprise automatique dans ~6 min (tentative 2/5).", "Ton annonce est intacte."],
  ["On réessaie tout seuls vers 17:36 — rien à faire de ton côté.", "On réessaie tout seuls."],
  ["Rien à faire de ton côté, nouvel essai automatique dans quelques minutes.", "Rien à faire de ton côté, nouvel essai automatique."],
  ["Nouvel essai automatique dans 2 minutes, avant toute suppression : rien à faire.", "Nouvel essai automatique."],
  ["Elle reprend toute seule dans 30 minutes : l'état sera vérifié.", "Elle reprend toute seule."],
  ["Prochain passage dans 2 min au plus.", ""],
  ["FillSell réessaie toutes les 20 minutes ; si elle ne doit plus être vendue, supprime-la.", "FillSell réessaie."],
  ["Rien n'a été publié.", "Rien n'a été publié."],
  ["Tes annonces Vinted remontent toutes seules dans l'app.", "Tes annonces Vinted remontent toutes seules dans l'app."],
  ["Connecte-toi à Vinted sur ton ordinateur, puis appuie sur « Synchroniser ».", "Connecte-toi à Vinted sur ton ordinateur, puis appuie sur « Synchroniser »."],
];
for (const [avant, apres] of nettoyes) ok(E.sansEstimation(avant) === apres, `« ${avant.slice(0, 60)}… » → « ${apres.slice(0, 60)} »`, `reçu « ${E.sansEstimation(avant)} »`);

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ l'état d'un job est décidé une seule fois, et sans estimation");
