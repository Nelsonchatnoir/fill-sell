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
// ═══ (25/10, décision de Nico) LA VALEUR D'ORIGINE PART TELLE QUELLE ═══════
// « La republication reprend l'ISBN de l'annonce d'origine TEL QUEL et part ;
// les 30 republications retenues doivent passer » — Rég (6f1b1f70 « Moby
// Dick », retenue depuis le 18/10) et Vincent A. (29 livres) : capture
// « 0000000000 » (10 zéros), valeur que Vinted a acceptée à la création des 30
// annonces d'origine mais jamais recréée, donc jamais « prouvée » : la preuve
// valeur par valeur ne pouvait jamais venir. Elle n'est plus exigée
// (valeurProuveeParJob reste pour lire les faits, get-pending-jobs ne la lit
// plus). La règle ne regarde plus que ce que le POSTE sait remettre dans le
// corps du dépôt (posteRemetIsbnCapture) :
//   · 13 chiffres : la sonde l'arme depuis BUILD_ISBN_CAPTURE_TEL_QUEL (0.6.70) ;
//   · 10 caractères (9 chiffres + chiffre ou X) : depuis BUILD_ISBN_10_TEL_QUEL
//     (0.6.143) — avant, la sonde restait désarmée et le POST partait avec ce
//     que la page sérialise : "isbn": null APRÈS le retrait ;
//   · toute autre forme : jamais (l'extension s'arrête avant tout retrait).
// Un disjoncteur reste, par compte : une valeur que Vinted a REFUSÉE sur ce
// compte (valeurIsbnRefuseeParJob) retient les autres republications qui la
// portent — annonce intacte.
//
// ES module, imports relatifs seulement (Deno + Node).
import { normalizeIsbn } from "./isbn.js";
import { buildMsDe, BUILD_ISBN_CAPTURE_TEL_QUEL, BUILD_ISBN_10_TEL_QUEL } from "./correctifs-extension.js";

// ── LES PREUVES DÉJÀ FAITES NE SE RELISENT PLUS (2026-10-02, carhoa) ─────────
// Le 01/10 à 22:28, get-pending-jobs lève les 6 retenues de Carole (valeur
// prouvée) ; à 22:31, il les repose sur 5 livres — « valeur jamais prouvée ».
// La preuve n'avait pas disparu : la requête qui la relit en base (balayage de
// cross_post_jobs, ~80 000 lignes, aucun index utilisable) a dépassé les 8 s
// de PostgREST (erreur 57014, 8,65 s ; 0,47 s à 22:28), et l'erreur était lue
// comme « aucune preuve ». La mémoire de l'isolat n'y pouvait rien : un isolat
// vit quelques secondes. Une preuve ÉTABLIE est donc écrite ici, avec ses
// faits ; la base n'est plus relue que pour une valeur nouvelle, et une
// lecture en échec n'est plus jamais un verdict.
export const PREUVES_ISBN_ETABLIES = Object.freeze({
  // 279c046f (carhoa, 0.6.75) → annonce 10164728230 en ligne le 28/09 ;
  // da12dfa5 (cobaye Nico, 0.6.82) → 10204579653 en ligne le 01/10 16:30.
  "0000000000000": "279c046f (10164728230, 28/09) · da12dfa5 (10204579653, 01/10)",
});

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

// ── (25/10) CE QUE LE POSTE SAIT REMETTRE ────────────────────────────────────

/** La forme d'une valeur capturée que la sonde du dépôt sait poser : "13", "10" ou null. */
export function formeIsbnCapture(brut) {
  const s = valeurIsbnCapturee(brut);
  if (/^\d{13}$/.test(s)) return "13";
  if (/^\d{9}[\dX]$/.test(s)) return "10";
  return null;
}

/**
 * Le poste de ce build remet-il CETTE valeur capturée telle quelle dans le corps
 * du dépôt ? 13 chiffres : ≥ BUILD_ISBN_CAPTURE_TEL_QUEL ; 10 caractères :
 * ≥ BUILD_ISBN_10_TEL_QUEL ; autre forme, ou build illisible : non.
 * (Un ISBN valide n'en a pas besoin : il part normalisé en 13 chiffres, sur tout build.)
 */
export function posteRemetIsbnCapture(brut, build) {
  const forme = formeIsbnCapture(brut);
  const b = buildMsDe(build);
  if (!forme || !Number.isFinite(b)) return false;
  return b >= buildMsDe(forme === "13" ? BUILD_ISBN_CAPTURE_TEL_QUEL : BUILD_ISBN_10_TEL_QUEL);
}

// Un refus de Vinted sur le champ « isbn » : la réponse relevée dans le
// diagnostic (`"field":"isbn"`, guillemets échappés compris quand le diagnostic
// est un objet), ou les requis du refus (server_required_fields).
const REFUS_ISBN_RE = /\\?"field\\?"\s*:\s*\\?"isbn\\?"/;

/**
 * Le disjoncteur : la valeur non standard que Vinted a REFUSÉE dans ce job, ou null.
 * Ne compte que ce qui dit quelque chose de la valeur :
 *   · une republication Vinted non publiée (refusée puis recréée = passée) ;
 *   · sans réponse de la personne (sinon c'est sa réponse qui est partie) ;
 *   · traitée par un poste qui remettait CETTE valeur (posteRemetIsbnCapture) —
 *     le refus d'un poste qui ne pouvait pas l'envoyer ("isbn": null) ne dit
 *     rien d'elle.
 * @param {{platform?:string, action?:string, status?:string, handler_build?:string|null, platform_fields?:Record<string, unknown>|null}} job
 */
export function valeurIsbnRefuseeParJob(job) {
  if (!job || job.platform !== "vinted" || job.action !== "republish" || job.status === "published") return null;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const requis = Array.isArray(pf.server_required_fields)
    && pf.server_required_fields.some((f) => String(f?.key ?? "").trim().toLowerCase() === "isbn");
  const diag = typeof pf.last_diagnostic === "string" ? pf.last_diagnostic : JSON.stringify(pf.last_diagnostic ?? "");
  if (!requis && !REFUS_ISBN_RE.test(diag)) return null;
  const va = (pf.vintedAspects && typeof pf.vintedAspects === "object") ? pf.vintedAspects : {};
  if (String(va.isbn ?? "").trim()) return null;
  const snap = (pf.republish_snapshot && typeof pf.republish_snapshot === "object") ? pf.republish_snapshot : {};
  if (!estIsbnCaptureNonStandard(snap.isbn)) return null;
  const v = valeurIsbnCapturee(snap.isbn);
  return posteRemetIsbnCapture(v, job.handler_build) ? v : null;
}

/** Les valeurs refusées par Vinted sur un compte (Set). */
export function valeursIsbnRefusees(jobs) {
  const out = new Set();
  for (const j of jobs ?? []) {
    const v = valeurIsbnRefuseeParJob(j);
    if (v) out.add(v);
  }
  return out;
}

// Ce que la retenue dit (retenue_serveur.message), selon ce qu'elle attend.
// ⛔ Jamais « mets à jour ton extension » (décision de Nico) : la mise à jour se
// fait toute seule, il n'y a rien à faire.
export const MESSAGE_ISBN_MISE_A_JOUR =
  "En file : cette republication part dès que ton extension FillSell se sera mise à jour toute seule — rien à faire. " +
  "Ton annonce est intacte sur Vinted, rien n'a été retiré.";
export const MESSAGE_ISBN_A_VERIFIER =
  "En attente : cette republication attend une vérification de notre côté avant de toucher à quoi que ce soit. " +
  "Ton annonce est intacte sur Vinted, rien n'a été retiré.";

/**
 * Pourquoi la retenue tient, pour ce poste et ce compte :
 * "mise_a_jour_extension" (forme remise par un build plus récent que le poste),
 * "refus_vinted_du_compte" (disjoncteur), "forme_non_remise" (ni 10 ni 13 caractères), ou null (elle part).
 */
export function attenteIsbnCapture(brut, build, refusDuCompte) {
  const v = valeurIsbnCapturee(brut);
  if (!formeIsbnCapture(v)) return "forme_non_remise";
  if (!posteRemetIsbnCapture(v, build)) return "mise_a_jour_extension";
  if (refusDuCompte instanceof Set && refusDuCompte.has(v)) return "refus_vinted_du_compte";
  return null;
}
