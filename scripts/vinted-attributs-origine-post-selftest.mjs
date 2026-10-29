// Autotest des ATTRIBUTS DE L'ANNONCE D'ORIGINE posés par leurs identifiants dans le corps du POST Vinted —
// `npm run selftest:vinted-attributs-origine-post`
//
// Thibault dca41766 (« Samsung player start 2 », rayon 3661) : la capture 18142 porte
// item_attributes internal_memory_capacity [1292] et sim_lock [1313]. Le 25/10 (anciens menus), la
// recréation relisait leurs libellés sur le formulaire et seul « model » était refusé ; le 29/10 (menus
// « bloom », 0.6.152), la relecture ne rend plus rien et le POST part sans « Espace de stockage » (400).
//
// Ce que ce test garantit, sur le code LIVRÉ (relu dans background.js / vinted.js) :
//   · les ids capturés sont posés pour les codes que la page a laissés vides ;
//   · JAMAIS d'écrasement d'un code posé par la page ;
//   · jamais hors du rayon de la capture, hors création, sans armement, ni périmé ;
//   · la chaîne ISBN → langue → colis → marque est inchangée, les attributs la ferment ;
//   · vinted.js arme en recréation / une-passe seulement, désarme à chaque remplissage, n'envoie jamais
//     un code à canal dédié, ne pose plus « Non » d'office au simlockage d'une recréation qui porte le sien,
//     et ouvre la liste d'un attribut par openDropdown (jamais click() seul).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const bg = lire("chrome-extension/background.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const d = bg.indexOf("        window.__fsAttributsOrigineAPoser = null;");
const f = bg.indexOf("        // Les poses s'enchaînent sur le MÊME corps", d);
if (d < 0 || f < 0) { console.error("✗ bloc de pose des attributs d'origine introuvable dans background.js"); process.exit(1); }
const bloc = bg.slice(d, f);
const fabrique = new Function("window", "ISBN_ARME_TTL_MS", `${bloc}; return { corpsAvecAttributsOrigine, derniere: () => dernierePoseAttributs };`);

function sonde(armement, ageMs = 0) {
  const ecouteurs = [];
  const win = { addEventListener: (t, fn) => ecouteurs.push(fn), __fsAttributsOrigineAPoser: null };
  const api = fabrique(win, 15 * 60 * 1000);
  if (armement !== undefined) {
    for (const fn of ecouteurs) fn({ source: win, data: { __fillsellArmeAttributsOrigine: true, ...armement } });
    if (win.__fsAttributsOrigineAPoser && ageMs) win.__fsAttributsOrigineAPoser.armeeA -= ageMs;
  }
  return api;
}
const URL = "https://www.vinted.fr/api/v2/item_upload/items";
const corps = (item, enveloppe = true) => JSON.stringify(enveloppe ? { item, feedback_id: null, push_up: false } : item);
const telephone = (extra = {}) => ({ id: null, title: "Samsung player start 2", catalog_id: 3661, isbn: null, price: "20", package_size_id: 1, ...extra });
const CAPTURE = { attrs: [{ code: "internal_memory_capacity", ids: [1292] }, { code: "sim_lock", ids: [1313] }], catalogId: 3661 };

console.log("\n1. LA POSE (cas dca41766)");
{
  const s = sonde(CAPTURE);
  const r = s.corpsAvecAttributsOrigine(URL, corps(telephone({ item_attributes: [{ code: "condition", ids: [3] }] })));
  const ia = r && JSON.parse(r).item.item_attributes;
  ok(Array.isArray(ia) && ia.some((a) => a.code === "internal_memory_capacity" && a.ids[0] === 1292)
    && ia.some((a) => a.code === "sim_lock" && a.ids[0] === 1313) && ia.some((a) => a.code === "condition" && a.ids[0] === 3),
    "stockage 1292 et simlock 1313 posés, l'état posé par la page gardé", JSON.stringify(ia));
  ok(s.derniere() === "internal_memory_capacity=1292,sim_lock=1313", "la pose est relevée (attributsPoses)", String(s.derniere()));
}
{
  const s = sonde(CAPTURE);
  const r = s.corpsAvecAttributsOrigine(URL, corps(telephone()));
  ok(r && JSON.parse(r).item.item_attributes.length === 2, "item_attributes absent → créé avec les ids capturés");
}
{
  const s = sonde(CAPTURE);
  const r = s.corpsAvecAttributsOrigine(URL, corps(telephone({ item_attributes: [{ code: "internal_memory_capacity", ids: [] }] }), false));
  const ia = r && JSON.parse(r).item_attributes;
  ok(Array.isArray(ia) && ia.filter((a) => a.code === "internal_memory_capacity").length === 1 && ia.find((a) => a.code === "internal_memory_capacity").ids[0] === 1292,
    "corps nu, entrée vide de la page → remplacée par l'id capturé, jamais en double");
}
{
  const s = sonde(CAPTURE);
  const j = JSON.parse(s.corpsAvecAttributsOrigine(URL, corps(telephone({ assigned_photos: [{ id: 5 }] }))));
  ok(j.item.title === "Samsung player start 2" && j.item.price === "20" && j.item.package_size_id === 1 && j.item.assigned_photos[0].id === 5 && j.push_up === false,
    "aucune autre clé touchée");
}

console.log("\n2. JAMAIS D'ÉCRASEMENT NI DE POSE HORS SUJET");
{
  const s = sonde(CAPTURE);
  const r = s.corpsAvecAttributsOrigine(URL, corps(telephone({ item_attributes: [{ code: "internal_memory_capacity", ids: [1300] }, { code: "sim_lock", ids: [1314] }] })));
  ok(r === null, "la page a posé stockage et simlock → on n'y touche pas");
}
{
  const s = sonde(CAPTURE);
  const r = s.corpsAvecAttributsOrigine(URL, corps(telephone({ item_attributes: [{ code: "sim_lock", ids: [1314] }] })));
  const ia = r && JSON.parse(r).item.item_attributes;
  ok(ia && ia.find((a) => a.code === "sim_lock").ids[0] === 1314 && ia.find((a) => a.code === "internal_memory_capacity").ids[0] === 1292,
    "seul le code laissé vide est posé (simlock de la page gardé)");
}
ok(sonde(CAPTURE).corpsAvecAttributsOrigine(URL, corps(telephone({ catalog_id: 3662 }))) === null, "autre rayon que celui de la capture → rien");
ok(sonde(CAPTURE).corpsAvecAttributsOrigine(URL, corps({ title: "x" })) === null, "corps sans catalog_id (pas un article) → rien");
ok(sonde(CAPTURE).corpsAvecAttributsOrigine(`${URL}/10349761909/delete`, corps(telephone())) === null, "hors création → rien");
ok(sonde(undefined).corpsAvecAttributsOrigine(URL, corps(telephone())) === null, "non armé → rien");
ok(sonde({ attrs: null, catalogId: null }).corpsAvecAttributsOrigine(URL, corps(telephone())) === null, "désarmé (null) → rien");
ok(sonde({ ...CAPTURE, catalogId: null }).corpsAvecAttributsOrigine(URL, corps(telephone())) === null, "armé sans rayon → rien");
ok(sonde(CAPTURE, 16 * 60 * 1000).corpsAvecAttributsOrigine(URL, corps(telephone())) === null, "armement de plus de 15 min → rien");
ok(sonde({ attrs: [{ code: "x\"]}", ids: [1] }, { code: "sim_lock", ids: ["a", -2] }], catalogId: 3661 }).corpsAvecAttributsOrigine(URL, corps(telephone())) === null,
  "code ou ids illisibles → écartés à l'armement");
ok(sonde(CAPTURE).corpsAvecAttributsOrigine(URL, "<html>") === null && sonde(CAPTURE).corpsAvecAttributsOrigine(URL, "{pas du json") === null, "corps illisible → rien, jamais d'exception");

console.log("\n3. LA CHAÎNE ET LES RELAIS");
ok(/const corpsPourDepotSaufAttributs = \(url, body\) => \{[\s\S]*?return avecMarque \?\? avantMarque;\s*\};\s*\/\/ \(29\/10\)[^\n]*\n\s*const corpsPourDepot = \(url, body\) => \{\s*const avant = corpsPourDepotSaufAttributs\(url, body\);\s*const avecAttributs = corpsAvecAttributsOrigine\(url, avant \?\? body\);\s*return avecAttributs \?\? avant;/.test(bg),
  "corpsPourDepot : ISBN → langue → colis → marque inchangés, les attributs d'origine ferment la chaîne");
ok((bg.match(/attributsPoses = dernierePoseAttributs/g) ?? []).length === 2, "fetch ET XMLHttpRequest relèvent la pose");
ok((bg.match(/^\s+attributsPoses,$/gm) ?? []).length === 2, "fetch ET XMLHttpRequest relaient attributsPoses");

console.log("\n3 bis. LE MODÈLE D'ORIGINE (forme du POST relevée en réel le 29/10 : annonce de test 10582889236, compte de Nico)");
{
  const s = sonde({ ...CAPTURE, modele: { collection_id: 2 } });
  const j = JSON.parse(s.corpsAvecAttributsOrigine(URL, corps(telephone({ model: null }))));
  ok(j.item.model?.metadata?.collection_id === 2 && Object.keys(j.item.model).length === 1, "page sans modèle → model { metadata: { collection_id: 2 } } (Autre), comme l'annonce d'origine", JSON.stringify(j.item.model));
  ok(/model=2/.test(String(s.derniere())), "la pose du modèle est relevée", String(s.derniere()));
}
{
  const s = sonde({ ...CAPTURE, modele: { collection_id: 2 } });
  const r = s.corpsAvecAttributsOrigine(URL, corps(telephone({ model: { metadata: { collection_id: 4610 } }, item_attributes: [{ code: "internal_memory_capacity", ids: [1292] }, { code: "sim_lock", ids: [1313] }] })));
  ok(r === null, "un modèle posé par le formulaire n'est JAMAIS remplacé (et rien d'autre à poser → corps intact)");
}
{
  const s = sonde({ attrs: [], modele: { collection_id: 8576 }, catalogId: 3661 });
  const j = JSON.parse(s.corpsAvecAttributsOrigine(URL, corps(telephone())));
  ok(j.item.model?.metadata?.collection_id === 8576, "modèle « known » seul (aucun attribut à poser) → posé aussi");
  const s2 = sonde({ attrs: [], modele: { collection_id: 8576 }, catalogId: 3661 });
  ok(s2.corpsAvecAttributsOrigine(URL, corps(telephone({ catalog_id: 1868 }))) === null, "autre rayon que celui de la capture → rien");
}
ok(/modeleCapture: \{ collection_id: Number\(natifCap\.model\.metadata\.collection_id\)/.test(bg), "background : le modèle capturé voyage dans platform_fields.modeleCapture");

console.log("\n4. VINTED.JS");
ok(/function armerAttributsOriginePourPost\(attrs, catalogId, modele = null\)/.test(vt) && /__fillsellArmeAttributsOrigine: true/.test(vt), "arme par __fillsellArmeAttributsOrigine");
ok(/const ATTRIBUTS_ORIGINE_CANAUX_DEDIES = new Set\(\["condition", "size", "material", "language_book", "color", "isbn", "brand"\]\);/.test(vt),
  "les codes à canal dédié ne passent jamais par ce canal");
ok(/armerMarquePourPost\(null\);\n\s*\/\/ \(29\/10\)[^\n]*\n\s*armerAttributsOriginePourPost\(null\);/.test(vt), "désarme à chaque remplissage");
ok(/if \(recreation \|\| job\.platform_fields\?\.republish_delete_then_submit\) \{\s*armerAttributsOriginePourPost\(job\.platform_fields\?\.itemAttributesCaptures, job\.platform_fields\?\.vinted_ids\?\.catalog_id, job\.platform_fields\?\.modeleCapture \?\? null\);/.test(vt),
  "arme en recréation et en une-passe seulement, avec le rayon de la capture");
ok(/const simlockDeLaCapture = recreation && fields\.simlock == null/.test(vt)
  && /if \(!simlockDeLaCapture && document\.querySelector\('#sim_lock/.test(vt),
  "recréation : plus de « Non » d'office au simlockage quand l'annonce d'origine porte le sien");
{
  const i = vt.indexOf("async function libellesParOuvertureDeLaListe(code, ids) {");
  const corpsFn = i >= 0 ? vt.slice(i, vt.indexOf("\n}\n", i)) : "";
  ok(/try \{ await openDropdown\(sel\); \} catch \{ return \[\]; \}/.test(corpsFn) && !/champ\.click\(\)/.test(corpsFn),
    "la liste d'un attribut s'ouvre par openDropdown (vrai clic), jamais click() seul");
}
ok(/if \(recreation\) diagnosticsRecreation\.push\(`modèle « \$\{fields\.modele\} » : \$\{modeleStatut\}`\);/.test(vt), "l'issue du modèle part dans le diagnostic persisté");
ok(/const \{ resolus, nonResolus \} = await resoudreAttributsCaptures\(dedies, dejaDedies\);\n\s*if \(recreation\) diagnosticsRecreation\.push\(/.test(vt), "l'issue de la relecture des attributs part dans le diagnostic persisté");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ attributs de l'annonce d'origine au POST : tout est vert");
