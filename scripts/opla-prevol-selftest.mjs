// `node scripts/opla-prevol-selftest.mjs`
//
// Prouve le pré-vol Opla sur LES CAS QUI NOUS ONT RÉELLEMENT PIÉGÉS, contre le
// référentiel RELEVÉ (docs/opla/*.tsv, empreintes confrontées au live).
//
// Pourquoi ce test existe : Opla accepte en 200 une catégorie inexistante et une
// taille hors grille (mesuré le 14/09). Le pré-vol est donc la SEULE garde, et
// une garde non testée n'est pas une garde.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Le dépôt est en "type":"module" : Node charge les .js en ESM, où `module`
// n'existe pas. Le module de pré-vol le prévoit et se publie alors sur
// globalThis (même chemin que dans le monde isolé d'un content script) — c'est
// donc EXACTEMENT le code que Chrome exécutera qui est testé ici, pas une copie.
await import(pathToFileURL(path.join(ROOT, 'chrome-extension/handlers/opla-prevol.js')).href);
const { oplaPrevol, OPLA_PREVOL_MOTIFS: M } = globalThis;
if (typeof oplaPrevol !== 'function') { console.error('opla-prevol.js n a pas publié oplaPrevol'); process.exit(1); }

// ── Référentiel, lu dans les fichiers relevés ────────────────────────────────
const lignes = (f) => fs.readFileSync(path.join(ROOT, 'docs/opla', f), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));

const cats = lignes('categories.tsv');                       // profondeur, code, titre, parent, feuille
const noeuds = new Set(cats.map(c => c[1]));
const feuilles = new Set(cats.filter(c => c[4] === 'F').map(c => c[1]));

const grilles = new Map(lignes('grilles-tailles.tsv').map(g => [g[0], g[2] === '' ? [] : g[2].split(',')]));
const parCategorie = new Map(lignes('categorie-grille.tsv').map(c => [c[0], c[2]]));   // code -> Gn
const grillePour = (code) => {
  const g = parCategorie.get(code);
  if (!g || g === 'G0') return null;
  return grilles.get(g) || null;
};

const ref = { feuilles, noeuds, grillePour };

// ── Un job nominal, qui doit PASSER ──────────────────────────────────────────
const nominal = () => ({
  title: 'Robe d ete fleurie',
  description: 'Portee deux fois.',
  price: 24.9,
  photos: ['temp/x/a.jpg', 'temp/x/b.jpg'],
  platform_fields: { oplaCategoryCode: 'SUMMER_DRESSES', marque: 'Zara', etat: 'good', taille: 'M', couleurs: ['BLUE'] },
});
const avec = (modif) => { const j = nominal(); Object.assign(j.platform_fields, modif.platform_fields || {}); delete modif.platform_fields; return Object.assign(j, modif); };

// ── Les cas ──────────────────────────────────────────────────────────────────
const cas = [
  ['nominal → PASSE', nominal(), null],

  // les deux que le serveur Opla accepte en 200 : c'est tout l'objet du pré-vol
  ['categorie INEXISTANTE (Opla rendrait 200)', avec({ platform_fields: { oplaCategoryCode: 'CATEGORIE_QUI_NEXISTE_PAS' } }), M.CATEGORIE_INCONNUE],
  ['taille de la MAUVAISE grille : 75A sur une robe (Opla rendrait 200)', avec({ platform_fields: { taille: '75A' } }), M.TAILLE_HORS_GRILLE],

  // noeud intermediaire : existe dans l arbre, mais pas deposable
  ['noeud INTERMEDIAIRE (DRESSES, pas une feuille)', avec({ platform_fields: { oplaCategoryCode: 'DRESSES' } }), M.CATEGORIE_PAS_UNE_FEUILLE],
  ['racine WOMEN_ROOT (pas une feuille)', avec({ platform_fields: { oplaCategoryCode: 'WOMEN_ROOT' } }), M.CATEGORIE_PAS_UNE_FEUILLE],

  // LE PIEGE DES CODES EN DOUBLE : XS vit dans G1 ET dans G4.
  ['code en DOUBLE : XS valide sur une robe (G1)', avec({ platform_fields: { taille: 'XS' } }), null],
  ['code en DOUBLE : XS valide aussi sur BRAS (G4)', avec({ platform_fields: { oplaCategoryCode: 'BRAS', taille: 'XS' } }), null],
  ['code en DOUBLE : XXS REFUSE sur BRAS (G1 seulement)', avec({ platform_fields: { oplaCategoryCode: 'BRAS', taille: 'XXS' } }), M.TAILLE_HORS_GRILLE],
  ['75A valide sur BRAS (sa vraie grille)', avec({ platform_fields: { oplaCategoryCode: 'BRAS', taille: '75A' } }), null],

  // taille requise / inattendue
  ['taille MANQUANTE sur categorie a grille', avec({ platform_fields: { taille: null } }), M.TAILLE_REQUISE],
  ['categorie SANS grille + taille fournie → passe, taille omise', avec({ platform_fields: { oplaCategoryCode: 'MAISON_DECO_VASES', taille: 'M' } }), null],

  // prix
  ['prix a 0,50 € (l incident du 14/09)', avec({ price: 0.5 }), M.PRIX_TROP_BAS],
  ['prix a 1200 € (au-dessus du plafond Opla)', avec({ price: 1200 }), M.PRIX_TROP_HAUT],
  ['prix a 1000 € (pile au plafond) → passe', avec({ price: 1000 }), null],
  ['prix a 0', avec({ price: 0 }), M.PRIX_ABSENT],

  // photos
  ['21 photos', avec({ photos: Array.from({ length: 21 }, (_, i) => `temp/x/${i}.jpg`) }), M.PHOTOS_TROP_NOMBREUSES],
  ['20 photos (pile au plafond) → passe', avec({ photos: Array.from({ length: 20 }, (_, i) => `temp/x/${i}.jpg`) }), null],
  ['0 photo', avec({ photos: [] }), M.PHOTOS_ABSENTES],

  // champs obligatoires
  ['marque absente', avec({ platform_fields: { marque: '' } }), M.MARQUE_ABSENTE],
  ['etat inconnu', avec({ platform_fields: { etat: 'tres-bon-etat' } }), M.ETAT_INCONNU],
  ['titre absent', avec({ title: '   ' }), M.TITRE_ABSENT],
  ['description absente → PASSE (facultative sur Opla)', avec({ description: '' }), null],
];

// ── Exécution ────────────────────────────────────────────────────────────────
let ko = 0;
console.log(`référentiel : ${noeuds.size} nœuds, ${feuilles.size} feuilles, ${grilles.size} grilles\n`);
for (const [nom, job, motifAttendu] of cas) {
  const v = oplaPrevol(job, ref);
  const motif = v.ok ? null : v.motif;
  const bon = motif === motifAttendu;
  if (!bon) ko++;
  console.log(`${bon ? '  ok  ' : '  KO  '} ${nom}`);
  if (!bon) console.log(`        attendu : ${motifAttendu ?? 'PASSE'}\n        obtenu  : ${motif ?? 'PASSE'}`);
}

// ── Contrôles de forme sur le corps produit ──────────────────────────────────
const v = oplaPrevol(nominal(), ref);
const verif = [
  ['corps produit', v.ok === true],
  ['priceCents entier en centimes', v.corps.priceCents === 2490],
  ['categoriesPath JAMAIS envoyé', !('categoriesPath' in v.corps)],
  ['metadata.sizes posé', JSON.stringify(v.corps.metadata.sizes) === '["M"]'],
  ['metadata.colors posé', JSON.stringify(v.corps.metadata.colors) === '["BLUE"]'],
  ['metadata.materials ABSENT si vide', !('materials' in v.corps.metadata)],
];
const vSansDesc = oplaPrevol(avec({ description: '' }), ref);
verif.push(['description ABSENTE du corps si vide', !('description' in vSansDesc.corps)]);
const vSansGrille = oplaPrevol(avec({ platform_fields: { oplaCategoryCode: 'MAISON_DECO_VASES', taille: 'M' } }), ref);
verif.push(['metadata.sizes ABSENT si la catégorie n a pas de grille', !vSansGrille.corps.metadata || !('sizes' in vSansGrille.corps.metadata)]);

console.log('');
for (const [nom, ok] of verif) { if (!ok) ko++; console.log(`${ok ? '  ok  ' : '  KO  '} ${nom}`); }

console.log(`\n${ko === 0 ? 'TOUT PASSE' : ko + ' ÉCHEC(S)'} — ${cas.length + verif.length} contrôles`);
process.exit(ko === 0 ? 0 : 1);
