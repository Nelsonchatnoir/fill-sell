// ═══════════════════════════════════════════════════════════════════════════
// AUCUN DÉPÔT SANS TITRE — preuve de la règle (2026-09-25, patrick giry)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (_shared/titre-du-job.js) et son câblage dans get-pending-jobs :
//   · un job qui A un titre ne bouge pas ;
//   · titre vide → réponse à la question « Titre », sinon titre de la fiche,
//     coupé au mot au plafond de la plateforme ;
//   · rien → null (la question part, pas de dépôt) ;
//   · le filet tourne AVANT les blocs qui lisent le titre.
// Rejoue aussi le job réel 891a7039 (eBay, patrick giry) avec sa fiche.
import { readFileSync } from "node:fs";
import { titrePourJob, titreVide, couperTitre, TITRE_MAX, CLE_TITRE_SAISI } from "../supabase/functions/_shared/titre-du-job.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};

console.log("1. LA RÈGLE");
ok(titrePourJob({ platform: "vinted", titreJob: "Robe", titreFiche: "Autre" })?.titre === "Robe", "un job titré part tel quel (source job)");
ok(titrePourJob({ platform: "vinted", titreJob: "Robe", titreFiche: "Autre" })?.source === "job", "… et la source le dit");
ok(titrePourJob({ platform: "opla", titreJob: "", titreSaisi: "Pull bleu", titreFiche: "Pull" })?.titre === "Pull bleu", "la réponse à la question prime sur la fiche");
ok(titrePourJob({ platform: "opla", titreJob: "  ", titreFiche: "Pull" })?.source === "fiche", "titre d'espaces = vide → fiche");
ok(titrePourJob({ platform: "ebay", titreJob: null, titreFiche: "" }) === null, "rien de connu → null (question, jamais un dépôt)");
ok(titrePourJob({ platform: "ebay", titreJob: undefined }) === null, "champs absents → null");
ok(titreVide(null) && titreVide("") && titreVide(" \n ") && !titreVide("a"), "titreVide");
const long = "Manteau ".repeat(30).trim();
for (const [pf, max] of Object.entries(TITRE_MAX)) {
  const c = couperTitre(long, pf);
  ok(c.length <= max && c.endsWith("Manteau"), `coupé au mot pour ${pf} (≤ ${max})`, `${c.length} car.`);
}
ok(couperTitre("  Pull   bleu  ", "vinted") === "Pull bleu", "espaces resserrés, jamais reformulé");
ok(CLE_TITRE_SAISI === "titre_saisi", "clé de la réponse : titre_saisi");

console.log("\n2. LE JOB RÉEL 891a7039 (eBay, patrick giry, 25/09 18:29)");
{
  // Relu en base le 25/09 : title "", platform_fields sans titre_saisi,
  // inventaire 1790346024798 titre « T-shirt manches longues gris chiné taille M ».
  const job = { platform: "ebay", title: "", platform_fields: { ebayCategoryId: "15687" } };
  const r = titrePourJob({ platform: job.platform, titreJob: job.title, titreSaisi: job.platform_fields[CLE_TITRE_SAISI], titreFiche: "T-shirt manches longues gris chiné taille M" });
  ok(r?.titre === "T-shirt manches longues gris chiné taille M" && r.source === "fiche", "il part avec le titre de sa fiche", JSON.stringify(r));
  ok(r.titre.length <= 80, "sous le plafond eBay (80)");
}

console.log("\n3. LE CÂBLAGE DANS get-pending-jobs");
{
  const src = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
  const filet = src.indexOf("AUCUN JOB SERVI SANS TITRE");
  ok(filet > 0, "le filet existe");
  for (const [nom, marque] of [
    ["complétion Opla (résolution de catégorie par le titre)", "body: JSON.stringify({ titre: j.title"],
    ["nettoyage du titre Leboncoin", "nettoyerTitreLeboncoin(j.title)"],
    ["majuscules Vinted", "tempererMajuscules(j.title"],
    ["exigences Vinted (couleur / marque)", "UN DÉPÔT VINTED SANS COULEUR OU SANS MARQUE"],
  ]) {
    const i = src.indexOf(marque);
    ok(i > filet, `le filet tourne AVANT : ${nom}`, `filet ${filet}, bloc ${i}`);
  }
  const bloc = src.slice(filet, src.indexOf("UNE REPUBLICATION REJOUÉE REPART"));
  ok(/\.eq\("status", "pending"\)\.or\("title\.is\.null,title\.eq\."\)/.test(bloc), "l'écriture du titre ne vise qu'un job encore pending ET encore sans titre");
  ok(/includeProcessing \|\| includeNeedsUser\) continue/.test(bloc), "pas de question depuis le popup");
  ok(/aRetenir\.add\(String\(j\.id\)\);\s*\}\s*if \(aRetenir\.size\)/.test(bloc), "une question non écrite retient quand même le job");
  ok(/j\.action === "publish" \|\| j\.action === "republish"/.test(bloc), "publications et republications ; jamais les retraits");
  ok(!/[\u0008]/.test(src), "aucun caractère de contrôle U+0008");
}

console.log(echecs ? `\n❌ ${echecs} échec(s)` : "\n✅ selftest titre du job : tout passe");
process.exit(echecs ? 1 : 0);
