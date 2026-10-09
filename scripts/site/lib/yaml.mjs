import { createRequire } from 'node:module';

// Lecteur YAML du site vitrine (09/10/2026) — UN seul, partagé par le
// frontmatter des pages (contenu.mjs) et les données (donnees.mjs).
//
// Pièges mesurés par la revue C (I8) et fermés ici :
//   · JSON_SCHEMA : `publie: 2026-10-09` reste une CHAÎNE (le schéma par
//     défaut en ferait un objet Date, écrit « Fri Oct 09 2026 … » dans la page) ;
//   · js-yaml est celui de gray-matter (3.x, déclaré par le dépôt), pas le 4.x
//     hissé là par eslint : un nettoyage des devDependencies ne le fera pas
//     disparaître sous nos pieds. S'il manque, on le dit, on ne devine pas.

const exiger = createRequire(import.meta.url);
export const matter = exiger('gray-matter');
export const yaml = createRequire(exiger.resolve('gray-matter'))('js-yaml');
if (typeof yaml.load !== 'function' || !yaml.JSON_SCHEMA) {
  throw new Error('[site] js-yaml de gray-matter introuvable ou inattendu : le YAML du site ne peut pas être lu sans JSON_SCHEMA');
}

/** YAML → objet, dates gardées en chaînes. */
export const lireYaml = (texte) => yaml.load(texte, { schema: yaml.JSON_SCHEMA }) ?? {};

/** Moteurs de gray-matter : le même lecteur pour le frontmatter. */
export const MOTEURS = { yaml: lireYaml };
