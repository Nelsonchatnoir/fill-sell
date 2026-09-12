// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DES INDEX DE FEUILLES — les quatre arbres (2026-09-07)
//   node scripts/gen-arbres-feuilles.mjs
//
// Produit src/utils/arbres/<plateforme>Feuilles.js à partir des RELEVÉS
// (docs/*.txt, docs/leboncoin-form-survey.md). Rien n'est écrit à la main :
// une feuille qui n'a pas été relevée n'existe pas, et l'app ne peut donc pas
// l'inventer — c'est toute la garantie du chantier « sortir de l'emoji ».
//
// POURQUOI DES INDEX GÉNÉRÉS, ET PAS L'ARBRE BRUT : les relevés pèsent 356 Ko
// (eBay 228, Vinted 107, Beebs 21). L'index ne garde que les FEUILLES et leur
// chemin, en dictionnaire de segments (chaque libellé écrit une seule fois,
// les chemins ne portent que des numéros). Mesuré : eBay 315 Ko → 172 Ko,
// Vinted 186 → 110. Les modules sont chargés en `import()` DYNAMIQUE, donc
// seulement au moment de publier : ils ne pèsent rien au démarrage de l'app.
//
// FORMATS (relevés tels quels, jamais réécrits) :
//   eBay    « - Nom  [id=NNN]  [FEUILLE] », indentation de 2 espaces
//   Vinted  indentation seule, marqueur [FEUILLE]
//   Beebs   « - Nom », indentation seule : une feuille = un nœud sans enfant
//   LBC     markdown « - Racine : Feuille | Feuille | … » (arbre à 2 niveaux)
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(ROOT, "src/utils/arbres");

/** Arbre indenté générique → liste de feuilles { chemin: string[], id: string|null }. */
function parseIndente(texte, { marqueurFeuille, tiret }) {
  const lignes = texte.split(/\r?\n/);
  const noeuds = [];
  for (const l of lignes) {
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const m = l.match(/^(\s*)(.*)$/);
    let brut = m[2].trim();
    if (tiret) {
      if (!brut.startsWith("- ")) continue;
      brut = brut.slice(2).trim();
    }
    const prof = Math.floor(m[1].length / 2);
    const estFeuille = marqueurFeuille ? /\[FEUILLE\]/.test(brut) : null;
    const mid = brut.match(/\[id=(\d+)\]/);
    const libelle = brut.replace(/\s*\[id=\d+\]/, "").replace(/\s*\[FEUILLE\]/, "").trim();
    if (!libelle) continue;
    noeuds.push({ prof, libelle, id: mid?.[1] ?? null, estFeuille });
  }
  // Sans marqueur (Beebs) : une feuille est un nœud dont le suivant n'est pas
  // plus profond. Avec marqueur, on fait CONFIANCE au relevé.
  const feuilles = [];
  const pile = [];
  for (let i = 0; i < noeuds.length; i++) {
    const n = noeuds[i];
    pile.length = n.prof;
    pile[n.prof] = n.libelle;
    const feuille = marqueurFeuille
      ? n.estFeuille === true
      : !(noeuds[i + 1] && noeuds[i + 1].prof > n.prof);
    if (feuille) feuilles.push({ chemin: pile.slice(0, n.prof + 1), id: n.id });
  }
  return feuilles;
}

/** Leboncoin : arbre à 2 niveaux décrit en markdown, « - Racine : A | B | C ». */
function parseLeboncoin(texte) {
  const feuilles = [];
  // La section « ## Arbre catégories » SEULE (2026-09-12, job 35bd3f1c) : le
  // slice courait jusqu'à la fin du fichier et avalait « ## Listes fermées »,
  // dont la ligne « - **Univers** (`accessories_univers`) : `Femme | Homme |
  // Enfant | Mixte` » devenait une racine à 4 feuilles. L'IA a choisi
  // « **Univers** > Enfant » pour un peignoir enfant, et Leboncoin a répondu
  // « racine introuvable ». On s'arrête au titre suivant, et une racine qui
  // porte du markdown (*, `) n'est jamais une racine.
  const debut = texte.indexOf("## Arbre catégories");
  const suite = texte.slice(debut + 1).search(/\n## /);
  const bloc = suite >= 0 ? texte.slice(debut, debut + 1 + suite) : texte.slice(debut);
  for (const l of bloc.split(/\r?\n/)) {
    const m = l.match(/^-\s+([^:]+?)\s*:\s*(.+)$/);
    if (!m) continue;
    const racine = m[1].trim();
    if (!racine || racine.length > 40 || /[*`]/.test(racine)) continue;
    for (const f of m[2].split("|").map((s) => s.trim()).filter(Boolean)) {
      feuilles.push({ chemin: [racine, f], id: null });
    }
  }
  return feuilles;
}

function moduleFeuilles(nom, feuilles, source) {
  const dico = [];
  const idx = new Map();
  const clef = (s) => {
    if (!idx.has(s)) { idx.set(s, dico.length); dico.push(s); }
    return idx.get(s);
  };
  const compact = feuilles.map((f) => {
    const c = f.chemin.map(clef);
    return f.id ? [c, Number(f.id)] : [c];
  });
  const entete =
    `// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.\n` +
    `//   node scripts/gen-arbres-feuilles.mjs\n` +
    `// Source : ${source}\n` +
    `// ${feuilles.length} feuilles, ${dico.length} segments uniques.\n` +
    `// D = dictionnaire des libellés ; F = feuilles, chacune [ [indices du\n` +
    `// chemin], id? ]. Un libellé n'est écrit qu'une fois.\n`;
  const corps =
    `const D = ${JSON.stringify(dico)};\n` +
    `const F = ${JSON.stringify(compact)};\n\n` +
    `/** Les feuilles relevées : { chemin: string[], id: string|null }. */\n` +
    `export const FEUILLES = F.map(([c, id]) => ({ chemin: c.map((i) => D[i]), id: id != null ? String(id) : null }));\n`;
  fs.writeFileSync(join(SORTIE, `${nom}Feuilles.js`), entete + corps);
  return { feuilles: feuilles.length, segments: dico.length };
}

fs.mkdirSync(SORTIE, { recursive: true });
const lire = (rel) => fs.readFileSync(join(ROOT, rel), "utf8");

const jeux = [
  ["ebay", parseIndente(lire("docs/ebay-categories-raw.txt"), { marqueurFeuille: true, tiret: true }), "docs/ebay-categories-raw.txt"],
  ["vinted", parseIndente(lire("docs/vinted-catalog-tree.txt"), { marqueurFeuille: true, tiret: false }), "docs/vinted-catalog-tree.txt"],
  ["beebs", parseIndente(lire("docs/beebs-categories-raw.txt"), { marqueurFeuille: false, tiret: true }), "docs/beebs-categories-raw.txt"],
  ["leboncoin", parseLeboncoin(lire("docs/leboncoin-form-survey.md")), "docs/leboncoin-form-survey.md"],
];

let ko = 0;
for (const [nom, feuilles, source] of jeux) {
  if (!feuilles.length) { console.error(`✗ ${nom} : AUCUNE feuille lue depuis ${source}`); ko++; continue; }
  const r = moduleFeuilles(nom, feuilles, source);
  console.log(`✓ ${nom.padEnd(10)} ${String(r.feuilles).padStart(5)} feuilles, ${String(r.segments).padStart(5)} segments`);
  console.log(`             ex. ${feuilles[0].chemin.join(" > ")}${feuilles[0].id ? ` [${feuilles[0].id}]` : ""}`);
}
process.exit(ko ? 1 : 0);
