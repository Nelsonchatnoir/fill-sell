// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME BLOQUÉE NE BLOQUE JAMAIS LES AUTRES (14/11/2026, urgence af37fa49 — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel (af37fa49, Pro + Cloud, 14/11) : plus aucune tâche faite depuis 14:59:36 alors que ~400 attendaient et que son
// poste Cloud battait. Deux règles de get-pending-jobs s'enrayaient sur une plateforme qui ne PEUT pas partir (Beebs non
// connectée au Cloud — la connexion « Continuer avec Kiabi » refusée par le Cloud — et eBay au compte vendeur pas prêt) :
//   1. la file des republications ne sert qu'UNE tâche « capturée » par plateforme (la plus ancienne) : c'était la copie
//      Vinted d'un article RETENU (sa copie Beebs retirée le 11/11, jamais recréée : « jamais deux annonces hors ligne ») ;
//      retenue plus bas, elle n'était jamais servie mais gardait la place — chaque passage capturait un article de plus,
//      aucun n'allait au bout ;
//   2. le tour des publications programmées tombait sur Beebs, servie puis écartée par le routage Cloud (plateforme non
//      connectée au Cloud) : la place restait vide jusqu'à la rotation du tour.
// Règle : une republication retenue ne prend JAMAIS la place de sa plateforme ; une plateforme qui ne peut pas partir sur
// ce poste ne prend jamais le tour. La cadence (créneaux, plafonds, espacement, une à la fois) ne change pas.
// Pur (Deno + Node) : scripts/file-sans-blocage-selftest.mjs.

/** Les plateformes qu'exécute un poste (extension, Cloud). eBay passe par l'API (ebay-api-worker), jamais par un poste. */
export const PLATEFORMES_POSTE = Object.freeze(["vinted", "leboncoin", "beebs", "depop"]);

/** La republication porte-t-elle une retenue « annonce hors ligne » encore posée (get-pending-jobs, messageRetenueHorsLigne) ? */
export function retenueActive(pf) {
  const r = pf && typeof pf === "object" ? pf.retenue_hors_ligne : null;
  return Boolean(r && typeof r === "object");
}

/**
 * Le candidat de la file des republications pour UNE plateforme et UNE étape : le premier dans la file (placeDansLaFile),
 * parmi ceux qui peuvent partir — jamais une republication retenue, jamais une échéance pas encore venue.
 */
export function candidatRepublication(cands, { placeDansLaFile, enAttente = () => false, pfOf = (j) => j?.platform_fields ?? {} }) {
  const libres = (Array.isArray(cands) ? cands : []).filter((j) => !enAttente(j) && !retenueActive(pfOf(j)));
  if (!libres.length) return null;
  return libres.reduce((a, b) => (placeDansLaFile(b) < placeDansLaFile(a) ? b : a));
}

/** Les plateformes qu'un POSTE CLOUD ne peut pas exécuter maintenant : celles qui ne sont pas connectées au Cloud. */
export function plateformesHorsDuPosteCloud({ posteCloud, connectees }) {
  if (!posteCloud) return new Set();
  const ok = new Set([...(connectees ?? [])].map(String));
  return new Set(PLATEFORMES_POSTE.filter((p) => !ok.has(p)));
}
