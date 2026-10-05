// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « SANS ORDINATEUR » — CE QUE LES ÉCRANS DÉCIDENT (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION, NON LIVRÉE. Fonctions PURES, sans React ni réseau : l'état Cloud
// d'un compte se lit par cloudDuProfil (utils/palier.js, même règle que le
// serveur `cloud_etat`) ; ce fichier n'en tire que ce qu'un ÉCRAN doit
// montrer. Il ne recalcule jamais l'état lui-même.
//
// Les dates s'écrivent à l'heure de Paris, quel que soit le fuseau du
// téléphone : la bascule de facturation a lieu à une heure précise, et c'est
// celle-là qu'on promet.
import { CLOUD_ESSAI_JOURS } from '../utils/palier';

export const FUSEAU = 'Europe/Paris';
const JOUR_MS = 86_400_000;

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** « 11 octobre » (fr) / « October 11 » (en), à l'heure de Paris. */
export function dateLongue(v, lang = 'fr') {
  const t = instant(v);
  if (t == null) return '';
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: FUSEAU });
}

/** « 10:00 », à l'heure de Paris. */
export function heureDe(v, lang = 'fr') {
  const t = instant(v);
  if (t == null) return '';
  return new Date(t).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU });
}

// Le jour calendaire à Paris, en nombre (AAAAMMJJ → comparable).
const jourParis = (t) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
};

/** La fin d'un essai qui commencerait maintenant (affichée AVANT de cocher). */
export function finEssaiSiOnCommence(maintenant = Date.now()) {
  return new Date((instant(maintenant) ?? Date.now()) + CLOUD_ESSAI_JOURS * JOUR_MS).toISOString();
}

/**
 * Quand tombe la fin d'essai, en jours calendaires de Paris :
 * 'passe' | 'aujourdhui' | 'demain' | 'plus_tard'.
 */
export function quandFin(finIso, maintenant = Date.now()) {
  const fin = instant(finIso);
  const now = instant(maintenant) ?? Date.now();
  if (fin == null) return 'plus_tard';
  if (fin <= now) return 'passe';
  const ecart = Math.round((jourParis(fin) - jourParis(now)) / JOUR_MS);
  if (ecart <= 0) return 'aujourdhui';
  if (ecart === 1) return 'demain';
  return 'plus_tard';
}

/** Le jour d'essai en cours (1 à 7), pour la jauge des Réglages. */
export function jourDEssai(cloud) {
  if (cloud?.etat !== 'essai' || !Number.isFinite(cloud.joursRestants)) return null;
  return Math.min(CLOUD_ESSAI_JOURS, Math.max(1, CLOUD_ESSAI_JOURS - cloud.joursRestants + 1));
}

/**
 * Ce que la feuille des formules montre de l'option, à partir de la LECTURE
 * (useCloudProfil : { etat: 'lecture'|'ok'|'echec'|'inactif', cloud }) :
 *   null                                  → rien (pas lu, lecture ratée) :
 *                                           jamais d'interrupteur deviné ;
 *   { mode: 'interrupteur', essai: bool } → l'interrupteur, avec ou sans essai ;
 *   { mode: 'deja_actif' }                → une ligne, pas d'interrupteur ;
 *   { mode: 'suspendu' }                  → une ligne, pas d'interrupteur.
 */
export function offreCloudPourModale(lecture) {
  if (lecture?.etat !== 'ok' || !lecture.cloud) return null;
  const c = lecture.cloud;
  if (c.etat === 'essai' || c.etat === 'paye') return { mode: 'deja_actif' };
  if (c.etat === 'suspendu') return { mode: 'suspendu' };
  return { mode: 'interrupteur', essai: c.etat === 'aucun' && !c.essaiPris };
}

/** La 2e voie (entrée, mur) : null = ne rien montrer ; sinon { essai }. */
export function voieCloud(lecture) {
  const o = offreCloudPourModale(lecture);
  return o?.mode === 'interrupteur' ? { essai: o.essai } : null;
}

/** Le rappel de la veille : essai en cours ET fin aujourd'hui ou demain (Paris). */
export function rappelVeilleDu(cloud, maintenant = Date.now()) {
  if (cloud?.etat !== 'essai') return null;
  const q = quandFin(cloud.essaiFin, maintenant);
  return q === 'demain' || q === 'aujourdhui' ? q : null;
}
