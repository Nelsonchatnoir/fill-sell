// Autotest — AUCUN texte de développeur n'atteint un écran (03/10, point 15)
//   npm run selftest:textes-montres
//
// geronimo0550 lisait « LIVE : aspect(s) obligatoire(s) eBay vide(s) sur le
// formulaire… ». La traduction existait (humanizeJobError) ; quatre écrans la
// contournaient : la modale de republication (brut tant que le job vit), le
// suivi du lot, les republications planifiées et le popup de l'extension.
// Ce test passe LES 202 FORMES RÉELLES de message des 30 derniers jours
// (11 718 jobs, corpus figé le 03/10) par la porte commune, et vérifie que
// chaque écran passe par elle.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const { humanizeJobError, jobErrorSansFaussePromesse, texteSuiviLisible } =
  await import(pathToFileURL(join(ROOT, "src/utils/shared.js")).href);
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Ce qu'un vendeur ne doit JAMAIS lire (plus large que les filets eux-mêmes :
// c'est le juge, pas l'outil).
const JARGON = new RegExp([
  String.raw`(?:^|[^a-z])(?:src|scripts|docs|supabase|chrome-extension)/[a-z0-9._/-]+`, String.raw`\.(?:js|ts|mjs|jsx|tsx)\b`,
  String.raw`\b(?:update-job-status|get-pending-jobs|generate-listing|ebay-api-worker|handler-watch|resolve-categorie)\b`,
  String.raw`\b(?:categoryId|catalogId|catalog_id|size_id|leaf_id|field_key|platform_fields|needsUserFields?|needs_user|package_size|valeur_inchangee|inventaire_id)\b`,
  String.raw`/(?:sl/list|lstng|items/new|ws/eBayISAPI|fpa|api/v2)\b`, String.raw`querySelector|outerHTML|innerHTML|data-testid|document\.|window\.`,
  String.raw`\b(?:TypeError|ReferenceError|SyntaxError)\b|Cannot read propert|is not defined|is not a function`, String.raw`\[object Object\]`,
  String.raw`\bLIVE\s*:`, String.raw`Observabilit`, String.raw`\bjobs?\b`, String.raw`'published'`, String.raw`content script`,
  String.raw`onglet de travail`, String.raw`\bsonde\b`, String.raw`s[ée]lecteur|selector`, String.raw`payload`, String.raw`\bworker\b`,
  String.raw`\bHTTP\b`, String.raw`anti-bot`, String.raw`Could not establish|Receiving end|message channel|Failed to fetch|Timeout:`,
  String.raw`\bprevol\b`, String.raw`\[cause`, String.raw`\{\s*"`, String.raw`https?://`, String.raw`aspect\(s\)`,
  String.raw`\bnull\b`, String.raw`\bundefined\b`, String.raw`\bverdict\b`, String.raw`D[ée]tail du remplissage`,
].join("|"), "i");

console.log("\n1. LE PARC RÉEL (30 jours) PAR LA PORTE COMMUNE");
const corpus = JSON.parse(lire("scripts/corpus/messages-montres-2026-10-03.json"));
ok(corpus.length === 202 && corpus.reduce((s, x) => s + x.n, 0) === 11718, "corpus intact (202 formes, 11 718 jobs)");
for (const [nom, fn] of [["humanizeJobError", humanizeJobError], ["jobErrorSansFaussePromesse", jobErrorSansFaussePromesse]]) {
  const fuites = [];
  for (const x of corpus) {
    const job = { platform: x.p, action: x.a, status: x.s, error: x.t, platform_fields: x.pf ?? {} };
    for (const lang of ["fr", "en"]) {
      const t = fn(job, lang);
      const m = String(t).match(JARGON);
      if (m) fuites.push(`${x.n} job(s) ${x.p}/${x.a}/${x.s} [${lang}] « ${m[0]} » : ${String(t).slice(0, 140)}`);
    }
  }
  ok(fuites.length === 0, `${nom} : aucun mot de développeur, en français comme en anglais`, fuites.slice(0, 6).join("\n      "));
}

console.log("\n2. LES CAS QUI FUYAIENT");
const geronimo = { platform: "ebay", action: "publish", status: "needs_user",
  error: "LIVE : aspect(s) obligatoire(s) eBay vide(s) sur le formulaire : Numéro de pièce fabricant — publication NON tentée (refus eBay garanti). Compléter le champ dans l'app (badge « À compléter » du Stock) ; le job repartira ensuite automatiquement. Détail du remplissage : Numéro de pièce fabricant: champ sauté — bouton-valeur introuvable" };
const g = jobErrorSansFaussePromesse(geronimo, "fr");
ok(/Numéro de pièce fabricant/.test(g) && !JARGON.test(g), "geronimo0550 : le champ demandé, en mots de vendeur, même sur un job vivant", g);
const verif = humanizeJobError({ platform: "vinted", action: "publish", status: "published",
  error: "Impossible de vérifier l'état de cette annonce vinted après 4 tentatives (page de vérification anti-bot ou format inattendu). L'annonce N'A PAS été touchée et le job reste 'published' : vérifier à la main sur la plateforme. Nouvelle tentative dans 24 h." }, "fr");
ok(verif === "Impossible de vérifier cette annonce sur Vinted : sa page n'a pas répondu comme prévu. L'annonce n'a pas été touchée ; nouvelle vérification dans 24 h.",
  "la note de vérification (2 864 jobs en 14 jours) dit la même chose sans « job »", verif);
const doublon = humanizeJobError({ platform: "leboncoin", action: "publish", status: "cancelled",
  error: "Annulé le 10/09 : doublon. Cet article est repris par le job 31e20d5e, remis en file après vérification qu'aucune annonce n'existe en ligne. Ton article n'est pas perdu, il part une seule fois." }, "fr");
ok(/doublon/.test(doublon) && !/relance/i.test(doublon) && !JARGON.test(doublon), "un doublon annulé ne conseille plus de relancer", doublon);

console.log("\n3. LES QUATRE ÉCRANS PASSENT PAR LA PORTE");
const lot = lire("src/publication/lot/SuiviLot.jsx");
ok(/avecPlateforme\(p\.platform, humanizeJobError\(p\.job, lang\)\)/.test(lot) && /p\.job\?\.error \? humanizeJobError\(p\.job, lang\) : ""/.test(lot) &&
   !/avecPlateforme\(p\.platform, p\.job(?:\?)?\.error/.test(lot), "suivi du lot");
const planif = lire("src/components/RepublicationPlanifiee.jsx");
ok(/humanizeJobError\(\{ \.\.\.j, platform: c\.platform, action: 'republish' \}/.test(planif) && !/String\(j\.error\)\.slice/.test(planif), "republications planifiées");
const shared = lire("src/utils/shared.js");
ok(/if \(TECH_ERR_MARKERS_RE\.test\(raw\) \|\| \/\\bjobs\?\\b\/i\.test\(raw\) \|\| texteSuiviLisible\(raw, '', lang === 'en'\)/.test(shared),
  "modale de republication (jobErrorSansFaussePromesse) : un brut technique passe par la porte");
const popup = lire("chrome-extension/popup.js");
ok(/const shortErr = \(msg\) => \{\s+const s = texteMontrable\(msg\) \?\? "À voir dans l'appli";/.test(popup) &&
   /const complet = texteMontrable\(st\?\.msg\) \|\| texteMontrable\(rec\?\.error\)/.test(popup) &&
   /const messagePropre = \(brut\) => \{\s+const s = texteMontrable\(brut\);/.test(popup), "popup de l'extension (case, info-bulle, motifs)");
// La porte du popup, exécutée telle qu'écrite.
const debut = popup.indexOf("const VOCABULAIRE_TECHNIQUE_RE");
const fin = popup.indexOf("// Un message écrit pour être lu");
const texteMontrable = new Function(`${popup.slice(debut, fin)}; return texteMontrable;`)();
ok(texteMontrable(geronimo.error) === null && texteMontrable("Connexion Vinted requise : connecte-toi.") === "Connexion Vinted requise : connecte-toi." &&
   texteMontrable("le job repartira") === null && texteMontrable("échec dans src/utils/x.js") === null,
  "popup : la porte refuse le jargon et laisse passer une phrase de vendeur");

console.log("\n4. LES SOURCES ÉCRIVENT DÉJÀ LES BONS MOTS (extension 0.6.90, veilleur)");
const bg = lire("chrome-extension/background.js");
ok(/`Impossible de vérifier cette annonce sur \$\{LABEL_PLATEFORME\[job\.platform\] \?\? job\.platform\} : ` \+\s+"sa page n'a pas répondu comme prévu\. L'annonce n'a pas été touchée ; nouvelle vérification dans 24 h\.";/.test(bg),
  "extension : la note de vérification est la phrase de l'app, à l'octet");
ok(/"l'ancienne publication est close, ce n'est pas une vente\."/.test(bg) && !/job obsolète clos/.test(bg), "extension : « remplacée par une republication » sans « job »");
ok(texteSuiviLisible("Annonce 1 remplacée par une republication (l'article vit désormais sur l'annonce 2) — job obsolète clos automatiquement, pas une vente.", "Vinted", false)
   === "Annonce 1 remplacée par une republication (l'article vit désormais sur l'annonce 2) : l'ancienne publication est close, ce n'est pas une vente.",
  "app : l'ancien texte réécrit comme le nouveau");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(!/Le job est remis en file/.test(hw) && !/extension connectée se réveille/.test(hw), "veilleur : plus de « job » ni d'« extension connectée qui se réveille »");
const app = lire("src/utils/shared.js");
ok(!/le job est arrêté|Le job est arrêté|Ce job a été|the job has stopped|this job\./.test(app), "app : ses propres textes ne disent plus « job »");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ textes montrés : aucun mot de développeur, une seule porte partout");
