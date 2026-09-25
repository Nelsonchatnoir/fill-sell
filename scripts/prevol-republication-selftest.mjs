// Autotest du PRÉ-VOL DE REPUBLICATION — `npm run selftest:prevol-republication`
//
// Ce que ce test garantit, et qui a été payé :
//   · Vinted  : le contrôle tourne (il avait été écrit le 22/09 au matin dans
//               une fonction que Vinted n'atteint jamais — mort-né) ;
//   · Vinted  : et il tourne sur LA FORME RÉELLE D'UN JOB (23/09). Ce test
//               était vert pendant que la prod bloquait 99 republications sur
//               99 : ses cas Vinted posaient un `republish_snapshot` sur le
//               job, alors que ce snapshot est écrit 250 lignes PLUS BAS par
//               le passage même que la garde précède. Un cas de test se RELÈVE
//               en base, il ne se suppose pas ;
//   · le MESSAGE : il nomme le champ manquant et ne s'emboîte jamais dans
//               lui-même (« la copie … manque dans la copie », 23/09) ;
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
const debut = src.indexOf("function prevolCaptureRepublication(job, snapExterne = null) {");
// Fin = la première accolade fermante en COLONNE 0 après le début.
const fin = src.indexOf("\n}\n", debut);
if (debut < 0 || fin < 0) { console.error("✗ prevolCaptureRepublication introuvable dans background.js"); process.exit(1); }
const corps = src.slice(debut, fin + 3);
const prevolCaptureRepublication = new Function(`${corps}; return prevolCaptureRepublication;`)();

// Le MESSAGE est la deuxième moitié de la garde : le 23/09 il rendait « la
// copie de ton annonce manque dans la copie de ton annonce ». On le relit à la
// source lui aussi.
const dMsg = src.indexOf("function messagePrevolRepublication(label, manquants) {");
const fMsg = src.indexOf("\n}\n", dMsg);
if (dMsg < 0 || fMsg < 0) { console.error("✗ messagePrevolRepublication introuvable dans background.js"); process.exit(1); }
const messagePrevolRepublication = new Function(`${src.slice(dMsg, fMsg + 3)}; return messagePrevolRepublication;`)();

let ko = 0;
const attendu = (nom, job, manquantsAttendus, snap = null) => {
  const r = prevolCaptureRepublication(job, snap);
  const a = JSON.stringify(r), b = JSON.stringify(manquantsAttendus);
  if (a !== b) { console.error(`  ✗ ${nom}\n      attendu ${b}\n      obtenu  ${a}`); ko++; }
  else console.log(`  ✓ ${nom}${r.length ? ` → bloque sur ${a}` : " → laisse passer"}`);
};

console.log("\n1. VINTED — LA FORME RÉELLE D'UN JOB, celle qui a coûté 99 blocages");
// ⛔ CE QUI A MANQUÉ ICI LE 22/09 : les trois cas ci-dessous étaient écrits sur
//    une forme de job IMAGINÉE — un `republish_snapshot` déjà posé. Aucun job
//    de production n'a cette forme au moment où la garde tourne : sur le chemin
//    Vinted, le snapshot est écrit ~250 lignes PLUS BAS, par le même passage.
//    Le test passait au vert pendant que la prod bloquait 99 fois sur 99.
//    Un cas de test doit être RELEVÉ EN BASE, jamais supposé.
// Forme relevée le 23/09 sur les 99 jobs bloqués (aucun n'avait de snapshot) :
const jobVintedReel = {
  platform: "vinted",
  platform_fields: {
    capture_id: 7633, vinted_item_id: "9455594147", republish_step: "captured",
    republish_source: "auto", pepites_debitees: 1,
  },
};
attendu("LE CAS DU 23/09 : capture en base, pas encore de copie sur le job → on passe", jobVintedReel, []);
attendu("ni capture ni copie → là, il n'y a vraiment rien pour recréer", {
  platform: "vinted", platform_fields: { republish_step: "captured" },
}, ["la copie de ton annonce"]);
attendu("capture_id à 0 ne vaut pas une capture", {
  platform: "vinted", platform_fields: { capture_id: 0 },
}, ["la copie de ton annonce"]);

console.log("\n1bis. VINTED — la copie CONSTRUITE (passage « copie_construite »)");
// Le vrai contrôle champ par champ : la copie est passée en 2e argument, telle
// que `construireSnapshotRepublish` vient de la fabriquer depuis la capture.
const copie = { titre: "Pull", photos: ["a"], prix: 12, catalog_id: 221, package_size_id: 2 };
attendu("copie complète", jobVintedReel, [], copie);
attendu("format du colis manquant (cas XEWER, job 6aabc550)", jobVintedReel, ["le format du colis"], { ...copie, package_size_id: null });
attendu("catégorie manquante", jobVintedReel, ["la catégorie"], { ...copie, catalog_id: null });
attendu("photos et prix manquants", jobVintedReel, ["les photos", "le prix"], { ...copie, photos: [], prix: 0 });
// La copie passée fait foi : même avec une capture_id, une copie construite
// incomplète bloque — c'est tout l'intérêt du second passage.
attendu("copie construite vide → bloque malgré la capture", jobVintedReel, ["le titre", "les photos", "le prix", "la catégorie", "le format du colis"], {});

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
// XEWER, 25/09 : le lieu-dit ne bloque pas (la commune et le code postal
// suffisent) ; ce qui bloque AVANT le retrait, c'est l'absence de code postal
// dans ce qu'on va taper — l'invariant de fillAddress n'a plus rien à tenir.
attendu("XEWER : localisation avec lieu-dit → on passe (la commune suffit)", {
  ...lbcComplet,
  platform_fields: {
    lbcCategoryPath: ["Loisirs", "Jeux & Jouets"],
    localisation_origine: { ville: "Saint-Yrieix-sur-Charente", code_postal: "16710", voie: null, libelle: "Saint-Yrieix-sur-Charente 16710 Les Rochers" },
  },
}, []);
attendu("adresse des Réglages sans code postal → on ne retire PAS", {
  ...lbcComplet,
  platform_fields: { lbcCategoryPath: ["Loisirs", "Jeux & Jouets"], adresse: "allée du saut du loup Saulx" },
}, ["l'adresse où se trouve l'article"]);
attendu("localisation d'origine sans code postal → on ne retire PAS", {
  ...lbcComplet,
  platform_fields: { lbcCategoryPath: ["Loisirs", "Jeux & Jouets"], localisation_origine: { ville: "Lyon", code_postal: null, voie: null, libelle: "Lyon" } },
}, ["l'adresse où se trouve l'article"]);

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

console.log("\n5. LE MESSAGE — il nomme ce qui manque, sans l'emboîter dans lui-même");
const msgDit = (nom, manquants, doitContenir, neDoitPasContenir) => {
  const m = messagePrevolRepublication("Vinted", manquants);
  const ok = m.includes(doitContenir) && !(neDoitPasContenir && m.includes(neDoitPasContenir));
  if (!ok) { console.error(`  ✗ ${nom}\n      message : ${m}`); ko++; }
  else console.log(`  ✓ ${nom}`);
};
msgDit(
  "LE CAS : « la copie … dans la copie » ne doit plus jamais sortir",
  ["la copie de ton annonce"],
  "la copie de ton annonce n'a pas été retrouvée",
  "la copie de ton annonce manque dans la copie de ton annonce",
);
msgDit("un champ : il est nommé", ["le format du colis"], "le format du colis manque dans la copie de ton annonce");
msgDit("deux champs : ils sont nommés tous les deux", ["le titre", "le prix"], "le titre et le prix manquent");
msgDit("le message dit TOUJOURS que l'annonce est intacte", ["le prix"], "Ton annonce est TOUJOURS en ligne");

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
