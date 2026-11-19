// ═══════════════════════════════════════════════════════════════════════════
// VERROU — UNE QUESTION SUR UNE ANNONCE VENDUE ENCORE EN LIGNE EST RELANCÉE DANS L'APP TANT QU'ELLE N'A PAS DE RÉPONSE
// (19/11/2026, terminal t5, décision de Nico : « aucune double vente », pas un mail)
//   npm run selftest:rappel-encore-en-ligne
//   node scripts/rappel-encore-en-ligne-selftest.mjs --avant   (l'app et push-ventes de HEAD : ROUGE)
// ═══════════════════════════════════════════════════════════════════════════
// Constat du 19/11 (lecture seule) : 72 annonces d'articles vendus attendent la réponse de la personne (« À régler —
// Retirer / Plus tard », « Déjà vendu ? »), 69 revues en ligne APRÈS la question ; rien ne relance ; « Plus tard » disait
// « la question ne revient plus ». Ce verrou prouve :
//   A. la règle pure (_shared/rappel-encore-en-ligne.js) : cadence J+1, J+3, +3 j jusqu'à J+30, puis +7 j ; jamais sans
//      une vue en ligne plus récente que la question ET que la relance précédente ; « Plus tard » = 3 jours ; un report
//      d'avant la règle reposé dans le bandeau seulement (jamais un push) ; une note regroupée par compte et par 24 h, de
//      9 h à 20 h (Paris), jamais dans l'heure d'un autre push ; interrupteur à 0 → rien ;
//   B. la base (Postgres jetable, migration 20261119180000) : les questions ouvertes d'un article vendu, jamais après
//      « Non », jamais avec un retrait en file, jamais Opla, jamais sans numéro, jamais une fiche en stock ; la personne
//      ne lit que les siennes ; le réveil ne part pas interrupteur à 0 ; l'inverse retire tout ;
//   C. le branchement : push-ventes (trace AVANT l'envoi, aucun mail, son propre réveil), l'app (bandeau, « Plus tard »
//      = 3 jours, le report échu revient dans « À régler », l'appui sur le push ouvre le Stock).
import pg from 'pg';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AVANT = process.argv.includes('--avant');
const lireFichier = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const lireHead = (p) => { try { return execFileSync('git', ['show', `HEAD:${p}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n'); } catch { return ''; } };
const lire = (p) => (AVANT ? lireHead(p) : lireFichier(p));
const MODULE = 'supabase/functions/_shared/rappel-encore-en-ligne.js';
const MIGRATION = 'supabase/migrations/20261119180000_rappel_encore_en_ligne.sql';
const INVERSE = 'supabase/rollbacks/20261119180000_rappel_encore_en_ligne_INVERSE.sql';

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); } };

const H = 3600_000, J = 86_400_000;
const midiParis = Date.parse('2026-11-20T11:00:00Z');   // 12:00 à Paris

console.log('A. LA RÈGLE PURE');
const srcModule = lire(MODULE);
ok(srcModule.length > 0, 'le module rappel-encore-en-ligne.js existe');
if (srcModule.length > 0) {
  const R = await import(pathToFileURL(join(ROOT, MODULE)).href);
  const off = [0, 1, 2, 3, 4].map((k) => R.decalage(k) / J);
  ok(JSON.stringify(off) === JSON.stringify([1, 3, 6, 9, 12]), 'la cadence : J+1, J+3, puis tous les 3 jours', off);
  let k = 0; while (R.decalage(k) < 30 * J) k++;
  ok((R.decalage(k + 1) - R.decalage(k)) === 7 * J, 'au-delà de J+30 : tous les 7 jours', { k, a: R.decalage(k) / J, b: R.decalage(k + 1) / J });
  const q = (o = {}) => ({ cle: 'job:1', sorte: 'a_regler', user_id: 'u1', platform: 'ebay', titre: 'Escarpins (essai)',
    question_le: new Date(midiParis - 2 * J).toISOString(), vu_le: new Date(midiParis - 2 * H).toISOString(), report_le: null, report_borne: false, ...o });
  const notes = (qs, o = {}) => R.notesRappel({ questions: qs, actif: true, maintenant: midiParis, ...o });
  ok(notes([q()]).length === 1 && notes([q()])[0].rang === 1, 'question de J-2, revue en ligne il y a 2 h → la 1re relance part');
  ok(notes([q({ vu_le: new Date(midiParis - 3 * J).toISOString() })]).length === 0, 'jamais si la dernière vue en ligne est AVANT la question');
  ok(notes([q({ question_le: new Date(midiParis - 10 * H).toISOString(), vu_le: new Date(midiParis - H).toISOString() })]).length === 0, 'pas avant J+1');
  ok(R.notesRappel({ questions: [q()], actif: false, maintenant: midiParis }).length === 0, 'interrupteur à 0 → aucune note');
  ok(R.aMontrer([q()], { actif: false }).length === 0 && R.aMontrer([q()], { actif: true, maintenant: midiParis }).length === 1, 'le bandeau suit l\'interrupteur');
  const trace = (le, cles = ['job:1']) => ({ user_id: 'u1', created_at: new Date(le).toISOString(), cles });
  ok(notes([q()], { traces: [trace(midiParis - 30 * H)] }).length === 0, 'une relance faite, aucune vue en ligne depuis → rien (jamais sans une vue plus récente)');
  ok(notes([q({ question_le: new Date(midiParis - 4 * J).toISOString() })], { traces: [trace(midiParis - 3 * J)] }).length === 1, 'J+3 atteint et revue en ligne depuis la 1re relance → la 2e part');
  ok(notes([q({ question_le: new Date(midiParis - 2.5 * J).toISOString() })], { traces: [trace(midiParis - 1.5 * J)] }).length === 0, 'J+3 pas encore atteint → rien');
  ok(notes([q()], { traces: [trace(midiParis - 5 * H, ['job:9'])] }).length === 0, 'une note par compte et par 24 h (une autre annonce relancée ce matin)');
  ok(notes([q()], { autresPush: [{ user_id: 'u1', created_at: new Date(midiParis - 20 * 60_000).toISOString() }] }).length === 0, 'jamais dans l\'heure d\'un autre push FillSell');
  ok(R.notesRappel({ questions: [q()], actif: true, maintenant: Date.parse('2026-11-20T21:30:00Z') }).length === 0, 'jamais la nuit (22:30 à Paris)');
  const deux = notes([q(), q({ cle: 'question:2', sorte: 'deja_vendu', platform: 'leboncoin' })]);
  ok(deux.length === 1 && deux[0].cles.length === 2, 'deux annonces du même compte → UNE note regroupée', deux);
  ok(notes([q(), q({ cle: 'job:3', user_id: 'u2' })]).length === 2, 'deux comptes → deux notes');
  // « Plus tard » = 3 jours
  const rep = (jours, borne = true) => q({ report_le: new Date(midiParis - jours * J).toISOString(), report_borne: borne, vu_le: new Date(midiParis - H).toISOString(), question_le: new Date(midiParis - 20 * J).toISOString() });
  ok(R.aMontrer([rep(1)], { actif: true, maintenant: midiParis }).length === 0 && notes([rep(1)]).length === 0, '« Plus tard » il y a 1 jour → ni bandeau ni push');
  ok(R.aMontrer([rep(4)], { actif: true, maintenant: midiParis }).length === 1, '« Plus tard » il y a 4 jours (revue en ligne depuis) → revient dans le bandeau');
  ok(notes([rep(5)]).length === 1, '… et la relance repart (J+1 après la fin du report)');
  ok(R.aMontrer([rep(30, false)], { actif: true, maintenant: midiParis }).length === 1 && notes([rep(30, false)]).length === 0, 'un « Plus tard » d\'AVANT la règle : reposé dans le bandeau, JAMAIS un push');
  const m1 = R.messageRappel(deux[0]); const m2 = R.messageRappel(notes([q()])[0], { lang: 'en' });
  ok(m1.donnees.type === 'encore_en_ligne' && /Double vente possible/.test(m1.titre) && /2 articles vendus/.test(m1.corps), 'le texte : « Double vente possible », le nombre, les plateformes', m1);
  ok(/Possible double sale/.test(m2.titre) && /still online/.test(m2.corps) && !/Chrome|ordinateur|computer/i.test(m1.corps + m2.corps), 'en anglais ; jamais « Chrome » ni « ordinateur »', m2);
}

console.log('\nB. LA BASE (Postgres jetable)');
const mig = AVANT ? '' : lireFichier(MIGRATION);
ok(mig.length > 0, 'la migration 20261119180000 existe');
if (mig.length > 0) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-rappel-'));
  const port = 60900 + Math.floor(Math.random() * 900);
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  try {
    await c.query(String.raw`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; GRANT USAGE ON SCHEMA public TO authenticated;
      CREATE SCHEMA cron; CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text, schedule text, command text);
      CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $f$ INSERT INTO cron.job (jobname, schedule, command) VALUES (n, s, c) RETURNING jobid $f$;
      CREATE FUNCTION cron.unschedule(i integer) RETURNS boolean LANGUAGE sql AS $f$ DELETE FROM cron.job WHERE jobid = i RETURNING true $f$;
      CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz);
      CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, statut text, quantite integer DEFAULT 1, fusionne_dans bigint);
      CREATE TABLE public.ventes (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, plateforme text, plateforme_code text, statut text, created_at timestamptz DEFAULT now());
      CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text, status text,
        action text DEFAULT 'publish', title text, listing_url text, platform_listing_id text, platform_fields jsonb, vu_en_ligne_le timestamptz, created_at timestamptz DEFAULT now());
      CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text, vu_le timestamptz,
        disparu_le timestamptz, retiree_le timestamptz, ignoree_le timestamptz, statut_plateforme text DEFAULT 'en_ligne');
      CREATE TABLE public.inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint, statut text, motif text, preuves jsonb, created_at timestamptz DEFAULT now());
      CREATE FUNCTION public.cron_secret() RETURNS text LANGUAGE sql AS $f$ SELECT 'banc' $f$;
    `);
    await c.query(lireFichier('scripts/essais/fixtures/prod-1911-p2/listing_designe.sql'));
    const U1 = 'aaaaaaaa-0000-4000-8000-000000000001', U2 = 'bbbbbbbb-0000-4000-8000-000000000002';
    await c.query(`
      INSERT INTO public.inventaire (id, user_id, titre, statut) VALUES (1, '${U1}', 'Vendue (essai)', 'vendu'), (2, '${U1}', 'En stock (essai)', 'stock'),
        (3, '${U1}', 'Vendue bis (essai)', 'vendu'), (4, '${U2}', 'Autre compte (essai)', 'vendu');
      INSERT INTO public.ventes (user_id, inventaire_id, plateforme) VALUES ('${U1}', 1, 'Vinted'), ('${U1}', 3, 'Vinted'), ('${U2}', 4, 'Leboncoin');
      INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, status, platform_listing_id, platform_fields, vu_en_ligne_le) VALUES
        ('10000000-0000-4000-8000-000000000001', '${U1}', 1, 'ebay', 'cancelled', '146000000001', '{"pending_removal": true, "source": "releve", "vendu_encore_en_ligne": {"at": "2026-11-16T10:00:00Z"}}', '2026-11-19T00:00:00Z'),
        ('10000000-0000-4000-8000-000000000002', '${U1}', 2, 'ebay', 'cancelled', '146000000002', '{"pending_removal": true}', '2026-11-19T00:00:00Z'),
        ('10000000-0000-4000-8000-000000000003', '${U1}', 1, 'opla', 'cancelled', 'art_x', '{"pending_removal": true}', NULL),
        ('10000000-0000-4000-8000-000000000004', '${U1}', 3, 'leboncoin', 'cancelled', '3300000004', '{"pending_removal": true, "pending_removal_reporte_le": "2026-11-10T10:00:00Z"}', NULL),
        ('10000000-0000-4000-8000-000000000005', '${U1}', 3, 'leboncoin', 'pending', '3300000004', '{}', NULL),
        ('10000000-0000-4000-8000-000000000006', '${U2}', 4, 'beebs', 'cancelled', '34000006', '{"pending_removal": true}', NULL);
      UPDATE public.cross_post_jobs SET action = 'delete' WHERE id = '10000000-0000-4000-8000-000000000005';
      INSERT INTO public.annonces_plateforme (user_id, platform, listing_id, vu_le) VALUES ('${U1}', 'ebay', '146000000001', '2026-11-19T01:33:00Z'), ('${U2}', 'beebs', '34000006', '2026-11-19T09:00:00Z');
      INSERT INTO public.inventaire_doublons (user_id, garde, absorbe, statut, motif, preuves) VALUES
        ('${U1}', 3, 3, 'proposee', 'copie_non_prouvee', '{"platform": "ebay", "listing_id": "237000000007", "titre": "Question ouverte (essai)"}'),
        ('${U1}', 3, 3, 'refusee', 'copie_non_prouvee', '{"platform": "ebay", "listing_id": "237000000008"}');
    `);
    await c.query(mig);
    const tout = (await c.query(`SELECT q FROM public.encore_en_ligne_questions(NULL, 500) q`)).rows.map((r) => r.q);
    const cles = tout.map((x) => `${x.sorte}:${x.listing}`).sort();
    ok(JSON.stringify(cles) === JSON.stringify(['a_regler:146000000001', 'a_regler:34000006', 'deja_vendu:237000000007'].sort()),
      'les questions OUVERTES d\'articles vendus : « À régler » eBay, « À régler » Beebs (autre compte), « Déjà vendu ? » — jamais « Non », jamais une fiche en stock, jamais Opla, jamais un retrait en file', cles);
    const ebay = tout.find((x) => x.listing === '146000000001');
    ok(ebay?.vendu_sur === 'vinted' && Date.parse(ebay?.vu_le) === Date.parse('2026-11-19T01:33:00Z') && Date.parse(ebay?.question_le) === Date.parse('2026-11-16T10:00:00Z') && ebay?.job?.id,
      '… avec la plateforme de la vente, la dernière vue en ligne du même numéro, la date de la question et la tâche (pour « À régler »)', ebay);
    const mes = async (uid) => { await c.query('BEGIN'); await c.query('SET LOCAL ROLE authenticated'); await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      const r = (await c.query('SELECT public.encore_en_ligne_mes_questions() r')).rows[0].r; await c.query('ROLLBACK'); return r; };
    const r1 = await mes(U1);
    ok(r1.actif === false && r1.questions.length === 2 && r1.questions.every((x) => x.user_id === U1), 'la personne ne lit que SES questions ; interrupteur à 0 → actif faux', r1);
    let interdit = null; try { await c.query('BEGIN'); await c.query('SET LOCAL ROLE authenticated'); await c.query(`SELECT public.encore_en_ligne_questions(NULL, 5)`); } catch (e) { interdit = e.message; } await c.query('ROLLBACK');
    ok(/permission denied/.test(interdit ?? ''), 'la lecture du parc est refusée à la personne (serveur seulement)', interdit);
    ok((await c.query('SELECT public.encore_en_ligne_a_relancer_existe() r')).rows[0].r === false, 'interrupteur à 0 → le réveil ne part pas');
    await c.query(`UPDATE public.coin_config SET value = 1 WHERE key = 'rappel_encore_en_ligne_actif'`);
    ok((await c.query('SELECT public.encore_en_ligne_a_relancer_existe() r')).rows[0].r === true && (await mes(U1)).actif === true, 'interrupteur à 1 → le réveil part, actif vrai');
    const job = (await c.query(`SELECT schedule, command FROM cron.job WHERE jobname = 'push-rappels-encore-en-ligne'`)).rows[0];
    ok(job?.schedule === '7,22,37,52 * * * *' && /rappels_encore_en_ligne_cron/.test(job.command) && /cron_secret\(\)/.test(job.command) && /encore_en_ligne_a_relancer_existe/.test(job.command),
      'le réveil : toutes les 15 min, push-ventes, secret par cron_secret(), seulement s\'il y a à relancer', job);
    await c.query(lireFichier(INVERSE));
    const reste = (await c.query(`SELECT (SELECT count(*) FROM pg_proc WHERE proname LIKE 'encore_en_ligne%') f, (SELECT count(*) FROM cron.job) j, (SELECT count(*) FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif') k, (SELECT count(*) FROM pg_indexes WHERE indexname = 'cross_post_jobs_pending_removal_idx') i`)).rows[0];
    ok(Number(reste.f) + Number(reste.j) + Number(reste.k) + Number(reste.i) === 0, "l'inverse retire fonctions, réveil, interrupteur et index", reste);
  } finally {
    await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ }
  }
}

console.log('\nC. LE BRANCHEMENT (push-ventes, app)');
const pv = lire('supabase/functions/push-ventes/index.ts');
const iFn = pv.indexOf('async function pousserRappels');
const corpsFn = iFn >= 0 ? pv.slice(iFn, pv.indexOf('\n}\n', iFn)) : '';
ok(iFn >= 0 && /rappels_encore_en_ligne_cron/.test(pv), 'push-ventes : la relance a son propre réveil (jamais le tour des ventes)');
ok(corpsFn.indexOf('usage_logs").insert') > 0 && corpsFn.indexOf('usage_logs").insert') < corpsFn.indexOf('envoyerNote('), 'push-ventes : la trace AVANT l\'envoi (jamais deux fois la même note)');
ok(corpsFn.length > 0 && !/envoyerEmail|envoyerMail|mail/i.test(corpsFn.replace(/AUCUN MAIL/g, '')), 'push-ventes : AUCUN MAIL sur ce chemin');
const app = lire('src/App.jsx');
ok(/rpc\('encore_en_ligne_mes_questions'\)/.test(app) && /encoreEnLigneAMontrer\(/.test(app), 'App : une lecture par chargement, la règle du module (aMontrer)');
ok(/Double vente possible/.test(app) && /encoreEnLigne\.length>0/.test(app), 'App : le bandeau « Double vente possible » tant qu\'une question attend');
ok(/pending_removal_reporte_jours:3/.test(app), 'App : « Plus tard » = 3 jours (marque du report)');
ok(/q\.sorte==='a_regler'&&q\.report_le&&q\.job/.test(app), 'App : un report échu revient dans « À régler »');
ok(/ouverturePush\.type==='encore_en_ligne'/.test(app) && /encore_en_ligne/.test(lire('src/notifications/pushVentes.js')), 'App : l\'appui sur le push ouvre le Stock (type encore_en_ligne)');

console.log(`\n${n - ko}/${n} ${ko ? `— ${ko} ROUGE(S)` : '— VERT'}`);
process.exit(ko ? 1 : 0);
