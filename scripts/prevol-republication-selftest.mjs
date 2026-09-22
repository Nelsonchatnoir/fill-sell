// Autotest du PRÉ-VOL DE REPUBLICATION — `npm run selftest:prevol-republication`
//
// Ce que ce test garantit, et qui a été payé :
//   · Vinted  : le contrôle tourne (il avait été écrit le 22/09 au matin dans
//               une fonction que Vinted n'atteint jamais — mort-né) ;
//   · Leboncoin : la LOCALISATION est exigée avant tout retrait (job af34f609,
//               nicolas.menar : annonce supprimée, recréation bloquée sur
//               l'adresse, 11 minutes hors ligne) ;
//   · et surtout : LE PRÉ-VOL NE DEMANDE JAMAIS CE QU'ON SAIT RETROUVER. Sur
//               le parc réel, 338 publications Leboncoin sur 1096 (les imports
//               du relevé) n'ont ni photo, ni catégorie, ni adresse SUR LE JOB.
//               Les bloquer aurait arrêté 338 republications qui marchent.
//
// La fonction testée est extraite de chrome-extension/background.js : elle y
// vit sans dépendance, et ce test la relit à la source — pas une copie.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Le dépôt est en CRLF : on normalise avant de découper, sinon les repères
// « \n} » ne matchent rien et l'extraction rend une fonction vide.
const src = fs.readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").split("\r\n").join("\n");
const debut = src.indexOf("function prevolCaptureRepublication(job) {");
// Fin = la première accolade fermante en COLONNE 0 après le début.
const fin = src.indexOf("\n}\n", debut);
if (debut < 0 || fin < 0) { console.error("✗ prevolCaptureRepublication introuvable dans background.js"); process.exit(1); }
const corps = src.slice(debut, fin + 3);
const prevolCaptureRepublication = new Function(`${corps}; return prevolCaptureRepublication;`)();

let ko = 0;
const attendu = (nom, job, manquantsAttendus) => {
  const r = prevolCaptureRepublication(job);
  const a = JSON.stringify(r), b = JSON.stringify(manquantsAttendus);
  if (a !== b) { console.error(`  ✗ ${nom}\n      attendu ${b}\n      obtenu  ${a}`); ko++; }
  else console.log(`  ✓ ${nom}${r.length ? ` → bloque sur ${a}` : " → laisse passer"}`);
};

console.log("\n1. VINTED — le contrôle qui n'avait jamais tourné");
attendu("capture complète", {
  platform: "vinted",
  platform_fields: { republish_snapshot: { titre: "Pull", photos: ["a"], prix: 12, catalog_id: 221, package_size_id: 2 } },
}, []);
attendu("format du colis manquant (cas XEWER, job 6aabc550)", {
  platform: "vinted",
  platform_fields: { republish_snapshot: { titre: "Pull", photos: ["a"], prix: 12, catalog_id: 221 } },
}, ["le format du colis"]);
attendu("aucune copie", { platform: "vinted", platform_fields: {} }, ["la copie de ton annonce"]);

console.log("\n2. LEBONCOIN — le cas af34f609 (nicolas.menar, 22/09)");
const lbcComplet = {
  platform: "leboncoin", title: "Lot 2 doudous Lama Simba Toys", price: 28, photos: ["u1"],
  listing_url: "https://www.leboncoin.fr/ad/jeux_jouets/3254722711",
  platform_fields: {
    lbcCategoryPath: ["Loisirs", "Jeux & Jouets"],
    localisation_origine: { ville: "Roost-Warendin", code_postal: "59286", voie: null, libelle: "Roost-Warendin 59286" },
  },
};
attendu("annonce complète, localisation capturée", lbcComplet, []);
attendu("LE CAS : ni localisation capturée, ni adresse aux Réglages → on ne retire PAS", {
  ...lbcComplet, platform_fields: { lbcCategoryPath: ["Loisirs", "Jeux & Jouets"] },
}, ["l'adresse où se trouve l'article"]);
attendu("pas de localisation capturée MAIS une adresse aux Réglages → on passe", {
  ...lbcComplet,
  platform_fields: { lbcCategoryPath: ["Loisirs", "Jeux & Jouets"], adresse: "7 allée du saut du loup 91160 Saulx" },
}, []);

console.log("\n3. LEBONCOIN — CE QUE LE PRÉ-VOL NE DOIT PAS DEMANDER");
console.log("   (profil des 338 imports du relevé : rien sur le job, tout dans la capture)");
attendu("catégorie absente mais lien d'annonce présent (elle se lit dans l'adresse)", {
  ...lbcComplet, platform_fields: { localisation_origine: lbcComplet.platform_fields.localisation_origine },
}, []);
attendu("photos absentes du job mais comptées dans la copie", {
  ...lbcComplet, photos: [],
  platform_fields: { ...lbcComplet.platform_fields, republish_snapshot: { photos: 3 } },
}, []);
attendu("titre et prix absents du job mais présents dans la copie", {
  ...lbcComplet, title: "", price: 0,
  platform_fields: { ...lbcComplet.platform_fields, republish_snapshot: { titre: "Lot 2 doudous", prix: 28 } },
}, []);
attendu("ni catégorie ni lien nulle part → là, on bloque", {
  platform: "leboncoin", title: "Truc", price: 5, photos: ["u"],
  platform_fields: { adresse: "1 rue de la Paix 75002 Paris" },
}, ["la catégorie"]);

console.log("\n4. BEEBS — même règle, rayon compris");
attendu("dépôt Beebs complet", {
  platform: "beebs", title: "Pot Diddlina", price: 9, photos: ["u"],
  platform_fields: { beebsCategoryPath: ["Jeux, jouets et loisirs", "Figurines"] },
}, []);
attendu("rayon Beebs absent → on ne retire pas", {
  platform: "beebs", title: "Pot Diddlina", price: 9, photos: ["u"], platform_fields: {},
}, ["le rayon Beebs"]);

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
