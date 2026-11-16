// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261116220000_cloud_ip_garde_attribuables (16/11/2026, ordre URGENT de
// Nico : « Complet » affiché alors qu'une IP pouvait être achetée) — jamais la prod.
//   node scripts/essais/20261116220000_banc.mjs
// Corps de PROD relus le 16/11 : cloud_param, cloud_ip_refus_prouve, cloud_ip_attribuable (ci-dessous, mot pour mot) et
// cloud_ip_garde_nombre (le fichier inverse = le corps de prod, md5 f5b37e208dd87aa50de028a87789cdb1).
//   A. AVANT : le pool du 16/11 (9 IP attribuées ; la 3 réservée jusqu'au soir ; la 39 réservée à Nico ; la 40 et la 76
//      au repos ; la 80 achetée) → la garde REFUSE la 2e IP (vivantes comptent la 3 et la 39) — le défaut ;
//   B. APRÈS : seules les IP en route ou attribuables à un nouveau compte comptent : 2 IP passent ; le miroir JS
//      (cloud-pool.js gardeNombre) = le SQL sur 300 pools au hasard ; « un achat que le plan demande passe toujours » ;
//      le plan du jour achète quand aucune IP n'est attribuable (le cas du 16/11) ;
//   C. l'INVERSE rend le corps de prod à l'octet (md5).
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8');
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-ip-attribuables-'));
const bd = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55452, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
await bd.initialise();
await bd.start();
const c = new pg.Client({ connectionString: 'postgres://postgres:banc@127.0.0.1:55452/postgres' });
await c.connect();
let verts = 0, rouges = 0;
const verifier = (m, ok, d = '') => { if (ok) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d ? `\n      ← ${String(d).slice(0, 600)}` : ''}`); } };
const un = async (q, a = []) => (await c.query(q, a)).rows[0];

try {
  await c.query(`
    CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_cloud boolean, cloud_essai_debut timestamptz, cloud_essai_fin timestamptz, cloud_essai_arrete boolean);
    CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, inscrit_le timestamptz DEFAULT now(), notifie_le timestamptz);
    CREATE TABLE public.cloud_ip_commandes (id bigserial PRIMARY KEY, nature text, quantite integer, statut text, prix_usd numeric);
    CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, commande text, ip inet, etat text DEFAULT 'achetee', user_id uuid, dernier_user_id uuid,
      reserve_pour uuid, reserve_jusqu_au timestamptz, repos_fin timestamptz, expire_le timestamptz, attributions integer DEFAULT 0,
      refus jsonb DEFAULT '{}'::jsonb, sante jsonb, quarantaine jsonb, rebut_critere text, rebut_le timestamptz);
    CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer)
     RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
    AS $function$
      SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut);
    $function$;
    CREATE OR REPLACE FUNCTION public.cloud_ip_refus_prouve(p_refus jsonb)
     RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
    AS $function$
      SELECT COALESCE(jsonb_typeof(p_refus) = 'object'
             AND EXISTS (SELECT 1 FROM jsonb_each(p_refus) e WHERE (e.value ->> 'prouvee')::boolean IS TRUE), false);
    $function$;
    CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text)
     RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
    AS $function$
      SELECT p.expire_le >= CASE WHEN p_nature = 'essai'
                                 THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                                  + public.cloud_param('marge_expiration_jours', 1))
                                 ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END
         AND COALESCE(p.sante ->> 'verdict', '') <> 'grillee'
         AND CASE
               WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
               WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                    AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
               ELSE false END;
    $function$;`);
  const INVERSE = lire('supabase/rollbacks/20261116220000_cloud_ip_garde_attribuables_INVERSE.sql');
  await c.query(INVERSE);   // le corps de PROD
  const md5Prod = (await un(`SELECT md5(pg_get_functiondef('public.cloud_ip_garde_nombre(integer)'::regprocedure)) m`)).m;
  verifier(`AVANT : le corps de prod chargé à l'octet (md5 ${md5Prod})`, md5Prod === 'f5b37e208dd87aa50de028a87789cdb1');

  // Le pool du 16/11 ~18:05 (prod relue) : 9 attribuées ; 3 réservée (jusqu'au soir), 39 réservée à Nico (03/12) ;
  // 40, 76 au repos ; 80 achetée à 18:06.
  const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const ins = (etat, { user = null, jours = 20, resa = null, resaJusqu = null, repos = null, attributions = 1, refus = {} } = {}) => c.query(
    `INSERT INTO public.cloud_ips (etat, user_id, dernier_user_id, expire_le, reserve_pour, reserve_jusqu_au, repos_fin, attributions, refus)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4::float8 * 86400), $5, $6, $7, $8, $9::jsonb)`,
    [etat, user, user ?? repos, jours, resa, resaJusqu, repos ? new Date(Date.now() + 4 * 86400000).toISOString() : null, attributions, JSON.stringify(refus)]);
  for (let i = 1; i <= 9; i++) { await ins(i % 2 ? 'attribuee_client' : 'attribuee_essai', { user: U(i) }); await c.query('INSERT INTO public.profiles (id, is_cloud) VALUES ($1, true)', [U(i)]); }
  await ins('disponible', { jours: 13, resa: U(50), resaJusqu: new Date(Date.now() + 3 * 3600000).toISOString(), refus: { beebs: { cause: 'blocage_anti_robot' } } });
  await ins('disponible', { jours: 17, resa: NICO, resaJusqu: new Date(Date.now() + 17 * 86400000).toISOString(), refus: { beebs: { cause: 'restreint' } } });
  await ins('repos', { repos: U(60), jours: 18 });
  await ins('repos', { repos: U(61), jours: 26 });
  await ins('achetee', { jours: 30, attributions: 0 });
  await c.query(`INSERT INTO public.coin_config VALUES ('cloud_ip_marge', 2)`);
  await c.query(`INSERT INTO public.cloud_attente (user_id) VALUES ($1)`, [U(70)]);
  const avant = (await un('SELECT public.cloud_ip_garde_nombre(1) AS g')).g;
  verifier(`A. AVANT (le défaut du 16/11) : la 2e IP REFUSÉE — vivantes ${avant.vivantes} (la 3 et la 39 réservées comptées), borne ${avant.borne}`,
    avant.ok === false && avant.vivantes === 12 && avant.borne === 12, JSON.stringify(avant));

  // B. La migration.
  await c.query(lire('supabase/migrations/20261116220000_cloud_ip_garde_attribuables.sql'));
  const g1 = (await un('SELECT public.cloud_ip_garde_nombre(1) AS g')).g;
  const g2 = (await un('SELECT public.cloud_ip_garde_nombre(2) AS g')).g;
  const g3 = (await un('SELECT public.cloud_ip_garde_nombre(3) AS g')).g;
  verifier(`B1. APRÈS : vivantes ${g1.vivantes} (9 attribuées + la 80 en route ; ni les réservées, ni le repos) ; 1 et 2 IP passent, 3 non`,
    g1.vivantes === 10 && g1.ok === true && g2.ok === true && g3.ok === false, JSON.stringify({ g1, g2, g3 }));
  const rejeu = await c.query(lire('supabase/migrations/20261116220000_cloud_ip_garde_attribuables.sql')).then(() => true, (e) => e.message);
  verifier('B2. migration rejouée : sans erreur (sa garde reconnaît son propre corps)', rejeu === true, rejeu);
  // Le plan du jour : aucune IP attribuable à un nouveau compte (la 80 encore « achetee » comptée en route) → il achète la marge.
  const ipsJs = async () => (await c.query(`SELECT id, etat, user_id, dernier_user_id, reserve_pour, reserve_jusqu_au, repos_fin, expire_le, attributions, refus, sante, quarantaine FROM public.cloud_ips`)).rows
    .map((r) => ({ ...r, user_id: r.user_id ?? null, expire_le: r.expire_le?.toISOString?.() ?? r.expire_le, reserve_jusqu_au: r.reserve_jusqu_au?.toISOString?.() ?? null, repos_fin: r.repos_fin?.toISOString?.() ?? null }));
  const ips = await ipsJs();
  const plan = regles.planDuJour({ ips, lambda: 0.5, enAttente: 1, commandesEnCours: 0, marge: 2, comptesSansPlace: 0, maintenant: Date.now() });
  verifier(`B3. le plan du jour achète (aCommander ${plan.aCommander}) : vise 3 (marge 2 + attente 1), 1 seule en route (la 80)`, plan.aCommander === 2, JSON.stringify({ a: plan.aCommander }));
  const jsG = regles.gardePour(plan.garde, 2);
  verifier('B4. la garde JS du plan = la garde SQL (2 IP)', jsG && jsG.comptees === g2.comptees && jsG.borne === g2.borne && jsG.ok === g2.ok, JSON.stringify({ jsG, g2 }));

  // B5. 300 pools au hasard : miroir JS = SQL ; un achat que le plan demande passe toujours.
  let graine = 1611;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const tirer = (n) => Math.floor(hasard() * n);
  let egaux = 0, proprietes = 0, achats = 0; const divergences = [];
  for (let k = 0; k < 300; k++) {
    await c.query('TRUNCATE public.cloud_ips, public.profiles, public.cloud_attente, public.cloud_ip_commandes; DELETE FROM public.coin_config');
    const profils = [];
    for (let i = 0, n = tirer(8); i < n; i++) { const u = U(1000 + k * 20 + i); profils.push(u); await c.query('INSERT INTO public.profiles (id, is_cloud) VALUES ($1, $2)', [u, hasard() < 0.5]); }
    const libres = [...profils];
    for (let i = 0, n = tirer(14); i < n; i++) {
      let etat = ['achetee', 'disponible', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut', 'expiree'][tirer(8)];
      let user = null;
      if (etat.startsWith('attribuee')) { if (libres.length) user = libres.splice(tirer(libres.length), 1)[0]; else etat = 'disponible'; }
      const refus = [{}, {}, {}, { beebs: { prouvee: false } }, { vinted: { prouvee: true } }][tirer(5)];
      const resa = hasard() < 0.25 ? (profils.length ? profils[tirer(profils.length)] : NICO) : null;
      const resaJ = resa ? new Date(Date.now() + (hasard() < 0.3 ? -1 : 1) * (1 + tirer(48)) * 3600000).toISOString() : null;
      const sante = hasard() < 0.1 ? { verdict: 'grillee' } : null;
      await c.query(`INSERT INTO public.cloud_ips (etat, user_id, dernier_user_id, expire_le, reserve_pour, reserve_jusqu_au, attributions, refus, sante)
        VALUES ($1, $2, $3, now() + make_interval(secs => $4::float8 * 86400), $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [etat, user, user ?? (profils.length ? profils[tirer(profils.length)] : null), tirer(38) - 3 + 0.5, resa, resaJ, tirer(8), JSON.stringify(refus), sante ? JSON.stringify(sante) : null]);
    }
    for (let i = 0, n = tirer(3); i < n && i < profils.length; i++) await c.query('INSERT INTO public.cloud_attente (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [profils[i]]);
    let enCours = 0;
    for (let i = 0, n = tirer(3); i < n; i++) {
      const st = ['demandee', 'en_cours', 'livree', 'echec'][tirer(4)]; const q = 1 + tirer(2);
      await c.query('INSERT INTO public.cloud_ip_commandes (nature, quantite, statut, prix_usd) VALUES ($1, $2, $3, 4)', ['achat', q, st]);
      if (st === 'demandee' || st === 'en_cours') enCours += q;
    }
    const marge = tirer(5);
    await c.query(`INSERT INTO public.coin_config VALUES ('cloud_ip_marge', $1)`, [marge]);
    const attente = Number((await un('SELECT count(*)::int n FROM public.cloud_attente')).n);
    const sansPlace = 0;
    const pool = await ipsJs();
    const p = regles.planDuJour({ ips: pool, lambda: 0.5, enAttente: attente, commandesEnCours: enCours, marge, comptesSansPlace: sansPlace, maintenant: Date.now() });
    // Les comptes : profils is_cloud + titulaires — le JS ne lit que les titulaires et comptesSansPlace ; on aligne ici.
    const comptesSql = Number((await un(`SELECT count(*)::int n FROM (SELECT id FROM public.profiles WHERE is_cloud UNION SELECT user_id FROM public.cloud_ips WHERE user_id IS NOT NULL AND etat IN ('attribuee_essai','attribuee_client')) s`)).n);
    const titulaires = new Set(pool.filter((i) => i.user_id && ['attribuee_essai', 'attribuee_client'].includes(i.etat)).map((i) => i.user_id)).size;
    const pAligne = regles.planDuJour({ ips: pool, lambda: 0.5, enAttente: attente, commandesEnCours: enCours, marge, comptesSansPlace: comptesSql - titulaires, maintenant: Date.now() });
    const q = Math.max(pAligne.aCommander, 1);
    const sql = (await un('SELECT public.cloud_ip_garde_nombre($1) AS g', [q])).g;
    const js = regles.gardePour(pAligne.garde, q);
    if (js && js.vivantes === sql.vivantes && js.comptees === sql.comptees && js.borne === sql.borne && js.ok === sql.ok) egaux++;
    else if (divergences.length < 3) divergences.push({ k, js, sql });
    if (pAligne.aCommander > 0) { achats++; if ((await un('SELECT public.cloud_ip_garde_nombre($1) AS g', [pAligne.aCommander])).g.ok === true) proprietes++; else if (divergences.length < 3) divergences.push({ k, achat: pAligne.aCommander }); }
    else proprietes++;
    void p;
  }
  verifier(`B5. le miroir JS (gardeNombre) = le SQL sur 300 pools au hasard (${egaux}/300)`, egaux === 300, JSON.stringify(divergences));
  verifier(`B6. « un achat que le plan demande passe toujours » (${achats} pools où le plan achète)`, proprietes === 300 && achats > 30, JSON.stringify(divergences));

  // C. L'inverse.
  await c.query(INVERSE);
  const md5Inv = (await un(`SELECT md5(pg_get_functiondef('public.cloud_ip_garde_nombre(integer)'::regprocedure)) m`)).m;
  verifier(`C. INVERSE : le corps de prod revient à l'octet (md5 ${md5Inv})`, md5Inv === 'f5b37e208dd87aa50de028a87789cdb1');
} finally {
  await c.end().catch(() => {});
  await bd.stop().catch(() => {});
  try { rmSync(dossier, { recursive: true, force: true }); } catch { /* */ }
}
console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
