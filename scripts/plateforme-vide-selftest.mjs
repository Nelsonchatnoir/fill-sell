// VERROU (16/11/2026, point 6 de Nico) : UNE PLATEFORME RELIÉE VIDE DIT LA VÉRITÉ (« Synchroniser relit tes annonces, il
// ne les copie pas ») ET PROPOSE « PUBLIER TON STOCK SUR <PLATEFORME> », QUI OUVRE LE LOT AVEC CETTE PLATEFORME COCHÉE.
//
//     npm run selftest:plateforme-vide
//
// Cas fondateur : lizzaa (d5531b8e), 214 articles en ligne sur Vinted, 55 sur eBay, un Beebs neuf relié le 16/11 :
// « Synchroniser » appuyé pour y copier son stock, relevés Beebs « done » à 0 annonce (12:36 et 12:56, « [vide] aucune
// annonce en ligne sur cette plateforme »), Leboncoin aussi à 0 — et rien ne disait que Synchroniser LIT sans copier.
//   A. La règle (stock/plateformeVide.js) : vide = relevé fait à 0, rien de connu dessus (annonces, articles occupés),
//      stock en ligne ailleurs ; jamais un relevé vide SIGNALÉ, incomplet, à connecter, ni une plateforme occupée.
//   B. Les mots : la phrase de Nico et le bouton, FR + EN (annonces/textes.js, aucune phrase dans un composant).
//   C. Le bloc de synchro les montre à la fin de « Synchroniser » ET au repos, sous les pastilles des plateformes.
//   D. Le geste ouvre la sélection « Publier » (articles pas encore sur X, la règle du lot), puis le lot avec X cochée ;
//      aucune prop neuve au Stock (fiche rapide).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); } };

let V = null;
try { V = await charger("src/stock/plateformeVide.js"); } catch { /* absent avant le correctif */ }
const { plateformesLibres, choixInitial, resumeParPlateforme } = await charger("src/publication/lot/regles.js");

// Le Stock de lizzaa, en petit : 214 en ligne sur Vinted (dont 55 aussi sur eBay), 1 sans annonce, 1 vendu.
const PLATEFORMES = ["vinted", "leboncoin", "beebs", "ebay"];
const stock = [];
const index = new Map();
for (let k = 0; k < 216; k++) {
  const id = 1000 + k;
  const enLigne = k < 214 ? (k < 55 ? ["vinted", "ebay"] : ["vinted"]) : [];
  stock.push({ id, statut: k === 215 ? "vendu" : "en_vente", photos: ["https://x/p.jpg"] });
  index.set(String(id), { enLigne, occupees: enLigne });
}
const aPublier = stock.filter((i) => i.statut !== "vendu");
const tuile = (p, phase, nV, vide = false) => ({ p, nom: { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay" }[p], e: { phase, n: nV }, vide });
const TUILES = [tuile("vinted", "fait", 214), tuile("leboncoin", "fait", 0), tuile("beebs", "fait", 0), tuile("ebay", "fait", 55)];
const COMPTE = { ebay: { total: 55 } };

console.log("A. La règle");
ok(!!V, "src/stock/plateformeVide.js existe");
if (V) {
  const res = V.resumeStockParPlateforme({ stock, aPublier, index, plateformes: PLATEFORMES });
  ok(res.occupees.vinted === 214 && res.occupees.ebay === 55 && res.occupees.beebs === 0 && res.enLigneAilleurs.beebs === 214 && res.aPublierSur.beebs === 215,
    "le résumé du Stock : occupés, en ligne ailleurs, pas encore sur Beebs", res);
  const vides = V.plateformesVidesAProposer({ tuiles: TUILES, compte: COMPTE, stock: res });
  ok(JSON.stringify(vides.map((v) => v.p)) === '["leboncoin","beebs"]' && vides.every((v) => v.nAPublier === 215),
    "LE CAS : Beebs (et Leboncoin) relevés à 0 → proposés, 215 articles à publier ; Vinted et eBay jamais", vides);
  ok(V.plateformesVidesAProposer({ tuiles: [tuile("beebs", "fait", 0, true)], compte: {}, stock: res }).length === 0,
    "un relevé vide SIGNALÉ (le compte avait des annonces : lecture ratée possible) → jamais proposé (pas de doublons)");
  ok(["incomplet", "absente", "en_cours", "jamais", "echec"].every((ph) => V.plateformesVidesAProposer({ tuiles: [tuile("beebs", ph, 0)], compte: {}, stock: res }).length === 0),
    "un relevé incomplet, à connecter, en cours, jamais fait ou en échec → jamais « vide »");
  ok(V.plateformesVidesAProposer({ tuiles: [tuile("beebs", "fait", 0)], compte: { beebs: { total: 3 } }, stock: res }).length === 0,
    "des annonces Beebs connues du serveur → pas vide");
  const res1 = V.resumeStockParPlateforme({ stock, aPublier, index: new Map([...index, ["1214", { enLigne: [], occupees: ["beebs"] }]]), plateformes: PLATEFORMES });
  ok(V.plateformesVidesAProposer({ tuiles: [tuile("beebs", "fait", 0)], compte: {}, stock: res1 }).length === 0, "un article en file / en attente sur Beebs → pas vide");
  const resRien = V.resumeStockParPlateforme({ stock, aPublier, index: new Map(stock.map((i) => [String(i.id), { enLigne: [], occupees: [] }])), plateformes: PLATEFORMES });
  ok(V.plateformesVidesAProposer({ tuiles: [tuile("beebs", "fait", 0)], compte: {}, stock: resRien }).length === 0, "un Stock en ligne nulle part → rien à proposer (pas de « vide » sans stock ailleurs)");
  ok(V.plateformesVidesAProposer({ tuiles: TUILES, compte: COMPTE, stock: null }).length === 0 && V.plateformesVidesAProposer({}).length === 0, "résumé absent (bloc caché) : rien");
  const jobs = { 1000: [{ platform: "beebs", action: "publish", status: "published", listing_url: "https://www.beebs.app/x", created_at: "2026-11-16T10:00:00Z" }] };
  const ids = V.idsAPublierSur("beebs", { aPublier, jobsParArticle: jobs, plateformes: PLATEFORMES, libres: plateformesLibres });
  ok(ids.length === 214 && !ids.includes(1000) && !ids.includes(1215), "au geste : la règle du lot (plateformesLibres) — un article déjà sur Beebs et le vendu ne sont pas pré-cochés", ids.length);
}

console.log("B. Les mots");
const { textesAnnonces } = await charger("src/annonces/textes.js");
const TF = textesAnnonces("fr"), TE = textesAnnonces("en");
ok(typeof TF.plateformeVide === "function" && TF.plateformeVide("Beebs") === "Ton Beebs est vide : Synchroniser relit tes annonces, il ne les copie pas.",
  "la phrase de Nico, mot pour mot", typeof TF.plateformeVide === "function" ? TF.plateformeVide("Beebs") : null);
ok(typeof TF.publierStockSur === "function" && TF.publierStockSur("Beebs") === "Publier ton stock sur Beebs", "le bouton : « Publier ton stock sur Beebs »");
ok(typeof TE.plateformeVide === "function" && /Your Beebs is empty/.test(TE.plateformeVide("Beebs")) && TE.publierStockSur?.("Beebs") === "Post your stock on Beebs", "leur version anglaise");

console.log("C. Le bloc de synchro les montre");
const bloc = lire("src/stock/BlocSynchro.jsx");
ok(/import \{ plateformesVidesAProposer \} from '\.\/plateformeVide\.js';/.test(bloc)
  && /plateformesVidesAProposer\(\{ tuiles, compte: r\.compte, stock: stockParPlateforme \}\)/.test(bloc), "la règle est lue sur les tuiles du relevé et le compte des annonces");
ok(/\{pastilles\(true\)\}\n\s*<PlateformesVides vides=\{videsAProposer\} T=\{T\} onPublier=\{onPublierStockSur\} \/>/.test(bloc), "à la FIN de « Synchroniser » (le résumé), sous les pastilles");
ok(/\{!enCours && pastilles\(false\)\}\n\s*\{!enCours && <PlateformesVides vides=\{videsAProposer\} T=\{T\} onPublier=\{onPublierStockSur\} \/>\}/.test(bloc), "au repos, sous les pastilles des plateformes reliées");
const comp = bloc.slice(bloc.indexOf("function PlateformesVides("), bloc.indexOf("function PlateformesVides(") + 1800);
ok(/T\.plateformeVide\(v\.nom\)/.test(comp) && /T\.publierStockSur\(v\.nom\)/.test(comp) && /onClick=\{\(\) => onPublier\(v\.p\)\}/.test(comp), "une phrase et un bouton par plateforme vide, le geste porte la plateforme");

console.log("D. Le geste ouvre le lot avec la plateforme cochée");
const st = lire("src/tabs/StockTab.jsx");
ok(/stockParPlateforme=\{stockParPlateforme\}\n\s*onPublierStockSur=\{publierStockSur\}/.test(st), "le Stock passe le résumé et le geste au bloc de synchro");
const iG = st.indexOf("const publierStockSur = useCallback((p) => {");
const geste = iG > 0 ? st.slice(iG, iG + 600) : "";
ok(/idsAPublierSur\(p, \{ aPublier: aPublierTout, jobsParArticle: jobsByInventaire, plateformes: plateformesLotCompte, libres: plateformesLibres \}\)/.test(geste)
  && /setPublierContexte\(\{ ids, plateformes: \[p\] \}\);/.test(geste) && /setGesteOuvert\('publier'\);/.test(geste),
  "le geste ouvre la sélection « Publier » : les articles pas encore sur X (règle du lot), X retenue");
ok(/setLotOuvert\(\{articles:choisis,plateformes:publierContexte\?\.plateformes\?\?null\}\)/.test(st) && /choixPrefere=\{lotOuvert\.plateformes\}/.test(st),
  "la sélection confirmée ouvre le lot avec cette plateforme (choixPrefere)");
const articlesLot = aPublier.slice(0, 3).map((item) => ({ item, jobs: [] }));
ok(JSON.stringify(choixInitial(resumeParPlateforme(articlesLot, PLATEFORMES), { memorise: ["beebs"] })) === '["beebs"]', "le lot coche Beebs, et Beebs seule");
const app = lire("src/App.jsx");
const iTag = app.indexOf("<StockTab");
const tag = iTag > 0 ? app.slice(iTag, app.indexOf("/>", iTag)) : "";
ok(iTag > 0 && !/stockParPlateforme|publierStockSur|plateformeVide/.test(tag), "fiche rapide : aucune prop neuve au Stock (tout vit dans StockTab)");

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
