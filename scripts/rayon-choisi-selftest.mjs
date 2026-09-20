// ═══════════════════════════════════════════════════════════════════════════
// UN RAYON CHOISI PAR LA PERSONNE N'EST JAMAIS RECALCULÉ (2026-09-20, lot B)
// ═══════════════════════════════════════════════════════════════════════════
// Le garde-fou nº1 du lot B, prouvé plutôt qu'affirmé.
//
// Le danger : la résolution de catégorie se recalcule dès que l'empreinte ne
// colle plus — un titre retouché suffit, et c'est le cas une fois sur deux.
// Tant que le rayon n'était pas modifiable, aucune importance. Dès qu'il
// l'est, un recalcul peut reposer le rayon DEVINÉ par-dessus le rayon CHOISI.
//
// Ce script rejoue la vraie chaîne : la résolution (celle du lot A, non
// modifiée) sur des articles RÉELS de la prod, puis la surcouche de choix, et
// vérifie qu'après tous les recalculs imaginables le rayon rendu est encore
// celui de la personne.
//
//   node scripts/rayon-choisi-selftest.mjs
import fs from 'node:fs';
import {
  CLE_CHEMIN, CLE_ID, appliquerRayonChoisi, champsAvecRayonsChoisis,
  rayonDuChamp, cleCategorie, libelleRayon,
} from '../src/utils/rayonPublication.js';
import { classerChamps } from '../src/utils/champsDuRayon.js';

let echecs = 0;
const dit = (ok, texte) => { if (!ok) echecs++; console.log(`${ok ? '  ok  ' : ' ÉCHEC'}  ${texte}`); };

// ── 1. LA SURCOUCHE, SUR LES CINQ PLATEFORMES ─────────────────────────────
console.log('1. Le choix se repose sur les cinq plateformes\n');
const PF = ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla'];
for (const p of PF) {
  // Ce que la résolution a produit : un rayon DEVINÉ, marqué incertain.
  const devine = {
    [CLE_CHEMIN[p]]: ['Consoles', 'Consoles de jeux'],
    ...(CLE_ID[p] ? { [CLE_ID[p]]: '111111' } : {}),
    categorie_source: 'mot_objet_arbre',
    categorie_incertaine: true,
    lbcCategorieIncertaine: true,
    etat: 'Très bon état',
  };
  const choix = { chemin: ['Jeux vidéo', 'Jeux'], id: '222222', le: '2026-09-20T10:00:00Z' };
  const apres = appliquerRayonChoisi(devine, p, choix);
  dit(JSON.stringify(apres[CLE_CHEMIN[p]]) === JSON.stringify(choix.chemin), `${p} — le chemin est celui de la personne`);
  if (CLE_ID[p]) dit(apres[CLE_ID[p]] === '222222', `${p} — l'identifiant suit le chemin`);
  dit(apres.categorie_source === 'choix_humain', `${p} — la source dit « choix humain »`);
  dit(!apres.categorie_incertaine && !apres.lbcCategorieIncertaine, `${p} — plus aucun drapeau « incertain »`);
  dit(apres.etat === 'Très bon état', `${p} — le reste des champs n'a pas bougé`);
}

// ── 2. eBay SANS IDENTIFIANT : on ne publie pas un libellé qui ment ───────
console.log('\n2. eBay navigue par identifiant — un choix sans identifiant retire l\'ancien\n');
{
  const avant = { ebayCategoryPath: ['A', 'B'], ebayCategoryId: '999', categorie_source: 'ia_parmi_candidats' };
  const apres = appliquerRayonChoisi(avant, 'ebay', { chemin: ['C', 'D'] });
  dit(apres.ebayCategoryId === undefined, 'l\'identifiant périmé est retiré, pas conservé');
  dit(JSON.stringify(apres.ebayCategoryPath) === JSON.stringify(['C', 'D']), 'le chemin choisi est bien posé');
}

// ── 3. SANS CHOIX, RIEN NE BOUGE — à l'octet près ────────────────────────
console.log('\n3. Sans choix, la surcouche est transparente\n');
{
  const pf = { categoryPath: ['Femmes', 'Robes'], etat: 'Bon état', colors: ['Bleu'], categorie_incertaine: true };
  const apres = appliquerRayonChoisi(pf, 'vinted', null);
  dit(JSON.stringify(apres) === JSON.stringify(pf), 'aucun champ modifié quand personne n\'a choisi');
  dit(apres.categorie_incertaine === true, 'le drapeau « incertain » d\'un rayon DEVINÉ est conservé');
}

// ── 4. LE SCÉNARIO DE NICO, REJOUÉ ENTIER ────────────────────────────────
// « la personne corrige le rayon → elle retouche son titre → l'empreinte ne
//   colle plus → le calcul repart → il repose le rayon automatique ».
console.log('\n4. Le scénario du danger, rejoué de bout en bout\n');
{
  const plateformes = ['vinted', 'leboncoin'];
  // La résolution, à chaque fois qu'elle tourne, repose SON rayon deviné.
  const resoudre = () => ({
    vinted: { categoryPath: ['Consoles', 'Consoles'], categorie_source: 'mot_objet_arbre', categorie_incertaine: true },
    leboncoin: { lbcCategoryPath: ['Consoles & Jeux vidéo', 'Consoles'], categorie_source: 'mot_objet_arbre' },
  });
  // La personne choisit « Jeux », sur les deux plateformes.
  let edited = {
    vinted: { title: 'Bravely Default II Switch', platform_fields: {}, rayon_choisi: { chemin: ['Jeux vidéo', 'Jeux'], id: null } },
    leboncoin: { title: 'Bravely Default II Switch', platform_fields: {}, rayon_choisi: { chemin: ['Consoles & Jeux vidéo', 'Jeux vidéo'], id: null } },
  };
  const rayons = () => {
    const champs = champsAvecRayonsChoisis(resoudre(), edited, plateformes);
    return plateformes.map(p => libelleRayon(rayonDuChamp(champs[p], p, edited[p].rayon_choisi).chemin));
  };
  dit(JSON.stringify(rayons()) === JSON.stringify(['Jeux', 'Jeux vidéo']), 'juste après le choix : le rayon est celui de la personne');

  // Elle retouche le titre. L'empreinte ne colle plus → la résolution repart.
  edited = { ...edited, vinted: { ...edited.vinted, title: 'Bravely Default 2 Nintendo Switch NEUF' } };
  dit(JSON.stringify(rayons()) === JSON.stringify(['Jeux', 'Jeux vidéo']), 'après un titre retouché ET un recalcul : le rayon tient');

  // Elle retouche la description, décoche/recoche, revient, republie…
  for (let i = 0; i < 25; i++) {
    edited = { ...edited, leboncoin: { ...edited.leboncoin, description: `essai ${i}` } };
    if (JSON.stringify(rayons()) !== JSON.stringify(['Jeux', 'Jeux vidéo'])) { dit(false, `perdu au tour ${i}`); break; }
  }
  dit(JSON.stringify(rayons()) === JSON.stringify(['Jeux', 'Jeux vidéo']), '25 recalculs d\'affilée : le rayon tient toujours');

  // Elle change d'avis : SEUL un nouveau choix remplace le premier.
  edited = { ...edited, vinted: { ...edited.vinted, rayon_choisi: { chemin: ['Consoles', 'Consoles'], id: null } } };
  dit(rayons()[0] === 'Consoles', 'un nouveau choix, lui, remplace bien le précédent');

  // Elle l'annule : on retombe sur le rayon deviné, pas sur un trou.
  edited = { ...edited, vinted: { ...edited.vinted, rayon_choisi: null } };
  dit(rayons()[0] === 'Consoles', 'choix annulé : on retombe sur le rayon deviné (jamais rien)');
}

// ── 5. LA CLÉ DU CATALOGUE DE CHAMPS ─────────────────────────────────────
console.log('\n5. La clé qui relie un rayon à ses champs\n');
dit(cleCategorie(['Mode', 'Vêtements']) === 'Mode > Vêtements', 'le chemin devient la clé du catalogue');
dit(cleCategorie([]) === null && cleCategorie(null) === null, 'un rayon absent ne fabrique pas de clé');
dit(libelleRayon(['Femmes', 'Vêtements', 'Jupes']) === 'Jupes', 'on affiche la feuille, pas tout le chemin');

// ── 6. QUAND L'APP A LE DROIT DE DEMANDER ────────────────────────────────
console.log('\n6. La règle des questions : obligatoire ET inconnu ET posable\n');
{
  const pf = { etat: 'Très bon état', univers: 'Femme', marque: 'Camaïeu' };
  const lignes = [
    { field_key: 'condition', field_label: 'État', required: true, allowed_values: ['Neuf', 'Très bon état'] },
    { field_key: 'clothing_type', field_label: 'Univers', required: true, allowed_values: ['Femme', 'Homme'] },
    { field_key: 'estimated_parcel_weight', field_label: 'Poids du colis', required: true, allowed_values: ['Jusqu’à 100 g'] },
    { field_key: 'shipping_cost', field_label: 'Frais de livraison', required: false, allowed_values: null },
    { field_key: 'title', field_label: 'Titre', required: true, allowed_values: null },
    { field_key: 'package_size', field_label: 'package_size', required: true, allowed_values: null },
  ];
  const { questions, connus } = classerChamps(lignes, pf, 'leboncoin');
  const libQ = questions.map((q) => q.libelle);
  dit(libQ.includes('Poids du colis'), 'obligatoire et inconnu → on demande (Poids du colis)');
  dit(!libQ.includes('État') && !libQ.includes('Univers'), 'obligatoire mais DÉJÀ REMPLI → on ne demande pas');
  dit(!libQ.includes('Frais de livraison'), 'facultatif et inconnu → ni demandé, ni affiché');
  dit(!libQ.includes('Titre'), 'le contenu de l\'annonce n\'est jamais une question');
  dit(!libQ.includes('package_size'), 'un libellé jamais traduit n\'est jamais une question');
  dit(connus.map((c) => c.libelle).sort((a, b) => a.localeCompare(b, 'fr')).join(',') === 'État,Univers', 'les valeurs déjà connues sont résumées, pas redemandées');
}

// ── 6 bis. LE DOUBLON TROUVÉ EN TESTANT EN VRAI ──────────────────────────
// Robe passée au rayon « Mode > Chaussures » : le catalogue y nomme l'univers
// `shoes_type` (et non `clothing_type`). Sans pont par le LIBELLÉ, « Univers »
// s'affichait DEUX fois — en question ET en déjà-rempli. On demandait une
// valeur qu'on avait sous les yeux.
console.log('\n6 bis. Le doublon « Univers » (trouvé à l\'écran, sur la vraie app)\n');
{
  const pf = { univers: 'Femme', etat: 'Très bon état' };
  const lignes = [
    { field_key: 'shoes_type', field_label: 'Univers', required: true, allowed_values: ['Femme', 'Homme'] },
    { field_key: 'univers', field_label: 'Univers', required: false, allowed_values: ['Femme', 'Homme'] },
    { field_key: 'etat', field_label: 'État', required: false, allowed_values: null },
  ];
  const { questions, connus } = classerChamps(lignes, pf, 'leboncoin');
  dit(!questions.some((q) => q.libelle === 'Univers'), 'on ne demande plus un Univers déjà rempli sous un autre nom');
  dit(connus.filter((c) => c.libelle === 'Univers').length === 1, 'et il n\'apparaît qu\'UNE fois dans le résumé');
  dit(connus.find((c) => c.libelle === 'Univers')?.valeur === 'Femme', 'avec la bonne valeur');
}

// ── 7. LA SURCOUCHE EST BIEN CÂBLÉE AUX DEUX SEULS ENDROITS QUI COMPTENT ──
console.log('\n6. Le câblage — et la preuve que le lot A n\'a pas été touché\n');
const lps = fs.readFileSync('src/components/ListingPreviewScreen.jsx', 'utf8');
dit(/champsAvecRayonsChoisis|appliquerRayonChoisi/.test(lps), 'la surcouche est appliquée dans le stepper');
const resolution = fs.readFileSync('src/utils/resolutionPublication.js', 'utf8');
dit(!/rayon_choisi|choix_humain|appliquerRayonChoisi/.test(resolution),
  'resolutionPublication.js ne connaît RIEN du choix humain — le lot A est intact');
const parcours = fs.readFileSync('src/utils/parcoursLens.js', 'utf8');
dit(!/rayon/.test(parcours), 'parcoursLens.js (lot des bugs d\'état) n\'a pas bougé non plus');

console.log(`\n${echecs === 0 ? '✅ Un rayon choisi par la personne n\'est jamais recalculé.' : `❌ ${echecs} échec(s).`}`);
process.exit(echecs === 0 ? 0 : 1);
