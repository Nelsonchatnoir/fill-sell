// ═══════════════════════════════════════════════════════════════════════════
// TOUS LES SELFTESTS, UN PAR UN — `node scripts/selftests-sequentiels.mjs [--sortie f.json] [--filtre motif]`
// ═══════════════════════════════════════════════════════════════════════════
// La suite complète lancée en parallèle (ou d'un seul `npm run` chaîné) plante
// faute de mémoire sur le poste de Nico. Ce lanceur prend chaque script
// `selftest:*` de package.json, le joue SEUL (un processus à la fois, la
// commande telle qu'écrite), note vert / rouge, la durée et la fin de la sortie
// d'un rouge. Aucun drapeau `--prod` n'est ajouté : un selftest qui lit la base
// ne le fait que si sa propre commande le demande.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const val = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
const sortie = val('--sortie');
const filtre = val('--filtre');

const scripts = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')).scripts;
const noms = Object.keys(scripts).filter((n) => n.startsWith('selftest:') && (!filtre || n.includes(filtre)));
const resultats = [];
const debut = Date.now();
for (const [i, nom] of noms.entries()) {
  const t0 = Date.now();
  const r = spawnSync(scripts[nom], { cwd: RACINE, shell: true, encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } });
  const ok = r.status === 0;
  const ms = Date.now() - t0;
  const fin = ok ? '' : `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n');
  resultats.push({ nom, ok, ms, code: r.status, signal: r.signal ?? null, ...(ok ? {} : { fin }) });
  console.log(`${ok ? '✓' : '✗'} [${i + 1}/${noms.length}] ${nom} (${(ms / 1000).toFixed(1)} s)${ok ? '' : `\n${fin.split('\n').map((l) => `    ${l}`).join('\n')}`}`);
}
const rouges = resultats.filter((r) => !r.ok);
const bilan = { le: new Date().toISOString(), total: resultats.length, verts: resultats.length - rouges.length, rouges: rouges.map((r) => r.nom), duree_s: Math.round((Date.now() - debut) / 1000), resultats };
if (sortie) writeFileSync(sortie, JSON.stringify(bilan, null, 2));
console.log(`\n${rouges.length ? '✗' : '✓'} ${bilan.verts}/${bilan.total} verts en ${bilan.duree_s} s${rouges.length ? ` — rouges : ${rouges.map((r) => r.nom).join(', ')}` : ''}`);
process.exit(rouges.length ? 1 : 0);
