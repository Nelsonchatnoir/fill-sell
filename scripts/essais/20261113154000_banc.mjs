// LE BANC de la migration 20261113154000_cron_refus_journalise (13/11/2026, étape 5 du lot « zéro problème », bloc 6 P3,
// feu vert de Nico : « journaliser les refus : usage_logs + ops-digest ») — SUR UN POSTGRES JETABLE (embedded-postgres sur
// le poste), jamais la prod.
//   node scripts/essais/20261113154000_banc.mjs
// Décor : vinted_sync_runs (colonnes de prod lues le 13/11, RLS « ses lignes », le déclencheur de prod
// vinted_sync_runs_progres), usage_logs (RLS SANS politique d'écriture : le journal passe par SECURITY DEFINER), profiles.
// La note est écrite EXACTEMENT comme l'extension l'écrit (journaliserRefusCron, chrome-extension/background.js : segments
// filtrés, compteur + 1, « dernière le <ISO> »), en rôle authenticated (le PATCH de PostgREST).
// Étapes : A. AVANT — la note s'écrit, aucune ligne ; B. MIGRATION — une ligne par refus (cas réel 447d920c : refus du
// 12/11 09:34 UTC, 845 min après le relevé de geste du 11/11 19:29 UTC), rien pour une réécriture sans hausse, un segment
// effacé puis réécrit compte de nouveau, ni les relevés « annonces » ni les autres colonnes, date illisible = maintenant,
// journal cassé = la note passe quand même ; C. INVERSE — plus rien n'est journalisé, les lignes écrites restent ;
// D. MIGRATION rejouée — B de nouveau.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261113154000_cron_refus_journalise.sql';
export const INVERSE = 'supabase/rollbacks/20261113154000_cron_refus_journalise_INVERSE.sql';

const U1 = '447d920c-0000-4000-8000-000000000001'; // le compte 447d920c (cas réel du 12/11 ; id d'essai, id8 réel)
const RUN = '6301dc8a-0000-4000-8000-000000000001'; // son relevé de geste du 11/11 19:29 UTC (porteur réel)
const RUN_ANNONCES = '00000000-0000-4000-8000-0000000000a1';

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, extension_build text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.usage_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, feature text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb);
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.usage_logs TO authenticated;
CREATE TABLE public.vinted_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, kind text NOT NULL DEFAULT 'dressing', status text NOT NULL DEFAULT 'queued',
  declencheur text, page_suivante integer, total_pages integer, total_entries integer, items_vus integer, items_crees integer, items_maj integer,
  erreur text, extension_build text, started_at timestamptz DEFAULT now(), updated_at timestamptz, finished_at timestamptz, queued_at timestamptz,
  claimed_at timestamptz, vinted_user_id text, vinted_login text, platform text, progres_le timestamptz, compte_plateforme text);
ALTER TABLE public.vinted_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY vinted_sync_runs_siennes ON public.vinted_sync_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.vinted_sync_runs TO authenticated;
-- Le déclencheur de prod (pg_get_functiondef, 13/11), pour rester dans les conditions réelles d'une mise à jour.
CREATE OR REPLACE FUNCTION public.vinted_sync_runs_progres() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'running' THEN NEW.progres_le := now(); END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'running' AND OLD.status IS DISTINCT FROM 'running' THEN
    NEW.progres_le := now();
    RETURN NEW;
  END IF;
  IF NEW.items_vus IS DISTINCT FROM OLD.items_vus
     OR NEW.page_suivante IS DISTINCT FROM OLD.page_suivante
     OR NEW.items_crees IS DISTINCT FROM OLD.items_crees
     OR NEW.items_maj IS DISTINCT FROM OLD.items_maj
     OR NEW.total_entries IS DISTINCT FROM OLD.total_entries THEN
    NEW.progres_le := now();
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER vinted_sync_runs_progres BEFORE INSERT OR UPDATE ON public.vinted_sync_runs FOR EACH ROW EXECUTE FUNCTION vinted_sync_runs_progres();
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
INSERT INTO public.profiles (id, extension_build) VALUES ('${U1}', '2026-11-10T14:10:14Z+ba13a51');
INSERT INTO public.vinted_sync_runs (id, user_id, kind, status, declencheur, items_vus, total_entries, started_at, finished_at, vinted_login, platform)
VALUES ('${RUN}', '${U1}', 'dressing', 'done', 'bouton', 256, 256, '2026-11-11 19:28:39.012519+00', '2026-11-11 19:29:00.597+00', 'boutique-essai-1', 'vinted'),
       ('${RUN_ANNONCES}', '${U1}', 'annonces', 'done', 'cron', 10, 10, '2026-11-11 18:00:00+00', '2026-11-11 18:01:00+00', null, 'leboncoin');
`;

/** La note, écrite EXACTEMENT comme journaliserRefusCron (chrome-extension/background.js) — refusLe = l'heure du refus. */
export function noteExtension(erreurAvant, refusLe) {
  const MARQUEUR = 'cadence cron :';
  const segments = String(erreurAvant ?? '').split(' | ').filter((s) => s.trim() && !s.includes(MARQUEUR));
  const precedent = String(erreurAvant ?? '').split(' | ').find((s) => s.includes(MARQUEUR));
  const n = (Number(precedent?.match(/(\d+)\s+sync/)?.[1]) || 0) + 1;
  segments.push(`[note] ${MARQUEUR} ${n} sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le ${refusLe}`);
  return segments.join(' | ').slice(0, 500);
}

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-cron-refus-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

/** Le PATCH de l'extension (rôle authenticated, session = U1). */
async function patch(c, id, champs) {
  await c.query('BEGIN');
  try {
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [U1]);
    const cles = Object.keys(champs);
    const r = await c.query(`UPDATE public.vinted_sync_runs SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...cles.map((k) => champs[k])]);
    await c.query('COMMIT');
    return { ok: true, n: r.rowCount };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, erreur: e.message }; }
}
const erreurDe = async (c, id) => (await c.query('SELECT erreur FROM public.vinted_sync_runs WHERE id = $1', [id])).rows[0].erreur;
const journal = async (c) => (await c.query(`SELECT user_id::text, feature, metadata FROM public.usage_logs WHERE feature = 'cron_refuse' ORDER BY created_at, (metadata->>'compteur')::int`)).rows;
/** Un refus de l'extension : relit la note, la réécrit (comme journaliserRefusCron). */
async function refus(c, id, refusLe) { return patch(c, id, { erreur: noteExtension(await erreurDe(c, id), refusLe) }); }

async function tourMigration(c, ok, P) {
  await c.query(`UPDATE public.vinted_sync_runs SET erreur = NULL WHERE id IN ('${RUN}', '${RUN_ANNONCES}')`);
  await c.query(`DELETE FROM public.usage_logs`);
  const r1 = await refus(c, RUN, '2026-11-12T09:34:13.830Z');
  const j1 = await journal(c);
  ok(r1.ok && r1.n === 1 && j1.length === 1, `${P} : 1er refus (cas réel 447d920c) → la note s'écrit ET une ligne usage_logs « cron_refuse »`, { r1, j1 });
  const m = j1[0]?.metadata ?? {};
  ok(j1[0]?.user_id === U1 && m.run_id === RUN && m.porteur === 'bouton' && m.compteur === 1 && m.nouveaux === 1, `${P} : la ligne nomme le compte, le relevé porteur (geste « bouton »), compteur 1`, m);
  ok(Date.parse(m.refus_le) === Date.parse('2026-11-12T09:34:13.830Z') && Number(m.age_min) === 845, `${P} : refus le 12/11 09:34 UTC, 845 min après la fin du relevé porteur (tranche 12-20 h : celui qui coûte un jour)`, m);
  ok(m.extension_build === '2026-11-10T14:10:14Z+ba13a51', `${P} : build de l'extension du compte`, m);
  const r2 = await refus(c, RUN, '2026-11-12T10:40:00.000Z');
  const j2 = await journal(c);
  ok(r2.ok && j2.length === 2 && j2[1].metadata.compteur === 2 && j2[1].metadata.nouveaux === 1, `${P} : 2e refus (compteur 2) → une 2e ligne`, j2.map((x) => x.metadata));
  const e2 = await erreurDe(c, RUN);
  await patch(c, RUN, { erreur: `${e2} | [note] autre écrivain` });
  ok((await journal(c)).length === 2, `${P} : note réécrite par un autre écrivain, compteur inchangé → rien`);
  await patch(c, RUN, { erreur: '[sync-dressing][reprise-auto] marqueur' });
  ok((await journal(c)).length === 2, `${P} : segment effacé (marqueur de reprise) → rien`);
  await refus(c, RUN, '2026-11-12T11:00:00.000Z');
  const j3 = await journal(c);
  ok(j3.length === 3 && j3[2].metadata.compteur === 1, `${P} : refus suivant (compteur reparti à 1) → une ligne`, j3.map((x) => x.metadata));
  await refus(c, RUN_ANNONCES, '2026-11-12T11:05:00.000Z');
  ok((await journal(c)).length === 3, `${P} : relevé « annonces » (Leboncoin) portant le même texte → rien`);
  await patch(c, RUN, { items_vus: 257 });
  ok((await journal(c)).length === 3, `${P} : mise à jour d'une autre colonne → rien`);
  const avant = Date.now();
  await patch(c, RUN, { erreur: `[note] cadence cron : 5 sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le pas-une-date` });
  const j4 = await journal(c);
  ok(j4.length === 4 && j4[3].metadata.nouveaux === 4 && Date.parse(j4[3].metadata.refus_le) >= avant - 5000, `${P} : date illisible → refus daté de maintenant ; hausse de 4 notée « nouveaux : 4 »`, j4[3]?.metadata);
  await c.query('ALTER TABLE public.usage_logs RENAME TO usage_logs_cachee');
  const r5 = await refus(c, RUN, '2026-11-12T12:00:00.000Z');
  await c.query('ALTER TABLE public.usage_logs_cachee RENAME TO usage_logs');
  ok(r5.ok && r5.n === 1 && /6 sync/.test(await erreurDe(c, RUN)) && (await journal(c)).length === 4, `${P} : journal cassé → la note passe QUAND MÊME (aucune ligne, aucune erreur)`, r5);
  const d = (await c.query(`SELECT tgname, tgenabled, pg_get_triggerdef(oid) def FROM pg_trigger WHERE tgname = 'cron_refus_journalise'`)).rows[0];
  ok(d && /AFTER UPDATE OF erreur ON public\.vinted_sync_runs/.test(d.def), `${P} : déclencheur AFTER UPDATE OF erreur posé`, d);
  const acl = (await c.query(`SELECT proacl::text a, prosecdef s FROM pg_proc WHERE proname = 'cron_refus_journaliser'`)).rows[0];
  ok(acl.s === true && !/authenticated=X|anon=X|(^|[{,])=X/.test(acl.a ?? ''), `${P} : fonction SECURITY DEFINER, non appelable par anon ni authenticated (le déclencheur s'en passe)`, acl);
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  const bg = lire('chrome-extension/background.js');
  ok(bg.includes('const MARQUEUR = "cadence cron :";') && bg.includes("sync 'cron' refusée(s) depuis ce run ")
    && bg.includes('`(fenêtre de 20 h), dernière le ${new Date().toISOString()}`') && bg.includes('segments.join(" | ").slice(0, 500)'),
    'décor : la note du banc est celle de journaliserRefusCron (background.js), à l\'identique');
  const { c, arreter } = await demarrer(58000 + Math.floor(Math.random() * 2000));
  try {
    console.log('A. AVANT — la prod');
    const rA = await refus(c, RUN, '2026-11-12T09:34:13.830Z');
    ok(rA.ok && /cadence cron : 1 sync/.test(await erreurDe(c, RUN)) && (await journal(c)).length === 0, 'A : la note s\'écrit, AUCUNE ligne (le refus est invisible)', rA);

    console.log('B. MIGRATION');
    await c.query(lire(MIGRATION));
    await tourMigration(c, ok, 'B');
    const garde = (await c.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid = 'public.vinted_sync_runs'::regclass AND NOT tgisinternal`)).rows[0].n;
    ok(garde === 2, 'B : seuls vinted_sync_runs_progres et cron_refus_journalise sur la table du banc (rien d\'autre posé)', garde);

    console.log('C. INVERSE');
    const lignesAvant = (await journal(c)).length;
    await c.query(lire(INVERSE));
    const rC = await refus(c, RUN, '2026-11-12T13:00:00.000Z');
    const fC = (await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'cron_refus_journaliser'`)).rows[0].n;
    ok(rC.ok && fC === 0 && (await journal(c)).length === lignesAvant, 'C : fonction et déclencheur retirés ; la note s\'écrit comme avant, rien de journalisé ; les lignes déjà écrites restent', { rC, fC });

    console.log('D. MIGRATION rejouée');
    await c.query(lire(MIGRATION));
    await tourMigration(c, ok, 'D');
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
