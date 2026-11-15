// ═══════════════════════════════════════════════════════════════════════════
// LE SCAN UNIQUE D'UN ARTICLE N'EST JAMAIS PERDU SUR UN REFUS AVANT APPEL (15/11/2026, lot de Nico, point 2)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ. Le worker eBay ne fait qu'UN identify Lens par article : il réserve le marqueur
// inventaire.attributs.lens_scan AVANT l'appel, et le garde « à vie, échec compris ». Le 02/11 (5 articles) et le 14/11
// (5 articles, avant le filet de 50 $ du commit edfa49a), lens-analysis a répondu 429 « identify_unavailable » : le
// plafond IA, AVANT tout appel payant. Le worker a écrit « echec » : le scan unique de ces 10 articles était perdu sans
// qu'un centime ait été dépensé, et la publication est partie avec ses trous.
//
// LA RÈGLE (tous les comptes) :
//   · un refus PROUVÉ avant tout appel payant (plafond, IA indisponible, limite, garde) REND la réservation :
//     l'article sera scanné au prochain job eBay normal — jamais rejoué dans le même passage ;
//   · un appel payant abouti (réponse rendue, même vide ou inexploitable) CONSOMME le scan, comme avant ;
//   · le doute CONSOMME aussi (délai dépassé, coupure réseau, passerelle sans le corps de lens-analysis) : lens-analysis
//     peut avoir tourné et payé — on ne paie jamais deux fois sur un doute.
//
// LA PREUVE « AVANT APPEL » (supabase/functions/lens-analysis/index.ts, relu le 15/11) — en mode identify, ces réponses
// partent toutes AVANT le (non-)débit `spend_coins_for_lens` et AVANT le premier appel à l'IA :
//   · 401 « Unauthorized » : la porte d'entrée (jeton ou secret refusés ; une 401 de la passerelle : la fonction n'a
//     même pas tourné) ;
//   · 400 « invalid_json », « appel_interne_invalide », « Missing urls » : lecture du corps ;
//   · 500 « Missing API key » : la clé de l'IA absente ;
//   · 429 « rate_limited » : la garde de 60 identify par compte (sautée pour le worker, prouvée quand même) ;
//   · 429 « identify_unavailable » : le filet de dépense (budgetIaAutorise, _shared/budget-ia.ts : il ne lit que le
//     compteur ia_depense_etat) — et, avant le 14/11, le plafond global de 3 000 identify par jour, au même endroit ;
//   · 503 « ai_unavailable » : en identify, il ne naît QUE de fetchWithRetry (3 essais sans réponse : 429 de l'IA ou
//     délai), sur le PREMIER appel (`appelerAvecRepliImage`) — la passe de réparation, seul autre appel après une
//     réponse, rend « Réponse IA non parsable » ; la traduction avale ses erreurs. Aucune réponse de l'IA = rien de payé ;
//   · 500 « Anthropic 429 / 5xx » : une réponse d'ERREUR de l'IA (surcharge, panne), jamais facturée, sur ce même
//     premier appel.
// Restent consommés : « Anthropic 4xx » (l'IA refuse NOS photos : rejouer ne changerait rien), « Réponse IA non
// parsable » (après l'appel), toute autre 500, et ce que lens-analysis ne dit pas (546, 502, 504, 503 sans son corps).
// Le verrou scripts/ebay-scan-refus-avant-appel-selftest.mjs casse si cette preuve change dans lens-analysis.

/** Statut du marqueur lens_scan d'une réservation rendue : l'article redevient réservable. */
export const STATUT_SCAN_RENDU = "rendu";

const GARDES_APPEL = new Set(["invalid_json", "appel_interne_invalide", "Missing urls"]);
const PANNE_IA_RE = /^Anthropic (?:429|5\d\d):/;

/**
 * L'issue d'un identify raté : la réservation est-elle RENDUE (refus prouvé avant tout appel payant) ?
 * @param {{ http?: number | null, erreur?: unknown, exception?: boolean } | null | undefined} issue
 *   http : statut lu ; erreur : le champ `error` du corps JSON de lens-analysis ; exception : délai ou coupure côté worker.
 * @returns {{ rendu: boolean, raison: string | null }}
 */
export function refusAvantAppelLens(issue) {
  const consomme = { rendu: false, raison: null };
  if (!issue || typeof issue !== "object" || issue.exception) return consomme;
  const http = Number(issue.http);
  const erreur = typeof issue.erreur === "string" ? issue.erreur : null;
  if (http === 401) return { rendu: true, raison: "garde_acces" };
  if (http === 400 && erreur && GARDES_APPEL.has(erreur)) return { rendu: true, raison: "garde_appel" };
  if (http === 429 && erreur === "identify_unavailable") return { rendu: true, raison: "plafond_ia" };
  if (http === 429 && erreur === "rate_limited") return { rendu: true, raison: "limite_compte" };
  if (http === 503 && erreur === "ai_unavailable") return { rendu: true, raison: "ia_indisponible" };
  if (http === 500 && erreur === "Missing API key") return { rendu: true, raison: "cle_ia_absente" };
  if (http === 500 && erreur && PANNE_IA_RE.test(erreur)) return { rendu: true, raison: "panne_ia" };
  return consomme;
}

/**
 * Le marqueur attributs.lens_scan d'un article : « aucun » (jamais réservé), « rendu » (réservation rendue : réservable
 * de nouveau, sur CE marqueur exact) ou « pose » (scan fait, échec consommé ou réservation en cours : jamais rescanné).
 * @param {unknown} lensScan
 * @returns {"aucun" | "rendu" | "pose"}
 */
export function etatMarqueurScanLens(lensScan) {
  const v = lensScan && typeof lensScan === "object" ? /** @type {{ v?: unknown }} */ (lensScan).v : null;
  if (!v || typeof v !== "object") return "aucun";
  return /** @type {{ statut?: unknown }} */ (v).statut === STATUT_SCAN_RENDU ? "rendu" : "pose";
}
