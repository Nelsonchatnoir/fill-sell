// ═══════════════════════════════════════════════════════════════════════════
// VINTED : LE FORMAT DE COLIS QU'UNE REPUBLICATION NE PEUT PLUS GARDER (25/10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Corrige pour que ces republications passent sans rien demander. » Trois
// republications Vinted en pause AVANT tout retrait (needs_user, source
// prevol_negatif, étape captured), question « Format du colis » :
//   A. PAUGUES 110c27ae (« Toiles et panneaux », Grand) et 5ad5bbb1
//      (« Encadrements », Moyen) : la correction « œuvre d'art » du 22/10 avait
//      RÉÉCRIT leurs captures vers « Peintures » (3847, grille au poids
//      5/10/20/30 kg) — NOTRE faute. Le rayon d'origine n'était plus que dans
//      capture_corrigee_par_la_fiche.avant. Règle : la republication repart à
//      `a_capturer` (capture, copie et question retirées) — l'annonce, toujours
//      en ligne, est relue DANS SON RAYON ; capture_corrigee_par_la_fiche reste
//      sur le job : get-pending-jobs ne corrige plus jamais sa capture.
//   B. Romain Knockaert c28e2c60 (« Bottes hautes », 211) : même rayon, mais
//      l'id 8 (HEAVY_SMALL — « Lourd (2 kg et +) » à côté de Petit/Moyen/Grand
//      jusqu'au 15/10) a disparu de la grille de ce rayon le 15/10 (0 fois sur
//      3 222 grilles relevées depuis le 16/10). Règle : le plus petit format
//      offert dont la capacité est au moins celle d'origine, sinon le plus grand
//      offert (8 face à {1,2,3} → 3 « Grand », ce que Vinted recommande) — posé
//      comme si la personne l'avait choisi (colis_choisi, needsUserResolved),
//      tracé (colis_tranche_par_fillsell).
// L'ORDRE DES CAPACITÉS (relevé du référentiel Vinted,
// shipping-estimation/external/catalogs/{id}/package_sizes, 25/10) :
//   SMALL < MEDIUM < LARGE < HEAVY_SMALL = BULKY_SMALL < HEAVY_MEDIUM =
//   BULKY_MEDIUM < HEAVY_LARGE = BULKY_LARGE < BULKY_X_LARGE.
// ⛔ Jamais un format inventé : seulement un format de la grille que le
//    formulaire a affichée (colis_bilan.grille, « id|libellé »), dans la liste
//    fermée de la question. Un format d'origine inconnu, une grille illisible
//    ou un id de rang inconnu : la question reste (le doute devient une question).
// ⛔ Une seule passe par job (marqueurs ci-dessous) ; compare-and-swap sur
//    needs_user chez l'appelant (_shared/questions-tranchees.ts, règle 9).
// Miroir de la règle B dans l'extension (une-passe, vinted.js
// formatColisParCapacite) : même table, vérifiée par scripts/vinted-colis-tranche-selftest.mjs.
// Pur (Deno + Node).
import { archiverErreur } from "./erreurs-archivees.js";

/** Rang de capacité de chaque format Vinted (id → rang). */
export const RANG_COLIS_VINTED = Object.freeze({ 1: 1, 2: 2, 3: 3, 8: 4, 11: 4, 9: 5, 12: 5, 10: 6, 13: 6, 14: 7 });
/** Le code du référentiel Vinted, pour les traces. */
export const CODE_COLIS_VINTED = Object.freeze({
  1: "SMALL", 2: "MEDIUM", 3: "LARGE", 8: "HEAVY_SMALL", 9: "HEAVY_MEDIUM", 10: "HEAVY_LARGE",
  11: "BULKY_SMALL", 12: "BULKY_MEDIUM", 13: "BULKY_LARGE", 14: "BULKY_X_LARGE",
});
export const CLE_REPONSE_COLIS = "colis_choisi.libelle";
const TICKS = ["needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];
const comparable = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Le format à poser quand celui d'origine (`voulu`, un id) n'est pas dans `grille` ([{ id, libelle }]) :
 * le plus petit offert de capacité ≥ celle d'origine, sinon le plus grand offert. null = rien à trancher
 * (format offert, inconnu, grille vide ou portant un id de rang inconnu).
 * @returns {{ id: number, libelle: string, regle: "plus_petit_suffisant" | "plus_grand_offert" } | null}
 */
export function formatColisParCapacite(voulu, grille) {
  const v = Number(voulu);
  const r0 = RANG_COLIS_VINTED[v];
  if (!r0) return null;
  const offerts = (Array.isArray(grille) ? grille : [])
    .map((g) => ({ id: Number(g?.id), libelle: String(g?.libelle ?? "").replace(/\s+/g, " ").trim() }))
    .filter((g) => Number.isInteger(g.id) && g.id > 0 && g.libelle);
  if (!offerts.length || offerts.some((g) => !RANG_COLIS_VINTED[g.id])) return null;
  if (offerts.some((g) => g.id === v)) return null;
  const parRang = (a, b) => RANG_COLIS_VINTED[a.id] - RANG_COLIS_VINTED[b.id] || a.id - b.id;
  const suffisant = offerts.filter((g) => RANG_COLIS_VINTED[g.id] >= r0).sort(parRang)[0];
  if (suffisant) return { id: suffisant.id, libelle: suffisant.libelle, regle: "plus_petit_suffisant" };
  const plusGrand = [...offerts].sort(parRang).at(-1);
  return { id: plusGrand.id, libelle: plusGrand.libelle, regle: "plus_grand_offert" };
}

/** colis_bilan.grille (« id|libellé ») → [{ id, libelle }] ; illisible → []. */
export function grilleDuBilanColis(bilan) {
  const vus = new Set();
  return (Array.isArray(bilan?.grille) ? bilan.grille : [])
    .map((s) => { const m = String(s ?? "").match(/^(\d+)\|(.+)$/); return m ? { id: Number(m[1]), libelle: m[2].split("|")[0].trim() } : null; })
    .filter((g) => g && g.id > 0 && g.libelle && !vus.has(g.id) && vus.add(g.id));
}

/**
 * La règle 9 pour UN job : null (pas son cas, ou déjà passée) ou ce qui s'écrit.
 *   · { branche: "A", platform_fields } — rayon changé par FillSell (categorie_oeuvre) et format d'origine
 *     hors de la grille : retour à `a_capturer`, la capture relira l'annonce en ligne dans SON rayon ;
 *   · { branche: "B", platform_fields, choix } — même rayon, format retiré par Vinted : la réponse posée.
 * @param {{ platform?: string, action?: string, status?: string, error?: string|null, platform_fields?: object }} job
 */
export function colisRepublicationATrancher(job, maintenant = new Date().toISOString()) {
  if (!job || job.platform !== "vinted" || job.action !== "republish" || job.status !== "needs_user") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : null;
  if (!pf || pf.needs_user_source !== "prevol_negatif") return null;
  const nuf = pf.needsUserField;
  if (!nuf || nuf.field_key !== "package_size_id") return null;
  if (pf.republish_step !== "captured" || pf.deleted_at) return null; // rien n'est retiré, sinon pas d'ici
  if (pf.colis_tranche_par_fillsell) return null; // une seule passe par job (B ; A a son propre marqueur)
  const annulee = pf.capture_corrigee_annulee && typeof pf.capture_corrigee_annulee === "object" ? pf.capture_corrigee_annulee : null;
  // Après A, seule une NOUVELLE capture (relue dans le rayon de l'annonce) peut être tranchée — jamais celle déplacée.
  if (annulee && (pf.capture_id == null || String(pf.capture_id) === String(annulee.capture_id ?? ""))) return null;
  const grille = grilleDuBilanColis(pf.colis_bilan);
  if (!grille.length) return null;
  const snap = pf.republish_snapshot && typeof pf.republish_snapshot === "object" ? pf.republish_snapshot : {};
  const voulu = Number(pf.colis_bilan?.voulu?.id ?? snap.package_size_id);
  if (!Number.isInteger(voulu) || voulu <= 0) return null; // format d'origine inconnu : rien de deviné
  if (grille.some((g) => g.id === voulu)) return null; // offert : la question a une autre cause
  const libelleVoulu = String(pf.colis_bilan?.voulu?.libelle ?? snap.colis ?? "").trim() || null;
  const corr = pf.capture_corrigee_par_la_fiche && typeof pf.capture_corrigee_par_la_fiche === "object" ? pf.capture_corrigee_par_la_fiche : null;
  const raisons = Array.isArray(corr?.raisons) ? corr.raisons.map(String) : [];
  const archives = (par) => archiverErreur(pf.erreurs_archivees, job.error ?? null, "needs_user", par);
  const np = { ...pf };
  for (const k of ["needs_user_source", "needsUserField", "needsUserFields", "champs_a_completer", ...TICKS, "next_action_after", "processing_since"]) delete np[k];
  np.needsUserAttempts = 0;
  const boucle = pf.needsUserBoucle && typeof pf.needsUserBoucle === "object" ? { ...pf.needsUserBoucle } : null;

  // La capture d'aujourd'hui est-elle celle que FillSell a déplacée ? Après la règle A (capture_corrigee_annulee),
  // la capture est celle de l'annonce, relue dans son rayon : un format absent de SA grille relève de B.
  if (raisons.includes("categorie_oeuvre") && !annulee) {
    // ── A. Le rayon a été changé par FillSell : l'annonce est relue dans le sien (une fois par job) ──
    for (const k of ["capture_id", "republish_snapshot", "republish_copie_servie"]) delete np[k];
    if (boucle) {
      delete boucle[CLE_REPONSE_COLIS];
      if (Object.keys(boucle).length) np.needsUserBoucle = boucle; else delete np.needsUserBoucle;
    }
    np.republish_step = "a_capturer";
    np.capture_corrigee_annulee = {
      le: maintenant, capture_id: pf.capture_id != null ? String(pf.capture_id) : null, raisons,
      rayon_corrige: Array.isArray(snap.categoryPath) ? snap.categoryPath : null,
      rayon_annonce: Array.isArray(corr?.avant?.categoryPath) ? corr.avant.categoryPath : null,
      voulu: { id: voulu, libelle: libelleVoulu, code: CODE_COLIS_VINTED[voulu] ?? null },
      grille: grille.map((g) => `${g.id}|${g.libelle}`),
      motif: "le rayon des œuvres n'offre pas le format de l'annonce : recapture dans le rayon de l'annonce en ligne",
      par: "handler-watch (questions tranchées, règle 9 A)",
    };
    np.erreurs_archivees = archives("handler-watch (format du colis : capture rendue à son rayon, recapture)");
    return { branche: "A", platform_fields: np };
  }

  // ── B. Même rayon, format retiré par Vinted : le plus petit qui suffit, sinon le plus grand ──
  const target = nuf.target && typeof nuf.target === "object" ? nuf.target : null;
  if (!target || target.root !== "colis_choisi" || target.key !== "libelle") return null; // la seule cible que l'extension relit
  const choix = formatColisParCapacite(voulu, grille);
  if (!choix) return null;
  const liste = Array.isArray(nuf.allowed_values) ? nuf.allowed_values.map(String) : [];
  const libelle = liste.length ? liste.find((x) => comparable(x) === comparable(choix.libelle)) : choix.libelle;
  if (!libelle) return null; // hors de la liste fermée de la question : jamais posé
  np.colis_choisi = { ...(pf.colis_choisi && typeof pf.colis_choisi === "object" ? pf.colis_choisi : {}), libelle };
  np.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [CLE_REPONSE_COLIS]: libelle };
  np.colis_tranche_par_fillsell = {
    le: maintenant,
    origine: { id: voulu, libelle: libelleVoulu, code: CODE_COLIS_VINTED[voulu] ?? null },
    grille: grille.map((g) => `${g.id}|${g.libelle}`),
    choix: { id: choix.id, libelle, code: CODE_COLIS_VINTED[choix.id] ?? null },
    regle: choix.regle,
    rayon: Array.isArray(snap.categoryPath) ? snap.categoryPath : null,
    par: "handler-watch (questions tranchées, règle 9 B)",
  };
  np.erreurs_archivees = archives("handler-watch (format du colis retiré par Vinted : FillSell a choisi)");
  return { branche: "B", platform_fields: np, choix: { id: choix.id, libelle, regle: choix.regle } };
}
