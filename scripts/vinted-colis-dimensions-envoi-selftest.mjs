// selftest:vinted-colis-dimensions-envoi — VERROU du point 8 de Nico (16/11/2026, extension 0.6.192) : les DIMENSIONS du
// colis Vinted sont demandées (cm, kg) et ENVOYÉES dans les rayons sans grille de formats.
//   npm run selftest:vinted-colis-dimensions-envoi
// Cas : rayons 4733 « Skis alpins » (job 7dd1a5de) et 4031 « Chariots à outils » (job 43b69049) — Vinted refuse tout
// format standard (400 package_size « supérieures aux limites ») et exige parcel_dimensions_height / _width / _length ;
// FillSell ne savait pas les envoyer (docs/enquetes/lot-1611-1-matin/annexe-p3-vinted-dimensions.md).
// Forme RELEVÉE le 16/11 sur le compte Vinted de Nico (brouillon de test à 999 € en 4733, jamais publié, effacé) :
//   référentiel du rayon : parcel_measurements { enabled: true, suggestion: { weight: 3 }, weight_unit: "kg", dimension_unit: "cm" } ;
//   formulaire : #parcel_dimensions_height / _width / _length (cm), #parcel_weight (kg, pré-rempli) ;
//   POST shipping-estimation/external/parcels/details { catalog_id, parcel: { dimensions: { width, length, height, unit: "cm" },
//     weight: { value, unit: "kg" } } } → { package_size: { id: 8… }, max_measurements_exceeded } ;
//   dépôt : `parcel: { dimensions: { height, length, width }, weight }` au PREMIER niveau, item.package_size_id = l'id assigné.
// ROUGE sur le code d'avant : aucune de ces fonctions, `parcel_measurements` jeté, aucune pose.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const VJ = lire("chrome-extension/content-scripts/vinted.js");
const BG = lire("chrome-extension/background.js");
const UJS = lire("supabase/functions/update-job-status/index.ts");
let n = 0, echecs = 0;
const cas = async (nom, f) => {
  try { await f(); n++; console.log(`  ✓ ${nom}`); } catch (e) { echecs++; console.log(`  ✗ ${nom}\n      ${String(e?.message ?? e).split("\n")[0].slice(0, 300)}`); }
};
const fonction = (src, nom) => {
  const i = src.search(new RegExp(`(?:async )?function ${nom}\\(`));
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  let j = src.indexOf("{", src.indexOf(")", i)), prof = 0;
  for (; j < src.length; j++) { if (src[j] === "{") prof++; else if (src[j] === "}") { prof--; if (prof === 0) break; } }
  return src.slice(i, j + 1);
};
const constante = (src, nom) => {
  const i = src.indexOf(`const ${nom} = `);
  assert.ok(i >= 0, `constante ${nom} introuvable`);
  return src.slice(i, src.indexOf("];", i) + 2);
};

console.log("vinted-colis-dimensions-envoi-selftest");
const env = { appels: [], reponse: null };
let V;
await cas("1. vinted.js : les fonctions des dimensions existent", () => {
  V = new Function("env", `
    const VINTED_DOMAINE_PAGE = "vinted.fr";
    const fetchBorne = async (url, init) => { env.appels.push({ url, init, corps: JSON.parse(init.body) }); return env.reponse; };
    const renouvelerJetonVinted = async () => false;
    ${constante(VJ, "CHAMPS_DIMENSIONS_COLIS")}
    ${fonction(VJ, "mesureColis")}
    ${fonction(VJ, "dimensionsColisDuJob")}
    ${fonction(VJ, "mesuresDuReferentielColis")}
    ${fonction(VJ, "questionDimensionsColis")}
    ${fonction(VJ, "formatColisDesDimensions")}
    return { mesureColis, dimensionsColisDuJob, mesuresDuReferentielColis, questionDimensionsColis, formatColisDesDimensions, CHAMPS_DIMENSIONS_COLIS };`)(env);
});
await cas("2. le référentiel garde parcel_measurements (relevé : 4733 exige des mesures, 1810 non)", () => {
  assert.deepEqual(V.mesuresDuReferentielColis({ parcel_measurements: { enabled: true, suggestion: { weight: 3 }, weight_unit: "kg", dimension_unit: "cm" }, package_sizes: [] }),
    { enabled: true, dimension_unit: "cm", weight_unit: "kg", poids_suggere: 3 });
  assert.equal(V.mesuresDuReferentielColis({ parcel_measurements: { enabled: false } }).enabled, false);
  assert.equal(V.mesuresDuReferentielColis({ package_sizes: [] }), null);
  assert.ok(/mesures = mesuresDuReferentielColis\(corps\);/.test(fonction(VJ, "lireReferentielColisVinted")), "lireReferentielColisVinted ne jette plus la clé");
  assert.ok(/\.\.\.\(r\.mesures \? \{ mesures: r\.mesures \} : \{\}\)/.test(fonction(VJ, "resumeReferentielColis")), "gardée dans colis_bilan.referentiel");
});
await cas("3. les mesures de la personne (« 20 cm », « 30,5 », « 3 kg ») ; il en manque une → null ; jamais une valeur hors bornes", () => {
  assert.deepEqual(V.dimensionsColisDuJob({ colis_dimensions: { hauteur_cm: "20 cm", largeur_cm: "30,5", longueur_cm: "100", poids_kg: "3 kg" } }),
    { hauteur: 20, largeur: 30.5, longueur: 100, poids: 3 });
  assert.deepEqual(V.dimensionsColisDuJob({ colis_dimensions: { hauteur_cm: "20", largeur_cm: "30", longueur_cm: "100" } }), { hauteur: 20, largeur: 30, longueur: 100, poids: null });
  assert.equal(V.dimensionsColisDuJob({ colis_dimensions: { hauteur_cm: "20", largeur_cm: "30" } }), null);
  assert.equal(V.dimensionsColisDuJob({}), null);
  assert.equal(V.mesureColis("0"), null); assert.equal(V.mesureColis("2000"), null); assert.equal(V.mesureColis("Grand"), null);
});
let q;
await cas("4. la question : 4 champs en un geste (cm, kg), rangés dans platform_fields.colis_dimensions — jamais une clé que le serveur retire", () => {
  q = V.questionDimensionsColis("Skis alpins", []);
  assert.equal(q.success, false);
  assert.ok(/dimensions du colis pour le rayon « Skis alpins »/.test(q.error) && /Rien n'a été publié/.test(q.error));
  assert.deepEqual(q.needsUserFields.map((c) => `${c.field_key}>${c.target.root}.${c.target.key}`),
    ["colis_hauteur_cm>colis_dimensions.hauteur_cm", "colis_largeur_cm>colis_dimensions.largeur_cm", "colis_longueur_cm>colis_dimensions.longueur_cm", "colis_poids_kg>colis_dimensions.poids_kg"]);
  assert.equal(q.needsUserField.field_key, "colis_hauteur_cm");
  // update-job-status (07/11) retire toute question sur une clé « parcel_dimensions_* » (jamais relue par les postes ≤ 0.6.191).
  assert.ok(/\/\^parcel_dimensions_\/\.test\(String\(c\["field_key"\]/.test(UJS), "règle de retrait du serveur relue");
  for (const c of q.needsUserFields) assert.ok(!/^parcel_dimensions_/.test(c.field_key) && !/^parcel_dimensions_/.test(c.target.key), c.field_key);
  const d = V.questionDimensionsColis("Skis alpins", [], { depasse: "20 × 30 × 170 cm, 3 kg" });
  assert.ok(/dépassent ses limites \(20 × 30 × 170 cm, 3 kg\)/.test(d.error) && d.needsUserFields.length === 4);
});
await cas("5. le format ASSIGNÉ par Vinted : l'appel du formulaire, mot pour mot (relevé) ; « au-delà des limites » dit", async () => {
  env.reponse = { ok: true, status: 200, json: async () => ({ package_size: { id: 8, code: "HEAVY_SMALL", title: "5 kg" }, max_measurements_exceeded: false }) };
  const r = await V.formatColisDesDimensions(4733, { hauteur: 20, largeur: 30, longueur: 100, poids: 3 }, 3);
  assert.deepEqual({ id: r.id, depasse: r.depasse, poids: r.poids }, { id: 8, depasse: false, poids: 3 });
  const a = env.appels[0];
  assert.equal(a.url, "https://api.vinted.fr/shipping-estimation/external/parcels/details");
  assert.equal(a.init.method, "POST"); assert.equal(a.init.credentials, "include");
  assert.deepEqual(a.corps, { catalog_id: 4733, parcel: { dimensions: { width: 30, length: 100, height: 20, unit: "cm" }, weight: { value: 3, unit: "kg" } } });
  env.reponse = { ok: true, status: 200, json: async () => ({ package_size: { id: 15 }, max_measurements_exceeded: true }) };
  assert.equal((await V.formatColisDesDimensions(4733, { hauteur: 20, largeur: 30, longueur: 170, poids: null }, 3)).depasse, true);
  // Le poids de la page (pré-rempli par Vinted) sert quand la personne n'en a pas donné ; aucun poids → aucun appel.
  assert.equal(env.appels[1].corps.parcel.weight.value, 3);
  const avant = env.appels.length;
  assert.equal((await V.formatColisDesDimensions(4733, { hauteur: 1, largeur: 1, longueur: 1, poids: null }, null)).id, null);
  assert.equal(env.appels.length, avant);
});

// ── La sonde du corps (monde de la page) : l'objet `parcel` au premier niveau ──
let sonde;
await cas("6. sonde : le bloc des dimensions existe et suit le format dans la chaîne des poses", () => {
  const i = BG.indexOf("        window.__fsParcelAPoser = null;");
  const j = BG.indexOf("        // ══ POSE DE LA MARQUE DE L'ANNONCE D'ORIGINE PAR SON IDENTIFIANT (17/10) ══");
  assert.ok(i > 0 && j > i, "bloc introuvable");
  const ecouteurs = [];
  const window = { addEventListener: (t, f) => ecouteurs.push(f), __fsParcelAPoser: null };
  const console = { log: () => {} };
  sonde = new Function("window", "console", `const ISBN_ARME_TTL_MS = 15 * 60 * 1000;\n${BG.slice(i, j)}\nreturn { corpsAvecParcel, armer: (parcel) => { for (const f of window.__ecouteurs) f({ source: window, data: { __fillsellArmeParcel: true, parcel } }); } };`)(
    Object.assign(window, { __ecouteurs: ecouteurs }), console);
  assert.ok(/const avecParcel = corpsAvecParcel\(url, \(avecLangue \?\? avecIsbn\) \?\? body\);\s*const avant = avecParcel \?\? avecLangue \?\? avecIsbn;\s*const avecColis = corpsAvecColis\(url, avant \?\? body\);/.test(BG),
    "chaîne des poses : les dimensions, puis le format");
});
await cas("7. sonde : armée → `parcel` posé au premier niveau (forme relevée) ; la page l'a posé → intact ; non armée / autre adresse → rien", () => {
  const URL_ITEMS = "https://www.vinted.fr/api/v2/item_upload/items";
  const corps = JSON.stringify({ item: { catalog_id: 4733, package_size_id: 8, title: "x" }, push_up: false, upload_session_id: "u" });
  assert.equal(sonde.corpsAvecParcel(URL_ITEMS, corps), null, "non armée");
  sonde.armer({ height: 20, width: 30, length: 100, weight: 3 });
  const pose = JSON.parse(sonde.corpsAvecParcel(URL_ITEMS, corps));
  assert.deepEqual(pose.parcel, { dimensions: { height: 20, length: 100, width: 30 }, weight: 3 });
  assert.deepEqual(pose.item, { catalog_id: 4733, package_size_id: 8, title: "x" });
  const parLaPage = JSON.stringify({ item: { catalog_id: 4733 }, parcel: { dimensions: { height: 10, length: 50, width: 20 }, weight: 2 } });
  assert.equal(sonde.corpsAvecParcel(URL_ITEMS, parLaPage), null, "jamais par-dessus la page");
  assert.equal(sonde.corpsAvecParcel("https://www.vinted.fr/api/v2/item_upload/drafts", corps), null, "brouillon : rien");
  assert.equal(sonde.corpsAvecParcel(URL_ITEMS, JSON.stringify({ catalog_id: 4733 })), null, "corps sans item : rien");
  sonde.armer(null);
  assert.equal(sonde.corpsAvecParcel(URL_ITEMS, corps), null, "désarmée");
});

// ── Le remplissage : l'étape des dimensions, avant tout retrait ; plus de question de format dans ces rayons ──
await cas("8. remplissage : l'étape « Dimensions » suit le colis, avant la question de format d'une une-passe et avant le retrait", () => {
  const i = VJ.indexOf('jalonRemplissage("Colis");'), j = VJ.indexOf('jalonRemplissage("Dimensions");');
  const k = VJ.indexOf("if (onePass?.item_id && (!colisVoulu || colisFormatNonOffert)) {");
  const r = VJ.indexOf("onePassDeleted = true;");
  assert.ok(i > 0 && j > i && k > j && r > k, `ordre ${i} ${j} ${k} ${r}`);
  const bloc = VJ.slice(i, j);
  assert.ok(/document\.getElementById\("parcel_dimensions_height"\)/.test(bloc) && /refDims\?\.mesures\?\.enabled === true/.test(bloc));
  assert.ok(/return questionDimensionsColis\(feuille, warnings\);/.test(bloc) && /return questionDimensionsColis\(feuille, warnings, \{ depasse: mesuresTexte \}\);/.test(bloc));
  assert.ok(/if \(format\.id\) armerColisPourPost\(format\.id\);/.test(bloc) && /armerParcelPourPost\(voulues, format\.poids \?\? null\);/.test(bloc));
  // Les mesures posées, le rayon n'a ni « section absente » ni « format non offert » (aucune question ni arrêt de format) ;
  // la relecture d'avant le dépôt (grille, « formulaire raté ») est sautée dans ces rayons sans grille.
  assert.ok(/colisSectionAbsente = false;\n      colisFormatNonOffert = false;/.test(bloc));
  assert.ok(/if \(!dimensionsColis\) \{\n    const publicationNeuve = !recreation && !onePass;/.test(VJ));
});

// ── L'app : la saisie avec l'unité, relue en nombre par l'extension ──
await cas("9. app : « cm » et « kg » à côté des quatre cases ; « 20 » part en « 20 cm », que l'extension relit 20", async () => {
  const { uniteDuChamp, valeurAvecUnite } = await import(pathToFileURL(path.join(RACINE, "src/utils/champsDimension.js")).href);
  assert.deepEqual(V.CHAMPS_DIMENSIONS_COLIS.map((c) => uniteDuChamp("vinted", c.field_key, c.field_label, [])), ["cm", "cm", "cm", "kg"]);
  assert.equal(uniteDuChamp("vinted", "size", "Taille", []), null);
  assert.equal(V.mesureColis(valeurAvecUnite("20", "cm")), 20);
  assert.equal(V.mesureColis(valeurAvecUnite("2,5", "kg")), 2.5);
});

console.log(echecs ? `\nROUGE : ${echecs} échec(s), ${n} vert(s)` : `\nVERT : ${n} contrôles`);
process.exit(echecs ? 1 : 0);
