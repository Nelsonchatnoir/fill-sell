// Self-test — le format du colis Vinted choisi par le vendeur (2026-09-27).
//   node scripts/vinted-colis-selftest.mjs
// Garanties prouvées : sans choix, le job ne change pas d'un octet ; les
// formats proposés sont ceux relevés (et identiques à la table de vinted.js) ;
// un choix hors de la grille du rayon publié ne part jamais ; seul un choix
// FAIT à l'écran est rangé sur la fiche.
import fs from "node:fs";
import {
  COLIS_VINTED, grilleColisVinted, colisVintedRetenu, colisVintedPourJob, colisVintedDeLaFiche, rayonModeVinted,
} from "../src/utils/vintedColis.js";

let echecs = 0;
const ok = (nom, cond) => { if (!cond) echecs++; console.log(`${cond ? "✓" : "✗"} ${nom}`); };
const copie = (o) => JSON.parse(JSON.stringify(o));

// 1. La table est celle de vinted.js, au caractère près.
const src = fs.readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8");
const bloc = src.match(/const VINTED_PACKAGE_SIZES_PAR_ID = \{([\s\S]*?)\};/)?.[1] ?? "";
const tableExt = Object.fromEntries([...bloc.matchAll(/(\d+):\s*"([^"]+)"/g)].map((m) => [Number(m[1]), m[2]]));
ok("table id → libellé identique à vinted.js", JSON.stringify(tableExt) === JSON.stringify(COLIS_VINTED));

// 2. Grilles relevées.
const PAN = ["Maison", "Décoration", "Rangement et organisation", "Paniers de rangement"];
const BOUIL = ["Maison", "Petits appareils de cuisine", "Bouilloires"];
const PIECES = ["Maison", "Petits appareils de cuisine", "Pièces détachées pour petits appareils de cuisine"];
ok("Paniers de rangement → Petit/Moyen/Grand", JSON.stringify(grilleColisVinted(PAN)?.map((g) => g.id)) === "[1,2,3]");
ok("Bouilloires → 5/10/20 kg (ids 8-10)", JSON.stringify(grilleColisVinted(BOUIL)?.map((g) => g.id)) === "[8,9,10]");
ok("rayon jamais observé → aucun choix", grilleColisVinted(PIECES) === null);
ok("chemin vide → aucun choix", grilleColisVinted(null) === null && grilleColisVinted([]) === null);
ok("Femmes (même non observé) → Petit/Moyen/Grand", JSON.stringify(grilleColisVinted(["Femmes", "Rayon inventé"])?.map((g) => g.id)) === "[1,2,3]");
ok("Enfants non observé → aucun choix (puériculture en kilos)", grilleColisVinted(["Enfants", "Rayon inventé"]) === null);
ok("rayonModeVinted(Hommes)", rayonModeVinted(["Hommes", "Chaussures"]) && !rayonModeVinted(BOUIL));
ok("Plateaux : la dernière grille vue (PMG) gagne",
  JSON.stringify(grilleColisVinted(["Maison", "Arts de la table", "Vaisselle de service", "Plateaux"])?.map((g) => g.id)) === "[1,2,3]");

// 3. Sans choix : le job ne change pas.
const base = { categoryPath: PAN, marque: "X", etat: "Neuf" };
for (const [nom, attrs] of [["fiche sans attributs", null], ["fiche sans colis", { marque: { v: "X", source: "manuel" } }],
  ["colis LU sur Vinted (pas un choix)", { colis_vinted: { v: 3, source: "vinted_detail" }, colis: { v: "Grand", source: "vinted_detail" } }]]) {
  const pf = copie(base);
  const r = colisVintedPourJob(pf, attrs);
  ok(`sans choix (${nom}) → job identique, rien à ranger`, JSON.stringify(pf) === JSON.stringify(base) && r.ranger === null);
}
{
  const pf = { ...copie(base), packageSize: "Petit" }; // clé d'origine inconnue : jamais touchée sans choix
  colisVintedPourJob(pf, null);
  ok("sans choix, une clé packageSize préexistante n'est pas touchée", pf.packageSize === "Petit");
}

// 4. Choix fait à l'écran.
{
  const pf = { ...copie(base), packageSizeId: 3 };
  const r = colisVintedPourJob(pf, null);
  ok("choix Grand → packageSizeId 3 + libellé, rangé", pf.packageSizeId === 3 && pf.packageSize === "Grand" && r.ranger?.v === 3 && r.ranger?.libelle === "Grand");
}
{
  const pf = { ...copie(base), packageSizeId: 0 };
  const r = colisVintedPourJob(pf, { colis_vinted: { v: 2, source: "manuel" } });
  ok("« format habituel » choisi → aucune clé, fiche remise à 0", !("packageSizeId" in pf) && !("packageSize" in pf) && r.ranger?.v === 0);
}
{
  const pf = { categoryPath: BOUIL, packageSizeId: 3 };
  const r = colisVintedPourJob(pf, null);
  ok("choix hors grille du rayon publié (Grand sur des kilos) → retiré, rien rangé", !("packageSizeId" in pf) && r.ranger === null);
}
{
  const pf = { categoryPath: PIECES, packageSizeId: 2 };
  const r = colisVintedPourJob(pf, null);
  ok("rayon sans grille connue → choix retiré, comportement habituel", !("packageSizeId" in pf) && r.ranger === null);
}

// 5. Le choix de la fiche revient.
{
  const pf = copie(base);
  const r = colisVintedPourJob(pf, { colis_vinted: { v: 2, libelle: "Moyen", source: "manuel" } });
  ok("choix de la fiche (Moyen) repris, rien à re-ranger", pf.packageSizeId === 2 && pf.packageSize === "Moyen" && r.ranger === null);
}
{
  const pf = { categoryPath: BOUIL };
  colisVintedPourJob(pf, { colis_vinted: { v: 2, source: "manuel" } });
  ok("choix de la fiche hors grille du nouveau rayon → ignoré", !("packageSizeId" in pf));
}
{
  const pf = copie(base);
  colisVintedPourJob(pf, { colis_vinted: { v: 0, source: "manuel" } });
  ok("fiche « format habituel » → aucune clé", !("packageSizeId" in pf));
}
ok("colisVintedDeLaFiche ignore une source non manuelle", colisVintedDeLaFiche({ colis_vinted: { v: 2, source: "capture" } }) === null);

// 6. Ce que la carte affiche.
ok("carte : choix courant", colisVintedRetenu({ pf: { packageSizeId: 2 }, chemin: PAN })?.origine === "choix");
ok("carte : choix de la fiche", colisVintedRetenu({ pf: {}, chemin: PAN, attributsFiche: { colis_vinted: { v: 3, source: "manuel" } } })?.libelle === "Grand");
ok("carte : « habituel » choisi l'emporte sur la fiche", colisVintedRetenu({ pf: { packageSizeId: 0 }, chemin: PAN, attributsFiche: { colis_vinted: { v: 3, source: "manuel" } } }) === null);

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
