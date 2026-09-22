// Autotest de src/utils/chaussureMalgreLeMot.js — `npm run selftest:chaussure`
//
// Deux moitiés, et la seconde compte autant que la première :
//   · CE QUI DOIT BASCULER : le cas fondateur (Nike Blazer Mid 77) et les
//     modèles que Nico a nommés (Samba, Air Force, Stan Smith…) ;
//   · CE QUI NE DOIT PAS BOUGER : de vrais vêtements de la même marque, un
//     vrai blazer, les mots qui disent déjà une chaussure, et tout ce qui n'a
//     aucune preuve. Une règle de classement se juge sur ses faux positifs.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Les sources de l'app importent sans extension (style Vite) : copie temporaire
// importable par Node, sans toucher aux fichiers du dépôt (même procédé que
// categorie-garde-fou-selftest.mjs).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmps = [];
const copie = (rel, nomTmp, remplacements = []) => {
  let src = fs.readFileSync(join(ROOT, rel), "utf8");
  for (const [de, vers] of remplacements) src = src.split(de).join(vers);
  const p = join(ROOT, "scripts", nomTmp);
  fs.writeFileSync(p, src);
  tmps.push(p);
  return p;
};
copie("src/utils/texteComparable.js", ".texteComparable.selftest.tmp.mjs");
const pMod = copie("src/utils/chaussureMalgreLeMot.js", ".chaussureMalgreLeMot.selftest.tmp.mjs",
  [['from "./texteComparable"', 'from "./.texteComparable.selftest.tmp.mjs"']]);
const { chaussureMalgreLeMot } = await import(pathToFileURL(pMod).href);
for (const p of tmps) fs.unlinkSync(p);

const attrPointure = (v) => ({ attributs_visibles: { v: { pointure: v } } });
let ko = 0;

const doitBasculer = (cas, arg) => {
  const r = chaussureMalgreLeMot(arg);
  if (!r || r.mot !== "baskets" || r.icone !== "👟") {
    console.error(`  ✗ ${cas} — attendu « baskets », obtenu ${r ? r.mot : "null"}`);
    ko++;
  } else {
    console.log(`  ✓ ${cas} → baskets (${r.regle})`);
  }
};

const doitNePasBouger = (cas, arg) => {
  const r = chaussureMalgreLeMot(arg);
  if (r) {
    console.error(`  ✗ ${cas} — NE devait PAS basculer, obtenu « ${r.mot} » (${r.regle} : ${r.preuves.join(" ; ")})`);
    ko++;
  } else {
    console.log(`  ✓ ${cas} → inchangé`);
  }
};

console.log("\n— CE QUI DOIT BASCULER —");
doitBasculer("cas fondateur : Nike Blazer Mid 77 (lesmillesetunepepite, 22/09)", {
  mot: "blazer",
  titre: "Nike Blazer Mid 77 Jumbo Blanc Noir DD3111-100",
  description: "Paire de Nike Blazer Mid 77 Jumbo en blanc et noir. Usure visible sur les semelles.",
  marque: "Nike", attributs: attrPointure("EU 10"),
});
doitBasculer("Adidas Samba", { mot: "", titre: "Adidas Samba OG blanc vert taille 42", marque: "Adidas" });
doitBasculer("Nike Air Force 1", { mot: "", titre: "Nike Air Force 1 blanches", marque: "Nike" });
doitBasculer("Adidas Stan Smith", { mot: "", titre: "Stan Smith Adidas cuir blanc", marque: "Adidas" });
doitBasculer("Adidas Campus (mot « veste » au titre)", {
  mot: "veste", titre: "Adidas Campus 00s daim gris", marque: "Adidas",
});
doitBasculer("Dr Martens Chelsea (le mot dit un club, l'objet est une boot)", {
  mot: "", titre: "Dr Martens Chelsea 2976 noir", marque: "Dr Martens",
});
doitBasculer("pointure relevée contre un mot de vêtement", {
  mot: "veste", titre: "Veste de sport Kappa", marque: "Kappa", attributs: attrPointure("41"),
});
doitBasculer("« pointure » écrite par le vendeur contre un mot de vêtement", {
  mot: "top", titre: "Top Geox", description: "pointure 38, portées deux fois", marque: "Geox",
});

console.log("\n— CE QUI NE DOIT PAS BOUGER —");
doitNePasBouger("un VRAI blazer", { mot: "blazer", titre: "Blazer Zara noir taille 38", marque: "Zara" });
// ⚠️ ARBITRAGE ASSUMÉ (22/09, consigne Nico : « un nom de modèle connu
// (Blazer, Samba, Air Force, Stan Smith…) » l'emporte). « Nike » + « Blazer »
// est lu comme la basket, PAS comme une veste de tailleur — c'est la lecture
// écrasante du couple, et Nike ne vend pas de blazers au sens vestimentaire
// (sa maille s'appelle veste, coupe-vent, survêtement). Si un jour un vrai
// blazer de marque Nike existait, il partirait au rayon chaussures : c'est le
// prix payé, il est connu et il est plus petit que l'inverse (une paire de
// baskets au rayon costumes, qui refuse ensuite la pointure).
doitBasculer("« Blazer Nike » est lu comme la basket (arbitrage assumé)", {
  mot: "blazer", titre: "Blazer Nike Sportswear noir", marque: "Nike",
});
doitNePasBouger("veste Adidas (marque au catalogue, aucun modèle)", {
  mot: "veste", titre: "Veste Adidas Originals bleue taille M", marque: "Adidas",
});
doitNePasBouger("survêtement Puma", { mot: "jogging", titre: "Bas de jogging Puma noir", marque: "Puma" });
doitNePasBouger("le mot dit DÉJÀ une chaussure", {
  mot: "baskets", titre: "Baskets Nike Air Max 90", marque: "Nike", attributs: attrPointure("42"),
});
doitNePasBouger("bottines : mot de chaussure, rien à corriger", {
  mot: "bottines", titre: "Bottines LPB beige suédine", marque: "LPB", attributs: attrPointure("40"),
});
doitNePasBouger("un livre", { mot: "livre", titre: "Le Petit Prince — Saint-Exupéry", marque: "" });
doitNePasBouger("un jeu vidéo", { mot: "jeu", titre: "Final Fantasy X PS2", marque: "Sony" });
doitNePasBouger("une taie d'oreiller", { mot: "taie", titre: "Lot de 4 taies d'oreiller blanches", marque: "" });
doitNePasBouger("une robe sans la moindre preuve", { mot: "robe", titre: "Robe Camaïeu fleurie bleue", marque: "Camaïeu" });
doitNePasBouger("un ballon de basket (« basket » ≠ chaussure, et rien ne le contredit)", {
  mot: "ballon", titre: "Ballon de basket Spalding", marque: "Spalding",
});
doitNePasBouger("marque proche mais modèle absent (New Balance)", {
  mot: "sweat", titre: "Sweat New Balance gris taille L", marque: "New Balance",
});
doitNePasBouger("une montre", { mot: "montre", titre: "Casio G-Shock noire", marque: "Casio" });

// ── LES QUATRE FAUX POSITIFS RÉELS, RELEVÉS SUR LE PARC LE 22/09 ───────────
// Rejeu de 900 articles portant un nom de modèle : les marques IMPRIMENT leurs
// modèles sur des vêtements. Ces quatre-là basculaient à tort avant que le mot
// du vendeur ne l'emporte sur la table marque+modèle. Ils sont ici pour ne
// plus jamais revenir.
doitNePasBouger("PARC — Veste vintage tracktop noire Reebok Classic T:M 38 femme", {
  mot: "veste", titre: "Veste vintage tracktop noire Reebok Classic T:M 38 femme, chic et rare", marque: "Reebok",
});
doitNePasBouger("PARC — Pantalon Jogging nike Jordan 12/13", {
  mot: "pantalon", titre: "Pantalon Jogging nike Jordan 12/13", marque: "Jordan",
});
doitNePasBouger("PARC — Nike femme short Air Force coupe courte noir taille M", {
  mot: "short", titre: "Nike femme short Air Force coupe courte noir taille M S632", marque: "Nike",
});
doitNePasBouger("PARC — T-shirt Nike et air Jordan", {
  mot: "t-shirt", titre: "T-shirt Nike et air Jordan", marque: "Nike",
});
// …mais une pointure relevée tranche toujours contre le mot du vendeur :
doitBasculer("PARC — le même t-shirt, avec une pointure relevée, redevient une chaussure", {
  mot: "t-shirt", titre: "T-shirt Nike et air Jordan", marque: "Nike", attributs: attrPointure("42"),
});

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
