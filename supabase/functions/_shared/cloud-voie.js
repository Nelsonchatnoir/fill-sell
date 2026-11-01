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

/** Les tâches servies à CE poste une fois le drapeau appliqué (ne retire jamais rien au poste Cloud ni à un compte sans drapeau). */
export function jobsSelonDrapeauCloud(jobs, { cloudVoie, posteCloud }) {
  const liste = Array.isArray(jobs) ? jobs : [];
  if (posteCloud || cloudVoie !== true) return liste;
  return liste.filter((j) => !PLATEFORMES_CLOUD_VOIE.includes(String(j?.platform)));
}
