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

// ── (02/11 soir, Nico : « pour un compte Cloud, ce message ne doit jamais dire « ouvre leboncoin.fr dans ton
// navigateur » ») LE TEXTE D'UNE TÂCHE FAITE PAR LE CLOUD ───────────────────────────────────────────────────────────
// Les messages de l'extension parlent du navigateur de la personne (« Ouvre leboncoin.fr/deposer-une-annonce dans ton
// navigateur… », « … sur ton ordinateur », « dans Chrome ») : pour une tâche du Cloud, ce navigateur est celui de
// FillSell Cloud, la personne n'y a pas accès. Chaque phrase qui l'y envoie est remplacée par le seul geste possible :
// une connexion → la reconnecter à FillSell Cloud ; une vérification → « Résoudre la vérification » dans l'app ; le
// reste → rien (le Cloud refait seul). Le compte courant est noté par cloud/useCompteCloud.js (une session = un compte).
let compteCourantCloud = false;
export const noterCompteCourantCloud = (oui) => { compteCourantCloud = oui === true; };
export const compteCourantEstCloud = () => compteCourantCloud;
const VERS_SON_NAVIGATEUR = /\b(dans|sur) (ton|le) (navigateur|ordinateur|Chrome)\b|\bdans (Chrome|Edge|Brave|Opera)\b|\bsur ton ordinateur\b|\bin your (browser|Chrome)\b|\bin (Chrome|Edge|Brave|Opera)\b|\bon your computer\b/i;
/** Le texte d'une tâche du Cloud, sans jamais renvoyer vers le navigateur ou l'ordinateur de la personne (pur). */
export function texteTacheCloud(texte, nom, lang = 'fr') {
  const t = String(texte ?? '');
  if (!VERS_SON_NAVIGATEUR.test(t)) return t;
  const en = lang === 'en';
  // Une phrase finit sur . ! ? suivi d'une majuscule (jamais le point d'une adresse : « leboncoin.fr/… »).
  const phrases = t.split(/(?<=[.!?])\s+(?=[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ«“"])/);
  const sortie = [];
  for (const p of phrases) {
    if (!VERS_SON_NAVIGATEUR.test(p)) { sortie.push(p.trim()); continue; }
    let r = '';
    if (/connecte|connexion|sign in|log in/i.test(p)) r = en ? `Reconnect ${nom} to FillSell Cloud (Settings › Subscription › FillSell Cloud).` : `Reconnecte ${nom} à FillSell Cloud (Réglages › Abonnement › FillSell Cloud).`;
    else if (/v[ée]rifi|anti-?robot|captcha|valide|\bcheck\b/i.test(p)) r = en ? 'If FillSell asks you, solve the check from the app (“Solve the check”).' : 'Si FillSell te le demande, résous la vérification depuis l\'app (« Résoudre la vérification »).';
    if (r && !sortie.includes(r)) sortie.push(r);
  }
  const fin = sortie.filter(Boolean).join(' ').trim();
  return fin || (en ? 'FillSell Cloud is on it: nothing to do on your side.' : 'FillSell Cloud s\'en occupe : rien à faire de ton côté.');
}
