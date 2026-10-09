#!/usr/bin/env node
// `npm run site:indexnow-liste -- <sitemap d'avant> [sitemap d'après]` (09/10/2026).
//
// Les URL à signaler à IndexNow après une mise en ligne : celles dont le
// lastmod a changé, les nouvelles, les retirées — calculées en comparant le
// sitemap SERVI avant le déploiement au sitemap du nouveau build. Remplace
// l'indexnow.json que le générateur écrivait (revue de la fondation M-8) :
// servi publiquement, et faux dès qu'un lot comptait plusieurs commits (il se
// comparait à HEAD^, alors que la règle du dépôt est « commits séparés, UN
// push »). Ce script n'ENVOIE rien : l'envoi est un geste après la mise en
// production, derrière le GO de Nico (revue B M3).
//
//   <sitemap d'avant>  un fichier, ou l'URL https://… du sitemap servi
//   [sitemap d'après]  un fichier (défaut : build/site-apercu/sitemap.xml)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** { loc → lastmod|null } d'un sitemap. */
export function lireSitemap(xml) {
  return new Map([...String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => [
    /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1],
    /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1] ?? null,
  ]).filter(([loc]) => loc));
}

/** Rend { changees, nouvelles, retirees } entre deux sitemaps. */
export function comparerSitemaps(avant, apres) {
  const a = lireSitemap(avant);
  const b = lireSitemap(apres);
  return {
    changees: [...b].filter(([u, d]) => a.has(u) && a.get(u) !== d).map(([u]) => u),
    nouvelles: [...b.keys()].filter((u) => !a.has(u)),
    retirees: [...a.keys()].filter((u) => !b.has(u)),
  };
}

async function lire(source) {
  if (/^https:\/\//.test(source)) {
    const r = await fetch(source, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`${source} : HTTP ${r.status}`);
    return r.text();
  }
  return readFileSync(source, 'utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const [avant, apres = path.join(racine, 'build', 'site-apercu', 'sitemap.xml')] = process.argv.slice(2);
  if (!avant) {
    console.error('usage : npm run site:indexnow-liste -- <sitemap d\'avant : fichier ou https://…> [sitemap d\'après]');
    process.exit(2);
  }
  const { changees, nouvelles, retirees } = comparerSitemaps(await lire(avant), await lire(apres));
  for (const u of changees) console.log(`modifiée  ${u}`);
  for (const u of nouvelles) console.log(`nouvelle  ${u}`);
  for (const u of retirees) console.log(`retirée   ${u}`);
  console.log(`[indexnow] ${changees.length + nouvelles.length + retirees.length} URL à signaler (rien n'est envoyé)`);
}
