// selftest:site-blog-lecteurs — le site et la SPA lisent le blog PAREIL (09/10/2026).
//
// src/blog/*.md est la source unique des articles, partagée par deux lecteurs :
//   · la SPA (src/blog/posts.js : import.meta.glob + parseFrontmatter), qui
//     sert encore les articles en navigation interne ;
//   · le générateur du site (scripts/site/lib/contenu.mjs : lireArticlesBlog).
// Le jour où ils divergent, un article dit une chose aux robots et une autre
// aux visiteurs de l'app (revue C I8 : le premier `faq:` écrit en liste YAML
// serait lu par l'un et broyé par l'autre). Ce test prouve, sur les vrais
// fichiers :
//   1. même liste d'articles, même ordre, mêmes champs, même corps ;
//   2. le contrat « une ligne `clé: valeur` par champ » est tenu, et le YAML
//      (JSON_SCHEMA, celui du site) lit les mêmes valeurs — aucune valeur
//      tronquée en silence par l'un des deux ;
//   3. la FAQ du frontmatter (JSON-LD de la SPA) = la FAQ VISIBLE du corps
//      (JSON-LD du site, extrait du rendu).
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, slugFromPath, sortPosts } from '../src/blog/frontmatter.js';
import { lireArticlesBlog } from './site/lib/contenu.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
let passes = 0;
function ok(cond, message) {
  if (cond) { passes++; return; }
  echecs++;
  console.error(`  ✗ ${message}`);
}

// La SPA, rejouée à l'identique de posts.js (Vite donne le texte brut du fichier).
const dossier = path.join(racine, 'src', 'blog');
const noms = readdirSync(dossier).filter((f) => f.endsWith('.md'));
const bruts = Object.fromEntries(noms.map((n) => [n, readFileSync(path.join(dossier, n), 'utf8')]));
const spa = sortPosts(noms.map((n) => {
  const { data, content } = parseFrontmatter(bruts[n]);
  return { slug: slugFromPath(`./${n}`), ...data, content };
}));
const site = await lireArticlesBlog(racine);

// 1. Même lecture.
ok(spa.length === site.length && spa.length >= 6, `même nombre d'articles (SPA ${spa.length}, site ${site.length})`);
ok(JSON.stringify(spa.map((p) => p.slug)) === JSON.stringify(site.map((p) => p.slug)), 'même ordre éditorial');
const lf = (s) => String(s).replace(/\r\n/g, '\n');
for (const a of spa) {
  const b = site.find((x) => x.slug === a.slug);
  if (!b) { ok(false, `${a.slug} : absent du lecteur du site`); continue; }
  const champsA = Object.keys(a).filter((k) => k !== 'content').sort();
  const champsB = Object.keys(b).filter((k) => k !== 'content' && k !== 'fichier').sort();
  ok(JSON.stringify(champsA) === JSON.stringify(champsB), `${a.slug} : champs différents (${champsA} / ${champsB})`);
  for (const k of champsA) ok(lf(a[k]) === lf(b[k]), `${a.slug} : champ « ${k} » lu différemment`);
  ok(lf(a.content) === lf(b.content), `${a.slug} : corps lu différemment`);
}

// 2. Contrat d'écriture, et accord avec le YAML du site.
const exiger = createRequire(import.meta.url);
const yaml = createRequire(exiger.resolve('gray-matter'))('js-yaml');
for (const n of noms) {
  const entete = /^---\r?\n([\s\S]*?)\r?\n---/.exec(bruts[n])?.[1];
  if (!entete) { ok(false, `${n} : frontmatter absent`); continue; }
  const lignes = entete.split(/\r?\n/).filter((l) => l.trim());
  ok(lignes.every((l) => /^[a-z_]+:\s/.test(l)), `${n} : une ligne hors du contrat « clé: valeur » (valeur sur plusieurs lignes ? la SPA la tronquerait)`);
  const lu = parseFrontmatter(bruts[n]).data;
  let enYaml;
  try { enYaml = yaml.load(entete, { schema: yaml.JSON_SCHEMA }); } catch (e) { ok(false, `${n} : frontmatter illisible en YAML (${e.message.split('\n')[0]})`); continue; }
  for (const [k, v] of Object.entries(enYaml)) {
    if (k === 'faq') {
      let json = null;
      try { json = JSON.parse(lu.faq); } catch { /* comparé ci-dessous */ }
      ok(JSON.stringify(json) === JSON.stringify(v), `${n} : faq lue différemment (JSON d'une ligne côté SPA, YAML côté site)`);
    } else {
      ok(typeof v === 'string' && v === lu[k], `${n} : « ${k} » = ${JSON.stringify(v)} en YAML, ${JSON.stringify(lu[k])} pour la SPA`);
    }
  }
}

// 3. FAQ du frontmatter = FAQ visible.
const norm = (s) => String(s).replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();
for (const p of site.filter((x) => x.faq)) {
  let faq = [];
  try { faq = JSON.parse(p.faq); } catch { ok(false, `${p.slug} : faq illisible`); continue; }
  const corps = lf(p.content);
  const debut = corps.search(/^## (FAQ|Questions fréquentes|Frequently asked questions)\s*$/m);
  ok(debut >= 0, `${p.slug} : faq en frontmatter mais aucune section FAQ visible`);
  const visibles = [...corps.slice(debut).matchAll(/^### (.+)$/gm)].map((m) => norm(m[1]));
  ok(JSON.stringify(faq.map((q) => norm(q.q))) === JSON.stringify(visibles),
    `${p.slug} : questions du frontmatter ≠ questions visibles\n      frontmatter : ${faq.map((q) => q.q).join(' | ')}\n      visibles    : ${visibles.join(' | ')}`);
}

console.log(`selftest:site-blog-lecteurs — ${passes} vérifications passées, ${echecs} échec(s) (${site.length} articles)`);
process.exit(echecs ? 1 : 0);
