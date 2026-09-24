// ═══════════════════════════════════════════════════════════════════════════
// LES MOTS QU'UN JOB DIT À LA PERSONNE (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Même convention que src/entree/textes.js, src/reglages/textes.js et
// src/annonces/textes.js : une phrase lue par un humain ne vit pas au milieu
// de la logique qui la déclenche.
//
// ⚠️ CE FICHIER NAÎT AVEC UN SEUL CAS, ET C'EST VOULU. update-job-status fait
// 152 ko et porte des dizaines de messages en dur. Les déplacer tous d'un coup
// serait une refonte à l'aveugle sur le chemin le plus sensible du produit.
// Ce qui entre ici, c'est ce qu'on touche ; le reste suivra quand on y
// touchera.
//
// ⛔ CE QU'UN MESSAGE NE FAIT JAMAIS :
//   · accuser la personne d'un choix qu'elle a fait de bonne foi ;
//   · prétendre que le problème vient d'ailleurs quand il vient d'elle —
//     c'est le défaut corrigé ici ;
//   · donner un ordre qui ne peut pas aboutir (cf. le message Leboncoin du
//     12/09, retiré le jour même) ;
//   · nommer un champ interne, un identifiant ou un code.

/** Le rayon a-t-il été choisi par la personne, ou posé par nous ? */
export type SourceCategorie = "choix_humain" | "autre";

export interface MotsAspectAveugle {
  /** L'objet, dit avec les mots de la personne ou de la reconnaissance. */
  quoi: string;
  /** Le chemin du rayon actuellement retenu, déjà assemblé (« A › B › C »). */
  actuelle: string;
  /** Le chemin proposé par la reconnaissance, ou "" s'il n'y en a pas. */
  proposee: string;
  /** Les aspects obligatoires qu'eBay réclame et qui ne décrivent pas l'objet. */
  requis: string[];
}

const liste = (xs: string[]) => xs.join(", ");
const pluriel = (xs: string[], un: string, plusieurs: string) => (xs.length > 1 ? plusieurs : un);

// ── LE RAYON VIENT DE LA PERSONNE ───────────────────────────────────────────
// Elle a choisi « Meubles de salle de bain » pour un service de toilette :
// c'est logique vu de chez elle (toilette = salle de bain), et c'est pourtant
// le rayon des MEUBLES. L'ancien message lui disait « le problème vient de la
// catégorie, pas de toi » — elle ne pouvait donc pas comprendre quoi changer,
// puisque la catégorie, c'était elle.
//
// On dit la seule chose utile : ce rayon-là ne va pas à cet article-là, et
// voilà celui qu'on propose. Pas de reproche, pas de « pas de toi » qui sonne
// faux, pas d'ordre impossible.
export function aspectAveugleChoixHumain(m: MotsAspectAveugle): string {
  const diagnostic =
    `Le rayon que tu as choisi${m.actuelle ? ` — « ${m.actuelle} » — ` : " "}` +
    `ne correspond pas à « ${m.quoi} » : eBay y réclame ` +
    `${pluriel(m.requis, "le champ obligatoire", "les champs obligatoires")} ${liste(m.requis)}, ` +
    `et aucune des réponses proposées ne décrit cet objet.`;

  // La proposition de la reconnaissance passe DEVANT le geste : on ne renvoie
  // pas quelqu'un fouiller un arbre de 3 900 rayons sans lui tendre une piste.
  const suite = m.proposee
    ? ` On te propose plutôt « ${m.proposee} » — tu peux la prendre, ou choisir un autre rayon depuis la fiche de l'article.`
    : ` Choisis un autre rayon depuis la fiche de l'article.`;

  return `${diagnostic}${suite} Rien n'a été envoyé, rien n'a été décompté.`;
}

// ── LE RAYON VIENT DE NOUS ──────────────────────────────────────────────────
// Là, « le problème vient de la catégorie, pas de toi » est VRAI : personne
// n'a rien choisi. Le message d'origine est conservé au mot près.
export function aspectAveugleCategorieAuto(m: MotsAspectAveugle): string {
  return (
    `eBay réclame ${pluriel(m.requis, "un champ obligatoire", "des champs obligatoires")} ` +
    `(${liste(m.requis)}) qui ne ${pluriel(m.requis, "décrit", "décrivent")} pas « ${m.quoi} »` +
    (m.actuelle ? ` : la catégorie retenue est « ${m.actuelle} »` : "") +
    `. Le problème vient de la catégorie, pas de toi` +
    (m.proposee ? ` — la reconnaissance avait proposé « ${m.proposee} »` : "") +
    `. Change la catégorie eBay depuis la fiche de l'article, puis relance : rien n'a été envoyé, rien n'a été décompté.`
  );
}

/** La porte unique : c'est la SOURCE du rayon qui choisit les mots. */
export function motsAspectAveugle(source: SourceCategorie, m: MotsAspectAveugle): string {
  return source === "choix_humain" ? aspectAveugleChoixHumain(m) : aspectAveugleCategorieAuto(m);
}

/** La raison journalisée (diagnostic interne, jamais lue par la personne). */
export function raisonAspectAveugle(source: SourceCategorie, m: MotsAspectAveugle): string {
  return (
    `eBay : les ${m.requis.length} aspects obligatoires sont tous aveugles à « ${m.quoi} » — ` +
    (source === "choix_humain"
      ? "le rayon a été choisi à la main, on le dit sans le recalculer"
      : "c'est la catégorie qui est en cause")
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// eBay : LE COMPTE N'EST PAS ENCORE VENDEUR (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Au clic « Mettre en vente », eBay détourne vers son inscription vendeur
// (onboardweb.ebay.fr) les comptes qui n'ont jamais été activés pour vendre.
// La page n'est pas cassée, l'onglet n'a pas été suspendu, le canal n'a pas
// lâché : c'est un mur, et il ne tombera pas tout seul.
//
// Ce que la personne lisait jusqu'ici : « L'onglet de travail a été mis en
// veille par Chrome… On réessaie automatiquement, rien à faire de ton côté. »
// Trois mensonges en deux phrases — et trois reprises brûlées contre le même
// mur (bfcache_rearms = 3, mesuré) pendant qu'on lui disait de ne rien faire.
// Le nouvel inscrit du 21/09 (première publication, jamais aboutie) n'avait
// aucun moyen de savoir ce qu'on attendait de lui.
//
// ⛔ CE MESSAGE NE NOMME PAS DE PAGE. Relevé du 10/09 : ebay.fr/verifyidentity,
// /sellerregistration et /sh/acc/verification redirigent toutes vers une page
// d'erreur. On dit « connecte-toi à eBay », qui est vrai partout et le restera.
export function compteVendeurEbayInactif(action: string): string {
  const quoi = action === "delete" ? "le retrait"
    : action === "republish" ? "la republication"
    : "la publication";
  return (
    "Ton compte eBay n'est pas encore prêt pour vendre. " +
    "Connecte-toi à eBay sur ton ordinateur et termine ton inscription vendeur, " +
    `puis relance ${quoi}.`
  );
}

/** Le marqueur posé sur le job — nommé, donc mesurable et filtrable en base. */
export const SOURCE_EBAY_COMPTE_VENDEUR_INACTIF = "ebay_compte_vendeur_inactif";


// ═══════════════════════════════════════════════════════════════════════════
// OPLA : UN SEUL MESSAGE, UN SEUL BOUTON (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Capture de Louis (23/09 20:20) : sur ses cartes, en gris clair PAR-DESSUS la
// photo, « Opla s'autorise depuis FillSell dans Chrome : clique sur l'icône
// FillSell… ». En base, QUATRE textes pour la même cause : celui de
// l'extension (« ouvre le menu FillSell »), celui que handler-watch réécrivait
// toutes les demi-heures (« l'accès a été refusé… rien à faire de ton côté »
// — faux : sans le geste, rien ne repart), celui de pas-de-rouge, et celui de
// la sonde 401. Six comptes les lisaient (Louis ×12, geronimo, laforge,
// meminiandmove, pecqueux.sabine, thomas.vinted).
//
// DÉSORMAIS : CE texte, partout — serveur (pas-de-rouge, handler-watch),
// extension (background.js, popup.js) et app (BoutonMeConnecter). Les copies
// hors serveur sont vérifiées à l'octet par scripts/opla-message-unique-
// selftest.mjs. Le bouton « Autoriser Opla » est le seul geste, et c'est lui
// qui l'accomplit (ou l'ouvre sur l'ordinateur) — le message ne décrit ni
// icône, ni menu, ni navigateur.
// ⛔ « rien à faire de ton côté » est INTERDIT ici : la permission d'hôte ne
//    s'accorde pas toute seule.
export function autorisationOplaRequise(action: string): string {
  const quoi = action === "delete" ? "le retrait repart tout seul"
    : action === "republish" ? "la republication repart toute seule"
    : "la publication repart toute seule";
  return (
    "Opla attend ton autorisation pour que FillSell y dépose tes annonces. " +
    `Appuie sur « Autoriser Opla » : c'est une seule fois, et ${quoi}.`
  );
}
export const SOURCE_OPLA_ACCES = "opla_acces";

// ── OPLA : LES COOKIES DU SITE DÉPASSENT LA LIMITE DE SON HÉBERGEUR (2026-09-24)
// Louis, nuit du 23 au 24/09 : six kits arrêtés sur « Arbre Opla indisponible
// (HTTP 494) ». 494 = REQUEST_HEADER_TOO_LARGE chez Vercel, l'hébergeur
// d'Opla : un en-tête de requête dépasse 16 Ko, et les cookies comptent. Le
// site Opla a posé, dans CE profil Chrome, plus de cookies que son propre
// hébergeur n'en accepte : toute requête vers opla.co y est refusée, page ou
// API. Ce n'est ni l'annonce, ni FillSell — mais rien ne repart sans que ces
// cookies soient supprimés. L'extension le mesure (chrome.cookies) AVANT de
// tenter, purge elle-même quand aucune session n'est en jeu, et ne demande le
// geste que s'il y a une session à préserver. Le mot « relancer » n'a rien à
// faire ici : relancer, c'est retaper le même mur.
// Copie À L'OCTET dans chrome-extension/background.js (messageCookiesOpla),
// vérifiée par scripts/opla-message-unique-selftest.mjs.
// ⟦opla-cookies:début⟧
export function cookiesOplaTropVolumineux(action: string): string {
  const quoi = action === "delete" ? "le retrait repart tout seul"
    : action === "republish" ? "la republication repart toute seule"
    : "la publication repart toute seule";
  return (
    "Opla refuse les demandes de ce navigateur : les cookies du site opla.co y sont devenus trop volumineux " +
    "pour son hébergeur. C'est le site Opla qui les a posés — ni ton annonce ni FillSell —, et rien n'a été publié. " +
    "Pour débloquer : dans ce Chrome, supprime les cookies du site opla.co (Réglages Chrome › Confidentialité › " +
    `Données des sites › opla.co), puis reconnecte-toi à Opla ; dès que c'est fait, ${quoi}.`
  );
}
// ⟦opla-cookies:fin⟧
export const SOURCE_OPLA_COOKIES = "opla_cookies";

/** La session Opla est fermée (401/403) ALORS QUE l'autorisation est là :
 *  ce n'est pas le même geste. On le dit avec le bouton « Me connecter ». */
export function connexionOplaRequise(action: string): string {
  const quoi = action === "delete" ? "le retrait repart tout seul"
    : action === "republish" ? "la republication repart toute seule"
    : "la publication repart toute seule";
  return (
    "Connexion Opla requise : ta session Opla est fermée sur ton ordinateur. " +
    `Appuie sur « Me connecter » et connecte-toi à Opla — dès que c'est fait, ${quoi}.`
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// eBay : SANS CONNEXION API + MUR REAUTH → « CONNECTE TON COMPTE eBAY » (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Marie-Morgane (Mmojul56), inscrite le 23/09, première publication eBay : le
// job part par l'extension, bute sur le step-up « REAUTH VENTE » du flux de
// vente, et brûle ses cinq tentatives — elle n'a jamais relié de compte eBay
// par l'API, et rien ne l'y menait. La voie API existe et marche (34 comptes,
// 140 annonces en 7 jours) ; il manquait la porte pour y aller.
//
// ⛔ CE MESSAGE NE PARLE NI DE NAVIGATEUR NI DE SESSION, et ne dit jamais
//    « rien à faire ». Il nomme le geste — relier eBay — et promet la reprise
//    automatique, qui est tenue par ailleurs (voie API dès que le compte est
//    prêt). Le bouton « Me connecter » de la carte ouvre le parcours eBay.
export function connexionEbayRequise(action: string): string {
  const quoi = action === "delete" ? "ce retrait"
    : action === "republish" ? "cette republication"
    : "cette publication";
  // Formulation VALABLE SUR TOUS LES CLIENTS : le bouton « Me connecter »
  // n'existe pas encore sur toutes les versions installées — le message ne le
  // suppose donc pas, il nomme aussi l'endroit (« Réglages › Compte eBay »). Où
  // le bouton est là (web, prochaine OTA), il fait le même geste.
  return (
    "Connecte ton compte eBay pour vendre ici : une fois relié, FillSell publie tes annonces eBay " +
    "depuis ses serveurs, et tu n'as même plus besoin de laisser ton ordinateur allumé. " +
    "Relie ton compte dans « Réglages › Compte eBay » (ou avec le bouton « Me connecter » ci-dessous) — " +
    `dès que c'est prêt, ${quoi} part toute seule.`
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// UNE FUITE DE DÉVELOPPEUR N'ARRIVE JAMAIS À L'ÉCRAN (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Règle, sans exception : aucun message montré à quelqu'un ne porte un chemin
// de fichier, un nom de fonction, un identifiant technique ou un nom de route.
//
// L'app sait déjà se défendre (humanizeJobError : annexe d'observabilité
// retirée, incises techniques retirées, et repli générique si un marqueur
// survit). Mesuré sur les 237 formes de message du parc — 12 246 jobs — il
// n'en restait qu'UNE à l'écran : « update-job-status → ». Mais ce repli a un
// coût : il JETTE le message. adamchocho13 lisait « un imprévu technique »
// alors que sa ligne disait quelle étape avait échoué, chez qui.
//
// D'où cette requalification, côté serveur, au point de passage unique : on ne
// compte plus sur l'app pour cacher le brut, on écrit un texte propre À LA
// PLACE — et le brut part en platform_fields.error_technique, requêtable.
// Deux gains : plus rien ne peut fuir même si l'app change, et le message
// nomme la plateforme et l'étape au lieu de dire « imprévu ».
//
// ⛔ CE TEXTE NE DONNE PAS D'ORDRE QUI NE PEUT PAS ABOUTIR. On ne sait pas ce
//    qui a cassé — sinon un autre bloc l'aurait déjà nommé. On dit donc ce
//    qu'on sait (l'étape n'est pas passée, c'est de notre côté), et le seul
//    geste qui existe. Jamais « change ta catégorie » sur une supposition :
//    la ligne d'adamchocho13 disait « categoryId probablement refusé » et la
//    vraie cause était ailleurs (son compte eBay n'était pas vendeur).
export function fuiteDeDeveloppeur(platform: string, action: string, reprend: boolean): string {
  const nom = ({
    vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla",
  } as Record<string, string>)[platform] ?? "la plateforme";
  const quoi = action === "delete" ? "Le retrait de cette annonce"
    : action === "republish" ? "La republication de cette annonce"
    : "La publication de cet article";
  return reprend
    ? `${quoi} sur ${nom} s'est interrompue avant d'aboutir. Le problème vient de chez nous, ` +
      `il est enregistré, et on reprend automatiquement — rien à faire de ton côté.`
    : `${quoi} sur ${nom} n'a pas abouti, et la cause est de notre côté. ` +
      `Elle est enregistrée. Tu peux relancer depuis la fiche de l'article ; si ça se reproduit, écris-nous.`;
}
