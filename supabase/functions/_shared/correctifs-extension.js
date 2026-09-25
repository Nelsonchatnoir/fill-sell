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
    return c;
  }
  return null;
}

/** Le poste qui polle porte-t-il ce correctif ? (build du poll ≥ build du correctif) */
export function posteAJour(buildDuPoste, correctif) {
  const b = buildMsDe(buildDuPoste);
  return Number.isFinite(b) && b >= buildMsDe(correctif.buildMin);
}
