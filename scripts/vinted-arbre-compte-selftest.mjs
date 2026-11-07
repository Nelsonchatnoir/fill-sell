// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Vinted : le chemin de catégorie selon l'arbre RÉEL du compte » (06/11, décision de Nico, point 4)
//   node scripts/vinted-arbre-compte-selftest.mjs
// Vinted bascule son arbre compte par compte (06/11 : 6 comptes encore sur l'ancien, 7 sur le nouveau). Règle :
// _shared/vinted-arbre-compte.js (get-pending-jobs traduit au service ; handler-watch reprend un refus de la bascule).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAIRES_ARBRES_VINTED, IDS_ANCIEN_ARBRE, IDS_NOUVEL_ARBRE, arbreVintedDuCompte, cheminVintedPourArbre, cheminVintedTouche,
} from "../supabase/functions/_shared/vinted-arbre-compte.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const c = (s) => s.split(" > ");

console.log("1. La table colle à l'arbre vivant (docs/vinted-catalog-tree.txt, 06/11)");
const L = readFileSync(join(ROOT, "docs/vinted-catalog-tree.txt"), "utf8").replace(/\r\n/g, "\n").split("\n").filter(Boolean);
const vivantes = new Set(); const ids = new Set(); const pile = [];
for (const l of L) { const d = l.match(/^ */)[0].length / 2; const m = l.trim().match(/^(.+?)  \[id=(\d+)\]/); pile.length = d; pile.push(m[1]); ids.add(Number(m[2])); if (l.includes("[FEUILLE]")) vivantes.add(pile.join(" > ")); }
ok(`${PAIRES_ARBRES_VINTED.length} paires : chaque chemin NOUVEAU est une feuille vivante`, PAIRES_ARBRES_VINTED.every(([, n]) => vivantes.has(n)),
  PAIRES_ARBRES_VINTED.filter(([, n]) => !vivantes.has(n)).map(([, n]) => n).join(" | "));
ok("aucun chemin ANCIEN n'existe plus dans l'arbre vivant", PAIRES_ARBRES_VINTED.every(([a]) => !vivantes.has(a)));
ok("identifiants : les nouveaux sont vivants, les anciens n'y sont plus", [...IDS_NOUVEL_ARBRE].every((i) => ids.has(i)) && [...IDS_ANCIEN_ARBRE].every((i) => !ids.has(i)));

console.log("2. Vers le NOUVEL arbre (compte basculé)");
ok("Femmes > Accessoires > Bijoux > Bracelets → Accessoires de mode > Bijoux > Bracelets", eq(cheminVintedPourArbre(c("Femmes > Accessoires > Bijoux > Bracelets"), "nouveau"), c("Accessoires de mode > Bijoux > Bracelets")));
ok("renommage de Vinted : Breloques et pendentifs → Charms et pendentifs", eq(cheminVintedPourArbre(c("Hommes > Accessoires > Bijoux > Breloques et pendentifs"), "nouveau"), c("Accessoires de mode > Bijoux > Charms et pendentifs")));
ok("rayon déplacé (même id 246) : sacs Homme remontés", eq(cheminVintedPourArbre(c("Hommes > Accessoires > Sacs et sacoches > Sacs à dos"), "nouveau"), c("Hommes > Sacs et sacoches > Sacs à dos")));
ok("Jean-Luc : « Hommes > Accessoires > Autres » n'a aucun équivalent → rien (la question reste)", cheminVintedPourArbre(c("Hommes > Accessoires > Autres"), "nouveau") === null);
ok("un chemin déjà du nouvel arbre ne bouge pas (aucune régression d'un compte basculé)", cheminVintedPourArbre(c("Accessoires de mode > Montres"), "nouveau") === null
  && cheminVintedPourArbre(c("Femmes > Vêtements > Robes > Robes longues"), "nouveau") === null);

console.log("3. Vers l'ANCIEN arbre (compte pas encore basculé)");
ok("Accessoires de mode > Bijoux > Bagues + Femme → Femmes > Accessoires > Bijoux > Bagues", eq(cheminVintedPourArbre(c("Accessoires de mode > Bijoux > Bagues"), "ancien", "Femme"), c("Femmes > Accessoires > Bijoux > Bagues")));
ok("Accessoires de mode > Gants + Garçon → Enfants > Vêtements pour garçons > Accessoires > Gants", eq(cheminVintedPourArbre(c("Accessoires de mode > Gants"), "ancien", "Garçon"), c("Enfants > Vêtements pour garçons > Accessoires > Gants")));
ok("genre inconnu ou « Mixte » : jamais deviné → rien", cheminVintedPourArbre(c("Accessoires de mode > Gants"), "ancien", "") === null && cheminVintedPourArbre(c("Accessoires de mode > Gants"), "ancien", "Mixte") === null);
ok("Accessoires de mode > Pochettes de costume + Femme : pas d'équivalent Femme → rien", cheminVintedPourArbre(c("Accessoires de mode > Pochettes de costume"), "ancien", "Femme") === null);
ok("rayon déplacé, sens inverse : Hommes > Chapeaux et casquettes > Casquettes → l'ancien chemin", eq(cheminVintedPourArbre(c("Hommes > Chapeaux et casquettes > Casquettes"), "ancien"), c("Hommes > Accessoires > Chapeaux et casquettes > Casquettes")));
ok("arbre inconnu : rien ne change", cheminVintedPourArbre(c("Femmes > Accessoires > Bijoux > Bracelets"), null) === null);

console.log("4. L'arbre du compte : ce que Vinted lui a montré, le plus récent l'emporte");
ok("catalog_id 22 (ancien) puis 5570 (nouveau) → nouveau", arbreVintedDuCompte([{ catalog_id: 22, le: "2026-11-06T09:00:00Z" }, { catalog_id: 5570, le: "2026-11-06T11:00:00Z" }]).arbre === "nouveau");
ok("refus « Accessoires » → nouveau ; refus « Accessoires de mode » → ancien",
  arbreVintedDuCompte([{ erreur: "Vinted ne propose pas « Accessoires » à cet endroit de son catalogue. Choisis…", le: "2026-11-06T11:20:00Z" }]).arbre === "nouveau"
  && arbreVintedDuCompte([{ erreur: "Vinted ne propose pas « Accessoires de mode » à cet endroit de son catalogue.", le: "2026-11-06T11:20:00Z" }]).arbre === "ancien");
ok("aucun indice (identifiants hors de la zone) → inconnu", arbreVintedDuCompte([{ catalog_id: 1234, le: "2026-11-06T11:00:00Z" }, { catalog_id: 230, le: "2026-11-06T11:00:00Z" }]).arbre === null);
ok("zone de la bascule : un chemin hors zone n'est jamais lu", cheminVintedTouche(c("Femmes > Accessoires > Montres")) && cheminVintedTouche(c("Accessoires de mode > Montres")) && !cheminVintedTouche(c("Maison > Textiles > Rideaux")));

console.log("5. Branchements");
const gpj = readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8").replace(/\r\n/g, "\n"); // fins de ligne neutres (CRLF après un checkout Windows, core.autocrlf)
const bloc = gpj.slice(gpj.indexOf("VINTED : LE CHEMIN DE CATÉGORIE SELON L'ARBRE RÉEL DU COMPTE"), gpj.indexOf("chemins servis tels quels`);\n    }"));
ok("get-pending-jobs : publication seulement, indices = republish_snapshot + refus (jamais vinted_ids), réponse seulement",
  /j\.action === "publish"/.test(bloc) && /republish_snapshot->>catalog_id/.test(bloc) && !/vinted_ids/.test(bloc.replace(/jamais vinted_ids/g, "")) && !/\.update\(/.test(bloc));
const hw = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8").replace(/\r\n/g, "\n");
const blocHw = hw.slice(hw.indexOf("VINTED : UN RAYON REFUSÉ PAR LA BASCULE"), hw.indexOf("Vinted, rayons repris dans l'arbre du compte"));
ok("handler-watch : refus de la bascule repris UNE fois, compare-and-swap sur needs_user",
  /if \(pf\.categoryPath_selon_arbre\) continue;/.test(blocHw) && /\.eq\("id", String\(j\.id\)\)\.eq\("status", "needs_user"\)/.test(blocHw) && /\.limit\(100\)/.test(blocHw));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
