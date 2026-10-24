// ═══════════════════════════════════════════════════════════════════════════
// UNE LECTURE RATÉE NE VAUT JAMAIS « PLUS EN LIGNE » (15/10, point 14 — DeadRoz)
// ═══════════════════════════════════════════════════════════════════════════
// DeadRoz (Business) : 60 republications Vinted annulées le 15/10 entre 13:52
// et 16:05 — « Cette annonce n'est plus en ligne sur Vinted… » — sur UNE seule
// lecture : l'endpoint d'édition du propriétaire (/api/v2/item_upload/items/{id})
// répondait 404. Aucune seconde lecture, aucune preuve indépendante ; les 60
// fiches ont été datées « disparues » par l'extension. Ce 404 n'est PAS une
// preuve : trois annonces de trois comptes (la.mode.licyca, seghirdeborah711,
// 2hyk6vg842) ont été relevées EN LIGNE après un tel verdict.
//
// RÈGLE (toutes plateformes ; zéro régression sur une vraie disparition) :
//  · un verdict « plus en ligne » posé par UNE lecture, avant tout retrait, met
//    la republication EN PAUSE (needs_user 'introuvable_a_confirmer'), rien de
//    retiré, la fiche jamais datée « disparue » par cette seule lecture ;
//  · elle REPART toute seule quand un relevé fait APRÈS la lecture revoit
//    l'annonce en ligne (trois fois au plus ; trois par compte et par passage) ;
//  · elle se CLÔT, avec le message d'avant, quand DEUX relevés COMPLETS faits
//    après la lecture ne la contiennent plus, ou la disent vendue / fermée, ou
//    que la fiche est vendue ;
//  · sinon elle attend (le prochain « Synchroniser », ou une veille).
//
// (17/10, DeadRoz — mission de Nico) CE QUE LA RÈGLE DU 15/10 FAISAIT MAL,
// prouvé en base :
//  · Vinted : « revue en ligne » se lisait sur la FICHE du job (last_synced_at,
//    vinted_status). Une fiche qui porte une AUTRE annonce a fait repartir un
//    job (cdf7007c, a6e773d4 : 10177470345 vue, 9362353208 jamais revue depuis
//    le 20/09) ; une fiche figée par la garde É4 du relevé (une annonce en
//    republication n'est jamais datée disparue) gardait « active » une annonce
//    absente du dressing (DeadRoz : 60 annonces absentes du relevé complet du
//    16/10 19:36, 588 lues sur 588) ;
//  · « complet » voulait dire 'done' : deux republications Leboncoin de DeadRoz
//    closes sur des relevés « 0 en ligne lues sur 0 annoncées » ;
//  · handler-watch lisait les 50 PLUS ANCIENS relevés, toutes plateformes :
//    87 relevés Leboncoin vides ont caché le relevé Vinted décisif (rang 89).
// DONC :
//  · la trace d'une annonce se lit par son IDENTIFIANT EXACT (Vinted : son
//    relevé du jour vinted_listing_snapshots, ou la fiche qui porte CE
//    vinted_item_id ; autres : annonces_plateforme) — jamais la fiche du job,
//    jamais le titre ;
//  · un relevé ne prouve une absence que COMPLET (même définition que les
//    retraits, _shared/retrait-introuvable.js), NON VIDE, et — Vinted — de la
//    boutique de l'annonce ; il en faut DEUX, commencés après la PREMIÈRE
//    lecture ratée (ou le dernier démenti) et après la dernière trace.
//
// (25/10, point 1b de Nico) « ON ATTEND LE PROCHAIN RELEVÉ » NE TRANCHAIT JAMAIS — prouvé en base le
// 25/10 vers 00:10 (rejeu exact de handler-watch : les 8 pauses du parc rendent toutes « attendre ») :
//  · l'absence ne se comptait que sur des relevés commencés APRÈS la lecture ratée : les relevés
//    complets de sa boutique faits entre sa DERNIÈRE VUE et la lecture étaient jetés. Marta 133c921a :
//    vue à 12:40, absente de 4 relevés complets avant la lecture (14:49) et d'un après — un seul compté ;
//    jocabroc8 961f0a27 : absente du dressing depuis le 07/10 ; nino b4bef8cf : disparue le 21/10 (deux
//    relevés, `absence_releves`), absente du relevé de 13:02 fait après la lecture de 11:28 — « on
//    attend le suivant » ; et handler-watch ne lisait relevés et traces que depuis la veille de la lecture ;
//  · la page lue « Article vendu » (republish_etat_reel) ne tranchait qu'au classement (pas-de-rouge A4,
//    déployé le 24/10 à 18:46) : une pause posée avant (louis b56582b6, 17:04) n'en sortait plus ;
//  · personne ne demandait le relevé attendu : il ne venait que d'un geste, du veilleur ou du cron
//    (au plus un par 20 h, Chrome ouvert).
// DONC :
//  · l'absence se compte depuis la DERNIÈRE VUE de l'annonce (jamais avant le dernier démenti) : DEUX
//    relevés complets de sa boutique sans elle, dont AU MOINS UN commencé après la première lecture ratée
//    — c'est « le prochain relevé » qui tranche, jamais la lecture seule ni un `disparu_le` d'avant elle
//    (la mémoire « annonce morte » des extensions < 0.6.134 rend « unavailable » sans lire une annonce
//    revenue en ligne : le relevé d'après la lecture la revoit, et elle repart). Sans trace : comme avant ;
//  · la page lue « vendue » à la lecture de CETTE pause → close (vendue), comme pas-de-rouge ;
//  · handler-watch lit relevés et traces sur FENETRE_TRACE_MS avant la première lecture (même borne).
// Pur (Node + Deno) : scripts/introuvable-a-confirmer-selftest.mjs.

import { releveComplet as releveCompletRetrait } from './retrait-introuvable.js';

export const SOURCE_INTROUVABLE = 'introuvable_a_confirmer';
export const SOURCE_INTROUVABLE_PERSISTANT = 'introuvable_persistant';
export const MAX_REPRISES_INTROUVABLE = 3;
export const REPRISES_PAR_COMPTE_ET_PASSAGE = 3;
// (25/10) Relevés et traces lus par handler-watch sur 14 jours avant la première lecture ratée : la
// dernière vue de l'annonce et les relevés faits depuis (une borne de lecture, jamais une preuve).
export const FENETRE_TRACE_MS = 14 * 86_400_000;
// Une lecture « vendue » appartient à cette pause si elle suit la première lecture ratée (marge : la
// page est lue juste avant que l'échec ne soit classé).
const MARGE_LECTURE_MS = 10 * 60_000;

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', opla: 'Opla', ebay: 'eBay' };
const nomDe = (p) => NOMS[p] ?? String(p ?? '');

export function messagePause(platform) {
  const nom = nomDe(platform);
  return `Republication en pause, rien n'a été retiré : ${nom} n'a pas rendu cette annonce à la dernière lecture. ` +
    `FillSell attend le prochain relevé de ta boutique ${nom} pour savoir si elle est encore en ligne ; si elle l'est, ` +
    'la republication repartira toute seule. Pour aller plus vite : « Synchroniser ».';
}

// Le message d'AVANT, inchangé : il ne part plus que sur preuve.
export function messageDisparueConfirmee(platform) {
  if (platform === 'vinted') {
    return "Cette annonce n'est plus en ligne sur Vinted (vendue, retirée ou supprimée depuis sa dernière lecture). " +
      'FillSell n\'a rien retiré. Si tu l\'as vendue, marque-la vendue ; sinon remets-la en ligne sur Vinted, ' +
      'puis synchronise ton dressing.';
  }
  const nom = nomDe(platform);
  return `Cette annonce n'est plus en ligne sur ${nom} (vendue, retirée ou supprimée depuis sa dernière lecture). ` +
    "FillSell n'a rien retiré. Si tu l'as vendue, marque-la vendue ; sinon remets-la en ligne, puis synchronise.";
}

// (25/10) La page lue « Article vendu » : le message de pas-de-rouge (A4), mot pour mot.
export function messageVendueLue(platform) {
  return `Republication annulée : ton annonce ${nomDe(platform)} est vendue (la page affiche « Article vendu »). ` +
    "Rien n'a été retiré ; la vente est suivie à part, comme les autres.";
}

export function messagePersistant(platform) {
  const nom = nomDe(platform);
  return `${nom} refuse de rendre cette annonce à la lecture alors qu'un relevé la voit en ligne : FillSell ne la ` +
    'republie pas, pour ne jamais rien retirer sur un doute. Ton annonce est intacte ; republie-la à la main depuis ' +
    `${nom} si tu veux la remonter.`;
}

// La marque posée sur le job en pause. `lecture` : ce qui a été lu (ex.
// 'item_upload_404', 'etat_unavailable').
/**
 * @param {any} pfPrecedent
 * @param {{ platform?: string | null, lecture?: string | null, at?: string }} [opts]
 */
export function marqueIntrouvable(pfPrecedent, { platform = null, lecture = null, at = new Date().toISOString() } = {}) {
  const prec = pfPrecedent && typeof pfPrecedent.introuvable_a_confirmer === 'object' ? pfPrecedent.introuvable_a_confirmer : null;
  return {
    introuvable_a_confirmer: {
      depuis: at,
      premiere: prec?.premiere ?? prec?.depuis ?? at,
      n: (Number(prec?.n) || 0) + 1,
      reprises: Number(prec?.reprises) || 0,
      plateforme: platform ?? null,
      lecture: lecture ?? null,
    },
  };
}

const t = (v) => { const x = Date.parse(String(v ?? '')); return Number.isFinite(x) ? x : NaN; };

// Deux relevés complets sans l'annonce : la même exigence que les retraits
// (_shared/retrait-introuvable.js, décision de Nico du 02/10).
export const RELEVES_POUR_DISPARITION = 2;

/**
 * L'identifiant EXACT de l'annonce d'un job — jamais la fiche, jamais le titre.
 * Vinted : vinted_item_id (sinon le n° du lien /items/<n>) ; autres plateformes :
 * platform_listing_id, sinon le lien lui-même (il désigne l'annonce exacte).
 * @param {any} job
 * @returns {string | null}
 */
export function identifiantAnnonceJob(job) {
  const pf = job?.platform_fields ?? {};
  if (String(job?.platform ?? '') === 'vinted') {
    const brut = String(pf.vinted_item_id ?? '').trim()
      || (String(job?.listing_url ?? '').match(/\/items\/(\d+)(?:[-/?#]|$)/)?.[1] ?? '');
    return /^\d+$/.test(brut) ? brut : null;
  }
  return String(job?.platform_listing_id ?? '').trim() || String(job?.listing_url ?? '').trim() || null;
}

/**
 * Un relevé qui PEUT prouver une absence : complet au sens des retraits (status
 * 'done', total connu, lus ≥ annoncés, sans « [incomplet] »), NON VIDE (« un
 * relevé vide ne prouve rien »), fini, que l'extension n'a pas jugé inutilisable
 * (« disparitions non marquées ») et — Vinted — un relevé du dressing de la
 * boutique de l'annonce (jamais celui d'une autre boutique, jamais sans boutique).
 * @param {any} r
 * @param {{ platform?: string | null, boutique?: string | null }} [opts]
 */
export function releveComplet(r, { platform = null, boutique = null } = {}) {
  if (!releveCompletRetrait(r)) return false;
  if (!((Number(r?.items_vus) || 0) > 0)) return false;
  if (!Number.isFinite(t(r?.finished_at))) return false;
  if (/disparitions non marquées|n'a pas rendu sa liste/i.test(String(r?.erreur ?? ''))) return false;
  if (platform === 'vinted') {
    if (r?.kind != null && r.kind !== 'dressing') return false;
    if (!boutique || r?.vinted_user_id == null || String(r.vinted_user_id) !== String(boutique)) return false;
  }
  return true;
}

// La boutique Vinted de l'annonce quand ni le job ni la fiche ne la portent :
// celle du relevé qui l'a vue en dernier (même règle que les retraits Vinted).
function boutiqueDeLaVue(runs, vuLe) {
  if (!Number.isFinite(vuLe)) return null;
  const r = (runs ?? []).find((x) => x?.vinted_user_id != null && Number.isFinite(t(x?.started_at))
    && t(x.started_at) - 60_000 <= vuLe && Number.isFinite(t(x?.finished_at)) && vuLe <= t(x.finished_at) + 60_000);
  return r ? String(r.vinted_user_id) : null;
}

// La décision, pure.
//  job      : { platform, platform_listing_id, listing_url, platform_fields }
//  fiche    : la fiche du job — SEULE sa vente compte (son état d'annonce n'est
//             jamais une preuve : elle peut porter une autre annonce) ;
//  vu       : la trace la plus récente de CETTE annonce, par son identifiant
//             exact : { vu_le, statut } (Vinted : vinted_listing_snapshots ou la
//             fiche qui porte ce vinted_item_id ; autres : annonces_plateforme) ;
//  annonce  : ancienne forme (autres plateformes) — ligne annonces_plateforme ;
//  runs     : relevés de CETTE plateforme du compte, tout ordre (status,
//             started_at, finished_at, items_vus, total_entries, erreur, kind,
//             vinted_user_id) ;
//  boutique : Vinted — la boutique de l'annonce ; à défaut, celle du job
//             (vinted_account_id), de la fiche, puis du relevé qui l'a vue.
// Rend { decision: 'reprendre' | 'confirmer' | 'attendre' | 'persistant', raison, vendue?, releve_attendu? }.
/**
 * @param {{ job: any, fiche?: any, vu?: any, annonce?: any, runs?: any[], boutique?: string | null }} arg
 */
export function decisionIntrouvable({ job, fiche = null, vu = null, annonce = null, runs = [], boutique = null }) {
  const pf = job?.platform_fields ?? {};
  const marque = pf.introuvable_a_confirmer ?? null;
  const depuis = t(marque?.depuis);
  if (!Number.isFinite(depuis)) return { decision: 'attendre', raison: 'marque illisible' };
  if (fiche?.statut === 'vendu') return { decision: 'confirmer', raison: 'fiche vendue' };
  const platform = String(job?.platform ?? '');
  if (!identifiantAnnonceJob(job)) return { decision: 'attendre', raison: "identifiant exact de l'annonce inconnu" };
  const premiere = t(marque?.premiere);
  const premiereLecture = Number.isFinite(premiere) ? premiere : depuis;
  // (25/10) La page lue « vendue » à la lecture de CETTE pause (republish_etat_reel, posé par l'extension) :
  // la republication n'a plus d'objet — la preuve de pas-de-rouge (A4), pour les pauses posées avant elle.
  const etatLu = pf.republish_etat_reel ?? null;
  if (String(etatLu?.state ?? '') === 'sold' && t(etatLu?.at) >= premiereLecture - MARGE_LECTURE_MS) {
    return { decision: 'confirmer', raison: 'page lue « vendue » à la lecture', vendue: true };
  }
  // (24/10, lot « zéro blocage », A4) Le relevé dit VENDUE (transaction lue) → confirmée ; il a posé
  // `disparu_le` → l'annonce n'est plus en ligne, même si son statut est resté « en_ligne » (nino, Ornella).
  if (annonce && String(annonce.transaction_plateforme ?? '') === 'sold' && t(annonce.transaction_lue_le) > depuis) {
    return { decision: 'confirmer', raison: 'relevée vendue après la lecture' };
  }
  const disparue = annonce && Number.isFinite(t(annonce.disparu_le)) && !(t(annonce.vu_le) > t(annonce.disparu_le));
  const trace = vu ?? (annonce ? { vu_le: annonce.vu_le, statut: disparue ? 'disparue' : annonce.statut_plateforme } : null);
  const vuLe = t(trace?.vu_le);
  const st = String(trace?.statut ?? '');
  const enLigne = platform === 'vinted' ? st === 'active' : st === 'en_ligne';
  const fermee = platform === 'vinted' ? ['sold', 'closed', 'hidden', 'draft'].includes(st) : ['vendue', 'desactivee', 'disparue'].includes(st);
  if (Number.isFinite(vuLe) && vuLe > depuis) {
    if (enLigne) {
      if ((Number(marque?.reprises) || 0) >= MAX_REPRISES_INTROUVABLE) return { decision: 'persistant', raison: 'relevée en ligne, mais lecture refusée après 3 reprises' };
      return { decision: 'reprendre', raison: 'relevée en ligne après la lecture (même identifiant)' };
    }
    if (fermee) return { decision: 'confirmer', raison: `relevée « ${st} » après la lecture` };
    return { decision: 'attendre', raison: `relevée « ${st || 'inconnu'} »` };
  }
  // (25/10) L'absence se compte depuis la DERNIÈRE VUE de l'annonce (jamais avant le dernier démenti) :
  // un relevé complet de sa boutique, commencé après elle, ne la contenait pas — qu'il soit d'avant ou
  // d'après la lecture ratée. Il en faut deux, dont au moins un commencé après la PREMIÈRE lecture ratée
  // (ou le dernier démenti) : « le prochain relevé » tranche. Sans trace connue : deux relevés après la lecture.
  const dementi = t(marque?.dementi_le) || 0;
  const depuisAbsence = Math.max(premiereLecture, dementi);
  const laBoutique = platform === 'vinted'
    ? (String(boutique ?? '').trim() || String(pf.vinted_account_id ?? '').trim()
      || String(fiche?.vinted_account_id ?? '').trim() || boutiqueDeLaVue(runs, vuLe))
    : null;
  if (platform === 'vinted' && !laBoutique) {
    return { decision: 'attendre', raison: "boutique de l'annonce inconnue : aucun relevé ne peut prouver son absence" };
  }
  const borne = Number.isFinite(vuLe) ? Math.max(vuLe + 60_000, dementi) : depuisAbsence;
  const sansElle = (runs ?? []).filter((r) => t(r?.started_at) > borne
    && releveComplet(r, { platform, boutique: laBoutique }));
  const apresLecture = sansElle.filter((r) => t(r.started_at) > depuisAbsence).length;
  if (sansElle.length >= RELEVES_POUR_DISPARITION && apresLecture >= 1) {
    return { decision: 'confirmer', raison: `absente de ${sansElle.length} relevés complets depuis sa dernière vue, dont ${apresLecture} après la lecture` };
  }
  // `releve_attendu` : seul un relevé de plus peut trancher (handler-watch peut le demander).
  return {
    decision: 'attendre', releve_attendu: true,
    raison: !apresLecture
      ? (sansElle.length ? `absente de ${sansElle.length} relevé(s) complet(s) depuis sa dernière vue : le prochain relevé tranche` : 'aucun relevé complet après la lecture')
      : "absente d'un relevé complet : on attend le suivant",
  };
}
