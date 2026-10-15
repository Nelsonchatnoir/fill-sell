// ═══════════════════════════════════════════════════════════════════════════
// REDÉPÔT INTERROMPU : UNE ANNONCE EST PEUT-ÊTRE DÉJÀ PARTIE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Les Petites Fioles, f554a951 (🎅 calendrier, Leboncoin PRO) : annonce
// retirée à 07:48Z, recréation arrêtée à 09:34:49Z sur
// /deposer-une-annonce/options (fill_step « depot », fenêtre minimisée) et
// rendue « pending » par la reprise ordinaire → redéposée à 09:42Z. Leboncoin
// avait gardé LES DEUX : 3276284130 (le dépôt « interrompu ») et 3276289397.
// Toutes deux désactivées le soir même.
// Le filet existant (verifier_doublon_avant_publication) avait deux trous :
//   · il n'était posé que sur un retour needs_user/failed — celui-ci était
//     « pending » ;
//   · la vérification de l'extension ne lit que les annonces « En ligne » par
//     titre : une annonce en vérification lui échappe.
//
// LA RÈGLE (Nico, 25/09) : après un essai de recréation qui a PU envoyer le
// dépôt, on ne redépose plus sans avoir relu les annonces du compte. Une
// annonce apparue depuis le retrait est rattachée AUTOMATIQUEMENT seulement si
// un identifiant issu du dépôt la désigne. Titre, prix, photo et date ne
// prouvent jamais l'exemplaire (règle Nico du 28/09). Sinon : needs_user avec
// le lien de l'annonce déjà partie. Jamais de redépôt en double.
//
// Ce module ne fait que JUGER, sur des données passées en paramètre (pur,
// sans I/O, Deno + Node) ; get-pending-jobs lit, écrit et sert.

import { trancherParPhotos } from "./annonce-partagee.js";

// Étapes du remplissage Leboncoin à partir desquelles le dépôt a pu partir
// (relayerEtape de leboncoin.js), et pages qui prouvent qu'il est parti.
const ETAPES_ENVOI = new Set(["depot", "options"]);
const URL_ENVOI_RE = {
  leboncoin: /\/deposer-une-annonce\/(?:options|confirmation)(?:[/?#]|$)/,
  // Beebs ne relaie pas d'étape : seule la page produit (/fr/p/<id>) dit
  // qu'un dépôt a abouti.
  beebs: /beebs\.app\/[a-z]{2}\/p\/\d+/,
};

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/**
 * Le dernier essai de recréation qui a PU envoyer le dépôt, depuis le retrait.
 * Rend { at, raison } (at = ISO) ou null. null aussi quand une vérification a
 * déjà eu lieu APRÈS cet essai (`recreation_verifiee.apres`).
 */
export function depotPeutEtrePartiDepuis(platform, pf) {
  if (!pf || typeof pf !== "object") return null;
  if (pf.republish_step !== "deleted") return null;
  const retrait = ms(pf.deleted_at);
  if (retrait == null) return null;
  const urlRe = URL_ENVOI_RE[platform];
  if (!urlRe) return null;
  let dernier = null;
  const wws = pf.work_window_state && typeof pf.work_window_state === "object" ? pf.work_window_state : {};
  const fins = [...(Array.isArray(wws.fins) ? wws.fins : []), ...(wws.at_end ? [wws.at_end] : [])];
  for (const f of fins) {
    const t = ms(f?.at);
    if (t == null || t <= retrait) continue;
    const etape = String(f?.fill_step ?? "");
    const url = String(f?.tab_url ?? "");
    const suspect = (platform === "leboncoin" && ETAPES_ENVOI.has(etape)) || urlRe.test(url);
    if (suspect && (!dernier || t > dernier.t)) {
      dernier = { t, raison: `essai terminé à l'étape « ${etape || "?"} » sur ${url || "?"}` };
    }
  }
  // Un essai COMMENCÉ après le retrait sans aucune fin relevée depuis : le
  // service worker est mort en route, et la reprise « stale » de l'extension
  // (recoverStaleProcessingJobs) l'a remis en file sans rien écrire. On ne
  // sait pas où il s'est arrêté — donc on ne sait pas si le dépôt est parti.
  const debut = ms(wws.at_start?.at);
  if (debut != null && debut > retrait && !fins.some((f) => { const t = ms(f?.at); return t != null && t >= debut; })) {
    if (!dernier || debut > dernier.t) dernier = { t: debut, raison: "essai commencé après le retrait, sans fin relevée" };
  }
  // Un essai coupé en route (ordinateur muet) : handler-watch pose ce
  // marqueur, faute de savoir où il s'est arrêté.
  const m = pf.recreation_depot_parti && typeof pf.recreation_depot_parti === "object" ? pf.recreation_depot_parti : null;
  const tm = ms(m?.at);
  if (tm != null && tm > retrait && (!dernier || tm > dernier.t)) {
    dernier = { t: tm, raison: String(m.raison ?? "essai interrompu sans fin connue") };
  }
  if (!dernier) return null;
  const verifie = ms(pf.recreation_verifiee?.apres);
  if (verifie != null && verifie >= dernier.t) return null;
  return { at: new Date(dernier.t).toISOString(), raison: dernier.raison };
}

/** Titre comparable : sans emoji, sans accents, sans ponctuation, minuscules. */
export function titreComparable(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const idNum = (s) => (/^\d+$/.test(String(s ?? "")) ? BigInt(String(s)) : null);

/**
 * Les annonces apparues depuis le retrait, parmi les lignes relevées du compte
 * sur la plateforme. Une ligne compte si : autre identifiant que l'annonce
 * retirée, vue pour la première fois après le retrait (et, quand les deux
 * identifiants sont numériques, plus récente que l'ancienne), pas déjà
 * rattachée à un AUTRE job, pas disparue.
 */
/** @param {{ jobId: any, ancienId: any, deletedAt: any, lignes: any[], inventaireId?: any }} arg */
export function candidatesDepuisRetrait({ jobId, ancienId, deletedAt, lignes, inventaireId = null }) {
  const retrait = ms(deletedAt);
  const ancien = idNum(ancienId);
  return (Array.isArray(lignes) ? lignes : []).filter((l) => {
    if (!l || !l.listing_id || String(l.listing_id) === String(ancienId ?? "")) return false;
    if (l.disparu_le) return false;
    // (2026-09-27) Une ligne rattachée à un AUTRE job ne compte plus que si
    // elle appartient à une AUTRE fiche : la copie déjà en ligne de la MÊME
    // fiche (importée ou rattachée par le relevé à un job de suivi) est
    // précisément l'annonce qu'il ne faut pas redéposer — l'écarter donnait un
    // faux « aucune », donc un doublon.
    if (l.job_id && String(l.job_id) !== String(jobId)) {
      const memeFiche = inventaireId != null && l.inventaire_id != null && String(l.inventaire_id) === String(inventaireId);
      if (!memeFiche) return false;
    }
    const vu = ms(l.created_at);
    if (retrait == null || vu == null || vu < retrait) return false;
    const n = idNum(l.listing_id);
    if (ancien != null && n != null && n <= ancien) return false;
    return true;
  });
}

/**
 * Le verdict sur les candidates.
 *   · { verdict: "aucune" }                      → on peut redéposer ;
 *   · { verdict: "certaine", retenue }           → rattachement automatique ;
 *   · { verdict: "incertaine", raisons, liens }  → needs_user avec les liens.
 * @param {{ candidates: any[], listingIdProuve?: string | null, empreintesCopie?: any[] | null, empreintesParCandidate?: Map<string, any[]> | null }} arg
 */
export function jugerCandidates({ candidates, listingIdProuve = null, empreintesCopie = null, empreintesParCandidate = null }) {
  if (!candidates.length) return { verdict: "aucune" };
  const liens = candidates.map((c) => c.url || c.listing_id).filter(Boolean);
  const preuve = String(listingIdProuve ?? "").trim();
  if (candidates.length === 1 && preuve && String(candidates[0].listing_id) === preuve && candidates[0].statut_plateforme === "en_ligne") {
    return { verdict: "certaine", retenue: candidates[0], preuve: "identifiant conservé après le dépôt" };
  }
  // ── LES PHOTOS DE NOTRE COPIE (15/10 soir, camille.ferren 5b6c8cc9) ──────
  // Cascade identifiants → photos → IA (Nico, 15/10). « Kit calendrier de
  // l'avent » : annonce 3288747290 apparue à 12:34, pendant la remise en
  // ligne, avec EXACTEMENT les photos de notre copie (dHash et pHash à 0-1
  // bit), quand l'annonce d'origine de la personne portait d'autres photos.
  // C'est notre dépôt. La preuve compare la COPIE envoyée (photos du job), pas
  // la fiche : une annonce mise en ligne à la main par la personne porte ses
  // propres photos. Une seule candidate doit avoir les mêmes photos, toutes les
  // autres aucune photo approchante (trancherParPhotos, seuils du moteur).
  // En doute : la question, comme avant. Le risque résiduel (deux exemplaires
  // aux mêmes photos) ne crée jamais de doublon : il en manquerait un.
  if (Array.isArray(empreintesCopie) && empreintesCopie.length && empreintesParCandidate instanceof Map) {
    const parCandidate = new Map(candidates.map((c) => [String(c.listing_id), empreintesParCandidate.get(String(c.listing_id)) ?? []]));
    const ph = trancherParPhotos(empreintesCopie, parCandidate);
    const retenue = ph.fiche ? candidates.find((c) => String(c.listing_id) === String(ph.fiche)) : null;
    if (retenue && /^(en_ligne|en_verification)$/.test(String(retenue.statut_plateforme ?? ""))) {
      return { verdict: "certaine", retenue, preuve: "photos identiques à celles de notre copie", photos: ph.niveaux };
    }
    if (candidates.length > 1) {
      return { verdict: "incertaine", raisons: [`${candidates.length} annonces apparues depuis le retrait`], liens, photos: ph.niveaux };
    }
    return { verdict: "incertaine", raisons: ["aucun identifiant de dépôt ni photo identique ne prouve que cette annonce est le même exemplaire"], liens, photos: ph.niveaux };
  }
  if (candidates.length > 1) {
    return { verdict: "incertaine", raisons: [`${candidates.length} annonces apparues depuis le retrait`], liens };
  }
  return { verdict: "incertaine", raisons: ["aucun identifiant de dépôt ne prouve que cette annonce est le même exemplaire"], liens };
}

/** Les URL https d'un champ photos (chaînes ou objets { url }). */
export function urlsPhotos(v, n = 6) {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? x.url : null))
    .filter((u) => typeof u === "string" && /^https:\/\//.test(u))
    .slice(0, n);
}

/**
 * @param {any} pf0
 * @param {any} c
 * @param {{ trace?: any, preuve?: string | null, photos?: any, posePar?: string, maintenant?: string }} [opts]
 * @returns {Record<string, any>}
 * Le patch qui rattache une remise en ligne à l'annonce déjà partie (identité
 * CERTAINE) : le job devient « published » à l'étape « recreated », sans
 * redépôt. Même forme que get-pending-jobs (redépôt interrompu). Pur.
 */
export function patchRattachementRecreation(pf0, c, { trace = null, preuve = null, photos = null, posePar = "handler-watch", maintenant = new Date().toISOString() } = {}) {
  const url = String(c?.url ?? "") || null;
  const pf = {
    ...(pf0 ?? {}),
    republish_step: "recreated",
    recreated_at: String(c?.created_at ?? maintenant),
    new_listing_url: url,
    ...(trace ? { recreation_verifiee: trace } : {}),
    rattachement_recreation: {
      le: maintenant, listing_id: String(c?.listing_id ?? ""),
      preuve: preuve ?? "identifiant conservé après le dépôt",
      ...(photos ? { photos } : {}),
      pose_par: posePar,
    },
  };
  delete pf.needs_user_source;
  return { status: "published", error: null, published_at: maintenant, platform_listing_id: String(c?.listing_id ?? ""), listing_url: url, platform_fields: pf };
}
