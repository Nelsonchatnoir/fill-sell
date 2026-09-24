// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION QUE L'ANNONCE NOMME DÉJÀ — SELFTEST (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ (supabase/functions/_shared/option-du-texte.js), le
// même pour l'app et pour update-job-status, sur le cas fondateur (job
// fc5e4bff de Jocabroc) et sur les pièges qu'il doit éviter.
//
// Ce qu'il garantit :
//   1. le cas fondateur rend « Plateau » depuis le TITRE « … plateau de
//      service », dans la liste « Accessoire de table » ;
//   2. mots ENTIERS : « plat » ne se lit jamais dans « plateau » ;
//   3. formes proches : plateaux → Plateau, bocal → Bocaux et pots ;
//   4. jamais « Autre » ni « Autres », même nommés ;
//   5. plusieurs options → pas de valeur, les candidates rendues (question
//      avec elles en tête), sauf si une source suivante tranche ;
//   6. une correspondance contenue dans une plus longue s'efface ;
//   7. l'ordre des sources : titre, objet IA, objet vérifié, description ;
//   8. tailles, marques, état, colis ne se déduisent jamais d'un texte.
//
//   node scripts/option-du-texte-selftest.mjs

import {
  optionDepuisTextes, optionsNommees, champDeductibleDuTexte, textesDeLAnnonce,
  listeCandidatsDabord, estFourreTout,
} from "../supabase/functions/_shared/option-du-texte.js";
import { LBC_MAISON_JARDIN_DEPENDANTS } from "../src/utils/lbcMaisonJardin.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const ARTS = LBC_MAISON_JARDIN_DEPENDANTS["Maison & Jardin > Arts de la table"].produits;
const ACCESSOIRE = ARTS["Accessoire de table"];

console.log("1. Cas fondateur fc5e4bff (Jocabroc)");
{
  const textes = textesDeLAnnonce({
    titre: "Présentoir vintage en bois sculpté – 3 compartiments – plateau de service",
    description: "Joli présentoir en bois, idéal pour l'apéritif.",
    platformFields: { categorie_objet_ia: "plateau de service", categorie_verification: { objet: "plateau de service" } },
  });
  const r = optionDepuisTextes({ options: ACCESSOIRE, textes });
  ok(r.valeur === "Plateau", `« Plateau » lu dans le titre (rendu : ${JSON.stringify(r)})`);
  ok(r.source === "titre", "la source est le titre");
  ok(ACCESSOIRE.includes(r.valeur), "la valeur est écrite comme dans la liste Leboncoin");
  ok(!ACCESSOIRE.includes("Plat apéritif"), "« Plat apéritif » n'est bien PAS dans la liste d'« Accessoire de table »");
}

console.log("2. Mots entiers — jamais une sous-chaîne");
{
  const r = optionDepuisTextes({ options: ["Plat", "Bol"], textes: [{ source: "titre", texte: "Grand plateau en bois" }] });
  ok(r.valeur === null && r.candidats.length === 0, "« plat » ne se lit pas dans « plateau »");
  const r2 = optionDepuisTextes({ options: ACCESSOIRE, textes: [{ source: "titre", texte: "Rond de service ancien" }] });
  ok(r2.valeur === null, "« Rond de serviette » ne se lit pas dans « rond de service »");
}

console.log("3. Formes proches");
{
  ok(optionDepuisTextes({ options: ACCESSOIRE, textes: [{ source: "titre", texte: "Lot de 2 plateaux laqués" }] }).valeur === "Plateau", "plateaux → Plateau");
  ok(optionDepuisTextes({ options: ARTS["Rangement et conservation"], textes: [{ source: "titre", texte: "Bocal en verre ancien" }] }).valeur === "Bocaux et pots", "bocal → « Bocaux et pots »");
  ok(optionDepuisTextes({ options: ACCESSOIRE, textes: [{ source: "titre", texte: "Seau pour glaçons en inox" }] }).valeur === "Seau à glaçons", "« seau pour glaçons » → « Seau à glaçons »");
  ok(optionDepuisTextes({ options: ACCESSOIRE, textes: [{ source: "titre", texte: "Poivrière en porcelaine" }] }).valeur === "Salière, poivrière et sucrier", "un morceau d'un libellé composé suffit");
  ok(optionDepuisTextes({ options: ACCESSOIRE, textes: [{ source: "titre", texte: "Dessous-de-plat en liège" }] }).valeur === "Dessous de plat", "un morceau de plusieurs mots se lit d'un bloc");
}

console.log("4. Jamais « Autre » ni « Autres »");
{
  const r = optionDepuisTextes({ options: ["Autre", "Autres", "Coffret"], textes: [{ source: "titre", texte: "Autre modèle, autres couleurs" }] });
  ok(r.valeur === null && r.candidats.length === 0, "le fourre-tout ne se lit jamais");
  ok(estFourreTout("Autres") && estFourreTout("autre") && !estFourreTout("Autre robot"), "estFourreTout ne vise que le fourre-tout exact");
}

console.log("5. Plusieurs options → question avec elles en tête, sauf départage");
{
  const r = optionDepuisTextes({ options: ARTS["Vaisselle de table"], textes: [{ source: "titre", texte: "Lot bols et assiettes" }] });
  ok(r.valeur === null && r.candidats.length === 2, `deux options nommées → pas de valeur (${r.candidats.join(", ")})`);
  const liste = listeCandidatsDabord(ARTS["Vaisselle de table"], r.candidats);
  ok(liste.slice(0, 2).every((o) => r.candidats.includes(o)) && liste.length === ARTS["Vaisselle de table"].length, "listeCandidatsDabord : candidates en tête, rien de perdu");
  const r2 = optionDepuisTextes({ options: ARTS["Vaisselle de table"], textes: [
    { source: "titre", texte: "Lot bols et assiettes" }, { source: "objet_ia", texte: "bol" },
  ] });
  ok(r2.valeur === "Bol" && r2.source === "titre+objet_ia", "l'objet IA départage les candidates du titre");
}

console.log("6. Correspondance contenue dans une plus longue");
{
  const r = optionDepuisTextes({ options: ["Plat", "Plat de service", "Assiette"], textes: [{ source: "titre", texte: "Grand plat de service en faïence" }] });
  ok(r.valeur === "Plat de service", "« plat de service » nomme « Plat de service », pas « Plat »");
  const r2 = optionDepuisTextes({ options: ["Bleu", "Bleu marine", "Noir"], textes: [{ source: "titre", texte: "Pull bleu marine" }] });
  ok(r2.valeur === "Bleu marine", "« bleu marine » nomme « Bleu marine », pas « Bleu »");
}

console.log("7. Ordre des sources");
{
  const t = textesDeLAnnonce({ titre: "Présentoir en bois", description: "Se pose sur un set de table.", platformFields: { categorie_objet_ia: "plateau de service" } });
  ok(t.map((x) => x.source).join(",") === "titre,objet_ia,objet_verifie,description", "titre, objet IA, objet vérifié, description");
  ok(optionDepuisTextes({ options: ACCESSOIRE, textes: t }).valeur === "Plateau", "l'objet IA passe avant la description");
  const t2 = textesDeLAnnonce({ titre: "Présentoir en bois", description: "Un joli beurrier ancien." });
  ok(optionDepuisTextes({ options: ACCESSOIRE, textes: t2 }).valeur === "Beurrier", "la description en dernier recours");
  ok(optionDepuisTextes({ options: ACCESSOIRE, textes: textesDeLAnnonce({ titre: "Présentoir en bois" }) }).valeur === null, "rien nommé → rien posé");
}

console.log("8. Ce qui ne se déduit jamais d'un texte");
{
  for (const [k, l] of [["size", ""], ["shoe_size", "Pointure"], ["Taille", "Taille"], ["baby_age", "Âge"], ["Âge", "Âge"],
    ["brand", ""], ["clothing_brand", "Marque"], ["model", "Modèle"], ["condition", "État"], ["État", "État"],
    ["estimated_parcel_weight", "Poids du colis"], ["Format du colis", "Format du colis"], ["isbn", "ISBN"]]) {
    ok(!champDeductibleDuTexte(k, l), `${k} (${l || "—"}) : jamais déduit`);
  }
  for (const [k, l] of [["table_art_product", "Produit"], ["table_art_type", "Univers"], ["decoration_type", "Produit"],
    ["clothing_type", "Univers"], ["clothing_color", "Couleur"], ["material", "Matière"], ["Type", "Type"], ["Département", "Département"]]) {
    ok(champDeductibleDuTexte(k, l), `${k} (${l}) : déductible`);
  }
}

console.log("9. optionsNommees ne rend que des libellés de la liste");
{
  const n = optionsNommees("plateau, beurrier et sous-verre", ACCESSOIRE);
  ok(n.every((x) => ACCESSOIRE.includes(x.option)), "aucune valeur inventée");
  ok(n.length === 3, `trois options nommées (${n.map((x) => x.option).join(", ")})`);
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ option du texte : tout passe");
process.exit(ko ? 1 : 0);
