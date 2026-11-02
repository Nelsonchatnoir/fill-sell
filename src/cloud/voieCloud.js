// (02/11 soir, Nico) LA TÂCHE FAITE PAR FILLSELL CLOUD (pur, sans React ni base : lu par les modules de calcul des barres
// et de la file). Compte Cloud = profiles.cloud_voie, lu par cloud/useCompteCloud.js.

// Les plateformes que le Cloud fait — la MÊME liste que supabase/functions/_shared/cloud-voie.js (PLATEFORMES_CLOUD_VOIE),
// recopiée ici : l'app n'importe jamais un module serveur Cloud (preuve d'identité des OTA) ; selftest:cloud-voie compare.
export const PLATEFORMES_CLOUD = Object.freeze(['vinted', 'leboncoin', 'beebs', 'depop']);

/**
 * Cette tâche est-elle faite par FillSell Cloud ? Compte Cloud, plateforme du Cloud (Vinted, Leboncoin, Beebs, Depop),
 * et pas par nos serveurs (eBay par l'API reste « nos serveurs »).
 */
export function parLeCloud(job, cloud) {
  if (!cloud || !job) return false;
  if (job.voie === 'api' || job.platform_fields?.last_diagnostic?.voie === 'api') return false;
  return PLATEFORMES_CLOUD.includes(String(job.platform));
}
