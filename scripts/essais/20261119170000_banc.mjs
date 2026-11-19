// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261119170000_cloud_capacite_conso_reelle (19/11/2026, décision de Nico :
// la capacité du Cloud sur la consommation RÉELLE de chaque navigateur, plus de plafond fixe à 30) — jamais la prod.
//   node scripts/essais/20261119170000_banc.mjs
// Corps de PROD relu le 19/11 (pg_get_functiondef, md5 2a9387a0cafdce2fc12eec735c6be7d6) = le fichier inverse.
//   A. AVANT : le corps de prod chargé à l'octet ; une semaine de fenêtres de 5 min comme cloud-2 (comptes, mémoire du
//      conteneur cache compris, mémoire non récupérable, oom, signes) ;
//   B. APRÈS : toutes les clés d'avant IDENTIQUES (l'orchestrateur d'avant les lit encore) ; les nouvelles : conso au pire
//      moment de chaque compte (95e centile, max), hôte par navigateur au pire, détail d'une entrée par fenêtre (ouverts,
//      mémoire utilisée, processeur, puce, oom, restrictions + blocages) ; une fenêtre sans comptes ou à comptes illisibles ne
//      casse rien ; capaciteReelle (flotte.js) sur la sortie SQL = la règle recalculée en JS sur les lignes brutes ; droits
//      (service_role seul) ; temps d'un appel sur 7 jours ;
//   C. l'INVERSE rend le corps de prod à l'octet (md5).
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { capaciteReelle, reserveMemoireMo } from '../../serveur-cloud/src/flotte.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8');
const MD5_PROD = '2a9387a0cafdce2fc12eec735c6be7d6';
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-capacite-'));
const bd = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55463, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
await bd.initialise();
await bd.start();
const c = new pg.Client({ connectionString: 'postgres://postgres:banc@127.0.0.1:55463/postgres' });
await c.connect();
let verts = 0, rouges = 0;
const verifier = (m, ok, d = '') => { if (ok) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d ? `\n      ← ${String(d).slice(0, 600)}` : ''}`); } };
const un = async (q, a = []) => (await c.query(q, a)).rows[0];
const md5Fonction = async () => (await un(`SELECT md5(pg_get_functiondef('public.cloud_capacite_mesures(text,integer)'::regprocedure)) m`)).m;
const appel = async (h = 168, s = 'cloud-2') => (await un('SELECT public.cloud_capacite_mesures($1, $2) r', [s, h])).r;

// Une semaine comme cloud-2 (graine fixe) : 5 à 13 navigateurs, 64 076 Mo ; chaque compte a sa mémoire non récupérable
// propre (300 à 1 300 Mo) ; un pic de mémoire, de processeur et de puce ; un oom et un blocage dans deux fenêtres.
let graine = 19112026;
const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
const TOTAL = 64076;
const COMPTES = Array.from({ length: 15 }, (_, i) => ({ u: `0000000${i.toString(16)}-0000-4000-8000-000000000000`.slice(-36), base: 300 + 70 * i }));
const lignes = [];
const maintenant = Date.now();
for (let k = 2015; k >= 0; k--) {
  const le = new Date(maintenant - k * 5 * 60_000 - 30_000);
  const n = 5 + Math.floor((2015 - k) / 2016 * 8);
  const ouverts = COMPTES.slice(0, n);
  const comptes = {};
  let utilisee = 1500;
  for (const o of ouverts) {
    const nonrec = Math.round(o.base + hasard() * 60);
    utilisee += nonrec * 0.9;
    comptes[o.u] = { mem_max_mo: Math.min(2044, nonrec + 700 + Math.round(hasard() * 300)), mem_med_mo: nonrec + 500, nonrec_med_mo: nonrec,
      cpu_moy_fils: 0.01, cpu_max_fils: 0.2, puce_moy_pct: 0, puce_max_pct: 0.1, bride_part: 0, oom: 0,
      signes: { datadome: 0, verification_appareil: 0, glissiere: 0, restriction: 0, blocage: 0 } };
  }
  let cpu = Math.round(10 + hasard() * 15) / 10; let puce = Math.round(10 + hasard() * 30) / 10;   // au dixième : le détail les arrondit au dixième
  if (k === 700) { utilisee += 2500; cpu = 3.9; }
  if (k === 400) puce = 15.2;
  if (k === 300) comptes[COMPTES[0].u].oom = 1;
  if (k === 200) comptes[COMPTES[1].u].signes.blocage = 1;
  lignes.push({ serveur: 'cloud-2', le, hote: { navigateurs_max: n, mem_total_mo: TOTAL, mem_dispo_min_mo: Math.round(TOTAL - utilisee),
    mem_utilisee_max_pct: Math.round(1000 * utilisee / TOTAL) / 10, cpu_moy_pct: cpu / 2, cpu_p95_pct: cpu,
    puce_moy_pct: puce / 2, puce_p95_pct: puce, charge1_max: 1, points: 10 }, comptes });
}

try {
  await c.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    CREATE TABLE public.cloud_mesures (id bigserial PRIMARY KEY, serveur text NOT NULL, le timestamptz NOT NULL DEFAULT now(),
      hote jsonb NOT NULL DEFAULT '{}'::jsonb, comptes jsonb NOT NULL DEFAULT '{}'::jsonb);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
  for (const l of lignes) {
    await c.query('INSERT INTO public.cloud_mesures (serveur, le, hote, comptes) VALUES ($1, $2, $3, $4)', [l.serveur, l.le, l.hote, l.comptes]);
  }
  // Un autre serveur (jamais mélangé) et une vieille ligne (hors fenêtre).
  await c.query(`INSERT INTO public.cloud_mesures (serveur, le, hote, comptes) VALUES
    ('cloud-9', now() - interval '1 hour', '{"navigateurs_max": 40, "mem_total_mo": 64076, "mem_dispo_min_mo": 1000, "cpu_p95_pct": 99}', '{}'),
    ('cloud-2', now() - interval '9 days', '{"navigateurs_max": 50, "mem_total_mo": 64076, "mem_dispo_min_mo": 100}', '{}')`);

  // A. AVANT.
  const INVERSE = lire('supabase/rollbacks/20261119170000_cloud_capacite_conso_reelle_INVERSE.sql');
  await c.query(INVERSE);
  const md5Avant = await md5Fonction();
  verifier(`A. AVANT : le corps de prod chargé à l'octet (md5 ${md5Avant})`, md5Avant === MD5_PROD);
  const avant168 = await appel(168); const avant24 = await appel(24);
  verifier(`A. la fonction d'avant sur la semaine : ${avant168.fenetres} fenêtres, n_mem ${avant168.n_mem} (mémoire du conteneur ${avant168.mem_compte_p95_mo} Mo, 70 %)`,
    avant168.fenetres === 2016 && !('detail' in avant168));

  // B. APRÈS.
  await c.query(lire('supabase/migrations/20261119170000_cloud_capacite_conso_reelle.sql'));
  const apres168 = await appel(168); const apres24 = await appel(24);
  const anciennes = (o) => Object.fromEntries(Object.keys(avant168).map((k) => [k, o[k]]));
  verifier('B1. toutes les clés d’avant IDENTIQUES (7 jours et 24 h) : l’orchestrateur d’avant lit la même chose',
    JSON.stringify(anciennes(apres168)) === JSON.stringify(avant168) && JSON.stringify(Object.fromEntries(Object.keys(avant24).map((k) => [k, apres24[k]]))) === JSON.stringify(avant24),
    JSON.stringify({ avant168, apres: anciennes(apres168) }));
  // La conso recalculée en JS sur les lignes brutes.
  const pireParCompte = new Map();
  for (const l of lignes) for (const [u, v] of Object.entries(l.comptes)) pireParCompte.set(u, Math.max(pireParCompte.get(u) ?? 0, v.nonrec_med_mo));
  const pires = [...pireParCompte.values()].sort((a, b) => a - b);
  const p95 = (() => { const x = 0.95 * (pires.length - 1); const i = Math.floor(x); return pires[i] + (pires[Math.min(i + 1, pires.length - 1)] - pires[i]) * (x - i); })();
  const hotePire = Math.max(...lignes.map((l) => (TOTAL - l.hote.mem_dispo_min_mo) / l.hote.navigateurs_max));
  verifier(`B2. conso au pire moment : 95e centile des comptes ${apres168.conso_compte_pire_mo} Mo (JS ${Math.round(p95)}), pire compte ${apres168.conso_compte_max_mo}, ${apres168.conso_comptes} comptes`,
    apres168.conso_compte_pire_mo === Math.round(p95) && apres168.conso_compte_max_mo === pires.at(-1) && apres168.conso_comptes === pireParCompte.size && pires.length === 12);
  verifier(`B3. hôte par navigateur au pire moment : ${apres168.conso_hote_pire_mo} Mo (JS ${Math.round(hotePire)})`, apres168.conso_hote_pire_mo === Math.round(hotePire));
  const d = apres168.detail;
  const iPic = lignes.findIndex((l) => l.hote.puce_p95_pct === 15.2);
  verifier(`B4. le détail : une entrée par fenêtre, dans l’ordre (${d.length}), [instant, ouverts, utilisée, processeur, puce, oom, graves]`,
    d.length === 2016 && d.every((x, i) => i === 0 || x[0] > d[i - 1][0]) && d[iPic][4] === 15.2
      && d[iPic][1] === lignes[iPic].hote.navigateurs_max && d[iPic][2] === Math.round(TOTAL - lignes[iPic].hote.mem_dispo_min_mo),
    JSON.stringify(d[iPic]));
  const oomI = lignes.findIndex((l) => l.comptes[COMPTES[0].u]?.oom === 1);
  const blocI = lignes.findIndex((l) => l.comptes[COMPTES[1].u]?.signes?.blocage === 1);
  verifier('B5. oom et restrictions + blocages portés par LEUR fenêtre, nulle part ailleurs',
    d[oomI][5] === 1 && d[blocI][6] === 1 && d.reduce((s, x) => s + x[5], 0) === 1 && d.reduce((s, x) => s + x[6], 0) === 1);
  verifier('B6. un autre serveur et une ligne de plus de 7 jours ne comptent pas', apres168.fenetres === 2016 && apres168.comptes_max === 12);
  // La règle JS sur la sortie SQL = la règle recalculée sur les lignes brutes.
  const conso = Math.max(Math.round(p95), Math.round(hotePire));
  const reserve = reserveMemoireMo(TOTAL);
  let mem = Infinity, cpu = Infinity, puce = Infinity;
  for (const l of lignes) {
    const n = l.hote.navigateurs_max; const u = Math.round(TOTAL - l.hote.mem_dispo_min_mo);
    mem = Math.min(mem, n + (TOTAL - reserve - u) / conso);
    cpu = Math.min(cpu, (n * 60) / l.hote.cpu_p95_pct);
    puce = Math.min(puce, (n * 60) / l.hote.puce_p95_pct);
  }
  const r = capaciteReelle(apres168);
  const attendu = Math.floor(Math.min(mem, puce, cpu, 250));
  verifier(`B7. capaciteReelle sur la sortie SQL : ${r.atteignable} (mémoire ${r.n_mem}, processeur ${r.n_cpu}, puce ${r.n_puce}, conso ${r.conso_mo} Mo ; recalcul JS ${attendu})`,
    r.source === 'reelle' && r.atteignable === attendu && r.n_mem === Math.floor(mem), JSON.stringify(r));
  // Fenêtres sans comptes, à comptes illisibles, sans mesure de l'hôte : rien ne casse.
  await c.query(`INSERT INTO public.cloud_mesures (serveur, le, hote, comptes) VALUES
    ('cloud-3', now() - interval '10 minutes', '{"navigateurs_max": 0, "mem_total_mo": 64076, "mem_dispo_min_mo": 63000}', '{}'),
    ('cloud-3', now() - interval '5 minutes', '{"navigateurs_max": 2}', '{"x": 3, "y": {"oom": null, "nonrec_med_mo": 900}}')`);
  const vide = await appel(168, 'cloud-3');
  const rien = await appel(168, 'cloud-inconnu');
  verifier(`B8. fenêtres sans comptes ou illisibles : ${JSON.stringify({ detail: vide.detail, conso: vide.conso_compte_pire_mo, hote: vide.conso_hote_pire_mo })} ; serveur inconnu : détail ${JSON.stringify(rien.detail)}`,
    vide.detail.length === 2 && vide.conso_compte_pire_mo === 900 && vide.conso_hote_pire_mo == null && Array.isArray(rien.detail) && rien.detail.length === 0 && rien.fenetres === 0);
  // Droits : service_role seul.
  const droits = (await un(`SELECT has_function_privilege('service_role', 'public.cloud_capacite_mesures(text,integer)', 'EXECUTE') s,
    has_function_privilege('anon', 'public.cloud_capacite_mesures(text,integer)', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.cloud_capacite_mesures(text,integer)', 'EXECUTE') u`));
  verifier(`B9. droits : service_role ${droits.s}, anon ${droits.a}, authenticated ${droits.u}`, droits.s === true && droits.a === false && droits.u === false);
  const t0 = performance.now(); for (let i = 0; i < 5; i++) await appel(168); const ms = (performance.now() - t0) / 5;
  verifier(`B10. un appel sur 7 jours (2 016 fenêtres × 5 à 12 comptes) : ${ms.toFixed(0)} ms en moyenne (une fois par heure et par serveur)`, ms < 1500);

  // C. L'inverse.
  await c.query(INVERSE);
  const md5Inv = await md5Fonction();
  const inv = await appel(168);
  verifier(`C. INVERSE : le corps de prod revient à l'octet (md5 ${md5Inv}), sans les nouvelles clés`, md5Inv === MD5_PROD && !('detail' in inv)
    && JSON.stringify(inv) === JSON.stringify(avant168));
} catch (e) {
  rouges++; console.log(`  ✗ erreur : ${e.message}`);
} finally {
  await c.end().catch(() => {});
  await bd.stop().catch(() => {});
  try { rmSync(dossier, { recursive: true, force: true }); } catch { /* */ }
}
console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
