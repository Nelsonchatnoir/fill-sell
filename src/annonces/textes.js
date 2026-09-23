// ═══════════════════════════════════════════════════════════════════════════
// MES ANNONCES EN LIGNE — LES MOTS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Même règle que reglages/textes.js et entree/textes.js : AUCUNE phrase dans
// un composant. Tout se lit ici, fr + en, et un composant ne reçoit que `T`.
//
// ⛔ VOCABULAIRE NON NÉGOCIABLE :
//   · jamais « on relève pour toi » : c'est l'EXTENSION qui exécute, sur
//     l'ORDINATEUR. La personne pilote depuis son téléphone, et l'app n'est
//     JAMAIS présentée comme un accessoire dont on pourrait se passer.
//   · UN SEUL VERBE : « relever ». Pas « synchroniser », pas « actualiser »,
//     pas « scanner » — ni ici, ni dans la ligne Vinted, ni dans les refus.
//   · une plateforme sans session n'est pas en ÉCHEC : elle est « à
//     connecter ». Le dossier Leo-paul Hug (18/09) tient tout entier dans
//     cette nuance — quatre runs `failed` pour trois comptes qui n'existaient
//     pas.
//   · ⛔ ON NE PARLE PAS DE NAVIGATEUR. « connecte-toi à X sur ton
//     ordinateur », et rien de plus : pas d'onglet, pas de « dans le même
//     Chrome ». La maquette disait « Pas connecté à eBay dans Chrome » ; la
//     consigne de Nico est plus récente et plus courte, c'est elle qui tient.
const FR = {
  titre: 'Mes annonces en ligne',

  // ── Le sous-titre : l'état RÉEL, jamais une estimation ───────────────────
  sousJamais: 'Jamais relevé',
  sousRepos: (quand, n) => `Relevé ${quand} · ${n} annonce${n > 1 ? 's' : ''}`,
  sousEnCours: (faites, total) => `${faites} plateforme${faites > 1 ? 's' : ''} sur ${total}`,

  // ── Le geste ─────────────────────────────────────────────────────────────
  ctaTout: 'Tout relever',
  ctaEnCours: 'Relevé en cours',
  ctaEnvoi: 'Envoi…',
  ctaExtension: 'Extension requise',

  // ── Les tuiles : un nombre, un mot ───────────────────────────────────────
  motAnnonces: 'annonces',
  motAConnecter: 'à connecter',
  motAAutoriser: 'à autoriser',
  motEnCours: 'en cours…',
  motEnAttente: 'en attente',
  motEchec: 'échec',
  motExpire: 'expiré',
  motJamais: 'jamais',
  tuileAria: (nom, mot) => `${nom} — ${mot}`,

  // ── L'écran de relevé ────────────────────────────────────────────────────
  enCoursDe: (nom) => `Relevé de ${nom}…`,
  enCoursAttente: 'Relevé en attente de ton ordinateur',
  enCoursRange: 'On range les annonces dans ton stock.',
  // ⛔ TEXTE IMPOSÉ, il remplace celui de la maquette (« Tu peux fermer
  //    l'app, ça continue ») : cette phrase-là laissait croire que l'app ne
  //    sert à rien.
  enCoursSous: 'Ton ordinateur travaille pendant ce temps.',

  // ── Ce que le relevé n'a pas su trancher ─────────────────────────────────
  anomalie: (n) => (n > 1
    ? `${n} annonces relevées ne correspondent à aucun article de ton stock.`
    : 'Une annonce relevée ne correspond à aucun article de ton stock.'),
  anomalieCta: 'Rattacher',

  // ── Les empêchements, dits sans accuser personne ─────────────────────────
  signalNonConnecte: (nom) => `Pas connecté à ${nom} : connecte-toi sur ton ordinateur, le prochain relevé la prendra.`,
  signalOpla: "Opla n'est pas encore autorisée dans l'extension — rien à relever pour l'instant.",
  signalEchec: (nom, motif) => `Le relevé de ${nom} s'est arrêté${motif ? ` — ${motif}` : ''}. Les autres plateformes ont été relevées.`,
  // Un arrêt TECHNIQUE (la page n'a pas répondu à temps) : ce n'est ni un
  // échec de la personne ni un verdict sur ses annonces. On dit ce qu'on fait.
  signalTechnique: (nom) => `${nom} n'a pas affiché la liste de tes annonces à temps. On réessaie tout seuls ; tu peux aussi relancer le relevé d'ici.`,
  extensionAbsente: "L'extension Chrome n'est pas installée : c'est elle qui relève tes annonces depuis ton ordinateur.",
  extensionAbsenteCta: "Installer l'extension",
  extensionEndormie: "Ton ordinateur n'a pas répondu : ouvre Chrome, le relevé part tout seul.",

  // ── CE QUI A MARCHÉ, DIT EN PREMIER (2026-09-22) ─────────────────────────
  // Avant, un relevé Vinted parfait disparaissait sous trois bandes ambre pour
  // des plateformes où la personne n'a même pas de compte. On dit d'abord la
  // réussite, et on la NOMME.
  reussiteReleve: (nom, n) => (n > 0
    ? `${nom} : ${n} annonce${n > 1 ? 's' : ''} relevée${n > 1 ? 's' : ''} et rangée${n > 1 ? 's' : ''} dans ton stock.`
    : `${nom} : relevé terminé, aucune annonce en ligne pour l'instant.`),
  // La promesse que handler-watch tient désormais : la reprise est faite par
  // le serveur dès que la session est prouvée fraîche, sans nouveau clic.
  murReprise: 'Dès que tu es connecté, le relevé de cette plateforme repart tout seul.',

  note: "Un relevé ne publie rien : FillSell lit « Mes annonces » sur chaque plateforme et rattache ce qu'il reconnaît à ton stock.",

  // ── L'écran de rapprochement ─────────────────────────────────────────────
  ratTitre: 'Annonces à rattacher',
  ratIntro: "Ce que FillSell a reconnu avec certitude est déjà rattaché. Il ne reste que ce qu'il n'a pas su trancher tout seul.",
  ratPosition: (i, n) => `${i} sur ${n}`,
  ratFermer: 'Fermer',
  ratVideTitre: 'Tout est rattaché',
  ratVideTexte: "Chaque annonce relevée pointe vers un article de ton stock. Rien ne t'attend ici.",
  ratVideCta: 'Fermer',
  ratVoirAnnonce: "Voir l'annonce",
  ratEnVerification: 'en vérification',
  ratSansTitre: (id) => `Annonce ${id}`,
  ratProches: 'Les articles les plus proches',
  ratProbable: 'Le plus probable',
  ratAucunCandidat: "Aucun article de ton stock ne ressemble à cette annonce.",
  ratChercher: 'Chercher dans ton stock…',
  ratAucunResultat: 'Aucun article ne porte ce nom.',
  ratCtaRattacher: 'Rattacher',
  ratCtaCreer: 'Créer un article depuis cette annonce',
  ratCtaIgnorer: 'Ignorer',
  ratIgnorerNote: "Ignorer ne supprime rien : l'annonce sort de cette file et n'y revient pas au prochain relevé.",
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
  motifFaisceauBase: 'le titre est écrit autrement',
  motifFaisceauAvec: (preuves) => `le titre est écrit autrement, mais ${preuves} correspond${preuves.includes(' et ') ? 'ent' : ''}`,
  preuvePrixExact: 'le prix',
  preuvePrixProche: 'le prix, à peu près',
  preuveMarque: 'la marque',
  preuveTaille: 'la taille',
};

const EN = {
  titre: 'My listings online',

  sousJamais: 'Never scanned',
  sousRepos: (quand, n) => `Scanned ${quand} · ${n} listing${n > 1 ? 's' : ''}`,
  sousEnCours: (faites, total) => `${faites} platform${faites > 1 ? 's' : ''} of ${total}`,

  ctaTout: 'Scan all',
  ctaEnCours: 'Scan running',
  ctaEnvoi: 'Sending…',
  ctaExtension: 'Extension required',

  motAnnonces: 'listings',
  motAConnecter: 'to connect',
  motAAutoriser: 'to allow',
  motEnCours: 'running…',
  motEnAttente: 'waiting',
  motEchec: 'failed',
  motExpire: 'expired',
  motJamais: 'never',
  tuileAria: (nom, mot) => `${nom} — ${mot}`,

  enCoursDe: (nom) => `Scanning ${nom}…`,
  enCoursAttente: 'Waiting for your computer',
  enCoursRange: 'Filing the listings into your stock.',
  enCoursSous: 'Your computer is working on it right now.',

  anomalie: (n) => (n > 1
    ? `${n} scanned listings match no item in your stock.`
    : 'One scanned listing matches no item in your stock.'),
  anomalieCta: 'Match',

  signalNonConnecte: (nom) => `Not signed in to ${nom}: sign in on your computer, the next scan will pick it up.`,
  signalOpla: 'Opla is not authorised in the extension yet — nothing to scan for now.',
  signalEchec: (nom, motif) => `The ${nom} scan stopped${motif ? ` — ${motif}` : ''}. The other platforms were scanned.`,
  signalTechnique: (nom) => `${nom} did not show your listings in time. We retry on our own; you can also start the scan again from here.`,
  extensionAbsente: 'The Chrome extension is not installed: it is what scans your listings from your computer.',
  extensionAbsenteCta: 'Install the extension',
  extensionEndormie: 'Your computer did not answer: open Chrome and the scan starts on its own.',

  reussiteReleve: (nom, n) => (n > 0
    ? `${nom}: ${n} listing${n > 1 ? 's' : ''} scanned and filed into your stock.`
    : `${nom}: scan finished, nothing online for now.`),
  murReprise: 'As soon as you are signed in, this platform is scanned again on its own.',

  note: 'A scan publishes nothing: FillSell reads “My listings” on each platform and matches what it recognises to your stock.',

  ratTitre: 'Listings to match',
  ratIntro: 'What FillSell recognised for sure is already matched. Only what it could not decide on its own is left.',
  ratPosition: (i, n) => `${i} of ${n}`,
  ratFermer: 'Close',
  ratVideTitre: 'Everything is matched',
  ratVideTexte: 'Every scanned listing points to an item in your stock. Nothing is waiting for you here.',
  ratVideCta: 'Close',
  ratVoirAnnonce: 'View listing',
  ratEnVerification: 'under review',
  ratSansTitre: (id) => `Listing ${id}`,
  ratProches: 'The closest items',
  ratProbable: 'Most likely',
  ratAucunCandidat: 'No item in your stock looks like this listing.',
  ratChercher: 'Search your stock…',
  ratAucunResultat: 'No item by that name.',
  ratCtaRattacher: 'Match',
  ratCtaCreer: 'Create an item from this listing',
  ratCtaIgnorer: 'Ignore',
  ratIgnorerNote: 'Ignoring deletes nothing: the listing leaves this queue and will not come back on the next scan.',
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
