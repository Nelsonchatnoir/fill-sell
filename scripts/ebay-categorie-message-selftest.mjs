// `node scripts/ebay-categorie-message-selftest.mjs`
//
// LE MESSAGE « CATÉGORIE eBAY À CONFIRMER » DOIT MONTRER OÙ ON RANGE (22/09).
//
// Défaut mesuré : le message n'écrivait que le DERNIER segment du chemin de
// l'app — « l'app en "Livres" ». Le chemin réel était « Jouets et jeux >
// Modélisme ferroviaire > Livres et guides > Livres » : un rayon de livres de
// MODÉLISME FERROVIAIRE. Lu au dernier segment, le choix de l'app paraissait
// irréprochable et personne ne pouvait voir l'absurdité.
//   · job 41f00503 (ornellaracano, « Livre Stephen Hawking ») : parti le 22/09
//     a 08:08 dans ce rayon, annonce 307191964555, fil d'Ariane verifie chez
//     eBay ;
//   · job 7c22f64b (« Twilight Fascination ») : meme mapping, encore en
//     needs_user.
//
// ⛔ CE TEST EXÉCUTE LE VRAI CODE : il extrait du worker le bloc qui fabrique
//    le message (les fonctions `chemin`, `complet`, `abrege` et la cascade
//    `tient`) et le rejoue. Rien n'est recopié à la main.
//
// LA BORNE DES 300 CARACTÈRES N'EST PAS DÉCORATIVE : au-delà, humanizeJobError
// remplace tout le message par « un imprévu technique » et le choix n'est
// jamais vu. C'est pour ça que le chemin se replie au lieu de déborder — mais
// la RACINE ne tombe jamais, dans aucune des deux formes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'supabase/functions/ebay-api-worker/index.ts'), 'utf8');

/** Découpe le bloc de fabrication du message, du marqueur au `const msg = …;`. */
function extraireBloc() {
  const debut = SRC.indexOf('const chemin = (c: string[])');
  if (debut < 0) throw new Error('bloc de fabrication du message introuvable (marqueur `const chemin =`)');
  const fin = SRC.indexOf('// ebayCategorieAttente : posé ICI', debut);
  if (fin < 0) throw new Error('fin du bloc introuvable');
  return SRC.slice(debut, fin)
    // on ne garde que du JS : les annotations de type de ce bloc sont simples
    .replace(/: string\[\]/g, '').replace(/: string/g, '')
    .replace(/\(categorie as \{ sansMapping\?: boolean \}\)/g, 'categorie');
}
const BLOC = extraireBloc();

// Le bloc extrait calcule lui-même `top` et `topChemin` depuis `categorie.choix`
// — comme en prod. On ne lui fournit que ce qui est déclaré AVANT lui.
function fabriquer({ topChemin, cheminMappe, mappee, sansMappingFlag = false }) {
  const fn = new Function('cheminMappe', 'mappee', 'categorie',
    `${BLOC}\nreturn { msg, sansMapping, topChemin };`);
  const categorie = {
    choix: topChemin.length ? [{ id: 'x', chemin: topChemin.join(' > ') }] : [],
    sansMapping: sansMappingFlag,
  };
  return fn(cheminMappe, mappee, categorie);
}

let ko = 0;
const ok = (nom, cond, detail = '') => {
  if (cond) { console.log(`  ✅ ${nom}`); return; }
  ko++; console.log(`  ❌ ${nom}${detail ? `\n       ${detail}` : ''}`);
};

const MODELISME = ['Jouets et jeux', 'Modélisme ferroviaire', 'Livres et guides', 'Livres'];
const NONFICTION = ['Livres, BD, revues', 'Non-fiction'];

console.log('LE CAS RÉEL — job 41f00503, « Livre Stephen Hawking »\n');
{
  const { msg } = fabriquer({ topChemin: NONFICTION, cheminMappe: MODELISME, mappee: '9049' });
  console.log(`  message (${msg.length} car.) :\n    ${msg}\n`);
  ok('le message nomme « Modélisme ferroviaire » — l\'absurdité est visible',
    msg.includes('Modélisme ferroviaire'), msg);
  ok('il ne se réduit plus à « l\'app en "Livres" »',
    !/l'app en « Livres »/.test(msg), msg);
  ok('il tient sous les 300 caractères (sinon humanizeJobError le jette)',
    msg.length <= 300, `${msg.length} caractères`);
  ok('la racine du rayon proposé par eBay est là aussi',
    msg.includes('Livres, BD, revues'), msg);
  // ⛔ « prendre celle d'eBay » doit rester VRAI dans le code : depuis le
  //    22/09, la branche « famille livres » retient elle aussi la suggestion
  //    du rayon Livres à la relance, au lieu de réinstaller le mapping de
  //    l'app (c'est ce qui avait publié le Hawking en modélisme ferroviaire).
  ok('et il dit la vérité sur ce que fait une relance',
    /Relance pour prendre celle d'eBay/.test(msg), msg);
}

console.log('\nLA BORNE — un chemin très long ne fait jamais déborder le message\n');
{
  const LONG_A = ['Maison', 'Mobilier et décoration intérieure', 'Meubles de rangement et bibliothèques', 'Étagères murales et consoles', 'Consoles murales en chêne massif'];
  const LONG_B = ['Bricolage', 'Outillage électroportatif et accessoires professionnels', 'Scies circulaires plongeantes et rails de guidage', 'Rails de guidage et raccords'];
  const { msg } = fabriquer({ topChemin: LONG_B, cheminMappe: LONG_A, mappee: '12345' });
  console.log(`  message (${msg.length} car.) :\n    ${msg}\n`);
  ok('reste sous 300 caractères', msg.length <= 300, `${msg.length} caractères`);
  ok('la RACINE de l\'app survit malgré l\'élision', msg.includes('Maison'), msg);
  ok('la RACINE d\'eBay survit aussi', msg.includes('Bricolage'), msg);
  ok('la feuille survit des deux côtés',
    msg.includes('Consoles murales en chêne massif') && msg.includes('Rails de guidage et raccords'), msg);
  ok('l\'élision est marquée, elle ne se cache pas', msg.includes('…'), msg);
}

console.log('\nNON-RÉGRESSION — les deux autres branches\n');
{
  const { msg, sansMapping } = fabriquer({ topChemin: NONFICTION, cheminMappe: MODELISME, mappee: '9049', sansMappingFlag: true });
  ok('hors-famille : le message « aucune catégorie sûre » est servi',
    sansMapping === true && /Aucune catégorie eBay sûre/.test(msg), msg);
  ok('…et il montre le chemin complet de l\'app', msg.includes('Modélisme ferroviaire'), msg);
  ok('…et il ne promet PAS la catégorie d\'eBay', !/celle d'eBay/.test(msg), msg);
  ok('…et il tient sous 300 caractères', msg.length <= 300, `${msg.length} caractères`);
}
{
  const { msg } = fabriquer({ topChemin: NONFICTION, cheminMappe: [], mappee: '' });
  ok('sans mapping du tout : message inchangé',
    /Aucune catégorie eBay n'a pu être posée/.test(msg), msg);
}
{
  // Chemin court : il doit sortir ENTIER, sans élision.
  const { msg } = fabriquer({ topChemin: ['Bijoux, montres', 'Montres'], cheminMappe: ['Bijoux, montres', 'Pièces, accessoires'], mappee: '10290' });
  ok('chemins courts : servis entiers, aucune élision', !msg.includes('…'), msg);
}

console.log(`\n${ko === 0 ? '✅ TOUT PASSE' : `❌ ${ko} CONTRÔLE(S) EN ÉCHEC`}`);
process.exit(ko === 0 ? 0 : 1);
