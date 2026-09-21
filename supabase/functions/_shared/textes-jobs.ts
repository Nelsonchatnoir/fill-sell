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
