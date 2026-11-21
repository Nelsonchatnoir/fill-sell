// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 7 : le choix de la catégorie Vinted (la RÈGLE, pas les cas)
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant :
//   · « Pull » d'une femme (ou d'un homme) → « Maison › Animaux › Chiens › Vêtements & accessoires › Pulls », CERTAIN
//     (feuille sans genre, toujours admise ; les pulls enfants écartés par le genre) — le « pull col rond femme » ;
//   · un compte (19/11) : « Accessoires de mode › Pochettes de costume » servi à un compte de l'ANCIEN arbre, alors
//     que Vinted lui avait accepté « Femmes › Accessoires › Lunettes de soleil » le 08/11 — preuve ignorée.
//   node --import ./scripts/loader-ext.mjs scripts/lot-2111-categories-selftest.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resoudreParMot } from '../src/utils/categorieParMot.js';
import { arbreVintedDuCompte, arbreDuChemin, cheminVintedPourArbre } from '../supabase/functions/_shared/vinted-arbre-compte.js';

let ok = 0;
const t = async (nom, f) => { await f(); ok++; console.log(`  ✓ ${nom}`); };
const animaux = (c) => (c ?? []).some((s) => /animaux/i.test(s));

console.log('1. Un genre de personne n\'accepte jamais une feuille « Animaux »');
await t('« Pull » femme / homme : jamais les chiens, les rayons du genre en candidats', async () => {
  for (const genre of ['Femme', 'Homme']) {
    for (const mot of ['Pull', 'Pulls']) {
      const r = await resoudreParMot(mot, 'vinted', { genre });
      assert.equal(animaux(r.chemin), false, `${mot}/${genre} : ${r.chemin?.join(' › ')}`);
      assert.ok(r.candidats.length > 0, `${mot}/${genre} : des candidats`);
      assert.ok(r.candidats.every((c) => !animaux(c.chemin)), `${mot}/${genre} : aucun candidat animal`);
    }
  }
  const f = await resoudreParMot('Pull', 'vinted', { genre: 'Femme' });
  assert.ok(f.candidats.every((c) => c.chemin[0] === 'Femmes'), 'les pulls de la femme');
});
await t('sans genre, rien ne change : la feuille des chiens reste une candidate', async () => {
  const r = await resoudreParMot('Pull', 'vinted', { genre: '' });
  assert.ok(r.candidats.some((c) => animaux(c.chemin)));
});

console.log('2. L\'arbre Vinted du compte : un chemin que Vinted a ACCEPTÉ en est la preuve');
await t('arbreDuChemin', () => {
  assert.equal(arbreDuChemin(['Femmes', 'Accessoires', 'Lunettes de soleil']), 'ancien');
  assert.equal(arbreDuChemin(['Accessoires de mode', 'Lunettes de soleil']), 'nouveau');
  assert.equal(arbreDuChemin(['Femmes', 'Vêtements', 'Robes']), null);
});
await t('un compte de l\x27ancien arbre : la publication du 08/11 → ancien arbre → « Hommes › Accessoires › Pochettes de costume »', () => {
  const lu = arbreVintedDuCompte([{ cheminPublie: ['Femmes', 'Accessoires', 'Lunettes de soleil'], le: '2026-11-08T10:47:00Z' }]);
  assert.equal(lu.arbre, 'ancien');
  assert.deepEqual(cheminVintedPourArbre(['Accessoires de mode', 'Pochettes de costume'], lu.arbre, 'Homme'), ['Hommes', 'Accessoires', 'Pochettes de costume']);
  // Genre inconnu : jamais deviné (la question reste).
  assert.equal(cheminVintedPourArbre(['Accessoires de mode', 'Pochettes de costume'], lu.arbre, null), null);
});
await t('le plus récent l\'emporte (bascule du compte vers le nouvel arbre)', () => {
  const lu = arbreVintedDuCompte([
    { cheminPublie: ['Femmes', 'Accessoires', 'Lunettes de soleil'], le: '2026-11-08T10:00:00Z' },
    { cheminPublie: ['Accessoires de mode', 'Montres'], le: '2026-11-20T10:00:00Z' }]);
  assert.equal(lu.arbre, 'nouveau');
});
await t('le serveur lit les chemins publiés (get-pending-jobs)', () => {
  const gpj = fs.readFileSync(new URL('../supabase/functions/get-pending-jobs/index.ts', import.meta.url), 'utf8');
  assert.match(gpj, /chemin:platform_fields->categoryPath/);
  assert.match(gpj, /\["published", "sold"\]\.includes\(String\(r\.status \?\? ""\)\) && Array\.isArray\(r\.chemin\)/);
});

console.log(`\n${ok} vérifications vertes — lot du 21/11, point 7 (catégories Vinted).`);
