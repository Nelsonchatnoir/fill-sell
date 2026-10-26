// ═══════════════════════════════════════════════════════════════════════════
// LA TAILLE D'UNE BAGUE, LUE DANS LE TEXTE DU VENDEUR (26/10 nuit, point 11) — `npm run selftest:taille-bague-du-texte`
// ═══════════════════════════════════════════════════════════════════════════
// Elodie82 (« Bague vintage diamants baguette », Vinted, needs_user « Taille ») : aucun nombre écrit → la question reste
// (juste). La règle lit SEULEMENT une taille collée à un mot explicite ; une seule valeur de la grille à 0,1 mm, sinon
// la question. Grille réelle (Vinted « Bagues », Beebs « Bijoux (femme) », platform_category_aspects du 26/10).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const B = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/taille-bague-du-texte.js")).href);
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const GRILLE = ["14,1 mm", "14,5 mm", "14,9 mm", "15,3 mm", "15,7 mm", "16,1 mm", "16,5 mm", "16,9 mm", "17,3 mm", "17,7 mm", "18,1 mm", "18,5 mm", "19 mm", "19,4 mm", "19,8 mm", "20,2 mm", "20,6 mm", "21 mm", "21,4 mm", "21,8 mm", "22,2 mm", "22,6 mm", "Ajustable"];
const VINTED = "Femmes > Accessoires > Bijoux > Bagues";
const BEEBS = "Mode > Femme > Accessoires (femme) > Bijoux (femme)";
const t = (textes, chemin = VINTED) => B.tailleBagueDuTexte({ chemin, textes: Array.isArray(textes) ? textes : [textes], allowedValues: GRILLE });

console.log("1. Le cas réel : rien d'écrit → la question reste");
const elodie = ["Bague vintage diamants baguette", "Je vends cette bague vintage sertie de diamants baguette. Matière : Diamant. Deux baguettes manquantes, à faire réparer."];
ok(t(elodie) === null, "Elodie : aucun nombre → rien (la question reste, juste)", JSON.stringify(t(elodie)));

console.log("\n2. Une taille écrite collée à un mot explicite");
ok(t(["Bague argent taille 52"])?.valeur === "16,5 mm", "« taille 52 » (tour de doigt) → 16,5 mm", JSON.stringify(t(["Bague argent taille 52"])));
ok(t(["Bague argent T52"])?.valeur === "16,5 mm", "« T52 » → 16,5 mm");
ok(t(["Bague, tour de doigt 60"])?.valeur === "19 mm", "« tour de doigt 60 » → 19 mm");
ok(t(["Bague diamètre 17,3 mm"])?.valeur === "17,3 mm", "« diamètre 17,3 mm » → 17,3 mm");
ok(t(["Bague 18,5 mm de diamètre"])?.valeur === "18,5 mm", "« 18,5 mm de diamètre » → 18,5 mm");
ok(t(["Bague ajustable en argent"])?.valeur === "Ajustable", "« bague ajustable » → Ajustable");
ok(t(["Bague taille 52"], BEEBS)?.valeur === "16,5 mm", "Beebs « Bijoux (femme) » : la même règle");

console.log("\n3. Jamais deviné");
ok(t(["Bague taille 54"])?.doute, "« taille 54 » → 17,19 mm : aucune valeur à 0,1 mm → la question", JSON.stringify(t(["Bague taille 54"])));
ok(t(["Bague taille 52 ou 54"])?.doute, "« 52 ou 54 » → la question");
ok(t(["Bague diamants taille baguette 5 mm"]) === null, "la taille d'une pierre n'est jamais celle du doigt");
ok(t(["Bague taille US 7"])?.doute, "taille US → la question (conversion non décidée)");
ok(t(["Collier taille 52"]) === null, "pas une bague → la règle ne joue pas");
ok(B.tailleBagueDuTexte({ chemin: "Femmes > Vêtements > Robes", textes: ["Bague taille 52"], allowedValues: GRILLE }) === null, "hors rayon bagues/bijoux → rien");
ok(B.tailleBagueDuTexte({ chemin: VINTED, textes: ["Bague taille 52"], allowedValues: ["S", "M", "L"] }) === null, "pas la grille des bagues → rien");

console.log("\n4. Branchement (écran Publier, champ requis)");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/import \{ tailleBagueDuTexte \} from "\.\.\/\.\.\/supabase\/functions\/_shared\/taille-bague-du-texte\.js";/.test(lps), "ListingPreviewScreen importe la règle");
ok(/const b = tailleBagueDuTexte\(\{ chemin: cheminListe, textes, allowedValues \}\);\s*if \(b\?\.valeur\) return b;\s*if \(b\?\.doute\) return null;/.test(lps), "champRequisAuto : la valeur posée, le doute laisse la question");
ok(/"bague_du_texte", "bague_ajustable"\]\);/.test(lps), "la valeur part sur la COPIE (jamais la fiche)");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
