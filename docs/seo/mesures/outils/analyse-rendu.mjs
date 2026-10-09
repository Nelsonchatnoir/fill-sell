// Compte les mots visibles, le <title>, le canonical et le <h1> du DOM rendu (sortie de rendu-js.sh).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const index = process.argv[2];
const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
const pick = (h, re) => { const m = h.match(re); return m ? decode(m[1]).replace(/<[^>]+>/g, '').trim() : ''; };
for (const line of readFileSync(index, 'utf8').trim().split('\n')) {
  const [url, file] = line.split('\t');
  const html = readFileSync(path.join(path.dirname(index), file), 'utf8');
  let b = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, ''])[1];
  b = b.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const mots = decode(b).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  console.log([url, `mots=${mots}`, `lang=${pick(html, /<html[^>]*lang="([^"]*)"/i)}`,
    `title=${pick(html, /<title>([^<]*)<\/title>/i).slice(0, 70)}`,
    `canonical=${pick(html, /<link rel="canonical" href="([^"]*)"/i)}`,
    `robots=${pick(html, /<meta name="robots" content="([^"]*)"/i)}`,
    `h1=${pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).slice(0, 70)}`].join(' | '));
}
