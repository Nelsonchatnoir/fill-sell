// (19/11/2026, décision de Nico, point 5) LA GARDE FINALE DES ACHATS CLOUD — « un compte dont le Cloud est offert ne doit plus
// jamais voir l'écran de paiement du Cloud ». Première chose de achatCloud.acheter et de achatFormuleCloud.acheter : l'état Cloud
// relu juste avant (useCloudProfil.lireProfilCloud, les colonnes Cloud ne se lisent que là), la règle de cloud/cloudOffert.js.
// Un Cloud offert : l'issue « deja » (actif) ou « refuse » (en sommeil), rien n'est préparé, ni Stripe, ni la feuille de la
// boutique. Lecture impossible : null — l'achat d'avant (le serveur garde ses propres refus). Verrou : selftest:cloud-offert-ecrans.
import { lireProfilCloud } from './useCloudProfil';
import { achatCloudFermeParOffert, cloudOffertDuProfil, refusAchatOffert } from './cloudOffert';

export async function refusAchatSiOffert(client, userId, lang = 'fr') {
  const profil = await lireProfilCloud(client, userId);
  if (!profil || !achatCloudFermeParOffert(profil)) return null;
  return refusAchatOffert(cloudOffertDuProfil(profil), lang);
}
