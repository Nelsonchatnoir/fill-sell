// VERROU « COSTUME = TENUE DE VILLE, JAMAIS UN DÉGUISEMENT » (règle de Nico, 11/11/2026 soir)
// Cas : compte 238dc49b, « Veste de costume bleu » (mot-objet de l'IA « veste de costume »), rangée par resolve-categorie
// en « Hommes > Vêtements > Vêtements spécialisés et costumes » (92, déguisements) — Vinted a refusé la taille 50.
//   A. le sens du texte : positifs (ville) et négatifs (déguisement), neutres ;
//   B. la famille des rayons, sur les libellés RÉELS (arbre Vinted de l'app, catalogue Vinted du serveur, arbre Beebs) ;
//   C. le cas, avec les candidates RÉELLES de l'app (src/utils/categorieParMot.js, lu sans rien changer) : le choix 92 est
//      remplacé par « Hommes > Vêtements > Costumes et blazers > Blazers » (1786), une feuille de l'arbre de l'app ;
//   D. les autres cas : costume complet, femme, déguisements (rien ne bouge, ou retour au rayon des déguisements), Beebs,
//      plateformes non couvertes, descente « plus proche » (jamais de feuille hors de ses entrées) ;
//   E. lecture du code : resolve-categorie applique la règle APRÈS la vérification de la clé, AVANT le journal ; la
//      question posée à l'IA (SYSTEM) est inchangée.
// Valeurs d'essai inventées ; aucun titre réel d'annonce de client hormis le libellé générique du cas.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return; }
  ko++;
  console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`}`);
};

let C = null;
try { C = await imp('supabase/functions/_shared/costume-de-ville.js'); } catch (e) { ok(false, 'supabase/functions/_shared/costume-de-ville.js : la règle existe', e.message); }
const P = await imp('src/utils/categorieParMot.js');
const { CATALOGUE_VINTED_FR } = await imp('supabase/functions/_shared/vinted-catalogue-fr.js');
const sens = (t) => (C?.sensDuCostume ? C.sensDuCostume(t) : 'absent');
const famille = (ch) => (C?.familleDuRayon ? C.familleDuRayon(ch) : 'absent');
const verdict = (a) => (C?.verdictCostume ? C.verdictCostume(a) : 'absent');
const chemin = (s) => s.split(' > ');

console.log('A. Le sens du texte');
for (const t of ['Veste de costume bleu', 'Costume bleu marine homme', 'Blazer cintré laine', 'Costume trois pièces', 'Costume 3 pièces gris',
  'Smoking noir taille 50', 'Tailleur pantalon femme', 'Pantalon de costume gris', 'Gilet de costume', 'Costume de mariage ivoire', 'veste de costume', 'Costume prince de Galles gris', 'Costume slim homme taille 50'])
  ok(sens(t) === 'ville', `« ${t} » : tenue de ville`, sens(t));
for (const t of ['Déguisement pirate homme', 'Costume de carnaval', "Costume d'Halloween squelette", 'Costume de super-héros', 'Costume Spiderman enfant',
  'Panoplie de pompier', 'Cosplay manga', 'Costume de scène théâtre', 'Costume de pirate', 'Déguisement de princesse', 'Soirée costumée : costume de vampire'])
  ok(sens(t) === 'deguisement', `« ${t} » : déguisement`, sens(t));
for (const t of ['Pull en laine', 'Veste en jean', 'Pochette', '']) ok(sens(t) === null, `« ${t} » : rien sur un costume`, sens(t));

console.log('B. La famille des rayons, sur les libellés réels');
const feuillesV = await P.feuillesDe('vinted');
const parId = new Map(feuillesV.map((f) => [String(f.id), f.chemin]));
const attendu = { 92: 'deguisement', 1782: 'deguisement', 1606: 'deguisement', 1762: 'deguisement', 3330: 'deguisement',
  1786: 'ville', 1787: 'ville', 1788: 'ville', 1789: 'ville', 1790: 'ville', 532: 'ville', 1125: 'ville', 261: 'ville',
  5554: null, 1825: null, 1224: null, 2553: null };
for (const [id, fam] of Object.entries(attendu)) {
  const ch = parId.get(id);
  ok(ch && famille(ch) === fam, `Vinted ${id} « ${(ch ?? ['?']).join(' > ')} » : ${fam ?? 'ni l’une ni l’autre'}`, ch ? famille(ch) : 'feuille absente de l’arbre');
}
const toutes = feuillesV.map((f) => f.chemin);
const deg = toutes.filter((ch) => famille(ch) === 'deguisement').map((ch) => ch.join(' > '));
ok(deg.length >= 5 && deg.every((s) => /Déguisement|Vêtements spécialisés et costumes|Costumes et tenues particulières/.test(s)),
  `arbre Vinted entier : ${deg.length} feuilles « déguisements », toutes nommées comme telles`, deg.slice(0, 12));
const vil = toutes.filter((ch) => famille(ch) === 'ville').map((ch) => ch.join(' > '));
ok(vil.length >= 8 && vil.every((s) => /Costumes et blazers|Blazers et tailleurs|Pantalons de costume|Blazers/.test(s)),
  `arbre Vinted entier : ${vil.length} feuilles « ville », toutes sous costumes, blazers ou tailleurs`, vil);
const beebs = (await P.feuillesDe('beebs')).map((f) => f.chemin);
const degB = beebs.filter((ch) => famille(ch) === 'deguisement').map((ch) => ch.join(' > '));
const vilB = beebs.filter((ch) => famille(ch) === 'ville').map((ch) => ch.join(' > '));
ok(degB.length >= 3 && degB.every((s) => /Déguisement/.test(s)), `arbre Beebs : ${degB.length} feuilles « déguisements »`, degB);
ok(vilB.length >= 5 && vilB.every((s) => /[Cc]ostume|[Bb]lazer|[Tt]ailleur/.test(s)), `arbre Beebs : ${vilB.length} feuilles « ville »`, vilB);

console.log('C. Le cas du 11/11 : « Veste de costume bleu », candidates réelles de l’app');
const cand = (await P.candidatsParMot('veste de costume', 'vinted', { genre: 'homme', titre: 'Veste de costume bleu' })).map((c) => ({ chemin: c.chemin, id: c.id }));
ok(cand.some((c) => String(c.id) === '92') && !cand.some((c) => String(c.id) === '1786'),
  `les ${cand.length} candidates envoyées à l’IA contiennent 92 et PAS « Blazers » (1786) — la bonne réponse manquait`, cand.map((c) => c.id));
const choix92 = { chemin: parId.get('92'), id: '92' };
const vCas = verdict({ plateforme: 'vinted', texte: 'Veste de costume bleu veste de costume', choix: choix92, candidats: cand });
ok(vCas && vCas !== 'absent' && vCas.remplacement?.id === '1786' && vCas.remplacement.chemin.join(' > ') === 'Hommes > Vêtements > Costumes et blazers > Blazers',
  'le choix 92 de l’IA est remplacé par « Hommes > Vêtements > Costumes et blazers > Blazers » (1786)', vCas);
ok(vCas?.remplacement && P.estFeuilleDeLArbre?.(vCas.remplacement.chemin, 'vinted') !== false && parId.get('1786')?.join(' > ') === vCas.remplacement.chemin.join(' > '),
  'le remplacement est une feuille de l’arbre de l’app, au même identifiant');
const cat = new Map(CATALOGUE_VINTED_FR.map(([id, p, l]) => [id, { p, l }]));
ok(cat.get(1786)?.l === 'Blazers' && cat.get(cat.get(1786).p)?.l === 'Costumes et blazers', 'le catalogue du serveur porte 1786 sous « Costumes et blazers »');

console.log('D. Les autres cas, positifs et négatifs');
{
  const c2 = (await P.candidatsParMot('costume', 'vinted', { genre: 'homme', titre: 'Costume bleu marine' })).map((c) => ({ chemin: c.chemin, id: c.id }));
  const v2 = verdict({ plateforme: 'vinted', texte: 'Costume bleu marine costume', choix: choix92, candidats: c2 });
  ok(v2?.remplacement?.id === '1789', '« Costume bleu marine » choisi en 92 → « Ensembles costume » (1789), une candidate', v2);
  const v3 = verdict({ plateforme: 'vinted', texte: 'Costume trois pièces gris', choix: choix92, candidats: [] });
  ok(v3?.remplacement?.id === '1789', '« Costume trois pièces » sans candidate → la feuille du catalogue « Ensembles costume » (1789)', v3);
  const v4 = verdict({ plateforme: 'vinted', texte: 'Pantalon de costume gris', choix: choix92, candidats: c2 });
  ok(v4 && v4 !== 'absent' && v4.remplacement === null && c2.filter((c) => /Pantalons de costume/.test(c.chemin.join(' > '))).length === 2,
    '« Pantalon de costume » en 92, deux candidates « Pantalons de costume » : le doute → aucun choix (jamais au hasard)', v4);
  const v4b = verdict({ plateforme: 'vinted', texte: 'Pantalon de costume gris', choix: choix92, candidats: c2.filter((c) => String(c.id) !== '261') });
  ok(v4b?.remplacement?.id === '1787', '« Pantalon de costume » en 92, une seule candidate de la pièce → « Pantalons de costume » (1787)', v4b);
  const fem = { chemin: parId.get('1782'), id: '1782' };
  const v5 = verdict({ plateforme: 'vinted', texte: 'Veste de costume femme', choix: fem, candidats: [] });
  ok(v5?.remplacement?.id === '532' && v5.remplacement.chemin.join(' > ') === 'Femmes > Vêtements > Blazers et tailleurs > Blazers',
    '« Veste de costume femme » choisie en « Costumes et tenues particulières » → « Femmes > … > Blazers » (532)', v5);
  ok(verdict({ plateforme: 'vinted', texte: 'Déguisement pirate homme', choix: choix92, candidats: c2 }) === null, '« Déguisement pirate » en 92 : rien ne bouge');
  ok(verdict({ plateforme: 'vinted', texte: "Costume d'Halloween squelette", choix: choix92, candidats: c2 }) === null, '« Costume d’Halloween » en 92 : rien ne bouge');
  const v6 = verdict({ plateforme: 'vinted', texte: 'Costume de carnaval homme', choix: { chemin: parId.get('1789'), id: '1789' }, candidats: c2 });
  ok(v6?.remplacement?.id === '92', '« Costume de carnaval » choisi en « Ensembles costume » → le rayon des déguisements (92), une candidate', v6);
  const v7 = verdict({ plateforme: 'vinted', texte: 'Costume de super-héros', choix: { chemin: parId.get('1789'), id: '1789' }, candidats: [] });
  ok(v7 && v7.remplacement === null, '« Costume de super-héros » en « Ensembles costume », sans candidate : aucun choix (jamais un rayon faux)', v7);
  ok(verdict({ plateforme: 'vinted', texte: 'Veste de costume bleu', choix: { chemin: parId.get('1786'), id: '1786' }, candidats: cand }) === null, 'un bon choix (Blazers) : rien ne bouge');
  ok(verdict({ plateforme: 'vinted', texte: 'Pull en laine', choix: choix92, candidats: cand }) === null, 'un texte sans costume : rien ne bouge (la règle ne juge que le costume)');
  ok(verdict({ plateforme: 'vinted', texte: 'Pochette de costume en soie', choix: { chemin: parId.get('5554'), id: '5554' }, candidats: cand }) === null, '« Pochettes de costume » (accessoire) : rien ne bouge');
  const degBe = beebs.find((ch) => ch.join(' > ').includes('Déguisements (homme)'));
  const vilBe = beebs.find((ch) => /Vestes et blazers \(homme\)|Costumes et blazers \(homme\)/.test(ch.join(' > ')));
  const v8 = verdict({ plateforme: 'beebs', texte: 'Veste de costume bleu', choix: { chemin: degBe, id: 'b1' }, candidats: [{ chemin: degBe, id: 'b1' }, { chemin: vilBe, id: 'b2' }] });
  ok(degBe && vilBe && v8?.remplacement?.id === 'b2', 'Beebs : « Déguisements (homme) » → la candidate « blazers (homme) »', { degBe, vilBe, v8 });
  ok(verdict({ plateforme: 'ebay', texte: 'Veste de costume bleu', choix: { chemin: ['Vêtements', 'Déguisements, masques'], id: 'e1' }, candidats: [] }) === null, 'eBay : non couvert, rien ne bouge');
  const v9 = verdict({ plateforme: 'vinted', texte: 'Costume trois pièces gris', choix: choix92, candidats: [], catalogue: false });
  ok(v9 && v9.remplacement === null, 'descente « plus proche » : jamais de feuille du catalogue hors des entrées (aucun choix)', v9);
}

console.log('E. Lecture du code de resolve-categorie');
{
  const rc = lire('supabase/functions/resolve-categorie/index.ts');
  const iVerif = rc.indexOf('VÉRIFICATION : la réponse doit être une clé de CETTE plateforme');
  const iGarde = rc.indexOf('verdictCostume({');
  const iJournal = rc.indexOf('JOURNAL (point 2, instrumentation PURE)');
  ok(/import \{ verdictCostume \} from "\.\.\/_shared\/costume-de-ville\.js";/.test(rc) && iVerif > 0 && iGarde > iVerif && iJournal > iGarde,
    'la règle est appliquée APRÈS la vérification de la clé et AVANT le journal (le journal dit le choix rendu)');
  ok(/consigne !== "plus_proche"/.test(rc.slice(iGarde, iGarde + 400)), 'la descente « plus proche » n’accepte jamais une feuille hors de ses entrées');
  // La boucle de resolve-categorie JOUÉE (annotations de type retirées) sur le cas : le choix rendu est bien remplacé.
  const debut = rc.indexOf('const gardesCostume');
  const fin = rc.indexOf('\n  }\n', debut) + 4;
  let rendu = null;
  try {
    const bloc = rc.slice(debut, fin).replace(/: string\[\]/g, '').replace(/ as Plateforme\[\]/g, '').replace(/ as Record<string, unknown>/g, '');
    const jouer = new Function('titre', 'corps', 'choix', 'candidats', 'verdictCostume', 'console', `${bloc}\nreturn gardesCostume;`);
    const choixJ = { vinted: { chemin: choix92.chemin, id: '92', source: 'arbre' }, ebay: { chemin: ['Vêtements', 'Costumes'], id: 'e9', source: 'arbre' } };
    const gardes = jouer('Veste de costume bleu', { attributs: { objet: 'veste de costume' } }, choixJ, { vinted: cand }, C?.verdictCostume ?? (() => null), { warn: () => {} });
    rendu = { gardes, choixJ };
  } catch (e) { rendu = { erreur: e.message }; }
  ok(rendu?.choixJ?.vinted?.id === '1786' && rendu.choixJ.ebay?.id === 'e9' && rendu.gardes?.join() === 'vinted:remplace',
    'la boucle de resolve-categorie, jouée sur le cas : Vinted rendu en 1786, eBay intact, la garde tracée', rendu);
  const sys = rc.slice(rc.indexOf('const SYSTEM = `'), rc.indexOf('`;', rc.indexOf('const SYSTEM = `')));
  ok(sys.length > 500 && !/costume/i.test(sys.replace('un blouson n\'est pas une veste de costume', '')), 'la question posée à l’IA (SYSTEM) est inchangée : la règle est un contrôle, pas une consigne');
}

console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ROUGE(S)` : ' — tout est vert'}`);
process.exit(ko ? 1 : 0);
