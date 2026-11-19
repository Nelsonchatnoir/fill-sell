// ═══════════════════════════════════════════════════════════════════════════
// eBAY VOIE API : LES REPRISES DU CHIEN DE GARDE SE COMPTENT DEPUIS LA RELANCE (19/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qui s'est passé (compte 8fd44622, job c1d8a3eb, 19/11) : la publication eBay « Baskets » était tuée par le
// runtime (« CPU Time exceeded », régression de 8f68590 corrigée par 84b3acf). Le chien de garde d'ebay-api-worker
// (reprendreProcessingMorts) l'a remise en file 3 fois, puis l'a passée en échec à la 4e coupure, avec le message
// « interrompu 3 fois de suite » : jusque-là, c'est juste. À 12:12 la personne relance depuis la fiche. La relance
// garde reprises_processing (4), et la coupure suivante faisait 5 > 3 : nouvel échec À LA PREMIÈRE coupure, sous le
// même message, désormais faux. Une copie (relance « par copie ») héritait aussi du compteur.
// LA RÈGLE (tous les comptes, voie API) : un cycle de reprises commence à la relance de la personne
// (derniere_relance_manuelle) ou à la création de la tâche (une copie est une tâche neuve). Une reprise faite AVANT
// le début du cycle ne compte plus. Le plafond (PROCESSING_REPRISES_MAX d'ebay-api-worker) ne change pas, et le
// message « interrompu N fois de suite » reste vrai.
// Pur, sans import (Deno + Node) : scripts/ebay-api-reprises-selftest.mjs.

const instant = (x) => {
  const t = Date.parse(String(x ?? ""));
  return Number.isFinite(t) ? t : null;
};

/**
 * Le numéro de la reprise qui vient pour une tâche « processing » morte.
 * @param {{ pf?: Record<string, unknown> | null, creeLe?: string | null }} arg
 * @returns {{ n: number, faitesAvant: number, nouveauCycle: boolean }}
 *   n : 1 pour la première reprise du cycle ; faitesAvant : le compteur lu ; nouveauCycle : vrai si des reprises
 *   d'un cycle précédent ont été écartées (relance ou copie depuis).
 */
export function repriseProcessingSuivante({ pf = null, creeLe = null } = {}) {
  const p = pf && typeof pf === "object" ? pf : {};
  const faitesAvant = Math.max(0, Math.floor(Number(p.reprises_processing) || 0));
  const derniere = instant(p.derniere_reprise_processing);
  const debuts = [instant(p.derniere_relance_manuelle), instant(creeLe)].filter((t) => t != null);
  const debutCycle = debuts.length ? Math.max(...debuts) : null;
  // Le compteur ne vaut pour CE cycle que si sa dernière reprise date du cycle (après la relance, après la création).
  // Compteur sans date (jamais écrit l'un sans l'autre par le worker) ou cycle sans début lisible : la règle d'avant.
  if (faitesAvant > 0 && derniere != null && debutCycle != null && derniere < debutCycle) {
    return { n: 1, faitesAvant, nouveauCycle: true };
  }
  return { n: faitesAvant + 1, faitesAvant, nouveauCycle: false };
}
