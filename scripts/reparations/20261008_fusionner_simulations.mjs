// Fusionne les fichiers de simulation (plusieurs instances --simuler --part k/n)
// en UN fichier pour --appliquer --tous --simulation <fichier> : un compte = sa
// dernière simulation. Lecture seule.
//   node scripts/reparations/20261008_fusionner_simulations.mjs [--sortie <fichier>]
import fs from 'node:fs';
import path from 'node:path';
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const dossier = path.join(RACINE, 'build', 'rattachement');
const fichiers = fs.readdirSync(dossier).filter((f) => /^simulation-v3-\d+\.json$/.test(f)).map((f) => path.join(dossier, f))
  .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
const parCompte = new Map();
for (const f of fichiers) for (const x of JSON.parse(fs.readFileSync(f, 'utf8'))) if (x?.u) parCompte.set(x.u, x);
const tout = [...parCompte.values()];
const plans = {}; let simules = 0, erreurs = 0;
for (const x of tout) { if (x.etat === 'simule') simules++; if (x.erreur) erreurs++; for (const [k, v] of Object.entries(x.plan ?? {})) plans[k] = (plans[k] ?? 0) + v; }
const i = process.argv.indexOf('--sortie');
const sortie = i > 0 ? process.argv[i + 1] : path.join(dossier, `simulation-v3-fusion-${Date.now()}.json`);
fs.writeFileSync(sortie, JSON.stringify(tout, null, 1));
console.log(JSON.stringify({ fichiers: fichiers.length, comptes: tout.length, simules, erreurs, plans, sortie }));
