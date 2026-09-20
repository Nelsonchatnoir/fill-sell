// ═══════════════════════════════════════════════════════════════════════════
// LE MOT DÉCRIT-IL L'OBJET, OU SON SUJET ? — AVANT / APRÈS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Deux défauts mesurés sur Opla, et un seul danger : dégrader ce qui marchait.
// Ce test rejoue l'étape du MOT sur les cinq arbres, avec et sans la règle.
//
//   node --import ./scripts/loader-ext.mjs scripts/mot-objet-ou-sujet-selftest.mjs
import { resoudreParMot, candidatsParMot, feuillesDe } from '../src/utils/categorieParMot.js';
import { maisonDesLivres, feuillesDuNoeud, sortDeLaMaison, noeudDuMot } from '../src/utils/motObjetOuSujet.js';

let ko = 0;
const ok = (nom, cond) => { console.log(`  ${cond ? 'ok  ' : '❌  '}  ${nom}`); if (!cond) ko++; };
const titre = (t) => console.log(`\n${t}\n`);

const PF = ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla'];

// La règle, telle qu'elle est câblée dans resolutionPublication.js.
async function avec(mot, plateforme, { famille = null, estLivre = false, genre = '' } = {}) {
  const r = await resoudreParMot(mot, plateforme, { genre, famille });
  let certitude = r.certitude === 'exact' ? r : null;
  let horsMaison = false;
  if (certitude && estLivre) {
    const maison = await maisonDesLivres(plateforme);
    if (maison && sortDeLaMaison(r.chemin, maison)) { certitude = null; horsMaison = true; }
  }
  let candidats = (await candidatsParMot(mot, plateforme, { genre, famille, max: 20 }))
    .map((c) => ({ chemin: c.chemin, id: c.id }));
  if (estLivre) {
    const maison = await maisonDesLivres(plateforme);
    if (maison) {
      const dedans = (await feuillesDuNoeud(maison, plateforme)).map((f) => ({ chemin: f.chemin, id: f.id }));
      const cle = (c) => c.chemin.join(' > ');
      const vus = new Set(dedans.map(cle));
      candidats = [...dedans, ...candidats.filter((c) => !vus.has(cle(c)))].slice(0, 20);
    }
  }
  return { certitude, horsMaison, candidats };
}
async function sans(mot, plateforme, { famille = null, genre = '' } = {}) {
  const r = await resoudreParMot(mot, plateforme, { genre, famille });
  return {
    certitude: r.certitude === 'exact' ? r : null,
    candidats: (await candidatsParMot(mot, plateforme, { genre, famille, max: 20 })).map((c) => ({ chemin: c.chemin, id: c.id })),
  };
}

// ── 1. LA MAISON DES LIVRES, DANS LES CINQ ARBRES ────────────────────────
titre('1. La maison des livres — on ne conclut que là où elle existe');
{
  const attendu = {
    opla: 'Culture et Loisirs > Livres',
    vinted: 'Livres et médias > Livres',
    beebs: 'Jeux, jouets et loisirs > Livres',
    leboncoin: null,   // « Livres » y est une FEUILLE, pas un nœud
    ebay: null,        // l'arbre eBay ne porte pas ce nœud
  };
  for (const p of PF) {
    const m = await maisonDesLivres(p);
    ok(`${p} → ${attendu[p] ?? '(aucune, on ne conclut rien)'}`, (m ? m.join(' > ') : null) === attendu[p]);
  }
  for (const p of ['opla', 'vinted', 'beebs']) {
    const n = (await feuillesDuNoeud(await maisonDesLivres(p), p)).length;
    ok(`${p} : la maison a des feuilles (${n})`, n >= 8);
  }
}

// ── 2. LE DÉFAUT Nº1 — LE SUJET PRIS POUR L'OBJET ────────────────────────
titre('2. « musculation » sur un LIVRE — le cas du 20/09');
{
  const a = await sans('musculation', 'opla', { famille: 'loisirs' });
  ok('AVANT : certitude posée sur Sport > … > Musculation',
    a.certitude?.chemin?.join(' > ') === 'Sport > Fitness, course à pied et yoga > Musculation');
  const b = await avec('musculation', 'opla', { famille: 'loisirs', estLivre: true });
  ok('APRÈS : la certitude tombe — le mot décrit le sujet', b.certitude === null && b.horsMaison);
  ok('APRÈS : les candidates sont celles de la maison des livres',
    b.candidats.length >= 11 && b.candidats[0].chemin.slice(0, 2).join(' > ') === 'Culture et Loisirs > Livres');
  ok('APRÈS : « Non-fiction » est enfin dans la liste',
    b.candidats.some((c) => c.chemin[c.chemin.length - 1] === 'Non-fiction'));
}

// ── 3. LE DÉFAUT Nº2 — LA BONNE RÉPONSE N'ÉTAIT PAS DANS LA LISTE ────────
titre('3. « livre » sur Opla — 3 livres papier rangés en « Livres sonores »');
{
  const a = await sans('livre', 'opla', { famille: 'loisirs' });
  ok('AVANT : 2 candidates seulement', a.candidats.length === 2);
  ok('AVANT : « Livres sonores » et « Livres pour bébé », rien d’autre',
    a.candidats.every((c) => /sonores|bébé/i.test(c.chemin[c.chemin.length - 1])));
  ok('AVANT : « Romans pour adultes » ABSENT de la liste',
    !a.candidats.some((c) => c.chemin[c.chemin.length - 1] === 'Romans pour adultes'));
  const b = await avec('livre', 'opla', { famille: 'loisirs', estLivre: true });
  ok('APRÈS : les 11 feuilles de la maison sont candidates', b.candidats.length >= 11);
  ok('APRÈS : « Romans pour adultes » est dans la liste',
    b.candidats.some((c) => c.chemin[c.chemin.length - 1] === 'Romans pour adultes'));
  ok('APRÈS : « Fictions » aussi', b.candidats.some((c) => c.chemin[c.chemin.length - 1] === 'Fictions'));
  ok('APRÈS : on ne CHOISIT toujours rien (aucune certitude)', b.certitude === null);
}

// ── 4. ZÉRO RÉGRESSION — la règle ne s'applique qu'aux livres ────────────
titre('4. Rien ne bouge quand la fiche ne dit PAS « livre »');
{
  const cas = [
    ['musculation', 'opla', 'loisirs'],
    ['jean', 'vinted', 'mode'],
    ['robe', 'vinted', 'mode'],
    ['canapé', 'leboncoin', 'maison'],
    ['casque', 'beebs', null],
    ['montre', 'ebay', null],
    ['console', 'vinted', 'loisirs'],
    ['puzzle', 'beebs', 'loisirs'],
  ];
  for (const [mot, p, fam] of cas) {
    const a = await sans(mot, p, { famille: fam });
    const b = await avec(mot, p, { famille: fam, estLivre: false });
    const idem = (a.certitude?.chemin?.join('>') ?? null) === (b.certitude?.chemin?.join('>') ?? null)
      && a.candidats.length === b.candidats.length;
    ok(`« ${mot} » sur ${p} : identique`, idem);
  }
}

// ── 5. ZÉRO RÉGRESSION — même sur un livre, on ne casse pas ce qui marchait
titre('5. Sur un livre, une feuille DANS la maison garde sa certitude');
{
  for (const [mot, p, attendu] of [['manga', 'opla', true], ['bande dessinée', 'beebs', true]]) {
    const b = await avec(mot, p, { famille: 'loisirs', estLivre: true });
    const dedans = b.certitude ? !sortDeLaMaison(b.certitude.chemin, await maisonDesLivres(p)) : null;
    ok(`« ${mot} » sur ${p} : ${b.certitude ? (dedans ? 'certitude gardée, dans la maison' : 'DEHORS (anormal)') : 'pas de certitude (étape 3)'}`,
      b.certitude === null || dedans === attendu);
  }
  const lbc = await avec('musculation', 'leboncoin', { famille: 'loisirs', estLivre: true });
  const lbcSans = await sans('musculation', 'leboncoin', { famille: 'loisirs' });
  ok('Leboncoin (pas de maison) : strictement inchangé',
    (lbc.certitude?.chemin?.join('>') ?? null) === (lbcSans.certitude?.chemin?.join('>') ?? null)
    && lbc.candidats.length === lbcSans.candidats.length);
}

// ── 6. BALAYAGE COMPLET — combien de rayons la règle ferait-elle bouger ?
titre('6. Balayage : la règle ne peut toucher QUE des mots hors maison');
{
  let touches = 0; let total = 0;
  const mots = ['livre', 'roman', 'bd', 'manga', 'musculation', 'cuisine', 'histoire',
    'science', 'voyage', 'jardinage', 'photo', 'art', 'sport', 'yoga', 'tricot', 'echecs'];
  for (const p of ['opla', 'vinted', 'beebs']) {
    const maison = await maisonDesLivres(p);
    for (const mot of mots) {
      const r = await resoudreParMot(mot, p, { genre: '', famille: 'loisirs' });
      if (r.certitude !== 'exact') continue;
      total++;
      if (sortDeLaMaison(r.chemin, maison)) { touches++; console.log(`      ${p} · « ${mot} » → ${r.chemin.join(' > ')}  (certitude retirée sur un livre)`); }
    }
  }
  console.log(`\n   ${total} certitudes rencontrées sur ces 16 mots × 3 arbres ; ${touches} seraient retirées — et SEULEMENT sur un article dont la fiche dit « livre ».`);
  ok('le balayage a trouvé au moins le cas fondateur', touches >= 1);
}

// ── 7. LE MODULE NE SE TROMPE PAS DE NŒUD ────────────────────────────────
titre('7. noeudDuMot ne prend jamais une FEUILLE pour une maison');
{
  const f = await feuillesDe('leboncoin');
  const estFeuilleLivres = f.some((x) => x.chemin[x.chemin.length - 1] === 'Livres');
  ok('Leboncoin a bien une FEUILLE « Livres »', estFeuilleLivres);
  ok('…et noeudDuMot ne la rend pas', (await noeudDuMot('livres', 'leboncoin')) === null);
  ok('un mot inconnu ne rend aucune maison', (await noeudDuMot('zzzinconnu', 'opla')) === null);
  ok('un mot vide non plus', (await noeudDuMot('', 'opla')) === null);
  ok('sortDeLaMaison sans maison = null (on ne conclut rien)', sortDeLaMaison(['a'], null) === null);
}

console.log(`\n${ko === 0 ? '✅ Le mot ne décide plus quand il décrit le sujet, et la bonne réponse est dans la liste.' : `❌ ${ko} test(s) en échec.`}`);
process.exit(ko === 0 ? 0 : 1);
