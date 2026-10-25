// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT SUR UNE ANNONCE DÉJÀ ABSENTE EST UN RETRAIT FAIT (25/10, règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 25/10 : « UN RETRAIT SUR UNE ANNONCE DÉJÀ ABSENTE NE DOIT JAMAIS FINIR EN ERREUR … Si l'annonce est déjà
// absente (404, retirée, vendue), le retrait est considéré comme fait et se clôt seul, sans erreur ni message à
// l'utilisateur. Sur toutes les plateformes. » Cas fondateur : boncoin59300, retrait Beebs d87c8614 (33747519) —
// 30 essais, « elle reste en vente sur Beebs » (faux : page 404), clos à la main. Et sur le parc (25/10, 13:55) :
// 51 retraits ouverts dont 9 sur une annonce dont l'absence est déjà prouvée par les relevés, 133 retraits clos
// « Arrêtée » + message sur 45 jours, 400 « déjà absente » étiquetés « retirée par FillSell ».
// LA RÈGLE, en un endroit :
//   · l'issue d'une absence PROUVÉE est `deleted` (« Fait · retirée » dans l'app), `error` null, l'erreur d'avant
//     archivée, et un drapeau UNIQUE, structuré, lu partout : platform_fields.deja_absente =
//     { le, plateforme, numero, preuve: { source, … }, vente: true | null, pose_par } ;
//   · `retrait_par` se lit sur ces CHAMPS (deja_absente, delete_confirmed_by + delete_preuve, preuve_retrait),
//     jamais sur le texte d'une trace ;
//   · jamais `cancelled` ni `failed` : sur un retrait d'un « Oui » à « Déjà vendu ? », ces deux statuts DÉFONT la
//     fusion de la personne (déclencheur deja_vendu_retrait_echoue_defait) ;
//   · ⛔ JAMAIS au prix d'une double vente : une annonce qui peut encore être en ligne n'est jamais dite retirée.
//     Ce qui prouve, par NUMÉRO (jamais par titre) — table du rapport docs du 25/10 :
//       Vinted   — snapshot « sold » du relevé ; deux relevés COMPLETS du dressing de la boutique sans elle ;
//       Leboncoin, Depop, eBay — deux relevés COMPLETS sans elle ;
//       Beebs    — JAMAIS par le relevé (l'index public est en retard, et une annonce en vérification est
//                  invisible) : seulement deux constats « page 404 » de l'extension à 6 h d'écart au moins, et
//                  la garde de modération (dépôt vu en ligne ou de plus de 72 h).
// Pur, sans réseau (Deno + Node).

import { jugerRetraitIntrouvable, jugerRetraitVintedIntrouvable, numeroDepuisLien } from "./retrait-introuvable.js";
import { constats404Beebs, deuxConstats404Prouvent, REGLE_DEUX_CONSTATS_404 } from "./beebs-preuve-retrait.js";
import { champsAttenteClose } from "./etat-terminal.js";
import { archiverErreur } from "./erreurs-archivees.js";

export const RETRAIT_PAR_HORS_LIGNE = "annonce_deja_hors_ligne";
export const RETRAIT_PAR_VENDUE = "vendue_sur_la_plateforme";
/** Le texte de la copie publiée close après le retrait — le même que l'extension (cancelPublishAfterDelete). */
export const MSG_COPIE_RETIREE = "Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente";
/** La garde de modération Beebs (extension 0.6.104, beebsAbsenteParModeration). (25/10) 7 jours, plus 72 h : mesuré le
 *  25/10 (_shared/beebs-sortie-verification.js), un dépôt jamais vu en ligne peut le devenir 48 à 126 h après sa sortie
 *  de vérification (annonces chères surtout — le test à 999 € du 25/10 est sorti de « en vérification » en 5 min sans
 *  paraître en ligne). Un retrait clos « déjà absent » avant laisserait l'annonce apparaître après la vente. */
export const BEEBS_MODERATION_MAX_MS = 7 * 24 * 3600_000;

const ms = (v) => { if (typeof v === "number") return Number.isFinite(v) ? v : NaN; const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** Le numéro d'annonce d'un job, par plateforme ("" quand la colonne et le lien se contredisent). */
export function numeroAnnonceDuJob(job) {
  const p = String(job?.platform ?? "");
  if (p === "vinted") {
    const col = String(job?.platform_listing_id ?? "").trim();
    const lien = String(job?.listing_url ?? "").match(/\/items\/(\d{6,})(?:[-/?#]|$)/)?.[1] ?? "";
    if (col && lien && col !== lien) return "";
    return /^\d{6,}$/.test(col) ? col : lien;
  }
  const col = String(job?.platform_listing_id ?? "").trim();
  const lien = numeroDepuisLien(p, job?.listing_url) ?? "";
  if (col && lien && col !== lien) return "";
  return col || lien;
}

/** Un drapeau deja_absente bien formé (posé par l'extension ou le serveur). */
export function dejaAbsenteValide(da) {
  const d = objet(da);
  const p = objet(d?.preuve);
  return Boolean(d && p && typeof p.source === "string" && p.source && Number.isFinite(ms(d.le)));
}

/**
 * Le drapeau unique : { le, plateforme, numero, preuve, vente, pose_par }.
 * @param {{ plateforme?: string|null, numero?: string|null, preuve: Record<string, unknown>, vente?: boolean|null, posePar?: string, maintenantIso?: string }} a
 */
export function dejaAbsente({ plateforme, numero = null, preuve, vente = null, posePar, maintenantIso = new Date().toISOString() }) {
  return {
    le: maintenantIso,
    plateforme: plateforme ?? null,
    numero: numero ? String(numero) : null,
    preuve,
    vente: vente === true ? true : vente === false ? false : null,
    pose_par: String(posePar ?? "").slice(0, 120),
  };
}

/**
 * Ce que les CHAMPS d'un retrait « deleted » disent de l'annonce, pour toutes les versions d'extension :
 *   · deja_absente (extension ≥ 0.6.144, serveur) ;
 *   · delete_confirmed_by = « etat_annonce » (+ delete_preuve, 0.6.69+) : la page relue disait « plus en ligne » ;
 *   · preuve_retrait.moment = « deja_absente » / « deja_vendue » (Beebs, 0.6.90+) : absente avant tout clic.
 * @param {unknown} pf
 * @param {{ platform?: string|null, numero?: string|null, maintenantIso?: string, posePar?: string }} [opts]
 * @returns {null | { retrait_par: string, deja_absente: Record<string, unknown>, delete_confirmed_by: string|null }}
 *   null = rien dans les champs ne dit « déjà absente » : c'est un retrait fait par FillSell (ou un ancien poste,
 *   que la trace seule raconte — voir etiquetteRetraitParTrace).
 */
export function etiquetteRetraitDejaAbsent(pf, { platform = null, numero = null, maintenantIso = new Date().toISOString(), posePar = "update-job-status (champs du retrait)" } = {}) {
  const p = objet(pf) ?? {};
  if (dejaAbsenteValide(p.deja_absente)) {
    return { retrait_par: p.deja_absente.vente === true ? RETRAIT_PAR_VENDUE : RETRAIT_PAR_HORS_LIGNE, deja_absente: p.deja_absente,
      delete_confirmed_by: typeof p.delete_confirmed_by === "string" ? p.delete_confirmed_by : null };
  }
  if (p.delete_confirmed_by === "etat_annonce") {
    const lu = objet(p.delete_preuve) ?? {};
    const etat = String(lu.etat ?? "");
    const preuve = Object.keys(lu).length
      ? { source: "etat_annonce", etat: etat || null, http: lu.http ?? null, raison: lu.raison ?? null, lu_le: lu.lu_le ?? null, url: lu.url ?? null }
      : { source: "etat_annonce", note: "lecture de la page par l'extension, non conservée par ce build" };
    return { retrait_par: etat === "sold" ? RETRAIT_PAR_VENDUE : RETRAIT_PAR_HORS_LIGNE, delete_confirmed_by: "etat_annonce",
      deja_absente: dejaAbsente({ plateforme: platform, numero, preuve, vente: etat === "sold" ? true : null, posePar, maintenantIso }) };
  }
  const pr = objet(p.preuve_retrait);
  if (pr && (pr.moment === "deja_absente" || pr.moment === "deja_vendue")) {
    // ⚠️ Beebs « SoldOut » ne prouve pas une vente sur Beebs : nos retraits choisissent « Vendu via une autre
    // plateforme », et Beebs passe ainsi « Vendu » l'annonce d'un essai précédent. Vente inconnue.
    const preuve = { source: String(pr.source ?? "preuve_retrait"), moment: pr.moment, numero: pr.numero ?? null, lu_le: pr.lu_le ?? null,
      ...(pr.disponibilite ? { disponibilite: pr.disponibilite } : {}), ...(objet(pr.annonce)?.regle ? { regle: pr.annonce.regle } : {}) };
    return { retrait_par: RETRAIT_PAR_HORS_LIGNE, delete_confirmed_by: p.delete_confirmed_by ?? "preuve_retrait",
      deja_absente: dejaAbsente({ plateforme: platform, numero: numero ?? pr.numero ?? null, preuve, vente: null, posePar, maintenantIso }) };
  }
  return null;
}

/**
 * Les anciens postes (≤ 0.6.143) ne posaient pas le drapeau : leur trace le raconte. Lecture de repli, après les
 * champs, jamais devant eux. Depop : « déjà absente, aucun DELETE » / « STATUS_PURCHASED — vendue, aucun DELETE ».
 * @param {unknown} trace
 * @param {{ platform?: string|null, numero?: string|null, maintenantIso?: string, posePar?: string }} [opts]
 * @returns {null | { retrait_par: string, deja_absente: Record<string, unknown>, delete_confirmed_by: string }}
 */
export function etiquetteRetraitParTrace(trace, { platform = null, numero = null, maintenantIso = new Date().toISOString(), posePar = "update-job-status (trace d'un ancien poste)" } = {}) {
  const t = Array.isArray(trace) ? trace.join(" | ") : String(trace ?? "");
  if (platform !== "depop" || !/aucun DELETE/.test(t)) return null;
  const vendue = /STATUS_PURCHASED — vendue, aucun DELETE/.test(t);
  return { retrait_par: vendue ? RETRAIT_PAR_VENDUE : RETRAIT_PAR_HORS_LIGNE, delete_confirmed_by: "etat_annonce",
    deja_absente: dejaAbsente({ plateforme: platform, numero, preuve: { source: vendue ? "depop_status_purchased" : "depop_fiche_404", note: "lu dans la trace d'un poste d'avant le drapeau" },
      vente: vendue ? true : null, posePar, maintenantIso }) };
}

/** La dernière ligne de relevé (annonces_plateforme) d'un numéro, ou null. */
function ligneDuNumero(platform, annonces, numero) {
  const lignes = (Array.isArray(annonces) ? annonces : []).filter((a) => {
    const brut = String(a?.listing_id ?? "").trim();
    const n = /^https?:/i.test(brut) ? numeroDepuisLien(platform, brut) : (brut || numeroDepuisLien(platform, a?.url));
    return n === numero;
  });
  lignes.sort((a, b) => (ms(b.vu_le) || 0) - (ms(a.vu_le) || 0));
  return lignes[0] ?? null;
}
const STATUT_GONE_RE = /^(vendue|retiree|retirée)$/i;

/**
 * Le balayage des retraits OUVERTS (handler-watch) : l'absence est-elle prouvée par ce que le serveur sait SANS le
 * poste ? Pur. Rien → null (le retrait continue son chemin, rien n'est écrit).
 * @param {any} job  action 'delete', status pending / needs_user / failed
 * @param {{ releves?: any[], annonces?: any[], snapshot?: {status?: string, captured_at?: string}|null,
 *           derniereVue?: string|null, depotsBeebs?: Array<{published_at?: string|null, vu_en_ligne_le?: string|null}>|null,
 *           vueEnLigneBeebs?: boolean, maintenant?: number }} [ctx]
 *   releves : vinted_sync_runs de la plateforme (Vinted : dressing, avec vinted_user_id) ; annonces : lignes
 *   annonces_plateforme du compte pour ces numéros ; snapshot : dernier instantané Vinted de l'annonce ;
 *   derniereVue : captured_at le plus récent (Vinted) ; depotsBeebs : dépôts FillSell Beebs de ce numéro (du plus
 *   récent) — null = non lus (rien n'est conclu) ; vueEnLigneBeebs : une ligne du relevé l'a vue « en_ligne ».
 * @returns {null | { preuve: object, vente: true|null, delete_confirmed_by: string, numero: string, motif: string }}
 */
export function jugerRetraitDejaAbsent(job, { releves = [], annonces = [], snapshot = null, derniereVue = null, depotsBeebs = null, vueEnLigneBeebs = false, maintenant = Date.now() } = {}) {
  if (!job || job.action !== "delete" || !["pending", "needs_user", "failed"].includes(String(job.status ?? ""))) return null;
  const P = String(job.platform ?? "");
  const pf = objet(job.platform_fields) ?? {};
  const numero = numeroAnnonceDuJob(job);
  if (!numero) return null;

  if (P === "beebs") {
    // ⛔ Jamais le relevé ni l'index : deux constats « page 404 » de l'extension, 6 h d'écart au moins…
    const constats = constats404Beebs(pf);
    const dates = constats.map((c) => String(c.le));
    if (!deuxConstats404Prouvent(dates)) return null;
    // … et la garde de modération : une annonce jamais vue en ligne, d'un dépôt de moins de 7 jours, peut être en
    // examen chez Beebs (invisible des deux onglets) — elle sortirait en ligne après la vente : double vente.
    if (!vueEnLigneBeebs) {
      if (!Array.isArray(depotsBeebs)) return null;
      if (depotsBeebs.length && !depotsBeebs.some((d) => d?.vu_en_ligne_le)) {
        const publie = ms(depotsBeebs[0]?.published_at);
        if (!Number.isFinite(publie) || maintenant - publie <= BEEBS_MODERATION_MAX_MS) return null;
      }
    }
    return { numero, vente: null, delete_confirmed_by: "constats_404_beebs", motif: "deux_constats_404",
      preuve: { source: "constats_404_beebs", regle: REGLE_DEUX_CONSTATS_404, constats_404: [dates[0], dates[dates.length - 1]], n: dates.length } };
  }

  if (P === "vinted") {
    const s = objet(snapshot);
    if (s && String(s.status ?? "") === "sold") {
      return { numero, vente: true, delete_confirmed_by: "releve", motif: "releve_vendue",
        preuve: { source: "releve_vendue", releve_le: s.captured_at ?? null } };
    }
    // La boutique doit être SUE : vue par un relevé (la boutique de ce relevé), ou portée par le job. Jamais vue
    // et sans boutique, « absente de toutes les boutiques relevées » ne dit rien d'une boutique jamais relevée.
    if (!Number.isFinite(ms(derniereVue)) && !String(pf.vinted_account_id ?? "").trim()) return null;
    const strict = jugerRetraitVintedIntrouvable(job, { releves, derniereVue });
    const v = strict?.verdict === "deja_retire" ? strict
      // Vue au moins une fois par un relevé complet : ceux d'APRÈS cette vue suffisent (le dressing du vendeur
      // montre tout — vendues, masquées, brouillons — une annonce absente de deux relevés complets n'existe plus).
      : Number.isFinite(ms(derniereVue)) ? jugerRetraitVintedIntrouvable(job, { releves, derniereVue, depuisDerniereVue: true }) : null;
    if (v?.verdict !== "deja_retire") return null;
    return { numero, vente: null, delete_confirmed_by: "releves", motif: "deux_releves_complets",
      preuve: { source: "releves_complets", releves: v.releves ?? [], boutiques: v.boutiques ?? [], derniere_vue: derniereVue ?? null } };
  }

  if (!["leboncoin", "depop", "ebay"].includes(P)) return null;
  const ligne = ligneDuNumero(P, annonces, numero);
  // Jamais vue par un relevé : rien ne dit qu'elle vit sur le compte relevé (deux comptes, un seul relevé) — le
  // balayage ne conclut pas (le poste, lui, lit la page de l'annonce).
  if (!ligne) return null;
  const strict = jugerRetraitIntrouvable(job, { releves, annonces, maintenant });
  // Vue par un relevé, et que le relevé lui-même a vue partir (disparue, retirée, vendue) : les deux derniers relevés
  // complets suffisent, même commencés avant la demande — l'annonce a quitté CE compte, et n'y est pas revenue.
  const gone = ligne && (ligne.disparu_le || ligne.retiree_le || STATUT_GONE_RE.test(String(ligne.statut_plateforme ?? "")));
  const v = strict?.verdict === "deja_retire" && strict.numero ? strict
    : gone ? jugerRetraitIntrouvable(job, { releves, annonces, maintenant, depuisDerniereVue: true }) : null;
  if (v?.verdict !== "deja_retire" || !v.numero) return null;
  const vendue = /^vendue$/i.test(String(ligne?.statut_plateforme ?? ""));
  return { numero, vente: vendue ? true : null, delete_confirmed_by: "releves", motif: "deux_releves_complets",
    preuve: { source: "releves_complets", releves: v.releves ?? [], ligne: ligne ? { vu_le: ligne.vu_le ?? null, disparu_le: ligne.disparu_le ?? null, statut: ligne.statut_plateforme ?? null } : null } };
}

/** Clés d'attente propres au retrait : elles tombent avec lui (en plus de CLES_ATTENTE_CLOSE). */
const CLES_ATTENTE_RETRAIT = ["verification_boutique_vinted", "retrait_attente_second_constat", "beebs_en_moderation", "attente_identifiant_beebs"];

/**
 * Les platform_fields d'un retrait clos « déjà absente » par le serveur : drapeau, étiquette, erreur d'avant
 * archivée, attente close (etat-terminal.js). Rien d'autre n'est touché (traces, constats, essais : gardés).
 * @param {unknown} pf
 * @param {{ verdict: { numero: string|null, preuve: Record<string, unknown>, vente: boolean|null, delete_confirmed_by: string }, platform?: string|null,
 *           erreur?: string|null, statut?: string|null, par: string, maintenantIso?: string }} opts
 * @returns {Record<string, unknown>}
 */
export function champsRetraitDejaAbsent(pf, { verdict, platform, erreur = null, statut = null, par, maintenantIso = new Date().toISOString() }) {
  const base = { ...(objet(pf) ?? {}) };
  base.erreurs_archivees = archiverErreur(base.erreurs_archivees, erreur ?? "", statut, String(par ?? "").slice(0, 80));
  if (!base.erreurs_archivees.length) delete base.erreurs_archivees;
  const { pf: clos } = champsAttenteClose(base, { par });
  for (const k of CLES_ATTENTE_RETRAIT) delete clos[k];
  clos.deja_absente = dejaAbsente({ plateforme: platform, numero: verdict.numero, preuve: verdict.preuve, vente: verdict.vente, posePar: par, maintenantIso });
  clos.retrait_par = verdict.vente === true ? RETRAIT_PAR_VENDUE : RETRAIT_PAR_HORS_LIGNE;
  clos.delete_confirmed_by = verdict.delete_confirmed_by;
  return clos;
}

/** Les copies publiées à clore après le retrait : la même annonce, exactement (jamais une vente prouvée sur elle). */
export function copiesAClore(publications, retrait, numero) {
  const cible = String(numero ?? "").trim();
  if (!cible || !retrait?.user_id) return [];
  return (Array.isArray(publications) ? publications : []).filter((p) => {
    if (!p || p.platform !== retrait.platform || p.status !== "published") return false;
    if (!["publish", "republish"].includes(String(p.action ?? "publish"))) return false;
    if (String(p.id) === String(retrait.id) || String(p.user_id) !== String(retrait.user_id)) return false;
    if (retrait.inventaire_id != null && String(p.inventaire_id) !== String(retrait.inventaire_id)) return false;
    const pfP = objet(p.platform_fields) ?? {};
    // Une vente PROUVÉE sur cette plateforme garde son circuit (ventes à décider) : le retrait ne la tait pas.
    if (pfP.sale_signal === "sold") return false;
    return numeroAnnonceDuJob(p) === cible;
  });
}

/** La clôture d'une copie (même sens que l'extension après un retrait : « pas une vente »). */
export function clotureCopie(platformFields, { le, retraitId, numero }) {
  const pf = { ...(objet(platformFields) ?? {}) };
  if (pf.unavailable_pending_since) {
    pf.unavailable_pending_at_delete = pf.unavailable_pending_since;
    pf.unavailable_pending_archived_at = le;
  }
  for (const k of ["unavailable_since", "unavailable_pending_since", "sale_signal", "detected_price"]) delete pf[k];
  pf.removed_by_user = true;
  pf.close_par_retrait_deja_absent = { le, retrait: retraitId, annonce: String(numero) };
  return { status: "cancelled", error: MSG_COPIE_RETIREE, platform_fields: pf };
}

/**
 * (25/10, boncoin59300) CET essai a-t-il noté un constat « page 404 » Beebs ? Lu sur les CHAMPS : le dernier
 * constat valide (beebs_404_constats) est postérieur à la prise en charge de l'essai (processing_since, 5 s de
 * marge d'horloge) ; sans prise en charge lisible, daté des 15 dernières minutes. Un constat d'un essai précédent,
 * resté sur le job, n'arme rien : une session fermée ou un canal coupé gardent leur propre chemin.
 */
export function constat404DeCetEssai(pf, maintenant = Date.now()) {
  const p = objet(pf) ?? {};
  const constats = constats404Beebs(p);
  if (!constats.length) return false;
  const dernier = ms(constats[constats.length - 1].le);
  if (!Number.isFinite(dernier)) return false;
  // Deux dates de la MÊME horloge (celle du poste) : une horloge en retard ou en avance ne fausse rien.
  const prise = ms(p.processing_since);
  return Number.isFinite(prise) ? dernier >= prise - 5_000 : Math.abs(maintenant - dernier) <= 15 * 60_000;
}

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE MESSAGE D'UN RETRAIT EN REPRISE A LE DROIT DE DIRE (25/10)
// ═══════════════════════════════════════════════════════════════════════════
// « Tant que ce n'est pas fait, elle reste en vente sur Beebs » s'affichait sur une page 404 — rien d'achetable.
// Jamais « elle reste en vente » sans la preuve qu'elle est en ligne. Trois cas, lus sur des CHAMPS :
//   · en_ligne  — la dernière lecture de la page (lecture_etat_retrait, < 24 h) l'a vue en ligne : on le dit ;
//   · introuvable — la page est introuvable (constat « page 404 » Beebs, lecture « plus en ligne » non concluante) :
//     rien d'achetable à cet instant, on vérifie et on clôt seul ;
//   · null — on ne sait pas : « si elle est encore en ligne… » (le conseil contre la double vente reste).
const LECTURE_FRAICHE_MS = 24 * 3600_000;
export function indiceEtatRetrait(pf, maintenant = Date.now()) {
  const p = objet(pf) ?? {};
  const lu = objet(p.lecture_etat_retrait);
  const frais = lu && Number.isFinite(ms(lu.lu_le)) && maintenant - ms(lu.lu_le) < LECTURE_FRAICHE_MS;
  if (frais && lu.etat === "active") return "en_ligne";
  if (constats404Beebs(p).length) return "introuvable";
  if (frais && lu.etat === "unavailable") return "introuvable";
  return null;
}
