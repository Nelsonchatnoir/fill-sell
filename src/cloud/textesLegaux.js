// ═══════════════════════════════════════════════════════════════════════════
// LES TEXTES LÉGAUX DE L'OPTION « SANS ORDINATEUR » (FillSell Cloud) — 05/10/2026
// ═══════════════════════════════════════════════════════════════════════════
// Affichés par src/pages/Legal.jsx SEULEMENT quand CLOUD_TEXTES_LEGAUX est vrai
// (config/cloudOffer.js : il suit le drapeau de l'offre). Drapeau baissé, la page
// légale se rend octet pour octet comme avant (preuve-identite-compte-ordinaire).
// Règle du 15/09 : un service non ouvert ne s'annonce pas sur une page publique.
//
// Écrits pour dire EXACTEMENT ce que fait le code (relu le 05/10) :
//   · cookies des plateformes chiffrés AES-256-GCM par l'orchestrateur, la base ne
//     voit que du chiffré (serveur-cloud/src/coffre.js, cloud_coffre) ;
//   · « Me connecter » : image de la page en direct (Page.startScreencast, rien
//     n'est écrit), saisie relayée par Input.insertText, jamais journalisée
//     (serveur-cloud/src/connexion.js) ;
//   · purge : grâce de 2 jours (grace_jours) puis repos et purge prouvée par
//     l'entretien horaire (alerte au-delà d'une heure de retard) → « au plus tard
//     3 jours » ; repos de l'IP : 7 jours (cloud_repos_jours, décision du 05/10) ;
//   · empreintes HMAC-SHA256 gardées 12 mois (empreintes_conservation_mois),
//     ON DELETE SET NULL : elles survivent à la suppression du compte ;
//     journal des IP : user_id effacé à 12 mois ; cloud_connexions : 90 jours ;
//   · IPRoyal = IPRoyal Services FZE LLC (Ajman, Émirats arabes unis — conditions
//     et politique relues le 05/10) ; DPA intégré aux conditions, clauses
//     contractuelles types de la Commission (module 2) ; journaux de trafic
//     « au moins 6 mois » selon sa politique ;
//   · rappel de fin d'essai : J-2 → J-1, dans l'app et par e-mail (cloud-rappel-veille.js) ;
//     les rappels Stripe sont coupés (décision de Nico du 05/10).
// Vouvoiement pour la confidentialité, « l'utilisateur » pour les CGV : le ton
// de la page légale existante.

const FR = {
  // CGV, article 2 (« Extension Chrome requise ») — une phrase ajoutée à la fin.
  cgvArticle2: "Par exception, avec l'option Sans ordinateur (article 7), ces actions sont exécutées pour Vinted et Leboncoin depuis les serveurs de FillSell, sans ordinateur.",
  // CGV, nouvel article 7.
  cgvArticle7: {
    t: 'Article 7 — Option Sans ordinateur (FillSell Cloud)',
    ps: [
      "Objet. L'option Sans ordinateur fait exécuter la publication, la republication et le retrait des annonces Vinted et Leboncoin de l'utilisateur, ainsi que le suivi de leurs ventes, depuis les serveurs de FillSell, dans un navigateur réservé à l'utilisateur et au sein de ses propres sessions, y compris lorsque son ordinateur est éteint. Elle ne concerne pas les autres plateformes ; eBay passe par sa connexion officielle. L'article 3 s'applique pleinement : une plateforme peut limiter ou refuser l'accès depuis les serveurs de FillSell ; FillSell en informe alors l'utilisateur, et l'extension Chrome reste disponible gratuitement.",
      "Prix. 20 € TTC par mois, sur le web (paiement par Stripe) comme dans l'App Store et Google Play. L'option est un abonnement distinct des forfaits : elle se souscrit seule (forfait gratuit compris, avec ses volumes) ou en plus d'un forfait payant. La résiliation d'un forfait n'arrête pas l'option.",
      "Essai gratuit de 7 jours. Un moyen de paiement est demandé. La date de fin de l'essai et le montant prélevé ensuite (20 € par mois) sont indiqués avant l'enregistrement du moyen de paiement ; rien n'est prélevé pendant l'essai. Un seul essai par personne : un essai déjà pris avec le même compte, le même appareil, le même moyen de paiement ou le même compte de plateforme n'en ouvre pas un second — l'option reste alors disponible sans essai, après information de l'utilisateur. Au plus tard la veille de la fin de l'essai, un rappel est adressé à l'utilisateur dans l'application et par e-mail. Dans l'App Store et Google Play, l'essai est proposé par la boutique, aux conditions qu'elle affiche.",
      "Arrêt. Sur le web, pendant l'essai, l'option s'arrête en un geste (Réglages › Abonnement), immédiatement et sans aucun prélèvement. Une fois payée, elle reste active jusqu'à la fin de la période payée, puis s'arrête ; aucun prélèvement n'a lieu ensuite. Une option souscrite dans l'App Store ou Google Play se gère et s'arrête dans les réglages d'abonnement de la boutique.",
      "Rétractation. Le droit de rétractation de l'article 6 s'applique à l'option.",
      "Responsabilité. L'utilisateur reste l'auteur et le seul responsable de ses annonces et du respect des conditions de chaque plateforme (article 3). FillSell ne garantit pas qu'une plateforme accepte durablement les connexions faites depuis ses serveurs.",
    ],
  },
  // CGU 3.9 — une phrase ajoutée à la fin.
  cgu39: "Avec l'option Sans ordinateur (CGV, article 7), ces actions sont exécutées dans un navigateur réservé à l'utilisateur, sur les serveurs de FillSell, toujours au sein de ses propres sessions.",
  // Confidentialité 4.7 — deux sous-traitants ajoutés.
  sousTraitants: [
    ['Hetzner Online GmbH', "hébergement des navigateurs de l'option Sans ordinateur (Allemagne, Union européenne)"],
    ['IPRoyal Services FZE LLC', "adresses IP françaises de l'option Sans ordinateur (Émirats arabes unis — clauses contractuelles types de la Commission européenne)"],
  ],
  // Confidentialité, nouvel article 4.8.
  confidentialite: {
    titre: "4.8 L'option Sans ordinateur (FillSell Cloud)",
    intro: "Avec l'option payante Sans ordinateur, FillSell publie, republie et retire vos annonces Vinted et Leboncoin et suit leurs ventes depuis ses serveurs, dans un navigateur qui vous est réservé. Ce navigateur fait ce que fait l'extension sur un ordinateur : il lit et modifie vos annonces et l'état de vos ventes, et ce qu'il lit rejoint votre compte FillSell comme avec l'extension. Base légale : l'exécution du contrat (l'option ne peut pas fonctionner sans ces traitements) ; pour la limite d'un essai par personne, notre intérêt légitime.",
    conserve: 'Ce que nous conservons pour faire fonctionner l’option :',
    liste: [
      ["Vos connexions aux plateformes :", "les cookies de session que Vinted ou Leboncoin déposent quand vous vous connectez depuis l'écran « Me connecter ». Pendant cette connexion, l'image de la page vous est transmise en direct, et ce que vous tapez (identifiant, mot de passe, code) est transmis par nos serveurs à la page de la plateforme sans être enregistré ni journalisé : nous ne conservons jamais votre mot de passe. Les cookies sont chiffrés (AES-256-GCM) avec une clé qui ne se trouve que sur nos serveurs de navigateurs ; notre base de données n'en garde qu'une version chiffrée."],
      ["Une session FillSell propre à ce navigateur,", "créée par nos serveurs (aucun mot de passe FillSell n'est stocké)."],
      ["Le profil du navigateur", "(cookies et données enregistrées par les pages visitées), sur nos serveurs."],
      ["L'historique de l'adresse IP qui vous est réservée", "(laquelle, de quand à quand), pour pouvoir répondre si une plateforme ou une autorité interroge une connexion faite depuis cette adresse ; votre identifiant en est effacé au bout de 12 mois."],
      ["Le journal de vos connexions par « Me connecter »", "(date, plateforme, réussite) : 90 jours."],
    ],
    ou: "Où. Les navigateurs tournent chez Hetzner Online GmbH (Gunzenhausen, Allemagne ; serveurs dans l'Union européenne). Ils sortent sur Internet par une adresse IP française qui vous est réservée, fournie par IPRoyal Services FZE LLC (Ajman, Émirats arabes unis) : les plateformes voient une connexion française, toujours la même pour vous. IPRoyal ne reçoit ni votre nom ni votre adresse e-mail. Le contenu de vos échanges avec les plateformes reste chiffré (HTTPS) de bout en bout, mais IPRoyal voit passer les données techniques de connexion (sites joints, heures, volumes), qu'il conserve au moins 6 mois selon sa propre politique. Ce transfert hors de l'Union européenne est encadré par les clauses contractuelles types de la Commission européenne, incluses dans l'accord de traitement des données d'IPRoyal. Votre compte eBay passe par la connexion officielle d'eBay (API), jamais par ce navigateur.",
    duree: "Combien de temps. Tant que l'option est active. Quand elle s'arrête (fin de l'essai sans abonnement, arrêt, suppression du compte), nous effaçons le navigateur, son profil, vos connexions chiffrées et la session FillSell de ce navigateur, au plus tard 3 jours après la fin. L'adresse IP qui vous était réservée reste ensuite au repos 7 jours avant de pouvoir servir à un autre compte ; si vous reprenez l'option pendant ce repos, vous retrouvez la même.",
    essai: "Un seul essai gratuit par personne. Pour qu'un même essai gratuit ne soit pas repris plusieurs fois (intérêt légitime), nous conservons, uniquement sous forme d'empreintes irréversibles (HMAC-SHA256) et jamais en clair : un identifiant de l'appareil depuis lequel l'essai est demandé, l'empreinte technique de la carte enregistrée pour l'essai sur le web (fournie par Stripe, jamais son numéro), et l'identifiant des comptes de plateforme déjà reliés à FillSell ou connectés pendant l'essai. Ces empreintes sont conservées 12 mois après la fin de l'essai, y compris si le compte est supprimé, puis effacées. Elles servent seulement à refuser un second essai : l'option reste disponible sans essai.",
  },
};

const EN = {
  cgvArticle2: 'By way of exception, with the No computer add-on (article 7), these actions are performed for Vinted and Leboncoin from FillSell\'s servers, without a computer.',
  cgvArticle7: {
    t: 'Article 7 — No computer add-on (FillSell Cloud)',
    ps: [
      "Purpose. The No computer add-on has the publication, reposting and withdrawal of the user's Vinted and Leboncoin listings, and the tracking of their sales, performed from FillSell's servers, in a browser reserved for the user and within the user's own sessions, including when the user's computer is switched off. It does not cover other marketplaces; eBay goes through its official sign-in. Article 3 applies in full: a marketplace may limit or refuse access from FillSell's servers; FillSell then informs the user, and the Chrome extension remains available free of charge.",
      'Price. €20 including VAT per month, on the web (payment by Stripe) as in the App Store and Google Play. The add-on is a subscription separate from the plans: it can be taken on its own (free plan included, with its volumes) or on top of a paid plan. Cancelling a plan does not stop the add-on.',
      "7-day free trial. A payment method is required. The end date of the trial and the amount charged afterwards (€20 per month) are shown before the payment method is saved; nothing is charged during the trial. One trial per person: a trial already taken with the same account, device, payment method or marketplace account does not open a second one — the add-on then remains available without a trial, after the user has been informed. No later than the day before the trial ends, a reminder is sent to the user in the app and by email. In the App Store and Google Play, the trial is offered by the store, on the terms it displays.",
      'Stopping. On the web, during the trial, the add-on stops in one tap (Settings › Subscription), immediately and without any charge. Once paid, it stays active until the end of the paid period, then stops; nothing is charged afterwards. An add-on subscribed in the App Store or Google Play is managed and stopped in the store\'s subscription settings.',
      'Withdrawal. The right of withdrawal in article 6 applies to the add-on.',
      "Liability. The user remains the author of and solely responsible for their listings and for complying with each marketplace's terms (article 3). FillSell does not guarantee that a marketplace will keep accepting connections made from its servers.",
    ],
  },
  cgu39: "With the No computer add-on (Terms of Sale, article 7), these actions are performed in a browser reserved for the user, on FillSell's servers, always within the user's own sessions.",
  sousTraitants: [
    ['Hetzner Online GmbH', 'hosting of the No computer add-on browsers (Germany, European Union)'],
    ['IPRoyal Services FZE LLC', 'French IP addresses of the No computer add-on (United Arab Emirates — European Commission standard contractual clauses)'],
  ],
  confidentialite: {
    titre: '4.8 The No computer add-on (FillSell Cloud)',
    intro: "With the paid No computer add-on, FillSell publishes, reposts and withdraws your Vinted and Leboncoin listings and tracks their sales from its servers, in a browser reserved for you. This browser does what the extension does on a computer: it reads and edits your listings and the status of your sales, and what it reads reaches your FillSell account just as with the extension. Legal basis: performance of the contract (the add-on cannot work without this processing); for the one-trial-per-person limit, our legitimate interest.",
    conserve: 'What we keep to run the add-on:',
    liste: [
      ['Your marketplace connections:', "the session cookies that Vinted or Leboncoin set when you sign in from the \"Sign in\" screen. During this sign-in, the image of the page is streamed to you live, and what you type (username, password, code) is passed by our servers to the marketplace's page without being recorded or logged: we never keep your password. The cookies are encrypted (AES-256-GCM) with a key that exists only on our browser servers; our database only keeps an encrypted version."],
      ['A FillSell session specific to this browser,', 'created by our servers (no FillSell password is stored).'],
      ['The browser profile', '(cookies and data saved by the pages visited), on our servers.'],
      ['The history of the IP address reserved for you', '(which one, from when to when), so that we can answer if a marketplace or an authority asks about a connection made from that address; your identifier is erased from it after 12 months.'],
      ['The log of your "Sign in" connections', '(date, marketplace, success): 90 days.'],
    ],
    ou: "Where. The browsers run at Hetzner Online GmbH (Gunzenhausen, Germany; servers in the European Union). They go out to the Internet through a French IP address reserved for you, provided by IPRoyal Services FZE LLC (Ajman, United Arab Emirates): marketplaces see a French connection, always the same one for you. IPRoyal receives neither your name nor your email address. The content of your exchanges with the marketplaces stays encrypted (HTTPS) end to end, but IPRoyal sees the technical connection data (sites reached, times, volumes), which it keeps for at least 6 months under its own policy. This transfer outside the European Union is governed by the European Commission's standard contractual clauses, included in IPRoyal's data processing agreement. Your eBay account goes through eBay's official sign-in (API), never through this browser.",
    duree: 'How long. As long as the add-on is active. When it stops (end of the trial without a subscription, stopping, account deletion), we erase the browser, its profile, your encrypted connections and this browser\'s FillSell session, no later than 3 days after the end. The IP address that was reserved for you then rests for 7 days before it can serve another account; if you take the add-on again during this rest, you get the same one back.',
    essai: 'One free trial per person. So that the same free trial is not taken several times (legitimate interest), we keep, only as irreversible fingerprints (HMAC-SHA256) and never in clear: an identifier of the device from which the trial is requested, the technical fingerprint of the card saved for the trial on the web (provided by Stripe, never its number), and the identifier of the marketplace accounts already linked to FillSell or connected during the trial. These fingerprints are kept for 12 months after the end of the trial, including if the account is deleted, then erased. They are used only to refuse a second trial: the add-on remains available without a trial.',
  },
};

export const textesLegauxCloud = (lang) => (lang === 'en' ? EN : FR);
