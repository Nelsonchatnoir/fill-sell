// (28/10/2026) mele.marta, job 2fd83d73 « Gioco PS4 F1 2015 » : page Vinted en italien, sonde du compte muette
// (http « jeton_expire_session_ouverte », vinted_identite null à 12:24 et 12:25) → pays non lu → vinted_ids_actifs
// non servi → la catégorie est descendue par libellés français : « Électronique » introuvable parmi « Accessori,
// Donna, Uomo, Bambini, Casa, Elettronica, Libri e media… ». Banc : la vraie fonction extraite de vinted.js.
import fs from "node:fs";
import assert from "node:assert/strict";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const vt = fs.readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8");
const bg = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
let lang = "it";
globalThis.document = { documentElement: { getAttribute: (k) => (k === "lang" ? lang : null) } };
const langueDePageOuverte = new Function(extraireFonctionJs(vt, "langueDePageOuverte") + "; return langueDePageOuverte;")();

const servi = { vinted_ids: { catalog_id: 3026, status_id: 2 }, vinted_ids_langues_ouvertes: ["it"] };
lang = "it"; assert.equal(langueDePageOuverte(servi), true, "page italienne, « it » ouvert → pose par identifiant");
lang = "it-IT"; assert.equal(langueDePageOuverte(servi), true, "sous-étiquette régionale lue");
lang = "it"; assert.equal(langueDePageOuverte({ vinted_ids: servi.vinted_ids }), false, "rien servi (serveur d'avant) → chemin d'avant");
lang = "de"; assert.equal(langueDePageOuverte(servi), false, "langue non servie (pays fermé) → chemin d'avant");
lang = "fr"; assert.equal(langueDePageOuverte({ ...servi, vinted_ids_langues_ouvertes: ["fr", "it"] }), false, "jamais une page française");
lang = "en"; assert.equal(langueDePageOuverte({ ...servi, vinted_ids_langues_ouvertes: ["en"] }), false, "jamais une page anglaise");
lang = ""; assert.equal(langueDePageOuverte(servi), false, "page sans lang → chemin d'avant");

// La porte des identifiants accepte l'une OU l'autre autorisation, et rien d'autre ne change.
assert.ok(vt.includes("(fields.vinted_ids_actifs === true || langueDePageOuverte(fields))"), "idsVinted lit les deux autorisations");
// La recréation d'une republication transmet la liste servie.
assert.ok(bg.includes("vinted_ids_langues_ouvertes: pf.vinted_ids_langues_ouvertes.map(String)"), "construireJobRecreation la transmet");

// ── (29/10, lot B 4.1) LA LANGUE DE LA PAGE, LUE SUR SES RACINES ────────────────────────────────────────────────
// La 0.6.149 jugeait la page italienne française (« Sport » s'écrit pareil) et demandait « Vinted ne propose pas
// « Électronique » ». La table de l'extension est une COPIE de RACINES_CATALOGUE (vinted-pays.ts) : identiques.
const { RACINES_CATALOGUE, langueEtrangereDesRacines } = await import(new URL("../supabase/functions/_shared/vinted-pays.ts", import.meta.url).href);
const mTable = vt.match(/const RACINES_CATALOGUE_VINTED = (\{[\s\S]*?\n\});/);
assert.ok(mTable, "RACINES_CATALOGUE_VINTED présente dans vinted.js");
const RACINES_CATALOGUE_VINTED = new Function(`return ${mTable[1]};`)();
assert.deepEqual(RACINES_CATALOGUE_VINTED, JSON.parse(JSON.stringify(RACINES_CATALOGUE)),
  "vinted.js RACINES_CATALOGUE_VINTED = vinted-pays.ts RACINES_CATALOGUE (sinon recopier la table de vinted-pays.ts)");
const langueEtrangereDesRacinesVinted = new Function("RACINES_CATALOGUE_VINTED",
  extraireFonctionJs(vt, "langueEtrangereDesRacinesVinted") + "; return langueEtrangereDesRacinesVinted;")(RACINES_CATALOGUE_VINTED);
const RACINES_IT = ["Accessori", "Donna", "Uomo", "Bambini", "Casa", "Elettronica", "Libri e media", "Hobby e collezionismo", "Sport"];
const RACINES_FR = ["Femmes", "Hommes", "Enfants", "Maison", "Électronique", "Livres et médias", "Loisirs et collections", "Sport", "Articles de créateurs"];
assert.equal(langueEtrangereDesRacinesVinted(RACINES_IT), "it", "2fd83d73 : page italienne (« Sport » commun) → étrangère");
assert.equal(langueEtrangereDesRacinesVinted(RACINES_FR), null, "page française → jamais étrangère");
assert.equal(langueEtrangereDesRacinesVinted(["Women", "Men", "Books & Media"]), "en", "cas Adam (23/08) : anglais");
assert.equal(langueEtrangereDesRacinesVinted(["Jeux", "Consoles", "Accessoires"]), null, "sous-niveau français → rien");
// La même règle que le serveur, langue par langue.
for (const l of Object.keys(RACINES_CATALOGUE)) {
  const liste = Object.values(RACINES_CATALOGUE[l]);
  assert.equal(langueEtrangereDesRacinesVinted(liste), langueEtrangereDesRacines(liste), `${l} : extension = serveur`);
}
assert.equal(langueEtrangereDesRacinesVinted(RACINES_IT.slice(1, 3)), langueEtrangereDesRacines(RACINES_IT.slice(1, 3)), "2 racines : ni l'un ni l'autre");

// Le câblage : la garde « interface non française » lit les racines par langue, à la racine ET plus bas ; la question
// « ne propose pas » ne part qu'après elle ; l'appelant pose par identifiants une page étrangère au rayon connu.
const sc = extraireFonctionJs(vt, "selectCategory");
assert.ok(/let racinesPage = null;/.test(sc) && /if \(i === 0 && racinesPage == null\) racinesPage = await visibleCatalogChoices\(\)/.test(sc), "racines du niveau 0 relues une fois");
assert.ok(/const racinesVues = i === 0 \? options : \(racinesPage \?\? \[\]\);/.test(sc) && /langueEtrangereDesRacinesVinted\(racinesVues\)/.test(sc)
  && /\(i === 0 && options\.length >= 3 && !options\.some\(\(o\) => RACINES_FR_VINTED\.includes\(o\)\)\) \|\| langueRacines/.test(sc), "page étrangère : aucune racine française OU 3 racines d'une autre langue");
assert.ok(sc.indexOf("errLangue.pageEtrangere") > 0 && sc.indexOf("errLangue.pageEtrangere") < sc.indexOf("Vinted ne propose pas « ${levelLabel} »"), "jamais « ne propose pas » avant la garde de langue");
assert.ok(/e\?\.needsUserField\?\.field_key !== "categoryLevelChoice" && !e\?\.pageEtrangere/.test(vt) && /choixEstLaRacineDuRayon\(fields\.categoryLevelChoice, repli\)/.test(vt)
  && /\|\| !choixCompatible && String\(fields\.categoryLevelChoice \?\? ""\)\.trim\(\)\) throw e;/.test(vt),
  "l'appelant : page étrangère → selectCategoryParIds(catalog_id) avant la question (un choix compatible ne s'y oppose pas)");

// Un choix de la personne qui est la racine (toute langue) du rayon connu : compatible ; une autre racine : jamais.
{
  const arbre = { 3026: [2994, 3024, 3026], 1813: [5, 2050, 79, 1813] };
  const choixEstLaRacineDuRayon = new Function("RACINES_CATALOGUE_VINTED", "resoudreCheminIdsCatalogue",
    extraireFonctionJs(vt, "choixEstLaRacineDuRayon") + "; return choixEstLaRacineDuRayon;")(RACINES_CATALOGUE_VINTED, async (id) => arbre[id] ?? null);
  assert.equal(await choixEstLaRacineDuRayon("Elettronica", 3026), true, "« Elettronica » pour 3026 (racine 2994) : compatible");
  assert.equal(await choixEstLaRacineDuRayon("Électronique", 3026), true, "« Électronique » pour 3026 : compatible");
  assert.equal(await choixEstLaRacineDuRayon("Donna", 3026), false, "« Donna » pour 3026 : jamais par-dessus la personne");
  assert.equal(await choixEstLaRacineDuRayon("Jeux", 3026), false, "un sous-niveau : pas une racine → la règle d'avant");
  assert.equal(await choixEstLaRacineDuRayon("Uomo", 9999), false, "rayon absent de l'arbre : jamais");
}

console.log("vinted-langue-page-ouverte : OK");
