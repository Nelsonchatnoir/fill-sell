// Une requête SQL en LECTURE SEULE sur la prod : `npx supabase db query --linked --read-only -f <fichier> -o json`
// (lancée depuis le dépôt, jamais autre chose). Reprises sur une erreur réseau ; une erreur SQL est rendue telle quelle.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const W = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DEPOT = 'C:\\Users\\nicol\\fill-and-sell';

export function requete(sql, nomFichier = '_requete.sql') {
  if (/\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i.test(sql.replace(/'[^']*'/g, '').replace(/\$k\$[\s\S]*?\$k\$/g, ''))) {
    throw new Error('requête refusée : lecture seule');
  }
  const sqlF = path.join(W, 'sql', nomFichier);
  fs.writeFileSync(sqlF, sql);
  for (let essai = 1; ; essai++) {
    try {
      const out = execFileSync('npx.cmd', ['supabase', 'db', 'query', '--linked', '--read-only', '-f', sqlF, '-o', 'json'],
        { cwd: DEPOT, encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'], shell: true });
      const j = JSON.parse(out.slice(out.indexOf('{')));
      return j.rows;
    } catch (e) {
      if (essai >= 5 || /Failed to run sql query/.test(String(e.stderr ?? ''))) {
        throw new Error(String(e.stderr ?? e.message).split('\n').filter((l) => !/Warning|Target:/.test(l)).join(' ').slice(0, 600));
      }
      console.error('reprise', essai, String(e.message).slice(0, 200));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000 * essai);
    }
  }
}
