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
      // ⚠️ MIROIR EXACT de resolutionPublication.js (bloc « LE PLAFOND DE 20 NE
      //    DOIT PAS AMPUTER LA MAISON »). Les deux bougent ensemble, sinon ce
      //    test cesse de dire ce que fait la prod.
      const MAISON_LISIBLE_MAX = 80;
      const plafond = dedans.length <= MAISON_LISIBLE_MAX ? Math.max(20, dedans.length) : 20;
      candidats = [...dedans, ...candidats.filter((c) => !vus.has(cle(c)))].slice(0, plafond);
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
    // eBay : on a longtemps écrit « l'arbre eBay ne porte pas ce nœud ».
    // C'était FAUX (mesuré le 22/09) : il le porte, il l'écrit juste autrement.
    // « Livres, BD, revues » est une RACINE de 64 feuilles. La croyance
    // inverse a laissé partir le Hawking d'ornellaracano au rayon modélisme
    // ferroviaire — cf. le bloc 8.
    ebay: 'Livres, BD, revues',
  };
  for (const p of PF) {
    const m = await maisonDesLivres(p);
    ok(`${p} → ${attendu[p] ?? '(aucune, on ne conclut rien)'}`, (m ? m.join(' > ') : null) === attendu[p]);
  }
  for (const p of ['opla', 'vinted', 'beebs', 'ebay']) {
    const n = (await feuillesDuNoeud(await maisonDesLivres(p), p)).length;
    ok(`${p} : la maison a des feuilles (${n})`, n >= 8);
  }
  // ⛔ LE REPLI NE DOIT JAMAIS PASSER DEVANT L'EXACT. Chez Vinted, « Livres et
  //    médias » PORTE le mot (20 feuilles, CD et DVD compris) alors que
  //    « Livres et médias > Livres » l'EST (8 feuilles) : c'est le second qui
  //    est la maison d'un livre. Si l'ordre s'inversait, ce contrôle tombe.
  {
    const m = await maisonDesLivres('vinted');
    ok('vinted : le nœud qui EST le mot gagne sur celui qui le PORTE',
      m.join(' > ') === 'Livres et médias > Livres');
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

// ── 8. LE CAS ORNELLA — UN LIVRE AU RAYON MODÉLISME FERROVIAIRE ──────────
titre('8. « livre » sur eBay — jobs 41f00503 (Hawking) et 7c22f64b (Twilight)');
{
  // Le fait qui a tout produit : sur les 3 906 feuilles d'eBay, UNE SEULE
  // porte le libellé « Livres », et c'est celle du modélisme ferroviaire.
  // Correspondance exacte + unique ⇒ certitude ⇒ source certaine ⇒ elle prime
  // sur l'icône 📚 (171228), qui était juste.
  const feuilles = await feuillesDe('ebay');
  const exactes = feuilles.filter((f) => /^livres?$/i.test(String(f.chemin[f.chemin.length - 1]).trim()));
  ok('une seule feuille eBay s\'appelle « Livres »', exactes.length === 1);
  ok('…et c\'est la 9049, sous Modélisme ferroviaire',
    exactes[0]?.id === '9049' && exactes[0]?.chemin[0] === 'Jouets et jeux');

  const a = await sans('livre', 'ebay', { famille: null });
  ok('AVANT : certitude posée sur la feuille du modélisme',
    a.certitude?.id === '9049');

  const b = await avec('livre', 'ebay', { famille: null, estLivre: true });
  ok('APRÈS : la certitude tombe — le mot décrit l\'objet, pas ce rayon-là', b.certitude === null);
  ok('APRÈS : c\'est bien la sortie de maison qui l\'a retirée', b.horsMaison === true);
  const chemins = b.candidats.map((c) => c.chemin.join(' > '));
  ok('APRÈS : les candidates viennent de « Livres, BD, revues »',
    chemins.length > 0 && chemins.every((c) => c.startsWith('Livres, BD, revues')));
  ok('APRÈS : « Non-fiction » (171243, celle qu\'eBay proposait) est dans la liste',
    b.candidats.some((c) => c.id === '171243'));
  ok('APRÈS : la feuille du modélisme n\'est plus candidate',
    !b.candidats.some((c) => c.id === '9049'));

  // ⛔ NON-RÉGRESSION : un VRAI article de modélisme ferroviaire doit toujours
  //    pouvoir aller dans ce rayon. La règle ne tire que sur une fiche dont la
  //    famille dit « livre » — jamais sur les autres.
  const c = await sans('catalogue', 'ebay', { famille: null });
  ok('un « catalogue » de modélisme garde sa feuille (la règle ne tire pas)',
    c.certitude?.chemin?.[1] === 'Modélisme ferroviaire');
  const d = await avec('montre', 'ebay', { famille: null, estLivre: false });
  const e = await sans('montre', 'ebay', { famille: null });
  ok('« montre » sur eBay : strictement identique avec et sans la règle',
    JSON.stringify(d.certitude?.chemin ?? null) === JSON.stringify(e.certitude?.chemin ?? null));
}

console.log(`\n${ko === 0 ? '✅ Le mot ne décide plus quand il décrit le sujet, et la bonne réponse est dans la liste.' : `❌ ${ko} test(s) en échec.`}`);
process.exit(ko === 0 ? 0 : 1);
