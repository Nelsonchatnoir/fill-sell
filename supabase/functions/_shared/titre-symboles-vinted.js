// ═══════════════════════════════════════════════════════════════════════════
// TITRE VINTED « TROP DE SYMBOLES D'AFFILÉE » : FILLSELL CORRIGE SEUL (18/10)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (18/10) : les symboles en trop partent AVANT le dépôt, les
// mots et la marque restent, et aucune question n'est posée. Cas réel : job
// 5d993767 (needs_user depuis le 15/10), titre
//   Hoodie Streetwear "Gangs / Security" – Motif Bandana Paisley – Taille S ✨
// refusé par Vinted en 400 « Le titre contient trop de symboles d'affilée ».
//
// CE QUE VINTED ACCEPTE (mesuré le 18/10 sur les 70 555 titres Vinted publiés
// ou vendus du parc, listing_url présent) :
//   · « – » seul entre deux mots : 8 005 titres acceptés ;
//   · deux symboles d'affilée, espaces ignorés : acceptés (« ) - » 418,
//     « " - » 171, « - # » 118…) — SAUF « – » collé à un autre symbole
//     (0 accepté, hors « ½ – » / « ⅓ – » où ½ et ⅓ sont des chiffres) ;
//   · trois symboles d'affilée ou plus : 0 accepté (les « ... » en sont) ;
//   · « — » : 1 accepté / 1 refusé ; « … » et « ... » : 0 accepté.
//   Les emoji ne comptent pas : l'extension les retire de TOUS les titres avant
//   le dépôt depuis juillet (stripEmoji, background.js) — même liste ici.
//
// LA RÈGLE (assagirSymbolesVinted) — un « symbole » est un caractère qui n'est
// ni une lettre, ni un chiffre (½ ⅓ ² compris), ni un accent, ni une espace ;
// rien d'autre n'est jamais touché :
//   R0  emoji retirés (même liste que stripEmoji de l'extension) ;
//   ·   la marque (platform_fields.marque) est masquée avant, rendue après :
//       « C&A », « Levi's », « !iT » ne sont jamais touchés ;
//   R1  « — » et « ― » → « - » ;
//   R2  « … » et « ... » (ou plus) retirés (une espace s'ils collaient deux mots) ;
//   R3  un « – » collé à un autre symbole (espaces ignorés) → « - » ;
//   R4  une suite de 3 symboles ou plus (espaces ignorés) : guillemets et
//       parenthèses gardés, le premier séparateur gardé, le reste retiré ;
//   strict (reprise APRÈS un refus seulement) : tout « – » → « - ».
// Idempotent. Un titre que rien ne vise ressort À L'IDENTIQUE (espaces compris).
// Mesuré le 18/10 : en mode préventif, 0 des 70 555 titres acceptés ne change
// au-delà des emoji (que l'extension retire déjà).
//
// ⛔ MÊME RÈGLE que l'extension (chrome-extension/background.js,
//    assagirSymbolesVinted, 0.6.128), qui ne peut pas importer ce fichier : le
//    selftest scripts/titre-symboles-vinted-selftest.mjs compare les deux sur
//    les cas réels.
//
// OÙ ELLE S'APPLIQUE (serveur) :
//   · get-pending-jobs, au service : mode préventif, titre SERVI seulement
//     (le job n'est pas réécrit), trace title_servi_tempere motif « symboles » ;
//   · pas-de-rouge (update-job-status), au refus « symboles » : une reprise,
//     UNE fois, avec le titre strict (pf.titre_saisi, que get-pending-jobs
//     écrit ensuite sur le job, comme une réponse de la personne) ;
//   · questions-tranchees (handler-watch), règle 7 : les questions « Titre »
//     déjà posées pour ce motif sont tranchées de la même façon, une fois.
// Un deuxième refus après la reprise → la question « Titre », comme avant.
// Pur (Deno + Node) — ES module, un seul import pur.

import { archiverErreur } from "./erreurs-archivees.js";

/** Le motif Vinted visé (pf.titre_refuse.motif, texte du refus). */
export const MOTIF_SYMBOLES_RE = /symboles/i;

/** Clé de platform_fields où la question « Titre » range la réponse (titre-du-job.js). */
const CLE_TITRE_SAISI = "titre_saisi";

// Même liste que stripEmoji (chrome-extension/background.js, 19/07 Casio).
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
const SYMBOLE_RE = /[^\p{L}\p{N}\p{M}\s]/u;
const estSymbole = (c) => SYMBOLE_RE.test(c);
/** Guillemets et parenthèses : jamais retirés par R4. */
export const GARDES_TITRE_VINTED = new Set(['"', "'", "«", "»", "“", "”", "‘", "’", "„", "‹", "›", "(", ")", "[", "]", "{", "}"]);

/** Le titre tel que l'extension l'envoie déjà (emoji retirés, espaces resserrées). */
export function retirerEmojiVinted(titre) {
  return String(titre ?? "").replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Le titre sans les symboles en trop.
 * @param {unknown} titre
 * @param {{ marque?: unknown, strict?: boolean }} [o]
 * @returns {string} le titre assagi — le titre reçu À L'IDENTIQUE si rien ne le vise
 */
export function assagirSymbolesVinted(titre, { marque = null, strict = false } = {}) {
  const original = String(titre ?? "");
  if (!original) return original;
  // R0 — les emoji.
  let t = original.replace(EMOJI_RE, "");
  const emojiRetires = t !== original;
  // La marque, masquée par un jeton fait de lettres (donc jamais un symbole).
  const masques = [];
  const m = String(marque ?? "").trim();
  if (m && SYMBOLE_RE.test(m) && !/zfsmarque/i.test(t)) {
    const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    t = t.replace(re, (x) => { masques.push(x); return `Zfsmarque${masques.length - 1}qZ`; });
  }
  const avantRegles = t;
  // strict — la reprise après un refus : plus aucun « – ».
  if (strict) t = t.replace(/–/g, "-");
  // R1
  t = t.replace(/[—―]/g, "-");
  // R2 — une espace seulement si le retrait collerait deux mots.
  t = t.replace(/…|\.{3,}/g, (x, i, s) => {
    const avant = s.charAt(i - 1), apres = s.charAt(i + x.length);
    return /[\p{L}\p{N}]/u.test(avant) && /[\p{L}\p{N}]/u.test(apres) ? " " : "";
  });
  // R3 + R4, suite par suite (une suite = tout ce qui n'est ni lettre, ni chiffre, ni accent).
  t = t.replace(/[^\p{L}\p{N}\p{M}]+/gu, (suite) => {
    const symboles = [...suite].filter(estSymbole);
    if (symboles.length < 2) return suite;
    const s = suite.replace(/–/g, "-"); // R3
    if (symboles.length < 3) return s;
    let separateurVu = false; // R4
    return [...s].filter((c) => {
      if (!estSymbole(c) || GARDES_TITRE_VINTED.has(c)) return true;
      if (separateurVu) return false;
      separateurVu = true;
      return true;
    }).join("");
  });
  if (t === avantRegles && !emojiRetires) return original;
  t = t.replace(/\s{2,}/g, " ").trim();
  return masques.length ? t.replace(/Zfsmarque(\d+)qZ/g, (x, i) => masques[Number(i)] ?? x) : t;
}

const marqueDe = (pf) => {
  const v = pf && typeof pf === "object" ? (pf.marque ?? pf.brand ?? null) : null;
  return typeof v === "string" && v.trim() ? v : null;
};

/**
 * Le titre strict à reprendre, ou null : seulement s'il dit AUTRE CHOSE que ce
 * que Vinted a déjà reçu (titre sans emoji) — sinon la reprise referait le
 * même refus, et c'est la question.
 */
export function titreStrictUtile(titre, marque) {
  const avant = String(titre ?? "");
  const apres = assagirSymbolesVinted(avant, { marque, strict: true });
  if (!apres.trim() || apres === retirerEmojiVinted(avant)) return null;
  return apres;
}

/**
 * pas-de-rouge (refus Vinted au dépôt) : la reprise « titre assagi », ou null
 * (la question « Titre » part alors, comme avant).
 * Une fois par job (pf.titre_symboles_assagi), motif « symboles » seulement.
 * @returns {null | { avant: string, apres: string, pf: Record<string, unknown> }}
 */
export function repriseTitreSymbolesVinted({ titre, pf = {}, motifRefus, maintenant = new Date().toISOString(), par = "update-job-status (pas-de-rouge)" }) {
  if (!MOTIF_SYMBOLES_RE.test(String(motifRefus ?? ""))) return null;
  if (pf && pf.titre_symboles_assagi) return null;
  const avant = String(titre ?? "");
  const apres = titreStrictUtile(avant, marqueDe(pf));
  if (!apres) return null;
  return {
    avant, apres,
    pf: {
      titre_refuse: { motif: String(motifRefus), le: maintenant },
      [CLE_TITRE_SAISI]: apres,
      titre_symboles_assagi: { le: maintenant, avant: avant.slice(0, 200), apres, par },
    },
  };
}

const TICKS = ["needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];

/**
 * questions-tranchees, règle 7 : une question « Titre » Vinted posée pour le
 * motif « symboles » est tranchée par le titre strict — la publication (ou la
 * republication) repart, comme après une réponse de la personne. Une seule
 * passe par job (titre_symboles_assagi) ; titre_refuse est GARDÉ (c'est lui
 * qui fait écrire titre_saisi sur le job par get-pending-jobs).
 * @returns {null | { avant: string, apres: string, platform_fields: Record<string, unknown> }}
 */
export function titreSymbolesATrancher(job, maintenant = new Date().toISOString()) {
  if (!job || job.platform !== "vinted" || job.status !== "needs_user") return null;
  if (job.action !== "publish" && job.action !== "republish") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : null;
  if (!pf || pf.needs_user_source !== "champ_a_choisir") return null;
  if (pf.needsUserField?.target?.key !== CLE_TITRE_SAISI) return null;
  if (!MOTIF_SYMBOLES_RE.test(String(pf.titre_refuse?.motif ?? ""))) return null;
  if (pf.titre_symboles_assagi) return null;
  const avant = String(job.title ?? "");
  const apres = titreStrictUtile(avant, marqueDe(pf));
  if (!apres) return null;
  const np = { ...pf };
  for (const k of ["needs_user_source", "needsUserField", "needsUserFields", ...TICKS]) delete np[k];
  np.needsUserAttempts = 0;
  np[CLE_TITRE_SAISI] = apres;
  np.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [CLE_TITRE_SAISI]: apres };
  np.titre_symboles_assagi = { le: maintenant, avant: avant.slice(0, 200), apres, par: "handler-watch (questions tranchées, règle 7)" };
  np.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error ?? null, "needs_user",
    "handler-watch (titre Vinted : symboles en trop retirés)");
  return { avant, apres, platform_fields: np };
}
