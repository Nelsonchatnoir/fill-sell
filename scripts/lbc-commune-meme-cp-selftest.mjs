// ═══════════════════════════════════════════════════════════════════════════
// VERROU 3d (13/11, lot « zéro problème », étape 3) — ADRESSE LEBONCOIN : MÊME CODE POSTAL → LA COMMUNE DE
// LEBONCOIN EST ACCEPTÉE ET DITE UNE FOIS ; CODE POSTAL DIFFÉRENT → BLOQUÉ AVEC UN MESSAGE QUI EXPLIQUE
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (12/11) : côté serveur (get-pending-jobs), pour toutes les versions d'extension, Réglages jamais
// réécrits, par identifiants (le code postal est l'identifiant). Données RÉELLES relues en base (lecture seule, 13/11) :
//   · a1e210f2 — ville de l'annonce « seynod 74600 », 22 refus le 12/11 (17:28:59 → 18:17:19), texte archivé ci-dessous ;
//   · 8ac5bbda — « PARIS 75000 » (03/11), Leboncoin propose Carquefou (44470)… : blocage juste, message à expliquer ;
//   · 98b72757 — « Cholet 49308 » (CEDEX ; Cholet = 49300), 11 publications en attente le 13/11 avec cette ville.
// Le module LIVRÉ (_shared/lbc-commune-meme-cp.js), la fonction de l'extension (leboncoin.js, communeMemeCpLbc,
// 0.6.187) exécutée telle qu'écrite, et le branchement de get-pending-jobs.
//
//   npm run selftest:lbc-commune-meme-cp

import { readFileSync } from "node:fs";

let ko = 0;
const ok = (c, quoi, d = "") => { if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.error(`  ✗ ${quoi}${d ? `\n      ${d}` : ""}`); } };
let M = {};
try { M = await import("../supabase/functions/_shared/lbc-commune-meme-cp.js"); } catch (e) { console.error(`  ✗ module serveur absent : ${String(e?.message ?? e).slice(0, 120)}`); ko++; }
const fn = (n) => (typeof M[n] === "function" ? M[n] : () => ({ action: "absent" }));
const decision = fn("decisionCommuneLbc");

// Les textes RÉELS de l'extension (refus archivés par update-job-status → pending).
const REFUS_SEYNOD = "Adresse \"seynod 74600\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Annecy (74600)\", ne contient pas [\"seynod\"]). Propositions affichées: [\"Annecy (74600)\",\"Annecy (74600)\"]. Le repli sur « 74600 seynod » a été tenté ensuite, sans succès non plus. Corriger l'adresse dans les Réglages FillSell (format : numéro rue, ville). Le brouillon Leboncoin est conservé.";
const REFUS_PARIS = "Adresse \"PARIS 75000\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Route de Paris, Carquefou (44470)\", ne contient pas [\"75000\"]). Propositions affichées: [\"Route de Paris, Carquefou (44470)\",\"Rue de Paris, Villeneuve-Saint-Georges (94190)\",\"Avenue de Paris, Boissy-sous-Saint-Yon (91790)\",\"Route de Paris, Fenouillet (31150)\",\"Avenue de Paris, Riom (63200)\"]. Le repli sur « 75000 PARIS » a été tenté ensuite, sans succès non plus. Corriger l'adresse dans les Réglages FillSell (format : numéro rue, ville). Le brouillon Leboncoin est conservé. Nouvel essai automatique (tentative 1/5)";
const REFUS_CHOLET = "Adresse \"Cholet 49308\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Rue Baratte-Cholet, Saint-Maur-des-Fossés (94100)\", ne contient pas [\"49308\"]). Propositions affichées: [\"Rue Baratte-Cholet, Saint-Maur-des-Fossés (94100)\",\"Route de Cholet, Distré (49400)\",\"Rue de Cholet, Doué-en-Anjou (49700)\",\"Avenue de Cholet, Les Herbiers (85500)\",\"Résidence Cholet, Blanquefort (33290)\"]. Le repli sur « 49308 Cholet » a été tenté ensuite, sans succès non plus.";

const job = (pf, extra = {}) => ({ id: "j-" + Math.random().toString(16).slice(2, 10), platform: "leboncoin", action: "publish", status: "pending", error: null, ...extra, platform_fields: pf });
const gel = (o) => JSON.stringify(o);

console.log("\n1. a1e210f2 — « seynod 74600 » : MÊME CODE POSTAL, la commune de Leboncoin est servie (toutes versions)");
{
  const reglages = { adresse: "3 rue X 74600 Seynod", rue: "3 rue X", code_postal: "74600", ville: "Seynod", ville_publication: { code_postal: "74600", ville: "seynod" } };
  const avantReglages = gel(reglages);
  const j1 = job({ adresse: reglages.adresse, ville_publication_lbc: { code_postal: "74600", ville: "seynod" }, erreurs_archivees: [{ le: "2026-11-12T16:28:59Z", par: "update-job-status → pending", erreur: REFUS_SEYNOD }] });
  const d = decision({ job: j1, reglagesLbc: reglages });
  ok(d.action === "commune" && d.platform_fields?.ville_publication_lbc?.ville === "Annecy" && d.platform_fields?.ville_publication_lbc?.code_postal === "74600",
    "le job refusé repart avec la ville de l'annonce « Annecy 74600 » (la proposition de Leboncoin au même code postal)", gel(d));
  ok(d.trace?.commune === "Annecy" && d.trace?.ville_tapee === "seynod" && d.trace?.code_postal === "74600" && Array.isArray(d.trace?.preuve?.propositions),
    "trace lbc_commune_meme_cp sur la tâche : code postal, ville tapée, commune de Leboncoin, sa réponse", gel(d.trace));
  ok(gel(reglages) === avantReglages, "Réglages jamais réécrits");
  // Les 10 autres publications du lot, jamais essayées : le refus d'UN job du compte vaut pour elles.
  const j2 = job({ adresse: reglages.adresse, ville_publication_lbc: { code_postal: "74600", ville: "seynod" } });
  const d2 = decision({ job: j2, reglagesLbc: reglages, refusCompte: [REFUS_SEYNOD] });
  ok(d2.action === "commune" && d2.platform_fields?.ville_publication_lbc?.ville === "Annecy", "les autres publications du compte (aucun essai encore) : servies avec Annecy dès le premier refus");
  ok(decision({ job: j2, reglagesLbc: reglages }).action === "tel_quel", "sans réponse de Leboncoin connue : servi tel quel (le code postal 74600 est celui d'une commune)");
  ok(typeof M.phraseCommuneLeboncoin === "function" && /Annecy \(74600\)/.test(M.phraseCommuneLeboncoin({ cp: "74600", ville: "seynod", commune: "Annecy" }))
    && /R[ée]glages ne changent pas/.test(M.phraseCommuneLeboncoin({ cp: "74600", ville: "seynod", commune: "Annecy" })), "la phrase : « il place tes annonces à Annecy (74600). Tes Réglages ne changent pas. »");
  const dite = { dite: true, code_postal: "74600", ville_tapee: "seynod", commune: "Annecy" };
  ok(typeof M.phraseDejaDite === "function" && M.phraseDejaDite([dite], d.trace) && !M.phraseDejaDite([{ ...dite, dite: false }], d.trace)
    && !M.phraseDejaDite([{ ...dite, code_postal: "74000" }], d.trace), "dite UNE fois : une tâche du compte qui la porte déjà (même code postal, même ville, même commune) suffit");
}

console.log("\n2. Adresse de remise « … 74600 Seynod » (rue) : la rue est gardée, seule la commune change");
{
  const reglages = { adresse: "3d Rue de l'Ancien Chef-Lieu 74600 Seynod", code_postal: "74600", ville: "Seynod" };
  const refus = "Adresse \"3d Rue de l'Ancien Chef-Lieu 74600 Seynod\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"3d Rue de l'Ancien Chef-Lieu, Annecy (74600)\", ne contient pas [\"seynod\"]). Propositions affichées: [\"3d Rue de l'Ancien Chef-Lieu, Annecy (74600)\"]. Le repli sur « 74600 Seynod » a été tenté ensuite, sans succès non plus.";
  const d = decision({ job: job({ adresse: reglages.adresse, erreurs_archivees: [{ erreur: refus }] }), reglagesLbc: reglages });
  ok(d.action === "commune" && d.platform_fields?.adresse === "3d Rue de l'Ancien Chef-Lieu 74600 Annecy" && !d.platform_fields?.ville_publication_lbc,
    "adresse servie « 3d Rue de l'Ancien Chef-Lieu 74600 Annecy » (ce que la personne a fini par écrire à la main le 12/11)", gel(d.platform_fields?.adresse));
}

console.log("\n3. 98b72757 — « Cholet 49308 » (CEDEX) : BLOQUÉ AVANT TOUT ESSAI, le message explique");
{
  const reglages = { adresse: "1 rue Y 49300 Cholet", code_postal: "49300", ville: "Cholet", ville_publication: { code_postal: "49308", ville: "Cholet" } };
  const avantReglages = gel(reglages);
  const d = decision({ job: job({ adresse: reglages.adresse, ville_publication_lbc: { code_postal: "49308", ville: "Cholet" } }), reglagesLbc: reglages });
  ok(d.action === "bloquer" && d.motif === "cp_non_commune", "code postal d'aucune commune : bloqué sans essai (plus 5 essais « rien à faire »)", gel(d));
  ok(/49308/.test(d.message ?? "") && /CEDEX/.test(d.message ?? "") && /75000/.test(d.message ?? "") && /49300/.test(d.message ?? "") && /Ville de l'annonce/.test(d.message ?? "") && !/rien à faire/i.test(d.message ?? ""),
    "le message nomme 49308, dit CEDEX / code général (75000), cite le code de commune 49300 et où corriger", d.message);
  ok(/49308/.test(d.message_en ?? "") && /CEDEX/.test(d.message_en ?? ""), "et en anglais");
  ok(gel(reglages) === avantReglages, "Réglages jamais réécrits");
  const jb = job({ adresse: reglages.adresse, ville_publication_lbc: { code_postal: "49308", ville: "Cholet" } }, { error: REFUS_CHOLET });
  ok(decision({ job: jb, reglagesLbc: reglages }).motif === "cp_non_commune", "même avec le refus de Leboncoin sur la tâche : le code postal parle d'abord");
  ok(typeof M.patchBlocageCommune === "function" && M.patchBlocageCommune(jb, d).status === "needs_user" && M.patchBlocageCommune(jb, d).platform_fields.needs_user_source === "lbc_commune_code_postal",
    "patch : needs_user, source lbc_commune_code_postal (classée « utilisateur / réglage du compte »)");
  // La personne corrige la ville de l'annonce dans ses Réglages, puis relance : la copie bloquée de la tâche cède.
  const corrige = { ...reglages, ville_publication: { code_postal: "49300", ville: "Cholet" } };
  const dc = decision({ job: job({ adresse: reglages.adresse, ville_publication_lbc: { code_postal: "49308", ville: "Cholet" } }, { error: REFUS_CHOLET }), reglagesLbc: corrige });
  ok(dc.action === "commune" && dc.platform_fields?.ville_publication_lbc?.code_postal === "49300" && dc.trace?.reglages_corriges,
    "Réglages corrigés (49300) puis relance : la tâche repart avec la ville des Réglages (jamais la copie bloquée)", gel(dc));
}

console.log("\n4. 8ac5bbda — « PARIS 75000 » : code général, bloqué, le message cite les codes de commune");
{
  const d = decision({ job: job({ adresse: "2 rue Z 72450 Montfort le Gesnois", ville_publication_lbc: { code_postal: "75000", ville: "PARIS" } }, { error: REFUS_PARIS }), reglagesLbc: { code_postal: "72450", ville: "Montfort le Gesnois" } });
  ok(d.action === "bloquer" && d.motif === "cp_non_commune" && /75001 à 75020/.test(d.message ?? ""), "bloqué, « codes de commune qui commencent comme lui : 75001 à 75020 »", d.message);
}

console.log("\n5. CODE POSTAL DIFFÉRENT (code de commune valide) : bloqué, message qui explique");
{
  const refus = "Adresse \"RUE DE RENNES 35000 RENNES\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Rue de Rennes, Paris (75006)\", ne contient pas [\"35000\"]). Propositions affichées: [\"Rue de Rennes, Paris (75006)\",\"Rue de Rennes, Paris (75006)\"].";
  const d = decision({ job: job({ adresse: "RUE DE RENNES 35000 RENNES" }, { error: refus }), reglagesLbc: { code_postal: "35000", ville: "RENNES" } });
  ok(d.action === "bloquer" && d.motif === "autre_cp" && /Paris \(75006\)/.test(d.message ?? "") && /jamais ton annonce dans une autre commune/.test(d.message ?? ""),
    "« Rue de Rennes, Paris (75006) » pour Rennes 35000 : refusée, bloquée, message vrai (jamais Paris)", d.message);
}

console.log("\n6. TÉMOINS : rien ne change là où il n'y a rien à changer");
{
  const plusieurs = "Adresse \"seynod 74600\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Annecy (74600)\", ne contient pas [\"seynod\"]). Propositions affichées: [\"Annecy (74600)\",\"Quintal (74600)\"].";
  const dp = decision({ job: job({ ville_publication_lbc: { code_postal: "74600", ville: "seynod" } }, { error: plusieurs }) });
  ok(dp.action === "bloquer" && dp.motif === "plusieurs_communes" && /Quintal/.test(dp.message ?? ""), "même code postal, PLUSIEURS communes (Annecy, Quintal) : FillSell ne choisit pas — bloqué, la question", dp.message);
  const pornic = "Adresse \"25bis Rue de la Fontaine aux Bretons 44210 Pornic\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Pornic (44210)\", ne contient pas [\"25bis\"]). Propositions affichées: [\"Pornic (44210)\"].";
  ok(decision({ job: job({ adresse: "25bis Rue de la Fontaine aux Bretons 44210 Pornic" }, { error: pornic }) }).action === "tel_quel", "Leboncoin propose NOTRE commune (Pornic) : rien ne change (les règles d'avant jouent)");
  const repub = job({ republish_step: "deleted", localisation_origine: { ville: "Annecy", code_postal: "74600" }, ville_publication_lbc: { code_postal: "49308", ville: "Cholet" } }, { action: "republish" });
  ok(decision({ job: repub }).action === "tel_quel", "republication : la localisation d'origine (lue chez Leboncoin) n'est jamais touchée");
  ok(decision({ job: job({ adresse: "4 Rue Du Hameau 26230 Chantemerle-lès-Grignan" }) }).action === "tel_quel", "adresse ordinaire, aucun refus : servie telle quelle");
  ok(decision({ job: { ...job({ ville_publication_lbc: { code_postal: "49308", ville: "Cholet" } }), platform: "beebs" } }).action === "tel_quel", "Leboncoin seulement (Beebs a son adresse)");
}

console.log("\n7. EXTENSION 0.6.187 — communeMemeCpLbc (leboncoin.js), exécutée telle qu'écrite");
{
  const src = readFileSync(new URL("../chrome-extension/content-scripts/leboncoin.js", import.meta.url), "utf8").split("\r\n").join("\n");
  const m = /function communeMemeCpLbc\(textes, cp\) \{[\s\S]*?\n\}/.exec(src);
  ok(Boolean(m), "communeMemeCpLbc présente dans leboncoin.js");
  if (m) {
    const f = new Function(`${m[0]}; return communeMemeCpLbc;`)();
    ok(f(["Annecy (74600)", "Annecy (74600)"], "74600") === "Annecy", "« seynod 74600 » → « Annecy (74600) » ×2 : Annecy, acceptée");
    ok(f(["Rue de Rennes, Paris (75006)", "Rue de Rennes, Paris (75006)"], "35000") === null, "« RUE DE RENNES 35000 RENNES » → « Rue de Rennes, Paris (75006) » : refusée");
    ok(f(["Route de Paris, Carquefou (44470)", "Rue de Paris, Villeneuve-Saint-Georges (94190)"], "75000") === null, "« PARIS 75000 » → Carquefou (44470) : refusée");
    ok(f(["Rue Baratte-Cholet, Saint-Maur-des-Fossés (94100)", "Route de Cholet, Distré (49400)"], "49308") === null, "« Cholet 49308 » → Saint-Maur-des-Fossés (94100) : refusée");
    ok(f(["Annecy (74600)", "Quintal (74600)"], "74600") === null, "même code postal, deux communes : aucune (FillSell ne choisit pas)");
    ok(f(["Saint-Yrieix-sur-Charente (16710)", "Saint Yrieix sur Charente (16710)"], "16710") === "Saint-Yrieix-sur-Charente", "les écritures d'une même commune (tirets) n'en font qu'une");
  }
  ok(/communeDuCp: true \}\)/.test(src) && /communeDuCp: saisieCommune/.test(src), "fillAddress l'applique au niveau de la commune seulement (repli « code postal ville », ville de l'annonce)");
  ok(/code: "adresse_commune_meme_cp"/.test(src), "et le dit (warning adresse_commune_meme_cp, Réglages inchangés)");
}

console.log("\n8. BRANCHEMENT : get-pending-jobs juge chaque publication Leboncoin servie, sans écrire les Réglages");
{
  const gpj = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
  ok(/from "\.\.\/_shared\/lbc-commune-meme-cp\.js"/.test(gpj) && /decisionCommuneLbc\(\{ job: j, reglagesLbc, refusCompte \}\)/.test(gpj), "get-pending-jobs appelle decisionCommuneLbc (toutes versions d'extension)");
  const i = gpj.indexOf("LEBONCOIN — MÊME CODE POSTAL : LA COMMUNE DE LEBONCOIN");
  const bloc = i >= 0 ? gpj.slice(i, gpj.indexOf("commune Leboncoin par code postal", i)) : "";
  ok(bloc.length > 0 && !/from\("profiles"\)/.test(bloc) && !/platform_settings_fusionner/.test(bloc), "le bloc ne lit ni n'écrit les Réglages (lus plus haut, une fois)");
  ok(/\.eq\("status", "pending"\)/.test(bloc) && /patchBlocageCommune\(/.test(bloc), "un blocage s'écrit par compare-and-set sur « pending »");
  const cb = readFileSync(new URL("../supabase/functions/_shared/cause-blocage.js", import.meta.url), "utf8");
  ok(/lbc_commune_code_postal: \[ORIGINE\.UTILISATEUR, "reglage_du_compte"\]/.test(cb), "cause-blocage : « utilisateur / réglage du compte » (jamais compté chez nous)");
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
