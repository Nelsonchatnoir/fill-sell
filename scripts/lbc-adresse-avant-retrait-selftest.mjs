// Selftest — contrôle d'adresse Leboncoin AVANT le retrait (background.js, 0.6.82).
// Réponses RÉELLES de api/ad-geoloc/v2/autocomplete relevées le 01/10 sur le
// compte de Nico (mode précis = use_precise_address=true, celui du formulaire).
// Les fonctions sont EXTRAITES de background.js, jamais recopiées.
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
function extraireFonction(nom) {
  const debut = SRC.search(new RegExp(`(?:async\\s+)?function\\s+${nom}\\s*\\(`));
  if (debut < 0) throw new Error(`${nom} introuvable`);
  let p = SRC.indexOf("(", debut), par = 0;
  for (; p < SRC.length; p++) { if (SRC[p] === "(") par++; else if (SRC[p] === ")") { par--; if (par === 0) break; } }
  let i = SRC.indexOf("{", p), prof = 0;
  for (; i < SRC.length; i++) { if (SRC[i] === "{") prof++; else if (SRC[i] === "}") { prof--; if (prof === 0) return SRC.slice(debut, i + 1); } }
  throw new Error(`${nom} : accolades`);
}
const voieRe = SRC.match(/const ADRESSE_LBC_VOIE_RE = (\/.*\/);/)?.[1];
assert.ok(voieRe, "ADRESSE_LBC_VOIE_RE présent");
const code = [
  `const ADRESSE_LBC_VOIE_RE = ${voieRe};`,
  ...["adresseLbcComparable", "jetonsAdresseLbc", "adresseRepublicationLbc", "suggestionCouvreAdresseLbc", "decisionAdresseLbc"].map(extraireFonction),
  "return { adresseRepublicationLbc, decisionAdresseLbc };",
].join("\n");
const { adresseRepublicationLbc, decisionAdresseLbc } = new Function(code)();

let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// Josephine, commune seule (job f33c2118 avant le correctif serveur).
const josCommune = adresseRepublicationLbc({ localisation_origine: { voie: null, ville: "Chantemerle-lès-Grignan", code_postal: "26230", libelle: "Chantemerle-lès-Grignan 26230" } });
assert.equal(josCommune.adresse, "Chantemerle-lès-Grignan 26230");
assert.equal(josCommune.avecRue, false);
assert.equal(decisionAdresseLbc(josCommune, [], ["Chantemerle-lès-Grignan (26230)"]).verdict, "commune_mode_simple");
assert.equal(decisionAdresseLbc(josCommune, [], []).verdict, "introuvable");
ok("Chantemerle commune seule : mode précis [] → chemin d'avant si le mode simple la propose, pause sinon");

// Josephine, rue des Réglages servie par le serveur (v170+).
const josRue = adresseRepublicationLbc({ localisation_origine: { voie: "4 Rue Du Hameau", ville: "Chantemerle-lès-Grignan", code_postal: "26230" } });
assert.equal(josRue.adresse, "4 Rue Du Hameau 26230 Chantemerle-lès-Grignan");
assert.equal(josRue.avecRue, true);
assert.equal(decisionAdresseLbc(josRue, ["4 Rue du Hameau, Chantemerle-lès-Grignan (26230)"], ["4 Rue du Hameau, Chantemerle-lès-Grignan (26230)"]).verdict, "ok");
ok("Chantemerle avec la rue : couverte en mode précis → retrait autorisé");

// nicolas.menar, commune seule : la seule proposition précise est une rue de DOUAI.
const nicCommune = adresseRepublicationLbc({ localisation_origine: { voie: null, ville: "Roost-Warendin", code_postal: "59286" } });
const d1 = decisionAdresseLbc(nicCommune, ["Rue de Roost Warendin, Douai (59500)"], ["Roost-Warendin (59286)", "Rue de Roost Warendin, Douai (59500)"]);
assert.equal(d1.verdict, "commune_mode_simple");
assert.equal(d1.retenue, "Roost-Warendin (59286)");
assert.equal(decisionAdresseLbc(nicCommune, ["Rue de Roost Warendin, Douai (59500)"], ["Rue de Roost Warendin, Douai (59500)"]).verdict, "introuvable");
ok("Roost-Warendin : « Rue de Roost Warendin, Douai (59500) » ne couvre JAMAIS la commune (code postal)");

// nicolas.menar, rue des Réglages (sans le numéro dans la proposition).
const nicRue = adresseRepublicationLbc({ localisation_origine: { voie: "204 allée du château de bernicourt", ville: "Roost-Warendin", code_postal: "59286" } });
assert.equal(decisionAdresseLbc(nicRue, ["Allée du Château de Bernicourt, Roost-Warendin (59286)"], []).verdict, "ok");
ok("rue de nicolas.menar : numéro absent de la proposition toléré, commune et code postal présents → ok");

// Une rue que Leboncoin ne connaît pas : pause avant retrait, même si le mode simple propose la commune.
const faute = adresseRepublicationLbc({ localisation_origine: { voie: "12 rue imaginaire", ville: "Roost-Warendin", code_postal: "59286" } });
assert.equal(decisionAdresseLbc(faute, [], ["Roost-Warendin (59286)"]).verdict, "introuvable");
ok("rue introuvable en mode précis → pause avant retrait");

// Repli Réglages (pas de localisation d'origine).
const regl = adresseRepublicationLbc({ adresse: "4 Rue Du Hameau 26230 Chantemerle-lès-Grignan" });
assert.equal(regl.avecRue, true);
assert.equal(regl.commune.cp, "26230");
assert.equal(decisionAdresseLbc(regl, ["4 Rue du Hameau, Chantemerle-lès-Grignan (26230)"], []).verdict, "ok");
assert.equal(adresseRepublicationLbc({}).adresse, "");
ok("sans localisation d'origine : l'adresse des Réglages, contrôlée de même ; rien du tout → sans adresse");

// Une commune voisine ne passe jamais (code postal).
assert.equal(decisionAdresseLbc(josCommune, ["Chantemerle-les-Blés (26600)"], ["Chantemerle-les-Blés (26600)"]).verdict, "introuvable");
ok("commune voisine (Chantemerle-les-Blés 26600) : jamais retenue");

console.log(`lbc-adresse-avant-retrait : ${n} contrôles verts`);
