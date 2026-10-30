// ═══════════════════════════════════════════════════════════════════════════
// UNE REMISE EN LIGNE « RECRÉÉE » SANS NUMÉRO : LES RELEVÉS TRANCHENT (30/10, lot E — Johan, tiblancdeshaut)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ : trois republications Leboncoin de Johan (fanion AS Monaco 698823bc, casquette Georgia
// 098cab75, jean Lee 7ff873c5) ont été redéposées les 26, 27 et 29/10 par la 0.6.153 : étape « recreated » écrite,
// SANS numéro sur le job (dépôt confirmé, lien différé). Les relevés n'ont jamais revu la casquette (3296315778) ni
// le jean (3296005486) — pages publiques en 410 « désactivée » le 30/10 — ; le fanion (3297691558) a été vu en ligne
// jusqu'au 30/10 15:01, puis Johan l'a redéposé lui-même (3298266722, 15:23). Le 30/10 à 14:06, « Republier » (app,
// republierSansConfirmation) a remis les trois en file à l'étape « recreated » : l'extension ne connaît pas cette
// étape au départ d'un job → « Étape de republication inconnue : recreated », needs_user, et plus rien ne bougeait.
// La règle du 15/10 (republication-finie.js) ne close que si le job porte le numéro de sa nouvelle annonce ; « sans
// numéro : servi comme avant » — c'était le trou.
//
// LA RÈGLE, toutes plateformes, toutes versions d'extension (le serveur tranche AVANT de servir) :
//   1. la nouvelle annonce de CE job (son numéro, ou la ligne de relevé qui le désigne) est VUE EN LIGNE au dernier
//      relevé complet → close « published » sur elle (clôture propre) ;
//   2. sinon, une autre annonce de la MÊME fiche, même plateforme, est vue en ligne au dernier relevé complet →
//      close sans rouge (« ton article y est en ligne sous l'annonce … ») : rien à redéposer ;
//   3. la fiche n'est plus à vendre (vendue, supprimée) → close sans rouge, rien redéposé ;
//   4. sinon → REPRISE SANS DOUBLON : retour à l'étape « deleted » avec le marqueur `recreation_depot_parti` — la
//      garde existante de get-pending-jobs (recreation-deja-partie.js) relit les annonces du compte (relevé complet
//      commencé APRÈS ce marqueur) avant tout redépôt : une annonce apparue et toujours là → rattachée ou question,
//      jamais un second dépôt ; aucune → redépôt.
//   Vinted : la nouvelle annonce (new_vinted_item_id) rattachée à la fiche par le relevé du dressing (inventaire.
//   vinted_item_id) → close « published » ; sinon le dressing tranche déjà (recreation-vinted-verifiee.js) : rien ici.
// Jamais un titre, une photo ou un prix : un numéro, une ligne de relevé désignée par le job, ou la fiche.
// Module PUR (Deno + Node) : get-pending-jobs (tâches en file) et handler-watch (tâches déjà passées à la personne)
// lisent la base et écrivent ; ici, on juge.

import { republicationFinie } from "./republication-finie.js";
import { archiverErreur } from "./erreurs-archivees.js";

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const NUMERO_RE = /^\d{6,}$/;
// Marge entre le début du relevé et la vue d'une ligne (horloges, lecture par pages).
export const MARGE_RELEVE_MS = 5 * 60_000;
const NOMS = { leboncoin: "Leboncoin", beebs: "Beebs", vinted: "Vinted", depop: "Depop", ebay: "eBay" };
const STATUTS_FICHE_FINIS = /^(vendu|vendue|sold|supprime|supprimee|archive|archivee|donne|donnee)$/i;

/** Une republication à l'étape « recreated » qui ne porte PAS le numéro de sa nouvelle annonce. */
export function etapeRecreatedSansNumero(job) {
  if (!job || job.action !== "republish") return false;
  // (30/10, 19:50) Jamais une tâche CLOSE (failed) : un échec terminal ne se rouvre que par la personne. Le 30/10 à
  // 18:39, une première version reprenait aussi les « failed » : la republication Beebs de XEWER (6a38d0b6, numéro
  // 34140079 refusé par la vérification Beebs le 25/10) a été redéposée à 19:48 (34267671) sans geste de sa part.
  if (!["pending", "needs_user"].includes(String(job.status ?? ""))) return false;
  const pf = objet(job.platform_fields) ?? {};
  if (pf.republish_step !== "recreated") return false;
  // Un numéro refusé par la vérification Beebs (refus prouvé, lot A point 8) : jamais repris ici.
  if (objet(pf.refus_verification_beebs)?.numero) return false;
  return !republicationFinie(job);
}

/** Les numéros que CE job donne à sa nouvelle annonce (jamais l'ancienne). */
export function numerosDeLaRecreation(job) {
  const pf = objet(job?.platform_fields) ?? {};
  const ancien = String(pf.old_platform_listing_id ?? pf.old_vinted_item_id ?? "").trim()
    || (String(pf.old_listing_url ?? "").match(/(\d{6,})(?:[-/?#]|$)/)?.[1] ?? "");
  const brut = [
    job?.platform_listing_id, pf.new_platform_listing_id, pf.new_vinted_item_id,
    String(pf.new_listing_url ?? "").match(/(\d{6,})(?:[-/?#]|$)/)?.[1],
    objet(pf.lbc_depot)?.adsubmit?.id, objet(objet(pf.lbc_depot)?.sans_adsubmit)?.id,
    objet(pf.absence_releves)?.listing_id,
  ].map((v) => String(v ?? "").trim()).filter((n) => NUMERO_RE.test(n) && n !== ancien);
  return { ancien: ancien || null, numeros: [...new Set(brut)] };
}

/** La ligne de relevé est-elle vue en ligne au dernier relevé complet (commencé à `releveDebut`) ? */
export function vueAuDernierReleve(l, releveDebut) {
  if (!l || l.disparu_le) return false;
  if (!/^(en_ligne|en_verification)$/.test(String(l.statut_plateforme ?? ""))) return false;
  const debut = ms(releveDebut);
  const vu = ms(l.vu_le);
  return Number.isFinite(debut) && Number.isFinite(vu) && vu >= debut - MARGE_RELEVE_MS;
}

/**
 * Le verdict pour une republication « recreated » sans numéro.
 * @param {any} job
 * @param {{ lignes?: any[], releveDebut?: string|null, ficheStatut?: string|null, ficheVintedId?: string|null }} [ctx]
 *   lignes : annonces_plateforme du compte sur la plateforme (celles du job, de ses numéros, de sa fiche) ;
 *   releveDebut : début du dernier relevé COMPLET de la plateforme (null = aucun) ;
 *   ficheStatut / ficheVintedId : la fiche (inventaire.statut, inventaire.vinted_item_id).
 * @returns {{ verdict: "clore"|"close_ailleurs"|"close_fiche_finie"|"reprendre"|"rien", listing_id?: string, url?: string|null, motif: string }}
 */
export function decisionRecreatedSansNumero(job, { lignes = [], releveDebut = null, ficheStatut = null, ficheVintedId = null } = {}) {
  if (!etapeRecreatedSansNumero(job)) return { verdict: "rien", motif: "pas une remise en ligne « recreated » sans numéro" };
  const pf = objet(job.platform_fields) ?? {};
  const plateforme = String(job.platform ?? "");
  const { ancien, numeros } = numerosDeLaRecreation(job);
  if (plateforme === "vinted") {
    const nouveau = String(pf.new_vinted_item_id ?? "").trim();
    if (NUMERO_RE.test(nouveau) && nouveau !== ancien && String(ficheVintedId ?? "").trim() === nouveau) {
      return { verdict: "clore", listing_id: nouveau, url: `https://www.vinted.fr/items/${nouveau}`,
        motif: `nouvelle annonce ${nouveau} rattachée à la fiche par le relevé du dressing` };
    }
    return { verdict: "rien", motif: "Vinted : le dressing tranche (recreation-vinted-verifiee.js)" };
  }
  const liste = (Array.isArray(lignes) ? lignes : []).filter((l) => l && NUMERO_RE.test(String(l.listing_id ?? ""))
    && String(l.listing_id) !== String(ancien ?? ""));
  // 1. La nouvelle annonce de CE job, vue en ligne au dernier relevé complet.
  const sienne = liste.find((l) => (String(l.job_id ?? "") === String(job.id) || numeros.includes(String(l.listing_id)))
    && vueAuDernierReleve(l, releveDebut));
  if (sienne) {
    return { verdict: "clore", listing_id: String(sienne.listing_id), url: String(sienne.url ?? "") || null,
      motif: `annonce ${sienne.listing_id} de cette remise en ligne vue en ligne au dernier relevé` };
  }
  // 2. Une autre annonce de la MÊME fiche, vue en ligne au dernier relevé complet.
  if (job.inventaire_id != null) {
    const ailleurs = liste.find((l) => l.inventaire_id != null && String(l.inventaire_id) === String(job.inventaire_id)
      && vueAuDernierReleve(l, releveDebut));
    if (ailleurs) {
      return { verdict: "close_ailleurs", listing_id: String(ailleurs.listing_id), url: String(ailleurs.url ?? "") || null,
        motif: `l'article est en ligne sous l'annonce ${ailleurs.listing_id} (même fiche, vue au dernier relevé)` };
    }
  }
  // 3. La fiche n'est plus à vendre.
  if (STATUTS_FICHE_FINIS.test(String(ficheStatut ?? "").trim())) {
    return { verdict: "close_fiche_finie", motif: `fiche « ${ficheStatut} » : rien à remettre en ligne` };
  }
  // 4. Reprise sans doublon : la garde « annonce déjà partie » relit les annonces avant tout redépôt. Elle n'existe
  //    que pour Leboncoin et Beebs, et ne joue que sur un retrait daté : ailleurs, rien n'est conclu ici.
  if (!["leboncoin", "beebs"].includes(plateforme)) return { verdict: "rien", motif: `${plateforme} : aucune garde de redépôt par relevé` };
  if (!Number.isFinite(ms(pf.deleted_at))) return { verdict: "rien", motif: "retrait de l'ancienne annonce non daté : rien redéposé à l'aveugle" };
  return { verdict: "reprendre", motif: numeros.length
    ? `remise en ligne jamais vue en ligne au dernier relevé (${numeros.join(", ")})`
    : "remise en ligne sans aucun numéro connu" };
}

/** Le message d'une clôture sans rouge. */
export function messageClotureRecreated(plateforme, verdict, listingId) {
  const nom = NOMS[plateforme] ?? plateforme;
  if (verdict === "close_ailleurs") {
    return `Ton article est en ligne sur ${nom} sous l'annonce ${listingId} : rien à refaire, rien n'a été redéposé.`;
  }
  if (verdict === "close_fiche_finie") return `Cet article n'est plus à vendre : rien n'a été remis en ligne sur ${nom}.`;
  return null;
}

/**
 * L'écriture de la décision (patch PostgREST de cross_post_jobs), ou null (rien à écrire).
 * @param {any} job
 * @param {{ verdict: string, listing_id?: string, url?: string|null, motif: string }} d
 * @param {{ par: string, maintenant?: string }} o
 */
export function patchRecreatedSansNumero(job, d, { par, maintenant = new Date().toISOString() }) {
  const pf0 = objet(job?.platform_fields) ?? {};
  const pf = { ...pf0 };
  const trace = { le: maintenant, verdict: d.verdict, motif: d.motif, par, statut_avant: job.status ?? null,
    recreated_at_avant: pf0.recreated_at ?? null, ...(d.listing_id ? { annonce: d.listing_id } : {}) };
  for (const k of ["needsUserField", "needsUserFields", "champs_a_completer", "needs_user_source", "needs_user_sans_motif",
    "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "needsUserAttempts",
    "next_action_after", "processing_since", "boucle_technique"]) delete pf[k];
  if (job.error) pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error, job.status, par);
  pf.recreated_sans_numero = trace;
  if (d.verdict === "clore") {
    pf.new_listing_url = d.url ?? pf.new_listing_url ?? null;
    if (job.platform === "vinted") pf.new_vinted_item_id = d.listing_id;
    return { status: "published", error: null, platform_listing_id: d.listing_id, listing_url: d.url ?? null,
      ...(job.published_at ? {} : { published_at: String(pf0.recreated_at ?? maintenant) }), platform_fields: pf };
  }
  if (d.verdict === "close_ailleurs" || d.verdict === "close_fiche_finie") {
    return { status: "cancelled", error: messageClotureRecreated(job.platform, d.verdict, d.listing_id), platform_fields: pf };
  }
  if (d.verdict === "reprendre") {
    pf.recreation_non_confirmee = { le: maintenant, recreated_at: pf0.recreated_at ?? null, new_listing_url: pf0.new_listing_url ?? null,
      numeros: numerosDeLaRecreation(job).numeros, par };
    pf.republish_step = "deleted";
    delete pf.recreated_at;
    delete pf.new_listing_url;
    delete pf.republish_recreation;
    // La garde « annonce déjà partie » (recreation-deja-partie.js) relit les annonces du compte, avec un relevé
    // COMPLET commencé après ce marqueur, avant tout redépôt.
    pf.recreation_depot_parti = { at: maintenant, raison: "remise en ligne « recreated » sans numéro, jamais vue en ligne au dernier relevé — relue avant tout redépôt" };
    return { status: "pending", error: null, platform_listing_id: null, listing_url: null, published_at: null, platform_fields: pf };
  }
  return null;
}
