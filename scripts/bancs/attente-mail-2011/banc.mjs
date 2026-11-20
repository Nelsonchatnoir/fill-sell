// BANC JETABLE (PGlite) de 20261120210000_cloud_attente_mail_a_reessayer : la fonction de PROD (md5 vérifié), la migration,
// l'inverse — rien ne touche la prod.   node scripts/bancs/attente-mail-2011/banc.mjs
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lire = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261120210000_cloud_attente_mail_a_reessayer.sql');
const INV = lire('supabase/rollbacks/20261120210000_cloud_attente_mail_a_reessayer_INVERSE.sql');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };

const db = new PGlite();
await db.exec(`
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, inscrit_le timestamptz, notifie_le timestamptz, notif_statut text, notif_essais integer DEFAULT 0, notif_resultat jsonb);
CREATE FUNCTION public.cloud_attente_places_a_offrir() RETURNS integer LANGUAGE sql STABLE AS $f$ SELECT 0; $f$;
`);
await db.exec(INV);
const md5 = async () => (await db.query(`SELECT md5(pg_get_functiondef('public.cloud_attente_a_prevenir_existe()'::regprocedure)) h`)).rows[0].h;
ok(await md5() === 'a7f37a24ce4f2bd173e3dbcc9b05a460', 'la fonction rejouée a l’empreinte de la prod');
const existe = async () => (await db.query(`SELECT public.cloud_attente_a_prevenir_existe() e`)).rows[0].e;
const U = '11111111-1111-1111-1111-111111111111';
const ligne = async (resultat, offerte = '1 hour') => {
  await db.exec(`DELETE FROM public.cloud_attente;`);
  await db.query(`INSERT INTO public.cloud_attente (user_id, inscrit_le, notifie_le, notif_statut, notif_resultat) VALUES ($1, now() - interval '1 day', now() - interval '${offerte}', 'sans_appareil', $2::jsonb)`, [U, resultat]);
};

console.log('1. Avant : une place sans appareil, mail raté, aucun nouvel inscrit');
await ligne(JSON.stringify({ mail_essais: 1, mail_motif: 'resend_echec' }));
ok(await existe() === false, 'le défaut, rejoué : le cron ne repasse pas (le mail raté reste sans suite)');

console.log('2. La garde');
let refus = null;
try { await db.exec(MIG.replace("IS DISTINCT FROM 'a7f37a24ce4f2bd173e3dbcc9b05a460'", "IS DISTINCT FROM '00000000000000000000000000000000'")); } catch (e) { refus = e.message; }
ok(/a changé depuis sa relecture/.test(refus ?? ''), 'une fonction différente : migration arrêtée', refus);

console.log('3. Après la migration');
await db.exec(MIG);
ok(await existe() === true, 'mail raté (1 essai) : le cron repasse et le réessaie');
await ligne(JSON.stringify({ mail_le: '2026-11-20T15:41:25Z', canal: 'mail' }));
ok(await existe() === false, 'mail parti : rien à refaire');
await ligne(JSON.stringify({ mail_essais: 3 }));
ok(await existe() === false, '3 essais ratés : on s’arrête (jamais une boucle)');
await ligne(null, '3 days');
ok(await existe() === false, 'une offre de plus de 2 jours : rien');
await ligne(null);
ok(await existe() === true, 'une place sans appareil jamais mailée (avant le 20/11) : le mail part');

console.log('4. L’inverse');
await db.exec(INV);
await ligne(null);
ok(await existe() === false && await md5() === 'a7f37a24ce4f2bd173e3dbcc9b05a460', 'la fonction d’avant revient');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ banc attente-mail : ${n}/${n}`);
await db.close();
process.exitCode = ko ? 1 : 0;
