// ═══════════════════════════════════════════════════════════════════════════
// LE PLAFOND DE 2 MAILS / 24 H NE COMPTE QUE CE QUI PART DE NOTRE INITIATIVE (29/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// thecloset72000, 28/10 au soir : envoyer_mail_ponctuel (catégorie marketing) refuse un mail « plafond_24h,
// deja: 5 ». Les 5 lignes email_logs des 24 h : 4 mails de VENTE (vente:5444, vente:5552, vente:5583,
// vente:5676 — un par vente, push-ventes) + 1 seul mail de notre initiative (maintenance_vinted, 18:44).
// Un vendeur qui vend beaucoup ne pouvait donc plus rien recevoir de nous : ses propres ventes remplissaient
// le plafond. Règle (29/10) : un mail DÉCLENCHÉ PAR UNE VENTE n'entre pas dans le compte — il répond à
// quelque chose qui vient d'arriver au vendeur, il n'est pas une sollicitation. Liste FERMÉE : un type
// nouveau compte par défaut (on préfère retenir une campagne que noyer une boîte).
// Lecture seule ; aucune autre règle de la porte ne change (support jamais plafonné, désinscription).
// Banc : scripts/plafond-mails-selftest.mjs (`npm run selftest:plafond-mails`).

export const PLAFOND_24H = 2;

/** Préfixes des types déclenchés par une vente (email_type = `${prefixe}:${id}`). */
export const PREFIXES_HORS_PLAFOND = Object.freeze(['vente:']);
/** Types exacts déclenchés par une vente. `ventes_du_jour` : récapitulatif des ventes (supprimé le 06/10, lignes anciennes). */
export const TYPES_HORS_PLAFOND = Object.freeze(['ventes_du_jour']);

/** Ce type de mail compte-t-il dans le plafond de 2 / 24 h ? (inconnu, vide → oui) */
export function compteDansPlafond(type) {
  const t = String(type ?? '');
  if (TYPES_HORS_PLAFOND.includes(t)) return false;
  return !PREFIXES_HORS_PLAFOND.some((p) => t.startsWith(p));
}

/** Le nombre de mails qui comptent, sur des lignes email_logs ({ email_type }). */
export function mailsQuiComptent(lignes) {
  return (Array.isArray(lignes) ? lignes : []).filter((l) => compteDansPlafond(l?.email_type)).length;
}
