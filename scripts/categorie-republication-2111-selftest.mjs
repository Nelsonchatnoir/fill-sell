// ═══════════════════════════════════════════════════════════════════════════
// VERROU — 21/11/2026 soir, décision de Nico : une republication repart dans la catégorie CORRIGÉE, jamais dans l'ancienne
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant : une republication recopiait le rayon de l'annonce d'avant — « Vans Sk8-Hi » en file chez Leboncoin
// repartait en « Sport & Plein air » ; un pull rangé en « Animaux › Chiens » chez Vinted y serait recréé.
// Ce qu'il prouve :
//   1. cheminPourLaRepublication : cohérent → rien ; incohérent → la catégorie corrigée de la fiche, sinon le rayon de
//      l'objet reconnu, sinon rien de sûr (le rayon reste, tracé) — jamais une catégorie incohérente proposée ;
//   2. correctionCaptureVinted : le rayon cohérent remplace celui de la capture, avec la garde de la grille de colis ;
//   3. le branchement : get-pending-jobs (Leboncoin, Beebs, capture Vinted), ebay-api-worker (rayon mappé), la réparation.
//   node --import ./scripts/loader-ext.mjs scripts/categorie-republication-2111-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cheminPourLaRepublication, categorieCorrigeeDeLaFiche } from "../supabase/functions/_shared/categorie-republication.js";
import { correctionCaptureVinted } from "../supabase/functions/_shared/capture-corrigee.js";
import { getLbcCategoryPath } from "../src/utils/lbcCategories.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => readFileSync(join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

console.log("1. Le rayon avec lequel une republication repart");
{
  const vans = { plateforme: "leboncoin", chemin: ["Loisirs", "Sport & Plein air"], titre: "Vans Sk8-Hi montantes marron orange bordeaux", objet: "baskets" };
  const parIcone = cheminPourLaRepublication({ ...vans, cheminIcone: getLbcCategoryPath("👟") });
  ok(parIcone?.chemin?.join(" > ") === "Mode > Chaussures" && parIcone.source === "icone_objet" && parIcone.regle === "chaussure_hors_chaussures", "Vans : « Sport & Plein air » → « Mode › Chaussures » (icône de l'objet)", JSON.stringify(parIcone));
  const attributs = { categorie_corrigee: { v: { leboncoin: { chemin: ["Mode", "Chaussures"] } }, source: "manuel" } };
  const parFiche = cheminPourLaRepublication({ ...vans, attributs, cheminIcone: getLbcCategoryPath("🛹") });
  ok(parFiche?.source === "fiche" && parFiche.chemin.join(" > ") === "Mode > Chaussures", "la catégorie corrigée de la fiche passe d'abord (l'icône 🛹 du mot « skate » n'est jamais prise)");
  const rien = cheminPourLaRepublication({ ...vans, cheminIcone: getLbcCategoryPath("🛹") });
  ok(rien && rien.chemin === null, "ni fiche ni icône cohérente : rien de sûr (le rayon reste, tracé)", JSON.stringify(rien));
  ok(cheminPourLaRepublication({ plateforme: "leboncoin", chemin: ["Mode", "Chaussures"], titre: "Vans Sk8-Hi", objet: "baskets" }) === null, "un rayon cohérent n'est jamais touché");
  const pull = cheminPourLaRepublication({ plateforme: "vinted", chemin: ["Maison", "Animaux", "Chiens", "Vêtements & accessoires", "Pulls"], titre: "Pull neuf kaki TU", objet: "pull",
    attributs: { categorie_corrigee: { v: { vinted: { chemin: ["Femmes", "Vêtements", "Sweats et sweats à capuche", "Autres pull-overs & sweat-shirts"], id: "197" } } } } });
  ok(pull?.source === "fiche" && String(pull.id) === "197", "Vinted : la catégorie corrigée avec son identifiant", JSON.stringify(pull));
  const fausse = cheminPourLaRepublication({ ...vans, attributs: { categorie_corrigee: { v: { leboncoin: { chemin: ["Loisirs", "Jeux & Jouets"] } } } } });
  ok(fausse?.chemin === null, "une « catégorie corrigée » elle-même incohérente n'est jamais prise");
  ok(categorieCorrigeeDeLaFiche({ categorie_corrigee: { v: {}, source: "manuel" } }, "vinted") === null, "l'inverse de la réparation (objet vide) : sans effet");
}

console.log("2. La capture Vinted repart dans le rayon cohérent (garde de la grille de colis)");
{
  const fiche = { id: 1, origine: "manuel", titre: "Pull neuf kaki TU", description: "", attributs: {} };
  const libelles = { categoryPath: ["Maison", "Animaux", "Chiens", "Vêtements & accessoires", "Pulls"], catalog_id_depot: 3241 };
  const natif = { catalog_id: 3241, package_size_id: 1 };
  const rc = { chemin: ["Femmes", "Vêtements", "Sweats et sweats à capuche", "Autres pull-overs & sweat-shirts"], id: "197" };
  const grillePMG = () => [{ id: 1 }, { id: 2 }, { id: 3 }];
  const c = correctionCaptureVinted(fiche, libelles, natif, null, { rayonCoherent: rc, grilleDuRayon: grillePMG });
  ok(c && c.raisons.includes("categorie_coherente") && c.libelles.catalog_id_depot === 197 && c.libelles.categoryPath.at(-1) === "Autres pull-overs & sweat-shirts", "rayon remplacé, identifiant compris", JSON.stringify(c?.raisons));
  const horsGrille = correctionCaptureVinted(fiche, libelles, { ...natif, package_size_id: 8 }, null, { rayonCoherent: rc, grilleDuRayon: grillePMG });
  ok(!horsGrille || !horsGrille.raisons.includes("categorie_coherente"), "format de colis hors de la grille d'arrivée : le rayon reste (jamais un format choisi pour elle)");
  const sans = correctionCaptureVinted(fiche, libelles, natif, null, { grilleDuRayon: grillePMG });
  ok(!sans || !sans.raisons.includes("categorie_coherente"), "sans rayon cohérent fourni : rien ne change");
  ok(correctionCaptureVinted({ ...fiche, origine: "vinted_sync" }, libelles, natif, null, { rayonCoherent: rc, grilleDuRayon: grillePMG }) === null, "une annonce née sur Vinted garde le rayon du vendeur");
}

console.log("3. Le branchement");
{
  const g = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/LEBONCOIN ET BEEBS : UNE TÂCHE NE REPART JAMAIS DANS UN RAYON INCOHÉRENT/.test(g) && /pfJ\.categorie_corrigee_avant_depart = trace;/.test(g) && /\.eq\("status", "pending"\)\.select\("id"\)/.test(g), "get-pending-jobs : Leboncoin et Beebs corrigés avant de partir (tâche en file seulement)");
  ok(/\{ sourceAvantCapture: avantSource == null \? null : String\(avantSource\), rayonCoherent \}/.test(g) && /if \(rC\?\.chemin && rC\.id\) rayonCoherent = \{ chemin: rC\.chemin, id: rC\.id \};/.test(g), "get-pending-jobs : la capture Vinted reçoit la catégorie corrigée de la fiche (avec son identifiant)");
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  ok(/let mappee = String\(pf\.ebayCategoryId \?\? ""\)\.trim\(\);/.test(w) && /mappee = "";/.test(w), "eBay : un rayon mappé incohérent ne compte plus");
  ok(/const rE = cheminMap\.length \? cheminPourLaRepublication\(\{ plateforme: "ebay"/.test(w), "eBay : la catégorie corrigée de la fiche d'abord");
  const rep = lire("scripts/reparations/20261121_categorie_corrigee_8_annonces.sql");
  ok(/_backup_2111_categorie_corrigee/.test(rep) && /fc6058d3-d107-44df-b166-707a9b1657b7' AND j\.status = 'pending'/.test(rep) && !/DELETE|status = 'cancelled'/.test(rep), "réparation : sauvegarde, Vans en file seulement, rien retiré ni annulé");
}

console.log(`\n${verts} vertes, ${rouges} rouges — la republication repart dans la catégorie corrigée (21/11 soir).`);
if (rouges) { console.log("ROUGE"); process.exit(1); }
