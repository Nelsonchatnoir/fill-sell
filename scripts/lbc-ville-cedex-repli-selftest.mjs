// ═══════════════════════════════════════════════════════════════════════════
// VERROU N6b (13/11, lot du 13/11) — UNE VILLE DE PUBLICATION NE PORTE JAMAIS UN CODE CEDEX NI UN CODE GÉNÉRAL :
// LE REPLI RETOMBE SUR LA COMMUNE ET SON VRAI CODE POSTAL ; LE DOUTE EST UNE QUESTION
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (13/11) : « son adresse est juste (49300 Cholet), mais sa ville de publication porte 49308 (code
// CEDEX). 12 publications Leboncoin bloquent depuis le 12/11 21:54 […]. Le repli doit retomber sur la commune et son
// vrai code postal. C'est la règle « commune Leboncoin même code postal ». »
// Données RÉELLES relues en base (lecture seule, 13/11) — compte 98b72757 :
//   · Réglages : adresse de remise « … 49300 Cholet » (code_postal 49300, ville Cholet), ville de publication
//     { code_postal: 49308, ville: Cholet } — posée le 11/11 à 11:27:13 par Réglages › Adresse de remise › « Ville de
//     tes annonces Leboncoin » (seul écrivain : src/reglages/VilleLeboncoinParDefaut.jsx → platform_settings_fusionner,
//     corps de 116 octets = { ville_publication: { code_postal: 5 chiffres, ville: « Cholet » } }) ;
//   · ses 26 annonces Leboncoin relevées : localisation « Cholet 49300 » (liste_api) ;
//   · 12 publications ouvertes (11 pending + 1 processing le 13/11), toutes { 49308, Cholet }, refus réel ci-dessous.
// Autre compte mesuré : 8ac5bbda « PARIS 75000 » (03/11, 2 publications annulées), adresse à Montfort-le-Gesnois
// 72450, annonces Leboncoin à Paris 75001 (66), Le Mans 72000 (76), Montfort-le-Gesnois 72450 (7).
// Le module LIVRÉ (_shared/ville-publication-code-postal.js, _shared/lbc-commune-meme-cp.js), la règle de l'app
// (src/publication/villeLbc.js) et le branchement de get-pending-jobs et des deux écrans de saisie.
//
//   npm run selftest:lbc-ville-cedex-repli

import { readFileSync } from "node:fs";

let ko = 0;
const ok = (c, quoi, d = "") => { if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.error(`  ✗ ${quoi}${d ? `\n      ${d}` : ""}`); } };
const charger = async (chemin) => { try { return await import(chemin); } catch (e) { ko++; console.error(`  ✗ ${chemin} : ${String(e?.message ?? e).slice(0, 140)}`); return {}; } };
const V = await charger("../supabase/functions/_shared/ville-publication-code-postal.js");
const M = await charger("../supabase/functions/_shared/lbc-commune-meme-cp.js");
const A = await charger("../src/publication/villeLbc.js");
const fn = (o, n, defaut) => (typeof o[n] === "function" ? o[n] : () => defaut);
const decision = fn(M, "decisionCommuneLbc", { action: "absent" });
const vraiCp = fn(V, "vraiCodePostalDeLaCommune", { verdict: "absent" });
const controle = fn(A, "controleVilleLbc", { ok: "absent" });
const gel = (o) => JSON.stringify(o);

// Le refus RÉEL de l'extension 0.6.186 (job 6b9a41f3, 12/11, avant l'ajout « Nouvel essai automatique … »).
const REFUS_CHOLET = "Adresse \"Cholet 49308\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Rue Baratte-Cholet, Saint-Maur-des-Fossés (94100)\", ne contient pas [\"49308\"]). Propositions affichées: [\"Rue Baratte-Cholet, Saint-Maur-des-Fossés (94100)\",\"Route de Cholet, Distré (49400)\",\"Rue de Cholet, Doué-en-Anjou (49700)\",\"Avenue de Cholet, Les Herbiers (85500)\",\"Résidence Cholet, Blanquefort (33290)\"]. Le repli sur « 49308 Cholet » a été tenté ensuite, sans succès non plus. Corriger l'adresse dans les Réglages FillSell (format : numéro rue, ville). Le brouillon Leboncoin est conservé. Nouvel essai automatique (tentative 4/5), rien à faire.";
const INTERROMPUE = "La publication a été interrompue sur ton ordinateur (onglet fermé, mis en veille ou extension rechargée) avant d'avoir touché Leboncoin : on reprend au prochain passage, tu n'as rien à faire.";
const PAS_ABOUTI = "La publication n'a pas abouti. Rien n'a été publié. On ne sait pas encore pourquoi : on refait un essai tout seuls.";
// Les 12 publications ouvertes du compte (id8, statut, dernier message) — relues le 13/11.
const DOUZE = [
  ["6b9a41f3", "pending", REFUS_CHOLET], ["3c6a2823", "pending", REFUS_CHOLET], ["f6775858", "pending", REFUS_CHOLET],
  ["2416fb4d", "processing", REFUS_CHOLET], ["fac1eb46", "pending", REFUS_CHOLET], ["f83fd8ae", "pending", INTERROMPUE],
  ["5466c30a", "pending", REFUS_CHOLET], ["27b7cb4a", "pending", REFUS_CHOLET], ["14cb2665", "pending", REFUS_CHOLET],
  ["5afbbf6b", "pending", REFUS_CHOLET], ["48cb58a5", "pending", REFUS_CHOLET], ["9eccafd4", "pending", PAS_ABOUTI],
];
// Réglages du compte (la rue est factice : seules la commune et les codes comptent).
const REGLAGES = Object.freeze({ adresse: "1 rue Y 49300 Cholet", rue: "1 rue Y", code_postal: "49300", ville: "Cholet",
  ville_publication: Object.freeze({ code_postal: "49308", ville: "Cholet" }) });
const job = (id8, pf, extra = {}) => ({ id: `${id8}-0000-4000-8000-000000000000`, platform: "leboncoin", action: "publish", status: "pending", error: null, ...extra,
  platform_fields: { adresse: REGLAGES.adresse, ville_publication_lbc: { code_postal: "49308", ville: "Cholet" }, ...pf } });

console.log("\n1. 98b72757 — « Cholet 49308 » : le repli retombe sur Cholet et SON code postal (49300, celui de l'adresse)");
{
  const avant = gel(REGLAGES);
  const d = decision({ job: job("6b9a41f3", { erreurs_archivees: [{ erreur: REFUS_CHOLET }] }, { error: REFUS_CHOLET }), reglagesLbc: REGLAGES });
  ok(d.action === "commune", "plus jamais bloquée « corrige ton adresse » : servie", gel(d).slice(0, 300));
  ok(d.platform_fields?.ville_publication_lbc?.code_postal === "49300" && d.platform_fields?.ville_publication_lbc?.ville === "Cholet",
    "ville de l'annonce servie : { code_postal: 49300, ville: Cholet }", gel(d.platform_fields?.ville_publication_lbc));
  ok(d.trace?.motif === "cp_non_commune_repli" && d.trace?.code_postal === "49308" && d.trace?.code_postal_servi === "49300" && d.trace?.source_code_postal === "adresse",
    "trace lbc_commune_meme_cp : tapé 49308, servi 49300, pris dans l'adresse de remise", gel(d.trace));
  ok(gel(REGLAGES) === avant, "Réglages jamais réécrits (objet gelé, comparé)");
  ok(!d.message && !/adresse/i.test(String(d.error ?? "")), "aucun message d'erreur posé sur la tâche");
}

console.log("\n2. Les 12 publications ouvertes du compte : toutes repartent avec Cholet 49300, au prochain passage");
{
  const servies = DOUZE.map(([id8, statut, err]) => {
    const d = decision({ job: job(id8, err === REFUS_CHOLET ? { erreurs_archivees: [{ erreur: REFUS_CHOLET }] } : {}, { status: statut, error: err }), reglagesLbc: REGLAGES, refusCompte: [REFUS_CHOLET] });
    return [id8, d.action, d.platform_fields?.ville_publication_lbc?.code_postal ?? "—"];
  });
  const bonnes = servies.filter(([, a, cp]) => a === "commune" && cp === "49300");
  ok(bonnes.length === 12, `12/12 servies « Cholet 49300 » (${bonnes.length}/12)`, gel(servies.filter((s) => !bonnes.includes(s))));
}

console.log("\n3. La phrase, dite une fois : ce que FillSell a fait, et où corriger pour ne plus la lire");
{
  const d = decision({ job: job("3c6a2823", {}), reglagesLbc: REGLAGES });
  const ph = typeof M.phraseDeLaTrace === "function" ? M.phraseDeLaTrace(d.trace ?? {}, "fr") : "";
  ok(/49308/.test(ph) && /Cholet \(49300\)/.test(ph) && /CEDEX/.test(ph) && /Ville de tes annonces Leboncoin/.test(ph) && !/Corrige[rz]? l'adresse/i.test(ph),
    "« 49308 n'est pas le code postal d'une commune (CEDEX…) : tes annonces partent à Cholet (49300) … « Ville de tes annonces Leboncoin » »", ph);
  const en = typeof M.phraseDeLaTrace === "function" ? M.phraseDeLaTrace(d.trace ?? {}, "en") : "";
  ok(/49308/.test(en) && /Cholet \(49300\)/.test(en), "et en anglais", en);
  ok(typeof M.phraseDejaDite === "function" && M.phraseDejaDite([{ ...d.trace, dite: true }], d.trace ?? {}), "phraseDejaDite reconnaît la même trace (une fois par compte)");
}

console.log("\n4. LA COMMUNE LEBONCOIN DONT LE CODE POSTAL EST CONNU (adresse dans une autre commune)");
{
  const ailleurs = { adresse: "2 rue Z 49340 Trémentines", code_postal: "49340", ville: "Trémentines" };
  const loc = (ville, code_postal) => ({ ville, code_postal, source: "annonces_leboncoin" });
  const d = decision({ job: job("x1", { adresse: ailleurs.adresse }), reglagesLbc: ailleurs, communesLbc: [loc("Cholet", "49300"), loc("Cholet", "49300"), loc("Trémentines", "49340")] });
  ok(d.action === "commune" && d.platform_fields?.ville_publication_lbc?.code_postal === "49300" && d.trace?.source_code_postal === "annonces_leboncoin",
    "« Cholet 49308 », annonces Leboncoin du compte à « Cholet 49300 » → Cholet 49300", gel(d.trace));
  // 8ac5bbda : « PARIS 75000 », adresse à Montfort-le-Gesnois, annonces à Paris 75001 → Paris 75001.
  const mont = { adresse: "2 rue Z 72450 Montfort le Gesnois", code_postal: "72450", ville: "Montfort le Gesnois" };
  const dp = decision({ job: job("x2", { adresse: mont.adresse, ville_publication_lbc: { code_postal: "75000", ville: "PARIS" } }), reglagesLbc: mont,
    communesLbc: [loc("Paris", "75001"), loc("Le Mans", "72000"), loc("Montfort-le-Gesnois", "72450")] });
  ok(dp.action === "commune" && dp.platform_fields?.ville_publication_lbc?.code_postal === "75001", "8ac5bbda « PARIS 75000 », annonces Leboncoin à Paris 75001 → Paris 75001", gel(dp.trace));
  // Une proposition de Leboncoin (refus d'un job du compte) qui nomme la commune avec son code de commune.
  const refusP = "Adresse \"Cholet 49308\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Cholet (49300)\", ne contient pas [\"49308\"]). Propositions affichées: [\"Cholet (49300)\",\"Route de Cholet, Distré (49400)\"].";
  const dr = decision({ job: job("x3", { adresse: ailleurs.adresse }, { error: refusP }), reglagesLbc: ailleurs });
  ok(dr.action === "commune" && dr.platform_fields?.ville_publication_lbc?.code_postal === "49300" && dr.trace?.source_code_postal === "propositions_leboncoin",
    "la proposition « Cholet (49300) » de Leboncoin → 49300 (« Route de Cholet, Distré (49400) » n'est PAS Cholet)", gel(dr.trace));
  ok(typeof M.communesLbcConnues === "function"
    && gel(M.communesLbcConnues({ refusCompte: [REFUS_CHOLET] }).map((c) => c.ville)) === gel(["Saint-Maur-des-Fossés", "Distré", "Doué-en-Anjou", "Les Herbiers", "Blanquefort"]),
    "les propositions réelles du refus de Cholet : des communes AUTRES que Cholet (aucune n'est prise pour Cholet)");
}

console.log("\n5. LE DOUTE EST UNE QUESTION — jamais une valeur inventée");
{
  const mont = { adresse: "2 rue Z 72450 Montfort le Gesnois", code_postal: "72450", ville: "Montfort le Gesnois" };
  const d = decision({ job: job("y1", { adresse: mont.adresse, ville_publication_lbc: { code_postal: "75000", ville: "PARIS" } }), reglagesLbc: mont });
  ok(d.action === "bloquer" && d.motif === "cp_non_commune" && /75001 à 75020/.test(d.message ?? "") && /Ville de tes annonces Leboncoin/.test(d.message ?? "")
    && !/Corrige[rz]? l'adresse/i.test(d.message ?? "") && !/Adresse de remise Leboncoin »/.test(d.message ?? ""),
    "« PARIS 75000 », rien de connu : question — le message pointe la ville des annonces, jamais l'adresse", d.message);
  const loc = (ville, code_postal) => ({ ville, code_postal, source: "annonces_leboncoin" });
  const d2 = decision({ job: job("y2", { adresse: mont.adresse, ville_publication_lbc: { code_postal: "75000", ville: "PARIS" } }), reglagesLbc: mont,
    communesLbc: [loc("Paris", "75011"), loc("Paris", "75018")] });
  ok(d2.action === "bloquer" && d2.trace?.motif === "plusieurs_codes" && /75011/.test(d2.message ?? "") && /75018/.test(d2.message ?? ""),
    "Paris connue à 75011 ET 75018 : FillSell ne choisit pas — question qui cite les deux", d2.message);
  const sd = { adresse: "3 rue W 97400 Saint-Denis", code_postal: "97400", ville: "Saint-Denis" };
  const d3 = decision({ job: job("y3", { adresse: sd.adresse, ville_publication_lbc: { code_postal: "93208", ville: "Saint-Denis" } }), reglagesLbc: sd });
  ok(d3.action === "bloquer", "« Saint-Denis 93208 » et une adresse à Saint-Denis 97400 : homonymes d'un autre département — jamais pris", gel(d3.trace));
  const a1 = vraiCp({ site: "leboncoin", ville: "Cholet", code_postal: "49308", adresses: [{ ville: "Cholet", code_postal: "49300" }, { ville: "Cholet", code_postal: "49310" }] });
  ok(a1.verdict === "question" && a1.motif === "plusieurs_codes", "l'adresse elle-même hésite (deux codes) : question", gel(a1));
}

console.log("\n6. PAR SITE (principe international) — et les écritures de la même commune");
{
  ok(V.SITES_CODES_POSTAUX && typeof V.SITES_CODES_POSTAUX === "object" && V.SITES_CODES_POSTAUX.leboncoin?.pays === "FR", "la table des codes de commune est PAR SITE (leboncoin → FR)");
  const s = vraiCp({ site: "kleinanzeigen", ville: "Köln", code_postal: "50667", adresses: [{ ville: "Köln", code_postal: "50667" }] });
  ok(s.verdict === "site_sans_table", "un site sans table : la règle ne s'applique pas (rien d'inventé)", gel(s));
  const c = vraiCp({ site: "leboncoin", ville: "CHOLET CEDEX", code_postal: "49308", adresses: [{ ville: "Cholet", code_postal: "49300" }] });
  ok(c.verdict === "repli" && c.code_postal === "49300" && c.ville === "CHOLET", "« CHOLET CEDEX 49308 » → CHOLET 49300 (le mot CEDEX, déclaré pour le site FR, n'est pas la commune)", gel(c));
  const dj = vraiCp({ site: "leboncoin", ville: "Cholet", code_postal: "49300", adresses: [] });
  ok(dj.verdict === "deja_commune", "un code de commune : rien à faire", gel(dj));
}

console.log("\n7. TÉMOINS : rien ne change là où il n'y a rien à changer (règle 3d intacte)");
{
  const dOk = decision({ job: job("t1", { ville_publication_lbc: { code_postal: "49300", ville: "Cholet" } }), reglagesLbc: { ...REGLAGES, ville_publication: { code_postal: "49300", ville: "Cholet" } } });
  ok(dOk.action === "tel_quel", "« Cholet 49300 » : servie telle quelle", gel(dOk));
  const repub = job("t2", { republish_step: "deleted", localisation_origine: { ville: "Cholet", code_postal: "49300" } }, { action: "republish" });
  ok(decision({ job: repub, reglagesLbc: REGLAGES }).action === "tel_quel", "republication : la localisation d'origine n'est jamais touchée");
  const adrCedex = decision({ job: job("t3", { adresse: "BP 12 49308 Cholet", ville_publication_lbc: undefined }), reglagesLbc: { adresse: "BP 12 49308 Cholet" } });
  ok(adrCedex.action === "bloquer" && /Adresse de remise/.test(adrCedex.message ?? ""), "l'ADRESSE de remise elle-même en CEDEX : bloquée, le message pointe l'adresse (hors de cette règle)", adrCedex.message);
  const corrige = { ...REGLAGES, ville_publication: { code_postal: "49340", ville: "Trémentines" } };
  const dc = decision({ job: job("t4", {}), reglagesLbc: corrige });
  ok(dc.action === "commune" && dc.platform_fields?.ville_publication_lbc?.code_postal === "49340" && dc.trace?.reglages_corriges,
    "la personne a corrigé la ville dans ses Réglages (Trémentines 49340) : c'est elle qui part, jamais la copie en CEDEX", gel(dc.trace));
  ok(decision({ job: { ...job("t5", {}), platform: "beebs" } }).action === "tel_quel", "Leboncoin seulement");
}

console.log("\n8. L'APP — la saisie n'accepte plus un code d'aucune commune (Réglages et carte de publication)");
{
  const adresse = { code_postal: "49300", ville: "Cholet" };
  const c1 = controle({ code_postal: "49308", ville: "Cholet" }, adresse);
  ok(c1.ok === false && c1.motif === "cp_non_commune" && c1.suggestion?.code_postal === "49300" && c1.suggestion?.ville === "Cholet",
    "« Cholet 49308 » refusé à la saisie, 49300 proposé (le code de Cholet dans l'adresse)", gel(c1));
  const c2 = controle({ code_postal: "75000", ville: "Paris" }, { code_postal: "72450", ville: "Montfort le Gesnois" });
  ok(c2.ok === false && c2.suggestion == null && /75001 à 75020/.test(String(c2.codes ?? "")), "« Paris 75000 » : refusé, aucune suggestion inventée, codes de commune cités", gel(c2));
  const c3 = controle({ code_postal: "49300", ville: "Cholet" }, adresse);
  ok(c3.ok === true && c3.v?.code_postal === "49300", "« Cholet 49300 » : accepté", gel(c3));
  ok(typeof A.messageVilleLbc === "function" && /49308/.test(A.messageVilleLbc(c1, "fr")) && /49300/.test(A.messageVilleLbc(c1, "fr")) && /49308/.test(A.messageVilleLbc(c1, "en")),
    "le message de saisie (fr, en) nomme le code refusé et celui proposé");
  const r1 = readFileSync(new URL("../src/reglages/VilleLeboncoinParDefaut.jsx", import.meta.url), "utf8");
  const r2 = readFileSync(new URL("../src/publication/VilleAnnonceLbc.jsx", import.meta.url), "utf8");
  ok(/controleVilleLbc\(/.test(r1) && /messageVilleLbc\(/.test(r1), "Réglages › « Ville de tes annonces Leboncoin » applique la règle (le seul écrivain du réglage)");
  ok(/controleVilleLbc\(/.test(r2) && /messageVilleLbc\(/.test(r2), "la carte Leboncoin (ville pour CETTE annonce) applique la règle");
}

console.log("\n9. BRANCHEMENT : get-pending-jobs passe les communes Leboncoin connues, lues seulement quand il le faut");
{
  const gpj = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
  ok(/decisionCommuneLbc\(\{ job: j, reglagesLbc, refusCompte, communesLbc \}\)/.test(gpj), "decisionCommuneLbc reçoit les communes Leboncoin connues du compte");
  const i = gpj.indexOf("LEBONCOIN — MÊME CODE POSTAL : LA COMMUNE DE LEBONCOIN");
  const bloc = i >= 0 ? gpj.slice(i, gpj.indexOf("commune Leboncoin par code postal", i)) : "";
  ok(/aBesoinDesCommunesLbc\(/.test(bloc) && /from\("annonces_plateforme"\)/.test(bloc) && /\.eq\("platform", "leboncoin"\)/.test(bloc) && /\.limit\(\d+\)/.test(bloc),
    "lecture bornée de la localisation des annonces Leboncoin du compte, seulement si une ville porte un code d'aucune commune");
  ok(/phraseDeLaTrace\(/.test(bloc) && /code_postal_servi/.test(bloc), "la phrase dite une fois couvre aussi le code postal remplacé");
  ok(!/platform_settings_fusionner/.test(bloc), "Réglages jamais écrits par le serveur");
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
