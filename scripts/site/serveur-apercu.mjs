#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceVersRegex } from './routes-app.mjs';

// Serveur d'aperçu du site vitrine (09/10/2026) — `npm run site:serveur [dossier]`.
//
// `vite preview` ne lit pas vercel.json : il servirait l'accueil statique sur
// /app, et la vérification locale mentirait (revue A M4). Ce serveur REJOUE
// vercel.json, dans l'ordre de Vercel :
//   1. trailingSlash: false → /x/ répond 308 vers /x (query gardée) ;
//   2. redirects (permanent → 308, sinon 307) ;
//   3. le DISQUE d'abord (un dossier sert son index.html : /blog/x →
//      blog/x/index.html) — « precedence is given to the filesystem prior to
//      rewrites being applied » (doc vercel.json) ;
//   4. rewrites (premier qui correspond) ;
//   5. sinon 404.html (statut 404).
// Les en-têtes de vercel.json s'appliquent au chemin DEMANDÉ (jamais à la
// destination d'un rewrite) ; pour une même clé, la dernière règle gagne.
// Ce n'est pas Vercel : la prévisualisation reste la preuve du routage réel.

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.avif': 'image/avif', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.zip': 'application/zip', '.webmanifest': 'application/manifest+json',
};

export function creerServeur(dossier, { racine = process.cwd() } = {}) {
  const config = JSON.parse(readFileSync(path.join(racine, 'vercel.json'), 'utf8'));
  const prep = (liste) => (liste ?? []).map((r) => ({ ...r, regex: sourceVersRegex(r.source) }));
  const enTetes = prep(config.headers);
  const redirections = prep(config.redirects);
  const reecritures = prep(config.rewrites);

  // Casse EXACTE, segment par segment (09/10, revue de la fondation M-10) :
  // Windows ne la distingue pas, Vercel si — /FAQ répondait 200 ici et 404
  // en prod.
  const existeTelQuel = (morceaux) => {
    let d = dossier;
    for (const m of morceaux) {
      if (!existsSync(d) || !statSync(d).isDirectory() || !readdirSync(d).includes(m)) return false;
      d = path.join(d, m);
    }
    return true;
  };
  const fichierPour = (chemin) => {
    let morceaux;
    try { morceaux = decodeURIComponent(chemin).split('/').filter(Boolean); } catch { return null; }
    if (morceaux.some((m) => m === '..')) return null;
    const f = path.join(dossier, ...morceaux);
    if (existeTelQuel(morceaux) && statSync(f).isFile()) return f;
    const idx = path.join(f, 'index.html');
    if (existeTelQuel([...morceaux, 'index.html'])) return idx;
    return null;
  };

  return createServer((req, res) => {
    const url = new URL(req.url, 'http://apercu.local');
    const chemin = url.pathname;
    const search = url.search;
    const entetes = {};
    for (const r of enTetes) {
      if (!r.regex.test(chemin)) continue;
      for (const h of r.headers) entetes[h.key.toLowerCase()] = h.value;
    }
    const envoyer = (statut, fichier, extra = {}) => {
      let corps = fichier ? readFileSync(fichier) : Buffer.from(String(statut));
      const type = fichier ? (TYPES[path.extname(fichier)] ?? 'application/octet-stream') : 'text/plain; charset=utf-8';
      // Compression des textes, comme Vercel (brotli, sinon gzip) : sans elle,
      // les mesures locales (Lighthouse) comptaient l'accueil en clair (~80 Ko
      // au lieu de ~20 Ko), et le chargement simulé mentait (09/10).
      const compression = {};
      const accepte = String(req.headers['accept-encoding'] ?? '');
      if (/^(text\/|application\/(json|xml|manifest)|image\/svg)/.test(type) && corps.length > 1024) {
        if (/\bbr\b/.test(accepte)) { corps = brotliCompressSync(corps); compression['content-encoding'] = 'br'; }
        else if (/\bgzip\b/.test(accepte)) { corps = gzipSync(corps); compression['content-encoding'] = 'gzip'; }
        if (compression['content-encoding']) compression.vary = 'Accept-Encoding';
      }
      res.writeHead(statut, { 'content-type': type, ...entetes, ...extra, ...compression, 'x-apercu-servi': fichier ? path.relative(dossier, fichier).split(path.sep).join('/') : '-' });
      res.end(req.method === 'HEAD' ? undefined : corps);
    };

    if (config.trailingSlash === false && chemin !== '/' && chemin.endsWith('/')) {
      return envoyer(308, null, { location: chemin.replace(/\/+$/, '') + search });
    }
    for (const r of redirections) {
      if (r.regex.test(chemin)) return envoyer(r.permanent ? 308 : 307, null, { location: r.destination + search });
    }
    const fichier = fichierPour(chemin);
    if (fichier) return envoyer(200, fichier);
    for (const r of reecritures) {
      if (!r.regex.test(chemin)) continue;
      const dest = fichierPour(r.destination);
      return dest ? envoyer(200, dest) : envoyer(404, fichierPour('/404.html'));
    }
    const page404 = fichierPour('/404.html');
    return envoyer(404, page404);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dossier = path.resolve(racine, process.argv[2] ?? path.join('build', 'site-apercu'));
  if (!existsSync(dossier)) {
    console.error(`[site:serveur] ${dossier} introuvable — lance d'abord npm run site:apercu`);
    process.exit(1);
  }
  const port = Number(process.env.PORT ?? 4319);
  creerServeur(dossier, { racine }).listen(port, '127.0.0.1', () => {
    console.log(`[site:serveur] ${path.relative(racine, dossier)} servi comme sur Vercel : http://127.0.0.1:${port}/`);
  });
}
