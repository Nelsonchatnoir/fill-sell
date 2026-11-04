// selftest:ebay-aspects-du-texte — (04/11, point 3, décision de Nico) les caractéristiques eBay que la personne écrit
// déjà partent dès la publication, recalées sur la liste eBay ; jamais par-dessus une valeur connue, jamais une taille.
//   deno run --allow-read scripts/ebay-aspects-du-texte-selftest.ts
// Sur les règles RÉELLES (importées) et des listes eBay RÉELLES (ebay_item_aspects, rayons 11554 « Jeans femme » et
// 11483 « Jeans homme », relevés le 04/11 — extraits). Textes réécrits sur le modèle des annonces de Marc.
import { aspectsLusDansLeTexte, completerAvecLeTexte, valeurDansLaListe } from "../supabase/functions/_shared/ebay-aspects-du-texte.ts";

let ko = 0, n = 0;
const ok = (c: boolean, m: string, d?: unknown) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`); } };

const PAYS = ["Allemagne", "Bangladesh", "Chine", "Espagne", "États-Unis", "France", "Inde", "Italie", "Maroc", "Nicaragua", "Portugal", "Royaume-Uni", "Tunisie", "Turquie", "Viêt Nam"];
const pouces = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${a + i} in`);
const CAT = [
  { name: "Marque", mode: "FREE_TEXT", required: true, allowedValues: ["Lee", "Wrangler", "Levi's"] },
  { name: "Taille", mode: "SELECTION_ONLY", required: true, allowedValues: ["38", "40", "52"] },
  { name: "Couleur", mode: "FREE_TEXT", required: true, allowedValues: ["Bleu", "Noir"] },
  { name: "Vintage", mode: "SELECTION_ONLY", allowedValues: ["Oui", "Non"] },
  { name: "Type de taille", mode: "SELECTION_ONLY", allowedValues: ["Regular", "Plus", "Petite", "Grand (longueur)", "Junior", "Maternité", "Grande taille"] },
  { name: "Coupe", mode: "FREE_TEXT", allowedValues: ["Athlétique", "Classique", "Décontracté", "Extra-slim", "Regular", "Slim"] },
  { name: "Pays d'origine", mode: "SELECTION_ONLY", allowedValues: PAYS },
  { name: "Matière", mode: "FREE_TEXT", allowedValues: ["100 % coton", "Coton", "Élasthanne", "Polyester"] },
  { name: "Textile", mode: "FREE_TEXT", allowedValues: ["Chambray", "Jean", "Maille", "Velours côtelé"] },
  { name: "Tour de taille", mode: "FREE_TEXT", allowedValues: pouces(28, 60) },
  { name: "Longueur d'entre-jambe", mode: "FREE_TEXT", allowedValues: pouces(26, 38) },
  { name: "Style de jambe", mode: "FREE_TEXT", allowedValues: ["Bootcut", "Droit", "Flared", "Fuselé", "Skinny", "Wide-Leg"] },
  { name: "Type de poche", mode: "FREE_TEXT", allowedValues: ["Design à 5 poches", "Poche à monnaie", "Poche cargo", "Poche coupée"] },
  { name: "Fermeture", mode: "FREE_TEXT", allowedValues: ["Bouton", "Fermeture éclair", "Pression"] },
  { name: "Modèle", mode: "FREE_TEXT", allowedValues: ["Lee Rider", "Wrangler Texas"] },
];

console.log("1. Le jean Lee (titre « Vintage … 22W », description « Coupe : Décontractée », « Made in USA »)");
{
  const titre = "Vintage Lee Taille 22W FR 52 Femme Jean Noir";
  const desc = "Jean Lee vintage, très bon état.\nCoupe : Décontractée\nComposition : 100 % coton\nMade in USA\nTaille : 22W";
  const lus = aspectsLusDansLeTexte(CAT, titre, desc);
  ok(lus["Vintage"]?.valeur === "Oui", "Vintage = Oui (« vintage »)", lus["Vintage"]);
  ok(lus["Type de taille"]?.valeur === "Grande taille", "Type de taille = Grande taille (« 22W »)", lus["Type de taille"]);
  ok(lus["Coupe"]?.valeur === "Décontracté", "Coupe : Décontractée → Décontracté (liste eBay)", lus["Coupe"]);
  ok(lus["Pays d'origine"]?.valeur === "États-Unis", "Made in USA → États-Unis", lus["Pays d'origine"]);
  ok(lus["Matière"]?.valeur === "100 % coton", "Composition : 100 % coton → Matière", lus["Matière"]);
  ok(lus["Textile"]?.valeur === "Jean", "« Jean » dans le titre → Textile = Jean", lus["Textile"]);
  ok(!lus["Taille"], "jamais une taille (« Taille : 22W » ignorée : la taille a sa propre règle)", lus["Taille"]);
}

console.log("2. Le jean Wrangler (« Modèle : Rugged Wear », « W40 L30 », « jambe droite », « 5 poches », Nicaragua)");
{
  const titre = "Jean Wrangler Rugged Wear W40 L30 Homme bleu";
  const desc = "Modèle : Rugged Wear\nJambe droite, 5 poches, fermeture zippée.\nFabriqué au Nicaragua.";
  const lus = aspectsLusDansLeTexte(CAT, titre, desc);
  ok(lus["Modèle"]?.valeur === "Rugged Wear", "Modèle : Rugged Wear (saisie libre, libellé exact) part tel quel", lus["Modèle"]);
  ok(lus["Tour de taille"]?.valeur === "40 in" && lus["Longueur d'entre-jambe"]?.valeur === "30 in", "W40 L30 → 40 in / 30 in", [lus["Tour de taille"], lus["Longueur d'entre-jambe"]]);
  ok(lus["Style de jambe"]?.valeur === "Droit", "« jambe droite » → Droit", lus["Style de jambe"]);
  ok(lus["Type de poche"]?.valeur === "Design à 5 poches", "« 5 poches » → Design à 5 poches", lus["Type de poche"]);
  ok(lus["Pays d'origine"]?.valeur === "Nicaragua", "Fabriqué au Nicaragua → Nicaragua", lus["Pays d'origine"]);
  ok(!lus["Fermeture"], "« fermeture zippée » sans libellé : rien (pas un mot sûr)", lus["Fermeture"]);
}

console.log("3. Jamais une valeur inventée, jamais par-dessus une valeur connue");
{
  const lus = aspectsLusDansLeTexte(CAT, "Pull Made in Atlantis", "Coupe : oversize magique\nPays : Atlantis");
  ok(!lus["Pays d'origine"], "un pays hors de la liste fermée : rien", lus["Pays d'origine"]);
  ok(lus["Coupe"]?.valeur === "oversize magique", "« Coupe : … » au nom EXACT d'une saisie libre : la phrase de la personne part telle quelle", lus["Coupe"]);
  const lus2 = aspectsLusDansLeTexte(CAT, "Jean", ["Origine : Atlantis", "Vintage : peut-être"].join("\n"));
  ok(!lus2["Pays d'origine"] && lus2["Vintage"]?.valeur !== "peut-être", "une liste FERMÉE n'accepte qu'une de ses entrées (alias ou nom exact)", lus2);
  const r = completerAvecLeTexte({ aspects: { "Vintage": ["Non"], "Marque": ["Lee"] }, manquants: ["Coupe"], sources: { "Vintage": "standard", "Marque": "job" } },
    { "Vintage": { valeur: "Oui", preuve: "x" }, "Coupe": { valeur: "Décontracté", preuve: "y" } });
  ok(r.aspects["Vintage"][0] === "Non" && r.aspects["Coupe"][0] === "Décontracté" && r.sources["Coupe"] === "texte", "une valeur déjà là n'est jamais remplacée ; un absent est rempli (source « texte »)", r);
  ok(r.manquants.length === 0, "un aspect obligatoire lu dans le texte sort des manquants (pas d'IA, pas de question)", r.manquants);
  ok(valeurDansLaListe("Décontractées", ["Décontracté", "Classique"]) === "Décontracté" && valeurDansLaListe("Slim", ["Slim", "Extra-slim"]) === "Slim",
    "accord au masculin / singulier, une seule correspondance");
  ok(valeurDansLaListe("Bleus", ["Bleu", "Bleue"]) === null, "deux correspondances possibles : rien (jamais un choix)");
}

console.log("4. Le branchement (remplirAspects)");
{
  const src = Deno.readTextFileSync(new URL("../supabase/functions/_shared/ebay-publication.ts", import.meta.url)).replace(/\r\n/g, "\n");
  ok(/const premier = completerAvecLeTexte\(assemblerAspects\(pf, catalogue, textes\), lus\);/.test(src), "avant l'IA : le texte complète le premier assemblage");
  ok(/return \{ \.\.\.completerAvecLeTexte\(second, lus\), ia:/.test(src), "après l'IA : le texte complète encore ce qui manque");
}

console.log(ko ? `\n✗ ebay-aspects-du-texte : ${ko} rouge(s) sur ${n}` : `\n✓ ebay-aspects-du-texte : ${n} contrôles verts`);
Deno.exit(ko ? 1 : 0);
