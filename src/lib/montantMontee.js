// ═══════════════════════════════════════════════════════════════════════════
// CE QUE COÛTE AUJOURD'HUI UNE MONTÉE DE FORMULE CHEZ GOOGLE ET CHEZ APPLE (18/11/2026, lot T1, décision 4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision 4 de Nico (18/11) : « la montée passe au prorata (le client ne paie que la différence) », et l'écran affiche le
// bon montant sur Google ET sur Apple. Cas Butin d'Or (18/11, Android) : Business, puis Business + Cloud une minute après,
// remplacé en CHARGE_FULL_PRICE → deux débits pleins le même soir.
//   · GOOGLE (CHARGE_PRORATED_PRICE, lib/changementFormuleBoutique.js) : la nouvelle formule tout de suite, l'ÉCHÉANCE NE
//     BOUGE PAS ; aujourd'hui, Google prélève la différence de prix pour les jours qui restent jusqu'à l'échéance.
//   · APPLE (règle d'Apple, aucun réglage possible : « upgrade … immediately … refund of the prorated amount ») : la
//     nouvelle formule tout de suite, un NOUVEAU mois commence aujourd'hui ; Apple prélève son prix entier et rembourse les
//     jours non utilisés de l'ancienne.
// Le résultat pour le client est le même (il ne paie jamais deux fois les mêmes jours) : chez Google, la différence sur
// les jours restants puis le prix plein à l'échéance ; chez Apple, le prix plein moins le reste de l'ancien mois, et son
// mois repart d'aujourd'hui. Les montants sont des ESTIMATIONS (la boutique calcule au centime et l'affiche dans sa feuille
// avant de valider) : l'écran dit « environ ». Pur ; les prix viennent de la boutique (lib/prixBoutique.js), jamais en dur.
const JOUR_MS = 86_400_000;
const arrondi = (x) => Math.round(x * 100) / 100;

/** La période en cours (pur) : l'échéance, et le même jour un mois calendaire avant (toutes les formules sont mensuelles). */
export function periodeEnCours(echeanceIso) {
  const fin = Date.parse(echeanceIso ?? '');
  if (!Number.isFinite(fin)) return null;
  const d = new Date(fin);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return { debut: d.getTime(), fin };
}

/**
 * Le montant (pur). prixActuel / prixCible : montants TTC du canal (nombres) ; echeance : fin de la période payée (ISO).
 * → null (rien à dire de sûr : prix inconnus, pas une montée, échéance passée ou illisible), sinon
 *   Google : { canal, aujourdhui, joursRestants, joursPeriode }
 *   Apple  : { canal, preleve, rembourse, net, joursRestants, joursPeriode }
 */
export function montantMontee({ canal, prixActuel, prixCible, echeance, maintenant = Date.now() } = {}) {
  const a = Number(prixActuel); const b = Number(prixCible);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= a) return null;
  const p = periodeEnCours(echeance);
  if (!p || p.fin <= maintenant) return null;
  const duree = p.fin - p.debut;
  const reste = Math.min(duree, p.fin - maintenant);
  const fraction = reste / duree;
  const jours = { joursRestants: Math.ceil(reste / JOUR_MS), joursPeriode: Math.round(duree / JOUR_MS) };
  if (canal === 'google') return { canal, aujourdhui: arrondi((b - a) * fraction), ...jours };
  if (canal === 'apple') {
    const rembourse = arrondi(a * fraction);
    return { canal, preleve: arrondi(b), rembourse, net: arrondi(b - rembourse), ...jours };
  }
  return null;
}

/** « 10,00 € » / « €10.00 » (pur) — la devise de la boutique. */
export function formaterMontant(n, devise = 'EUR', lang = 'fr') {
  if (!Number.isFinite(Number(n))) return null;
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: devise || 'EUR' }).format(Number(n));
  } catch { return null; }
}

/**
 * Les montants À AFFICHER pour passer de `cleActuelle` à `cleCible` (pur, `prix` = lirePrixBoutique().prix : { [cle]:
 * { montant, devise } }). Rend null sans prix sûrs des deux côtés dans la même devise, ou hors boutique (web : Stripe
 * dit déjà « la différence au prorata » avec sa date).
 */
export function montantMonteeAffiche({ canal, cleActuelle, cleCible, echeanceIso, prix = {}, lang = 'fr', maintenant = Date.now() } = {}) {
  if (canal !== 'google' && canal !== 'apple') return null;
  const pa = prix?.[cleActuelle]; const pc = prix?.[cleCible];
  if (!pa || !pc || pa.devise !== pc.devise) return null;
  const m = montantMontee({ canal, prixActuel: pa.montant, prixCible: pc.montant, echeance: echeanceIso, maintenant });
  if (!m) return null;
  const f = (x) => formaterMontant(x, pc.devise, lang);
  const date = new Date(Date.parse(echeanceIso)).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return canal === 'google'
    ? { canal, aujourdhui: f(m.aujourdhui), date, brut: m }
    : { canal, preleve: f(m.preleve), rembourse: f(m.rembourse), net: f(m.net), date, brut: m };
}

/** La clé de prix de la formule EN COURS d'un compte (pur) : sa formule avec Cloud, sinon son palier payant ; null pour un
 *  Founder (son prix réel n'est pas lu : jamais un montant faux) ou un compte gratuit. */
export function cleActuelleDuCompte({ formuleActuelle = null, palier = null, founder = false } = {}) {
  if (founder) return null;
  if (formuleActuelle) return formuleActuelle;
  return ['premium', 'pro', 'business'].includes(palier) ? palier : null;
}
