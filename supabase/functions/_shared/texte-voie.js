// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE SELON LA VOIE — UN SEUL ENDROIT (18/11/2026, lot T2 point 1, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Règle permanente de Nico (13/11, redite le 18/11) : un compte FillSell Cloud (profiles.cloud_voie) ne lit JAMAIS un
// message qui parle d'extension, de Chrome ou d'ordinateur — ni dans les tâches, ni dans les écrans, ni dans les
// notifications, ni dans les mails. Cas du 18/11 : 2f8b09d2 et a962a59e (Cloud) lisaient sur 456 republications de
// lot « elle partira dans ton créneau… si Chrome est ouvert sur ton ordinateur à ce moment-là ».
// Pourquoi ça passait :
//   1. le serveur (get-pending-jobs) écrivait le texte de l'extension pour tout le monde, Cloud compris ;
//   2. l'app filtrait dans humanizeJobError seulement (cloud/voieCloud.js, texteTacheCloud), mais la fenêtre de la tâche
//      (jobErrorSansFaussePromesse) montre le texte BRUT d'une tâche vivante : le filtre n'y passait jamais ;
//   3. le filtre retirait la PHRASE entière qui nommait Chrome : « elle partira dans ton créneau » disparaissait avec la
//      condition, il ne restait que « Ton annonce est intacte, rien n'a été retiré. ».
// LA RÈGLE (une seule source, Deno + Node + Vite, sans import) : `texteSelonVoie(texte, { cloud, nom, lang, executant })`.
//   · pas Cloud → le texte tel quel, à l'octet ;
//   · Cloud → d'abord les CONDITIONS du poste (« si Chrome est ouvert sur ton ordinateur à ce moment-là », « dès que
//     Chrome sera ouvert », « sur ton ordinateur (onglet fermé…) », « l'extension FillSell de ton ordinateur »…) sont
//     remplacées dans la phrase, qui garde son sens (« elle partira dans ton créneau — FillSell Cloud s'en charge, rien à
//     faire de ton côté ») ; puis toute phrase qui envoie encore vers le navigateur ou l'ordinateur est remplacée par le
//     seul geste possible (reconnecter la plateforme au Cloud, résoudre la vérification depuis l'app, le geste de compte
//     « depuis ton téléphone »), ou retirée ; jamais un texte vide.
// Appelants : le serveur qui ÉCRIT un texte de tâche pour un compte Cloud (get-pending-jobs : retenues de créneau, de lot
// et de pause ; la notification du créneau), et l'app qui MONTRE un texte de tâche (utils/shared.js, la porte commune
// texteTacheSelonVoie : humanizeJobError ET jobErrorSansFaussePromesse) ou une phrase d'écran qui parle du poste.
// Verrou : npm run selftest:cloud-jamais-ordinateur (corpus réels du parc, rouge avant / vert après).

/** Les mots qu'un compte Cloud ne lit jamais (le verrou les cherche dans chaque sortie). */
export const MOTS_DU_POSTE_RE = /\b(chrome|ordinateur|extension|navigateur|computer|browser)\b|\bton PC\b|\byour PC\b/i;

// (15/11/2026, cliente 13e274de — point 2 de Nico) Les tournures du PC que la règle laissait passer (recensement du 15/11) :
// « de ton ordinateur », « DEVANT ton ordinateur », « l'ordinateur qui portait… », « Chrome ouvert », « Ferme Chrome »,
// « Connecte Chrome à », « mis en veille par Chrome », « l'onglet resté ouvert », « Si l'onglet a été fermé ».
// (18/11) + toute mention restante de Chrome, de l'extension ou du navigateur (MOTS_DU_POSTE_RE).
const VERS_SON_NAVIGATEUR = /\b(dans|sur) (ton|le) (navigateur|ordinateur|Chrome)\b|\bdans (Chrome|Edge|Brave|Opera)\b|\bsur ton ordinateur\b|\b(de|devant) ton ordinateur\b|\bl['’]ordinateur\b|\bChrome (ouvert|au premier plan)\b|\b(Ferme|Ouvre|Connecte|rouvre) Chrome\b|\bpar Chrome\b|\bque Chrome soit\b|\bl['’]onglet (Leboncoin |Vinted |Beebs |Depop )?(rest[ée] ouvert|ouvert|a [ée]t[ée] ferm[ée])\b|\bin your (browser|Chrome)\b|\bin (Chrome|Edge|Brave|Opera)\b|\bon your computer\b|\byour computer\b|\bthe tab (left )?open\b/i;
const VERS_LE_POSTE = (p) => VERS_SON_NAVIGATEUR.test(p) || MOTS_DU_POSTE_RE.test(p);

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
const LIEU_PC = /,?\s*\b(dans|sur) (ton|le) (navigateur|ordinateur|Chrome)\b|\s*\bdans (Chrome|Edge|Brave|Opera)\b(,?\s+sur ton ordinateur)?|\s*\bsur ton ordinateur\b|,?\s*\bdepuis ton ordinateur\b|\s*\bin your (browser|Chrome)\b|\s*\bin (Chrome|Edge|Brave|Opera)\b(,?\s+on your computer)?|\s*\bon your computer\b|,?\s*\bfrom your computer\b/gi;

/**
 * (18/11) LES CONDITIONS ET LES LIEUX DU POSTE, remplacés DANS la phrase (le sens reste) — avant la règle par phrase.
 * `qui` = « FillSell Cloud » (tâche du Cloud) ou « FillSell » (eBay par l'API : nos serveurs).
 */
function sansLePoste(t, qui, en) {
  const charge = en ? ` — ${qui} takes care of it, nothing to do on your side` : ` — ${qui} s'en charge, rien à faire de ton côté`;
  const subs = [
    // Les étiquettes courtes des écrans (Réglages › republication automatique) : un mot pour un mot.
    [/^si Chrome est ouvert$/i, `avec ${qui}`],
    [/^if Chrome is open$/i, `with ${qui}`],
    [/^extension muette$/i, `${qui} en attente`],
    [/^extension silent$/i, `${qui} waiting`],
    // « … remonteront si Chrome est ouvert. Sinon, tentative au créneau suivant. » : sans condition, plus de « sinon ».
    [/,?\s*si Chrome est ouvert\. Sinon, tentative au créneau suivant\./gi, charge + '.'],
    [/,?\s*if Chrome is open\. Otherwise, next slot\./gi, charge + '.'],
    // « …(heure de Paris), si Chrome est ouvert sur ton ordinateur à ce moment-là. » (retenues de créneau, de lot)
    [/,?\s*si Chrome est ouvert sur ton ordinateur (à ce moment-là|a ce moment-la)/gi, charge],
    [/,?\s*if Chrome is open on your computer at that (time|moment)/gi, charge],
    // « …ça repartira tout seul dès que Chrome sera ouvert sur ton ordinateur. »
    [/,?\s*dès que Chrome sera (ouvert|rouvert)( sur ton ordinateur)?/gi, charge],
    [/,?\s*as soon as Chrome is (open|reopened)( on your computer)?/gi, charge],
    // « … remonteront si Chrome est ouvert. »
    [/,?\s*si Chrome est ouvert\b/gi, charge],
    [/,?\s*if Chrome is open\b/gi, charge],
    // « La publication a été interrompue sur ton ordinateur (onglet fermé, mise en veille ou coupure réseau). »
    [/\s+sur ton ordinateur\s*\([^)]*(onglet|veille|réseau|reseau)[^)]*\)/gi, ''],
    [/\s+on your computer\s*\([^)]*(tab|sleep|network)[^)]*\)/gi, ''],
    // « L'opération a été interrompue sur ton ordinateur. » · « Un accident de parcours sur ton ordinateur (…) »
    [/(interrompue|accident de parcours)\s+sur ton ordinateur\b/gi, '$1'],
    [/(interrupted|hiccup)\s+on your computer\b/gi, '$1'],
    // « dès que l'extension FillSell de ton ordinateur est à jour / l'aura lue »
    [/l['’]extension FillSell de ton ordinateur/gi, qui],
    [/the FillSell extension on your computer/gi, qui],
    // « dès que ton extension FillSell se sera mise à jour (c'est automatique) »
    [/ton extension FillSell se sera mise à jour/gi, `${qui} se sera mis à jour`],
    [/your FillSell extension (has|is) updated/gi, `${qui} has updated`],
    // « l'ordinateur qui portait cette publication ne s'est plus manifesté… »
    [/l['’]ordinateur qui portait (cette|la) (publication|republication|tâche)/gi, `${qui}, qui portait $1 $2,`],
    [/the computer (that was )?(carrying|running) (this|the) (listing|repost|task)/gi, `${qui}, which was carrying $3 $4,`],
    // eBay par l'API : « …et tu n'as même plus besoin de laisser ton ordinateur allumé »
    [/,?\s*et tu n['’]as même plus besoin de laisser ton ordinateur allumé/gi, ''],
    [/,?\s*and you no longer even need to leave your computer on/gi, ''],
    // La boutique / le compte « ouvert dans Chrome » : pour le Cloud, celui qui est connecté à FillSell Cloud.
    [/\b(celle|la boutique Vinted|la boutique) ouverte dans Chrome(,? sur ton ordinateur)?/gi, `$1 connectée à ${qui}`],
    [/\b(celui|le compte Vinted|le compte) ouvert dans Chrome(,? sur ton ordinateur)?/gi, `$1 connecté à ${qui}`],
    [/\ble navigateur est connecté à(?=\s)/gi, `${qui} est connecté à`],
    [/\b(the one|the shop|the Vinted shop|the account) open in Chrome( on your computer)?/gi, `$1 connected to ${qui}`],
    // L'extension elle-même (versions, mises à jour, réveil) : c'est la copie de FillSell Cloud.
    [/l['’]extension FillSell \d+\.\d+\.\d+/gi, `une mise à jour de ${qui}`],
    [/la version (\d+\.\d+\.\d+) de l['’]extension/gi, `la version $1 de ${qui}`],
    [/dès qu['’]une extension connectée se réveille/gi, `dès que ${qui} reprend`],
    [/\bsans extension active\b/gi, `sans ${qui} actif`],
    [/\bl['’]extension( FillSell)?\b/gi, qui],
    [/\bthe FillSell extension\b|\bthe extension\b/gi, qui],
  ];
  let s = String(t);
  for (const [re, par] of subs) s = s.replace(re, par);
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

// Une vraie vérification à résoudre (jamais « vérifie l'annonce », ni « vérification toutes les heures »).
const VERIFICATION = /anti-?robot|captcha|datadome|valide-la|\bcheck\b|v[ée]rification(?! toutes les)/i;
// Un geste de compte qui reste le même au Cloud même quand la phrase dit « connecte-toi à eBay … et termine… ».
const GESTE_DE_COMPTE_FORT = /\b(termine|accepte|compl[eè]te|configure)\b|\b(finish|accept|complete|set up)\b/i;
// Un geste qui ne se fait que sur l'ordinateur de la personne (rouvrir Chrome, l'onglet, l'extension…).
const GESTE_DU_PC = /\b(relance|ouvre|ferme|clique|corrige|republie|connecte|autorise|installe|mets à jour)\b|\b(relaunch|open|close|click|fix|repost|allow|install|update)\b/i;

/** Le texte vu par un compte FillSell Cloud (pur). `qui` : « FillSell Cloud » ou « FillSell » (eBay par l'API). */
function texteDuCloud(texte, nom, lang, qui) {
  const t0 = String(texte ?? '');
  const en = lang === 'en';
  if (EST_LBC_A_PAYER.test(t0) && /onglet|ordinateur|\btab\b|computer/i.test(t0)) return en ? LBC_A_PAYER_CLOUD.en : LBC_A_PAYER_CLOUD.fr;
  if (!VERS_LE_POSTE(t0)) return t0;
  const t = sansLePoste(t0, qui, en);
  if (!VERS_LE_POSTE(t)) return t;
  // Une phrase finit sur . ! ? suivi d'une majuscule (jamais le point d'une adresse : « leboncoin.fr/… »).
  const phrases = t.split(/(?<=[.!?])\s+(?=[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ«“"])/);
  const sortie = [];
  let gesteRetire = false;
  for (const p of phrases) {
    if (!VERS_LE_POSTE(p)) { sortie.push(p.trim()); continue; }
    let r = '';
    // (15/11) « Ta connexion n'est pas en cause » n'est pas une connexion à refaire.
    const connexion = /connecte|connexion|sign in|log in/i.test(p) && !/connexion n['’]est pas en cause|not (about )?your (connection|sign-in)/i.test(p);
    if (VERIFICATION.test(p) && !/conditions|terms/i.test(p)) r = en ? 'If FillSell asks you, solve the check from the app (“Solve the check”).' : 'Si FillSell te le demande, résous la vérification depuis l\'app (« Résoudre la vérification »).';
    else if (GESTE_DE_COMPTE.test(p) && (!connexion || GESTE_DE_COMPTE_FORT.test(p))) {
      // (15/11) Un geste de compte : le même geste, sur la plateforme, d'où elle veut (son téléphone).
      r = p.replace(LIEU_PC, en ? ' (on the app or the website, from your phone)' : ' (dans son app ou sur son site, depuis ton téléphone)').replace(/\s{2,}/g, ' ').trim();
      if (VERS_LE_POSTE(r)) r = '';
    } else if (connexion) {
      r = qui === 'FillSell Cloud'
        ? (en ? `Reconnect ${nom} to FillSell Cloud (Settings › Subscription › FillSell Cloud).` : `Reconnecte ${nom} à FillSell Cloud (Réglages › Abonnement › FillSell Cloud).`)
        : (en ? `Reconnect ${nom} to FillSell from the app (Settings).` : `Reconnecte ${nom} à FillSell depuis l'app (Réglages).`);
    } else if (GESTE_DU_PC.test(p)) gesteRetire = true;
    else {
      // (18/11) Une phrase qui ne fait que NOMMER le lieu (« Vinted affiche « compte bloqué » sur ton ordinateur : … ») :
      // le lieu part, la phrase reste (jamais une information perdue avec lui).
      const sansLieu = p.replace(LIEU_PC, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
      if (!VERS_LE_POSTE(sansLieu)) r = sansLieu;
    }
    if (r && !sortie.includes(r)) sortie.push(r);
  }
  // (15/11) Un geste du PC retiré (« Ferme Chrome… puis relance ») : jamais « rien à faire » quand un geste restait — le
  // seul qui vaille au Cloud est dit à sa place.
  if (gesteRetire) sortie.push(en ? `${qui} will try again on its own; if it still blocks, relaunch it from the app.` : `${qui} réessaie tout seul ; si ça bloque encore, relance-la depuis l'app.`);
  const fin = sortie.filter(Boolean).join(' ').trim();
  if (fin) return fin;
  return en ? `${qui} is on it: nothing to do on your side.` : `${qui} s'en occupe : rien à faire de ton côté.`;
}

/**
 * LE texte selon la voie (pur). Sans Cloud : le texte tel quel. Compte Cloud : jamais extension / Chrome / ordinateur.
 * @param {string} texte
 * @param {{ cloud?: boolean, nom?: string, lang?: 'fr'|'en', executant?: 'cloud'|'serveurs' }} o
 *   executant : « cloud » (défaut : Vinted, Leboncoin, Beebs, Depop faits par FillSell Cloud) ou « serveurs » (eBay par
 *   l'API) — seul le nom de qui s'en charge change.
 */
export function texteSelonVoie(texte, { cloud = false, nom = '', lang = 'fr', executant = 'cloud' } = {}) {
  if (cloud !== true || typeof texte !== 'string' || !texte) return texte;
  const en = lang === 'en';
  const n = nom || (en ? 'the platform' : 'la plateforme');
  return texteDuCloud(texte, n, en ? 'en' : 'fr', executant === 'serveurs' ? 'FillSell' : 'FillSell Cloud');
}
