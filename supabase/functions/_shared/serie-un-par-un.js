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
//   1. la série n'est pas arrêtée : aucune tâche de la série « failed » ou « needs_user », aucun dépôt refusé
//      noté APRÈS le début de la série (depots_refuses_lbc, règle B) — sinon plus rien ne part (arrêt au premier refus) ;
//   2. toutes celles de rang plus petit sont « published » ET vues en ligne après leur dépôt (veille : vu_en_ligne_le ;
//      ou un relevé complet commencé après le dépôt qui la voit en ligne) ;
//   3. le dépôt précédent date d'au moins intervalle_min minutes.
// Une seule tâche de la série par passage. Tenue = pending, intacte, sans écriture. Quand la précédente est partie mais
// pas encore vue, RELEVE_APRES_MIN minutes après son dépôt et sans relevé depuis autant, le serveur demande UN relevé
// « Mes annonces » (lecture seule, serveur:verif_redepot) — jamais s'il y en a déjà un en file : au plus un relevé
// toutes les 45 min tant qu'un dépôt attend d'être vu (la règle B finit par trancher un dépôt jamais paru).
// Le blocage d'accès Leboncoin du compte (blocage-leboncoin.js) reste au-dessus de tout : rien ne part pendant une pause.
// Pur (Deno + Node) : get-pending-jobs, scripts/serie-un-par-un-selftest.mjs.

export const CLE_SERIE = "serie_un_par_un";
export const RELEVE_APRES_MIN = 45;
// Une tâche de la série refusée ou bloquée arrête tout ; une tâche ANNULÉE (article vendu ailleurs, retirée par la
// personne) n'est ni un refus ni une étape : elle sort de la série.
const ARRET = new Set(["failed", "needs_user"]);

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
  return { serie, rang, intervalle_min: Number.isFinite(intervalle) && intervalle >= 0 ? intervalle : 60, le: s.le ?? null };
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
 * @param {{ vuesParReleve?: Set<string>, dernierReleveMs?: number | null, releveEnFile?: boolean, maintenant?: number }} [o]
 * @returns {{ servir: boolean, motif: string, demanderReleve?: boolean }}
 */
export function decisionSerie(job, membres, o = {}) {
  const { vuesParReleve = new Set(), dernierReleveMs = null, releveEnFile = false, maintenant = Date.now() } = o;
  const s = serieDuJob(job);
  if (!s) return { servir: true, motif: "hors_serie" };
  const debut = ms(s.le);
  const meme = (membres ?? []).filter((m) => serieDuJob(m)?.serie === s.serie);
  const arret = meme.find((m) => ARRET.has(String(m.status ?? "")) || refuseeDepuis(m, debut));
  if (arret) return { servir: false, motif: `serie_arretee:${String(arret.id).slice(0, 8)}` };
  const avant = meme.filter((m) => serieDuJob(m).rang < s.rang && String(m.id) !== String(job.id) && String(m.status ?? "") !== "cancelled")
    .sort((a, b) => serieDuJob(a).rang - serieDuJob(b).rang);
  for (const m of avant) {
    if (String(m.status ?? "") !== "published") return { servir: false, motif: `attend_rang_${serieDuJob(m).rang}` };
    const depot = ms(m.published_at);
    const vueVeille = depot != null && ms(m.vu_en_ligne_le) != null && ms(m.vu_en_ligne_le) > depot;
    if (!vueVeille && !vuesParReleve.has(String(m.id))) {
      const demander = !releveEnFile && depot != null && maintenant - depot >= RELEVE_APRES_MIN * 60_000
        && (dernierReleveMs == null || dernierReleveMs < depot || maintenant - dernierReleveMs >= RELEVE_APRES_MIN * 60_000);
      return { servir: false, motif: `rang_${serieDuJob(m).rang}_pas_encore_vu_en_ligne`, demanderReleve: demander };
    }
  }
  const precedent = avant.at(-1);
  if (precedent) {
    const depot = ms(precedent.published_at);
    if (depot != null && maintenant < depot + s.intervalle_min * 60_000) return { servir: false, motif: "intervalle" };
  }
  return { servir: true, motif: "a_son_tour" };
}
