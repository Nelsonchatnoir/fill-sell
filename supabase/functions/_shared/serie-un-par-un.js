// ═══════════════════════════════════════════════════════════════════════════
// UNE SÉRIE DE DÉPÔTS, UN PAR UN, CHACUN VU EN LIGNE AVANT LE SUIVANT (06/11 soir, décision de Nico — Louis, Amiral)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : Leboncoin a restreint l'accès d'Amiral ; ses ventes n'ont plus été lues, puis 7 ont été découvertes d'un coup
// (06/11 07:15) et 7 remises en vente presque identiques sont parties de 07:22 à 07:29 : Leboncoin les a toutes
// bloquées. Décision de Nico : cas exceptionnel (personne ne vend 7 fois le même article d'un coup), la règle A (remise
// retenue tant que l'annonce vendue est visible) est RETIRÉE — en temps normal la remise part tout de suite, comme en
// octobre — et ces remises-là repartent UNE PAR UNE, à cadence tranquille, chacune vue en ligne avant la suivante,
// arrêt au premier refus.
//
// LE CIRCUIT (n'importe quel compte, posé par une réparation, jamais tout seul) : chaque tâche de la série porte
// platform_fields.serie_un_par_un = { serie, rang, intervalle_min, le, pose_par }. get-pending-jobs ne sert une tâche
// de la série que si :
//   1. la série n'est pas arrêtée : aucune tâche de la série « failed » ou « needs_user » sur un refus de la plateforme,
//      aucun dépôt refusé noté APRÈS le début de la série (depots_refuses_lbc, règle B) — sinon plus rien ne part ;
//   2. (07/11 nuit) aucune autre tâche de la série n'est en cours de dépôt, ni déposée depuis le début de la série sans
//      avoir été vue en ligne (veille : vu_en_ligne_le ; ou un relevé complet commencé après le dépôt qui la voit en
//      ligne) — une tâche qui ATTEND (pending) est sautée, jamais attendue ;
//   3. le dernier dépôt de la série date d'au moins intervalle_min minutes.
// Une seule tâche de la série par passage (le plus petit rang qui peut partir). Tenue = pending, intacte, sans
// écriture. Quand la précédente est partie mais
// pas encore vue, RELEVE_APRES_MIN minutes après son dépôt et sans relevé depuis autant, le serveur demande UN relevé
// « Mes annonces » (lecture seule, serveur:verif_redepot) — jamais s'il y en a déjà un en file : au plus un relevé
// toutes les 45 min tant qu'un dépôt attend d'être vu (la règle B finit par trancher un dépôt jamais paru).
// Le blocage d'accès Leboncoin du compte (blocage-leboncoin.js) reste au-dessus de tout : rien ne part pendant une pause.
// Pur (Deno + Node) : get-pending-jobs, scripts/serie-un-par-un-selftest.mjs.

export const CLE_SERIE = "serie_un_par_un";
export const RELEVE_APRES_MIN = 45;
// Une tâche de la série refusée ou bloquée arrête tout ; une tâche ANNULÉE (article vendu ailleurs, retirée par la
// personne) n'est ni un refus ni une étape : elle sort de la série.
// (07/11 nuit, point 2 de Nico) Une tâche « needs_user » n'arrête plus la série que si c'est un REFUS de la plateforme
// (modération, refus nommé) : une question à la personne est une attente, et une attente ne bloque jamais les suivantes.
const ARRET = new Set(["failed"]);
const estRefusEnAttente = (m) => String(m?.status ?? "") === "needs_user"
  && /moderation|refus/i.test(String(objet(m?.platform_fields)?.needs_user_source ?? ""));

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/** Le marqueur de série d'une tâche, propre, ou null. */
export function serieDuJob(job) {
  const s = objet(objet(job?.platform_fields)?.[CLE_SERIE]);
  if (!s) return null;
  const serie = String(s.serie ?? "").trim();
  const rang = Number(s.rang);
  const intervalle = Number(s.intervalle_min);
  if (!serie || !Number.isInteger(rang) || rang < 1) return null;
  const exige = /^\d+\.\d+\.\d+$/.test(String(s.exige_version ?? "")) ? String(s.exige_version) : null;
  return { serie, rang, intervalle_min: Number.isFinite(intervalle) && intervalle >= 0 ? intervalle : 60, le: s.le ?? null, exige_version: exige };
}

/** Un dépôt refusé noté APRÈS le début de la série (règle B) ? */
function refuseeDepuis(job, debutMs) {
  const refus = objet(job?.platform_fields)?.depots_refuses_lbc;
  if (!Array.isArray(refus)) return false;
  return refus.some((r) => { const t = ms(r?.at); return t != null && (debutMs == null || t > debutMs); });
}

/**
 * La décision pour UNE tâche de série.
 * vuesParReleve : id des tâches vues en ligne par un relevé commencé après leur dépôt ; dernierReleveMs : début du
 * dernier relevé « fini » de la plateforme pour ce compte ; releveEnFile : un relevé de la plateforme est déjà en file.
 * @param {Record<string, any>} job  la tâche (pending) à servir ou non
 * @param {Array<Record<string, any>>} membres  toutes les tâches de la même série (même compte), elle comprise
 * @param {{ vuesParReleve?: Set<string>, dernierReleveMs?: number | null, releveEnFile?: boolean, maintenant?: number, version?: string }} [o]
 *   version : la version de l'extension du poste qui demande (« 0.6.176 »).
 * @returns {{ servir: boolean, motif: string, demanderReleve?: boolean }}
 */
export function decisionSerie(job, membres, o = {}) {
  const { vuesParReleve = new Set(), dernierReleveMs = null, releveEnFile = false, maintenant = Date.now(), version = "" } = o;
  const s = serieDuJob(job);
  if (!s) return { servir: true, motif: "hors_serie" };
  // (06/11 soir, Louis « SEB ») Une tâche de la série qui a besoin d'un correctif de l'extension l'attend : propre à la
  // série posée par réparation (exige_version), jamais une retenue générale par version (abandonnée le 06/11).
  if (s.exige_version && versionAvant(version, s.exige_version)) return { servir: false, motif: `attend_extension_${s.exige_version}` };
  const debut = ms(s.le);
  const meme = (membres ?? []).filter((m) => serieDuJob(m)?.serie === s.serie);
  const arret = meme.find((m) => ARRET.has(String(m.status ?? "")) || estRefusEnAttente(m) || refuseeDepuis(m, debut));
  if (arret) return { servir: false, motif: `serie_arretee:${String(arret.id).slice(0, 8)}` };
  // (07/11 nuit, Louis — point 2 de Nico) UNE TÂCHE QUI ATTEND NE BLOQUE JAMAIS LES SUIVANTES. Avant : chaque rang
  // attendait que TOUS les rangs plus petits soient publiés ; le rang 5 de Louis (sa vendue disparue le 06/11 à 22:01)
  // a été tenu 24 h derrière les rangs 1 à 4, eux-mêmes retenus par la règle A (vendues encore affichées) —
  // « tenue — attend_rang_1 » à chaque passage. Désormais la série tient « un dépôt à la fois » sur ce qui est
  // RÉELLEMENT parti : un autre membre en cours de dépôt, ou déposé depuis le début de la série et pas encore vu en
  // ligne, retient les autres ; l'intervalle court depuis le dernier dépôt de la série (quel que soit son rang). Un
  // membre en attente (pending : retenu ailleurs, ou pas encore servi) est SAUTÉ. Parmi ceux qui peuvent partir,
  // get-pending-jobs sert le plus petit rang, un seul par passage. L'arrêt au premier refus est gardé.
  const autres = meme.filter((m) => String(m.id) !== String(job.id))
    .sort((a, b) => serieDuJob(a).rang - serieDuJob(b).rang);
  let dernierDepot = null;
  for (const m of autres) {
    const st = String(m.status ?? "");
    if (st === "processing") return { servir: false, motif: `rang_${serieDuJob(m).rang}_en_cours` };
    if (st !== "published") continue;
    const depot = ms(m.published_at);
    // Un dépôt d'AVANT la série n'en est pas une étape (rien à voir, aucun intervalle).
    if (depot == null || (debut != null && depot < debut)) continue;
    if (dernierDepot == null || depot > dernierDepot) dernierDepot = depot;
    const vueVeille = ms(m.vu_en_ligne_le) != null && ms(m.vu_en_ligne_le) > depot;
    if (!vueVeille && !vuesParReleve.has(String(m.id))) {
      const demander = !releveEnFile && maintenant - depot >= RELEVE_APRES_MIN * 60_000
        && (dernierReleveMs == null || dernierReleveMs < depot || maintenant - dernierReleveMs >= RELEVE_APRES_MIN * 60_000);
      return { servir: false, motif: `rang_${serieDuJob(m).rang}_pas_encore_vu_en_ligne`, demanderReleve: demander };
    }
  }
  if (dernierDepot != null && maintenant < dernierDepot + s.intervalle_min * 60_000) return { servir: false, motif: "intervalle" };
  return { servir: true, motif: "a_son_tour" };
}

/** « 0.6.175 » est-elle avant « 0.6.176 » ? Une version illisible est avant (rien ne part sur un poste inconnu). */
export function versionAvant(v, exigee) {
  const a = String(v ?? "").match(/^(\d+)\.(\d+)\.(\d+)/);
  const b = String(exigee ?? "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!b) return false;
  if (!a) return true;
  for (let i = 1; i <= 3; i++) { if (Number(a[i]) !== Number(b[i])) return Number(a[i]) < Number(b[i]); }
  return false;
}
