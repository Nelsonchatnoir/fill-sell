// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « FILLSELL CLOUD » — CE QUE LES ÉCRANS DÉCIDENT (04/10/2026)
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
import { essaiBoutiqueOffert } from '../lib/prixBoutique.js';

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
  // (08/11, refus Google) Mobile : l'essai n'est annoncé que si la boutique offre une semaine gratuite à ce compte.
  return { mode: 'interrupteur', essai: c.etat === 'aucun' && !c.essaiPris && essaiBoutiqueOffert('cloud') };
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

// (03/11) « Ton essai est terminé » ne se dit que d'un essai fini depuis moins de 3 jours ; au-delà (option prise puis
// arrêtée, impayé), c'est « FillSell Cloud est arrêté » — jamais « rien n'a été facturé » à quelqu'un qui a payé.
export const ESSAI_RECENT_MS = 3 * 86_400_000;
/** Quel écran d'après le Cloud montrer ? (pur : testé) 'essai_termine' | 'arrete' | null. */
export function ecranApresCloud(cloud, profil, maintenant = Date.now()) {
  if (!cloud || cloud.actif || cloud.essaiArrete) return null;
  const fin = Date.parse(String(cloud.essaiFin ?? ''));
  const essaiRecent = Number.isFinite(fin) && maintenant - fin >= 0 && maintenant - fin < ESSAI_RECENT_MS;
  if (cloud.etat === 'essai_termine' && essaiRecent) return 'essai_termine';
  if ((cloud.etat === 'essai_termine' || cloud.etat === 'aucun') && profil?.cloud_canal) return 'arrete';
  return null;
}

// (08/11, ordre de Nico) Ce que dit la feuille de la veille APRÈS le geste « Arrêter » — jamais « c'est arrêté » ni
// « rien ne sera prélevé » avant la CONFIRMATION : pour Apple / Google, celle de la boutique (son webhook, relu en base :
// essai arrêté, sans refus de verrou) ; pour Stripe, la réponse de cancel-subscription (aucun_prelevement : annulé avant
// la fin de l'essai, factures à 0). Rend la clé du texte (textes.js) :
//   'boutique_ouverte'        — les abonnements de la boutique ont été ouverts, sa confirmation est attendue ;
//   'arrete_sans_prelevement' — arrêt CONFIRMÉ, rien ne sera prélevé ;
//   'arrete'                  — Stripe a arrêté, mais ses factures n'ont pas été relues : on n'en dit pas plus ;
//   'rien'                    — aucun abonnement en cours (le message du serveur) ;
//   null                      — pas encore de geste abouti.
export function issueVeilleArret({ etat, arretConfirme = false, aucunPrelevement = false } = {}) {
  if (etat === 'boutique') return arretConfirme === true ? 'arrete_sans_prelevement' : 'boutique_ouverte';
  if (etat === 'arretee') return aucunPrelevement === true || arretConfirme === true ? 'arrete_sans_prelevement' : 'arrete';
  if (etat === 'rien') return 'rien';
  return null;
}

/** (08/11) L'arrêt d'un ESSAI est-il confirmé en base ? Essai arrêté, et pas par un verrou d'essai (carte, compte de
 *  plateforme) — un verrou arrête l'essai FillSell sans couper l'abonnement de la boutique. */
export const arretEssaiConfirme = (cloud, profil) => cloud?.essaiArrete === true && !profil?.cloud_essai_refus;

/** (08/11) Les relectures après l'ouverture des abonnements d'une boutique : quatre, puis plus rien (jamais une boucle). */
export const RELECTURES_APRES_BOUTIQUE_MS = Object.freeze([3_000, 10_000, 30_000, 60_000]);
