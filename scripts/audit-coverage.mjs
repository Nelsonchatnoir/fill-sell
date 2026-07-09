// Auditeur de couverture catégories — 4 plateformes (Vinted, Leboncoin,
// Beebs, eBay).
//
// Principe ANTI-INVENTION : chaque chemin codé dans src/utils/*Categories.js
// doit se résoudre sur une FEUILLE d'un arbre issu d'un crawl réel archivé
// dans docs/ (voir scripts/parse-trees.mjs pour les sources). Un chemin qui
// ne se résout pas = INVALIDE ; un null explicite = absence CONFIRMÉE par
// crawl ; une icône sans clé = NON MAPPÉ (souvent NON_CRAWLÉ côté Beebs).
//
// Usage :
//   node scripts/audit-coverage.mjs            # rapport complet
//   node scripts/audit-coverage.mjs --strict   # exit 1 si le moindre chemin
//                                              # est INVALIDE (CI / pre-commit)
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadVintedTree, loadBeebsTree, loadEbayTree, resolvePath } from "./parse-trees.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

const { detectObjectIcon } = await import(new URL("../src/utils/shared.js", import.meta.url));
const { getVintedCategoryPath } = await import(new URL("../src/utils/vintedCategories.js", import.meta.url));
const { getLbcCategoryPath } = await import(new URL("../src/utils/lbcCategories.js", import.meta.url));
const { getBeebsCategoryPath } = await import(new URL("../src/utils/beebsCategories.js", import.meta.url));
const { getEbayCategoryPath, getEbayCategoryId } = await import(new URL("../src/utils/ebayCategories.js", import.meta.url));

// ── Sources de vérité (crawls archivés) ─────────────────────────────────────
const vintedTree = loadVintedTree();
const beebsTree = loadBeebsTree();
const ebayTree = loadEbayTree();

// LBC : arbre plat 2 niveaux parsé depuis docs/leboncoin-form-survey.md
// (section "## Arbre catégories", format "- Racine : Feuille | Feuille").
function loadLbcTree() {
  const md = readFileSync(join(ROOT, "docs/leboncoin-form-survey.md"), "utf8");
  const section = md.split(/^## Arbre catégories.*$/m)[1]?.split(/^## /m)[0] ?? "";
  const tree = [];
  for (const line of section.split(/\r?\n/)) {
    const m = line.match(/^- (.+?) : (.+)$/);
    if (!m) continue;
    tree.push({ t: m[1].trim(), c: m[2].split("|").map((s) => ({ t: s.trim(), c: null })) });
  }
  return tree;
}
const lbcTree = loadLbcTree();

// ── Icônes à auditer : règles de détection + clés des 4 mappings ────────────
function extractRuleIcons() {
  const src = readFileSync(join(ROOT, "src/utils/shared.js"), "utf8");
  const block = src.slice(src.indexOf("OBJECT_ICON_RULES = ["), src.indexOf("];", src.indexOf("OBJECT_ICON_RULES")));
  return [...block.matchAll(/,\s*'(.+?)'\]/g)].map((m) => m[1]);
}
function extractMappingIcons(file) {
  // Clés emoji uniquement (non-ASCII), où qu'elles soient sur la ligne :
  // lbcCategories écrit plusieurs clés par ligne ("🌸": null, "💄": null…),
  // un ancrage début-de-ligne raterait toutes les clés suivantes.
  const src = readFileSync(join(ROOT, file), "utf8");
  return [...src.matchAll(/"([^\x00-\x7F"]{1,8})":/g)].map((m) => m[1]);
}
const KEY_FILES = {
  vinted: "src/utils/vintedCategories.js",
  leboncoin: "src/utils/lbcCategories.js",
  beebs: "src/utils/beebsCategories.js",
  ebay: "src/utils/ebayCategories.js",
};
const keyCache = Object.fromEntries(
  Object.entries(KEY_FILES).map(([p, f]) => [p, new Set(extractMappingIcons(f))])
);
const icons = [...new Set([
  ...extractRuleIcons(),
  ...Object.values(keyCache).flatMap((s) => [...s]),
])];

// ── Vérification par plateforme ─────────────────────────────────────────────
// Pour chaque icône : statut = OK (au moins un genre résout une feuille et
// AUCUN chemin non-null n'est invalide), NULL (null explicite = absence
// confirmée), ABSENT (aucune clé = non mappé), INVALIDE (au moins un chemin
// codé ne se résout pas sur une feuille du crawl).
const PLATFORMS = {
  vinted: {
    genres: ["Femme", "Homme", ""],
    get: (icon, g) => getVintedCategoryPath(icon, g),
    tree: vintedTree,
  },
  leboncoin: {
    genres: [""],
    get: (icon) => getLbcCategoryPath(icon),
    tree: lbcTree,
  },
  beebs: {
    genres: ["Femme", "Homme", "Fille", "Garçon", "Bébé", ""],
    get: (icon, g) => getBeebsCategoryPath(icon, g),
    tree: beebsTree,
  },
  ebay: {
    genres: ["Femme", "Homme", "Fille", "Garçon", "Bébé", "Enfant", "Mixte", ""],
    get: (icon, g) => getEbayCategoryPath(icon, g),
    tree: ebayTree,
    // Vérification renforcée eBay : l'id codé doit être EXACTEMENT celui du
    // nœud de l'arbre au bout du chemin (c'est l'id qui part dans l'URL
    // /sl/list — un id faux publierait dans la mauvaise catégorie).
    checkId: (icon, g, node) => {
      const codedId = getEbayCategoryId(icon, g);
      return node.id == null || codedId === node.id
        ? null
        : `id codé ${codedId} ≠ id du relevé ${node.id}`;
    },
  },
};

function auditIcon(icon) {
  const row = { icon, platforms: {} };
  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    const errors = [];
    let okCount = 0;
    for (const g of cfg.genres) {
      const path = cfg.get(icon, g);
      if (!path) continue;
      const r = resolvePath(cfg.tree, path);
      if (!r.ok) errors.push(`[${g || "·"}] segment introuvable "${r.failAt}" dans ${JSON.stringify(path)}`);
      else if (!r.isLeaf) errors.push(`[${g || "·"}] chemin non terminal (des sous-niveaux existent) ${JSON.stringify(path)}`);
      else {
        const idErr = cfg.checkId?.(icon, g, r.node);
        if (idErr) errors.push(`[${g || "·"}] ${idErr} pour ${JSON.stringify(path)}`);
        else okCount++;
      }
    }
    let status;
    if (errors.length) status = "INVALIDE";
    else if (okCount > 0) status = "OK";
    else if (keyCache[name].has(icon)) status = "NULL";
    else status = "ABSENT";
    row.platforms[name] = { status, errors };
  }
  return row;
}

const rows = icons.map(auditIcon);

// ── Rapport ─────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log("=== COUVERTURE PAR ICÔNE (OK = feuille validée contre le crawl, NULL = absence confirmée, ABSENT = non mappé/NON_CRAWLÉ) ===\n");
console.log(pad("icône", 6) + Object.keys(PLATFORMS).map((p) => pad(p, 11)).join(""));
for (const row of rows) {
  console.log(
    pad(row.icon, 6) +
    Object.keys(PLATFORMS).map((p) => pad(row.platforms[p].status, 11)).join("")
  );
}

let invalidCount = 0;
console.log("\n=== CHEMINS INVALIDES (zéro toléré) ===");
for (const row of rows) {
  for (const [p, { status, errors }] of Object.entries(row.platforms)) {
    if (status !== "INVALIDE") continue;
    invalidCount += errors.length;
    for (const e of errors) console.log(`  ${row.icon} ${p} — ${e}`);
  }
}
if (!invalidCount) console.log("  (aucun)");

console.log("\n=== SYNTHÈSE ===");
for (const p of Object.keys(PLATFORMS)) {
  const c = { OK: 0, NULL: 0, ABSENT: 0, INVALIDE: 0 };
  rows.forEach((r) => c[r.platforms[p].status]++);
  console.log(
    `${pad(p, 11)} OK:${pad(c.OK, 4)} NULL(confirmé):${pad(c.NULL, 4)} ` +
    `ABSENT(non mappé):${pad(c.ABSENT, 4)} INVALIDE:${c.INVALIDE}`
  );
}
function countLeaves(t) {
  let n = 0;
  (function w(nodes) { for (const x of nodes) x.c ? w(x.c) : n++; })(t);
  return n;
}
console.log(`\nIcônes auditées : ${rows.length} — feuilles des crawls : vinted=${countLeaves(vintedTree)}, beebs=${countLeaves(beebsTree)}, ebay=${countLeaves(ebayTree)}, lbc=${countLeaves(lbcTree)}`);

// ── Batterie de détection (phrases réelles → icône attendue) ────────────────
const battery = [
  ["Ceinture en cuir marron", "🪢"], ["Cravate en soie bleue", "🎀"],
  ["Costume deux pièces gris", "🤵"], ["Blazer croisé marine", "🥼"],
  ["Pyjama deux pièces flanelle", "🩲"], ["Soutien-gorge dentelle 90B", "🩲"],
  ["Chaussons montants fourrés", "🥿"], ["Banane Eastpak noire", "👝"],
  ["Parapluie pliant automatique", "☂️"], ["Porte-clés cuir tressé", "🗝️"],
  ["Valise cabine rigide", "🧳"],
  ["Rideaux occultants gris", "🪟"], ["Coussin velours moutarde", "🪶"],
  ["Tapis berbère 160x230", "🟫"], ["Nappe en lin lavé", "📜"],
  ["Housse de couette 220x240 percale", "🛌"], ["Horloge murale scandinave", "🕰️"],
  ["Gamelle inox pour chien", "🐕"], ["Guirlande sapin décorations Noël", "🎄"],
  ["Stylo plume Waterman", "🖋️"], ["Fer à repasser vapeur Calor", "🧼"],
  ["Machine à coudre Singer", "🧵"], ["Ventilateur sur pied silencieux", "🌀"],
  ["Radiateur d'appoint électrique", "🌡️"],
  ["DVD coffret Harry Potter", "📀"], ["Blu-ray Interstellar", "📀"],
  ["CD album Daft Punk", "💽"], ["Cassette audio K7 originale", "💽"],
  ["Vinyle 33 tours Pink Floyd", "💿"], ["Harmonica Hohner do", "🎼"],
  ["Liseuse Kindle Paperwhite", "📇"], ["iPad Air 4", "📲"],
  ["Montre connectée Garmin Forerunner", "⏱️"], ["Google Home Mini assistant vocal", "📡"],
  ["Perceuse visseuse Bosch 18V", "🪛"], ["Marteau de charpentier", "🔨"],
  ["Échelle télescopique 3m", "🪜"], ["Mètre ruban 5m Stanley", "📏"],
  ["Taille-haie électrique Bosch", "✂️"], ["Parasol déporté 3m", "⛱️"],
  ["Bombe d'équitation taille 56", "🐴"], ["Queue de billard érable", "🎱"],
  ["Masque et tuba de plongée", "🤿"], ["Paddle gonflable 10'6", "🏄"],
  ["Déguisement pirate enfant", "🎭"], ["Voiture télécommandée RC", "🚁"],
  ["Lit à barreaux bois blanc", "🚼"], ["Poussette Yoyo Babyzen", "👶"],
  ["Montre Casio A158 vintage", "⌚"], ["Gilet en maille boutonné", "🧶"],
  ["Polaire zippée outdoor", "🧥"], ["Body manches longues noir", "👕"],
];
console.log("\n=== BATTERIE DE DÉTECTION ===");
let detectFails = 0;
for (const [phrase, expected] of battery) {
  const got = detectObjectIcon(phrase, "", "Autre");
  if (got !== expected) {
    detectFails++;
    console.log(`  ✗ "${phrase}" → ${got} (attendu ${expected})`);
  }
}
console.log(detectFails ? `  ${detectFails} échec(s) de détection` : `  ${battery.length}/${battery.length} OK`);

if (STRICT && (invalidCount || detectFails)) {
  console.error(`\n--strict : ÉCHEC (${invalidCount} chemin(s) invalide(s), ${detectFails} échec(s) de détection)`);
  process.exit(1);
}
console.log("\nAudit terminé" + (STRICT ? " — strict OK ✅" : "."));
