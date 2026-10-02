// Autotest de la POSE DU FORMAT DE COLIS dans le corps du POST Vinted —
// `npm run selftest:vinted-colis-envoi`
//
// lohanobert59, montres (catalog_id 97), 01-02/10 : le formulaire de Vinted ne
// rend plus la section « Format du colis » pour ce rayon, son serveur l'exige
// (POST /api/v2/item_upload/items → 400 `package_size`). La « Montre à
// gousset » a été retirée puis jamais recréée. Clé relevée dans le code du
// formulaire de Vinted le 02/10 : `package_size_id`, dans l'objet de l'article
// (à côté de catalog_id, isbn, is_unisex).
//
// Ce que ce test garantit, sur le code LIVRÉ (relu dans background.js) :
//   · le format connu est posé quand la page l'a laissé nul ou absent ;
//   · JAMAIS d'écrasement d'un format posé par la page ;
//   · jamais hors de la création (/item_upload/items), jamais sur un corps qui
//     n'est pas celui d'un article, jamais sans armement, jamais périmé ;
//   · l'objet `item` comme le corps nu ;
//   · et vinted.js arme / désarme bien (canal __fillsellArmeColis).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const bg = lire("chrome-extension/background.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const d = bg.indexOf("        window.__fsColisAPoser = null;");
const f = bg.indexOf("        // Les poses s'enchaînent sur le MÊME corps", d);
if (d < 0 || f < 0) { console.error("✗ bloc de pose du colis introuvable dans background.js"); process.exit(1); }
const bloc = bg.slice(d, f);
const fabrique = new Function("window", "ISBN_ARME_TTL_MS", `${bloc}; return { corpsAvecColis, derniere: () => dernierePoseColis };`);

function sondeArmee(id, ageMs = 0) {
  const ecouteurs = [];
  const win = { addEventListener: (t, fn) => ecouteurs.push(fn), __fsColisAPoser: null };
  const api = fabrique(win, 15 * 60 * 1000);
  if (id !== undefined) {
    for (const fn of ecouteurs) fn({ source: win, data: { __fillsellArmeColis: true, id } });
    if (win.__fsColisAPoser && ageMs) win.__fsColisAPoser.armeeA -= ageMs;
  }
  return api;
}
const URL = "https://www.vinted.fr/api/v2/item_upload/items";
const corps = (item, enveloppe = true) => JSON.stringify(enveloppe ? { item, feedback_id: null, push_up: false } : item);
const article = (extra = {}) => ({ id: null, title: "Montre à gousset", catalog_id: 97, isbn: null, is_unisex: false, price: 45, ...extra });

console.log("\n1. LA POSE");
{
  const s = sondeArmee(1);
  const r = s.corpsAvecColis(URL, corps(article({ package_size_id: null })));
  ok(r && JSON.parse(r).item.package_size_id === 1 && s.derniere() === 1, "page à null → format connu posé (1)");
}
{
  const s = sondeArmee(1);
  const r = s.corpsAvecColis(URL, corps(article()));
  ok(r && JSON.parse(r).item.package_size_id === 1, "clé absente → posée");
}
{
  const s = sondeArmee(3);
  const r = s.corpsAvecColis(URL, corps(article({ package_size_id: null }), false));
  ok(r && JSON.parse(r).package_size_id === 3, "corps nu (sans enveloppe item) → posé");
}
{
  const s = sondeArmee(1);
  const r = s.corpsAvecColis(URL, corps(article({ package_size_id: null, catalog_id: 97, assigned_photos: [{ id: 5 }] })));
  const j = JSON.parse(r);
  ok(j.item.title === "Montre à gousset" && j.item.price === 45 && j.item.assigned_photos[0].id === 5 && j.push_up === false, "aucune autre clé touchée");
}

console.log("\n2. JAMAIS D'ÉCRASEMENT NI DE POSE HORS SUJET");
{
  const s = sondeArmee(1);
  ok(s.corpsAvecColis(URL, corps(article({ package_size_id: 2 }))) === null, "la page a posé 2 → on n'y touche pas");
}
ok(sondeArmee(undefined).corpsAvecColis(URL, corps(article({ package_size_id: null }))) === null, "non armé → rien");
ok(sondeArmee(null).corpsAvecColis(URL, corps(article({ package_size_id: null }))) === null, "désarmé (null) → rien");
ok(sondeArmee(1, 16 * 60 * 1000).corpsAvecColis(URL, corps(article({ package_size_id: null }))) === null, "armement de plus de 15 min → rien");
ok(sondeArmee(1).corpsAvecColis("https://www.vinted.fr/api/v2/items/123/delete", corps(article({ package_size_id: null }))) === null, "autre route (suppression) → rien");
ok(sondeArmee(1).corpsAvecColis("https://www.vinted.fr/api/v2/item_upload/items/99/photos", corps(article({ package_size_id: null }))) === null, "sous-route → rien");
ok(sondeArmee(1).corpsAvecColis(URL, JSON.stringify({ feedback_id: null, autre: true })) === null, "corps sans article (pas de catalog_id) → rien");
ok(sondeArmee(1).corpsAvecColis(URL, "pas du json") === null, "corps illisible → rien, jamais d'exception");
ok(sondeArmee(-4).corpsAvecColis(URL, corps(article({ package_size_id: null }))) === null, "id invalide → jamais armé");

console.log("\n3. LA CHAÎNE COMPLÈTE");
ok(/const avecColis = corpsAvecColis\(url, avant \?\? body\);/.test(bg) && /return avecColis \?\? avant;/.test(bg), "corpsPourDepot enchaîne ISBN → langue → colis");
ok((bg.match(/colisPose = dernierePoseColis/g) ?? []).length === 2, "fetch ET XMLHttpRequest relaient la pose (colisPose)");
ok(/function armerColisPourPost\(id\)/.test(vt) && /__fillsellArmeColis: true/.test(vt), "vinted.js arme par __fillsellArmeColis");
ok(/armerColisPourPost\(null\);/.test(vt), "vinted.js désarme à chaque remplissage");
ok(/armerColisPourPost\(colisIdPourPost\)/.test(vt), "vinted.js arme le format connu du job");
ok(/colisNonPropose: true,/.test(vt) && /colis_injection_prouvee === true/.test(vt), "garde avant retrait : section absente et envoi non prouvé → rien retiré");

console.log("\n4. FORMAT INCONNU HORS MODE : DEMANDÉ AVANT TOUT RETRAIT (décision Nico, 02/10)");
const iQ = vt.indexOf("if (onePass?.item_id && (!colisVoulu || colisFormatNonOffert)) {");
const iSuppr = vt.indexOf("const del = await deleteVintedItemViaApi(String(onePass.item_id)");
ok(iQ > 0 && iSuppr > iQ, "la question est posée AVANT la suppression");
const blocQ = vt.slice(iQ, vt.indexOf("if (onePass?.item_id && colisVoulu && colisSectionAbsente) {"));
ok(blocQ.includes("needsUserField: {") && blocQ.includes('field_key: "package_size_id"') && blocQ.includes("options_completes: true") && blocQ.includes('target: { root: "colis_choisi", key: "libelle" }'), "question fermée sur les formats offerts, réponse dans colis_choisi.libelle");
ok(blocQ.includes("colisNonPropose: true"), "aucun format offert → rien retiré, rien soumis");
ok(!vt.includes('manquants.push("colis (package_size_id absent du payload)")') && vt.includes("libelles.colis_inconnu = true"), "capture : format absent → plus un manquant de copie, demandé au formulaire");
ok(vt.includes('return "defaut_vinted";'), "« Recommandé » de Vinted conservé = nommé (jamais un retrait sur un format qui n'est pas celui d'origine)");
ok(bg.includes('packageSize: String(pf.colis_choisi?.libelle ?? "").trim() || (cap.libelles?.colis ?? null)'), "la réponse de la personne prime à la recréation");
ok(bg.includes("options_completes: true } : {})"), "la liste est transmise fermée à l'app (options_completes)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ format de colis : posé quand la page l'oublie, jamais écrasé, jamais inventé");
