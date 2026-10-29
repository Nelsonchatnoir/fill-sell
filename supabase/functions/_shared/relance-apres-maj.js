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
// Le premier build qui relit les menus « bloom » de Vinted (0.6.150, 28/10 soir) : tout build construit après
// 20:15Z le porte (0.6.149 = 09:52:53Z ; essai du poste de Nico 20:17:07Z, zip du Chrome Web Store après).
const BUILD_0_6_150 = "2026-10-28T20:15:00Z";

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
  // (28/10/2026) Vinted a remplacé ses menus (Catégorie, Marque, Taille, État, Couleur, Matériau) par des boutons
  // « bloom » dont la valeur ne vit que dans le span « --value » : la 0.6.149 et avant relisaient `.value` et
  // s'arrêtaient AVANT le dépôt — « Le champ Marque n'a pas pu être posé … » en publication (Ornella, chaowx1305,
  // thecloset72000), « le formulaire n'a pas accepté État … » en republication, AVANT tout retrait (needs_user_source
  // grille_incoherente : abenjemaa, labouquinerie85, vincent.armengol, chaowx1305). La 0.6.150 relit la valeur affichée.
  // Rien n'a été déposé ni retiré : une relance, une fois, dès que le poste a la 0.6.150 (une republication déjà
  // retirée n'est jamais relancée ici — regleDeRelance).
  {
    cle: "vinted_menus_bloom_marque",
    platform: "vinted",
    action: "publish",
    brut: "Le champ Marque n'a pas pu être posé",
    buildMin: BUILD_0_6_150,
    version: "0.6.150",
    messageAttente: true,
  },
  {
    cle: "vinted_menus_bloom_grille",
    platform: "vinted",
    action: "republish",
    source: "grille_incoherente",
    buildMin: BUILD_0_6_150,
    version: "0.6.150",
    messageAttente: true,
  },
  // Même défaut, autre phrase : « Vinted exige des champs encore vides … État (accepte : …) » alors que la tâche PORTE
  // un état (XEWER, jeux vidéo : Plateforme, Classement du contenu ET État « vides » — catégorie 3026 juste ; la liste
  // « Acer Nitro Blaze… Atari, Ayaneo » n'est que le début alphabétique des consoles). Un État « vide » sur une tâche
  // qui en a un, c'est la relecture, jamais la personne : la question (champ_a_choisir) ou la pause (prevol_negatif)
  // repart une fois avec la 0.6.150 — une vraie question reviendra, posée sur un formulaire bien relu.
  ...["publish", "republish"].flatMap((action) => ["prevol_negatif", "champ_a_choisir"].map((source) => ({
    cle: `vinted_menus_bloom_etat_vide_${action}_${source}`,
    platform: "vinted",
    action,
    source,
    // Le message d'attente (messageAttenteMaj) remplace le texte de l'arrêt : la marque qu'il pose fait foi ensuite.
    predicat: (job) => job?.platform_fields?.attente_maj_extension?.cle === `vinted_menus_bloom_etat_vide_${action}_${source}`
      || (/État \(accepte\s*:/.test(String(job?.error ?? ""))
        && (action === "republish" || Boolean(String(job?.platform_fields?.etat ?? "").trim()))),
    buildMin: BUILD_0_6_150,
    version: "0.6.150",
    messageAttente: true,
  }))),
  // (28/10 soir) Le rayon par identifiant quand un libellé est périmé (0.6.152, « Jewellery ») n'a PAS été prouvé en
  // réel (3 essais : la publication est partie par le moteur de rayon du serveur) : aucune relance automatique ici.
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
  // (28/10) `predicat` : une condition de plus sur la tâche (le texte de l'arrêt, la fiche) — jamais à sa place.
  return regles.find((r) => r.platform === job.platform && r.action === job.action && (r.source
    ? pf.needs_user_source === r.source
    : pf.needs_user_source === "relancer" && !!brut && brut.startsWith(r.brut))
    && (typeof r.predicat !== "function" || r.predicat(job) === true)) ?? null;
}

// La valeur de needs_user_source que vise une règle (la requête du balayage).
export const sourceDeRegle = (regle) => regle?.source ?? "relancer";

// (28/10) Tant que le poste n'a pas le build qui corrige, une règle marquée `messageAttente` le DIT à la personne, avec
// un message neutre (règle du 25/10 : jamais « mets à jour », jamais « Relance » qui retomberait sur le même mur) — ni
// relance, ni compteur touché. null : la règle ne dit rien (les règles d'avant le 28/10, inchangées).
const MESSAGES_ATTENTE = {
  vinted: {
    publish: "Vinted a changé son formulaire de vente : ta publication repartira toute seule dès que ton extension FillSell " +
      "se sera mise à jour (c'est automatique). Rien n'a été publié, rien à faire.",
    republish: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted a changé son " +
      "formulaire de vente : elle repartira toute seule dès que ton extension FillSell se sera mise à jour (c'est " +
      "automatique). Rien à faire.",
  },
};
export function messageAttenteMaj(job, regle) {
  if (!regle?.messageAttente) return null;
  return MESSAGES_ATTENTE[regle.platform]?.[regle.action] ?? null;
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
  // (29/10 soir, lot A point 7) La tâche relancée n'est servie qu'à un poste qui a le correctif (garde
  // `build_min_requis` de get-pending-jobs) : un autre poste du compte, resté plus ancien, la reprendrait et
  // retomberait sur le même mur — la relance unique serait perdue. Jamais abaissé.
  if (regle.buildMin && !(msDuBuild(pf.build_min_requis) >= Date.parse(regle.buildMin))) pf.build_min_requis = regle.buildMin;
  return pf;
}
