// (01/11/2026, demande de Nico : « comme ebay_voie_api ») LE DRAPEAU CLOUD D'UN COMPTE — profiles.cloud_voie
// (migration 20261101180000, posé par script, jamais par le client).
//
// Vrai = le Cloud exécute les tâches Vinted, Leboncoin, Beebs et Depop du compte (publications, republications,
// retraits) ; l'ORDINATEUR n'en reçoit plus aucune, qu'il soit vivant ou non, que la plateforme soit connectée au Cloud
// ou non (une plateforme à reconnecter attend la reconnexion ; l'app la demande). Le poste Cloud garde sa règle à lui
// (ses plateformes connectées, get-pending-jobs). Faux (tout le parc) = rien ne change.
// Pur : testé par scripts/cloud-voie-selftest.mjs, appelé par get-pending-jobs.

// Les plateformes que le Cloud sait faire (même liste que la copie Cloud de l'extension).
export const PLATEFORMES_CLOUD_VOIE = Object.freeze(["vinted", "leboncoin", "beebs", "depop"]);

/** Faut-il lire le drapeau pour CE poll ? Seulement pour un ordinateur à qui l'on servirait une tâche du Cloud. */
export function drapeauALire({ cloudVoie, posteCloud, jobs }) {
  if (posteCloud || cloudVoie !== null) return false;
  return (jobs ?? []).some((j) => PLATEFORMES_CLOUD_VOIE.includes(String(j?.platform)));
}

/**
 * (03/11, point 3 de Nico) Ce build est-il celui de l'exécutant Cloud ? La copie Cloud de l'extension porte un
 * BUILD_ID « …-cloud » (scripts/cloud/build-extension-cloud.mjs) et l'envoie en `handler_build` suivi de sa version :
 * « 2026-11-01T23:02:16Z+dd69fbb-cloud · v0.6.164 ». Avant, update-job-status testait /-cloud$/ : jamais vrai avec
 * « · v… », et la prise atomique (prendre_job) n'était jamais appelée. Pur : testé par scripts/cloud-voie-selftest.mjs.
 */
export function estPosteCloud(handlerBuild) {
  return /-cloud(?:\s*·|\s|$)/.test(String(handlerBuild ?? "").trim());
}

/** Les tâches servies à CE poste une fois le drapeau appliqué (ne retire jamais rien au poste Cloud ni à un compte sans drapeau). */
export function jobsSelonDrapeauCloud(jobs, { cloudVoie, posteCloud }) {
  const liste = Array.isArray(jobs) ? jobs : [];
  if (posteCloud || cloudVoie !== true) return liste;
  return liste.filter((j) => !PLATEFORMES_CLOUD_VOIE.includes(String(j?.platform)));
}

/**
 * (05/11 soir, lot « Ouverture du Cloud », point 13 — le trou laissé ouvert le 03/11, REPRISE Cloud) LE POSTE CLOUD
 * D'UN COMPTE DONT LE CLOUD N'EST PLUS ACTIF NE REÇOIT RIEN. Le drapeau faux (fin d'essai sans paiement, période de
 * grâce, arrêt, impayé) rend les tâches à l'ordinateur ; le navigateur Cloud peut encore être ouvert pendant la grâce
 * (sessions gardées), il ne doit plus rien exécuter. Illisible (null) : comme avant (jamais un poste privé sur un doute).
 */
export function jobsPourPosteCloud(jobs, { cloudVoie }) {
  const liste = Array.isArray(jobs) ? jobs : [];
  return cloudVoie === false ? [] : liste;
}

/**
 * (09/11/2026 soir, Deborah — décision de Nico : « un seul exécutant, le Cloud ») UNE DEMANDE EN FILE d'un compte au
 * Cloud ACTIF (cloud_voie vrai) n'est JAMAIS servie à l'ORDINATEUR : relevé du dressing (Vinted) et relevé « annonces »
 * des plateformes du Cloud. Elle reste en file pour le poste Cloud (une plateforme à reconnecter attend la reconnexion,
 * comme les tâches). Preuve du 09/11 : l'extension de son PC (6d36bb4) prenait les relevés Leboncoin servis (19:43,
 * 20:04 — « page de connexion ») et le dressing Vinted (19:36) en parallèle du Cloud, qui réussissait les siens.
 * Inchangé : le poste Cloud, un compte sans drapeau (faux ou illisible), eBay et les demandes « connexion » (un geste de
 * la personne). Pur : testé par scripts/cloud-un-executant-selftest.mjs.
 */
export function commandeLaisseeAuCloud(commande, { cloudVoie, posteCloud }) {
  if (posteCloud || cloudVoie !== true) return false;
  const kind = String(commande?.kind ?? "");
  if (kind === "dressing") return true;
  if (kind === "annonces") return PLATEFORMES_CLOUD_VOIE.includes(String(commande?.platform));
  return false;
}

/** (09/11 soir) Les lectures de fond (textes Vinted, pages Beebs) d'un compte au Cloud actif : au seul poste Cloud. */
export function lectureFondPourCePoste({ cloudVoie, posteCloud }) {
  return posteCloud || cloudVoie !== true;
}

/**
 * (05/11 soir, point 13) Le ROUTAGE « une plateforme connectée au Cloud va au seul poste Cloud » ne vaut que si le
 * Cloud du compte est actif : drapeau faux → l'ordinateur garde toutes ses tâches (sinon, la tâche n'irait à personne).
 */
export function routageCloudActif({ cloudVoie }) {
  return cloudVoie !== false;
}
