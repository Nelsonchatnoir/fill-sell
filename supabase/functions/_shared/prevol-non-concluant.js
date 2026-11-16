// ═══════════════════════════════════════════════════════════════════════════
// LE CONTRÔLE D'AVANT RETRAIT NON CONCLUANT NE TOURNE PLUS EN BOUCLE (16/11/2026, point 6 du lot de Nico) — pur
// ═══════════════════════════════════════════════════════════════════════════
// Constat (joshua.sapone, Premium) : 2 republications Beebs, ~18 contrôles d'avant retrait de ~5 min chacun depuis le 15/11
// 20:02, aucun abouti, Chrome occupé à chaque fois. Deux chemins dans l'extension :
//   · fini entre 0,7 × la borne et la borne → « Contrôle avant retrait trop lent… » : classé (pas-de-rouge
//     prevol_trop_lent), BORNÉ (3 reprises puis la personne) ;
//   · au-delà de la borne (300 s sans port) → l'envoi expire, l'extension l'avale : `pending`, erreur VIDÉE,
//     republish_prevol_formulaire.verdict = « illisible », nouvel essai dans 30 min. Le serveur ne classait pas un
//     `pending` sans erreur : AUCUN compteur, AUCUNE borne, AUCUN message — la boucle sans fin (et la table toscane du même
//     compte, Leboncoin Immobilier, ≈ 40 contrôles par jour depuis le 11/11).
// La règle : un rapport `pending` sans erreur d'une republication pas encore retirée, dont le contrôle vient d'être jugé
// « illisible », est un contrôle NON CONCLUANT ; update-job-status le passe au classement avec une phrase qui porte
// son détail (MARQUE_PREVOL_NON_CONCLUANT), compté par le compteur commun (pas_de_rouge_reprises) : 3 reprises espacées
// puis la personne, avec un message vrai (rien n'a été retiré). « borneAtteinte » (Beebs : aucune durée relevée, « aucune
// preuve… », ≥ 0,9 × 300 s depuis la prise) = le poste est lent : la reprise élargit la borne (fill_borne_ms 20 min).
// Verrou : scripts/prevol-boucle-bornee-selftest.mjs.
export const MARQUE_PREVOL_NON_CONCLUANT = "Contrôle avant retrait non concluant";
export const PREVOL_NON_CONCLUANT_RE = /^Contrôle avant retrait non concluant \((borne atteinte|détail)\) : (.*)$/m;
const FRAIS_MS = 10 * 60_000;
const BORNE_CLASSIQUE_S = 300;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * Le rapport décrit-il un contrôle d'avant retrait non concluant ? → { plateforme, detail, borneAtteinte } | null.
 * `pfRecu` : platform_fields envoyés par le poste (ou ceux du job) ; `pfJob` : ceux du job en base (processing_since).
 * @param {{ statut: string, erreur?: unknown, action: string, platform?: string, pfRecu?: Record<string, unknown> | null,
 *          pfJob?: Record<string, unknown> | null, maintenant?: number }} p
 */
export function prevolNonConcluant({ statut, erreur, action, platform, pfRecu, pfJob = null, maintenant = Date.now() }) {
  if (statut !== "pending" || action !== "republish") return null;
  if (typeof erreur === "string" && erreur.trim()) return null;
  const pf = objet(pfRecu);
  if (String(pf.republish_step ?? objet(pfJob).republish_step ?? "") === "deleted") return null;
  const pv = objet(pf.republish_prevol_formulaire);
  if (pv.verdict !== "illisible") return null;
  const at = Date.parse(String(pv.at ?? ""));
  if (!Number.isFinite(at) || maintenant - at > FRAIS_MS || at - maintenant > FRAIS_MS) return null;
  const detail = String(pv.detail ?? "").replace(/\s+/g, " ").trim().slice(0, 240) || "aucune preuve du formulaire";
  const depuis = Date.parse(String(objet(pfJob).processing_since ?? pf.processing_since ?? ""));
  const borneAtteinte = (pv.plateforme ?? platform) === "beebs" && pv.duree_s == null && /aucune preuve/i.test(detail)
    && Number.isFinite(depuis) && maintenant - depuis >= 0.9 * BORNE_CLASSIQUE_S * 1000;
  return { plateforme: String(pv.plateforme ?? platform ?? ""), detail, borneAtteinte };
}

/** La phrase passée au classement (le « brut » d'un rapport qui n'en avait pas). */
export function texteBrutPrevolNonConcluant(v) {
  return `${MARQUE_PREVOL_NON_CONCLUANT} (${v?.borneAtteinte ? "borne atteinte" : "détail"}) : ${String(v?.detail ?? "").slice(0, 240)}`;
}
