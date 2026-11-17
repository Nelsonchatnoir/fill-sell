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
import { trancheLbcDepuisGrammes } from "./lbc-poids-tranche.js";
import { TRANSPORTEURS_LBC } from "./livraison-poids.js";

/** Les trois formats de Leboncoin (relevé du 20/09, src/utils/leboncoinColis.js). */
export const FORMATS_LBC = Object.freeze(["Petit", "Moyen", "Volumineux"]);
/** Marqueur d'un format posé depuis la fiche (choix rangé ou calcul du poids). */
export const FORMAT_DE_LA_FICHE = "fiche";
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
export function formatDeLaFiche({ poids_g = null, poids_change_le = null, attributs = null } = {}) {
  const g = grammes(poids_g);
  const c = choixRange(attributs);
  if (c && c.valeur !== "auto" && choixValable(c, g, poids_change_le)) return { valeur: c.valeur, origine: "choisi", poids_g: g };
  const d = formatLbcDuPoids(g);
  return d ? { valeur: d, origine: "poids", poids_g: g } : null;
}

/** L'objet `attributs` à écrire pour un choix fait à la main (« » ou « auto » = revenir au calcul du poids). */
export function choixFormatPourLaFiche(valeur, { poids_g = null, maintenant = new Date() } = {}) {
  return { format_colis_lbc: { v: formatValide(valeur) ?? "auto", source: "manuel", at: maintenant.toISOString(), poids_g: grammes(poids_g) } };
}

/**
 * Au service d'un job Leboncoin (publication ou republication) : le poids, la tranche « Poids du colis » (PRO) et le
 * format de la FICHE ; les transporteurs demandés suivent le poids. Modifie `pf` en place ; rend ce qui a été fait
 * (vide = rien, et rien n'est tracé).
 * @param {Record<string, any>} pf  platform_fields du job
 * @param {{ poids_g?: unknown, poids_change_le?: unknown, attributs?: unknown } | null} fiche
 * @param {{ action?: string, maintenant?: Date }} [opts]
 * @returns {string[]}
 */
export function colisLbcAuService(pf, fiche, { action = "publish", maintenant = new Date() } = {}) {
  const fait = [];
  if (!pf || typeof pf !== "object") return fait;
  const resolu = pf.needsUserResolved && typeof pf.needsUserResolved === "object" ? pf.needsUserResolved : {};
  const repondu = (cle) => resolu[cle] != null && String(resolu[cle]).trim() !== "";
  const gFiche = grammes(fiche?.poids_g);
  const chg = instant(fiche?.poids_change_le);

  // 1. Le poids : celui de la fiche, sauf une réponse sur ce job, ou un poids tapé sur la carte après le dernier
  //    changement de la fiche (publication en cours : il est rangé sur la fiche au clic Publier).
  const gAvant = grammes(pf.lbcPoidsGrammes);
  let g = gAvant;
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
    const cFiche = choixRange(fiche?.attributs);
    const ficheVaut = cFiche && choixValable(cFiche, gFiche, fiche?.poids_change_le) ? cFiche : null;
    const carteLe = instant(pf.format_colis_choisi_le);
    const carte = pf.format_colis_source === "manuel" && carteLe != null && formatValide(pf.format_colis)
      && (grammes(pf.format_colis_choisi_poids) ?? null) === (g ?? null)
      ? { valeur: formatValide(pf.format_colis), le: carteLe } : null;
    let cible = null;
    if (carte && (!ficheVaut || ficheVaut.le == null || carte.le >= ficheVaut.le)) cible = null; // la carte de cette publication : gardée telle quelle
    else if (ficheVaut && ficheVaut.valeur !== "auto") cible = { valeur: ficheVaut.valeur, origine: "choisi" };
    else if (gFiche != null) cible = { valeur: formatLbcDuPoids(g ?? gFiche), origine: "poids" };
    if (cible?.valeur) {
      const deja = formatValide(pf.format_colis) === cible.valeur && pf.format_colis_source === FORMAT_DE_LA_FICHE && pf.lbcFormatColis == null;
      if (!deja) {
        const avant = String(pf.format_colis ?? pf.lbcFormatColis ?? "").trim();
        pf.format_colis = cible.valeur;
        pf.format_colis_source = FORMAT_DE_LA_FICHE;
        delete pf.lbcFormatColis;
        delete pf.format_colis_choisi_le;
        delete pf.format_colis_choisi_poids;
        if (avant !== cible.valeur) fait.push(`format ← ${cible.valeur} (${cible.origine === "choisi" ? "choisi sur la fiche" : `poids de la fiche, ${g ?? gFiche} g`}${avant ? ` ; job : ${avant}` : ""})`);
        else fait.push(`format ${cible.valeur} confirmé par la fiche`);
      }
    }
  }

  // 3. La tranche « Poids du colis » du formulaire PRO suit le poids (sans effet sur le formulaire particulier).
  if (gFiche != null && g != null && !repondu("lbcAspects.estimated_parcel_weight")) {
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
  if (g != null && g !== gAvant && Array.isArray(pf.lbcTransporteurs)) {
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
