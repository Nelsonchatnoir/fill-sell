// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME CHOISIE ET PAS VUE CONNECTÉE LE DIT, TOUT DE SUITE (13/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Toute plateforme choisie par le vendeur et pas vue connectée doit le lui dire clairement et tout de suite, dès
// l'inscription et ensuite, sans attendre qu'une synchro ou une publication échoue. Pour TOUTES les plateformes. »
// Constat (ff1f879f, nuit du 13/11) : Vinted choisi, jamais vu connecté (pas connecté à vinted.fr dans ce Chrome), et
// RIEN ne le lui a dit — pastille grise « jamais », aucun point à régler (ils ne naissent que d'un relevé raté), bouton
// « Tout est à jour » grisé, popup « Vérifié il y a N min ». Même chose chez 1f95f334, 7d64bf87…
//
// LA RÈGLE (pure, Node + Vite), une seule pour le Tableau, la carte « Synchroniser » du Stock et les Réglages :
//   · plateformes CHOISIES = celles que la vérité serveur dit déclarées (platform_settings.plateformes_vendeur), moins
//     les écartées (« je ne vends pas ici »), les fermées (Leboncoin hors de France…), Leboncoin délégué à un autre
//     compte, et Opla (quittée le 10/10) ;
//   · l'état vient de la VÉRITÉ SERVEUR (plateformes_verite, utils/veritePlateformes) — jamais un calcul de plus ;
//     le motif de la sonde Vinted (extension ≥ 0.6.187, extension_sessions.sonde_motif) ne fait que PRÉCISER un état
//     « inconnue » : il ne contredit jamais une connexion prouvée ;
//   · connectée → silence ; pas encore vue → « FillSell ne voit pas encore ta connexion à X » + « Me connecter » ;
//     prouvée déconnectée → « Tu n'es pas connecté à X » ; session vue mais bloquée par l'anti-robot → un AUTRE
//     message, jamais « pas connecté » ; Depop à autoriser → « Autoriser Depop » ; eBay → relier le compte ;
//   · extension jamais vue → UN message d'installation (la carte existante), aucune ligne par plateforme ;
//   · client FillSell Cloud → l'état du Cloud (cloud/connexionsCloud) et SES mots — jamais « ordinateur » ni
//     « Chrome » ; état du compte pas encore lu → rien (on n'écrit pas un texte d'ordinateur à un client Cloud).
// Les phrases sont vraies quelle que soit la cause : avec une extension 0.6.186, un 403 ne distingue pas « pas
// connecté » et « anti-robot », et « FillSell ne voit pas encore ta connexion » est vrai dans les deux cas.
// Verrou : scripts/connexion-choisie-selftest.mjs (cas réels).
import { connexionCloudDe, textesConnexionsCloud } from '../cloud/connexionsCloud.js';
import { PLATEFORMES_CLOUD } from '../cloud/voieCloud.js';

/** L'ordre d'affichage : celui du parcours d'entrée (Opla n'y est plus depuis le 02/10). */
export const PLATEFORMES_CHOIX = Object.freeze(['vinted', 'leboncoin', 'ebay', 'beebs', 'depop']);
export const NOMS = Object.freeze({ vinted: 'Vinted', leboncoin: 'Leboncoin', ebay: 'eBay', beebs: 'Beebs', depop: 'Depop' });

export const ETATS_CONNEXION = Object.freeze({
  CONNECTEE: 'connectee',
  PAS_VUE: 'pas_vue',
  DECONNECTEE: 'deconnectee',
  BLOQUEE: 'bloquee',
  A_AUTORISER: 'a_autoriser',
  A_RELIER: 'a_relier',
  CLOUD_A_CONNECTER: 'cloud_a_connecter',
  CLOUD_A_RECONNECTER: 'cloud_a_reconnecter',
});

// Les motifs de la sonde Vinted (background.js, classerRefus403Vinted, 0.6.187).
export const MOTIFS_SONDE = Object.freeze({
  PAS_CONNECTE: 'pas_connecte',            // 403 « access_denied » ET aucun cookie de connexion (v_uid)
  SESSION_VUE_BLOQUEE: 'session_vue_bloquee', // 403 avec le cookie de connexion : la session est là, Vinted refuse
  ANTI_ROBOT: 'anti_robot',                // page anti-robot (HTML) sans cookie de connexion lisible : rien d'affirmé
});

const FR = {
  meConnecter: 'Me connecter',
  ouvrir: (n) => `Ouvrir ${n}`,
  autoriserDepop: 'Autoriser Depop',
  relierEbay: 'Relier eBay à FillSell',
  carteTitre: 'Tes plateformes à connecter',
  carteSous: (k) => (k > 1 ? `${k} plateformes que tu as choisies ne sont pas encore prêtes pour FillSell.` : 'Une plateforme que tu as choisie n’est pas encore prête pour FillSell.'),
  jeNeVendsPas: (n) => `Je ne vends pas sur ${n}`,
  installation: 'Installe l’extension FillSell sur ton ordinateur : c’est elle qui se connecte à tes plateformes.',
  pasVue: {
    titre: (n) => `${n} : connexion pas encore vue`,
    texte: (n) => `FillSell ne voit pas encore ta connexion à ${n}. Ouvre ${n} et connecte-toi si besoin : FillSell pourra alors y publier et synchroniser tes annonces.`,
    court: 'connexion pas encore vue',
  },
  deconnectee: {
    titre: (n) => `${n} : pas connecté`,
    texte: (n) => `Tu n'es pas connecté à ${n} sur ton ordinateur : FillSell ne peut ni y publier ni y synchroniser tes annonces. Connecte-toi à ${n}.`,
    court: 'pas connecté',
  },
  bloquee: {
    titre: (n) => `${n} : vérification bloquée`,
    texte: (n) => `Ta connexion à ${n} est bien là, mais ${n} bloque pour l'instant la vérification de FillSell (protection anti-robot). Ouvre ${n} et passe la vérification si elle s'affiche : FillSell réessaie tout seul.`,
    court: 'vérification bloquée (anti-robot)',
  },
  aRelier: {
    titre: () => 'eBay : à relier à FillSell',
    texte: () => 'FillSell ne voit pas ta connexion à eBay. Relie ton compte eBay à FillSell (le plus simple), ou connecte-toi sur eBay.',
    court: 'à relier à FillSell',
  },
  aAutoriser: {
    titre: () => 'Depop : à autoriser',
    texte: () => 'Depop attend ton autorisation pour que FillSell y dépose et synchronise tes annonces. Appuie sur « Autoriser Depop » : c’est une seule fois.',
    court: 'à autoriser',
  },
};
const EN = {
  meConnecter: 'Sign in',
  ouvrir: (n) => `Open ${n}`,
  autoriserDepop: 'Allow Depop',
  relierEbay: 'Link eBay to FillSell',
  carteTitre: 'Platforms to connect',
  carteSous: (k) => (k > 1 ? `${k} platforms you chose aren't ready for FillSell yet.` : "A platform you chose isn't ready for FillSell yet."),
  jeNeVendsPas: (n) => `I don't sell on ${n}`,
  installation: 'Install the FillSell extension on your computer: it is what connects to your platforms.',
  pasVue: {
    titre: (n) => `${n}: connection not seen yet`,
    texte: (n) => `FillSell can't see your ${n} connection yet. Open ${n} and sign in if needed: FillSell can then post and sync your listings there.`,
    court: 'connection not seen yet',
  },
  deconnectee: {
    titre: (n) => `${n}: not signed in`,
    texte: (n) => `You're not signed in to ${n} on your computer: FillSell can't post or sync your listings there. Sign in to ${n}.`,
    court: 'not signed in',
  },
  bloquee: {
    titre: (n) => `${n}: check blocked`,
    texte: (n) => `Your ${n} connection is there, but ${n} is blocking FillSell's check for now (bot protection). Open ${n} and pass the check if one shows up: FillSell retries on its own.`,
    court: 'check blocked (bot protection)',
  },
  aRelier: {
    titre: () => 'eBay: link it to FillSell',
    texte: () => "FillSell can't see your eBay connection. Link your eBay account to FillSell (easiest), or sign in on eBay.",
    court: 'to link to FillSell',
  },
  aAutoriser: {
    titre: () => 'Depop: to allow',
    texte: () => 'Depop is waiting for your permission so FillSell can post and sync your listings there. Tap “Allow Depop”: it’s a one-time step.',
    court: 'to allow',
  },
};
export const textesConnexionChoisie = (lang = 'fr') => (lang === 'en' ? EN : FR);

const nomDe = (p) => NOMS[p] ?? p;
const liste = (x) => (Array.isArray(x) ? x.map(String) : []);

/**
 * Les plateformes CHOISIES (dans l'ordre du parcours), d'après la vérité serveur : déclarées, ni écartées, ni fermées,
 * ni déléguées, jamais Opla. Vérité absente → [].
 */
export function plateformesChoisies(verite, { plateformesFermees = [], delegues = [] } = {}) {
  const p = verite?.plateformes;
  if (!p || typeof p !== 'object') return [];
  const fermees = new Set([...liste(plateformesFermees), ...liste(delegues)]);
  return PLATEFORMES_CHOIX.filter((pf) => p[pf] && p[pf].declaree === true && p[pf].ecartee !== true
    && p[pf].etat !== 'ecartee' && !fermees.has(pf));
}

function ligne(T, p, etat, cle, geste, lang) {
  const nom = nomDe(p);
  const t = T[cle];
  return { p, nom, etat, titre: t.titre(nom), texte: t.texte(nom), court: t.court, geste: { ...geste, lang } };
}

/** L'état d'UNE plateforme choisie, hors Cloud (pur). null = connectée (silence). */
function ligneOrdinateur(v, p, motifSonde, T, lang) {
  const etat = v?.etat ?? 'inconnue';
  if (etat === 'connectee') return null;
  if (etat === 'a_connecter') {
    if (p === 'ebay') return ligne(T, p, ETATS_CONNEXION.A_RELIER, 'aRelier', { type: 'connexion', libelle: T.meConnecter }, lang);
    return ligne(T, p, ETATS_CONNEXION.DECONNECTEE, 'deconnectee', { type: 'connexion', libelle: T.meConnecter }, lang);
  }
  if (etat === 'a_autoriser') {
    if (p !== 'depop') return null; // Opla n'est jamais dite (quittée le 10/10)
    return ligne(T, p, ETATS_CONNEXION.A_AUTORISER, 'aAutoriser', { type: 'autoriser_depop', libelle: T.autoriserDepop }, lang);
  }
  // (13/11) « À vérifier » (une preuve « connectée » de plus de 7 jours) : la plateforme A été vue connectée — elle
  // garde son affichage d'avant (Réglages « à vérifier »), elle n'est pas « pas vue ».
  if (etat !== 'inconnue') return null;
  // Le motif de la sonde Vinted (≥ 0.6.187) ne fait que préciser « inconnue ».
  if (motifSonde === MOTIFS_SONDE.SESSION_VUE_BLOQUEE) {
    return ligne(T, p, ETATS_CONNEXION.BLOQUEE, 'bloquee', { type: 'ouvrir', libelle: T.ouvrir(nomDe(p)) }, lang);
  }
  if (motifSonde === MOTIFS_SONDE.PAS_CONNECTE) {
    return ligne(T, p, ETATS_CONNEXION.DECONNECTEE, 'deconnectee', { type: 'connexion', libelle: T.meConnecter }, lang);
  }
  return ligne(T, p, ETATS_CONNEXION.PAS_VUE, 'pasVue', { type: 'connexion', libelle: T.meConnecter }, lang);
}

/** L'état d'UNE plateforme choisie d'un client FillSell Cloud (pur) : ses mots, jamais « ordinateur » ni « Chrome ». */
function ligneCloud(verite, cloud, p, lang) {
  const TC = textesConnexionsCloud(lang);
  const T = textesConnexionChoisie(lang);
  const nom = nomDe(p);
  if (p === 'ebay') {
    // eBay d'un client Cloud se relit par l'API (12/11) : connecté = relié ; drapeau pas encore lu → on ne dit rien.
    if (verite?.plateformes?.ebay?.source === 'api' || cloud.ebayApi !== false) return null;
    return { p, nom, etat: ETATS_CONNEXION.A_RELIER, titre: TC.titreEbayARelier, texte: TC.syncEbayARelier, court: lang === 'en' ? 'to link to FillSell' : 'à relier à FillSell', geste: { type: 'relier_ebay_api', libelle: T.relierEbay, lang } };
  }
  if (!PLATEFORMES_CLOUD.includes(p)) return null;
  const c = connexionCloudDe(cloud, p);
  if (c === 'a_connecter') {
    return { p, nom, etat: ETATS_CONNEXION.CLOUD_A_CONNECTER, titre: lang === 'en' ? `${nom}: ${TC.lignePasConnecte}` : `${nom} : ${TC.lignePasConnecte}`, texte: TC.syncPfPasConnecte(nom), court: TC.lignePasConnecte, geste: { type: 'cloud', libelle: T.meConnecter, lang } };
  }
  if (c === 'a_reconnecter') {
    const court = lang === 'en' ? 'connection to redo' : 'connexion à refaire';
    return { p, nom, etat: ETATS_CONNEXION.CLOUD_A_RECONNECTER, titre: lang === 'en' ? `${nom}: ${court}` : `${nom} : ${court}`, texte: TC.syncPfAReconnecter(nom), court, geste: { type: 'cloud', libelle: lang === 'en' ? 'Reconnect' : 'Me reconnecter', lang } };
  }
  return null;
}

/**
 * Ce que le vendeur doit lire sur ses plateformes choisies (pur).
 * @param {object} o
 * @param {object|null} o.verite      la réponse de plateformes_verite ({ ok, extension_vue_le, plateformes })
 * @param {object|null} o.cloud       { compteLu, clientCloud, lu, etats, isoles, ebayApi } — compteLu : l'état
 *                                    « client Cloud » est-il connu (useEtatCompteCloud) ; lu : les connexions du Cloud
 * @param {object|null} o.sondeMotif  extension_sessions.sonde_motif ({ vinted: 'pas_connecte' | … })
 * @param {string[]} o.plateformesFermees, o.delegues
 * @returns {{ lu: boolean, clientCloud: boolean, installation: boolean, choisies: string[], lignes: object[] }}
 */
export function connexionsChoisies({ verite = null, cloud = null, sondeMotif = null, plateformesFermees = [], delegues = [], lang = 'fr' } = {}) {
  const vide = { lu: false, clientCloud: false, installation: false, choisies: [], lignes: [] };
  if (!verite || verite.ok !== true || !verite.plateformes) return vide;
  const cl = cloud ?? { compteLu: true, clientCloud: false };
  if (cl.compteLu === false) return vide;
  const choisies = plateformesChoisies(verite, { plateformesFermees, delegues });
  const T = textesConnexionChoisie(lang);
  if (cl.clientCloud === true) {
    if (cl.lu !== true) return { ...vide, clientCloud: true, choisies };
    const lignes = choisies.map((p) => ligneCloud(verite, cl, p, lang)).filter(Boolean);
    return { lu: true, clientCloud: true, installation: false, choisies, lignes };
  }
  if (!verite.extension_vue_le) return { lu: true, clientCloud: false, installation: choisies.length > 0, choisies, lignes: [] };
  const motifs = sondeMotif && typeof sondeMotif === 'object' ? sondeMotif : {};
  const lignes = choisies.map((p) => ligneOrdinateur(verite.plateformes[p], p, motifs[p] ?? verite.plateformes[p]?.sonde_motif ?? null, T, lang)).filter(Boolean);
  return { lu: true, clientCloud: false, installation: false, choisies, lignes };
}

/** Les lignes dont la plateforme n'a pas DÉJÀ son point (un relevé raté garde son message d'avant, intact). */
export function lignesNonDites(lignes, dejaDites) {
  const deja = dejaDites instanceof Set ? dejaDites : new Set(liste(dejaDites));
  return (Array.isArray(lignes) ? lignes : []).filter((l) => l && !deja.has(l.p));
}
