// ═══════════════════════════════════════════════════════════════════════════
// L'ISBN CAPTURÉ NON STANDARD : LA PREUVE SE LIT SUR LES FAITS (2026-10-01)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : carhoa (Carole), 6 republications Vinted de livres
// (« L'art roman », « Lot de 2 livres sur l'Inde »…) retenues à l'étape
// 'captured' du 27/09 au 01/10 — « ISBN capturé non standard, attente de la
// première recréation prouvée ». Leur annonce d'origine porte
// isbn = « 0000000000000 », la valeur que Vinted garde pour un livre sans ISBN
// identifié (lots, livres anciens).
//
// LA PREUVE EXISTAIT DEPUIS LE 28/09 : « Livre sur la tentation des gobelins »
// (job 279c046f, même compte) a été recréé par la 0.6.75 avec
// « 0000000000000 » remis tel quel — annonce 10164728230, en ligne. Mais la
// garde n'acceptait qu'un marqueur (`isbn_capture_tel_quel`) que l'extension
// n'écrit QUE si le canal du formulaire survit au dépôt. Or chez Vinted, la
// redirection de succès détruit le content script : la recréation est alors
// constatée « dans le dressing après coupure du canal » (reconciliation), sans
// marqueur. Les trois recréations à « 0000000000000 » connues sont passées par
// là (2286228e, f4ad5b06 le 15/09, 279c046f le 28/09). La garde attendait une
// preuve qu'elle ne savait pas voir : retenue sans fin, sans un mot à l'écran.
//
// LA RÈGLE : une valeur non standard est PROUVÉE quand une republication
// Vinted publiée l'a remise telle quelle —
//   · soit le marqueur `isbn_capture_tel_quel` (chemin direct) ;
//   · soit les faits : étape 'recreated', build ≥ BUILD_ISBN_CAPTURE_TEL_QUEL
//     (seul ce build remet la valeur capturée), ISBN de la copie non standard
//     et AUCUNE réponse de la personne (`vintedAspects.isbn` vide — sinon
//     c'est la réponse qui est partie, pas la capture).
// La preuve vaut pour CETTE valeur (« 0000000000000 » ne prouve pas
// « 1111111111111 »). Une valeur jamais prouvée reste retenue — visible — et
// se prouve sur le banc d'essai (profiles.beta_flags.banc_isbn_capture).
//
// ES module, imports relatifs seulement (Deno + Node).
import { normalizeIsbn } from "./isbn.js";
import { buildMsDe, BUILD_ISBN_CAPTURE_TEL_QUEL } from "./correctifs-extension.js";

/** La forme comparable d'une valeur capturée : sans espaces ni tirets, en majuscules. */
export function valeurIsbnCapturee(brut) {
  return String(brut ?? "").replace(/[\s-]/g, "").toUpperCase();
}

/** Présente ET refusée par normalizeIsbn (remplissage, clé fausse, format inattendu). */
export function estIsbnCaptureNonStandard(brut) {
  const s = valeurIsbnCapturee(brut);
  return !!s && !normalizeIsbn(s).ok;
}

/**
 * La valeur non standard que CE job prouve acceptée par Vinted, ou null.
 * @param {{platform?:string, action?:string, status?:string, handler_build?:string|null, platform_fields?:Record<string, unknown>|null}} job
 */
export function valeurProuveeParJob(job, buildMin = BUILD_ISBN_CAPTURE_TEL_QUEL) {
  if (!job || job.platform !== "vinted" || job.action !== "republish" || job.status !== "published") return null;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const marqueur = pf.isbn_capture_tel_quel;
  if (marqueur && typeof marqueur === "object" && estIsbnCaptureNonStandard(marqueur.valeur)) {
    return valeurIsbnCapturee(marqueur.valeur);
  }
  if (String(pf.republish_step ?? "") !== "recreated") return null;
  if (!(buildMsDe(job.handler_build) >= buildMsDe(buildMin))) return null;
  const snap = (pf.republish_snapshot && typeof pf.republish_snapshot === "object") ? pf.republish_snapshot : {};
  if (!estIsbnCaptureNonStandard(snap.isbn)) return null;
  const va = (pf.vintedAspects && typeof pf.vintedAspects === "object") ? pf.vintedAspects : {};
  if (String(va.isbn ?? "").trim()) return null;
  return valeurIsbnCapturee(snap.isbn);
}

/** Les valeurs que ces jobs prouvent (Set). */
export function valeursProuvees(jobs, buildMin = BUILD_ISBN_CAPTURE_TEL_QUEL) {
  const out = new Set();
  for (const j of jobs ?? []) {
    const v = valeurProuveeParJob(j, buildMin);
    if (v) out.add(v);
  }
  return out;
}
