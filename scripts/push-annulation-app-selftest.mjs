// selftest:push-annulation-app — (25/10, point 3 de Nico) L'APPUI SUR LA NOTIFICATION « VENTE ANNULÉE » (part par OTA)
// mène au Stock, sur l'écran « Ventes annulées » de « À régler » (la carte et son bouton « Remettre en vente ») — jamais
// sur la fiche (une publication ordinaire de là doublerait le « Republier » de Vinted). Une fois par appui ; les
// propositions relues UNE fois, jamais en boucle ; la notification d'une VENTE garde son chemin (fiche, sinon Ventes).
//   npm run selftest:push-annulation-app
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
console.log("push-annulation-app-selftest");

const pv = lire("src/notifications/pushVentes.js");
ok(/const TYPES_OUVERTS = new Set\(\['vente', 'vente_annulee'\]\);/.test(pv) && /if \(!donnees \|\| !TYPES_OUVERTS\.has\(donnees\.type\)\) return;/.test(pv),
  "1. pushVentes : l'appui sur « vente » ET « vente_annulee » est transmis à l'app (un autre type : rien)");
ok(/if \(surOuvrir\) surOuvrir\(donnees\); else ouvertureEnAttente = donnees;/.test(pv), "2. démarrage à froid : l'appui attend que l'app sache l'ouvrir (inchangé)");

const app = lire("src/App.jsx");
const effet = app.slice(app.indexOf("const [ouverturePush,setOuverturePush]=useState(null);"), app.indexOf("const [duplicationEnCours,setDuplicationEnCours]"));
const branche = effet.slice(effet.indexOf("if(ouverturePush.type==='vente_annulee'){"), effet.indexOf("const id=Number(ouverturePush.inventaire_id);"));
ok(branche.length > 50 && /setTab\(1\)/.test(branche) && /setGesteStockDemande\(\{geste:'ventes_annulees'\}\)/.test(branche)
  && /setOuverturePush\(null\)/.test(branche) && /return;/.test(branche),
  "3. App : « vente_annulee » → Stock, écran « Ventes annulées », appui consommé");
ok(!/setEditItem/.test(branche), "4. ⛔ jamais la fiche pour une annulation (pas de publication ordinaire qui doublerait le « Republier » de Vinted)");
ok((branche.match(/supabase\.rpc\('ventes_annulees_a_remettre'\)/g) ?? []).length === 1 && !/setInterval|setTimeout/.test(branche),
  "5. les propositions relues UNE fois à l'appui (l'annulation a pu arriver app ouverte) — jamais en boucle");
ok(/const id=Number\(ouverturePush\.inventaire_id\);[\s\S]{0,200}setEditItem\(/.test(effet) && /setTab\(3\);localStorage\.setItem\('tab','3'\);/.test(effet),
  "6. la notification d'une VENTE : inchangée (sa fiche, sinon l'onglet Ventes)");
ok(/gesteDemande=\{gesteStockDemande\} onGesteDemandeVu=\{gesteStockDemandeVu\}/.test(app)
  && /const gesteStockDemandeVu=useCallback\(\(\)=>setGesteStockDemande\(null\),\[\]\);/.test(app),
  "7. App passe la demande au Stock et l'efface quand elle est prise (un retour au Stock ne la rejoue pas)");

const stock = lire("src/tabs/StockTab.jsx");
ok(/gesteDemande = null, onGesteDemandeVu = null,/.test(stock), "8. StockTab reçoit la demande");
ok(/if \(gesteDemande && gesteDemande !== demandePrise\) \{\n    setDemandePrise\(gesteDemande\);\n    setGesteOuvert\(gesteDemande\.geste \?\? null\);\n  \}/.test(stock),
  "9. StockTab ouvre l'écran demandé UNE fois par demande (prise au rendu, sans effet qui écrit l'état)");
ok(/useEffect\(\(\) => \{ if \(gesteDemande\) onGesteDemandeVu\?\.\(\); \}, \[gesteDemande, onGesteDemandeVu\]\);/.test(stock), "10. puis la rend à App");
ok(/\{gesteOuvert==='ventes_annulees'&&\(/.test(stock) && /<VentesAnnulees lang=\{lang\} ventes=\{ventesAnnulees\}/.test(stock),
  "11. l'écran « Ventes annulées » existe (la carte et son unique bouton, selftest vente-annulee-carte)");

console.log(`push-annulation-app-selftest : ${n} contrôles verts`);
