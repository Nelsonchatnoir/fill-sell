// LA CONNEXION PAR UN FOURNISSEUR (« Se connecter avec Google ») — ce que l'écran « Me connecter » en dit (pur : ni réseau,
// ni DOM, ni page lue — l'ADRESSE seule). Testé par tests/fournisseur-connexion.test.mjs (verrou :
// selftest:cloud-connexion-fournisseur).
//
// (19/11/2026, client Cloud 8fd44622 — décision de Nico) Sur Vinted, Leboncoin et Beebs, il a choisi « Se connecter avec
// Google » : la page Google « Saisissez votre mot de passe » a répondu « Mot de passe incorrect » à chaque essai (il tapait
// sans doute le mot de passe de la plateforme, ou celui de sa boîte mail). Le serveur voyait le passage chez Google
// (connexion_redirection_fournisseur) ; l'écran n'en disait rien.
// Règle, pour tous les comptes et toutes les plateformes :
//   · quand la page AFFICHÉE (la page de connexion, ou la fenêtre qu'elle a ouverte : Beebs) est chez Google, le serveur le
//     dit à l'écran — { t:'fournisseur', nom:'google', plateforme } — et { nom: null } quand elle en sort (retour sur la
//     plateforme, fenêtre fermée, connectée, page fermée) ; une app d'avant ignore ce message (aucune branche pour lui) ;
//   · l'écran dit « C'est le mot de passe de ton compte Google qu'il faut taper, pas celui de <Plateforme> », avec
//     « Me connecter avec mon e-mail <Plateforme> » : { t:'revenir_plateforme' } ferme la fenêtre Google et renvoie la page
//     à son adresse de connexion de départ (connexion.js, revenirPlateforme) ; un serveur d'avant l'ignore ;
//   · jamais : lire, écrire, taper ou cliquer quoi que ce soit dans la page de Google.
// Google seulement (décision du 19/11) ; Apple ou Facebook se nommeraient ici d'une ligne (et dans textesConnexion.js).

// Les pages de Google pendant une connexion : accounts.google.<pays>, www.google.<pays>/accounts/, gds.google.com,
// myaccount.google.com (redirectionFournisseur), et le dépôt des cookies sur accounts.youtube.com. La navigation, elle,
// reste jugée par navigationPermise (plateformes.js) : seules les pages de connexion de Google s'affichent.
const HOTES = Object.freeze([
  ['google', /(^|\.)google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/],
  ['google', /^accounts\.youtube\.com$/],
]);

/** Le fournisseur de connexion d'une adresse (pure) : 'google', ou null (la plateforme, Kiabi, Apple, about:blank…). */
export function fournisseurDe(url) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const hote = u.hostname.toLowerCase();
  return HOTES.find(([, r]) => r.test(hote))?.[0] ?? null;
}

/** Le message à l'écran (pure) : { t:'fournisseur', nom, plateforme } — nom null = la page a quitté le fournisseur. */
export function messageFournisseur(nom, plateforme) {
  return { t: 'fournisseur', nom: nom ?? null, plateforme };
}
