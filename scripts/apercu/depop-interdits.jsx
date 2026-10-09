// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — catégories interdites par Depop (09/10/2026 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte les composants RÉELS, sans session ni
// réseau (faux client Supabase de vite-modale-free.config.mjs) :
//   ?scene=simple  « Où publier ? » (EcranOuPublier) pour une console : la
//                  case Depop grisée par la VRAIE règle (platformCompat →
//                  _shared/depop-interdits.js), avec SA phrase ;
//   ?scene=lot     « Avant l'envoi » d'un lot mélangé : la VRAIE carte
//                  ExclusDepop (2 articles refusés sur 4) et la VRAIE
//                  livraison du lot (frais de port Depop pour les autres).
//     node scripts/apercu/capture-depop-interdits.mjs
import { createRoot } from 'react-dom/client';
import '../../src/publication/stepper.css';
import '../../src/publication/lot/lot.css';
import EcranOuPublier from '../../src/publication/EcranOuPublier.jsx';
import ExclusDepop from '../../src/publication/lot/ExclusDepop.jsx';
import LivraisonDuLot from '../../src/publication/lot/LivraisonDuLot.jsx';
import { Carte } from '../../src/publication/composants.jsx';
import { bilanPlateformes, categorieFermee } from '../../src/publication/plateformes.js';
import { getPlatformSupport, depopInterdit } from '../../src/utils/platformCompat.js';
import { detectObjectIcon } from '../../src/utils/shared.js';
import { messageDepopInterdit } from '../../supabase/functions/_shared/depop-interdits.js';

const q = new URLSearchParams(location.search);
const scene = q.get('scene') ?? 'simple';
const noop = () => {};
const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#E7E3D8"/><rect x="28" y="40" width="64" height="40" rx="8" fill="#10201B"/><circle cx="46" cy="60" r="6" fill="#EDEAE0"/><circle cx="74" cy="60" r="6" fill="#EDEAE0"/></svg>');

function Simple() {
  const article = { titre: 'Console PS5 Slim 1 To + 2 manettes', description: 'Très bon état, boîte d\'origine.' };
  const icone = detectObjectIcon(article.titre, article.description, 'High-Tech');
  const platformSupport = getPlatformSupport(icone, article);
  const verdict = depopInterdit(icone, article);
  const m = {
    lang: 'fr', displayPreviews: [PHOTO], pickedPreviews: [], platformListings: null, quotas: null,
    reuseRetouched: false, retoucheLivree: false, optionRedaction: null, remiseAZero: null, MAX_RETOUCHED: 5,
    retouchesEpuisees: false, retoucheNewCount: 0, photoOption: 'original', setPhotoOption: noop,
    titreArticle: article.titre, etatArticle: 'Très bon état', price: 380, setLightboxUrl: noop,
    MAX_PHOTOS: 20, MIN_PHOTOS: 1, uploadError: null, identifyFailed: false, modeleAConfirmer: false,
    plateformesAffichees: ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop'], platformSupport,
    publishedSet: new Set(), queuedSet: new Set(), attentes: {}, oplaAccesDetail: null, ebayBloque: false,
    pausedPlatforms: [], plateformesAVenir: [], plateformesOuvertes: ['depop'], categorieFermee,
    selected: new Set(['vinted', 'leboncoin', 'ebay']),
    platformSessions: { vinted: true, leboncoin: true, ebay: true, beebs: true, depop: true },
    ebayVoieApiReelle: false, ebayVoieApi: false, motifAVenir: () => '', motifsVerrouillage: {}, onCompleter: null, userId: null,
    motifEbay: '', boutonEbay: '', ouvrirPanneauEbay: null, motifPause: () => '', oplaVerdict: null, phraseEtat: () => '',
    motifSupport: (p, support) => (p === 'depop' && support === 'prohibited' && verdict ? messageDepopInterdit(verdict, 'fr') : 'Pas de rayon pour cet article ici.'),
    basculer: noop, rien: null, addFiles: noop, removeFile: noop, handleReorderPreviews: noop, handleAddMorePhotos: noop,
    handleRemovePhoto: noop, handleReorderPhotos: noop,
  };
  m.bilan = bilanPlateformes(m);
  return (
    <div className="fsn" style={{ position: 'static', minHeight: '100dvh', overflow: 'visible' }}>
      <div className="fsn-scroll" style={{ overflow: 'visible' }}><div className="fsn-col" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
        <EcranOuPublier m={m} />
      </div></div>
    </div>
  );
}

function Lot() {
  const items = [
    { id: '1', titre: 'Robe Sézane fleurie taille 38', plateformes: ['vinted', 'leboncoin', 'depop'] },
    { id: '2', titre: 'Console Nintendo Switch OLED', plateformes: ['vinted', 'leboncoin'] },
    { id: '3', titre: 'Sèche-cheveux Dyson Supersonic', plateformes: ['vinted', 'leboncoin'] },
    { id: '4', titre: 'Jean Levi\'s 501 W30', plateformes: ['vinted', 'leboncoin', 'depop'] },
  ];
  const exclus = items.map((it) => {
    const icone = detectObjectIcon(it.titre, '', null);
    const v = depopInterdit(icone, { titre: it.titre, description: '' });
    return v ? { id: it.id, message: messageDepopInterdit(v, 'fr'), quoi: v.quoi } : null;
  }).filter(Boolean);
  const moteurs = new Map(items.map((it) => [it.id, { plateformesPubliables: it.plateformes, portDepop: { saisie: it.plateformes.includes('depop') ? '4,50' : '' } }]));
  const parId = new Map(items.map((it) => [it.id, { item: { titre: it.titre } }]));
  return (
    <div className="fsn" style={{ position: 'static', minHeight: '100dvh', overflow: 'visible' }}>
      <div className="fsn-scroll" style={{ overflow: 'visible' }}><div className="fsn-col" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
        <div><p className="fsn-eyebrow">Publication en lot</p><h1 className="fsn-h" style={{ marginTop: 4 }}>Avant l'envoi</h1></div>
        <div className="fsl-tuiles">
          <div className="fsl-tuile fsl-tuile--ok"><b>4</b><small>prêts</small></div>
          <div className="fsl-tuile fsl-tuile--mute"><b>0</b><small>à compléter</small></div>
          <div className="fsl-tuile fsl-tuile--mute"><b>10</b><small>annonces</small></div>
        </div>
        <ExclusDepop en={false} exclus={exclus} />
        <LivraisonDuLot en={false} ids={items.map((i) => i.id)} parId={parId} moteurs={moteurs}
          poidsDe={() => 500} poserPoids={noop} poserPoidsDuLot={noop}
          livraison={{ transporteurs: null, format: '' }} poserTransporteurs={noop} poserFormat={noop}
          colisVinted={[]} choisirColisVinted={noop} userId={null} />
        <Carte gravite="info" titre="Partira sur Vinted, Leboncoin et Depop"><div className="fsn-card-p">4 articles · 10 annonces.</div></Carte>
      </div></div>
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(scene === 'lot' ? <Lot /> : <Simple />);
