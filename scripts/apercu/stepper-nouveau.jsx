// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — le NOUVEAU stepper de publication, écran par écran, sans session
// (refonte du 24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Il monte la COQUE RÉELLE
// (src/publication/StepperNouveau.jsx) et ses écrans réels, avec un moteur en
// dur — le même contrat que celui que ListingPreviewScreen tend à la coque —
// et l'article de la maquette (« Baskets New Balance 990 noir »).
//
// Pourquoi il existe : ouvrir le stepper dans l'app demande une session, et
// une session fillsell.app en automatisation est interdite (CLAUDE.md). Ici,
// aucun compte, aucun réseau, aucune génération : des objets en dur, les
// composants réels. Ce qu'il montre est la mise en page ; ce qu'il ne prouve
// pas, c'est le câblage au moteur réel — c'est le test en réel qui le prouve.
//
//     node scripts/apercu/capture-stepper-nouveau.mjs
//     (ou : vite, puis /scripts/apercu/stepper-nouveau.html?ecran=1|2|3|4)
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import StepperNouveau from '../../src/publication/StepperNouveau.jsx';
import { useTranslation } from '../../src/i18n/useTranslation.js';
import { dissociationsVides } from '../../src/utils/valeursGenerales.js';
import { calculerExclusions, champsBloquantsParPlateforme } from '../../src/publication/moteur/regles.js';
import { MIN_PHOTOS, MAX_PHOTOS } from '../../src/utils/photos.js';

const params = new URLSearchParams(location.search);
const ECRAN = Number(params.get('ecran') || '1');
const FICHE = params.get('fiche') === '1';

// Trois photos en dur (SVG), pas de réseau.
const photoSvg = (couleur, texte) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${couleur}"/><text x="300" y="330" font-family="sans-serif" font-size="120" text-anchor="middle" fill="#ffffff">${texte}</text></svg>`);
const PHOTOS = [photoSvg('#2F4F4F', '👟'), photoSvg('#4A6B6B', '👟'), photoSvg('#6B8E8E', '👟')];

const TITRE = 'Baskets New Balance 990 noir';
const DESC = "New Balance 990 noires, portées quelques fois, semelle intacte.\nBoîte d'origine.";
const noop = () => {};

// Un client Supabase FACTICE : toute chaîne d'appels rend { data, error: null }.
function faux(table, donnees) {
  const chaine = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') return (res) => res({ data: donnees, error: null });
      return () => chaine;
    },
    apply() { return chaine; },
  });
  return chaine;
}
const JOBS_FOURNEE = [
  { id: 'j1', platform: 'leboncoin', action: 'publish', status: 'processing', created_at: new Date().toISOString(), error: null, listing_url: null, platform_fields: {} },
  { id: 'j2', platform: 'vinted', action: 'publish', status: 'published', created_at: new Date().toISOString(), error: null, listing_url: 'https://www.vinted.fr/items/123', platform_fields: {} },
  { id: 'j3', platform: 'beebs', action: 'publish', status: 'pending', created_at: new Date().toISOString(), error: null, listing_url: null, platform_fields: {} },
  { id: 'j4', platform: 'opla', action: 'publish', status: 'needs_user', created_at: new Date().toISOString(), error: "La publication sur Opla attend : l'accès à opla.co…", listing_url: null, platform_fields: { needs_user_source: 'opla_acces' } },
];
const supabaseFactice = {
  from: (table) => faux(table, table === 'cross_post_jobs' ? JOBS_FOURNEE : []),
  rpc: () => Promise.resolve({ data: { annonces: { plafond: 100, consommes: 11, restantes: 89 } }, error: null }),
};

const pointures = Array.from({ length: 12 }, (_, i) => ({ value: `EU ${36 + i}`, label: `EU ${36 + i}` }));
const platformFieldsConfig = {
  vinted: [
    { key: 'taille', label: 'Taille', type: 'select', options: pointures, groups: [{ groupLabel: 'Pointures', options: pointures }] },
  ],
};

const copies = () => ({
  vinted: { title: TITRE, description: DESC, price: 85, platform_fields: { etat: 'Bon état', taille: 'EU 42', marque: 'New Balance', couleur: 'Noir', genre: 'Homme', categoryPath: ['Hommes', 'Chaussures', 'Baskets'] } },
  leboncoin: { title: TITRE, description: DESC, price: 85, platform_fields: { etat: 'Bon état', univers: 'Homme', lbcCategoryPath: ['Mode', 'Chaussures'], format_colis: 'Moyen' } },
  beebs: { title: TITRE.slice(0, 60), description: DESC, price: 85, platform_fields: { etat: 'Bon état', genre: 'Homme', beebsCategoryPath: ['Mode', 'Homme', 'Chaussures', 'Baskets (homme)'] } },
  opla: { title: TITRE, description: DESC, price: 85, platform_fields: { etat: 'Bon état', taille: 'EU 42' } },
});

function Apercu() {
  const { t, tpl } = useTranslation('fr');
  const [selected, setSelected] = useState(() => new Set(ECRAN === 3 ? ['vinted', 'leboncoin', 'beebs', 'opla'] : ['vinted', 'leboncoin', 'beebs']));
  const [edited, setEdited] = useState(copies);
  const [photoOption, setPhotoOption] = useState('original');
  const [sharedFields, setSharedFields] = useState({ taille: '', couleur: 'Noir', matiere: '', marque: 'New Balance' });
  const [prixAchatSaisi, setPrixAchatSaisi] = useState('');
  const [prixAchatInconnu, setPrixAchatInconnu] = useState(false);
  const [generales, setGenerales] = useState({ titre: TITRE, description: DESC, etat: 'Bon état' });
  const [notes, setNotes] = useState('');
  const [retoucheAvisLu, setRetoucheAvisLu] = useState(false);

  const platformListings = ECRAN >= 2 || FICHE ? { platforms: { vinted: {}, leboncoin: {}, beebs: {}, opla: {} } } : null;
  const genericRequiredStatus = ECRAN === 3
    ? { leboncoin: [{ key: 'furniture_type', label: 'Produit', state: 'missing', allowedValues: ['Baskets', 'Bottes', 'Sandales', 'Autre'], dedicatedTarget: null }] }
    : null;
  const redSharedFields = ECRAN === 3 && !sharedFields.taille ? ['taille'] : [];
  const missingSharedFieldsDetailed = redSharedFields.map((k) => ({ key: k, platforms: ['leboncoin', 'ebay'] }));
  const exclusionsPrevues = calculerExclusions({
    selected, platformSupport: {}, platformListings,
    plateformesSansAdresse: [], champsManquantsParPf: champsBloquantsParPlateforme(genericRequiredStatus),
  });
  const nbQuestions = redSharedFields.length + (genericRequiredStatus ? 1 : 0) + (ECRAN === 3 && !prixAchatInconnu && !prixAchatSaisi ? 1 : 0);
  const prixAchatManquant = ECRAN === 3 && !prixAchatInconnu && !String(prixAchatSaisi).trim();
  const ctaDisabled = ECRAN === 3 && prixAchatManquant;

  const propsStepGeneration = {
    generating: false, generateError: '', platformListings, processedPhotos: PHOTOS,
    selected, edited, setEdited, onPhotoClick: noop, onRetry: noop, generatePrice: null, noteOverride: noop,
    ficheReprise: FICHE, ebayVoieApiReelle: false,
    rayonsParPf: {
      vinted: { chemin: ['Hommes', 'Chaussures', 'Baskets'], id: null, choisi: false, incertain: false },
      leboncoin: { chemin: ['Mode', 'Chaussures'], id: null, choisi: false, incertain: false },
      beebs: { chemin: ['Mode', 'Homme', 'Chaussures', 'Baskets (homme)'], id: null, choisi: false, incertain: false },
    },
    suggestionsParPf: {}, supabase: supabaseFactice, onChoisirRayon: noop,
    lang: 'fr', price: 85, setPrice: noop, customPriced: new Set(), setCustomPriced: noop, articleIcon: '👟', photoOption,
    onEstimatePrice: null, estimating: false, estimateCost: null, estimateError: '', estimateResult: null,
    prixAchat: null, carteAOuvrir: null, onCarteOuverte: noop,
    generales, onValeurGenerale: (champ, v) => setGenerales((g) => ({ ...g, [champ]: v })),
    versionsTexte: [], ficheTexte: { titre: TITRE, description: DESC },
    divergence: null, divergenceTranchee: null, onTrancherDivergence: noop,
    dissociees: dissociationsVides(), onModifierCarte: (p, champ, v) => setEdited((prev) => ({ ...prev, [p]: { ...prev[p], [champ === 'titre' ? 'title' : champ]: v } })), onRetablirCarte: noop,
  };

  const m = {
    lang: 'fr', t, tpl, userId: null, supabase: supabaseFactice, onClose: noop, onCompleter: noop, modales: null,
    step: ECRAN === 4 ? 3 : ECRAN, done: ECRAN === 4, isLocked: false, initializing: false,
    suivant: noop, retour: noop, quitter: noop, quitterArme: false, quitterPerdraitDuTravail: false,
    MIN_PHOTOS, MAX_PHOTOS, MAX_RETOUCHED: 5,
    initialListing: { titre: TITRE, description: DESC, prix_vente_suggere: 85 }, invId: 1, titreArticle: TITRE, etatArticle: 'Bon état',
    price: 85, generales, edited, selected, setSelected,
    photos: PHOTOS, displayPreviews: PHOTOS, pickedPreviews: [], photoCount: PHOTOS.length,
    addFiles: noop, removeFile: noop, handleReorderPreviews: noop, handleAddMorePhotos: noop, handleRemovePhoto: noop, handleReorderPhotos: noop,
    uploading: false, uploadError: '', setLightboxUrl: noop,
    notes, setNotes, micActive: false, toggleMic: noop, micDisponible: false,
    photoOption, setPhotoOption, reuseRetouched: false, retoucheNewCount: 0, retoucheNonLivree: false, retoucheAvisLu, setRetoucheAvisLu, coinPrices: null,
    modeleAConfirmer: false, modelePropose: null, modeleSource: null, setModeleConfirme: noop, identifyFailed: false,
    analysisHidden: true, photoAnalysis: null, analyzing: false, analysisError: '', handleAnalyzePhotos: noop,
    texteDuVendeur: true,
    plateformesAffichees: ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla'], plateformesAVenir: ['opla'], plateformesOuvertes: ['opla'],
    oplaMotifGrise: 'fermee', oplaExtensionMin: null, oplaAcces: false,
    motifAVenir: () => 'Opla est en préparation — visible ici, pas encore ouverte à la publication.',
    basculer: (p) => setSelected((prev) => { const s = new Set(prev); if (s.has(p)) s.delete(p); else s.add(p); return s; }),
    platformSupport: {}, categorieFermee: (s) => ['unavailable', 'prohibited'].includes(s ?? 'supported'), motifSupport: () => '',
    publishedSet: new Set(ECRAN === 3 ? ['ebay'] : []), queuedSet: new Set(), lockedSet: new Set(ECRAN === 3 ? ['ebay'] : []),
    attentes: {}, motifsVerrouillage: ECRAN === 3 ? { ebay: 'déjà en ligne pour cet article' } : {},
    phraseEtat: () => '', pausedPlatforms: [], pausedReasons: {}, motifPause: () => '',
    ebayBloque: false, motifEbay: '', boutonEbay: 'Paramétrer eBay', ebayVoieApi: true, ebayVoieApiReelle: true, ouvrirPanneauEbay: noop,
    platformSessions: { vinted: true, leboncoin: false },
    voiesDuLot: { extension: ['vinted', 'leboncoin', 'beebs', 'opla'], serveur: ['ebay'], toutServeur: false, mixte: false },
    extFraicheurPublier: { etat: 'vivante', jours: 0 }, extensionVueLe: new Date(Date.now() - 65_000).toISOString(), extensionBlocked: false,
    plateformesPubliables: new Set(selected), plateformesBloqueesChamps: genericRequiredStatus ? ['leboncoin'] : [],
    publishChips: [...selected].filter((p) => p !== 'leboncoin' || !genericRequiredStatus), publishTotalFor: () => null,
    propsStepGeneration,
    etatsParPlateforme: { vinted: { ton: 'ok', libelle: 'Prêt' }, leboncoin: { ton: 'geste', libelle: '1 question' }, beebs: { ton: 'ok', libelle: 'Prêt' }, opla: { ton: 'ok', libelle: 'Prêt' } },
    nbQuestions,
    generatingPlatforms: false, platformError: '', platformListings, processedPhotos: PHOTOS, handleGeneratePlatforms: noop, ficheReprise: FICHE,
    modifierCarte: propsStepGeneration.onModifierCarte, platformFieldsConfig,
    redSharedFields, redSharedFieldPlatforms: { taille: 'Leboncoin, eBay' }, sharedFields,
    setSharedField: (k, v) => setSharedFields((s) => ({ ...s, [k]: v })), sharedChildAxes: null, missingSharedFieldsDetailed,
    vintedGenreBlocked: false, beebsGenreBlocked: false, ebayRequiredStatus: null, setEbayAspect: noop, setEbaySharedField: noop,
    genericRequiredStatus, setPlatformAspect: noop, setPlatformDedicatedField: noop, EBAY_CLOSED_LIST_MAX: 200,
    demanderPrixAchat: ECRAN === 3, prixAchatSaisi, setPrixAchatSaisi, prixAchatInconnu, setPrixAchatInconnu, prixAchatManquant,
    inventoryFull: false, stockCount: null, stockLimitCfg: 200,
    lbcPhotoCap: null, lbcAdresseManquante: null,
    jumeaux: ECRAN === 3 ? [{ platform: 'leboncoin', titre: 'New Balance 990 noires 42', prix: 80, url: 'https://www.leboncoin.fr/ad/1', preuve: 'photo' }] : [],
    descriptionMentions: null, descriptionVideVinted: false,
    exclusionsPrevues, plateformesRetirables: [],
    publishError: '', publishing: false, motifsCtaGris: ctaDisabled ? ["Prix d'achat à renseigner"] : [], ctaDisabled, ctaBlockingActive: ctaDisabled, requiredBlocking: ctaDisabled, publishedStateLoaded: true,
    ctaLabel: `Publier sur ${[...selected].filter((p) => p !== 'leboncoin' || !genericRequiredStatus).length} plateformes`,
    fournee: ECRAN === 4 ? { inventaireId: 1, plateformes: ['leboncoin', 'vinted', 'beebs', 'opla'], depuis: new Date(Date.now() - 10_000).toISOString() } : null,
    exclusionsDuClic: ECRAN === 4 ? [{ platform: 'ebay', motif: 'sans_adresse' }] : [],
    publieesSansPf: [], createdThisRun: false, parcoursCreation: false,
  };
  return <StepperNouveau m={m} />;
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
