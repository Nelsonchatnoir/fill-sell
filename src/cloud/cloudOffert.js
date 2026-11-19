// ═══════════════════════════════════════════════════════════════════════════
// LE CLOUD OFFERT DANS L'APP (19/11/2026, décision de Nico, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// « Un compte dont le Cloud est offert ne doit plus jamais voir l'écran de paiement du Cloud (liste d'attente, carte Cloud,
// offres). La place s'ouvre directement. » La RÈGLE vit dans supabase/functions/_shared/cloud-option.js (cloudOffertDuProfil,
// achatCloudFermeParOffert, CLOUD_OFFERT_SOMMEIL_SANS_ACHAT) ; ici, ce que les écrans en tirent. Pur : la garde finale des
// deux achats (achatCloud.acheter, achatFormuleCloud.acheter) lit l'état par useCloudProfil — cloud/gardeCloudOffert.js.
// Les écrans : fenêtre d'offres et Réglages (cartesFormulesCloud cloudOffert → voie 'cloud_offert', aucune carte), carte du
// Stock, offre du Cloud seul (regles.offreCloudPourModale), « Reprendre mon essai », HoteCloud (« Cloud arrêté », « place
// libre »), parcours d'entrée (plan.js : offert actif → la connexion). Verrou : selftest:cloud-offert-ecrans.
import { cloudOffertDuProfil, achatCloudFermeParOffert, CLOUD_OFFERT_SOMMEIL_SANS_ACHAT } from '../../supabase/functions/_shared/cloud-option.js';
import { textesOffert } from './textesOffert.js';

export { cloudOffertDuProfil, achatCloudFermeParOffert, CLOUD_OFFERT_SOMMEIL_SANS_ACHAT };

/** Le Cloud offert d'une lecture Cloud (useCloudProfil) ; null tant qu'elle n'a pas répondu. */
export const offertDeLecture = (lecture) => (lecture?.etat === 'ok' && lecture.profil ? cloudOffertDuProfil(lecture.profil) : null);

/** Tout achat Cloud est-il fermé, d'après la lecture ? Faux tant qu'elle n'a pas répondu : la garde finale tranche. */
export const achatFermeDeLecture = (lecture) => Boolean(lecture?.etat === 'ok' && lecture.profil && achatCloudFermeParOffert(lecture.profil));

/** Les gestes d'un écran Cloud SANS aucun geste d'argent (essayer, ajouter, formule, offres) ni arrêt : un Cloud offert ne se
 *  paie pas et ne s'arrête pas depuis l'app. Restent les autres (connecter ses plateformes, l'extension). */
export function actionsSansAchatCloud(actions) {
  if (!actions || typeof actions !== 'object') return {};
  // eslint-disable-next-line no-unused-vars
  const { essayer, ajouter, formule, voirFormulesCloud, voirFormules, reprendre, arreter, ...reste } = actions;
  return reste;
}

/** La phrase d'un Cloud offert, selon son état (null : rien à dire — un Cloud offert sans lien en sommeil). */
export function phraseCloudOffert(offert, lang = 'fr') {
  if (!offert) return null;
  const T = textesOffert(lang);
  if (offert.actif) return offert.lie === 'business' ? T.actifLie : T.actif;
  return offert.lie === 'business' ? T.revientAvecBusiness : null;
}

/** L'issue d'un achat refusé par un Cloud offert : actif → « deja » ; en sommeil → « refuse » (jamais lu comme un Cloud
 *  actif par le parcours d'entrée). Rien n'est préparé, ni Stripe, ni la feuille de la boutique. */
export function refusAchatOffert(offert, lang = 'fr') {
  const T = textesOffert(lang);
  if (offert?.actif === false) {
    return { etat: 'refuse', raison: 'cloud_offert_sommeil', message: offert.lie === 'business' ? T.revientAvecBusiness : T.achatOffert };
  }
  return { etat: 'deja', raison: 'cloud_offert', message: T.achatOffert };
}
