// L'âge d'une annonce Beebs se REPREND à la republication, il ne se
// redemande pas (03/10, cas Louis : cinq inserts Zombicide « 16 ans et + »,
// rayon « Jeux de société », republication automatique en needs_user toutes
// les 18 minutes).
import fs from "node:fs";
import assert from "node:assert/strict";
import { ageBeebsDuReleve } from "../supabase/functions/_shared/beebs-age-releve.js";

// 1. La règle pure : la valeur EXACTE de Beebs, jamais une déduction.
assert.equal(ageBeebsDuReleve({ age: "16 ans et +" }), "16 ans et +", "relevé 0.6.92 : `age`");
assert.equal(ageBeebsDuReleve({ attributs_bruts: [{ key_label: "Âge", value_label: "8 ans - 12 ans" }] }), "8 ans - 12 ans", "attributs bruts : ligne « Âge »");
assert.equal(ageBeebsDuReleve({ attributs_bruts: [{ key_label: "Age", value: "0-6 mois" }] }), "0-6 mois", "sans accent, valeur brute");
assert.equal(ageBeebsDuReleve({ taille: "16 ans et +", titre: "Jeu 16 ans et +" }), null, "jamais lu dans la taille ni le titre");
assert.equal(ageBeebsDuReleve({ age: "  " }), null, "vide = inconnu");
assert.equal(ageBeebsDuReleve(null), null);

// 2. Le serveur : la republication reprend l'âge de SON annonce.
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
assert.match(gpj, /import \{ ageBeebsDuReleve \} from "\.\.\/_shared\/beebs-age-releve\.js";/);
assert.match(gpj, /j\.action === "republish" && !String\(pfB\(j\)\["age"\] \?\? ""\)\.trim\(\)/, "une republication sans âge passe par la reprise");
assert.match(gpj, /select\("inventaire_id, listing_id, capture, vu_le"\)/, "le relevé est lu avec son numéro d'annonce");
assert.match(gpj, /captureParAnnonce\.get\(numeroB\)/, "la capture de l'annonce MÊME (deux exemplaires = deux annonces)");
assert.match(gpj, /const ageCap = ageBeebsDuReleve\(cap\);[\s\S]{0,200}pf\["age"\] = ageCap;/, "l'âge relevé est posé");
const iReprise = gpj.indexOf("const ageCap = ageBeebsDuReleve(cap);");
const iPorte = gpj.indexOf("if (j.platform === \"beebs\") return cheminDe(pf.beebsCategoryPath).length > 0 && !presente(pf.age);");
assert.ok(iReprise > 0 && iPorte > iReprise, "la reprise passe AVANT la porte « âge exigé »");
assert.doesNotMatch(gpj, /avait été deviné, pas lu/, "plus de message faux sur l'annonce en ligne");

// 2bis. Et le PRIX de l'annonce en ligne (10 €), pas celui de la tâche du 19/09 (12 €).
assert.match(gpj, /UNE REPUBLICATION REMET L'ANNONCE AU PRIX OÙ ELLE EST/);
assert.ok(gpj.includes(`pfP(j)["prix_republication"] == null`), "un prix de republication choisi par la personne prime");
assert.ok(gpj.includes(`.update({ price: enLigne, platform_fields: pf })`), "le prix relevé de l'annonce est posé sur la tâche");
assert.ok(gpj.includes(`["beebs", "leboncoin", "ebay", "opla"].includes(String(j.platform))`), "Vinted garde sa copie par capture complète");

// 2ter. (03/10 nuit, nivake03) La TAILLE affichée par l'annonce l'emporte
// sur la copie (« Ajustable » affichée, « L » copiée, grille en mm).
assert.ok(gpj.includes(`|| (j.action === "republish" && String(pfB(j)["taille"] ?? "").trim() !== "")`), "une republication avec taille passe par la confrontation");
assert.match(gpj, /if \(tCap && tJob && tCap\.toLowerCase\(\) !== tJob\.toLowerCase\(\)\) \{\s*pf\["taille"\] = tCap;/, "la taille de l'annonce remplace celle de la copie");
assert.ok(gpj.includes(`pf["taille_reprise_de_l_annonce"] = { avant: tJob, apres: tCap`), "avec sa trace avant/après");

// 2quater. Et les champs AFFICHÉS se relisent sur la page avant tout retrait
// (0.6.94) : tout ce qui est lu (lus), ce qui comble la copie (repris).
const bg0 = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
assert.ok(bg0.includes("pf.champs_lus_sur_l_annonce = { le: new Date().toISOString(), lus, repris,"), "les valeurs lues sont toutes gardées");
assert.match(bg0, /const caps = \[[^\]]*"champs_annonce_republication_v1"[^\]]*\]/, "le poste déclare la capacité au serveur");
const iLecture = bg0.indexOf("const repris = await reprendreChampsDeLAnnonce(job, pf);");
const iCaptured = bg0.indexOf('pf.republish_step = "captured";', iLecture);
assert.ok(iLecture > 0 && iCaptured > iLecture, "la lecture de l'annonce précède l'étape captured (donc le retrait)");

// 3. L'extension relève l'âge sur la fiche Beebs.
const bg = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
assert.match(bg, /out\.age = ligneLibellee\(\["Âge", "Age"\]\);/, "le relevé Beebs lit la ligne « Âge »");

console.log("✓ Beebs : l'âge de l'annonce en ligne est repris à la republication, jamais redemandé");
