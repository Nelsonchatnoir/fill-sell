// (02/11 soir, Nico) LA TÂCHE FAITE PAR FILLSELL CLOUD (pur, sans React ni base : lu par les modules de calcul des barres
// et de la file). Compte Cloud = profiles.cloud_voie, lu par cloud/useCompteCloud.js.
import { PLATEFORMES_CLOUD_VOIE } from '../../supabase/functions/_shared/cloud-voie.js';

/**
 * Cette tâche est-elle faite par FillSell Cloud ? Compte Cloud, plateforme du Cloud (Vinted, Leboncoin, Beebs, Depop),
 * et pas par nos serveurs (eBay par l'API reste « nos serveurs »).
 */
export function parLeCloud(job, cloud) {
  if (!cloud || !job) return false;
  if (job.voie === 'api' || job.platform_fields?.last_diagnostic?.voie === 'api') return false;
  return PLATEFORMES_CLOUD_VOIE.includes(String(job.platform));
}
