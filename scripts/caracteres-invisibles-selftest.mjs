// ═══════════════════════════════════════════════════════════════════════════
// Selftest « un caractère invisible ne part jamais vers une plateforme » (05/11, point 6 — Smail Lachkar, ee5fc232)
//   npm run selftest:caracteres-invisibles
//
// LE CAS : « ​Basket Asics Gel-Lethal MP 7… » — titre et description commençaient par un U+200B (fiche importée d'un
// relevé Leboncoin). Vinted : « Tu ne peux pas utiliser les caractères spéciaux (​) dans le champ Titre » ; la
// publication demandait à la personne un autre titre pour un caractère qu'elle ne voit pas.
// CE QUE CE TEST VERROUILLE :
//   A. le nettoyage (_shared/caracteres-invisibles.js) : invisibles retirés, espaces spéciales ordinaires, accents,
//      ponctuation, emojis et ZWJ entre emojis intacts, lignes de la description gardées ;
//   B. l'envoi : get-pending-jobs nettoie chaque job servi (titre, description, copie de recréation, titre_saisi) ;
//      l'extension (0.6.173) aussi, avant de taper — même comportement que le module, sur tout le corpus ;
//   C. le refus de Vinted pour un caractère INVISIBLE n'est plus « à toi » : reprise automatique, une fois ; un
//      caractère VISIBLE (« ★ ») reste la question d'avant ;
//   D. le job déjà arrêté (forme exacte de ee5fc232) repart seul : règle 10 des questions tranchées (handler-watch).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/caracteres-invisibles.js")).href);
const { classerEchec } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/pas-de-rouge.js")).href);

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const Z = "​";
const TITRE_SMAIL = `${Z}Basket Asics Gel-Lethal MP 7 - Rose et Blanche - Taille : 37 et 39,5 - neuf`;
const MOTIF_SMAIL = `Tu ne peux pas utiliser les caractères spéciaux (${Z}) dans le champ Titre`;

console.log("\n[A] le nettoyage");
ok(M.nettoyerTitre(TITRE_SMAIL) === TITRE_SMAIL.slice(1), "le titre de Smail perd son U+200B, rien d'autre");
const corpus = [
  ["Pull col roulé : laine mérinos – état neuf", "Pull col roulé : laine mérinos – état neuf", "insécable → espace ; accents, tiret long intacts"],
  ["Robe à fleurs", "Robe à fleurs", "espaces fines → espaces ordinaires"],
  ["Ve­ste‌ en⁠ cuir﻿", "Veste en cuir", "trait d'union conditionnel, ZWNJ, word joiner, BOM retirés"],
  ["‮Jean‬ ‎slim‏", "Jean slim", "marques de sens retirées"],
  ["Sac\u0007 à\u0000 main\u0085", "Sac à main", "contrôles C0 et C1 retirés"],
  ["Jupe\tplissée", "Jupe plissée", "tabulation → espace"],
  ["T-shirt  ​  noir", "T-shirt noir", "espaces doublées par le retrait : une seule"],
  ["Doudoune ★ Moncler", "Doudoune ★ Moncler", "un symbole VISIBLE n'est pas touché"],
  ["Ceinture‍ cuir", "Ceinture cuir", "un ZWJ seul est invisible : retiré"],
];
for (const [avant, apres, nom] of corpus) ok(M.nettoyerTitre(avant) === apres, nom, JSON.stringify(M.nettoyerTitre(avant)));
const famille = "Famille 👩‍👩‍👧 et drapeau 🏳️‍🌈 ❤️ 👍🏽";
ok(M.nettoyerDescription(famille) === famille, "description : emojis, ZWJ entre emojis, sélecteurs et teintes intacts");
const desc = `${Z}Basket neuve.\r\nPointure 37. Envoi soigné.  \n\n— Merci !`;
ok(M.nettoyerDescription(desc) === "Basket neuve.\nPointure 37.\nEnvoi soigné.\n\n— Merci !", "description : lignes gardées (CRLF, séparateur Unicode), fins de ligne propres",
  JSON.stringify(M.nettoyerDescription(desc)));
ok(M.nettoyerTitre("Ligne 1\nLigne 2") === "Ligne 1\nLigne 2", "titre : ses retours à la ligne restent à la règle d'avant (Vinted seul les change, 25/10)");
ok(M.nettoyerTitre(null) === null && M.nettoyerDescription(undefined) === undefined, "rien → rien (jamais une chaîne inventée)");
ok(M.seulementInvisibles(Z) && M.seulementInvisibles("​﻿") && !M.seulementInvisibles("★") && !M.seulementInvisibles(""),
  "seulementInvisibles : « (​) » oui, « (★) » non, vide non");
ok(M.porteInvisibles(TITRE_SMAIL) && !M.porteInvisibles("Basket Asics"), "porteInvisibles");

console.log("\n[B] l'envoi : get-pending-jobs et l'extension");
{
  const job = { id: "ee5fc232", platform: "vinted", action: "publish", title: TITRE_SMAIL, description: `${Z}Basket neuve`, platform_fields: { marque: "Asics" } };
  const servi = M.jobSansInvisibles(job);
  ok(servi.title === TITRE_SMAIL.slice(1) && servi.description === "Basket neuve" && servi.platform_fields.marque === "Asics", "job servi : titre et description nettoyés, le reste intact");
  ok(job.title === TITRE_SMAIL, "le job d'origine n'est pas modifié (copie)");
  const rep = M.jobSansInvisibles({ id: "r", action: "republish", title: "Sac", description: "ok",
    platform_fields: { titre_saisi: `Sac${Z}`, republish_snapshot: { titre: `${Z}Sac cuir`, description: `x${Z}`, prix: 12 } } });
  ok(rep.platform_fields.titre_saisi === "Sac" && rep.platform_fields.republish_snapshot.titre === "Sac cuir"
    && rep.platform_fields.republish_snapshot.description === "x" && rep.platform_fields.republish_snapshot.prix === 12,
    "republication : titre_saisi et copie de recréation nettoyés, le reste de la copie intact");
  const propre = { id: "p", title: "Sac", description: "ok", platform_fields: { republish_snapshot: { titre: "Sac" } } };
  ok(M.jobSansInvisibles(propre) === propre, "un job propre repart tel quel (même objet)");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  // Juste avant la limite des photos, qui reste la DERNIÈRE réécriture de la liste (selftest photos-limite-vinted).
  const iInv = gpj.indexOf("out = out.map((j) => jobSansInvisibles(j) as typeof j);");
  const iPh = gpj.indexOf("out = out.map((j) => jobDansLaLimitePhotos(j) as typeof j);");
  const entre = iInv > 0 ? gpj.slice(gpj.indexOf("\n", iInv), iPh) : "x";
  ok(iInv > 0 && iPh > iInv && !/out = |out\.push/.test(entre) && gpj.indexOf("return json({\n      jobs: out,") > iPh,
    "get-pending-jobs nettoie CHAQUE job servi, juste avant la réponse (puis la limite des photos)");
  // L'extension : même comportement que le module, titre et description, sur tout le corpus.
  const bg = lire("chrome-extension/background.js");
  const i = bg.indexOf("const PICTO_ENVOI = ");
  const f = bg.indexOf("\n}\n", bg.indexOf("function nettoyerInvisibles(", i));
  // eslint-disable-next-line no-new-func
  const ext = new Function(`${bg.slice(i, f + 2)}\nreturn nettoyerInvisibles;`)();
  const tous = [TITRE_SMAIL, famille, desc, ...corpus.map((c) => c[0]), "Ligne 1\nLigne 2", "", "   ", `\u{1F469}‍`];
  ok(tous.every((t) => ext(t, false) === M.nettoyerTitre(t) && ext(t, true) === M.nettoyerDescription(t)),
    `extension 0.6.173 : nettoyerInvisibles = le module, titre et description (${tous.length} textes)`);
  const sj = bg.slice(bg.indexOf("function sanitizeJob(job) {"), bg.indexOf("\n}\n", bg.indexOf("function sanitizeJob(job) {")));
  ok(/nettoyerInvisibles\(job\.description, true\)/.test(sj) && /nettoyerInvisibles\(job\.title, false\)/.test(sj) && /return \{ \.\.\.job, title, description \};/.test(sj),
    "extension : sanitizeJob nettoie titre ET description (publication et recréation y passent)");
  // Le nettoyage est entré dans la 0.6.173 : toute version suivante le porte (05/11 après-midi : 0.6.174).
  const versionExt = JSON.parse(lire("chrome-extension/manifest.json")).version.split(".").map(Number);
  ok(versionExt[0] > 0 || versionExt[1] > 6 || (versionExt[1] === 6 && versionExt[2] >= 173), "dans la 0.6.173 et les suivantes", versionExt.join("."));
}

console.log("\n[C] le refus de Vinted pour un caractère invisible repart tout seul");
{
  const brut = `HTTP 400 {"code":99,"message":"validation_error","errors":[{"field":"title","value":"${MOTIF_SMAIL}"}]}`;
  const r = classerEchec({ platform: "vinted", action: "publish", brut, titre: TITRE_SMAIL, pf: { marque: "Asics" } });
  ok(r?.verdict === "reprise" && r.statut === "pending" && r.motif === "vinted_titre_invisibles" && r.pf?.titre_saisi === TITRE_SMAIL.slice(1),
    "refus « (​) » → reprise, titre sans le caractère rangé en titre_saisi", JSON.stringify(r).slice(0, 300));
  ok(/caractère invisible/.test(r?.message ?? "") && /ta fiche ne change pas/.test(r?.message ?? "") && !/Écris un autre titre/.test(r?.message ?? ""),
    "le message dit que FillSell s'en est chargé, jamais « écris un autre titre »");
  const r2 = classerEchec({ platform: "vinted", action: "publish", brut, titre: TITRE_SMAIL.slice(1), pf: { ...r.pf } });
  ok(r2?.verdict === "a_toi", "deuxième refus après la reprise : la question d'avant (jamais une boucle)", JSON.stringify(r2).slice(0, 200));
  const visible = brut.replace(`(${Z})`, "(★)");
  const r3 = classerEchec({ platform: "vinted", action: "publish", brut: visible, titre: "Doudoune ★ Moncler", pf: {} });
  ok(r3?.verdict !== "reprise" || r3?.motif !== "vinted_titre_invisibles", "un caractère VISIBLE refusé n'est jamais traité comme invisible", JSON.stringify(r3).slice(0, 200));
}

console.log("\n[D] le job déjà arrêté (ee5fc232) repart seul");
{
  const job = { id: "ee5fc232", status: "needs_user", action: "publish", platform: "vinted", title: TITRE_SMAIL, error: "Vinted refuse le titre…",
    platform_fields: { needs_user_source: "champ_a_choisir", needsUserField: { field_key: "title", target: { root: null, key: "titre_saisi" } },
      titre_refuse: { le: "2026-11-05T08:41:39.000Z", motif: MOTIF_SMAIL }, marque: "Asics" } };
  const t = M.titreInvisiblesATrancher(job, "2026-11-05T12:00:00Z");
  ok(t?.apres === TITRE_SMAIL.slice(1) && t.platform_fields.titre_saisi === t.apres && !t.platform_fields.needs_user_source
    && t.platform_fields.titre_refuse?.motif === MOTIF_SMAIL && t.platform_fields.titre_invisibles_retires,
    "tranché : titre_saisi sans le caractère, question retirée, titre_refuse gardé (get-pending-jobs l'écrit sur le job)");
  ok(M.titreInvisiblesATrancher({ ...job, platform_fields: { ...job.platform_fields, titre_invisibles_retires: { le: "x" } } }) === null, "une passe par job");
  ok(M.titreInvisiblesATrancher({ ...job, platform_fields: { ...job.platform_fields, titre_refuse: { motif: "Tu ne peux pas utiliser les caractères spéciaux (★) dans le champ Titre" } } }) === null,
    "un caractère visible : la question reste");
  const qt = lire("supabase/functions/_shared/questions-tranchees.ts");
  ok(/const r = titreInvisiblesATrancher\(j, maintenant\);[\s\S]{0,200}\.update\(\{ status: "pending", error: null, platform_fields: r\.platform_fields \}\)\s*\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(qt),
    "handler-watch (questions tranchées, règle 10) : compare-and-swap sur needs_user, puis en file");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — un caractère invisible ne part jamais vers une plateforme`);
process.exit(ko ? 1 : 0);
