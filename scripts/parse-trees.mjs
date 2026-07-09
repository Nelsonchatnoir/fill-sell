// Parseurs des relevés de crawl (docs/) → listes de chemins feuilles.
// Source de vérité des auditeurs : chaque chemin codé dans src/utils/*Categories.js
// doit se résoudre sur une feuille d'un de ces arbres (preuve de crawl réel).
//
// - Vinted : docs/vinted-catalog-tree.json (arbre du FORMULAIRE, API
//   item_upload/catalogs — juillet 2026)
// - Beebs  : docs/beebs-categories-raw.txt (relevé du sélecteur de catégorie
//   du formulaire de vente, session réelle 2026-07-08 ; racine "Maison"
//   PARTIELLE — crawl interrompu, marqué dans le fichier)
// - eBay   : docs/ebay-categories-raw.txt (API browse du prelist, libellés +
//   ids — [FEUILLE] = terminal)
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Indentation 2 espaces = 1 niveau, lignes "- Libellé".
// stripAnnotations retire les suffixes de relevé ("(PARTIEL — ...)", [id=], [FEUILLE]).
function parseIndentedList(text, { extractId = false } = {}) {
  const nodes = [];
  const stack = []; // [{ depth, node }]
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^(\s*)- (.+)$/);
    if (!m) continue;
    const depth = m[1].length / 2;
    let label = m[2];
    let id = null;
    let isLeafMark = false;
    if (extractId) {
      const idm = label.match(/\[id=(\d+)\]/);
      if (idm) id = Number(idm[1]);
      isLeafMark = /\[FEUILLE\]/.test(label);
      label = label.replace(/\s*\[id=\d+\]\s*/g, " ").replace(/\s*\[FEUILLE\]\s*/g, " ").trim();
    }
    label = label.replace(/\s*\(PARTIEL[^)]*\)\s*$/, "").trim();
    const node = { t: label, c: null, id, leafMark: isLeafMark };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (!stack.length) nodes.push(node);
    else {
      const parent = stack[stack.length - 1].node;
      (parent.c ??= []).push(node);
    }
    stack.push({ depth, node });
  }
  return nodes;
}

export function loadVintedTree() {
  return JSON.parse(readFileSync(join(ROOT, "docs/vinted-catalog-tree.json"), "utf8"));
}
export function loadBeebsTree() {
  return parseIndentedList(readFileSync(join(ROOT, "docs/beebs-categories-raw.txt"), "utf8"));
}
export function loadEbayTree() {
  return parseIndentedList(readFileSync(join(ROOT, "docs/ebay-categories-raw.txt"), "utf8"), { extractId: true });
}

// Résout un chemin [seg, seg, ...] dans un arbre {t, c} — retourne
// { ok, isLeaf, failAt, node }. AVEC BACKTRACKING : le relevé eBay contient
// des racines DUPLIQUÉES (crawl en deux passes — "Bricolage", "Sports,
// vacances"… apparaissent deux fois, la seconde section étant la plus
// complète) ; on essaie donc TOUTES les branches portant le même libellé
// avant de conclure à un échec.
export function resolvePath(tree, path) {
  if (!path) return null;
  let deepestFail = path[0];
  function walk(nodes, i) {
    const candidates = (nodes || []).filter((n) => n.t === path[i]);
    if (!candidates.length) {
      deepestFail = path[i];
      return null;
    }
    for (const node of candidates) {
      if (i === path.length - 1) return node;
      const r = walk(node.c, i + 1);
      if (r) return r;
    }
    return null;
  }
  const node = walk(tree, 0);
  if (!node) return { ok: false, failAt: deepestFail };
  return { ok: true, isLeaf: !node.c, node };
}

export function allLeafPaths(tree) {
  const out = [];
  (function walk(nodes, p) {
    for (const n of nodes) {
      const q = [...p, n];
      if (n.c) walk(n.c, q);
      else out.push(q);
    }
  })(tree, []);
  return out;
}
