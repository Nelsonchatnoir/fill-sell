// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE CHEMIN DU CATALOGUE VINTED DE LA FICHE SE LIT PAR SON IDENTIFIANT (12/11, lot « zéro problème », 1d-ii)
// ═══════════════════════════════════════════════════════════════════════════
//     npm run selftest:chemin-vinted-fiche
//
// Défaut prouvé, tous comptes : l'écran de publication lisait `attributs.categorie_vinted.chemin` (Univers Leboncoin
// « depuis la catégorie Vinted », seconde passe IA de Leboncoin, pointure, longueur de robe eBay) ; les écrivains
// (extension : relevé et page publique, app : texteDuVendeur) n'écrivent que l'IDENTIFIANT. Mesure : 0 fiche sur 313
// (comptes cfdfda6f et 229c7b07) porte un chemin. Cas réel (compte cca934e7, 11/11) : « Pull vintage Easy Line »,
// catalogue Vinted 1813 (Hommes > Vêtements > Sweats et pulls > Pulls ras de cou) → l'Univers Leboncoin « Homme »,
// certain, était DEMANDÉ.
// LA RÈGLE : un résolveur unique identifiant → chemin (l'arbre relevé, src/utils/arbres/vintedFeuilles.js) — la
// colonne `inventaire.vinted_catalog_id`, sinon `attributs.categorie_vinted.v` ; le chemin écrit ne sert qu'à défaut
// d'un identifiant connu de l'arbre (l'identifiant fait foi, jamais un libellé) — lu PARTOUT où l'écran lisait le chemin.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { console.log(`  (import de ${p} impossible : ${e.message.split("\n")[0]})`); return {}; } };
let ko = 0, okN = 0;
const ok = (c, m) => { if (c) { okN++; console.log(`  ✓ ${m}`); } else { ko++; console.log(`  ✗ ${m}`); } };

const R = await charger("src/utils/cheminVintedFiche.js");
const { FEUILLES } = await charger("src/utils/arbres/vintedFeuilles.js");
const { universLbcDeLaFiche } = await charger("src/publication/moteur/champsLbcAuto.js");
const UNIVERS_VETEMENTS = ["Femme", "Maternité", "Homme", "Enfant"];
const resoudre = (fiche) => (typeof R.cheminVintedDeLaFiche === "function" ? R.cheminVintedDeLaFiche(fiche, FEUILLES) : null);

console.log("A. Le cas réel : « Pull vintage Easy Line » (compte cca934e7, 11/11), catalogue 1813, aucun chemin écrit");
{
  const fiche = { vinted_catalog_id: 1813, attributs: { categorie_vinted: { v: 1813, source: "vinted_detail", at: "2026-11-11T10:00:00Z" } } };
  const chemin = resoudre(fiche);
  ok(Array.isArray(chemin) && chemin.join(" > ") === "Hommes > Vêtements > Sweats et pulls > Pulls ras de cou", `1813 → ${JSON.stringify(chemin)}`);
  const u = universLbcDeLaFiche({ genres: [], cheminVinted: chemin, taille: "", titre: "Pull vintage Easy Line", allowedValues: UNIVERS_VETEMENTS });
  ok(u?.valeur === "Homme", `Univers Leboncoin « Homme » sans question (obtenu ${JSON.stringify(u)})`);
  // L'identifiant seul dans les attributs (fiche relevée par la page publique, sans la colonne).
  ok(resoudre({ attributs: { categorie_vinted: { v: 1813, source: "vinted_detail" } } })?.[0] === "Hommes", "l'identifiant des attributs suffit (sans la colonne)");
  ok(resoudre({ vinted_catalog_id: "1813" })?.[0] === "Hommes", "la colonne seule suffit (texte ou nombre)");
}

console.log("B. L'identifiant fait foi ; le chemin écrit ne sert qu'à défaut ; rien d'inventé");
{
  ok(resoudre({ vinted_catalog_id: 3789, attributs: { categorie_vinted: { v: 3789, chemin: ["Femmes", "Robes"] } } })?.[0] === "Électronique",
    "un chemin écrit qui contredit l'identifiant ne gagne pas (compte cfdfda6f, écran CarPlay, catalogue 3789)");
  ok(resoudre({ attributs: { categorie_vinted: { v: 99999999, chemin: ["Enfants", "Jeux et jouets"], source: "vinted_detail" } } })?.[1] === "Jeux et jouets",
    "un identifiant inconnu de l'arbre : le chemin écrit (vintedAttributs.js) sert encore");
  ok(resoudre({ vinted_catalog_id: 99999999 }) === null, "identifiant inconnu et aucun chemin : null (jamais deviné)");
  ok(resoudre(null) === null && resoudre({}) === null, "fiche vide : null");
  const u = universLbcDeLaFiche({ genres: [], cheminVinted: resoudre({ vinted_catalog_id: 3789 }), titre: "Road Top 12,3\" Écran CarPlay", allowedValues: UNIVERS_VETEMENTS });
  ok(u === null, "un rayon Vinted sans public (Électronique) ne pose aucun Univers");
  ok(typeof R.idCatalogueVintedDeLaFiche === "function" && R.idCatalogueVintedDeLaFiche({ attributs: { categorie_vinted: { v: 1813 } } }) === "1813", "l'identifiant de la fiche (colonne, sinon attributs)");
  ok(typeof R.idVintedDuChemin === "function" && R.idVintedDuChemin(["Femmes", "Beauté", "Parfums"], FEUILLES) === "152", "et l'inverse : le chemin d'un rayon → son identifiant (152 « Parfums »)");
}

console.log("C. Partout où l'écran lisait le chemin, il lit le résolveur");
{
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  const brut = lps.match(/categorie_vinted\?\.(?:v\?\.)?chemin/g) ?? [];
  ok(brut.length === 0, `plus aucune lecture directe de categorie_vinted.chemin dans l'écran (${brut.length} restante(s))`);
  ok(/cheminVintedDeLaFiche/.test(lps) && /cheminVintedFiche/.test(lps), "l'écran résout le chemin de la fiche une fois (identifiant → arbre relevé)");
  const seconde = lps.slice(lps.indexOf("LEBONCOIN : LA SECONDE PASSE, AVANT TOUTE QUESTION"), lps.indexOf("LEBONCOIN : LA SECONDE PASSE, AVANT TOUTE QUESTION") + 4000);
  ok(/cheminVintedFiche/.test(seconde) && /catégorie Vinted : \$\{cheminVinted\.join/.test(seconde), "la seconde passe Leboncoin reçoit la catégorie Vinted de la fiche");
  const univers = lps.slice(lps.indexOf("L'UNIVERS QUE LA FICHE DIT DÉJÀ"), lps.indexOf("L'UNIVERS QUE LA FICHE DIT DÉJÀ") + 1500);
  ok(/cheminVinted: cheminVintedFiche/.test(univers), "l'Univers Leboncoin de la fiche lit le chemin résolu");
}

console.log(`\n${ko ? `✗ ${ko} rouge(s)` : "✓ tout vert"} — ${okN} vert(s)`);
process.exit(ko ? 1 : 0);
