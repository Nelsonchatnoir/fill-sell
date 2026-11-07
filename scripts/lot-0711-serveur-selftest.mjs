// ═══════════════════════════════════════════════════════════════════════════
// LOT DU 07/11 (terminal « Problèmes ») — CÔTÉ SERVEUR — SELFTEST
// ═══════════════════════════════════════════════════════════════════════════
//   · point 3 (Ciddjy, Beebs) : un redépôt arrêté à la borne est SUSPECT (annonces relues avant tout redépôt) ;
//     la remise en ligne bloquée par la borne repart seule, une fois, borne élargie, après relecture ; le pré-vol trop
//     lent (0.6.177) ne retire rien et se reprend ;
//   · point 5 (ayadi007) : le rayon Vinted « neuf seulement » parle tout de suite, sans reprise ;
//   · point 7 (Marta MELE) : la couleur exigée et connue par la capture est un défaut de notre envoi (cause levée) ;
//     (labrunettedu44) « le prix manque » se classe, le prix absent de l'origine est une information à donner.
//
//   node scripts/lot-0711-serveur-selftest.mjs

import { classerEchec, RAYON_NEUF_SEULEMENT_VINTED_RE, PREVOL_TROP_LENT_RE } from "../supabase/functions/_shared/pas-de-rouge.js";
import { depotPeutEtrePartiDepuis } from "../supabase/functions/_shared/recreation-deja-partie.js";
import { causeLeveePourRelance, champsRelanceCauseLevee, couleurExigeeConnue, messageRecreationBloquee, posteAuBuildDeLaCause, BUILD_BORNE_ADAPTATIVE }
  from "../supabase/functions/_shared/recreation-bloquee.js";
import { causeDuTexte } from "../supabase/functions/_shared/cause-blocage.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

console.log("1. Point 3 — Beebs : un essai arrêté à la borne est suspect");
const MUET = "Timeout: pas de réponse du content script (borne 10 min dépassée, dernière phase : debut)";
const pfCiddjy = {
  republish_step: "deleted", deleted_at: "2026-11-07T05:27:02.912Z",
  work_window_state: { fins: [{ at: "2026-11-07T06:59:42.165Z", tab_url: "https://www.beebs.app/fr/listing", fill_step: null }] },
  error_technique: { at: "2026-11-07T06:59:43.509Z", brut: `Ton annonce a été retirée de Beebs … : ${MUET}.`, precedents: [{ at: "2026-11-07T06:04:16.890Z", brut: MUET }] },
};
const s1 = depotPeutEtrePartiDepuis("beebs", pfCiddjy);
ok(s1 && s1.at === "2026-11-07T06:59:43.509Z" && /clic « Mettre en vente » a pu partir/.test(s1.raison), `Ciddjy : suspect au dernier essai muet (${s1?.at})`);
ok(depotPeutEtrePartiDepuis("beebs", { ...pfCiddjy, recreation_verifiee: { apres: "2026-11-07T07:10:00Z" } }) === null, "une relecture faite après l'essai lève le soupçon");
ok(depotPeutEtrePartiDepuis("beebs", { ...pfCiddjy, error_technique: { at: "2026-11-07T06:59:43Z", brut: "Ajouter au moins 5 caractères" }, work_window_state: {} }) === null, "un refus nommé du formulaire n'est pas suspect");
ok(depotPeutEtrePartiDepuis("beebs", { ...pfCiddjy, error_technique: null, work_window_state: { fins: [{ at: "2026-11-07T06:00:00Z", tab_url: "https://www.beebs.app/fr/listing/success" }] } })?.at === "2026-11-07T06:00:00.000Z", "la page /fr/listing/success prouve un envoi");
ok(depotPeutEtrePartiDepuis("beebs", { ...pfCiddjy, error_technique: { at: "2026-11-07T05:00:00Z", brut: MUET }, work_window_state: {} }) === null, "un essai muet AVANT le retrait ne compte pas");

console.log("2. Point 3 — la remise en ligne bloquée par la borne repart seule, une fois, après relecture");
const jobBloque = { action: "republish", status: "needs_user", platform: "beebs", title: "Lot 4 pantalons garçon 18 mois",
  error: "Ton annonce « Lot 4 pantalons » a été retirée de Beebs … Appuie sur « Republier maintenant » : elle repartira.",
  platform_fields: { ...pfCiddjy, needs_user_source: "recreation_bloquee", recreation_reprises: 4 } };
const c1 = causeLeveePourRelance(jobBloque, "2026-11-06T20:36:04Z+3becc6d");
ok(c1?.code === "remplissage_borne_depassee", `cause levée : ${c1?.code}`);
const pfR = champsRelanceCauseLevee(jobBloque.platform_fields, c1, "2026-11-07T11:00:00.000Z", { extensionBuild: "2026-11-06T20:36:04Z+3becc6d" });
ok(pfR.fill_borne_ms === 20 * 60_000, "borne élargie à 20 min");
ok(pfR.recreation_depot_parti?.at === "2026-11-07T11:00:00.000Z" && !pfR.error_technique, "relecture exigée APRÈS la relance (recreation_depot_parti), ancienne trace retirée");
ok(depotPeutEtrePartiDepuis("beebs", pfR)?.at === "2026-11-07T11:00:00.000Z", "get-pending-jobs relira les annonces avant tout redépôt");
ok(pfR.recreation_relancee?.remplissage_borne_depassee?.sous_build === true, "relance sous le build tracée (une seconde au build 0.6.177)");
const jobRelance = { ...jobBloque, platform_fields: { ...pfR, needs_user_source: "recreation_bloquee", error_technique: { at: "2026-11-07T11:30:00Z", brut: MUET } } };
ok(causeLeveePourRelance(jobRelance, "2026-11-06T20:36:04Z+3becc6d") === null, "jamais une deuxième relance sous l'ancien build");
ok(causeLeveePourRelance(jobRelance, "2026-11-07T11:40:00Z+abcdef0")?.code === "remplissage_borne_depassee", "une relance de plus au build 0.6.177");
ok(causeLeveePourRelance({ ...jobBloque, platform_fields: { ...jobBloque.platform_fields, attente_session: true } }) === null, "jamais quand la cause est le compte");
ok(!posteAuBuildDeLaCause({ buildMin: BUILD_BORNE_ADAPTATIVE }, "2026-11-07T09:18:00Z+cloud"), "la copie Cloud 0.6.176 du 07/11 09:18Z n'a pas le build");

console.log("3. Point 3 — pré-vol trop lent (0.6.177) : rien retiré, reprise espacée puis la personne");
const lent = "Contrôle avant retrait trop lent sur ce poste (602 s pour remplir le formulaire, borne 600 s) : rien n'a été retiré.";
ok(PREVOL_TROP_LENT_RE.test(lent), "motif reconnu");
const v1 = classerEchec({ platform: "beebs", action: "republish", brut: lent, pf: { republish_step: "captured" }, reprises: 0 });
ok(v1.verdict === "reprise" && v1.dansMinutes === 120 && v1.motif === "prevol_trop_lent" && /rien retiré, ton annonce est toujours en ligne/.test(v1.message), `reprise 2 h (${v1.verdict} ${v1.dansMinutes})`);
const v2 = classerEchec({ platform: "beebs", action: "republish", brut: lent, pf: { republish_step: "captured" }, reprises: 3 });
ok(v2.verdict === "a_toi" && v2.statut === "needs_user" && v2.source === "relancer", "après 3 reprises : la personne, bouton relancer");

console.log("4. Point 5 — Vinted, rayon « neuf seulement » : la vraie cause, tout de suite, sans reprise");
const neuf = "Le rayon Vinted « Femmes > Beauté > Accessoires de beauté > Accessoires maquillage » n'accepte que des articles neufs, et ton article est « Très bon état ». Choisis un autre rayon Vinted pour cet article depuis l'app, puis relance la publication.";
ok(RAYON_NEUF_SEULEMENT_VINTED_RE.test(neuf), "motif reconnu");
const v3 = classerEchec({ platform: "vinted", action: "publish", brut: neuf, pf: {}, reprises: 0 });
ok(v3.verdict === "a_toi" && v3.motif === "vinted_rayon_neuf_seulement" && /Accessoires maquillage/.test(v3.message) && /Très bon état/.test(v3.message) && /Rien n'a été publié/.test(v3.message), `a_toi, le rayon et l'état nommés (${v3.verdict})`);
ok(!/n'a pas abouti après plusieurs essais/.test(v3.message), "jamais le générique « n'a pas abouti après plusieurs essais »");

console.log("5. Point 7 — Marta : la couleur exigée et connue par la capture est notre envoi");
const pfMarta = { republish_step: "deleted", needs_user_source: "recreation_bloquee", deleted_at: "2026-11-02T12:41:00Z",
  server_required_fields: [{ key: "color", message: "Compila il campo \"colore\" per continuare" }],
  republish_snapshot: { color1_id: 9 }, vintedAspects: { condition: "Ottime" },
  last_diagnostic: "400 validation_error {\"field\":\"color\"}" };
ok(couleurExigeeConnue(pfMarta), "couleur exigée, color1_id connu");
ok(!couleurExigeeConnue({ ...pfMarta, republish_snapshot: {} }), "sans identifiant de couleur : pas notre envoi");
const jobMarta = { action: "republish", status: "needs_user", platform: "vinted", title: "Maglietta J & Y blu", error: "…", platform_fields: pfMarta };
ok(causeLeveePourRelance(jobMarta, "2026-11-03T12:00:00Z+x")?.code === "vinted_couleur_connue_non_posee", "cause levée : vinted_couleur_connue_non_posee");
const msgM = messageRecreationBloquee(jobMarta, { causeEnAttente: { code: "vinted_couleur_connue_non_posee" } });
ok(/« Couleur »/.test(msgM) && /défaut de notre côté/.test(msgM) && !/Appuie sur « Republier maintenant »/.test(msgM), "le message dit « défaut de notre côté », plus « Appuie sur Republier »");

console.log("6. Point 7 — le prix : classement");
const c7a = causeDuTexte({ texte: "Republication Leboncoin mise en pause AVANT tout retrait : le prix manque dans la copie de ton annonce. Ton annonce est TOUJOURS en ligne, rien n'a été touché.", source: "relancer", platform: "leboncoin" });
ok(c7a?.origine === "nous", `« le prix manque dans la copie » : nous (${c7a?.origine} ${c7a?.cause})`);
const c7b = causeDuTexte({ texte: "Ton annonce Leboncoin n'affiche aucun prix (elle a été déposée sans prix), et Leboncoin en exige un pour la remettre en ligne.", source: "relancer", platform: "leboncoin" });
ok(c7b?.origine === "utilisateur", `prix absent de l'origine : une information à donner (${c7b?.origine})`);

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
