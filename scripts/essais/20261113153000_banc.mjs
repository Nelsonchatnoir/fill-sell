// LE BANC de la migration 20261113153000_bordereau_imprime_le (13/11/2026, étape 5 du lot « zéro problème », demande de
// Nico pour le compte faf5021a : « Bordereau du JJ/MM · Imprimé le JJ/MM ») — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste),
// jamais la prod.
//   node scripts/essais/20261113153000_banc.mjs
// Décor : bordereaux_copies telle qu'en prod (colonnes lues le 13/11 ; RLS « lecture de ses lignes », aucune politique
// d'écriture, droits de table du 16/10), plateforme_commandes réduite à ce que la clé étrangère demande, auth.uid() lu
// comme Supabase (request.jwt.claim.sub), rôles anon / authenticated / service_role.
// Étapes : A. AVANT — ni colonne ni RPC ; B. MIGRATION — propriétaire seul, idempotente (premier horodatage gardé, aucune
// ligne réécrite au second appel), copie effacée ignorée, anon refusé, sans session refusé, 60 au plus, écriture directe
// toujours fermée par la RLS ; C. INVERSE — colonne et RPC retirées, lignes intactes ; D. MIGRATION rejouée — B de nouveau.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261113153000_bordereau_imprime_le.sql';
export const INVERSE = 'supabase/rollbacks/20261113153000_bordereau_imprime_le_INVERSE.sql';

const U1 = '447d920c-0000-4000-8000-000000000001'; // le compte qui imprime (préfixe du compte relié 447d920c, id d'essai)
const U2 = 'faf5021a-0000-4000-8000-000000000002'; // un autre compte
const C1 = '0c962910-0000-4000-8000-0000000000c1'; // copie de U1 (la dernière de 447d920c en prod : 0c962910, 10/11)
const C2 = '125a231f-0000-4000-8000-0000000000c2'; // copie de U2
const C3 = 'd345bf74-0000-4000-8000-0000000000c3'; // copie de U1, effacée
const C4 = '54838759-0000-4000-8000-0000000000c4'; // copie de U1, jamais demandée

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $f$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.plateforme_commandes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), platform text NOT NULL DEFAULT 'vinted');
-- bordereaux_copies : la définition du 16/10 (20261016170000), colonnes identiques à la prod lue le 13/11.
CREATE TABLE public.bordereaux_copies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commande_id      uuid NOT NULL REFERENCES public.plateforme_commandes(id) ON DELETE CASCADE,
  chemin           text NOT NULL UNIQUE CHECK (char_length(chemin) <= 300),
  taille_octets    integer CHECK (taille_octets IS NULL OR taille_octets BETWEEN 0 AND 5242880),
  cree_le          timestamptz NOT NULL DEFAULT now(),
  expire_le        timestamptz NOT NULL DEFAULT (now() + interval '5 days'),
  efface_le        timestamptz,
  CHECK (expire_le <= cree_le + interval '5 days')
);
ALTER TABLE public.bordereaux_copies ENABLE ROW LEVEL SECURITY;
CREATE POLICY bordereaux_copies_lecture ON public.bordereaux_copies FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bordereaux_copies TO authenticated;
GRANT SELECT ON public.plateforme_commandes TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
`;

const DONNEES = `
INSERT INTO auth.users (id) VALUES ('${U1}'), ('${U2}');
INSERT INTO public.plateforme_commandes (id, user_id) VALUES ('${C1}', '${U1}'), ('${C2}', '${U2}'), ('${C3}', '${U1}'), ('${C4}', '${U1}');
INSERT INTO public.bordereaux_copies (id, user_id, commande_id, chemin, cree_le, expire_le, efface_le) VALUES
  ('${C1}', '${U1}', '${C1}', 'u1/c1.pdf', '2026-11-10 10:16:46+00', '2026-11-15 10:16:46+00', NULL),
  ('${C2}', '${U2}', '${C2}', 'u2/c2.pdf', '2026-11-08 15:28:20+00', '2026-11-13 15:28:20+00', NULL),
  ('${C3}', '${U1}', '${C3}', 'u1/c3.pdf', '2026-11-07 21:07:14+00', '2026-11-12 21:07:14+00', '2026-11-12 22:00:00+00'),
  ('${C4}', '${U1}', '${C4}', 'u1/c4.pdf', '2026-11-07 20:54:41+00', '2026-11-12 20:54:41+00', NULL);
`;

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-bordereau-imprime-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  await c.query(DONNEES);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

/** Un appel « depuis l'app » : rôle authenticated (ou anon), session = uid (null = sans session). */
export async function commeClient(c, uid, sql, params = [], role = 'authenticated') {
  await c.query('BEGIN');
  try {
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return { ok: true, rows: r.rows, rowCount: r.rowCount };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    return { ok: false, erreur: e.message, code: e.code };
  }
}

const marquer = (c, uid, ids, role) => commeClient(c, uid, 'SELECT public.bordereau_marquer_imprime($1::uuid[]) r', [ids], role);
const etat = async (c) => {
  const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bordereaux_copies' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
  const aCol = cols.includes('imprime_le');
  const lignes = (await c.query(`SELECT id::text, user_id::text, chemin, cree_le, expire_le, efface_le${aCol ? ', imprime_le' : ''}, xmin::text x FROM public.bordereaux_copies ORDER BY id`)).rows;
  const fn = (await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'bordereau_marquer_imprime'`)).rows[0].n;
  return { cols, aCol, lignes, fn };
};
const sans = (lignes, cles) => lignes.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !cles.includes(k))));

async function tourMigration(c, ok, prefixe) {
  const avant = await etat(c);
  ok(avant.aCol && avant.fn === 1, `${prefixe} : colonne imprime_le et RPC présentes`, avant);
  ok(avant.lignes.every((l) => l.imprime_le === null), `${prefixe} : aucune ligne existante marquée (colonne nulle partout)`);
  const r1 = await marquer(c, U1, [C1, C2, C3, null, C1]);
  const v1 = r1.ok ? r1.rows[0].r : null;
  ok(r1.ok && v1.marquees === 1 && v1.copies.length === 1 && v1.copies[0].id === C1 && v1.copies[0].imprime_le, `${prefixe} : U1 marque [sa copie, celle de U2, sa copie effacée, null, doublon] → 1 marquée, seule la sienne rendue`, r1);
  const e1 = await etat(c);
  const l = (id) => e1.lignes.find((x) => x.id === id);
  ok(l(C1).imprime_le && !l(C2).imprime_le && !l(C3).imprime_le && !l(C4).imprime_le, `${prefixe} : la copie de U2, la copie effacée et la copie non demandée restent nulles`, e1.lignes);
  const premier = l(C1).imprime_le?.toISOString?.() ?? String(l(C1).imprime_le);
  const xmin1 = l(C1).x;
  await new Promise((r) => setTimeout(r, 20));
  const r2 = await marquer(c, U1, [C1]);
  const e2 = await etat(c);
  const l2 = e2.lignes.find((x) => x.id === C1);
  ok(r2.ok && r2.rows[0].r.marquees === 0 && (l2.imprime_le?.toISOString?.() ?? String(l2.imprime_le)) === premier && l2.x === xmin1, `${prefixe} : idempotente — second appel : 0 marquée, premier horodatage gardé, ligne PAS réécrite (xmin identique)`, { r2, premier, apres: l2 });
  const r3 = await marquer(c, U2, [C1]);
  ok(r3.ok && r3.rows[0].r.marquees === 0 && r3.rows[0].r.copies.length === 0, `${prefixe} : U2 ne voit ni ne marque la copie de U1`, r3);
  const r4 = await marquer(c, null, [C4]);
  ok(!r4.ok && /session requise/.test(r4.erreur), `${prefixe} : sans session → refus`, r4);
  const r5 = await marquer(c, U1, [C4], 'anon');
  ok(!r5.ok && /permission denied/.test(r5.erreur), `${prefixe} : anon → refus (droit d'exécution)`, r5);
  const beaucoup = Array.from({ length: 61 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const r6 = await marquer(c, U1, beaucoup);
  ok(!r6.ok && /60 au plus/.test(r6.erreur), `${prefixe} : 61 copies → refus (60 au plus)`, r6);
  const r7 = await marquer(c, U1, []);
  ok(r7.ok && r7.rows[0].r.marquees === 0, `${prefixe} : liste vide → rien`, r7);
  const r8 = await commeClient(c, U1, `UPDATE public.bordereaux_copies SET imprime_le = now() WHERE id = $1`, [C4]);
  const e3 = await etat(c);
  ok(r8.ok && r8.rowCount === 0 && !e3.lignes.find((x) => x.id === C4).imprime_le, `${prefixe} : écriture DIRECTE du client toujours fermée par la RLS (0 ligne)`, r8);
  const r9 = await commeClient(c, U1, `SELECT id::text, imprime_le FROM public.bordereaux_copies ORDER BY id`);
  ok(r9.ok && r9.rows.length === 3 && r9.rows.every((x) => [C1, C3, C4].includes(x.id)), `${prefixe} : U1 lit imprime_le de SES copies seulement (RLS de lecture inchangée)`, r9);
  const dr = (await c.query(`SELECT proacl::text a, prosecdef s FROM pg_proc WHERE proname = 'bordereau_marquer_imprime'`)).rows[0];
  ok(dr.s === true && /authenticated=X/.test(dr.a) && !/anon=X/.test(dr.a) && !/(^|[{,])=X/.test(dr.a), `${prefixe} : SECURITY DEFINER ; EXECUTE à authenticated, jamais anon ni PUBLIC`, dr);
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  const { c, arreter } = await demarrer(56000 + Math.floor(Math.random() * 2000));
  try {
    console.log('A. AVANT — la prod');
    const A = await etat(c);
    ok(!A.aCol && A.fn === 0, 'A : ni colonne imprime_le ni RPC (la prod lue le 13/11)', A.cols);
    const lecture = await commeClient(c, U1, `SELECT id, imprime_le FROM public.bordereaux_copies`);
    ok(!lecture.ok && lecture.code === '42703', 'A : lire imprime_le échoue (42703) — d\'où la lecture À PART de l\'app', lecture);
    const lignesA = sans(A.lignes, ['x']);

    console.log('B. MIGRATION');
    await c.query(lire(MIGRATION));
    await tourMigration(c, ok, 'B');

    console.log('C. INVERSE');
    await c.query(lire(INVERSE));
    const C = await etat(c);
    ok(!C.aCol && C.fn === 0, 'C : colonne et RPC retirées', C.cols);
    ok(JSON.stringify(sans(C.lignes, ['x'])) === JSON.stringify(lignesA), 'C : les lignes intactes (mêmes colonnes et valeurs qu\'en A)');

    console.log('D. MIGRATION rejouée');
    await c.query(lire(MIGRATION));
    await tourMigration(c, ok, 'D');
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
