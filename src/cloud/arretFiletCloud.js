// ═══════════════════════════════════════════════════════════════════════════
// LE CLOUD COMPLET — le message d'un essai arrêté par le FILET DE CAPACITÉ (13/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Quand le Cloud n'a plus aucune place, l'orchestrateur (serveur-cloud/src/filetCapacite.js) arrête un essai dont le
// renouvellement est coupé — le Cloud seulement, jamais la formule — et pose profiles.platform_settings.cloud_arret =
// { cause: 'cloud_complet', le, essai_fin_prevue, v: 1 }. useCloudProfil le lit (COLONNES_CLOUD, « cloud_arret ») ;
// Réglages › Abonnement le dit à la place de « Essai arrêté le {date}… » (BlocCloudReglages) et sur la carte de la
// formule ou du compte Free (BlocFormulesReglages, LigneArretFilet). Verrou : scripts/cloud-filet-capacite-selftest.mjs.
// ⛔ Le texte ne s'affiche QUE pour un essai terminé ET arrêté (cloudDuProfil) dont la cause posée est le Cloud complet,
//    avec une date lisible — jamais sinon. La date est celle de l'arrêt, à l'heure de Paris (dateLongue).
import { createElement } from 'react';
import { dateLongue } from './regles';

export const CAUSE_CLOUD_COMPLET = 'cloud_complet';

const TEXTES = {
  fr: (date) => `Le Cloud est complet : ton essai, dont le renouvellement est coupé, s'est arrêté le ${date} pour libérer sa place. Rien ne te sera prélevé tant que le renouvellement reste coupé.`,
  en: (date) => `The Cloud is full: your trial, whose renewal is turned off, stopped on ${date} to free up its place. Nothing will be charged as long as renewal stays off.`,
};

/**
 * La phrase du Cloud complet, ou null (pur).
 *   cloud : cloudDuProfil(…) (lecture.cloud) ; arret : lecture.profil.cloud_arret ; lang : 'fr' | 'en'.
 */
export function phraseArretFilet({ cloud, arret, lang = 'fr' } = {}) {
  if (cloud?.etat !== 'essai_termine' || cloud?.essaiArrete !== true) return null;
  if (!arret || typeof arret !== 'object' || arret.cause !== CAUSE_CLOUD_COMPLET) return null;
  const date = Number.isFinite(Date.parse(String(arret.le ?? ''))) ? dateLongue(arret.le, lang) : '';
  return date ? (lang === 'en' ? TEXTES.en : TEXTES.fr)(date) : null;
}

/** La même phrase en paragraphe (carte de la formule, carte Free) ; rien quand elle ne s'applique pas. */
export function LigneArretFilet({ cloud, arret, lang = 'fr', style }) {
  const texte = phraseArretFilet({ cloud, arret, lang });
  return texte ? createElement('p', { 'data-cloud-arret': CAUSE_CLOUD_COMPLET, style }, texte) : null;
}
