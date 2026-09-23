// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR — LA BRANCHE VINTED D'UN catalog_id
// ═══════════════════════════════════════════════════════════════════════════
// Source : docs/vinted-catalog-tree.json, l'arbre relevé chez Vinted
// (8 racines, ~2900 identifiants). Deux tables en sortent :
//   · BRANCHE — le GENRE que la racine — et, sous Enfants, le rayon — porte.
//     Les racines non genrées (Maison, Électronique, Sport…) ne sont PAS
//     émises : un identifiant absent veut dire « cette étagère ne dit aucun
//     genre », ce qui est exactement le comportement d'avant ;
//   · ETAGERE — le CHEMIN de l'étagère (2026-09-23), pour TOUS les
//     identifiants. Le vendeur a rangé son article sur « Femmes › Chaussures ›
//     Chaussures à talons » : ce libellé est celui d'une feuille Opla, et le
//     lire vaut mieux qu'un mot d'IA (« escarpins ») que le catalogue Opla ne
//     connaît pas (job 796582df, 23/09).
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
// Le chemin de CHAQUE étagère, racine comprise (« Femmes › Chaussures ›
// Chaussures à talons »). Le séparateur est celui des chemins Opla
// (SEPARATEUR_CHEMIN de _shared/opla-resolution.ts) — aucun libellé Vinted ne
// le contient, vérifié à la génération.
const SEP = " › ";
const etageres = new Map();
const cheminDe = (n, chemin) => {
  const c = [...chemin, String(n.t ?? "").trim()];
  if (c.some((t) => t.includes(SEP.trim()))) throw new Error(`libellé Vinted contenant le séparateur : ${c.join(" | ")}`);
  if (n.id != null) etageres.set(Number(n.id), c.join(SEP));
  for (const e of n.c || []) cheminDe(e, c);
};
for (const racine of arbre) cheminDe(racine, []);

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
const lignesEtageres = [...etageres.entries()].sort((a, b) => a[0] - b[0]).map(([id, c]) => `  ${id}: ${JSON.stringify(c)},`);

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

// ── LE CHEMIN DE L'ÉTAGÈRE, POUR TOUS LES IDENTIFIANTS (2026-09-23) ────────
// ⛔ CE N'EST TOUJOURS PAS UNE DÉDUCTION : c'est le libellé de l'étagère où le
//    VENDEUR a rangé son article. Opla et Vinted écrivent le même catalogue à
//    quelques mots près (714 feuilles Vinted sur 2 489 portent le libellé exact
//    d'une feuille Opla, mesuré à la génération du 23/09) : « Chaussures à
//    talons » est une feuille des deux côtés, là où le mot d'IA « escarpins »
//    n'est nulle part chez Opla (job 796582df). Le résolveur ne s'en sert que
//    par ÉGALITÉ EXACTE de libellé, jamais « au plus proche ».
// Relevé : ${etageres.size} étagères.
export const SEPARATEUR_ETAGERE = ${JSON.stringify(SEP)};
const ETAGERE: Readonly<Record<number, string>> = Object.freeze({
${lignesEtageres.join("\n")}
});

/**
 * L'étagère Vinted \`id\` : son chemin (racine comprise) et le genre qu'elle
 * porte. null si l'identifiant est inconnu de l'arbre relevé.
 */
export function etagereVinted(id: unknown): { id: number; chemin: string[]; genre: string | null } | null {
  const n = Number(id);
  if (!Number.isFinite(n) || !ETAGERE[n]) return null;
  return { id: n, chemin: ETAGERE[n].split(SEPARATEUR_ETAGERE), genre: BRANCHE[n] ?? null };
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

console.log(`[gen-vinted-branche] ${CIBLE} — ${table.size} identifiants genrés : ${Object.entries(compte).map(([g, n]) => `${n} ${g}`).join(", ")} ; ${etageres.size} étagères avec chemin`);
