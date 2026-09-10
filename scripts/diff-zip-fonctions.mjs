// Compare fonction par fonction DEUX bundles minifiés (deux zips d'extension
// déjà décompressés). Un diff textuel sur du minifié est illisible : ici on
// extrait chaque fonction NOMMÉE par équilibrage d'accolades et on compare les
// corps, octet pour octet.
//   node scripts/diff-zip-fonctions.mjs <fichierA.js> <fichierB.js> [nom...]
// Sans nom : compare TOUTES les fonctions nommées des deux fichiers.
import { readFileSync } from "node:fs";

const [a, b, ...noms] = process.argv.slice(2);
const A = readFileSync(a, "utf8");
const B = readFileSync(b, "utf8");

/** Extrait les corps `function nom(...){...}` par équilibrage d'accolades,
 *  en sautant chaînes, gabarits, regex et commentaires. */
function fonctions(src) {
  const out = new Map();
  const re = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = src.indexOf("{", re.lastIndex);
    if (i < 0) continue;
    let prof = 0, q = null, ech = false, sig = "", classe = false, fini = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (ech) { ech = false; continue; }
      if (c === "\\") { ech = true; continue; }
      if (q === "/") {
        // ── Littéral d'expression régulière ────────────────────────────────
        // Sans ce cas, un `/\{/` ou un `/[^}]/` déséquilibre le comptage et
        // l'extraction avale TOUT le reste du bundle : quatre fonctions
        // sortaient à 140 Ko et se déclaraient « changées » pour rien.
        if (c === "[") classe = true;
        else if (c === "]") classe = false;
        else if (c === "/" && !classe) q = null;
        continue;
      }
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; sig = c; continue; }
      if (c === "/") {
        const p = src[i + 1];
        if (p === "/") { i = src.indexOf("\n", i); if (i < 0) { i = src.length; } continue; }
        if (p === "*") { i = src.indexOf("*/", i + 2) + 1; if (i < 1) { i = src.length; } continue; }
        // Division ou regex ? Un `/` qui suit une VALEUR divise ; partout
        // ailleurs il ouvre une regex. (`)` est traité comme une valeur : en
        // minifié, `if(...)/re/.test(x)` est rarissime face à `(a+b)/2`.)
        if (!/[\w$)\]]/.test(sig)) { q = "/"; classe = false; }
        sig = c;
        continue;
      }
      if (c === "{") prof++;
      else if (c === "}") { prof--; if (prof === 0) { i++; fini = true; break; } }
      if (!/\s/.test(c)) sig = c;
    }
    if (!fini) { out.set(m[1], null); continue; } // extraction non concluante
    out.set(m[1], src.slice(m.index, i));
  }
  return out;
}

const fa = fonctions(A), fb = fonctions(B);
const cibles = noms.length ? noms : [...new Set([...fa.keys(), ...fb.keys()])].sort();

let identiques = 0;
const changees = [], ajoutees = [], retirees = [];
for (const n of cibles) {
  const x = fa.get(n), y = fb.get(n);
  if (!fa.has(n) && !fb.has(n)) { console.log(`  ?  ${n} — absente des deux`); continue; }
  if (x === null || y === null) { console.log(`  ?  ${n} — extraction non concluante`); continue; }
  if (x == null) { ajoutees.push(n); continue; }
  if (y == null) { retirees.push(n); continue; }
  if (x === y) { identiques++; if (noms.length) console.log(`  =  ${n} — IDENTIQUE (${x.length} o)`); }
  else { changees.push([n, x.length, y.length]); }
}

if (!noms.length) {
  console.log(`  ${identiques} fonction(s) IDENTIQUES`);
}
for (const [n, la, lb] of changees) console.log(`  ~  ${n} — CHANGÉE (${la} o → ${lb} o)`);
for (const n of ajoutees) console.log(`  +  ${n} — AJOUTÉE`);
for (const n of retirees) console.log(`  -  ${n} — RETIRÉE`);
if (!changees.length && !ajoutees.length && !retirees.length) console.log("  → aucun écart.");
