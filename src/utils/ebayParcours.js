// ═══════════════════════════════════════════════════════════════════════════
// eBAY — LE PARCOURS, EN UN SEUL ENDROIT (2026-09-22, dossier Romain)
// ═══════════════════════════════════════════════════════════════════════════
// Romain (voirememe) est resté bloqué PLUSIEURS JOURS sur « ce qu'il y avait à
// compléter pour eBay, les options de livraison et les conditions de vente ».
// Son dernier job eBay date du 06/09 : il n'y en a eu aucun depuis, ni échec,
// ni « à toi de jouer ». Il a donc été arrêté DANS L'APP, avant même la
// création d'un job — un blocage qui ne laisse aucune trace.
//
// Ce module est la réponse : UNE description du parcours, lue par tous les
// écrans. Les Réglages en font un parcours guidé (une étape à la fois), le
// stepper et la carte d'article en tirent la phrase courte qui NOMME l'étape
// qui manque. Personne ne redécrit eBay dans son coin.
//
// ⛔ VOCABULAIRE : aucun mot d'eBay ni de développeur ne sort d'ici. Pas de
//    « business policies », pas d'« opt-in », pas de « privilège », pas de
//    « fulfillment », pas d'« API », pas d'« OAuth », pas de « jeton ».
//    Le selftest scripts/ebay-parcours-selftest.mjs le vérifie sur chaque
//    phrase livrée, dans les deux langues.
//
// ⛔ QUOTA : 5 000 appels eBay par jour pour TOUT le parc. Ce module ne fait
//    AUCUN appel. Il sait lire deux sources :
//      · `etat` (action 'statut' : un SELECT, zéro appel eBay) — c'est lui que
//        lisent l'app et ses écrans, partout ;
//      · `checklist` (5 appels Account API) — relevée seulement dans les
//        Réglages, quand la personne regarde vraiment son compte.
//    Les deux donnent le MÊME verdict par étape, c'est la garantie qu'un écran
//    gratuit ne contredit jamais l'écran payant.
// ═══════════════════════════════════════════════════════════════════════════

// L'ORDRE D'eBAY, pas le nôtre : une politique ne peut pas se créer avant que
// les conditions de vente soient activées, et rien ne se publie avant
// l'inscription vendeur. Le serveur rend ses lignes dans cet ordre-là
// (ebay-account/index.ts) ; on le fige ici pour que l'écran ne dépende pas de
// l'ordre d'un tableau JSON.
export const ETAPES_EBAY = [
  'inscription_vendeur',
  'politiques_activees',
  'politique_livraison',
  'politique_paiement',
  'politique_retours',
  'lieu_expedition',
];

// Les étapes qui se règlent CHEZ eBAY (on sort de l'app), avec le lien exact.
// ⛔ Aucun lien qui n'ait été ouvert et vérifié (garde-fou Nico) :
//    /sl/sell, /bp/policyoptin, /bp/manage — relevés le 05/09 dans la session
//    de Nico, revérifiés le 22/09.
export const LIENS_EBAY = {
  inscription_vendeur: 'https://www.ebay.fr/sl/sell',
  politiques_activees: 'https://www.ebay.fr/bp/policyoptin',
  politique_livraison: 'https://www.ebay.fr/bp/manage',
  politique_paiement: 'https://www.ebay.fr/bp/manage',
  politique_retours: 'https://www.ebay.fr/bp/manage',
};

// Les étapes qu'on sait faire NOUS-MÊMES, sans que la personne sorte de l'app.
// C'est la règle de Nico : on ne renvoie chez eBay que si eBay l'impose.
export const ETAPES_FAISABLES_ICI = new Set([
  'politiques_activees',
  'politique_livraison',
  'politique_paiement',
  'politique_retours',
  'lieu_expedition',
]);

// ── LES MOTS QUI N'ONT RIEN À FAIRE SOUS LES YEUX D'UN VENDEUR ─────────────
// ⚠️ ILS VIVENT ICI, PAS DANS LE SELFTEST. La leçon est écrite en toutes
//    lettres dans _shared/vocabulaire-developpeur.ts : un motif recopié dans
//    un script jetable est un motif qui dérive. Le contrôle lit CETTE liste.
//    Un mot ajouté ici est vérifié partout, sans qu'on touche au script.
export const MOTS_INTERDITS_ECRAN = [
  'business polic',   // « business policies » : le nom d'eBay, pas le nôtre
  'opt-in', 'optin',
  'privilège', 'privilege',
  'fulfillment',
  'marketplace_id',
  ' api', 'api ', "d'api",   // « API » n'est jamais montré
  'oauth',
  'jeton', 'token',
  'endpoint', 'webhook',
  'checklist',
];

const MOTS = {
  fr: {
    pret: 'eBay est prêt, tes articles peuvent partir.',
    pretSous: 'Tes annonces eBay partent de nos serveurs. Ton ordinateur peut rester éteint.',
    compteur: (n, total) => `Étape ${n} sur ${total}`,
    restantes: (n) => (n > 1 ? `${n} étapes à finir` : '1 étape à finir'),
    cestQuoi: 'Ce que c\'est',
    pourquoi: 'Pourquoi eBay le demande',
    faites: (n) => (n > 1 ? `${n} étapes déjà faites` : '1 étape déjà faite'),
    voirFaites: 'Voir ce qui est déjà fait',
    modifier: 'Modifier',
    masquerFaites: 'Masquer',
    etapes: {
      inscription_vendeur: {
        titre: 'Ton inscription vendeur',
        cestQuoi: 'eBay veut savoir qui tu es et sur quel compte te verser l\'argent de tes ventes.',
        pourquoi: 'Tant qu\'elle n\'est pas finie, eBay refuse de mettre quoi que ce soit en vente.',
        bouton: 'Finir mon inscription sur eBay',
        // La phrase tient quelle que soit la page d'arrivée : le parcours
        // d'inscription eBay n'a pas d'adresse publique stable (aide id=4792).
        apres: 'eBay s\'ouvre sur ton compte vendeur. Si la page ne te propose pas directement de finir, cherche le bandeau de vérification en haut : c\'est là qu\'eBay dit ce qu\'il lui manque. Reviens ensuite ici, l\'étape se coche toute seule.',
      },
      politiques_activees: {
        titre: 'Tes conditions de vente',
        cestQuoi: 'Ce que tu promets à l\'acheteur : comment tu livres, comment il paie, s\'il peut te renvoyer l\'article.',
        pourquoi: 'eBay demande de les activer avant de te laisser les remplir.',
        bouton: 'Activer depuis FillSell',
        apres: 'Rien ne part chez l\'acheteur : on demande juste à eBay d\'ouvrir ces réglages sur ton compte.',
      },
      politique_livraison: {
        titre: 'Comment tu livres',
        cestQuoi: 'Les transporteurs que tu proposes, et ce que l\'acheteur paie pour l\'envoi.',
        pourquoi: 'eBay affiche ce prix sur ton annonce : sans lui, l\'annonce ne peut pas partir.',
        bouton: 'Choisir mes transporteurs',
        apres: 'Tu vois le prix que paiera l\'acheteur pour chaque transporteur, et tu peux le changer.',
      },
      politique_paiement: {
        titre: 'Comment tu es payé',
        cestQuoi: 'eBay encaisse l\'acheteur, puis te reverse l\'argent sur ton compte.',
        pourquoi: 'eBay exige ce réglage sur ton compte, même s\'il ne te laisse rien choisir dessus.',
        bouton: 'Créer depuis FillSell',
        apres: 'Un seul réglage possible chez eBay : le paiement à l\'achat. On le pose pour toi.',
      },
      politique_retours: {
        titre: 'Si l\'acheteur veut te renvoyer l\'article',
        cestQuoi: 'Tu dis si tu acceptes les retours, et sous combien de jours.',
        pourquoi: 'eBay l\'affiche sur ton annonce et le demande avant la mise en ligne.',
        bouton: 'Créer depuis FillSell',
        apres: 'Tu choisis : retours acceptés sous 30 jours, ou pas de retour.',
      },
      lieu_expedition: {
        titre: 'D\'où part le colis',
        cestQuoi: 'Ta ville et ton code postal. Ni ta rue, ni ton numéro.',
        pourquoi: 'eBay calcule les délais de livraison depuis ce point de départ.',
        bouton: 'Enregistrer',
        apres: 'Seuls la ville et le code postal partent chez eBay.',
      },
    },
    // ── La phrase courte, partout ailleurs (stepper, carte d'article) ───────
    resume: {
      non_connecte: 'eBay : ton compte eBay n\'est pas encore relié.',
      a_reconnecter: 'eBay : ton compte eBay est à reconnecter.',
      manque: (titre) => `eBay : il reste une étape — ${titre.toLowerCase()}.`,
      manquePlusieurs: (titre, n) => `eBay : il reste ${n} étapes, à commencer par ${titre.toLowerCase()}.`,
      inconnu: 'eBay : ton compte vendeur n\'est pas fini de paramétrer.',
    },
    geste: 'Reprendre où j\'en suis',
    gesteRelier: 'Relier eBay',
  },
  en: {
    pret: 'eBay is ready — your items can go out.',
    pretSous: 'Your eBay listings go out from our servers. Your computer can stay off.',
    compteur: (n, total) => `Step ${n} of ${total}`,
    restantes: (n) => (n > 1 ? `${n} steps left` : '1 step left'),
    cestQuoi: 'What it is',
    pourquoi: 'Why eBay asks for it',
    faites: (n) => (n > 1 ? `${n} steps already done` : '1 step already done'),
    voirFaites: 'See what is already done',
    modifier: 'Change',
    masquerFaites: 'Hide',
    etapes: {
      inscription_vendeur: {
        titre: 'Your seller registration',
        cestQuoi: 'eBay wants to know who you are and which account to pay your sales into.',
        pourquoi: 'Until it is finished, eBay refuses to put anything up for sale.',
        bouton: 'Finish my registration on eBay',
        apres: 'eBay opens on your seller account. If the page does not offer to finish it straight away, look for the verification banner at the top — that is where eBay says what it still needs. Come back here and the step ticks itself.',
      },
      politiques_activees: {
        titre: 'Your selling terms',
        cestQuoi: 'What you promise the buyer: how you ship, how they pay, whether they can send the item back.',
        pourquoi: 'eBay asks you to switch them on before it lets you fill them in.',
        bouton: 'Switch on from FillSell',
        apres: 'Nothing reaches the buyer: we simply ask eBay to open those settings on your account.',
      },
      politique_livraison: {
        titre: 'How you ship',
        cestQuoi: 'The carriers you offer, and what the buyer pays for postage.',
        pourquoi: 'eBay shows that price on your listing: without it, the listing cannot go out.',
        bouton: 'Choose my carriers',
        apres: 'You see what the buyer will pay for each carrier, and you can change it.',
      },
      politique_paiement: {
        titre: 'How you get paid',
        cestQuoi: 'eBay takes the buyer\'s money, then pays it into your account.',
        pourquoi: 'eBay requires this setting on your account, even though it lets you choose nothing on it.',
        bouton: 'Create from FillSell',
        apres: 'Only one setting exists at eBay: payment on purchase. We put it in place for you.',
      },
      politique_retours: {
        titre: 'If the buyer wants to send the item back',
        cestQuoi: 'You say whether you accept returns, and within how many days.',
        pourquoi: 'eBay shows it on your listing and asks for it before going live.',
        bouton: 'Create from FillSell',
        apres: 'You choose: returns accepted within 30 days, or no returns.',
      },
      lieu_expedition: {
        titre: 'Where the parcel ships from',
        cestQuoi: 'Your town and postcode. Not your street, not your number.',
        pourquoi: 'eBay works out delivery times from that starting point.',
        bouton: 'Save',
        apres: 'Only the town and the postcode reach eBay.',
      },
    },
    resume: {
      non_connecte: 'eBay: your eBay account is not linked yet.',
      a_reconnecter: 'eBay: your eBay account needs reconnecting.',
      manque: (titre) => `eBay: one step left — ${titre.toLowerCase()}.`,
      manquePlusieurs: (titre, n) => `eBay: ${n} steps left, starting with ${titre.toLowerCase()}.`,
      inconnu: 'eBay: your seller account is not fully set up yet.',
    },
    geste: 'Pick up where I left off',
    gesteRelier: 'Link eBay',
  },
};

export const motsEbay = (lang) => MOTS[lang === 'en' ? 'en' : 'fr'];

// ── LES VERDICTS, DEPUIS LA SOURCE GRATUITE ────────────────────────────────
// `etat` = la vue publique rendue par l'action 'statut' (aucun appel eBay).
// `seller_state` y est le relevé de la dernière checklist, stocké en base :
// il dit, par étape, true / false / null (jamais lu). `politiques` dit quelle
// politique est RETENUE pour FillSell.
//
// Une politique compte pour faite quand elle est RETENUE — pas quand le compte
// en possède une : c'est l'identifiant retenu que lit le trigger, et lui seul
// décide de la voie. Avoir dix politiques chez eBay sans en désigner une ne
// publie rien (c'était l'écart exact du dossier Romain).
export function etatsEbayDepuisEtat(etat) {
  const s = etat?.seller_state ?? null;
  const pol = etat?.politiques ?? null;
  const tri = (v) => (v == null ? 'inconnu' : v ? 'ok' : 'manque');
  const triPolitique = (retenue, dispo) => {
    if (retenue) return 'ok';
    // Aucune retenue : si on sait que le compte n'en a aucune, c'est « manque ».
    // Si on sait qu'il en a, c'est « manque » aussi — il reste à en désigner
    // une. On ne dit « inconnu » que si on n'a jamais rien lu.
    if (dispo == null && !s) return 'inconnu';
    return 'manque';
  };
  return {
    inscription_vendeur: tri(s?.inscription_vendeur),
    politiques_activees: tri(s?.politiques_activees),
    politique_livraison: triPolitique(pol?.fulfillment, s?.politiques?.livraison),
    politique_paiement: triPolitique(pol?.payment, s?.politiques?.paiement),
    politique_retours: triPolitique(pol?.return, s?.politiques?.retours),
    lieu_expedition: tri(s?.lieu_expedition),
  };
}

// `checklist` = le relevé complet (Réglages). Les lignes indéterminables ne
// sont PAS renvoyées par le serveur : leur absence vaut 'inconnu', jamais un
// conditionnel à l'écran.
export function etatsEbayDepuisChecklist(checklist) {
  const par = new Map((checklist?.lignes ?? []).map((l) => [l.cle, l.etat]));
  const out = {};
  for (const cle of ETAPES_EBAY) out[cle] = par.get(cle) ?? 'inconnu';
  return out;
}

// ── LE PARCOURS, DANS L'ORDRE ──────────────────────────────────────────────
// Une étape « inconnu » n'est ni faite ni à faire : elle ne s'affiche pas et
// ne bloque pas le passage à la suivante. On n'invente pas un état qu'on n'a
// pas lu.
export function etapesEbay(etats, lang = 'fr') {
  const m = motsEbay(lang);
  return ETAPES_EBAY
    .filter((cle) => (etats?.[cle] ?? 'inconnu') !== 'inconnu')
    .map((cle) => ({
      cle,
      fait: etats[cle] === 'ok',
      lien: LIENS_EBAY[cle] ?? null,
      ici: ETAPES_FAISABLES_ICI.has(cle),
      ...m.etapes[cle],
    }));
}

// L'étape COURANTE : la première non faite, dans l'ordre d'eBay. C'est la
// seule qu'on montre en grand — une à la fois, jamais six.
export function etapeCouranteEbay(etats) {
  for (const cle of ETAPES_EBAY) {
    const e = etats?.[cle] ?? 'inconnu';
    if (e === 'manque') return cle;
  }
  return null;
}

export function progressionEbay(etats) {
  const lues = ETAPES_EBAY.filter((cle) => (etats?.[cle] ?? 'inconnu') !== 'inconnu');
  const faites = lues.filter((cle) => etats[cle] === 'ok');
  return {
    faites: faites.length,
    total: lues.length,
    restantes: lues.length - faites.length,
    // « Prêt » exige qu'on ait LU au moins une étape : un compte dont on ne
    // sait rien n'est pas déclaré prêt.
    pret: lues.length > 0 && faites.length === lues.length,
  };
}

// ── LA PHRASE COURTE, POUR LES ÉCRANS QUI NE SONT PAS LES RÉGLAGES ─────────
// Elle NOMME l'étape qui manque — c'est tout le dossier Romain : « pas évident
// de savoir ce qu'il y avait à faire ». Elle ne diagnostique rien, elle ne
// gronde pas, et elle est toujours accompagnée d'un bouton par l'appelant.
//
// Rend { pret, motif, cle, phrase, bouton } :
//   · motif 'non_connecte' | 'a_reconnecter' | 'a_finir' | 'inconnu' | null
//   · cle   l'étape à reprendre, quand on la connaît
export function resumeEbay(etat, lang = 'fr') {
  const m = motsEbay(lang);
  if (!etat || !etat.connecte) {
    const aReconnecter = Boolean(etat?.a_reconnecter);
    return {
      pret: false,
      motif: aReconnecter ? 'a_reconnecter' : 'non_connecte',
      cle: null,
      phrase: aReconnecter ? m.resume.a_reconnecter : m.resume.non_connecte,
      bouton: m.gesteRelier,
    };
  }
  const etats = etatsEbayDepuisEtat(etat);
  const prog = progressionEbay(etats);
  if (prog.pret) return { pret: true, motif: null, cle: null, phrase: m.pret, bouton: null };
  const cle = etapeCouranteEbay(etats);
  if (!cle) {
    // Rien de lu : on ne nomme pas une étape qu'on n'a pas relevée.
    return { pret: false, motif: 'inconnu', cle: null, phrase: m.resume.inconnu, bouton: m.geste };
  }
  const titre = m.etapes[cle].titre;
  return {
    pret: false,
    motif: 'a_finir',
    cle,
    phrase: prog.restantes > 1 ? m.resume.manquePlusieurs(titre, prog.restantes) : m.resume.manque(titre),
    bouton: m.geste,
  };
}
