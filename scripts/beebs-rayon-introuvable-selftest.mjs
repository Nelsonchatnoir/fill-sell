// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — « Beebs n'a pas de rayon reconnu » (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Quatre jobs sont morts le 21/09 au soir, trois causes. Ce fichier verrouille
// les trois, plus la quatrième qui vit côté Leboncoin.
//
//   1. LE CATALOGUE EST UNE PHOTO. Beebs a sorti « Cartables et fournitures
//      scolaires » de Maison pour en faire une racine, « Fournitures
//      scolaires ». Relevé live du 21/09 : 688 clics, 579 feuilles, 11
//      déplacées. Le job e7dc0cfc est mort dessus.
//   2. LE HANDLER NE MEURT PLUS SUR UN CHEMIN PÉRIMÉ : il demande à la
//      recherche de Beebs où vit la feuille, avant d'échouer.
//   3. LE MOT NE DIT PAS TOUT. « barrette » ne partage un jeton avec AUCUNE
//      des 579 étiquettes ; « maillot de basket » n'en ramène que des faux
//      amis. La descente niveau par niveau existe pour ça.
//   4. LA TRANCHE DE COLIS SE NORMALISE, sinon la mémoire de poids Leboncoin
//      ne se retrouve pas (« Petit colis » d'hier ≠ « Petit » d'aujourd'hui).
//
//   node --import ./scripts/loader-ext.mjs scripts/beebs-rayon-introuvable-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import {
  feuillesDe, candidatsParMot, resoudreParMot, niveauSousChemin, estFeuilleDeLArbre,
} from "../src/utils/categorieParMot.js";
import { getBeebsCategoryPath } from "../src/utils/beebsCategories.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs += 1;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};

const feuilles = await feuillesDe("beebs");
const chemins = feuilles.map((f) => f.chemin.join(" > "));

console.log("\n1. LE CATALOGUE BEEBS DIT CE QUE LE FORMULAIRE MONTRE (relevé 21/09)");
{
  ok(feuilles.length === 579, `579 feuilles`, String(feuilles.length));
  const racines = [...new Set(feuilles.map((f) => f.chemin[0]))];
  ok(racines.length === 6, "six racines, pas cinq", racines.join(" · "));
  ok(racines.includes("Fournitures scolaires"),
    "« Fournitures scolaires » est une RACINE — Beebs l'a sortie de Maison");
  ok(!chemins.some((c) => c.startsWith("Maison > Cartables et fournitures scolaires")),
    "plus aucun chemin ne passe par « Maison > Cartables et fournitures scolaires »",
    chemins.filter((c) => c.startsWith("Maison > Cartables")).join(" | "));
  ok(chemins.includes("Fournitures scolaires > Trousses"),
    "« Fournitures scolaires > Trousses » existe — le rayon du job e7dc0cfc");
  // Le second écart du relevé : le suffixe de genre est tombé.
  ok(chemins.includes("Mode > Femme > Accessoires (femme) > Porte-clés"),
    "« Porte-clés » a perdu son « (femme) »");
  ok(!chemins.includes("Mode > Femme > Accessoires (femme) > Porte-clés (femme)"),
    "et l'ancien libellé ne traîne plus");
}

console.log("\n2. LE MOT RETROUVE LE RAYON DU JOB e7dc0cfc");
{
  const r = await resoudreParMot("trousse", "beebs", { genre: "" });
  ok(r?.certitude === "exact" && r.chemin.join(" > ") === "Fournitures scolaires > Trousses",
    "« trousse » → Fournitures scolaires > Trousses, avec certitude",
    r ? `${r.certitude} ${r.chemin?.join(" > ")}` : "(rien)");
  // L'icône du stylo suivait l'ancien chemin : elle aurait renvoyé un chemin
  // que le formulaire ne sait plus naviguer.
  const p = getBeebsCategoryPath("🖋️", "");
  ok(Array.isArray(p) && p.join(" > ") === "Fournitures scolaires > Ecriture et correction",
    "l'icône 🖋️ pointe sur le chemin VIVANT", Array.isArray(p) ? p.join(" > ") : String(p));
}

console.log("\n3. LE HANDLER DEMANDE À BEEBS QUAND NOTRE CHEMIN NE SE NAVIGUE PLUS");
{
  const src = readFileSync(new URL("../chrome-extension/content-scripts/beebs.js", import.meta.url), "utf8");
  ok(/async function descendreLesNiveaux\(path, trigger\)/.test(src),
    "la descente niveau par niveau est une fonction à part");
  const i = src.indexOf("const feuilleVoulue");
  const garde = i < 0 ? "" : src.slice(i, i + 1400);
  ok(/await descendreLesNiveaux\(path, trigger\)/.test(garde),
    "selectCategory l'appelle sous un try");
  ok(/libell\[ée\]|libell\[ée\] absent|libell/.test(garde) && /categorieParRecherche\(trigger, feuilleVoulue, titre\)/.test(garde),
    "et retombe sur la RECHERCHE Beebs avec la feuille voulue");
  ok(/throw e;/.test(garde),
    "un mot inconnu de Beebs échoue comme avant — le rattrapage n'invente rien");
}

console.log("\n4. LE MOT NE DIT PAS TOUT — ET LA DESCENTE EXISTE POUR ÇA");
{
  // Les deux mots des jobs morts : la preuve que le ratissage est muet.
  const barrette = await candidatsParMot("barrette", "beebs", { genre: "Fille", titre: "Lot de 2 barrettes Marie Les Aristochats Disney" });
  ok(barrette.length === 0,
    "« barrette » ne ratisse RIEN dans les 579 étiquettes — d'où le job fd5c84be",
    barrette.map((c) => c.chemin.join(" > ")).join(" | "));
  const maillot = await candidatsParMot("maillot de basket", "beebs", { genre: "Homme", titre: "Maillot NBA Mitchell & Ness" });
  ok(maillot.length > 0 && !maillot.some((c) => /sport/i.test(c.chemin[c.chemin.length - 1])),
    "« maillot de basket » ne ratisse que des faux amis — d'où le job 1ad1434a",
    maillot.map((c) => c.chemin.join(" > ")).join(" | "));

  // Et la descente, elle, atteint les deux bons rayons — navigués en direct
  // sur beebs.app le 21/09, champs dynamiques rendus.
  for (const [genre, cible] of [
    ["Fille", ["Mode", "Fille", "Accessoires (fille)", "Casquettes, chapeaux et bandeaux (fille)"]],
    ["Homme", ["Mode", "Homme", "Vêtements (homme)", "Vêtements de sport (homme)", "Hauts et t-shirts de sport (homme)"]],
  ]) {
    ok(await estFeuilleDeLArbre("beebs", cible),
      `« ${cible[cible.length - 1]} » est une feuille déposable`);
    let atteignable = true;
    for (let n = 0; n < cible.length; n++) {
      const { options } = await niveauSousChemin("beebs", cible.slice(0, n), { genre });
      if (!options.some((o) => o[n] === cible[n])) { atteignable = false; break; }
    }
    ok(atteignable, `et la descente l'atteint niveau par niveau (genre ${genre})`);
  }

  // ⛔ LA BORNE : une liste qu'on ne peut pas lire ne se tranche pas. Mesuré le
  //    21/09 sur resolve-categorie en prod — 312 feuilles d'un coup rendaient
  //    « aucune », 65 rendaient la bonne. Aucun niveau ne doit dépasser 25.
  const large = [];
  const parNoeud = new Map();
  for (const f of feuilles) {
    for (let i = 0; i < f.chemin.length; i++) {
      const cle = f.chemin.slice(0, i).join(" > ");
      if (!parNoeud.has(cle)) parNoeud.set(cle, new Set());
      parNoeud.get(cle).add(f.chemin[i]);
    }
  }
  for (const [cle, v] of parNoeud) if (v.size > 25) large.push(`${cle || "(racines)"}=${v.size}`);
  ok(large.length === 0, "aucun niveau de l'arbre Beebs ne dépasse 25 options", large.join(" | "));
}

console.log("\n5. LA TRANCHE DE COLIS SE NORMALISE (mémoire de poids Leboncoin)");
{
  const src = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
  const i = src.indexOf("const normaliserTranche");
  const bloc = i < 0 ? "" : src.slice(i, i + 700);
  ok(/replace\(\/\\s\+colis\$\/, ""\)/.test(bloc),
    "« Petit colis » et « Petit » deviennent la MÊME tranche (le suffixe tombe)");
  ok(/normaliserTranche\(f\)/.test(src) && /normaliserTranche\(c\)/.test(src),
    "et la normalisation s'applique des DEUX côtés — à l'écriture de la mémoire comme à sa lecture");
  // ⛔ « Lettre » ne rejoint personne : ses réponses valent « Jusqu'à 100 g »,
  //    celles d'un petit colis « De 500 g à 1 kg ». Les fusionner ferait partir
  //    une barrette déclarée à 1 kg.
  const t = (v) => v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").replace(/\s+colis$/, "");
  ok(t("Petit colis") === t("Petit"), "« Petit colis » ≡ « Petit »");
  ok(t("Moyen colis") === t("Moyen"), "« Moyen colis » ≡ « Moyen »");
  ok(t("Lettre") !== t("Petit"), "« Lettre » reste sa propre tranche");
  ok(t("Volumineux") !== t("Grand colis"), "« Volumineux » ne prend pas le poids d'un « Grand colis »");
}

console.log(echecs === 0
  ? "\n✅ selftest Beebs / rayon introuvable : tout passe\n"
  : `\n❌ ${echecs} échec(s)\n`);
process.exit(echecs === 0 ? 0 : 1);
