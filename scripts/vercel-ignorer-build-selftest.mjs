// selftest:vercel-ignorer-build — un push de notes seules ne reconstruit pas le
// site (incident du 15/10 13:50), tout le reste construit, et dans le doute on
// construit. Câblage : vercel.json → ignoreCommand.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decider, sansEffetSurLeSite } from './vercel-ignorer-build.mjs';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// Le cas du 15/10 13:50 : 59a54b0 ne touchait que les notes d'état.
ok(decider(['docs/agents/etat-2026-10-01.md']).ignorer === true, 'notes seules → ignoré');
ok(decider(['CLAUDE.md', 'AGENTS.md', 'docs/enquetes/x/RAPPORT.md']).ignorer === true, 'CLAUDE/AGENTS + docs → ignoré');
ok(decider(['supabase/migrations/20261015150000_x.sql', 'supabase/rollbacks/x.sql', 'scripts/reparations/x.sql']).ignorer === true, 'migrations/réparations → ignoré');

// Tout ce qui sert au site, à l'app ou au build : on construit.
for (const f of [
  'src/main.jsx', 'src/blog/article.md', 'site/contenu/accueil.md', 'site/dates.lock.json',
  'public/robots.txt', 'index.html', 'vercel.json', 'package.json', 'package-lock.json',
  'vite.config.js', 'scripts/site/routes-app.mjs', 'scripts/build-id.mjs',
  'supabase/functions/_shared/palier.js', 'chrome-extension/manifest.json',
]) {
  ok(sansEffetSurLeSite(f) === false, `${f} sert au build`);
  ok(decider(['docs/x.md', f]).ignorer === false, `docs + ${f} → build`);
}

// Le commit vide (geste de secours « renommer l'entrée ») DOIT construire.
ok(decider([]).ignorer === false, 'commit vide → build');
ok(decider(['', '  ']).ignorer === false, 'liste vide → build');
// Doute → build.
ok(decider(null).ignorer === false, 'liste illisible → build');
// Chemins Windows.
ok(sansEffetSurLeSite('docs\\agents\\x.md') === true, 'antislash Windows');
// Un « docs » ailleurs que tout en haut n'est pas des notes.
ok(sansEffetSurLeSite('src/docs/x.js') === false, 'src/docs/ sert au build');

// Câblage : vercel.json appelle bien ce script.
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
ok(vercel.ignoreCommand === 'node scripts/vercel-ignorer-build.mjs', 'vercel.json → ignoreCommand câblé');

console.log(`✓ selftest:vercel-ignorer-build — ${n} assertions`);
