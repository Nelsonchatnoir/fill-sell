// (02/11 soir, Nico) LA TÂCHE FAITE PAR FILLSELL CLOUD (pur, sans React ni base : lu par les modules de calcul des barres
// et de la file). Compte Cloud = profiles.cloud_voie, lu par cloud/useCompteCloud.js.
// (18/11) Le texte selon la voie : la règle unique, pure, sans import (supabase/functions/_shared/texte-voie.js).
import { texteSelonVoie, LBC_A_PAYER_CLOUD } from '../../supabase/functions/_shared/texte-voie.js';

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

// ── (02/11 soir, Nico : « pour un compte Cloud, ce message ne doit jamais dire « ouvre leboncoin.fr dans ton
// navigateur » ») LE TEXTE D'UNE TÂCHE FAITE PAR LE CLOUD ───────────────────────────────────────────────────────────
// Les messages de l'extension parlent du navigateur de la personne (« Ouvre leboncoin.fr/deposer-une-annonce dans ton
// navigateur… », « … sur ton ordinateur », « dans Chrome ») : pour une tâche du Cloud, ce navigateur est celui de
// FillSell Cloud, la personne n'y a pas accès. Chaque phrase qui l'y envoie est remplacée par le seul geste possible :
// une connexion → la reconnecter à FillSell Cloud ; une vérification → « Résoudre la vérification » dans l'app ; le
// reste → rien (le Cloud refait seul). Le compte courant est noté par cloud/useCompteCloud.js (une session = un compte).
/**
 * (07/11 soir, essai TestFlight de Nico) LE BANDEAU « METTRE À JOUR L'EXTENSION » (ferme Chrome, chrome://extensions)
 * ne se montre JAMAIS à un client FillSell Cloud : c'est le serveur qui tient sa copie de l'extension. Pourquoi il se
 * montrait : l'extension « vue il y a moins de 30 jours » se lit dans profiles.extension_last_seen_at, que le poste
 * Cloud rafraîchit à chaque relève (get-pending-jobs), alors que profiles.extension_build reste celui d'un vieil
 * ordinateur. `cloud` = useEtatCompteCloud (cloud/useCompteCloud.js) : tant que ce n'est pas lu, rien (pur, testé).
 */
export function bandeauMajExtensionVisible({ extensionPerimee, cloud }) {
  return extensionPerimee === true && cloud?.lu === true && cloud?.cloud !== true;
}

let compteCourantCloud = false;
export const noterCompteCourantCloud = (oui) => { compteCourantCloud = oui === true; };
export const compteCourantEstCloud = () => compteCourantCloud;
// (18/11/2026, lot T2 point 1 — ordre de Nico : « un seul endroit qui choisit le texte selon la voie ») LA RÈGLE vit dans
// supabase/functions/_shared/texte-voie.js (texteSelonVoie), lue par le serveur qui écrit et par l'app qui montre. Ici,
// le nom d'avant (texteTacheCloud), gardé pour ses appelants : il ne décide plus rien lui-même.
export { LBC_A_PAYER_CLOUD };
/** Le texte d'une tâche du Cloud, sans jamais renvoyer vers le navigateur ou l'ordinateur de la personne (pur). */
export function texteTacheCloud(texte, nom, lang = 'fr') {
  return texteSelonVoie(String(texte ?? ''), { cloud: true, nom, lang });
}
