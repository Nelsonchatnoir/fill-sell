// Autotest du vocabulaire des tailles (_shared/tailles.js).
// Bâti sur les cas RÉELS relevés en base le 18/09, et sur les refus qui
// doivent le rester. `node scripts/tailles-selftest.mjs`
import { tailleDansGrille, memeTaille, diagnosticTaille, libelleTaille, candidatsTaille } from '../supabase/functions/_shared/tailles.js'

// Grilles Opla réelles (docs/opla/grilles-tailles.tsv)
const G1 = ['TAILLE_UNIQUE','XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL','6XL','7XL','8XL']
const G2 = ['0M','0-3M','1M','3M','3-6M','6M','9M','6-12M','12M','12-18M','18M','18-24M','24M','36M',
            '2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','11Y','12Y','13Y','14Y','15Y','16Y']
const G3 = Array.from({ length: 37 }, (_, i) => String(14 + i))
const G4 = ['TAILLE_UNIQUE','XS','S','M','L','XL','XXL','75A','80A','85A','90A','85G','90G','115G']
// Grille Vinted réelle, étiquettes composites (platform_category_aspects)
const VINTED_ENFANT = ['Prématuré, jusqu\'à 44cm','Naissance / 44 cm','1-3 mois / 56 cm',
  '3-6 mois / 62 cm','6-9 mois / 68 cm','12-18 mois / 80 cm','3 ans / 98 cm','12 ans / 152 cm']
const VINTED_FEMME = ['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL','6XL']
const VINTED_COMBINE = ['XS / 34 / 6','S / 36 / 8','M / 38 / 10','L / 40 / 12','XL / 42 / 14']
const EBAY_LETTRES = ['3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL']

let ko = 0
const doitDonner = (brut, grille, attendu, note = '') => {
  const r = tailleDansGrille(brut, grille)
  const eu = r ? r.valeur : null
  const ok = eu === attendu
  if (!ok) ko++
  console.log(`${ok ? '  ok  ' : '  KO  '} « ${brut} » → ${eu === null ? 'REFUS' : `« ${eu} »`}` +
              `${ok ? '' : `   ATTENDU ${attendu === null ? 'REFUS' : `« ${attendu} »`}`}` +
              `${note ? `   (${note})` : ''}${r && ok && attendu ? `   [${r.motif}]` : ''}`)
}

console.log('\n── CE QUI DOIT PASSER — même taille, autre orthographe ──────────────')
doitDonner('12 ans', G2, '12Y', 'Ornella, Opla JOGGINGS_GIRLS_NEW — le cas du soir')
doitDonner('12 ANS', G2, '12Y')
doitDonner('12A', G2, '12Y')
doitDonner('12 Y', G2, '12Y')
doitDonner('18 mois', G2, '18M')
doitDonner('0-3 mois', G2, '0-3M')
doitDonner('0 / 3 mois', G2, '0-3M', 'intervalle écrit avec une barre')
doitDonner('12-18 MOIS', G2, '12-18M')
doitDonner('2 ans', G2, '2Y')
doitDonner('44,5', ['44','44.5','45'], '44.5', 'virgule décimale')
doitDonner('44.0', G3, '44')
doitDonner('Taille unique', G1, 'TAILLE_UNIQUE')
doitDonner('taille-unique', G1, 'TAILLE_UNIQUE')
doitDonner('One size', G1, 'TAILLE_UNIQUE')
doitDonner('TU', G1, 'TAILLE_UNIQUE')
doitDonner('Medium', G1, 'M')
doitDonner('85 G', G4, '85G', 'soutien-gorge, dossier Olivier')
doitDonner('XXL', EBAY_LETTRES, '2XL', 'eBay écrit 2XL et jamais XXL')
doitDonner('2XL', G1, 'XXL', 'et réciproquement')
doitDonner('12 ans / 152 cm', G2, '12Y', 'étiquette composite de l\'article → grille Opla')
doitDonner('M / 38 / 10', G1, 'M', 'composite Vinted → grille en lettres')
doitDonner('12 ans', VINTED_ENFANT, '12 ans / 152 cm', 'article simple → grille composite Vinted')
doitDonner('38', VINTED_COMBINE, 'M / 38 / 10', 'le chiffre trouve la ligne de la table Vinted')
doitDonner('M', VINTED_COMBINE, 'M / 38 / 10')


console.log('\n── TAILLE ENFANT EN CM (27/09, doriane-henri) : l\'étiquette, jamais une conversion ──')
const VINTED_BEBE = ['Naissance / 44 cm','Jusqu\'à 1 mois / 50 cm','1-3 mois / 56 cm','3-6 mois / 62 cm','6-9 mois / 68 cm',
  '9-12 mois / 74 cm','12-18 mois / 80 cm','18-24 mois / 86 cm','2 ans / 92 cm','3 ans / 98 cm']
doitDonner('86', G2, '18M', 'Pantalon Zeeman taille 86 → Opla 18 mois (étiquette FR)')
doitDonner('80', G2, '12M', 'T-shirt Batman taille 80 → 12 mois')
doitDonner('86 cm', G2, '18M')
doitDonner('T86', G2, '18M')
doitDonner('92', G2, '24M', '92 cm = 24 mois (écrit en mois d\'abord)')
doitDonner('92', ['2Y','3Y','4Y'], '2Y', 'même âge, autre écriture, quand la grille n\'a pas 24M')
doitDonner('98', G2, '3Y')
doitDonner('152', G2, '12Y')
doitDonner('86', VINTED_BEBE, '18-24 mois / 86 cm', 'Vinted publie SA table : on la lit')
doitDonner('98', VINTED_BEBE, '3 ans / 98 cm')
doitDonner('86', G3, null, 'grille de pointures : pas une grille d\'âges')
doitDonner('38', G2, null, '38 n\'est pas une stature de la table')
doitDonner('87', G2, null, 'stature hors table : jamais arrondie')
doitDonner('86', ['6M','9M','12M'], null, '18 mois absent de la grille : refus')
for (const [v, att] of [['18M','18 mois'],['0-3M','0-3 mois'],['2Y','2 ans'],['1Y','1 an'],['TAILLE_UNIQUE','Taille unique'],['M','M'],['38','38']]) {
  const eu = libelleTaille(v); const ok = eu === att; if (!ok) ko++
  console.log(`${ok ? '  ok  ' : '  KO  '} libellé « ${v} » → « ${eu} »${ok ? '' : `   ATTENDU « ${att} »`}`)
}
{
  let rate = 0
  for (const v of G2) { const r = tailleDansGrille(libelleTaille(v), G2); if (r?.valeur !== v) { rate++; ko++; console.log(`  KO  aller-retour « ${v} » → « ${libelleTaille(v)} » → ${r?.valeur}`) } }
  if (!rate) console.log('  ok   aller-retour code → libellé français → code, sur toute la grille G2')
}

console.log('\n── CE QUI DOIT ÊTRE REFUSÉ — refuser vaut mieux qu\'approximer ───────')
doitDonner('44.5', G3, null, 'Opla n\'a pas de demi-pointure : refus LÉGITIME (tessy)')
doitDonner('42', VINTED_FEMME, null, 'FR 42 → XL serait une CONVERSION : jamais')
doitDonner('25', EBAY_LETTRES, null, 'W25 → XS serait une conversion : jamais')
doitDonner('2 ans', ['24M','36M'], null, 'mois et années ne se croisent pas (Opla distingue les deux)')
doitDonner('24 mois', ['2Y','3Y'], null, 'réciproque')
doitDonner('Taille unique', VINTED_ENFANT, null, 'aucune taille unique dans une grille d\'âges')
doitDonner('90C', G4, null, 'bonnet absent de cette grille')
doitDonner('', G2, null, 'taille vide')
doitDonner('12 ans', [], null, 'grille vide')
doitDonner('XXL', G3, null, 'une lettre ne devient pas un nombre')

console.log('\n── AMBIGUÏTÉ : on ne tranche pas tout seul ──────────────────────────')
doitDonner('M', ['M / 38 / 10','M / 40 / 12'], null, 'deux lignes portent « M » → refus')
console.log(`  diagnostic « 44.5 » sur G3       : ${diagnosticTaille('44.5', G3)}`)
console.log(`  diagnostic « M » sur deux lignes : ${diagnosticTaille('M', ['M / 38 / 10','M / 40 / 12'])}`)

// ── LES BAS (02/10, point 11 — jeans et chino de Patrick Giry) ─────────────
// Grilles RÉELLES relevées en base le 02/10 (platform_category_aspects,
// ebay_item_aspects) — jamais des grilles imaginées.
const FRW = [[23,32],[24,34],[25,34],[26,36],[27,36],[28,38],[29,38],[30,40],[31,40],[32,42],[33,42],[34,44],[35,44],
  [36,46],[38,48],[40,50],[42,52],[44,54],[46,56],[48,58],[50,60],[52,62],[54,64]].map(([w, f]) => `W${w} | FR ${f}`)
// Vinted « Hommes > Vêtements > Jeans > Jeans coupe droite » ET « Hommes > … > Pantalons > Chinos » (même grille)
const VINTED_H_JEANS = ['XS','S','M','L','XL','XXL','XXXL','4XL','5XL','6XL','7XL','8XL','Taille unique', ...FRW]
// Vinted « Femmes > Vêtements > Jeans > Jeans droits » : SIX onglets, et pour Vinted FR 40 = EU 38
const n = (p, de, a, pas = 2) => Array.from({ length: (a - de) / pas + 1 }, (_, i) => `${p} ${de + i * pas}`)
const VINTED_F_JEANS = ['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL','6XL','7XL','8XL','9XL','Autre','Taille unique',
  ...n('EU', 30, 58), ...n('UK', 2, 30), ...n('FR', 30, 60), ...n('IT', 34, 62), 'US 00', ...n('US', 0, 26)]
// Opla MEN_STRAIGHTFIT_JEANS et MEN_CHINOS (titres, tels que l'écran les montre)
const OPLA_H_BAS = ['Taille unique','XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL','6XL','7XL','8XL']
// Leboncoin « Mode > Vêtements », clothing_st (sa propre table nombre - lettre)
const LBC_VET = ['Taille unique','30 - XXXS','32 - XXS','34 - XS','36 - S','38 - M','40 - L','42 - XL','44 - XXL','46 - XXXL',
  '48 - 4XL','50 - 5XL','52 - 6XL','54 - 7XL','56 - 8XL et plus']
// Beebs « Homme > Pantalons » et « Femme > Jeans »
const BEEBS_H_BAS = [...n('', 32, 64).map(s => s.trim()), 'XS','S','M','L','XL','XXL','XXXL','4XL','5XL','6XL','7XL','8XL']
const BEEBS_F_JEANS = ['XXXS / 30','XXS / 32','XS / 34','S / 36','M / 38','L / 40','XL / 42','XXL / 44','XXXL / 46','4XL / 48',
  '5XL / 50','6XL / 52','7XL / 54','8XL / 56','9XL / 58','Taille unique','Autre']
// eBay 11483 « Homme : vêtements > Jeans » (fermée après le refus 25129) et 11554 « Femme > Jeans »
const EBAY_11483 = ['2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL','8XL','32','34','36','37','38','39','40',
  ...n('', 42, 70).map(s => s.trim()),'Taille unique', ...n('UK', 26, 44), ...n('US', 26, 44)]
const EBAY_11554 = ['3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL', ...n('', 32, 60).map(s => s.trim()),'Taille unique',
  ...n('IT', 36, 54), ...n('UK', 4, 22), ...n('US', 0, 18)]

console.log('\n── BAS HOMME — Vinted « W.. | FR .. » : la table de Vinted, lue chez lui ──')
doitDonner('W34 | FR 44', VINTED_H_JEANS, 'W34 | FR 44', 'la réponse de Patrick, telle quelle')
doitDonner('35/34', VINTED_H_JEANS, 'W35 | FR 44', 'Patrick, « Jean bleu denim taille 35/34 » : W35 L34, le L ne compte pas')
doitDonner('W32 L34', VINTED_H_JEANS, 'W32 | FR 42')
doitDonner('W32/L34', VINTED_H_JEANS, 'W32 | FR 42')
doitDonner('32x34', VINTED_H_JEANS, 'W32 | FR 42')
doitDonner('W28', VINTED_H_JEANS, 'W28 | FR 38')
doitDonner('33/32', VINTED_H_JEANS, 'W33 | FR 42', 'Patrick, « Jean Skinny 33/32 » — jamais le FR 32 de la longueur')
doitDonner('46', VINTED_H_JEANS, 'W36 | FR 46', 'Patrick, « Jean bleu délavé » 46 : parti SANS Vinted le 02/10')
doitDonner('FR 46', VINTED_H_JEANS, 'W36 | FR 46')
doitDonner('T46', VINTED_H_JEANS, 'W36 | FR 46')
doitDonner('44', VINTED_H_JEANS, null, 'FR 44 = W34 OU W35 chez Vinted : deux options, on demande')
doitDonner('FR 40', VINTED_H_JEANS, null, 'W30 | FR 40 ou W31 | FR 40 : on demande')
doitDonner('EU 42', VINTED_H_JEANS, null, 'EU ≠ FR : on garde le pays (point G)')
doitDonner('34/36', VINTED_H_JEANS, null, 'W34 L36 ou fourchette FR 34/36 : on demande')
doitDonner('XL', VINTED_H_JEANS, 'XL', 'une lettre reste une lettre')
console.log(`  candidates de « 44 »  : ${JSON.stringify(candidatsTaille('44', VINTED_H_JEANS))}`)
console.log(`  candidates de « 34 »  : ${JSON.stringify(candidatsTaille('34', VINTED_H_JEANS))}`)
{
  const c = candidatsTaille('44', VINTED_H_JEANS); const ok = c.length === 3 && c.includes('W34 | FR 44') && c.includes('W35 | FR 44') && c.includes('W44 | FR 54'); if (!ok) ko++
  console.log(`${ok ? '  ok  ' : '  KO  '} « 44 » : FR 44 (W34, W35) et sa lecture W44, en tête de la question`)
  const d = candidatsTaille('34', VINTED_H_JEANS); const ok2 = d.includes('W34 | FR 44') && d.includes('W24 | FR 34'); if (!ok2) ko++
  console.log(`${ok2 ? '  ok  ' : '  KO  '} « 34 » d'un jean : FR 34 ET W34 proposés, aucun choisi`)
}

console.log('\n── BAS FEMME — Vinted à onglets (EU, UK, FR, IT, US) : le pays se garde ──')
doitDonner('38', VINTED_F_JEANS, 'FR 38', 'un nombre nu est français ; jamais EU 38 (= FR 40 chez Vinted)')
doitDonner('EU 42', VINTED_F_JEANS, 'EU 42')
doitDonner('FR 40', VINTED_F_JEANS, 'FR 40')
doitDonner('W34 | FR 44', VINTED_F_JEANS, 'FR 44', 'le morceau FR de l\'étiquette composite')
doitDonner('W28', VINTED_F_JEANS, null, 'aucun W dans cette grille : on demande, jamais « 28 »')
doitDonner('35/34', VINTED_F_JEANS, null)
doitDonner('M', VINTED_F_JEANS, 'M')

console.log('\n── Opla MEN_STRAIGHTFIT_JEANS / MEN_CHINOS : des lettres, et rien ne s\'y convertit ──')
for (const c of ['W34 | FR 44', '35/34', 'W32 L34', 'FR 40', 'EU 42', '38', 'W28', '46']) doitDonner(c, OPLA_H_BAS, null, 'W/FR → lettre serait une conversion')
doitDonner('XL', OPLA_H_BAS, 'XL')
doitDonner('2XL', OPLA_H_BAS, 'XXL')

console.log('\n── Leboncoin « 44 - XXL » : sa propre table nombre - lettre ──')
doitDonner('W34 | FR 44', LBC_VET, '44 - XXL')
doitDonner('FR 40', LBC_VET, '40 - L')
doitDonner('38', LBC_VET, '38 - M')
doitDonner('M', LBC_VET, '38 - M')
doitDonner('35/34', LBC_VET, null, 'un W ne devient pas un nombre français')
doitDonner('EU 42', LBC_VET, null)

console.log('\n── Beebs ──')
doitDonner('W34 | FR 44', BEEBS_H_BAS, '44')
doitDonner('FR 40', BEEBS_H_BAS, '40')
doitDonner('46', BEEBS_H_BAS, '46')
doitDonner('W28', BEEBS_H_BAS, null)
doitDonner('38/40', BEEBS_H_BAS, null, 'une fourchette n\'est pas UNE taille')
doitDonner('38', BEEBS_F_JEANS, 'M / 38')
doitDonner('W34 | FR 44', BEEBS_F_JEANS, 'XXL / 44', 'la table de Beebs, lue chez Beebs')

console.log('\n── eBay (11483 homme fermée, 11554 femme) ──')
doitDonner('W34 | FR 44', EBAY_11483, '44', 'le FR de l\'étiquette, jamais le 34 du W')
doitDonner('35/34', EBAY_11483, null, 'ni « 35 », ni « US 34 » : on demande')
doitDonner('W32 L34', EBAY_11483, null)
doitDonner('FR 40', EBAY_11483, '40')
doitDonner('46', EBAY_11483, '46')
doitDonner('XXL', EBAY_11483, '2XL')
doitDonner('38', EBAY_11554, '38')
doitDonner('W28', EBAY_11554, null)

console.log('\n── NON-RÉGRESSION : hauts, pointures, enfants ──')
doitDonner('S/M', VINTED_FEMME, 'S', 'double taille en lettres : comportement d\'avant, inchangé')
doitDonner('42', ['40','41','42','43','44','44,5'], '42', 'pointure')
doitDonner('44,5', ['44','44,5','45'], '44,5', 'demi-pointure, écrite avec une virgule par la grille')
doitDonner('EU 42', ['41','42','43'], null, 'point G : « EU 42 » garde son pays')
doitDonner('42', ['EU 41','EU 42','EU 43','XS','S'], 'EU 42', 'règle du 23/09 (vestes de Joséphine) : nu → EU N, en dernier recours')
doitDonner('42', ['FR 42','EU 42'], 'FR 42', 'mais le pays de l\'app d\'abord')
doitDonner('12 ans', G2, '12Y')
doitDonner('10/12', G2, null, 'enfant sans unité : jamais lu comme un jean')
doitDonner('M', VINTED_COMBINE, 'M / 38 / 10')

console.log('\n── memeTaille, symétrie ─────────────────────────────────────────────')
for (const [a, b, att] of [['12 ans','12Y',true],['12 ans','12M',false],['44,5','44.5',true],
                           ['44.5','44',false],['XXL','2XL',true],['S','M',false],
                           ['Taille unique','TAILLE_UNIQUE',true],['3 ans','36M',false]]) {
  const r1 = memeTaille(a, b), r2 = memeTaille(b, a)
  const ok = r1 === att && r2 === att
  if (!ok) ko++
  console.log(`${ok ? '  ok  ' : '  KO  '} ${a} ≡ ${b} → ${r1}/${r2}${ok ? '' : `   ATTENDU ${att}`}`)
}

console.log(ko === 0 ? '\n✅ vocabulaire des tailles : tout passe\n' : `\n❌ ${ko} cas en échec\n`)
process.exit(ko === 0 ? 0 : 1)
