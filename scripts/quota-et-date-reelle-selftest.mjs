// Autotest : QUOTA D'ANNONCES PAR COMPTE et DATE RÉELLE DES IMPORTS (11/10/2026).
//
//     npm run selftest:quota-et-date-reelle
//
// Sans réseau ni base, sur les fichiers :
//   1. migration 20261011150000 : une table fermée aux clients, UN calcul
//      (quota_annonces_compte : le réglage du compte, sinon coin_config du
//      palier), lu par quotas_etat, spend_coins_for_generate et
//      spend_coins_for_lens — une seule ligne change dans chacune ; aucune clé
//      quota_* de coin_config n'est écrite ; scans, retouches, voix,
//      republication intacts ; retrait en une ligne (delete) ;
//   2. le réglage de Louis : 1 000, son compte seul, retrait écrit ;
//   3. migration 20261011151000 : seule la date d'un job d'IMPORT change
//      (annonces_plateforme.publiee_le, jamais postérieure au job, sinon la
//      date d'avant) ; Vinted intact ;
//   4. l'extension lit first_publication_date (heure de Paris → ISO) et ne
//      l'envoie que si la base a la colonne.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

console.log('1. quota par compte (migration 20261011150000)');
const q = lire('supabase/migrations/20261011150000_quota_annonces_par_compte.sql');
ok(/create table if not exists public\.quotas_par_compte/.test(q) && /enable row level security/.test(q) && /revoke all on public\.quotas_par_compte from anon, authenticated/.test(q), 'table fermée aux clients (RLS, aucun droit)');
ok(/check \(quota_annonces > 0\)/.test(q), 'un réglage est toujours un quota positif');
ok(/coalesce\(\s*\(select q\.quota_annonces from public\.quotas_par_compte q where q\.user_id = p_user\),\s*\(select c\.value from public\.coin_config c where c\.key = 'quota_annonces_' \|\| coalesce\(p_tier, 'free'\)\)/.test(q), 'le réglage du compte, sinon le quota du palier');
ok((q.match(/v_qa := quota_annonces_compte\(v_user, v_tier\);/g) || []).length === 1, 'quotas_etat lit le quota du compte');
ok((q.match(/v_quota := quota_annonces_compte\(p_user_id, v_tier\);/g) || []).length === 2, 'spend_coins_for_generate et spend_coins_for_lens aussi');
ok(!/key = 'quota_annonces_'\s*\|\| v_tier/.test(q), 'plus aucune lecture directe du quota d\'annonces du palier dans ces fonctions');
ok((q.match(/'quota_scan_'|'quota_retouche_'|'quota_republication_'/g) || []).length >= 3, 'scans, retouches et republication : lectures du palier inchangées');
ok(!/(update|insert into|delete from)\s+(public\.)?coin_config/i.test(q), 'aucune clé de coin_config n\'est écrite');
ok(/delete from public\.quotas_par_compte where user_id = '<uuid>'/.test(q), 'retrait en une ligne, écrit');

console.log('2. le réglage de Louis');
const l = lire('scripts/reparations/20261011_quota_annonces_louis_1000.sql');
ok(/values \('faf5021a-479a-4bb3-b3ec-c296770739b7', 1000,/.test(l), '1 000 pour Louis');
ok((l.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || []).every((u) => u === 'faf5021a-479a-4bb3-b3ec-c296770739b7'), 'aucun autre compte');
ok(/delete from public\.quotas_par_compte where user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';/.test(l), 'retrait prêt');

console.log('3. date réelle des imports (migration 20261011151000)');
const d = lire('supabase/migrations/20261011151000_republication_date_reelle_import.sql');
ok(/add column if not exists publiee_le timestamptz/.test(d), 'colonne annonces_plateforme.publiee_le');
ok(/CASE WHEN j\.handler_build ~\* '\^releve-annonces' THEN \(/.test(d), 'seul un job d\'IMPORT prend la date de la plateforme');
ok(/a\.publiee_le <= COALESCE\(j\.published_at, j\.created_at\)/.test(d) && /COALESCE\(j\.published_at, j\.created_at\)\) AS mise_en_ligne/.test(d), 'date absente ou postérieure : la date d\'avant');
ok(/AND i\.listed_at_guess < v_seuil/.test(d), 'Vinted : inchangé (listed_at_guess, date lue sur l\'annonce)');

console.log('4. l\'extension (relevé Leboncoin)');
const bg = lire('chrome-extension/background.js');
ok(/publiee_le: dateParis\(a\?\.first_publication_date\)/.test(bg), 'first_publication_date lue à chaque relevé');
ok(/const m = \/\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\[ T\]\(\\d\{2\}\):\(\\d\{2\}\):\(\\d\{2\}\)\$\//.test(bg), 'motif de date intact (antislashs présents)');
ok(/timeZone: 'Europe\/Paris', timeZoneName: 'longOffset'/.test(bg), 'heure de Paris → ISO, décalage du jour');
ok(/\.\.\.\(datePossible \? \{ publiee_le: a\.publiee_le \?\? null \} : \{\}\)/.test(bg) && /annonces_plateforme\?select=publiee_le&limit=1/.test(bg), 'envoyée seulement si la base a la colonne');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
