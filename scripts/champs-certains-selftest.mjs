// Champs déjà connus : seule une valeur lue/saisie ferme la question.
//   node --import ./scripts/loader-ext.mjs scripts/champs-certains-selftest.mjs
import {
  valeurAttributFiche,
  formatBeebsDepuisFiche,
  valeurFichePourChampRequis,
} from "../src/utils/champsFiche.js";

let ko = 0;
const ok = (condition, libelle, vu) => {
  if (!condition) { ko++; console.log(`  ✗ ${libelle}${vu === undefined ? "" : ` — vu : ${JSON.stringify(vu)}`}`); }
  else console.log(`  ✓ ${libelle}`);
};
const attr = (v, source) => ({ v, source, at: "2026-09-29T10:00:00Z" });

console.log("1. Une estimation ne devient jamais une certitude");
for (const source of ["capture", "vinted_liste", "vinted_detail", "releve_leboncoin", "releve_beebs", "releve_ebay", "manuel"]) {
  ok(valeurAttributFiche({ taille: attr("10 ans", source) }, "taille", { certaine: true }) === "10 ans",
    `source ${source} acceptée`);
}
ok(valeurAttributFiche({ taille: attr("M", "lens") }, "taille", { certaine: true }) === null,
  "source Lens refusée");
ok(valeurAttributFiche({ taille: { v: "M" } }, "taille", { certaine: true }) === null,
  "objet sans provenance refusé");
ok(valeurAttributFiche({ taille: "10 ans" }, "taille", { certaine: true }) === "10 ans",
  "ancienne valeur explicite en chaîne conservée");

console.log("\n2. Leboncoin : Univers et champs dédiés viennent de la fiche certaine");
ok(valeurFichePourChampRequis("leboncoin", "clothing_type", { genre: attr("Fille", "releve_leboncoin") }) === "Enfant",
  "Fille → Univers Enfant (traduction de vocabulaire, pas catégorie inventée)");
ok(valeurFichePourChampRequis("leboncoin", "clothing_type", { genre: attr("Femme", "lens") }) === null,
  "un genre Lens ne remplit pas Univers");
ok(valeurFichePourChampRequis("leboncoin", "clothing_size", { taille: attr("42", "manuel") }) === "42",
  "la dernière taille explicite est reprise telle quelle");
ok(valeurFichePourChampRequis("leboncoin", "decoration_product", { genre: attr("Femme", "manuel") }) === undefined,
  "Produit sans équivalent certain reste demandé");

console.log("\n3. Beebs : Taille et Format du colis, sans estimation");
ok(valeurFichePourChampRequis("beebs", "Taille", { taille: attr("10 ans", "vinted_liste") }) === "10 ans",
  "taille relevée reprise");
ok(valeurFichePourChampRequis("beebs", "Taille", { taille: attr("10 ans", "lens") }) === null,
  "taille Lens refusée");
for (const [brut, attendu] of [["Petit", "Petit colis"], ["2 kg", "Moyen colis"], ["Poids jusqu'à 5 kg max", "Grand colis"]]) {
  const vu = formatBeebsDepuisFiche({ colis: attr(brut, "capture") }, { certaine: true });
  ok(vu === attendu, `format exact « ${brut} » → « ${attendu} »`, vu);
}
ok(formatBeebsDepuisFiche({ colis: attr("20 kg", "capture") }, { certaine: true }) === null,
  "un poids sans palier Beebs exact reste demandé");
ok(formatBeebsDepuisFiche({ colis: attr("Petit", "lens") }, { certaine: true }) === null,
  "un format Lens reste demandé");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);

