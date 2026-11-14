// ═══════════════════════════════════════════════════════════════════════════
// « UNIQUE » N'EST PAS UNE TAILLE DE BIJOU (14/11, 13e274de) — `npm run selftest:taille-unique-bijou`
// ═══════════════════════════════════════════════════════════════════════════
// Le 14/11 entre 02:54 et 06:35, 37 lignes champ_requis_bloquant Beebs « Taille » en « Bijoux (femme) » sur 16 fiches
// (bracelets, boucles d'oreilles, collier, parure), dont 14 abandons au lot (02:59:38, 04:00:09). La règle « bijou hors
// bague → Ajustable » (décision de Nico, 25/10 : champs-requis-auto.js, tailleBijouBeebsAuto) n'a JAMAIS joué : la
// rédaction pose « Unique » comme taille partagée de tout accessoire (fiches_annonce.sharedFields.taille = « Unique » sur
// les 16), la copie Beebs portait donc « Unique », hors de la grille (22 diamètres de bague + « Ajustable ») → ligne
// « invalide », bloquante (nouveau stepper, ListingPreviewScreen, `!verdict.dans`) — la règle ne voit que les cases VIDES.
// Même trou chez 4 autres comptes en 20 jours (a922068b, 48dd94f7, 3f91c02e : bracelets, pendentif).
// Règle (pour tous) : une « taille unique » (Unique, TU, Taille unique…) hors d'une grille qui n'en a pas n'est pas une
// taille — on rejoue les règles du champ vide (bijou hors bague → « Ajustable ») ; bague, parure, type inconnu : la
// question, comme avant ; une VRAIE taille écrite n'est jamais recouverte. Ce test prouve : 1. la règle pure
// (tailleUniqueHorsGrille) ; 2. le rejeu sur les 16 fiches réelles ; 3. le câblage dans l'écran Publier.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const m = await import("../supabase/functions/_shared/champs-requis-auto.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const f = typeof m.tailleUniqueHorsGrille === "function" ? m.tailleUniqueHorsGrille : () => "absente";
const val = (r) => (r && typeof r === "object" ? r.valeur ?? null : r);

// La grille relevée (platform_category_aspects, beebs, « Mode > Femme > Accessoires (femme) > Bijoux (femme) », Taille).
const GRILLE = ["14,1 mm", "14,5 mm", "14,9 mm", "15,3 mm", "15,7 mm", "16,1 mm", "16,5 mm", "16,9 mm", "17,3 mm", "17,7 mm", "18,1 mm",
  "18,5 mm", "19 mm", "19,4 mm", "19,8 mm", "20,2 mm", "20,6 mm", "21 mm", "21,4 mm", "21,8 mm", "22,2 mm", "22,6 mm", "Ajustable"];
const BIJOUX = ["Mode", "Femme", "Accessoires (femme)", "Bijoux (femme)"];

console.log("1. La règle pure");
ok(val(f({ valeur: "Unique", chemin: BIJOUX, textes: ["Bracelet jonc large doré bombé rigide"], allowedValues: GRILLE })) === "Ajustable", "bracelet, copie « Unique » → « Ajustable »");
ok(val(f({ valeur: "Taille unique", chemin: BIJOUX, textes: ["Boucles d’oreilles créoles turquoise"], allowedValues: GRILLE })) === "Ajustable", "boucles d'oreilles, « Taille unique » → « Ajustable »");
ok(val(f({ valeur: "TU", chemin: BIJOUX, textes: ["Collier doré pendentif étoile"], allowedValues: GRILLE })) === "Ajustable", "collier, « TU » → « Ajustable »");
ok(val(f({ valeur: "Unique", chemin: BIJOUX, textes: ["Bague argentée solitaire"], allowedValues: GRILLE })) === null, "une BAGUE garde sa question");
ok(val(f({ valeur: "Unique", chemin: BIJOUX, textes: ["Parure bijoux argentés bague et boucles d’oreilles"], allowedValues: GRILLE })) === null, "une PARURE garde sa question");
ok(val(f({ valeur: "Unique", chemin: BIJOUX, textes: ["Lot de bijoux vintage bohème"], allowedValues: GRILLE })) === null, "type de bijou inconnu : la question");
ok(val(f({ valeur: "17,3 mm", chemin: BIJOUX, textes: ["Bracelet jonc"], allowedValues: GRILLE })) === null, "une vraie taille n'est jamais recouverte (elle est dans la grille : le juge la garde)");
ok(val(f({ valeur: "M", chemin: BIJOUX, textes: ["Bracelet jonc"], allowedValues: GRILLE })) === null, "une vraie taille hors grille (« M ») : la question, jamais « Ajustable »");
ok(val(f({ valeur: "", chemin: BIJOUX, textes: ["Bracelet jonc"], allowedValues: GRILLE })) === null, "case vide : la règle du champ vide s'en charge déjà (champRequisAuto)");
ok(val(f({ valeur: "Unique", chemin: ["Mode", "Femme", "Accessoires (femme)", "Montres (femme)"], textes: ["Montre"], allowedValues: ["Jusqu'à 30 mm", "31 mm - 38 mm", "39 mm - 42 mm", "Taille unique"] })) === null,
  "une grille qui a sa taille unique (montres) : le juge la traduit, rien à faire ici");
ok(val(f({ valeur: "Unique", chemin: ["Mode", "Femme", "Vêtements (femme)", "Robes"], textes: ["Robe bracelet"], allowedValues: ["XS", "S", "M", "L"] })) === null,
  "hors des bijoux : rien (aucune « Ajustable » à poser)");

console.log("\n2. Rejeu — les 16 fiches de 13e274de questionnées le 14/11 (titres réels ; collier : sa description dit « parure »)");
const CAS = [
  ["1794615777692008", "Bracelet jonc large doré bombé rigide finition brillante effet miroir", "Ajustable"],
  ["1794615789690003", "Bracelet jonc large ambré translucide marbré forme carrée rétro", "Ajustable"],
  ["1794615779815002", "Lot 3 bracelets joncs dorés rigides lisse texturé géométrique", "Ajustable"],
  ["1794615778475006", "Bracelet femme jonc large doré torsadé rigide bijou chic tendance", "Ajustable"],
  ["1794615789690008", "Boucles d’oreilles créoles dorées papillons blancs translucides pendantes", "Ajustable"],
  ["1794615768353009", "Boucles d’oreilles créoles turquoise marbrées tendance", "Ajustable"],
  ["1794615768353011", "Lot 3 bracelets joncs dorés acier inoxydable lisses texturés", "Ajustable"],
  ["1794615768353015", "Bracelet manchette rose fuchsia large en acrylique style rétro pop", "Ajustable"],
  ["1794615768353017", "Lot 3 bracelets joncs dorés acier inoxydable ajustable", "Ajustable"],
  ["1794615768353019", "Bracelet jonc torsadé doré acier inoxydable ajustable élégant", "Ajustable"],
  ["1794615768353020", "Bracelet jonc large bleu turquoise acrylique rigide style rétro", "Ajustable"],
  ["1794615768353021", "Lot 4 bracelets en résine pastel bleu vert translucide", "Ajustable"],
  ["1794615779152020", "Bracelet jonc large en résine beige  marbré", "Ajustable"],
  ["1794615779815017", "Boucles d’oreilles cœur perles bordeaux coquette", "Ajustable"],
  ["1794615789690001", "Collier fleur dorée à 5 pétales striés – acier inoxydable chic romantique\nEnvie de composer une jolie parure ? Explorez mes autres bijoux", null],
  ["1794615768353013", "Parure bijoux argentés bague et boucles d’oreilles carrées brillantes", null],
];
let evitees = 0;
for (const [id, texte, attendu] of CAS) {
  const r = val(f({ valeur: "Unique", chemin: BIJOUX, textes: [texte], allowedValues: GRILLE }));
  if (r) evitees++;
  ok(r === attendu, `${id} : ${attendu ?? "la question reste"}`, `obtenu ${r}`);
}
ok(evitees === 14, `14 fiches sur 16 sans question (les 2 restantes : parure écrite)`, `${evitees}`);

console.log("\n3. Le câblage — écran Publier (nouveau stepper), branche « valeur hors liste »");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/import \{[^}]*tailleUniqueHorsGrille[^}]*\} from "\.\.\/\.\.\/supabase\/functions\/_shared\/champs-requis-auto\.js"/.test(lps), "l'écran importe tailleUniqueHorsGrille");
ok(/const uniqueT = !seuleT && estChampTaille\(platform, key\)\s*\? tailleUniqueHorsGrille\(\{ valeur: src, chemin: cheminDe\(platform\), textes: textesDuVendeurPour\(platform\), allowedValues \}\)/.test(lps),
  "une taille unique hors grille rejoue la règle du champ vide (même chemin, mêmes textes du vendeur)");
ok(/const suggereT = seuleT\?\.valeur \?\? uniqueT\?\.valeur \?\? verdict\.suggested;/.test(lps), "la valeur trouvée devient la suggestion (posée d'office au step Publier)");
ok(/blocking: \(seuleT \|\| uniqueT\) \? false : horsListeBloque\(/.test(lps), "et la ligne ne bloque plus");

console.log(`\n${rouges ? "✗" : "✓"} taille-unique-bijou : ${verts} verts, ${rouges} ratés`);
if (rouges) process.exit(1);
