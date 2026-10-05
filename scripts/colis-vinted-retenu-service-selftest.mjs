// ── AUTOTEST : le format de colis Vinted RETENU, posé au service (05/10) ─────
// supabase/functions/_shared/vinted-colis.js (colisVintedRetenuAuService) :
// une publication Vinted sans format reçoit celui que la personne a retenu
// pour CE rayon exact ; jamais à la place d'un choix déjà sur la copie ; rien
// de deviné quand aucun choix n'est retenu.
//
//   node scripts/colis-vinted-retenu-service-selftest.mjs
import { colisVintedRetenuAuService, cheminColisTexte } from "../supabase/functions/_shared/vinted-colis.js";

let echecs = 0;
const ok = (titre, cond, vu) => {
  if (cond) console.log(`  ok   ${titre}`);
  else { echecs++; console.log(`  KO   ${titre}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); }
};
const retenus = { "Femmes > Vêtements > Robes": { id: 2, libelle: "Moyen" }, "Maison > Rangement": { id: 8, libelle: "Volumineux et lourd" } };

ok("clé = chemin du rayon en texte", cheminColisTexte(["Femmes", " Vêtements ", "Robes"]) === "Femmes > Vêtements > Robes");
{
  const pf = { categoryPath: ["Femmes", "Vêtements", "Robes"] };
  const r = colisVintedRetenuAuService(pf, retenus);
  ok("rayon retenu → format posé, source 'retenu'", r && pf.packageSizeId === 2 && pf.packageSize === "Moyen" && pf.colis_source === "retenu", pf);
}
{
  const pf = { categoryPath: ["Femmes", "Vêtements", "Robes"], packageSizeId: 1, packageSize: "Petit" };
  const r = colisVintedRetenuAuService(pf, retenus);
  ok("un choix déjà sur la copie n'est jamais remplacé", r === null && pf.packageSizeId === 1, pf);
}
{
  const pf = { categoryPath: ["Femmes", "Vêtements", "Robes"], colis_source: "manuel" };
  ok("« Vinted choisit » fait par la personne (manuel, sans id) : rien posé", colisVintedRetenuAuService(pf, retenus) === null && !("packageSizeId" in pf), pf);
}
{
  const pf = { categoryPath: ["Femmes", "Vêtements", "Jupes"] };
  const r = colisVintedRetenuAuService(pf, retenus);
  ok("autre rayon : rien de deviné", r === null && !("packageSizeId" in pf), pf);
}
{
  const pf = { categoryPath: "Maison > Rangement" };
  colisVintedRetenuAuService(pf, retenus);
  ok("chemin en texte accepté", pf.packageSizeId === 8, pf);
}
{
  const pf = { categoryPath: ["Femmes", "Vêtements", "Robes"] };
  ok("aucun réglage → rien", colisVintedRetenuAuService(pf, null) === null && !("packageSizeId" in pf));
  ok("valeur effacée (null) → rien", colisVintedRetenuAuService(pf, { "Femmes > Vêtements > Robes": null }) === null);
}
console.log(echecs ? `\n${echecs} échec(s)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
