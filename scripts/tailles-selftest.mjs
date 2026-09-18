// Autotest du vocabulaire des tailles (_shared/tailles.js).
// Bâti sur les cas RÉELS relevés en base le 18/09, et sur les refus qui
// doivent le rester. `node scripts/tailles-selftest.mjs`
import { tailleDansGrille, memeTaille, diagnosticTaille } from '../supabase/functions/_shared/tailles.js'

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
