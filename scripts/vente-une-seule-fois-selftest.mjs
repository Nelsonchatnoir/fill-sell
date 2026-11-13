// VERROU — lot « zéro friction » du 14/11/2026, bloc C4 : une commande n'est jamais comptée deux fois.
// Constat (lecture seule, 13/11) : la veille enregistre une vente Vinted relevée SANS fiche (inventaire_id NULL,
// annonce_id = N) ; le relevé du dressing crée ensuite la fiche du même numéro (vinted_item_id = N) directement
// « vendu ». La liste « vendus à enregistrer » (App.jsx) ne regardait que ventes.inventaire_id : la fiche y tombait, et
// « Enregistrer » (VentesTab) écrivait une 2e ligne — 66 paires sur 12 comptes (646,29 €), 283 fiches encore exposées.
// Casse si : la liste reprend une fiche dont le numéro Vinted porte déjà une vente, ou la garde d'écriture
// (ventesExistantes) ne relit plus le numéro. Données synthétiques.
import fs from "node:fs";

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log("  ✓", m); else { ko++; console.log("  ✗", m); } };
const A = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const V = fs.readFileSync(new URL("../src/tabs/VentesTab.jsx", import.meta.url), "utf8");
const R = fs.existsSync(new URL("./reparations/20261114_ventes_vinted_rattachees.sql", import.meta.url))
  ? fs.readFileSync(new URL("./reparations/20261114_ventes_vinted_rattachees.sql", import.meta.url), "utf8") : "";

// 1. La règle, rejouée telle qu'App.jsx l'écrit (extraite du fichier, jamais recopiée).
const debut = A.indexOf("const ventesVintedParAnnonce=useMemo(");
const fin = A.indexOf("[sold,ventesInvIds,ventesVintedParAnnonce]);", debut);
ok(debut > 0 && fin > debut, "App.jsx : la liste « vendus à enregistrer » lit les numéros Vinted des ventes");
const corpsSet = A.slice(debut, A.indexOf(",[sales]);", debut));
const corpsListe = A.slice(A.indexOf("()=>sold.filter(", debut), fin);
const construireSet = (sales) => eval(corpsSet.replace("const ventesVintedParAnnonce=useMemo(()=>", "").replace(/^\s*/, ""));
const liste = (sold, ventesInvIds, ventesVintedParAnnonce) => eval(`(${corpsListe.replace(/,\s*$/, "")})`)();
const sales = [
  { id: 1, plateforme: "vinted", annonce_id: "10699531774", inventaire_id: null },   // relevée par la veille, sans fiche
  { id: 2, plateforme: "Vinted", annonce_id: null, inventaire_id: 77 },               // une vente liée à sa fiche
  { id: 3, plateforme: "ebay", annonce_id: "555", inventaire_id: null },              // une autre plateforme
];
const vv = construireSet(sales);
const inv = new Set(sales.map((s) => s.inventaire_id).filter((v) => v != null).map(String));
const sold = [
  { id: 10, origine: "vinted_sync", vinted_item_id: "10699531774" },  // la fiche née du relevé, même numéro
  { id: 11, origine: "vinted_sync", vinted_item_id: "10700000001" },  // vendue, aucune vente : à enregistrer
  { id: 77, origine: "vinted_sync", vinted_item_id: "10600000000" },  // déjà liée par inventaire_id
  { id: 12, origine: "vinted_sync", vinted_item_id: "555" },          // numéro d'une vente eBay : pas une vente Vinted
];
const r = liste(sold, inv, vv).map((i) => i.id);
ok(!r.includes(10), "la fiche dont le numéro porte déjà une vente Vinted n'est PLUS à enregistrer (plus de 2e ligne)");
ok(r.includes(11), "une fiche vendue sans aucune vente reste à enregistrer");
ok(!r.includes(77), "une fiche déjà liée par inventaire_id reste hors de la liste (inchangé)");
ok(r.includes(12), "le numéro d'une vente d'une AUTRE plateforme ne compte pas");
ok(/annonce_id:v\.annonce_id\?\?null,/.test(A.slice(A.indexOf("function mapSale(v)"), A.indexOf("function mapSale(v)") + 3000)), "les ventes chargées gardent leur numéro d'annonce (mapSale)");

// 2. La garde d'écriture de VentesTab relit aussi le numéro.
ok(/async function ventesExistantes\(ids,numeros=\{\}\)/.test(V) && /\.in\('annonce_id',\[\.\.\.parNumero\.keys\(\)\]\)/.test(V), "VentesTab : ventesExistantes relit les ventes par numéro Vinted");
ok(/ventesExistantes\(\[item\.id\],numerosVinted\(\[item\]\)\)/.test(V) && /ventesExistantes\(unSeul\.map\(it=>it\.id\),numerosVinted\(unSeul\)\)/.test(V), "… aux DEUX endroits qui écrivent une vente importée (une, et en lot)");

// 3. La réparation préparée : rattacher, jamais sur un titre, une seule vente et une seule fiche par numéro.
ok(/vinted_item_id::text = v\.annonce_id::text/.test(R) && /inventaire_id is null/.test(R) && /_backup_1411_ventes_vinted_rattachees/.test(R),
  "réparation : rattachement par NUMÉRO, sauvegarde avant (aucun titre lu)");

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
