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

import { decisionIntrouvable, identifiantAnnonceJob, messageDisparueConfirmee } from './introuvable-a-confirmer.js';

export const PLATEFORMES_RELEVEES = ['vinted', 'leboncoin', 'beebs', 'depop'];

const t = (v) => { const x = Date.parse(String(v ?? '')); return Number.isFinite(x) ? x : NaN; };
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop' };

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
  if (!identifiantAnnonceJob(job)) return { decision: 'attendre', raison: "identifiant exact de l'annonce inconnu" };
  const lecture = lectureRateeAnnoncePubliee(job);
  if (!lecture) return { decision: 'attendre', raison: 'aucune lecture ratée à répétition' };
  // Beebs : relevée dans l'onglet « en vérification » (et pas disparue depuis) → jamais « disparue ».
  if (annonce && String(annonce.statut_plateforme ?? '') === 'en_verification' && !(t(annonce.disparu_le) > t(annonce.vu_le))) {
    return { decision: 'en_verification', raison: `relevée « en vérification » chez ${NOMS[platform] ?? platform} le ${String(annonce.vu_le ?? '?')}` };
  }
  const d = decisionIntrouvable({
    job: { ...job, platform_fields: { ...(job.platform_fields ?? {}), introuvable_a_confirmer: { depuis: lecture, premiere: lecture } } },
    fiche, vu, annonce, runs, boutique, creeLe,
  });
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

/** Le patch d'un job publié clos (pur) : compare-and-set sur « published » côté appelant. */
export function patchAnnoncePublieeDisparue(job, decision, { at = new Date().toISOString(), posePar = 'handler-watch' } = {}) {
  const pf = { ...(job?.platform_fields ?? {}) };
  pf.annonce_disparue = { at, motif: decision?.raison ?? null, vendue: Boolean(decision?.vendue), pose_par: posePar };
  return { status: 'cancelled', error: messageAnnoncePublieeDisparue(String(job?.platform ?? ''), Boolean(decision?.vendue)), platform_fields: pf };
}
