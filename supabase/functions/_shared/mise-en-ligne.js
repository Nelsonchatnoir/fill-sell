// ═══════════════════════════════════════════════════════════════════════════
// DEPUIS QUAND L'ANNONCE EST EN LIGNE, PLATEFORME PAR PLATEFORME (31/10, lot H — XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// XEWER, 31/10 : « GIGN Anti-Terror Force » (fiche 1789717144944001) disait « En ligne · 42 j » — l'import eBay du
// 18/09 — alors qu'elle venait d'être republiée sur Vinted (20/10) et sur Leboncoin (21/10). La pastille rendait la
// PLUS ANCIENNE mise en ligne, toutes plateformes confondues, et sa règle de date n'était pas celle de la
// republication automatique (date de recréation d'abord, import daté du jour de l'import).
//
// LA RÈGLE — LA MÊME que l'éligibilité à la republication automatique (SQL republish_planifiee_candidats, relue en
// production le 31/10 ; elle n'est pas modifiée) :
//   · Vinted : inventaire.listed_at_guess (lu au relevé du dressing, réécrit par une recréation) ;
//   · les autres plateformes : le DERNIER job de dépôt ou de republication « published » qui porte un lien, par
//     coalesce(published_at, created_at) décroissant ; sa date = coalesce(published_at, created_at) — sauf une annonce
//     IMPORTÉE par un relevé (handler_build « releve-annonces… ») : sa date de mise en ligne RÉELLE lue sur la
//     plateforme (annonces_plateforme.publiee_le, la plus ancienne) quand elle est connue et antérieure au job.
// Un import n'est pas une mise en ligne par FillSell : sa nature est « importée ». Une republication remplacée par une
// plus récente (cancelled AVEC published_at) fait partie de l'historique ; une vraie annulation (jamais en ligne, sans
// published_at) n'apparaît nulle part.
// Pur (Deno + Node) : StockTab fournit l'article, ses jobs, les dates relevées et les plateformes en ligne.
import { numeroAnnonceDuJob } from "./retrait-deja-absent.js";

export const NATURES = Object.freeze({ PUBLIEE: "publiee", REPUBLIEE: "republiee", IMPORTEE: "importee" });
const JOUR_MS = 86400000;
const t = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : NaN; };
const estPublication = (j) => Boolean(j) && (j.action === "publish" || j.action === "republish");

/** Un job créé par un relevé (annonce trouvée sur la plateforme, pas déposée par FillSell). */
export function estImport(job) {
  return /^releve-annonces/i.test(String(job?.handler_build ?? ""));
}

/**
 * publiée / republiée / importée — ce que FillSell a fait de cette annonce. Importée : trouvée par un relevé
 * (« releve-annonces ») ou par la synchronisation du dressing Vinted (« … · sync-dressing », mesuré le 31/10 :
 * 83 929 dépôts sur 120 jours) — jamais une mise en ligne par FillSell. (La DATE d'un job suit, elle, la règle SQL :
 * seul « releve-annonces » y lit la date relevée, cf. dateDuJob ; Vinted se date sur la fiche.)
 */
export function natureDuJob(job) {
  if (estImport(job) || /·\s*sync-dressing\b/i.test(String(job?.handler_build ?? ""))) return NATURES.IMPORTEE;
  return job?.action === "republish" ? NATURES.REPUBLIEE : NATURES.PUBLIEE;
}

/** La clé des dates relevées : « plateforme:numéro ». */
export const cleDateRelevee = (platform, numero) => `${String(platform ?? "")}:${String(numero ?? "").trim()}`;

/**
 * Les dates de mise en ligne relevées (annonces_plateforme.publiee_le), la plus ancienne par annonce.
 * @param {Array<{platform, listing_id, publiee_le}>} lignes
 * @returns {Map<string, string>}
 */
export function indexerDatesRelevees(lignes) {
  const m = new Map();
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const id = String(l?.listing_id ?? "").trim();
    if (!id || !Number.isFinite(t(l?.publiee_le))) continue;
    const k = cleDateRelevee(l.platform, id);
    const avant = m.get(k);
    if (!avant || t(l.publiee_le) < t(avant)) m.set(k, String(l.publiee_le));
  }
  return m;
}

/** La date de mise en ligne d'UN job (règle SQL) : import → date relevée si connue et antérieure, sinon la sienne. */
export function dateDuJob(job, datesRelevees = null) {
  const propre = job?.published_at ?? job?.created_at ?? null;
  if (!Number.isFinite(t(propre))) return null;
  if (estImport(job) && datesRelevees instanceof Map) {
    // SQL : annonces_plateforme.listing_id = trim(platform_listing_id) — la colonne, jamais le lien.
    const relevee = datesRelevees.get(cleDateRelevee(job.platform, String(job.platform_listing_id ?? "").trim()));
    if (Number.isFinite(t(relevee)) && t(relevee) <= t(propre)) return String(relevee);
  }
  return String(propre);
}

/** Le job de l'annonce EN LIGNE d'une plateforme autre que Vinted (règle SQL), ou null. */
export function jobEnLigne(jobs, platform) {
  let best = null;
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (!estPublication(j) || j.platform !== platform || j.status !== "published") continue;
    if (!String(j.listing_url ?? "").trim()) continue;
    const d = t(j.published_at ?? j.created_at);
    if (!Number.isFinite(d)) continue;
    if (!best || d > t(best.published_at ?? best.created_at)) best = j;
  }
  return best;
}

/**
 * L'annonce en ligne d'une plateforme : { platform, date, nature, numero } (date null = inconnue), ou null.
 * Vinted : listed_at_guess de la fiche ; sa nature vient du job FillSell qui porte ce numéro, sinon « importée »
 * (trouvée au relevé du dressing).
 */
export function annonceEnLigne({ item, jobs, platform, datesRelevees = null }) {
  if (platform === "vinted") {
    const numero = String(item?.vinted_item_id ?? "").trim();
    if (!numero) return null;
    let job = null;
    for (const j of Array.isArray(jobs) ? jobs : []) {
      if (!estPublication(j) || j.platform !== "vinted" || !Number.isFinite(t(j.published_at))) continue;
      if (numeroAnnonceDuJob(j) !== numero) continue;
      if (!job || t(j.published_at) > t(job.published_at)) job = j;
    }
    const date = Number.isFinite(t(item?.listed_at_guess)) ? String(item.listed_at_guess) : null;
    return { platform, date, nature: job ? natureDuJob(job) : NATURES.IMPORTEE, numero };
  }
  const j = jobEnLigne(jobs, platform);
  if (!j) return null;
  return { platform, date: dateDuJob(j, datesRelevees), nature: natureDuJob(j), numero: numeroAnnonceDuJob(j) || String(j.platform_listing_id ?? "") };
}

/**
 * L'historique des mises en ligne d'une plateforme, la plus récente d'abord : chaque dépôt, republication ou import
 * qui a été EN LIGNE (published_at posé, quel que soit son statut d'aujourd'hui). Jamais une annulation sans mise en
 * ligne. Vinted : l'annonce du dressing que FillSell n'a pas déposée y entre comme « importée ».
 */
export function historiqueMisesEnLigne({ item, jobs, platform, datesRelevees = null }) {
  const out = [];
  const vus = new Set();
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (!estPublication(j) || j.platform !== platform) continue;
    if (!Number.isFinite(t(j.published_at))) continue;
    const date = dateDuJob(j, datesRelevees);
    const numero = numeroAnnonceDuJob(j) || String(j.platform_listing_id ?? "");
    out.push({ date, nature: natureDuJob(j), numero, statut: String(j.status ?? "") });
    if (numero) vus.add(numero);
  }
  if (platform === "vinted") {
    const numero = String(item?.vinted_item_id ?? "").trim();
    if (numero && !vus.has(numero) && Number.isFinite(t(item?.listed_at_guess))) {
      out.push({ date: String(item.listed_at_guess), nature: NATURES.IMPORTEE, numero, statut: "published" });
    }
  }
  out.sort((a, b) => (t(b.date) || 0) - (t(a.date) || 0));
  return out;
}

/** Jours entiers écoulés depuis une date (null si inconnue). */
export function joursDepuisDate(iso, maintenant = Date.now()) {
  const x = t(iso);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.floor((maintenant - x) / JOUR_MS));
}

/**
 * Plateforme par plateforme : { platform, enLigne, date, jours, nature, numero, historique }.
 * `enLigne` = les plateformes où la carte dit l'article en ligne (computeRemovalInfo) ; `plateformes` = celles du
 * compte (les autres n'apparaissent que si l'article y est en ligne). Une plateforme hors ligne garde son historique.
 */
export function datesParPlateforme({ item, jobs, enLigne = [], plateformes = [], datesRelevees = null, maintenant = Date.now() }) {
  const liste = [...new Set([...(enLigne ?? []), ...(plateformes ?? [])])];
  const out = [];
  for (const platform of liste) {
    const historique = historiqueMisesEnLigne({ item, jobs, platform, datesRelevees });
    const enLigneIci = (enLigne ?? []).includes(platform);
    const annonce = enLigneIci ? annonceEnLigne({ item, jobs, platform, datesRelevees }) : null;
    if (!enLigneIci && !historique.length) continue;
    const date = annonce?.date ?? null;
    out.push({
      platform, enLigne: enLigneIci, date, jours: joursDepuisDate(date, maintenant),
      nature: annonce?.nature ?? historique[0]?.nature ?? null, numero: annonce?.numero ?? null, historique,
    });
  }
  // En ligne d'abord, la plus récente en tête ; puis les plateformes hors ligne.
  out.sort((a, b) => (Number(b.enLigne) - Number(a.enLigne)) || ((t(b.date) || 0) - (t(a.date) || 0)));
  return out;
}

/**
 * La date que montre la carte : celle de la plateforme filtrée (« En ligne sur X »), sinon la mise en ligne la PLUS
 * RÉCENTE des plateformes en ligne. → { platform, date, jours, nature } ou null (rien de daté).
 */
export function miseEnLigneAffichee({ item, jobs, enLigne = [], plateforme = null, datesRelevees = null, maintenant = Date.now() }) {
  const cibles = plateforme ? (enLigne ?? []).filter((p) => p === plateforme) : (enLigne ?? []);
  let best = null;
  for (const platform of cibles) {
    const a = annonceEnLigne({ item, jobs, platform, datesRelevees });
    if (!a || !Number.isFinite(t(a.date))) continue;
    if (!best || t(a.date) > t(best.date)) best = a;
  }
  return best ? { ...best, jours: joursDepuisDate(best.date, maintenant) } : null;
}

/** L'âge de la PLUS ANCIENNE annonce en ligne (ce qui perd en visibilité : « Anciennes », « Remonter »). */
export function joursPlusAncienne({ item, jobs, enLigne = [], datesRelevees = null, maintenant = Date.now() }) {
  let max = null;
  for (const platform of enLigne ?? []) {
    const a = annonceEnLigne({ item, jobs, platform, datesRelevees });
    const j = joursDepuisDate(a?.date, maintenant);
    if (j != null && (max == null || j > max)) max = j;
  }
  return max;
}
