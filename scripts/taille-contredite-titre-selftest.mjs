// Autotest — LA TAILLE DE LA FICHE CONTREDIT-ELLE LE TITRE ? (19/11, décision de Nico) — `npm run selftest:taille-contredite-titre`
// _shared/taille-contredite-titre.js : tailleContreditTitre({ titre, taille, rayon }) → null | { taille_fiche, taille_titre, systeme }.
// Cas réels : compte 8ac5bbda, 18/11 (jeans Lee, Levi's, Lee Cooper ; veste Pikeur). Garde-fous : les faux positifs trouvés
// au rejeu du 19/11 sur les publications des 30 jours (costume homme, « Poches XXL », lot, « correspond », fourchettes…).
// Sans base, sans réseau.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER = "supabase/functions/_shared/taille-contredite-titre.js";
const { tailleContreditTitre: f, SYSTEMES_CONTREDITS } = await import(pathToFileURL(path.join(R, FICHIER)).href);

let ko = 0, n = 0;
const ok = (nom, c, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom}${d ? ` — ${d}` : ""}`); } };
const dit = (titre, taille, attendu, rayon = null, nom = `« ${taille} » / ${titre}`) => {
  const r = f({ titre, taille, rayon });
  const bon = attendu === null ? r === null
    : r !== null && r.systeme === attendu[0] && r.taille_titre === attendu[1] && r.taille_fiche === attendu[2];
  ok(nom + (attendu ? ` → ${attendu[0]} ${attendu[1]} ≠ ${attendu[2]}` : " → rien"), bon, JSON.stringify(r));
};

console.log("\n── Les cinq cas réels (8ac5bbda, 18/11) : contradiction ─────────────────────");
dit("Jean Noir Lee Bootcut Femme Taille FR50 (20 P) Très Bon État #48", "4XL / 48 / 20", ["FR", "FR 50", "FR 48"]);
dit("Jean Noir Délavé Classic Fit Riders by Lee Femme Taille 20L FR48 #OR6WM0018", "XXXL / 46 / 18", ["FR", "FR 48", "FR 46"]);
dit("Levi's Taille W28 FR 38 Femme Jean Gris Noir Délavé Coupe Slim Zips Chevilles #288C11", "S / 36 / 8", ["FR", "FR 38", "FR 36"]);
dit("Pikeur Taille FR 42 Femme Veste de Concours Équitation Noir Rayée Skarlett #10C1", "L / 40 / 12", ["FR", "FR 42", "FR 40"]);
dit("Lee Cooper W31 L34", "W28 | FR 38", ["W", "W31", "W28"]);

console.log("\n── Le contrat ──────────────────────────────────────────────────────────────");
const r = f({ titre: "Pikeur Taille FR 42 Femme Veste", taille: "L / 40 / 12" });
ok("trois clés exactement : taille_fiche, taille_titre, systeme", JSON.stringify(Object.keys(r ?? {}).sort()) === '["systeme","taille_fiche","taille_titre"]', JSON.stringify(r));
ok("systèmes : W, FR, EU, IT, UK, US, pointure, lettres", SYSTEMES_CONTREDITS.join() === "W,FR,EU,IT,UK,US,pointure,lettres");
ok("sans argument : null, sans exception", f() === null && f({}) === null);
dit("Pikeur Taille FR 42 Femme Veste", "L / 40 / 12", ["FR", "FR 42", "FR 40"], 1234, "un rayon identifiant numérique ne dit rien");
dit("Pikeur Taille FR 42 Femme Veste", "L / 40 / 12", ["FR", "FR 42", "FR 40"], ["Femmes", "Vêtements", "Manteaux et vestes"], "un rayon en tableau");

console.log("\n── Les autres systèmes : contradiction ─────────────────────────────────────");
dit("Pull taille M", "L / 40 / 12", ["lettres", "M", "L"]);
dit("Pull Ralph Lauren XL", "XXL", ["lettres", "XL", "XXL"]);
dit("Robe Zara EU 40", "EU 38", ["EU", "EU 40", "EU 38"]);
dit("Robe Monsoon UK 12", "M / 38 / 10", ["UK", "UK 12", "UK 10"]);
dit("Robe Max Mara IT 44", "IT 42", ["IT", "IT 44", "IT 42"]);
dit("Jean Levi's 501 bleu délavé taille 33/34", "W34 | FR 44", ["W", "W33", "W34"], null, "« 33/34 » d'un jean = W33 (la longueur ne compte pas)");
dit("Jean W31 FR 40", "W28 | FR 38", ["W", "W31", "W28"], null, "deux systèmes en désaccord : le W d'abord");
dit("Baskets Nike taille 42", "43", ["pointure", "42", "43"], "Femmes > Chaussures > Baskets");
dit("Basket Nike React 270 taille 36.5", "36", ["pointure", "36,5", "36"], "Femmes > Chaussures > Baskets");
dit("Nike Air Max 90 US 9", "US 10", ["US", "US 9", "US 10"], "Hommes > Chaussures > Baskets");

console.log("\n── Aucune contradiction : accord ───────────────────────────────────────────");
dit("Jean Lee Noir Coupe Evasée Flare / Bootcut femme Taille FR 38 #22D5L009", "M / 38 / 10", null);
dit("Jean Wrangler Retro Slim Boot Bleu Homme Taille W32 L32 FR42 #74", "W32 | FR 42", null);
dit("Robe Zara T. 38", "38", null, null, "« T. 38 » = fiche 38");
dit("Robe Zara T. 38", "M / 38 / 10", null, null, "« T. 38 » = « M / 38 / 10 »");
dit("Pull Kiabi taille 38", "38 - M", null, null, "l'étiquette Leboncoin « 38 - M »");
dit("Lee Cooper W31 L34", "W31 | FR 40", null, null, "la longueur L34 ne contredit pas une taille sans L");
dit("Pull 2XL", "XXL", null, null, "2XL ≡ XXL");
dit("Baskets Nike taille 42", "EU 42", null, "Femmes > Chaussures > Baskets");

console.log("\n── Aucune contradiction : systèmes différents, jamais une conversion ───────");
dit("Robe Zara EU 40", "M / 38 / 10", null, null, "EU 40 face au FR 38 de l'étiquette");
dit("Jean W30", "FR 40", null, null, "W30 face à FR 40");
dit("Robe Gap US 8", "M / 38 / 10", null, null, "US 8 face à l'étiquette lettre / FR / UK");
dit("Jean Wrangler Homme Coupe Droite Bleu Taille W42 L30 FR 42 #64", "W42 | FR 52", null, null,
  "le W d'accord, le FR du titre faux (W42 = FR 52) : jamais « la fiche est fausse »");

console.log("\n── Aucune contradiction : des nombres qui ne sont pas des tailles ──────────");
dit("Nike Air Max 90 édition 2019", "42", null);
dit("Ensemble 3 pièces réf 4012 #48", "M / 38 / 10", null);
dit("Housse de coussin 40 x 60 cm", "38", null);
dit("Robe longueur 40 cm", "38", null);
dit("Pull fille 8 ans", "M / 38 / 10", null);
dit("Body bébé 6 mois", "6-9 mois / 68 cm", null);
dit("Pantalon tour de taille 80 cm taille 36", "38", null, null, "« tour de taille » et un bas : rien de sûr");
dit("Jean Levi's taille 32", "W32 | FR 42", null, null, "« taille 32 » d'un jean : W32 ou FR 32 — jamais lu");
dit("Costume Brice taille 40 homme", "50", null, null, "un costume d'homme (tour de poitrine UK 40 = EU 50)");
dit("Escarpins cuir taille 38", "40", null, "Femmes > Vêtements > Robes", "une chaussure rangée dans un rayon de vêtements");
dit("Veste Barbour made in UK 12", "M / 38 / 10", null);

console.log("\n── Aucune contradiction : le titre doute, ou dit deux tailles ──────────────");
dit("Robe taille S/M", "M", null);
dit("Jean FR 40/42", "M / 38 / 10", null);
dit("Pull marinière – Gémo – taille XL correspond taille 42 44", "42 - XL", null);
dit("T-shirt UEFA Euro 2020 - Taille L mais correspond plus à un M/S", "S", null);
dit("sweat à capuche gris femme adidas taille S 36&#x2F;38", "M / 38", null, null, "l'entité HTML redevient « / » : fourchette");
dit("Pull col cheminée Zamba (Taille L / 42-44)", "XL / 42 / 14", null);
dit("Jupe courte portefeuille écossaise tartan T.44 (XL)", "XXL", null, null, "FR 44 et XL : la table d'une marque");
dit("Lot Ferrari 3 pièces veste racing F1 L + veste Shell V-Power XL + casquette", "L", null);
dit("Jean cargo Zara femme T38 – Baggy wide leg bleu délavé – Poches XXL Y2K", "M", null, null, "« Poches XXL » : un adjectif");
dit("Vintage 80s Denim Jacket Painted L XL", "L", null);
dit("Veste Coupe-Vent New Balance - Taille S (Taille grand, convient M/L)", "M", null);

console.log("\n── Aucune contradiction : rien à comparer ──────────────────────────────────");
dit("Pull en laine bleu marine", "M", null, null, "titre sans taille");
dit("Jean Lee FR 50", "", null, null, "fiche vide");
ok("taille null : rien", f({ titre: "Jean Lee FR 50", taille: null }) === null);
dit("", "4XL / 48 / 20", null, null, "titre vide");
dit("Robe taille 40", "Taille unique", null);
dit("Robe taille 40", "M / 40", null, null, "étiquette hors de la table des plateformes (M ≠ 40) : doute");

console.log("\n── Le module tourne partout (Deno, Node, Vite) ─────────────────────────────");
const src = fs.readFileSync(path.join(R, FICHIER), "utf8");
const imports = [...src.matchAll(/^import\s.*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
ok("imports relatifs en .js seulement", imports.length > 0 && imports.every((s) => /^\.\/[\w-]+\.js$/.test(s)), imports.join(", "));
ok("aucune API d'environnement (process, Deno, window, document, require, node:)", !/\b(?:process\.|Deno\.|window\.|document\.|require\()|["']node:/.test(src));

console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ROUGE(S)` : " — vert"}`);
process.exit(ko ? 1 : 0);
