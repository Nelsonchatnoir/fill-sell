// ═══════════════════════════════════════════════════════════════════════════
// LA FILE DES JOBS ET LES BARRES DES JOBS — preuve (01/10/2026, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// src/utils/fileDesJobs.js et src/utils/barresJobs.js, sur des jobs de la
// forme exacte de cross_post_jobs :
//   · les finis n'entrent jamais dans la file ;
//   · l'ordre de départ est celui de l'extension ;
//   · chaque attente dit pourquoi, avec les six mots de l'état unique
//     (_shared/etat-job.js) — JAMAIS une heure ni une durée ;
//   · la barre d'un job ne dit « fini » que sur un vrai succès, ne déborde pas
//     quand le job n'a pas commencé, s'immobilise quand l'ordinateur est absent.
import { lireFile, situationJob, phraseCompteurs, libelleAction, comparerDepart, depuisQuand, sansEstimation } from "../src/utils/fileDesJobs.js";
import { pisteJob, etapesJob } from "../src/utils/barresJobs.js";
import { plagesDe, valeurDansPlage } from "../src/utils/progression.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};

// 1er octobre 2026, 15:00 à Paris (13:00 UTC).
const M = Date.parse("2026-10-01T13:00:00Z");
const iso = (minutes) => new Date(M + minutes * 60000).toISOString();
let n = 0;
const job = (x) => ({ id: `j${++n}`, inventaire_id: 1, platform: "vinted", action: "publish", status: "pending", created_at: iso(-30), platform_fields: {}, error: null, voie: "extension", ...x });
const ctx = { maintenant: M, lang: "fr", extension: { etat: "vivante" }, plateformesEnPause: new Set(), plafond: null, creneaux: null };
const SANS_HEURE = /\d{1,2}[:h]\d{2}|\bvers\b|\bdans \d|~\s*\d|\bmin\b/;

console.log("1. DEPUIS QUAND — une heure PASSÉE, jamais une heure à venir");
ok(depuisQuand(M - 5 * 60000, M) === "14:55", `aujourd'hui → « 14:55 » (${depuisQuand(M - 5 * 60000, M)})`);
ok(depuisQuand(M - 26 * 3600000, M) === "hier 13:00", `hier → « hier 13:00 » (${depuisQuand(M - 26 * 3600000, M)})`);
ok(/^le \d{1,2} sept\.?$/.test(depuisQuand(M - 5 * 86400000, M)), `plus loin → « le 26 sept. » (${depuisQuand(M - 5 * 86400000, M)})`);

console.log("2. LES FINIS N'ENTRENT PAS");
{
  const finis = [
    job({ status: "published" }), job({ status: "failed" }), job({ status: "cancelled" }), job({ status: "sold" }),
    job({ status: "dry_run_completed" }), job({ action: "delete", status: "deleted" }),
    job({ action: "republish", status: "processing", platform_fields: { republish_step: "recreated" } }),
    job({ action: "republish", status: "pending", platform_fields: { arret_utilisateur: { le: iso(-1) } } }),
  ];
  const f = lireFile(finis, ctx);
  ok(f.total === 0, `aucun des ${finis.length} jobs finis ou arrêtés n'est dans la file (${f.total})`);
  ok(phraseCompteurs(f.compteurs) === "Rien en cours ni en file", "file vide : une phrase, pas un zéro");
}

console.log("3. L'ORDRE DE DÉPART EST CELUI DE L'EXTENSION");
{
  const a = job({ action: "republish", created_at: iso(-60), platform_fields: { republish_step: "captured" } });
  const b = job({ action: "publish", created_at: iso(-10) });
  const c = job({ action: "delete", created_at: iso(-20) });
  const d = job({ action: "republish", created_at: iso(-90), platform_fields: { republish_step: "a_capturer" } });
  const tri = [a, b, c, d].sort(comparerDepart).map((j) => j.id);
  ok(tri.join(",") === [c.id, b.id, d.id, a.id].join(","), `publications et retraits avant les republications, puis l'ancienneté (${tri.join(",")})`);
  const f = lireFile([a, b, c, d, job({ status: "processing", created_at: iso(-1) })], ctx);
  ok(f.en_cours.length === 1 && f.en_cours[0].job.status === "processing", "le job en cours en haut");
  ok(f.en_file.map((l) => l.job.id).join(",") === [c.id, b.id, d.id, a.id].join(","), "puis les autres, dans l'ordre où ils partiront");
  ok(phraseCompteurs(f.compteurs) === "5 en cours ou en file", phraseCompteurs(f.compteurs));
}

console.log("4. CHAQUE ATTENTE DIT POURQUOI, AVEC LE MOT DE L'ÉTAT, SANS HEURE");
{
  const s = (j, c = ctx) => situationJob(j, c);
  ok(s(job({})).raison === "En file : elle partira à son tour" && s(job({})).etat === "en_file", "en file : « En file : elle partira à son tour »");
  ok(s(job({}), { ...ctx, extension: { etat: "eteinte" } }).raison.startsWith("En pause : ton ordinateur est éteint") && s(job({}), { ...ctx, extension: { etat: "eteinte" } }).etat === "en_pause", "Chrome fermé : en pause, et on dit quoi faire");
  ok(s(job({ voie: "api", platform: "ebay" }), { ...ctx, extension: { etat: "eteinte" } }).motif === "serveurs", "eBay par nos serveurs n'attend pas l'ordinateur");
  const retenue = job({ action: "republish", platform_fields: { republish_step: "captured", retenue_serveur: { motif: "isbn_capture_non_standard", depuis: iso(-100) } } });
  ok(s(retenue).raison === "En pause, ton annonce est intacte : elle repart toute seule" && s(retenue).groupe === "en_pause", "retenue serveur : « En pause, ton annonce est intacte »");
  // (03/10, point G) Boutique d'origine inconnue : la retenue NOMME les
  // boutiques à ouvrir — republication comme retrait (« Alphalette » d'Ornella).
  const sansBoutique = job({ action: "delete", platform_fields: { retenue_serveur: { motif: "boutique_origine_inconnue", depuis: iso(-100), boutiques: ["@ornella-vend"] } } });
  ok(s(sansBoutique).raison === "En pause : ouvre @ornella-vend sur vinted.fr dans Chrome — FillSell y cherchera l'annonce, ça repartira tout seul" && s(sansBoutique).groupe === "en_pause",
    "retrait sans boutique : il dit laquelle ouvrir, jamais le silence", s(sansBoutique).raison);
  const repubSansBoutique = job({ action: "republish", platform_fields: { republish_step: "captured", retenue_serveur: { motif: "boutique_origine_inconnue", depuis: iso(-100) } } });
  ok(/^En pause : ouvre sur vinted\.fr, dans Chrome, la boutique qui porte cette annonce/.test(s(repubSansBoutique).raison), "republication sans boutique connue : le geste, sans inventer un nom", s(repubSansBoutique).raison);
  // (03/10, point H) Cause PROUVÉE = l'autre boutique : une attente, pas un geste.
  const autreBoutique = job({ status: "needs_user", action: "republish", platform_fields: { needs_user_source: "boutique_etrangere",
    boutique_etrangere: { motif: "boutique_etrangere", article: "472079", login_article: "ornella-vend", pose_par: "handler-watch (origine prouvée du job)" } } });
  ok(s(autreBoutique).groupe === "en_pause" && s(autreBoutique).raison === "En pause : ouvre ta boutique @ornella-vend sur vinted.fr dans Chrome, ça repartira tout seul",
    "autre boutique prouvée : « En pause : ouvre ta boutique @ornella-vend »", s(autreBoutique).raison);
  ok(s(job({ status: "needs_user", platform_fields: { needs_user_source: "prevol_negatif" } })).groupe === "a_toi", "une vraie question : à toi de jouer");
  const repub = job({ action: "republish", platform_fields: { republish_step: "a_capturer" } });
  const plafond = { retenue: true, motif: "plafond", reprise: "2026-10-01T22:00:00Z" };
  // (15/10 soir, Nico) Plus jamais l'heure de reprise : l'état seul (« ça fait fuir »).
  ok(s(repub, { ...ctx, plafond }).raison === "En pause (limite du jour) : elle repart toute seule", s(repub, { ...ctx, plafond }).raison);
  const rythme = { retenue: true, motif: "pause", reprise: iso(146) };
  ok(s(repub, { ...ctx, plafond: rythme }).raison === "En pause (rythme de republication) : elle repart toute seule", s(repub, { ...ctx, plafond: rythme }).raison);
  ok(s(repub, { ...ctx, plafond: { retenue: true, motif: "plafond", reprise: null } }).raison === "En pause (limite du jour) : elle repart toute seule", "reprise inconnue : pas d'heure inventée");
  ok(s(job({}), { ...ctx, plafond }).groupe === "en_file", "la limite des republications ne retient pas une publication");
  const auto = job({ action: "republish", platform_fields: { republish_step: "a_capturer", republish_source: "auto" } });
  ok(s(auto, { ...ctx, creneaux: { vinted: { dans_creneau: false, reprise: iso(60) } } }).raison === "En pause (créneau de republication) : elle repart toute seule au prochain créneau", "hors créneau : en pause, sans heure");
  const essai = job({ error: "Vinted ne répond pas", platform_fields: { next_action_after: iso(20) } });
  ok(s(essai).raison === "En pause : nouvel essai automatique, rien à faire", s(essai).raison);
  ok(s(job({ error: "x", platform_fields: { next_action_after: iso(-20) } })).raison === "En pause : nouvel essai automatique, rien à faire", "essai dont l'heure est passée : pas d'heure");
  ok(s(job({ platform: "beebs" }), { ...ctx, plateformesEnPause: new Set(["beebs"]) }).raison === "En pause : Beebs est en pause de notre côté — reprise automatique", "plateforme en pause de notre côté");
  ok(s(job({ status: "needs_user", error: "Taille manquante" })).groupe === "a_toi" && s(job({ status: "needs_user", error: "Taille manquante" })).raison === "À toi de jouer : une question t'attend", "needs_user : à toi de jouer");
  const connexion = job({ platform: "beebs", error: "En attente de ta connexion à Beebs", platform_fields: { attente_session: { depuis: iso(-5) } } });
  ok(s(connexion).raison === "À toi de jouer : connecte-toi à Beebs sur ton ordinateur" && s(connexion).etat === "a_toi", "session fermée : le geste de connexion");
  const horsLigne = job({ action: "republish", platform: "leboncoin", platform_fields: { republish_step: "deleted", deleted_at: iso(-2), next_action_after: iso(3) } });
  ok(s(horsLigne).groupe === "en_cours" && s(horsLigne).raison === "En cours : hors ligne le temps de la remise en ligne", "hors ligne entre retrait et remise en ligne : en cours, sans heure promise");
  ok(s(horsLigne, { ...ctx, plafond }).groupe === "en_cours", "la limite du jour ne retient jamais une annonce hors ligne");
  // (03/10, point 23 — nivake03) « depuis quand » seulement quand c'est long.
  const horsLigneLongtemps = job({ action: "republish", platform_fields: { republish_step: "deleted", deleted_at: iso(-4 * 24 * 60 - 30), next_action_after: iso(5) } });
  ok(/^En cours : hors ligne depuis le \d{1,2} \S+, remise en ligne dès que possible$/.test(s(horsLigneLongtemps).raison) && !/quelques minutes/.test(s(horsLigneLongtemps).raison),
    "retirée depuis 4 jours : « hors ligne depuis le … », jamais « quelques minutes »", s(horsLigneLongtemps).raison);
  ok(s(job({ action: "republish", platform_fields: { republish_step: "captured", attente_boutique: { login: "louis" } } })).raison === "En pause : ouvre ta boutique @louis sur vinted.fr dans Chrome, ça repartira tout seul",
    "attente de la bonne boutique Vinted — la phrase dit quelle boutique OUVRIR");
  ok(s(job({ platform: "opla" }), { ...ctx, oplaAAutoriser: true }).groupe === "a_toi", "Opla sans autorisation connue : à toi de jouer, jamais « son tour »");
  ok(s(job({ platform: "opla" }), ctx).raison === "En file : elle partira à son tour", "Opla autorisée (ou verdict inconnu) : à son tour");
  ok(s(job({ status: "processing" })).etat === "en_cours" && s(job({ status: "processing" })).raison === "En cours sur ton ordinateur", "processing : en cours sur ton ordinateur");
  ok(s(job({ status: "processing", voie: "api", platform: "ebay" })).raison === "En cours sur nos serveurs", "processing par l'API : sur nos serveurs");
  // Aucune des phrases ne porte une heure ni une durée.
  const toutes = [job({}), retenue, sansBoutique, autreBoutique, essai, connexion, horsLigne, horsLigneLongtemps, repub, auto]
    .map((j) => s(j, { ...ctx, plafond, creneaux: { vinted: { dans_creneau: false, reprise: iso(60) } } }).raison);
  ok(toutes.every((r) => !SANS_HEURE.test(r)), "aucune raison ne porte une heure, une durée ni un « ~ »", toutes.filter((r) => SANS_HEURE.test(r)).join(" | "));
  ok(sansEstimation("Ton annonce est intacte. Reprise automatique dans ~6 min (tentative 2/5).") === "Ton annonce est intacte.", "un texte du serveur perd sa durée promise");
  ok(sansEstimation("Le retrait est retenté toutes les heures et part dès qu'elle se termine — rien à faire.") === "Le retrait est retenté.", "« toutes les heures » tombe aussi");
}

console.log("5. COMPTEURS ET LIBELLÉS");
{
  const f = lireFile([
    job({ status: "processing" }), job({}), job({}),
    job({ action: "republish", platform_fields: { republish_step: "a_capturer" } }),
    job({ status: "needs_user" }),
  ], { ...ctx, plafond: { retenue: true, motif: "pause", reprise: iso(146) } });
  ok(phraseCompteurs(f.compteurs) === "3 en cours ou en file · 1 en pause · 1 à toi de jouer", phraseCompteurs(f.compteurs));
  ok(libelleAction(job({ action: "delete", platform: "leboncoin" })) === "Retrait de Leboncoin", "Retrait de Leboncoin");
  ok(libelleAction(job({ action: "republish" })) === "Republication sur Vinted", "Republication sur Vinted");
  const cinquante = Array.from({ length: 50 }, (_, i) => job({ created_at: iso(-i) }));
  const g = lireFile(cinquante, ctx);
  ok(g.en_file.length === 50 && g.en_file.every((l, i) => i === 0 || Date.parse(l.job.created_at) >= Date.parse(g.en_file[i - 1].job.created_at)), "50 jobs : tous là, du plus ancien au plus récent");
}

console.log("6. LA BARRE D'UN JOB");
{
  const p = (j, c = ctx) => pisteJob(j, c);
  ok(p(job({ status: "published" })).etat === "termine", "publiée → terminée");
  ok(p(job({ status: "needs_user" })).etat === "echec" && p(job({ status: "needs_user" })).ton === "action", "needs_user → arrêtée, orange");
  ok(p(job({ status: "cancelled" })).ton === "neutre", "annulée → grise, jamais orange");
  ok(p(job({ status: "processing", platform_fields: { processing_since: iso(-0.5) } })).etape === "action", "processing → étape du dépôt");
  ok(p(job({ status: "processing", platform_fields: { processing_since: iso(-0.5) } })).depuis === M - 30000, "… depuis processing_since");
  ok(p(job({ status: "processing", platform_fields: { processing_since: iso(5) } })).depuis === undefined, "horloge du poste en avance : départ ignoré, jamais un bond");
  ok(p(job({})).etape === "file" && p(job({})).etat === "en_cours", "en file → avance doucement dans l'étape « file »");
  ok(p(job({}), { ...ctx, extension: { etat: "eteinte" } }).etat === "pause", "Chrome fermé → la barre s'immobilise");
  ok(p(job({}), { ...ctx, extension: { etat: "eteinte" } }).phrasePause.startsWith("En pause : ton ordinateur est éteint"), "… et le dit");
  const repub = (step, status = "pending", extra = {}) => job({ action: "republish", status, platform_fields: { republish_step: step, ...extra } });
  ok(p(repub("a_capturer", "processing")).etape === "releve", "republication : relevé");
  ok(p(repub("captured")).etape === "attente", "… copie faite, en attente");
  ok(p(repub("captured", "processing")).etape === "retrait", "… retrait de l'ancienne");
  ok(p(repub("deleted")).etape === "remise", "… remise en ligne");
  ok(p(repub("recreated", "processing")).etat === "termine", "… de retour en ligne : terminée");
  ok(p(repub("deleted", "needs_user")).ton === "erreur", "arrêtée HORS LIGNE → rouge (l'annonce n'est plus en ligne)");
  ok(p(job({ action: "delete", status: "deleted" })).etat === "termine", "retrait fait → terminé");
  ok(p(job({ action: "delete", status: "processing" })).etape === "action", "retrait en cours");
  ok(/nos serveurs/.test(etapesJob(job({ action: "delete", platform: "ebay", voie: "api" }))[0].texte), "retrait eBay par nos serveurs : jamais « ton ordinateur »");
  ok(p(job({ platform: "beebs", error: "En attente de ta connexion à Beebs", platform_fields: { attente_session: {} } })).etat === "echec", "session fermée → un geste (barre arrêtée, orange)");
  // Une étape d'attente ne déborde pas : un job en file depuis 2 h ne remplit pas la barre.
  const plages = plagesDe(etapesJob(job({})));
  const file = plages.find((x) => x.cle === "file");
  ok(valeurDansPlage(file, 0, M - 2 * 3600000, M) < file.fin, `en file depuis 2 h : sous la fin de l'étape « file » (${valeurDansPlage(file, 0, M - 2 * 3600000, M).toFixed(1)} % < ${file.fin.toFixed(1)} %)`);
  ok(etapesJob(job({ platform: "leboncoin", action: "republish" })).find((e) => e.cle === "remise").duree === 330, "remise en ligne Leboncoin : ~6 min mesurées (rythme interne de la barre, jamais affiché)");
  ok(etapesJob(job({ platform: "vinted", action: "republish" })).find((e) => e.cle === "retrait").duree === 51, "retrait Vinted : 51 s mesurées (rythme interne)");
  ok(etapesJob(job({ platform: "ebay", voie: "api" })).find((e) => e.cle === "action").duree === 78, "eBay par nos serveurs : 78 s mesurées (rythme interne)");
  const textes = etapesJob(job({ platform: "leboncoin", action: "republish" })).flatMap((e) => [e.texte, e.court, e.texteLong ?? ""]);
  ok(textes.every((t) => !SANS_HEURE.test(t)), "aucune étape de barre ne montre une durée");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ file des jobs et barres des jobs prouvées");
