// ═══════════════════════════════════════════════════════════════════════════
// Autotest — eBay exige un EAN (18/10, lot 3 « zéro orange » — sebimsn10)
//   deno run --allow-read --allow-env --allow-net scripts/ebay-ean-exige-selftest.ts
// ═══════════════════════════════════════════════════════════════════════════
// Trois publications par l'API arrêtées le 18/10 (07:30-07:48 UTC) sur le refus
// 25002 « Le champ EAN n'a pas été renseigné », paramètre 3 = « EAN ». Aucune
// fiche du parc ne porte d'EAN (seul l'ISBN existe, 591 fiches) : le refus
// laissait la personne devant « relancer » le même dépôt.
// La règle vérifiée ici, pour TOUS les comptes :
//   1. ce refus est reconnu, et lui seul ;
//   2. l'EAN n'est joint au produit QU'APRÈS qu'eBay l'a exigé pour ce job : celui
//      de la fiche s'il est LISIBLE (clé de contrôle juste — un ISBN-13 en est
//      un), sinon « Ne s'applique pas » (la valeur que porte déjà le MPN) ;
//   3. le worker repart UNE fois (marque ean_non_applicable), puis pose la
//      question EAN — jamais une boucle ; handler-watch fait repartir une fois
//      les jobs déjà arrêtés.
import assert from "node:assert/strict";
// (18/10, preuve réelle) eBay a REFUSÉ « Ne s'applique pas » pour l'EAN sur les 3 jobs de sebimsn10 (valable
// pour le MPN seul) : le défaut est « Non applicable », le texte OFFICIEL d'eBay France (product identifier text).
import { eanAEnvoyer, eanValide, EAN_SANS_IDENTIFIANT_EBAY_FR, eanDejaEssayeOfficiel, lireErreurEbay, refusEanRequis, refusRetoursObligatoires } from "../supabase/functions/_shared/ebay-publication.ts";

let n = 0;
const ok = (c: boolean, nom: string) => { assert.ok(c, nom); n++; console.log(`  ✓ ${nom}`); };
const lire = (p: string) => Deno.readTextFile(new URL(`../${p}`, import.meta.url)).then((t) => t.split("\r\n").join("\n"));

console.log("1. LE REFUS RÉEL, RECONNU — ET LUI SEUL");
// Le corps brut RÉEL (last_diagnostic.brut, job efe6afcb du 18/10).
const BRUT = '{"errors":[{"errorId":25002,"domain":"API_INVENTORY","subdomain":"Selling","category":"Request","message":"Une erreur utilisateur est survenue. Le champ EAN n\'a pas été renseigné. Ajoutez EAN à l\'annonce et réessayez.","parameters":[{"name":"0","value":"Le champ EAN n\'a pas été renseigné."},{"name":"1","value":"Le champ EAN n\'a pas été renseigné. Ajoutez EAN à l\'annonce et réessayez."},{"name":"2","value":"1"},{"name":"3","value":"EAN"}]}]}';
const e = lireErreurEbay(JSON.parse(BRUT), BRUT);
ok(refusEanRequis(e), "le refus réel du 18/10 est reconnu");
ok(!refusRetoursObligatoires(e), "ce n'est pas le refus des retours");
ok(!refusEanRequis({ errorId: 25002, message: "", params: [{ name: "0", value: "ReturnsAcceptedOption" }] }), "25002 retours : pas l'EAN");
ok(!refusEanRequis({ errorId: 25002, message: "BrandMPN manquante", params: [{ name: "0", value: "BrandMPN" }] }), "25002 BrandMPN : pas l'EAN");
ok(!refusEanRequis({ errorId: 25129, message: "", params: [{ name: "3", value: "EAN" }] }), "autre code : pas ce refus");

console.log("\n2. L'EAN LISIBLE — ET SEULEMENT LUI");
ok(eanValide("4006381333931") === "4006381333931", "EAN-13 à clé juste");
ok(eanValide("978-0-306-40615-7") === "9780306406157", "un ISBN-13 est un EAN-13 (tirets ôtés)");
ok(eanValide("96385074") === "96385074", "EAN-8 à clé juste");
ok(eanValide("4006381333932") === null, "clé fausse : jamais envoyé");
ok(eanValide("0306406152") === null, "ISBN-10 : pas un EAN, jamais converti en douce");
ok(eanValide("Ne s'applique pas") === null && eanValide("") === null && eanValide(null) === null, "texte ou vide : pas un EAN");

console.log("\n3. JOINT SEULEMENT APRÈS L'EXIGENCE D'eBAY");
ok(eanAEnvoyer({ isbn: "9780306406157" }) === null, "sans la marque : rien n'est ajouté (aucun rapprochement catalogue forcé)");
const marque = { ebay_api: { ean_non_applicable: { le: "2026-10-18T10:00:00Z" } } };
assert.deepEqual(eanAEnvoyer({ ...marque, isbn: "9780306406157" }), { valeur: "9780306406157", source: "fiche" }); n++; console.log("  ✓ marque + ISBN-13 lisible : l'EAN de la fiche");
assert.deepEqual(eanAEnvoyer({ ...marque, ebayAspects: { EAN: "4006381333931" } }), { valeur: "4006381333931", source: "fiche" }); n++; console.log("  ✓ marque + réponse de la personne (ebayAspects.EAN) : celle-là");
assert.deepEqual(eanAEnvoyer({ ...marque, isbn: "0306406152" }), { valeur: EAN_SANS_IDENTIFIANT_EBAY_FR, source: "defaut" }); n++; console.log("  ✓ marque sans EAN lisible : « Non applicable »");
ok(EAN_SANS_IDENTIFIANT_EBAY_FR === "Non applicable", "le texte officiel d'eBay France (developer.ebay.com, product identifier text)");
ok(!eanDejaEssayeOfficiel(marque), "une marque d'avant (« Ne s'applique pas », refusé) : une relance de plus est due");
ok(eanDejaEssayeOfficiel({ ebay_api: { ean_non_applicable: { valeur: "Non applicable" } } }), "le texte officiel déjà essayé : la question tient");

console.log("\n4. LE WORKER ET handler-watch : UNE FOIS, PUIS LA QUESTION");
const W = await lire("supabase/functions/ebay-api-worker/index.ts");
ok(/const ean = eanAEnvoyer\(pf as Record<string, unknown>\);/.test(W) && /\.\.\.\(ean \? \{ ean: \[ean\.valeur\] \} : \{\}\),/.test(W), "le produit porte l'EAN quand la règle le dit");
ok(/if \(refusEanRequis\(e\)\) \{[\s\S]{0,600}if \(!apiPf\.ean_non_applicable \|\| !eanDejaEssayeOfficiel\(pf as Record<string, unknown>\)\) \{[\s\S]{0,300}status: "pending"[\s\S]{0,300}ean_non_applicable: \{ le:[^}]*valeur: EAN_SANS_IDENTIFIANT_EBAY_FR \}/.test(W), "premier refus (ou marque d'avant) : UNE nouvelle publication avec le texte officiel");
ok(/field_key: "EAN"[\s\S]{0,1500}status: "needs_user", error: msgEan/.test(W), "second refus : la question EAN");
const H = await lire("supabase/functions/handler-watch/index.ts");
ok(/eq\("platform_fields->last_diagnostic->>errorId", "25002"\)/.test(H) && /\/"value"\\s\*:\\s\*"EAN"\/i\.test/.test(H), "handler-watch relit le refus EAN réel des jobs déjà arrêtés");
ok(/if \(api\.ean_non_applicable && eanDejaEssayeOfficiel\(pf\)\) continue;/.test(H), "jamais deux fois avec le texte officiel");

console.log(`\nebay-ean-exige-selftest : ${n} cas verts`);
