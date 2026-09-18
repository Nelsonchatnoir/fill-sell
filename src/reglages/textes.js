// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — LE VOCABULAIRE, EN UN SEUL ENDROIT (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ UN SEUL MOT PAR CHOSE, dans toute la page et ses sous-pages :
//   · « Réglages » (jamais « Paramètres », jamais « Préférences » pour la page) ;
//   · « formule » pour l'abonnement souscrit (jamais « plan », jamais « offre »
//     — sauf « voir les offres », qui désigne l'écran de comparaison) ;
//   · « connecté / pas connecté » pour une session de plateforme (jamais
//     « actif », jamais « en ligne » : « en ligne » qualifie une ANNONCE) ;
//   · « annonce » pour ce qu'on publie, « article » pour la ligne de stock.
// ⛔ UNE PHRASE PAR BLOC. Si une explication en demande deux, c'est que le
//    bloc en fait deux : on le coupe, on n'allonge pas le texte.
//
// Deux langues, mêmes clés. `txt(lang)` rend le dictionnaire, jamais une
// fonction de traduction à clé : un texte manquant doit casser à la lecture,
// pas s'afficher en anglais au milieu du français.

const FR = {
  // ── Page ────────────────────────────────────────────────────────────────
  titre: 'Réglages',
  retour: 'Retour',
  fermer: 'Fermer',

  // ── Groupes (intitulés en petites capitales) ────────────────────────────
  gAbonnement: 'Abonnement',
  gPlateformes: 'Mes plateformes',
  gExpedition: 'Expédition',
  gAutomatismes: 'Automatismes',
  gPreferences: 'Préférences',
  gAide: 'Aide',
  gCompte: 'Mon compte',

  // ── Intitulés propres aux sous-pages ────────────────────────────────────
  sProfil: 'Profil',
  sLangueDevise: 'Langue et devise',
  sLeboncoin: 'Leboncoin',

  // ── Consommation ────────────────────────────────────────────────────────
  ceMoisCi: 'Ce mois-ci',
  consommation: 'Consommation du mois',
  remiseAZeroLe: (d) => `remise à zéro le ${d}`,
  annoncesCreees: 'Annonces créées',
  retouchesIA: 'Retouches IA',
  republications: 'Republications',
  restantes: (n, quoi) => `${n} ${quoi} restantes ce mois-ci`,
  restantesAVie: (n, total) => `${n} restantes sur ${total} offertes`,
  illimitees: 'illimitées',
  motAnnonces: 'annonces',
  motRetouches: 'retouches',
  motRepublications: 'republications',

  // ── Abonnement ──────────────────────────────────────────────────────────
  gererAbonnement: 'Gérer mon abonnement',
  formuleGratuite: 'Formule gratuite',
  formule: (nom) => `Formule ${nom}`,
  abonnementActif: 'Abonnement actif.',
  abonnementResilie: (d) => d
    ? `Abonnement résilié. Ton accès reste ouvert jusqu'au ${d}.`
    : "Abonnement résilié. Ton accès reste ouvert jusqu'à la fin de la période payée.",
  gratuitIntro: 'Tu utilises FillSell en formule gratuite.',
  prochainPrelevement: (d) => 'Prochain prélèvement le ' + d + '.',
  gerer: 'Gérer',
  comparerFormules: 'Comparer les formules',
  voirOffres: 'Voir les offres',
  mesFactures: 'Mes factures',
  facturesOuverture: 'Ouverture…',
  facturesParMail: (email) => `Tes factures partent par e-mail à ${email} à chaque prélèvement.`,
  restaurerAchats: 'Restaurer mes achats',
  restaurationEnCours: 'Restauration…',
  seDesabonner: 'Se désabonner',
  confirmerResiliation: 'Confirmer la résiliation ?',
  resiliationDetail: "Tu gardes ton accès jusqu'à la fin de la période en cours. Aucun remboursement au prorata.",
  confirmer: 'Confirmer',
  annuler: 'Annuler',
  appleGere: 'Ton abonnement est géré par Apple : la résiliation et le changement de formule se font depuis ton compte Apple.',
  appleLien: 'Ouvrir mes abonnements Apple',
  googleGere: 'Ton abonnement est géré par Google Play : la résiliation et le changement de formule se font depuis ton compte Google.',
  googleLien: 'Ouvrir mes abonnements Google Play',

  // ── Plateformes ─────────────────────────────────────────────────────────
  comptesConnectes: 'Comptes connectés',
  sessionsTitre: 'Sessions sur ton ordinateur',
  surN: (ok, total) => `${ok} sur ${total}`,
  connecte: 'connecté',
  pasConnecte: 'pas connecté',
  jamaisVerifie: 'jamais vérifié',
  autoriser: 'Autoriser',
  autoriserOplaComment: "Clique sur l'icône FillSell dans Chrome, puis sur « Autoriser Opla ».",
  sessionsNote: "Ces états viennent de l'extension sur ton ordinateur : pour reconnecter une plateforme, connecte-toi dessus dans Chrome.",
  sessionsAucune: "L'extension n'a encore relevé aucune session.",
  compteVendeurEbay: 'Compte vendeur eBay',

  // ── Expédition ──────────────────────────────────────────────────────────
  adresseRemise: 'Adresse de remise',
  adresseRemiseLbc: 'Adresse de remise Leboncoin',
  aRenseigner: 'à renseigner',
  rue: 'Rue',
  ruePlaceholder: '12 rue de la Paix',
  codePostal: 'Code postal',
  ville: 'Ville',
  enregistrer: 'Enregistrer',
  enregistrerAdresse: "Enregistrer l'adresse",
  adresseNote: "Utilisée pour le champ « adresse du bien » sur Leboncoin, jamais affichée sur l'annonce.",
  cpInvalide: 'Le code postal doit contenir 5 chiffres.',
  adresseReconnue: 'Adresse reconnue :',
  utiliserCetteAdresse: 'Utiliser cette adresse',
  garderMaSaisie: 'Garder ma saisie',
  adresseInconnue: "Adresse non reconnue par la Base Adresse Nationale : vérifie l'orthographe de la rue et de la ville.",
  enregistrerQuandMeme: 'Enregistrer quand même',
  adresseEnregistree: '✅ Adresse enregistrée !',
  erreurSauvegarde: '❌ Erreur lors de la sauvegarde',
  transporteurs: 'Mes transporteurs',
  transporteursValeurEbay: 'eBay',

  // ── Automatismes ────────────────────────────────────────────────────────
  republicationAuto: 'Republication automatique',
  actif: 'Actif',
  inactif: 'Inactif',

  // ── Préférences ─────────────────────────────────────────────────────────
  monProfil: 'Mon profil',
  pseudo: 'Pseudo',
  pseudoPlaceholder: 'Prénom ou pseudo…',
  pseudoEnregistre: '✅ Pseudo enregistré !',
  email: 'Adresse e-mail',
  langue: 'Langue',
  langueValeur: 'Français',
  devise: 'Devise',
  deviseNote: 'Changer la devise ne convertit pas les montants déjà enregistrés.',

  // ── Aide ────────────────────────────────────────────────────────────────
  support: 'Contacter le support',
  signalerBug: 'Signaler un bug',
  mentionsLegales: 'Mentions légales',
  extensionChrome: 'Extension Chrome',

  // ── Mon compte ──────────────────────────────────────────────────────────
  compteEtDonnees: 'Mon compte et mes données',
  session: 'Session',
  seDeconnecter: 'Se déconnecter',
  zoneSensible: 'Zone sensible',
  reinitTitre: 'Réinitialiser mon inventaire',
  // La phrase qui manquait : ce que le geste NE fait PAS.
  reinitTexte: 'Vide ton stock et tes ventes dans FillSell. Tes annonces en ligne ne sont pas retirées : elles restent publiées sur les plateformes.',
  reinitBouton: 'Réinitialiser',
  reinitConfirme: 'Tout supprimer',
  reinitQuestion: 'Supprimer tout ton stock et tes ventes ?',
  supprTitre: 'Supprimer mon compte',
  supprTexte: 'Efface ton compte, ton stock, tes ventes et tes photos. Tes annonces en ligne ne sont pas retirées.',
  supprBouton: 'Supprimer mon compte',
  supprEtes: 'Es-tu sûr ?',
  supprIrreversible: 'Cette action est irréversible.',
  continuer: 'Continuer',
  supprFinale: 'Confirmation finale',
  supprFinaleTexte: 'Toutes tes données seront supprimées définitivement.',
  supprDefinitif: 'Supprimer définitivement',

  // ── Pied de page ────────────────────────────────────────────────────────
  extensionVersion: (v) => `Extension ${v}`,
};

const EN = {
  titre: 'Settings',
  retour: 'Back',
  fermer: 'Close',

  gAbonnement: 'Subscription',
  gPlateformes: 'My platforms',
  gExpedition: 'Shipping',
  gAutomatismes: 'Automations',
  gPreferences: 'Preferences',
  gAide: 'Help',
  gCompte: 'My account',

  sProfil: 'Profile',
  sLangueDevise: 'Language and currency',
  sLeboncoin: 'Leboncoin',

  ceMoisCi: 'This month',
  consommation: 'This month’s usage',
  remiseAZeroLe: (d) => `resets on ${d}`,
  annoncesCreees: 'Listings created',
  retouchesIA: 'AI touch-ups',
  republications: 'Reposts',
  restantes: (n, quoi) => `${n} ${quoi} left this month`,
  restantesAVie: (n, total) => `${n} left of ${total} included`,
  illimitees: 'unlimited',
  motAnnonces: 'listings',
  motRetouches: 'touch-ups',
  motRepublications: 'reposts',

  gererAbonnement: 'Manage my subscription',
  formuleGratuite: 'Free plan',
  formule: (nom) => `${nom} plan`,
  abonnementActif: 'Subscription active.',
  abonnementResilie: (d) => d
    ? `Subscription cancelled. Your access stays open until ${d}.`
    : 'Subscription cancelled. Your access stays open until the end of the paid period.',
  gratuitIntro: 'You are on the free plan.',
  prochainPrelevement: (d) => 'Next payment on ' + d + '.',
  gerer: 'Manage',
  comparerFormules: 'Compare plans',
  voirOffres: 'See plans',
  mesFactures: 'My invoices',
  facturesOuverture: 'Opening…',
  facturesParMail: (email) => `Your invoices are emailed to ${email} on every payment.`,
  restaurerAchats: 'Restore purchases',
  restaurationEnCours: 'Restoring…',
  seDesabonner: 'Cancel subscription',
  confirmerResiliation: 'Confirm cancellation?',
  resiliationDetail: 'You keep your access until the end of the current period. No prorated refund.',
  confirmer: 'Confirm',
  annuler: 'Cancel',
  appleGere: 'Your subscription is managed by Apple: cancelling and changing plans happen in your Apple account.',
  appleLien: 'Open my Apple subscriptions',
  googleGere: 'Your subscription is managed by Google Play: cancelling and changing plans happen in your Google account.',
  googleLien: 'Open my Google Play subscriptions',

  comptesConnectes: 'Connected accounts',
  sessionsTitre: 'Sessions on your computer',
  surN: (ok, total) => `${ok} of ${total}`,
  connecte: 'connected',
  pasConnecte: 'not connected',
  jamaisVerifie: 'never checked',
  autoriser: 'Allow',
  autoriserOplaComment: 'Click the FillSell icon in Chrome, then “Autoriser Opla”.',
  sessionsNote: 'These states come from the extension on your computer: to reconnect a platform, sign in to it in Chrome.',
  sessionsAucune: 'The extension has not reported any session yet.',
  compteVendeurEbay: 'eBay seller account',

  adresseRemise: 'Pickup address',
  adresseRemiseLbc: 'Leboncoin pickup address',
  aRenseigner: 'to be filled in',
  rue: 'Street',
  ruePlaceholder: '12 rue de la Paix',
  codePostal: 'Postal code',
  ville: 'City',
  enregistrer: 'Save',
  enregistrerAdresse: 'Save address',
  adresseNote: 'Used for the “item address” field on Leboncoin, never shown on the listing.',
  cpInvalide: 'Postal code must be 5 digits.',
  adresseReconnue: 'Address found:',
  utiliserCetteAdresse: 'Use this address',
  garderMaSaisie: 'Keep my entry',
  adresseInconnue: 'Address not recognised by the French national address base: check the street and city spelling.',
  enregistrerQuandMeme: 'Save anyway',
  adresseEnregistree: '✅ Address saved!',
  erreurSauvegarde: '❌ Save failed',
  transporteurs: 'My shipping methods',
  transporteursValeurEbay: 'eBay',

  republicationAuto: 'Automatic reposting',
  actif: 'On',
  inactif: 'Off',

  monProfil: 'My profile',
  pseudo: 'Username',
  pseudoPlaceholder: 'First name or nickname…',
  pseudoEnregistre: '✅ Username saved!',
  email: 'Email address',
  langue: 'Language',
  langueValeur: 'English',
  devise: 'Currency',
  deviseNote: 'Changing the currency does not convert amounts already saved.',

  support: 'Contact support',
  signalerBug: 'Report a bug',
  mentionsLegales: 'Legal notice',
  extensionChrome: 'Chrome extension',

  compteEtDonnees: 'My account and my data',
  session: 'Session',
  seDeconnecter: 'Sign out',
  zoneSensible: 'Danger zone',
  reinitTitre: 'Reset my inventory',
  reinitTexte: 'Empties your stock and sales inside FillSell. Your live listings are not taken down: they stay published on the platforms.',
  reinitBouton: 'Reset',
  reinitConfirme: 'Delete everything',
  reinitQuestion: 'Delete all your stock and sales?',
  supprTitre: 'Delete my account',
  supprTexte: 'Erases your account, stock, sales and photos. Your live listings are not taken down.',
  supprBouton: 'Delete my account',
  supprEtes: 'Are you sure?',
  supprIrreversible: 'This cannot be undone.',
  continuer: 'Continue',
  supprFinale: 'Final confirmation',
  supprFinaleTexte: 'All your data will be permanently deleted.',
  supprDefinitif: 'Delete permanently',

  extensionVersion: (v) => `Extension ${v}`,
};

export function txt(lang) {
  return lang === 'en' ? EN : FR;
}
