// ═══════════════════════════════════════════════════════════════════════════
// UNE PAGE TRADUITE PAR LE NAVIGATEUR NE BLANCHIT PLUS L'ÉCRAN — garde (29/10/2026, point 10)
//   node scripts/dom-traduit-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateurs : mele.marta (Italie, 28/10 13:28–13:33, six écrans blancs « insertBefore ») et pedrobaylina
// (Portugal, 27/10 11:17). Ce test prouve :
//   1. la garde du DOM (src/utils/domTraduit.js) : un insertBefore / removeChild sur un nœud sorti par un tiers ne
//      lève plus, le geste normal est inchangé, le tiers est signalé UNE fois ;
//   2. FillSell se déclare non traduisible PARTOUT (translate="no", notranslate, meta google — décision de Nico du 29/10
//      soir) : app (index.html + interdireTraductionApp), site vitrine (gabarit), popup de l'extension, page du Cloud ;
//   3. le câblage : App.jsx pose les deux gestes, main.jsx garde la pile des composants, le journal joint la pile,
//      les composants et la langue.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

const D = await import("../src/utils/domTraduit.js");

// Un Node minimal qui lève comme le navigateur.
class FauxNode {
  constructor(nom) { this.nom = nom; this.enfants = []; this.parentNode = null; }
  insertBefore(n, r) {
    if (r != null && r.parentNode !== this) throw new Error("Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.");
    if (n.parentNode) n.parentNode.enfants = n.parentNode.enfants.filter((x) => x !== n);
    const i = r == null ? this.enfants.length : this.enfants.indexOf(r);
    this.enfants.splice(i, 0, n); n.parentNode = this; return n;
  }
  removeChild(e) {
    if (e.parentNode !== this) throw new Error("Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.");
    this.enfants = this.enfants.filter((x) => x !== e); e.parentNode = null; return e;
  }
}

console.log("\n1. La garde du DOM");
{
  D._remettreGarde();
  const signaux = [];
  D.garderDomContreTiers((op) => signaux.push(op), FauxNode);
  const bouton = new FauxNode("button");
  const texte = new FauxNode("#text Envoi…");
  bouton.insertBefore(texte, null);
  // Google Traduction sort le nœud texte et met un <font> à sa place.
  bouton.removeChild(texte);
  bouton.insertBefore(new FauxNode("font"), null);
  const icone = new FauxNode("svg");
  let leve = null;
  try { bouton.insertBefore(icone, texte); } catch (e) { leve = e; }
  ok(!leve && icone.parentNode === bouton && bouton.enfants.at(-1) === icone, "insertBefore devant un texte sorti : ne lève plus, l'élément est posé en fin de parent");
  leve = null;
  try { bouton.removeChild(texte); } catch (e) { leve = e; }
  ok(!leve, "removeChild d'un texte sorti : ne lève plus");
  ok(signaux.length === 1 && signaux[0] === "insertBefore", "le tiers est signalé UNE fois par onglet");
  const a = new FauxNode("a"), b = new FauxNode("b");
  bouton.insertBefore(a, null); bouton.insertBefore(b, a);
  ok(bouton.enfants.indexOf(b) === bouton.enfants.indexOf(a) - 1, "un insertBefore normal garde son ordre");
  bouton.removeChild(b);
  ok(!bouton.enfants.includes(b) && b.parentNode === null, "un removeChild normal retire");
  const avant = FauxNode.prototype.insertBefore;
  D.garderDomContreTiers(null, FauxNode);
  ok(FauxNode.prototype.insertBefore === avant, "posée une seule fois (jamais deux enveloppes)");
}

console.log("\n2. L'app se déclare non traduisible");
{
  D._remettreGarde();
  const attrs = new Map(), classes = new Set(), metas = [];
  const doc = {
    documentElement: { setAttribute: (k, v) => attrs.set(k, v), classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) } },
    head: { querySelector: () => metas.find((m) => m.get("name") === "google" && m.get("content") === "notranslate") ?? null, appendChild: (m) => metas.push(m) },
    createElement: () => { const m = new Map(); m.setAttribute = (k, v) => m.set(k, v); return m; },
  };
  D.interdireTraductionApp(doc);
  D.interdireTraductionApp(doc);
  ok(attrs.get("translate") === "no" && classes.has("notranslate"), "translate=\"no\" et classe notranslate sur <html>");
  ok(metas.length === 1, "meta google notranslate posée une fois");
  ok(D.pageTraduite(doc) === false, "page non traduite : traduite = false");
  classes.add("translated-ltr");
  ok(D.pageTraduite(doc) === true, "Google Traduction (translated-ltr) : traduite = true");
  // Chaque page servie par FillSell porte les deux marques que Chrome (et Safari) lisent avant de proposer la traduction.
  const pages = {
    "index.html": [/<html lang="fr" translate="no" class="notranslate">/, "app web et mobile"],
    "site/gabarits/layout.mjs": [/<html lang="\$\{page\.lang\}" translate="no" class="notranslate">/, "site vitrine"],
    "chrome-extension/popup.html": [/<html lang="fr" translate="no" class="notranslate">/, "extension"],
    "serveur-cloud/public/connexion.html": [/<html lang="fr" translate="no" class="notranslate">/, "Cloud"],
  };
  for (const [p, [html, ou]] of Object.entries(pages)) {
    const src = lire(p);
    ok(html.test(src) && /<meta name="google" content="notranslate"/.test(src), `${p} (${ou}) : translate="no", notranslate et meta google`);
  }
}

console.log("\n3. Le câblage");
{
  const app = lire("src/App.jsx");
  // (29/10 soir) Nico a tranché : la traduction du navigateur est bloquée ; l'app repose la marque au chargement.
  ok(/^interdireTraductionApp\(\);$/m.test(app), "App.jsx : interdireTraductionApp() au chargement (traduction bloquée)");
  ok(/^garderDomContreTiers\(\(op\) => signalerActionRatee\(\{ action: 'dom_tiers', motif: op, details: contexteLangue\(\) \}\)\);$/m.test(app), "App.jsx : la garde du DOM, signalée en dom_tiers avec la langue");
  const main = lire("src/main.jsx");
  ok(/createRoot\(document\.getElementById\('root'\), \{ onUncaughtError: signalerErreurNonRattrapee \}\)/.test(main)
    && /window\.__fillsellPileComposants = /.test(main) && /window\.reportError\(erreur\)/.test(main), "main.jsx : pile des composants gardée, puis le geste par défaut de React (reportError)");
  const ar = lire("src/utils/actionRatee.js");
  ok(/pile: court\(ev\.error\?\.stack, 300\), composants: court\(pileComposants\(\), 300\), \.\.\.contexteLangue\(\)/.test(ar), "exception_js : pile, composants et langue joints");
}

console.log(`\ndom-traduit : ${verts} contrôles verts, ${rouges} rouge(s)`);
if (rouges) process.exit(1);
