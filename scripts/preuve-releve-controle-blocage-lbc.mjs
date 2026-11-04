// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261105010000_releve_controle_blocage_lbc (05/11, point 4) :
// la visite de contrôle d'une pause Leboncoin (déclencheur 'controle_blocage_lbc') n'est plus avalée par la garde des
// relevés ; rien d'autre ne change ; l'inverse rend la définition de prod à l'identique.
//
//   PREUVE_PG=embarque node scripts/preuve-releve-controle-blocage-lbc.mjs   (Postgres 17 jetable sur le PC)
//
// Jamais la prod. Les trois fonctions et le déclencheur sont ceux lus EN PROD le 05/11 (pg_get_functiondef,
// pg_get_triggerdef) ; la migration et son inverse s'appliquent EN ENTIER (BEGIN … COMMIT), tels que livrés.
import pg from 'pg';
import { readFileSync } from 'node:fs';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-controle-lbc-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55447, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55447/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../supabase/migrations/20261105010000_releve_controle_blocage_lbc.sql');
const INVERSE = lire('../supabase/rollbacks/20261105010000_releve_controle_blocage_lbc_INVERSE.sql');
// md5 de la définition de prod (7e2c89d3…) lue SANS les retours chariot : en prod, le corps porte des fins de ligne
// Windows (appliqué depuis un fichier en CRLF) — même SQL, seuls les blancs diffèrent.
const MD5_PROD = 'fe1a83908d392c7b77c810f297e8bcd5';

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let ko = 0, n = 0;
const ok = (cond, msg, detail) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`); } };
const U = '447d920c-976a-4d8f-aff4-a2998050358c';
// Une insertion telle que get-pending-jobs la fait : rend le nombre de lignes réellement écrites.
const poser = async (declencheur, kind = 'annonces') => (await c.query(
  `INSERT INTO public.vinted_sync_runs (user_id, kind, status, platform, declencheur, queued_at) VALUES ($1, $2, 'queued', 'leboncoin', $3, now()) RETURNING id`,
  [U, kind, declencheur])).rowCount;
const md5Veille = async () => (await c.query(`SELECT md5(replace(pg_get_functiondef('public.releve_est_veille(text)'::regprocedure), chr(13), '')) AS m`)).rows[0].m;

try {
  // ── L'état de PROD (05/11) : table réduite aux colonnes utiles, fonctions et déclencheur lus en prod ──
  await c.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE public.vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      kind text NOT NULL DEFAULT 'dressing', status text NOT NULL DEFAULT 'running', declencheur text,
      queued_at timestamptz, platform text NOT NULL DEFAULT 'vinted');`);
  await c.query(`CREATE OR REPLACE FUNCTION public.releve_est_geste(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') ~ '^(bouton|bouton_distant|app)(:redemande)?$'
$function$`);
  await c.query(INVERSE); // = la définition de prod de releve_est_veille, mot pour mot
  await c.query(`CREATE OR REPLACE FUNCTION public.garde_releve_sans_geste()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.kind NOT IN ('dressing', 'annonces') THEN RETURN NEW; END IF;
  IF releve_est_geste(NEW.declencheur) OR releve_est_veille(NEW.declencheur) THEN RETURN NEW; END IF;
  RAISE LOG 'garde_releve_sans_geste : relevé % % refusé (user %, déclencheur %) — un relevé d''import ne part que sur « Synchroniser »',
    NEW.kind, COALESCE(NEW.platform, 'vinted'), NEW.user_id, COALESCE(NEW.declencheur, '(aucun)');
  RETURN NULL;
END;
$function$`);
  await c.query(`CREATE TRIGGER garde_releve_sans_geste BEFORE INSERT ON public.vinted_sync_runs FOR EACH ROW EXECUTE FUNCTION garde_releve_sans_geste()`);

  console.log('\n1. AVANT (prod du 05/11) : la visite de contrôle est avalée en silence');
  const md5Avant = await md5Veille();
  ok(md5Avant === MD5_PROD, `releve_est_veille identique à la prod (md5 ${md5Avant})`, md5Avant);
  ok(await poser('controle_blocage_lbc') === 0, "controle_blocage_lbc : 0 ligne, aucune erreur — le défaut d'Amiral (690 refus le 04/11)");
  ok(await poser('bouton_distant') === 1 && await poser('cron') === 1, 'un geste et une veille passent (témoins)');

  console.log('\n2. LA MIGRATION, appliquée en entier');
  await c.query(MIGRATION);
  ok(await poser('controle_blocage_lbc') === 1, 'controle_blocage_lbc : la visite de contrôle est écrite');
  const { rows: [f] } = await c.query(`SELECT provolatile, prosrc FROM pg_proc WHERE oid = 'public.releve_est_veille(text)'::regprocedure`);
  ok(f.provolatile === 'i', 'toujours IMMUTABLE');
  for (const d of ['cron', 'veilleur', 'serveur:retrait_introuvable', 'serveur:retrait_sans_numero', 'serveur:verif_redepot',
    'serveur:quotidien_api', 'serveur:lecture_origine', 'serveur:introuvable_a_confirmer', 'bouton', 'bouton_distant', 'app', 'app:redemande']) {
    ok(await poser(d) === 1, `${d} : passe, comme avant`);
  }
  for (const d of [null, '', 'serveur', 'reprise_connexion', 'serveur:levee_antirobot', 'controle_blocage_lbcx', 'xcontrole_blocage_lbc']) {
    ok(await poser(d) === 0, `${JSON.stringify(d)} : toujours refusé (rien d'autre n'est ouvert)`);
  }
  ok(await poser('controle_blocage_lbc', 'ventes') === 1, "un autre kind (ventes) : jamais concerné par la garde, comme avant");
  const { rows: [{ total }] } = await c.query(`SELECT count(*)::int AS total FROM public.vinted_sync_runs WHERE declencheur = 'controle_blocage_lbc'`);
  ok(total === 2, 'exactement les deux visites voulues sont en base', total);

  console.log("\n3. L'INVERSE : la définition de prod, mot pour mot");
  await c.query(INVERSE);
  ok(await md5Veille() === MD5_PROD, `releve_est_veille revenue à la prod (md5 ${MD5_PROD})`);
  ok(await poser('controle_blocage_lbc') === 0, 'controle_blocage_lbc de nouveau refusé');
  await c.query(MIGRATION);
  ok(await poser('controle_blocage_lbc') === 1, 'la migration se rejoue sans erreur (CREATE OR REPLACE, idempotente)');
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); embarque.rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — migration prouvée sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
