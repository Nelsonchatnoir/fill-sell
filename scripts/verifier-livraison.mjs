import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Livraison refusée : copie de build non propre.');
const empreinte = fs.readFileSync('dist/build.json', 'utf8');
const commit = git('rev-parse', '--short', 'HEAD');
if (!empreinte.includes(commit) || /dirty|nogit/.test(empreinte)) {
  throw new Error('Livraison refusée : empreinte absente, sale ou étrangère au commit.');
}
console.log(`Livraison vérifiée : ${commit}, arbre propre, ${empreinte.trim()}`);
