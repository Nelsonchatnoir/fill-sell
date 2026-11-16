// ═══════════════════════════════════════════════════════════════════════════
// « REPRENDRE TON ESSAI » — LE RETOUR DANS L'APP APRÈS UN ESSAI NON DÉMARRÉ (16/11/2026, point 2d du lot de Nico) — pur
// ═══════════════════════════════════════════════════════════════════════════
// Constat (15/11, essais Premium + Cloud) : 94a8e713 est revenu dans l'app 19 s après avoir ouvert la page Stripe, par la
// flèche « retour » du navigateur (pas par /cancel) : rien ne lui disait que son essai n'avait pas démarré, ni comment le
// reprendre. Sur iPhone, la feuille d'Apple fermée laissait aussi la personne sans suite.
// La règle :
//   · la marque est posée quand l'essai d'une formule part vers la page Stripe (web) ou quand la feuille de la boutique
//     est fermée sans achat (iPhone / Android) — jamais pour une formule sans essai ;
//   · le bandeau se montre au RETOUR (au moins 20 s après, jamais pendant qu'on est encore sur la page de paiement), au
//     plus 24 h, tant que le Cloud n'est pas actif et que la formule se vend sur ce canal ;
//   · un essai démarré, un « × », ou 24 h l'effacent ; « Reprendre mon essai » relance le MÊME chemin (conditions,
//     place, page de paiement ou feuille), jamais un raccourci.
// Verrou : scripts/essai-page-stripe-selftest.mjs.
import { FORMULES_AVEC_ESSAI } from '../../supabase/functions/_shared/formules-cloud.js';
import { NOMS_FORMULES } from './textesFormules';

export const CLE_REPRISE_ESSAI = 'fs_essai_a_reprendre';
export const DELAI_AVANT_BANDEAU_MS = 20_000;
export const DUREE_BANDEAU_MS = 24 * 3600_000;

const stockageParDefaut = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** Pose la marque (une formule AVEC essai seulement). Ne lève jamais. */
export function noterEssaiAReprendre({ formule, origine = null, canal = null, maintenant = Date.now() } = {}, stockage = stockageParDefaut()) {
  if (!FORMULES_AVEC_ESSAI.includes(formule)) return false;
  try { stockage?.setItem(CLE_REPRISE_ESSAI, JSON.stringify({ formule, origine, canal, at: maintenant })); return true; } catch { return false; }
}

/** La marque lue, ou null (illisible, autre formule). */
export function lireEssaiAReprendre(stockage = stockageParDefaut()) {
  try {
    const v = JSON.parse(stockage?.getItem(CLE_REPRISE_ESSAI) ?? 'null');
    return v && FORMULES_AVEC_ESSAI.includes(v.formule) && Number.isFinite(v.at) ? v : null;
  } catch { return null; }
}

export function effacerEssaiAReprendre(stockage = stockageParDefaut()) {
  try { stockage?.removeItem(CLE_REPRISE_ESSAI); } catch { /* stockage indisponible */ }
}

/**
 * Le bandeau se montre-t-il ? (pur) `cloudActif` : le Cloud du compte tourne (essai ou payé) ; `vendable` : la formule se
 * vend sur ce canal (interrupteur) ; null = pas encore lu → jamais.
 */
export function bandeauRepriseVisible({ marque, cloudActif, vendable, maintenant = Date.now() }) {
  if (!marque || cloudActif !== false || vendable !== true) return false;
  const age = maintenant - Number(marque.at);
  return Number.isFinite(age) && age >= DELAI_AVANT_BANDEAU_MS && age < DUREE_BANDEAU_MS;
}

/** Les textes du bandeau (une phrase, la vérité : rien n'a été prélevé). */
export function texteBandeauReprise(lang = 'fr', formule = 'premium_cloud') {
  const nom = NOMS_FORMULES[formule] ?? '';
  return lang === 'en'
    ? { titre: `Your ${nom} trial hasn't started`, corps: 'Nothing was charged. Pick it up whenever you want: 7 days free, stop in one tap from the app.', bouton: 'Resume my trial', fermer: 'Close' }
    : { titre: `Ton essai ${nom} n'a pas démarré`, corps: "Rien n'a été prélevé. Reprends-le quand tu veux : 7 jours gratuits, tu arrêtes en un clic depuis l'app.", bouton: 'Reprendre mon essai', fermer: 'Fermer' };
}
