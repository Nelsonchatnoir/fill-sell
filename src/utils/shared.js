// Shared design tokens, constants, and pure utility functions
// Used by tab components and App.jsx

export const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
export const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Pages de connexion des plateformes (chantier onboarding 2026-07-27) —
// badges de session de l'écran Publier + messages d'échec actionnables du
// Stock. La cible « brouillon LBC en cours » est la page de dépôt : c'est là
// que le wizard montre le brouillon à publier ou supprimer.
export const PLATFORM_LOGIN_URLS = {
  vinted: 'https://www.vinted.fr/member/signup/select_type?ref_url=%2F',
  leboncoin: 'https://auth.leboncoin.fr/login',
  ebay: 'https://signin.ebay.fr/',
  beebs: 'https://www.beebs.app/fr/login',
};
export const LBC_DEPOSIT_URL = 'https://www.leboncoin.fr/deposer-une-annonce';

// Pages « Mes annonces » de chaque plateforme (2026-08-10). Mêmes URL que
// MY_LISTINGS_URL côté extension — celles-là sont RELEVÉES en réel, c'est là
// que la re-capture différée va chercher les liens manquants. Servent ici à
// envoyer l'utilisateur vérifier lui-même une annonce dont on n'a pas réussi à
// récupérer le lien. Vinted absent volontairement : son URL de profil dépend de
// l'id du vendeur, qu'on ne connaît pas côté app — mieux vaut pas de lien
// qu'un lien qui tombe à côté.
export const PLATFORM_LISTINGS_URLS = {
  leboncoin: 'https://www.leboncoin.fr/compte/part/mes-annonces',
  ebay: 'https://www.ebay.fr/sh/lst/active',
  beebs: 'https://www.beebs.app/fr/account/my-adverts',
};

// ── Erreur de job : message utilisateur vs diagnostic (2026-07-30) ────────────
// Le 30/07, la modale « non publiée » du Stock a affiché tel quel un message
// technique (nom de fichier du code, options DOM relevées, dump de réponse
// Vinted). Règle : cross_post_jobs.error garde le diagnostic COMPLET — c'est
// la matière du SQL, des logs et du support, on ne l'appauvrit jamais à la
// source. La traduction en phrase courte se fait ICI, au moment d'afficher.
// Un message sans marqueur technique (déjà humanisé côté extension : connexion
// requise, brouillon LBC…) passe tel quel — on ne réécrit pas ce qui est déjà
// une consigne claire.
// Libellés lisibles des 4 plateformes. Exportés (2026-08-11) parce que
// l'avertissement « encore en ligne » des deux chemins de vente en a besoin et
// qu'il ne monte pas l'écran de publication : sans ça, une 5e copie de cette
// table naissait. ListingPreviewScreen en exporte une copie historique
// identique — celle-ci est la source des modules qui n'en dépendent pas.
export const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay" };
const HUMANIZE_PLATFORM_LABELS = PLATFORM_LABELS;
// Noms de site « en clair » pour les textes réécrits (chantier messages
// masqués, 2026-08-14). Jamais l'URL relevée du message stocké : c'est un
// diagnostic (page d'auth, query, fragment), pas une destination. La
// navigation reste portée par le bouton contextuel de StockTab, qui lit
// l'erreur BRUTE — inchangée en base.
const HUMANIZE_PLATFORM_SITES = { vinted: 'vinted.fr', leboncoin: 'leboncoin.fr', beebs: 'beebs.app', ebay: 'ebay.fr' };
// Statuts d'où un job ne repart JAMAIS tout seul. Miroir du trigger
// cross_post_job_settle_reservation (migration 20260805000000), qui rend la
// Pépite réservée sur exactement ces statuts-là. 'sold' en est volontairement
// absent : la réservation y est bien soldée, mais un job vendu n'est l'échec de
// rien et ne passe pas par ce chemin de message.
const JOB_STATUS_TERMINAL = new Set(['failed', 'cancelled']);
// « le job repartira… » / « il repartira au prochain passage » — la promesse
// de reprise, sous toutes ses formes relevées dans chrome-extension/ (grep du
// 13/08 : background.js, vinted.js, leboncoin.js, beebs.js, ebay.js). Sans /g
// ici : .test() sur une regex /g/ avance lastIndex et raterait un appel sur
// deux — le /g/ n'est ajouté qu'au moment du replace.
const PROMESSE_REPRISE_RE = /(?:\s*[—–-])?\s*(?:le job|il)\s+repartira[^.]*\.?/i;
const TECH_ERR_MARKERS_RE = new RegExp([
  '\\.js\\b',                    // nom de fichier du code (vintedCategories.js…)
  'https?://',                   // URL d'API sondée
  '[\\[{]\\s*"',                 // dump JSON (réponse plateforme, liste d'options)
  '\\bHTTP\\s*/?\\s*[0-9]{3}\\b',
  '\\b(?:status|statut)\\s*[0-9]{3}\\b',
  'outerHTML|querySelector|data-testid|sélecteur|selector|chevron',
  'platform_fields|needsUser|payload',
].join('|'), 'i');

export function humanizeJobError(job, lang = 'fr') {
  const raw = String(job?.error ?? '').trim();
  if (!raw) return '';
  const en = lang === 'en';
  const name = HUMANIZE_PLATFORM_LABELS[job?.platform] || job?.platform || (en ? 'the platform' : 'la plateforme');

  // ── Challenge anti-robot (message RÉÉCRIT ICI depuis le 2026-08-10) ────────
  // Le libellé stocké commence par « CHALLENGE <nom> : » (motif SQL) suivi
  // d'une consigne rédigée côté extension. Cette consigne était affichée telle
  // quelle, et elle PROMET une reprise qui n'arrive pas : « le job repartira au
  // prochain passage ».
  // Ce qui se passe réellement (chrome-extension/background.js, rearmBounded) :
  // un needsUser est ré-armé au plus MAX_NEEDS_USER_RETRIES = 2 fois, à
  // quelques MINUTES d'intervalle — jamais le temps de résoudre une
  // vérification à la main. La 2ᵉ occurrence passe le job en `failed`, ce qui
  // déclenche settle_publish_reservation('release') : la Pépite engagée
  // revient (coin_ledger kind='release_publish', reason='job_terminal').
  // Relevé prod du 2026-08-10 : 6 jobs `error LIKE 'CHALLENGE %'`, les 6 en
  // `failed`, 0 repris — la reprise promise n'a jamais eu lieu pour personne.
  // Le texte source vit dans chrome-extension/, hors de portée d'un OTA : la
  // correction se fait donc à l'affichage, et elle dépend du statut RÉEL.
  const challenge = raw.match(/^CHALLENGE\s+[A-ZÀ-Ÿ0-9 -]+?\s*:\s*(.+)$/is);
  if (challenge) {
    const termine = JOB_STATUS_TERMINAL.has(job?.status);
    if (!termine) {
      // Job encore vivant : une tentative automatique reste possible. On la dit
      // pour ce qu'elle est — quelques minutes, pas un rattrapage — sans
      // promettre qu'elle aboutira.
      return en
        ? `${name} is showing an anti-robot check instead of the listing form. One automatic retry is left and it happens within minutes — pass the check on ${name} in Chrome right now, otherwise the job will stop.`
        : `${name} affiche une vérification anti-robot à la place du formulaire. Il reste une tentative automatique, et elle a lieu dans les minutes qui viennent — passe la vérification sur ${name} dans Chrome tout de suite, sinon le job s'arrêtera.`;
    }
    // Terminé : c'est fini, personne ne reprendra. La Pépite n'est annoncée
    // rendue que pour une publication : seuls ces jobs portent une réservation
    // (reservation_id), les republications et les retraits n'en ont pas.
    const rendue = (job?.action ?? 'publish') === 'publish';
    const acte = job?.action === 'republish' ? 'republication' : 'publication';
    return en
      ? `${name} showed an anti-robot check instead of the listing form: nothing was published and the job has stopped.`
        + (rendue ? ' The Nugget held for it has been refunded.' : '')
        + ` Open ${name} in Chrome, pass the check, then start the ${acte} again yourself from the item.`
      : `${name} a affiché une vérification anti-robot à la place du formulaire : rien n'a été publié et le job est arrêté.`
        + (rendue ? ' La Pépite engagée a été rendue.' : '')
        + ` Ouvre ${name} dans Chrome, passe la vérification, puis relance la ${acte} toi-même depuis la fiche de l'article.`;
  }

  // ── Step-up de reconnexion vente eBay (RÉÉCRIT ICI depuis le 2026-08-14) ──
  // Message du parc 0.6.1/0.6.2 : « eBay a servi une page inattendue
  // (/ws/eBayISAPI.dll) alors que ta session eBay est valide — … Le job
  // repartira automatiquement au prochain passage. » Les DEUX moitiés sont
  // contredites par la base (relevé Nico 14/08, 7 cas / 5 comptes) : les 7
  // URL sont signin.ebay.fr/ws/eBayISAPI.dll?SignIn&…&ru=<formulaire de
  // dépôt> (vrai mur d'authentification, même pageType=2379018), AUCUN job
  // n'est jamais reparti (rejeux 00h41→01h08 Manon, 18h15→18h22 Dujardin :
  // même résultat), zéro publication eBay réussie depuis sur les 5 comptes.
  // eBay maintient la session de NAVIGATION (la sonde a raison) mais exige
  // une reconnexion INTERACTIVE pour le flux de VENTE — elle ne se lève pas
  // toute seule. Le texte source vit dans chrome-extension/ (corrigé en
  // 0.6.5, libellé « REAUTH VENTE eBay », qui n'est PAS réécrit ici) : pour
  // le parc, correction à l'affichage, même doctrine que CHALLENGE et que la
  // règle 2.4.47 — plus jamais de fausse promesse de reprise.
  // Rythme inexpliqué (5 cas/16 j avant le 12/08, 7/3 j après) : question
  // OUVERTE, à reprendre avec plus de volume — rien ici n'en dépend.
  if (job?.platform === 'ebay' && /page inattendue.*session eBay est valide/is.test(raw)) {
    const termine = JOB_STATUS_TERMINAL.has(job?.status);
    const rendue = termine && (job?.action ?? 'publish') === 'publish';
    const etatFr = termine
      ? `Rien n'a été publié et le job est arrêté.${rendue ? ' La Pépite engagée a été rendue.' : ''}`
      : "Rien n'a été publié, et les tentatives automatiques restantes échoueront aussi tant que la reconnexion n'est pas faite.";
    const etatEn = termine
      ? `Nothing was published and the job has stopped.${rendue ? ' The Nugget held for it has been refunded.' : ''}`
      : 'Nothing was published, and the remaining automatic retries will fail too until you sign in again.';
    return en
      ? `eBay requires you to sign in again before it lets you list an item, even though your eBay session is still valid elsewhere. ${etatEn} In order: open ebay.fr in Chrome, click "Sell", sign in again, then restart the publication from the item in the app.`
      : `eBay demande une reconnexion avant de laisser déposer une annonce, même si ta session eBay est encore valide ailleurs. ${etatFr} Dans l'ordre : ouvre ebay.fr dans Chrome, clique « Vendre », reconnecte-toi, puis relance la publication depuis la fiche de l'article.`;
  }

  // ── Soumission eBay jamais partie, brouillon conservé (2026-08-14) ─────────
  // Message du parc : « Le clic « Mettre en vente » n'a produit AUCUNE requête
  // de publication (soumission jamais partie) : aucune annonce n'a été créée »
  // — plus la variante finale « … reprises sur onglet neuf n'ont rien changé,
  // job arrêté ». Exact sur la publication, faux sur le « rien » : sur les 5
  // jobs des 12-14/08 (8d1e0060, 15bfa00a, deb6ec33, 3e16aa00, b0885fb8), la
  // sonde réseau a capté la télémétrie eBay porteuse d'un draftId
  // (collectsysteminfo?draftId=…) — un BROUILLON existe côté eBay, récupérable
  // depuis l'espace vendeur, et l'utilisateur croyait repartir de zéro.
  // draftId lu depuis platform_fields.ebay_draft_id (consigné par l'extension
  // depuis le 14/08) ou, en repli pour le parc, extrait de last_diagnostic
  // (les URLs de télémétrie y sont). SANS draftId prouvé, on ne promet pas de
  // brouillon (rien que les données ne portent) : message d'origine conservé.
  // Réécriture à l'affichage (doctrine 2.4.52) ; aucune promesse de reprise.
  if (job?.platform === 'ebay' && /n'a produit AUCUNE requête de publication/i.test(raw)) {
    const diag = job?.platform_fields?.last_diagnostic;
    const draftId =
      String(job?.platform_fields?.ebay_draft_id ?? '').trim() ||
      (/[?&]draftId=(\d+)/i.exec(typeof diag === 'string' ? diag : JSON.stringify(diag ?? ''))?.[1] ?? '');
    if (draftId) {
      const termine = JOB_STATUS_TERMINAL.has(job?.status);
      const rendue = termine && (job?.action ?? 'publish') === 'publish';
      return en
        ? `The "List item" click never left the browser on eBay: nothing was published${termine ? ' and the job has stopped' : ''}.${rendue ? ' The Nugget held for it has been refunded.' : ''} Your listing is not lost though: eBay kept it as a DRAFT (no. ${draftId}). Find it on ebay.fr under My eBay > Selling > Drafts to finish listing it yourself.`
        : `Le clic « Mettre en vente » n'est jamais parti chez eBay : rien n'a été publié${termine ? ' et le job est arrêté' : ''}.${rendue ? ' La Pépite engagée a été rendue.' : ''} Ton annonce n'est pas perdue pour autant : eBay l'a conservée en BROUILLON (n° ${draftId}). Retrouve-la sur ebay.fr dans Mon eBay > Vendre > Brouillons pour terminer la mise en vente toi-même.`;
    }
  }

  // ── Familles rédigées pour l'utilisateur, masquées par le filtre (2026-08-14) ──
  // Inventaire 30 j (chantier messages masqués) : le plafond de 300 c. et les
  // marqueurs techniques masquaient précisément les messages les plus
  // travaillés — 74 jobs / 14 users remplacés par le générique. Correction par
  // FAMILLE NOMMÉE, même doctrine que CHALLENGE et les branches eBay : le
  // texte affiché est rédigé ICI, le brut ne passe jamais, et toute variante
  // hors des sous-cas listés retombe dans le circuit normal (générique par
  // défaut). Périmètre validé le 14/08 : republication stoppée avant
  // suppression + connexion requise « page observée ». Les autres familles
  // (refus Vinted, brouillon LBC, annulations support…) attendent validation.

  // Republication stoppée AVANT toute suppression : la phrase qui compte —
  // « ton annonce est intacte » — disparaissait à cause du détail technique
  // (HTTP 403/404/400). Gate sur TECH_ERR_MARKERS_RE : les variantes sans
  // marqueur (sonde injoignable, motif connexion) passent déjà telles quelles
  // aujourd'hui et gardent leur circuit. « La Pépite est rendue » n'est
  // affirmé que là où le message source l'affirme (variantes « annulée »).
  if (/^Republication (annulée|en pause) avant toute suppression/i.test(raw)
      && TECH_ERR_MARKERS_RE.test(raw)) {
    const site = HUMANIZE_PLATFORM_SITES[job?.platform] || name;
    if (/^Republication annulée/i.test(raw) && /session/i.test(raw) && /refusée/i.test(raw)) {
      return en
        ? `The relisting was cancelled before anything was deleted: your ${name} session was refused. Your listing is untouched and the Nugget has been refunded. Sign in to ${site} again in Chrome, then restart the relisting from the item.`
        : `Republication annulée avant toute suppression : ta session ${name} a été refusée. Ton annonce est intacte et la Pépite est rendue. Reconnecte-toi sur ${site} dans Chrome, puis relance la republication depuis la fiche de l'article.`;
    }
    if (/^Republication annulée/i.test(raw) && /introuvable/i.test(raw)) {
      return en
        ? `The relisting was cancelled before anything was deleted: the listing could not be found on ${name} (it may have been removed or sold in the meantime). FillSell deleted nothing and the Nugget has been refunded. Check the listing on ${name}, then relaunch from the item if needed.`
        : `Republication annulée avant toute suppression : l'annonce n'a pas été retrouvée en ligne sur ${name} (elle a peut-être été supprimée ou vendue entre-temps). FillSell n'a rien supprimé et la Pépite est rendue. Vérifie l'annonce sur ${name}, puis relance depuis la fiche de l'article si besoin.`;
    }
    if (/^Republication en pause/i.test(raw)) {
      return en
        ? `Relisting paused before anything was deleted — your listing is untouched on ${name}. A technical exchange with ${name} failed; fix what's needed then relaunch the relisting from the item.`
        : `Republication mise en pause avant toute suppression — ton annonce est intacte sur ${name}. Un échange technique avec ${name} a échoué ; corrige si besoin puis relance la republication depuis la fiche de l'article.`;
    }
    // Variante non répertoriée : circuit normal (générique par défaut).
  }

  // Connexion requise, variante « page observée » : l'URL relevée déclenchait
  // le masque technique et la consigne disparaissait (cas Carla, 14/08). Le
  // site est nommé en clair, l'URL brute n'est jamais affichée. La variante
  // courte sans « page observée » garde son circuit actuel (promesse retirée
  // ou tel quel).
  if (/^Connexion (Vinted|Leboncoin|Beebs|eBay) requise/i.test(raw) && /page observée/i.test(raw)) {
    const site = HUMANIZE_PLATFORM_SITES[job?.platform] || name;
    const termine = JOB_STATUS_TERMINAL.has(job?.status);
    const rendue = termine && (job?.action ?? 'publish') === 'publish';
    const acte = job?.action === 'republish' ? (en ? 'relisting' : 'republication') : 'publication';
    if (termine) {
      return en
        ? `${name} showed its sign-in page instead of the listing form: nothing was published and the job has stopped.${rendue ? ' The Nugget held for it has been refunded.' : ''} Sign in to ${site} in Chrome, then restart the ${acte} from the item.`
        : `${name} a affiché sa page de connexion à la place du formulaire de vente : rien n'a été publié et le job est arrêté.${rendue ? ' La Pépite engagée a été rendue.' : ''} Connecte-toi sur ${site} dans Chrome, puis relance la ${acte} depuis la fiche de l'article.`;
    }
    return en
      ? `${name} is showing its sign-in page instead of the listing form. Sign in to ${site} in Chrome now — an automatic retry happens within minutes, otherwise relaunch the ${acte} from the item.`
      : `${name} affiche sa page de connexion à la place du formulaire de vente. Connecte-toi sur ${site} dans Chrome maintenant — une tentative automatique a lieu dans les minutes qui viennent, sinon relance la ${acte} depuis la fiche de l'article.`;
  }

  // Couleur hors palette (COULEUR INTROUVABLE : ..., vinted.js 2026-07-30) :
  // le détail embarque la palette relevée — l'utilisateur doit juste
  // corriger la couleur de l'article.
  if (/^COULEUR INTROUVABLE/i.test(raw)) {
    return en
      ? `The item's color does not match any color offered by ${name}. Fix the color on the item, then retry publishing.`
      : `La couleur de l'article ne correspond à aucune couleur proposée par ${name}. Corriger la couleur dans la fiche de l'article puis relancer la publication.`;
  }

  // Catégorie non posée (sélection en cascade échouée) : le diagnostic liste
  // options DOM et nœuds matchés — l'utilisateur n'en a pas l'usage.
  if (/^Catégorie\s*:/i.test(raw)) {
    return en
      ? `The listing category could not be set automatically on ${name}. Retry publishing from the item; the technical detail has been recorded.`
      : `La catégorie de l'annonce n'a pas pu être posée automatiquement sur ${name}. Relancer la publication depuis la fiche de l'article ; le détail technique est enregistré.`;
  }

  // ── Promesse de reprise automatique (RÉÉCRITE ICI depuis le 2026-08-13) ────
  // Beaucoup de messages d'échec rédigés côté extension se terminent par « le
  // job repartira (automatiquement) au prochain passage ». C'est FAUX dès que
  // le job est terminal : le poller ne reprend que 'pending' (et 'needs_user'
  // via la boucle de complétion) — un 'failed' n'est JAMAIS repris (constat du
  // 13/08 : jobs remis en 'pending' à la main). Le texte source vit dans
  // chrome-extension/, hors de portée d'un OTA : correction à l'affichage,
  // comme le CHALLENGE ci-dessus, selon le statut RÉEL. Sur un job encore
  // vivant (pending/processing/needs_user), la phrase est vraie : on la garde.
  // La demi-promesse « Relancer la publication » des messages needs_user n'est
  // pas concernée : elle demande un geste, elle n'en promet pas.
  if (PROMESSE_REPRISE_RE.test(raw) && JOB_STATUS_TERMINAL.has(job?.status)) {
    // Pépite : seuls les jobs de publication portent une réservation — même
    // règle que la branche CHALLENGE ci-dessus (settle sur statut terminal).
    const rendue = (job?.action ?? 'publish') === 'publish';
    const verite = en
      ? ` The job has stopped — it will not restart on its own.${rendue ? ' The Nugget held for it has been refunded.' : ''} Relaunch it yourself from the item.`
      : ` Le job est arrêté — il ne repartira pas tout seul.${rendue ? ' La Pépite engagée a été rendue.' : ''} Relance-le toi-même depuis la fiche de l'article.`;
    const corps = raw.replace(new RegExp(PROMESSE_REPRISE_RE.source, 'gi'), '').replace(/\s{2,}/g, ' ').trim();
    const msg = (corps + verite).trim();
    // Corps resté technique (dump, URL…) : générique VÉRIDIQUE plutôt que le
    // diagnostic brut — même arbitrage que le repli tout en bas.
    if (!TECH_ERR_MARKERS_RE.test(msg) && msg.length <= 600) return msg;
    return en
      ? `Publishing on ${name} was interrupted by a technical issue. The job has stopped${rendue ? ' and the Nugget was refunded' : ''} — retry from the item; the full detail has been recorded for support.`
      : `La publication sur ${name} a été interrompue par un imprévu technique. Le job est arrêté${rendue ? ' et la Pépite engagée a été rendue' : ''} — relance depuis la fiche de l'article ; le détail complet est enregistré pour le support.`;
  }

  // Message déjà humain (court, sans marqueur technique) : tel quel.
  if (!TECH_ERR_MARKERS_RE.test(raw) && raw.length <= 300) return raw;

  return en
    ? `Publishing on ${name} was interrupted by a technical issue. Retry from the item; the full detail has been recorded for support.`
    : `La publication sur ${name} a été interrompue par un imprévu technique. Relancer depuis la fiche de l'article ; le détail complet est enregistré pour le support.`;
}

export const C = {
  primary:"#1D9E75",
  dark:"#0F6E56",
  soft:"#5DCAA5",
  muted:"#A3A9A6",
  bg:"#F5F6F5",
  teal:"#4ECDC4", tealLight:"#E8F5F0",
  peach:"#F9A26C",
  white:"#FFFFFF",
  text:"#0D0D0D", sub:"#6B7280", label:"#A3A9A6",
  border:"rgba(0,0,0,0.06)",
  red:"#E53E3E", redLight:"#FFF5F5",
  green:"#1D9E75", greenLight:"#E8F5F0",
  orange:"#F9A26C", orangeLight:"#FFF4EE",
  rowBg:"#F5F6F5", rowHover:"#EAEBEA",
};

export const VOICE_FREE_LIMIT = 5;

const CURRENCY_DATA=[
  {code:'EUR',sym:'€',loc:'fr-FR',dec:2,reg:'Europe',name:'Euro'},
  {code:'GBP',sym:'£',loc:'en-GB',dec:2,reg:'Europe',name:'Pound'},
  {code:'CHF',sym:'Fr',loc:'de-CH',dec:2,reg:'Europe',name:'Franc'},
  {code:'SEK',sym:'kr',loc:'sv-SE',dec:2,reg:'Europe',name:'Krona SE'},
  {code:'NOK',sym:'kr',loc:'nb-NO',dec:2,reg:'Europe',name:'Krone NO'},
  {code:'DKK',sym:'kr',loc:'da-DK',dec:2,reg:'Europe',name:'Krone DK'},
  {code:'PLN',sym:'zł',loc:'pl-PL',dec:2,reg:'Europe',name:'Złoty'},
  {code:'CZK',sym:'Kč',loc:'cs-CZ',dec:2,reg:'Europe',name:'Koruna'},
  {code:'HUF',sym:'Ft',loc:'hu-HU',dec:0,reg:'Europe',name:'Forint'},
  {code:'RON',sym:'lei',loc:'ro-RO',dec:2,reg:'Europe',name:'Leu RO'},
  {code:'HRK',sym:'kn',loc:'hr-HR',dec:2,reg:'Europe',name:'Kuna'},
  {code:'BGN',sym:'лв',loc:'bg-BG',dec:2,reg:'Europe',name:'Lev'},
  {code:'RSD',sym:'din',loc:'sr-RS',dec:0,reg:'Europe',name:'Dinar RS'},
  {code:'ISK',sym:'kr',loc:'is-IS',dec:0,reg:'Europe',name:'Króna'},
  {code:'ALL',sym:'L',loc:'sq-AL',dec:0,reg:'Europe',name:'Lek'},
  {code:'MKD',sym:'ден',loc:'mk-MK',dec:0,reg:'Europe',name:'Denar'},
  {code:'BAM',sym:'KM',loc:'bs-BA',dec:2,reg:'Europe',name:'Mark BA'},
  {code:'MDL',sym:'L',loc:'ro-MD',dec:2,reg:'Europe',name:'Leu MD'},
  {code:'UAH',sym:'₴',loc:'uk-UA',dec:2,reg:'Europe',name:'Hryvnia'},
  {code:'GEL',sym:'₾',loc:'ka-GE',dec:2,reg:'Europe',name:'Lari'},
  {code:'AMD',sym:'֏',loc:'hy-AM',dec:0,reg:'Europe',name:'Dram'},
  {code:'AZN',sym:'₼',loc:'az-AZ',dec:2,reg:'Europe',name:'Manat AZ'},
  {code:'BYN',sym:'Br',loc:'be-BY',dec:2,reg:'Europe',name:'Rouble BY'},
  {code:'RUB',sym:'₽',loc:'ru-RU',dec:2,reg:'Europe',name:'Rouble'},
  {code:'TRY',sym:'₺',loc:'tr-TR',dec:2,reg:'Europe',name:'Lira'},
  {code:'USD',sym:'$',loc:'en-US',dec:2,reg:'America',name:'Dollar'},
  {code:'CAD',sym:'CA$',loc:'en-CA',dec:2,reg:'America',name:'Dollar CA'},
  {code:'AUD',sym:'A$',loc:'en-AU',dec:2,reg:'America',name:'Dollar AU'},
  {code:'NZD',sym:'NZ$',loc:'en-NZ',dec:2,reg:'America',name:'Dollar NZ'},
  {code:'MXN',sym:'$',loc:'es-MX',dec:2,reg:'America',name:'Peso MX'},
  {code:'BRL',sym:'R$',loc:'pt-BR',dec:2,reg:'America',name:'Real'},
  {code:'ARS',sym:'$',loc:'es-AR',dec:2,reg:'America',name:'Peso AR'},
  {code:'CLP',sym:'$',loc:'es-CL',dec:0,reg:'America',name:'Peso CL'},
  {code:'COP',sym:'$',loc:'es-CO',dec:0,reg:'America',name:'Peso CO'},
  {code:'PEN',sym:'S/',loc:'es-PE',dec:2,reg:'America',name:'Sol'},
  {code:'UYU',sym:'$U',loc:'es-UY',dec:2,reg:'America',name:'Peso UY'},
  {code:'PYG',sym:'₲',loc:'es-PY',dec:0,reg:'America',name:'Guaraní'},
  {code:'BOB',sym:'Bs.',loc:'es-BO',dec:2,reg:'America',name:'Boliviano'},
  {code:'VES',sym:'Bs.S',loc:'es-VE',dec:2,reg:'America',name:'Bolívar'},
  {code:'GTQ',sym:'Q',loc:'es-GT',dec:2,reg:'America',name:'Quetzal'},
  {code:'HNL',sym:'L',loc:'es-HN',dec:2,reg:'America',name:'Lempira'},
  {code:'NIO',sym:'C$',loc:'es-NI',dec:2,reg:'America',name:'Córdoba'},
  {code:'CRC',sym:'₡',loc:'es-CR',dec:0,reg:'America',name:'Colón'},
  {code:'PAB',sym:'B/.',loc:'es-PA',dec:2,reg:'America',name:'Balboa'},
  {code:'DOP',sym:'RD$',loc:'es-DO',dec:2,reg:'America',name:'Peso DO'},
  {code:'CUP',sym:'$',loc:'es-CU',dec:2,reg:'America',name:'Peso CU'},
  {code:'JMD',sym:'J$',loc:'en-JM',dec:2,reg:'America',name:'Dollar JM'},
  {code:'TTD',sym:'TT$',loc:'en-TT',dec:2,reg:'America',name:'Dollar TT'},
  {code:'BBD',sym:'Bds$',loc:'en-BB',dec:2,reg:'America',name:'Dollar BB'},
  {code:'BSD',sym:'B$',loc:'en-BS',dec:2,reg:'America',name:'Dollar BS'},
  {code:'HTG',sym:'G',loc:'fr-HT',dec:2,reg:'America',name:'Gourde'},
  {code:'XCD',sym:'EC$',loc:'en-AG',dec:2,reg:'America',name:'Dollar EC'},
  {code:'ZAR',sym:'R',loc:'en-ZA',dec:2,reg:'Africa',name:'Rand'},
  {code:'NGN',sym:'₦',loc:'en-NG',dec:2,reg:'Africa',name:'Naira'},
  {code:'EGP',sym:'£',loc:'ar-EG',dec:2,reg:'Africa',name:'Livre EG'},
  {code:'MAD',sym:'DH',loc:'ar-MA',dec:2,reg:'Africa',name:'Dirham MA'},
  {code:'TND',sym:'DT',loc:'ar-TN',dec:3,reg:'Africa',name:'Dinar TN'},
  {code:'DZD',sym:'دج',loc:'ar-DZ',dec:2,reg:'Africa',name:'Dinar DZ'},
  {code:'KES',sym:'KSh',loc:'sw-KE',dec:2,reg:'Africa',name:'Shilling KE'},
  {code:'GHS',sym:'GH₵',loc:'en-GH',dec:2,reg:'Africa',name:'Cedi'},
  {code:'ETB',sym:'Br',loc:'am-ET',dec:2,reg:'Africa',name:'Birr'},
  {code:'TZS',sym:'TSh',loc:'sw-TZ',dec:0,reg:'Africa',name:'Shilling TZ'},
  {code:'UGX',sym:'USh',loc:'en-UG',dec:0,reg:'Africa',name:'Shilling UG'},
  {code:'RWF',sym:'RF',loc:'rw-RW',dec:0,reg:'Africa',name:'Franc RW'},
  {code:'BIF',sym:'Fr',loc:'fr-BI',dec:0,reg:'Africa',name:'Franc BI'},
  {code:'XOF',sym:'CFA',loc:'fr-SN',dec:0,reg:'Africa',name:'Franc XOF'},
  {code:'XAF',sym:'FCFA',loc:'fr-CM',dec:0,reg:'Africa',name:'Franc XAF'},
  {code:'MZN',sym:'MT',loc:'pt-MZ',dec:2,reg:'Africa',name:'Metical'},
  {code:'ZMW',sym:'ZK',loc:'en-ZM',dec:2,reg:'Africa',name:'Kwacha ZM'},
  {code:'MWK',sym:'MK',loc:'en-MW',dec:2,reg:'Africa',name:'Kwacha MW'},
  {code:'NAD',sym:'N$',loc:'en-NA',dec:2,reg:'Africa',name:'Dollar NA'},
  {code:'BWP',sym:'P',loc:'en-BW',dec:2,reg:'Africa',name:'Pula'},
  {code:'SCR',sym:'₨',loc:'en-SC',dec:2,reg:'Africa',name:'Roupie SC'},
  {code:'MUR',sym:'₨',loc:'en-MU',dec:2,reg:'Africa',name:'Roupie MU'},
  {code:'MGA',sym:'Ar',loc:'fr-MG',dec:0,reg:'Africa',name:'Ariary'},
  {code:'SDG',sym:'ج.س',loc:'ar-SD',dec:2,reg:'Africa',name:'Livre SD'},
  {code:'LYD',sym:'LD',loc:'ar-LY',dec:3,reg:'Africa',name:'Dinar LY'},
  {code:'GMD',sym:'D',loc:'en-GM',dec:2,reg:'Africa',name:'Dalasi'},
  {code:'SLE',sym:'Le',loc:'en-SL',dec:2,reg:'Africa',name:'Leone'},
  {code:'LRD',sym:'L$',loc:'en-LR',dec:2,reg:'Africa',name:'Dollar LR'},
  {code:'SOS',sym:'Sh',loc:'so-SO',dec:0,reg:'Africa',name:'Shilling SO'},
  {code:'DJF',sym:'Fr',loc:'fr-DJ',dec:0,reg:'Africa',name:'Franc DJ'},
  {code:'KMF',sym:'Fr',loc:'fr-KM',dec:0,reg:'Africa',name:'Franc KM'},
  {code:'STN',sym:'Db',loc:'pt-ST',dec:2,reg:'Africa',name:'Dobra'},
  {code:'CVE',sym:'Esc',loc:'pt-CV',dec:2,reg:'Africa',name:'Escudo'},
  {code:'MRU',sym:'UM',loc:'ar-MR',dec:2,reg:'Africa',name:'Ouguiya'},
  {code:'ERN',sym:'Nfk',loc:'ti-ER',dec:2,reg:'Africa',name:'Nakfa'},
  {code:'SSP',sym:'£',loc:'en-SS',dec:2,reg:'Africa',name:'Livre SS'},
  {code:'CDF',sym:'Fr',loc:'fr-CD',dec:2,reg:'Africa',name:'Franc CD'},
  {code:'SZL',sym:'L',loc:'en-SZ',dec:2,reg:'Africa',name:'Lilangeni'},
  {code:'LSL',sym:'L',loc:'en-LS',dec:2,reg:'Africa',name:'Loti'},
  {code:'JPY',sym:'¥',loc:'ja-JP',dec:0,reg:'Asia/Pacific',name:'Yen'},
  {code:'CNY',sym:'¥',loc:'zh-CN',dec:2,reg:'Asia/Pacific',name:'Yuan'},
  {code:'HKD',sym:'HK$',loc:'zh-HK',dec:2,reg:'Asia/Pacific',name:'Dollar HK'},
  {code:'TWD',sym:'NT$',loc:'zh-TW',dec:0,reg:'Asia/Pacific',name:'Dollar TW'},
  {code:'KRW',sym:'₩',loc:'ko-KR',dec:0,reg:'Asia/Pacific',name:'Won'},
  {code:'SGD',sym:'S$',loc:'en-SG',dec:2,reg:'Asia/Pacific',name:'Dollar SG'},
  {code:'MYR',sym:'RM',loc:'ms-MY',dec:2,reg:'Asia/Pacific',name:'Ringgit'},
  {code:'THB',sym:'฿',loc:'th-TH',dec:2,reg:'Asia/Pacific',name:'Baht'},
  {code:'IDR',sym:'Rp',loc:'id-ID',dec:0,reg:'Asia/Pacific',name:'Rupiah'},
  {code:'PHP',sym:'₱',loc:'fil-PH',dec:2,reg:'Asia/Pacific',name:'Peso PH'},
  {code:'VND',sym:'₫',loc:'vi-VN',dec:0,reg:'Asia/Pacific',name:'Dong'},
  {code:'INR',sym:'₹',loc:'hi-IN',dec:2,reg:'Asia/Pacific',name:'Roupie IN'},
  {code:'PKR',sym:'₨',loc:'ur-PK',dec:2,reg:'Asia/Pacific',name:'Roupie PK'},
  {code:'BDT',sym:'৳',loc:'bn-BD',dec:2,reg:'Asia/Pacific',name:'Taka'},
  {code:'LKR',sym:'₨',loc:'si-LK',dec:2,reg:'Asia/Pacific',name:'Roupie LK'},
  {code:'NPR',sym:'₨',loc:'ne-NP',dec:2,reg:'Asia/Pacific',name:'Roupie NP'},
  {code:'MMK',sym:'K',loc:'my-MM',dec:0,reg:'Asia/Pacific',name:'Kyat'},
  {code:'KHR',sym:'៛',loc:'km-KH',dec:0,reg:'Asia/Pacific',name:'Riel'},
  {code:'LAK',sym:'₭',loc:'lo-LA',dec:0,reg:'Asia/Pacific',name:'Kip'},
  {code:'MNT',sym:'₮',loc:'mn-MN',dec:0,reg:'Asia/Pacific',name:'Tögrög'},
  {code:'KZT',sym:'₸',loc:'kk-KZ',dec:2,reg:'Asia/Pacific',name:'Tenge'},
  {code:'UZS',sym:"so'm",loc:'uz-UZ',dec:0,reg:'Asia/Pacific',name:'Som UZ'},
  {code:'KGS',sym:'som',loc:'ky-KG',dec:2,reg:'Asia/Pacific',name:'Som KG'},
  {code:'TJS',sym:'SM',loc:'tg-TJ',dec:2,reg:'Asia/Pacific',name:'Somoni'},
  {code:'TMT',sym:'T',loc:'tk-TM',dec:2,reg:'Asia/Pacific',name:'Manat TM'},
  {code:'AFN',sym:'؋',loc:'ps-AF',dec:2,reg:'Asia/Pacific',name:'Afghani'},
  {code:'IQD',sym:'ع.د',loc:'ar-IQ',dec:0,reg:'Asia/Pacific',name:'Dinar IQ'},
  {code:'IRR',sym:'﷼',loc:'fa-IR',dec:0,reg:'Asia/Pacific',name:'Rial IR'},
  {code:'SAR',sym:'﷼',loc:'ar-SA',dec:2,reg:'Asia/Pacific',name:'Riyal SA'},
  {code:'AED',sym:'د.إ',loc:'ar-AE',dec:2,reg:'Asia/Pacific',name:'Dirham AE'},
  {code:'QAR',sym:'ر.ق',loc:'ar-QA',dec:2,reg:'Asia/Pacific',name:'Riyal QA'},
  {code:'KWD',sym:'KD',loc:'ar-KW',dec:3,reg:'Asia/Pacific',name:'Dinar KW'},
  {code:'BHD',sym:'BD',loc:'ar-BH',dec:3,reg:'Asia/Pacific',name:'Dinar BH'},
  {code:'OMR',sym:'ر.ع',loc:'ar-OM',dec:3,reg:'Asia/Pacific',name:'Rial OM'},
  {code:'JOD',sym:'JD',loc:'ar-JO',dec:3,reg:'Asia/Pacific',name:'Dinar JO'},
  {code:'LBP',sym:'ل.ل',loc:'ar-LB',dec:0,reg:'Asia/Pacific',name:'Livre LB'},
  {code:'SYP',sym:'£S',loc:'ar-SY',dec:0,reg:'Asia/Pacific',name:'Livre SY'},
  {code:'YER',sym:'﷼',loc:'ar-YE',dec:0,reg:'Asia/Pacific',name:'Rial YE'},
  {code:'ILS',sym:'₪',loc:'he-IL',dec:2,reg:'Asia/Pacific',name:'Shekel'},
];
export const CURRENCY_LOCALES = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.loc]));
export const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.sym]));
export const CURRENCY_DECIMALS = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.dec]));

export function formatCurrency(amount, currency='EUR', decimals=null) {
  const n = Math.round((amount||0)*100)/100;
  const dec = decimals!==null ? decimals : (CURRENCY_DECIMALS[currency]??2);
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[currency]||'fr-FR',{style:'currency',currency,minimumFractionDigits:dec,maximumFractionDigits:dec}).format(n);
  } catch {
    const sym = CURRENCY_SYMBOLS[currency]||currency;
    return sym+' '+n.toFixed(dec);
  }
}

export const normalizeMarque = m => m?.trim() ? m.trim().toLowerCase().replace(/(^|\s|')(\S)/g,(_,sep,c)=>sep+c.toUpperCase()) : "Sans marque";
export const fmtp = n => (Math.round(n*10)/10).toFixed(1)+"%";

export const LOC_RE = /^(acheté[e]?\s+(?:à|en|au|aux)\s|bought\s+(?:in|at)\s)/i;
export function parseLocDesc(desc) {
  if (!desc) return { loc: null, rest: null };
  const parts = desc.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  const loc = parts.filter(p => LOC_RE.test(p)).join(", ") || null;
  const rest = parts.filter(p => !LOC_RE.test(p)).join(", ") || null;
  return { loc, rest };
}

export function detectType(titre,marque){
  const t=((titre||'')+' '+(marque||'')).toLowerCase();
  // ⚠️ CATÉGORIE "Luxe" SUPPRIMÉE le 2026-07-17. L'ancien 1er test renvoyait
  // 'Luxe' dès qu'une marque « premium » figurait dans le texte — MAIS la liste
  // incluait des marques NON luxe (Ralph Lauren, Lacoste, Tommy, Boss, Armani),
  // et surtout 'Luxe' n'est mappé sur AUCUNE plateforme (💎 injouable). Un
  // parfum Chanel partait ainsi en Luxe → injouable. Désormais on classe par
  // TYPE DE PRODUIT : la marque (luxe ou non) n'influence plus la catégorie —
  // un sac Hermès → Mode, un parfum Chanel → Beauté, une Rolex → Mode.
  if(/robe|jupe|pull|jean(?!\W(?:paul|patou|jacques|claude|charles|louis|pierre|michel|marie|baptiste))|veste|manteau|costume|chemise|chemisier|blouse|short|legging|pantalon|\bpolo\b|\btop\b|t-shirt|cardigan|blouson|parka|doudoune|sweat|hoodie|débardeur|tunique|combinaison|kimono|salopette|bermuda|jogging|survêtement|maillot|bikini|lingerie|soutien|brassière|culotte|boxer|chaussette|collant|chaussure|basket|botte|sandale|espadrille|escarpin|mocassin|sneaker|talon|ballerine|sac|pochette|portefeuille|ceinture|écharpe|foulard|casquette|chapeau|bonnet|(?<![\p{L}\p{N}])gants?(?![\p{L}\p{N}])|lunette|bijou|collier|bracelet|\bbagues?\b|(?<![\p{L}\p{N}])montres?(?![\p{L}\p{N}])(?!\s*(?:connect|intelligente))|boucle|accessoire|imperméable|pyjama|nuisette|robe.?chambre|maillot.?bain|\bcap\b|\bbob\b|beret|turban|snood|mitaine|manchette|cravate|noeud.?papillon|bretelle|jarretelle|chaussure.?sport|derby|oxford|loafer|chelsea|compensée|plateforme|slip|string|monokini|playsuit|body|bustier|corset|louboutin|jimmy.?choo|manolo|birkin|kelly|neverfull|speedy/iu.test(t)) return 'Mode';
  if(/guitare|\bpiano\b|violon|\bbatterie\b(?!.{0,18}(?:voiture|cuisine|externe|lithium|rechargeable|li.?ion|au.?plomb|solaire|\d{3,}|perceuse|visseuse|drone|portable|ordinateur|tondeuse|\d+\s?v\b|\d+\s?mah))|\bsynthé\b|synthétiseur|ukulélé|trompette|saxophone|accordéon|contrebasse|clavier.?(?:midi|arrangeur|ma[îi]tre)|pédale.?(?:effet|guitare|basse)|table.?(?:de.?)?(?:mix|mixage)|\bampli\b(?!.{0,10}voiture|.{0,10}\bauto\b)|\bvinyle\b|vinyl|platine.?(?:vinyle|disque|dj)|\bpartition\b|solfège|\bgibson\b|\bfender\b|\bmarshall\b|\bibanez\b|\bepiphone\b|les.?paul|stratocaster|telecaster|\bstrat\b|guitare.?basse|basse.?(?:[eé]lec|acoustique|\d.?cordes|fretless|active)|\bbassiste\b|micro.?(?:studio|chant|enregistrement)|enceinte.?studio|moniteur.?studio/i.test(t)) return 'Musique';
  // Mobilité AVANT High-Tech : « trottinette Xiaomi » (Xiaomi = marque téléphone
  // ET trottinette) partait en High-Tech → 📱 Téléphones. L'objet prime sur la marque.
  if(/\btrottinette\b|hoverboard|gyroroue|monoroue|overboard/i.test(t)) return 'Sport';
  if(/iphone|samsung|huawei|xiaomi|oneplus|pixel|macbook|laptop|ordinateur|\bpc\b|computer|tablette|ipad|téléphone|smartphone|airpods|écouteur|casque(?!.{0,8}(?:moto|v[ée]lo|scooter|ski|chantier))|enceinte|jbl|bose|sony|beats|playstation|ps4|ps5|xbox|nintendo|switch|console|jeu.?video|manette|clavier|souris|écran|moniteur|imprimante|disque|ssd|\bram\b|processeur|gopro|appareil.?photo|camera|objectif|drone|fitbit|garmin|apple.?watch|smartwatch|montre.?connect|(?<!meuble.{0,6})tv|télévision|projecteur|home.?cinema|ampli|chargeur|cable|adaptateur|batterie.?externe|airpod|earbud|tws|true.?wireless|powerbank|hub|dock|station|chargeur.?sans.?fil|disque.?dur|clé.?usb|carte.?sd|carte.?graphique|carte.?m[èe]re|\bgpu\b|geforce|radeon|webcam|ring.?light|green.?screen|smart.?tv|android.?tv|chromecast|firestick|apple.?tv|box.?internet|routeur|répéteur.?wifi|alarme|camera.?surveillance|sonnette|imprimante.?3d|scanner|tablette.?graphique/i.test(t)) return 'High-Tech';
  if(/perceuse|visseuse|meuleuse|ponceuse|\bscies?\b|scie.?(?:circulaire|sauteuse|cloche)|\bforet\b|tournevis|\bmarteau\b(?!.{0,6}piqueur)|interrupteur|disjoncteur|prise.?électrique|tableau.?électrique|fusible|\bmakita\b|\bdewalt\b|\bryobi\b|\bfacom\b|\bstanley.?(?!cup)|\bpinces?\b|mastic|enduit|joint.?(?:silicone|plomberie)|silicone.?(?:sanitaire|joint)|carrelage|lame.?parquet|papier.?peint|rouleau.?peinture|niveau.?(?:laser|bulle)|mètre.?ruban|cheville.?(?:plastique|béton|mur)|clé.?(?:plate|allen|mixte|dynamométrique)|boulons?(?!\s*éblouir)|\bétau\b|établi|serre.?joint/i.test(t)) return 'Bricolage';
  if(/tondeuse(?!.{0,12}(?:cheveux|barbe|chien|animal))|débroussailleuse|taille.?haie|souffleur.?(?:feuilles|jardin)|tronçonneuse|sécateur|élagueuse|scarificateur|arrosoir|tuyau.?arrosage|asperseur|pompe.?jardin|\bbêche\b|\brateau\b|\bfourche\b(?!.{0,8}moto)|\bbinette\b|brouette|compost|\bterreau\b|engrais|graines?(?:\s+de\s+jardin)?|jardinage|\bhusqvarna\b|\bstihl\b(?!.{0,8}moto)/i.test(t)) return 'Jardin';
  if(/canapé|sofa|\btable\b|chaise|bureau|armoire|commode|\blit\b|matelas|étagère|bibliothèque|meuble|lampe|luminaire|miroir|tableau|cadre|tapis|rideau|coussin|plaid|couette|\bdrap\b|serviette|vase|bougie|déco|cuisine|assiette|\bbol\b|verre|tasse|cafetière|machine.?café|grille.?pain|mixeur|robot|poêle|casserole|ustensile|réfrigérateur|micro.?onde|pouf|banquette|ottomane|tabouret|\bbar\b|console|desserte|vaisselier|bahut|buffet|vitrine|applique|suspension|guirlande|led|ampoule|parure|jeté|store|voilage|portant|cintre|organisateur|boite|panier|corbeille|plante|\bpot\b/i.test(t)) return 'Maison';
  if(/lego|playmobil|hasbro|mattel|jouet|\bjeux?\b|puzzle|peluche|figurines?|\bfunko\b|nendoroid|\bamiibo\b|\bbandai\b|banpresto|kotobukiya|poupée|voiture.?miniature|construction|kapla|duplo|hot.?wheels|barbie/i.test(t)) return 'Jouets';
  if(/livre|bd|bande.?dessinée|manga|roman|magazine|comics|guide|encyclopédie|atlas|dictionnaire/i.test(t)) return 'Livres';
  if(/vélo|trottinette|skateboard|\bski\b|snowboard|raquette|ballon|football|basketball|tennis|badminton|golf(?!\s*(?:gti|tdi|tsi|gtd|\d|plus|r32|variant|sportsvan))|rugby|natation|plongée|\bsurf\b|kayak|randonnée|camping|\bsport|fitness|musculation|haltère|kettlebell|yoga|pilates|course|running|trail|cyclisme|équitation|boxe|arts.?martiaux|tapis.?course|vélo.?appartement|rameur|elliptique|corde.?sauter|élastique.?musculation|bande.?résistance|gant.?boxe|protège|casque.?vélo|genouillère|spike|crampon|patin|roller|tente|sac.?dos.?rando|gourde|frontale|bâton.?marche|canne.?pêche|moulinet|waders/i.test(t)) return 'Sport';
  if(/voiture|\bauto\b|moto|scooter|véhicule|pneu|jante|casque.?moto|pièce.?auto|autoradio|gps|huile.?moteur|liquide.?(?:de.?)?(?:refroidissement|frein)/i.test(t)) return 'Auto-Moto';
  if(/parfum|crème|sérum|mascara|rouge.?lèvre|palette|correcteur|dissolvant|vernis|shampooing|après-shampooing|masque.?cheveux|(?<!sans\s)huile(?!\s*(?:moteur|d.?olive|de.?friture|de.?tournesol|de.?colza|alimentaire|de.?coude))|lotion|gel.?douche|savon|rasoir|fond.?teint|bb.?cream|cc.?cream|cushion|anticernes|poudre|blush|bronzer|highlighter|fard.?paupières|eyeliner|crayon|kajal|extension.?cils|faux.?cils|sourcil|gloss|baume|exfoliant|gommage|peeling|autobronzant|spray.?solaire|after.?sun|déodorant|roll.?on|\bstick\b|eau.?de.?cologne|brosse|peigne|lisseur|boucleur|bigoudi|coton|lingette|démaquillant|tonique|brume/i.test(t)) return 'Beauté';
  if(/collectionn|cartes?\s*(?:pokémon|pokemon|magic|yu.?gi.?oh|panini|à.?collectionner|de.?collection|postale)|timbre|monnaie|pièce.?(?:de.?monnaie|ancienne|de.?collection|comm[ée]morative|rare)|funko|vintage|antique|brocante/i.test(t)) return 'Collection';
  if(/aspirateur|robot.?aspirateur|roomba|dyson|lave.?linge|lave.?vaisselle|congélateur|\bfour\b|hotte|plaque|induction|gazinière|sèche.?linge|sèche.?cheveux|fer.?repasser|climatiseur|ventilateur|radiateur|chauffage|chauffe.?eau|nespresso|dolce.?gusto|blender|robot.?cuisine|thermomix|friteuse|yaourtière|extracteur.?jus|centrifugeuse|bouilloire|épilateur|rasoir.?électrique|brosse.?dents/i.test(t)) return 'Électroménager';
  return 'Autre';
}

export function getTypeStyle(type){
  const s={
    'Mode':          {bg:'#FDF2F8',color:'#9D174D',border:'#F9A8D4',emoji:'👗'},
    'High-Tech':     {bg:'#EFF6FF',color:'#1D4ED8',border:'#93C5FD',emoji:'📱'},
    'Maison':        {bg:'#F0FDF4',color:'#166534',border:'#86EFAC',emoji:'🏠'},
    'Jouets':        {bg:'#FFFBEB',color:'#92400E',border:'#FCD34D',emoji:'🧸'},
    'Livres':        {bg:'#FFF7ED',color:'#9A3412',border:'#FDBA74',emoji:'📚'},
    'Sport':         {bg:'#F0F9FF',color:'#0C4A6E',border:'#7DD3FC',emoji:'⚽'},
    'Auto-Moto':     {bg:'#F8FAFC',color:'#334155',border:'#94A3B8',emoji:'🚗'},
    'Beauté':        {bg:'#FFF1F2',color:'#9F1239',border:'#FDA4AF',emoji:'💄'},
    'Musique':       {bg:'#F5F3FF',color:'#5B21B6',border:'#C4B5FD',emoji:'🎵'},
    'Collection':    {bg:'#FEFCE8',color:'#854D0E',border:'#FDE047',emoji:'🏆'},
    'Électroménager':{bg:'#ECFDF5',color:'#065F46',border:'#6EE7B7',emoji:'⚡'},
    'Luxe':          {bg:'#FDF8F0',color:'#92400E',border:'#F59E0B',emoji:'💎'},
    'Multimédia':    {bg:'#F3E8FF',color:'#6B21A8',border:'#D8B4FE',emoji:'📺'},
    'Jardin':        {bg:'#ECFDF5',color:'#14532D',border:'#4ADE80',emoji:'🌿'},
    'Bricolage':     {bg:'#FFF7ED',color:'#C2410C',border:'#FB923C',emoji:'🔧'},
    'Autre':         {bg:'#F9FAFB',color:'#6B7280',border:'#D1D5DB',emoji:'📦'},
  };
  if(s[type]) return s[type];
  const key=Object.keys(s).find(k=>k.toLowerCase()===(type||"").toLowerCase());
  return key?s[key]:s['Autre'];
}

export const getMargeColor = pct => pct>=40?"#1D9E75":pct>=20?"#5DCAA5":pct>=5?"#F9A26C":"#E53E3E";
export const getCatBorder = type => getTypeStyle(type).border;

// ── Design 2026 (Lens / navbar) : tuiles de catégorie ──
// Pastels désaturés dans l'esprit canvas #EDEAE0 / paper #F6F5F1.
// Une couleur par catégorie — deux articles de même catégorie = même tuile.
export const CAT_TILE_COLORS = {
  'Mode':           '#FBEAE2',
  'Luxe':           '#F5EBD7',
  'High-Tech':      '#E5E9F3',
  'Maison':         '#E6EFEA',
  'Électroménager': '#E3F0F0',
  'Jouets':         '#FAF0D7',
  'Livres':         '#F0E8DB',
  'Sport':          '#E2EEF6',
  'Auto-Moto':      '#E9E9E3',
  'Beauté':         '#EFE6F0',
  'Musique':        '#EAE5F2',
  'Collection':     '#F6E9DE',
  'Jardin':         '#E7F0E2',
  'Bricolage':      '#F1E9DD',
  'Multimédia':     '#E8E4EE',
  'Autre':          '#ECEBE6',
};
export function getCatTileColor(type){
  if(CAT_TILE_COLORS[type]) return CAT_TILE_COLORS[type];
  const key=Object.keys(CAT_TILE_COLORS).find(k=>k.toLowerCase()===(type||"").toLowerCase());
  return key?CAT_TILE_COLORS[key]:CAT_TILE_COLORS['Autre'];
}
// Slug CSS de la catégorie (classe .cat-mode, .cat-hightech, .cat-electromenager...)
export const catClass = type => 'cat-'+((type||'autre').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,''));

// ── Icône par type précis d'objet (même pattern que detectType : mots-clés
// dans titre + description, du plus spécifique au plus générique — l'ordre compte).
const OBJECT_ICON_RULES = [
  // Désambiguïsations prioritaires (avant les règles génériques)
  // Figurines / objets de collection — AVANT TOUTE règle vêtement. La description
  // d'une figurine décrit la TENUE du personnage représenté (kimono, manteau,
  // veste…) et matchait alors la règle vêtement 🧥 (« manteau|veste|kimono »,
  // plus bas) → catégorie Mode>Vêtements → champ « Taille » obligatoire absurde
  // sur une figurine (bug réel « Bandai Roronoa Zoro One Piece », 2026-07-17).
  // On matche l'OBJET (« figurine ») et les MARQUES de figurines (jamais des
  // marques de vêtement) : l'objet prime sur les habits du personnage. On ne met
  // PAS les noms de licences nus (naruto, one piece…) — un « hoodie Naruto » ou
  // un « maillot one-piece » doit rester un vêtement.
  [/figurines?|\bfunko\b|nendoroid|\bamiibo\b|\bbandai\b|banpresto|kotobukiya|good.?smile|mc.?farlane|s\.?h\.?\s?figuarts|pop.?!?\s?vinyl/i, '🦸'],
  [/basket.?ball|ballon.?(?:de.?)?basket|panier.?de.?basket/i, '🏀'],  // ballon de basket : "basket" seul → 👟 (bug)
  [/casque.?(?:moto|scooter|cross|intégral|jet)/i, '🪖'],
  // Vêtements de SPORT AVANT les règles d'ÉQUIPEMENT sport (⛑️/🤿/🎿/⚽) : un
  // maillot de foot est un HAUT (pas une robe), une combinaison de ski un
  // VÊTEMENT (pas des skis). Bug chasse mot-clé 2026-07-17.
  [/maillot.?(?:de.?)?(?:foot|rugby|basket|hand|volley|cyclis|sport)|\bjersey\b|brassière/i, '👕'],
  [/combinaison.?(?:de.?)?(?:ski|surf|snowboard|moto|plong[ée]e)|kimono.?(?:judo|karat[ée]|jjb|taekwondo)|justaucorps/i, '🧥'],
  [/casque.?(?:vélo|ski|snow)/i, '⛑️'],
  [/tondeuse.?(?:à.?)?(?:barbe|cheveux)|rasoir|épilateur/i, '🪒'],
  // Contexte sport : doit passer avant les règles génériques sac (👜) et
  // lunettes (🕶️) — feuilles Vinted dédiées (Sacs de sport, genré ;
  // Sports nautiques > Natation > Lunettes de natation).
  [/sac.?de.?(?:sport|gym|fitness)/i, '🎽'],
  [/lunettes?.?de.?(?:natation|piscine)/i, '🥽'],
  [/sac.?à.?dos|backpack|cartable/i, '🎒'],
  [/batterie.?externe|powerbank|chargeur|câble|adaptateur|\bhub\b|\bdock\b/i, '🔌'],
  [/tapis.?de.?course|vélo.?d.?appartement|rameur|elliptique/i, '🏃'],
  [/clavier.?(?:midi|maître|maitre|arrangeur)|piano(?!\s*de\s*cuisson)|synthé|synthétiseur/i, '🎹'],  // clavier arrangeur/maître = instrument, avant ⌨️ clavier ordinateur ; piano de cuisson = cuisinière, pas un instrument
  [/voiture.?miniature|hot.?wheels|majorette/i, '🏎️'],
  [/machine.?à.?laver|lave.?linge|sèche.?linge|lave.?vaisselle/i, '🧺'],
  [/machine.?à.?café|cafetière|nespresso|senseo|dolce.?gusto|expresso/i, '☕'],
  // ⚠️ `cartes?\s*` et non `carte.?` : `.?` (0-1 char) ne franchit pas « s + espace »
  // de « cartes pokémon » → un « Lot cartes Pokémon x20 » tombait en 🏆 Collection
  // (défaut non mappé → job échoué), alors que « Carte Pokémon » (singulier) matchait.
  [/cartes?\s*(?:pokémon|pokemon|magic|yu.?gi.?oh|panini|à.?collectionner)|booster/i, '🃏'],
  [/maillot.?de.?bain|bikini|monokini/i, '👙'],
  [/jeu.?de.?société|monopoly|\buno\b/i, '🎲'],
  // Peluche AVANT les règles animal/objet homonymes (audit 2026-07-19) : une
  // « peluche souris » partait en 🖱️ Souris d'ordinateur (la règle souris
  // vient plus haut que 🧸 dans la section Jouets). L'objet « peluche » prime
  // sur ce qu'elle représente — même logique que les figurines.
  // ⚠️ `doudou` BORNÉ (2026-08-12) : sans borne il matchait DANS « DOUDOUne »
  // — placé avant les règles vêtement, il envoyait toutes les doudounes en
  // 🧸 Peluches (le « doudoune » de la règle 🧥 n'était JAMAIS atteint).
  // Même famille que mascara/Mascarade, lego/GaLEGOn, ampoule/Têtampoule.
  [/peluche|doudous?(?![\p{L}\p{N}])/iu, '🧸'],
  // ── Désambiguïsations ajoutées le 2026-07-09 (mission mapping complet) —
  // chacune doit gagner sur une règle générique plus bas (indiquée) ─────────
  [/télécommandé|voiture.?rc\b/i, '🚁'],                                        // avant 🚗 voiture
  [/déguisement|panoplie\b|costume.?de.?(?:pirate|princesse|sorci|clown|halloween|super.?héros)/i, '🎭'], // avant 🤵/👔 costume
  [/montre.?connectée|smart.?watch|apple.?watch|galaxy.?watch|garmin|fitbit|amazfit/i, '⏱️'],  // avant ⌚ montre
  [/enceinte.?connectée|google.?home|amazon.?echo|\balexa\b|homepod|assistant.?vocal/i, '📡'], // avant 🔊 enceinte
  [/liseuse|kindle|\bkobo\b/i, '📇'],                                           // avant 📚 livre
  [/collier.?(?:pour.?)?(?:chien|chat)|gamelle|croquettes?\b|litière|griffoir|arbre.?à.?chat|laisse\b/i, '🐕'], // avant 💍 collier
  [/chausson|pantoufle|charentaise/i, '🥿'],                                    // avant 👟 chaussure
  [/sac.?banane|banane.?(?:eastpak|nike|adidas)|fanny.?pack|bum.?bag/i, '👝'],  // avant 👜 sac
  [/housse.?de.?couette|parure.?de.?lit|taie.?d.?oreiller|drap.?housse|\bdraps?\b/i, '🛌'],    // avant 🛏️ lit (scission literie/meuble)
  [/lit.?parapluie|lit.?à.?barreaux|berceau|cododo|table.?à.?langer|réducteur.?de.?lit|\btoise\b/i, '🚼'],    // avant 🛏️ lit, 🪑 chaise ET ☂️ parapluie (lit parapluie = lit de voyage bébé, pas un parapluie)
  [/fer.?à.?repasser|défroisseur|centrale.?vapeur|table.?à.?repasser/i, '🧼'],
  [/machine.?à.?coudre|surjeteuse/i, '🧵'],
  [/plongée|\btuba\b|\bpalmes\b/i, '🤿'],                                       // avant 🕶️/👟 (masque, palmes)
  [/paddle|kayak|wakeboard|kitesurf|skimboard|ski.?nautique/i, '🏄'],           // avant 🎿 ski
  [/équitation|équestre|cravache|licol|tapis.?de.?selle|étriers?\b/i, '🐴'],
  [/billard|snooker|pétanque|fléchette|bowling|frisbee/i, '🎱'],
  // Mode / Luxe
  // Couvre-chefs AVANT les sneakers : une marque de basket (Jordan/Air Max…)
  // sur une casquette/bonnet ne doit pas router vers 👟 (bug "Casquette Jordan").
  [/casquette|chapeau|bonnet|\bbob\b|béret|beret/i, '🧢'],
  [/basket|sneaker|chaussure|jordan|air.?max|air.?force|derby|mocassin|loafer|espadrille|crampon/i, '👟'],
  [/botte|bottine|\bboots?\b/i, '👢'],
  // \btalons?\b : "pantalon" CONTIENT "talon" — sans la boundary stricte,
  // tout titre "Pantalon ..." partait sur Chaussures à talons (bug prod).
  [/\btalons?\b|escarpin|ballerine|compensée|louboutin/i, '👠'],
  // ⚠️ mules? : frontières Unicode obligatoires (2026-07-18) — /mule\b/ sans
  // frontière GAUCHE matchait « forMULE », mot quasi systématique des
  // descriptions cosmétiques générées par l'IA : une crème Medik8 partait en
  // Sandales eBay (62107, « Pointure EU » obligatoire). Même piège déjà vu
  // sur gants (élégant) et montres (démontre) plus bas.
  [/sandale|tongs?\b|claquette|(?<![\p{L}\p{N}])mules?(?![\p{L}\p{N}])/iu, '🩴'],
  [/\bsacs?\b(?!\s*(?:de.?couchage|de.?frappe|poubelle|congélation|aspirateur))|handbag|pochette|cabas|besace|bandoulière|birkin|kelly|speedy|neverfull/i, '👜'],
  [/portefeuille|porte.?monnaie|porte.?carte/i, '👛'],
  [/valise|bagage/i, '🧳'],
  // ── Vêtement BÉBÉ à contexte OBLIGATOIRE (2026-08-08, chantier détection
  // bébé — corpus réel : 145 titres enfant en prod, ensemble ×10,
  // bodysuit/grenouillère/sarouel ×1 chacun, tous en 📦 ou dépendants de
  // l'icône IA). Ces mots ne déclenchent QUE si le texte porte AUSSI un
  // signal bébé explicite (bébé / N mois / naissance / nourrisson) : hors de
  // ce contexte (« ensemble tailleur femme », « sarouel homme »,
  // « grenouillère adulte »), RIEN ne change — l'adulte garde son
  // comportement d'avant au caractère près (exigence du chantier, testée en
  // batterie). Résidu assumé : « grenouillère fille 2 ans » sans mot
  // bébé/mois reste en 📦. Placés AVANT les vêtements composants : un
  // « Ensemble bébé manteau et pantalon 3 mois » est un ENSEMBLE, pas un
  // manteau. Feuilles Vinted exactes : cf. VINTED_ENFANT_AFFINAGES.
  [/^(?=[\s\S]*\b(?:ensembles?|bodysuits?)\b)(?=[\s\S]*(?:bébé|bebe|\b\d+\s?mois\b|naissance|nourrisson))/i, '👕'],
  [/^(?=[\s\S]*grenouillères?)(?=[\s\S]*(?:bébé|bebe|\b\d+\s?mois\b|naissance|nourrisson))/i, '🩲'],
  [/^(?=[\s\S]*\bsarouels?\b)(?=[\s\S]*(?:bébé|bebe|\b\d+\s?mois\b|naissance|nourrisson))/i, '👖'],
  // (?:^|[^-\w]) : exclut "garde-robe" (fréquent dans les descriptions IA) et
  // "wardrobe" — sinon un t-shirt dont la description dit "à avoir dans sa
  // garde-robe" devient une robe et le mapping Vinted part sur le mauvais rayon.
  [/(?:^|[^-\w])robe\b|jupe/i, '👗'],
  // 🥼/🤵/🎀 scindés de 🧥/👔 (2026-07-09) : blazer/tailleur, costume et
  // cravate ont chacun leur branche Vinted dédiée (Blazers et tailleurs,
  // Costumes et blazers, Accessoires > Cravates et nœuds papillons) — le
  // T4 "Pantalon de costume → Chemises" venait de "costume" logé dans 👔.
  [/blazer|tailleur\b/i, '🥼'],
  [/(?<!porte.)manteau|veste|blouson|parka|doudoune|trench|imperméable|kimono|polaire\b/i, '🧥'],  // porte-manteau = mobilier, pas un manteau (audit 2026-07-19)
  // ── Vestes techniques sans le mot « veste » (2026-08-12) ────────────────────
  // Cas réel : 384 articles importés d'un dressing Vinted, tous type=NULL en
  // base — le TITRE est le seul signal, et les titres Vinted SEO ne nomment
  // pas la famille (« Coupe vent Nike vintage 90's y2k oversize » ne contient
  // aucun mot de la liste, alors que « Veste coupe vent k-way Nike » passait
  // par « veste »). Même icône 🧥 que veste — donc mêmes plateformes.
  // k-way SANS \b : le tiret est un caractère non-word, et \b est ASCII —
  // frontières Unicode explicites, même piège que gant/mascara/ampoule.
  [/coupe.?vents?\b|(?<![\p{L}\p{N}])k.?ways?(?![\p{L}\p{N}])|\bbombers?\b|softshell/iu, '🧥'],
  [/cravate|n[œo]e?ud.?papillon/i, '🎀'],
  [/costume|smoking\b/i, '🤵'],
  [/chemise|blouse\b/i, '👔'],
  // Scindé de 👕 : pull/sweat/hoodie/cardigan vivent chez Vinted sous une
  // branche "Sweats et pulls" entièrement différente de "Hauts et t-shirts"
  // (voir vintedCategories.js) — un seul et même mot-clé ne peut plus servir
  // de proxy fiable au chemin catalogue, d'où l'icône dédiée.
  [/pull|sweat|hoodie|cardigan|gilet(?!.{0,4}(?:de.?costume|jaune|de.?sécurité))/i, '🧶'],
  // polo/top gardés contre leurs homonymes (audit 2026-07-19) : « Volkswagen
  // Polo 1.2 TSI » partait en T-shirts (même famille que golf GTI, déjà gardé
  // plus bas), et « top qualité/état/prix » — tournure quasi systématique des
  // descriptions IA — matchait \btop\b (« JBL Flip 5, top qualité sonore »
  // → Hauts et t-shirts).
  // \bbod(?:ys?|ies)\b (2026-08-08, B3b) : le pluriel courant de « body »
  // est « bodies » — « Lot 8 bodies bébé » (job réel 46e7dfc9) tombait en 📦.
  [/t.?shirt|tee.?shirt|débardeur|(?<!volkswagen\s)(?<!vw\s)polos?\b(?!\s*(?:\d|tdi|tsi|gti|gtd))|(?<!au\s)\btops?\b(?!\s*(?:qualité|état|etat|condition|niveau|prix))|tunique|\bbod(?:ys?|ies)\b/i, '👕'],
  // « maillot » NU (2026-08-12, dressing importés) : la règle sport (plus
  // haut) exige un qualificatif (foot/rugby/basket/…) et « maillot de bain »
  // part en 👙 avant — un « Maillot Adidas » seul ne matchait RIEN et tombait
  // en 📦. Placée APRÈS ces deux règles : elles gardent la priorité.
  [/(?<![\p{L}\p{N}])maillots?(?![\p{L}\p{N}])/iu, '👕'],
  // 🩳 AVANT 👖 : "short en jean" doit rester un short (le mot-clé jean
  // matcherait sinon en premier).
  [/\bshorts?\b|\bbermudas?\b/i, '🩳'],
  [/jean(?!\W(?:paul|patou|jacques|claude|charles|louis|pierre|michel|marie|baptiste))|pantalon|jogging|legging|\bchino\b|salopette|survêtement/i, '👖'],
  // « survet » nu (2026-08-12, dressing importés) : « survêtement » (règle
  // au-dessus) ne le couvre pas — le ê coupe le préfixe ASCII.
  [/\bsurvets?\b/i, '👖'],
  // Lingerie/nuit (2026-07-09) : branche Vinted dédiée des deux côtés
  // (Lingerie et pyjamas / Sous-vêtements et chaussettes) — backlog T3.
  [/lingerie|soutien.?gorge|nuisette|pyjama|peignoir|tenue.?de.?nuit|caleçon|\bboxers?\b|\bslips?\b|culotte(?!.{0,10}cheval)/i, '🩲'],
  [/chaussette|collant/i, '🧦'],
  [/écharpe|foulard|châle|snood/i, '🧣'],
  // ⚠️ FRONTIÈRES UNICODE, PAS \b (2026-07-12) — bug « Gants » du run réel.
  // /gant/ sans frontière matche « élé-GANT- », adjectif omniprésent dans les
  // descriptions générées par l'IA : le Xiaomi Redmi Note 10 est ainsi parti sur
  // Vinted en « Hommes > Accessoires > Gants » (categoryPath du job, vérifié en
  // base), et une enceinte, une chaise ou un vase « élégants » y seraient partis
  // aussi.
  // ⚠️ \b NE SUFFIT PAS et c'est le piège dans le piège : en JS, \b est ASCII —
  // le « é » n'est pas un caractère de mot, donc \bgant matche ENCORE dans
  // « élégant » (frontière entre « é » et « g »). D'où les lookarounds Unicode
  // explicites ci-dessous, avec le drapeau /u.
  [/(?<![\p{L}\p{N}])gants?(?![\p{L}\p{N}])(?!\s*de\s*boxe)|(?<![\p{L}\p{N}])mitaines?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])moufles?(?![\p{L}\p{N}])/iu, '🧤'],
  // ⚠️ MONTRE AVANT LUNETTES (2026-07-19, bug G-Shock → « Lunettes de soleil »
  // sur les 4 plateformes) : en horlogerie française le cadran est cerclé d'une
  // « lunette » (bezel) — la desc FR d'une montre matche donc la règle
  // lunettes, et c'est l'ORDRE des règles qui fait la priorité, pas la position
  // du mot (même mécanique que le bug Parfum/Soins). La montre prime ; signaux
  // horlogers ajoutés (timepiece, chronograph, analogique-numérique) pour les
  // copies qui ne disent jamais « montre ».
  // Même piège que gants, deux fois : /montre/ matchait le VERBE (« ce casque
  // montre une isolation… ») et « dé-MONTRE- ». Substantif exigé, tournures
  // verbales exclues.
  [/(?<![\p{L}\p{N}])montres?(?![\p{L}\p{N}])(?!\s+(?:qu|que|comment|bien|aussi|des|une?|le|la|les|son|sa|ses)\b)|watch|rolex|omega|swatch|timepiece|chronograph|wristwatch|analog(?:ique)?.?(?:digital|num[ée]rique)/iu, '⌚'],
  // ⌚ ANATOMIE — doit gagner sur 💍 (juste en dessous), 4e bug de la classe
  // « mot générique capté par la mauvaise règle » :
  // « bracelet » est le mot d'une montre autant que d'un bijou, et TOUTE
  // description de montre le porte (bracelet acier / cuir / résine). Quand le
  // titre ne dit que la marque et le modèle — « Casio G-Shock GA-2100 »,
  // « Seiko 5 Automatique », « Daniel Wellington Classic » — il ne reste AUCUN
  // mot horloger : /bracelet/ de la règle 💍 gagnait et la montre partait en
  // Bijoux fantaisie > Autres (eBay 499), dont le SEUL requis est une Marque à
  // 57 valeurs mode/bijoux (Accessorize, Debenhams, Dorothy Perkins…) — d'où le
  // « Marque : valeur hors liste eBay » sur une montre.
  // On statue donc sur l'anatomie, JAMAIS sur « bracelet » : un bijou n'a ni
  // cadran, ni mouvement, ni verre saphir, ni étanchéité chiffrée.
  // Marques bornées à l'horlogerie pure : « casio » seul est volontairement
  // ABSENT (calculatrices, claviers) — ses montres sont prises par le cadran ou
  // par g-shock ; « citizen » aussi (mot anglais courant, et la règle 📀 est
  // plus bas : « DVD Citizen Kane » serait devenu une montre).
  // Placée APRÈS ⏱️ (l. 319) : une montre connectée reste une montre connectée.
  [/(?<![\p{L}\p{N}])cadrans?(?![\p{L}\p{N}])|remontoir|montre.?bracelet|bracelet.?(?:de.?)?montre|mouvements?.?(?:[àa].?)?(?:quartz|automatique|m[ée]canique|manuel)|verre.?(?:saphir|min[ée]ral|hardlex)|lunette.?(?:rotative|tournante)|[ée]tanche.?\d+\s?(?:m|atm|bars?)(?![\p{L}\p{N}])|g.?shock|(?<![\p{L}\p{N}])(?:seiko|tissot|festina|longines)(?![\p{L}\p{N}])/iu, '⌚'],
  // Lunettes RESSERRÉE (même bug G-Shock) : « lunette » au singulier nu est
  // bien plus souvent une lunette de montre (bezel), arrière (auto), de WC ou
  // astronomique que des solaires — on exige le pluriel nu, « lunette(s) de
  // soleil/vue », le nom pluriel « solaires », ou l'anglais. « solaire »
  // singulier (crème/panneau/montre solaire) ne route plus vers les lunettes.
  [/(?<![\p{L}\p{N}])lunettes(?![\p{L}\p{N}])|lunettes?.?de.?(?:soleil|vue)|(?<![\p{L}\p{N}])solaires(?![\p{L}\p{N}])|sunglass/iu, '🕶️'],
  // /bague/ sans frontière matchait « BAGUEtte ».
  [/bijou|collier|bracelet|(?<![\p{L}\p{N}])bagues?(?![\p{L}\p{N}])|boucle.?d.?oreille|pendentif|broche/iu, '💍'],
  // Accessoires ajoutés le 2026-07-09 (backlog T3) — feuilles Vinted réelles.
  [/ceinture(?!.{0,10}(?:lombaire|à.?outils|de.?sécurité))/i, '🪢'],
  [/parapluie|ombrelle/i, '☂️'],
  [/porte.?cl[ée]s?\b/i, '🗝️'],
  // Mobilité électrique AVANT High-Tech : « trottinette Xiaomi » ne doit pas
  // matcher 📱 sur la marque (Xiaomi fait trottinettes ET téléphones). L'objet prime.
  [/trottinette|hoverboard|gyroroue|monoroue/i, '🛴'],
  // High-Tech
  [/iphone|smartphone|téléphone|galaxy|\bpixel\b|xiaomi|oneplus/i, '📱'],
  [/carte.?graphique|carte.?m[èe]re|\bgpu\b|\brtx\b|geforce|radeon|\bcpu\b|barrette.?ram/i, '🖥️'],  // composants PC : "carte" seul → 🏆 Collection (bug)
  [/macbook|laptop|ordinateur.?portable|notebook|chromebook/i, '💻'],
  [/\bpc\b|imac|ordinateur|écran|moniteur/i, '🖥️'],
  // 📲 scindé de 📱 (2026-07-09, T4) : feuille dédiée Électronique >
  // Tablettes, liseuses et accessoires > Tablettes.
  [/tablette(?!.{0,4}de.?chocolat)|ipad|galaxy.?tab/i, '📲'],
  [/écouteur|airpods?|earbud|casque|headphone/i, '🎧'],
  // « femme enceinte » (grossesse/allaitement) n'est pas un haut-parleur ;
  // console d'entrée = meuble, console de mixage = audio ; switch réseau =
  // équipement informatique, pas une Nintendo (audit 2026-07-19).
  [/(?<!femmes?\s)enceinte|haut.?parleur|speaker|barre.?de.?son|soundbar/i, '🔊'],
  [/console(?!s?\s*(?:de\s*mixage|d['’]entrée|murale|extensible))|playstation|\bps[2-5]\b|xbox|nintendo|switch(?!\s*(?:réseau|ethernet|rj45|tp.?link|netgear|poe|gigabit|\d+\s*ports))|game.?boy|manette|jeu.?vidéo/i, '🎮'],
  // télé(?![a-zà-ÿ]) et non télé\b : \b est ASCII-only en JS, donc "télé"
  // suivi d'une lettre matchait quand même ("télécommande" → Téléviseurs).
  [/meuble.?(?:tv|t[ée]l[ée]|hi.?fi)/i, '🛋️'],  // meuble TV = mobilier, pas un téléviseur
  [/veilleuse/i, '📦'],  // veilleuse bébé (souvent "projecteur étoiles") ≠ vidéoprojecteur, avant 📺
  [/\btv\b|télé(?![a-zà-ÿ])|téléviseur|télévision|projecteur|vidéoprojecteur/i, '📺'],
  // objectif : singulier seulement, hors tournures figurées (« vos objectifs
  // fitness », « objectif de remise en forme » — prose IA courante) ; un
  // objectif photo se vend au singulier avec marque/focale (audit 2026-07-19).
  [/appareil.?photo|caméra|camera|reflex|gopro|objectif(?!s\b)(?!\s*(?:de\s|d['’]|:|minceur|fitness|sportif))|caméscope/i, '📷'],
  [/drone/i, '🛸'],
  [/imprimante|scanner/i, '🖨️'],
  [/clavier/i, '⌨️'],
  [/souris/i, '🖱️'],
  // Maison
  [/canapé|sofa|fauteuil|banquette|pouf/i, '🛋️'],
  [/banc.?(?:de.?)?(?:muscu|gym|fitness|abdo|développé)|banc.?à.?charge|presse.?(?:à.?)?cuisse/i, '🏋️'],  // banc de muscu = sport, pas une chaise, avant 🪑
  [/chaise|tabouret|\bbanc\b/i, '🪑'],
  [/\blit\b|matelas|sommier|couette|\bdrap\b|parure/i, '🛏️'],
  // `ampoule` BORNÉ À GAUCHE (2026-08-11) : sans borne il matche « Têtampoule »
  // (nom de Pokémon) — même famille de bug que « mascara » dans « Mascarade ».
  [/lampe|luminaire|applique|suspension|lampadaire|(?<![\p{L}\p{N}])ampoules?|\bled\b|guirlande(?!.{0,14}(?:de.?)?(?:sapin|noël|noel))/iu, '💡'],
  [/miroir/i, '🪞'],
  [/bougie(?!s?\s*(?:d['’]allumage|de\s*préchauffage))|photophore/i, '🕯️'],  // bougie d'allumage = pièce auto (audit 2026-07-19)
  // ŒUVRES (2026-08-13, jobs jocaille) : « Peinture à l'huile ancienne »,
  // « Toile huile vintage 1959 », « Gravure couleur Hebbelinck » partaient en
  // 🖌️ (règle `peinture` plus bas) → LBC Bricolage (outils, Produit quasi
  // sans option) au lieu de Décoration. L'œuvre d'art se reconnaît AVANT
  // l'outil — cette règle précède 🖌️ dans la liste (premier match gagne).
  // « toile » seul reste hors règle (toile de tente, toile cirée) : borné aux
  // formes « toile huile/peinte », « huile sur toile/panneau/carton ».
  [/cadres?\b(?!\s*(?:de\s*)?(?:vélo|vtt|route\b|carbone|alu\b|lit\b))|tableau(?!.?électrique)|poster|affiche|gravures?\b|lithographies?\b|estampes?\b|aquarelles?\b|toiles?\s+(?:huile|peinte)|huile\s+sur\s+(?:toile|panneau|carton)|peintures?\s+à\s+l['’]huile/i, '🖼️'],  // cadre de vélo/lit ≠ cadre déco (audit 2026-07-19)
  [/plante|cache.?pot|jardinière/i, '🪴'],
  [/vase\b/i, '🏺'],
  [/assiette|\bbol\b|tasse|\bmug\b|verres?\b(?!\s*tremp)|carafe|vaisselle/i, '🍽️'],  // verre trempé = protection d'écran (audit 2026-07-19)
  [/casserole|poêle(?!s?\s*à\s*(?:bois|granulés?|pétrole))|cocotte|marmite|ustensile/i, '🍳'],  // poêle à bois/granulés = chauffage (audit 2026-07-19)
  // SCULPTURES (2026-08-13, jobs jocaille — « Ancien buste de cardinal en
  // plâtre polychrome signé E. Mélange », 2 échecs lbcCategoryPath absent) :
  // aucun mot de la statuaire n'était couvert. Même famille que les ŒUVRES
  // (règle 🖼️ plus haut) : l'objet d'art se reconnaît AVANT l'outil 🖌️
  // (plus bas). Placée APRÈS 🪴/🏺/🍽️/🍳 : les matières nues (bronze, terre
  // cuite) ne volent pas leurs objets aux règles voisines — « vase en terre
  // cuite » reste un vase, « cocotte en terre cuite » une cocotte.
  // « plâtre » nu volontairement ABSENT (sac de plâtre = matériau bricolage,
  // et « Sac de plâtre » matcherait 👜 avant nous de toute façon) : la phrase
  // « plâtre polychrome » suffit, les bustes/statues portent leur propre mot.
  // « buste de couture » exclu (mannequin de couturière ≠ sculpture) et
  // usage ANATOMIQUE gardé (diff base 2026-08-13 : « coupe ajustée au
  // buste », « tour de buste », « buste smocké » — prose vêtement courante,
  // une combinaison partait en 🖼️) : pas de « au/du/de » devant, pas de
  // smocké/ajusté/cintré/élastiqué derrière.
  // « bronze » borné Unicode (ne matche ni « bronzer » ni « bronzage »).
  [/(?<!\b(?:au|du|de)\s)bustes?\b(?!\s*de\s*couture)(?!\s+(?:smock|ajust|cintr|élastiqu))|statues?\b|statuettes?\b|sculptures?\b|pl[âa]tres?\s+polychromes?\b|(?<![\p{L}\p{N}])bronzes?(?![\p{L}\p{N}])|terres?\s+cuites?\b|santons?\b/iu, '🖼️'],
  // Maison — textiles/déco/papeterie/animaux/fêtes (2026-07-09, backlog T3) :
  // toutes ces branches existent réellement (Maison > Textiles/Décoration/
  // Fournitures de bureau/Animaux/Célébrations et fêtes — arbre archivé).
  [/rideau|voilage|\bstores?\b/i, '🪟'],
  [/coussin(?!.{0,14}(?:allaitement|grossesse))|plaid\b|jeté.?de.?(?:lit|canapé)/i, '🪶'],
  [/\btapis\b(?!.?(?:de.?)?(?:course|yoga|souris|selle|sol|éveil|bain|jeu))/i, '🟫'],
  [/nappe\b|napperon|linge.?de.?table/i, '📜'],
  [/horloge|pendule\b|réveil/i, '🕰️'],
  [/no[eë]l|guirlande.?de.?sapin|boule.?de.?sapin|crèche\b/i, '🎄'],
  [/stylo|papeterie|carnet|bloc.?notes?|surligneur|crayon(?!.{0,12}(?:lèvres|yeux|sourcils))|calculatrice|agenda\b|trousse(?!.{0,4}(?:de.?toilette|à.?maquillage))/i, '🖋️'],
  // Électroménager
  [/bouilloire|théière/i, '🫖'],
  [/aspirateur|roomba|nettoyeur.?vapeur/i, '🧹'],
  [/frigo|réfrigérateur|congélateur/i, '🧊'],
  [/\bfour\b|micro.?onde/i, '♨️'],
  [/mixeur|blender|robot.?(?:cuisine|pâtissier)|thermomix|batteur.?électrique/i, '🥣'],
  [/grille.?pain|toaster/i, '🍞'],
  [/friteuse|airfryer/i, '🍟'],
  // ⚠️ Appareils coiffants ÉLARGIS à leurs ACCESSOIRES + marques + anglais
  // (2026-07-19, bug Dyson Airwrap : « Soft Smoothing Brush Attachment »,
  // desc « brosse lissante … soin optimal des cheveux » → 🧴 Soins de la
  // peau via \bsoin\b — un embout d'appareil de coiffure n'est pas un
  // produit de soin, référentiel skincare absurde sur les 4 plateformes).
  // 3e bug de la classe « mot générique capté par la mauvaise règle » après
  // Parfum/Soins et Lunettes/Montre. Les titres importés ne disent ni
  // « sèche-cheveux » ni « lisseur » : marques (airwrap, ghd, babyliss) et
  // équivalents anglais requis.
  [/sèche.?cheveux|lisseur|boucleur|airwrap|supersonic|multi.?styler|\bstylers?\b|brosses?.?(?:soufflante|lissante|chauffante|rotative|coiffante)|fers?.?à.?(?:lisser|boucler|friser)|babyliss|\bghd\b|hair.?(?:dryer|straightener|curler)|straightener|curling.?(?:iron|wand)|hot.?(?:air.?)?brush/i, '💇'],
  // Climatisation / chauffage d'appoint (2026-07-09) : feuilles réelles sous
  // Maison > Entretien de la maison > Chauffage, climatisation et ventilation.
  [/ventilateur|climatiseur|purificateur.?d.?air|humidificateur|déshumidificateur/i, '🌀'],
  [/radiateur|chauffage.?d.?appoint|convecteur|bain.?d.?huile/i, '🌡️'],
  // Bricolage
  [/perceuse|visseuse|tournevis|perforateur/i, '🪛'],
  [/\bscies?\b|tronçonneuse|élagueuse/i, '🪚'],
  [/marteau|maillet|\bmasses?\b(?!\s*(?:musculaire|corporelle|graisseuse))/i, '🔨'],  // « masse musculaire » = prose fitness (audit 2026-07-19)
  [/échelle(?!s?\s*(?:1\s*[:/]\s*\d|\d|réduite))|escabeau/i, '🪜'],  // « échelle 1:18 » = miniature/maquette (audit 2026-07-19)
  // \b obligatoire avant l'exclusion : sans lui, « pinceaux de maquillage »
  // re-matchait par backtracking sur « pinceau » nu (le lookahead ne voyait
  // que « x de maquillage »).
  [/peinture|rouleau.?peinture|pinceaux?\b(?!\s*(?:de\s*|à\s*)?(?:maquillage|makeup|teint|blush|poudre))/i, '🖌️'],  // pinceau de maquillage = Beauté (audit 2026-07-19)
  [/\bvis\b|boulon|cheville|clou\b/i, '🔩'],
  [/mètre.?ruban|niveau.?(?:laser|à.?bulle)/i, '📏'],
  // pinces? borné (audit 2026-07-19) : « pince » matchait DANS « pinceaux » —
  // bug latent révélé par l'exclusion maquillage de 🖌️ juste au-dessus.
  [/clé.?(?:plate|allen|molette|mixte|dynamométrique)|pinces?(?![\p{L}\p{N}])|étau|serre.?joint/iu, '🔧'],
  // Jardin
  [/tondeuse|débroussailleuse|scarificateur/i, '🌱'],
  [/taille.?haie|sécateur|cisaille/i, '✂️'],
  [/barbecue|plancha|\bbbq\b/i, '🔥'],
  [/salon.?de.?jardin|parasol|transat(?!.{0,10}(?:b[ée]b[ée]|enfant|nouveau))/i, '⛱️'],  // transat BÉBÉ exclu → tombe au filet plutôt que Parasols (jardin)
  // Sport
  [/\bvélos?\b|\bvtt\b|bicyclette/i, '🚲'],
  [/trottinette/i, '🛴'],
  [/skate|longboard/i, '🛹'],
  [/roller|\bpatins?(?![a-zà-ÿ])/i, '⛸️'],  // \b ASCII : "patinée" (é) forçait un match → garde accents
  [/\bskis?\b|snowboard/i, '🎿'],
  [/\bgourde\b|bidon.?(?:sport|vélo)|bouteille.?(?:isotherme|inox|sport)/i, '📦'],  // gourde ≠ ballon (défaut Sport ⚽), pas de feuille dédiée → filet
  [/ballon|football/i, '⚽'],
  [/tennis|raquette|badminton|squash/i, '🎾'],
  [/golf(?!\s*(?:gti|tdi|tsi|gtd|\d|plus|r32|variant|sportsvan))/i, '⛳'],
  [/haltère|kettlebell|musculation|fitness/i, '🏋️'],
  [/boxe|\bmma\b/i, '🥊'],
  [/tente|camping|sac.?de.?couchage|duvet/i, '⛺'],
  [/pêche|moulinet|waders/i, '🎣'],
  [/yoga|pilates/i, '🧘'],
  // Auto-Moto
  [/moto\b/i, '🏍️'],
  [/scooter/i, '🛵'],
  [/pneu|jante|\broue\b/i, '🛞'],
  [/voiture|automobile|autoradio|pare.?choc|rétroviseur/i, '🚗'],
  // Beauté
  [/parfum|eau.?de.?(?:toilette|parfum)|cologne/i, '🌸'],
  // « palette de couleurs » = prose IA omniprésente (vêtements, déco…), pas
  // une palette de fards (audit 2026-07-19).
  // ⚠️ `mascara` BORNÉ (2026-08-11). Sans borne il matchait « MASCARADE » :
  // 165 lignes / 108 titres de cartes Pokémon de l'extension « Mascarade
  // Crépusculaire » partaient en 💄 Maquillage, donc en Divers > Autres sur
  // Leboncoin et dans les rayons beauté des trois autres plateformes. Borne
  // UNICODE et pas \b : \b est ASCII-only, il ne ferme rien après une lettre
  // accentuée (même piège que « parfum » dans « parfumée »).
  [/rouge.?à.?lèvre|gloss|lipstick|mascaras?(?![\p{L}\p{N}])|palettes?\b(?!\s*(?:de\s*)?couleurs?\b)|fard|eyeliner|fond.?de.?teint|blush|maquillage/iu, '💄'],
  [/vernis|manucure/i, '💅'],
  // ⚠️ \bsoin\b nu SUPPRIMÉ (2026-07-19, bug Dyson Airwrap) : « pour un soin
  // optimal des cheveux/du linge/de vos sols » est une tournure IA générique
  // qui routait n'importe quel accessoire en Soins de la peau. Le soin ne
  // compte plus que CONTEXTUALISÉ peau/visage/corps ; un vrai produit a de
  // toute façon crème/sérum/lotion/masque dans sa copie.
  [/crème|sérum|lotion|shampooing|gel.?douche|savon|soins?\s+(?:de\s+la\s+peau|du\s+visage|du\s+corps|des\s+mains|hydratants?|anti.?[âa]ges?|anti.?rides|visage|corps)/i, '🧴'],
  // Couverture élargie (2026-07-18, bug Medik8) : huile et masque exigent un
  // CONTEXTE beauté (une huile moteur, un masque de ski/plongée/carnaval ne
  // doivent pas router ici) ; le reste est sans ambiguïté. Équivalents anglais
  // pour les titres importés (« Crystal Retinal 6 Serum ») que les regex FR ne
  // voyaient pas — ils tombaient au défaut type, jusqu'ici 💄 Rouges à lèvres.
  [/huiles?\s+(?:pour\s+)?(?:l[ea]s?\s+)?(?:visage|corps|cheveux|barbe|s[èe]che|démaquillante|essentielle|de\s*massage)/i, '🧴'],
  [/masques?\s+(?:pour\s+)?(?:l[ea]s?\s+)?(?:visage|corps|cheveux|capillaire|hydratant|purifiant|exfoliant|de\s*nuit|en\s*tissu|à\s*l.argile)/i, '🧴'],
  [/déodorant|gommage|exfoliant|démaquillant|\btoniques?\b|\bbaumes?\b|après.?rasage|contour.?des.?yeux|\bserums?\b|\bcreams?\b|moisturi[sz]ers?|cleanser/i, '🧴'],
  // Musique
  [/guitare|stratocaster|telecaster|les.?paul|ukulélé/i, '🎸'],
  [/violon|violoncelle|contrebasse/i, '🎻'],
  // Exclusions élargies (audit 2026-07-19) : batteries d'appareils (téléphone,
  // outil, lithium, mAh) — seuls les fûts restent des instruments.
  [/batterie(?!.{0,15}(?:voiture|moto|vélo|externe|cuisine|téléphone|smartphone|iphone|ordinateur|pc\b|portable|perceuse|outil|lithium|li.?ion|rechargeable|\d+\s*mah))|cymbale|caisse.?claire/i, '🥁'],
  [/trompette|saxophone|clarinette|flûte(?!s?\s*(?:à\s*)?champagne)/i, '🎺'],
  [/(?<!sol\s)(?<!stickers?\s)(?<!autocollants?\s)vinyle?s?\b(?!\s*(?:adhésifs?|autocollants?))|platine|33.?tours|45.?tours/i, '💿'],  // sol/sticker vinyle = revêtement, pas un disque (audit 2026-07-19)
  // Médias physiques (2026-07-09, backlog T3) : Divertissement > Vidéo (DVD/
  // Blu-ray/VHS) et > Musique (CD/Cassettes audio) — 📀 AVANT 💽 pour que
  // "cassette vidéo" parte en Vidéo, "cassette" seule = audio par défaut.
  [/\bdvd\b|blu.?ray|\bvhs\b|cassette.?vidéo|laserdisc/i, '📀'],
  [/\bcd\b|\bk7\b|cassette|minidisc/i, '💽'],
  [/harmonica/i, '🎼'],
  [/micro(?:phone)?\b(?![\s-]*(?:sd\b|usb|hdmi|ondes?))/i, '🎤'],  // micro SD/USB/-ondes ≠ microphone (audit 2026-07-19)
  // Jouets
  // `lego` BORNÉ (2026-08-11) : sans borne il matche « GaLEGOn » (nom de
  // Pokémon) — troisième cas de la même famille que « mascara »/« ampoule ».
  [/(?<![\p{L}\p{N}])legos?(?![\p{L}\p{N}])|duplo|kapla|jeu.?de.?construction/iu, '🧱'],
  // (peluche/doudou : remontée en tête des désambiguïsations — cf. « peluche
  // souris » qui partait en 🖱️ Souris d'ordinateur.)
  [/poupée|barbie|poupon/i, '🪆'],
  [/puzzle/i, '🧩'],
  // playmobil : aucune feuille Vinted dédiée (0 hit dans l'arbre, vérifié
  // 2026-07-09) — rangé avec les figurines ("Sets de jeux" = feuille sœur).
  [/figurine|funko|playmobil/i, '🦸'],
  // Livres
  [/manga|\bbd\b|bande.?dessinée|comics/i, '📖'],
  [/livre|romans?(?![\p{L}\p{N}])|encyclopédie|dictionnaire/iu, '📚'],  // « romantique » contenait roman (audit 2026-07-19)
  [/magazine|revue\b/i, '📰'],
  // Collection
  // ── Cartes à collectionner (2026-08-11) ───────────────────────────────────
  // INDISSOCIABLE de la borne posée sur `mascara` juste au-dessus : sans cette
  // règle, les 108 titres « Mascarade Crépusculaire » libérés de 💄 tombent sur
  // 📦 (leur `type` est null, donc aucun défaut de catégorie ne les rattrape) —
  // et 📦 vaut null sur les QUATRE plateformes. Ils passeraient de « mal
  // classés mais publiables partout » à « publiables nulle part ».
  // 🃏 est déjà mappé partout, et c'est le bon rayon : Vinted « Cartes à
  // collectionner à l'unité », LBC « Loisirs > Collection », eBay « JCC :
  // cartes à l'unité » (183454), Beebs « Cartes Pokémon à l'unité ».
  // ⚠️ PLACÉE APRÈS Jouets/Livres à dessein : « peluche Pokémon » doit rester
  // 🧸 et « figurine Pokémon » 🦸 — leurs règles matchent avant celle-ci.
  // ⚠️ La règle 🃏 existante (bloc désambiguïsation, plus haut) exige le MOT
  // « carte » ou « booster » — ces titres-là n'ont ni l'un ni l'autre :
  // « Stalgamin 051/167 - Mascarade Crépusculaire EV06 - TWM FR ». Ce qui les
  // identifie, c'est le NUMÉRO DE CARTE (051/167) accompagné d'un marqueur de
  // collection (Reverse, Holo, Promo, ou un code d'extension type EV06).
  // Les DEUX sont exigés : seul, « 128/256 » est une capacité de stockage,
  // « 205/55 » une taille de pneu, « 16/9 » un format d'image.
  [/cartes?\s+(?:à\s+)?collectionner|\bjcc\b|trading\s+cards?|\btcg\b|yu.?gi.?oh|magic.{0,15}gathering|\bmtg\b|(?=[\s\S]*\b\d{1,3}\s*\/\s*\d{2,3}\b)(?=[\s\S]*(?:holo(?:graphique)?|reverse|promo|booster|psa\s*\d|pok[ée]mon|\b(?:ev|sv|xy|sm|swsh|bw|dp)\d{1,2}\b))/iu, '🃏'],
  [/timbre/i, '📮'],
  [/monnaie|numismat|pièce.?de.?monnaie/i, '🪙'],
  // Puériculture — scindée en 4 icônes (juillet 2026) : l'ancienne 👶 unique
  // conflatait poussette/siège auto/biberon/babyphone, quatre branches
  // catalogue différentes sur les 3 plateformes (un babyphone partait en
  // "Poussettes"). ⚠️ Conflations puériculture RESTANTES, hors de ces regex :
  // "transat" (bébé) part sur ⛱️ salon de jardin, "chaise haute" sur 🪑
  // chaise, "lit parapluie" sur 🛏️ lit — à scinder si le volume le justifie.
  [/poussette|landaus?\b/i, '👶'],
  [/siège.?auto/i, '💺'],
  [/biberon/i, '🍼'],
  [/babyphone|baby.?phone|écoute.?bébé/i, '📟'],
  // ── DERNIER RECOURS : numéro de carte seul (2026-08-11) ───────────────────
  // Placée en TOUTE FIN de liste, donc atteinte UNIQUEMENT si aucune autre
  // règle n'a reconnu l'objet. Un « 205/55 » de pneu, un « 128/256 » de
  // stockage, un « 16/9 » d'écran sont déjà captés plus haut par leur propre
  // mot-clé ; ce qui arrive ici avec un numéro de la forme NN/NNN et rien
  // d'autre de reconnaissable est, en pratique, une carte à collectionner.
  // Cas qui l'exige : « Galegon 53/123 Diamant & Perle : Trésors Mystérieux »
  // — aucun marqueur (ni Reverse, ni Holo, ni code d'extension), et sans cette
  // règle il tombe sur 📦, injouable sur les quatre plateformes.
  [/(?<![\p{L}\p{N}/.,])\d{1,3}\s*\/\s*\d{2,3}(?![\p{L}\p{N}/.,])/u, '🃏'],
];
// Icône par défaut si aucun mot-clé ne matche : celle de la catégorie.
const CAT_DEFAULT_ICONS = {
  'Mode':'👗','Luxe':'💎','High-Tech':'📱','Maison':'🏠','Électroménager':'⚡',
  // Beauté : 🧴 Soins et non 💄 (2026-07-18) — un produit beauté SANS mot-clé
  // (déo importé, titre anglais inconnu) partait en « Rouges à lèvres » eBay
  // (31804, Teinte obligatoire) ; Soins de la peau est le défaut le moins faux.
  'Jouets':'🧸','Livres':'📚','Sport':'⚽','Auto-Moto':'🚗','Beauté':'🧴',
  'Musique':'🎵','Collection':'🏆','Multimédia':'📺','Jardin':'🌿','Bricolage':'🔧','Autre':'📦',
};
// Accessoires fréquemment INCLUS avec un appareil principal — leur simple
// mention ne doit pas reclasser l'objet (« Nintendo Switch avec dock » reste
// une console, pas un 🔌 « Batteries externes » ; bug réel 2026-07-16, une
// console partait en cross-post dans la mauvaise catégorie). On retire les
// clauses d'INCLUSION (« avec … dock », « + … câble », « livré avec … housse »)
// AVANT la détection : l'objet PRINCIPAL pilote alors l'icône. Un accessoire
// vendu SEUL (« Chargeur iPhone », « Dock USB-C ») n'a pas de marqueur
// d'inclusion → sa mention reste → il est classé 🔌 comme avant.
// ⚠️ MARQUEURS SYMBOLES HORS \b (fix 2026-07-17) : « + » et « & » sont des
// caractères NON-WORD ; entourés d'espaces (« blanc + dock »), un \b autour
// d'eux ne matche jamais → la clause « + dock » n'était pas retirée et une
// console « Switch OLED blanc + dock » repartait en 🔌 (bug réel re-test dock).
// On sépare donc les marqueurs MOTS (bornés par \b) des marqueurs SYMBOLES
// (`[+&]`, sans \b). Constaté aussi sur « Casque Bose & câble » → 🔌.
const INCLUDED_ACCESSORY_CLAUSE =
  /(?:\b(?:avec|with|inclus|incluse?s?|livré[e]?s?\s+avec|comprend|comprenant|accompagné[e]?\s+de|fourni[e]?s?\s+avec)\b|[+&])\s*[^,.;:!?]*?\b(?:dock|chargeur|c[âa]ble|adaptateur|hub|manette|joy-?con|housse|[ée]tui|coque|protection|support|sacoche|pochette)\b[^,.;:!?]*/gi;

// Mentions NÉGATIVES de fragrance (bug réel Medik8 2026-07-19) : « sans
// parfum » dans la description d'un SÉRUM matchait la règle 🌸 Parfums —
// prioritaire sur 🧴 dans OBJECT_ICON_RULES — et l'item entier partait en
// Parfums sur les plateformes (eBay : Type Eau de parfum/Volume/Nom de parfum
// obligatoires). Retirées AVANT détection, même philosophie que
// INCLUDED_ACCESSORY_CLAUSE : on enlève le bruit, l'objet principal pilote.
const FRAGRANCE_NEGATION =
  /(?:\bsans\b|\b0\s*%)\s*parfum\b|\bnon\s+parfum[ée]e?s?\b|fragrance[-\s]?free|unscented/gi;

// Détection par MOT-CLÉ seule (les 2 passes d'OBJECT_ICON_RULES), SANS repli sur
// le défaut de catégorie : renvoie l'icône si un mot-objet explicite matche,
// sinon null. Extraite de detectObjectIcon (2026-07-21) pour que les appelants
// puissent distinguer « un vrai mot-clé a matché » (signal FIABLE, audité) d'un
// simple défaut de catégorie. Sert à la réconciliation icône IA ↔ mot-clé dans
// resolveArticleIcon (front) : un « hoodie/sweat » nommé dans le titre FR prime
// sur une estimation Haiku (category_icon) qui, elle, peut confondre 🧶 et 🧥.
export function detectObjectIconKeyword(titre, description){
  // Dé-bruitage : accessoires inclus + négations de fragrance.
  const denoise=(s)=>String(s||'')
    .replace(INCLUDED_ACCESSORY_CLAUSE,' ')
    .replace(FRAGRANCE_NEGATION,' ')
    .toLowerCase();
  // Passe 1 — le TITRE seul : c'est lui qui NOMME l'objet (même règle produit
  // que le ciblage par titre des pages de liste). Sans cette passe, un mot-clé
  // de la DESCRIPTION porté par une règle plus haute dans OBJECT_ICON_RULES
  // vole l'icône à l'objet du titre : « Sérum anti-rides » + description
  // « …parfum délicat » partait en 🌸 Parfums (l'ordre des règles fait la
  // priorité, pas la position du mot dans le texte).
  const tTitre=denoise(titre);
  for(const [re,icon] of OBJECT_ICON_RULES){ if(re.test(tTitre)) return icon; }
  // Passe 2 — titre + description (comportement historique, filet pour les
  // titres sans mot-objet : « Medik8 Crystal Retinal 6 » + desc « crème… »).
  const t=denoise((titre||'')+' '+(description||''));
  for(const [re,icon] of OBJECT_ICON_RULES){ if(re.test(t)) return icon; }
  return null;
}

export function detectObjectIcon(titre, description, type){
  // Mot-clé explicite d'abord (les 2 passes) — comportement historique intact.
  const kw = detectObjectIconKeyword(titre, description);
  if(kw) return kw;
  // ⚠️ FILET « Luxe » (2026-07-17) : la catégorie Luxe est supprimée, mais des
  // items LEGACY (ou une IA pas encore redéployée) peuvent encore porter
  // type="Luxe" → 💎 non mappé = injouable. On ré-dérive alors le VRAI type
  // produit (detectType) pour retomber sur une catégorie mappée : un sac/une
  // montre de luxe redeviennent Mode, un parfum Beauté. (Les items AVEC un
  // mot-objet ont déjà été résolus par les règles ci-dessus.)
  let effectiveType = type;
  if(String(type).toLowerCase()==='luxe') effectiveType = detectType(titre, description);
  if(CAT_DEFAULT_ICONS[effectiveType]) return CAT_DEFAULT_ICONS[effectiveType];
  const key=Object.keys(CAT_DEFAULT_ICONS).find(k=>k.toLowerCase()===(effectiveType||"").toLowerCase());
  return key?CAT_DEFAULT_ICONS[key]:CAT_DEFAULT_ICONS['Autre'];
}

// Liste PLATE et dédupliquée de TOUTES les icônes objet que le système
// reconnaît : les icônes d'OBJECT_ICON_RULES + les défauts par catégorie
// (CAT_DEFAULT_ICONS). UNIQUE enum autorisé pour toute source EXTERNE
// d'icône — en particulier le category_icon que generate-listing peut
// désormais renvoyer : une valeur hors de cette liste est rejetée et l'on
// retombe silencieusement sur detectObjectIcon. detectObjectIcon lui-même
// reste INCHANGÉ et reste le filet de secours ; cette constante ne fait que
// l'exposer, elle ne modifie aucun comportement de détection.
export const ALL_OBJECT_ICONS = [
  ...new Set([
    ...OBJECT_ICON_RULES.map(r => r[1]),
    ...Object.values(CAT_DEFAULT_ICONS),
  ]),
];

// LÉGENDE des icônes objet — sens en clair de CHAQUE emoji (2026-07-21).
// Pourquoi : quand une source EXTERNE classe un article en choisissant une
// icône (le category_icon renvoyé par le micro-appel Haiku de generate-listing),
// elle ne reçoit qu'une liste d'emojis nus. Or beaucoup d'emojis sont des proxys
// contre-intuitifs : 🧶 (pelote de laine) = pull/sweat/HOODIE, 🥼 (blouse de
// labo) = blazer, 🪢 (nœud) = ceinture… Un « hoodie Patagonia » partait alors en
// 🧥 (manteau) → catégorie eBay « Manteaux, vestes » et Vinted « Doudounes »
// (bug réel 2026-07-21). On fournit donc le SENS de chaque icône au classifieur.
// Invariant : toute icône d'ALL_OBJECT_ICONS DEVRAIT avoir une entrée ici ; une
// icône sans légende reste utilisable (le prompt retombe sur l'emoji seul), mais
// perd la désambiguïsation — à compléter si on ajoute une icône.
export const ICON_LEGEND = {
  // Vêtements — le cœur des confusions (l'ordre de résolution compte aussi)
  "🧥": "manteau, veste, blouson, parka, doudoune, polaire, combinaison de ski",
  "🧶": "pull, sweat, sweat à capuche (hoodie), cardigan, gilet en maille",
  "🥼": "blazer, veste de tailleur",
  "🤵": "costume, smoking",
  "👔": "chemise, blouse",
  "👕": "t-shirt, débardeur, polo, maillot de sport",
  "👗": "robe, jupe",
  "🩳": "short, bermuda",
  "👖": "pantalon, jean, jogging, legging, chino, salopette, survêtement",
  "🩲": "sous-vêtements, lingerie, pyjama",
  "🧦": "chaussettes, collants",
  "🧣": "écharpe, foulard, châle",
  "🧤": "gants, moufles, mitaines",
  "🧢": "casquette, chapeau, bonnet, béret",
  "👙": "maillot de bain, bikini",
  "🎭": "déguisement, panoplie, costume de déguisement",
  // Chaussures
  "👟": "baskets, sneakers, chaussures de ville",
  "👢": "bottes, bottines",
  "👠": "chaussures à talons, escarpins, ballerines",
  "🩴": "sandales, tongs, claquettes, mules",
  "🥿": "chaussons, pantoufles",
  // Sacs & accessoires
  "👜": "sac à main, sac, pochette, cabas, besace",
  "🎒": "sac à dos, cartable",
  "🎽": "sac de sport",
  "👝": "sac banane, pochette de ceinture",
  "👛": "portefeuille, porte-monnaie, porte-cartes",
  "🧳": "valise, bagage",
  "⌚": "montre à aiguilles (analogique, mécanique)",
  "⏱️": "montre connectée, smartwatch",
  "🕶️": "lunettes de soleil ou de vue",
  "💍": "bijou : collier, bracelet, bague, boucles d'oreilles, pendentif",
  "🪢": "ceinture",
  "☂️": "parapluie, ombrelle",
  "🗝️": "porte-clés",
  "🎀": "cravate, nœud papillon",
  // High-Tech
  "📱": "smartphone, téléphone portable",
  "📲": "tablette (iPad, Galaxy Tab)",
  "💻": "ordinateur portable (MacBook, laptop)",
  "🖥️": "ordinateur fixe, écran, composant PC (carte graphique, CPU, RAM)",
  "⌨️": "clavier d'ordinateur",
  "🖱️": "souris d'ordinateur",
  "🎧": "écouteurs, casque audio, AirPods",
  "🔊": "enceinte, haut-parleur, barre de son",
  "📡": "enceinte connectée, assistant vocal (Alexa, Google Home)",
  "🎮": "console de jeu, manette (PlayStation, Xbox, Nintendo Switch)",
  "📷": "appareil photo, caméra, objectif, GoPro",
  "🛸": "drone",
  "🖨️": "imprimante, scanner",
  "📺": "téléviseur, vidéoprojecteur",
  "📇": "liseuse (Kindle, Kobo)",
  "🔌": "chargeur, câble, batterie externe, adaptateur",
  // Électroménager & maison-cuisine
  "🧺": "gros lavage : machine à laver, lave-vaisselle, sèche-linge",
  "☕": "machine à café, cafetière",
  "🫖": "bouilloire, théière",
  "🧹": "aspirateur, nettoyeur vapeur",
  "🧊": "réfrigérateur, congélateur",
  "♨️": "four, micro-ondes",
  "🥣": "mixeur, blender, robot pâtissier",
  "🍞": "grille-pain",
  "🍟": "friteuse, airfryer",
  "💇": "sèche-cheveux, lisseur, boucleur, brosse soufflante",
  "🌀": "ventilateur, climatiseur, purificateur d'air",
  "🌡️": "radiateur, chauffage d'appoint",
  "🧼": "fer à repasser, défroisseur, centrale vapeur",
  "🧵": "machine à coudre, surjeteuse",
  // Maison / déco
  "🛋️": "canapé, fauteuil, meuble TV",
  "🪑": "chaise, tabouret, banc",
  "🛏️": "lit, matelas, sommier",
  "🛌": "linge de lit (housse de couette, drap, parure)",
  "💡": "lampe, luminaire, ampoule, guirlande lumineuse",
  "🪞": "miroir",
  "🕯️": "bougie, photophore",
  "🖼️": "cadre, tableau, poster, affiche, gravure, huile sur toile, buste, statue, sculpture, santon",
  "🪴": "plante, cache-pot, jardinière",
  "🏺": "vase",
  "🍽️": "vaisselle : assiette, bol, tasse, verre, mug",
  "🍳": "ustensile de cuisson : casserole, poêle, cocotte",
  "🪟": "rideau, voilage, store",
  "🪶": "coussin, plaid, jeté de canapé",
  "🟫": "tapis (décoration)",
  "📜": "nappe, linge de table",
  "🕰️": "horloge, pendule, réveil",
  "🎄": "décoration de Noël",
  "🖋️": "papeterie : stylo, carnet, calculatrice, agenda",
  // Bricolage / jardin
  "🪛": "perceuse, visseuse, tournevis",
  "🪚": "scie, tronçonneuse",
  "🔨": "marteau, maillet, masse",
  "🪜": "échelle, escabeau",
  "🖌️": "peinture, rouleau, pinceau de bricolage",
  "🔩": "visserie : vis, boulon, cheville, clou",
  "📏": "mètre ruban, niveau",
  "🔧": "outil à main : clé, pince, étau",
  "🌱": "tondeuse, débroussailleuse, scarificateur",
  "✂️": "taille-haie, sécateur, cisaille",
  "🔥": "barbecue, plancha",
  "⛱️": "salon de jardin, parasol, transat",
  // Sport & loisirs
  "🏀": "ballon de basket",
  "🏃": "cardio : tapis de course, vélo d'appartement, rameur",
  "🏋️": "musculation : haltères, kettlebell, banc",
  "🤿": "matériel de plongée : masque, tuba, palmes",
  "🏄": "glisse nautique : paddle, kayak, kitesurf, wakeboard",
  "🐴": "équitation",
  "🎱": "billard, pétanque, fléchettes, bowling",
  "🚲": "vélo, VTT, bicyclette",
  "🛹": "skate, longboard",
  "⛸️": "roller, patins",
  "🎿": "ski, snowboard",
  "⚽": "ballon, football",
  "🎾": "raquette : tennis, badminton, squash",
  "⛳": "golf",
  "🥊": "boxe, MMA",
  "⛺": "tente, camping, sac de couchage",
  "🎣": "pêche, moulinet",
  "🧘": "yoga, pilates",
  "🥽": "lunettes de natation",
  "⛑️": "casque de vélo ou de ski",
  "🪖": "casque de moto",
  "🛴": "trottinette, hoverboard, gyroroue",
  // Auto-moto
  "🏍️": "moto",
  "🛵": "scooter",
  "🛞": "pneu, jante, roue",
  "🚗": "voiture, pièce ou accessoire auto (autoradio, pare-choc)",
  "🏎️": "voiture miniature (Hot Wheels, Majorette)",
  "🚁": "objet télécommandé, voiture RC",
  // Beauté
  "🌸": "parfum, eau de toilette, cologne",
  "💄": "maquillage : rouge à lèvres, mascara, fond de teint, palette",
  "💅": "vernis, manucure",
  "🧴": "soin : crème, sérum, shampooing, gel douche, savon",
  "🪒": "rasoir, tondeuse à barbe, épilateur",
  // Musique
  "🎸": "guitare, ukulélé",
  "🎻": "violon, violoncelle, contrebasse",
  "🥁": "batterie (instrument de musique)",
  "🎺": "trompette, saxophone, clarinette, flûte",
  "🎹": "clavier, piano, synthétiseur",
  "🎼": "harmonica",
  "🎤": "microphone",
  "💿": "vinyle, platine",
  "📀": "DVD, Blu-ray, VHS",
  "💽": "CD, cassette audio",
  // Jouets / enfance
  "🧸": "peluche, doudou",
  "🧱": "briques de construction (Lego, Duplo, Kapla)",
  "🪆": "poupée, Barbie, poupon",
  "🧩": "puzzle",
  "🦸": "figurine, objet de collection (Funko, Playmobil)",
  "🃏": "cartes à collectionner (Pokémon, Magic, Yu-Gi-Oh)",
  "🎲": "jeu de société",
  "👶": "poussette, landau",
  "💺": "siège auto",
  "🍼": "biberon",
  "📟": "babyphone, écoute-bébé",
  "🚼": "puériculture chambre : lit parapluie, table à langer, berceau",
  "🐕": "accessoire pour animal : collier, gamelle, litière, laisse",
  // Livres & collection & divers
  "📖": "manga, BD, comics",
  "📚": "livre, roman, dictionnaire",
  "📰": "magazine, revue",
  "📮": "timbre de collection",
  "🪙": "pièce de monnaie (numismatique)",
  // Défauts de catégorie (aucun mot-objet précis)
  "💎": "article de luxe (défaut, aucun objet précis)",
  "🏠": "article pour la maison (défaut)",
  "⚡": "appareil électroménager (défaut)",
  "🎵": "article de musique (défaut)",
  "🏆": "objet de collection (défaut)",
  "🌿": "article de jardin (défaut)",
  "📦": "objet divers, non catégorisable",
};

// ── Design 2026 (Lens / navbar) : CSS des cards de liste (maquette validée).
// Partagé entre StockTab (.stock-v2) et VentesTab (.ventes-v2) — même tokens,
// même structure row [tuile | infos | droite], mêmes filtres à pastilles.
export function buildCardCss(scope){
  const s='.'+scope;
  return `
${s}{
  --canvas:#EDEAE0;
  --paper:#F6F5F1;
  --ink:#10201B;
  --teal:#2F9E90;
  --teal-deep:#1B6E62;
  --amber:#E8956D;
  --mute:#8A8578;
  --border:#E7E3D8;
  font-family:'Space Grotesk',sans-serif;
}
${s} .row{
  background:#fff;border-radius:16px;
  padding:11px 12px;border:1px solid var(--border);
  display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;
  position:relative;
}
${s} .row.in-swipe{padding:0;border:none;border-radius:0;background:transparent;flex:1;min-width:0;cursor:pointer;}
/* .edit-affordance (icône crayon) supprimée le 2026-07-14 : la carte entière est
   cliquable pour éditer, l'icône était redondante et se collait au prix. */
${s} .cat-tile{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
${Object.entries(CAT_TILE_COLORS).map(([type,color])=>`${s} .${catClass(type)}{background:${color};}`).join('\n')}
${s} .left{min-width:0;}
${s} .title-line{display:flex;align-items:center;gap:6px;}
/* TITRE : UNE ligne, police et taille d'origine (14.5px/700), tronque a la
   fin. La marque, elle, vit sous le titre (ligne meta) et reste toujours
   visible : c'est ce qui a ete gardé du chantier du 2026-08-05.
   ⛔ NE PAS repasser a 2 ou 3 lignes. Essaye ce jour-la pour rendre lisible
   la FIN du titre (elle distingue 15 articles de la meme marque) : a 390 px,
   un titre reel occupait 3 a 4 lignes et ecrasait le reste de la carte.
   Nico a tranche apres l'avoir vu sur iPhone. La lisibilite de ces articles
   sera reprise dans le design de l'extension, pas en grossissant le titre.
   ⚠️ Ce bloc a deja ete casse une fois : une fermeture de commentaire posee
   AU MILIEU du texte le fermait trop tot, le reste devenait du CSS invalide
   et le parseur AVALAIT la regle .title qui suit — le titre se retrouvait
   sans style du tout (d ou les 4 lignes constatees sur iPhone). Une seule
   fin de commentaire, et une seule, tout a la fin de ce bloc. */
${s} .title{font-weight:700;font-size:14.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0;}
${s} .brand-dot{width:3px;height:3px;border-radius:50%;background:var(--mute);opacity:.7;flex-shrink:0;}
${s} .brandname{font-size:12px;color:var(--mute);white-space:nowrap;flex:0 0 auto;}
${s} .qty-badge{font-size:11px;font-weight:700;color:var(--teal-deep);flex-shrink:0;}
/* La meta RETOURNE À LA LIGNE (2026-08-05) : elle porte désormais la marque,
   toujours affichée, et le nowrap la coupait — « Picture Organic Clothing ·
   catégorie … ». Couper la marque pour tenir sur une ligne, c'est exactement
   l'information que Nico a demandé de ne plus perdre.

   MAIS bornée à DEUX LIGNES, hauteur RÉSERVÉE (2026-08-05, Nico sur iPhone) :
   la meta porte la description générée, longue de 5 à 7 lignes sur un article
   réel (« Montre G-Shock … pas de défaut apparent visible »). Sans borne, une
   carte faisait le double de la voisine et la liste devenait illisible au
   défilement. On assume de ne PAS voir la description en entier — elle est
   lisible au tap (édition).
   Le couple line-clamp + min-height est indissociable : le clamp seul
   n'égalise rien (une meta d'une ligne reste 15 px plus courte), le
   min-height seul ne coupe rien. Les deux, et le bloc de gauche a une
   hauteur CONSTANTE, quel que soit le texte.
   ⛔ Ne pas remettre overflow:visible ni retirer le -webkit-box : c'est le
   seul mécanisme qui tronque sur plusieurs lignes avec des points de
   suspension (aucun équivalent en text-overflow, qui est mono-ligne). */
${s} .meta{font-size:11.5px;color:var(--mute);margin-top:3px;white-space:normal;overflow-wrap:anywhere;line-height:1.35;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:2.7em;}
${s} .meta .hl{color:var(--ink);}
/* ⚠️⚠️ AUCUN BACKTICK DANS CE FICHIER — tout ce CSS est un template literal JS.
   Un backtick posé ici (j'avais écrit .left entre backticks, à la mode Markdown)
   TERMINE la chaîne : buildCardCss se casse en plein milieu et l'app entière
   part en écran blanc (« .left is not a function »). Et vite build ne le voit
   PAS : le fichier reste syntaxiquement valide, il ne veut simplement plus rien
   dire. Citer un sélecteur ? Guillemets français, jamais de backtick.

   flex-wrap OBLIGATOIRE (2026-07-13). Sans lui, la rangée de pastilles ne
   pouvait PAS passer à la ligne : chaque pastille a un contenu de largeur
   irréductible (min-width auto), donc au-delà de 3-4 pastilles la rangée
   débordait de la colonne de gauche et venait passer SOUS les boutons de la
   colonne de droite — c'est le chevauchement « En ligne » / « Republier ».
   La 5e pastille (« En ligne ») n'a fait que révéler le défaut, elle ne l'a pas
   créé : 4 plateformes suffisaient déjà à serrer la carte sur mobile. */
${s} .icons{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;min-width:0;}
/* max-width + ellipsis : filet de sécurité. .micon est nowrap et flex:0 0 auto,
   donc un libellé trop long prenait une largeur IRRÉDUCTIBLE et sortait de la
   carte par la droite, par-dessus les boutons. Une pastille reste courte par
   contrat (les phrases vont dans .cardnote ou dans une feuille) ; si l'une
   déborde quand même, elle se coupe proprement au lieu de casser la carte.
   ⚠️ AUDIT 07/08 : ce filet N'A JAMAIS FONCTIONNÉ tant que .micon était
   display:flex — text-overflow:ellipsis est INOPÉRANT sur un conteneur flex,
   et justify-content:center rognait le contenu PAR LES DEUX BOUTS, sans
   ellipse (« nonce Vinted · 2 » constaté : ni le début du libellé, ni le
   prix). Le correctif : .micon redevient un bloc à contenu INLINE
   (inline-block + line-height) — l'ellipse s'applique, la coupe se fait en
   FIN de texte (le libellé survit, « Annonce Vi… »). Dans la rangée .icons
   (flex), le display est blockifié : le comportement de flex ITEM est
   inchangé, seul le rendu INTERNE change. Les points (.dot/.pulse) passent
   en inline-block alignés (le gap flex ne s'applique plus). */
${s} .micon{height:19px;line-height:19px;padding:0 6px;border-radius:6px;display:inline-block;text-align:left;font-size:10px;color:#fff;font-weight:700;flex:0 0 auto;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;}
/* Point qui respire : une republication en cours doit se VOIR vivante sur la
   carte, sans y installer un spinner (le détail animé vit dans la feuille). */
${s} .micon .pulse{display:inline-block;vertical-align:middle;margin:0 3px 2px 0;width:5px;height:5px;border-radius:50%;background:currentColor;animation:fs-pulse 1.4s ease-in-out infinite;}
@keyframes fs-pulse{0%,100%{opacity:.25;}50%{opacity:1;}}
@media (prefers-reduced-motion:reduce){${s} .micon .pulse{animation:none;opacity:.7;}}
${s} .ic-vinted{background:#09B584;}
${s} .ic-leboncoin{background:#EA5B0C;}
${s} .ic-beebs{background:#FF6B35;}
${s} .ic-ebay{background:#0064D2;}
${s} .ic-plateforme{background:var(--teal-deep);}
${s} .ic-pending{background:var(--amber);}
${s} .ic-loc{background:var(--mute);}
/* « Plus en ligne » — l'annonce Vinted n'a pas été retrouvée à la dernière
   sync. Ambre du design system (var(--amber)), la même famille que ic-pending :
   un état qui appelle l'attention sans être une erreur. Encre foncée dessus
   plutôt que blanc, l'ambre étant trop clair pour du #fff (contraste). */
${s} .ic-gone{background:var(--amber);color:var(--ink);}
/* Prix DEMANDÉ sur l'annonce en ligne — l'info la plus regardée de la carte.
   Elle portait le teal de .ic-plateforme, donc exactement la couleur du statut
   « En ligne » ET du bouton « Publier » : trois choses différentes, un seul
   vert, le prix se noyait dans du statut. Traitement à l'ENCRE (aucune teinte
   nouvelle : var(--ink) sur var(--paper), déjà au design system) — c'est la
   seule pastille sombre de la rangée, donc la première lue, et elle ne peut
   plus être confondue avec un état. Contraste #F6F5F1 sur #10201B ≈ 16:1. */
${s} .ic-price{background:var(--ink);color:var(--paper);}
/* Note pleine largeur SOUS les deux colonnes (2026-08-05). Une phrase entière
   ne peut pas vivre dans .icons : .micon est nowrap + flex:0 0 auto, donc un
   message long prend une largeur IRRÉDUCTIBLE, sort de la colonne de gauche et
   passe par-dessus les boutons de droite (constaté sur iPhone : texte coupé au
   bord de l'écran). Ici : enfant direct de la grille, sur toutes les colonnes,
   et le texte RETOURNE À LA LIGNE. */
${s} .cardnote{grid-column:1/-1;margin-top:8px;padding:8px 10px;border-radius:10px;font-size:11.5px;font-weight:600;line-height:1.45;white-space:normal;overflow-wrap:anywhere;display:flex;align-items:flex-start;gap:7px;}
${s} .cardnote.is-info{background:#F0FDFB;border:1px solid rgba(13,148,136,0.25);color:var(--teal-deep);}
${s} .cardnote.is-warn{background:#FFF7ED;border:1px solid #FED7AA;color:#9A3412;}
/* « En ligne » : un STATUT, pas une plateforme. Il ouvre la rangée, et se
   distingue par sa FORME (chip clair cerclé de teal + point) plutôt que par une
   6e couleur pleine : cinq aplats saturés côte à côte rendaient la carte
   illisible. Teal du design system (pas de nouvelle teinte), poids 700 max.
   ⚠️ white-space:nowrap est porté par .micon : sans lui, « En ligne » se cassait
   en « En » / « ligne » quand la place manquait (constaté sur la 1re carte). */
${s} .ic-online{background:rgba(47,158,144,.12);color:var(--teal-deep);box-shadow:inset 0 0 0 1px rgba(47,158,144,.40);}
${s} .ic-online .dot{display:inline-block;vertical-align:middle;margin:0 3px 2px 0;width:5px;height:5px;border-radius:50%;background:var(--teal);}
/* Plateformes : LOGOS et non plus noms écrits. « Leboncoin » + « Beebs » en toutes
   lettres débordaient la carte en largeur mobile quel que soit le CSS — quatre
   logos de 18 px tiennent dans la place d'un seul nom. Aucun socle ni cadre ici :
   PlatformLogo fournit déjà l'icône carrée (socle blanc pour vinted/ebay, icône
   d'app pleine pour beebs/leboncoin). */
${s} .plogo{display:flex;align-items:center;flex:0 0 auto;line-height:0;}
${s} .right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px;}
${s} .price{font-weight:700;font-size:13px;color:var(--ink);margin-bottom:1px;}
${s} .price .lbl{font-weight:500;font-size:9px;color:var(--mute);display:block;text-align:right;}
/* 92px et non 78 (2026-08-05) — MESURÉ, pas estimé. La pastille de cooldown de
   republication « 🔁 Dans ~24 h » se cassait en deux lignes et la carte
   grandissait avec. Largeurs relevées en Space Grotesk 600/11px sur la vraie
   page, pour 76px de place utile (78 − 2 de bordures) :
       « 🔁 Dans ~14 h » 75,2  ✅      « 🔁 Dans ~20 h » 77,0  ❌
       « 🔁 Dans ~17 h » 74,3  ✅      « 🔁 Dans ~24 h » 76,6  ❌
   Exactement le partage décrit : 14 et 17 tenaient, 20 et 24 non. Le cas le
   plus long fait 77,0px en chiffres tabulaires ; 92 − 2 de bordures − 8 de
   padding = 82px utiles, soit 5px de marge. La colonne d'actions prend ces
   14px sur le titre (grid auto/1fr/auto), jamais sur la hauteur. */
${s} .btn-stack{display:flex;flex-direction:column;gap:4px;width:92px;}
${s} .btn-publier{font-size:11.5px;font-weight:700;color:#fff;text-align:center;background:linear-gradient(155deg,var(--teal),var(--teal-deep));padding:6px 0;border-radius:9px;border:none;cursor:pointer;font-family:inherit;}
/* 4 plateformes sur 4 en ligne : il n'y a PLUS RIEN à publier. Bouton inerte
   (disabled côté handler aussi), ton neutre — c'est un état, pas une action.
   Tant qu'il reste une plateforme libre, le bouton garde son aplat plein :
   « Publier » y est une vraie action (les manquantes), pas une republication. */
${s} .btn-publier.is-complete{background:#F1F1EE;color:var(--mute);border:1px solid var(--border);font-weight:600;font-size:10px;padding:5px 0;cursor:default;}
${s} .btn-vendre{font-size:11px;font-weight:600;color:var(--mute);text-align:center;background:transparent;border:1px solid var(--border);padding:5px 4px;border-radius:9px;cursor:pointer;font-family:inherit;}
/* Pastille de cooldown de republication — « 🔁 Dans ~N h ». Classe DÉDIÉE,
   posée en plus de .btn-vendre : nowrap ne doit surtout PAS être global à
   .btn-vendre, car le libellé prixé « Republier (1 ‹icône Pépite›) » (80px,
   sans émoji précisément pour tenir dans les 82px utiles) doit pouvoir se
   replier entre le verbe et le groupe (prix) si le prix passe à deux
   chiffres — l'y interdire le ferait DÉBORDER au lieu de se replier.
   · white-space:nowrap  → le libellé ne se coupe jamais ;
   · tabular-nums        → 1, 2, 0 occupent la même chasse. Mesuré : sans lui,
     les valeurs à deux chiffres vont de 73,1 à 77,0px (8,8px d'écart entre
     « ~1 h » et « ~20 h ») et la largeur bougeait d'un article à l'autre ;
     avec lui, tout deux-chiffres fait exactement 77,0px. La pastille ne
     respire donc plus au rythme du compteur, et la hauteur de carte est
     constante quelle que soit la valeur. */
${s} .btn-cooldown{white-space:nowrap;font-variant-numeric:tabular-nums;}
${s} .cat-filters{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 2px 4px;}
${s} .cat-filters::-webkit-scrollbar{display:none;}
${s} .fpill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;background:#fff;border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--mute);white-space:nowrap;flex-shrink:0;cursor:pointer;font-family:inherit;transition:all 0.15s;}
${s} .fpill.active{background:var(--ink);border-color:var(--ink);color:#fff;}
${s} .fdot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(16,32,27,0.10);}
`;
}

const TYPE_LABELS_EN={'High-Tech':'High-Tech','Mode':'Fashion','Luxe':'Luxury','Maison':'Home','Électroménager':'Appliances','Jouets':'Toys','Livres':'Books','Sport':'Sport','Auto-Moto':'Vehicles','Beauté':'Beauty','Musique':'Music','Collection':'Collection','Multimédia':'Multimedia','Jardin':'Garden','Bricolage':'DIY','Autre':'Other'};
export function typeLabel(type,lang){return lang==='en'?(TYPE_LABELS_EN[type]||type):type;}
export function marqueLabel(m,lang){return(lang==='en'&&m?.toLowerCase()==='sans marque')?'Unbranded':m;}

// La marque n'a plus sa place sur la LIGNE DE TITRE (2026-08-05) : elle s'y
// disputait la largeur avec le titre et finissait rognée en « • Q… » / « • To… »,
// c'est-à-dire illisible ET coûteuse. Elle passe en tête de la ligne meta, où
// elle est entière. Restait le doublon : « Short de bain Quiksilver taille M »
// suivi de « Quiksilver ». On ne la répète donc pas quand le titre la porte
// déjà — comparaison sans accents ni ponctuation (« Levi's » vs « Levis »).
const _plat=(s)=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
export function marqueHorsTitre(titre,marque){
  const m=String(marque??'').trim();
  if(!m)return null;
  const mp=_plat(m);
  if(!mp)return null;
  return _plat(titre).includes(mp)?null:m;
}

export const SKELETON_ITEMS=[
  {title:'Veste Zara oversize',  type:'Mode',       marque:'Zara',    buy:12,  qty:1,  days:2},
  {title:'Lot Pokémon x20',      type:'Collection', marque:'Pokémon', buy:8,   qty:20, days:null},
  {title:'iPhone 12 64Go',       type:'High-Tech',  marque:'Apple',   buy:180, qty:1,  days:5},
  {title:'Sac Kelly Hermès',     type:'Mode',       marque:'Hermès',  buy:125, qty:1,  days:1},
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15,  qty:1,  days:null},
];
export const SKELETON_SOLD=[
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15, sell:38, margin:23, marginPct:61},
  {title:'Perceuse Makita 18V',  type:'High-Tech',  marque:'Makita',  buy:45, sell:89, margin:44, marginPct:49},
  {title:'Paquet Pokémon ×5',    type:'Collection', marque:'Pokémon', buy:2,  sell:15, margin:13, marginPct:87},
];

const VOICE_EXAMPLES_FR_RAW = [
  { text: "J'ai acheté une veste Zara oversize taille M, noire, très bon état, 12€ au vide-grenier de Corbeil, elle est dans le sac bleu sous l'escalier", tag: "Ajouter", cls: "add" },
  { text: "Où j'ai rangé mon iPhone 12 ?", tag: "Stock", cls: "query" },
  { text: "J'ai pris un lot de 3 paires de Nike Air Max 90, pointures 42 43 et 44, 60€ le lot sur Facebook Marketplace, dans la caisse rouge du garage", tag: "Ajouter", cls: "add" },
  { text: "Qu'est-ce que j'ai dans le bac H48 ?", tag: "Stock", cls: "query" },
  { text: "J'ai chopé un sac Hermès Kelly authentique, cuir marron, légèrement usé sur les anses, 125€ en dépôt-vente, je l'ai rangé dans la vitrine du salon", tag: "Ajouter", cls: "add" },
  { text: "J'ai vendu l'iPhone 380€ sur Vinted, expédié aujourd'hui", tag: "Vendre", cls: "sell" },
  { text: "J'ai acheté un lot de 20 cartes Pokémon dont 2 rares holographiques, 8€ à la brocante, boîte à cartes sur le bureau", tag: "Ajouter", cls: "add" },
  { text: "Combien j'ai gagné ce mois-ci ?", tag: "Stats", cls: "query" },
  { text: "Le sac Hermès est parti à 420€, payé en liquide", tag: "Vendre", cls: "sell" },
  { text: "C'est quoi mes articles en stock depuis plus de 2 semaines ?", tag: "Stats", cls: "query" },
  { text: "J'ai vendu le lot Nike 55€ sur Leboncoin", tag: "Vendre", cls: "sell" },
  { text: "Quelle est ma marge moyenne sur la Mode ?", tag: "Stats", cls: "query" },
];
const VOICE_EXAMPLES_EN_RAW = [
  { text: "I bought an oversized Zara jacket size M, black, great condition, €12 at the Corbeil car boot sale, it's in the blue bag under the stairs", tag: "Add", cls: "add" },
  { text: "Where did I put my iPhone 12?", tag: "Stock", cls: "query" },
  { text: "I grabbed a lot of 3 pairs of Nike Air Max 90, sizes 42 43 and 44, €60 the lot on Facebook Marketplace, in the red crate in the garage", tag: "Add", cls: "add" },
  { text: "What do I have in bin H48?", tag: "Stock", cls: "query" },
  { text: "I picked up an authentic Hermès Kelly bag, brown leather, slightly worn handles, €125 at a consignment store, stored in the living room display cabinet", tag: "Add", cls: "add" },
  { text: "I sold the iPhone for €380 on Vinted, shipped today", tag: "Sell", cls: "sell" },
  { text: "I bought a lot of 20 Pokémon cards including 2 holographic rares, €8 at the flea market, card box on the desk", tag: "Add", cls: "add" },
  { text: "How much did I make this month?", tag: "Stats", cls: "query" },
  { text: "The Hermès bag sold for €420, paid cash", tag: "Sell", cls: "sell" },
  { text: "Which items have been in stock for more than 2 weeks?", tag: "Stats", cls: "query" },
  { text: "Sold the Nike lot for €55 on Leboncoin", tag: "Sell", cls: "sell" },
  { text: "What's my average margin on Fashion?", tag: "Stats", cls: "query" },
];

const LENS_PLACEHOLDERS_FR = [
  "Taille M, bon état, quelques traces d'usure...",
  "Neuf avec étiquette, jamais porté...",
  "Écran fissuré, fonctionne parfaitement...",
  "Lot de 3, emballage d'origine...",
  "Vintage années 90, couleur originale...",
  "Acheté 150€, porté 2 fois...",
  "Manque le chargeur, batterie 85%...",
  "Taille unique, coloris rare...",
];
const LENS_PLACEHOLDERS_EN = [
  "Size M, good condition, some signs of wear...",
  "Brand new with tag, never worn...",
  "Cracked screen, works perfectly...",
  "Lot of 3, original packaging...",
  "Vintage 90s, original color...",
  "Bought for €150, worn twice...",
  "Missing charger, battery 85%...",
  "One size, rare colorway...",
];

export function getRotatingLensPlaceholders(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? LENS_PLACEHOLDERS_EN : LENS_PLACEHOLDERS_FR;
  if (sym === '€') return raw;
  return raw.map(t => t.replace(/€/g, sym));
}

export function getRotatingExamples(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? VOICE_EXAMPLES_EN_RAW : VOICE_EXAMPLES_FR_RAW;
  if (sym === '€') return raw;
  return raw.map(e => ({ ...e, text: e.text.replace(/€/g, sym) }));
}

export function groupSales(arr){
  const groups=[];
  for(const s of arr){
    if(s.quantite!=null){
      groups.push({...s,_qty:s.quantite});
      continue;
    }
    const last=groups[groups.length-1];
    if(last&&last.quantite==null&&last.title===s.title&&last.marque===s.marque&&last.date===s.date&&Math.abs((last.sell||0)-(s.sell||0))<0.01){
      last._qty=(last._qty||1)+1;
      // Copie de la groupSales d'App.jsx — même correction : une marge inconnue
      // dans le groupe rend la marge du groupe inconnue, au lieu d'additionner
      // les seules lignes chiffrées et de présenter le résultat comme un total.
      const marges=[last.margin,s.margin];
      last.margin=marges.some(m=>m==null)?null:marges.reduce((a,m)=>a+m,0);
      last.marginPct=last.margin!=null&&(last.sell||0)>0?(last.margin/(last.sell*last._qty))*100:null;
    }else{
      groups.push({...s,_qty:1});
    }
  }
  return groups;
}

// ── Fraîcheur de l'extension — « ordinateur éteint » (2026-08-13) ────────────
// profiles.extension_last_seen_at est un battement SERVEUR, stampé par
// get-pending-jobs à chaque poll réussi (background toutes les 2 min, popup à
// l'ouverture). Le seuil « éteinte » doit être assez large pour qu'une
// extension VIVANTE ne le franchisse JAMAIS — un faux positif chez quelqu'un
// qui publie normalement est pire qu'un silence de quelques minutes.
// Pire silence LÉGITIME calculé sur le code réel : le poll tourne sous le
// verrou de flux (withJobFlowLock, background.js) — pendant qu'un cycle
// traite ses jobs, les alarmes suivantes ATTENDENT, et le stamp n'arrive
// qu'au cycle suivant. get-pending-jobs distribue TOUS les pending d'un coup
// (aucune limite) : un lot mobile de 12 jobs (3 articles × 4 plateformes) à
// ~3 min/job (eBay le plus lent : fieldSettle ~5 s/champ, relectures 8 s,
// pauses humaines) + 8-20 s entre jobs ≈ 40-45 min sans battement. Une sync
// dressing tient le même verrou (~8 min mesurées pour 123 articles).
// 60 min = ce pire cas (~45 min) + un tiers de marge. En dessous : RIEN.
// Au-delà de 7 jours : l'état rouge « inactive » (là, ouvrir Chrome ne
// suffira peut-être plus — reconnexion fillsell.app à proposer).
export const EXT_ETEINT_MS = 60 * 60 * 1000;
export const EXT_INACTIF_MS = 7 * 24 * 60 * 60 * 1000;

// États : 'inconnue' (jamais vue — les gardes « jamais installée » s'en
// chargent ailleurs, rien à afficher ici), 'vivante', 'eteinte' (ambre,
// informatif : rien n'est cassé, le job partira), 'inactive' (rouge).
export function fraicheurExtension(lastSeenAt) {
  const seen = Date.parse(lastSeenAt ?? "");
  if (!Number.isFinite(seen)) return { etat: "inconnue", jours: null };
  const age = Date.now() - seen;
  if (age <= EXT_ETEINT_MS) return { etat: "vivante", jours: 0 };
  const jours = Math.max(1, Math.floor(age / 86400000));
  return { etat: age > EXT_INACTIF_MS ? "inactive" : "eteinte", jours };
}
