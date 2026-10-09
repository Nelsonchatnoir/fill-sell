// ═══════════════════════════════════════════════════════════════════════════
// BASCULE OPLA → DEPOP, TOUTE SEULE À MINUIT (09/10/2026 soir, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une seule règle, sans lecture ni écriture (testable à horloge simulée :
// scripts/bascule-opla-depop-selftest.mjs). L'interrupteur est celui qui
// existe : coin_config `opla_sortie_le` (_shared/opla-sortie.js — 0 = sortie
// désactivée, absent = le 10/10/2026 00:00 Paris).
//
// À partir de la bascule :
//   · Opla n'est plus PROPOSÉE nulle part (publication, republication, lot,
//     réglage, onboarding, bandeau de prévention) ;
//   · un compte au dressing Opla déjà synchronisé (oplaRelie) garde la SEULE
//     synchronisation : relevé, ventes vues sur Opla, retraits — un retrait Opla
//     n'est jamais bloqué (double vente) ;
//   · Depop prend sa place, ouverte à tous par la base (depop_autorise lit le
//     même interrupteur, migration 20261009230000) — mais l'app ne la MONTRE
//     qu'à une extension qui sait la faire (≥ 0.6.106). Sinon rien ne
//     s'affiche à la place : ni Opla, ni message.
// Avant la bascule : l'état d'aujourd'hui (Opla proposée, Depop pour la seule
// bêta du compte — depop_autorise côté serveur — et toujours ≥ 0.6.106).
import { sortieOplaActive } from '../../supabase/functions/_shared/opla-sortie.js';

/** La première extension qui sait faire Depop dans l'app (décision de Nico). */
export const DEPOP_EXTENSION_MIN = '0.6.106';

// Même comparaison que connexionPlateformes.versionAuMoins (segment par
// segment, inconnue = non), recopiée ici pour garder ce module sans client
// Supabase (il est chargé tel quel par son selftest).
function versionAuMoins(version, minimum) {
  if (!String(version ?? '').trim()) return false;
  const d = (v) => String(v ?? '').trim().split('.').map((x) => Number.parseInt(x, 10) || 0);
  const a = d(version);
  const b = d(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/** L'extension de la personne sait-elle faire Depop ? Inconnue = non. */
export function extensionSaitDepop(...versions) {
  return versions.some((v) => versionAuMoins(v, DEPOP_EXTENSION_MIN));
}

/** L'interrupteur à 0 = sortie désactivée (Opla reste ouverte). */
function interrupteurCoupe(interrupteur) {
  return interrupteur !== null && interrupteur !== undefined && interrupteur !== '' && Number(interrupteur) === 0;
}

/**
 * L'état de la bascule pour UN compte, à `maintenant` (ms).
 *  · interrupteur          valeur coin_config `opla_sortie_le` (ou rien)
 *  · depopAutoriseServeur  réponse de rpc depop_autorise lue au chargement
 *  · versionsExtension     versions connues de l'extension (profil, en direct)
 *  · oplaRelie             dressing Opla synchronisé (true / false / null)
 *  · bandeauVu             « J'ai compris » déjà touché (true / false / null)
 */
export function etatBascule({
  maintenant = Date.now(),
  interrupteur = null,
  depopAutoriseServeur = false,
  versionsExtension = [],
  oplaRelie = null,
  bandeauVu = null,
} = {}) {
  const sortie = sortieOplaActive(maintenant, interrupteur);
  const saitDepop = extensionSaitDepop(...(Array.isArray(versionsExtension) ? versionsExtension : [versionsExtension]));
  // La base ouvre Depop à tous à la bascule : l'app suit la même horloge, sans
  // attendre une relecture de depop_autorise (une app ouverte bascule seule).
  const depopVisible = (depopAutoriseServeur === true || sortie) && saitDepop;
  const relieConnu = oplaRelie === true || oplaRelie === false;
  return {
    sortie,
    oplaProposee: !sortie,
    oplaSuivie: !sortie || oplaRelie === true,
    depopVisible,
    bandeauOpla: !sortie && !interrupteurCoupe(interrupteur) && relieConnu && bandeauVu === false,
    plateformesOuvertes: [...(sortie ? [] : ['opla']), ...(depopVisible ? ['depop'] : [])],
  };
}
