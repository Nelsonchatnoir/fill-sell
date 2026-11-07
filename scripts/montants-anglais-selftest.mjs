// Autotest — LES MONTANTS EN ANGLAIS AU FORMAT ANGLAIS (07/11/2026, décision de Nico)
//   npm run selftest:montants-anglais
//
// Décision de Nico : « Montants en anglais : format anglais (« €1,268.00 » ou l'usage du store), partout où l'app
// affiche un montant en anglais. » Ce test prouve :
//   1. LA RÈGLE (src/utils/montants.js) — en anglais, symbole devant, virgule des milliers, point décimal ;
//   2. formatCurrency (src/utils/shared.js) — en anglais « €1,268.00 » ; en français, OCTET POUR OCTET la sortie d'avant
//      (fr-FR d'Intl : espace fine insécable U+202F des milliers, espace insécable U+00A0 avant « € ») ; une devise
//      déjà anglaise (USD, GBP) ou d'une autre langue garde sa locale ; sans `lang`, la langue de l'app ;
//   3. LES AUTRES FORMATEURS — messagerie (montantTexte), barres de progression (articleDeJob), prix du Cloud
//      (CLOUD_PRIX_AFFICHE_EN, textes du Cloud, mentions d'abonnement) ;
//   4. LES BRANCHEMENTS — chaque écran qui formate un montant passe `lang` (ou écrit l'anglais à l'anglaise).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${JSON.stringify(d)}` : ""}`); ko++; } };

const FINE = String.fromCharCode(0x202f), INSEC = String.fromCharCode(0xa0);
// Ce que le code produisait AVANT pour le français (Intl fr-FR, comme formatCurrency de HEAD db82a48).
const avantFr = (v, devise = "EUR", dec = 2) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Math.round(v * 100) / 100);

const M = await charger("src/utils/montants.js");
const S = await charger("src/utils/shared.js");

console.log("\n1. LA RÈGLE (utils/montants.js)");
ok(M.LOCALE_MONTANT_ANGLAIS === "en-IE", "locale anglaise des montants : en-IE");
ok(M.localeDuMontant("fr-FR", "en") === "en-IE" && M.localeDuMontant("fr-SN", "en") === "en-IE" && M.localeDuMontant(undefined, "en") === "en-IE", "en anglais, une devise au format français passe en en-IE");
ok(M.localeDuMontant("fr-FR", "fr") === "fr-FR" && M.localeDuMontant("fr-FR", null) === "fr-FR" && M.localeDuMontant(undefined, "fr") === "fr-FR", "en français, la locale de la devise, inchangée");
ok(M.localeDuMontant("en-US", "en") === "en-US" && M.localeDuMontant("en-GB", "en") === "en-GB" && M.localeDuMontant("de-CH", "en") === "de-CH", "une devise déjà anglaise ou d'une autre langue garde sa locale");
ok(M.montantAnglais(1268) === "€1,268" && M.montantAnglais(1268.5) === "€1,268.50" && M.montantAnglais(24.99) === "€24.99" && M.montantAnglais(4) === "€4",
  "montantAnglais : « €1,268 », « €1,268.50 », « €24.99 », « €4 »", [M.montantAnglais(1268), M.montantAnglais(1268.5), M.montantAnglais(24.99), M.montantAnglais(4)]);
ok(M.montantAnglais(1268, { decimales: 2 }) === "€1,268.00" && M.montantAnglais("12.5") === "€12.50" && M.montantAnglais(-3) === "-€3", "décimales imposées, saisie texte, négatif");
ok(M.montantAnglais(null) === "" && M.montantAnglais("") === "" && M.montantAnglais("abc") === "", "valeur illisible : chaîne vide (l'appelant garde son tiret)");
ok(M.montantAnglais(1268, { devise: "USD" }).includes("1,268") && M.montantAnglais(12, { devise: "GBP" }) === "£12", "autre devise : son symbole, toujours à l'anglaise");

console.log("\n2. formatCurrency (utils/shared.js)");
ok(S.formatCurrency(1268, "EUR", null, "en") === "€1,268.00", "EN : « €1,268.00 »", S.formatCurrency(1268, "EUR", null, "en"));
ok(S.formatCurrency(24.99, "EUR", null, "en") === "€24.99" && S.formatCurrency(4, "EUR", 0, "en") === "€4" && S.formatCurrency(-12.5, "EUR", null, "en") === "-€12.50", "EN : « €24.99 », « €4 » (0 décimale), « -€12.50 »");
ok(S.formatCurrency(1268, "EUR", null, "fr") === `1${FINE}268,00${INSEC}€`, "FR : « 1 268,00 € » (U+202F, U+00A0), octet pour octet", S.formatCurrency(1268, "EUR", null, "fr"));
const casFr = [[1268, "EUR", null], [24.99, "EUR", null], [4, "EUR", 0], [-12.5, "EUR", null], [0, "EUR", null], [1234567.891, "EUR", null], [1268, "XOF", null], [1268, "USD", null], [1268, "GBP", null], [1268, "CHF", null], [1268, "SEK", null], [1268, "JPY", null]];
const ecartsFr = casFr.filter(([v, d, dec]) => S.formatCurrency(v, d, dec, "fr") !== avantFr(v, d, dec ?? S.CURRENCY_DECIMALS[d] ?? 2) && !(d !== "EUR" && S.CURRENCY_LOCALES[d] !== "fr-FR"));
ok(ecartsFr.length === 0, `FR : ${casFr.length} cas EUR identiques à la sortie d'avant`, ecartsFr);
const avantLoc = (v, d) => new Intl.NumberFormat(S.CURRENCY_LOCALES[d], { style: "currency", currency: d, minimumFractionDigits: S.CURRENCY_DECIMALS[d], maximumFractionDigits: S.CURRENCY_DECIMALS[d] }).format(v);
ok(["USD", "GBP", "CHF", "SEK", "JPY"].every((d) => S.formatCurrency(1268, d, null, "en") === avantLoc(1268, d) && S.formatCurrency(1268, d, null, "fr") === avantLoc(1268, d)),
  "USD, GBP, CHF, SEK, JPY : leur locale, en anglais comme en français (inchangé)");
ok(S.formatCurrency(1268, "XOF", null, "en").replace(/\s/g, " ") === "F CFA 1,268" && S.formatCurrency(1268, "XOF", null, "fr") === avantLoc(1268, "XOF"), "franc CFA (locale fr-SN) : à l'anglaise en anglais, inchangé en français");
ok(S.formatCurrency(1268) === avantFr(1268), "sans `lang` et sans navigateur (Node) : le français d'avant");
{
  const avant = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => (k === "fs_lang" ? "en" : null) }, navigator: { language: "fr-FR" } };
  const en = S.formatCurrency(1268);
  globalThis.window.localStorage.getItem = (k) => (k === "fs_lang" ? "fr" : null);
  const fr = S.formatCurrency(1268);
  if (avant === undefined) delete globalThis.window; else globalThis.window = avant;
  ok(en === "€1,268.00" && fr === avantFr(1268), "sans `lang` : la langue de l'app (fs_lang) décide — filet pour un appelant oublié", [en, fr]);
}

console.log("\n3. LES AUTRES FORMATEURS");
{
  const V = await charger("src/messagerie/vue.js");
  ok(V.montantTexte(1268, "EUR", "en") === "€1,268.00" && V.montantTexte(1268, "EUR", "fr") === avantFr(1268) && V.montantTexte(1268, "EUR") === avantFr(1268),
    "messagerie (montantTexte) : « €1,268.00 » en anglais, le français d'avant", [V.montantTexte(1268, "EUR", "en"), V.montantTexte(1268, "EUR", "fr")]);
  ok(V.montantTexte(12, "GBP", "en") === "£12.00", "messagerie : une offre en livres, à l'anglaise");
}
{
  const B = await charger("src/utils/barresJobs.js");
  const job = { platform: "vinted", status: "pending", type: "publication", title: "Veste" };
  const en = B.articleDeJob(job, { title: "Veste", sell: 1268.5 }, { lang: "en" }).sousTitre;
  const fr = B.articleDeJob(job, { title: "Veste", sell: 1268.5 }, { lang: "fr" }).sousTitre;
  ok(en.startsWith("€1,268.50") && fr.startsWith(avantFr(1268.5)), "barres de progression (articleDeJob, sans formateur) : « €1,268.50 » / le français d'avant", [en, fr]);
}
{
  const P = await charger("src/utils/palier.js");
  ok(P.CLOUD_PRIX_AFFICHE === "24,99 €" && P.CLOUD_PRIX_AFFICHE_EN === "€24.99", "prix du Cloud : « 24,99 € » (fr, inchangé) et « €24.99 » (en, dérivé)");
  const MA = await charger("src/utils/mentionsAbonnement.js");
  ok(/then €24\.99 a month/.test(MA.mentionsAbonnement({ canal: "ios", lang: "en", cloud: true }).texte) && /puis 24,99 € par mois/.test(MA.mentionsAbonnement({ canal: "ios", lang: "fr", cloud: true }).texte),
    "mentions d'abonnement : « then €24.99 a month » / « puis 24,99 € par mois »");
}

console.log("\n4. LES BRANCHEMENTS (code des écrans)");
const app = lire("src/App.jsx");
ok(/function formatCurrency\(amount,currency='EUR',decimals=null,lang=null\)\{[\s\S]{0,200}localeDuMontant\(CURRENCY_LOCALES\[currency\],lang\?\?langueDeLApp\(\)\)/.test(app), "App.jsx : sa copie de formatCurrency suit la même règle");
ok(/const fmtMoney = n => formatCurrency\(n, currency, null, lang\);/.test(app) && /const fmt = \(amount, dec=null\) => formatCurrency\(amount, currency, dec, lang\);/.test(app), "App.jsx : fmt et fmtMoney passent la langue");
ok(/montantAnglais\(parseFloat\(sellModal\.sellPrice\)\/\(sellModal\.sellQty\|\|1\),\{decimales:2\}\)\} \/ unit/.test(app), "App.jsx : « = €12.50 / unit » dans la vente");
ok(/const fmt = \(amount, dec=null\) => formatCurrency\(amount, currency, dec, lang\);/.test(lire("src/tabs/StockTab.jsx")), "Stock : fmt passe la langue");
ok(/const fmt = \(amount, dec=null\) => formatCurrency\(amount, currency, dec, lang\);/.test(lire("src/tabs/VentesTab.jsx")), "Ventes : fmt passe la langue");
ok(/const fmt = \(amount, dec = null\) => formatCurrency\(amount, currency, dec, lang\);/.test(lire("src/components/voice/VoiceResultCard.jsx")), "commande vocale : fmt passe la langue");
ok(/formatCurrency\(n, currency, null, lang\)/.test(lire("src/ecrans/bureau/outils.js")) && /formatCurrency\(Math\.round\(n\), currency, 0, lang\)/.test(lire("src/ecrans/bureau/outils.js")), "Tableau et Statistiques (formats) : eur et eur0 passent la langue");
{
  const am = lire("src/components/AnalyseMarche.jsx");
  ok((am.match(/formatCurrency\(/g) ?? []).length ===(am.match(/, currency, null, lang\)/g) ?? []).length, "analyse de marché : chaque montant passe la langue");
}
ok(/const fmt = \(v, currency, lang\) => formatCurrency\(v, currency, Number\.isInteger\(v\) \? 0 : null, lang\);/.test(lire("src/components/lens/PrixStrategie.jsx")) && !/fmt\([^)]*, currency\)/.test(lire("src/components/lens/PrixStrategie.jsx")), "Lens (PrixStrategie) : chaque montant passe la langue");
for (const f of ["src/annonces/EcranDoublons.jsx", "src/annonces/EcranRattachement.jsx", "src/stock/SectionAVerifier.jsx"]) {
  const code = lire(f);
  ok(/montantAnglais\(v\)/.test(code) && !/`€\$\{Number\(v\)\}`/.test(code) && !/'en-GB', \{ minimumFractionDigits: 0, maximumFractionDigits: 2 \}\)\} €/.test(code), `${f.split("/").pop()} : le prix lisible anglais à l'anglaise`);
}
{
  const cm = lire("src/components/ConversionModal.jsx");
  ok(/premium: +\{ price: '12,99 €', priceEn: '€12\.99' \}/.test(cm) && /pro: +\{ price: '29,99 €', priceEn: '€29\.99' \}/.test(cm) && /business: \{ price: '59,99 €', priceEn: '€59\.99' \}/.test(cm)
    && !/PLAN_PRICES\.\w+\.price\}/.test(cm), "feuille des formules : « €12.99 », « €29.99 », « €59.99 » en anglais (le français inchangé)");
}
{
  // Aucun texte anglais du Cloud n'écrit le prix à la française.
  const TX = await charger("src/cloud/textes.js");
  const EN = JSON.stringify(TX.textesCloud("en"), (k, v) => (typeof v === "function" ? String(v("Premium", "10:00", "Premium")) : v));
  ok(!/24,99/.test(EN) && /€24\.99/.test(EN), "textes anglais du Cloud : « €24.99 », jamais « 24,99 € »");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n} vérifications — montants en anglais à l'anglaise, français inchangé`);
process.exit(ko ? 1 : 0);
