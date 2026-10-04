// ═══════════════════════════════════════════════════════════════════════════
// LES JOBS DU STOCK, RELUS PAR MORCEAUX (04/10/2026, incident CPU 99 %)
// ═══════════════════════════════════════════════════════════════════════════
// Le Stock relisait TOUT l'historique des jobs du compte (platform_fields
// compris, par pages de 1 000) toutes les 20 s : la requête la plus chère de la
// base — 5 442 appels en une demi-journée, 2 800 blocs (22 Mo) chacun.
// Ce qui peut changer en 20 s, c'est très peu :
//   · les jobs EN COURS (pending, processing, needs_user) — leur statut bouge ;
//   · ceux qui étaient en cours au tour d'avant — ils viennent de finir ;
//   · les jobs NÉS depuis la dernière lecture.
// Le reste (published, failed, deleted… d'hier) ne bouge pas, ou seulement par
// un geste du serveur rare (marqueur d'annonce disparue) : la relecture
// COMPLÈTE, toutes les 5 min et au retour d'onglet après 2 min, le rattrape.
// ⛔ Même liste de statuts, même tri, même regroupement qu'avant : un job qui
//    sort de la liste (statut hors filtre) disparaît, comme à la lecture
//    complète. Tout ou rien : une lecture en erreur ne pose rien.

export const STATUTS_LUS = Object.freeze(['pending', 'processing', 'published', 'failed', 'needs_user', 'deleted', 'cancelled', 'dry_run_completed']);
export const STATUTS_VIVANTS = Object.freeze(['pending', 'processing', 'needs_user']);
// Au-delà, la liste d'identifiants ne tient plus dans une adresse raisonnable :
// on relit tout.
export const VIVANTS_MAX = 200;

/** Le plus récent d'abord : created_at puis id, décroissants (le tri SQL). */
export function comparerJobs(a, b) {
  const ca = String(a?.created_at ?? ''), cb = String(b?.created_at ?? '');
  if (ca !== cb) return ca < cb ? 1 : -1;
  const ia = String(a?.id ?? ''), ib = String(b?.id ?? '');
  if (ia === ib) return 0;
  return ia < ib ? 1 : -1;
}

/** Une lecture COMPLÈTE remplace tout. */
export function indexerJobs(lignes) {
  const parId = new Map();
  for (const j of lignes ?? []) if (j?.id != null && STATUTS_LUS.includes(j.status)) parId.set(String(j.id), j);
  return parId;
}

/** Une lecture LÉGÈRE remplace les jobs relus ; un statut hors liste sort. */
export function fusionnerJobs(parId, lignes) {
  const out = new Map(parId);
  for (const j of lignes ?? []) {
    if (j?.id == null) continue;
    const id = String(j.id);
    if (STATUTS_LUS.includes(j.status)) out.set(id, j); else out.delete(id);
  }
  return out;
}

/** { inventaire_id: [jobs, le plus récent d'abord] } — la forme lue par le Stock. */
export function regrouperParArticle(parId) {
  const tous = [...parId.values()].sort(comparerJobs);
  const map = {};
  for (const job of tous) {
    if (!map[job.inventaire_id]) map[job.inventaire_id] = [];
    map[job.inventaire_id].push(job);
  }
  return map;
}

export function idsVivants(parId) {
  const ids = [];
  for (const [id, j] of parId) if (STATUTS_VIVANTS.includes(j.status)) ids.push(id);
  return ids;
}

/** Le created_at le plus récent connu (la borne des « nés depuis »). */
export function plusRecent(parId) {
  let max = null;
  for (const j of parId.values()) {
    const c = String(j?.created_at ?? '');
    if (c && (max == null || c > max)) max = c;
  }
  return max;
}

/**
 * Le filtre PostgREST `or` de la lecture légère, ou null s'il faut tout relire
 * (trop de jobs en cours, ou rien de connu encore).
 */
export function filtreLeger({ vivants, depuis }) {
  if (!depuis) return null;
  const ids = (vivants ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x)));
  if (ids.length > VIVANTS_MAX) return null;
  const morceaux = [`status.in.(${STATUTS_VIVANTS.join(',')})`, `created_at.gte."${depuis}"`];
  if (ids.length) morceaux.push(`id.in.(${ids.join(',')})`);
  return morceaux.join(',');
}
