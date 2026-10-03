// ═══════════════════════════════════════════════════════════════════════════
// LA FILE DES JOBS ET LES BARRES DES JOBS — preuve (01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// src/utils/fileDesJobs.js et src/utils/barresJobs.js, sur des jobs de la
// forme exacte de cross_post_jobs :
//   · les finis n'entrent jamais dans la file ;
//   · l'ordre de départ est celui de l'extension ;
//   · chaque attente dit pourquoi, avec une heure SEULEMENT quand elle est connue
//     (heure de Paris), jamais une heure passée ;
//   · la barre d'un job ne dit « fini » que sur un vrai succès, ne déborde pas
//     quand le job n'a pas commencé, s'immobilise quand l'ordinateur est absent.
import { lireFile, situationJob, heureConnue, phraseCompteurs, libelleAction, comparerDepart } from "../src/utils/fileDesJobs.js";
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

console.log("1. HEURES CONNUES, EN HEURE DE PARIS");
ok(heureConnue(iso(146), M) === "17:26", `aujourd'hui → « 17:26 » (${heureConnue(iso(146), M)})`);
ok(heureConnue(iso(-5), M) === null, "une heure passée ne s'écrit jamais");
ok(heureConnue(null, M) === null && heureConnue("n'importe quoi", M) === null, "inconnue → rien");
ok(heureConnue("2026-10-01T22:00:00Z", M) === "demain 00:00", `minuit de Paris → « demain 00:00 » (${heureConnue("2026-10-01T22:00:00Z", M)})`);
ok(/^le 3 oct\.? à 08:00$/.test(heureConnue("2026-10-03T06:00:00Z", M) ?? ""), `plus loin → « le 3 oct. à 08:00 » (${heureConnue("2026-10-03T06:00:00Z", M)})`);

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
  ok(phraseCompteurs(f.compteurs) === "Rien en cours ni à venir", "file vide : une phrase, pas un zéro");
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
  ok(f.a_venir.map((l) => l.job.id).join(",") === [c.id, b.id, d.id, a.id].join(","), "puis les autres, dans l'ordre où ils partiront");
  ok(phraseCompteurs(f.compteurs) === "5 en cours ou à venir", phraseCompteurs(f.compteurs));
}

console.log("4. CHAQUE ATTENTE DIT POURQUOI");
{
  const s = (j, c = ctx) => situationJob(j, c);
  ok(s(job({})).raison === "En attente de son tour", "en file : « En attente de son tour »");
  ok(s(job({}), { ...ctx, extension: { etat: "eteinte" } }).raison.startsWith("En attente de ton ordinateur"), "Chrome fermé : « En attente de ton ordinateur »");
  ok(s(job({ voie: "api", platform: "ebay" }), { ...ctx, extension: { etat: "eteinte" } }).motif === "tour", "eBay par nos serveurs n'attend pas l'ordinateur");
  const retenue = job({ action: "republish", platform_fields: { republish_step: "captured", retenue_serveur: { motif: "isbn_capture_non_standard", depuis: iso(-100) } } });
  ok(s(retenue).raison === "En attente, ton annonce est intacte" && s(retenue).groupe === "pause", "retenue serveur : « En attente, ton annonce est intacte »");
  // (03/10, point G) Boutique d'origine inconnue : la retenue NOMME les
  // boutiques à ouvrir — republication comme retrait (« Alphalette » d'Ornella).
  const sansBoutique = job({ action: "delete", platform_fields: { retenue_serveur: { motif: "boutique_origine_inconnue", depuis: iso(-100), boutiques: ["@ornella-vend"] } } });
  ok(s(sansBoutique).raison === "En attente : ouvre @ornella-vend sur vinted.fr dans Chrome — FillSell y cherchera l'annonce, ça repartira tout seul" && s(sansBoutique).groupe === "pause",
    "retrait sans boutique : il dit laquelle ouvrir, jamais le silence", s(sansBoutique).raison);
  const repubSansBoutique = job({ action: "republish", platform_fields: { republish_step: "captured", retenue_serveur: { motif: "boutique_origine_inconnue", depuis: iso(-100) } } });
  ok(/^En attente : ouvre sur vinted\.fr, dans Chrome, la boutique qui porte cette annonce/.test(s(repubSansBoutique).raison), "republication sans boutique connue : le geste, sans inventer un nom", s(repubSansBoutique).raison);
  // (03/10, point H) Cause PROUVÉE = l'autre boutique : une attente, pas un geste.
  const autreBoutique = job({ status: "needs_user", action: "republish", platform_fields: { needs_user_source: "boutique_etrangere",
    boutique_etrangere: { motif: "boutique_etrangere", article: "472079", login_article: "ornella-vend", pose_par: "handler-watch (origine prouvée du job)" } } });
  ok(s(autreBoutique).groupe === "pause" && s(autreBoutique).raison === "En attente de ta boutique @ornella-vend : ouvre-la sur vinted.fr dans Chrome, ça repartira tout seul",
    "autre boutique prouvée : « En attente de ta boutique @ornella-vend »", s(autreBoutique).raison);
  ok(s(job({ status: "needs_user", platform_fields: { needs_user_source: "prevol_negatif" } })).groupe === "geste", "une vraie question reste un geste");
  const repub = job({ action: "republish", platform_fields: { republish_step: "a_capturer" } });
  const plafond = { retenue: true, motif: "plafond", reprise: "2026-10-01T22:00:00Z" };
  ok(s(repub, { ...ctx, plafond }).raison === "En pause jusqu'à demain 00:00 (limite du jour)", s(repub, { ...ctx, plafond }).raison);
  const rythme = { retenue: true, motif: "pause", reprise: iso(146) };
  ok(s(repub, { ...ctx, plafond: rythme }).raison === "En pause jusqu'à 17:26 (rythme de republication)", s(repub, { ...ctx, plafond: rythme }).raison);
  ok(s(repub, { ...ctx, plafond: { retenue: true, motif: "plafond", reprise: null } }).raison === "En pause (limite du jour)", "reprise inconnue : pas d'heure inventée");
  ok(s(job({}), { ...ctx, plafond }).groupe === "a_venir", "la limite des republications ne retient pas une publication");
  const auto = job({ action: "republish", platform_fields: { republish_step: "a_capturer", republish_source: "auto" } });
  ok(s(auto, { ...ctx, creneaux: { vinted: { dans_creneau: false, reprise: iso(60) } } }).raison === "En pause jusqu'à 16:00 (créneau de republication)", "hors créneau : l'heure du prochain créneau");
  const essai = job({ error: "Vinted ne répond pas", platform_fields: { next_action_after: iso(20) } });
  ok(s(essai).raison === "Nouvel essai à 15:20", s(essai).raison);
  ok(s(job({ error: "x", platform_fields: { next_action_after: iso(-20) } })).raison === "Nouvel essai dans un instant", "essai dont l'heure est passée : pas d'heure");
  ok(s(job({ platform: "beebs" }), { ...ctx, plateformesEnPause: new Set(["beebs"]) }).raison === "Beebs est en pause de notre côté — reprise automatique", "plateforme en pause de notre côté");
  ok(s(job({ status: "needs_user", error: "Taille manquante" })).groupe === "geste", "needs_user : un geste à faire");
  const connexion = job({ platform: "beebs", error: "En attente de ta connexion à Beebs", platform_fields: { attente_session: { depuis: iso(-5) } } });
  ok(s(connexion).raison === "Un geste à faire : connecte-toi à Beebs sur ton ordinateur", "session fermée : le geste de connexion");
  const horsLigne = job({ action: "republish", platform: "leboncoin", platform_fields: { republish_step: "deleted", deleted_at: iso(-2), next_action_after: iso(3) } });
  ok(s(horsLigne).groupe === "en_cours" && s(horsLigne).raison === "Hors ligne quelques minutes : remise en ligne vers 15:03", "hors ligne entre retrait et remise en ligne : en cours, avec l'heure prévue");
  ok(s(horsLigne, { ...ctx, plafond }).groupe === "en_cours", "la limite du jour ne retient jamais une annonce hors ligne");
  // (03/10, point 23 — nivake03) « quelques minutes » seulement quand c'est vrai.
  const horsLigneLongtemps = job({ action: "republish", platform_fields: { republish_step: "deleted", deleted_at: iso(-4 * 24 * 60 - 30), next_action_after: iso(5) } });
  ok(/^Hors ligne depuis le \d{1,2} \S+ : nouvel essai de remise en ligne vers \d\d:\d\d$/.test(s(horsLigneLongtemps).raison) && !/quelques minutes/.test(s(horsLigneLongtemps).raison),
    "retirée depuis 4 jours : « Hors ligne depuis le … », plus jamais « quelques minutes »", s(horsLigneLongtemps).raison);
  ok(s(job({ action: "republish", platform_fields: { republish_step: "captured", attente_boutique: { login: "louis" } } })).raison === "En attente de ta boutique @louis : ouvre-la sur vinted.fr dans Chrome, ça repartira tout seul",
    "attente de la bonne boutique Vinted — (03/10, point 16) la phrase dit désormais quelle boutique OUVRIR");
  ok(s(job({ platform: "opla" }), { ...ctx, oplaAAutoriser: true }).groupe === "geste", "Opla sans autorisation connue : un geste, jamais « son tour »");
  ok(s(job({ platform: "opla" }), ctx).raison === "En attente de son tour", "Opla autorisée (ou verdict inconnu) : à son tour");
}

console.log("5. COMPTEURS ET LIBELLÉS");
{
  const f = lireFile([
    job({ status: "processing" }), job({}), job({}),
    job({ action: "republish", platform_fields: { republish_step: "a_capturer" } }),
    job({ status: "needs_user" }),
  ], { ...ctx, plafond: { retenue: true, motif: "pause", reprise: iso(146) } });
  ok(phraseCompteurs(f.compteurs) === "3 en cours ou à venir · 1 en pause · 1 geste à faire", phraseCompteurs(f.compteurs));
  ok(libelleAction(job({ action: "delete", platform: "leboncoin" })) === "Retrait de Leboncoin", "Retrait de Leboncoin");
  ok(libelleAction(job({ action: "republish" })) === "Republication sur Vinted", "Republication sur Vinted");
  const cinquante = Array.from({ length: 50 }, (_, i) => job({ created_at: iso(-i) }));
  const g = lireFile(cinquante, ctx);
  ok(g.a_venir.length === 50 && g.a_venir.every((l, i) => i === 0 || Date.parse(l.job.created_at) >= Date.parse(g.a_venir[i - 1].job.created_at)), "50 jobs : tous là, du plus ancien au plus récent");
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
  ok(p(job({}), { ...ctx, extension: { etat: "eteinte" } }).phrasePause.startsWith("En attente de ton ordinateur"), "… et le dit");
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
  ok(etapesJob(job({ platform: "leboncoin", action: "republish" })).find((e) => e.cle === "remise").duree === 330, "remise en ligne Leboncoin : ~6 min mesurées");
  ok(etapesJob(job({ platform: "vinted", action: "republish" })).find((e) => e.cle === "retrait").duree === 51, "retrait Vinted : 51 s mesurées (vu en vrai : 73 s ne doit pas dire « plus de temps que d'habitude » trop tôt)");
  ok(etapesJob(job({ platform: "ebay", voie: "api" })).find((e) => e.cle === "action").duree === 78, "eBay par nos serveurs : 78 s mesurées");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ file des jobs et barres des jobs prouvées");
