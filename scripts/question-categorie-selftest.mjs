// selftest:question-categorie — point 5 de la nuit du 18/10 : une question de
// catégorie IDENTIQUE n'est payée qu'une fois (src/utils/questionCategorie.js).
//   1. deux questions identiques en même temps = UN appel, la même réponse ;
//   2. la même question dans les 10 minutes = aucun appel ; après 10 minutes, un nouvel appel ;
//   3. l'ordre des clés ne change pas la question ; un contenu différent, si ;
//   4. une erreur, un refus, « ia_indisponible » ne sont jamais gardés ;
//   5. borné ; et TOUTES les questions de l'app passent par là.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const Q = await import(pathToFileURL(path.join(RACINE, 'src/utils/questionCategorie.js')).href);

const client = (reponse = () => ({ data: { choix: { vinted: { chemin: ['Femmes', 'Robes'] } } }, error: null })) => {
  const c = { appels: 0, functions: { invoke: async (nom, opts) => { c.appels++; await new Promise((r) => setTimeout(r, 5)); return reponse(nom, opts, c.appels); } } };
  return c;
};
const CORPS = { titre: 'Robe longue fleurie', candidats: { vinted: [{ chemin: ['Femmes', 'Robes'] }] }, attributs: { genre: 'Femme' } };

console.log('1. En vol');
Q._viderQuestionsCategorie();
{
  const sb = client();
  const [a, b] = await Promise.all([Q.invoquerResolveCategorie(sb, { body: CORPS }), Q.invoquerResolveCategorie(sb, { body: { ...CORPS } })]);
  ok(sb.appels === 1 && a === b && a.data.choix.vinted.chemin[1] === 'Robes', 'deux questions identiques en même temps : UN appel, la même réponse aux deux');
}
console.log('2. Dans les 10 minutes');
Q._viderQuestionsCategorie();
{
  const sb = client();
  let t = 1_000_000;
  const horloge = () => t;
  await Q.invoquerResolveCategorie(sb, { body: CORPS }, horloge);
  t += 9 * 60_000;
  await Q.invoquerResolveCategorie(sb, { body: CORPS }, horloge);
  ok(sb.appels === 1, 'la même question 9 min après : aucun appel');
  t += 2 * 60_000;
  await Q.invoquerResolveCategorie(sb, { body: CORPS }, horloge);
  ok(sb.appels === 2, 'au-delà de 10 min : la question repart');
}
console.log('3. Ce qui fait une question');
Q._viderQuestionsCategorie();
{
  const sb = client();
  await Q.invoquerResolveCategorie(sb, { body: { titre: 'X', attributs: { a: 1, b: 2 } } });
  await Q.invoquerResolveCategorie(sb, { body: { attributs: { b: 2, a: 1 }, titre: 'X' } });
  ok(sb.appels === 1, 'l\'ordre des clés ne change pas la question');
  await Q.invoquerResolveCategorie(sb, { body: { titre: 'X', attributs: { a: 1, b: 3 } } });
  await Q.invoquerResolveCategorie(sb, { body: { titre: 'X', attributs: { a: 1, b: 2 }, consigne: 'plus_proche' } });
  ok(sb.appels === 3, 'un attribut ou une consigne différents : une autre question (l\'article change → nouvel appel)');
}
console.log('4. Jamais un échec gardé');
for (const [nom, rep] of [
  ['erreur réseau', () => ({ data: null, error: { message: 'Failed to fetch' } })],
  ['refus 429', () => ({ data: { error: 'rate_limited' }, error: null })],
  ['IA indisponible', () => ({ data: { choix: {}, motif: 'ia_indisponible' }, error: null })],
]) {
  Q._viderQuestionsCategorie();
  const sb = client(rep);
  await Q.invoquerResolveCategorie(sb, { body: CORPS });
  await Q.invoquerResolveCategorie(sb, { body: CORPS });
  ok(sb.appels === 2, `${nom} : la question suivante repart`);
}
Q._viderQuestionsCategorie();
{
  const sb = client(() => ({ data: { choix: {}, motif: 'aucun candidat fourni' }, error: null }));
  await Q.invoquerResolveCategorie(sb, { body: CORPS });
  await Q.invoquerResolveCategorie(sb, { body: CORPS });
  ok(sb.appels === 1, '« aucune » est une vraie réponse : gardée comme une autre');
}
console.log('5. Borné, et partout');
Q._viderQuestionsCategorie();
{
  const sb = client();
  for (let i = 0; i < 320; i++) await Q.invoquerResolveCategorie(sb, { body: { titre: `t${i}` } });
  await Q.invoquerResolveCategorie(sb, { body: { titre: 't0' } });
  ok(sb.appels === 321, 'au-delà de 300 questions gardées, la plus ancienne sort (mémoire bornée)');
}
const fichiers = [];
const parcourir = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (/\.(jsx?|mjs)$/.test(n)) fichiers.push(p); } };
parcourir(path.join(RACINE, 'src'));
const directs = fichiers.filter((f) => !f.endsWith('questionCategorie.js') && /functions\.invoke\(\s*["']resolve-categorie["']/.test(readFileSync(f, 'utf8')));
ok(directs.length === 0, `toutes les questions de l'app passent par invoquerResolveCategorie (appels directs restants : ${directs.map((f) => path.relative(RACINE, f)).join(', ') || 'aucun'})`);
const RP = readFileSync(path.join(RACINE, 'src/utils/resolutionPublication.js'), 'utf8');
ok((RP.match(/invoquerResolveCategorie\(supabase,/g) ?? []).length === 4, 'resolutionPublication : les 4 questions (étape 3, Depop, vérification de l\'icône, descente)');

console.log(`\n${total - echecs}/${total} ${echecs ? 'ÉCHECS' : 'OK'}`);
process.exit(echecs ? 1 : 0);
