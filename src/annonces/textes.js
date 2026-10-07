// ═══════════════════════════════════════════════════════════════════════════
// MES ANNONCES EN LIGNE — LES MOTS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Même règle que reglages/textes.js et entree/textes.js : AUCUNE phrase dans
// un composant. Tout se lit ici, fr + en, et un composant ne reçoit que `T`.
//
// ⛔ VOCABULAIRE NON NÉGOCIABLE :
//   · jamais « on synchronise pour toi » : c'est l'EXTENSION qui exécute, sur
//     l'ORDINATEUR. La personne pilote depuis son téléphone, et l'app n'est
//     JAMAIS présentée comme un accessoire dont on pourrait se passer.
//   · UN SEUL VERBE : « synchroniser » (décision de Nico, refonte du Stock du
//     03/10/2026 : le bouton s'appelle « Synchroniser » PARTOUT). Pas
//     « relever », pas « actualiser », pas « scanner » — ni ici, ni dans la
//     ligne Vinted, ni dans les refus. (Jusqu'au 03/10, cette règle imposait
//     « relever » ; scripts/stock-refonte-selftest.mjs tient la nouvelle.)
//   · une plateforme sans session n'est pas en ÉCHEC : elle est « à
//     connecter ». Le dossier Leo-paul Hug (18/09) tient tout entier dans
//     cette nuance — quatre runs `failed` pour trois comptes qui n'existaient
//     pas.
//   · ⛔ ON NE PARLE PAS DE NAVIGATEUR. « connecte-toi à X sur ton
//     ordinateur », et rien de plus : pas d'onglet, pas de « dans le même
//     Chrome ». La maquette disait « Pas connecté à eBay dans Chrome » ; la
//     consigne de Nico est plus récente et plus courte, c'est elle qui tient.
// « de » devant un nom de plateforme, élidé devant une voyelle : « d'eBay »,
// « d'Opla », « de Beebs » (refonte du 03/10 : le nom passe dans des phrases).
const de = (nom) => (/^[aeiouyéèêàâîôû]/i.test(String(nom ?? '')) ? `d'${nom}` : `de ${nom}`);

const FR = {
  titre: 'Mes annonces en ligne',

  // ── Le sous-titre : l'état RÉEL, jamais une estimation ───────────────────
  sousJamais: 'Jamais synchronisé',
  // Refonte du 03/10 : l'heure et le compte sont deux lignes.
  synchronise: (quand) => `Synchronisé ${quand}`,
  nAnnonces: (n) => `${n} annonce${n > 1 ? 's' : ''}`,
  titreEnCours: 'Synchronisation',
  sousRepos: (quand, n) => `Synchronisé ${quand} · ${n} annonce${n > 1 ? 's' : ''}`,
  sousEnCours: (faites, total) => `${faites} plateforme${faites > 1 ? 's' : ''} sur ${total}`,

  // ── Le geste ─────────────────────────────────────────────────────────────
  ctaTout: 'Synchroniser',
  ctaEnCours: 'En cours',
  ctaEnvoi: 'Envoi…',
  ctaExtension: 'Extension requise',

  // ── Les tuiles : un nombre, un mot ───────────────────────────────────────
  motAnnonces: 'annonces',
  motAConnecter: 'à connecter',
  motAAutoriser: 'à autoriser',
  motEnCours: 'en cours…',
  motEnAttente: 'en attente',
  motEchec: 'échec',
  motIncomplet: 'lues',
  motAutreCompte: 'autre compte',
  motExpire: 'expiré',
  motJamais: 'jamais',
  tuileAria: (nom, mot) => `${nom} — ${mot}`,

  // ── L'écran de synchronisation ───────────────────────────────────────────
  enCoursDe: (nom) => `Synchronisation ${de(nom)} en cours`,
  enCoursAttente: 'Synchronisation en attente de ton ordinateur',
  enCoursRange: 'On range les annonces dans ton stock.',
  // ⛔ TEXTE IMPOSÉ, il remplace celui de la maquette (« Tu peux fermer
  //    l'app, ça continue ») : cette phrase-là laissait croire que l'app ne
  //    sert à rien.
  enCoursSous: 'Ton ordinateur travaille pendant ce temps.',

  // ── (07/10) Rattachement avant stock : le rapprochement, son temps, la fin ──
  // Le serveur compare chaque annonce à TOUT le stock avant d'en faire un
  // article : rien n'apparaît en double, à aucun moment.
  rapprochementEnCours: 'Rapprochement de tes annonces en cours',
  rapprochementSous: (n) => (n > 0
    ? `${n} annonce${n > 1 ? 's' : ''} à comparer à ton stock — rien n'est créé en double.`
    : 'Chaque annonce est comparée à ton stock — rien n’est créé en double.'),
  tempsRestant: (s) => (!(s > 0) ? '' : s < 60 ? 'Moins d’une minute' : `Environ ${Math.max(1, Math.round(s / 60))} min`),
  ligneLues: (lues, annoncees) => (annoncees != null && annoncees >= lues ? `${lues} sur ${annoncees}` : `${lues} annonce${lues > 1 ? 's' : ''}`),
  ligneAttente: 'en attente',
  ligneEnCours: 'en cours',
  ligneFini: 'terminé',
  ligneAConnecter: 'à reconnecter',
  ligneRapprochement: 'Rapprochement',
  stockPret: 'Ton stock est prêt',
  aVerifierTitre: (n) => (n > 1 ? `${n} annonces à vérifier` : 'Une annonce à vérifier'),
  aVerifierTexte: 'Trouvées sur tes autres plateformes, elles ressemblent à un article de ton stock. Dis-nous si c’est le même : elles entrent alors dans ton stock. Rien n’est perdu, leurs ventes sont suivies.',
  aVerifierCta: 'Vérifier',

  // ── Ce que la synchronisation n'a pas su trancher ────────────────────────
  anomalie: (n) => (n > 1
    ? `${n} annonces trouvées ne correspondent à aucun article de ton stock.`
    : 'Une annonce trouvée ne correspond à aucun article de ton stock.'),
  anomalieCta: 'Rattacher',
  // (25/09) Deux fiches qui désignent peut-être le même objet.
  doublons: (n) => (n > 1
    ? `${n} paires de fiches désignent peut-être le même article.`
    : 'Deux fiches de ton stock désignent peut-être le même article.'),
  doublonsCta: 'Vérifier',
  // (01/10) Annonces trouvées dont la photo est en cours de lecture avant
  // l'import : on le dit tout de suite, sans délai promis au-delà de « quelques
  // minutes » (mesuré : 4 min en moyenne).
  rangement: (n, noms) => `${n} annonce${n > 1 ? 's' : ''} trouvée${n > 1 ? 's' : ''}${noms ? ` sur ${noms}` : ''}, rangement en cours — ${n > 1 ? 'elles arrivent' : 'elle arrive'} dans ton stock d'ici quelques minutes.`,

  // ── Les empêchements, dits sans accuser personne ─────────────────────────
  // (05/10, Marine) Plus aucune promesse de reprise automatique : un relevé ne
  // démarre que sur « Synchroniser ». Chaque fin dit la vraie situation et le
  // seul geste utile.
  signalNonConnecte: (nom) => `Connecte-toi à ${nom} sur ton ordinateur, puis appuie sur « Synchroniser ».`,
  finAutreCompte: (nom) => `Ton ordinateur est connecté à un autre compte ${nom} que celui suivi par FillSell. Rien n'a été importé. Connecte-toi au bon compte ${nom} dans Chrome, puis appuie sur « Synchroniser ».`,
  // (06/10) Vinted : la boutique ouverte n'est pas encore suivie. Le geste est
  // « Choisir ma boutique » (feuille ConfirmationBoutique), plus « relance ».
  finBoutiqueAConfirmer: (b) => (b
    ? `Ton ordinateur est connecté à la boutique @${b}, que FillSell ne suit pas encore. Rien n'a été importé.`
    : "Ton ordinateur est connecté à une boutique Vinted que FillSell ne suit pas encore. Rien n'a été importé."),
  titrePointBoutique: 'Vinted : boutique à confirmer',
  ctaChoisirBoutique: 'Choisir ma boutique',
  titrePointVinted: 'Vinted',
  finAntiRobot: (nom) => `${nom} a bloqué la lecture un moment (protection anti-robot). Rien n'a été effacé : réessaie dans quelques minutes.`,
  finArret: (nom) => `La synchronisation ${de(nom)} s'est arrêtée avant la fin. Rien n'a été effacé : appuie sur « Synchroniser » pour la terminer.`,
  finPasPrise: (nom) => `Ton ordinateur n'a pas pris la synchronisation ${de(nom)}. Ouvre Chrome avec l'extension FillSell, puis appuie sur « Synchroniser ».`,
  finEchec: (nom) => `La synchronisation ${de(nom)} n'a pas abouti. Rien n'a été effacé : appuie sur « Synchroniser » pour réessayer.`,
  signalOpla: "Opla n'est pas encore autorisée dans l'extension — rien à synchroniser pour l'instant.",
  signalEchec: (nom, motif) => `La synchronisation ${de(nom)} s'est arrêtée${motif ? ` — ${motif}` : ''}. Les autres plateformes sont synchronisées.`,
  // Un arrêt TECHNIQUE (la page n'a pas répondu à temps) : ce n'est ni un
  // échec de la personne ni un verdict sur ses annonces. On dit ce qu'on fait.
  signalTechnique: (nom) => `${nom} n'a pas affiché la liste de tes annonces à temps. Rien n'a été effacé : appuie sur « Synchroniser » pour réessayer.`,
  // (01/10) Chrome est connecté à un autre compte eBay que celui relié à
  // FillSell : rien n'est importé de cet autre compte, et on nomme le bon.
  signalHorsCompteEbay: (chrome, relie) => (chrome
    ? `eBay : ton ordinateur est connecté au compte « ${chrome} », pas à « ${relie ?? 'ton compte relié'} » relié à FillSell. Rien n'est importé de « ${chrome} ». Connecte-toi à eBay sur ton ordinateur avec le compte ${relie ?? 'relié à FillSell'}.`
    : `eBay : on n'a pas encore pu vérifier que ton ordinateur est connecté au compte « ${relie ?? 'relié à FillSell'} ». Rien n'est importé en attendant. Si tu utilises un autre compte eBay sur cet ordinateur, connecte-toi avec ${relie ?? 'le compte relié'}.`),
  // (27/09) Une synchronisation incomplète dit ce qu'elle a lu SUR ce qui est annoncé.
  signalIncomplet: (nom, lus, annonce) => (annonce != null
    ? `${nom} : synchronisation incomplète — ${lus} annonce${lus > 1 ? 's' : ''} lue${lus > 1 ? 's' : ''} sur ${annonce}. Appuie sur « Synchroniser » pour terminer ; rien n'est conclu sur les autres.`
    : `${nom} : synchronisation incomplète — ${lus} annonce${lus > 1 ? 's' : ''} lue${lus > 1 ? 's' : ''}, le total n'a pas pu être lu. Appuie sur « Synchroniser » pour terminer ; rien n'est conclu sur les autres.`),
  // Relevés vides d'affilée sur un compte qui avait des annonces (serveur,
  // releve_vide_etat, 24/09). ⛔ On ne conclut RIEN : ni vendues, ni retirées,
  // ni « tu n'as plus d'annonce ». On dit ce qu'on a lu, et le geste possible.
  signalVideRepete: (nom) => `${nom} : les dernières synchronisations n'ont trouvé aucune annonce sur le compte connecté sur ton ordinateur. On ne conclut rien sur tes annonces. Si elles sont en ligne, vérifie que tu es connecté au bon compte ${nom}, puis touche sa pastille pour la synchroniser.`,
  extensionAbsente: "L'extension Chrome n'est pas installée : c'est elle qui synchronise tes annonces depuis ton ordinateur.",
  extensionAbsenteCta: "Installer l'extension",
  extensionEndormie: "Ton ordinateur n'a pas répondu : ouvre Chrome avec l'extension FillSell, puis appuie sur « Synchroniser ».",

  // ── LES POINTS À RÉGLER, EN CARTES (refonte du Stock, 03/10, planche 08) ──
  // Chaque point : un titre COURT (la plateforme et ce qui coince), puis la
  // phrase ci-dessus, inchangée, puis le geste. Le titre ne dit rien de plus
  // que la phrase : il la nomme.
  titrePointVide: (nom) => `${nom} : aucune annonce trouvée`,
  titrePointNonConnecte: (nom) => `${nom} : pas connecté`,
  titrePointOpla: 'Opla : pas encore autorisée',
  titrePointArret: (nom) => `${nom} : synchronisation arrêtée`,
  titrePointTechnique: (nom) => `${nom} : synchronisation à reprendre`,
  titrePointHorsCompte: (nom) => `${nom} : mauvais compte connecté`,
  titrePointIncomplet: (nom) => `${nom} : synchronisation incomplète`,
  titrePointMur: (nom) => `${nom} : à connecter`,
  titreEndormie: "Ton ordinateur n'a pas répondu",
  texteEndormie: (noms) => `Ton ordinateur n'a pas pris la synchronisation ${de(noms)}. Ouvre Chrome avec l'extension FillSell, puis appuie sur « Synchroniser ».`,
  titrePointArretFin: (nom) => `${nom} : synchronisation arrêtée avant la fin`,
  ctaPointSynchro: (nom) => `Synchroniser ${nom}`,
  ctaPointReessayer: 'Réessayer',

  // ── CE QUI A MARCHÉ, DIT EN PREMIER (2026-09-22) ─────────────────────────
  // Avant, un relevé Vinted parfait disparaissait sous trois bandes ambre pour
  // des plateformes où la personne n'a même pas de compte. On dit d'abord la
  // réussite, et on la NOMME.
  reussiteReleve: (nom, n) => (n > 0
    ? `${nom} : ${n} annonce${n > 1 ? 's' : ''} synchronisée${n > 1 ? 's' : ''} et rangée${n > 1 ? 's' : ''} dans ton stock.`
    : `${nom} : synchronisation terminée, aucune annonce en ligne pour l'instant.`),
  // La promesse que handler-watch tient désormais : la reprise est faite par
  // le serveur dès que la session est prouvée fraîche, sans nouveau clic.
  murReprise: 'Une fois connecté, appuie sur « Synchroniser ».',

  note: "Synchroniser ne publie rien : FillSell lit « Mes annonces » sur chaque plateforme et rattache ce qu'il reconnaît à ton stock.",

  // ── L'écran de rapprochement ─────────────────────────────────────────────
  ratTitre: 'Annonces à rattacher',
  ratIntro: "Ce que FillSell a reconnu avec certitude est déjà rattaché. Il ne reste que ce qu'il n'a pas su trancher tout seul.",
  ratPosition: (i, n) => `${i} sur ${n}`,
  ratFermer: 'Fermer',
  ratVideTitre: 'Tout est rattaché',
  ratVideTexte: "Chaque annonce trouvée pointe vers un article de ton stock. Rien ne t'attend ici.",
  ratVideCta: 'Fermer',
  ratVoirAnnonce: "Voir l'annonce",
  ratEnVerification: 'en vérification',
  ratSansTitre: (id) => `Annonce ${id}`,
  ratProches: 'Les articles les plus proches',
  ratQuestion: 'Est-ce le même article ? Touche-le pour le rattacher',
  ratProbable: 'Le plus probable',
  ratAucunCandidat: "Aucun article de ton stock ne porte ce titre. Cherche-le ci-dessous, ou crée l'article.",
  ratHomonymeVendu: (titre) => `Un article du même titre, « ${titre} », est déjà marqué vendu. Si c'est un autre exemplaire, crée l'article ; si c'est le même, ignore cette annonce et pense à la retirer.`,
  ratChercher: 'Chercher dans ton stock…',
  ratAucunResultat: 'Aucun article ne porte ce nom.',
  ratCtaRattacher: 'Rattacher',
  ratCtaCreer: 'Créer un article depuis cette annonce',
  ratCtaIgnorer: 'Ignorer',
  ratIgnorerNote: "Ignorer ne supprime rien : l'annonce sort de cette file et n'y revient pas à la prochaine synchronisation.",
  ratFaitAttache: (titre) => `Rattachée à « ${titre} »`,
  ratFaitImport: 'Article créé depuis cette annonce (lecture seule)',
  ratFaitIgnore: 'Ignorée',
  ratErreur: 'Décision non enregistrée.',
  ratSuivante: 'Annonce suivante',
  ratTermine: 'Terminé',

  // ── Pourquoi le moteur hésite, en une demi-phrase ────────────────────────
  motifPrixInconnu: "le prix n'a pas pu être lu",
  motifPrixDifferent: 'le prix diffère',
  motifHomonymes: 'plusieurs articles portent ce titre',
  motifPlusieurs: 'plusieurs candidats',
  motifHomonymesTranches: (n) => `tu as ${n || 'plusieurs'} articles identiques, on a pris le plus ancien`,
  motifTitreInclus: "l'un des deux titres est écrit plus court",
  motifHomonymeEnStock: "même titre qu'un article déjà en ligne sur cette plateforme — même article, ou un autre exemplaire ?",
  motifDepotPhotoProche: "photo presque identique à celle de ton dépôt Beebs de cet article — est-ce cette annonce ?",
  motifDepotAConfirmer: "même titre et même moment que ton dépôt Beebs de cet article, mais la photo ne permet pas de trancher — est-ce cette annonce ?",
  motifFaisceauBase: 'le titre est écrit autrement',
  motifFaisceauAvec: (preuves) => `le titre est écrit autrement, mais ${preuves} correspond${preuves.includes(' et ') ? 'ent' : ''}`,
  preuvePrixExact: 'le prix',
  preuvePrixProche: 'le prix, à peu près',
  preuveMarque: 'la marque',
  preuveTaille: 'la taille',
};

const EN = {
  titre: 'My listings online',

  sousJamais: 'Never synced',
  synchronise: (quand) => `Synced ${quand}`,
  nAnnonces: (n) => `${n} listing${n > 1 ? 's' : ''}`,
  titreEnCours: 'Syncing',
  sousRepos: (quand, n) => `Synced ${quand} · ${n} listing${n > 1 ? 's' : ''}`,
  sousEnCours: (faites, total) => `${faites} platform${faites > 1 ? 's' : ''} of ${total}`,

  ctaTout: 'Sync',
  ctaEnCours: 'Running',
  ctaEnvoi: 'Sending…',
  ctaExtension: 'Extension required',

  motAnnonces: 'listings',
  motAConnecter: 'to connect',
  motAAutoriser: 'to allow',
  motEnCours: 'running…',
  motEnAttente: 'waiting',
  motEchec: 'failed',
  motIncomplet: 'read',
  motAutreCompte: 'other account',
  motExpire: 'expired',
  motJamais: 'never',
  tuileAria: (nom, mot) => `${nom} — ${mot}`,

  enCoursDe: (nom) => `Syncing ${nom}`,
  enCoursAttente: 'Waiting for your computer',
  enCoursRange: 'Filing the listings into your stock.',
  enCoursSous: 'Your computer is working on it right now.',

  rapprochementEnCours: 'Matching your listings',
  rapprochementSous: (n) => (n > 0
    ? `${n} listing${n > 1 ? 's' : ''} to compare with your stock — nothing is created twice.`
    : 'Each listing is compared with your stock — nothing is created twice.'),
  tempsRestant: (s) => (!(s > 0) ? '' : s < 60 ? 'Less than a minute' : `About ${Math.max(1, Math.round(s / 60))} min`),
  ligneLues: (lues, annoncees) => (annoncees != null && annoncees >= lues ? `${lues} of ${annoncees}` : `${lues} listing${lues > 1 ? 's' : ''}`),
  ligneAttente: 'waiting',
  ligneEnCours: 'running',
  ligneFini: 'done',
  ligneAConnecter: 'to reconnect',
  ligneRapprochement: 'Matching',
  stockPret: 'Your stock is ready',
  aVerifierTitre: (n) => (n > 1 ? `${n} listings to check` : 'One listing to check'),
  aVerifierTexte: 'Found on your other platforms, they look like an item in your stock. Tell us if it’s the same: they then enter your stock. Nothing is lost, their sales are tracked.',
  aVerifierCta: 'Check',

  anomalie: (n) => (n > 1
    ? `${n} listings found match no item in your stock.`
    : 'One listing found matches no item in your stock.'),
  anomalieCta: 'Match',
  doublons: (n) => (n > 1
    ? `${n} pairs of items may be the same object.`
    : 'Two items in your stock may be the same object.'),
  doublonsCta: 'Check',
  rangement: (n, noms) => `${n} listing${n > 1 ? 's' : ''} found${noms ? ` on ${noms}` : ''}, filing in progress — ${n > 1 ? 'they' : 'it'} will appear in your stock within a few minutes.`,

  signalNonConnecte: (nom) => `Sign in to ${nom} on your computer, then tap “Sync”.`,
  finAutreCompte: (nom) => `Your computer is signed in to another ${nom} account than the one FillSell follows. Nothing was imported. Sign in to the right ${nom} account in Chrome, then tap “Sync”.`,
  finBoutiqueAConfirmer: (b) => (b
    ? `Your computer is signed in to the shop @${b}, which FillSell doesn't follow yet. Nothing was imported.`
    : "Your computer is signed in to a Vinted shop FillSell doesn't follow yet. Nothing was imported."),
  titrePointBoutique: 'Vinted: shop to confirm',
  ctaChoisirBoutique: 'Choose my shop',
  titrePointVinted: 'Vinted',
  finAntiRobot: (nom) => `${nom} blocked the reading for a moment (anti-bot protection). Nothing was deleted: try again in a few minutes.`,
  finArret: (nom) => `The ${nom} sync stopped before the end. Nothing was deleted: tap “Sync” to finish it.`,
  finPasPrise: (nom) => `Your computer did not pick up the ${nom} sync. Open Chrome with the FillSell extension, then tap “Sync”.`,
  finEchec: (nom) => `The ${nom} sync did not complete. Nothing was deleted: tap “Sync” to try again.`,
  signalOpla: 'Opla is not authorised in the extension yet — nothing to sync for now.',
  signalEchec: (nom, motif) => `The ${nom} sync stopped${motif ? ` — ${motif}` : ''}. The other platforms are synced.`,
  signalTechnique: (nom) => `${nom} did not show your listings in time. Nothing was deleted: tap “Sync” to try again.`,
  signalHorsCompteEbay: (chrome, relie) => (chrome
    ? `eBay: your computer is signed in to the account “${chrome}”, not “${relie ?? 'your linked account'}” linked to FillSell. Nothing is imported from “${chrome}”. Sign in to eBay on your computer with the account ${relie ?? 'linked to FillSell'}.`
    : `eBay: we could not yet check that your computer is signed in to “${relie ?? 'the linked account'}”. Nothing is imported meanwhile. If you use another eBay account on this computer, sign in with ${relie ?? 'the linked account'}.`),
  signalIncomplet: (nom, lus, annonce) => (annonce != null
    ? `${nom}: incomplete sync — ${lus} listing${lus > 1 ? 's' : ''} read out of ${annonce}. Tap “Sync” to finish; nothing is concluded about the others.`
    : `${nom}: incomplete sync — ${lus} listing${lus > 1 ? 's' : ''} read, the total could not be read. Tap “Sync” to finish; nothing is concluded about the others.`),
  signalVideRepete: (nom) => `${nom}: the latest syncs found no listing on the account signed in on your computer. We draw no conclusion about your listings. If they are online, check you are signed in to the right ${nom} account, then tap its chip to sync it.`,
  extensionAbsente: 'The Chrome extension is not installed: it is what syncs your listings from your computer.',
  extensionAbsenteCta: 'Install the extension',
  extensionEndormie: 'Your computer did not answer: open Chrome with the FillSell extension, then tap “Sync”.',

  titrePointVide: (nom) => `${nom}: no listing found`,
  titrePointNonConnecte: (nom) => `${nom}: not signed in`,
  titrePointOpla: 'Opla: not authorised yet',
  titrePointArret: (nom) => `${nom}: sync stopped`,
  titrePointTechnique: (nom) => `${nom}: sync to resume`,
  titrePointHorsCompte: (nom) => `${nom}: wrong account signed in`,
  titrePointIncomplet: (nom) => `${nom}: incomplete sync`,
  titrePointMur: (nom) => `${nom}: to sign in`,
  titreEndormie: 'Your computer did not answer',
  texteEndormie: (noms) => `Your computer did not pick up the ${noms} sync. Open Chrome with the FillSell extension, then tap “Sync”.`,
  titrePointArretFin: (nom) => `${nom}: sync stopped before the end`,
  ctaPointSynchro: (nom) => `Sync ${nom}`,
  ctaPointReessayer: 'Try again',

  reussiteReleve: (nom, n) => (n > 0
    ? `${nom}: ${n} listing${n > 1 ? 's' : ''} synced and filed into your stock.`
    : `${nom}: sync finished, nothing online for now.`),
  murReprise: 'Once signed in, tap “Sync”.',

  note: 'Syncing publishes nothing: FillSell reads “My listings” on each platform and matches what it recognises to your stock.',

  ratTitre: 'Listings to match',
  ratIntro: 'What FillSell recognised for sure is already matched. Only what it could not decide on its own is left.',
  ratPosition: (i, n) => `${i} of ${n}`,
  ratFermer: 'Close',
  ratVideTitre: 'Everything is matched',
  ratVideTexte: 'Every listing found points to an item in your stock. Nothing is waiting for you here.',
  ratVideCta: 'Close',
  ratVoirAnnonce: 'View listing',
  ratEnVerification: 'under review',
  ratSansTitre: (id) => `Listing ${id}`,
  ratProches: 'The closest items',
  ratQuestion: 'Is it the same item? Tap it to match',
  ratProbable: 'Most likely',
  ratAucunCandidat: 'No item in your stock has this title. Search for it below, or create the item.',
  ratHomonymeVendu: (titre) => `An item with the same title, “${titre}”, is already marked sold. If this is another copy, create the item; if it is the same one, ignore this listing and remember to remove it.`,
  ratChercher: 'Search your stock…',
  ratAucunResultat: 'No item by that name.',
  ratCtaRattacher: 'Match',
  ratCtaCreer: 'Create an item from this listing',
  ratCtaIgnorer: 'Ignore',
  ratIgnorerNote: 'Ignoring deletes nothing: the listing leaves this queue and will not come back on the next sync.',
  ratFaitAttache: (titre) => `Matched to “${titre}”`,
  ratFaitImport: 'Item created from this listing (read-only)',
  ratFaitIgnore: 'Ignored',
  ratErreur: 'Decision not saved.',
  ratSuivante: 'Next listing',
  ratTermine: 'Done',

  motifPrixInconnu: 'the price could not be read',
  motifPrixDifferent: 'the price differs',
  motifHomonymes: 'several items share this title',
  motifPlusieurs: 'several candidates',
  motifHomonymesTranches: (n) => `you have ${n || 'several'} identical items, we took the oldest`,
  motifTitreInclus: 'one of the two titles is written shorter',
  motifHomonymeEnStock: 'same title as an item already listed on this platform — same item, or another copy?',
  motifDepotPhotoProche: 'photo almost identical to your Beebs listing of this item — is it this listing?',
  motifDepotAConfirmer: 'same title and same moment as your Beebs listing of this item, but the photo cannot settle it — is it this listing?',
  motifFaisceauBase: 'the title is worded differently',
  motifFaisceauAvec: (preuves) => `the title is worded differently, but ${preuves} match${preuves.includes(' and ') ? '' : 'es'}`,
  preuvePrixExact: 'the price',
  preuvePrixProche: 'roughly the price',
  preuveMarque: 'the brand',
  preuveTaille: 'the size',
};

export function textesAnnonces(lang) {
  return lang === 'en' ? EN : FR;
}
