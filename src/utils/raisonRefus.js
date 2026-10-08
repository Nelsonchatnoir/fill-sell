// ── La raison d'un refus du serveur, dite à la personne (08/10/2026 soir) ─────
// check-listing-status refuse une vente en 409 avec { error: "<la raison en
// français>" } (enregistrer_vente_atomique : « Cette annonce est toujours en
// ligne sur Vinted… », « Cet article est de nouveau en ligne sur Vinted sous une
// autre annonce… »). supabase.functions.invoke transforme tout non-2xx en
// `error` et garde le corps dans error.context (une Response) : l'app ne
// montrait qu'« Une erreur est survenue », et la personne ne savait ni pourquoi
// ni quoi faire (cas Bebertdeals, 08/10). On lit la raison ; un corps illisible
// (coupure, fonction absente) rend null — l'appelant garde son message général.
// Seulement les refus métier (409) : une panne n'est jamais déguisée en raison.
export async function raisonRefus(error) {
  if (!error) return null;
  const statut = error.context?.status;
  if (statut != null && statut !== 409) return null;
  let corps = null;
  try { corps = await error.context?.json?.(); } catch { /* corps illisible */ }
  const r = corps?.error ?? corps?.reason;
  return typeof r === 'string' && r.trim() && r.length <= 500 ? r.trim() : null;
}

/** Une erreur qui porte la raison du serveur (`.raison`) quand il y en a une. */
export async function erreurAvecRaison(error) {
  const e = error instanceof Error ? error : new Error(String(error?.message ?? error));
  e.raison = await raisonRefus(error);
  return e;
}
