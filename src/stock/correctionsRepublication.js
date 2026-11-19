// ═══════════════════════════════════════════════════════════════════════════
// CORRIGER UN ARTICLE AVANT DE LE REPUBLIER (19/11/2026, refonte — maquettes lot-1911 validées par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le même principe que la publication en lot : dans la feuille de republication, toucher un article ouvre ce qui
// repart (titre, description, prix, état, marque, taille, couleur, matière, poids), et tout se corrige — pour toutes
// ses plateformes (défaut) ou seulement pour l'une.
//   · la FICHE reçoit la correction au geste (colonnes et attributs « manuel », valeurs gardées par plateforme :
//     publication/lot/corrections.js, la même écriture que le lot) ;
//   · la TÂCHE de republication porte la correction (platform_fields.corrections_republication — forme convenue avec
//     le serveur le 19/11 : { titre?, description?, prix?, etat?, marque?, taille?, couleurs?, matieres?, colis? },
//     chaque entrée { v: libellé, id?: identifiant de la plateforme }) : le serveur la pose là où la recréation ne
//     repart pas de la fiche (Vinted : sur la capture, au fil des livraisons du serveur) ;
//   · le PRIX corrigé est celui de la republication de l'article (prixRepublication, le chemin existant).
// ⛔ Cadence intouchable : rien ici ne choisit QUAND une annonce part — l'envoi reste lancerRepublication /
//    lancerRepublicationLot, dans l'ordre de la sélection.
// ⛔ eBay n'est jamais republié : une correction ne touche que la fiche pour lui.
// Pur, sauf `appliquerCorrectionsTache` (une lecture, une écriture bornée à la tâche « pending »).
import { patchFicheCorrection, PORTEE_TOUTES, CHAMPS_PARTAGES } from "../publication/lot/corrections.js";
import { etatPourPlateforme } from "../../supabase/functions/_shared/etat-plateformes.js";

export const CLE_CORRECTIONS_REPUBLICATION = "corrections_republication";
export const CHAMPS_REPUBLICATION = Object.freeze(["titre", "description", "prix", "etat", "marque", "taille", "couleur", "matiere", "poids"]);
const CLE_TACHE = { titre: "titre", description: "description", prix: "prix", etat: "etat", marque: "marque", taille: "taille", couleur: "couleurs", matiere: "matieres" };

const txt = (v) => (v == null ? "" : String(v)).trim();
const attrV = (item, cle) => {
  const a = item?.attributs?.[cle];
  return txt(a && typeof a === "object" && !Array.isArray(a) ? a.v : a);
};

/** La valeur de la FICHE pour un champ (ce qui repart quand rien n'est corrigé). */
export function valeurDeLaFiche(item, cle) {
  if (cle === "titre") return txt(item?.title ?? item?.titre);
  if (cle === "description") return String(item?.description ?? "");
  if (cle === "prix") { const v = item?.prix_vente ?? item?.sell; return v == null || v === "" ? "" : String(v); }
  if (cle === "marque") return txt(item?.marque) || attrV(item, "marque");
  if (cle === "poids") { const g = Number(item?.poids_g); return Number.isFinite(g) && g > 0 ? String(Math.round(g)) : ""; }
  return attrV(item, cle);
}

/** Les corrections d'un article dans la feuille : { toutes: { cle: v }, parPf: { p: { cle: v } } }. */
export const correctionsVides = () => ({ toutes: {}, parPf: {} });

/** Une correction de plus (une portée à la fois : « toutes » efface la valeur à part du même champ). */
export function avecCorrection(c, { cle, valeur, portee }) {
  const base = c ?? correctionsVides();
  if (portee === PORTEE_TOUTES) {
    const parPf = {};
    for (const [p, champs] of Object.entries(base.parPf ?? {})) {
      const { [cle]: _ote, ...reste } = champs ?? {};
      if (Object.keys(reste).length) parPf[p] = reste;
    }
    return { toutes: { ...(base.toutes ?? {}), [cle]: valeur }, parPf };
  }
  return { toutes: { ...(base.toutes ?? {}) }, parPf: { ...(base.parPf ?? {}), [portee]: { ...(base.parPf?.[portee] ?? {}), [cle]: valeur } } };
}

/** La valeur qui repart sur une plateforme : la sienne, sinon celle de l'article corrigée, sinon celle de la fiche. */
export function valeurQuiRepart(item, c, plateforme, cle) {
  const a = c?.parPf?.[plateforme]?.[cle];
  if (a != null && a !== "") return String(a);
  const t = c?.toutes?.[cle];
  if (t != null && t !== "") return String(t);
  return valeurDeLaFiche(item, cle);
}

/** Les champs corrigés d'un article (pour la ligne de la feuille), sans doublon. */
export function champsCorriges(c) {
  return [...new Set([...Object.keys(c?.toutes ?? {}), ...Object.values(c?.parPf ?? {}).flatMap((x) => Object.keys(x ?? {}))])];
}

/**
 * Ce que la tâche d'UNE plateforme porte : corrections_republication (null = rien). Le poids n'y va pas : la fiche le
 * porte, le serveur le lit là. L'état part dans le vocabulaire de la plateforme (jamais un état meilleur que le vrai).
 */
export function correctionsPourLaTache(c, plateforme) {
  const out = {};
  const champs = { ...(c?.toutes ?? {}), ...(c?.parPf?.[plateforme] ?? {}) };
  for (const [cle, brut] of Object.entries(champs)) {
    const k = CLE_TACHE[cle];
    if (!k) continue;
    const v = cle === "description" ? String(brut ?? "") : txt(brut);
    if (!v.trim()) continue;
    if (cle === "etat") {
      const e = etatPourPlateforme(v, plateforme);
      if (e?.valeur && !e.meilleur) out.etat = { v: e.valeur };
      continue;
    }
    if (cle === "prix") { const n = Number(v.replace(",", ".")); if (Number.isFinite(n) && n >= 1) out.prix = { v: String(n) }; continue; }
    out[k] = { v };
  }
  return Object.keys(out).length ? out : null;
}

/** Le prix corrigé pour CETTE plateforme (sa valeur à part, sinon celle de l'article), ou null. */
export function prixCorrige(c, plateforme) {
  const brut = c?.parPf?.[plateforme]?.prix ?? c?.toutes?.prix ?? null;
  if (brut == null || brut === "") return null;
  const n = Number(String(brut).replace(",", "."));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Ce que la FICHE reçoit pour une correction faite dans la feuille (même règle que le lot : corrections.js), plus le
 * titre et la description en colonnes (marqués « manuel », comme une retouche du stepper) et le poids (poids_g).
 */
export function patchFicheRepublication({ item, cle, valeur, portee, maintenant = new Date() }) {
  const at = maintenant.toISOString();
  const v = cle === "description" ? String(valeur ?? "") : txt(valeur);
  if (portee === PORTEE_TOUTES && (cle === "titre" || cle === "description")) {
    if (!v.trim()) return { colonnes: {}, attributs: {} };
    const p = patchFicheCorrection({ cle, valeur: v, portee, base: valeurDeLaFiche(item, cle), attributs: item?.attributs ?? null, maintenant });
    return { colonnes: { ...p.colonnes, [cle]: v }, attributs: { ...p.attributs, [`${cle}_source`]: { v: "manuel", source: "manuel", at } } };
  }
  if (cle === "poids") {
    const g = Math.round(Number(String(v).replace(",", ".")));
    return Number.isFinite(g) && g > 0 && g <= 150000 ? { colonnes: { poids_g: g }, attributs: {} } : { colonnes: {}, attributs: {} };
  }
  return patchFicheCorrection({ cle, valeur: v, portee, base: valeurDeLaFiche(item, cle), attributs: item?.attributs ?? null, maintenant });
}

/** Les champs partagés (marque, taille, couleur, matière) : une correction « toutes » vaut aussi pour eBay (fiche). */
export const estPartage = (cle) => CHAMPS_PARTAGES.includes(cle);

/**
 * Les cibles de la feuille de republication (« Republier » ET « Remonter les K plus anciennes ») : la MÊME
 * construction pour les deux boutons — photos choisies et corrections comprises.
 * (19/11, défaut corrigé) « Remonter les plus anciennes » bâtissait ses cibles sans les photos choisies : elles
 * repartaient avec leurs photos habituelles (scripts/lot-corrections-1911-selftest.mjs, verrou).
 * @param {{ items: Array<{item, plateformes?}>, cochee: (p:string)=>boolean, prix: number|null, baissePct: number|null,
 *           prixSaisi?: boolean, photosDe: (item, envoyees:string[]) => object|null, correctionsDe?: (item) => object|null,
 *           garder?: Set<number>|null }} p
 */
export function ciblesDeLaFeuille({ items, cochee, prix = null, baissePct = null, prixSaisi = false, photosDe, correctionsDe = () => null, garder = null }) {
  return (items ?? []).map(({ item, plateformes }, i) => {
    if (garder && !garder.has(i)) return null;
    const envoyees = (plateformes ?? ["vinted"]).filter(cochee);
    const corrections = correctionsDe(item) ?? null;
    return {
      item, prix, baissePct, ...(prixSaisi ? { prixSaisi: true } : {}),
      plateformes: envoyees, photosParPlateforme: photosDe(item, envoyees),
      ...(corrections && champsCorriges(corrections).length ? { corrections } : {}),
    };
  }).filter((c) => c && c.plateformes.length);
}

/**
 * Écrit les corrections sur la tâche de republication que spend_coins_and_republish vient de créer : relue, puis écrite
 * SEULEMENT si elle est encore « pending » (jamais par-dessus une recréation engagée). Les autres clés sont gardées.
 * @returns {Promise<{ok:boolean, motif?:string}>}
 */
export async function appliquerCorrectionsTache(supabase, { jobId, platform, corrections }) {
  if (!jobId || !corrections) return { ok: false, motif: "aucune_correction" };
  const { data: j, error } = await supabase.from("cross_post_jobs").select("id, status, platform, platform_fields").eq("id", jobId).maybeSingle();
  if (error || !j) return { ok: false, motif: error?.message ?? "tache_introuvable" };
  if (j.platform !== platform) return { ok: false, motif: "autre_plateforme" };
  if (j.status !== "pending") return { ok: false, motif: "tache_deja_engagee" };
  const pf = j.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {};
  if (pf.deleted_at != null) return { ok: false, motif: "tache_deja_engagee" };
  const suite = { ...pf, [CLE_CORRECTIONS_REPUBLICATION]: { ...corrections, le: new Date().toISOString(), par: "feuille_republication" } };
  const { data: maj, error: e2 } = await supabase.from("cross_post_jobs").update({ platform_fields: suite }).eq("id", jobId).eq("status", "pending").select("id");
  if (e2 || !maj?.length) return { ok: false, motif: e2?.message ?? "tache_deja_engagee" };
  return { ok: true };
}
