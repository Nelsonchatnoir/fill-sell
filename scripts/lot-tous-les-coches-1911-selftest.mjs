// VERROU (19/11/2026 soir, demande de Nico après l'essai réel web) : le lot prend TOUS les articles cochés, même ceux
// que la recherche en cours ne montre plus — « 3 sélectionnés » = 3 ouverts.
// Constat de l'essai (web, compte de Nico) : 0.6.152b coché, puis « 0.6.152 rayon » cherché et coché, puis « lot H —
// T-shirt » cherché et coché : la barre disait « 3 sélectionnés », le lot n'en ouvrait qu'UN (le seul visible).
// Cause : StockTab.ouvrirLot ne cherchait les articles cochés que dans la liste FILTRÉE (stockFiltre), et « Tout »
// retirait de la sélection ce que la vue ne montrait pas.
// Règle : la sélection vit indépendamment des filtres ; ce qui part = les cochés encore sélectionnables (même règle
// articleSelectionnable, sur tout le stock hors brouillons) ; la barre compte exactement ceux-là.
// Rouge sur 10e618d, vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const st = fs.readFileSync(path.join(ROOT, "src/tabs/StockTab.jsx"), "utf8").replace(/\r\n/g, "\n");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };

const iOuvrir = st.indexOf("const ouvrirLot = ");
const ouvrir = iOuvrir > 0 ? st.slice(iOuvrir, st.indexOf("};", iOuvrir) + 2) : "";
ok(iOuvrir > 0, "ouvrirLot existe");
ok(!/stockFiltre/.test(ouvrir) && !/lotSelectionnables\b/.test(ouvrir), "ouvrirLot ne cherche plus les cochés dans la liste filtrée");
ok(/lotSelRetenus/.test(ouvrir), "ouvrirLot ouvre les cochés retenus (tout le stock)");

const iRet = st.indexOf("const lotSelRetenus = useMemo(");
const ret = iRet > 0 ? st.slice(iRet, st.indexOf("]);", iRet) + 3) : "";
ok(iRet > 0 && /stockLotTout/.test(ret) && /articleSelectionnable\(/.test(ret) && /lotSel\b/.test(ret) && !/stockFiltre/.test(ret),
  "les cochés retenus : sur tout le stock hors brouillons, même règle articleSelectionnable");
const iSB = st.indexOf("const stockLotTout = useMemo(");
ok(iSB > 0 && /\(stock \?\? \[\]\)/.test(st.slice(iSB, iSB + 300)) && /idsBrouillons/.test(st.slice(iSB, iSB + 300)),
  "tout le stock (prop stock), brouillons exclus");

const barre = st.slice(st.indexOf("<BarreSelectionLot"), st.indexOf("onContinuer=", st.indexOf("<BarreSelectionLot")));
ok(/n=\{lotSelRetenus\.length\}/.test(barre), "la barre compte exactement ce qui partira (« 3 sélectionnés » = 3 ouverts)");
ok(!/prev\.filter\(id=>lotSelectionnables\.has\(id\)\)/.test(barre), "« Tout » ne retire plus les cochés que la vue ne montre pas");

const iRed = st.indexOf("const lotARediger = useMemo(");
const red = iRed > 0 ? st.slice(iRed, st.indexOf("]);", iRed) + 3) : "";
ok(iRed > 0 && /lotSelRetenus/.test(red) && !/stockFiltre/.test(red), "la prévision « annonces à rédiger » compte tous les cochés");

console.log(echecs ? `✗ ${echecs} échec(s) sur ${total}` : `Tout est vert (${total}).`);
process.exit(echecs ? 1 : 0);
