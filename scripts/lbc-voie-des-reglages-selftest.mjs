// Selftest — supabase/functions/_shared/lbc-voie-des-reglages.js (01/10).
// Cas réels relus en base le 01/10 (textes d'erreur mot pour mot).
import assert from "node:assert/strict";
import {
  communeComparable, texteRefuseCommune, textesErreurJob,
  rueDesReglagesMemeCommune, decisionAdresseRepublicationLbc,
} from "../supabase/functions/_shared/lbc-voie-des-reglages.js";

let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// Textes réels de l'extension (jobs f33c2118 et 1f5e16f9).
const refusJosephine = "Adresse \"Chantemerle-lès-Grignan 26230\" sans suggestion dans l'autocomplete Leboncoin. Le repli sur « 26230 Chantemerle-lès-Grignan » a été tenté ensuite, sans succès non plus.";
const refusNicolas = "Adresse \"Roost-Warendin 59286\" : aucune suggestion Leboncoin ne la couvre (la meilleure, \"Rue de Roost Warendin, Douai (59500)\", ne contient pas [\"roostwarendin\",\"59286\"]). Propositions affichées: [\"Rue de Roost Warendin, Douai (59500)\",\"Rue de Roost Warendin, Douai (59500)\"].";
const reglagesJosephine = { rue: "4 Rue Du Hameau", ville: "Chantemerle-lès-Grignan", code_postal: "26230", adresse: "4 Rue Du Hameau 26230 Chantemerle-lès-Grignan" };
const reglagesNicolas = { rue: "204 allée du château de bernicourt", ville: "Roost-warendin", code_postal: "59286", adresse: "204 allée du château de bernicourt 59286 Roost-warendin" };
const locJosephine = { voie: null, ville: "Chantemerle-lès-Grignan", libelle: "Chantemerle-lès-Grignan 26230", code_postal: "26230" };
const locNicolas = { voie: null, ville: "Roost-Warendin", libelle: "Roost-Warendin 59286", code_postal: "59286" };

assert.equal(communeComparable("Roost-warendin"), communeComparable("Roost-Warendin"));
assert.equal(communeComparable("Saint yrieix sur charente"), communeComparable("Saint-Yrieix-sur-Charente"));
assert.equal(communeComparable("Chantemerle-lès-Grignan"), "chantemerle les grignan");
assert.notEqual(communeComparable("Douai"), communeComparable("Roost-Warendin"));
ok("communes comparées aux accents, tirets et majuscules près");

assert.ok(texteRefuseCommune(refusJosephine, "Chantemerle-lès-Grignan"));
assert.ok(texteRefuseCommune(refusNicolas, "Roost-Warendin"));
assert.ok(!texteRefuseCommune(refusNicolas, "Douai"), "le refus de Roost-Warendin n'est pas un refus de Douai");
assert.ok(!texteRefuseCommune("Annonce introuvable dans le Hub vendeur", "Roost-Warendin"));
ok("refus d'adresse reconnu, et seulement pour sa commune");

const jobJosephine = { id: "f33c2118", platform: "leboncoin", action: "republish", error: refusJosephine,
  platform_fields: { localisation_origine: locJosephine, deleted_at: "2026-09-30T18:00:00Z",
    erreurs_archivees: [{ erreur: refusJosephine }], error_technique: { brut: refusJosephine } } };
assert.equal(textesErreurJob(jobJosephine).length, 3);
assert.equal(rueDesReglagesMemeCommune(locJosephine, reglagesJosephine), "4 Rue Du Hameau");
assert.equal(rueDesReglagesMemeCommune(locNicolas, reglagesNicolas), "204 allée du château de bernicourt");
assert.equal(rueDesReglagesMemeCommune(locNicolas, reglagesJosephine), null, "autre commune : rien");
assert.equal(rueDesReglagesMemeCommune(locNicolas, { ...reglagesNicolas, code_postal: "59500" }), null, "autre code postal : rien");
assert.equal(rueDesReglagesMemeCommune(locNicolas, { ...reglagesNicolas, rue: "" }), null, "pas de rue : rien");
ok("rue des Réglages seulement dans la même commune (code postal ET ville)");

// Joséphine (annonce déjà retirée, refus sur ce job) → rue servie.
const d1 = decisionAdresseRepublicationLbc(jobJosephine, reglagesJosephine, true);
assert.equal(d1.action, "rue");
assert.equal(d1.job.platform_fields.localisation_origine.voie, "4 Rue Du Hameau");
assert.equal(d1.job.platform_fields.localisation_origine.code_postal, "26230");
assert.equal(jobJosephine.platform_fields.localisation_origine.voie, null, "l'original n'est pas touché");
// Ce que tapera l'extension (leboncoin.js : voie + cp + ville) = la chaîne qui a réussi le 29/09.
const lo1 = d1.job.platform_fields.localisation_origine;
assert.equal(`${lo1.voie} ${lo1.code_postal} ${lo1.ville}`, "4 Rue Du Hameau 26230 Chantemerle-lès-Grignan");
ok("josephinecerni : « 4 Rue Du Hameau 26230 Chantemerle-lès-Grignan », la chaîne de ses 131 publications");

// nicolas.menar : second doudou, jamais essayé, refus connu sur un AUTRE job du compte.
const jobNicolas2 = { id: "02fef16f", platform: "leboncoin", action: "republish", error: null,
  platform_fields: { localisation_origine: locNicolas } };
const d2 = decisionAdresseRepublicationLbc(jobNicolas2, reglagesNicolas, true);
assert.equal(d2.action, "rue");
assert.equal(d2.job.platform_fields.localisation_origine.voie, "204 allée du château de bernicourt");
ok("nicolas.menar : rue des Réglages servie avant même le premier essai (refus connu sur l'autre doudou)");

// Ce qui passe aujourd'hui ne change pas.
const jocabroc = { id: "x", platform: "leboncoin", action: "republish", platform_fields: { localisation_origine: { voie: null, ville: "Sarreguemines", code_postal: "57200", libelle: "Sarreguemines 57200" } } };
// Élargie le 01/10 (mode précis Leboncoin) : même commune → la rue, même sans refus connu.
assert.equal(decisionAdresseRepublicationLbc(jocabroc, { rue: "1 rue X", ville: "Sarreguemines", code_postal: "57200" }, false).action, "rue");
// Autre commune, sans refus connu : tel quel (rien ne change).
assert.equal(decisionAdresseRepublicationLbc(jocabroc, { rue: "1 rue X", ville: "Metz", code_postal: "57000" }, false).action, "tel_quel");
const avecVoie = { ...jobJosephine, platform_fields: { localisation_origine: { ...locJosephine, voie: "4 Rue Du Hameau" } } };
assert.equal(decisionAdresseRepublicationLbc(avecVoie, reglagesJosephine, true).action, "tel_quel");
assert.equal(decisionAdresseRepublicationLbc({ ...jobNicolas2, action: "publish" }, reglagesNicolas, true).action, "tel_quel");
assert.equal(decisionAdresseRepublicationLbc({ ...jobNicolas2, platform: "beebs" }, reglagesNicolas, true).action, "tel_quel");
ok("même commune → rue même sans refus ; autre commune sans refus, rue d'origine, publication neuve, autre plateforme : tel quel");

// Refus connu, pas de rue dans la même commune.
assert.equal(decisionAdresseRepublicationLbc(jobNicolas2, reglagesJosephine, true).action, "retenir", "pas encore retirée : retenue");
assert.equal(decisionAdresseRepublicationLbc({ ...jobJosephine }, { rue: "" }, true).action, "tel_quel", "déjà retirée : continue");
ok("refus connu sans rue de repli : retenue avant le retrait, jamais après");

console.log(`lbc-voie-des-reglages : ${n} contrôles verts`);
