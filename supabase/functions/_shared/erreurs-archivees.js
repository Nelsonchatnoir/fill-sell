// ── Archive des erreurs d'un job, à la relance (2026-09-12) ─────────────────
// Jusqu'ici, remettre un job en pending remettait `error` à null : le motif de
// l'arrêt précédent disparaissait. Mesuré sur le chantier « photo indisponible
// à la recréation » : 4 épisodes sur 5 n'étaient visibles que parce que
// handler-watch avait mémorisé le texte (needs_user_vu_erreur) avant la
// relance, et le 5e (Deborah, 12/09) n'avait laissé AUCUNE trace en base.
//
// Désormais l'erreur précédente est ARCHIVÉE dans
// platform_fields.erreurs_archivees, cumulative (plusieurs entrées par job,
// la plus récente en dernier), horodatée, plafonnée aux ENTREES_MAX dernières.
// Purement additif : `error` garde son rôle d'affichage, aucune colonne ne
// change. UN fichier, lu par l'app (StockTab, relance manuelle), par
// update-job-status (toute écriture qui remplace ou efface `error`, donc
// toutes les remises en pending venues de l'extension, filet photo compris)
// et par handler-watch (remises en pending automatiques).
// ES module SANS import : chargé tel quel par Vite (app) et par Deno.

export const ENTREES_MAX = 20;
export const TEXTE_MAX = 600;

/**
 * @param {unknown} existantes — platform_fields.erreurs_archivees actuel (ou rien)
 * @param {unknown} erreur — le texte de `error` qui va être remplacé/effacé
 * @param {unknown} statut — le statut du job AU MOMENT de cette erreur (needs_user, failed…)
 * @param {string} par — qui archive (« relance_manuelle », « update-job-status → pending », « filet_photo »…)
 * @returns {Array<{le: string, statut: string|null, erreur: string, par: string}>}
 *   la liste à écrire — inchangée (même référence de contenu) si `erreur` est vide
 */
export function archiverErreur(existantes, erreur, statut, par) {
  // Rien à ajouter → la liste reçue est rendue TELLE QUELLE (même référence) :
  // l'appelant compare les références pour savoir s'il doit écrire.
  const texte = String(erreur ?? "").trim();
  if (!texte) return Array.isArray(existantes) ? existantes : [];
  const source = Array.isArray(existantes) ? existantes : [];
  const derniere = source.length ? source[source.length - 1] : null;
  // La même erreur, sous le même statut, déjà en dernière position : on ne
  // duplique pas (une relance rejouée deux fois sur le même arrêt).
  if (derniere && typeof derniere === "object" && derniere.erreur === texte.slice(0, TEXTE_MAX) && (derniere.statut ?? null) === (statut ?? null)) {
    return Array.isArray(existantes) ? existantes : [];
  }
  const liste = source.filter((e) => e && typeof e === "object");
  liste.push({
    le: new Date().toISOString(),
    statut: statut == null ? null : String(statut),
    erreur: texte.slice(0, TEXTE_MAX),
    par: String(par ?? "").slice(0, 80),
  });
  return liste.length > ENTREES_MAX ? liste.slice(liste.length - ENTREES_MAX) : liste;
}
