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
//
// ── (12/11, lot « zéro problème », N1 — 82e64f14 / 67cd1c77, 8a2eba68 / 46569b9d) VINTED : LE NUMÉRO CONNU TRANCHE ──
// Le 11/11 à 13:26 (Paris), la relecture du dressing de l'extension a retrouvé les deux nouvelles annonces par leur
// NUMÉRO (new_vinted_item_id, étape « recreated » posée) ; l'écriture « published » est tombée sur une panne de la
// plateforme (update-job-status en 503/504 de 13:24:30 à 13:27) et l'extension a écrit à la place la retenue « dépôt
// incertain » (pending) — étape « recreated » et numéro compris, sans platform_listing_id, fiche restée sur l'ancien
// numéro supprimé. La branche Vinted ci-dessous rendait « rien — le dressing tranche » : or le dressing ne tranche qu'à
// l'étape « deleted » ; la tâche n'était plus jamais servie, close ni dite, et la nouvelle annonce, vue « active » par
// les relevés, n'avait pas de fiche (une vente sur Vinted ne l'aurait pas retrouvée).
// LA RÈGLE (Vinted, tous les comptes, toutes versions d'extension — le numéro est celui de la plateforme, jamais un
// libellé ni un titre) :
//   · le numéro EXACT new_vinted_item_id (≠ l'ancien, plus grand que lui) vu « active » par un relevé du dressing
//     (vinted_listing_snapshots) APRÈS le retrait de l'ancienne annonce, et jamais vu avant lui → « clore » : published
//     sur ce numéro, la fiche passe de l'ancien numéro au nouveau (compare-and-set fait par l'appelant, AVANT la tâche) ;
//   · une autre fiche porte déjà ce numéro, la fiche n'est plus à vendre, ou elle porte un 3e numéro → la question
//     (le doute ne se tranche jamais seul) ;
//   · sans preuve : rien (le prochain relevé tranche) ; au bout de ATTENTE_RELEVE_MAX_H (6 h, la même attente que la
//     garde du dépôt incertain), comptées depuis la recréation ou la dernière relance → la question honnête, avec le lien
//     du numéro connu ;
//   · JAMAIS « reprendre » : aucun second dépôt.

import { republicationFinie } from "./republication-finie.js";
import { archiverErreur } from "./erreurs-archivees.js";
import { ATTENTE_RELEVE_MAX_H } from "./recreation-vinted-verifiee.js";

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

// ── (12/11, N1) VINTED : LA PREUVE PAR LE NUMÉRO EXACT ──────────────────────────────────────────────────────────────
/** L'heure de Paris, « 11/11 à 13:26 ». */
function heureParisN1(t) {
  try {
    const d = new Date(t);
    const j = d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
    const h = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    return `${j} à ${h}`;
  } catch { return null; }
}
const plusGrand = (a, b) => { try { return BigInt(a) > BigInt(b); } catch { return false; } };

/** Le plus tôt possible du retrait de l'ancienne annonce (horloge Vinted, poste, serveur), en ms, ou NaN. */
function retraitAncienneMs(pf) {
  const t = [objet(pf.suppression_verdict)?.date_serveur, pf.deleted_at_client, pf.deleted_at, pf.deleted_at_serveur].map(ms).filter(Number.isFinite);
  return t.length ? Math.min(...t) : NaN;
}

/**
 * La preuve qu'un numéro Vinted EXACT est en ligne après le retrait de l'ancienne annonce (pur) : un instantané du relevé
 * du dressing « active », pris après le retrait (marge de 5 min), le numéro n'ayant JAMAIS été vu avant le retrait (sinon
 * c'est une annonce qui existait déjà : pas notre remise en ligne).
 * @param {string} numero
 * @param {Array<{ vinted_item_id: string, status: string, captured_at: string }>} instantanes
 * @param {{ depuisMs: number }} o
 * @returns {null | { vuAvant: true } | { instantane: { vinted_item_id: string, status: string, captured_at: string } }}
 */
export function preuveInstantaneVinted(numero, instantanes, { depuisMs }) {
  if (!Number.isFinite(depuisMs)) return null;
  const lignes = (Array.isArray(instantanes) ? instantanes : []).filter((s) => String(s?.vinted_item_id ?? "") === String(numero));
  if (lignes.some((s) => Number.isFinite(ms(s.captured_at)) && ms(s.captured_at) < depuisMs - MARGE_RELEVE_MS)) return { vuAvant: true };
  const actives = lignes.filter((s) => String(s.status ?? "") === "active" && ms(s.captured_at) >= depuisMs - MARGE_RELEVE_MS)
    .sort((a, b) => ms(a.captured_at) - ms(b.captured_at));
  return actives.length ? { instantane: actives[0] } : null;
}

const lienVinted = (n) => `https://www.vinted.fr/items/${n}`;
/** Les questions (texte dit à la personne : jamais un ordinateur, jamais Chrome). */
export function messageQuestionRecreatedVinted(code, { numero, ancienFiche = null, recreeMs = NaN } = {}) {
  const lien = lienVinted(numero);
  if (code === "fiche_double") {
    return `Ta nouvelle annonce Vinted est en ligne (${lien}), mais elle est entrée dans ton stock comme une fiche séparée. Rien n'a été ` +
      "redéposé. Fusionne les deux fiches de cet article depuis l'app : sinon, une vente sur Vinted ne retirerait pas ses autres annonces.";
  }
  if (code === "fiche_finie") {
    return `Cet article n'est plus à vendre dans ton stock, mais sa nouvelle annonce Vinted est en ligne (${lien}) : retire-la sur Vinted ` +
      "pour ne pas le vendre deux fois. Rien n'a été redéposé.";
  }
  if (code === "fiche_autre_numero") {
    return `Ta nouvelle annonce Vinted est en ligne (${lien}), mais ta fiche porte une autre annonce Vinted${ancienFiche ? ` (n° ${ancienFiche})` : ""}. ` +
      "Rien n'a été changé ni redéposé : vérifie sur Vinted laquelle est la bonne.";
  }
  const quand = Number.isFinite(recreeMs) ? heureParisN1(recreeMs) : null;
  return `Ta nouvelle annonce a été déposée sur Vinted${quand ? ` le ${quand}` : ""} (${lien}), mais FillSell ne l'a pas revue depuis dans ` +
    "ton dressing. Pour ne jamais la mettre en ligne deux fois, rien n'est redéposé. Ouvre ce lien : si elle est en ligne, il n'y a " +
    "rien à faire — elle sera rattachée à ta fiche dès la prochaine lecture de ton dressing ; si elle n'y est pas, préviens-nous : " +
    "rien ne sera redéposé sans toi.";
}

/**
 * La branche Vinted (pur). ctx : instantanes (vinted_listing_snapshots du compte pour le nouveau numéro), ficheExiste,
 * ficheStatut, ficheVintedId, fichesAvecNouveau (ids des fiches du compte qui portent déjà le nouveau numéro),
 * maintenant (ms).
 */
function decisionVintedNumeroConnu(job, pf, ancien, ctx) {
  const { instantanes = [], ficheStatut = null, ficheVintedId = null, fichesAvecNouveau = [], maintenant = Date.now() } = ctx;
  // ficheExiste : vrai, faux (fiche supprimée : la clé étrangère remet inventaire_id à NULL), ou null = fiche illisible.
  const ficheExiste = ctx.ficheExiste === undefined ? (job.inventaire_id != null) : ctx.ficheExiste;
  const nouveau = String(pf.new_vinted_item_id ?? "").trim();
  const surFiche = String(ficheVintedId ?? "").trim();
  if (!NUMERO_RE.test(nouveau) || nouveau === ancien) return { verdict: "rien", motif: "Vinted : aucun nouveau numéro connu — le dressing tranche (recreation-vinted-verifiee.js)" };
  // Règle du 30/10 gardée : la fiche porte déjà le nouveau numéro (relevé du dressing ou rattachement) → close.
  if (surFiche === nouveau) {
    return { verdict: "clore", listing_id: nouveau, url: lienVinted(nouveau), motif: `nouvelle annonce ${nouveau} rattachée à la fiche par le relevé du dressing` };
  }
  const deja = objet(pf.recreated_sans_numero);
  const memeQuestion = (code) => job.status === "needs_user" && deja?.verdict === "question" && deja?.code === code;
  const question = (code, motif) => (memeQuestion(code)
    ? { verdict: "rien", motif: `question « ${code} » déjà posée` }
    : { verdict: "question", code, listing_id: nouveau, url: lienVinted(nouveau), motif,
      message: messageQuestionRecreatedVinted(code, { numero: nouveau, ancienFiche: surFiche || null, recreeMs: ms(pf.recreated_at) }) });
  const retrait = retraitAncienneMs(pf);
  const depuisPreuve = Number.isFinite(retrait) ? retrait : ms(pf.recreated_at);
  const numeroPlausible = !ancien || plusGrand(nouveau, ancien);
  const p = numeroPlausible ? preuveInstantaneVinted(nouveau, instantanes, { depuisMs: depuisPreuve }) : null;
  if (p?.instantane && ficheExiste === null) return { verdict: "rien", motif: `${nouveau} en ligne, mais la fiche n'a pas pu être relue — rejugé au passage suivant` };
  if (p?.instantane) {
    const autres = (Array.isArray(fichesAvecNouveau) ? fichesAvecNouveau : []).map(String).filter((id) => id !== String(job.inventaire_id ?? ""));
    if (autres.length) return question("fiche_double", `${nouveau} en ligne, mais déjà porté par une autre fiche (${autres.slice(0, 3).join(", ")})`);
    if (!ficheExiste || STATUTS_FICHE_FINIS.test(String(ficheStatut ?? "").trim())) {
      return question("fiche_finie", `${nouveau} en ligne, fiche ${ficheExiste ? `« ${ficheStatut} »` : "supprimée"}`);
    }
    if (surFiche && surFiche !== String(ancien ?? "")) return question("fiche_autre_numero", `${nouveau} en ligne, fiche sur un autre numéro (${surFiche})`);
    return {
      verdict: "clore", listing_id: nouveau, url: lienVinted(nouveau), preuve: p.instantane,
      fiche: job.inventaire_id != null ? { id: job.inventaire_id, de: surFiche || null, vers: nouveau } : null,
      motif: `nouvelle annonce ${nouveau} vue « active » par le relevé du dressing du ${p.instantane.captured_at}, après le retrait de l'ancienne`,
    };
  }
  // Sans preuve : le relevé tranche ; la question au bout de 6 h — jamais « reprendre » (aucun second dépôt).
  const reperes = [ms(pf.recreated_at), ms(objet(pf.depot_incertain)?.at), ms(pf.derniere_relance_manuelle), ms(pf.remis_en_file_le)].filter(Number.isFinite);
  const depuis = reperes.length ? Math.max(...reperes) : NaN;
  if (job.status === "pending" && Number.isFinite(depuis) && maintenant - depuis >= ATTENTE_RELEVE_MAX_H * 3600_000) {
    return question("sans_preuve", p?.vuAvant ? `${nouveau} vu avant le retrait de l'ancienne annonce : pas une preuve` : `${nouveau} jamais revu en ligne depuis la recréation`);
  }
  return { verdict: "rien", motif: p?.vuAvant ? `Vinted : ${nouveau} vu avant le retrait — pas une preuve, le relevé tranche` : `Vinted : ${nouveau} pas encore revu par un relevé du dressing — il tranche` };
}

/** Le déplacement de fiche que l'appelant fait AVANT d'écrire la tâche (compare-and-set sur `de`), ou null. */
export function ficheARattacherVinted(d) {
  return d?.verdict === "clore" && d.fiche && d.fiche.vers ? d.fiche : null;
}

/**
 * Le verdict pour une republication « recreated » sans numéro.
 * @param {any} job
 * @param {{ lignes?: any[], releveDebut?: string|null, ficheStatut?: string|null, ficheVintedId?: string|null,
 *   instantanes?: any[], fichesAvecNouveau?: Array<string|number>, ficheExiste?: boolean|null, maintenant?: number }} [ctx]
 *   lignes : annonces_plateforme du compte sur la plateforme (celles du job, de ses numéros, de sa fiche) ;
 *   releveDebut : début du dernier relevé COMPLET de la plateforme (null = aucun) ;
 *   ficheStatut / ficheVintedId : la fiche (inventaire.statut, inventaire.vinted_item_id) ;
 *   (12/11, Vinted) instantanes, fichesAvecNouveau, ficheExiste, maintenant : voir decisionVintedNumeroConnu.
 * @returns {{ verdict: "clore"|"close_ailleurs"|"close_fiche_finie"|"reprendre"|"question"|"rien", listing_id?: string, url?: string|null, motif: string, code?: string, message?: string, fiche?: any, preuve?: any }}
 */
export function decisionRecreatedSansNumero(job, ctx = {}) {
  const { lignes = [], releveDebut = null, ficheStatut = null } = ctx;
  if (!etapeRecreatedSansNumero(job)) return { verdict: "rien", motif: "pas une remise en ligne « recreated » sans numéro" };
  const pf = objet(job.platform_fields) ?? {};
  const plateforme = String(job.platform ?? "");
  const { ancien, numeros } = numerosDeLaRecreation(job);
  if (plateforme === "vinted") return decisionVintedNumeroConnu(job, pf, ancien, ctx);
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
    recreated_at_avant: pf0.recreated_at ?? null, ...(d.listing_id ? { annonce: d.listing_id } : {}),
    ...(d.code ? { code: d.code } : {}), ...(d.preuve ? { preuve: d.preuve } : {}), ...(d.fiche ? { fiche: d.fiche } : {}) };
  for (const k of ["needsUserField", "needsUserFields", "champs_a_completer", "needs_user_source", "needs_user_sans_motif",
    "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "needsUserAttempts",
    "next_action_after", "processing_since", "boucle_technique"]) delete pf[k];
  if (job.error && !(d.verdict === "question" && job.error === d.message)) pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error, job.status, par);
  pf.recreated_sans_numero = trace;
  // (12/11, N1) Vinted, numéro connu sans preuve (ou doute sur la fiche) : la question, l'étape et le numéro gardés —
  // jamais un redépôt. Sa source est celle des remises en ligne « peut-être déjà parties ».
  if (d.verdict === "question") {
    pf.needs_user_source = "recreation_deja_partie";
    pf.recreation_deja_partie = { le: maintenant, essai: pf0.recreated_at ?? null, copies: d.listing_id ? [String(d.listing_id)] : [], motif: d.code ?? null };
    return { status: "needs_user", error: d.message ?? null, platform_fields: pf };
  }
  if (d.verdict === "clore") {
    pf.new_listing_url = d.url ?? pf.new_listing_url ?? null;
    if (job.platform === "vinted") {
      pf.new_vinted_item_id = d.listing_id;
      // Les attentes de la retenue « dépôt incertain » n'ont plus d'objet : la nouvelle annonce est prouvée.
      for (const k of ["depot_incertain", "recreation_attente_releve", "recreation_deja_partie"]) delete pf[k];
    }
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
