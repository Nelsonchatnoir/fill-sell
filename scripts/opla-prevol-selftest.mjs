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
// Le vocabulaire des tailles est injecté AVANT le pré-vol par OPLA_SCRIPTS
// (background.js) et se publie lui aussi sur globalThis. On le charge dans le
// même ordre, sinon le test exercerait le REPLI (égalité stricte) et pas le
// chemin que Chrome emprunte réellement.
await import(pathToFileURL(path.join(ROOT, 'chrome-extension/content-scripts/tailles-vocabulaire.js')).href);
await import(pathToFileURL(path.join(ROOT, 'chrome-extension/content-scripts/opla-prevol.js')).href);
const { oplaPrevol, OPLA_PREVOL_MOTIFS: M } = globalThis;
if (typeof globalThis.taillesVocabulaire?.tailleDansGrille !== 'function') {
  console.error('tailles-vocabulaire.js n a pas publié taillesVocabulaire'); process.exit(1);
}
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

// Couleurs et matières (lot 7) : mêmes fichiers relevés, même forme que
// /public/config/params?category=<code> — { code, title }. La liste est servie
// PAR FEUILLE côté Opla ; ici on rend la même pour toutes, ce que le pré-vol ne
// distingue pas (il demande « la liste de CETTE feuille » et valide dedans).
const COULEURS = fs.readFileSync(path.join(ROOT, 'docs/opla/colors.txt'), 'utf8').trim().split('\n')
  .map(l => l.split('|')).map(([code, , title]) => ({ code, title }));
const MATIERES = fs.readFileSync(path.join(ROOT, 'docs/opla/materials.txt'), 'utf8').trim().split('\n')
  .map(l => l.split('|')).map(([code, title]) => ({ code, title }));

// Le chemin de libellés d'un code, comme opla.js le rend depuis l'arbre VIVANT
// (`cheminDe`). Il donne la BRANCHE — « Femmes », « Hommes », « Enfants » —, et
// c'est elle qui autorise ou non la table femme nombre → lettre.
const parentDe = new Map(cats.map(c => [c[1], c[3]]));
const titreDe = new Map(cats.map(c => [c[1], c[2]]));
const cheminDe = (code) => {
  const out = [];
  for (let c = String(code ?? '').trim(), n = 0; c && noeuds.has(c) && n < 12; c = parentDe.get(c) ?? '', n++) out.unshift(titreDe.get(c));
  return out;
};

const ref = { feuilles, noeuds, grillePour, cheminDe, couleursPour: () => COULEURS, matieresPour: () => MATIERES };
// Référentiel HISTORIQUE, sans les deux listes : prouve qu'un pré-vol appelé
// avec l'ancien contrat ne casse pas, et qu'il DIT qu'il n'a pas pu vérifier.
const refSansListes = { feuilles, noeuds, grillePour };

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
  // ⚠️ DÉCISION NICO 16/09 : au-dessus de 300 €, REFUS. Le plafond de 1000 €
  // devient donc INATTEIGNABLE en pratique — le seuil de profil vérifié tombe
  // 700 € plus tôt. Le contrôle le dit tel quel plutôt que de le masquer : si
  // un jour on veut revoir le plafond, c'est ici qu'on lira pourquoi il ne
  // sert plus.
  ['prix a 1000 € (pile au plafond Opla) → REFUSÉ par le seuil des 300 € d abord',
    avec({ price: 1000 }), M.PRIX_PROFIL_VERIFIE],
  ['prix a 500 € (au-dessus du seuil profil vérifié) → REFUSÉ avant l envoi',
    avec({ price: 500 }), M.PRIX_PROFIL_VERIFIE],
  ['prix a 300,01 € (juste au-dessus du seuil) → REFUSÉ', avec({ price: 300.01 }), M.PRIX_PROFIL_VERIFIE],
  ['prix a 300 € (pile au seuil) → passe', avec({ price: 300 }), null],
  ['prix a 1 € (le plancher tranché par Nico) → passe', avec({ price: 1 }), null],
  ['prix a 0,99 € (juste sous le plancher) → REFUSÉ', avec({ price: 0.99 }), M.PRIX_TROP_BAS],
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

  // ── RÉGRESSION DU LOT 7 : la branche « pas de grille » rendait ok:true
  // SUR-LE-CHAMP et sautait marque / état / prix. Un vase sans marque, avec un
  // état inventé ou un prix à 0,50 €, passait le pré-vol sans un mot.
  ['SANS grille + marque absente → REFUSE quand même (ne sort plus tôt)',
    avec({ platform_fields: { oplaCategoryCode: 'MAISON_DECO_VASES', taille: 'M', marque: '' } }), M.MARQUE_ABSENTE],
  ['SANS grille + prix à 0,50 € → REFUSE quand même',
    avec({ price: 0.5, platform_fields: { oplaCategoryCode: 'MAISON_DECO_VASES', taille: 'M' } }), M.PRIX_TROP_BAS],
  ['SANS grille + état inconnu → REFUSE quand même',
    avec({ platform_fields: { oplaCategoryCode: 'MAISON_DECO_VASES', taille: 'M', etat: 'tres-bon-etat' } }), M.ETAT_INCONNU],

  // ── Couleurs / matières : JAMAIS un refus, toujours un tri (lot 7) ────────
  ['couleur INCONNUE → passe (la valeur est jetée, pas le job)',
    avec({ platform_fields: { couleurs: ['Bleu pétrole'] } }), null],
  ['matière INCONNUE → passe (la valeur est jetée, pas le job)',
    avec({ platform_fields: { matieres: ['Tissu magique'] } }), null],
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
verif.push(['taille omise → AVERTISSEMENT, pas un silence',
  (vSansGrille.avertissements || []).some(a => String(a).includes(M.TAILLE_INATTENDUE))]);

// ── SEUIL DE PROFIL VÉRIFIÉ — REFUS (décision Nico, 2026-09-16) ──────────────
// 403 phone_verification_required / high_value_listing / thresholdCents 30000.
// Le refus arrive AVANT l'envoi : un 403 coûterait le montage de toutes les
// photos, qui part avant le POST.
const vCher = oplaPrevol(avec({ price: 500 }), ref);
verif.push(['au-dessus de 300 € → REFUS, pas un avertissement', vCher.ok === false && vCher.motif === M.PRIX_PROFIL_VERIFIE]);
verif.push(['le message NOMME le seuil ET les deux issues',
  /300/.test(vCher.message) && /baisser le prix/i.test(vCher.message) && /v[ée]rifier/i.test(vCher.message),
  vCher.message]);
verif.push(['il pointe le champ prix', vCher.champ === 'price', vCher.champ]);
verif.push(['aucune option à cocher sur un refus de PRIX (on corrige, on ne choisit pas)', !('options' in vCher)]);

// ── COULEURS ET MATIÈRES — la garde ajoutée au lot 7 ─────────────────────────
// Opla n'inspecte NI l'une NI l'autre : « Marine » partirait tel quel dans un
// champ qui attend « NAVY », en 200, et l'annonce serait rangée nulle part.
const vLibelle = oplaPrevol(avec({ platform_fields: { couleurs: ['Marine'], matieres: ['Coton'] } }), ref);
verif.push(['libellé FR traduit en code : Marine → NAVY',
  JSON.stringify(vLibelle.corps.metadata.colors) === '["NAVY"]']);
verif.push(['libellé FR traduit en code : Coton → cotton',
  JSON.stringify(vLibelle.corps.metadata.materials) === '["cotton"]']);
verif.push(['aucun avertissement quand tout se traduit', !vLibelle.avertissements]);

const vCasse = oplaPrevol(avec({ platform_fields: { couleurs: ['  marine  '] } }), ref);
verif.push(['casse et espaces tolérés, le reste NON',
  JSON.stringify(vCasse.corps.metadata.colors) === '["NAVY"]']);

const vInconnue = oplaPrevol(avec({ platform_fields: { couleurs: ['NAVY', 'Bleu pétrole'] } }), ref);
verif.push(['valeur inconnue JETÉE, les autres gardées',
  JSON.stringify(vInconnue.corps.metadata.colors) === '["NAVY"]']);
verif.push(['valeur jetée → avertissement qui la NOMME',
  (vInconnue.avertissements || []).some(a => String(a).includes('Bleu pétrole'))]);

const vToutInconnu = oplaPrevol(avec({ platform_fields: { couleurs: ['Bleu pétrole'] } }), ref);
verif.push(['metadata.colors ABSENT si TOUT a été jeté (jamais un tableau vide)',
  !vToutInconnu.corps.metadata || !('colors' in vToutInconnu.corps.metadata)]);

const vApprochante = oplaPrevol(avec({ platform_fields: { couleurs: ['Creme'] } }), ref);
verif.push(['JAMAIS la valeur la plus proche : « Creme » ne devient pas CREAM',
  !vApprochante.corps.metadata || !('colors' in vApprochante.corps.metadata)]);

// Référentiel sans les listes : on ne peut pas vérifier — on garde, et on le dit.
const vSansListes = oplaPrevol(nominal(), refSansListes);
verif.push(['liste indisponible → la valeur passe telle quelle',
  JSON.stringify(vSansListes.corps.metadata.colors) === '["BLUE"]']);
verif.push(['liste indisponible → le DOUTE est tracé',
  (vSansListes.avertissements || []).some(a => String(a).includes(M.COULEURS_NON_VERIFIEES))]);

console.log('');
for (const [nom, ok] of verif) { if (!ok) ko++; console.log(`${ok ? '  ok  ' : '  KO  '} ${nom}`); }


// ── LA TAILLE SE TRADUIT AVANT D'ÊTRE REFUSÉE (2026-09-20, passe 4) ────────
// Les refus mesurés sur le parc : « 5 ans » contre LEGGINGS_GIRLS_NEW, dont
// la grille contient `5Y` (titre Opla : « 5 ans »), et « 18 mois » contre une
// grille qui contient `18M`. C'était une égalité de CHAÎNES.
// ⛔ Ce qui doit rester refusé le reste : « 38 » contre des lettres et
//    « 44.5 » contre des pointures entières sont des CONVERSIONS de système.
{
  const fsx = await import('node:fs');
  const prevol = fsx.readFileSync('chrome-extension/content-scripts/opla-prevol.js', 'utf8');
  const vocab = fsx.readFileSync('chrome-extension/content-scripts/tailles-vocabulaire.js', 'utf8');
  const partage = fsx.readFileSync('supabase/functions/_shared/tailles.js', 'utf8');
  // ⚠️ `dit` compte dans le MÊME `ko` que le reste : la version précédente ne
  //    posait que `process.exitCode`, et la ligne de résumé annonçait
  //    « TOUT PASSE » sur quatre échecs affichés juste au-dessus.
  const dit = (nom, c, detail) => { if (!c) ko++; console.log(`  ${c ? 'ok  ' : '❌  '} ${nom}${c || detail === undefined ? '' : `  → ${detail}`}`); };

  console.log('\nLA TAILLE SE TRADUIT AVANT D\'ÊTRE REFUSÉE');
  // ⛔ CES CONTRÔLES EXÉCUTENT LE PRÉ-VOL, ils ne lisent pas son texte. La
  //    version précédente ne faisait que des regex sur le fichier : elle est
  //    passée AU VERT sur un appel qui lisait `traduite.code` quand le module
  //    rend `{ valeur, motif }` — le payload serait parti avec la chaîne
  //    « [object Object] » comme taille. Un test qui relit le code ne prouve
  //    que l'orthographe du code.
  // LEGGINGS_GIRLS_NEW est en G2 (29 tailles enfant, `5Y`…) ; SUMMER_DRESSES
  // en G1 (14 lettres) ; MEN_SNEAKERS en G3 (pointures ENTIÈRES 14→50).
  const enfant = (taille) => oplaPrevol(avec({ platform_fields: { oplaCategoryCode: 'LEGGINGS_GIRLS_NEW', taille } }), ref);
  const sizeDe = (v) => v?.corps?.metadata?.sizes?.[0] ?? null;

  const traduits = [
    ['« 5 ans » → 5Y   (le refus mesuré d\'Ornella)', '5 ans', '5Y'],
    ['« 12 ans » → 12Y (le refus mesuré du 18/09)', '12 ans', '12Y'],
    ['« 18 mois » → 18M', '18 mois', '18M'],
    ['« 12-18 mois » → 12-18M', '12-18 mois', '12-18M'],
    ['« 8A » → 8Y', '8A', '8Y'],
    ['« 6 ans / 116 cm » → 6Y (étiquette composite Vinted)', '6 ans / 116 cm', '6Y'],
  ];
  for (const [nom, brut, attendu] of traduits) {
    const v = enfant(brut);
    dit(`${nom} — et c'est la valeur de la GRILLE qui part`, v.ok === true && sizeDe(v) === attendu, sizeDe(v));
  }

  console.log('\n… ET CE QUI DOIT RESTER REFUSÉ LE RESTE');
  const refuses = [
    ['« 23 mois » : 23M n\'existe pas (24M est une AUTRE taille)', enfant('23 mois')],
    ['« 2 ans » ne devient pas 24M — Opla porte les deux, on ne gomme pas', null],
    ['« 18 mois » contre des lettres = le RAYON est faux, pas la taille',
      oplaPrevol(avec({ platform_fields: { taille: '18 mois' } }), ref)],
    ['« XS » contre une grille enfant = le RAYON est faux', enfant('XS')],
    ['« 44.5 » contre des pointures entières = limite d\'Opla',
      oplaPrevol(avec({ platform_fields: { oplaCategoryCode: 'MEN_SNEAKERS', taille: '44.5' } }), ref)],
    ['« 44,5 » aussi (la virgule ne fabrique pas une pointure)',
      oplaPrevol(avec({ platform_fields: { oplaCategoryCode: 'MEN_SNEAKERS', taille: '44,5' } }), ref)],
  ];
  for (const [nom, v] of refuses) {
    if (v === null) { const w = enfant('2 ans'); dit(nom, w.ok === true && sizeDe(w) === '2Y', sizeDe(w)); continue; }
    dit(nom, v.ok === false && v.motif === M.TAILLE_HORS_GRILLE, `${v.ok} / ${v.motif}`);
  }
  dit('« 44.5 » : le message dit la LIMITE, il ne propose pas 44 ni 45',
    !/\b4[45]\b\s*(ou|à la place|plutôt)/i.test(
      oplaPrevol(avec({ platform_fields: { oplaCategoryCode: 'MEN_SNEAKERS', taille: '44.5' } }), ref).message));

  console.log('\nLA TABLE NOMBRE → LETTRE : RELEVÉE CHEZ VINTED, BORNÉE AUX FEMMES');
  // Opla ne publie AUCUNE équivalence numérique (relevé 20/09 : G1 = « XXS »
  // … « 8XL »). Vinted si, dans /api/v2/size_groups groupe 4 (« M / 38 / 10 »).
  // ⛔ Le MÊME « 38 » est une pointure dans les groupes 7 et 38 du MÊME
  //    référentiel. La table ne sort donc que sous Femmes, et uniquement
  //    quand la grille cible n'écrit QUE des lettres.
  const sousFemmes = (cat, taille) => oplaPrevol(avec({ platform_fields: { oplaCategoryCode: cat, taille } }), ref);
  const G1 = grillePour('SUMMER_DRESSES');
  for (const [nombre, lettre] of Object.entries(globalThis.taillesVocabulaire.TAILLE_FEMME_LETTRE_PAR_NOMBRE)) {
    const v = sousFemmes('SUMMER_DRESSES', nombre);
    // La table relevée chez Vinted descend jusqu'à XXXS ; la grille G1 d'Opla
    // s'arrête à XXS. Une lettre que la CIBLE n'écrit pas ne se sert pas — on
    // ne rapproche pas « 30 » du XXS le plus proche.
    if (G1.includes(lettre)) dit(`robe femme « ${nombre} » → ${lettre}`, v.ok === true && sizeDe(v) === lettre, sizeDe(v));
    else dit(`robe femme « ${nombre} » : ${lettre} absent de la grille Opla → REFUSÉ, pas rapproché`,
      v.motif === M.TAILLE_HORS_GRILLE, `${v.ok} / ${sizeDe(v)}`);
  }
  dit('« 46 » (hors table femme) reste REFUSÉ — on ne devine pas',
    sousFemmes('SUMMER_DRESSES', '46').motif === M.TAILLE_HORS_GRILLE);
  dit('HOMMES : « 36 » de pantalon n\'est pas un S, il reste REFUSÉ',
    sousFemmes('MEN_TRO_OTHER', '36').motif === M.TAILLE_HORS_GRILLE);
  dit('HOMMES : « 38 » de t-shirt reste REFUSÉ',
    sousFemmes('MEN_TOP_T_SHIRTS', '38').motif === M.TAILLE_HORS_GRILLE);
  dit('ENFANTS : « 38 » reste REFUSÉ (la table est une table FEMME)',
    sousFemmes('TOPS_GIRLS_NEW', '38').motif === M.TAILLE_HORS_GRILLE);
  dit('SOUTIENS-GORGE (G4 : XS…XXL + 75A…) : « 38 » est un tour de dos, REFUSÉ',
    sousFemmes('BRAS', '38').motif === M.TAILLE_HORS_GRILLE);
  dit('CHAUSSURES femme : « 38 » reste la POINTURE 38, pas un M',
    sizeDe(sousFemmes('WOMEN_TRAINERS', '38')) === '38');
  dit('la table du vocabulaire est bien celle relevée chez Vinted (8 lignes, 30→44)',
    JSON.stringify(globalThis.taillesVocabulaire.TAILLE_FEMME_LETTRE_PAR_NOMBRE)
    === JSON.stringify({ '30': 'XXXS', '32': 'XXS', '34': 'XS', '36': 'S', '38': 'M', '40': 'L', '42': 'XL', '44': 'XXL' }));
  dit('il n\'existe qu\'UNE table dans le dépôt (Vinted la re-exporte, ne la recopie pas)',
    /export \{ TAILLE_FEMME_LETTRE_PAR_NOMBRE \} from "\.\/tailles\.js";/
      .test(fsx.readFileSync('supabase/functions/_shared/vinted-taille-republication.ts', 'utf8')));

  console.log('\nAUCUNE TAILLE QUI PASSAIT NE CESSE DE PASSER (G1, G2, G3)');
  // La traduction ne peut qu'ÉLARGIR : première étape du module = l'égalité
  // exacte. On le prouve sur les 80 valeurs des trois grilles du parc, pas sur
  // un raisonnement.
  let intactes = 0, perdues = [];
  for (const [cat, code] of [['SUMMER_DRESSES', 'G1'], ['LEGGINGS_GIRLS_NEW', 'G2'], ['MEN_SNEAKERS', 'G3']]) {
    for (const t of grillePour(cat) || []) {
      const v = oplaPrevol(avec({ platform_fields: { oplaCategoryCode: cat, taille: t } }), ref);
      if (v.ok === true && sizeDe(v) === t) intactes++; else perdues.push(`${code}:${t}→${v.motif || sizeDe(v)}`);
    }
  }
  dit(`les ${intactes} valeurs des grilles G1+G2+G3 partent inchangées`, perdues.length === 0, perdues.join(' '));

  console.log('\nLE REPLI, QUAND L\'INJECTION EST PARTIELLE');
  const garde = globalThis.taillesVocabulaire;
  delete globalThis.taillesVocabulaire;
  dit('sans vocabulaire, « 5 ans » est refusé (on ne laisse JAMAIS passer)',
    enfant('5 ans').motif === M.TAILLE_HORS_GRILLE);
  dit('sans vocabulaire, « 5Y » passe toujours', sizeDe(enfant('5Y')) === '5Y');
  globalThis.taillesVocabulaire = garde;
  dit('le repli strict est bien écrit dans le pré-vol',
    /grille\.indexOf\(taille\) === -1 \? null : \{ valeur: taille/.test(prevol));
  dit('le refus garde son message et ses options quand la traduction échoue',
    /if \(!traduite\) \{[\s\S]{0,900}?MOTIFS\.TAILLE_HORS_GRILLE/.test(prevol));

  console.log('\nLE VOCABULAIRE EST UNE COPIE FIDÈLE, PAS UNE SECONDE RÈGLE');
  // Les DEUX seules transformations que le générateur s'autorise. Si l'une
  // change ici sans changer là-bas, ce contrôle tombe — c'est lui qui a vu
  // que le fichier généré n'avait pas été refait après la dernière correction.
  const regleSource = partage
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ');
  dit('tailles-vocabulaire.js contient la règle partagée à l\'octet près',
    vocab.includes(regleSource));
  dit('aucun `export` ne survit (un content script MV3 n\'est pas un module)',
    !/^export\b/m.test(vocab));
  dit('et il publie les trois fonctions ET la table',
    /globalThis\.taillesVocabulaire = \{[\s\S]{0,200}?memeTaille[\s\S]{0,200}?tailleDansGrille[\s\S]{0,200}?diagnosticTaille[\s\S]{0,200}?TAILLE_FEMME_LETTRE_PAR_NOMBRE/.test(vocab));
  dit('il est déclaré AVANT opla-prevol.js dans l\'injection',
    (() => {
      const bg = fsx.readFileSync('chrome-extension/background.js', 'utf8');
      const l = /const OPLA_SCRIPTS = \[([^\]]+)\]/.exec(bg)?.[1] ?? '';
      return l.indexOf('tailles-vocabulaire') > -1 && l.indexOf('tailles-vocabulaire') < l.indexOf('opla-prevol');
    })());
}


console.log(`\n${ko === 0 ? 'TOUT PASSE' : ko + ' ÉCHEC(S)'} — ${cas.length + verif.length} contrôles`);
process.exit(ko === 0 ? 0 : 1);