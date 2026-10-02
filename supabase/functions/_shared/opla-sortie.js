// ═══════════════════════════════════════════════════════════════════════════
// SORTIE D'OPLA — LA RÈGLE, UNE SEULE FOIS (02/10/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Opla a refusé tout partenariat sans paiement (1 000 €/mois) et demande que
// FillSell cesse de publier chez eux avant le 10/10. Nico sort d'Opla :
//   A1. plus AUCUNE publication ni republication Opla, pour personne ;
//   A2. compte sans Opla relié : Opla n'existe plus (ni case, ni connexion,
//       ni relevé, ni bandeau) ;
//   A3. compte qui a DÉJÀ un dressing Opla synchronisé : la synchronisation
//       continue (relevé, vente détectée sur Opla, retrait des copies
//       ailleurs) ;
//   A4. une vente ailleurs retire toujours la copie Opla (double vente) ;
//   A5. les publications/republications Opla en cours sont closes avec un
//       message vrai, ne comptent dans aucun quota, et AUCUNE annonce n'est
//       retirée d'Opla à cause de cette clôture.
//
// ⛔ CE MODULE NE LIT RIEN ET N'ÉCRIT RIEN. Il est importé tel quel par les
//    fonctions edge (Deno) et par l'app (Vite) : un seul texte, une seule
//    définition de « Opla relié », un seul critère de clôture.
// ⛔ Les RETRAITS (action 'delete') ne sont JAMAIS concernés : c'est la
//    protection contre la double vente (A4).

// ══ L'INTERRUPTEUR : LA SORTIE DÉMARRE LE 10/10 (consigne de Nico, 02/10) ══
// Jusqu'au 10 octobre 2026 à 00:00 (Paris), Opla fonctionne exactement comme
// avant : publication, republication, relevés. À partir de cet instant, et
// sans aucun geste ni déploiement, toute la sortie s'applique (serveur, app,
// popup). L'interrupteur vit dans coin_config, comme les autres :
//   · clé `opla_sortie_le` = l'instant de bascule, en secondes epoch (UTC) ;
//     posée à 1791583200 = 2026-10-10T00:00:00+02:00 ;
//   · 0 = sortie DÉSACTIVÉE (Opla reste ouverte, rien n'est clos) ;
//   · clé absente ou illisible = la date par défaut ci-dessous (le 10/10) :
//     une lecture ratée ne déplace jamais la bascule.
// Avancer, repousser ou annuler la sortie = UNE ligne SQL sur coin_config,
// sans déploiement.
export const OPLA_SORTIE = Object.freeze({
  CLE_CONFIG: "opla_sortie_le",
  DEBUT_DEFAUT_ISO: "2026-10-10T00:00:00+02:00",
  DEBUT_DEFAUT_EPOCH: 1791583200,
  LE: "2026-10-10",
  DATE_TEXTE: "10 octobre",
  // usage_logs : « J'ai compris » du bandeau, une ligne par compte.
  FEATURE_BANDEAU: "opla_bandeau",
});

/**
 * L'instant de bascule (ms epoch), ou null si la sortie est désactivée (0).
 * `valeurConfig` : la valeur lue dans coin_config (nombre, chaîne, ou rien).
 */
export function debutSortieOpla(valeurConfig) {
  const v = valeurConfig == null || valeurConfig === "" ? NaN : Number(valeurConfig);
  if (v === 0) return null;
  if (Number.isFinite(v) && v > 0) return v * 1000;
  return OPLA_SORTIE.DEBUT_DEFAUT_EPOCH * 1000;
}

/** La sortie d'Opla s'applique-t-elle à `maintenant` (ms) ? */
export function sortieOplaActive(maintenant, valeurConfig) {
  const debut = debutSortieOpla(valeurConfig);
  const t = Number.isFinite(maintenant) ? maintenant : Date.now();
  return debut != null && t >= debut;
}

// La phrase exigée par Nico, puis ce qui est vrai pour la personne.
export const MESSAGE_OPLA_INDISPONIBLE = "Opla n'est plus disponible dans FillSell.";

export function messageClotureOpla(action) {
  if (action === "republish") {
    return `${MESSAGE_OPLA_INDISPONIBLE} Ton annonce Opla n'a pas été touchée, et cela ne compte pas dans tes limites.`;
  }
  return `${MESSAGE_OPLA_INDISPONIBLE} Rien n'a été publié sur Opla, et cela ne compte pas dans tes limites.`;
}

/** Une publication ou republication Opla (jamais un retrait). action nulle = publish. */
export function estPublicationOpla(job) {
  if (!job || String(job.platform ?? "") !== "opla") return false;
  const action = job.action == null || job.action === "" ? "publish" : String(job.action);
  return action === "publish" || action === "republish";
}

// Les statuts qu'on clôt : ce qui attend encore d'être fait. Un job
// 'processing' est entre les mains d'une extension (pris avant la sortie) :
// on le laisse finir ; s'il fige, la reprise le remet en 'pending' et il est
// clos à son tour. 'published' (y compris les suivis créés par un relevé),
// 'sold', 'deleted', 'cancelled', 'failed' : jamais touchés.
const STATUTS_A_CLORE = new Set(["pending", "needs_user"]);
export const STATUTS_OPLA_A_CLORE = Object.freeze([...STATUTS_A_CLORE]);

export function oplaACloreJob(job) {
  return estPublicationOpla(job) && STATUTS_A_CLORE.has(String(job.status ?? ""));
}

/**
 * Ce qu'on écrit sur un job Opla à clore. `archiver` = archiverErreur
 * (erreurs-archivees.js), passé par l'appelant pour garder ce module sans
 * import. Rend { status, error, platform_fields }.
 */
export function clotureOpla(job, { par, maintenant, archiver } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  const le = new Date(Number.isFinite(maintenant) ? maintenant : Date.now()).toISOString();
  if (typeof archiver === "function") {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, job?.error, String(job?.status ?? ""), `${par ?? "sortie_opla"} (sortie d'Opla)`);
  }
  pf.opla_sortie = {
    le,
    par: String(par ?? "sortie_opla"),
    statut_avant: job?.status ?? null,
    source_avant: pf.needs_user_source ?? null,
  };
  // Plus rien à attendre ni à relancer : le job est clos.
  delete pf.needs_user_source;
  delete pf.next_action_after;
  return { status: "cancelled", error: messageClotureOpla(String(job?.action ?? "publish")), platform_fields: pf };
}

/**
 * « Opla relié » = un dressing Opla DÉJÀ synchronisé : au moins un relevé
 * Opla terminé (vinted_sync_runs kind 'annonces', status 'done'), ou une
 * annonce Opla connue (job Opla publié ou vendu). Mesuré le 02/10 : 40
 * comptes, et les 34 qui ont une annonce Opla ont tous un relevé fait.
 * Un fait illisible vaut « non relié » pour l'affichage, mais un appelant
 * qui ne peut pas lire ne retire JAMAIS rien sur cette base.
 */
export function oplaRelie({ releveOplaFait, annonceOplaConnue } = {}) {
  return releveOplaFait === true || annonceOplaConnue === true;
}
