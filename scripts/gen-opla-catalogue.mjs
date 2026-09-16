// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DU CATALOGUE OPLA — arbre, grilles, et la migration qui les pose
//   node scripts/gen-opla-catalogue.mjs            (écrit)
//   node scripts/gen-opla-catalogue.mjs --verifier (n'écrit rien, compare)
//
// SOURCE UNIQUE : docs/opla/*.tsv, relevés en phase 0 et REVÉRIFIÉS contre le
// live le 2026-09-16 (docs/OPLA_RELEVE.md § 7). Rien n'est écrit à la main —
// une catégorie qui n'a pas été relevée n'existe pas, et rien ne peut
// l'inventer. C'est la même garantie que gen-arbres-feuilles.mjs donne aux
// quatre autres plateformes.
//
// CE QU'IL PRODUIT, ET POURQUOI TROIS ARTEFACTS ET PAS UN :
//   1. supabase/functions/_shared/opla-catalogue.ts
//      L'arbre COMPLET (1014 nœuds) + les 5 grilles, côté serveur. C'est lui
//      qui sait remonter d'un code à son parent — donc qui sait proposer LE
//      NIVEAU QUI A ÉCHOUÉ, et pas la racine.
//   2. supabase/migrations/20260916150000_opla_catalogue.sql
//      Les mêmes données en base, dans platform_category_aspects, exactement
//      comme Vinted : `category` (les enfants d'un nœud) et `size` (la grille
//      d'une feuille). C'est ce que get-pending-jobs sert au needs_user typé.
//   3. (gen-arbres-feuilles.mjs, à part) src/utils/arbres/oplaFeuilles.js,
//      l'index des 886 feuilles que l'app ratisse avant resolve-categorie.
//
// ⛔ LES CODES DE TAILLE SONT EN DOUBLE : 150 entrées pour 143 codes uniques
//    (TAILLE_UNIQUE et XS…XXL vivent en G1 ET en G4). Un test sur la liste
//    PLATE accepte donc « 90C » sur un t-shirt. La validation est TOUJOURS
//    faite contre la grille DE LA FEUILLE, jamais contre l'union.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERIFIER = process.argv.includes("--verifier");
const lire = (rel) => fs.readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ── Empreintes de la SOURCE, revérifiées contre le live le 2026-09-16 ───────
// Reproductible : sha256sum docs/opla/<fichier> | cut -c1-16
// Si l'une bouge, la source a été touchée : le générateur REFUSE de tourner.
// (Les deux empreintes écrites dans OPLA_RELEVE.md avant le 16/09 —
// d0ceda69abcf359e et 34db6508a83fd1d3 — ne correspondaient à rien de
// reproductible ; elles ont été corrigées le 16/09, cf. § 7.)
const EMPREINTES = {
  "docs/opla/categories.tsv": "6d284b5821c72ea7",
  "docs/opla/categorie-grille.tsv": "e24f8ec875ea8138",
  "docs/opla/grilles-tailles.tsv": "fdcafb7f3701602c",
  "docs/opla/sizes.txt": "00df77682e178e8c",
};

let stop = false;
for (const [f, attendue] of Object.entries(EMPREINTES)) {
  const vue = sha(fs.readFileSync(join(ROOT, f)));
  if (vue !== attendue) {
    console.error(`✗ ${f} : empreinte ${vue}, attendue ${attendue} — la source a changé. ARRÊT.`);
    stop = true;
  }
}
if (stop) {
  console.error("\nLe catalogue ne se régénère PAS sur une source modifiée sans décision.");
  process.exit(1);
}

// ── 1. L'arbre ──────────────────────────────────────────────────────────────
const noeuds = [];
for (const l of lire("docs/opla/categories.tsv").split("\n").slice(1)) {
  if (!l.trim()) continue;
  const [prof, code, titre, parent, feuille] = l.split("\t");
  noeuds.push({ prof: Number(prof), code, titre, parent: parent || null, feuille: feuille === "F" });
}
const parCode = new Map(noeuds.map((n) => [n.code, n]));
const enfants = new Map();
for (const n of noeuds) {
  const cle = n.parent ?? "";
  if (!enfants.has(cle)) enfants.set(cle, []);
  enfants.get(cle).push(n.code);
}

// ── 2. Les grilles ──────────────────────────────────────────────────────────
const grillePourFeuille = new Map();
for (const l of lire("docs/opla/categorie-grille.tsv").split("\n").slice(1)) {
  if (!l.trim()) continue;
  const [code, , grille] = l.split("\t");
  grillePourFeuille.set(code, grille);
}
const libelleTaille = new Map(); // code → libellé (sizes.txt, « 0M » → « 0 mois »)
for (const l of lire("docs/opla/sizes.txt").split("\n")) {
  if (!l.trim()) continue;
  const [code, titre] = l.split("|");
  if (!libelleTaille.has(code)) libelleTaille.set(code, titre ?? code);
}
const grilles = {};
for (const l of lire("docs/opla/grilles-tailles.tsv").split("\n").slice(1)) {
  if (!l.trim()) continue;
  const [nom, , codes] = l.split("\t");
  grilles[nom] = nom === "G0" ? [] : codes.split(",").filter(Boolean);
}

// ── Contrôles d'intégrité — une faute ici partirait en base ─────────────────
const erreurs = [];
if (noeuds.length !== 1014) erreurs.push(`1014 nœuds attendus, ${noeuds.length} lus`);
const feuilles = noeuds.filter((n) => n.feuille);
if (feuilles.length !== 886) erreurs.push(`886 feuilles attendues, ${feuilles.length}`);
if ((enfants.get("") ?? []).length !== 8) erreurs.push(`8 racines attendues, ${(enfants.get("") ?? []).length}`);
for (const n of noeuds) {
  if (n.parent && !parCode.has(n.parent)) erreurs.push(`parent inconnu : ${n.code} → ${n.parent}`);
  if (n.feuille === enfants.has(n.code)) erreurs.push(`feuille/enfants incohérents : ${n.code}`);
}
for (const f of feuilles) if (!grillePourFeuille.has(f.code)) erreurs.push(`feuille sans grille : ${f.code}`);
for (const [c, g] of grillePourFeuille) {
  if (!parCode.get(c)?.feuille) erreurs.push(`grille posée sur un non-feuille : ${c}`);
  if (!(g in grilles)) erreurs.push(`grille inconnue : ${g} (${c})`);
}
const plates = Object.values(grilles).flat();
if (plates.length !== 150) erreurs.push(`150 entrées de taille attendues, ${plates.length}`);
if (new Set(plates).size !== 143) erreurs.push(`143 codes uniques attendus, ${new Set(plates).size}`);
for (const t of plates) if (!libelleTaille.has(t)) erreurs.push(`taille sans libellé : ${t}`);
if (erreurs.length) {
  console.error("✗ SOURCE INCOHÉRENTE :\n  " + erreurs.slice(0, 20).join("\n  "));
  process.exit(1);
}

// ═══ ARTEFACT 1 : le module serveur ════════════════════════════════════════
// Dictionnaire de libellés + nœuds compacts : même principe que les index de
// feuilles de l'app (un libellé écrit une seule fois).
const dico = [];
const idxDico = new Map();
const clef = (s) => {
  if (!idxDico.has(s)) { idxDico.set(s, dico.length); dico.push(s); }
  return idxDico.get(s);
};
const codes = noeuds.map((n) => n.code);
const idxCode = new Map(codes.map((c, i) => [c, i]));
const NOMS_GRILLE = Object.keys(grilles);
const compact = noeuds.map((n) => [
  clef(n.titre),
  n.parent ? idxCode.get(n.parent) : -1,
  n.feuille ? NOMS_GRILLE.indexOf(grillePourFeuille.get(n.code)) : -1,
]);

const ts = `// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
//   node scripts/gen-opla-catalogue.mjs
// Source : docs/opla/categories.tsv + categorie-grille.tsv + grilles-tailles.tsv
//          + sizes.txt (relevés phase 0, REVÉRIFIÉS contre le live le 2026-09-16)
// ${noeuds.length} nœuds, ${feuilles.length} feuilles, ${(enfants.get("") ?? []).length} racines, ${NOMS_GRILLE.length} grilles.
//
// ⛔ LES CODES DE TAILLE SONT EN DOUBLE : 150 entrées pour 143 codes uniques.
//    TAILLE_UNIQUE et XS…XXL vivent en G1 (vêtements) ET en G4 (soutiens-gorge,
//    la seule feuille qui la porte). Valider une taille contre l'UNION accepte
//    donc « 90C » sur un t-shirt — et Opla, qui ne valide RIEN côté serveur,
//    l'écrirait sans broncher (docs/OPLA_RELEVE.md § 15.6). On valide TOUJOURS
//    contre la grille DE LA FEUILLE.
//
// ⛔ ET LA GRILLE NE SE DÉDUIT PAS DE LA BRANCHE : mesuré sur les 886 feuilles,
//    BELTS et GLOVES (femme) sont en G1 quand le reste des accessoires est en
//    G0 ; SOCKS_GIRLS_NEW est en G3 (pointures) ; HATS_GIRLS_NEW en G2 (âges)
//    quand GLOVES_GIRLS_NEW est en G0. On LIT la table, on ne raisonne pas.

const D: string[] = ${JSON.stringify(dico)};
const C: string[] = ${JSON.stringify(codes)};
/** [indice du libellé, indice du parent (-1 = racine), indice de grille (-1 = pas une feuille)] */
const N: ReadonlyArray<readonly [number, number, number]> = ${JSON.stringify(compact)};
const GRILLES: Record<string, string[]> = ${JSON.stringify(grilles)};
const NOMS_GRILLE: string[] = ${JSON.stringify(NOMS_GRILLE)};
const LIB_TAILLE: Record<string, string> = ${JSON.stringify(Object.fromEntries(libelleTaille))};

export interface OplaNoeud {
  code: string;
  titre: string;
  parent: string | null;
  feuille: boolean;
  grille: string | null;
}

const PAR_CODE = new Map<string, number>(C.map((c, i) => [c, i]));
const ENFANTS = new Map<string, string[]>();
for (let i = 0; i < N.length; i++) {
  const cle = N[i][1] === -1 ? "" : C[N[i][1]];
  const l = ENFANTS.get(cle);
  if (l) l.push(C[i]); else ENFANTS.set(cle, [C[i]]);
}

const noeudDe = (i: number): OplaNoeud => ({
  code: C[i],
  titre: D[N[i][0]],
  parent: N[i][1] === -1 ? null : C[N[i][1]],
  feuille: N[i][2] !== -1,
  grille: N[i][2] === -1 ? null : NOMS_GRILLE[N[i][2]],
});

/** Le nœud portant ce code, ou null. Jamais une approximation. */
export function oplaNoeud(code: string): OplaNoeud | null {
  const i = PAR_CODE.get(String(code ?? "").trim());
  return i === undefined ? null : noeudDe(i);
}

/** Les enfants DIRECTS d'un code — \`""\` rend les 8 racines. */
export function oplaEnfants(code: string): OplaNoeud[] {
  return (ENFANTS.get(String(code ?? "").trim()) ?? []).map((c) => noeudDe(PAR_CODE.get(c) as number));
}

/** Le chemin de libellés, de la racine à ce code. [] si le code est inconnu. */
export function oplaChemin(code: string): string[] {
  const out: string[] = [];
  let n = oplaNoeud(code);
  while (n) { out.unshift(n.titre); n = n.parent ? oplaNoeud(n.parent) : null; }
  return out;
}

/** Les tailles de CETTE feuille : [] si la catégorie n'a pas de champ Taille. */
export function oplaTaillesDe(code: string): Array<{ code: string; title: string }> {
  const n = oplaNoeud(code);
  if (!n?.grille) return [];
  return (GRILLES[n.grille] ?? []).map((t) => ({ code: t, title: LIB_TAILLE[t] ?? t }));
}

/**
 * ⛔ LA GARDE DES DOUBLONS. Une taille n'est valide que dans la grille de SA
 * feuille. \`oplaTailleValide("WOM_TOP_T_SHIRTS", "90C")\` rend false, alors que
 * « 90C » est un code de taille Opla parfaitement réel (G4, soutiens-gorge).
 * Une catégorie sans grille n'accepte AUCUNE taille — pas « toutes ».
 */
export function oplaTailleValide(code: string, taille: string): boolean {
  const t = String(taille ?? "").trim();
  if (!t) return false;
  const n = oplaNoeud(code);
  if (!n?.grille) return false;
  return (GRILLES[n.grille] ?? []).includes(t);
}

/**
 * ⛔ LE NIVEAU QUI A ÉCHOUÉ — le cœur de ce module.
 *
 * Défaut observé sur Vinted le 2026-09-16 (Blaf69, Achille Talon) : le job a
 * buté sur la FEUILLE « Bandes dessinées, mangas et romans graphiques » et
 * l'app a proposé les 8 RACINES du catalogue. L'utilisateur aurait rechoisi
 * « Livres et médias », qui était déjà bon, et rebuté au même endroit.
 * Une question qui ne peut pas débloquer est pire qu'une erreur : elle fait
 * perdre un geste ET la confiance.
 *
 * La règle, ici : on propose les enfants du nœud VALIDE LE PLUS PROFOND qu'on
 * connaisse. Trois entrées, dans l'ordre de fiabilité :
 *   · \`code\` est un nœud intermédiaire   → ses PROPRES enfants (il faut
 *     descendre d'un cran, pas remonter) ;
 *   · \`code\` est une feuille              → les FRÈRES (le voisinage du choix
 *     qui n'a pas convenu), jamais les racines ;
 *   · \`code\` est inconnu                  → on descend \`chemin\` (les libellés
 *     du job) tant qu'il matche, et on propose les enfants du dernier nœud
 *     reconnu. Les racines ne sont servies QUE si rien n'a été reconnu — le
 *     seul cas où elles sont la bonne réponse.
 */
export function oplaOptionsNiveauEchoue(
  code: string,
  chemin: string[] = [],
): { ancre: string | null; niveau: number; options: Array<{ code: string; title: string }> } {
  const rendre = (ancre: string | null, niveau: number) => ({
    ancre,
    niveau,
    options: oplaEnfants(ancre ?? "").map((n) => ({ code: n.code, title: n.titre })),
  });

  const n = oplaNoeud(code);
  if (n && !n.feuille) return rendre(n.code, oplaChemin(n.code).length);
  if (n && n.feuille) return rendre(n.parent, Math.max(0, oplaChemin(n.code).length - 1));

  // Code inconnu : on descend le chemin de libellés tant qu'il est reconnu.
  let ancre: string | null = null;
  let profondeur = 0;
  for (const segment of Array.isArray(chemin) ? chemin : []) {
    const cible = String(segment ?? "").trim().toLowerCase();
    if (!cible) break;
    const suivant = oplaEnfants(ancre ?? "").find((e) => e.titre.trim().toLowerCase() === cible);
    if (!suivant) break;
    if (suivant.feuille) return rendre(ancre, profondeur); // la feuille elle-même a échoué
    ancre = suivant.code;
    profondeur += 1;
  }
  return rendre(ancre, profondeur);
}
`;

// ═══ ARTEFACT 2 : la migration ═════════════════════════════════════════════
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// `category` : un nœud → ses enfants. Clé 'ROOT' pour le niveau racine.
const lignesCat = [...enfants.keys()].sort().map((cle) => {
  const opts = enfants.get(cle).map((c) => ({ code: c, title: parCode.get(c).titre }));
  return `  (${q(cle || "ROOT")}, ${q(JSON.stringify(opts))}::jsonb)`;
});

// `size` : une feuille AVEC grille → sa grille. Les G0 n'ont pas de ligne :
// une catégorie sans champ Taille ne doit pas en proposer une vide.
// ⚠️ La GRILLE est écrite UNE FOIS et jointe, jamais recopiée par feuille :
// 397 feuilles × la même liste de 14 tailles, c'était 350 Ko de répétition
// pour 5 listes distinctes, illisible à la relecture comme au diff.
const lignesGrille = Object.entries(grilles)
  .filter(([nom]) => nom !== "G0")
  .map(([nom, codes]) => {
    const opts = codes.map((t) => ({ code: t, title: libelleTaille.get(t) ?? t }));
    return `  (${q(nom)}, ${q(JSON.stringify(opts))}::jsonb)`;
  });
const feuillesAvecGrille = feuilles.filter((f) => grillePourFeuille.get(f.code) !== "G0");
const nbTaille = feuillesAvecGrille.length;
const lignesFeuille = feuillesAvecGrille.map((f) => `  (${q(f.code)}, ${q(grillePourFeuille.get(f.code))})`);

// ── INSTRUCTIONS INDÉPENDANTES, et c'est délibéré (2026-09-16) ─────────────
// La migration était UNE seule instruction de 80 Ko — impossible à appliquer
// autrement que d'un bloc, donc impossible à reprendre si l'envoi casse en
// chemin. Chaque INSERT ci-dessous se suffit à lui-même et porte son propre
// ON CONFLICT : rejouable seul, dans n'importe quel ordre, autant de fois
// qu'on veut. Le begin/commit du fichier reste là pour l'application nominale
// (tout ou rien) ; une reprise à la main peut les rejouer un par un.
const QUEUE = `on conflict (platform, category_key, field_key) do update
  set allowed_values = excluded.allowed_values,
      field_label    = excluded.field_label,
      input_type     = excluded.input_type,
      required       = excluded.required,
      source         = excluded.source,
      last_seen_at   = now();`;

const TAILLE_BLOC = 45; // ~25 Ko par instruction
const blocsCategory = [];
for (let i = 0; i < lignesCat.length; i += TAILLE_BLOC) {
  const tranche = lignesCat.slice(i, i + TAILLE_BLOC);
  blocsCategory.push(
    `\n-- niveaux de choix ${i + 1} à ${i + tranche.length} sur ${lignesCat.length}\n` +
    `with niveaux (category_key, allowed_values) as (values\n${tranche.join(",\n")}\n)\n` +
    `insert into public.platform_category_aspects\n` +
    `  (platform, category_key, field_key, field_label, required, input_type, allowed_values, source)\n` +
    `select 'opla', category_key, 'category', 'Catégorie', true, 'select', allowed_values, 'manual'\n` +
    `  from niveaux\n${QUEUE}\n`,
  );
}

const blocTaille =
  `\n-- les ${nbTaille} feuilles qui ont une grille — la grille est écrite UNE fois, et jointe\n` +
  `with grilles (nom, allowed_values) as (values\n${lignesGrille.join(",\n")}\n` +
  `), feuilles (category_key, nom) as (values\n${lignesFeuille.join(",\n")}\n)\n` +
  `insert into public.platform_category_aspects\n` +
  `  (platform, category_key, field_key, field_label, required, input_type, allowed_values, source)\n` +
  `select 'opla', f.category_key, 'size', 'Taille', true, 'select', g.allowed_values, 'manual'\n` +
  `  from feuilles f join grilles g on g.nom = f.nom\n${QUEUE}\n`;

const sql = `-- ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
--   node scripts/gen-opla-catalogue.mjs
--
-- L'ARBRE OPLA EN BASE, dans platform_category_aspects, exactement comme
-- Vinted : c'est cette table que get-pending-jobs sert au needs_user typé.
-- Source : docs/opla/*.tsv (phase 0, revérifiés contre le live le 2026-09-16).
--
-- DEUX SORTES DE LIGNES, et c'est tout :
--   field_key='category' — ${enfants.size} lignes, une par nœud AYANT des enfants
--     (clé 'ROOT' pour le niveau racine). allowed_values = [{code,title}] des
--     enfants DIRECTS. C'est ce qui permet de proposer LE NIVEAU QUI A ÉCHOUÉ
--     au lieu des racines (défaut Blaf69 du 16/09 côté Vinted).
--   field_key='size'     — ${nbTaille} lignes, une par feuille AYANT une grille.
--     ⛔ Les 489 feuilles en G0 n'ont PAS de ligne : une catégorie sans champ
--     Taille ne doit pas en proposer une liste vide.
--
-- ⛔ IDEMPOTENTE. Réappliquée, elle réécrit les mêmes valeurs et ne touche
--    AUCUNE autre plateforme (le ON CONFLICT porte sur la clé complète, et
--    tout est borné à platform='opla').
-- ⛔ source='manual' : la colonne porte une CHECK fermée (dom / server_400 /
--    manual) — lue en prod le 16/09, après un premier envoi refusé en 23514.
--    Ces lignes ne sont ni un relevé DOM ni un refus serveur : elles sont
--    posées délibérément depuis docs/opla/*.tsv. 'manual' est le seul des trois
--    qui dise vrai, et l'ouvrir à une 4e valeur aurait demandé un DDL sur une
--    table que quatre plateformes alimentent — hors du périmètre de ce lot.
-- ⛔ N'ACTIVE RIEN : ce sont des données. OPLA_ACTIF et
--    PLATFORM_HANDLERS.opla.implemented restent false.

-- ⛔ AUCUN DDL ICI, ET C'EST UNE CORRECTION DU 16/09 AVANT APPLICATION.
-- Cette migration créait \`platform_category_aspects_cle_unique\` en
-- \`if not exists\`. Or l'unicité (platform, category_key, field_key) EXISTE
-- DÉJÀ, sous le nom que Postgres a donné à la contrainte de table :
-- \`platform_category_aspects_platform_category_key_field_key_key\` (lu en prod).
-- \`if not exists\` ne teste que le NOM : un second index unique, identique
-- colonne pour colonne, serait parti en prod pour rien — écriture ralentie sur
-- une table que quatre plateformes alimentent en continu.
-- Le ON CONFLICT ci-dessous vise par LISTE DE COLONNES, pas par nom : il
-- s'appuie sur la contrainte existante, sans rien créer.

begin;
${blocsCategory.join("\n")}
${blocTaille}
commit;
`;

// ── Écriture (ou vérification) ──────────────────────────────────────────────
const sorties = [
  ["supabase/functions/_shared/opla-catalogue.ts", ts],
  ["supabase/migrations/20260916150000_opla_catalogue.sql", sql],
];
let divergent = 0;
for (const [rel, contenu] of sorties) {
  const chemin = join(ROOT, rel);
  if (VERIFIER) {
    const actuel = fs.existsSync(chemin) ? fs.readFileSync(chemin, "utf8").replace(/\r\n/g, "\n") : null;
    const ok = actuel === contenu;
    console.log(`  ${ok ? "ok  " : "KO  "} ${rel}${ok ? "" : actuel === null ? " — ABSENT" : " — DIVERGENT du générateur"}`);
    if (!ok) divergent += 1;
  } else {
    fs.writeFileSync(chemin, contenu);
    console.log(`✓ ${rel} (${(contenu.length / 1024).toFixed(1)} Ko)`);
  }
}
if (!VERIFIER) {
  console.log(`\n  ${noeuds.length} nœuds · ${feuilles.length} feuilles · ${enfants.size} niveaux de choix · ${nbTaille} feuilles avec grille`);
  console.log(`  ${lignesCat.length + nbTaille} lignes en base (${lignesCat.length} category + ${nbTaille} size) · ${new Set(plates).size} codes de taille uniques pour ${plates.length} entrées`);
}
process.exit(divergent ? 1 : 0);
