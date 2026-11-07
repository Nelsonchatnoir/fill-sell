// (07/11, décision de Nico) MONTANTS EN ANGLAIS : « Montants en anglais : format anglais (« €1,268.00 » ou l'usage du
// store), partout où l'app affiche un montant en anglais. » En anglais, un montant s'écrit symbole devant, virgule des
// milliers, point décimal (« €1,268.00 », « €24.99 », « €4 ») ; en français, RIEN ne change (« 1 268,00 € »).
// Module sans import : il se charge tel quel dans les selftests (Node) et dans les petits utilitaires.
// ⛔ Un prix venu du store (App Store / Google Play, `priceString`) s'affiche tel que le store le donne : il ne passe
// jamais par ici.

/** La locale anglaise des montants : 'en-IE' écrit l'euro « €1,268.00 » (comme en-GB / en-US). */
export const LOCALE_MONTANT_ANGLAIS = 'en-IE';

/**
 * La locale d'affichage d'un montant. En anglais, une devise dont le format est français (EUR → fr-FR, franc CFA →
 * fr-SN…) passe au format anglais ; une devise déjà anglaise (USD, GBP…) ou d'une autre langue garde la sienne. En
 * français, la locale de la devise, inchangée.
 */
export function localeDuMontant(localeDevise, lang) {
  const loc = localeDevise || 'fr-FR';
  return lang === 'en' && /^fr(-|$)/i.test(loc) ? LOCALE_MONTANT_ANGLAIS : loc;
}

/**
 * Un montant au format anglais : 1268 → « €1,268 », 1268.5 → « €1,268.50 », 24.99 → « €24.99 », -3 → « -€3 ».
 * `decimales` absent : aucune décimale pour un entier, deux sinon (l'usage anglais pour un prix). Valeur illisible →
 * chaîne vide (l'appelant garde son tiret).
 */
export function montantAnglais(v, { devise = 'EUR', decimales = null } = {}) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '';
  const dec = decimales != null ? decimales : (Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);
  try {
    return new Intl.NumberFormat(LOCALE_MONTANT_ANGLAIS, { style: 'currency', currency: devise || 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  } catch {
    return `${devise === 'EUR' || !devise ? '€' : `${devise} `}${n.toFixed(dec)}`;
  }
}
