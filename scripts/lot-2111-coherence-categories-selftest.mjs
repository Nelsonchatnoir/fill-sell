// ═══════════════════════════════════════════════════════════════════════════
// VERROU — 21/11/2026, complément de Nico (catégories, points 1 et 7 du lot) : la catégorie posée est cohérente avec le
// TITRE et l'OBJET reconnu par l'IA — la RÈGLE, pour tous les comptes et toutes les plateformes
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant (audit des publications du 21/11, vérifiées en base) :
//   · Vinted : « Pull neuf kaki TU » → « Maison › Animaux › Chiens › Vêtements & accessoires › Pulls » ;
//   · Beebs / Leboncoin : « 🍄 miniature blendeur rose » → « Petit électroménager › Mixeurs » / « Électroménager » ;
//   · eBay : « Petite boîte en émail cloisonné bleu » → « Décoration d'intérieur › Vases » (suggestion d'eBay) ;
//   · Leboncoin : « pin's pikachu » → « Jeux & Jouets » (« Collection » refusée : famille « mode » de l'origine eBay) ;
//   · Vinted : « Gilet Sixth June gris taille L » (sans manches, en maille) → « Gilets de costume » ;
//   · Leboncoin : « Vans Sk8-Hi » → « Sport & Plein air » (« Sk8 » lu « skate ») ;
//   · Beebs : « livre d'or du chocolat » → « Livres pour bébé » (choix de la personne : la règle vaut pour le moteur).
// Verts gardés : vraies baskets en chaussures (eBay « Fille : chaussures » compris), vrai mixeur en Mixeurs, vrai livre de
// bébé (« à toucher », imagier), pull pour chien, gilet de costume nommé, vase nommé, brosse Hippo Tonic (équitation).
//   node --import ./scripts/loader-ext.mjs scripts/lot-2111-coherence-categories-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { incoherenceCategorie, candidatesCoherentes, objetDeCollection } from "../supabase/functions/_shared/coherence-categorie.js";
import { detectObjectIcon } from "../src/utils/iconeObjet.js";
import { resoudreParMot } from "../src/utils/categorieParMot.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => readFileSync(join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
const inc = (titre, objet, chemin) => incoherenceCategorie({ titre, objet, chemin });

console.log("1. Les cas faux de l'audit du 21/11 : incohérents");
for (const [titre, objet, chemin, regle] of [
  ["Pull neuf kaki TU", "pull", ["Maison", "Animaux", "Chiens", "Vêtements & accessoires", "Pulls"], "animaux_sans_animal"],
  ["Pull homme Brooks XL bleu marine à motifs – vintage", "pull", ["Maison", "Animaux", "Chiens", "Vêtements & accessoires", "Pulls"], "animaux_sans_animal"],
  ["🍄 miniature blendeur rose", "mixeur miniature", ["Maison", "Petit électroménager", "Mixeurs"], "miniature_en_appareil"],
  ["🍄 miniature blendeur rose", "mixeur miniature", ["Maison & Jardin", "Électroménager"], "miniature_en_appareil"],
  ["Petite boîte en émail cloisonné bleu – Motifs floraux", "petite boîte", ["Maison", "Décoration d'intérieur", "Vases"], "vase_sans_vase"],
  ["Lot 2 boîtes pot- pourri naturel", "pot-pourri", ["Maison", "Décoration d'intérieur", "Vases"], "vase_sans_vase"],
  ["pin's pikachu", "pin's", ["Loisirs", "Jeux & Jouets"], "pins_en_jouets"],
  ["Gilet Sixth June gris taille L", "gilet", ["Hommes", "Vêtements", "Costumes et blazers", "Gilets de costume"], "gilet_de_costume_sans_costume"],
  ["Vans Sk8-Hi montantes marron orange bordeaux", "baskets", ["Loisirs", "Sport & Plein air"], "chaussure_hors_chaussures"],
  ["Très beau livre d'or du chocolat", "livre", ["Jeux, jouets et loisirs", "Livres", "Livres pour bébé"], "livre_bebe_sans_bebe"],
  ["Baskets montantes MTNG Mustang roses – Taille 34", "baskets", ["Vêtements, accessoires", "Enfant : vêtements, accessoires", "Fille : vêtements"], "chaussure_hors_chaussures"],
]) {
  const r = inc(titre, objet, chemin);
  ok(r?.regle === regle, `« ${titre.slice(0, 40)} » → ${chemin.slice(-1)[0]} : ${regle}`, JSON.stringify(r));
}

console.log("2. Les cas justes : cohérents (aucune régression)");
for (const [titre, objet, chemin] of [
  ["Baskets montantes MTNG Mustang roses – Taille 34", "baskets", ["Vêtements, accessoires", "Enfant : vêtements, accessoires", "Fille : vêtements, accessoires", "Fille : chaussures"]],
  ["Baskets montantes MTNG Mustang roses – Taille 34", "baskets", ["Mode", "Fille", "Chaussures (fille)", "Baskets (fille)"]],
  ["Nike Blazer Mid 77", "baskets", ["Mode", "Chaussures"]],
  ["Blender Moulinex 1,5 L", "blender", ["Maison", "Petit électroménager", "Mixeurs"]],
  ["🍄 miniature blendeur rose", "mixeur miniature", ["Jouets et jeux", "Maisons de poupées miniatures", "Maisons de poupées"]],
  ["Mon ABC à toucher", "livre tactile", ["Jeux, jouets et loisirs", "Livres", "Livres pour bébé"]],
  ["Mon premier imagier", "livre", ["Jeux, jouets et loisirs", "Livres", "Livres pour bébé"]],
  ["Très beau livre d'or du chocolat", "livre", ["Jeux, jouets et loisirs", "Livres", "Livres de recettes"]],
  ["Pull pour chien taille M", "pull pour chien", ["Maison", "Animaux", "Chiens", "Vêtements & accessoires", "Pulls"]],
  ["Brosse Hippo Tonic Fuchsia", "brosse", ["Animaux", "Accessoires animaux"]],
  ["Fond de cage jetable – GuineaLoft", "fond de cage", ["Animaux", "Accessoires animaux"]],
  ["Gilet de costume Zara bleu", "gilet de costume", ["Hommes", "Vêtements", "Costumes et blazers", "Gilets de costume"]],
  ["Vase en verre soufflé", "vase", ["Maison", "Décoration d'intérieur", "Vases"]],
  ["Petite boîte en émail cloisonné bleu – Motifs floraux", "petite boîte", ["Maison", "Décoration", "Rangement et organisation", "Boîtes"]],
  ["pin's pikachu", "pin's", ["Loisirs", "Collection"]],
  ["pin's pikachu", "pin's", ["Accessoires de mode", "Bijoux", "Broches"]],
  ["Barbie avec robe et chaussures", "poupée", ["Jeux, jouets et loisirs", "Poupées", "Poupées"]],
  ["Boîte à chaussures en carton", "boîte", ["Maison", "Rangement", "Boîtes"]],
  ["Pull col rond femme", "pull", ["Femmes", "Vêtements", "Pulls et sweats", "Pulls"]],
]) {
  ok(inc(titre, objet, chemin) === null, `« ${titre.slice(0, 40)} » → ${chemin.slice(-1)[0]} : cohérent`);
}

console.log("3. Les candidates envoyées à l'IA : jamais une incohérente");
{
  const r = await resoudreParMot("Pull", "vinted", { genre: "" });
  const avant = r.candidats.some((c) => c.chemin.includes("Animaux"));
  const apres = candidatesCoherentes(r.candidats, { titre: "Pull neuf kaki TU", objet: "pull" });
  ok(avant && !apres.some((c) => c.chemin.includes("Animaux")) && apres.length > 0, "« Pull » sans genre : la feuille des chiens retirée, les autres restent");
  const g = await resoudreParMot("gilet", "vinted", { genre: "Homme" });
  const gc = candidatesCoherentes(g.candidats, { titre: "Gilet Sixth June gris taille L", objet: "gilet" });
  ok(g.candidats.some((c) => c.chemin.includes("Gilets de costume")) && !gc.some((c) => /Gilets de costume|haute visibilité|lestés|de course|flottaison/.test(c.chemin.join(" "))),
    "« gilet » homme : costume, haute visibilité, lestés, course, flottaison retirés (titre sans ces mots)");
  const m = await resoudreParMot("mixeur miniature", "beebs", { genre: "" });
  ok(m.candidats.some((c) => c.chemin.includes("Mixeurs")) && candidatesCoherentes(m.candidats, { titre: "🍄 miniature blendeur rose", objet: "mixeur miniature" }).length === 0,
    "« mixeur miniature » Beebs : « Mixeurs » retirée (aucune candidate → l'icône du jouet)");
}

console.log("4. L'icône d'une miniature d'objet de la maison : un jouet");
ok(detectObjectIcon("🍄 miniature blendeur rose", "", "") === "🪆", "« miniature blendeur » → 🪆");
ok(detectObjectIcon("Maison de poupée en bois", "", "") === "🪆" && detectObjectIcon("Dînette en bois Janod", "", "") === "🪆", "maison de poupée, dînette → 🪆");
ok(detectObjectIcon("Voiture miniature Norev 1/43", "", "") === "🏎️", "voiture miniature : toujours 🏎️");
ok(detectObjectIcon("Miniature parfum Chanel n°5", "", "") !== "🪆" && detectObjectIcon("Peinture miniature encadrée", "", "") !== "🪆", "miniature de parfum, peinture miniature : jamais 🪆");
ok(detectObjectIcon("Blender Moulinex", "", "") === "🥣", "un vrai blender reste 🥣");

console.log("5. Un objet de collection n'hérite pas de la famille de son origine");
ok(objetDeCollection({ titre: "pin's pikachu", objet: "pin's" }) && objetDeCollection({ titre: "Lot de fèves des rois", objet: "fève" }), "pin's, fèves : objets de collection");
ok(!objetDeCollection({ titre: "Pull col rond", objet: "pull" }), "un pull : non");

console.log("6. Le branchement (app, worker eBay, contrôle quotidien)");
{
  const r = lire("src/utils/resolutionPublication.js");
  ok(/retenues = candidatesCoherentes\(retenues, \{ titre: frTitrePublication, objet: activeAiObjet \?\? motCategorie \}\);/.test(r), "app : candidates filtrées avant l'IA");
  ok(/const incoherentIa = incoherenceCategorie\(\{ chemin: choix\.chemin/.test(r) && /coherenceEcartee\[platform\] = \{ chemin: choix\.chemin, \.\.\.incoherentIa, etape: "choix_ia" \};\s*\n[^\n]*\n\s*continue;/.test(r), "app : un choix incohérent de l'IA n'est pas retenu");
  ok(/if \(r\.certitude === "exact" && !horsMaison && !brancheEcartee && !incoherent\) categorieParMotParPf\[platform\] = r;/.test(r), "app : une feuille exacte incohérente n'est pas une certitude");
  // Le choix de la personne est posé APRÈS la résolution et l'emporte : la résolution n'en sait rien (verrou rayon-vaut-pour-larticle).
  ok(/COHÉRENCE DU CHEMIN FINAL AVEC LE TITRE ET L'OBJET/.test(r) && /pf\.categorie_source = "coherence_icone_objet";/.test(r) && !/rayon_choisi|choix_humain/.test(r), "app : contrôle final (Leboncoin/Beebs : rayon de l'objet) ; la résolution ignore le choix humain, posé après");
  ok(/const familleObjet = objetDeCollection\(/.test(r), "app : famille d'un objet de collection");
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  ok(/const suggestions = suggestionsBrutes\.filter\(\(x\) => !incoherenceCategorie\(\{ chemin: x\.chemin, titre, objet: objetCoherence \}\)\);/.test(w), "worker eBay : suggestions incohérentes retirées dès leur lecture");
  const d = lire("supabase/functions/ops-digest/index.ts");
  ok(/categories_incoherentes: incoherencesMoteur\.length,/.test(d) && /\.range\(page \* 1000, page \* 1000 \+ 999\)/.test(d), "ops-digest : contrôle quotidien, lu par pages de 1 000");
}

console.log(`\n${verts} vertes, ${rouges} rouges — complément catégories du 21/11 (cohérence titre ↔ rayon).`);
if (rouges) { console.log("ROUGE"); process.exit(1); }
