// Selftest « verrou » du 19/11 (décision de Nico, compte 8ac5bbda, lots 797d441b et 7ff638d8 du 18/11) — eBay ET Beebs :
// LE TYPE ÉCRIT DANS LE TITRE FAIT FOI. Constat : « Kaporal … Veste Kaki Militaire à Capuche » partie sur eBay en
// « Vêtements de sport › Sweats, vestes à capuches » (155183) ; « Tommy Hilfiger … Pull Bleu Col V » et « … Col Châle »
// sur Beebs en « Pulls ras de cou (homme) » ; « Scotch & Soda … Blouson Veste » sur Beebs en « Manteaux (homme) ».
// Règle : supabase/functions/_shared/rayon-type-du-titre.js, branchée en fin de src/utils/resolutionPublication.js
// (après tous les choix de la machine, avant la surcouche du choix de la personne).
// Rouge avant : `RACINE_VERROU=<copie du dépôt d'avant> node scripts/rayon-type-du-titre-selftest.mjs` (sans la règle,
// le rayon posé reste : les quatre cas réels échouent).
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.RACINE_VERROU ? resolve(process.env.RACINE_VERROU) : ICI;
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
let regle = null;
try { regle = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/rayon-type-du-titre.js")).href); } catch { /* code d'avant : aucune règle */ }
const rayonDuTypeDuTitre = regle?.rayonDuTypeDuTitre ?? (() => null);
const typeDuTitre = regle?.typeDuTitre ?? (() => null);
const { FEUILLES: EBAY } = await import(pathToFileURL(join(ICI, "src/utils/arbres/ebayFeuilles.js")).href);
const { FEUILLES: BEEBS } = await import(pathToFileURL(join(ICI, "src/utils/arbres/beebsFeuilles.js")).href);
let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

const EH = ["Vêtements, accessoires", "Homme : vêtements, accessoires", "Homme : vêtements"];
const EF = ["Vêtements, accessoires", "Femme : vêtements, accessoires", "Femme : vêtements"];
const BH = ["Mode", "Homme", "Vêtements (homme)"];
const BF = ["Mode", "Femme", "Vêtements (femme)"];
const feuilles = (p) => (p === "ebay" ? EBAY : BEEBS);
/** Le rayon qui part : celui de la règle s'il y en a une, sinon celui posé par la machine. */
const final = (plateforme, titre, chemin, source = "ia_parmi_candidats") => {
  const r = rayonDuTypeDuTitre({ plateforme, titre, chemin, feuilles: feuilles(plateforme), source });
  return r ? { chemin: r.chemin, id: r.id } : { chemin, id: null };
};
const feuille = (x) => x.chemin[x.chemin.length - 1];

// ── 1. LES QUATRE CAS RÉELS (compte 8ac5bbda, 18/11) ─────────────────────────────────────────────────────────────
{
  const k = final("ebay", "Kaporal Taille M Homme Veste Kaki Militaire à Capuche KJ-04-Army #82C3", [...EH, "Vêtements de sport", "Sweats, vestes à capuches"]);
  assert.equal(feuille(k), "Manteaux, vestes et gilets", "eBay : la veste militaire part en Manteaux, vestes et gilets (pas en Sweats, vestes à capuches)");
  assert.equal(k.id, "57988", "eBay navigue par identifiant : 57988 (Homme)");
  ok("eBay : « Veste Kaki Militaire à Capuche » → Homme › Manteaux, vestes et gilets (57988), plus « Sweats, vestes à capuches »");
  const v = final("beebs", "Tommy Hilfiger Taille M Homme Pull Bleu Col V Motif Losanges Coton #Closet24", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"]);
  assert.equal(feuille(v), "Sweats à col V (homme)", "Beebs : le pull col V part en « Sweats à col V (homme) » (la feuille col V de Beebs)");
  ok("Beebs : « Pull … Col V » → « Sweats à col V (homme) » (Beebs calque Vinted « Sweats et pulls › Sweats à col V »)");
  const c = final("beebs", "Tommy Hilfiger Taille M Homme Pull Bleu Col Châle Rayures Coton #20C1", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"]);
  assert.equal(feuille(c), "Pulls col roulé (homme)", "Beebs : le pull col châle quitte « ras de cou » pour le col haut replié le plus proche");
  ok("Beebs : « Pull … Col Châle » → « Pulls col roulé (homme) » (aucune feuille « col châle » ni « autres pulls » chez les hommes)");
  const b = final("beebs", "Scotch & Soda Taille M Homme Blouson Veste Marron à Capuche Multipoche #50C2", [...BH, "Manteaux et vestes (homme)", "Manteaux (homme)"], "catalog_vinted");
  assert.equal(feuille(b), "Vestes (homme)", "Beebs : le blouson part en « Vestes (homme) »");
  ok("Beebs : « Blouson Veste » (chemin de l'icône, catalog_vinted) → « Vestes (homme) », plus « Manteaux (homme) »");
}

// ── 2. LES MÊMES LOTS : CE QUI ÉTAIT JUSTE NE BOUGE PAS ─────────────────────────────────────────────────────────
const inchange = (plateforme, titre, chemin, motif, source) => {
  const r = rayonDuTypeDuTitre({ plateforme, titre, chemin, feuilles: feuilles(plateforme), source });
  assert.equal(r, null, `${motif} : « ${titre} » ne doit pas bouger (${chemin[chemin.length - 1]})`);
};
if (regle) {
  inchange("beebs", "Kaporal Taille M Homme Veste Kaki Militaire à Capuche KJ-04-Army #82C3", [...BH, "Manteaux et vestes (homme)", "Vestes (homme)"], "déjà juste");
  inchange("beebs", "Parka Veste 3 en 1 Columbia Horizons Pine Interchange Homme Taille M Bleu Marine", [...BH, "Manteaux et vestes (homme)", "Manteaux (homme)"], "parka + veste : Manteaux est compatible");
  inchange("ebay", "Parka Veste 3 en 1 Columbia Horizons Pine Interchange Homme Taille M Bleu", [...EH, "Manteaux, vestes et gilets"], "déjà juste");
  inchange("beebs", "Gant Taille L Homme Doudoune Violet à Capuche Matelassée #65C2", [...BH, "Manteaux et vestes (homme)", "Manteaux (homme)"], "doudoune : manteau OU veste");
  inchange("beebs", "Lacoste Taille 2 XS Homme Pull Blanc Rayé Rouge Bleu Coton #23C1", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"], "pull sans col dit");
  inchange("ebay", "Tommy Hilfiger Taille M Homme Pull Bleu Col V Motif Losanges Coton #Closet24", [...EH, "Pulls, cardigans"], "eBay n'a pas de feuille par col");
  inchange("ebay", "Levi's Taille M Homme Sweat à Capuche Galaxy Star Wars Violet #49C2", [...EH, "Vêtements de sport", "Sweats, vestes à capuches"], "sweat à capuche");
  inchange("beebs", "Levi's Taille M Homme Sweat à Capuche Galaxy Star Wars Violet #49C2", [...BH, "Sweats (homme)", "Sweats longs (homme)"], "sweat");
  inchange("ebay", "Pikeur Taille FR 42 Femme Veste de Concours Équitation Noir Rayée Skarlett #10C1", [...EF, "Manteaux, vestes et gilets"], "spécialité");
  ok("les autres articles des deux lots (parka, doudoune, pulls sans col, sweat, veste d'équitation) ne bougent pas");
}

// ── 3. LES GARDE-FOUS DE NICO ─────────────────────────────────────────────────────────────────────────────────────
if (regle) {
  // Jamais sur un mot ambigu.
  inchange("ebay", "Veste à capuche Kaporal noire", [...EH, "Vêtements de sport", "Sweats, vestes à capuches"], "« veste à capuche » collée : sweat ou veste");
  inchange("ebay", "Veste Nike Tiempo vintage bleu marine à capuche Taille L", [...EH, "Vêtements de sport", "Sweats, vestes à capuches"], "marque de sport dans un rayon de sport");
  inchange("beebs", "Parka Nike Tiempo PSG 2000's Size M", [...BH, "Vêtements de sport (homme)", "Vestes de sport (homme)"], "marque de sport dans un rayon de sport");
  inchange("ebay", "Pull HUGO noir à capuche zippée", [...EH, "Vêtements de sport", "Sweats, vestes à capuches"], "pull à capuche : un sweat ?");
  inchange("ebay", "Pull polaire Eddie Bauer demi-zip bleu taille S", [...EH, "Manteaux, vestes et gilets"], "polaire");
  inchange("beebs", "Robe pull col V grise", [...BF, "Robes (femme)", "Robes courtes (femme)"], "un autre vêtement (robe)");
  inchange("beebs", "Top Pull & Bear col V", [...BF, "T-shirts et tops (femme)", "Tops courts (femme)"], "« Pull & Bear » est une marque");
  inchange("beebs", "Gilet col V bleu", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"], "« gilet » : cardigan ou sans manches");
  inchange("beebs", "Pull col V et col roulé lot de 2", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"], "deux cols / un lot");
  inchange("beebs", "doudoune sans manches matelassée jaune taille 18 mois", ["Mode", "Garçon", "Vêtements (garçon)", "Gilets (garçon)"], "doudoune sans manches : « Gilets » ne la contredit pas");
  inchange("beebs", "Housse pour veste de costume", ["Maison", "Rangement", "Housses"], "hors des rayons de vêtements");
  inchange("ebay", "Veste en cuir Barbie pour poupée", ["Jouets et jeux", "Poupées, poupons", "Vêtements, accessoires"], "pas le vêtement");
  ok("jamais sur un mot ambigu : capuche collée, marque de sport en rayon de sport, pull à capuche, polaire, robe pull, Pull & Bear, gilet, lot, hors vêtements");
  // Le rayon choisi à la main gagne toujours.
  inchange("beebs", "Tommy Hilfiger Taille M Homme Pull Bleu Col V", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"], "choix de la personne", "choix_humain");
  assert.equal(rayonDuTypeDuTitre({ plateforme: "vinted", titre: "Pull col V", chemin: ["Hommes", "Vêtements", "Sweats et pulls", "Pulls ras de cou"], feuilles: BEEBS }), null);
  assert.equal(rayonDuTypeDuTitre({ plateforme: "leboncoin", titre: "Veste militaire", chemin: ["Mode", "Vêtements"], feuilles: BEEBS }), null);
  ok("le rayon choisi à la main n'est jamais touché ; Vinted et Leboncoin ne sont pas concernés");
  // Jamais une catégorie fausse : sans feuille sûre, la règle d'avant.
  inchange("beebs", "Pull bleu marine homme", [...BH, "T-shirts (homme)"], "pull d'homme sans col dit : aucune feuille sûre chez Beebs");
  inchange("beebs", "Doudoune noire homme", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"], "doudoune d'adulte : manteau ou veste, aucune feuille sûre");
  ok("sans feuille sûre (pull d'homme sans col, doudoune d'adulte), le rayon d'avant reste");
}

// ── 4. LE TYPE QUI CONTREDIT, DANS LE MÊME RAYON DE GENRE ──────────────────────────────────────────────────────
if (regle) {
  const f = final("ebay", "Veste Zara femme noire", [...EF, "Hauts, chemises"]);
  assert.deepEqual([feuille(f), f.id], ["Manteaux, vestes et gilets", "63862"]);
  const g = final("ebay", "Pull col V garçon bleu 8 ans", ["Vêtements, accessoires", "Enfant : vêtements, accessoires", "Garçon : vêtements, accessoires", "Vêtements garçon (2-16 ans)", "Manteaux, vestes et gilets"]);
  assert.deepEqual([feuille(g), g.id], ["Pulls, cardigans", "51946"]);
  const m = final("beebs", "Manteau long camel femme", [...BF, "Manteaux et vestes (femme)", "Vestes (femme)"]);
  assert.equal(feuille(m), "Manteaux (femme)");
  const bf = final("beebs", "Blouson bomber rose taille S", [...BF, "Manteaux et vestes (femme)", "Manteaux (femme)"], "mot_cle");
  assert.equal(feuille(bf), "Vestes (femme)");
  const bk = final("beebs", "Blouson garçon bleu marine 6 ans", ["Mode", "Garçon", "Vêtements (garçon)", "Pulls et sweats (garçon)"]);
  assert.equal(feuille(bk), "Manteaux et blousons (garçon)");
  const sw = final("beebs", "Sweat-shirt gris col rond L", [...BF, "Pulls et sweats (femme)", "Pulls (femme)"], "mot_cle");
  assert.equal(feuille(sw), "Sweats (femme)");
  const vm = final("beebs", "Veste sans manches matelassée homme", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"]);
  assert.equal(feuille(vm), "Vestes sans manche (homme)");
  const cd = final("beebs", "Cardigan Celio bleu marine taille L", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"]);
  assert.equal(feuille(cd), "Cardigans et gilets (homme)");
  assert.equal(feuille(final("beebs", "Pull sweat col V", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"])), "Sweats à col V (homme)", "pull + sweat : même famille, le col V décide");
  const cr = final("beebs", "Pull col roulé noir homme", [...BH, "Pulls et gilets (homme)", "Pulls ras de cou (homme)"]);
  assert.equal(feuille(cr), "Pulls col roulé (homme)");
  ok("veste femme, pull garçon (eBay), manteau, blouson, sweat, veste sans manches, cardigan, col roulé (Beebs) : le rayon du type, même genre");
  // Lecture du titre
  assert.deepEqual(typeDuTitre("Veste Kaki Militaire à Capuche").types, ["veste"]);
  assert.equal(typeDuTitre("Pull Bleu Col V").col, "col_v");
  assert.equal(typeDuTitre("Pull col châle").col, "col_chale");
  assert.equal(typeDuTitre("Jean Lee coupe droite"), null);
  assert.ok(typeDuTitre("Veste en jean Levi's").types?.includes("veste"), "« en jean » dit la matière");
  ok("lecture du titre : type, col, matière « en jean », aucun type → rien");
}

// ── 5. BRANCHÉ EN FIN DE RÉSOLUTION, AVANT LE CHOIX DE LA PERSONNE ─────────────────────────────────────────────
{
  const res = lire("src/utils/resolutionPublication.js");
  assert.ok(res.includes('from "../../supabase/functions/_shared/rayon-type-du-titre.js"'), "resolutionPublication importe la règle");
  const iLivre = res.indexOf("UN LIVRE ADULTE NE RESTE PAS DANS UN RAYON BEEBS POUR ENFANTS");
  const iType = res.indexOf("LE TYPE ÉCRIT DANS LE TITRE FAIT FOI");
  const iAucun = res.indexOf("AUCUN RAYON TROUVÉ : ON DEMANDE");
  assert.ok(iLivre > 0 && iType > iLivre && iAucun > iType, "la règle passe après tous les choix de la machine (dernier filet eBay, livre adulte Beebs) et avant « aucun rayon trouvé »");
  assert.ok(/rayonDuTypeDuTitre\(\{ plateforme: platform, titre: frTitrePublication, chemin: pfT\[cleT\], feuilles: feuillesT, source: pfT\.categorie_source/.test(res), "le titre FR de l'article, le chemin posé, sa source");
  assert.ok(/if \(platform === "ebay"\) pfT\.ebayCategoryId = typeT\.id;/.test(res), "eBay : l'identifiant suit le chemin (eBay navigue par identifiant)");
  assert.ok(/pfT\.categorie_source = SOURCE_TYPE_DU_TITRE;/.test(res) && /categorie_type_du_titre = \{ type: typeT\.type, avant: typeT\.avant/.test(res), "tracé sur le job");
  const choix = lire("src/utils/rayonPublication.js");
  assert.ok(choix.includes("suite.categorie_source = 'choix_humain'"), "la surcouche du choix de la personne passe après la résolution");
  ok("branché : fin de resoudrePublication (eBay + Beebs), tracé categorie_type_du_titre, choix de la personne reposé après");
}

console.log(`rayon-type-du-titre : ${n} contrôles verts`);
