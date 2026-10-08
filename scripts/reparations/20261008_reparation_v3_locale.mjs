// ═══════════════════════════════════════════════════════════════════════════
// Réparation v3 EN LOCAL pour un compte trop gros pour la fonction edge
// (08/10 nuit) — le même moteur (_shared/rapprochement), la même écriture
// (rapprochement_v3_appliquer : toutes les gardes de la base), la même
// sauvegarde (_backup_0810_v3_*), les mêmes garde-fous que
// 20261008_reparation_rapprochement_v3.mjs ; seule la passe tourne ici (Node,
// pas de limite de 2 s de CPU). Deux comptes cette nuit : dbca7f39 (3 003 fiches,
// 18 193 photos, passe 2,9 s) et 7373c96c (8 204 photos de catalogue quasi
// identiques, 78 991 arêtes, passe 11 s).
//   node scripts/reparations/20261008_reparation_v3_locale.mjs --user <uuid>            (simulation, rien écrit)
//   node scripts/reparations/20261008_reparation_v3_locale.mjs --user <uuid> --appliquer
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { passe } from '../../supabase/functions/_shared/rapprochement/passe.js';
import { urlsDe } from '../../supabase/functions/_shared/rapprochement/passe.js';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const USER = val('--user');
if (!USER || !/^[0-9a-f-]{36}$/.test(USER)) { console.error('--user <uuid> obligatoire'); process.exit(1); }
const APPLIQUER = args.includes('--appliquer');

function q(sql) {
  const f = path.join(os.tmpdir(), `rl-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  try {
    const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
    const i = out.indexOf('{'); return i >= 0 ? JSON.parse(out.slice(i)).rows : [];
  } catch (e) { const t = String(e.stdout || '') + String(e.stderr || e.message); const i = t.indexOf('ERROR'); throw new Error(i >= 0 ? t.slice(i, i + 1500) : t.slice(0, 2000)); }
  finally { fs.rmSync(f, { force: true }); }
}
const etatCompte = (u) => q(`SELECT jsonb_build_object(
  'stock', (SELECT count(*) FROM inventaire WHERE user_id='${u}' AND fusionne_dans IS NULL AND statut='stock' AND a_verifier IS NULL),
  'a_verifier', (SELECT count(*) FROM inventaire WHERE user_id='${u}' AND fusionne_dans IS NULL AND a_verifier IS NOT NULL),
  'fiches', (SELECT count(*) FROM inventaire WHERE user_id='${u}'),
  'sans_article', (SELECT count(*) FROM annonces_plateforme WHERE user_id='${u}' AND inventaire_id IS NULL AND retiree_le IS NULL AND fiche_supprimee_le IS NULL AND disparu_le IS NULL),
  'jobs_actifs', (SELECT count(*) FROM cross_post_jobs WHERE user_id='${u}' AND status IN ('pending','processing'))) e;`)[0].e;

// 1. lecture (la même que la fonction)
let t0 = Date.now();
const donnees = q(`SELECT public.rapprochement_v3_lire('${USER}'::uuid) d;`)[0].d;
const urls = urlsDe(donnees);
const emp = new Map(); const illisibles = new Set();
for (let i = 0; i < urls.length; i += 400) {
  const lot = urls.slice(i, i + 400);
  const r = q(`SELECT public.rapprochement_v3_empreintes((SELECT array_agg(x) FROM jsonb_array_elements_text('${JSON.stringify(lot).replace(/'/g, "''")}'::jsonb) x)) r;`)[0].r;
  for (const e of r.empreintes ?? []) if (e.variantes) emp.set(e.url, e);
  for (const u of r.illisibles ?? []) illisibles.add(u);
}
const manquantes = urls.filter((u) => !emp.has(u) && !illisibles.has(u));
console.log(`lecture ${Date.now() - t0} ms : ${donnees.fiches.length} fiches, ${donnees.annonces.length} annonces, ${urls.length} photos, ${manquantes.length} sans empreinte`);
if (manquantes.length > 50) { console.error(`ARRÊT : ${manquantes.length} photos sans empreinte — lancer d'abord la simulation serveur (elle les met en file)`); process.exit(4); }

// 2. la passe, ici
t0 = Date.now();
const { decisions, bilan } = passe(donnees, emp, { mode: 'reparation' });
console.log(`passe ${Date.now() - t0} ms :`, JSON.stringify(bilan.plan), 'arêtes', bilan.aretes);
if (!APPLIQUER) { console.log('simulation seulement (--appliquer pour écrire)'); process.exit(0); }

// 3. sauvegarde, puis écriture par lots sous les gardes de la base
const avant = etatCompte(USER);
q(fs.readFileSync(path.join(RACINE, 'scripts', 'reparations', '20261008_reparation_v3_sauvegarde.sql'), 'utf8').replace(/__USER__/g, USER));
const faits = {}, sautes = {}; let erreurs = [];
for (let i = 0; i < decisions.length; i += 150) {
  const lot = decisions.slice(i, i + 150);
  const r = q(`SELECT public.rapprochement_v3_appliquer('${USER}'::uuid, '${JSON.stringify(lot).replace(/'/g, "''")}'::jsonb, 'reparation', true) r;`)[0].r;
  if (r?.reason === 'occupe') { erreurs.push({ lot: i, erreur: 'occupe' }); break; }
  for (const [k, v] of Object.entries(r?.faits ?? {})) faits[k] = (faits[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r?.sautes ?? {})) sautes[k] = (sautes[k] ?? 0) + v;
  erreurs = erreurs.concat(r?.erreurs ?? []);
  console.log(`lot ${i / 150 + 1}/${Math.ceil(decisions.length / 150)} : faits`, JSON.stringify(r?.faits ?? {}), 'sautés', JSON.stringify(r?.sautes ?? {}), 'erreurs', (r?.erreurs ?? []).length);
}
const bilanJson = { version: 3, mode: 'reparation', geste: true, local: true, faits, sautes, erreurs: erreurs.slice(0, 20), passe: bilan, le: new Date().toISOString() };
q(`INSERT INTO rapprochement_comptes AS c (user_id, etat, demande_le, debut_le, fin_le, maj_le, a_traiter, traitees, bilan)
   VALUES ('${USER}', 'termine', now(), now(), now(), now(), 0, ${decisions.length}, '${JSON.stringify(bilanJson).replace(/'/g, "''")}'::jsonb)
   ON CONFLICT (user_id) DO UPDATE SET etat = 'termine', fin_le = now(), maj_le = now(), a_traiter = 0, traitees = EXCLUDED.traitees, bilan = EXCLUDED.bilan;`);
const apres = etatCompte(USER);
const prevu = decisions.length, fait = Object.values(faits).reduce((a, b) => a + b, 0) + Object.values(sautes).reduce((a, b) => a + b, 0);
console.log(USER, JSON.stringify({ faits, sautes, erreurs: erreurs.length, stock: `${avant.stock}→${apres.stock}`, a_verifier: `${avant.a_verifier}→${apres.a_verifier}`, sans_article: `${avant.sans_article}→${apres.sans_article}`, fiches: `${avant.fiches}→${apres.fiches}` }));
if (apres.fiches < avant.fiches || apres.jobs_actifs > avant.jobs_actifs || erreurs.length) { console.error('ARRÊT : garde-fou (fiches, jobs ou erreurs)'); process.exit(2); }
if (prevu - fait > Math.max(5, 0.25 * prevu)) { console.error(`ARRÊT : écart (prévu ${prevu}, faites+sautées ${fait})`); process.exit(3); }
console.log('OK');
