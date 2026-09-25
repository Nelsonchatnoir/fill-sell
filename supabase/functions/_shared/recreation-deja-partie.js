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
// son identité est CERTAINE — même compte, même titre, même prix, même photo,
// apparue après le retrait, en ligne, seule candidate. Sinon : needs_user avec
// le lien de l'annonce déjà partie. Jamais de redépôt en double.
//
// Ce module ne fait que JUGER, sur des données passées en paramètre (pur,
// sans I/O, Deno + Node) ; get-pending-jobs lit, écrit et sert.

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
export function candidatesDepuisRetrait({ jobId, ancienId, deletedAt, lignes }) {
  const retrait = ms(deletedAt);
  const ancien = idNum(ancienId);
  return (Array.isArray(lignes) ? lignes : []).filter((l) => {
    if (!l || !l.listing_id || String(l.listing_id) === String(ancienId ?? "")) return false;
    if (l.disparu_le) return false;
    if (l.job_id && String(l.job_id) !== String(jobId)) return false;
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
 *   · { verdict: "attendre", raison }            → l'empreinte photo n'est pas
 *                                                  encore calculée : on patiente ;
 *   · { verdict: "incertaine", raisons, liens }  → needs_user avec les liens.
 * `photoIdentique(ligne)` rend true / false / null (null = empreinte absente).
 */
export function jugerCandidates({ candidates, titres, prix, photoIdentique }) {
  if (!candidates.length) return { verdict: "aucune" };
  const liens = candidates.map((c) => c.url || c.listing_id).filter(Boolean);
  if (candidates.length > 1) {
    return { verdict: "incertaine", raisons: [`${candidates.length} annonces apparues depuis le retrait`], liens };
  }
  const c = candidates[0];
  const raisons = [];
  const titresOk = (titres ?? []).map(titreComparable).filter(Boolean);
  if (!titresOk.includes(titreComparable(c.titre))) raisons.push("titre différent");
  // Leboncoin arrondit price[0] à l'euro (44,99 → 45) : moins d'un euro d'écart.
  if (!(Number.isFinite(Number(c.prix)) && Number.isFinite(Number(prix)) && Math.abs(Number(c.prix) - Number(prix)) < 1)) {
    raisons.push("prix différent");
  }
  if (c.statut_plateforme !== "en_ligne") raisons.push(`statut « ${c.statut_plateforme ?? "inconnu"} » (pas en ligne)`);
  if (raisons.length) return { verdict: "incertaine", raisons, liens };
  const photo = photoIdentique(c);
  if (photo === null) return { verdict: "attendre", raison: "empreinte photo pas encore calculée", liens };
  if (photo !== true) return { verdict: "incertaine", raisons: ["photo différente"], liens };
  return { verdict: "certaine", retenue: c };
}
