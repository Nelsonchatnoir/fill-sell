// L'interrupteur du site vitrine statique (09/10/2026) — SEULE source de vérité.
//
// Pourquoi une fonction unique (revue A, M6) : le générateur du site et le
// prérendu du blog (scripts/vite-plugin-prerender-blog.mjs) écrivent tous deux
// dans le dossier de sortie. Deux prédicats séparés finiraient un jour par dire
// « les deux » (blog prérendu sur le gabarit de l'accueil statique) ou
// « aucun » (pas de sitemap, /sitemap.xml servi en 404). vite.config.js lit
// CETTE fonction pour choisir l'un OU l'autre, jamais les deux, jamais aucun.
//
// Pourquoi une variable à nous et pas `VERCEL` (revue A, B1) : `VERCEL=1`
// dépend d'un réglage du projet et manque en `vercel deploy --prebuilt`. Le
// générateur sauterait alors en silence. `FILLSELL_SITE=1` est posé
// explicitement par `npm run build:vercel` (scripts/site/build-vercel.mjs), lui-même
// nommé dans vercel.json (`buildCommand`) : l'interrupteur est versionné dans
// le même commit que les rewrites qu'il conditionne.
//
// Valeur stricte : « 1 » et rien d'autre. « true », « oui » ou une variable
// vide laissent le site ÉTEINT — un build natif ou OTA ne doit jamais
// l'allumer par accident (revue A, M4 : l'app native démarrerait sur la page
// marketing).

export function siteActif(env = process.env) {
  return env.FILLSELL_SITE === '1';
}
