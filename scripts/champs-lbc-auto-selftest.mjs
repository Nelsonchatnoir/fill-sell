// ═══════════════════════════════════════════════════════════════════════════
// LES CHAMPS OBLIGATOIRES DE LEBONCOIN SE REMPLISSENT SEULS — `npm run selftest:champs-lbc-auto`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A10, Louis 11/10 19:10-20:00 : « Univers » à la main sur 13
// vêtements, « Produit »/« Type » sur électroménager et déco, un abandon).
// Règle : src/publication/moteur/champsLbcAuto.js, branchée dans
// ListingPreviewScreen (statut des requis + seconde passe IA).
//   1. l'Univers que la FICHE dit (genre, racine Vinted, taille enfant, titre),
//      toutes sources d'accord, dans LA liste — les 13 vêtements de Louis ;
//   2. jamais deviné : des sources qui se contredisent, ou une valeur hors
//      liste = rien (la suite décide) ;
//   3. la seconde passe IA : champs à liste vides OU hors liste, jamais la
//      taille/marque/couleur/matière/état ; une demande par (catégorie, champ,
//      liste) ; réponse contrôlée (une entrée de LA liste) ;
//   4. Maison & Jardin : UNE demande sur les paires « Type › Produit » ;
//   5. le câblage dans le stepper (et donc le lot).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const M = await import(pathToFileURL(join(RACINE, 'src/publication/moteur/champsLbcAuto.js')).href);
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };
const VETEMENTS = ['Femme', 'Maternité', 'Homme', 'Enfant'];

console.log('1. L’Univers que la fiche dit — les 13 vêtements de Louis');
const louis = [
  ['Coupe vent kiabi 8 ans', ['Enfants', 'Vêtements pour filles', "Vêtements d'extérieur", 'Vestes', 'Vestes coupe-vent'], '8 ans / 128 cm'],
  ['Jean kiabi 8 ans', ['Enfants', 'Vêtements pour filles', 'Pantalons et shorts', 'Jeans'], '8 ans / 128 cm'],
  ['Jupe Looney Tunes 10 ans', ['Enfants', 'Vêtements pour filles', 'Jupes'], '10 ans / 140 cm'],
  ['T.shirt manches courtes 9 ans', ['Enfants', 'Vêtements pour filles', 'Chemises et t-shirts', 'T-shirts'], '9 ans / 134 cm'],
  ['Maillot de bain 1 pièce nabaiji 10 ans', ['Enfants', 'Vêtements pour filles', 'Équipements de natation', 'Maillot de bain 1 pièce'], '10 ans / 140 cm'],
];
for (const [titre, cheminVinted, taille] of louis) {
  const u = M.universLbcDeLaFiche({ cheminVinted, taille, titre, allowedValues: VETEMENTS });
  verifier(u?.valeur === 'Enfant', `« ${titre} » → Enfant (${u?.source ?? 'rien'})`);
}
verifier(M.universLbcDeLaFiche({ genres: ['Femme'], allowedValues: VETEMENTS })?.valeur === 'Femme', 'genre « Femme » de la fiche → Femme');
verifier(M.universLbcDeLaFiche({ cheminVinted: ['Hommes', 'Vêtements', 'Jeans'], allowedValues: VETEMENTS })?.valeur === 'Homme', 'racine Vinted « Hommes » → Homme');
verifier(M.universLbcDeLaFiche({ genres: ['Fille'], allowedValues: VETEMENTS })?.valeur === 'Enfant', 'Fille / Garçon / Bébé → Enfant (la valeur de la liste)');

console.log('\n2. Jamais deviné');
verifier(M.universLbcDeLaFiche({ genres: ['Femme'], cheminVinted: ['Hommes', 'Vêtements'], allowedValues: VETEMENTS }) === null, 'deux sources qui se contredisent → rien (la question)');
verifier(M.universLbcDeLaFiche({ titre: 'Pull col roulé', allowedValues: VETEMENTS }) === null, 'aucune source → rien');
verifier(M.universLbcDeLaFiche({ taille: '40 M', allowedValues: VETEMENTS }) === null, '« 40 M » n’est pas une taille enfant');
verifier(M.universLbcDeLaFiche({ genres: ['Femme'], allowedValues: ['Éclairage', 'Objet décoratif'] }) === null, 'une valeur hors de LA liste (Univers de la déco) → rien');
verifier(M.universLbcDeLaFiche({ genres: ['Mixte'], allowedValues: VETEMENTS }) === null, '« Mixte » ne se traduit pas → rien');

console.log('\n3. La seconde passe');
const list = [
  { key: 'clothing_type', label: 'Univers', state: 'invalid', value: 'Mixte', allowedValues: VETEMENTS, dedicatedTarget: 'univers' },
  { key: 'clothing_brand', label: 'Marque', state: 'missing', allowedValues: ['Zara', 'H&M'], dedicatedTarget: 'marque' },
  { key: 'clothing_st', label: 'Taille', state: 'missing', allowedValues: ['S', 'M'] },
  { key: 'clothing_color', label: 'Couleur', state: 'missing', allowedValues: ['Rouge', 'Bleu'] },
  { key: 'clothing_material', label: 'Matière', state: 'missing', allowedValues: ['Coton', 'Laine'] },
  { key: 'x_ok', label: 'Déjà bon', state: 'ok', value: 'A', allowedValues: ['A', 'B'] },
  { key: 'x_deduit', label: 'Déduit', state: 'missing', allowedValues: ['A', 'B'], deduit: { valeur: 'A' } },
];
const sp = M.champsLbcSecondePasse(list, { categorie: 'Mode > Vêtements' });
verifier(sp.simples.map((s) => s.key).join() === 'clothing_type', 'seuls les champs à trancher (vides ou hors liste) — jamais marque, taille, couleur, matière, ni un déjà-bon ou déjà-déduit', sp.simples.map((s) => s.key).join());
const deja = new Set(sp.simples.map((s) => s.cle));
verifier(M.champsLbcSecondePasse(list, { categorie: 'Mode > Vêtements', deja }).simples.length === 0, 'une seule demande par (catégorie, champ, liste)');
verifier(M.champsLbcSecondePasse(list, { categorie: 'Mode > Vêtements', touchesParLaPersonne: new Set(['clothing_type']) }).simples.length === 0, 'un champ touché par la personne n’est jamais repris');
verifier(M.reponseDansLaListe('enfant', VETEMENTS) === 'Enfant' && M.reponseDansLaListe('Fille', VETEMENTS) === null && M.reponseDansLaListe('null', VETEMENTS) === null, 'réponse contrôlée : une entrée de LA liste (casse ignorée), sinon rien');

console.log('\n4. Maison & Jardin : les paires');
const deco = M.pairesMaisonJardin('Maison & Jardin > Décoration');
verifier(deco?.typeKey === 'house_and_garden_type' && deco.produitKey === 'decoration_type' && deco.paires.length > 20, 'Décoration : paires « Univers › Produit » (house_and_garden_type, decoration_type)');
verifier(/^Autre/.test(deco.paires[deco.paires.length - 1].type), 'les fourre-tout (« Autre ») en dernier');
const listeDeco = [
  { key: 'house_and_garden_type', label: 'Univers', state: 'missing', allowedValues: ['Éclairage', 'Objet décoratif'] },
  { key: 'decoration_type', label: 'Produit', state: 'missing', allowedValues: [] },
];
const spd = M.champsLbcSecondePasse(listeDeco, { categorie: 'Maison & Jardin > Décoration' });
verifier(spd.paire && spd.simples.length === 0 && spd.paire.options.includes('Objet décoratif › Horloge, pendule et réveil'), 'Univers + Produit à trancher → UNE demande sur les paires (même Produit sans liste)');
const p = M.paireDeLaReponse('Maison & Jardin > Arts de la table', 'Matériel de cuisine › Moule');
verifier(p?.type === 'Matériel de cuisine' && p.produit === 'Moule' && p.typeKey === 'table_art_type' && p.produitKey === 'table_art_product', '« Matériel de cuisine › Moule » → les deux champs d’Arts de la table');
verifier(M.paireDeLaReponse('Maison & Jardin > Décoration', 'Matériel de cuisine › Moule') === null, 'une paire d’une autre feuille n’est jamais acceptée');
const elec = M.pairesMaisonJardin('Maison & Jardin > Électroménager');
verifier(elec?.paires.some((x) => x.libelle === 'Cuisine et cuisson › Blender'), 'Électroménager : « Type › Produit » (Cuisine et cuisson › Blender)');

console.log('\n5. Le câblage');
const lps = lire('src/components/ListingPreviewScreen.jsx');
verifier(/if \(platform === "leboncoin" && a\.dedicatedTarget === "univers" && a\.state !== "ok"\) \{\s*\n\s*const u = universLbcDeLaFiche\(/.test(lps) && /deduit: \{ valeur: u\.valeur, source: `fiche:\$\{u\.source\}` \}/.test(lps), 'statut des requis : l’Univers de la fiche est posé comme une option déduite (même écriture, même trace)');
verifier(/const \{ simples, paire \} = champsLbcSecondePasse\(list, \{ categorie, deja: lbcSecondePasseFaite\.current/.test(lps) && /if \(!list \|\| !categorie \|\| texteEnVolPar\.current\.has\("leboncoin"\)\) return;/.test(lps), 'seconde passe : après la première, une demande par (catégorie, champ, liste)');
verifier(/objet identifié : \$\{objet\}/.test(lps) && /catégorie Vinted : \$\{cheminVinted\.join\(" > "\)\}/.test(lps) && /genre: src\.platform_fields\?\.genre \|\| v\("genre"\)/.test(lps), 'seconde passe : tout le contexte de la fiche (objet IA, catégorie Vinted, genre, taille, marque)');
verifier(/reponseDansLaListe\(valeurs\[a\.label\], a\.allowedValues\)/.test(lps) && /feature: "lbc_champs_ia"/.test(lps) && /setIaGeneriqueEnVol\(\(n\) => n \+ 1\)/.test(lps), 'réponse contrôlée, mesure lbc_champs_ia, le lot attend la fin de la passe');

console.log('\n5. Un thème n’est pas un objet (« Moules noel », Louis, 11/10 21:51 : parti en Décoration › Rangement)');
const S = await import(pathToFileURL(join(RACINE, 'src/utils/shared.js')).href);
// Rejoue la règle de resolveArticleIconDetail (le composant n'est pas importable ici).
const iconeDe = (titre, aiIcon, aiObjet = '') => {
  const motCle = S.detectObjectKeywordDetail(titre, '');
  const iconeDuMotIa = aiObjet ? S.detectObjectIconKeyword(aiObjet, '') : null;
  const motTheme = motCle?.passe === 1 && /^no[eë]l$/.test(String(motCle.mot ?? ''));
  const iaValide = aiIcon && aiIcon !== '📦' && S.ALL_OBJECT_ICONS.includes(aiIcon) ? aiIcon : null;
  const ecarte = motTheme && (iconeDuMotIa ?? iaValide) != null && (iconeDuMotIa ?? iaValide) !== motCle.icon;
  if (motCle && !ecarte) return motCle.icon;
  return iconeDuMotIa ?? iaValide ?? '📦';
};
verifier(iconeDe('Moules noel', '🍳', 'moule de cuisson') === '🍳', '« Moules noel », l’IA nomme un moule de cuisson (🍳) : 🍳, plus 🎄');
verifier(iconeDe('Boule de noël rouge', '🎄', 'boule de Noël') === '🎄', '« Boule de noël », l’IA dit 🎄 : 🎄 (inchangé)');
verifier(iconeDe('Pull de noël taille M', '🧶') === '🧶', '« Pull de noël » : le mot-objet « pull » décide (inchangé)');
verifier(iconeDe('Déco de noël', null) === '🎄', 'aucune IA : le thème reste le seul signal (inchangé)');
verifier(iconeDe('Crèche de noël', '🏠') === S.detectObjectIconKeyword('Crèche de noël', ''), 'un vrai objet de Noël du titre (crèche) n’est jamais écarté');
verifier(/const motTheme = motCle\?\.passe === 1 && \/\^no\[eë\]l\$\/\.test/.test(lps) && /if \(motCle && !passe2Ecartee && !themeEcarte\) \{/.test(lps), 'resolveArticleIconDetail porte la règle (le seul mot écarté : « noël »)');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
