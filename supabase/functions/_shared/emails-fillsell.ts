// ============================================================================
// LES TEXTES DES MAILS FILLSELL — un seul endroit, un seul gabarit.
//
// Refonte du 19/09/2026. Avant ce fichier, les sept mails vivaient dans trois
// fonctions qui ne se parlaient pas : email-tunnel avait son emailWrapper(),
// send-extension-link en portait une COPIE mot pour mot, et cancel-subscription
// n'avait aucun habillage (un <div> nu, sans logo ni pied de page). Trois
// rendus pour une seule marque, et Opla manquante dans les trois.
//
// Tout passe désormais par renderEmail() (_shared/email-template.ts), et la
// liste des plateformes par _shared/plateformes.ts.
//
// RÈGLES ÉDITORIALES — elles valent pour TOUT texte ajouté ici :
//   · TUTOIEMENT partout, sans exception ;
//   · signature « Nico », partout ;
//   · les CINQ plateformes, jamais écrites en dur : toutesLesPlateformes() ;
//   · ⛔ aucun chiffre de quota, aucun prix, aucun délai promis — la grille vit
//     dans l'app, et un chiffre dans un mail se périme sans que personne ne le
//     voie (« 50 republications », « illimité avec Premium »…) ;
//   · ⛔ on ne dit JAMAIS à quelqu'un de reposer son téléphone. L'app mobile
//     pilote, l'ordinateur exécute : les deux comptent ;
//   · une version EN pour chacun, traduite — jamais recopiée de l'ancienne,
//     qui portait des vestiges absents du français (« nothing is deducted from
//     your plan ») ;
//   · un préheader sur chaque mail.
// ============================================================================

import {
  boutonPrincipal,
  encadre,
  type Html,
  listePuces,
  logosPlateformes,
  paragraphe,
  renderEmail,
  sousTitre,
} from "./email-template.ts";
import { plateformesEnClair, toutesLesPlateformes } from "./plateformes.ts";

export type Langue = "fr" | "en";

/** Normalise n'importe quelle valeur de langue. Défaut : français. */
export function langue(v: unknown): Langue {
  return String(v ?? "").toLowerCase().startsWith("en") ? "en" : "fr";
}

export interface MailPret {
  sujet: string;
  html: string;
}

export const CWS_URL =
  "https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm";
export const URL_APP = "https://fillsell.app";
export const URL_EXTENSION = "https://fillsell.app/extension";

/** Date et heure de Paris, lisibles. Jamais d'UTC dans un mail. */
export function dateParis(iso: string | Date, avecHeure = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    ...(avecHeure ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
  }).format(d);
}

/** Date seule (JJ/MM/AAAA), heure de Paris. */
export function dateSeuleParis(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Options communes à tous les mails du parc. */
function mail(opts: {
  lang: Langue;
  titre?: string;
  surtitre?: string;
  preheader: string;
  corps: Html[];
  raisonEnvoi?: string;
  lienDesinscription?: string;
}): string {
  const fr = opts.lang === "fr";
  return renderEmail({
    titre: opts.titre ?? "",
    surtitre: opts.surtitre ?? "",
    preheader: opts.preheader,
    corps: opts.corps,
    // Les textes se terminent par « Nico », sans formule au-dessus : la
    // formule par défaut du gabarit (« À bientôt, ») ajouterait une ligne que
    // personne n'a écrite.
    formuleFin: "",
    signatureNom: "Nico",
    signatureRole: "FillSell",
    raisonEnvoi: opts.raisonEnvoi ??
      (fr
        ? "Tu reçois ce message parce que tu as un compte FillSell."
        : "You're getting this message because you have a FillSell account."),
    lienDesinscription: opts.lienDesinscription ?? "",
    langue: opts.lang,
  });
}

// ---------------------------------------------------------------------------
// 1. welcome
// ---------------------------------------------------------------------------

export function mailBienvenue(lang: Langue, lienDesinscription = ""): MailPret {
  const plateformes = toutesLesPlateformes(lang);
  const corps = lang === "fr"
    ? [
      paragraphe("Salut,"),
      paragraphe(
        `FillSell te fait gagner du temps sur la revente : tu prépares un article une fois, et il part sur ${plateformes}.`,
      ),
      logosPlateformes(),
      sousTitre("Comment ça marche"),
      paragraphe(
        "Tu pilotes depuis ton téléphone. Une extension installée dans Chrome sur ton ordinateur fait le travail sur les plateformes, en s'appuyant sur tes sessions déjà ouvertes — elle ne se connecte jamais à ta place.",
      ),
      sousTitre("Trois choses pour démarrer"),
      encadre(
        "1. Importe ce que tu vends déjà",
        "Si tu as des annonces en ligne, FillSell les récupère — titres, prix, photos, vues et favoris — et les range dans ton stock. Rien à ressaisir.",
      ),
      encadre(
        "2. Remets en avant les annonces qui dorment",
        "Une annonce ancienne ne se voit presque plus. D'un geste, FillSell la sauvegarde, la retire et la remet en ligne à l'identique. Tu peux ajuster le prix au passage.",
      ),
      encadre(
        "3. Publie partout d'un seul geste",
        "Prends ton article en photo : FillSell l'identifie, rédige le titre et la description, propose un prix. Tu choisis les plateformes.",
      ),
      boutonPrincipal("Installer l'extension", CWS_URL),
      paragraphe("L'extension s'installe sur ordinateur, en une minute, une seule fois."),
      paragraphe("Une question ? Réponds à ce mail."),
    ]
    : [
      paragraphe("Hi,"),
      paragraphe(
        `FillSell saves you time on reselling: you prepare an item once, and it goes out on ${plateformes}.`,
      ),
      logosPlateformes(),
      sousTitre("How it works"),
      paragraphe(
        "You drive everything from your phone. An extension installed in Chrome on your computer does the work on the marketplaces, using the sessions you already have open — it never signs in for you.",
      ),
      sousTitre("Three things to get started"),
      encadre(
        "1. Bring in what you already sell",
        "If you have listings online, FillSell picks them up — titles, prices, photos, views and favourites — and files them in your stock. Nothing to retype.",
      ),
      encadre(
        "2. Put the sleeping listings back in front",
        "An old listing barely gets seen any more. In one move, FillSell saves it, takes it down and puts it back online exactly as it was. You can adjust the price along the way.",
      ),
      encadre(
        "3. List everywhere in a single move",
        "Take a photo of your item: FillSell identifies it, writes the title and the description, suggests a price. You pick the marketplaces.",
      ),
      boutonPrincipal("Install the extension", CWS_URL),
      paragraphe("The extension installs on a computer, in a minute, once and for all."),
      paragraphe("A question? Just reply to this email."),
    ];

  return {
    sujet: lang === "fr" ? "Bienvenue sur FillSell" : "Welcome to FillSell",
    html: mail({
      lang,
      titre: lang === "fr" ? "Bienvenue sur FillSell" : "Welcome to FillSell",
      preheader: lang === "fr"
        ? "Ton stock sur cinq plateformes, depuis ton téléphone."
        : "Your stock on five marketplaces, from your phone.",
      corps,
      lienDesinscription,
    }),
  };
}

// ---------------------------------------------------------------------------
// 2. how_it_works
// ---------------------------------------------------------------------------

export function mailCommentCaMarche(lang: Langue, lienDesinscription = ""): MailPret {
  const corps = lang === "fr"
    ? [
      paragraphe("Salut,"),
      paragraphe("Voilà ce qui se passe en arrière-plan une fois ton compte en route."),
      encadre(
        "Il publie pour toi",
        "Quand tu demandes une publication, elle se fait dans une fenêtre discrète qui ne te vole jamais le focus, ou directement depuis nos serveurs selon la plateforme. Les gestes sont volontairement espacés : on travaille au rythme d'un humain. Compte quelques minutes par plateforme, c'est normal.",
      ),
      encadre(
        "Il garde ton stock à jour",
        "FillSell repasse chaque jour sur tes annonces, sur toutes tes plateformes et tous tes comptes : nouvelles annonces, prix, vues, favoris. Tu peux aussi relancer à la main quand tu veux.",
      ),
      encadre(
        "Il repère tes ventes",
        "Quand un article se vend, FillSell le voit et te le signale. Sur certaines plateformes il récupère même le montant et la date tout seul. Le retrait des annonces ailleurs reste ton geste : tu confirmes, FillSell exécute — comme ça tu ne retires jamais une annonce par erreur.",
      ),
      encadre(
        "Il remet tes annonces en avant",
        "Celles qui dorment repartent en ligne avec les mêmes photos et la même fiche. Là aussi, FillSell prend son temps entre chaque geste.",
      ),
      paragraphe("Une question ? Réponds à ce mail."),
    ]
    : [
      paragraphe("Hi,"),
      paragraphe("Here's what happens in the background once your account is up and running."),
      encadre(
        "It lists for you",
        "When you ask for a listing, it happens in a discreet window that never steals your focus, or straight from our servers depending on the marketplace. The steps are deliberately spaced out: we work at a human's pace. Count a few minutes per marketplace, that's normal.",
      ),
      encadre(
        "It keeps your stock up to date",
        "FillSell goes back over your listings every day, across all your marketplaces and all your accounts: new listings, prices, views, favourites. You can also run it by hand whenever you want.",
      ),
      encadre(
        "It spots your sales",
        "When an item sells, FillSell sees it and tells you. On some marketplaces it even picks up the amount and the date on its own. Taking the listings down elsewhere stays your call: you confirm, FillSell does it — that way you never take down a listing by mistake.",
      ),
      encadre(
        "It puts your listings back in front",
        "The ones that are sleeping go back online with the same photos and the same details. There too, FillSell takes its time between each step.",
      ),
      paragraphe("A question? Just reply to this email."),
    ];

  return {
    sujet: lang === "fr"
      ? "Ce que FillSell fait sans que tu y penses"
      : "What FillSell does without you thinking about it",
    html: mail({
      lang,
      titre: lang === "fr"
        ? "Ce que FillSell fait sans que tu y penses"
        : "What FillSell does without you thinking about it",
      preheader: lang === "fr"
        ? "Publication, ventes, mises à jour : ce qui tourne en fond."
        : "Listing, sales, updates: what runs in the background.",
      corps,
      lienDesinscription,
    }),
  };
}

// ---------------------------------------------------------------------------
// 3. extension_link
// ---------------------------------------------------------------------------

export function mailLienExtension(lang: Langue): MailPret {
  const corps = lang === "fr"
    ? [
      paragraphe("Salut,"),
      paragraphe("Voilà ton lien. Ouvre-le sur ton ordinateur, dans Chrome."),
      boutonPrincipal("Installer l'extension FillSell", URL_EXTENSION),
      paragraphe(`Le bouton ne marche pas ? Copie ce lien : ${URL_EXTENSION}`),
      sousTitre("Ce qui se passe ensuite"),
      paragraphe(
        "Une fois installée, l'extension récupère les annonces que tu as déjà en ligne et les range dans ton stock. Tu les retrouves dans l'app, sur ton téléphone. Ensuite, c'est de là que tu pilotes : tu choisis ce qui part et où, l'ordinateur s'occupe du reste.",
      ),
    ]
    : [
      paragraphe("Hi,"),
      paragraphe("Here's your link. Open it on your computer, in Chrome."),
      boutonPrincipal("Install the FillSell extension", URL_EXTENSION),
      paragraphe(`Button not working? Copy this link: ${URL_EXTENSION}`),
      sousTitre("What happens next"),
      paragraphe(
        "Once installed, the extension picks up the listings you already have online and files them in your stock. You find them in the app, on your phone. From there on, that's where you drive: you choose what goes out and where, the computer handles the rest.",
      ),
    ];

  return {
    sujet: lang === "fr"
      ? "Ton lien pour installer l'extension"
      : "Your link to install the extension",
    html: mail({
      lang,
      titre: lang === "fr"
        ? "Ton lien pour installer l'extension"
        : "Your link to install the extension",
      preheader: lang === "fr"
        ? "À ouvrir depuis ton ordinateur, dans Chrome."
        : "To open from your computer, in Chrome.",
      corps,
      raisonEnvoi: lang === "fr"
        ? "Tu reçois ce message parce que tu as demandé le lien d'installation depuis l'application."
        : "You're getting this message because you asked for the install link from the app.",
    }),
  };
}

// ---------------------------------------------------------------------------
// 4 et 5. job_pending_relaunch
// ---------------------------------------------------------------------------

export interface ContexteRelance {
  /** Titres des articles concernés, déjà dédoublonnés. */
  titres: string[];
  /** Slugs des plateformes. Passés par la garde, jamais imprimés bruts. */
  plateformes: string[];
  /** Date du plus vieux job (ISO). */
  depuis: string;
  /** profiles.extension_last_seen_at (ISO) — cas 2 uniquement. */
  extensionVueLe?: string | null;
}

/** « "a", "b" et 3 autres », ou une formule générique si aucun titre. */
function articlesEnClair(titres: string[], lang: string): string {
  const propres = titres.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (propres.length === 0) return lang === "en" ? "your listings" : "tes annonces";
  const trois = propres.slice(0, 3).map((t) => `« ${t} »`);
  const reste = propres.length - trois.length;
  const morceaux = reste > 0
    ? [...trois, lang === "en" ? `${reste} more` : `${reste} autre${reste > 1 ? "s" : ""}`]
    : trois;
  const et = lang === "en" ? "and" : "et";
  if (morceaux.length === 1) return morceaux[0];
  return `${morceaux.slice(0, -1).join(", ")} ${et} ${morceaux[morceaux.length - 1]}`;
}

export function mailRelanceJobs(
  cas: 1 | 2,
  ctx: ContexteRelance,
  lang: Langue,
): MailPret {
  const articles = articlesEnClair(ctx.titres, lang);
  const plateformes = plateformesEnClair(ctx.plateformes, lang);
  const depuis = dateParis(ctx.depuis);
  const vue = ctx.extensionVueLe ? dateParis(ctx.extensionVueLe) : null;

  if (cas === 1) {
    const corps = lang === "fr"
      ? [
        paragraphe("Salut,"),
        paragraphe(
          `Tu as préparé ${articles} pour ${plateformes} le ${depuis}. Tout est prêt — photos, titres, prix. Mais rien n'est encore parti.`,
        ),
        paragraphe(
          "La raison : sur FillSell, c'est une extension installée dans Chrome sur ton ordinateur qui dépose tes annonces. Elle n'a jamais tourné sur ton compte, donc personne n'est venu les chercher.",
        ),
        boutonPrincipal("Installer l'extension", CWS_URL),
        paragraphe(
          "Une minute, depuis ton ordinateur. Ensuite tu cliques sur l'icône FillSell, puis « Se connecter » — elle retrouve ta session toute seule.",
        ),
        paragraphe(
          "Tes annonces ne sont pas perdues et tu n'as rien à refaire : dès que l'extension est en place, elles partent.",
        ),
        paragraphe("Un blocage ? Réponds à ce mail."),
      ]
      : [
        paragraphe("Hi,"),
        paragraphe(
          `You prepared ${articles} for ${plateformes} on ${depuis}. Everything is ready — photos, titles, prices. But nothing has gone out yet.`,
        ),
        paragraphe(
          "Here's why: on FillSell, it's an extension installed in Chrome on your computer that posts your listings. It has never run on your account, so nobody came to pick them up.",
        ),
        boutonPrincipal("Install the extension", CWS_URL),
        paragraphe(
          "One minute, from your computer. Then click the FillSell icon and « Sign in » — it finds your session on its own.",
        ),
        paragraphe(
          "Your listings are not lost and there's nothing to redo: as soon as the extension is in place, they go out.",
        ),
        paragraphe("Stuck? Just reply to this email."),
      ];
    return {
      sujet: lang === "fr"
        ? "Tes annonces sont prêtes, il manque l'extension"
        : "Your listings are ready, the extension is missing",
      html: mail({
        lang,
        titre: lang === "fr"
          ? "Tes annonces sont prêtes, il manque l'extension"
          : "Your listings are ready, the extension is missing",
        preheader: lang === "fr"
          ? "Elles t'attendent, rien n'est perdu."
          : "They're waiting for you, nothing is lost.",
        corps,
        raisonEnvoi: lang === "fr"
          ? "Tu reçois ce message parce que des publications attendent sur ton compte FillSell."
          : "You're getting this message because listings are waiting on your FillSell account.",
      }),
    };
  }

  const corps = lang === "fr"
    ? [
      paragraphe("Salut,"),
      paragraphe(`${articles} attendent de partir sur ${plateformes} depuis le ${depuis}.`),
      paragraphe(
        vue
          ? `Rien à réinstaller : ton extension est bien en place, on l'a vue pour la dernière fois le ${vue}. Elle ne tourne simplement pas en ce moment.`
          : "Rien à réinstaller : ton extension est bien en place. Elle ne tourne simplement pas en ce moment.",
      ),
      paragraphe(
        "Elle reprendra d'elle-même dès que ton ordinateur sera allumé avec Chrome ouvert. La publication repart en arrière-plan, sans que tu aies à recliquer sur Publier.",
      ),
      boutonPrincipal("Ouvrir FillSell", URL_APP),
      paragraphe(
        "Si rien ne bouge alors que ton ordinateur tourne, réponds à ce mail : c'est de notre côté qu'il y a quelque chose à regarder.",
      ),
    ]
    : [
      paragraphe("Hi,"),
      paragraphe(`${articles} have been waiting to go out on ${plateformes} since ${depuis}.`),
      paragraphe(
        vue
          ? `Nothing to reinstall: your extension is in place, we last saw it on ${vue}. It simply isn't running right now.`
          : "Nothing to reinstall: your extension is in place. It simply isn't running right now.",
      ),
      paragraphe(
        "It will pick up on its own as soon as your computer is on with Chrome open. Listing resumes in the background, without you clicking Publish again.",
      ),
      boutonPrincipal("Open FillSell", URL_APP),
      paragraphe(
        "If nothing moves while your computer is running, reply to this email: that means there's something to look at on our side.",
      ),
    ];

  return {
    sujet: lang === "fr"
      ? "Tes annonces repartent dès que ton ordinateur est là"
      : "Your listings resume as soon as your computer is back",
    html: mail({
      lang,
      titre: lang === "fr"
        ? "Tes annonces repartent dès que ton ordinateur est là"
        : "Your listings resume as soon as your computer is back",
      preheader: lang === "fr" ? "Rien à réinstaller." : "Nothing to reinstall.",
      corps,
      raisonEnvoi: lang === "fr"
        ? "Tu reçois ce message parce que des publications attendent sur ton compte FillSell."
        : "You're getting this message because listings are waiting on your FillSell account.",
    }),
  };
}

// ---------------------------------------------------------------------------
// 6. resiliation_ar
// ---------------------------------------------------------------------------

export interface ContexteResiliation {
  /** Premium | Pro | Business. */
  formule: string;
  /** Instant de la demande (ISO ou Date). Rendu en heure de PARIS. */
  demandeLe: string | Date;
  /** Fin d'accès (ISO ou Date), ou null si inconnue. Heure de PARIS. */
  finAcces: string | Date | null;
}

export function mailResiliation(ctx: ContexteResiliation, lang: Langue): MailPret {
  // ⚠️ Les DEUX dates en heure de Paris. La version d'avant ce lot annonçait
  // « (heure de Paris) » pour la demande et formatait la fin d'accès en UTC
  // (getUTCDate/getUTCMonth/getUTCFullYear) : un jour d'écart en fin de mois,
  // sur le document qui sert de preuve de résiliation.
  const demande = dateParis(ctx.demandeLe);
  const fin = ctx.finAcces ? dateSeuleParis(ctx.finAcces) : null;

  const corps = lang === "fr"
    ? [
      paragraphe("Salut,"),
      paragraphe("On confirme la résiliation de ton abonnement FillSell."),
      listePuces([
        `Demande reçue le ${demande} (heure de Paris)`,
        `Formule résiliée : ${ctx.formule}`,
        fin
          ? `Ton accès reste actif jusqu'au ${fin} inclus. Aucun nouveau prélèvement après cette date.`
          : "Ton accès reste actif jusqu'à la fin de la période déjà payée. Aucun nouveau prélèvement après cette date.",
      ]),
      paragraphe(
        "Ton compte, ton stock et ton historique de ventes restent accessibles : tu repasses en formule gratuite, qui a ses propres limites. Rien n'est supprimé.",
      ),
      paragraphe("Tu peux te réabonner à tout moment depuis l'application."),
      paragraphe("Ce message est l'accusé de réception de ta demande. Conserve-le."),
    ]
    : [
      paragraphe("Hi,"),
      paragraphe("We confirm the cancellation of your FillSell subscription."),
      listePuces([
        `Request received on ${demande} (Paris time)`,
        `Plan cancelled: ${ctx.formule}`,
        fin
          ? `Your access stays active until ${fin} included. No further charge after that date.`
          : "Your access stays active until the end of the period already paid for. No further charge after that date.",
      ]),
      paragraphe(
        "Your account, your stock and your sales history stay available: you go back to the free plan, which has its own limits. Nothing is deleted.",
      ),
      paragraphe("You can subscribe again at any time from the app."),
      paragraphe("This message is the acknowledgement of receipt of your request. Keep it."),
    ];

  return {
    sujet: lang === "fr"
      ? "Ta résiliation est bien enregistrée"
      : "Your cancellation is confirmed",
    html: mail({
      lang,
      titre: lang === "fr"
        ? "Ta résiliation est bien enregistrée"
        : "Your cancellation is confirmed",
      preheader: lang === "fr"
        ? "Accusé de réception — à conserver."
        : "Acknowledgement of receipt — keep it.",
      corps,
      raisonEnvoi: lang === "fr"
        ? "Tu reçois ce message parce que tu as demandé la résiliation de ton abonnement FillSell."
        : "You're getting this message because you asked to cancel your FillSell subscription.",
    }),
  };
}

// ---------------------------------------------------------------------------
// 7. payment_failed
// ---------------------------------------------------------------------------

export type CausePaiement = "3ds" | "carte_refusee" | "carte_expiree" | "autre";
export type ContextePaiement = "souscription" | "renouvellement";

const CAUSES: Record<Langue, Record<CausePaiement, string>> = {
  fr: {
    "3ds": "Ta banque attendait une validation qui n'est pas arrivée au bout. Rien n'a été débité.",
    carte_refusee: "Ta banque a refusé le paiement. Rien n'a été débité.",
    carte_expiree: "La carte enregistrée est expirée. Rien n'a été débité.",
    autre: "Le paiement n'a pas pu aboutir. Rien n'a été débité.",
  },
  en: {
    "3ds": "Your bank was waiting for a confirmation that never completed. Nothing was charged.",
    carte_refusee: "Your bank declined the payment. Nothing was charged.",
    carte_expiree: "The card on file has expired. Nothing was charged.",
    autre: "The payment couldn't go through. Nothing was charged.",
  },
};

export function mailPaiementEchoue(
  cause: CausePaiement,
  contexte: ContextePaiement,
  lang: Langue,
): MailPret {
  const texteCause = CAUSES[lang][cause] ?? CAUSES[lang].autre;
  const souscription = contexte !== "renouvellement";

  const corps = lang === "fr"
    ? [
      paragraphe("Salut,"),
      paragraphe(
        souscription
          ? "Ton abonnement n'a pas pu démarrer : le paiement s'est arrêté en route."
          : "Le renouvellement de ton abonnement n'a pas pu aboutir.",
      ),
      encadre("", texteCause),
      paragraphe(
        souscription
          ? "Tu peux réessayer quand tu veux depuis l'app."
          : "Ton abonnement reste actif pour l'instant, le paiement sera retenté automatiquement. Tu peux mettre à jour ton moyen de paiement depuis l'app.",
      ),
      boutonPrincipal("Ouvrir FillSell", URL_APP),
      paragraphe("Si ça bloque encore, réponds à ce mail."),
    ]
    : [
      paragraphe("Hi,"),
      paragraphe(
        souscription
          ? "Your subscription couldn't start: the payment stopped along the way."
          : "Your subscription renewal couldn't go through.",
      ),
      encadre("", texteCause),
      paragraphe(
        souscription
          ? "You can try again whenever you want from the app."
          : "Your subscription stays active for now, the payment will be retried automatically. You can update your payment method from the app.",
      ),
      boutonPrincipal("Open FillSell", URL_APP),
      paragraphe("If it still fails, just reply to this email."),
    ];

  return {
    sujet: lang === "fr"
      ? "Ton paiement n'a pas abouti"
      : "Your payment didn't go through",
    html: mail({
      lang,
      titre: lang === "fr" ? "Ton paiement n'a pas abouti" : "Your payment didn't go through",
      preheader: lang === "fr" ? "Rien n'a été débité." : "Nothing was charged.",
      corps,
      raisonEnvoi: lang === "fr"
        ? "Tu reçois ce message parce qu'un paiement a échoué sur ton compte FillSell."
        : "You're getting this message because a payment failed on your FillSell account.",
    }),
  };
}

// ---------------------------------------------------------------------------
// 8. ventes_du_jour — le récapitulatif des ventes (25/09/2026)
// ---------------------------------------------------------------------------
// Remplace le mail « Vendu sur X 🎉 » envoyé à CHAQUE vente (type
// relance_manuelle) : 14 mails en deux minutes chez les Petites Fioles le 25/09.
// Un seul mail regroupe toutes les ventes notées depuis le précédent ; c'est
// _shared/ventes-a-annoncer.ts qui décide QUAND il part (au plus un par 24 h).
// Les montants sont des FAITS (prix de vente, bénéfice calculé) : ils ne
// tombent pas sous la règle « aucun chiffre » qui vise les quotas et les prix
// de FillSell. Un bénéfice inconnu (prix d'achat vide) n'est JAMAIS affiché.

export interface VenteAnnoncee {
  titre: string | null;
  /** Slug. Passé par la garde des plateformes, jamais imprimé brut. */
  plateforme: string;
  prixVente: number;
  /** null = prix d'achat inconnu : on n'invente pas de bénéfice. */
  benefice: number | null;
}

export interface ContexteVentes {
  ventes: VenteAnnoncee[];
  /** Annonces du même article encore en ligne ailleurs, à retirer d'un clic. */
  retraitsACliquer: number;
  /** Dépôts Beebs en vérification, retirés automatiquement à leur mise en ligne. */
  retraitsBeebsAuto: number;
}

function euros(n: number, lang: Langue): string {
  const v = Math.round(Number(n) || 0);
  return lang === "fr" ? `${v} €` : `€${v}`;
}

export function mailVentes(ctx: ContexteVentes, lang: Langue): MailPret {
  const fr = lang === "fr";
  const n = ctx.ventes.length;
  const lignes = ctx.ventes.map((v) => {
    const titre = String(v.titre ?? "").trim() || (fr ? "Ton article" : "Your item");
    // « ailleurs » (vente sans plateforme certaine, 25/09) : on ne nomme rien.
    const ou = v.plateforme === "ailleurs"
      ? (fr ? "vendu ailleurs" : "sold elsewhere")
      : plateformesEnClair([v.plateforme], lang);
    const argent = v.benefice === null
      ? (fr ? `vendu ${euros(v.prixVente, lang)}` : `sold for ${euros(v.prixVente, lang)}`)
      : (fr
        ? `vendu ${euros(v.prixVente, lang)}, ${v.benefice >= 0 ? "+" : ""}${euros(v.benefice, lang)} de bénéfice`
        : `sold for ${euros(v.prixVente, lang)}, ${v.benefice >= 0 ? "+" : ""}${euros(v.benefice, lang)} profit`);
    return `« ${titre} » — ${ou} : ${argent}`;
  });
  const sansPrixAchat = ctx.ventes.some((v) => v.benefice === null);
  const seule = n === 1 ? ctx.ventes[0] : null;
  const seuleAilleurs = seule?.plateforme === "ailleurs";
  const ouSeule = seule && !seuleAilleurs ? plateformesEnClair([seule.plateforme], lang) : "";

  const sujet = fr
    ? (seule ? (seuleAilleurs ? "Article vendu 🎉" : `Vendu sur ${ouSeule} 🎉`) : `${n} articles vendus 🎉`)
    : (seule ? (seuleAilleurs ? "Item sold 🎉" : `Sold on ${ouSeule} 🎉`) : `${n} items sold 🎉`);

  const corps = [
    paragraphe(fr ? "Salut," : "Hi,"),
    paragraphe(fr
      ? (seule ? "Bonne nouvelle, une vente vient d'être enregistrée :" : `Bonne nouvelle, ${n} ventes viennent d'être enregistrées :`)
      : (seule ? "Good news, a sale has just been recorded:" : `Good news, ${n} sales have just been recorded:`)),
    listePuces(lignes),
    ...(sansPrixAchat
      ? [paragraphe(fr
        ? "Ajoute le prix d'achat d'un article dans FillSell pour connaître ton bénéfice."
        : "Add an item's purchase price in FillSell to see your profit.")]
      : []),
    ...(ctx.retraitsACliquer > 0
      ? [paragraphe(fr
        ? `${ctx.retraitsACliquer} annonce${ctx.retraitsACliquer > 1 ? "s" : ""} de ces articles ${ctx.retraitsACliquer > 1 ? "sont" : "est"} encore en ligne sur d'autres plateformes — ouvre FillSell pour ${ctx.retraitsACliquer > 1 ? "les" : "la"} retirer en un clic.`
        : `${ctx.retraitsACliquer} listing${ctx.retraitsACliquer > 1 ? "s" : ""} of these items ${ctx.retraitsACliquer > 1 ? "are" : "is"} still online on other marketplaces — open FillSell to take ${ctx.retraitsACliquer > 1 ? "them" : "it"} down in one tap.`)]
      : []),
    ...(ctx.retraitsBeebsAuto > 0
      ? [paragraphe(fr
        ? "Les dépôts Beebs encore en vérification seront retirés automatiquement dès que Beebs les aura mis en ligne."
        : "Beebs listings still under review will be taken down automatically as soon as Beebs puts them online.")]
      : []),
    boutonPrincipal(fr ? "Ouvrir FillSell" : "Open FillSell", URL_APP),
  ];

  return {
    sujet,
    html: mail({
      lang,
      titre: sujet,
      preheader: fr
        ? (seule ? "Une vente de plus." : `${n} ventes, un seul mail.`)
        : (seule ? "One more sale." : `${n} sales, one email.`),
      corps,
      raisonEnvoi: fr
        ? "Tu reçois ce message parce que des ventes ont été enregistrées sur ton compte FillSell."
        : "You're getting this message because sales were recorded on your FillSell account.",
    }),
  };
}
