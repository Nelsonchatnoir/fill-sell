// Pagination par identifiant : chaque requête est bornée, aucun total tronqué.
// Une erreur annule le résultat entier ; l'appelant garde son dernier affichage.
export async function lireToutesPages(construire, taille = 500) {
  const lignes = [];
  let apres = null;
  for (;;) {
    let requete = construire().order('id', { ascending: true }).limit(taille);
    if (apres !== null) requete = requete.gt('id', apres);
    const { data, error } = await requete;
    if (error) throw error;
    if (!data?.length) return lignes;
    const suivant = data[data.length - 1].id;
    if (suivant == null || suivant === apres) throw new Error('Pagination sans progression');
    lignes.push(...data);
    apres = suivant;
    // Même une page plus courte que demandé peut venir d'une limite serveur.
    // Seule une page vide clôt la lecture.
  }
}

// ── TOUT LIRE, DANS L'ORDRE DE L'APP : created_at desc, id desc (11/10) ─────
// Cas Rémi : 1 349 fiches, 349 absentes de l'app. PostgREST coupe TOUTE
// réponse à 1 000 lignes (max-rows), sans erreur : le `.limit(3000)` de
// l'inventaire et des ventes n'était jamais tenu (18 comptes au-delà de 1 000
// fiches, 3 au-delà de 1 000 ventes ; totaux, filtres, lot, republication
// faux). On lit donc par pages, avec une CLÉ (created_at, id) et non un
// décalage : une fiche insérée (synchro) ou sortie (fusion) pendant la lecture
// ne fait ni doubler ni sauter une autre.
// ⛔ Jamais `order by id` seul pour une table de l'app : sur `ventes`, Postgres
// choisissait alors la clé primaire (30 863 lignes d'AUTRES comptes écartées,
// 394 ms à froid, mesuré le 11/10). Trier par created_at garde le plan d'avant
// (index user_id + tri), page après page.
// `construire()` rend la requête filtrée SANS order, limit, range ni or (la
// clé de page passe par `.or()`), et la sélection porte `id` et `created_at`.
// Une erreur annule le tout (l'appelant garde son dernier affichage) ; seule
// une page vide clôt la lecture.
export async function lireToutesPagesRecentsDabord(construire, taille = 1000) {
  const lignes = [];
  let cle = null;
  for (;;) {
    let requete = construire();
    if (cle) requete = requete.or(filtreApresCle(cle));
    requete = requete.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(taille);
    const { data, error } = await requete;
    if (error) throw error;
    if (!data?.length) return lignes;
    const fin = data[data.length - 1];
    if (fin?.id == null || !('created_at' in fin)) throw new Error('Pagination sans clé (id, created_at)');
    const suivante = { created_at: fin.created_at ?? null, id: fin.id };
    if (cle && suivante.id === cle.id && suivante.created_at === cle.created_at) throw new Error('Pagination sans progression');
    lignes.push(...data);
    cle = suivante;
  }
}

// Les lignes qui SUIVENT `cle` dans l'ordre created_at desc (NULL d'abord,
// comme Postgres en desc), id desc. La date est citée : « : » et « . » sont
// réservés par la syntaxe des filtres PostgREST (éprouvé le 11/10 : citée,
// une date fausse revient en erreur de conversion, donc la valeur est lue).
export function filtreApresCle({ created_at, id }) {
  if (created_at == null) return `and(created_at.is.null,id.lt.${id}),created_at.not.is.null`;
  const t = `"${created_at}"`;
  return `created_at.lt.${t},and(created_at.eq.${t},id.lt.${id})`;
}
