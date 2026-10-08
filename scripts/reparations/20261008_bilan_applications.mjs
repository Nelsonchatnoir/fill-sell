// Bilan des applications de la nuit (fichiers application-v3-*.json, un compte = sa
// dernière application) : totaux et lignes par compte pour le rapport. Lecture seule.
//   node scripts/reparations/20261008_bilan_applications.mjs [--detail]
import fs from 'node:fs';
import path from 'node:path';
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const dossier = path.join(RACINE, 'build', 'rattachement');
const fichiers = fs.readdirSync(dossier).filter((f) => /^application-v3-\d+\.json$/.test(f)).map((f) => path.join(dossier, f))
  .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
const parCompte = new Map();
for (const f of fichiers) for (const x of JSON.parse(fs.readFileSync(f, 'utf8'))) if (x?.u) parCompte.set(x.u, x);
const tout = [...parCompte.values()];
const faits = {}, sautes = {}; let termines = 0, erreurs = 0, stockAvant = 0, stockApres = 0, avAvant = 0, avApres = 0, saAvant = 0, saApres = 0;
for (const x of tout) {
  if (x.etat === 'termine') termines++; if (x.erreur || (x.erreurs ?? 0) > 0) erreurs++;
  for (const [k, v] of Object.entries(x.faits ?? {})) faits[k] = (faits[k] ?? 0) + v;
  for (const [k, v] of Object.entries(x.sautes ?? {})) sautes[k] = (sautes[k] ?? 0) + v;
  stockAvant += x.avant?.stock ?? 0; stockApres += x.apres?.stock ?? 0;
  avAvant += x.avant?.a_verifier ?? 0; avApres += x.apres?.a_verifier ?? 0;
  saAvant += x.avant?.sans_article ?? 0; saApres += x.apres?.sans_article ?? 0;
}
console.log(JSON.stringify({ fichiers: fichiers.length, comptes: tout.length, termines, erreurs, faits, sautes,
  stock: `${stockAvant}→${stockApres}`, a_verifier: `${avAvant}→${avApres}`, sans_article: `${saAvant}→${saApres}` }));
if (process.argv.includes('--detail')) for (const x of tout) console.log(x.u.slice(0, 8), x.etat, JSON.stringify(x.faits ?? {}), JSON.stringify(x.sautes ?? {}), `stock ${x.avant?.stock}→${x.apres?.stock}`, `à vérifier ${x.avant?.a_verifier}→${x.apres?.a_verifier}`, `sans article ${x.avant?.sans_article}→${x.apres?.sans_article}`);
