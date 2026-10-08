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

// BUILD_ID de la 0.6.104 (0cec9e6), premier paquet téléversé depuis la 0.6.102.
const BUILD_0_6_104 = "2026-10-08T14:53:27Z";

// Une entrée vise soit une tâche « relancer » dont le message technique
// commence par `brut`, soit (champ `source`) une tâche mise de côté pour ce
// motif (platform_fields.needs_user_source) — sans message technique.
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
  // (08/10 soir) La 0.6.103 n'a JAMAIS été téléversée : le correctif arrive
  // avec la 0.6.104, qui l'étend à TOUS les onglets de travail
  // (getOrCreateWorkTab) — c'est son build qui fait foi.
  ...["vinted", "leboncoin", "beebs", "ebay"].map((platform) => ({
    cle: `${platform}_content_script_muet`,
    platform,
    action: "publish",
    brut: "Publication interrompue en cours d'opération : Timeout: la page de dépôt n'a pas fini de charger",
    buildMin: BUILD_0_6_104,
    version: "0.6.104",
  })),
  // (08/10 soir, Jonathan Rabany, Carla) « TÂCHE SANS DÉMARRAGE » : servie au
  // même poste 12 fois et plus, 2 h et plus, sans jamais commencer, puis mise
  // de côté par get-pending-jobs (needs_user_source = tache_sans_demarrage).
  // Cause : un content script chargé mais muet — le premier message attendait
  // 300 s sans rien écrire (capture Vinted avant republication, pré-vol,
  // publication) ; la 0.6.104 relance l'onglet muet PARTOUT. Rien n'a jamais
  // commencé sur la plateforme : on peut la relancer, publication comme
  // republication (une republication déjà retirée n'est jamais mise de côté).
  ...["vinted", "leboncoin", "beebs", "ebay"].flatMap((platform) => ["publish", "republish"].map((action) => ({
    cle: `${platform}_${action}_tache_sans_demarrage`,
    platform,
    action,
    source: "tache_sans_demarrage",
    buildMin: BUILD_0_6_104,
    version: "0.6.104",
  }))),
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
  if (job?.status !== "needs_user") return null;
  if (pf.relance_apres_maj) return null; // déjà relancée une fois
  if (pf.deleted_at) return null;
  if (job.action === "republish" && String(pf.republish_step ?? "") === "deleted") return null;
  const brut = String(pf.error_technique?.brut ?? "");
  return regles.find((r) => r.platform === job.platform && r.action === job.action && (r.source
    ? pf.needs_user_source === r.source
    : pf.needs_user_source === "relancer" && !!brut && brut.startsWith(r.brut))) ?? null;
}

// La valeur de needs_user_source que vise une règle (la requête du balayage).
export const sourceDeRegle = (regle) => regle?.source ?? "relancer";

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
