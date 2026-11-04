// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LES RÈGLES PURES DU LOT 3 (04/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Grille à 3 jauges (coin_config.grille_trois_jauges) et voie FillSell Cloud
// (config/cloudOffer.js), décisions de Nico du 03/11, maquettes « o-… ».
// Fonctions PURES, sans React ni réseau : le contexte (useContexteEntree) les
// appelle, plan.js et les écrans lisent ce qu'elles rendent, le selftest
// (scripts/onboarding-trois-jauges-selftest.mjs) les exécute.
//
// ⛔ À 0 (grille éteinte) ET Cloud fermé — le cas de tous les comptes le
//    04/11 —, planEntree rend null et parcoursCloud rend false : le parcours
//    est celui d'avant, étape pour étape, mot pour mot.
// ⛔ AUCUN CHIFFRE EN DUR : les volumes viennent de coin_config
//    (grilleDuPalier), la date de l'essai de maintenant + 7 jours
//    (finEssaiSiOnCommence, comme la feuille des formules), le prix de
//    CLOUD_PRIX_AFFICHE (utils/palier.js, lu par textes.js).
import { JAUGES, grilleActiveConfig, grilleDuPalier, nombre, motJauge } from '../utils/jauges';
import { voieCloud, finEssaiSiOnCommence, dateLongue, FUSEAU } from '../cloud/regles';
import { nomDuPalier, palierNormalise } from '../utils/palier';

const JOUR_MS = 86_400_000;

/**
 * La voie Cloud du parcours existe-t-elle pour ce compte ?
 *   ouvert  : téléphone ET Cloud ouvert à ce compte (cloudOfferVisible) ET un
 *             achat possible (l'hôte a passé `essaiCloud`) ;
 *   lecture : useCloudProfil (comme VoieSansOrdinateur) ;
 *   voie    : 'cloud' | 'extension' | null (le choix de l'étape « voie ») ;
 *   actif   : le serveur porte l'option (lu, ou rendu par l'achat).
 * Vrai quand l'ESSAI est proposable (jamais un essai promis sans lecture
 * sûre) ; reste vrai une fois l'essai pris sur cette voie, et pendant la
 * relecture d'un choix déjà fait (reprise du parcours) — sinon l'étape
 * courante sortirait de la liste le temps d'une requête.
 */
export function parcoursCloud({ ouvert, lecture, voie, actif }) {
  if (!ouvert) return false;
  if (voieCloud(lecture)?.essai === true) return true;
  if (voie === 'cloud' && actif === true) return true;
  return voie != null && lecture?.etat === 'lecture';
}

/**
 * Le plan du compte vu par le parcours, AVEC la grille seulement (sinon null).
 * { palier: 'gratuit'|'premium'|'pro'|'business', free, nom, annonces, publications, remontees }
 * (Infinity = illimité). `palier` : celui de l'app (App.jsx), défaut gratuit.
 */
export function planEntree(K, palier) {
  if (!grilleActiveConfig(K)) return null;
  const p = palierNormalise(palier) ?? 'gratuit';
  const g = grilleDuPalier(K, p);
  return { palier: p, free: p === 'gratuit', nom: nomDuPalier(p) ?? 'Free', annonces: g.annonces, publications: g.publications, remontees: g.remontees };
}

/** « 5 annonces », « 1 200 publications », « remontées illimitées » (jamais un faux chiffre). */
export function compteJauge(cle, n, lang = 'fr') {
  if (n === Infinity || n == null) {
    return lang === 'en' ? `unlimited ${motJauge(cle, 2, lang)}` : `${motJauge(cle, 2, lang)} illimitées`;
  }
  return `${nombre(n, lang)} ${motJauge(cle, n, lang)}`;
}

/** « 5 annonces, 50 publications, 30 remontées » — les 3 jauges d'un plan, dans l'ordre. */
export function listeJauges(plan, lang = 'fr', { dernierEt = false } = {}) {
  const morceaux = JAUGES.map((j) => compteJauge(j, plan?.[j], lang));
  if (!dernierEt) return morceaux.join(', ');
  return `${morceaux.slice(0, -1).join(', ')}${lang === 'en' ? ' and ' : ' et '}${morceaux.at(-1)}`;
}

/** « Vinted, Leboncoin, Beebs et Depop » / « … and Depop ». */
export function listeNoms(noms, lang = 'fr') {
  const l = (Array.isArray(noms) ? noms : []).filter(Boolean);
  if (l.length < 2) return l.join('');
  return `${l.slice(0, -1).join(', ')}${lang === 'en' ? ' and ' : ' et '}${l.at(-1)}`;
}

const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const jourLong = (iso, lang) => {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  return majuscule(new Date(t).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: FUSEAU }));
};
/** « 10/11 », à l'heure de Paris. */
export function dateCourte(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', timeZone: FUSEAU });
}

/**
 * Les dates d'un essai qui commencerait MAINTENANT (même calcul que la feuille
 * des formules : finEssaiSiOnCommence, heure de Paris) :
 *   fin « 10 novembre », jourFin « Mardi 10 novembre », jourVeille « Lundi 9 novembre » (le rappel), court « 10/11 ».
 */
export function datesEssai(maintenant, lang = 'fr') {
  const fin = finEssaiSiOnCommence(maintenant);
  const veille = new Date(Date.parse(fin) - JOUR_MS).toISOString();
  return { finIso: fin, fin: dateLongue(fin, lang), jourFin: jourLong(fin, lang), jourVeille: jourLong(veille, lang), court: dateCourte(fin, lang) };
}
