// selftest:lot-2410-tailles — (24/10, point 1) Les tailles de jean W/L et les trois sujets du 22/10.
//   1. « 33/34 », « 33x34 », « 33 US », « 33W » se lisent W33 dans un BAS seulement ; « 32/34 » reste un doute
//      (fourchette FR possible) sauf si le texte écrit lui-même « W32 » ; hors d'un bas, une chaussure, une date,
//      un prix : jamais.
//   2. Le rapprochement « par mots » de l'app ne transforme plus jamais un tour de taille en nombre nu (Johan :
//      « 33/34 » → « 34 » sur Leboncoin et Depop).
//   3. Le W sur la grille Depop des bas (62 homme, 24 femme) : le même nombre, de 24 à 40 (homme) / 34 (femme).
//   4. L'âge en années lu dans le texte, en rayon ENFANT seulement ; jamais une durée, jamais une tranche.
//   5. Beebs « neuf seulement » ; rayon adulte / taille enfant (et l'inverse) : la carte dit de changer de rayon.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const T = await imp('supabase/functions/_shared/taille-du-texte.js');
const L = await imp('src/publication/moteur/listes.js');
const D = await imp('src/utils/depopPublication.js');
let n = 0;
const ok = (cond, msg, detail = '') => { assert.ok(cond, `${msg}${detail ? ` — ${detail}` : ''}`); n++; console.log(`  ✓ ${msg}`); };

const VINTED_H = ['W23 | FR 32', 'W24 | FR 34', 'W25 | FR 34', 'W26 | FR 36', 'W27 | FR 36', 'W28 | FR 38', 'W29 | FR 38', 'W30 | FR 40', 'W31 | FR 40',
  'W32 | FR 42', 'W33 | FR 42', 'W34 | FR 44', 'W35 | FR 44', 'W36 | FR 46', 'W38 | FR 48', 'W40 | FR 50'];
const BEEBS_H = ['32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', 'XS', 'S', 'M', 'L', 'XL'];
const EBAY_JEAN = ['40', '42', '44', '46', '48', 'XS', 'S', 'M', 'L', 'XL', 'Taille unique'];
const CH_V = ['Hommes', 'Vêtements', 'Jeans', 'Jeans coupe droite'];
const CH_B = 'Mode > Homme > Vêtements (homme) > Jeans (homme) > Jeans coupe droite (homme)';
const JOHAN = "Jean Levi's 501 bleu délavé taille 33/34";
const v = (p) => T.tailleDuTexte(p)?.valeur ?? null;
const d = (p) => T.tailleDuTexte(p)?.doute ?? null;

console.log('1. Le jean de Johan (fiche 1792769972063, 23/10)');
ok(v({ textes: [JOHAN], grille: VINTED_H, chemin: CH_V }) === 'W33 | FR 42', 'Vinted : « 33/34 » au titre → « W33 | FR 42 », aucune question');
ok(v({ textes: [JOHAN], grille: BEEBS_H, chemin: CH_B }) === '42', 'Beebs : → « 42 » (W33 = FR 42, table publiée par Vinted)');
ok(v({ valeur: '33/34', textes: ["Jean Levi's 501"], grille: BEEBS_H, chemin: CH_B }) === '42', 'Beebs : copie « 33/34 » → « 42 »');
ok(L.tailleDansListeEbay('33/34', EBAY_JEAN, { textes: [JOHAN] }) === '42', 'eBay : « 33/34 » → « 42 »');
ok(L.tailleDuJob({ platform: 'beebs', taille: '33/34', lignes: [{ key: 'Taille', allowedValues: BEEBS_H }], textes: [JOHAN], cheminCategorie: CH_B.split(' > ') }) === '42', 'job Beebs : part avec « 42 »');
ok(L.tailleDuJob({ platform: 'vinted', taille: '33/34', lignes: [{ key: 'size', allowedValues: VINTED_H }], textes: [JOHAN], cheminCategorie: CH_V }) === 'W33 | FR 42', 'job Vinted : part avec « W33 | FR 42 »');

console.log('2. Les autres écritures d\'un jean');
ok(v({ textes: ['Jean Levi\'s taille US 33'], grille: VINTED_H, chemin: CH_V }) === 'W33 | FR 42', '« US 33 » → W33');
ok(v({ textes: ['Jean 33 US'], grille: BEEBS_H, chemin: CH_B }) === '42', '« 33 US » → 42');
ok(v({ textes: ['Jean 33x32'], grille: VINTED_H, chemin: CH_V }) === 'W33 | FR 42' && v({ textes: ['Jean 33 x 32'], grille: BEEBS_H, chemin: CH_B }) === '42', '« 33x32 », « 33 x 32 » → W33');
ok(v({ textes: ["Levi's 33W 32L"], grille: VINTED_H, chemin: CH_V }) === 'W33 | FR 42', '« 33W 32L » → W33');
ok(v({ textes: ['Jean 34/34'], grille: BEEBS_H, chemin: CH_B }) === '44', '« 34/34 » (pas une fourchette) → W34 = 44');
ok(v({ textes: ['Jean W30/L32'], grille: BEEBS_H, chemin: CH_B }) === '40', '« W30/L32 » inchangé → 40');
ok(v({ textes: ['Jean W36 L34 (46)'], grille: BEEBS_H, chemin: CH_B }) === '46', '« W36 L34 (46) » inchangé → 46');

console.log('3. Le doute ne se tranche pas');
ok(d({ textes: ['Jean 32/34'], grille: VINTED_H, chemin: CH_V }) !== null, '« 32/34 » : W32 L34 ou fourchette FR 32-34 → la question reste');
ok(v({ textes: ['Jean W32 L34 taille 32/34'], grille: VINTED_H, chemin: CH_V }) === 'W32 | FR 42', '« 32/34 » avec « W32 » écrit → W32');
ok(d({ textes: ['Jean W33 taille 36/34'], grille: BEEBS_H, chemin: CH_B }) !== null, 'deux tours de taille (W33 et 36/34) → doute');
ok(d({ textes: ['Jean 37/32'], grille: BEEBS_H, chemin: CH_B }) !== null, 'W37 hors de la table publiée → doute');
ok(v({ textes: ['Jean taille 38'], grille: BEEBS_H, chemin: CH_B }) === null, 'un nombre nu (« taille 38 ») n\'est toujours jamais lu');
ok(v({ textes: ['T-shirt Nike 33/34'], grille: BEEBS_H, chemin: 'Mode > Homme > T-shirts' }) === null, 'hors d\'un bas : « 33/34 » n\'est pas lu');
ok(v({ textes: ['Baskets enfant 33/34'], grille: ['33', '34'], chemin: 'Mode > Enfant > Chaussures' }) === null, 'chaussures : jamais');
ok(v({ textes: ['Jean 33/34 €'], grille: BEEBS_H, chemin: CH_B }) === null && v({ textes: ['Jean 33/34cm'], grille: BEEBS_H, chemin: CH_B }) === null, 'un prix ou une mesure : jamais');
ok(d({ textes: ['Jean, envoi du 28/30 octobre'], grille: BEEBS_H, chemin: CH_B }) !== null, 'une date « 28/30 » dans un jean : doute (la question reste), jamais une taille');
ok(v({ textes: ['Jean taille US 8'], grille: BEEBS_H, chemin: CH_B }) === null, '« US 8 » (taille US femme) : jamais lu');
ok(T.tailleDuTexte({ valeur: 'W34 | FR 44', textes: [JOHAN], grille: BEEBS_H, chemin: CH_B }) === null, 'la réponse de Johan « W34 | FR 44 » n\'est jamais recouverte par le titre');

console.log('4. Le rapprochement « par mots » de l\'app ne fabrique plus « 34 »');
const ecran = lire('src/components/ListingPreviewScreen.jsx');
ok(ecran.includes('import { lireTourDeTaille } from "../../supabase/functions/_shared/taille-de-service.js";')
  && /if \(sizeField && PURE_NUMBER_RE\.test\(n\)\) return "";\n\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(sizeField && lireTourDeTaille\(raw\)\) return "";/.test(ecran),
  'findMatchingOption : un tour de taille ou une fourchette ne se rapproche jamais par mots');
const S = await imp('supabase/functions/_shared/taille-de-service.js');
ok(S.lireTourDeTaille('33/34')?.w === 33 && S.lireTourDeTaille('33 / 34')?.w === 33 && S.lireTourDeTaille('34/36')?.ambigu === true && S.lireTourDeTaille('W33 L34')?.w === 33,
  'la garde reconnaît « 33/34 », « 33 / 34 », « W33 L34 » et la fourchette « 34/36 »');

console.log('5. Le W sur la grille Depop des bas (sujet du 22/10)');
const H = ['menswear', 'bottoms', 'jeans'], F = ['womenswear', 'bottoms', 'jeans'];
ok(D.tailleDepop('33/34', H) === '33' && D.tailleDepop('W33', H) === '33' && D.tailleDepop('W33 L34', H) === '33', 'homme : W33 → « 33 » (même nombre, même système)');
ok(D.tailleDepop('W34 | FR 44', H) === '34', 'la réponse Vinted « W34 | FR 44 » → « 34 »');
ok(D.tailleDepop('W24', H) === '24' && D.tailleDepop('W40', H) === '40', 'bornes homme : 24 et 40');
ok(D.tailleDepop('W42', H) === 'W42' && D.tailleDepop('W23', H) === 'W23', 'W42 (aussi une taille EU) et W23 : rien deviné, le connecteur demande');
ok(D.tailleDepop('W30', F) === '30' && D.tailleDepop('W36', F) === 'W36', 'femme : W30 → « 30 » ; W36 (aussi un EU 36) → demandé');
ok(D.tailleDepop('32/34', H) === '32/34', 'fourchette possible « 32/34 » : jamais tranchée');
ok(D.tailleDepop('42', H) === '42' && D.tailleDepop('M', H) === 'M', 'une taille non W : inchangée (comme avant)');
ok(D.tailleDepop('33/34', ['menswear', 'tops', 't-shirts']) === '33/34', 'hors des bas : inchangé');
const grilles = JSON.parse(lire('docs/plateformes/depop/tailles.json')).grilles;
const g62 = Object.values(grilles).find((g) => g.id === 62), g24 = Object.values(grilles).find((g) => g.id === 24);
const lib62 = g62.tailles.map((t) => t.libelle), lib24 = g24.tailles.map((t) => t.libelle);
ok([...Array(17)].every((_, i) => lib62.includes(String(24 + i))) && !lib62.includes('41'), 'grille 62 (relevée) : 24 … 40 tous présents, puis l\'EU pair (pas de 41)');
ok([...Array(11)].every((_, i) => lib24.includes(String(24 + i))) && !lib24.includes('35'), 'grille 24 (relevée) : 24 … 34 tous présents, puis l\'EU pair (pas de 35)');

console.log('6. L\'âge en années, en rayon enfant seulement (sujet du 22/10)');
const BEEBS_E = ['6 ans (110-116 cm)', '8 ans (122-128 cm)', '10 ans (134-140 cm)'];
const CH_E = 'Mode > Enfant > Fille > Pulls (fille)';
ok(v({ textes: ['Pull Kiabi 8 ans'], grille: BEEBS_E, chemin: CH_E }) === '8 ans (122-128 cm)', 'rayon enfant : « 8 ans » → « 8 ans (122-128 cm) »');
ok(v({ textes: ['Pull porté 2 ans, taille 8 ans'], grille: BEEBS_E, chemin: CH_E }) === '8 ans (122-128 cm)', '« porté 2 ans » est une durée : seul « 8 ans » est lu');
ok(d({ textes: ['Robe 3-4 ans'], grille: BEEBS_E, chemin: CH_E }) !== null && d({ textes: ['Robe 6/8 ans'], grille: BEEBS_E, chemin: CH_E }) !== null, 'tranche « 3-4 ans », « 6/8 ans » → doute');
ok(v({ textes: ['Doudoune 2 ans de garantie'], grille: ['2 ans (86-92 cm)'], chemin: CH_E }) === null && v({ textes: ['Manteau garantie 2 ans'], grille: ['2 ans (86-92 cm)'], chemin: CH_E }) === null, 'une garantie : jamais');
ok(v({ textes: ['Pantalon porté 3 ans'], grille: BEEBS_H, chemin: CH_B }) === null && v({ textes: ['Pantalon 3 ans'], grille: ['3 ans'] }) === null, 'hors d\'un rayon enfant : jamais (le chemin seul décide)');
ok(d({ textes: ['Pull 8 ans 24 mois'], grille: BEEBS_E, chemin: CH_E }) !== null && d({ textes: ['Pull 8 ans et 10 ans'], grille: BEEBS_E, chemin: CH_E }) !== null, 'mois et années, ou deux âges → doute');
ok(v({ valeur: '8 ans', textes: ['Pull'], grille: BEEBS_E, chemin: CH_E }) === '8 ans (122-128 cm)', 'copie « 8 ans » → l\'option de la grille');

console.log('7. Beebs « neuf seulement » et le public du rayon (sujet du 22/10)');
const NEUF_B = ['Neuf, avec étiquette', 'Neuf, sans étiquette'];
ok(L.rayonNeufSeulement({ platform: 'beebs', key: 'État', value: 'Bon état', allowedValues: NEUF_B }), 'Beebs : article d\'occasion dans un rayon neuf seulement → la carte le dit');
ok(/Ce rayon Beebs n'accepte que des articles neufs/.test(L.messageRayonNeuf({ valeur: 'Bon état', platform: 'beebs' })), 'le message nomme Beebs');
ok(JSON.stringify(L.rayonPublicIncoherent({ platform: 'beebs', chemin: 'Mode > Femme > Shorts (femme)', valeur: '10 ans' })) === '{"rayon":"adulte","article":"enfant"}', 'Louis : « 10 ans » en rayon femme → incohérent');
ok(JSON.stringify(L.rayonPublicIncoherent({ platform: 'beebs', chemin: 'Mode > Enfant > Garçon > Jeans (garçon)', valeur: 'W33' })) === '{"rayon":"enfant","article":"adulte"}', '« W33 » en rayon enfant → incohérent');
ok(L.rayonPublicIncoherent({ platform: 'beebs', chemin: 'Mode > Enfant > Fille > Shorts (fille)', valeur: '10 ans' }) === null
  && L.rayonPublicIncoherent({ platform: 'vinted', chemin: CH_V, valeur: 'W33 | FR 42' }) === null
  && L.rayonPublicIncoherent({ platform: 'beebs', chemin: CH_B, valeur: '42' }) === null, 'cohérent, ou taille sans public (« 42 ») → rien');
ok(L.rayonPublicIncoherent({ platform: 'leboncoin', chemin: 'Mode > Femme', valeur: '10 ans' }) === null, 'Beebs et Vinted seulement');
ok(/Choisis un rayon enfant avec « Changer »/.test(L.messageRayonPublic({ valeur: '10 ans', platform: 'beebs', rayon: 'adulte', article: 'enfant' })), 'le message dit de changer de rayon');
ok(ecran.includes('rayonEnCause: true, blocking: true,') && ecran.includes('messageRayonPublic({ valeur: src, platform, ...inc }'), 'écran : la ligne de taille devient une question de rayon');
ok(lire('src/publication/BlocQuestions.jsx').includes('if (a.neufSeulement || a.rayonEnCause) return ('), 'les questions : rayon en cause rendu comme « neuf seulement »');
ok(lire('src/publication/moteur/regles.js').includes('!a.neufSeulement && !a.rayonEnCause'), 'jamais dans la question de taille partagée');
ok(lire('src/publication/lot/LotPublication.jsx').includes('!a.neufSeulement && !a.rayonEnCause'), 'jamais dans les réponses communes du lot');
ok(lire('src/utils/champsDuRayon.js').includes("motif: 'rayon_public'") && lire('src/components/CarteRayon.jsx').includes("l.motif === 'rayon_public'"), 'la carte du rayon le dit');

console.log(`\n✓ lot-2410-tailles : ${n} contrôles verts`);
