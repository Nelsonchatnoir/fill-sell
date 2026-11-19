// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE COLIS DE LA FICHE : POIDS ET FORMAT (17/11/2026, demande de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (compte Business, mails du 17/11 09:29 et 09:36) : à la republication, le poids de l'ANNONCE d'origine passait
// devant celui de la fiche (« poids ← 250 g (annonce ; copie : 200 g) », une fiche à 500 g repartie en « De 500 g à
// 1 kg »), et le format restait celui de l'ancienne annonce (articles de 100 g en « Moyen ») : il n'existait pas sur la
// fiche. La borne 500 g est juste (500 g = « De 250 g à 500 g », lbc-poids-tranche.js) : c'était le poids de l'annonce.
// RÈGLE (Nico, 17/11 — remplace « aucun format deviné » du 04/10 dès que la fiche a un poids) :
//   · la fiche porte le format (inventaire.attributs.format_colis_lbc = { v, source: "manuel", at, poids_g }, fusion
//     par le trigger existant : aucune colonne neuve) ;
//   · par défaut il se CALCULE du poids de la fiche (≤ 1 kg Petit, ≤ 40 kg Moyen, au-delà Volumineux — le « colis XL »
//     de Leboncoin, 40 à 150 kg) ;
//   · quand le poids change, il se recalcule, sauf un choix fait à la main APRÈS le dernier changement de poids (un
//     choix vaut pour le poids auquel il a été fait) ;
//   · publication et republication prennent le poids ET le format de la fiche (get-pending-jobs, au service) ; seules
//     passent devant : une réponse à une question sur CE job (needsUserResolved), un poids tapé ou un format choisi
//     sur la carte Livraison pendant la publication (plus récents que la fiche, et rangés sur elle au clic Publier).
// ⛔ Rien d'inventé sans poids ni choix sur la fiche : le job part comme avant. ⛔ Aucune annonce en ligne réécrite :
//    la règle s'applique au prochain dépôt de chaque annonce. Pur, sans écriture ; Deno + Node + Vite.
// (19/11, décision de Nico — compte 8ac5bbda, lot 7ff638d8 du 18/11) LA RÈGLE DU POIDS VAUT AUSSI EN LOT : 15 articles
// partis en « Petit » (une parka de 2 kg comprise). Cause : le format « Petit » choisi UNE fois pour tout le lot (bloc
// Livraison du lot) était posé sur chaque copie avec le marqueur d'un choix fait sur CET article (« manuel », daté, au
// poids de l'article), puis rangé sur la fiche au clic Publier comme un choix à la main (même seconde). Un format posé
// pour tout le lot n'est pas un choix de la personne pour cet article : il ne passe jamais devant le poids de la fiche
// (il ne sert qu'aux articles sans poids), et son écho rangé sur la fiche au clic Publier n'est pas un choix de la fiche.
// Seuls passent devant le poids : une réponse sur ce job, un format choisi sur la carte Livraison de CET article, un
// choix rangé sur la fiche qui n'est pas l'écho d'un lot.
import { trancheLbcDepuisGrammes } from "./lbc-poids-tranche.js";
import { TRANSPORTEURS_LBC } from "./livraison-poids.js";
// (19/11 soir) Le poids estimé de la copie, quand la fiche n'en a pas.
import { poidsEstimeDeLaCopie } from "./poids-estime.js";

/** Les trois formats de Leboncoin (relevé du 20/09, src/utils/leboncoinColis.js). */
export const FORMATS_LBC = Object.freeze(["Petit", "Moyen", "Volumineux"]);
/** Marqueur d'un format posé depuis la fiche (choix rangé ou calcul du poids). */
export const FORMAT_DE_LA_FICHE = "fiche";
/** (19/11) Marqueur d'un format posé pour TOUT le lot (bloc Livraison du lot) : jamais devant le poids de la fiche. */
export const FORMAT_DU_LOT = "lot";
/** Fenêtre de l'écho : le clic Publier range le format de la copie sur la fiche juste après la création du job. */
/** (19/11, Opus-1) Marqueur sur la fiche d'un choix fait pour UN article dans l'écran du lot : jamais un écho. */
export const GESTE_ARTICLE = "article";
export const ECHO_AVANT_MS = 5 * 1000;
export const ECHO_APRES_MS = 2 * 60 * 1000;
export const PETIT_MAX_G = 1000;
export const MOYEN_MAX_G = 40000;
// Écart d'horloge toléré entre le téléphone (date du choix) et la base (poids_change_le, now() du trigger).
const TOLERANCE_MS = 5 * 60 * 1000;

const grammes = (v) => {
  if (v == null || v === "") return null;
  const g = Math.round(Number(v));
  return Number.isFinite(g) && g > 0 ? g : null;
};
const instant = (v) => {
  if (v == null || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};
const formatValide = (v) => FORMATS_LBC.find((f) => f.toLowerCase() === String(v ?? "").trim().toLowerCase()) ?? null;

/** Le format par défaut d'un poids (g), ou null sans poids. */
export function formatLbcDuPoids(poids) {
  const g = grammes(poids);
  if (g == null) return null;
  if (g <= PETIT_MAX_G) return "Petit";
  if (g <= MOYEN_MAX_G) return "Moyen";
  return "Volumineux";
}

/** Le choix rangé sur la fiche : { valeur: format | "auto", le, poids_g } ou null. */
function choixRange(attributs) {
  const c = attributs && typeof attributs === "object" ? attributs.format_colis_lbc : null;
  if (!c || typeof c !== "object") return null;
  const v = String(c.v ?? "").trim();
  const valeur = v.toLowerCase() === "auto" ? "auto" : formatValide(v);
  return valeur ? { valeur, le: instant(c.at), poids_g: grammes(c.poids_g) } : null;
}

/** Un choix de la fiche vaut-il encore ? Fait au poids actuel, et pas avant le dernier changement de poids. */
function choixValable(c, poidsFiche, poidsChangeLe) {
  if (!c || (c.poids_g ?? null) !== (grammes(poidsFiche) ?? null)) return false;
  const chg = instant(poidsChangeLe);
  return chg == null || (c.le != null && chg <= c.le + TOLERANCE_MS);
}

/**
 * Le format de la fiche : { valeur, origine: "choisi" | "poids", poids_g } ou null (ni choix valable, ni poids).
 * @param {{ poids_g?: unknown, poids_change_le?: unknown, attributs?: unknown }} fiche
 */
export function formatDeLaFiche({ poids_g = null, poids_change_le = null, attributs = null, echo_du_lot = false } = {}) {
  const g = grammes(poids_g);
  const c = echo_du_lot === true ? null : choixRange(attributs); // (19/11) l'écho d'un lot n'est pas un choix
  if (c && c.valeur !== "auto" && choixValable(c, g, poids_change_le)) return { valeur: c.valeur, origine: "choisi", poids_g: g };
  const d = formatLbcDuPoids(g);
  return d ? { valeur: d, origine: "poids", poids_g: g } : null;
}

/**
 * (19/11) Le choix rangé sur la fiche est-il l'ÉCHO d'une publication en lot ? Le clic Publier du lot (écrans d'avant
 * l'OTA du 19/11) rangeait sur la fiche, quelques secondes après la création du job, le format posé pour tout le lot,
 * avec la source « manuel ». Écho = un choix daté entre 5 s avant et 2 min après la création d'une PUBLICATION Leboncoin
 * d'un lot de cet article (le lot n'a aucun choix de format par article : le seul geste possible est celui du lot). Le
 * format du job n'est pas comparé : le service le réécrit. Pur.
 * @param {unknown} attributs  inventaire.attributs (ou { format_colis_lbc })
 * @param {Array<{ created_at?: unknown }>} publicationsDuLot  publications Leboncoin en lot de l'article
 */
export function choixEchoDuLot(attributs, publicationsDuLot) {
  // (19/11, Opus-1) Un choix fait pour CET article dans le lot (geste « article ») n'est jamais un écho.
  const brut = attributs && typeof attributs === "object" ? attributs.format_colis_lbc : null;
  if (brut && typeof brut === "object" && brut.geste === GESTE_ARTICLE) return false;
  const c = choixRange(attributs);
  if (!c || c.valeur === "auto" || c.le == null || !Array.isArray(publicationsDuLot)) return false;
  return publicationsDuLot.some((p) => {
    const t = instant(p?.created_at);
    return t != null && c.le >= t - ECHO_AVANT_MS && c.le <= t + ECHO_APRES_MS;
  });
}

/**
 * (19/11) Au service : marque `echo_du_lot = true` sur les fiches (Map id → fiche) dont le choix rangé est l'écho d'une
 * publication en lot. Une lecture bornée — les seules fiches servies qui portent un choix daté, par lots de 200 —,
 * jamais d'écriture. `lireParLots(fabrique, ids, n)` : la lecture par lots de l'appelant (_shared/par-lots.ts).
 * @returns {Promise<number>} le nombre de fiches marquées
 */
export async function marquerEchosDuLot(client, fiches, lireParLots) {
  const ids = [...fiches].filter(([, f]) => choixRange(f?.attributs)?.le != null).map(([id]) => Number(id)).filter(Number.isFinite);
  if (!ids.length) return 0;
  const { data, error } = await lireParLots((lot) => client.from("cross_post_jobs").select("inventaire_id, created_at")
    .eq("platform", "leboncoin").eq("action", "publish").not("bulk_batch_id", "is", null).in("inventaire_id", lot), ids, 200);
  if (error || !Array.isArray(data)) return 0;
  const parArticle = new Map();
  for (const r of data) { const k = String(r?.inventaire_id); parArticle.set(k, [...(parArticle.get(k) ?? []), r]); }
  let n = 0;
  for (const [id, f] of fiches) {
    if (f && choixEchoDuLot(f.attributs, parArticle.get(String(id)) ?? [])) { f.echo_du_lot = true; n++; }
  }
  return n;
}

/** L'objet `attributs` à écrire pour un choix fait à la main (« » ou « auto » = revenir au calcul du poids). */
export function choixFormatPourLaFiche(valeur, { poids_g = null, maintenant = new Date(), geste = null } = {}) {
  return { format_colis_lbc: { v: formatValide(valeur) ?? "auto", source: "manuel", at: maintenant.toISOString(), poids_g: grammes(poids_g),
    ...(geste === GESTE_ARTICLE ? { geste: GESTE_ARTICLE } : {}) } };
}

/**
 * Au service d'un job Leboncoin (publication ou republication) : le poids, la tranche « Poids du colis » (PRO) et le
 * format de la FICHE ; les transporteurs demandés suivent le poids. Modifie `pf` en place ; rend ce qui a été fait
 * (vide = rien, et rien n'est tracé).
 * @param {Record<string, any>} pf  platform_fields du job
 * @param {{ poids_g?: unknown, poids_change_le?: unknown, attributs?: unknown, echo_du_lot?: boolean } | null} fiche
 *        `echo_du_lot` (19/11) : le choix rangé sur la fiche est l'écho d'une publication en lot (choixEchoDuLot).
 * @param {{ action?: string, maintenant?: Date, lot?: boolean }} [opts]  `lot` : le job est une publication EN LOT
 *        (bulk_batch_id) — son « manuel » est le format posé pour tout le lot (le lot n'en a pas d'autre).
 * @returns {string[]}
 */
export function colisLbcAuService(pf, fiche, { action = "publish", maintenant = new Date(), lot = false } = {}) {
  const fait = [];
  if (!pf || typeof pf !== "object") return fait;
  // (19/11, Opus-1) Un format corrigé pour UN article dans le lot (pf.format_colis_par_article) est un vrai choix.
  const formatDuLot = pf.format_colis_par_article !== true
    && (pf.format_colis_source === FORMAT_DU_LOT || (lot === true && action === "publish" && pf.format_colis_source === "manuel"));
  const resolu = pf.needsUserResolved && typeof pf.needsUserResolved === "object" ? pf.needsUserResolved : {};
  const repondu = (cle) => resolu[cle] != null && String(resolu[cle]).trim() !== "";
  const gFiche = grammes(fiche?.poids_g);
  const chg = instant(fiche?.poids_change_le);

  // 1. Le poids : celui de la fiche, sauf une réponse sur ce job, ou un poids tapé sur la carte après le dernier
  //    changement de la fiche (publication en cours : il est rangé sur la fiche au clic Publier).
  const gAvant = grammes(pf.lbcPoidsGrammes);
  let g = gAvant;
  // (19/11 soir, Nico « zéro friction », client Business) FICHE SANS POIDS : le poids ESTIMÉ que l'app pose sur la copie
  // (platform_fields.poids_estime.g, _shared/poids-estime.js) tient lieu de poids de la fiche pour le format, la tranche
  // PRO et les transporteurs — seulement si le poids du job EST cette estimation (ou absent) : un poids tapé reste à lui.
  // Avant : le poids du job était gardé, mais rien n'en découlait (« ni poids ni choix sur la fiche : inchangé »).
  const gEstime = gFiche == null && !repondu("lbcPoidsGrammes") ? poidsEstimeDeLaCopie(pf) : null;
  const estimeServi = gEstime != null && (gAvant == null || gAvant === gEstime);
  if (estimeServi && gAvant == null) {
    pf.lbcPoidsGrammes = gEstime;
    g = gEstime;
    fait.push(`poids ← ${gEstime} g (poids estimé${pf.poids_estime?.objet ? ` : ${String(pf.poids_estime.objet).slice(0, 40)}` : ""})`);
  }
  if (gFiche != null && !repondu("lbcPoidsGrammes") && g !== gFiche) {
    const saisiLe = instant(pf.lbcPoidsSaisiLe);
    const tapeApres = g != null && saisiLe != null && (chg == null || saisiLe > chg);
    if (!tapeApres) {
      pf.lbcPoidsGrammes = gFiche;
      g = gFiche;
      fait.push(`poids ← ${gFiche} g (fiche${gAvant != null ? ` ; job : ${gAvant} g` : ""})`);
    }
  }

  // 2. Le format : le choix le plus récent qui vaut encore (fiche ou carte de cette publication), sinon le calcul du
  //    poids de la fiche ; une réponse sur ce job reste devant ; ni poids ni choix sur la fiche : inchangé.
  if (!repondu("format_colis")) {
    // (19/11) Ni l'écho d'un lot sur la fiche, ni le format posé pour tout le lot ne sont un choix pour CET article.
    const cFiche = fiche?.echo_du_lot === true ? null : choixRange(fiche?.attributs);
    const ficheVaut = cFiche && choixValable(cFiche, gFiche, fiche?.poids_change_le) ? cFiche : null;
    const carteLe = instant(pf.format_colis_choisi_le);
    const carte = !formatDuLot && pf.format_colis_source === "manuel" && carteLe != null && formatValide(pf.format_colis)
      && (grammes(pf.format_colis_choisi_poids) ?? null) === (g ?? null)
      ? { valeur: formatValide(pf.format_colis), le: carteLe } : null;
    let cible = null;
    if (carte && (!ficheVaut || ficheVaut.le == null || carte.le >= ficheVaut.le)) cible = null; // la carte de cette publication : gardée telle quelle
    else if (ficheVaut && ficheVaut.valeur !== "auto") cible = { valeur: ficheVaut.valeur, origine: "choisi" };
    else if (gFiche != null) cible = { valeur: formatLbcDuPoids(g ?? gFiche), origine: "poids" };
    else if (estimeServi) cible = { valeur: formatLbcDuPoids(g ?? gEstime), origine: "poids_estime" };
    if (cible?.valeur) {
      const deja = formatValide(pf.format_colis) === cible.valeur && pf.format_colis_source === FORMAT_DE_LA_FICHE && pf.lbcFormatColis == null;
      if (!deja) {
        const avant = String(pf.format_colis ?? pf.lbcFormatColis ?? "").trim();
        pf.format_colis = cible.valeur;
        pf.format_colis_source = FORMAT_DE_LA_FICHE;
        delete pf.lbcFormatColis;
        delete pf.format_colis_choisi_le;
        delete pf.format_colis_choisi_poids;
        const deLot = formatDuLot && avant ? ` ; posé pour tout le lot : ${avant}` : avant ? ` ; job : ${avant}` : "";
        const echo = fiche?.echo_du_lot === true ? " ; écho du lot sur la fiche ignoré" : "";
        if (avant !== cible.valeur) fait.push(`format ← ${cible.valeur} (${cible.origine === "choisi" ? "choisi sur la fiche" : cible.origine === "poids_estime" ? `poids estimé, ${g ?? gEstime} g` : `poids de la fiche, ${g ?? gFiche} g`}${deLot}${echo})`);
        else fait.push(`format ${cible.valeur} confirmé par la fiche${echo}`);
      }
    }
  }

  // 3. La tranche « Poids du colis » du formulaire PRO suit le poids (sans effet sur le formulaire particulier).
  if ((gFiche != null || estimeServi) && g != null && !repondu("lbcAspects.estimated_parcel_weight")) {
    const t = trancheLbcDepuisGrammes(g);
    const aspects = pf.lbcAspects && typeof pf.lbcAspects === "object" ? pf.lbcAspects : {};
    if (t && String(aspects.estimated_parcel_weight ?? "").trim() !== t) {
      const avantT = String(aspects.estimated_parcel_weight ?? "").trim();
      pf.lbcAspects = { ...aspects, estimated_parcel_weight: t };
      fait.push(`poids du colis (pro) ← ${t}${avantT ? ` (job : ${avantT})` : ""}`);
    }
  }

  // 4. Les transporteurs demandés qui ne prennent plus ce poids sont retirés (Courrier suivi ≤ 2 kg) : demandés, ils
  //    arrêteraient le dépôt (ensemble exact exigé par l'extension). Aucun reste : Leboncoin garde son réglage.
  if (g != null && (g !== gAvant || estimeServi) && Array.isArray(pf.lbcTransporteurs)) {
    const permis = new Set(TRANSPORTEURS_LBC.filter((t) => t.kgMax * 1000 >= g).map((t) => t.nom));
    const gardes = pf.lbcTransporteurs.filter((n) => permis.has(String(n)) || !TRANSPORTEURS_LBC.some((t) => t.nom === String(n)));
    if (gardes.length !== pf.lbcTransporteurs.length) {
      const retires = pf.lbcTransporteurs.filter((n) => !gardes.includes(n));
      if (gardes.length) pf.lbcTransporteurs = gardes; else delete pf.lbcTransporteurs;
      fait.push(`transporteurs retirés pour ${g} g : ${retires.join(", ")}`);
    }
  }

  if (fait.length) pf.colis_de_la_fiche = { fait, action, le: maintenant.toISOString(), pose_par: "get-pending-jobs (_shared/colis-de-la-fiche.js)" };
  return fait;
}
