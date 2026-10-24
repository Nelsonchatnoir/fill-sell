// ═══════════════════════════════════════════════════════════════════════════
// REMISE EN LIGNE VINTED — RATTRAPAGE DU STOCK EXISTANT (24/10, feu vert 1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Après la migration 20261024170000 (la règle du 08/10 reconstruite sur la prod du 24/10). Pour chaque compte : le
// moteur (_shared/rapprochement/remises-en-ligne.js, portée « toutes ») sur les données de prod, puis SEULEMENT les
// décisions CERTAINES (« remise_en_ligne » : photo ET titre, aucun conflit, aucun concurrent) passent par
// rapprochement_v3_appliquer, qui garde ses gardes de base (même compte, même boutique, jamais deux annonces en ligne
// ensemble, vente en cours → rien). Les cas DOUTEUX (« remise_en_ligne_a_verifier ») ne sont PAS posés : aucune
// question en masse ; ils restent tels quels et sont comptés.
// Sauvegarde du compte AVANT (20261008_remises_en_ligne_vinted_sauvegarde.sql : fiches, jobs Vinted, annonces,
// doublons — tables _backup_0810_remise_*, RLS, aucun accès client). Inverse d'un compte :
// 20261008_remises_en_ligne_vinted_INVERSE.sql (__USER__, __DEPUIS__) : les fusions défaites une à une par le circuit
// de l'app, les jobs Vinted clos rouverts.
//   node scripts/reparations/20261024_remises_en_ligne_rattrapage.mjs --liste <fichier d'uuid> [--appliquer]
// Sans --appliquer : simulation (rien n'est écrit). Une ligne de bilan par compte sur la sortie.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { urlsDe, passe } from '../../supabase/functions/_shared/rapprochement/passe.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const LISTE = val('--liste');
const APPLIQUER = args.includes('--appliquer');
if (!LISTE) { console.error('--liste <fichier>'); process.exit(1); }

function q(sql) {
  const f = path.join(os.tmpdir(), `rattrapage-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  try {
    for (let essai = 1; ; essai++) {
      try {
        const brut = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-o', 'json', '-f', f],
          { cwd: RACINE, encoding: 'utf8', maxBuffer: 256 << 20, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
        return JSON.parse(brut.slice(brut.indexOf('{'))).rows;
      } catch (e) {
        if (essai >= 3) throw e;   // un appel qui échoue (réseau, file de la base) : deux nouveaux essais
      }
    }
  } finally { fs.rmSync(f, { force: true }); }
}

function lire(user) {
  const donnees = q(`SELECT public.rapprochement_v3_lire('${user}'::uuid) d;`)[0].d;
  if (donnees?.remise_en_ligne_actif === undefined) throw new Error('migration 20261024170000 absente (lecture sans remise en ligne)');
  return donnees;
}

function empreintesDe(donnees) {
  const urls = urlsDe(donnees);
  const emp = new Map();
  for (let i = 0; i < urls.length; i += 400) {
    const lot = urls.slice(i, i + 400);
    const r = q(`SELECT public.rapprochement_v3_empreintes((SELECT array_agg(x) FROM jsonb_array_elements_text('${JSON.stringify(lot).replace(/'/g, "''")}'::jsonb) x)) r;`)[0].r;
    for (const e of r.empreintes ?? []) if (e.variantes) emp.set(e.url, e);
  }
  return emp;
}

const users = fs.readFileSync(LISTE, 'utf8').split(/\s+/).filter((u) => /^[0-9a-f-]{36}$/.test(u));
const tot = { comptes: 0, certaines: 0, douteuses_laissees: 0, faits: {}, sautes: {}, erreurs: 0 };
for (const user of users) {
  const t0 = Date.now();
  try {
    const donnees = lire(user);
    const emp = empreintesDe(donnees);
    const r = passe({ ...donnees, remise_en_ligne_actif: true }, emp, { mode: 'normal', remises: 'toutes' });
    const certaines = r.decisions.filter((d) => d.type === 'remise_en_ligne');
    const douteuses = r.decisions.filter((d) => d.type === 'remise_en_ligne_a_verifier').length;
    tot.comptes++; tot.certaines += certaines.length; tot.douteuses_laissees += douteuses;
    let faits = {}, sautes = {}, erreurs = [];
    if (APPLIQUER && certaines.length) {
      q(fs.readFileSync(path.join(RACINE, 'scripts', 'reparations', '20261008_remises_en_ligne_vinted_sauvegarde.sql'), 'utf8').replace(/__USER__/g, user));
      for (let i = 0; i < certaines.length; i += 100) {
        const lot = certaines.slice(i, i + 100);
        const x = q(`SELECT public.rapprochement_v3_appliquer('${user}'::uuid, '${JSON.stringify(lot).replace(/'/g, "''")}'::jsonb, 'normal', true) r;`)[0].r;
        if (x?.reason === 'occupe') { erreurs.push({ lot: i, erreur: 'occupe' }); break; }
        for (const [k, v] of Object.entries(x?.faits ?? {})) faits[k] = (faits[k] ?? 0) + v;
        for (const [k, v] of Object.entries(x?.sautes ?? {})) sautes[k] = (sautes[k] ?? 0) + v;
        erreurs = erreurs.concat(x?.erreurs ?? []);
      }
      for (const [k, v] of Object.entries(faits)) tot.faits[k] = (tot.faits[k] ?? 0) + v;
      for (const [k, v] of Object.entries(sautes)) tot.sautes[k] = (tot.sautes[k] ?? 0) + v;
      tot.erreurs += erreurs.length;
    }
    console.log(`${user} certaines=${certaines.length} douteuses_laissees=${douteuses}${APPLIQUER ? ` faits=${JSON.stringify(faits)} sautes=${JSON.stringify(sautes)} erreurs=${erreurs.length}` : ''} ${Date.now() - t0}ms`);
  } catch (e) {
    tot.erreurs++;
    console.log(`${user} ERREUR ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`);
  }
}
console.log('TOTAL', JSON.stringify(tot));
