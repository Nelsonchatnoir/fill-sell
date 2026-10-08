// Autotest — Beebs : un format de colis EXPLICITE passe devant le pré-remplissage (04/10, Louis — 0.6.95)
//   npm run selftest:beebs-format-colis-explicite
//
// Rangements de Louis : « Poids jusqu'à 200g max » sur l'annonce, « 1 kg » à
// la recréation — le remplisseur gardait toujours le pré-remplissage de Beebs.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const beebs = lire("chrome-extension/content-scripts/beebs.js");
const bg = lire("chrome-extension/background.js");

// La fonction pure, extraite telle quelle du content script.
function extraire(src, nom) {
  const i = src.indexOf(`function ${nom}(`);
  if (i < 0) throw new Error(`${nom} introuvable`);
  let j = src.indexOf("{", i), n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") n++;
    else if (src[k] === "}") { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`${nom} non fermée`);
}
const formatColisExplicite = new Function(`${extraire(beebs, "formatColisExplicite")}; return formatColisExplicite;`)();

const champs = [
  { label: "Format du colis", options: [
    { id: "5i5zYtqOJt3Ji8EEtKhvP0", t: "Poids jusqu'à 200g max" },
    { id: "AAAAbbbbCCCC1111", t: "Poids jusqu'à 1 kg max" },
  ] },
];

console.log("\n1. LA DÉCISION");
ok(formatColisExplicite({ needsUserResolved: { format_colis: "Poids jusqu'à 2 kg max" }, format_colis_explicite: "Poids jusqu'à 500g max" }, champs)?.source === "réponse",
  "la réponse de la personne passe en premier");
const parId = formatColisExplicite({ champs_lus_sur_l_annonce: { lus: { format_colis_id: "5i5zYtqOJt3Ji8EEtKhvP0" } } }, champs);
ok(parId?.source === "annonce" && parId?.titre === "Poids jusqu'à 200g max", "le format relu sur l'annonce, traduit par les options du formulaire", JSON.stringify(parId));
ok(formatColisExplicite({ champs_lus_sur_l_annonce: { lus: { format_colis_id: "inconnuXXXX1234" } }, format_colis_explicite: "Poids jusqu'à 500g max" }, champs)?.source === "fiche",
  "identifiant absent du formulaire : le poids de la fiche prend la suite");
ok(formatColisExplicite({ champs_lus_sur_l_annonce: { lus: { format_colis_id: "5i5zYtqOJt3Ji8EEtKhvP0" } } }, [])?.source !== "annonce",
  "formulaire sans options lues : jamais de devinette sur l'identifiant");
ok(formatColisExplicite({ format_colis_explicite: "Poids jusqu'à 500g max" }, champs)?.titre === "Poids jusqu'à 500g max", "le poids de la fiche, traduit en palier");
ok(formatColisExplicite({ format_colis_explicite: "Petit colis" }, champs) === null, "un libellé qui n'est pas un palier Beebs n'est pas explicite");
ok(formatColisExplicite({ format_colis: "Petit colis" }, champs) === null, "sans rien d'explicite : null (comportement d'avant)");

console.log("\n2. LE REMPLISSAGE");
const bloc = beebs.slice(beebs.indexOf('const packageField = findField("Format du colis");'));
ok(/const formatExplicite = formatColisExplicite\(fields, beebsFiberChamps\);/.test(bloc), "décidé avec les champs du formulaire");
ok(bloc.indexOf("if (formatExplicite && normalizeFuzzy(current) !== normalizeFuzzy(formatExplicite.titre))") >= 0
  && bloc.indexOf("if (formatExplicite && normalizeFuzzy(current)") < bloc.indexOf("déjà posé par Beebs"),
  "un format explicite passe AVANT « déjà posé par Beebs, conservé »");
ok(/askBackground\(\{ type: "BEEBS_FORMATS_COLIS", formats: champFormat\.options\.map/.test(beebs), "les formats du formulaire sont envoyés au serveur, sans attendre");
// (08/10) Chaque version ajoute son entrée EN TÊTE de l'empreinte (0.6.103 : « ping ») : l'entrée 0.6.95 doit y rester, pas forcément en premier.
ok(/^const BEEBS_BUILD = ".*2026-10-04-format-colis-explicite \(0\.6\.95/m.test(beebs), "empreinte de version du content script à jour");

console.log("\n3. LE BACKGROUND");
ok(/v\.sys && typeof v\.sys\.id === "string" \? \{ id: v\.sys\.id, t: texte\(v\) \}/.test(bg), "la lecture des champs garde l'identifiant de chaque option-objet");
ok(/out\.format_colis_id = ids\.size === 1 \? \[\.\.\.ids\]\[0\] : null;/.test(bg), "page d'annonce : l'identifiant de format seulement s'il est UNIQUE");
ok(/const CHAMPS_LUS_SUR_L_ANNONCE = \[[^\]]*"format_colis_id"\]/.test(bg), "relu avant tout retrait, comme la taille et l'âge");
ok(/restRequest\("rpc\/noter_formats_colis_beebs"/.test(bg), "appris par le serveur (noter_formats_colis_beebs)");
const reporter = bg.slice(bg.indexOf("async function reporterCaptureSurArticle("), bg.indexOf("async function reporterCaptureSurArticle(") + 6000);
ok(!/patch\.prix_vente = Number\(prixListe\)/.test(reporter) && /void prixListe;/.test(reporter), "le prix ne se suit plus ici : la base fait la règle (journal, garde-fou)");

console.log("\n4. LE SERVEUR (_shared/beebs-format-colis.js, get-pending-jobs)");
const { pathToFileURL } = await import("node:url");
const S = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/beebs-format-colis.js")).href);
const appris = [{ id: "5i5zYtqOJt3Ji8EEtKhvP0", titre: "Poids jusqu'à 200g max", poids_g: 200 }];
ok(S.libellePalierBeebs(500) === "Poids jusqu'à 500g max" && S.libellePalierBeebs(1000) === "Poids jusqu'à 1 kg max" && S.libellePalierBeebs(15000) === "Poids jusqu'à 15 kg max",
  "libellés des paliers, à la forme des options du formulaire");
ok(S.formatBeebsExplicite({ formatIdAnnonce: "5i5zYtqOJt3Ji8EEtKhvP0", poidsFiche: 900, appris })?.source === "annonce", "le format relu sur l'annonce passe devant le poids de la fiche");
const f300 = S.formatBeebsExplicite({ poidsFiche: 300, appris });
ok(f300?.titre === "Poids jusqu'à 500g max" && f300?.poids_g === 500, "300 g → palier 500 g", JSON.stringify(f300));
ok(S.formatBeebsExplicite({ poidsFiche: 200, appris })?.titre === "Poids jusqu'à 200g max", "200 g → 200 g (titre appris)");
ok(S.formatBeebsExplicite({ poidsFiche: 16000, appris }) === null, "au-delà de 15 kg : rien d'inventé");
ok(S.formatBeebsExplicite({ formatIdAnnonce: "inconnu00000000", appris }) === null, "identifiant inconnu et pas de poids : rien");
ok(S.formatBeebsDuChoix("Lettre")?.titre === "Poids jusqu'à 500g max" && S.formatBeebsDuChoix("Petit colis")?.titre === "Poids jusqu'à 1 kg max", "le format choisi dans l'app, même table que beebs.js");
ok(S.formatBeebsDuChoix("") === null && S.formatBeebsDuChoix("Volumineux") === null, "pas de choix (ou inconnu) : rien");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const blocS = gpj.slice(gpj.indexOf("BEEBS : LE FORMAT DE COLIS À POSER EST DIT À L'EXTENSION"), gpj.indexOf("OPLA : UN PRIX AU-DESSUS DE SON PLAFOND"));
ok(/pfJ\.format_colis_explicite = f\.titre;/.test(blocS), "get-pending-jobs pose format_colis_explicite");
ok(/needsUserResolved \?\? \{\}\) as Record<string, unknown>\)\.format_colis/.test(blocS), "la réponse de la personne n'est jamais remplacée");
ok(/avantRetraitB && !posteFormatExplicite/.test(blocS) && /version_min: "0\.6\.95"/.test(blocS), "poste < 0.6.95 : republication pas encore retirée retenue, annonce intacte");
ok(/build_min \?\? ""\) === BUILD_BEEBS_FORMAT_EXPLICITE/.test(blocS) && /if \(minRetenue !== BUILD_BEEBS_ADRESSE_STRICTE\) continue;/.test(gpj),
  "chaque retenue « mise à jour » ne lève que la sienne (pas de va-et-vient)");
const corr = lire("supabase/functions/_shared/correctifs-extension.js");
// Le commit de la 0.6.95 : EXTENSION_LAST_COMMIT tant qu'elle était la
// dernière, puis la ligne « (avant : '…' = 0.6.95 » quand une version plus
// récente l'a recalé (0.6.96, 04/10 soir). Le seuil, lui, ne bouge pas : toute
// version postérieure contient le correctif.
const buildId = lire("scripts/build-id.mjs");
const lc = buildId.match(/export const EXTENSION_LAST_COMMIT = '([^']+)'; \/\/ 0\.6\.95 /)?.[1]
  ?? buildId.match(/\(avant : '([^']+)' = 0\.6\.95,/)?.[1];
ok(Boolean(lc) && new RegExp(`BUILD_BEEBS_FORMAT_EXPLICITE = "${lc}"`).test(corr), "le seuil = le commit du correctif (EXTENSION_LAST_COMMIT de la 0.6.95)", `commit 0.6.95 ${lc}`);

console.log("\n5. LEBONCOIN : LA REPUBLICATION REPREND LA LIVRAISON DE L'ANNONCE");
const blocL = gpj.slice(gpj.indexOf("LA LIVRAISON DE L'ANNONCE, REPRISE AU REDÉPÔT"), gpj.indexOf("« POIDS DU COLIS* » DU FORMULAIRE PRO, RELU EN TRANCHE"));
ok(/!reponduL\("lbcPoidsGrammes"\) && Math\.round\(grammes\) !== Number\(pf\["lbcPoidsGrammes"\]\)/.test(blocL), "le poids de l'annonce l'emporte sur la copie (sauf réponse)");
ok(/!reponduL\("format_colis"\) && String\(pf\["format_colis"\] \?\? ""\)\.trim\(\) !== FORMATS\[taille\]/.test(blocL), "le format S/M/L de l'annonce aussi");
ok(/vals && !reponduL\("lbcTransporteurs"\)/.test(blocL), "et ses transporteurs");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ un format de colis explicite passe devant le pré-remplissage de Beebs");
