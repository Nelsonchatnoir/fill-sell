// ═══════════════════════════════════════════════════════════════════════════
// UN ÉCHEC QU'UNE EXTENSION CORRIGE REPART DÈS QUE LE POSTE L'A (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS : Glowik (2c38bff2, Leboncoin, « Matériel professionnel >
// Équipements pour commerces & marchés »). La 0.6.100 cliquait « Continuer »
// sur les pages qui précèdent les photos sans les remplir (« Élément
// introuvable: input[type="file"] »), trois essais, puis « relancer ». La
// 0.6.101 remplit ces pages — mais une tâche arrêtée ne repart que sur un
// geste : la ligne restait rouge APRÈS la mise à jour du poste.
//
// LA RÈGLE : une tâche arrêtée par un défaut que corrige un build connu
// repart toute seule, UNE fois, dès que le poste de la personne a ce build
// (profiles.extension_build, préfixe horodaté du BUILD_ID — la même
// comparaison que les déblocages Livres/Couleur de handler-watch). Même geste
// que « Relancer » dans l'app : compteurs à zéro, motif archivé, échéance
// levée. Si elle retombe, elle redevient « relancer » (marqueur
// `relance_apres_maj`) — jamais de boucle.
//
// Une entrée par défaut corrigé : plateforme, action, début du message
// technique (`error_technique.brut`, posé par update-job-status), build qui le
// corrige. ⛔ Publication seulement : rien n'a été retiré sur la plateforme.
// Lu par handler-watch (balayage 3 min) ; testé par
// scripts/relance-apres-maj-selftest.mjs.

export const RELANCES_APRES_MAJ = [
  {
    cle: "lbc_pages_avant_photos",
    platform: "leboncoin",
    action: "publish",
    brut: 'Élément introuvable: input[type="file"]',
    buildMin: "2026-10-06T15:09:44Z", // BUILD_ID 0.6.101 (3e77bae)
    version: "0.6.101",
  },
  // (08/10) Un content script chargé mais muet (onglet de travail gelé par
  // l'économiseur de mémoire, script orphelin après une mise à jour) : la
  // 0.6.102 constatait « déjà chargé sur cet onglet, donc non réinjecté » et
  // arrêtait la publication ; la 0.6.103 recharge l'onglet puis en ouvre un
  // neuf avant tout envoi, sur TOUTES les plateformes (titaperry543 23:37,
  // vtvente48 10:45, ornellaracano 20:19). Même message brut partout
  // (update-job-status) ; publication seulement.
  ...["vinted", "leboncoin", "beebs", "ebay"].map((platform) => ({
    cle: `${platform}_content_script_muet`,
    platform,
    action: "publish",
    brut: "Publication interrompue en cours d'opération : Timeout: la page de dépôt n'a pas fini de charger",
    buildMin: "2026-10-07T22:58:10Z", // BUILD_ID 0.6.103 (008995b)
    version: "0.6.103",
  })),
];

// Les champs d'attente que « Relancer » (app) efface — plus la boucle
// technique, que la reprise du port efface aussi.
const CHAMPS_LEVES = [
  "needs_user_source", "needsUserField", "boucle_technique", "canal_coupe_rejoue",
  "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
  "next_action_after", "processing_since", "attente_session", "refus_passager",
];

export function msDuBuild(build) {
  const m = String(build ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
  return m ? Date.parse(m[1]) : NaN;
}

// La règle qui couvre cette tâche arrêtée, ou null.
export function regleDeRelance(job, regles = RELANCES_APRES_MAJ) {
  const pf = job?.platform_fields ?? {};
  if (job?.status !== "needs_user" || pf.needs_user_source !== "relancer") return null;
  if (pf.relance_apres_maj) return null; // déjà relancée une fois
  if (pf.deleted_at) return null;
  const brut = String(pf.error_technique?.brut ?? "");
  if (!brut) return null;
  return regles.find((r) => r.platform === job.platform && r.action === job.action && brut.startsWith(r.brut)) ?? null;
}

// Le poste a-t-il le build qui corrige ? (build absent ou illisible : non)
export function posteALeBuild(extensionBuild, regle) {
  const ms = msDuBuild(extensionBuild);
  return Number.isFinite(ms) && ms >= Date.parse(regle.buildMin);
}

// Les platform_fields de la tâche relancée (l'archivage du motif est fait par
// l'appelant, qui a `archiverErreur`).
export function champsRelance(job, regle, { maintenant, extensionBuild }) {
  const pf = { ...(job?.platform_fields ?? {}) };
  for (const k of CHAMPS_LEVES) delete pf[k];
  pf.needsUserAttempts = 0;
  pf.relance_apres_maj = {
    le: maintenant,
    cle: regle.cle,
    version: regle.version,
    build_du_poste: String(extensionBuild ?? "").slice(0, 48),
    statut_avant: job?.status ?? null,
    pose_par: `handler-watch (défaut corrigé par l'extension ${regle.version}, poste à jour)`,
  };
  return pf;
}
