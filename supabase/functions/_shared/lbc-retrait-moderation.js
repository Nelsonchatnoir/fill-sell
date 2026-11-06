// ═══════════════════════════════════════════════════════════════════════════
// RETRAIT LEBONCOIN : UN 410 DANS LA FENÊTRE DE MODÉRATION D'UN DÉPÔT RÉCENT = ATTENTE, PAS UN ESSAI
// (06/11, ordre de Nico, point 11 — Cédric GRIZSTYLE, retrait 1b7be2d6, annonce 3303036848)
// ═══════════════════════════════════════════════════════════════════════════
// LA RÈGLE (Nico, 06/11) : une annonce Leboncoin « désactivée » ou introuvable (HTTP 410/404) est HORS LIGNE — le
// retrait se clôt comme fait, sans message au vendeur (l'extension : checkListingState → « unavailable » →
// cloreRetraitDejaAbsent, drapeau deja_absente ; règle du 25/10, _shared/retrait-deja-absent.js). GARDE-FOU : jamais
// confondre avec une annonce en cours de modération, qui reviendrait en ligne (double vente).
// Ce que Leboncoin distingue, et ce qu'il ne distingue pas (relevé du 06/11) :
//   · la page publique NON : même 410, même <title>Annonce introuvable</title>, même <h1>Cette annonce est désactivée</h1>
//     pour une annonce supprimée, expirée, refusée ou encore en modération (relevés du 19/07 et du 22/10) ;
//   · le statut du tableau de bord du vendeur (statut_brut, relevé « Mes annonces ») non plus, à ce jour : valeurs vues
//     sur 19 155 annonces — active, paused, inactive —, et l'annonce de Cédric y était « active » à 22:30 (Paris), trois minutes
//     après son dépôt, avant les 410 de 22:48 et 23:04 ;
//   · reste le TEMPS : l'extension (≥ 0.6.130) ne conclut rien d'un 410 lu moins de 2 h après le dépôt FillSell de
//     l'annonce (LBC_MODERATION_MS, raison « moderation_recente ») — elle le rend « inconnu ».
// LE DÉFAUT : chacun de ces « inconnu » était compté comme un essai raté (rearmBounded : 5 essais à 5/15/30/60 min),
// tous DANS la fenêtre de 2 h — le retrait s'arrêtait en rouge « retire-la à la main » avant que la fenêtre se ferme,
// sans jamais relire l'annonce après. LA CORRECTION : un 410/404 lu dans la fenêtre de modération n'est PAS un essai —
// pending, compteur de la base, relecture toutes les LBC_MODERATION_REESSAI_MIN minutes. La fenêtre passée, le 410 se
// lit « hors ligne » et le retrait se clôt seul, sans message ; si l'annonce est sortie de modération EN LIGNE, elle
// est retirée normalement. Bornée : au-delà de LBC_MODERATION_ATTENTE_MAX_MS d'attente, le chemin ordinaire reprend.
// Pur, sans réseau (Deno + Node).

export const LBC_MODERATION_REESSAI_MIN = 15;
export const LBC_MODERATION_ATTENTE_MAX_MS = 6 * 3600_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** La lecture de CET essai dit-elle « 410/404 dans la fenêtre de modération » ? (la lecture, ou null) */
export function lecture410Moderation(pf) {
  const l = objet(objet(pf)?.lecture_etat_retrait);
  if (!l || l.raison !== "moderation_recente") return null;
  const http = Number(l.http);
  return http === 410 || http === 404 ? l : null;
}

/**
 * L'attente d'un retrait Leboncoin dont l'essai a lu un 410/404 dans la fenêtre de modération, ou null (chemin ordinaire).
 * @param {{ job: { action?: string, platform?: string } | null, pfBase: Record<string, unknown>|null, pfCorps: Record<string, unknown>|null, maintenant?: number }} a
 * @returns {null | { pf: Record<string, unknown>, message: string, raison: string }}
 */
export function attenteModerationLbc({ job, pfBase, pfCorps, maintenant = Date.now() }) {
  if (job?.action !== "delete" || job?.platform !== "leboncoin") return null;
  const lecture = lecture410Moderation(pfCorps);
  if (!lecture) return null;
  const base = objet(pfBase) ?? {};
  const avant = objet(base.retrait_attente_moderation_lbc);
  const depuisMs = Date.parse(String(avant?.depuis ?? ""));
  if (Number.isFinite(depuisMs) && maintenant - depuisMs > LBC_MODERATION_ATTENTE_MAX_MS) return null;
  const maintenantIso = new Date(maintenant).toISOString();
  const {
    needs_user_source: _nus, pas_de_rouge: _pdr, blocage_antirobot: _ba, needs_user_tick_le: _nt, needs_user_actif_ms: _na,
    needs_user_vu_le: _nv, needs_user_vu_erreur: _ne, ...pfSans
  } = objet(pfCorps) ?? {};
  const lectures = (Number(avant?.lectures) || 0) + 1;
  return {
    pf: {
      ...pfSans,
      needsUserAttempts: Number(base.needsUserAttempts ?? 0) || 0,
      next_action_after: new Date(maintenant + LBC_MODERATION_REESSAI_MIN * 60_000).toISOString(),
      retrait_attente_moderation_lbc: {
        depuis: Number.isFinite(depuisMs) ? avant.depuis : maintenantIso,
        derniere: maintenantIso,
        lectures,
        http: Number(lecture.http),
        lu_le: lecture.lu_le ?? null,
        pose_par: "update-job-status (410 dans la fenêtre de modération Leboncoin = attente, pas un essai)",
      },
    },
    message: "Leboncoin ne montre pas cette annonce, mise en ligne il y a moins de 2 h : « désactivée » le temps de sa " +
      `vérification, ou déjà retirée. Le retrait relit sa page toutes les ${LBC_MODERATION_REESSAI_MIN} min : retirée, il se ` +
      "clôt tout seul ; de retour en ligne, il la retire. Rien à faire.",
    raison: `retrait Leboncoin : ${Number(lecture.http)} dans la fenêtre de modération (lecture ${lectures}) — relecture dans ` +
      `${LBC_MODERATION_REESSAI_MIN} min, aucune tentative consommée`,
  };
}
