// ═══════════════════════════════════════════════════════════════════════════
// LES PLATEFORMES OÙ UN COMPTE A RÉELLEMENT DE L'ACTIVITÉ (16/11/2026 nuit, point 2 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// La règle (connexionsCloud.plateformesCloudChoisies) : les plateformes du Cloud = cochées ∪ actives − écartées. Ce module
// lit les ACTIVES, et seulement pour les plateformes du Cloud ni cochées, ni écartées, ni fermées au pays
// (connexionsCloud.plateformesActiviteALire) — 3 au plus, aucune quand rien n'est coché. Par plateforme, une ligne au
// plus par table, la première qui répond arrête les suivantes :
//   1. une annonce relevée sur la plateforme (annonces_plateforme — index user_id, platform) ;
//   2. une tâche, quel que soit son sort (cross_post_jobs : publication, republication, retrait) ;
//   3. un relevé réussi (vinted_sync_runs : done ou incomplete).
// Coût mesuré le 16/11 (EXPLAIN ANALYZE, le compte aux 8 582 tâches) : 0,05 ms pour l'annonce, 19 ms pour la tâche
// absente (le pire cas). Lu par useConnexionsCloud (clients du Cloud seulement), au plus toutes les 10 min ; une
// plateforme vue active le reste pour la session. Illisible : rien n'est affirmé (la plateforme n'est pas ajoutée).
// Aucune écriture, jamais : la liste enregistrée (plateformes_vendeur) n'est pas touchée.
// Les RETRAITS en attente d'une plateforme écartée (lireRetraitsEnAttente) : une ligne au plus par écartée du Cloud
// (index user_id, status : 0,06 ms mesuré le 16/11), relus à chaque lecture — un retrait fini, l'écartée sort.

export const STATUTS_RELEVE_REUSSI = Object.freeze(['done', 'incomplete']);
export const RELECTURE_ACTIVITE_MS = 10 * 60_000;
export const STATUTS_RETRAIT_EN_ATTENTE = Object.freeze(['pending', 'needs_user']);

const repond = async (requete) => {
  try {
    const { data, error } = await requete;
    return !error && Array.isArray(data) && data.length > 0;
  } catch { return false; }
};

/**
 * Les plateformes actives parmi `candidats` (ids), plus celles déjà connues actives. `client` : le client Supabase
 * (jeton de la personne : ses seules lignes). Ne lève jamais.
 */
export async function lirePlateformesActives(client, userId, candidats = [], dejaActives = []) {
  const connues = [...new Set((Array.isArray(dejaActives) ? dejaActives : []).map(String))];
  if (!client || !userId) return connues;
  const aLire = [...new Set((Array.isArray(candidats) ? candidats : []).map(String))].filter((p) => p && !connues.includes(p));
  const vues = await Promise.all(aLire.map(async (pf) => {
    if (await repond(client.from('annonces_plateforme').select('id').eq('user_id', userId).eq('platform', pf).limit(1))) return pf;
    if (await repond(client.from('cross_post_jobs').select('id').eq('user_id', userId).eq('platform', pf).limit(1))) return pf;
    if (await repond(client.from('vinted_sync_runs').select('id').eq('user_id', userId).eq('platform', pf)
      .in('status', STATUTS_RELEVE_REUSSI).limit(1))) return pf;
    return null;
  }));
  return [...connues, ...vues.filter(Boolean)];
}

/** Les plateformes (parmi `ecartees`) où un retrait attend : en file ou en attente d'un geste. Ne lève jamais. */
export async function lireRetraitsEnAttente(client, userId, ecartees = []) {
  if (!client || !userId) return [];
  const aLire = [...new Set((Array.isArray(ecartees) ? ecartees : []).map(String))].filter(Boolean);
  const vues = await Promise.all(aLire.map(async (pf) => (await repond(client.from('cross_post_jobs').select('id').eq('user_id', userId)
    .eq('platform', pf).eq('action', 'delete').in('status', STATUTS_RETRAIT_EN_ATTENTE).limit(1)) ? pf : null)));
  return vues.filter(Boolean);
}
