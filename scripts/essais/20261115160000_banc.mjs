// LE BANC de la migration 20261115160000_depop_acces_non_accorde_a_autoriser (15/11/2026, question Depop de Nico —
// merelus.serge, 3c82995d) — SUR UN POSTGRES JETABLE (embedded-postgres), jamais la prod.
//   node scripts/essais/20261115160000_banc.mjs        (npm run selftest:depop-acces-verite-pg)
// Décor : celui du banc du 13/11 (scripts/essais/20261113213000_banc.mjs : profiles, vinted_sync_runs, cross_post_jobs,
// usage_logs aux colonnes de prod, RLS, rôles, 8 comptes réels transposés), plus quatre comptes Depop :
//   SE  le cas réel : relevés Depop « absente · accès Depop non accordé », son seul poste vu SANS l'accès Depop ;
//   SR  même relevé, aucun poste connu ;
//   SA  même relevé il y a 30 min, puis son poste vu AVEC l'accès il y a 2 min (il vient d'autoriser) ;
//   SC  relevé Depop tombé sur la page de connexion (le vrai « pas connecté »), poste AVEC l'accès.
// Étapes : A. AVANT — la définition de PROD (l'inverse, lue le 15/11 à 14:12) : SE → « à connecter » + « connexion » (la
// cause) ; B. MIGRATION — SE et SR → « à autoriser » + « autoriser_depop » ; SA → plus « à autoriser » ; SC inchangé
// (« à connecter ») ; un relevé Depop réussi PLUS RÉCENT → connectée ; les 8 comptes du 13/11 : réponse IDENTIQUE à
// l'avant (hors calcule_le) ; C. INVERSE — à l'octet ; D. rejouée ; E. garde md5.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { demarrer, commeClient } from './20261113213000_banc.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = 'supabase/migrations/20261115160000_depop_acces_non_accorde_a_autoriser.sql';
const INVERSE = 'supabase/rollbacks/20261115160000_depop_acces_non_accorde_a_autoriser_INVERSE.sql';
const MIGRATION2 = 'supabase/migrations/20261115170000_depop_a_autoriser_seulement_choisie.sql';
const INVERSE2 = 'supabase/rollbacks/20261115170000_depop_a_autoriser_seulement_choisie_INVERSE.sql';

const SE = '3c82995d-0000-4000-8000-000000000101';
const SR = '3c82995d-0000-4000-8000-000000000102';
const SA = '3c82995d-0000-4000-8000-000000000103';
const SC = '3c82995d-0000-4000-8000-000000000104';
const SN = '3c82995d-0000-4000-8000-000000000105';
const NOUVEAUX = [SE, SR, SA, SC, SN];
const NON_ACCORDE = '[incomplet] accès Depop non accordé · [rattachement] par identifiant 0, automatiques 0, proposées 0';

let n = 0, ko = 0;
const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 900)}`}`); } };
const verite = async (c, uid) => {
  const r = await commeClient(c, uid, 'SELECT public.plateformes_verite($1::uuid) v', [uid]);
  return r.ok ? r.rows[0].v : { erreur: r.erreur };
};
const sansHorloge = (v) => JSON.stringify({ ...v, calcule_le: null });
const md5Def = async (c) => (await c.query(`SELECT md5(replace(pg_get_functiondef('public.plateformes_verite(uuid)'::regprocedure), chr(13), '')) m`)).rows[0].m;

const { c, arreter } = await demarrer(59100 + Math.floor(Math.random() * 800));
try {
  const poste = (le, acces) => JSON.stringify({ 'a1e9441e-363e-4931-98d4-3669945f664a': { le, depop_acces: acces === null ? undefined : String(acces), opla_acces: 'false' } });
  const il = (min) => new Date(Date.now() - min * 60_000).toISOString();
  await c.query(`INSERT INTO public.profiles VALUES
    ($1, '{}', '{"plateformes_vendeur": ["vinted","depop"]}', now(), '0.6.186', $5::jsonb),
    ($2, '{}', '{"plateformes_vendeur": ["depop"]}', now(), '0.6.186', '{}'),
    ($3, '{}', '{"plateformes_vendeur": ["depop"]}', now(), '0.6.186', $6::jsonb),
    ($4, '{}', '{"plateformes_vendeur": ["depop"]}', now(), '0.6.186', $7::jsonb),
    ($8, '{}', '{"plateformes_vendeur": ["vinted"]}', now(), '0.6.186', $5::jsonb)`,
  [SE, SR, SA, SC, poste(il(2), false), poste(il(2), true), poste(il(2), true), SN]);
  for (const u of NOUVEAUX) await c.query('INSERT INTO public.banc_depop_ok VALUES ($1)', [u]);
  await c.query(`INSERT INTO public.vinted_sync_runs (user_id, kind, platform, status, erreur, finished_at, started_at, items_vus) VALUES
    ($1, 'annonces', 'depop', 'absente', $5, now() - interval '30 minutes', now() - interval '31 minutes', 0),
    ($1, 'annonces', 'depop', 'absente', $5, now() - interval '90 minutes', now() - interval '91 minutes', 0),
    ($2, 'annonces', 'depop', 'absente', $5, now() - interval '30 minutes', now() - interval '31 minutes', 0),
    ($3, 'annonces', 'depop', 'absente', $5, now() - interval '30 minutes', now() - interval '31 minutes', 0),
    ($4, 'annonces', 'depop', 'absente', '[incomplet] Connexion Depop requise : page de connexion', now() - interval '30 minutes', now() - interval '31 minutes', 0)`,
  [SE, SR, SA, SC, NON_ACCORDE]);
  const tous = (await c.query('SELECT id FROM public.profiles ORDER BY id')).rows.map((r) => r.id);
  const anciens = tous.filter((u) => !NOUVEAUX.includes(u));

  console.log('A. AVANT — la définition de PROD (lue le 15/11 à 14:12)');
  await c.query(lire(INVERSE));
  await c.query('GRANT EXECUTE ON FUNCTION public.plateformes_verite(uuid) TO authenticated, service_role');
  const md5A = await md5Def(c);
  const av = {};
  for (const u of tous) av[u] = await verite(c, u);
  const seA = av[SE].plateformes?.depop;
  ok(seA?.etat === 'a_connecter' && seA?.action === 'connexion', 'A : le cas réel → « à connecter » + « Me connecter » (LA CAUSE : il est connecté, il lui manque l\'autorisation)', seA);

  console.log('B. MIGRATION');
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION2));
  const ap = {};
  for (const u of tous) ap[u] = await verite(c, u);
  const se = ap[SE].plateformes?.depop;
  ok(se?.etat === 'a_autoriser' && se?.action === 'autoriser_depop', 'B : le cas réel → « à autoriser » + « autoriser_depop »', se);
  ok(se?.postes?.sans_acces_vu_le && !se?.postes?.acces_vu_le, 'B : le poste sans l\'accès Depop est rendu (postes)', se?.postes);
  const sr = ap[SR].plateformes?.depop;
  ok(sr?.etat === 'a_autoriser' && sr?.motif === 'releve_depop_non_autorise' && sr?.action === 'autoriser_depop', 'B : relevé « accès Depop non accordé », aucun poste connu → « à autoriser » (par le relevé)', sr);
  const sa = ap[SA].plateformes?.depop;
  ok(sa?.etat !== 'a_autoriser' && sa?.etat !== 'a_connecter', 'B : il vient d\'autoriser (poste AVEC l\'accès, plus récent que le relevé) → plus « à autoriser », jamais « à connecter »', sa);
  const sc = ap[SC].plateformes?.depop;
  ok(sc?.etat === 'a_connecter' && sc?.action === 'connexion', 'B : relevé tombé sur la page de connexion → « à connecter » + « Me connecter » (inchangé : le vrai « pas connecté »)', sc);
  await c.query(`INSERT INTO public.vinted_sync_runs (user_id, kind, platform, status, erreur, finished_at, started_at, items_vus) VALUES ($1, 'annonces', 'depop', 'done', '[rattachement] 4', now() - interval '1 minute', now() - interval '2 minutes', 4)`, [SR]);
  const sr2 = (await verite(c, SR)).plateformes?.depop;
  ok(sr2?.etat === 'connectee', 'B : un relevé Depop réussi PLUS RÉCENT → connectée', sr2);
  const diffs = anciens.filter((u) => sansHorloge(av[u]) !== sansHorloge(ap[u])).map((u) => u.slice(0, 8));
  ok(diffs.length === 0, `B : les ${anciens.length} comptes du banc du 13/11 → réponse IDENTIQUE à l'avant (hors horloge)`, diffs);
  const opla = ['vinted', 'leboncoin', 'ebay', 'beebs'].every((p) => JSON.stringify(av[SE].plateformes?.[p] ?? null) === JSON.stringify(ap[SE].plateformes?.[p] ?? null));
  ok(opla, 'B : chez le cas réel, les autres plateformes sont inchangées');
  const dr = (await c.query(`SELECT proacl::text a, prosecdef s, provolatile v FROM pg_proc WHERE proname = 'plateformes_verite'`)).rows[0];
  ok(['etat', 'action', 'motif', 'source'].every((k) => av[SN].plateformes?.depop?.[k] === ap[SN].plateformes?.depop?.[k]) && ap[SN].plateformes?.depop?.etat !== 'a_autoriser', "B : Depop NON choisi, poste sans l'accès, aucun relevé Depop → état, action, motif inchangés (jamais « à autoriser » à qui ne vend pas sur Depop)", ap[SN].plateformes?.depop);
  ok(dr.s === false && dr.v === 's' && /authenticated=X/.test(dr.a), 'B : toujours INVOKER, STABLE, exécutable par authenticated', dr);
  const autre = await commeClient(c, SE, 'SELECT public.plateformes_verite($1::uuid) v', [SR]);
  ok(autre.ok && autre.rows[0].v.ok === false, 'B : la vérité d\'un AUTRE compte → refusée (inchangé)', autre);

  console.log('C. INVERSE');
  await c.query(lire(INVERSE2));
  await c.query(lire(INVERSE));
  ok(await md5Def(c) === md5A, 'C : la définition de prod, à l\'octet');
  ok((await verite(c, SE)).plateformes?.depop?.etat === 'a_connecter', 'C : le cas réel retombe sur « à connecter » (comportement d\'avant)');

  console.log('D. MIGRATION rejouée');
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION2));
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION2));
  ok((await verite(c, SE)).plateformes?.depop?.etat === 'a_autoriser', 'D : appliquée, puis rejouée sans erreur (garde : déjà appliquée)');

  console.log('E. GARDE md5');
  await c.query(lire(INVERSE));
  await c.query(`CREATE OR REPLACE FUNCTION public.plateformes_verite(p_user uuid DEFAULT auth.uid()) RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT '{}'::jsonb $f$`);
  let refus = null;
  try { await c.query(lire(MIGRATION)); } catch (e) { refus = e.message; }
  ok(/a changé en prod/.test(refus ?? ''), 'E : une définition de prod changée depuis le 15/11 → la migration REFUSE', refus);
} finally { await arreter(); }
console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
process.exit(ko ? 1 : 0);
