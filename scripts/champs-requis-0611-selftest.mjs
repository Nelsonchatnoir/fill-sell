// ═══════════════════════════════════════════════════════════════════════════
// Selftest « champs requis, recos validées par Nico le 06/11 » (points 4 b et 4 c)
//   node scripts/champs-requis-0611-selftest.mjs
//   4 b : une vraie taille reste une taille ; « taille unique » seulement si la grille du rayon n'offre que ça.
//   4 c : une pointure écrite par l'IA sans source réelle compte comme vide ; la question partagée est posée une fois.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tailleUniqueSeuleDeLaGrille, tailleUniqueAccessoire } from "../supabase/functions/_shared/champs-requis-auto.js";
import { pointureRedactionSourcee } from "../supabase/functions/_shared/pointure-du-texte.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

console.log("4 b. La taille unique, seulement quand la grille n'offre que ça");
ok("grille [« Taille unique »] → « Taille unique »", tailleUniqueSeuleDeLaGrille({ allowedValues: ["Taille unique"] })?.valeur === "Taille unique");
ok("grille [« Taille Unique », « One size »] (deux écritures de la même) → posée", tailleUniqueSeuleDeLaGrille({ allowedValues: ["Taille Unique", "One size"] })?.source === "grille_taille_unique_seule");
ok("grille avec des tailles (« Taille unique », « S », « M », « L ») → rien : une vraie taille reste une taille",
  tailleUniqueSeuleDeLaGrille({ allowedValues: ["Taille unique", "S", "M", "L"] }) === null);
ok("grille vide → rien", tailleUniqueSeuleDeLaGrille({ allowedValues: [] }) === null);
ok("règle g inchangée : casquette « Medium-Large » sur une grille à tailles → jamais la taille unique",
  tailleUniqueAccessoire({ chemin: ["Hommes", "Accessoires", "Chapeaux et casquettes", "Casquettes"], textes: ["Casquette New Era Medium-Large"], allowedValues: ["Taille unique", "S/M", "L/XL"] }) === null);

console.log("4 c. Une pointure de la rédaction, gardée seulement avec une source réelle");
ok("IA « 42 », rien d'écrit nulle part → vide", pointureRedactionSourcee({ valeur: "42", textes: ["Baskets Nike Air Max 90 blanches", "Très bon état"] }) === false);
ok("IA « 42 », le titre dit « pointure 42 » → gardée", pointureRedactionSourcee({ valeur: "42", textes: ["Baskets Nike pointure 42"] }) === true);
ok("IA « EU 37.5 », la fiche dit « 37,5 » → gardée", pointureRedactionSourcee({ valeur: "EU 37.5", valeurFiche: "37,5" }) === true);
ok("IA « 38 », le texte dit « taille 38,5 » → vide (jamais arrondie)", pointureRedactionSourcee({ valeur: "38", textes: ["Bottines taille 38,5"] }) === false);
ok("IA « 40 », une étiquette lue (Lens) dit 40 → gardée", pointureRedactionSourcee({ valeur: "40", valeurLue: "40" }) === true);
ok("une valeur qui n'est pas une pointure européenne (« M », « UK 8 ») n'est pas jugée", pointureRedactionSourcee({ valeur: "M" }) === true && pointureRedactionSourcee({ valeur: "UK 8" }) === true);

console.log("Branchements (stepper)");
const lps = readFileSync(join(ROOT, "src/components/ListingPreviewScreen.jsx"), "utf8");
ok("4 c : à la génération, une chaussure dont la pointure n'a pas de source perd la pointure de la copie (une seule question partagée)",
  /if \(!v \|\| pointureRedactionSourcee\(\{ valeur: v, \.\.\.sources \}\)\) continue;\s*\n\s*pfP\.pointure_ia_ecartee = /.test(lps)
  && lps.indexOf("pointureRedactionSourcee({ valeur: v") < lps.indexOf("const shared = { taille:\"\", couleur:\"\", matiere:\"\", marque:\"\" };"));
ok("4 b : les lignes de rayon (Vinted, Leboncoin, Beebs) — manquante et hors grille", /const seule = tailleUniqueSeuleDeLaGrille\(\{ allowedValues \}\);\s*\n\s*if \(seule\) return seule;/.test(lps)
  // (14/11) La branche hors grille garde « seuleT » ; elle gagne la taille unique hors grille (selftest:taille-unique-bijou).
  && /blocking: \(seuleT(?: \|\| uniqueT)?\) \? false : horsListeBloque\(|blocking: seuleT \? false : horsListeBloque\(/.test(lps));
ok("4 b : l'encart eBay — manquante et hors grille", /if \(seule\) return \{ \.\.\.manquant, deduit: \{ valeur: seule\.valeur, source: seule\.source \} \};/.test(lps)
  && /suggested: src\.key === "taille" \? \(tailleUniqueSeuleDeLaGrille\(\{ allowedValues \}\)\?\.valeur/.test(lps));
ok("4 b : la source posée sur la COPIE (jamais sur la fiche)", /const CHAMP_REQUIS_VERS_COPIE = new Set\(\[[^\]]*"grille_taille_unique_seule"/.test(lps));
ok("9 : l'encart eBay lit l'aspect que le VENDEUR a écrit (sa fiche + le titre de la copie, jamais la description de l'IA)",
  /const lu = aspectDuTexte\(\{ name, allowedValues, textes: \[initialListing\?\.titre \?\? "", initialListing\?\.description \?\? "", edited\.ebay\?\.title \?\? ""\] \}\);/.test(lps));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
