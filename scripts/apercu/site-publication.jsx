/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu (captures du site), jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU SITE — publier : le stepper (une fiche) et le lot (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de CAPTURES pour le site vitrine, jamais livré. Même montage que
// stepper-nouveau.jsx et lot-publication.jsx (la COQUE RÉELLE et ses écrans
// réels, avec un moteur en dur au contrat de celui que ListingPreviewScreen
// tend à la coque), mais :
//   · le compte et les articles de DÉMONSTRATION (site-donnees-demo.js) ;
//   · les cinq plateformes présentées, toutes connectées — Depop ouverte comme
//     App.jsx l'ouvre quand la garde depop_autorise répond oui (plateformes
//     « à venir » visibles ET ouvertes = ['depop']) ; jamais Opla ; aucune
//     session fermée, aucun quota à l'écran. Depop n'est jamais précochée par
//     l'app : la case cochée ici est le geste de Camille ;
//   · eBay relié : il part « de nos serveurs, sans l'extension » (F31).
// Ce que les captures montrent est la MISE EN PAGE des écrans réels ; le
// câblage au moteur réel est prouvé ailleurs (tests en réel).
//
//   site-publication.html?ecran=ou-publier | verifier | lot-plateformes | lot-pret
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import StepperNouveau from '../../src/publication/StepperNouveau.jsx';
import { CoqueLot, EcranPlateformes, EcranAvant } from '../../src/publication/lot/LotPublication.jsx';
import { resumeParPlateforme, partagerQuota, dureeEstimeeMin, libelleDuree, PLATEFORMES_LOT } from '../../src/publication/lot/regles.js';
import { PLATEFORMES_STOCK_OUVERTES } from '../../src/utils/stockFiltres.js';
import { useTranslation } from '../../src/i18n/useTranslation.js';
import { dissociationsVides } from '../../src/utils/valeursGenerales.js';
import { calculerExclusions } from '../../src/publication/moteur/regles.js';
import { MIN_PHOTOS, MAX_PHOTOS } from '../../src/utils/photos.js';
import { supabase } from '../../src/lib/supabase.js';
import { donneesDemo, resultatLensDemo, PHOTOS } from './site-donnees-demo.js';

const ecran = new URLSearchParams(location.search).get('ecran') || 'ou-publier';
const MAINTENANT = Date.now(); // lu une fois, au chargement (jamais pendant un rendu)
const D = donneesDemo(MAINTENANT);
const EXTENSION_VUE_LE = new Date(MAINTENANT - 65_000).toISOString();
const LOT_PREPARE_LE = new Date(MAINTENANT - 4 * 60_000).toISOString();
window.__FIXTURE = { utilisateur: D.utilisateur, tables: D.tables, rpc: D.rpc };
window.__donneesDemo = { origine: D.origine };
const noop = () => {};
// L'ordre du stepper : celui de ListingPreviewScreen (PLATFORMS_DEFAULT, puis
// les plateformes « à venir » visibles — Depop).
const PF = [...PLATEFORMES_STOCK_OUVERTES, 'depop'];
const A_VENIR = ['depop'];

// ── LE STEPPER : le t-shirt Picture scanné par Lens hier, pas encore en ligne ─
const L = resultatLensDemo();
const ART = D.parCle.teeOurs;
const TITRE = ART.titre;
const DESC = L.description;
const PRIX = ART.prix_vente;
const PHOTOS_ART = [PHOTOS.teeOurs];
const copies = () => ({
  vinted: { title: TITRE, description: DESC, price: PRIX, platform_fields: { etat: 'Très bon état', taille: 'S', marque: 'Picture', couleur: 'Gris', genre: 'Homme', categoryPath: ['Hommes', 'Vêtements', 'Hauts et t-shirts', 'T-shirts'] } },
  leboncoin: { title: TITRE, description: DESC, price: PRIX, platform_fields: { etat: 'Très bon état', univers: 'Homme', lbcCategoryPath: ['Mode', 'Vêtements'] } },
  ebay: { title: TITRE, description: DESC, price: PRIX, platform_fields: { etat: 'Très bon état', taille: 'S', marque: 'Picture' } },
  beebs: { title: TITRE.slice(0, 60), description: DESC, price: PRIX, platform_fields: { etat: 'Très bon état', genre: 'Homme', beebsCategoryPath: ['Mode', 'Homme', 'Hauts', 'T-shirts'] } },
  // Depop : pas de titre, la description fait l'annonce (utils/depopPublication).
  depop: { title: '', description: `${DESC}

#picture #organicclothing #tshirt`, price: PRIX, platform_fields: { etat: 'Très bon état', taille: 'S', marque: 'Picture', couleur: 'Gris', genre: 'Homme' } },
});

function Stepper({ n }) {
  const { t, tpl } = useTranslation('fr');
  const [selected, setSelected] = useState(() => new Set(PF));
  const [edited, setEdited] = useState(copies);
  const [photoOption, setPhotoOption] = useState('original');
  const [generales, setGenerales] = useState({ titre: TITRE, description: DESC, etat: 'Très bon état' });
  const [notes, setNotes] = useState('');
  const [retoucheAvisLu, setRetoucheAvisLu] = useState(false);
  const platformListings = { platforms: { vinted: {}, leboncoin: {}, ebay: {}, beebs: {}, depop: {} } };
  const exclusionsPrevues = calculerExclusions({ selected, platformSupport: {}, platformListings, plateformesSansAdresse: [], champsManquantsParPf: {} });
  const onModifierCarte = (p, champ, v) => setEdited((prev) => ({ ...prev, [p]: { ...prev[p], [champ === 'titre' ? 'title' : champ]: v } }));
  const propsStepGeneration = {
    generating: false, generateError: '', platformListings, processedPhotos: PHOTOS_ART,
    selected, edited, setEdited, onPhotoClick: noop, onRetry: noop, generatePrice: null, noteOverride: noop,
    ficheReprise: true, ebayVoieApiReelle: true,
    rayonsParPf: {
      vinted: { chemin: ['Hommes', 'Vêtements', 'Hauts et t-shirts', 'T-shirts'], id: null, choisi: false, incertain: false },
      leboncoin: { chemin: ['Mode', 'Vêtements'], id: null, choisi: false, incertain: false },
      ebay: { chemin: ['Vêtements, accessoires', 'Hommes', 'Hauts', 'T-shirts'], id: null, choisi: false, incertain: false },
      beebs: { chemin: ['Mode', 'Homme', 'Hauts', 'T-shirts'], id: null, choisi: false, incertain: false },
      depop: { chemin: ['Homme', 'Hauts', 'T-shirts'], id: 'menswear/tops/tshirts', choisi: false, incertain: false },
    },
    suggestionsParPf: {}, questionsRayonParPf: {}, supabase, onChoisirRayon: noop,
    lang: 'fr', price: PRIX, setPrice: noop, customPriced: new Set(), setCustomPriced: noop, articleIcon: '👕', photoOption,
    onEstimatePrice: null, estimating: false, estimateCost: null, estimateError: '', estimateResult: null,
    prixAchat: ART.prix_achat, carteAOuvrir: null, onCarteOuverte: noop,
    generales, onValeurGenerale: (champ, v) => setGenerales((g) => ({ ...g, [champ]: v })),
    versionsTexte: [], ficheTexte: { titre: TITRE, description: DESC },
    divergence: null, divergenceTranchee: null, onTrancherDivergence: noop,
    dissociees: dissociationsVides(), onModifierCarte, onRetablirCarte: noop,
  };
  const m = {
    lang: 'fr', t, tpl, userId: D.utilisateur.id, supabase, onClose: noop, onCompleter: noop, modales: null,
    step: n, done: false, isLocked: false, initializing: false,
    suivant: noop, retour: noop, quitter: noop, quitterArme: false, quitterPerdraitDuTravail: false,
    MIN_PHOTOS, MAX_PHOTOS, MAX_RETOUCHED: 5,
    initialListing: { titre: TITRE, description: DESC, prix_vente_suggere: PRIX }, invId: ART.id, titreArticle: TITRE, etatArticle: 'Très bon état',
    price: PRIX, generales, edited, selected, setSelected,
    photos: PHOTOS_ART, displayPreviews: PHOTOS_ART, pickedPreviews: [], photoCount: PHOTOS_ART.length,
    addFiles: noop, removeFile: noop, handleReorderPreviews: noop, handleAddMorePhotos: noop, handleRemovePhoto: noop, handleReorderPhotos: noop,
    uploading: false, uploadError: '', setLightboxUrl: noop,
    notes, setNotes, micActive: false, toggleMic: noop, micDisponible: false,
    photoOption, setPhotoOption, reuseRetouched: false, retoucheNewCount: 0, retoucheNonLivree: false, retoucheAvisLu, setRetoucheAvisLu, coinPrices: null,
    retoucheLivree: false, optionRedaction: 'original', retoucheARefaire: false, avisRetouche: null,
    remiseAZero: null, voirOffres: noop,
    modeleAConfirmer: false, modelePropose: null, modeleSource: null, setModeleConfirme: noop, identifyFailed: false,
    analysisHidden: true, photoAnalysis: null, analyzing: false, analysisError: '', handleAnalyzePhotos: noop,
    texteDuVendeur: true,
    plateformesAffichees: PF, plateformesAVenir: A_VENIR, plateformesOuvertes: A_VENIR,
    oplaMotifGrise: null, oplaExtensionMin: null, oplaAcces: false, motifAVenir: () => '',
    basculer: (p) => setSelected((prev) => { const s = new Set(prev); if (s.has(p)) s.delete(p); else s.add(p); return s; }),
    platformSupport: {}, categorieFermee: (s) => ['unavailable', 'prohibited'].includes(s ?? 'supported'), motifSupport: () => '',
    publishedSet: new Set(), queuedSet: new Set(), lockedSet: new Set(),
    attentes: {}, motifsVerrouillage: {}, phraseEtat: () => '', pausedPlatforms: [], pausedReasons: {}, motifPause: () => '',
    ebayBloque: false, motifEbay: '', boutonEbay: 'Paramétrer eBay', ebayVoieApi: true, ebayVoieApiReelle: true, ouvrirPanneauEbay: noop,
    platformSessions: { vinted: true, leboncoin: true, beebs: true, depop: true },
    voiesDuLot: { extension: ['vinted', 'leboncoin', 'beebs', 'depop'], serveur: ['ebay'], toutServeur: false, mixte: true },
    extFraicheurPublier: { etat: 'vivante', jours: 0 }, extensionVueLe: EXTENSION_VUE_LE, extensionBlocked: false,
    plateformesPubliables: new Set(selected), plateformesBloqueesChamps: [],
    publishChips: [...selected], publishTotalFor: () => null,
    propsStepGeneration,
    etatsParPlateforme: Object.fromEntries(PF.map((p) => [p, { ton: 'ok', libelle: 'Prêt' }])),
    nbQuestions: 0,
    generatingPlatforms: false, platformListings, processedPhotos: PHOTOS_ART, handleGeneratePlatforms: noop, ficheReprise: true,
    platformError: '', platformErrorCode: null,
    modifierCarte: onModifierCarte, platformFieldsConfig: {},
    redSharedFields: [], redSharedFieldPlatforms: {}, sharedFields: { taille: 'S', couleur: 'Gris', matiere: 'Coton', marque: 'Picture' },
    setSharedField: noop, sharedChildAxes: null, missingSharedFieldsDetailed: [],
    vintedGenreBlocked: false, beebsGenreBlocked: false, ebayRequiredStatus: null, setEbayAspect: noop, setEbaySharedField: noop,
    genericRequiredStatus: null, setPlatformAspect: noop, setPlatformDedicatedField: noop, EBAY_CLOSED_LIST_MAX: 200,
    demanderPrixAchat: false, prixAchatSaisi: '', setPrixAchatSaisi: noop, prixAchatInconnu: false, setPrixAchatInconnu: noop, prixAchatManquant: false,
    inventoryFull: false, stockCount: null, stockLimitCfg: 200,
    lbcPhotoCap: null, lbcAdresseManquante: null, jumeaux: [], descriptionMentions: null, descriptionVideVinted: false,
    exclusionsPrevues, plateformesRetirables: [], questionsParPlateforme: {},
    rayonsAChoisir: {}, suggestionsParPf: {}, choisirRayon: noop,
    publishError: '', publishing: false, motifsCtaGris: [], ctaDisabled: false, ctaBlockingActive: false, requiredBlocking: false, publishedStateLoaded: true,
    ctaLabel: 'Publier', fournee: null, exclusionsDuClic: [], publieesSansPf: [], createdThisRun: false, parcoursCreation: false,
  };
  return <StepperNouveau m={m} />;
}

// ── LE LOT : cinq articles du stock, pas encore partout ────────────────────
const CLES_LOT = ['ohlins', 'casquette', 'teeSurf', 'short', 'bottines'];
const donneesLot = CLES_LOT.map((k) => {
  const item = D.items.find((i) => i.id === D.parCle[k].id);
  const jobs = D.tables.cross_post_jobs.filter((j) => j.inventaire_id === item.id);
  return { id: String(item.id), item, jobs };
});
const parId = new Map(donneesLot.map((d) => [d.id, d]));
const LIB = { attente: 'En attente', lecture: 'Ta description…', montage: 'Lecture…', redaction: 'Rédaction…', verification: 'Vérification…', pret: 'Prêt', questions: 'À compléter', quota: 'Mois prochain', rien: 'Ne part pas', erreur: 'Pas préparé', retire: 'Retiré du lot', envoi: 'Envoi…', envoye: 'En file', refuse: 'Pas parti' };
const enLigneSur = (d) => new Set(d.jobs.filter((j) => j.action === 'publish' && j.status === 'published').map((j) => j.platform));
const ciblesDe = (d, choix) => choix.filter((p) => !enLigneSur(d).has(p));

function moteurLot(t, tpl, plateformes) {
  return {
    lang: 'fr', t, tpl, supabase: null, step: 3, preparationAuRepos: true, ctaDisabled: false, motifsCtaGris: [],
    platformFieldsConfig: {}, redSharedFields: [], sharedFields: {}, sharedChildAxes: null, redSharedFieldPlatforms: {}, missingSharedFieldsDetailed: [],
    genericRequiredStatus: {}, ebayRequiredStatus: [], selected: new Set(plateformes), plateformesPubliables: new Set(plateformes),
    setPlatformAspect: noop, setEbayAspect: noop, setSelected: noop, setSharedField: noop, setPlatformDedicatedField: noop, setEbaySharedField: noop,
    noterReponseFiche: noop, noterReponseFicheValeur: noop, modifierCarte: noop, poserPrixGeneral: noop, poserValeurGenerale: noop,
    demanderPrixAchat: false, prixAchatManquant: false, descriptionVideVinted: false, vintedGenreBlocked: false, beebsGenreBlocked: false,
    EBAY_CLOSED_LIST_MAX: 30, edited: {}, jumeaux: [], generales: {}, texteVendeur: { titre: 'x x', description: 'x x' },
    initialListing: { description: '' }, price: 20, rayonsAChoisir: {}, suggestionsParPf: {}, plateformesRetirables: [], questionsParPlateforme: {},
  };
}

const PF_LOT = PLATEFORMES_LOT.filter((p) => PF.includes(p));
// Beebs (la plateforme des parents) reste décochée : ce lot est fait de vêtements adultes.
const CHOIX_LOT = ['leboncoin', 'ebay', 'depop'];
const dureeLot = () => {
  const par = {};
  donneesLot.forEach((d) => ciblesDe(d, CHOIX_LOT).forEach((p) => { par[p] = (par[p] ?? 0) + 1; }));
  return libelleDuree(dureeEstimeeMin(par, { ebayParServeur: true }), 'fr');
};

function LotPlateformes() {
  const choix = CHOIX_LOT;
  const resume = resumeParPlateforme(donneesLot, PF_LOT);
  const partage = partagerQuota(donneesLot, { restantes: 999, consomme: () => true });
  const annonces = donneesLot.reduce((n, d) => n + ciblesDe(d, choix).length, 0);
  return (
    <CoqueLot en={false} ecran="lot-plateformes" titre={`Publier ${donneesLot.length} articles`} numeroEcran={1}
      retour={{ onClick: noop }} quitter={{ onClick: noop }} cta={`Préparer ${annonces} annonces`} onCta={noop}
      sous={['Rien ne part encore : on prépare, tu vérifies.']}>
      <EcranPlateformes en={false} lang="fr" userId={D.utilisateur.id} donnees={donneesLot} resume={resume} choix={choix} basculer={noop}
        sessions={{ vinted: true, leboncoin: true, beebs: true, depop: true }} pauses={{}} ebayBloque={false} ebayParServeur
        quotas={null} restantes={null} remise={null} partage={partage} annoncesPrevues={annonces} duree={dureeLot()}
        extensionNeverSeen={false} extensionLastSeenAt={EXTENSION_VUE_LE} mur={null} fichesLues />
    </CoqueLot>
  );
}

function LotPret() {
  const { t, tpl } = useTranslation('fr');
  const choix = CHOIX_LOT;
  const lot = { id: 'demo-lot', le: LOT_PREPARE_LE, ids: donneesLot.map((d) => d.id), plateformes: choix };
  const etats = {}; const moteurs = new Map();
  donneesLot.forEach((d) => {
    const cibles = ciblesDe(d, choix);
    etats[d.id] = { phase: 'pret', envoyees: cibles };
    moteurs.set(d.id, moteurLot(t, tpl, cibles));
  });
  const prets = lot.ids;
  const annoncesPretes = donneesLot.reduce((n, d) => n + ciblesDe(d, choix).length, 0);
  return (
    <CoqueLot en={false} ecran="lot-avant" titre={`Publier ${donneesLot.length} articles`} numeroEcran={2}
      retour={{ onClick: noop }} quitter={{ onClick: noop }} cta={`Envoyer ${annoncesPretes} annonces`} ctaDesactive={false} onCta={noop}
      sous={["L'extension FillSell les dépose ensuite depuis ton ordinateur, une après l'autre."]}>
      <EcranAvant en={false} lang="fr" L={LIB} lot={lot} etats={etats} lignes={lot.ids} parId={parId} moteurs={moteurs} decisions={{}}
        prepares={lot.ids.length} preparationFinie prets={prets} aCompleter={[]} annoncesPretes={annoncesPretes}
        communes={[]} repondreCommune={noop} decider={noop} trancherJumeau={noop} sansPlateforme={noop} retirerDuLot={noop} envoi={null}
        poidsDe={(id) => parId.get(id)?.item?.poids_g ?? null}
        livraison={{ transporteurs: ['Mondial Relay', 'Shop2Shop by Chronopost', 'Colissimo', 'Courrier suivi'], format: '' }} />
    </CoqueLot>
  );
}

const SCENES = {
  'ou-publier': () => <Stepper n={1} />,
  verifier: () => <Stepper n={2} />,
  'lot-plateformes': () => <LotPlateformes />,
  'lot-pret': () => <LotPret />,
};
createRoot(document.getElementById('apercu')).render((SCENES[ecran] ?? SCENES['ou-publier'])());
document.fonts.ready.then(() => { window.__pret = true; });
