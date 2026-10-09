// selftest:une-vente-par-article — une vente, une fois (migration 20261009180000).
//   npm run selftest:une-vente-par-article            contrôles du dépôt
//   npm run selftest:une-vente-par-article -- --prod  + preuve en prod (transaction annulée)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r/g, '');
const MIG = lire('supabase/migrations/20261009180000_une_vente_par_article.sql');
const APP = lire('src/App.jsx');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
ok(/'code','job_sans_fiche'/.test(MIG) && /IF v_inv IS NULL AND NOT coalesce\(v_proof,false\) THEN/.test(MIG), "1. job sans fiche : refusé sans preuve, et jamais le numéro d'une fiche");
ok(/'code','enchere'/.test(MIG) && /'\{fin_ebay,format\}'='AUCTION'/.test(MIG), '2. enchère eBay : jamais vendue sur un appui');
ok(/coalesce\(v_q_fiche, 1\) <= 0 AND NOT v_autres_cmd AND v_rel\.id IS NULL/.test(MIG) && /v_nb_ventes_fiche = 1/.test(MIG), '3. même cession : fiche épuisée, une seule vente, jamais une revente multi-exemplaires');
ok(/\.eq\('status','published'\)\.in\('action',\['publish','republish'\]\)\s*\n\s*\.not\('inventaire_id','is',null\)/.test(APP), "4. l'app ne pose plus « Vendue ? » sur un job sans fiche");
if (process.argv.includes('--prod')) {
  const r = spawnSync('node', ['scripts/une-vente-par-article-preuve.mjs'], { cwd: RACINE, encoding: 'utf8', shell: true });
  process.stdout.write(r.stdout ?? '');
  ok(r.status === 0, 'PROD. preuve dans une transaction annulée');
}
console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
