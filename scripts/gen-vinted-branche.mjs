// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR — LA BRANCHE VINTED D'UN catalog_id
// ═══════════════════════════════════════════════════════════════════════════
// Source : docs/vinted-catalog-tree.json, l'arbre relevé chez Vinted
// (8 racines, ~2900 identifiants). On n'en garde que ce dont la résolution
// Opla a besoin : le GENRE que la racine — et, sous Enfants, le rayon — porte.
// Les racines non genrées (Maison, Électronique, Sport…) ne sont PAS émises :
// un identifiant absent veut dire « cette étagère ne dit aucun genre », ce qui
// est exactement le comportement d'avant.
//
//   node scripts/gen-vinted-branche.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "docs/vinted-catalog-tree.json";
const CIBLE = "supabase/functions/_shared/vinted-branche.ts";

// Les seules étagères de Vinted qui nomment un genre. Par IDENTIFIANT et pas
// par libellé : un renommage chez Vinted (« Femmes » → « Femme ») ne doit pas
// vider la table en silence.
const RACINE_GENRE = { 1904: "Femme", 5: "Homme" };
const ENFANTS = 1193;
const RAYON_GENRE = { 1195: "Fille", 1194: "Garçon" };

const arbre = JSON.parse(readFileSync(SOURCE, "utf8"));
const table = new Map();

const descendre = (n, genre) => {
  if (n.id != null && genre) table.set(Number(n.id), genre);
  for (const e of n.c || []) descendre(e, genre);
};

for (const racine of arbre) {
  const id = Number(racine.id);
  if (RACINE_GENRE[id]) { descendre(racine, RACINE_GENRE[id]); continue; }
  if (id !== ENFANTS) continue;
  // Sous Enfants, le rayon est plus précis que la racine : « Vêtements pour
  // filles » dit Fille, le reste (jouets, poussettes, literie) ne dit
  // qu'« Enfant » — et c'est déjà ce qui écarte les rayons adultes.
  table.set(id, "Enfant");
  for (const rayon of racine.c || []) descendre(rayon, RAYON_GENRE[Number(rayon.id)] ?? "Enfant");
}

const lignes = [...table.entries()].sort((a, b) => a[0] - b[0]).map(([id, g]) => `  ${id}: "${g}",`);
const compte = {};
for (const g of table.values()) compte[g] = (compte[g] ?? 0) + 1;

writeFileSync(CIBLE, `// ═══════════════════════════════════════════════════════════════════════════
// LA BRANCHE VINTED D'UN ARTICLE — FICHIER GÉNÉRÉ, NE PAS ÉDITER
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/gen-vinted-branche.mjs   (source : ${SOURCE})
//
// ⛔ CE N'EST PAS UNE DÉDUCTION. Quand un article vient du dressing Vinted, il
// porte le catalog_id de l'étagère où SON VENDEUR l'a rangé, relevé chez
// Vinted (\`inventaire.attributs.categorie_vinted\`, source « vinted_* »). Cette
// table ne fait que lire le nom de cette étagère. Un titre, une icône ou une
// reformulation d'IA ne valent pas ça — et n'entrent pas ici.
//
// ⛔ ELLE NE CONTIENT QUE LES RACINES GENRÉES (Femmes, Hommes, Enfants). Un
// identifiant ABSENT n'est pas une erreur : c'est « Maison », « Sport »,
// « Électronique »… — des étagères qui ne disent aucun genre. On rend null, et
// l'appelant se comporte exactement comme avant cette table.
//
// Relevé du ${new Date().toISOString().slice(0, 10)} : ${table.size} identifiants (${Object.entries(compte).map(([g, n]) => `${n} ${g}`).join(", ")}).
// ═══════════════════════════════════════════════════════════════════════════

const BRANCHE: Readonly<Record<number, string>> = Object.freeze({
${lignes.join("\n")}
});

/** Le genre que l'étagère Vinted \`id\` porte — null si elle n'en porte aucun. */
export function brancheVinted(id: unknown): string | null {
  const n = Number(id);
  return Number.isFinite(n) && BRANCHE[n] ? BRANCHE[n] : null;
}

/**
 * Le genre lu dans \`inventaire.attributs.categorie_vinted\`, tel que
 * \`src/utils/vintedAttributs.js\` l'écrit : { v: <catalog_id>, source, chemin? }.
 * ⛔ C'est l'IDENTIFIANT qui fait foi, jamais le \`chemin\` : le chemin est un
 *    libellé d'affichage, absent sur la plupart des lignes (31 sur 41 au
 *    relevé du 20/09) et sujet aux renommages. L'identifiant est stable.
 * @returns { genre, via } ou null.
 */
export function genreDeLEtagereVinted(cv: unknown): { genre: string; via: string } | null {
  if (!cv || typeof cv !== "object") return null;
  const e = cv as Record<string, unknown>;
  // Une valeur d'attribut n'a de sens QUE si elle vient d'un relevé : même
  // règle que \`valeurCertaine\` dans get-pending-jobs — jamais une chaîne nue,
  // jamais une valeur sans source.
  if (!/^(capture|vinted|releve)/.test(String(e.source ?? ""))) return null;
  const genre = brancheVinted(e.v);
  return genre ? { genre, via: \`étagère Vinted \${Number(e.v)}\` } : null;
}
`, "utf8");

console.log(`[gen-vinted-branche] ${CIBLE} — ${table.size} identifiants : ${Object.entries(compte).map(([g, n]) => `${n} ${g}`).join(", ")}`);
