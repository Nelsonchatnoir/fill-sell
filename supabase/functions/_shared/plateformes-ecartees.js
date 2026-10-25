// ═══════════════════════════════════════════════════════════════════════════
// « JE NE VENDS PAS SUR X » : RIEN DE X N'EST SERVI (25/10/2026, audit de nuit N10)
// ═══════════════════════════════════════════════════════════════════════════
// La personne écarte une plateforme (platform_settings.plateformes_ecartees, RPC
// plateforme_ecarter, Réglages ou popup) : ses relevés ne sont plus redemandés
// (get-pending-jobs) et ses publications EN FILE passent en pause au moment du
// geste. Mais une publication ou republication de X revenue en 'pending' après
// coup était servie quand même — mesuré le 25/10 : la republication Vinted
// 75344bf6 (pending depuis le 23/09, compte qui a écarté Vinted et eBay).
// LA RÈGLE : get-pending-jobs ne sert plus AUCUNE publication ni republication
// d'une plateforme écartée. Elles restent EN L'ÉTAT (jamais closes : la
// personne peut revenir sur son choix, « Finalement, si » les relance).
// ⛔ Toujours servis : les retraits (une vente ailleurs, un geste de la
//    personne), une tâche déjà en cours, et une republication dont le retrait a
//    commencé (son annonce est hors ligne : elle va au bout) — même doctrine
//    que la file en pause (_shared/file-pause.js).
// Module PUR (Deno, Vite, Node) : il ne lit rien, il n'écrit rien.
import { republicationEngagee } from "./file-pause.js";

/** Les plateformes écartées d'un platform_settings (ou de sa seule liste). */
export function plateformesEcartees(valeur) {
  const liste = Array.isArray(valeur) ? valeur
    : (valeur && typeof valeur === "object" && Array.isArray(valeur.plateformes_ecartees)) ? valeur.plateformes_ecartees
      : [];
  return new Set(liste.map((p) => String(p ?? "").trim().toLowerCase()).filter(Boolean));
}

/** Ce job est-il retenu parce que sa plateforme est écartée ? (laissé en l'état, non servi) */
export function jobRetenuPlateformeEcartee(job, ecartees) {
  if (!job || !(ecartees instanceof Set) || !ecartees.size) return false;
  if (!ecartees.has(String(job.platform ?? "").toLowerCase())) return false;
  const action = job.action == null || job.action === "" ? "publish" : String(job.action);
  if (action !== "publish" && action !== "republish") return false; // un retrait part toujours
  if (String(job.status ?? "pending") === "processing") return false; // une tâche commencée va au bout
  return !republicationEngagee(job);
}
