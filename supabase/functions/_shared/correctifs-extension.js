// ═══════════════════════════════════════════════════════════════════════════
// UN JOB BLOQUÉ PAR UN DÉFAUT D'EXTENSION DÉJÀ CORRIGÉ REPART TOUT SEUL
// (25/09/2026, LES PETITES FIOLES)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : 5 republications Leboncoin d'un compte PRO, 40 essais, tous
// par la 0.6.63, tous morts sur « contrôle Supprimer introuvable … actions
// relevées: [] ». Cause : la fiche d'une annonce PRO ne monte son panneau
// « Gestion de mon annonce » qu'au-delà de 971 px, et la fenêtre de travail
// est plus étroite ; la 0.6.66 (f3891c7) ouvre alors le tiroir « Gérer ».
// Mais la cliente est restée en 0.6.63, ses jobs sont en needs_user « relance
// d'un clic » — la relancer sur la 0.6.63, c'est cinq échecs de plus.
//
// LA RÈGLE (Nico, 25/09) : un job arrêté par un défaut qu'une version plus
// récente corrige se réarme DE LUI-MÊME dès qu'un poste de ce compte polle
// avec cette version — sans geste, sans surveillance.
//
// ⛔ BORNES :
//   · le défaut est reconnu par SA signature (texte de l'erreur brute, du
//     dernier diagnostic ou de l'erreur technique) ET par le build qui a
//     échoué, plus ancien que le correctif — jamais par un texte seul ;
//   · un seul réarmement par job et par correctif (`correctif_leve`) : un
//     échec sur un build corrigé n'est JAMAIS réarmé — il reste en needs_user
//     avec le diagnostic du nouveau build, qui est la mesure qui manquait ;
//   · un job réarmé n'est servi qu'à un poste dont le build porte le
//     correctif (`build_min_requis`) : un autre profil Chrome resté en 0.6.63
//     ne le brûle pas ;
//   · le BUILD_ID fait foi (préfixe horodaté), jamais le numéro de version.
// ES module SANS import (Deno + Node).

/** Le préfixe horodaté d'un BUILD_ID (« 2026-09-24T14:34:46Z+aa459a7 · v0.6.66 ») en ms, NaN sinon. */
export function buildMsDe(build) {
  const m = String(build ?? "").match(/(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)/);
  return m ? Date.parse(m[1]) : NaN;
}

// ── L'ISBN CAPTURÉ REMIS TEL QUEL (2026-09-27, carhoa « gobelins ») ─────────
// BUILD_ID du premier build d'extension qui remet dans le corps du POST de
// recréation l'ISBN CAPTURÉ sur l'annonce d'origine, tel quel — « 0000000000000 »
// compris. Avant lui, toute valeur que normalizeIsbn refuse était écartée et la
// recréation partait avec "isbn": null (400). Tant qu'un poste est plus ancien
// que lui, get-pending-jobs ne lui sert AUCUNE republication Vinted à l'étape
// qui supprime quand sa capture porte un tel ISBN — et, même à jour, pas avant
// qu'une première recréation l'ait prouvé (marqueur isbn_capture_tel_quel).
export const BUILD_ISBN_CAPTURE_TEL_QUEL = "2026-09-27T09:42:56Z"; // BUILD_ID de la 0.6.70 (61cbced), zip build/CWS-0.6.70-A-TELEVERSER

// ── LA REPUBLICATION OPLA JUGÉE SUR L'ANNONCE (2026-09-27, doriane-henri) ───
// BUILD_ID du premier build (0.6.74, e1dbc59) qui reprend la marque et la
// taille de l'ANNONCE Opla en ligne quand la fiche importée n'en a pas. Avant
// lui, une republication Opla sans marque (ou refusée « exige une taille »)
// échoue au pré-vol à coup sûr et se relance toute seule en boucle : tant que
// le poste est plus ancien, get-pending-jobs ne la lui sert pas (aucune
// écriture) ; elle part dès qu'un poste porte ce build.
export const BUILD_OPLA_REPUBLICATION_SUR_ANNONCE = "2026-09-27T18:22:27Z"; // BUILD_ID de la 0.6.74, zip build/CWS-0.6.74-A-TELEVERSER

export const CORRECTIFS_EXTENSION = [
  {
    cle: "lbc_retrait_pro_tiroir",
    platform: "leboncoin",
    actions: ["delete", "republish"],
    // Ce que les builds d'avant écrivaient : l'erreur du retrait et son diagnostic.
    signature: /Contr[ôo]le « Supprimer l'annonce » introuvable sur la page de l'annonce|contr[ôo]le Supprimer introuvable sur la page de l'annonce/i,
    buildMin: "2026-09-24T14:34:46Z", // BUILD_ID de la 0.6.66 (aa459a7) — commit du correctif f3891c7
    version: "0.6.66",
    motif: "retrait Leboncoin pro : fiche sans panneau de gestion en fenêtre étroite (tiroir « Gérer » ouvert depuis la 0.6.66)",
  },
  {
    // (2026-09-27, carhoa « Livre sur la tentation des gobelins », job
    // 279c046f) : recréation partie avec "isbn": null alors que l'annonce
    // d'origine portait « 0000000000000 » — le build qui la remet telle quelle
    // relance la recréation (l'annonce est déjà retirée : étape 'deleted').
    cle: "vinted_isbn_capture_tel_quel",
    platform: "vinted",
    actions: ["republish"],
    signature: /"isbn":null[\s\S]*Merci d'entrer un numéro ISBN valide|Merci d'entrer un numéro ISBN valide[\s\S]*"isbn":null/,
    buildMin: BUILD_ISBN_CAPTURE_TEL_QUEL,
    version: "0.6.70",
    motif: "ISBN capturé non standard (« 0000000000000 ») remis tel quel à la recréation",
    // Seulement si la copie de l'annonce porte bien un ISBN : la signature
    // seule rattraperait aussi un livre qui n'en avait pas.
    condition: (job) => {
      const snap = job?.platform_fields?.republish_snapshot;
      return !!(snap && typeof snap === "object" && String(snap.isbn ?? "").trim());
    },
    // La question « ISBN » posée après l'échec n'a plus lieu d'être, et la
    // recréation repart avec son budget d'essais entier.
    clesARetirer: ["needsUserField", "needsUserFields", "server_required_fields", "recreation_retries", "recreation_tentee"],
  },
];

/** Les textes d'un job où la signature d'un défaut peut se lire. */
function textesDuJob(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const et = pf.error_technique;
  return [
    job?.error,
    pf.last_diagnostic,
    typeof et === "string" ? et : (et && typeof et === "object" ? (et.brut ?? JSON.stringify(et)) : ""),
    pf.needs_user_vu_erreur,
  ].map((t) => String(t ?? "")).filter(Boolean);
}

/**
 * Le correctif qui répare CE job, s'il existe : bonne plateforme, bonne
 * action, signature lue dans ses textes, build de l'échec PLUS ANCIEN que le
 * correctif, jamais déjà réarmé pour ce correctif. null sinon.
 */
export function correctifPourJob(job, correctifs = CORRECTIFS_EXTENSION) {
  if (!job || job.status !== "needs_user") return null;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const buildEchec = buildMsDe(job.handler_build);
  if (!Number.isFinite(buildEchec)) return null; // build inconnu : on ne devine pas
  const textes = textesDuJob(job);
  for (const c of correctifs) {
    if (job.platform !== c.platform) continue;
    if (!c.actions.includes(String(job.action ?? "publish"))) continue;
    if (!(buildEchec < buildMsDe(c.buildMin))) continue;
    if (pf.correctif_leve && typeof pf.correctif_leve === "object" && pf.correctif_leve.cle === c.cle) continue;
    if (!textes.some((t) => c.signature.test(t))) continue;
    if (typeof c.condition === "function" && !c.condition(job)) continue;
    return c;
  }
  return null;
}

/** Le poste qui polle porte-t-il ce correctif ? (build du poll ≥ build du correctif) */
export function posteAJour(buildDuPoste, correctif) {
  const b = buildMsDe(buildDuPoste);
  return Number.isFinite(b) && b >= buildMsDe(correctif.buildMin);
}
