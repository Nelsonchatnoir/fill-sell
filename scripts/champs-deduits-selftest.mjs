// selftest:champs-deduits — lot 3 (18/10, Nico) : un champ que la fiche ou une
// plateforme connaît déjà n'est plus demandé.
//   1. childSizes : le libellé EXACT d'une plateforme (Vinted « 9-12 mois / 74 cm »,
//      Leboncoin « 9 mois / 74 cm », Beebs « 9 mois (67-74 cm) ») est reconnu comme
//      la canonique ; un nombre nu jamais ; la conversion suit la table ;
//   2. le jugement (moteur/listes) traduit une taille enfant vers la grille de la
//      plateforme cible — telle quelle dans la grille, sinon comme avant ;
//      tailleDuJob rend l'écriture de la grille ;
//   3. l'écran Publier : l'âge Beebs de la fiche répond avant la question et part
//      sur le job ; la télémétrie n'ouvre pas une ligne pendant qu'une IA
//      générique est en vol (et ne ferme jamais une ligne déjà ouverte) ;
//   4. la veille : champs_requis_veille (migration + inverse) lue par ops-digest.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const CS = await import(pathToFileURL(path.join(RACINE, 'src/utils/childSizes.js')).href);
const L = await import(pathToFileURL(path.join(RACINE, 'src/publication/moteur/listes.js')).href);

// 1
console.log('1. childSizes : les libellés des plateformes sont reconnus');
ok(CS.parseChildSize('9-12 mois / 74 cm')?.entry?.value === '12 mois', 'Vinted « 9-12 mois / 74 cm » = 12 mois');
ok(CS.parseChildSize('9 mois / 74 cm')?.entry?.value === '9 mois' && CS.parseChildSize('9 mois (67-74 cm)')?.entry?.value === '9 mois', 'Leboncoin et Beebs « 9 mois » = 9 mois');
ok(CS.parseChildSize('12 ans (140-152 cm)')?.entry?.value === '12 ans', 'un libellé porté par deux lignes : la canonique qui l\'ouvre gagne (12 ans, pas 11)');
ok(CS.parseChildSize('24 mois (86-94 cm)')?.entry?.value === '24 mois', 'un libellé porté par deux axes : l\'axe mois d\'abord (24 mois, pas 2 ans)');
ok(CS.parseChildSize('98') === null && CS.parseChildSize('36') === null && CS.parseChildSize('3') === null, 'un nombre nu n\'est JAMAIS reconnu (eBay « 98 » non indexé)');
ok(CS.parseChildSize('M') === null && CS.parseChildSize('Taille unique') === null, 'une taille adulte ou unique n\'est pas une taille enfant');
ok(CS.toPlatformChildSize('9-12 mois / 74 cm', 'beebs') === '12 mois (74-80 cm)' && CS.toPlatformChildSize('9-12 mois / 74 cm', 'leboncoin') === '12 mois / 80 cm'
  && CS.toPlatformChildSize('9-12 mois / 74 cm', 'ebay') === '12 mois' && CS.toPlatformChildSize('9-12 mois / 74 cm', 'vinted') === '9-12 mois / 74 cm', 'la conversion suit la table (jamais un rapprochement par cm)');
ok(CS.toPlatformChildSize('9 mois (67-74 cm)', 'vinted') === '6-9 mois / 68 cm', 'Beebs → Vinted par la table');
ok(CS.lbcChildSizeCategory('9-12 mois / 74 cm') === 'bebe' && CS.lbcChildSizeCategory('12 ans (140-152 cm)') === 'mode', 'le routage Leboncoin (bébé / mode) suit');
ok(CS.toPlatformChildSize('EU 40', 'beebs') === null, 'une pointure sans genre enfant ne bouge pas (comme avant)');

// 2
console.log('2. Le jugement traduit vers la grille de la plateforme');
const GRILLE_BEEBS = ['Prématuré (- de 45 cm)', 'Naissance - 0 mois (45-50 cm)', '1 mois (50-54 cm)', '3 mois (54-60 cm)', '6 mois (60-66 cm)', '9 mois (67-74 cm)', '12 mois (74-80 cm)', '18 mois (80-86 cm)', '24 mois (86-94 cm)', '3 ans (94-102 cm)', '4 ans (102-108 cm)', '5 ans (108-116 cm)', '6 ans (116-123 cm)', '7 ans (123-128 cm)', '8 ans (123-128 cm)', '9 ans (128-132 cm)', '10 ans (128-140 cm)', '12 ans (140-152 cm)', '14 ans (152-164 cm)', '16 ans (164-176 cm)'];
const j = (value, platform = 'beebs', allowedValues = GRILLE_BEEBS, key = 'Taille') => L.jugerValeurContreListe({ platform, key, value, allowedValues });
ok(j('9-12 mois / 74 cm').dans === true && j('9-12 mois / 74 cm').valeurListe === '12 mois (74-80 cm)', 'Vinted « 9-12 mois / 74 cm » contre la grille Beebs bébé : « 12 mois (74-80 cm) », aucune question');
ok(j('9 mois').valeurListe === '9 mois (67-74 cm)' && j('6 ans').valeurListe === '6 ans (116-123 cm)', 'la canonique aussi');
ok(j('18-24 mois / 86 cm').valeurListe === '24 mois (86-94 cm)', 'la réponse que la personne donnait à la main le 14/10 (fiche « 18-24 mois / 86 cm »)');
ok(j('M').dans === false && j('Taille unique').dans === false && j('34 - XS').dans === false, 'hors grille : la question reste (comme avant)');
ok(j('40', 'beebs', ['38', '40', '42']).valeurListe === '40', 'une taille adulte exacte : inchangé');
const GRILLE_VINTED = ['Prématuré, jusqu\'à 44cm', 'Naissance / 44 cm', '1-3 mois / 56 cm', '3-6 mois / 62 cm', '6-9 mois / 68 cm', '9-12 mois / 74 cm', '12-18 mois / 80 cm'];
ok(j('9 mois (67-74 cm)', 'vinted', GRILLE_VINTED, 'size').valeurListe === '6-9 mois / 68 cm' && j('12 mois / 80 cm', 'vinted', GRILLE_VINTED, 'size').valeurListe === '9-12 mois / 74 cm', 'dans l\'autre sens (Beebs, Leboncoin → grille Vinted)');
ok(L.tailleDuJob({ platform: 'beebs', taille: '9-12 mois / 74 cm', lignes: [{ key: 'Taille', allowedValues: GRILLE_BEEBS }] }) === '12 mois (74-80 cm)'
  && L.tailleDuJob({ platform: 'beebs', taille: '9 mois (67-74 cm)', lignes: [{ key: 'Taille', allowedValues: GRILLE_BEEBS }] }) === null, 'le job porte l\'écriture de la grille (rien à changer quand elle y est déjà)');

// 3
console.log('3. L\'écran Publier');
const LPS = lire('src/components/ListingPreviewScreen.jsx');
ok(/const ageDitSurLaFiche = \(\) => \{/.test(LPS) && /if \(key === "Âge"\) return pf\.age \|\| ageDitSurLaFiche\(\);/.test(LPS), 'l\'âge Beebs de la fiche répond avant la question');
ok(/const ageFiche = ageDitSurLaFiche\(\);/.test(LPS) && /r\.platform === "beebs" && !String\(r\.platform_fields\?\.age \?\? ""\)\.trim\(\)/.test(LPS) && /platform_fields: \{ \.\.\.r\.platform_fields, age: ageFiche \}/.test(LPS), 'et part sur le job Beebs qui n\'en a pas');
const decl = LPS.indexOf('const [iaGeneriqueEnVol, setIaGeneriqueEnVol] = useState(0);');
const retenue = LPS.indexOf('const iaGeneriqueRetenue = iaGeneriqueEnVol > 0;');
ok(decl > 0 && retenue > decl && LPS.indexOf('const [iaGeneriqueEnVol, setIaGeneriqueEnVol]', decl + 10) === -1, 'iaGeneriqueEnVol déclaré UNE fois, avant la télémétrie qui le lit');
// (18/10 nuit) La même garde porte aussi l'attente de la mémoire « compte × catégorie » (memoireRetenue) :
// l'IA en vol retient toujours une ligne NOUVELLE, jamais une ligne déjà ouverte.
ok(/if \((?:iaGeneriqueRetenue|\(iaGeneriqueRetenue \|\| memoireRetenue\)) && !champBloquantVus\.current\[k\]\) continue;\n\s+actifs\.add\(k\);/.test(LPS), 'une IA générique en vol n\'ouvre pas de ligne « affiche » — et ne ferme jamais une ligne ouverte');
ok(/missingSharedFieldsDetailed, couleurEnAttente, iaGeneriqueEnVol(?:, memoireCat)?\]\); \/\/ eslint-disable-line react-hooks\/exhaustive-deps/.test(LPS), 'la télémétrie se rejoue quand l\'IA a fini');
const LST = lire('src/publication/moteur/listes.js');
// (18/10, zéro friction) La tranche Vinted passe d'abord par le texte du vendeur (tailleEnfantSelonLeTexte).
ok(/import \{ toPlatformChildSize, tailleEnfantSelonLeTexte \} from "\.\.\/\.\.\/utils\/childSizes\.js";/.test(LST) && /const enfant = toPlatformChildSize\(\(textes && tailleEnfantSelonLeTexte\(v, textes\)\) \|\| v, platform\);/.test(LST) && LST.indexOf('const enfant = toPlatformChildSize') < LST.indexOf('const t = tailleDansGrille(v, vals'), 'le moteur traduit AVANT le vocabulaire des tailles, et seulement vers une valeur de la grille');

// 4
console.log('4. La veille des champs obligatoires');
const MIG = 'supabase/migrations/20261018020000_champs_requis_veille.sql';
ok(existsSync(path.join(RACINE, MIG)) && existsSync(path.join(RACINE, 'supabase/rollbacks/20261018020000_champs_requis_veille.sql')), 'migration et inverse présentes');
const M = lire(MIG);
ok(/CREATE OR REPLACE FUNCTION public\.champs_requis_veille\(p_jours integer DEFAULT 7, p_limite integer DEFAULT 12\)/.test(M) && /STABLE SECURITY DEFINER/.test(M)
  && /REVOKE ALL ON FUNCTION public\.champs_requis_veille\(integer, integer\) FROM PUBLIC, anon, authenticated;/.test(M) && /GRANT EXECUTE ON FUNCTION public\.champs_requis_veille\(integer, integer\) TO service_role;/.test(M), 'lecture seule, service_role seulement');
ok(/r\.rayon_depuis < now\(\) - make_interval\(days => p_jours\)/.test(M) && /a\.platform <> 'opla'/.test(M), 'un champ nouveau = sur un rayon connu d\'avant, jamais Opla');
ok(/feature = 'champ_requis_bloquant'/.test(M) && /'total_affiches_avant'/.test(M), 'les questions posées, deux fenêtres (avant / après)');
const OD = lire('supabase/functions/ops-digest/index.ts');
ok(/supabase\.rpc\("champs_requis_veille"\)/.test(OD) && /champs_requis: champsNouveaux\.length \+ champsEnHausse\.length,/.test(OD) && /· champs \$\{counts\.champs_requis\} ·/.test(OD), 'ops-digest : section, compteur, objet du mail');
ok(/catch \(e\) \{\n\s+console\.warn\("\[ops-digest\] champs_requis_veille illisible :"/.test(OD), 'illisible → section absente, jamais une panne du digest');

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
