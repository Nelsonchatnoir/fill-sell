// ═══════════════════════════════════════════════════════════════════════════
// Selftest « le public choisi par la personne sur Vinted prime sur le genre deviné » (06/11, Nico, point 4 a)
//   node scripts/public-choisi-vinted-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicDuRayonVinted, genreContreditLePublic, copiesAuPublicChoisi } from "../src/utils/rayonPublication.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const LE = "2026-11-06T12:00:00.000Z";
const copies = (genres, choixVinted = null) => ({
  vinted: { title: "t", platform_fields: { genre: "Femme" }, ...(choixVinted ? { rayon_choisi: { chemin: choixVinted } } : {}) },
  ebay: { title: "t", platform_fields: { genre: genres.ebay } },
  beebs: { title: "t", platform_fields: { genre: genres.beebs } },
  leboncoin: { title: "t", platform_fields: { univers: genres.lbc } },
  depop: { title: "t", platform_fields: { genre: genres.depop } },
});

console.log("1. Le public d'un rayon Vinted");
ok("Femmes › Chaussures › Baskets → Femme / univers Femme", publicDuRayonVinted(["Femmes", "Chaussures", "Baskets"])?.genre === "Femme");
ok("Hommes › Vêtements → Homme", publicDuRayonVinted(["Hommes", "Vêtements", "Jeans"])?.genre === "Homme");
ok("Enfants › Vêtements pour filles › Bébé filles → Fille / univers Enfant", JSON.stringify(publicDuRayonVinted(["Enfants", "Vêtements pour filles", "Bébé filles", "Robes"]))
  === JSON.stringify({ age: "enfant", sexe: "f", genre: "Fille", univers: "Enfant" }));
ok("Enfants › Vêtements pour garçons → Garçon", publicDuRayonVinted(["Enfants", "Vêtements pour garçons", "Pantalons"])?.genre === "Garçon");
ok("Enfants › Jouets / Maison : aucun public", publicDuRayonVinted(["Enfants", "Jouets", "Peluches"]) === null && publicDuRayonVinted(["Maison", "Linge"]) === null);

console.log("2. Contredit ou compatible");
const femmes = publicDuRayonVinted(["Femmes", "Chaussures"]);
const bebeFille = publicDuRayonVinted(["Enfants", "Vêtements pour filles", "Bébé filles"]);
ok("Homme contre Femmes : contredit", genreContreditLePublic("Homme", femmes));
ok("Femme sous Femmes : compatible", !genreContreditLePublic("Femme", femmes));
ok("Fille contre Femmes (enfant / adulte) : contredit", genreContreditLePublic("Fille", femmes));
ok("Bébé sous Bébé filles : compatible (gardé)", !genreContreditLePublic("Bébé", bebeFille));
ok("Garçon sous Bébé filles : contredit", genreContreditLePublic("Garçon", bebeFille));
ok("vide ou Mixte : à remplir", genreContreditLePublic("", femmes) && genreContreditLePublic("Mixte", femmes));

console.log("3. Les copies");
const avant = copies({ ebay: "Homme", beebs: "Homme", lbc: "Homme", depop: "" }, ["Femmes", "Chaussures", "Baskets"]);
const apres = copiesAuPublicChoisi(avant, LE);
ok("eBay, Beebs, Depop passent en Femme ; l'univers Leboncoin aussi", apres.ebay.platform_fields.genre === "Femme" && apres.beebs.platform_fields.genre === "Femme"
  && apres.depop.platform_fields.genre === "Femme" && apres.leboncoin.platform_fields.univers === "Femme", JSON.stringify(apres));
ok("la trace : genre d'avant, chemin choisi", apres.ebay.platform_fields.genre_du_choix?.avant === "Homme" && apres.ebay.platform_fields.genre_du_choix?.chemin?.[0] === "Femmes");
ok("Vinted elle-même n'est pas touchée", apres.vinted === avant.vinted);
const sansChoix = copiesAuPublicChoisi(copies({ ebay: "Homme", beebs: "Homme", lbc: "Homme", depop: "Homme" }), LE);
ok("sans CHOIX de la personne (genre Vinted de l'IA) : rien ne bouge", sansChoix.ebay.platform_fields.genre === "Homme" && !sansChoix.ebay.platform_fields.genre_du_choix);
const propre = copies({ ebay: "Homme", beebs: "Homme", lbc: "Homme", depop: "Homme" }, ["Femmes", "Chaussures"]);
propre.ebay.rayon_choisi = { chemin: ["Vêtements, accessoires", "Homme"] };
ok("une copie dont la personne a choisi le rayon garde son choix", copiesAuPublicChoisi(propre, LE).ebay.platform_fields.genre === "Homme");
const bebe = copiesAuPublicChoisi(copies({ ebay: "Bébé", beebs: "Bébé", lbc: "Enfant", depop: "" }, ["Enfants", "Vêtements pour filles", "Bébé filles", "Robes"]), LE);
ok("Bébé filles : « Bébé » gardé sur eBay et Beebs (compatible), univers Enfant gardé", bebe.ebay.platform_fields.genre === "Bébé" && bebe.beebs.platform_fields.genre === "Bébé" && bebe.leboncoin.platform_fields.univers === "Enfant");
const sansUnivers = copiesAuPublicChoisi(copies({ ebay: "Homme", beebs: "Homme", lbc: "", depop: "" }, ["Femmes", "Sacs"]), LE);
ok("Leboncoin : jamais un univers posé là où il n'y en avait pas", sansUnivers.leboncoin.platform_fields.univers === "");
const retire = { ...apres, vinted: { ...apres.vinted, rayon_choisi: null } };
const retabli = copiesAuPublicChoisi(retire, LE);
ok("choix retiré : le genre d'avant revient, la trace part", retabli.ebay.platform_fields.genre === "Homme" && !retabli.ebay.platform_fields.genre_du_choix
  && retabli.leboncoin.platform_fields.univers === "Homme");

console.log("4. Branchements (stepper)");
const lps = readFileSync(join(ROOT, "src/components/ListingPreviewScreen.jsx"), "utf8");
ok("choisirRayon applique le public pour un choix Vinted", /return platform === "vinted" && suivant !== prev \? copiesAuPublicChoisi\(suivant\) : suivant;/.test(lps));
ok("la résolution affichée repart quand le public choisi change", /\}, \[platformListings, relanceApresRefus, publicChoisiVinted\]\);/.test(lps));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
