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
// (15/11/2026, cliente 13e274de — point 2 de Nico) Les tournures du PC que la règle laissait passer (recensement du 15/11) :
// « de ton ordinateur », « DEVANT ton ordinateur », « l'ordinateur qui portait… », « Chrome ouvert », « Ferme Chrome »,
// « Connecte Chrome à », « mis en veille par Chrome », « l'onglet resté ouvert », « Si l'onglet a été fermé ».
const VERS_SON_NAVIGATEUR = /\b(dans|sur) (ton|le) (navigateur|ordinateur|Chrome)\b|\bdans (Chrome|Edge|Brave|Opera)\b|\bsur ton ordinateur\b|\b(de|devant) ton ordinateur\b|\bl['’]ordinateur\b|\bChrome (ouvert|au premier plan)\b|\b(Ferme|Ouvre|Connecte|rouvre) Chrome\b|\bpar Chrome\b|\bque Chrome soit\b|\bl['’]onglet (Leboncoin |Vinted |Beebs |Depop )?(rest[ée] ouvert|ouvert|a [ée]t[ée] ferm[ée])\b|\bin your (browser|Chrome)\b|\bin (Chrome|Edge|Brave|Opera)\b|\bon your computer\b|\byour computer\b|\bthe tab (left )?open\b/i;
// (15/11) LE DÉPÔT LEBONCOIN PRÊT SUR « VALIDER ET PAYER » (_shared/lbc-forfait.js, MSG_LBC_A_PAYER, écrit par l'extension —
// la copie Cloud comprise) : la règle générale le lisait « vérification » (« Valider » ≈ « valide ») et disait « résous la
// vérification » — un geste faux. Pour le Cloud, le seul geste : « Payer sur Leboncoin » dans « À régler » (la page
// Leboncoin de son Cloud, où elle clique elle-même « Valider et payer »). Même texte que le serveur (MSG_LBC_A_PAYER_CLOUD).
export const LBC_A_PAYER_CLOUD = {
  fr: "Ton annonce est prête sur Leboncoin, dans ton FillSell Cloud : dans « À régler », appuie sur « Payer sur Leboncoin » — la page Leboncoin s'ouvre dans l'app, et c'est toi qui cliques « Valider et payer » (ton compte pro est hors forfait, Leboncoin fait payer ce dépôt). FillSell ne paie jamais à ta place, et reprend tout seul après ton paiement.",
  en: "Your listing is ready on Leboncoin, in your FillSell Cloud: in “To sort out”, tap “Pay on Leboncoin” — the Leboncoin page opens in the app, and you click “Valider et payer” yourself (your pro account is outside its plan, Leboncoin charges for this listing). FillSell never pays for you, and resumes on its own after your payment.",
};
const EST_LBC_A_PAYER = /Valider et payer/i;
// Un geste de COMPTE sur le site de la plateforme (conditions, étape du compte, configuration vendeur) : il se fait partout,
// téléphone compris — le Cloud n'y change rien. Seul le lieu change (jamais « dans Chrome sur ton ordinateur »).
const GESTE_DE_COMPTE = /\b(accepte|termine|compl[eè]te|configure|ajoute|v[ée]rifie ton (forfait|compte))\b|\b(accept|finish|complete|set up|add)\b/i;
const LIEU_PC = /,?\s*\b(dans|sur) (ton|le) (navigateur|ordinateur|Chrome)\b|\s*\bdans (Chrome|Edge|Brave|Opera)\b(\s+sur ton ordinateur)?|\s*\bsur ton ordinateur\b|\s*\bin your (browser|Chrome)\b|\s*\bin (Chrome|Edge|Brave|Opera)\b(\s+on your computer)?|\s*\bon your computer\b/gi;
/** Le texte d'une tâche du Cloud, sans jamais renvoyer vers le navigateur ou l'ordinateur de la personne (pur). */
export function texteTacheCloud(texte, nom, lang = 'fr') {
  const t = String(texte ?? '');
  const en = lang === 'en';
  if (EST_LBC_A_PAYER.test(t) && /onglet|ordinateur|\btab\b|computer/i.test(t)) return en ? LBC_A_PAYER_CLOUD.en : LBC_A_PAYER_CLOUD.fr;
  if (!VERS_SON_NAVIGATEUR.test(t)) return t;
  // Une phrase finit sur . ! ? suivi d'une majuscule (jamais le point d'une adresse : « leboncoin.fr/… »).
  const phrases = t.split(/(?<=[.!?])\s+(?=[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ«“"])/);
  const sortie = [];
  let gesteRetire = false;
  for (const p of phrases) {
    if (!VERS_SON_NAVIGATEUR.test(p)) { sortie.push(p.trim()); continue; }
    let r = '';
    // (15/11) « Ta connexion n'est pas en cause » n'est pas une connexion à refaire.
    const connexion = /connecte|connexion|sign in|log in/i.test(p) && !/connexion n['’]est pas en cause|not (about )?your (connection|sign-in)/i.test(p);
    if (/v[ée]rifi|anti-?robot|captcha|valide-la|\bcheck\b/i.test(p) && !/conditions|terms/i.test(p)) r = en ? 'If FillSell asks you, solve the check from the app (“Solve the check”).' : 'Si FillSell te le demande, résous la vérification depuis l\'app (« Résoudre la vérification »).';
    else if (GESTE_DE_COMPTE.test(p) && !connexion) {
      // (15/11) Un geste de compte : le même geste, sur la plateforme, d'où elle veut (son téléphone).
      r = p.replace(LIEU_PC, en ? ' (on the app or the website, from your phone)' : ' (dans son app ou sur son site, depuis ton téléphone)').replace(/\s{2,}/g, ' ').trim();
    } else if (connexion) r = en ? `Reconnect ${nom} to FillSell Cloud (Settings › Subscription › FillSell Cloud).` : `Reconnecte ${nom} à FillSell Cloud (Réglages › Abonnement › FillSell Cloud).`;
    else if (/\b(relance|ouvre|ferme|clique|corrige|republie|connecte)\b|\b(relaunch|open|close|click|fix|repost)\b/i.test(p)) gesteRetire = true;
    if (r && !sortie.includes(r)) sortie.push(r);
  }
  // (15/11) Un geste du PC retiré (« Ferme Chrome… puis relance ») : jamais « rien à faire » quand un geste restait — le
  // seul qui vaille au Cloud est dit à sa place.
  if (gesteRetire) sortie.push(en ? 'FillSell Cloud will try again on its own; if it still blocks, relaunch it from the app.' : 'FillSell Cloud réessaie tout seul ; si ça bloque encore, relance-la depuis l\'app.');
  const fin = sortie.filter(Boolean).join(' ').trim();
  if (fin) return fin;
  return en ? 'FillSell Cloud is on it: nothing to do on your side.' : 'FillSell Cloud s\'en occupe : rien à faire de ton côté.';
}
