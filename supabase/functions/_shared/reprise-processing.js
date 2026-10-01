// ═══════════════════════════════════════════════════════════════════════════
// UN « EN COURS » NE RESTE JAMAIS FIGÉ (2026-10-02)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : ornellaracano, retrait Vinted fb9cd238 (Service à café),
// 'processing' du 01/10 01:43 au 01/10 23:23 — 22 h — alors que ses autres
// postes interrogeaient la file toute la journée. Relancé à la main par Nico.
//
// POURQUOI PERSONNE NE LE REPRENAIT. Depuis la réservation par poste (point C,
// 28/09), un job 'processing' appartient au poste qui l'a pris
// (jobs_reservations_extension). Le poste 250107fb l'a pris à 01:43 puis s'est
// tu pour de bon. Les autres postes du compte voyaient le job « figé » à
// 15 min (recoverStaleProcessingJobs) et tentaient de le rendre : refusé,
// « Ce job est réservé à un autre poste » (controler_job_extension). Et le
// filet serveur (handler-watch) ne regardait que les publications et
// republications, et seulement si le COMPTE ENTIER était muet depuis 30 min
// ou 24 h : un compte à plusieurs postes n'est jamais muet. Effet de bord :
// tant que ce job restait 'processing', les postes en 0.6.80 de ce compte
// refusaient de prendre leur mise à jour (raisonsDeNePasRecharger) — le poste
// c1f22181 est passé en 0.6.82 une minute après la relance manuelle.
//
// LA RÈGLE, pour tout job 'processing' de la voie extension, quel que soit
// son type (retrait sans lien compris) :
//   · le silence se mesure sur le POSTE qui tient la réservation
//     (profiles.extension_postes[session].le) — sur le compte seulement si le
//     job n'a pas de réservation ;
//   · 45 min de prise et 30 min de silence du poste détenteur → repris ;
//   · 2 h de prise, même si le poste détenteur parle encore → repris : il
//     aurait rendu lui-même son job à 15 min, il ne le fera plus ;
//   · EXCEPTION, les étapes qui retirent l'annonce (republication à
//     'captured' ou 'deleted') : leurs reprises à 30/45 min, capture valide
//     exigée, vivent à part dans handler-watch ; sans capture valide, 24 h.
// Reprendre = repasser en 'pending' (compare-and-swap sur 'processing') ; le
// trigger liberer_reservation_job_termine rend alors la réservation, et
// n'importe quel poste à jour peut reprendre le job. Aucune unité re-débitée.
//
// ES module sans import : Deno (handler-watch) et Node (autotest).

export const REPRISE_AGE_MIN_MS = 45 * 60_000;
export const REPRISE_POSTE_MUET_MS = 30 * 60_000;
export const REPRISE_PLAFOND_MS = 2 * 3600_000;
export const REPRISE_DESTRUCTIVE_MS = 24 * 3600_000;

/** Étape d'une republication — absente ou inconnue = a_capturer (rien touché). */
export function etapeRepublish(job) {
  const s = String(job?.platform_fields?.republish_step ?? "");
  return s === "captured" || s === "deleted" ? s : "a_capturer";
}

/** L'étape retire (captured) ou a retiré (deleted) l'annonce d'origine. */
export function estEtapeDestructive(job) {
  return job?.action === "republish" && etapeRepublish(job) !== "a_capturer";
}

/** Âge de la prise : processing_since, sinon created_at ; jamais NaN. */
export function ageProcessing(job, now = Date.now()) {
  const t = Date.parse(String(job?.platform_fields?.processing_since ?? ""));
  const c = Date.parse(String(job?.created_at ?? ""));
  const depuis = Number.isFinite(t) ? t : c;
  return Number.isFinite(depuis) ? now - depuis : Infinity;
}

/** La session (claim `session_id`) d'un identifiant de poste de réservation
 *  (« session » ou « session/instance », cf. identifiantPosteExtension). */
export function sessionDuPoste(poste) {
  const s = String(poste ?? "").split("/")[0].trim();
  return s || null;
}

/**
 * Depuis combien de temps le détenteur du job se tait.
 * Réservation connue → le poste qui la tient (absent des postes = jamais revu,
 * silence infini). Sans réservation → le compte (extension_last_seen_at).
 */
export function silenceDuDetenteur({ reservationPoste, postes, compteVuLe, now = Date.now() }) {
  const session = sessionDuPoste(reservationPoste);
  if (session) {
    const p = postes && typeof postes === "object" ? postes[session] : null;
    const le = Date.parse(String(p?.le ?? ""));
    return { session, source: "poste", ms: Number.isFinite(le) ? Math.max(0, now - le) : Infinity };
  }
  const vu = Date.parse(String(compteVuLe ?? ""));
  return { session: null, source: "compte", ms: Number.isFinite(vu) ? Math.max(0, now - vu) : Infinity };
}

/**
 * Faut-il reprendre ce job 'processing' ? null = non ; sinon le motif :
 *   'poste_muet' (≥ 45 min, détenteur muet ≥ 30 min), 'plafond' (≥ 2 h),
 *   'destructive_24h' (republication à 'captured'/'deleted', ≥ 24 h).
 */
export function motifReprise(job, { silenceMs, now = Date.now() }) {
  if (!job || job.voie === "api") return null; // l'API eBay a sa propre reprise (ebay-api-worker)
  const age = ageProcessing(job, now);
  if (estEtapeDestructive(job)) return age >= REPRISE_DESTRUCTIVE_MS ? "destructive_24h" : null;
  if (age >= REPRISE_PLAFOND_MS) return "plafond";
  if (age >= REPRISE_AGE_MIN_MS && silenceMs >= REPRISE_POSTE_MUET_MS) return "poste_muet";
  return null;
}
