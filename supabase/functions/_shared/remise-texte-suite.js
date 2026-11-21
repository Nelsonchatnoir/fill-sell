// (21/11/2026 midi, point 4 de Nico — « la correction doit partir TOUTE SEULE dès que ses fiches sont relues ») L'ENTRETIEN
// AUTOMATIQUE du texte du vendeur sur les annonces eBay en ligne (ebay-api-worker → _shared/remise-texte-vendeur-ebay.ts) :
// une passe sur cinq (minute % 10 < 2), 3 tâches marquées `platform_fields.texte_vendeur_a_remettre` au plus.
//   · le texte pas encore lu : AUCUNE écriture (la ligne n'est pas réécrite), la demande attend ; plus de 30 jours : « expiree » ;
//   · remis / déjà bon / changé par la personne : la marque part, le verdict reste noté (texte_vendeur_verdict) ;
//   · une panne (jeton, lecture, modification) : un essai de plus, la marque reste ; au 6e, « abandon ».
// Pur : testé par scripts/texte-vendeur-ebay-auto-selftest.mjs.
export const REMISE_TEXTE_PAR_PASSE = 3;
export const REMISE_TEXTE_ESSAIS_MAX = 6;
export const REMISE_TEXTE_EXPIRE_MS = 30 * 24 * 3600_000;

/**
 * Ce que l'entretien écrit pour une issue `r` de remettreTexteVendeurEbay (pure). `marque` : la marque de la tâche.
 * Rend null (rien à écrire), ou { garder: true, marque } (un essai de plus), ou { garder: false, verdict } (la marque part).
 */
export function suiteRemiseTexte(marque, r, maintenant = Date.now()) {
  const m = marque && typeof marque === 'object' ? marque : {};
  const le = new Date(maintenant).toISOString();
  if (r?.ok && r.verdict === 'texte_pas_encore_lu') {
    const depuis = Date.parse(String(m.demande_le ?? ''));
    if (Number.isFinite(depuis) && maintenant - depuis > REMISE_TEXTE_EXPIRE_MS) return { garder: false, verdict: { le, verdict: 'expiree' } };
    return null;
  }
  if (r?.ok && r.verdict && !r.simulation) return { garder: false, verdict: { le, verdict: r.verdict } };
  const essais = (Number(m.essais) || 0) + 1;
  if (essais >= REMISE_TEXTE_ESSAIS_MAX) return { garder: false, verdict: { le, verdict: 'abandon', motif: r?.motif ?? null, essais } };
  return { garder: true, marque: { ...m, essais, dernier_echec: { le, motif: r?.motif ?? null } } };
}
