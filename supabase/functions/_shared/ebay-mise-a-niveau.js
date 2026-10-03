// ═══════════════════════════════════════════════════════════════════════════
// eBay : « MISE À NIVEAU DU COMPTE VENDEUR » (/fpa/upgrade) — 03/10, point 14
// ═══════════════════════════════════════════════════════════════════════════
// f2rhrt5zc6, 02/10 17:43Z (job 618164ab) : avant tout dépôt, ebay.fr/sl/list
// redirige vers /fpa/upgrade — eBay exige une mise à niveau du compte vendeur.
// Le pré-vol de l'extension le disait bien, mais son texte portait la route
// « (/fpa/upgrade) » : le filet anti-jargon du serveur (G5) a jeté TOUT le
// message et affiché « la cause est de notre côté » — faux, et sans le geste.
// Le job gardait en plus le marqueur « connecte ton compte eBay » d'un essai
// précédent (REAUTH), que la relance n'avait pas levé : bouton « Me
// connecter », mauvais parcours.
//
// LA RÈGLE : ce mur se reconnaît à sa SIGNATURE — le diagnostic du pré-vol
// (`prevol_upgrade_vendeur`) ou la route dans le texte brut —, quelle que soit
// la version de l'extension. Il entre dans la famille « compte eBay pas prêt à
// vendre » (needs_user_source `ebay_compte_vendeur_inactif`) : message vrai,
// geste nommé, aucune reprise à l'aveugle. La MÊME fonction sert au verdict
// (update-job-status) et au passage du veilleur (handler-watch : les jobs déjà
// arrêtés sous le mauvais texte).
// ES module sans dépendance Deno : lu aussi par les selftests Node.
import { archiverErreur } from "./erreurs-archivees.js";

/** Miroir de SOURCE_EBAY_COMPTE_VENDEUR_INACTIF (textes-jobs.ts) — vérifié par le selftest. */
export const SOURCE_COMPTE_VENDEUR_EBAY = "ebay_compte_vendeur_inactif";

const ROUTE_MISE_A_NIVEAU_RE = /\/fpa\/upgrade\b/i;
const QUOI_PREVOL = "prevol_upgrade_vendeur";

/** Le texte montré : la cause (eBay), le geste, la suite. Jamais de route. */
export function miseANiveauVendeurEbay(action) {
  const quoi = action === "delete" ? "le retrait"
    : action === "republish" ? "la republication"
    : "la publication";
  return (
    "eBay demande une mise à niveau de ton compte vendeur avant d'accepter de nouvelles annonces. " +
    "Va sur ebay.fr depuis ton ordinateur, suis les étapes qu'eBay affiche, " +
    `puis relance ${quoi} depuis la fiche de l'article.`
  );
}

function diagnostic(d) {
  if (typeof d === "string") {
    try { const o = JSON.parse(d); return o && typeof o === "object" ? o : null; } catch { return null; }
  }
  return d && typeof d === "object" ? d : null;
}
function horodatage(x) {
  const t = Date.parse(String(x ?? ""));
  return Number.isFinite(t) ? t : null;
}

/**
 * Le mur « mise à niveau » est-il signé ? Lit le texte de l'arrêt, le brut
 * conservé (error_technique) et le diagnostic du pré-vol.
 * ⛔ Une trace d'un essai PRÉCÉDENT ne dit rien de cet arrêt-ci : diagnostic
 *    et brut ne comptent que s'ils datent de l'essai en cours
 *    (processing_since), sinon une personne qui a fait sa mise à niveau
 *    verrait ce texte revenir sur une autre panne.
 * @param {{ error?: unknown, platform_fields?: Record<string, unknown> | null }} job
 */
export function murMiseANiveauEbay(job) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (ROUTE_MISE_A_NIVEAU_RE.test(String(job?.error ?? ""))) return true;
  const depuis = horodatage(pf.processing_since);
  const frais = (at) => depuis == null || (horodatage(at) ?? -Infinity) >= depuis;
  const diag = diagnostic(pf.last_diagnostic);
  if (diag && diag.quoi === QUOI_PREVOL && frais(diag.at)) return true;
  const et = pf.error_technique && typeof pf.error_technique === "object" ? pf.error_technique : null;
  return !!et && ROUTE_MISE_A_NIVEAU_RE.test(String(et.brut ?? "")) && frais(et.at);
}

/**
 * Pour un job eBay déjà ARRÊTÉ (needs_user / failed) sur ce mur mais montré
 * avec un autre texte ou un autre marqueur : le patch qui le remet d'aplomb.
 * Rend null quand il n'y a rien à faire (déjà juste, autre plateforme, autre
 * cause) — appelable à chaque passage sans rien réécrire deux fois.
 */
export function requalificationMiseANiveauEbay(job, quand, posePar) {
  if (!job || job.platform !== "ebay") return null;
  if (job.status && !["needs_user", "failed"].includes(job.status)) return null;
  if (!murMiseANiveauEbay(job)) return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? { ...job.platform_fields } : {};
  const message = miseANiveauVendeurEbay(job.action ?? "publish");
  if (job.status === "needs_user" && job.error === message && pf.needs_user_source === SOURCE_COMPTE_VENDEUR_EBAY) return null;
  // Le marqueur d'un AUTRE mur (« connecte ton compte eBay » d'un essai
  // précédent) n'a plus rien à dire : c'est celui-ci qui bloque.
  delete pf.ebay_connexion_requise;
  delete pf.next_action_after;
  pf.needs_user_source = SOURCE_COMPTE_VENDEUR_EBAY;
  pf.compte_vendeur_inactif = {
    ...(pf.compte_vendeur_inactif && typeof pf.compte_vendeur_inactif === "object" ? pf.compte_vendeur_inactif : {}),
    mur: "mise_a_niveau",
    derniere: quand,
    pose_par: posePar,
  };
  pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error, job.status ?? "needs_user", `${posePar} (mise à niveau eBay)`);
  return { status: "needs_user", error: message, platform_fields: pf };
}
