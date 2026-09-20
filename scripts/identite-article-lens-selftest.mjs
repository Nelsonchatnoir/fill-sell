// ═══════════════════════════════════════════════════════════════════════════
// REJEU DU PARCOURS LENS — L'ARTICLE OUVERT EST-IL CELUI QU'ON VIENT DE
// PHOTOGRAPHIER ? (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Deux défauts vus à l'écran : « Publier ouvre un AUTRE article » (une fois
// sur deux) et « ces photos ne correspondent plus à l'article analysé » (en
// ouvrant deux articles à la suite). Une seule cause : l'identifiant de
// l'article du parcours survivait au changement d'article.
//
// Ce script rejoue le parcours comme une machine à états — les MÊMES
// transitions que l'app, dans le même ordre — et vérifie UN invariant :
//
//     l'article sur lequel le stepper s'ouvre est celui dont les photos
//     viennent d'être montées. Toujours. Sans exception.
//
// Il rejoue aussi, en regard, l'ANCIENNE règle (celle d'avant le correctif)
// pour montrer que la séquence tombait vraiment, et combien de fois.
//
//   node scripts/identite-article-lens-selftest.mjs
import fs from 'node:fs';
import { articleDuParcours, apresNouvellesPhotos, apresFermetureStepper } from '../src/utils/parcoursLens.js';

// ── L'ANCIENNE RÈGLE, recopiée telle qu'elle était ────────────────────────
// · de nouvelles photos : setLensResult(null) + setLensAdded(false) — et RIEN
//   sur l'identifiant (App.jsx, trois points d'entrée de photos) ;
// · fermeture : `if(published){setRestoredInvId(null);resetLensParcours();}`
//   — donc rien du tout sur un abandon (LensTab.jsx).
const ANCIEN = {
  nouvellesPhotos: (e) => ({ ...e }),
  fermeture: (e, publiee) => (publiee ? { ...e, lensInventaireId: null, restoredInvId: null } : { ...e }),
};
const NOUVEAU = { nouvellesPhotos: apresNouvellesPhotos, fermeture: apresFermetureStepper };

// ── LE PARCOURS, transition par transition ────────────────────────────────
// `scanPaye` pose l'identifiant (le serveur crée la ligne au débit) et le
// remet à null d'abord — App.jsx le fait déjà (runLensAnalysis).
// `creerAnnonceGratuit` n'analyse RIEN : c'est le parcours « Créer l'annonce »
// du viseur. Il ne pose donc aucun identifiant — et c'est là que l'ancien
// code laissait celui du tour d'avant.
function rejouer(regles, actions) {
  let etat = { lensInventaireId: null, restoredInvId: null };
  let article = null;          // l'article réellement photographié
  const incidents = [];
  let ouvertures = 0;

  for (const a of actions) {
    if (a.type === 'photos') {
      article = a.article;
      etat = regles.nouvellesPhotos(etat);
    } else if (a.type === 'scanPaye') {
      // Le scan payé remet à zéro puis pose la ligne créée par le serveur.
      etat = { ...etat, lensInventaireId: null };
      etat = { ...etat, lensInventaireId: a.ligneCreee ? article : etat.lensInventaireId };
    } else if (a.type === 'ajoutAuStock') {
      // saveLensItemForListing : rend l'identifiant existant s'il y en a un,
      // sinon crée la ligne. C'est le parcours gratuit qui passe par là.
      if (!articleDuParcours(etat)) etat = { ...etat, lensInventaireId: article };
    } else if (a.type === 'ouvrirStepper') {
      ouvertures++;
      const ouvert = articleDuParcours(etat);
      // null = aucune ligne encore : le stepper s'ouvre sur l'article courant,
      // c'est le cas normal du parcours gratuit avant l'ajout au stock.
      if (ouvert !== null && ouvert !== article) {
        incidents.push({ attendu: article, ouvert, quoi: 'stepper ouvert sur un autre article' });
      }
      // rattacherPhotosDurables écrit inventaire.photos sur CET identifiant.
      if (ouvert !== null && ouvert !== article) {
        incidents.push({ attendu: article, ouvert, quoi: 'photos écrites sur un autre article' });
      }
    } else if (a.type === 'remount') {
      // Rechargement d'onglet : le blob hôte remonte le stepper.
      etat = { ...etat, restoredInvId: articleDuParcours(etat) };
    } else if (a.type === 'fermer') {
      etat = regles.fermeture(etat, a.publiee === true);
    }
  }
  return { incidents, ouvertures, etat };
}

// ── LES SÉQUENCES ─────────────────────────────────────────────────────────
const P = (n) => ({ type: 'photos', article: n });
const SEQUENCES = [
  {
    nom: 'nº6 — deux articles à la suite par le parcours GRATUIT (abandon au milieu)',
    actions: [
      P('A'), { type: 'ouvrirStepper' }, { type: 'ajoutAuStock' }, { type: 'fermer' },
      P('B'), { type: 'ouvrirStepper' },
    ],
    doitTomberEnAncien: true,
  },
  {
    nom: 'nº6 bis — trois articles de suite, gratuit, tous abandonnés',
    actions: [
      P('A'), { type: 'ouvrirStepper' }, { type: 'ajoutAuStock' }, { type: 'fermer' },
      P('B'), { type: 'ouvrirStepper' }, { type: 'fermer' },
      P('C'), { type: 'ouvrirStepper' },
    ],
    doitTomberEnAncien: true,
  },
  {
    // Hypothèse posée puis RÉFUTÉE par ce rejeu, gardée comme garde-fou : on
    // pouvait croire qu'un scan payé dont le serveur ne crée pas la ligne
    // laisserait remonter l'identifiant du tour d'avant. Non : le scan payé
    // remet l'identifiant à null AVANT d'appeler le serveur (App.jsx,
    // runLensAnalysis). Même sans ligne créée, il ne peut rien hériter.
    nom: 'scan PAYÉ dont le serveur n\'a pas créé la ligne, après un abandon (sain)',
    actions: [
      P('A'), { type: 'scanPaye', ligneCreee: true }, { type: 'ouvrirStepper' }, { type: 'fermer' },
      P('B'), { type: 'scanPaye', ligneCreee: false }, { type: 'ouvrirStepper' },
    ],
    doitTomberEnAncien: false,
  },
  {
    nom: 'nº6 quater — remontée du stepper après rechargement, puis article suivant',
    actions: [
      P('A'), { type: 'ouvrirStepper' }, { type: 'ajoutAuStock' },
      { type: 'remount' }, { type: 'fermer' },
      P('B'), { type: 'ouvrirStepper' },
    ],
    doitTomberEnAncien: true,
  },
  {
    nom: 'le cas SAIN — scan payé à chaque fois (c\'est pour ça que ça ne tombait qu\'une fois sur deux)',
    actions: [
      P('A'), { type: 'scanPaye', ligneCreee: true }, { type: 'ouvrirStepper' }, { type: 'fermer' },
      P('B'), { type: 'scanPaye', ligneCreee: true }, { type: 'ouvrirStepper' },
    ],
    doitTomberEnAncien: false,
  },
  {
    nom: 'le cas À NE PAS CASSER — abandon puis REPRISE du même article (aucune photo neuve)',
    actions: [
      P('A'), { type: 'ouvrirStepper' }, { type: 'ajoutAuStock' }, { type: 'fermer' },
      { type: 'ouvrirStepper' },
    ],
    doitTomberEnAncien: false,
    memeLigneAttendue: 'A',
  },
  {
    nom: 'le cas À NE PAS CASSER — publication puis nouvel article',
    actions: [
      P('A'), { type: 'ouvrirStepper' }, { type: 'ajoutAuStock' }, { type: 'fermer', publiee: true },
      P('B'), { type: 'ouvrirStepper' }, { type: 'ajoutAuStock' },
    ],
    doitTomberEnAncien: false,
    memeLigneAttendue: 'B',
  },
];

// ── ENCHAÎNEMENT NORMAL, RÉPÉTÉ ───────────────────────────────────────────
// « ouvrir, éditer, publier, revenir, ouvrir un autre » — dix fois de suite,
// en alternant les deux parcours, comme quelqu'un qui vide un carton.
function enchainementNormal(n) {
  const actions = [];
  for (let i = 0; i < n; i++) {
    const art = `art${i}`;
    actions.push(P(art));
    if (i % 2 === 0) actions.push({ type: 'scanPaye', ligneCreee: true });
    actions.push({ type: 'ouvrirStepper' });
    actions.push({ type: 'ajoutAuStock' });
    actions.push({ type: 'fermer', publiee: i % 3 !== 0 }); // 1 abandon sur 3
  }
  return actions;
}

// ── nº6 EST INTERMITTENT : on le passe assez de fois pour que ça veuille dire
//    quelque chose. 500 parcours tirés au sort entre les deux chemins.
function parcoursAleatoires(n, graine) {
  let x = graine;
  const suivant = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const actions = [];
  for (let i = 0; i < n; i++) {
    const art = `a${i}`;
    actions.push(P(art));
    if (suivant() < 0.5) actions.push({ type: 'scanPaye', ligneCreee: suivant() < 0.9 });
    actions.push({ type: 'ouvrirStepper' });
    if (suivant() < 0.7) actions.push({ type: 'ajoutAuStock' });
    if (suivant() < 0.2) actions.push({ type: 'remount' });
    actions.push({ type: 'fermer', publiee: suivant() < 0.4 });
  }
  return actions;
}

let echecs = 0;
const dit = (ok, texte) => { if (!ok) echecs++; console.log(`${ok ? '  ok  ' : ' ÉCHEC'}  ${texte}`); };

console.log('1. LES SÉQUENCES QUE NICO A VUES — avant / après\n');
for (const s of SEQUENCES) {
  const avant = rejouer(ANCIEN, s.actions);
  const apres = rejouer(NOUVEAU, s.actions);
  const tombaitAvant = avant.incidents.length > 0;
  console.log(`  ${s.nom}`);
  console.log(`      ancienne règle : ${tombaitAvant ? `${avant.incidents.length} incident(s) — ` + avant.incidents.map(i => `« ${i.quoi} » (attendu ${i.attendu}, ouvert ${i.ouvert})`).join(' ; ') : 'rien'}`);
  console.log(`      nouvelle règle : ${apres.incidents.length ? `${apres.incidents.length} incident(s) ❌` : 'rien ✅'}`);
  dit(tombaitAvant === s.doitTomberEnAncien,
    s.doitTomberEnAncien ? 'la séquence tombait bien avec l\'ancienne règle' : 'la séquence ne tombait pas (cas sain)');
  dit(apres.incidents.length === 0, 'elle ne tombe plus avec la nouvelle règle');
  if (s.memeLigneAttendue) {
    dit(articleDuParcours(apres.etat) === s.memeLigneAttendue || apres.etat.lensInventaireId === s.memeLigneAttendue,
      `la ligne d'inventaire reste « ${s.memeLigneAttendue} » (aucun doublon créé)`);
  }
  console.log('');
}

console.log('2. ENCHAÎNEMENT NORMAL — ouvrir, éditer, publier, revenir, ouvrir un autre\n');
for (const n of [10, 25]) {
  const actes = enchainementNormal(n);
  const avant = rejouer(ANCIEN, actes);
  const apres = rejouer(NOUVEAU, actes);
  console.log(`  ${n} enchaînements : ancienne règle ${avant.incidents.length} incident(s), nouvelle règle ${apres.incidents.length}`);
  dit(apres.incidents.length === 0, `${n} enchaînements d'affilée sans un seul mauvais article`);
}
console.log('');

console.log('3. nº6 EST INTERMITTENT — 500 parcours tirés au sort\n');
let incidentsAvant = 0, incidentsApres = 0, ouverturesTotal = 0;
for (let g = 1; g <= 10; g++) {
  const actes = parcoursAleatoires(50, g * 7919);
  const avant = rejouer(ANCIEN, actes);
  const apres = rejouer(NOUVEAU, actes);
  incidentsAvant += avant.incidents.length;
  incidentsApres += apres.incidents.length;
  ouverturesTotal += avant.ouvertures;
}
console.log(`  ${ouverturesTotal} ouvertures de stepper rejouées`);
console.log(`  ancienne règle : ${incidentsAvant} incidents (${(100 * incidentsAvant / 2 / ouverturesTotal).toFixed(0)} % des ouvertures sur le mauvais article)`);
console.log(`  nouvelle règle : ${incidentsApres} incidents`);
dit(incidentsAvant > 0, 'le défaut se reproduit bien, et souvent');
dit(incidentsApres === 0, 'il ne se reproduit plus une seule fois sur 500 parcours');

console.log('\n4. LA RÈGLE EST BIEN CÂBLÉE — et à UN SEUL endroit\n');
// Le rejeu ci-dessus prouve la règle ; cette section prouve que l'app
// l'applique vraiment. C'est la dispersion qui avait laissé un point d'entrée
// en retard : si quelqu'un réécrit un jour le geste à la main quelque part,
// ce test tombe.
const app = fs.readFileSync('src/App.jsx', 'utf8');
const lens = fs.readFileSync('src/tabs/LensTab.jsx', 'utf8');
const appels = (app.match(/nouvelArticleAuViseur\(\);/g) || []).length;
dit(appels === 3, `les 3 points d'entrée de photos passent par nouvelArticleAuViseur() (trouvés : ${appels})`);
// Il reste DEUX endroits qui écrivent le geste en clair, et les deux
// remettent bien l'identifiant à zéro dans la même ligne : le scan payé
// (runLensAnalysis) et la purge de fin de parcours (resetLensParcours). Tout
// TROISIÈME endroit serait un point d'entrée qui refait le geste à la main —
// exactement ce qui avait laissé le défaut passer.
const lignesApp = app.split('\n');
const enClair = lignesApp
  .map((l, i) => ({ l, i }))
  .filter(({ l }) => l.includes('setLensResult(null);setLensAdded(false);'));
const oublis = enClair.filter(({ i }) =>
  !lignesApp.slice(i, i + 2).join('\n').includes('setLensInventaireId('));
dit(oublis.length === 0,
  `les ${enClair.length} endroits qui écrivent le geste en clair touchent tous à l'identifiant`
  + (oublis.length ? ` — oubli ligne ${oublis.map(o => o.i + 1).join(', ')}` : ''));
dit(app.includes("from './utils/parcoursLens'") && app.includes('apresNouvellesPhotos({lensInventaireId})'),
  'App.jsx applique la règle du module, il ne la recopie pas');
dit(lens.includes('apresFermetureStepper({restoredInvId}'),
  'LensTab applique la règle du module à la fermeture');
dit(!/if\(published\)\{setRestoredInvId\(null\)/.test(lens),
  'l\'identifiant restauré ne dépend plus du fait d\'avoir publié');

console.log(`\n${echecs === 0 ? '✅ L\'article ouvert est toujours celui qu\'on vient de photographier.' : `❌ ${echecs} échec(s).`}`);
process.exit(echecs === 0 ? 0 : 1);
