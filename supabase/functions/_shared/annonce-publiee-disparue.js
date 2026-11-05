// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE CONFIRMÉE DISPARUE N'EST PLUS JAMAIS REVISITÉE (05/11, règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas du 05/11 (compte de Nico, Cloud) : la publication Beebs ee55be2d (« TEST FillSell 30/10 — T-shirt femme
// Picture », annonce 34283901) est restée « published » depuis le 02/11 17:20 alors que l'annonce n'a JAMAIS figuré
// dans ses annonces Beebs (aucun relevé ne l'a vue, ni en ligne ni en vérification), que sa page publique répond 404
// et qu'une republication du 02/11 18:44 avait déjà été close « plus en ligne ». Conséquences : la détection de vente
// la relisait (page 404) à chaque passage, et la fonction de republication de l'app la prenait encore pour source —
// une republication de plus le 05/11 10:29, close à son tour. La règle de pause du 15/10 (introuvable-a-confirmer.js)
// ne jugeait que les REPUBLICATIONS en pause, jamais l'annonce publiée elle-même.
//
// RÈGLE (toutes les plateformes relevées — Vinted, Leboncoin, Beebs, Depop ; eBay a son API) :
//  · déclencheur : la détection de vente n'a pas pu lire la page à répétition (check_unresolved posé par l'extension,
//    « Impossible de vérifier cette annonce ») — une lecture ratée ne conclut JAMAIS rien seule (ni 403, ni erreur
//    réseau, ni même une page 404 : Beebs répond 404 pour une annonce « en vérification ») ;
//  · preuve : la règle du 15/10-25/10 (decisionIntrouvable), à l'identique — l'annonce, par son identifiant exact,
//    absente de DEUX relevés COMPLETS des annonces du compte depuis sa dernière vue (ou sa publication), dont un au
//    moins après la première lecture ratée ; ou relevée vendue / fermée ; ou fiche vendue ;
//  · une annonce relevée « en vérification » (Beebs) n'est jamais « disparue » : sa page publique répond 404 par
//    construction (modération) — elle est dite telle quelle ;
//  · effet : TOUS les jobs publiés de cette annonce (même compte, même plateforme, même identifiant) passent
//    « cancelled » avec le message de la preuve (vendue / plus en ligne, « FillSell n'a rien retiré ») : la détection
//    de vente ne la relit plus (elle ne lit que les jobs « published »), la republication ne la prend plus pour source
//    (spend_coins_and_republish : dernier dépôt « published »), aucune tâche ne repart en boucle dessus. La fiche
//    n'est jamais marquée vendue ici (la vente a son propre circuit) ; ses autres plateformes ne bougent pas.
// Pur (Node + Deno) : scripts/annonce-publiee-disparue-selftest.mjs.
//
// (05/11 16:33, INCIDENT — décision de Nico) LE JUGE LIT L'ANNONCE EN LIGNE, JAMAIS L'ANCIENNE. La règle a clos 24
// republications Vinted VIVANTES (2189c4d8 ×12, 8a2eba68 ×8, f8aa02a5 ×3, f0acd3af ×1) : elle identifiait l'annonce par
// identifiantAnnonceJob, qui lit d'abord platform_fields.vinted_item_id — pour une republication, l'ANCIENNE annonce, retirée
// par la republication elle-même — au lieu de platform_listing_id, l'annonce EN LIGNE. Exemple : republication fbe12f96,
// en ligne 10577905434 (vue « active » au relevé complet du 05/11 00:23), jugée sur 10534381485 (retirée le 28/10, absente
// des relevés depuis) → « absente de 2 relevés ». identifiantAnnonceJob reste juste pour une republication EN PAUSE pas
// encore recréée (vinted_item_id y est la cible) ; le juge des annonces PUBLIÉES a son identifiant, ci-dessous, utilisé
// partout (handler-watch : traces, relevés ; ici : garde « identifiant inconnu » et décision).
// Simulation du parc en lecture seule : scripts/simulation-annonces-publiees-disparues.mjs.

import { decisionIntrouvable, messageDisparueConfirmee } from './introuvable-a-confirmer.js';

export const PLATEFORMES_RELEVEES = ['vinted', 'leboncoin', 'beebs', 'depop'];

const t = (v) => { const x = Date.parse(String(v ?? '')); return Number.isFinite(x) ? x : NaN; };
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop' };

/**
 * L'identifiant de l'annonce EN LIGNE d'un dépôt publié (05/11, décision de Nico) — jamais l'ancienne d'une republication.
 * Vinted : platform_listing_id, sinon le numéro du lien (/items/<n>), et platform_fields.vinted_item_id seulement pour un
 * dépôt « publish » qui n'a ni l'un ni l'autre (il n'a pas d'ancienne annonce). Autres plateformes : platform_listing_id,
 * sinon le lien (inchangé : identifiantAnnonceJob les lisait déjà dans cet ordre).
 * @param {any} job
 * @returns {string | null}
 */
export function identifiantAnnoncePubliee(job) {
  const pf = job?.platform_fields ?? {};
  const enLigne = String(job?.platform_listing_id ?? '').trim();
  if (String(job?.platform ?? '') === 'vinted') {
    const brut = enLigne
      || (String(job?.listing_url ?? '').match(/\/items\/(\d+)(?:[-/?#]|$)/)?.[1] ?? '')
      || (String(job?.action ?? '') === 'publish' ? String(pf.vinted_item_id ?? '').trim() : '');
    return /^\d+$/.test(brut) ? brut : null;
  }
  // (05/11 soir, décision de Nico) Hors Vinted, sans numéro d'annonce : identifiant INCONNU, aucune clôture. Le lien entier
  // ne correspond jamais à un listing_id du relevé : il faisait passer l'annonce pour absente de tous les relevés.
  return enLigne || null;
}

/** La « lecture ratée » d'une annonce publiée : la détection de vente l'a déclarée non vérifiable (check_unresolved). */
export function lectureRateeAnnoncePubliee(job) {
  const pf = job?.platform_fields ?? {};
  if (pf.check_unresolved !== true) return null;
  const depuis = t(pf.check_unresolved_since);
  return Number.isFinite(depuis) ? new Date(depuis).toISOString() : null;
}

/**
 * La décision pour UN job publié (pure). Mêmes entrées que decisionIntrouvable.
 * Rend { decision: 'disparue' | 'en_verification' | 'attendre', vendue?, raison }.
 * @param {{ job: any, fiche?: any, vu?: any, annonce?: any, runs?: any[], boutique?: string | null, creeLe?: string | null }} arg
 */
export function decisionAnnoncePubliee({ job, fiche = null, vu = null, annonce = null, runs = [], boutique = null, creeLe = null }) {
  const platform = String(job?.platform ?? '');
  if (!PLATEFORMES_RELEVEES.includes(platform)) return { decision: 'attendre', raison: 'plateforme sans relevé des annonces' };
  if (String(job?.status ?? '') !== 'published' || !['publish', 'republish'].includes(String(job?.action ?? ''))) {
    return { decision: 'attendre', raison: "pas une annonce publiée" };
  }
  const ident = identifiantAnnoncePubliee(job);
  if (!ident) return { decision: 'attendre', raison: "identifiant exact de l'annonce en ligne inconnu" };
  const lecture = lectureRateeAnnoncePubliee(job);
  if (!lecture) return { decision: 'attendre', raison: 'aucune lecture ratée à répétition' };
  // (05/11 soir, vérification une par une sur les plateformes) Une annonce JAMAIS VUE EN LIGNE (marqueur pas_encore_visible :
  // en vérification, ou jamais vue depuis son dépôt) n'a pas « disparu » : Beebs a gardé une annonce invisible ~9,4 jours
  // avant de la montrer (7b9d8a71, 34237930). Son absence des relevés ne prouve rien ; c'est le juge des dépôts jamais mis
  // en ligne qui décide, avec sa propre attente (les 3 annonces TEST Beebs de f44b5917, 404 et jamais vues, épargnées).
  if (job?.platform_fields?.pas_encore_visible) {
    return { decision: 'attendre', raison: `jamais vue en ligne chez ${NOMS[platform] ?? platform} (pas_encore_visible) : pas une disparition` };
  }
  // Beebs : relevée dans l'onglet « en vérification » (et pas disparue depuis) → jamais « disparue ».
  if (annonce && String(annonce.statut_plateforme ?? '') === 'en_verification' && !(t(annonce.disparu_le) > t(annonce.vu_le))) {
    return { decision: 'en_verification', raison: `relevée « en vérification » chez ${NOMS[platform] ?? platform} le ${String(annonce.vu_le ?? '?')}` };
  }
  // decisionIntrouvable raisonne sur l'annonce EN LIGNE : sa garde « identifiant inconnu » lit vinted_item_id (Vinted).
  const pfJuge = { ...(job.platform_fields ?? {}), introuvable_a_confirmer: { depuis: lecture, premiere: lecture } };
  if (platform === 'vinted') pfJuge.vinted_item_id = ident;
  const d = decisionIntrouvable({ job: { ...job, platform_fields: pfJuge }, fiche, vu, annonce, runs, boutique, creeLe });
  if (d.decision === 'confirmer') {
    // Une annonce Vinted MASQUÉE ou en brouillon par la personne n'est pas disparue : elle peut revenir d'un clic. Seules
    // l'absence prouvée, la vente et la fermeture closent (simulé sur la prod le 05/11 : 31 annonces « hidden » épargnées).
    if (/« (hidden|draft) »/.test(String(d.raison ?? ''))) return { decision: 'attendre', raison: `${d.raison} : masquée, pas disparue` };
    const vendue = Boolean(d.vendue) || /vendue|sold/i.test(String(d.raison ?? ''));
    return { decision: 'disparue', vendue, raison: d.raison };
  }
  return { decision: 'attendre', raison: d.raison };
}

/** Le message d'un job publié clos sur preuve. */
export function messageAnnoncePublieeDisparue(platform, vendue = false) {
  const nom = NOMS[platform] ?? platform;
  if (vendue) {
    return `Cette annonce ${nom} est vendue (relevé ou fiche) : FillSell ne la vérifie plus et ne la republie plus. ` +
      "Rien n'a été retiré ; la vente est suivie à part, comme les autres.";
  }
  return messageDisparueConfirmee(platform) + ' FillSell ne la vérifie plus et ne la republie plus.';
}

/** Les deux marques de cette règle (l'INVERSE ne rend que celles-là). */
export const POSES_PAR_DISPARUE = Object.freeze([
  'handler-watch (annonce publiée confirmée disparue)',
  'handler-watch (republication en pause confirmée disparue)',
]);

/**
 * Le patch d'un job publié clos (pur) : compare-and-set sur « published » côté appelant. (05/11, garde-fou de Nico) La
 * clôture s'annule : l'état d'avant (statut, message) est gardé dans la marque — l'INVERSE
 * (scripts/reparations/20261105_regle_annonces_publiees_disparues_INVERSE.sql) le rend tel quel.
 */
export function patchAnnoncePublieeDisparue(job, decision, { at = new Date().toISOString(), posePar = POSES_PAR_DISPARUE[0] } = {}) {
  const pf = { ...(job?.platform_fields ?? {}) };
  pf.annonce_disparue = {
    at, motif: decision?.raison ?? null, vendue: Boolean(decision?.vendue), pose_par: posePar,
    avant: { status: String(job?.status ?? 'published'), error: job?.error ?? null },
  };
  return { status: 'cancelled', error: messageAnnoncePublieeDisparue(String(job?.platform ?? ''), Boolean(decision?.vendue)), platform_fields: pf };
}

/**
 * (05/11, règle de Nico) Une annonce relevée « en vérification » chez la plateforme : l'app dit « Beebs vérifie ton
 * annonce », pas « en ligne » (marqueur pas_encore_visible, lu par StockTab — enVerificationPlateforme). Rend les
 * platform_fields à écrire, ou null quand le marqueur est déjà là (aucune ligne inchangée réécrite).
 */
export function pfAnnonceEnVerification(job, annonce, { at = new Date().toISOString() } = {}) {
  const pf = job?.platform_fields ?? {};
  if (pf.pas_encore_visible) return null;
  return { ...pf, pas_encore_visible: { regle: 'releve_en_verification_0511', depuis: annonce?.vu_le ?? at, derniere: at } };
}
