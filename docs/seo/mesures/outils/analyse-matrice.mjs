// Analyse des réponses relevées par matrice-robots.sh (<dossier>/m/index.tsv) : une ligne par URL × robot.
// Usage : node docs/seo/mesures/outils/analyse-matrice.mjs <dossier>
// Écrit <dossier>/m/parsed.json et affiche le tableau « code HTTP / mots visibles sans JS ».
import { readFileSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] || '.';
const rows = readFileSync(`${dir}/m/index.tsv`, 'utf8').trim().split('\n').map(l => l.split('\t'));

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

function visibleWords(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let b = m ? m[1] : '';
  b = b.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  b = decode(b);
  const words = b.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
  return { count: words.length, sample: words.slice(0, 12).join(' ') };
}

const pick = (html, re) => { const m = html.match(re); return m ? decode(m[1]).trim() : ''; };

function lastHeaderBlock(h) {
  const blocks = h.split(/\r?\n\r?\n/).filter(b => /^HTTP\//.test(b.trim()));
  const last = blocks[blocks.length - 1] || '';
  const map = {};
  for (const line of last.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(':');
    if (i > 0) map[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { status: (last.split(/\r?\n/)[0] || '').trim(), map, chain: blocks.map(b => b.split(/\r?\n/)[0].trim()) };
}

const out = [];
for (const [ua, url, f, code, sizeDl, nRedir, effective, time] of rows) {
  const body = readFileSync(`${dir}/${f}.b`, 'utf8');
  const hdr = lastHeaderBlock(readFileSync(`${dir}/${f}.h`, 'utf8'));
  const w = visibleWords(body);
  const ldTypes = [...body.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => { try { const o = JSON.parse(m[1]); return o['@type']; } catch { return '?'; } });
  out.push({
    ua, url, code: +code, octets_transferes: +sizeDl, octets_html: Buffer.byteLength(body), redirections: +nRedir, url_finale: effective, temps_s: +time,
    mots_visibles: w.count, debut_texte: w.sample,
    title: pick(body, /<title>([^<]*)<\/title>/i),
    description: pick(body, /<meta name="description" content="([^"]*)"/i),
    canonical: pick(body, /<link rel="canonical" href="([^"]*)"/i),
    meta_robots: pick(body, /<meta name="robots" content="([^"]*)"/i),
    h1: pick(body, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, ''),
    jsonld: ldTypes,
    hreflang: [...body.matchAll(/hreflang="([^"]*)" href="([^"]*)"/g)].map(m => `${m[1]}→${m[2].replace('https://fillsell.app', '') || '/'}`),
    x_robots_tag: hdr.map['x-robots-tag'] || '',
    cf_mitigated: hdr.map['cf-mitigated'] || '',
    just_a_moment: /Just a moment|cf-chl|challenge-platform/i.test(body),
    bloque_cf: /Your request was blocked/i.test(body),
    content_encoding: hdr.map['content-encoding'] || '',
    cache_control: hdr.map['cache-control'] || '',
    x_vercel_cache: hdr.map['x-vercel-cache'] || '',
    cf_cache_status: hdr.map['cf-cache-status'] || '',
    age: hdr.map['age'] || '',
    server: hdr.map['server'] || '',
    vercel_id: hdr.map['x-vercel-id'] ? 'oui' : 'non',
  });
}
writeFileSync(`${dir}/m/parsed.json`, JSON.stringify(out, null, 1));

// Tableau compact URL × robot : code/mots
const uas = [...new Set(out.map(o => o.ua))];
const urls = [...new Set(out.map(o => o.url))];
console.log(['URL', ...uas].join(' | '));
for (const u of urls) {
  console.log([u, ...uas.map(a => { const o = out.find(x => x.ua === a && x.url === u); return `${o.code}/${o.mots_visibles}`; })].join(' | '));
}
// Variations de contenu entre robots (hors 403) pour une même URL
console.log('\n--- variations entre robots (200 seulement) ---');
for (const u of urls) {
  const ok = out.filter(o => o.url === u && o.code === 200);
  const sig = new Set(ok.map(o => `${o.octets_html}|${o.title}|${o.canonical}|${o.mots_visibles}`));
  console.log(u, 'signatures distinctes:', sig.size, [...sig].join(' ## ').slice(0, 300));
}
