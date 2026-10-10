import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// JS et CSS du site vitrine (09/10/2026) : rolldown (déjà là, avec Vite 8) et
// lightningcss — aucune dépendance de plus. Chargés à la demande : le serveur
// de dev et les builds natifs ne les touchent jamais (revue A M5).

export const BUDGET_SITE_JS_GZIP = 6 * 1024;
// Budget de CSS EN LIGNE, PAR PAGE (09/10, design final) : 24 Ko minifiés. La revue C
// (§ 5.1) fixait ~20 Ko pour une feuille unique (« landing + base + blog : 21 Ko ») ;
// la feuille est désormais découpée en modules et chaque page n'en met en ligne que ce
// qu'elle emploie — la plupart des pages restent sous 20 Ko, l'accueil (héros, étapes,
// fonctions, vidéo, comparaison, tarifs) en porte ~22 Ko (~5,5 Ko gzip). Mesures et
// Lighthouse : docs/seo/design/DESIGN.md.
// Relevé à 26 Ko le 09/10 (nuit, intégration de la rédaction) : l'accueil RÉEL ajoute
// aux 9 modules de la démonstration les pages liées (liees), un tableau (defile) et la
// capture de l'extension en fenêtre (cadres) — 25 638 o mesurés ; le socle n'a presque
// rien d'inutile à l'accueil (485 o au plus, dont des classes posées par le JS).
// Relevé à 30 Ko le 10/10 (Nico : cartes de prix au dessin EXACT des cartes de palier de
// l'app, badges animés compris — module tarifs 1,7 → 5,2 Ko ; menu refait) : 29 211 o
// mesurés sur l'accueil, Lighthouse mobile de l'accueil repassé (mesure dans le commit).
export const BUDGET_CSS = 30 * 1024;

/** Bundle IIFE minifié d'une entrée ; `define` remplace les constantes __FS_…__. */
export async function bundler(entree, { racine, define = {} }) {
  const { build } = await import('rolldown');
  const sortie = await build({
    input: entree,
    cwd: racine,
    platform: 'browser',
    write: false,
    logLevel: 'warn',
    transform: { define: Object.fromEntries(Object.entries(define).map(([k, v]) => [k, JSON.stringify(v)])) },
    output: { format: 'iife', minify: true },
  });
  const morceaux = sortie.output.filter((o) => o.type === 'chunk');
  if (morceaux.length !== 1) {
    throw new Error(`[site] ${path.relative(racine, entree)} : ${morceaux.length} morceaux produits, un seul attendu (aucun import dynamique sur le site, revue A I4)`);
  }
  const code = morceaux[0].code.trim();
  for (const nom of Object.keys(define)) {
    if (code.includes(nom)) throw new Error(`[site] ${path.relative(racine, entree)} : constante ${nom} non remplacée`);
  }
  return code;
}

/** CSS du site, police à empreinte posée, minifiée ; lève au-delà du budget. */
// Marqueur d'un MODULE de la feuille : `/* @module <nom> : <classe> <classe>… */`.
// Tout ce qui précède le premier marqueur est le SOCLE (toutes les pages).
// Classe spéciale `@js` : module JAMAIS mis en ligne, passé à site.js (bandeaux
// injectés au chargement : consentement, suggestion de langue).
const MARQUEUR_MODULE = /\/\*\s*@module\s+([a-z0-9-]+)\s*:\s*([@a-z0-9_ -]+?)\s*\*\//g;

/**
 * CSS du site, police à empreinte posée, découpée en socle + modules,
 * chacun minifié. Rend { socle, modules: [{ nom, classes, css }], pour(html) } :
 * `pour(html)` = le socle et les SEULS modules dont une classe apparaît dans
 * ce HTML — c'est ce qui se met en ligne dans la page, et c'est CETTE feuille
 * qui doit tenir le budget de 20 Ko (revue C § 5.1 : « ≤ 20 Ko brut » en ligne).
 */
export async function preparerCss(source, { remplacements }) {
  const { transform } = await import('lightningcss');
  let css = await readFile(source, 'utf8');
  for (const [jeton, url] of Object.entries(remplacements)) {
    if (!css.includes(jeton)) throw new Error(`[site] site.css : jeton « ${jeton} » introuvable`);
    css = css.split(jeton).join(url);
  }
  const minifier = (texte, nom) => {
    const { code } = transform({ filename: `site.css (${nom})`, code: Buffer.from(texte), minify: true });
    return code.toString('utf8');
  };
  const marques = [...css.matchAll(MARQUEUR_MODULE)];
  const socle = minifier(marques.length ? css.slice(0, marques[0].index) : css, 'socle');
  const modules = marques.map((m, i) => ({
    nom: m[1],
    classes: m[2].trim().split(/\s+/),
    css: minifier(css.slice(m.index + m[0].length, marques[i + 1]?.index ?? css.length), m[1]),
  }));
  const noms = new Set();
  for (const m of modules) {
    if (noms.has(m.nom)) throw new Error(`[site] site.css : module « ${m.nom} » en double`);
    noms.add(m.nom);
  }
  const enLigne = modules.filter((m) => !m.classes.includes('@js'));
  const pour = (html) => {
    const presentes = new Set();
    for (const c of html.matchAll(/\bclass="([^"]*)"/g)) for (const x of c[1].split(/\s+/)) presentes.add(x);
    const retenus = enLigne.filter((m) => m.classes.some((c) => presentes.has(c)));
    const sortie = socle + retenus.map((m) => m.css).join('');
    if (Buffer.byteLength(sortie) > BUDGET_CSS) {
      const detail = [`socle ${Buffer.byteLength(socle)} o`, ...retenus.map((m) => `${m.nom} ${Buffer.byteLength(m.css)} o`)].join(', ');
      throw new Error(`[site] CSS en ligne : ${Buffer.byteLength(sortie)} o minifiés pour une page, budget ${BUDGET_CSS} o (revue C § 5.1) — ${detail}`);
    }
    return sortie;
  };
  const pourJs = Object.fromEntries(modules.filter((m) => m.classes.includes('@js')).map((m) => [m.nom, m.css]));
  return { socle, modules, pour, pourJs };
}

export const tailleGzip = (texte) => gzipSync(Buffer.from(texte), { level: 9 }).length;
