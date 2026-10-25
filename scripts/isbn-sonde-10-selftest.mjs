// Autotest de la POSE DE L'ISBN DANS LE CORPS DU POST Vinted, 10 caractères compris —
// `npm run selftest:isbn-sonde-10`
//
// (25/10, décision de Nico : « la republication reprend l'ISBN de l'annonce
// d'origine TEL QUEL et part ».) Rég (6f1b1f70) et Vincent A. (×29) : l'annonce
// d'origine porte « 0000000000 » (10 zéros), acceptée par Vinted à sa création.
// Jusqu'à la 0.6.142, la sonde du monde MAIN n'armait que /^\d{13}$/ : avec 10
// caractères elle restait DÉSARMÉE, et le POST portait ce que la page sérialise —
// or la page vide l'ISBN (relevé du 14-15/09 : « isbn POSÉ dans le corps par la
// sonde (0000000000000) — la page l'avait laissé vide ») → "isbn": null APRÈS le
// retrait, annonce perdue (cas du 27/09).
//
// Ce que ce test garantit, sur le code LIVRÉ (relu dans background.js et vinted.js) :
//   · 10 caractères (9 chiffres + chiffre ou X) ET 13 chiffres armés, posés TELS
//     QUELS (X en majuscule) quand la page a laissé "isbn" nul, vide ou absent ;
//   · JAMAIS par-dessus une valeur que la page a gardée ;
//   · « 00 », 12 chiffres, null : désarmé ; jamais hors de /item_upload/items,
//     jamais périmé (15 min) ;
//   · le relevé du corps (isbnEnvoyeOf) lit une valeur de 10 caractères ;
//   · vinted.js : l'une-passe s'arrête AVANT tout retrait sur une autre forme.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const bg = lire("chrome-extension/background.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const d = bg.indexOf("        window.__fsIsbnAPoser = null;");
const f = bg.indexOf("        // ══ POSE DE LA LANGUE DU LIVRE DANS LE CORPS DU POST", d);
if (d < 0 || f < 0) { console.error("✗ bloc de pose de l'ISBN introuvable dans background.js"); process.exit(1); }
const bloc = bg.slice(d, f);
const fabrique = new Function("window", `${bloc}; return { corpsAvecIsbn, derniere: () => dernierePoseIsbn };`);

function sondeArmee(isbn, ageMs = 0) {
  const ecouteurs = [];
  const win = { addEventListener: (t, fn) => ecouteurs.push(fn), __fsIsbnAPoser: null };
  const api = fabrique(win);
  if (isbn !== undefined) {
    for (const fn of ecouteurs) fn({ source: win, data: { __fillsellArmeIsbn: true, isbn } });
    if (win.__fsIsbnAPoser && ageMs) win.__fsIsbnAPoser.armeeA -= ageMs;
  }
  // Un message d'une autre origine (une page) n'arme jamais rien.
  for (const fn of ecouteurs) fn({ source: {}, data: { __fillsellArmeIsbn: true, isbn: "9999999999" } });
  return { ...api, win };
}
const URL = "https://www.vinted.fr/api/v2/item_upload/items";
const corps = (item, enveloppe = true) => JSON.stringify(enveloppe ? { item, feedback_id: null, push_up: false } : item);
const livre = (extra = {}) => ({ id: null, title: "Moby Dick", catalog_id: 2319, isbn: null, is_unisex: false, price: 12, ...extra });

console.log("\n1. 10 CARACTÈRES : POSÉS TELS QUELS (« 0000000000 », Rég et Vincent A.)");
{
  const s = sondeArmee("0000000000");
  const r = s.corpsAvecIsbn(URL, corps(livre()));
  ok(r && JSON.parse(r).item.isbn === "0000000000" && s.derniere() === "0000000000", 'page à "isbn": null → « 0000000000 » posé tel quel');
}
{
  const s = sondeArmee("123456789x");
  const r = s.corpsAvecIsbn(URL, corps(livre()));
  ok(r && JSON.parse(r).item.isbn === "123456789X", "X final en majuscule");
}
{
  const s = sondeArmee("000-000-0000");
  const r = s.corpsAvecIsbn(URL, corps(livre({ isbn: "" })));
  ok(r && JSON.parse(r).item.isbn === "0000000000", "tirets retirés ; page à \"\" → posé");
}
{
  const s = sondeArmee("0000000000");
  const sans = livre(); delete sans.isbn;
  const r = s.corpsAvecIsbn(URL, corps(sans));
  ok(r && JSON.parse(r).item.isbn === "0000000000", "clé absente → posée");
}
{
  const s = sondeArmee("0000000000");
  const r = s.corpsAvecIsbn(URL, corps(livre(), false));
  ok(r && JSON.parse(r).isbn === "0000000000", "corps nu (sans enveloppe item) → posé");
}
{
  const s = sondeArmee("0000000000");
  const j = JSON.parse(s.corpsAvecIsbn(URL, corps(livre({ assigned_photos: [{ id: 5 }] }))));
  ok(j.item.title === "Moby Dick" && j.item.price === 12 && j.item.catalog_id === 2319 && j.item.assigned_photos[0].id === 5 && j.push_up === false,
    "aucune autre clé touchée");
}

console.log("\n2. 13 CHIFFRES : INCHANGÉ (0.6.70)");
{
  const s = sondeArmee("0000000000000");
  const r = s.corpsAvecIsbn(URL, corps(livre()));
  ok(r && JSON.parse(r).item.isbn === "0000000000000", "« 0000000000000 » posé tel quel");
  const v = sondeArmee("9782811600174");
  ok(JSON.parse(v.corpsAvecIsbn(URL, corps(livre()))).item.isbn === "9782811600174", "un ISBN-13 valide aussi");
}

console.log("\n3. JAMAIS PAR-DESSUS LA PAGE, JAMAIS HORS SUJET");
ok(sondeArmee("0000000000").corpsAvecIsbn(URL, corps(livre({ isbn: "9782811600174" }))) === null, "la page a gardé un ISBN → on n'y touche pas");
ok(sondeArmee("0000000000").corpsAvecIsbn(URL, corps(livre({ isbn: "0000000000" }))) === null, "la page a gardé « 0000000000 » → on n'y touche pas");
ok(sondeArmee("00").corpsAvecIsbn(URL, corps(livre())) === null && sondeArmee("00").win.__fsIsbnAPoser === null, "« 00 » → désarmé, rien posé");
ok(sondeArmee("000000000000").corpsAvecIsbn(URL, corps(livre())) === null, "12 chiffres → désarmé");
ok(sondeArmee("00000000000000").corpsAvecIsbn(URL, corps(livre())) === null, "14 chiffres → désarmé");
ok(sondeArmee("12345678XX").corpsAvecIsbn(URL, corps(livre())) === null, "X ailleurs qu'en dernier → désarmé");
ok(sondeArmee(null).corpsAvecIsbn(URL, corps(livre())) === null, "désarmé (null) → rien");
ok(sondeArmee(undefined).corpsAvecIsbn(URL, corps(livre())) === null, "jamais armé → rien (un message d'une autre source n'arme pas)");
ok(sondeArmee("0000000000", 16 * 60 * 1000).corpsAvecIsbn(URL, corps(livre())) === null, "armement de plus de 15 min → rien");
ok(sondeArmee("0000000000").corpsAvecIsbn("https://www.vinted.fr/api/v2/items/123/delete", corps(livre())) === null, "autre route (suppression) → rien");
ok(sondeArmee("0000000000").corpsAvecIsbn(URL, "pas du json") === null, "corps illisible → rien, jamais d'exception");

console.log("\n4. LE RELEVÉ DU CORPS LIT 10 CARACTÈRES");
{
  const i = bg.indexOf("        const isbnEnvoyeOf = (url, body) => {");
  const j = bg.indexOf("        // ⚠️ Numéro d'annonce cherché sur le corps COMPLET", i);
  ok(i > 0 && j > i, "isbnEnvoyeOf trouvé");
  const isbnEnvoyeOf = new Function(`${bg.slice(i, j)}; return isbnEnvoyeOf;`)();
  ok(isbnEnvoyeOf(URL, corps(livre({ isbn: "0000000000" }))) === "0000000000", "« \"isbn\":\"0000000000\" » relevé");
  ok(/forme non reconnue/.test(isbnEnvoyeOf(URL, corps(livre()))), '"isbn": null → « forme non reconnue » (le diagnostic le dit)');
}

console.log("\n5. vinted.js : ARME LA VALEUR D'ORIGINE, S'ARRÊTE AVANT TOUT RETRAIT SUR UNE AUTRE FORME");
ok(/function armerIsbnPourPost\(isbn\)/.test(vt) && /__fillsellArmeIsbn: true/.test(vt), "vinted.js arme par __fillsellArmeIsbn");
ok(/armerIsbnPourPost\(null\);/.test(vt) && /armerIsbnPourPost\(valeur\);/.test(vt), "désarmée à chaque remplissage, armée avec la valeur posée");
ok(/const valeur = norme\.ok \? norme\.isbn13 : \(isbnDeCapture && brutCapture \? brutCapture : null\);/.test(vt), "la valeur d'origine non standard part telle quelle (isbn_source « capture »)");
{
  const iGarde = vt.indexOf("if (telQuel && onePass?.item_id && !recreation && !/^(?:\\d{13}|\\d{9}[\\dX])$/i.test(valeur)) {");
  const iArme = vt.indexOf("armerIsbnPourPost(valeur);");
  const iSuppr = vt.indexOf("const del = await deleteVintedItemViaApi(String(onePass.item_id)");
  ok(iGarde > 0 && iArme > iGarde && iSuppr > iGarde, "une-passe : la forme est vérifiée AVANT la pose et AVANT la suppression");
  const garde = vt.slice(iGarde, iGarde + 600);
  ok(/throw new Error\(/.test(garde) && /Rien n'a été retiré, rien n'a été soumis\./.test(garde), "autre forme → erreur, rien retiré, rien soumis");
  ok(vt.indexOf("const el = await waitForElement('#isbn, [data-testid=\"isbn--input\"]', ISBN_ATTENTE_MS)") < iGarde,
    "seulement quand Vinted demande l'ISBN dans ce rayon (champ présent) — un champ absent saute toujours l'étape");
  const forme = new RegExp("^(?:\\d{13}|\\d{9}[\\dX])$", "i");
  ok(forme.test("0000000000") && forme.test("0000000000000") && forme.test("123456789x") && !forme.test("00") && !forme.test("000000000000"),
    "même forme que la sonde (10 ou 13)");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ sonde ISBN : 10 et 13 caractères posés tels quels, jamais par-dessus la page, une autre forme arrêtée avant tout retrait");
