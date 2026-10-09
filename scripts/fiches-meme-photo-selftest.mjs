// selftest:fiches-meme-photo — deux fiches du même objet (même photo) sont repérées et
// reçoivent la question existante, jamais une fusion (migration 20261009200000).
//   npm run selftest:fiches-meme-photo            contrôles du dépôt
//   npm run selftest:fiches-meme-photo -- --prod  + preuve en prod (transaction annulée)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r/g, '');
const MIG = lire('supabase/migrations/20261009200000_fiches_meme_photo_questions.sql');
const RAP = lire('supabase/functions/rapprochement/index.ts');
const corps = MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION')).replace(/^\s*--.*$/gm, '');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
ok(!/inventaire_fusionner|fusionne_dans\s*=/.test(corps) && /INSERT INTO inventaire_doublons/.test(corps), '1. la photo seule → une question, jamais une fusion');
ok(/NOT \(a\.vinted AND b\.vinted\)/.test(corps), '2. deux annonces Vinted = deux exemplaires : exclues');
ok(/NOT \(a\.statut = 'vendu' AND b\.statut = 'vendu'\)/.test(corps), '3. vendue / vendue : rien');
ok(/CASE WHEN 'vendu' IN \(r\.sa, r\.sb\) THEN 'homonyme_vendu' ELSE 'photo_identique' END/.test(corps)
  && /CASE WHEN r\.sb = 'vendu' THEN r\.b_id ELSE r\.a_id END/.test(corps), '4. vendue / en stock → « Déjà vendu ? », la vendue en garde ; sinon « Est-ce le même article ? »');
ok(/AND NOT EXISTS \(SELECT 1 FROM inventaire_doublons d/.test(corps) && /ON CONFLICT DO NOTHING/.test(corps), '5. une paire posée, refusée ou tranchée n\'est jamais reposée');
ok(/LIMIT p_limite/.test(corps) && /statement_timeout TO '3s'/.test(MIG), '6. borné (nombre de questions, durée)');
ok(/if \(fini && erreurs\.length === 0\) \{\s+const \{ data: q, error: eQ \} = await admin\.rpc\("fiches_meme_photo_questions", \{ p_user: user, p_limite: 20 \}\)/.test(RAP),
  '7. appelée en fin de passe de rapprochement (passe allée au bout), aucun cron nouveau');
if (process.argv.includes('--prod')) {
  const r = spawnSync('node', ['scripts/fiches-meme-photo-preuve.mjs'], { cwd: RACINE, encoding: 'utf8', shell: true });
  process.stdout.write(r.stdout ?? '');
  ok(r.status === 0, 'PROD. preuve dans une transaction annulée');
}
console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
