// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LE PLAN (2026-09-20 ; refonte du 18/11/2026, lot T1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// L'ordre des écrans est une DONNÉE, pas du JSX. La coque (ParcoursEntree) ne
// connaît que cette liste ; elle n'énumère jamais les étapes elle-même.
//
// ┌─ OÙ SE DÉCLARE UNE NOUVELLE ÉTAPE ───────────────────────────────────────┐
// │ 1. Ici, un objet de plus, à sa place dans le tableau.                    │
// │ 2. Son composant dans ECRANS (ParcoursEntree.jsx), une ligne de plus.    │
// │ 3. Ses mots dans textes.js (fr + en).                                    │
// │ Rien d'autre. Pas une ligne dans App.jsx.                                │
// └──────────────────────────────────────────────────────────────────────────┘
//
// FORME D'UNE ÉTAPE :
//   id       string          stable — clé de rendu, clé de reprise, valeur de
//                            trace analytics
//   visible  (c) => bool     défaut : toujours visible. `c` = le contexte monté
//                            une fois par la coque (useContexteEntree)
//
// ⛔ AUCUNE ÉTAPE NE BLOQUE L'ENTRÉE DANS L'APP : chaque écran garde une sortie (son bouton, ou une action discrète en
//    bas qui dit ce qu'elle implique) ; la DERNIÈRE étape visible fait sortir du parcours (coque : `suivant`).
// ⛔ AUCUNE LOGIQUE MÉTIER ICI : une étape LIT le contexte, elle ne calcule rien, n'appelle rien.
//
// (18/11/2026, lot T1 de Nico — maquettes validées le 18/11) LA REFONTE. Mesuré le 18/11 sur 49 inscrits : 28 répondent
// « pas d'ordinateur », 27 voient « Choisis ta formule » (étape 4/8, trois gros prix, « Passer » en haut), 0 vrai clic
// sur une offre, 19 « Passer », 0 essai ; 3 synchros, 2 publications. Les 2 derniers essais ont été pris sur la carte
// Cloud du Stock, hors de l'accueil. Donc :
//   · « As-tu un ordinateur ? » est la 2e étape de TOUT téléphone (iPhone, Android, navigateur de téléphone) ; sur
//     ordinateur (web), elle n'existe pas : on y est, l'extension vient tout de suite ;
//   · « Non » → UN SEUL écran Cloud (`cloud_offre` : Pro + Cloud, 7 jours gratuits quand le compte y a droit, un gros
//     bouton, « Plus tard » discret en bas) au lieu de trois (présentation, « Choisis ta formule », « Rien à payer
//     avant le … ») ; « Plus tard » → `sans_cloud` (« Pour publier, il te faut un ordinateur », le lien par mail) ;
//   · Cloud seul (compte sans les formules, ex. Android avant la vc38) : l'écran `cloud` d'avant, inchangé ;
//   · plus de « Passer » en haut à droite, ni d'explication des remontées, ni de récap « À toi de jouer », ni de
//     « Ta formule » : la sortie mène au Stock (carte Cloud en grand pour qui ne l'a pas pris).
// La voie (`c.voie`) : null (pas encore choisie), 'cloud', 'extension', 'sans_cloud'.
const formules = (c) => c.formules?.parcours === true;
// Le téléphone : l'app iPhone / Android, ou un navigateur de téléphone (useContexteEntree.surTelephone).
const telephone = (c) => c.surTelephone === true;
// Le Cloud pris sur cette voie : la formule (serveur lu ou achat réussi) — sa connexion demande le Cloud ouvert —, ou
// le Cloud seul d'avant.
const cloudActif = (c) => (formules(c) ? c.formules.actif === true && c.cloud?.ouvert === true : c.cloud?.actif === true);
// (19/11/2026, point 5 de Nico) Le Cloud du compte est OFFERT (cloud/cloudOffert.js, lu par les deux lectures du parcours) :
// aucun écran de vente du Cloud — « Non, pas d'ordinateur » mène directement à la connexion (offert actif).
const cloudOffert = (c) => c.formules?.cloudOffert === true || c.cloud?.cloudOffert === true;

export const ETAPES = [
  { id: 'plateformes' },
  // « As-tu un ordinateur ? » — téléphone seulement.
  { id: 'ordinateur', visible: telephone },
  // « Non » : l'écran Cloud unique (formules avec Cloud), ou le Cloud seul d'avant — jamais pour un Cloud offert.
  { id: 'cloud_offre', visible: (c) => telephone(c) && c.voie === 'cloud' && formules(c) && !cloudOffert(c) },
  { id: 'cloud', visible: (c) => telephone(c) && c.voie === 'cloud' && !formules(c) && c.cloud?.parcours === true && !cloudOffert(c) },
  // « Plus tard » sur le Cloud (ou aucun Cloud vendu à ce compte) : il te faut un ordinateur.
  { id: 'sans_cloud', visible: (c) => telephone(c) && c.voie === 'sans_cloud' },
  // « Connecte tes comptes, une fois » — seulement une fois le Cloud actif (le serveur le dit).
  { id: 'cloud_connexion', visible: (c) => telephone(c) && c.voie === 'cloud' && cloudActif(c) },
  // L'extension : tout ordinateur ; sur téléphone, « Oui, j'ai un ordinateur ».
  { id: 'extension', visible: (c) => !telephone(c) || c.voie === 'extension' },
  // Deux faces d'une même marche : « Je n'ai encore rien en ligne » (aucune plateforme cochée) SAUTE le relevé. Sans
  // voie de publication (`sans_cloud`), ni l'un ni l'autre : rien ne pourrait partir.
  { id: 'releve', visible: (c) => c.choix.plateformes.length > 0 && c.voie !== 'sans_cloud' },
  { id: 'debut', visible: (c) => c.choix.plateformes.length === 0 && c.voie !== 'sans_cloud' },
  // Dernière question, et seulement si personne ne nous a donné de nom.
  { id: 'pseudo', visible: (c) => c.demanderPseudo },
];

export function etapesVisibles(contexte) {
  return ETAPES.filter((e) => (typeof e.visible === 'function' ? e.visible(contexte) : true));
}

// Les étapes retirées du parcours, et celle(s) APRÈS laquelle (lesquelles) elles se trouvaient : un appareil dont la
// position gardée (fs_entree_etape) est l'une d'elles reprend à l'étape qui suit, jamais au tout début.
// (13/11/2026) ebay, free. (18/11/2026) voie, cloud_presentation, cloud_offres (le choix se refait : « As-tu un
// ordinateur ? »), republication, formule, fin (le récap : la dernière étape qui reste).
export const ETAPES_RETIREES = Object.freeze({
  ebay: ['plateformes'],
  voie: ['plateformes'],
  cloud_presentation: ['plateformes'],
  cloud_offres: ['plateformes'],
  free: ['releve', 'debut'],
  republication: ['releve', 'debut'],
  formule: ['releve', 'debut'],
  fin: ['pseudo', 'releve', 'debut'],
});

// (19/11/2026, point 5 de Nico) Les écrans de vente du Cloud, MASQUÉS à un Cloud offert : demandés (« Non, pas d'ordinateur »
// → onAller('cloud_offre' | 'cloud')) ou gardés comme position, ils reprennent après « As-tu un ordinateur ? » — la connexion
// pour un Cloud offert actif — jamais au tout début.
export const ETAPES_MASQUEES_REPRISE = Object.freeze({
  cloud_offre: ['ordinateur'],
  cloud: ['ordinateur'],
});

/** L'index où reprendre `etapeId` dans `liste` : sa place, sinon (étape retirée ou masquée) la suivante, sinon le début. */
export function indexDeReprise(liste, etapeId) {
  const l = Array.isArray(liste) ? liste : [];
  const i = l.findIndex((e) => e.id === etapeId);
  if (i >= 0) return i;
  const avant = ETAPES_RETIREES[etapeId] ?? ETAPES_MASQUEES_REPRISE[etapeId];
  for (const a of (Array.isArray(avant) ? avant : avant ? [avant] : [])) {
    const j = l.findIndex((e) => e.id === a);
    if (j >= 0) return Math.min(l.length - 1, j + 1);
  }
  return 0;
}
