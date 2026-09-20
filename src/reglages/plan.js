// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — LE PLAN DE LA PAGE (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// LE hub des réglages est une DONNÉE, pas du JSX : sept groupes, chacun une
// liste d'entrées. Le rendu (ReglagesPage) ne connaît que cette forme, il
// n'énumère jamais les réglages lui-même.
//
// ┌─ OÙ SE DÉCLARE UNE NOUVELLE ENTRÉE ──────────────────────────────────────┐
// │ 1. Ici, dans le tableau `entrees` du groupe visé : UN objet de plus.     │
// │ 2. Si elle ouvre une sous-page : son composant dans SOUS_PAGES           │
// │    (ReglagesPage.jsx), UNE ligne de plus, et `ouvre:'<son id>'` ici.     │
// │ 3. Ses mots dans textes.js (fr + en).                                    │
// │ Rien d'autre. Pas une ligne dans App.jsx, pas une condition dans le      │
// │ rendu du hub.                                                            │
// └──────────────────────────────────────────────────────────────────────────┘
//
// FORME D'UNE ENTRÉE — tout est optionnel sauf `id` et `libelle` :
//   id       string        stable (clé de rendu ET nom de trace analytics)
//   icone    Composant     une icône lucide-react
//   libelle  (T) => string T = le dictionnaire de textes.js
//   valeur   (c, T) =>     ce qui s'affiche À DROITE : une chaîne, ou
//                          { texte, alerte:true } pour la teinter en négatif,
//                          ou null pour ne rien afficher. `c` = le contexte.
//   ouvre    string        id d'une sous-page (SOUS_PAGES, ReglagesPage.jsx)
//   href     (c) => string lien externe / route (mailto:, /legal, …)
//   cible    string        target du lien ('_blank' pour sortir de l'app)
//   action   (c) => void   geste direct (ouvrir une modale existante, …)
//   visible  (c) => bool   défaut : toujours visible
//
// ⛔ UN GROUPE SANS ENTRÉE VISIBLE NE S'AFFICHE PAS — mais il reste déclaré.
//    C'est le cas d'AUTOMATISMES pour un compte sans republication planifiée :
//    le conteneur existe, il attend la messagerie IA et l'auto-négociation.
// ⛔ AUCUNE LOGIQUE MÉTIER ICI. Une entrée LIT le contexte, elle ne calcule
//    rien : pas d'appel serveur, pas de règle de palier, pas de date. Le
//    contexte est monté une fois par ReglagesPage.
import {
  CreditCard, Link2, MapPin, Truck, Repeat, User, Globe, Coins,
  LifeBuoy, Bug, FileText, Puzzle, ShieldCheck, ListChecks,
} from 'lucide-react';

// ── QUI VOIT L'ARBITRAGE DU CATALOGUE ──────────────────────────────────────
// Une seule personne tranche ce qui devient obligatoire pour tout le parc :
// valider un champ ici le fait apparaître chez TOUS les utilisateurs de la
// catégorie. Les alias « +suffixe » sont retirés avant comparaison (Gmail les
// livre à la même boîte) — sinon l'entrée disparaîtrait sur une adresse
// aliasée. ⚠️ C'est un masque d'AFFICHAGE, pas une garde de données : les
// tables du catalogue restent lisibles par tout compte connecté (RLS). Fermer
// vraiment la porte demande une migration, pas cette ligne.
const ARBITRES = ['nicolas.svobodny@gmail.com', 'hoosslocal@gmail.com'];
const estArbitre = (c) => {
  const e = String(c.user?.email ?? '').trim().toLowerCase();
  if (!e.includes('@')) return false;
  const [locale, hote] = e.split('@');
  return ARBITRES.includes(`${locale.split('+')[0]}@${hote}`);
};

export const GROUPES = [
  // ── 1. ABONNEMENT ────────────────────────────────────────────────────────
  // Le seul groupe qui porte une CARTE DE CONTENU dans le hub : la
  // consommation du mois, la seule chose qu'on veut sous les yeux sans entrer.
  {
    id: 'abonnement',
    intitule: (T) => T.gAbonnement,
    carte: 'consommation',
    entrees: [
      {
        id: 'gerer-abonnement',
        icone: CreditCard,
        libelle: (T) => T.gererAbonnement,
        valeur: (c) => c.nomFormule,
        ouvre: 'abonnement',
      },
    ],
  },

  // ── 2. MES PLATEFORMES ───────────────────────────────────────────────────
  {
    id: 'plateformes',
    intitule: (T) => T.gPlateformes,
    entrees: [
      {
        id: 'comptes-connectes',
        icone: Link2,
        libelle: (T) => T.comptesConnectes,
        valeur: (c, T) => (c.sessions.total > 0 ? T.surN(c.sessions.connectes, c.sessions.total) : null),
        ouvre: 'plateformes',
      },
      {
        // Arbitrage du catalogue des champs — réservé. Ce n'est pas un réglage
        // de compte : c'est une décision qui engage tous les utilisateurs.
        id: 'champs-plateformes',
        icone: ListChecks,
        libelle: (T) => T.champsPlateformes,
        ouvre: 'catalogue-quarantaine',
        visible: estArbitre,
      },
    ],
  },

  // ── 3. EXPÉDITION ────────────────────────────────────────────────────────
  // 🚨 CONTENEUR. L'adresse de remise vivait dans les réglages, les
  // transporteurs étaient enfouis dans la carte eBay : ils sont réunis ici.
  // Les BORDEREAUX arriveront dans ce groupe — une entrée de plus, rien
  // d'autre à toucher.
  {
    id: 'expedition',
    intitule: (T) => T.gExpedition,
    entrees: [
      {
        id: 'adresse-remise',
        icone: MapPin,
        libelle: (T) => T.adresseRemise,
        valeur: (c, T) => (c.adresseLbc.renseignee
          ? c.adresseLbc.resume
          : { texte: T.aRenseigner, alerte: true }),
        ouvre: 'expedition',
      },
      {
        // Pas de valeur à droite : ce que contient la politique de livraison
        // vit chez eBay, et l'afficher ici demanderait de l'interroger au
        // chargement du hub. On ne fait pas payer une requête à une étiquette.
        id: 'transporteurs',
        icone: Truck,
        libelle: (T) => T.transporteurs,
        ouvre: 'transporteurs',
      },
    ],
  },

  // ── 4. AUTOMATISMES ──────────────────────────────────────────────────────
  // 🚨 CONTENEUR. Aujourd'hui : la republication planifiée, remontée du pied
  // de page du Stock — c'est un réglage, sa place est ici. Demain : la
  // MESSAGERIE IA (ton des réponses, validation avant envoi, horaires) et
  // l'AUTO-NÉGOCIATION (prix plancher, décote acceptée, réponse automatique
  // aux offres). Chacune = une entrée de plus dans ce tableau.
  {
    id: 'automatismes',
    intitule: (T) => T.gAutomatismes,
    entrees: [
      {
        id: 'republication-auto',
        icone: Repeat,
        libelle: (T) => T.republicationAuto,
        valeur: (c, T) => (c.republication.actif
          ? [T.actif, c.republication.creneau].filter(Boolean).join(' · ')
          : T.inactif),
        action: (c) => c.ouvrirRepublication(),
        visible: (c) => c.republication.exposee,
      },
    ],
  },

  // ── 5. PRÉFÉRENCES ───────────────────────────────────────────────────────
  // Trois entrées, une seule sous-page : chacune porte SA valeur dans le hub
  // (on lit son pseudo, sa langue et sa devise sans entrer), et l'écran qui
  // s'ouvre les porte toutes les trois.
  {
    id: 'preferences',
    intitule: (T) => T.gPreferences,
    entrees: [
      {
        id: 'profil',
        icone: User,
        libelle: (T) => T.monProfil,
        valeur: (c) => c.username || null,
        ouvre: 'preferences',
      },
      {
        id: 'langue',
        icone: Globe,
        libelle: (T) => T.langue,
        valeur: (c, T) => T.langueValeur,
        ouvre: 'preferences',
      },
      {
        id: 'devise',
        icone: Coins,
        libelle: (T) => T.devise,
        valeur: (c) => c.deviseLabel,
        ouvre: 'preferences',
      },
    ],
  },

  // ── 6. AIDE ──────────────────────────────────────────────────────────────
  {
    id: 'aide',
    intitule: (T) => T.gAide,
    entrees: [
      {
        id: 'support',
        icone: LifeBuoy,
        libelle: (T) => T.support,
        href: () => 'mailto:support@fillsell.app',
      },
      {
        id: 'signaler-bug',
        icone: Bug,
        libelle: (T) => T.signalerBug,
        action: (c) => c.ouvrirSignalementBug(),
        // L'envoi exige un Bearer utilisateur : sans compte, ce bouton ne
        // ferait rien — il n'existe donc pas.
        visible: (c) => Boolean(c.user),
      },
      {
        id: 'extension-chrome',
        icone: Puzzle,
        libelle: (T) => T.extensionChrome,
        href: () => '/extension',
        // Impossible à installer depuis un mobile (app native comme navigateur).
        visible: (c) => c.extensionInstallable,
      },
      {
        id: 'mentions-legales',
        icone: FileText,
        libelle: (T) => T.mentionsLegales,
        href: () => '/legal',
      },
    ],
  },

  // ── 7. MON COMPTE ────────────────────────────────────────────────────────
  // La déconnexion et la zone sensible vivent dans la sous-page : le hub ne
  // porte AUCUNE action destructrice.
  {
    id: 'compte',
    intitule: (T) => T.gCompte,
    entrees: [
      {
        id: 'compte-donnees',
        icone: ShieldCheck,
        libelle: (T) => T.compteEtDonnees,
        ouvre: 'compte',
      },
    ],
  },
];

// Les entrées d'un groupe que le contexte rend visibles.
export function entreesVisibles(groupe, contexte) {
  return (groupe.entrees ?? []).filter((e) => (typeof e.visible === 'function' ? e.visible(contexte) : true));
}
