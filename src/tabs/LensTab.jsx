import { memo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Mic, Sparkles, Plus, X, ChevronLeft, History, Image as ImageIcon } from 'lucide-react';
import ListingPreviewScreen, { clearStepperPersistence, readStepperHost, writeStepperHost } from '../components/ListingPreviewScreen';
import { apresFermetureStepper } from '../utils/parcoursLens';
// La peau du stepper (refonte 24/09) : ancienne par défaut, nouvelle par l'interrupteur.
import { useNouveauStepper } from '../publication/interrupteur';
import ExtensionReminderModal, { shouldShowExtensionReminder } from '../components/ExtensionReminderModal';
import ExtensionPitchScreen from '../components/ExtensionPitchScreen';
// (imports PepiteIcon/PepiteAmount retirés au nettoyage unités du 02/09
// soir — plus aucun point d'affichage dans cet onglet.)
// getTypeStyle / typeLabel sont partis avec les pastilles d'identification :
// ils vivent désormais dans LensIdentite.
import { getRotatingLensPlaceholders } from '../utils/shared';
import { televerserPhotos as televerserVersBucket } from '../utils/photosUpload';
import { MAX_PHOTOS, LENS_PHOTOS_LUES } from '../utils/photos';
import { analyseFiabilite } from '../components/AnalyseMarche';
import LensIdentite from '../components/LensIdentite';
import { useTranslation } from '../i18n/useTranslation';
import { UI } from '../components/ui';
// (01/10) LA barre de progression : le scan, la lecture des photos et la
// préparation de l'annonce l'utilisent à la place du sablier.
import BarreProgression from '../components/BarreProgression';
import { PLATEFORMES_STOCK_OUVERTES } from "../utils/stockFiltres";
// (29/10, lot B 1.2-1.5) La refonte de l'écran Lens (maquettes validées par Nico le 29/10) : la peau, l'orbite des
// plateformes, les états, le prix selon la stratégie, l'historique. Les réglages de rédaction portent la stratégie de
// prix et « Ouvrir l'annonce dès la fin de l'analyse ».
import '../components/lens/lens.css';
import OrbiteLogos from '../components/lens/OrbiteLogos';
import { ProgressionScan, EchecAnalyse, QuotaAtteint } from '../components/lens/EtatsLens';
import { motifEchec } from '../components/lens/motifEchec';
import PrixStrategie from '../components/lens/PrixStrategie';
import HistoriqueLens from '../components/lens/HistoriqueLens';
import { Pli, DetailMarche } from '../components/lens/PlisResultat';
import { useReglagesRedaction } from '../utils/redactionALaDemande';

const INK       = '#10201B';
const TEAL      = '#2F9E90';
const TEAL_DEEP = '#1B6E62';
const MUTE      = '#6B7A75';

// ⛔ LISTE EXPLICITE, plus `Object.keys(PLATFORM_LABELS)` (2026-09-15).
// Ce bandeau défilant est une PROMESSE COMMERCIALE : « voilà où FillSell
// publie ». Il était dérivé de la table des LIBELLÉS, qui n'a jamais eu ce
// sens — elle sert à nommer une plateforme quand on en croise une. Le jour où
// 'opla' y est entrée (lot 7, affichage réservé à deux comptes), Opla se
// serait mise à défiler sur l'écran d'accueil Lens de TOUT LE MONDE, en
// promettant une publication qui n'existe pas. Une plateforme n'entre ici
// qu'une fois réellement publiable.
// (29/10, lot B 1.5) Le bandeau défilant est devenu l'ORBITE autour du
// déclencheur (components/lens/OrbiteLogos) : même liste, même règle.
const LENS_PLATFORMS = PLATEFORMES_STOCK_OUVERTES; // même table que le stock (utils/stockFiltres)

// Feuille bas-écran « Prendre une photo / Choisir dans la photothèque »,
// partagée entre l'écran de scan (viseur) et l'écran résultat (grille photos).
// Portail vers document.body OBLIGATOIRE : rendue en place elle vivrait dans
// le conteneur scroll (.wrap.page-pad, -webkit-overflow-scrolling:touch) et le
// WKWebView iOS peint les position:fixed d'un scroller touch DANS la couche du
// scroller — la tab bar (.bnav) et le FAB micro passaient devant quel que soit
// le z-index. zIndex 10000 : au-dessus du FAB (1000), aligné feuille bug
// report. Le <style> embarqué rend la feuille autonome : l'animation est
// disponible quel que soit l'écran qui la monte.
function PhotoSourceSheet({ open, onClose, onCamera, onGallery, lang, maxPhotos }) {
  if (!open) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(16,32,27,0.45)', display:'flex', alignItems:'flex-end', justifyContent:'center', colorScheme:'light' }}
    >
      <style>{`
        @keyframes lensSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .lens-photo-sheet { animation: lensSheetUp 0.22s cubic-bezier(0.2,0.8,0.3,1); }
      `}</style>
      <div
        className="lens-photo-sheet"
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:520, boxSizing:'border-box', background:UI.paper, border:`1px solid ${UI.border}`, borderBottom:'none', borderRadius:'24px 24px 0 0', padding:'20px 20px calc(16px + env(safe-area-inset-bottom))', boxShadow:'0 -18px 50px rgba(16,32,27,0.25)', fontFamily:'inherit' }}
      >
        <div style={{ width:40, height:4, borderRadius:999, background:'#D8D2C4', margin:'0 auto 16px' }} />
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button
            onClick={onCamera}
            style={{ display:'flex', alignItems:'center', gap:12, width:'100%', boxSizing:'border-box', padding:'14px 14px', borderRadius:16, background:UI.card, border:`1px solid ${UI.border}`, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}
          >
            <span style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:12, background:`linear-gradient(155deg,${TEAL},${TEAL_DEEP})` }}>
              <Camera size={19} color="#FFFFFF" strokeWidth={2} />
            </span>
            <span style={{ fontSize:15, fontWeight:600, color:INK }}>
              {lang === 'en' ? 'Take a photo' : 'Prendre une photo'}
            </span>
          </button>
          <button
            onClick={onGallery}
            style={{ display:'flex', alignItems:'center', gap:12, width:'100%', boxSizing:'border-box', padding:'14px 14px', borderRadius:16, background:UI.card, border:`1px solid ${UI.border}`, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}
          >
            <span style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:12, background:UI.chip }}>
              <ImageIcon size={19} color={TEAL_DEEP} strokeWidth={2} />
            </span>
            <span style={{ display:'flex', flexDirection:'column' }}>
              <span style={{ fontSize:15, fontWeight:600, color:INK }}>
                {lang === 'en' ? 'Choose from library' : 'Choisir dans la photothèque'}
              </span>
              <span style={{ fontSize:12, color:MUTE }}>
                {lang === 'en' ? `Up to ${maxPhotos} photos` : `Jusqu'à ${maxPhotos} photos`}
              </span>
            </span>
          </button>
          <button
            onClick={onClose}
            style={{ width:'100%', boxSizing:'border-box', padding:'13px 0', borderRadius:999, background:'#FFFFFF', border:`1px solid ${UI.border}`, cursor:'pointer', fontSize:14, fontWeight:600, color:MUTE, fontFamily:'inherit', marginTop:2 }}
          >
            {lang === 'en' ? 'Cancel' : 'Annuler'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── La note dictée ou tapée (viseur ET pli « Tes photos du scan ») ───────────
// Le texte d'exemple qui tourne (lensPlaceholderIdx, App.jsx) et le micro
// (toggleLensMic, App.jsx) sont branchés tels quels : rien de leur logique
// n'est touché ici, seule la peau change (29/10, lot B 1.5).
function NoteLens({ id, lang, currency, lensDesc, setLensDesc, lensMicActive, lensMicLoading, toggleLensMic, lensPlaceholderFade, lensPlaceholderIdx, disabled = false }) {
  const { t } = useTranslation(lang);
  return (
    <div className="lns-section" style={{ gap:6 }}>
      <label htmlFor={id} className="lns-label">
        {t('lensDetailLabel')} <span className="lns-h-doux">{t('lensFacultatif')}</span>
      </label>
      <div className="lns-champ">
        {!lensDesc && (
          <span className="lns-indice" aria-hidden="true" style={{ opacity: lensPlaceholderFade ? 1 : 0 }}>
            {getRotatingLensPlaceholders(currency, lang)[lensPlaceholderIdx]}
          </span>
        )}
        <input
          id={id}
          className={`lns-input${lensMicActive ? ' lns-input--micro' : ''}`}
          value={lensDesc}
          onChange={e => setLensDesc(e.target.value)}
          placeholder=""
          autoComplete="off"
          disabled={disabled}
        />
        <button
          type="button"
          className={`lns-micro${lensMicActive ? ' lns-micro--actif' : ''}`}
          onClick={toggleLensMic}
          disabled={lensMicLoading}
          aria-label={t('lensDicter')}
          aria-pressed={Boolean(lensMicActive)}
        >
          <Mic size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ── La grille des photos (viseur ET pli « Tes photos du scan ») ─────────────
// Autant que le stepper (MAX_PHOTOS, 2026-09-27) ; l'IA ne lit que les
// LENS_PHOTOS_LUES premières (App.jsx, envoyerRequeteLens) — elles portent
// leur rang —, toutes vont sur la fiche. Le dire : « L'analyse lit les 5
// premières. Toutes partent sur l'annonce. »
function GrillePhotos({ lang, photos, onRetirer, onAjouter, desactive = false }) {
  const { t, tpl } = useTranslation(lang);
  return (
    <>
      <div className="lns-grille">
        {photos.map((p, i) => (
          <div key={i} className="lns-vignette">
            <img src={p.preview} alt="" />
            {i < LENS_PHOTOS_LUES && <span className="lns-rang">{i + 1}</span>}
            <button type="button" className="lns-retirer" onClick={() => onRetirer(i)} disabled={desactive} aria-label={t('lensRetirerPhoto')}>
              <X size={12} strokeWidth={2.6} />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button type="button" className="lns-ajouter" onClick={onAjouter} disabled={desactive} aria-label={t('lensAjouterPhotos')}>
            <Plus size={18} strokeWidth={2} />
          </button>
        )}
      </div>
      <p className="lns-aide">{tpl('lensPhotosLues', { n: LENS_PHOTOS_LUES })}</p>
    </>
  );
}

// ── Notice « Comment ça marche ? » ──────────────────────────────────────────
function AideLens({ lang, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(16,32,27,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, colorScheme:'light' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:400, background:UI.paper, border:`1px solid ${UI.border}`, borderRadius:24, padding:'24px 22px 22px', boxShadow:'0 24px 60px rgba(16,32,27,0.28)', fontFamily:'inherit' }}
      >
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:34, height:34, borderRadius:12, background:`linear-gradient(155deg,${TEAL},${TEAL_DEEP})` }}>
                <Sparkles size={17} color="#FFFFFF" strokeWidth={2.2} />
              </span>
              <h2 style={{ margin:0, fontSize:19, fontWeight:600, letterSpacing:'-0.01em', color:INK }}>
                {lang === 'en' ? 'How the scan works' : 'Comment marche le scan'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'en' ? 'Close' : 'Fermer'}
            style={{ flexShrink:0, width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:'#FFFFFF', border:`1px solid ${UI.border}`, cursor:'pointer' }}
          >
            <X size={16} color={MUTE} strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[
            { n:'1', emoji:'📸', fr:['Prends une photo', 'Photographie l’article (ou ajoute plusieurs clichés) directement depuis l’appareil ou la galerie.'], en:['Take a photo', 'Snap the item (or add several shots) straight from your camera or gallery.'] },
            { n:'2', emoji:'✨', fr:['Le scan IA analyse', 'L’IA reconnaît l’article, estime sa valeur et évalue si c’est un bon deal.'], en:['The AI scan runs', 'The AI recognises the item, estimates its value and rates whether it’s a good deal.'] },
            { n:'3', emoji:'📋', fr:['Ta fiche est générée', 'Titre, description et prix prêts à publier sur Vinted, eBay, Leboncoin…'], en:['Your listing is generated', 'Title, description and price ready to post on Vinted, eBay, Leboncoin…'] },
          ].map(step => (
            <div key={step.n} style={{ display:'flex', gap:12, alignItems:'flex-start', background:UI.card, border:`1px solid ${UI.border}`, borderRadius:16, padding:'14px 14px' }}>
              <span style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:12, background:UI.chip, fontSize:20 }}>
                {step.emoji}
              </span>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:INK, marginBottom:2 }}>
                  {lang === 'en' ? step.en[0] : step.fr[0]}
                </div>
                <div style={{ fontSize:12.5, lineHeight:1.45, color:MUTE }}>
                  {lang === 'en' ? step.en[1] : step.fr[1]}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{ width:'100%', boxSizing:'border-box', marginTop:18, borderRadius:999, padding:'13px 0', fontSize:14, fontWeight:600, border:'none', cursor:'pointer', fontFamily:'inherit', background:`linear-gradient(120deg,${TEAL},${TEAL_DEEP})`, color:'#FFFFFF', boxShadow:'0 10px 24px rgba(47,158,144,0.28)' }}
        >
          {lang === 'en' ? 'Got it' : 'J’ai compris'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LE VISEUR (refonte 29/10, lot B 1.5 — maquette « Main » validée par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// En-tête (Lens · Photographie ton article · Historique), la carte de prise de
// vue (déclencheur, orbite des plateformes tant qu'aucune photo n'est prise,
// Prendre une photo / Galerie, la grille, la note, « Ouvrir l'annonce dès la
// fin de l'analyse »), puis le bouton d'analyse et « Il te reste N analyses ».
// Le même écran porte les états : pendant l'analyse (la barre et ses étapes
// réelles), l'échec (réessayer, ou créer l'annonce sans analyse — les photos
// restent là, modifiables), le quota du mois atteint.
export function LensScanHome({
  lang, currency, isNative,
  plateformesOuvertes = [],
  // (25/10) Leboncoin d'une adresse hors de France : absent du bandeau (App.jsx).
  plateformesFermees = [],
  lensPhotos, setLensPhotos, setLensResult, setLensAdded,
  lensDesc, setLensDesc, lensMicActive, lensMicLoading, toggleLensMic,
  lensPlaceholderFade, lensPlaceholderIdx,
  lensFileRef, handleLensPhoto, handleLensPhotoNative, handleLensCameraNative,
  analyzeLens, lensLoading, lensReprise, infoRepriseLens,
  lensProgres = null, finScan = false, onFinScan = null,
  // (lensPrice retiré au nettoyage unités du 02/09 soir ;
  // onCreateListing/creatingListing retirés à la fusion des CTA du même
  // soir — le viseur n'a plus qu'UN bouton, le scan unifié.)
  // (29/10, lot B 1.5) Les états et les gestes de la refonte.
  quotas = null,
  erreur = null,            // lensResult.error : l'analyse a échoué, ou une photo n'a pas pu être lue
  onSansAnalyse = null,     // « Créer l'annonce sans analyse » (LensTab : stepper avec les photos seules)
  occupe = false,           // une préparation d'annonce est en cours (EcranPreparation)
  listingError = '',
  ouvrirApresScan = false, onOuvrirApresScan = null,
  onHistorique = null,
  onCreerALaMain = null, onVoirForfaits = null,
}) {
  const { t, tpl } = useTranslation(lang);
  const [showLensHelp, setShowLensHelp] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  // Autant que le stepper (2026-09-27) — l'IA n'en lit que les LENS_PHOTOS_LUES
  // premières (App.jsx, envoyerRequeteLens), les autres vont sur la fiche.
  const maxPhotos = MAX_PHOTOS;
  const photoCount = lensPhotos.length;

  // Deux actions distinctes en natif (reprise S5, 2026-07-25) : caméra directe
  // (getPhoto, une photo) ET photothèque (pickImages, multi-sélection). Depuis
  // le 2026-07-26 elles sont réunies derrière UNE feuille de choix maison
  // (openPicker) : le tap sur le viseur ouvre « Prendre une photo / Choisir
  // dans la photothèque » — feuille in-app plutôt que CameraSource.Prompt ou
  // @capacitor/action-sheet, pour garder la multi-sélection de pickImages et
  // ne pas ajouter de plugin natif. Sur le web, tout retombe sur l'input file
  // multiple — la feuille du navigateur propose déjà caméra + galerie.
  // (29/10) La maquette pose aussi « Prendre une photo » et « Galerie » sous le
  // déclencheur : ce sont openCamera et openGallery, tels quels.
  const openCamera  = () => { setShowPhotoSheet(false); (isNative && handleLensCameraNative ? handleLensCameraNative() : lensFileRef.current?.click()); };
  const openGallery = () => { setShowPhotoSheet(false); (isNative && handleLensPhotoNative ? handleLensPhotoNative() : lensFileRef.current?.click()); };
  const openPicker  = () => (isNative && handleLensCameraNative && handleLensPhotoNative ? setShowPhotoSheet(true) : lensFileRef.current?.click());
  const removePhoto = (i) => { setLensPhotos(prev => prev.filter((_, j) => j !== i)); setLensResult(null); setLensAdded(false); };

  const enAnalyse = Boolean(lensLoading || finScan);
  const plein = photoCount >= maxPhotos;
  const restantes = quotas?.annonces?.plafond != null ? (quotas.annonces.restantes ?? null) : null;
  const quotaAtteint = restantes === 0 && !enAnalyse;
  const echecPhoto = erreur ? motifEchec(erreur, lang).type === 'photo' : false;
  const echecAnalyse = Boolean(erreur) && !echecPhoto && !enAnalyse;
  const plateformesOrbite = [...LENS_PLATFORMS, ...plateformesOuvertes.filter((p) => !LENS_PLATFORMS.includes(p))]
    .filter((p) => !plateformesFermees.includes(p));

  return (
    <div className="lns">
      <input ref={lensFileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handleLensPhoto} />

      <div className="lns-tete">
        <div className="lns-tete-txt">
          <span className="lns-kicker">{t('lensKicker')}</span>
          <h1 className="lns-titre">{t('lensTitreViseur')}</h1>
        </div>
        {onHistorique && (
          <button type="button" className="lns-pilule" onClick={onHistorique} disabled={enAnalyse} aria-label={t('lensHistoriqueAria')}>
            <History size={16} strokeWidth={2} color={TEAL_DEEP} aria-hidden="true" />
            {t('lensHistorique')}
          </button>
        )}
      </div>
      <p className="lns-lead">{t('lensSousTitreViseur')}</p>

      {/* ── L'échec, en tête : c'est la première chose à lire au retour ──
          Les photos restent dans la carte ci-dessous : on peut en retirer, en
          ajouter, corriger la note, puis réessayer. */}
      {!enAnalyse && erreur && (
        <EchecAnalyse
          lang={lang}
          erreur={erreur}
          onReessayer={analyzeLens}
          onSansAnalyse={photoCount > 0 ? onSansAnalyse : null}
          occupe={occupe || lensLoading}
          peutReessayer={photoCount > 0}
        />
      )}
      {listingError && <div className="lns-bandeau lns-bandeau--erreur">{listingError}</div>}

      {/* ── MONTÉE DES PHOTOS INACHEVÉE (2026-09-13 soir) ───────────────
          L'app est morte pendant l'envoi des photos. Celles qui étaient
          parties sont dans le viseur ; celles qui vivaient en mémoire sont
          perdues avec la page, et on ne fait pas semblant du contraire —
          analyser un lot tronqué et le facturer serait pire que de le
          dire. Le message nomme le compte exact et rappelle que rien n'a
          été décompté : c'est LA question que se pose l'utilisateur. */}
      {!lensReprise && infoRepriseLens && !enAnalyse && (
        <div className="lns-bandeau lns-bandeau--attention">{infoRepriseLens}</div>
      )}

      {enAnalyse ? (
        // ── LA BARRE DU SCAN (01/10) ─────────────────────────────────────
        // L'article (la première photo, la description s'il y en a une),
        // les photos montées UNE À UNE (étapes réelles, relevées pendant la
        // montée), puis l'analyse (~20 s mesurées). 100 % et la coche
        // seulement quand le résultat est là — il s'affiche juste après.
        <ProgressionScan
          lang={lang}
          photo={lensPhotos[0]?.preview ?? null}
          titre={lensDesc}
          nbPhotos={photoCount}
          lensProgres={lensProgres}
          enCours={Boolean(lensLoading)}
          reprise={Boolean(lensReprise)}
          onFini={onFinScan}
        />
      ) : (
        <div className="lns-carte">
          <div className="lns-prise">
            <div className="lns-declencheur-zone">
              <span className="lns-halo" aria-hidden="true" />
              {photoCount === 0 && <OrbiteLogos plateformes={plateformesOrbite} />}
              <button
                type="button"
                className="lns-declencheur"
                onClick={openPicker}
                disabled={plein}
                aria-label={photoCount === 0 ? t('lensPrendrePhoto') : t('lensAjouterPhotos')}
              >
                <Camera size={36} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
            <div className="lns-boutons-prise">
              <button type="button" className="lns-bouton-pilule" onClick={openCamera} disabled={plein}>{t('lensPrendrePhoto')}</button>
              <button type="button" className="lns-bouton-pilule" onClick={openGallery} disabled={plein}>{t('lensGalerie')}</button>
            </div>
          </div>

          {photoCount > 0 && (
            <div className="lns-section">
              <div className="lns-section-tete">
                <span className="lns-h">{t('lensTesPhotos')}</span>
                <span className="lns-compte">{tpl('lensPhotosSurMax', { n: photoCount, max: maxPhotos })}</span>
              </div>
              <GrillePhotos lang={lang} photos={lensPhotos} onRetirer={removePhoto} onAjouter={openPicker} />
            </div>
          )}

          <NoteLens
            id="lns-note-viseur" lang={lang} currency={currency}
            lensDesc={lensDesc} setLensDesc={setLensDesc}
            lensMicActive={lensMicActive} lensMicLoading={lensMicLoading} toggleLensMic={toggleLensMic}
            lensPlaceholderFade={lensPlaceholderFade} lensPlaceholderIdx={lensPlaceholderIdx}
          />

          {onOuvrirApresScan && (
            <BasculeOuvrirApres lang={lang} actif={ouvrirApresScan} onBasculer={onOuvrirApresScan} />
          )}
        </div>
      )}

      {/* Pendant l'analyse, l'interrupteur reste à portée : c'est à la FIN du
          scan qu'il est lu. */}
      {enAnalyse && onOuvrirApresScan && (
        <BasculeOuvrirApres lang={lang} actif={ouvrirApresScan} onBasculer={onOuvrirApresScan} />
      )}

      {/* ── UN SEUL CTA (fusion 02/09 soir, décision Nico) ───────────────
          « Créer l'annonce » (identify gratuit) et « Analyser le deal »
          (scan complet) faisaient la même passe chère pour deux sorties :
          le geste unique lance le scan UNIFIÉ (mode 'annonce' de
          lens-analysis) et livre TOUT — identification, estimation,
          verdict du deal ET annonce prête à publier. 1 scan = 1 unité du
          compteur fusionné, quoi qu'on fasse du résultat.
          ⚠️ CE COMPOSANT EST CELUI QUI S'AFFICHE avant tout résultat (et,
          depuis le 29/10, après un échec) : LensTab rend <LensScanHome/>
          tant qu'il n'y a pas de résultat RÉUSSI. */}
      {!enAnalyse && (quotaAtteint ? (
        <QuotaAtteint
          lang={lang}
          plafond={quotas?.annonces?.plafond ?? null}
          onCreerALaMain={onCreerALaMain}
          onVoirForfaits={onVoirForfaits}
        />
      ) : (
        <div className="lns-pied">
          {/* En échec, « Réessayer » de la carte d'échec EST ce bouton : deux
              boutons qui relancent la même analyse ne diraient pas lequel
              choisir. */}
          {!echecAnalyse && (
            <button type="button" className="lns-cta" onClick={analyzeLens} disabled={!photoCount || lensLoading || occupe}>
              <Sparkles size={18} strokeWidth={2.2} aria-hidden="true" />
              {t('lensAnalyserCta')}
            </button>
          )}
          <div className="lns-pied-ligne">
            {/* Fusion scans+annonces (02/09 soir) : UN compteur, UN chiffre — le
                même que l'en-tête. Un scan consomme une annonce du forfait.
                Rien d'affiché tant que le plafond n'est pas connu (jamais un
                faux zéro). */}
            {restantes != null
              ? <span>{restantes === 1 ? t('lensResteUne') : tpl('lensResteN', { n: restantes })}</span>
              : <span />}
            <button type="button" className="lns-lien" onClick={() => setShowLensHelp(true)}>{t('lensCommentCaMarche')}</button>
          </div>
        </div>
      ))}

      {/* ── Feuille de choix caméra / photothèque (natif uniquement) ── */}
      <PhotoSourceSheet
        open={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        onCamera={openCamera}
        onGallery={openGallery}
        lang={lang}
        maxPhotos={maxPhotos}
      />

      {showLensHelp && <AideLens lang={lang} onClose={() => setShowLensHelp(false)} />}
    </div>
  );
}

// « Ouvrir l'annonce dès la fin de l'analyse » (29/10, lot B 1.2) — le réglage
// vit dans platform_settings.redaction.ouvrir_annonce_apres_scan
// (useReglagesRedaction) : il suit le compte, pas le téléphone.
function BasculeOuvrirApres({ lang, actif, onBasculer }) {
  const { t } = useTranslation(lang);
  return (
    <button type="button" role="switch" aria-checked={Boolean(actif)} className="lns-bascule" onClick={onBasculer}>
      <span className="lns-bascule-txt">
        <span className="lns-bascule-titre">{t('lensOuvrirApres')}</span>
        <span className="lns-bascule-sous">{t('lensOuvrirApresSous')}</span>
      </span>
      <span className="lns-interrupteur" aria-hidden="true" />
    </button>
  );
}

// Qualité d'analyse unifiée (2026-07) : plus de gating par tier — chaque bloc
// s'affiche si le champ est présent dans la réponse, identique pour tous.
//
// ⚠️ 2026-07-31 : tout le rendu de MARCHÉ (prix, verdict, fourchette, sources,
// vitesse, plateformes, conseils, description, notes) a quitté ce fichier pour
// AnalyseMarche — le composant que le stepper partage. Ce qui reste ici est
// l'IDENTIFICATION (titre, pills marque/modèle/état/matière/catégorie/
// confiance) et les actions. Les constantes VERDICT_INFO / VITESSE_INFO /
// score* sont parties avec les blocs qu'elles habillaient : le verdict est
// désormais DÉRIVÉ de la marge dans AnalyseMarche (jamais lu depuis la
// réponse : un « Excellent » à côté d'une perte était possible), et le deal
// score est supprimé (nombre sans échelle, tassé entre 4 et 6, redondant avec
// le verdict — décision Nico du 30/07).
// ── CTA héros « Créer l'annonce » (03/09 soir, demande Nico) ────────────────
// LE bouton de l'écran résultat, et de lui seul : signature visuelle unique —
// vert nuit profond, filet doré (l'accent premium de l'app, cf. badge Pro),
// balayage lumineux — pour qu'aucun autre bouton ne rivalise. PrimaryButton
// (teal plein) reste le style des CTA ordinaires ailleurs. Style uniquement :
// mêmes onClick/disabled que le bouton qu'il remplace.
// (29/10, lot B 1.2) Deux lignes, comme la maquette : « Créer l'annonce » et ce
// qu'elle emporte déjà (`sousTitre`).
function LensHeroCta({ onClick, disabled, children, sousTitre = null, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        position:'relative', overflow:'hidden', width:'100%', boxSizing:'border-box', minHeight:58,
        borderRadius:999, padding: sousTitre ? '9px 16px' : '17px 16px', display:'flex', alignItems:'center',
        flexDirection: sousTitre ? 'column' : 'row', justifyContent:'center', gap: sousTitre ? 1 : 8,
        fontSize:16, fontWeight:700, fontFamily:'inherit', letterSpacing:'0.01em', textAlign:'center',
        cursor:disabled?'not-allowed':'pointer',
        background:disabled?'#DCEEEA':'linear-gradient(135deg,#1A5F52 0%,#0E3A32 55%,#10201B 100%)',
        color:disabled?'#8FB5AE':'#FFFFFF',
        border:disabled?'none':'1px solid rgba(240,196,106,0.55)',
        boxShadow:disabled?'none':'0 14px 30px -8px rgba(16,32,27,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
        ...style,
      }}
    >
      <style>{`@keyframes lensHeroShine{0%{transform:translateX(-160%) skewX(-18deg)}55%,100%{transform:translateX(320%) skewX(-18deg)}}
        @media (prefers-reduced-motion: reduce){.lens-hero-shine{animation:none !important}}`}</style>
      {!disabled && (
        <span aria-hidden className="lens-hero-shine" style={{ position:'absolute', top:0, bottom:0, left:0, width:'34%', background:'linear-gradient(105deg,transparent,rgba(255,255,255,0.28),transparent)', animation:'lensHeroShine 3.4s ease-in-out infinite', pointerEvents:'none' }} />
      )}
      <span style={{ position:'relative' }}>{children}</span>
      {sousTitre && <span className="lns-heros-sous" style={{ position:'relative', color: disabled ? '#8FB5AE' : undefined }}>{sousTitre}</span>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LE RÉSULTAT (refonte 29/10, lot B 1.5 — maquette « LensResultat » validée)
// ═══════════════════════════════════════════════════════════════════════════
// Dans l'ordre : l'objet reconnu (LensIdentite, la photo de l'article dans sa
// tuile), le prix selon la stratégie du vendeur, LES ACTIONS (Créer l'annonce,
// puis le stock ou la vente), puis, repliés, le détail du marché et les photos
// du scan, et « Nouvelle analyse » avec la mention de son coût. La hiérarchie
// du 15/09 est intacte : publier passe avant les annonces comparables.
export function LensAnalysisResult({
  result, lensBuy, lang, currency, lensAdded, addLensItem, openLensEditModal, onReset, createCta,
  // (29/10) La refonte : la photo de tête (tuile), la stratégie de prix, le
  // contenu du pli « Tes photos du scan », le pays des prix, le retour.
  photo = null, strategie = 'marche', photosPanel = null, nbPhotos = 0, userCountry = null, onRetour = null,
}) {
  const { t, tpl } = useTranslation(lang);
  if (result.error) {
    // (LensTab ne passe plus par ici depuis le 29/10 : un échec revient au
    // viseur, photos comprises. Rendu gardé pour les autres montages.)
    return (
      <div className="lns">
        <EchecAnalyse lang={lang} erreur={result.error} />
        <button type="button" className="lns-tertiaire" onClick={onReset}>{t('lensNouvelleAnalyse')}</button>
      </div>
    );
  }

  const incertaine = result.identification_incertaine === true;
  const deduit = result.objet_source === 'deduit';
  const statut = incertaine
    ? { classe: 'lns-statut lns-statut--doute', texte: t('lensAConfirmer') }
    : deduit
      ? { classe: 'lns-statut lns-statut--neutre', texte: t('lensDeduit') }
      : { classe: 'lns-statut', texte: t('lensReconnu') };
  const { count } = analyseFiabilite(result);
  // La photo de l'article dans la tuile de LensIdentite (règle .lns-identite--photo).
  const fondPhoto = photo ? `url("${String(photo).replace(/"/g, '%22')}")` : null;

  return (
    <div className="lns" style={{ animation:'vrFadeSlide 0.35s cubic-bezier(0.22,1,0.36,1) both' }}>
      <div className="lns-res-tete">
        <button type="button" className="lns-retour" onClick={onRetour ?? onReset} aria-label={t('lensRetourViseur')}>
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <span className="lns-res-titre">{t('lensResultatTitre')}</span>
        <span className={statut.classe}>{statut.texte}</span>
      </div>

      {/* ══ 1. L'OBJET RECONNU (15/09/2026, demande Nico) ══════════════════
          C'est le bloc le plus important de l'écran, et il est au-dessus de la
          ligne de flottaison : titre, marque/modèle, puis la DESCRIPTION
          COMPLÈTE — la seule chose qui prouve à l'utilisateur que l'IA a
          reconnu SON objet. Les pastilles et la ligne « lu sur l'objet »
          suivent, secondaires. (LensIdentite, 11/08 : la tuile de catégorie,
          « aucune marque lisible » assumée, et ce qui a été LU sur l'objet.)
          (29/10) La tuile porte la photo de l'article (maquette). */}
      <div
        className={`lns-carte lns-carte--s lns-identite${fondPhoto ? ' lns-identite--photo' : ''}`}
        style={{ display:'block', ...(fondPhoto ? { '--lns-photo': fondPhoto } : null) }}
      >
        <LensIdentite result={result} lang={lang} />
      </div>

      {/* ══ 2. LE PRIX, SELON LA STRATÉGIE DU VENDEUR (29/10, lot B 1.4) ════
          Le montant que la stratégie choisit dans la fourchette, la jauge, la
          fiabilité, le plafond d'achat en chine. Affichage seul. */}
      <PrixStrategie result={result} strategie={strategie} prixAchat={lensBuy} lang={lang} currency={currency} />

      {/* ══ 3. LES ACTIONS ═════════════════════════════════════════════════
          1. createCta (le bouton PRINCIPAL de création, construit par LensTab
             qui porte handleCreateListing) — en tête : c'est l'action attendue.
          2. Le stock (ou la vente) en SECONDAIRE (contour) : deux verts pleins
             empilés ne disaient pas lequel crée l'annonce.
          3. « Nouvelle analyse » en dernier, avec la mention de son coût : des
             utilisateurs relançaient l'analyse jusqu'à épuiser leur quota sans
             que rien ne le dise. */}
      <div className="lns-actions">
        {createCta}

        {/* ── LE BOUTON N'AJOUTE PLUS DEUX FOIS (2026-09-15) ──────────────────
            Un article scanné est DÉJÀ dans le stock : le scan l'y a mis en même
            temps qu'il débitait l'annonce. Ce bouton ouvre la fiche EXISTANTE,
            et le dit. (29/10) « Ajouter au stock seulement » / « Modifier la
            fiche de l'article » : mêmes handlers qu'avant.
            Le cas « article vendu » est intact : rien n'entre au stock, c'est une
            vente qu'on enregistre, et elle ne s'enregistre qu'une fois. */}
        {result.titre && (
          result.est_vendu ? (
            lensAdded ? (
              <button type="button" disabled className="lns-secondaire lns-secondaire--fait">✓ {t('lensVenteEnregistree')}</button>
            ) : (
              <button type="button" className="lns-secondaire" onClick={addLensItem}>{t('lensEnregistrerVente')}</button>
            )
          ) : (
            <>
              <button type="button" className="lns-secondaire" onClick={openLensEditModal}>
                {lensAdded ? t('lensModifierFiche') : t('lensAjouterStock')}
              </button>
              {lensAdded && <p className="lns-mention lns-mention--ok">{t('lensDejaStock')}</p>}
            </>
          )
        )}
        {/* « ne consomme rien de plus » n'est vrai que si le scan a DÉJÀ rédigé
            l'annonce (lens_unifie) : sans elle, l'écran de publication la
            rédigera et la comptera. */}
        <p className="lns-mention">
          {result.annonce?.platforms ? `${t('lensRienDePlus')} ${t('lensRienPublie')}` : t('lensRienPublie')}
        </p>
      </div>

      {/* ══ 4. REPLIÉS : LE DÉTAIL DU MARCHÉ, LES PHOTOS DU SCAN ══════════════
          Annonces comparables, fourchette bas/moyen/haut, vitesse de vente,
          plateformes, conseils, et la note du modèle (AnalyseMarche, section
          details — `masquerNotes` ne reste armé que quand le bandeau
          « identification incertaine » de LensIdentite rend déjà la note). */}
      {(result.prix_vente_suggere != null || photosPanel) && (
        <div className="lns-plis">
          {result.prix_vente_suggere != null && (
            <Pli
              titre={t('lensDetailMarche')}
              info={count > 0 ? tpl('lensAnnoncesComparees', { n: count }) : t('lensAucuneComparee')}
            >
              <DetailMarche result={result} prixAchat={lensBuy} lang={lang} currency={currency} />
              {/* Recueilli de l'en-tête supprimé le 15/09 : le pays situe les prix. */}
              {userCountry?.name && <p className="lns-aide">{tpl('lensPrixPays', { pays: userCountry.name })}</p>}
            </Pli>
          )}
          {photosPanel && (
            <Pli titre={t('lensTesPhotosScan')} info={tpl('lensNPhotos', { n: nbPhotos })}>
              {photosPanel}
            </Pli>
          )}
        </div>
      )}

      {/* « Nouvelle analyse » est un RESET pur : il ne débite rien, mais la
          suivante comptera — on le dit. */}
      <button type="button" className="lns-tertiaire" onClick={onReset}>{t('lensNouvelleAnalyse')}</button>
      <p className="lns-mention">{t('lensNouvelleAnalyseQuota')}</p>
    </div>
  );
}

// ── L'écran d'attente de la préparation de l'annonce (01/10) ────────────────
// Plein écran comme avant (le stepper s'ouvre juste après), avec LA barre :
// l'article, la montée des photos puis la lecture ou l'ouverture — étapes
// réelles, relevées pendant le geste. Le stepper s'ouvre dès que c'est prêt.
export function EcranPreparation({ lang, photo, titre, etape, etapes, sousTitre }) {
  return (
    <div style={{position:"fixed",inset:0,background:UI.canvas,zIndex:9998,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 16px",colorScheme:"light"}}>
      <div style={{width:"100%",maxWidth:440,background:"#FFFFFF",border:"1px solid #E7E3D8",borderRadius:16,padding:"14px 14px 12px",boxSizing:"border-box"}}>
        <BarreProgression
          lang={lang}
          article={{ photo, titre:String(titre??"").trim()||(lang==="en"?"Your item":"Ton article"), sousTitre }}
          etapes={etapes}
          etape={etape}
          etat="en_cours"
        />
      </div>
    </div>
  );
}

const LensTab = memo(function LensTab({
  lang, currency, userCountry, isPremium, isPro, isBusiness, isNative, user,
  lensPhotos, setLensPhotos, lensResult, setLensResult,
  lensAdded, setLensAdded, lensDesc, setLensDesc,
  lensBuy, setLensBuy, lensLoading, lensProgres = null, lensReprise, infoRepriseLens, lensMicActive, lensMicLoading,
  lensPlaceholderFade, lensPlaceholderIdx,
  lensFileRef, toggleLensMic, handleLensPhoto, handleLensPhotoNative, handleLensCameraNative, analyzeLens, addLensItem, openLensEditModal,
  openUpgradeModal,
  supabase, saveLensItemForListing, lensInventaireId, onStepperOpenChange,
  resetLensParcours,
  // Bascule quotas (02/09) : compteurs du cycle (quotas_etat via App) — sert
  // le « N scans restants ce mois-ci » sous le CTA d'analyse.
  quotas = null,
  // (29/10, lot B 1.5) Relecture UNIQUE de quotas_etat quand le quota paraît
  // épuisé à l'ouverture de l'onglet (le cycle a pu repartir depuis).
  rafraichirQuotas = null,
  // Compte eBay vu par App.jsx (07/09/2026) : { voieApi, etat, lu,
  // voieApiReelle, rafraichir }. Le parcours Lens l'ignorait complètement —
  // le stepper ouvert depuis un scan croyait donc TOUJOURS être en voie
  // extension, et servait les textes Chrome même à un compte en voie serveur.
  ebayCompte = null,
  // Drapeau d'affichage par profil (lot 7 Opla) : transmis au stepper tel quel.
  plateformesVisibles = [],
  // Opla ouverte (interrupteur serveur + borne de build, App.jsx) : au stepper
  // et au bandeau, même condition (2026-09-17 soir).
  plateformesOuvertes = [], oplaMotifGrise = 'fermee', oplaExtensionMin = null,
  // (25/10) Fermées à ce compte (Leboncoin d'une adresse hors de France, App.jsx) : ni au stepper, ni au bandeau.
  plateformesFermees = [],
  extensionNeverSeen = null,
  // Battement serveur de l'extension — relayé au stepper pour la ligne
  // « ordinateur éteint » au-dessus du CTA Publier (2026-08-13).
  extensionLastSeenAt = null,
  // (29/10, lot B 1.2) Le scan qui vient d'aboutir (scan_id posé par analyzeLens
  // sur un résultat RÉUSSI) : « Ouvrir l'annonce dès la fin de l'analyse » ne
  // s'enchaîne que sur lui, une fois (onScanAboutiVu le consomme).
  lensScanAbouti = null, onScanAboutiVu = null,
  // (29/10, lot B 1.5) L'historique : rouvrir un scan gardé en base, ou la fiche
  // de l'article au Stock ; le quota atteint : l'ajout à la main du Stock.
  onRouvrirScan = null, onOuvrirArticle = null, onCreerALaMain = null,
}) {
  const { t } = useTranslation(lang);
  const [generatingListing,setGeneratingListing]=useState(false);
  // (01/10) L'étape RÉELLE de la préparation de l'annonce (montée des photos
  // puis lecture ou ouverture), pour LA barre de progression de l'écran
  // d'attente. Affichage seul.
  const [etapeCreation,setEtapeCreation]=useState('envoi');
  // (29/10) Quel geste prépare l'annonce : 'create' (le résultat), 'sans' (sans
  // analyse), 'identify' (reprise du parcours gratuit) — les étapes de l'attente.
  const [typeCreation,setTypeCreation]=useState('create');
  // La fin du scan se MONTRE (01/10) : la barre glisse jusqu'à 100 % et la
  // coche paraît avant le résultat. Seulement pour un scan vu en cours ici.
  const [scanVu,setScanVu]=useState(false);
  const [finScanVue,setFinScanVue]=useState(false);
  if(lensLoading&&!scanVu)setScanVu(true);
  if(lensLoading&&finScanVue)setFinScanVue(false);
  const finScan=scanVu&&!lensLoading&&Boolean(lensResult)&&!lensResult?.error&&!finScanVue;
  const [lensListingPhotos,setLensListingPhotos]=useState([]);
  const [showListingPreview,setShowListingPreview]=useState(false);
  const nouveauStepper=useNouveauStepper(supabase,user?.id);
  const [listingError,setListingError]=useState('');
  // Rappel extension : porte l'action à reprendre ('create', 'sans', 'identify')
  // — un seul rappel, quel que soit l'écran qui l'a demandé (29/10).
  const [rappelAction,setRappelAction]=useState(null);
  // Accroche extension (2026-08-04) : extension JAMAIS vue → accroche (sync
  // dressing + récupération du lien) à la place du rappel. Porte l'action à
  // reprendre : 'identify' (viseur), 'create' (écran résultat), 'sans' (29/10).
  const [extPitchAction,setExtPitchAction]=useState(null);
  // Ajout de photos depuis l'écran résultat : même feuille de choix
  // caméra/photothèque que le viseur (2026-07-27, remplace les deux tuiles
  // pointillées 📷/🖼️ de 501c26c). Sur le web, l'input file couvre déjà les
  // deux chemins via la feuille du navigateur.
  const [showPhotoSheet,setShowPhotoSheet]=useState(false);
  const nativePicker=isNative&&handleLensCameraNative&&handleLensPhotoNative;
  const openLensPicker=()=>nativePicker?setShowPhotoSheet(true):lensFileRef.current?.click();
  // Ligne inventaire restaurée depuis sessionStorage (lensInventaireId vit dans
  // App et n'a pas de setter ici) : fallback utilisé uniquement à la reprise.
  const [restoredInvId,setRestoredInvId]=useState(null);
  const effectiveInvId=lensInventaireId??restoredInvId;
  // ── Parcours identify (2026-07-28) ──────────────────────────────────────
  // Résultat de l'identification GRATUITE, tenu LOCALEMENT et jamais poussé
  // dans le lensResult de App : ce dernier pilote l'écran de résultat
  // verdict/score/fourchette, qui n'a aucun sens sans prix. Fermer le stepper
  // depuis ce parcours doit ramener au viseur, pas sur un écran de deal vide.
  const [identifyResult,setIdentifyResult]=useState(null);
  const [identifyEchec,setIdentifyEchec]=useState(false);
  // (29/10, lot B 1.5) « Créer l'annonce sans analyse » (après un échec) : le
  // stepper s'ouvre avec les photos SEULES — aucune analyse ne le pré-remplit.
  const [sansAnalyse,setSansAnalyse]=useState(false);
  const listingSource=sansAnalyse?null:(identifyResult??lensResult);
  // (29/10, lot B 1.2) Ouvert par « Créer l'annonce » du résultat (ou son
  // enchaînement automatique) : l'écran de publication va droit à l'annonce.
  const [ouvertureDirecte,setOuvertureDirecte]=useState(false);
  // (29/10, lot B 1.2) « Voir l'analyse » depuis l'écran de publication : le
  // lensResult sur lequel le stepper a été mis EN PAUSE (fermé sans rien
  // purger). « Créer l'annonce » sur CE résultat le rouvre tel qu'il était.
  const [stepperEnPause,setStepperEnPause]=useState(null);
  // (29/10, lot B 1.5) Le résultat rouvert depuis l'historique : sa fiche a pu
  // vivre depuis le scan (photos changées au Stock) — « Créer l'annonce » ne
  // lui recolle pas les photos du scan.
  const [resultatHistorique,setResultatHistorique]=useState(null);
  const depuisHistorique=resultatHistorique!=null&&resultatHistorique===lensResult;
  const [showHistorique,setShowHistorique]=useState(false);
  // (29/10, lot B 1.2-1.4) Les réglages de rédaction du compte : la stratégie de
  // prix (affichage du résultat) et « Ouvrir l'annonce dès la fin de l'analyse ».
  const { reglages: reglagesRedaction, lue: reglagesLus, enregistrer: enregistrerReglages } = useReglagesRedaction(user?.id);

  // (La lecture de coin_config posée ici le 01/09 pour afficher le prix du
  // scan — price_lens_overflow — a été RETIRÉE au nettoyage unités du 02/09
  // soir : plus aucun montant en unités ne s'affiche, l'écran parle en
  // annonces du forfait via la prop quotas. grantMensuel et coinBalance
  // avaient déjà vécu une journée ici — même sort.)

  // Reprise du stepper après remount (reload d'onglet Chrome ou navigation
  // interne) : le blob hôte écrit à l'ouverture permet de le REMONTER avec les
  // mêmes props ; son état interne (étape, annonces générées…) revient, lui,
  // du brouillon sessionStorage du stepper.
  // (29/10) Un stepper mis EN PAUSE par « Voir l'analyse » revient en pause :
  // le résultat à l'écran, le stepper prêt à rouvrir — pas rouvert d'office.
  useEffect(()=>{
    const h=readStepperHost('lens');
    if(!h)return;
    setLensListingPhotos(h.photos||[]);
    // viaIdentify : le blob vient du parcours gratuit → on restaure dans l'état
    // LOCAL, sinon le lensResult de App ressusciterait l'écran de deal.
    if(h.lensResult){ if(h.viaIdentify)setIdentifyResult(h.lensResult); else setLensResult(h.lensResult); }
    if(h.identifyEchec)setIdentifyEchec(true);
    if(h.sansAnalyse)setSansAnalyse(true);
    if(h.ouvertureDirecte)setOuvertureDirecte(true);
    if(h.inventaireId)setRestoredInvId(h.inventaireId);
    if(h.enPause&&h.lensResult&&!h.viaIdentify){ setStepperEnPause(h.lensResult); return; }
    setShowListingPreview(true);
    onStepperOpenChange?.(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // (29/10) Le résultat a changé sous un stepper en pause (photo retirée,
  // nouvelle analyse, scan rouvert) : la pause ne désigne plus rien — son
  // brouillon part, sinon un remount ressusciterait l'ancien article.
  useEffect(()=>{
    if(!stepperEnPause||stepperEnPause===lensResult)return;
    if(readStepperHost('lens'))clearStepperPersistence();
    setStepperEnPause(null);
    setLensListingPhotos([]);
  },[lensResult,stepperEnPause]);

  // (29/10, lot B 1.5) Le quota paraît épuisé à l'ouverture de l'onglet : UNE
  // relecture de quotas_etat (le cycle a pu repartir depuis le chargement de
  // l'app). Une fois par montage, jamais en boucle.
  useEffect(()=>{
    if(quotas?.annonces?.plafond!=null&&quotas.annonces.restantes===0)rafraichirQuotas?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /** Upload des photos du viseur vers listing-photos (bucket durable).
   *  Compression, chemin <uid>/raw/ et suffixe `?v=<ts>` vivent désormais dans
   *  utils/photosUpload — mêmes paramètres, même schéma, même parade au 404 en
   *  cache. Les sources sont les dataURL du viseur ; la brique les récupère.
   *  `surErreur: "lever"` reproduit le comportement d'ici : une photo qu'on ne
   *  sait pas traiter fait remonter l'erreur, elle n'est pas silencieusement
   *  sautée. (Elle est hors d'atteinte en pratique : les photos du viseur sont
   *  déjà passées par versImageDecodable à la prise de vue.) */
  async function televerserPhotos(){
    const { urls } = await televerserVersBucket(supabase, {
      userId: user.id,
      sources: lensPhotos.map(p => p.preview),
      surErreur: "lever",
    });
    return urls;
  }

  // ── LES PHOTOS DÉFINITIVES REJOIGNENT L'ARTICLE (2026-09-15) ──────────────
  // Le scan a créé la ligne inventaire au moment du débit, avec les URLs de son
  // bucket d'analyse — pleine définition, les seules qui existent à cet
  // instant. Les copies compressées qu'on vient de monter dans listing-photos
  // sont celles qui partiront en ligne : elles REMPLACENT les premières sur la
  // fiche. On remplace, on ne duplique pas, et on ne supprime rien du storage.
  // Best-effort : un échec laisse l'article avec les photos du scan, qui
  // marchent — jamais un article sans photo.
  async function rattacherPhotosDurables(urls){
    const cible=effectiveInvId;
    if(!cible||!Array.isArray(urls)||!urls.length)return;
    try{
      const{error}=await supabase.from('inventaire').update({photos:urls}).eq('id',cible).eq('user_id',user.id);
      if(error)console.warn('[lens] photos définitives non rattachées à l’article —',error.message);
    }catch(e){console.warn('[lens] photos définitives non rattachées à l’article —',e?.message??e);}
  }

  // ── « Créer l'annonce » — parcours GRATUIT (2026-07-28) ───────────────────
  // Photos → identify (aucune unité débitée) → stepper pré-rempli. L'identify
  // tourne sur les URLs listing-photos DÉFINITIVES, pas sur le bucket temporaire
  // lens-temp du scan complet : ce sont les mêmes que le stepper utilisera
  // ensuite, et la clé du cache d'idempotence (hash des URLs triées) reste donc
  // stable si l'utilisateur revient sur le même article.
  // ⚠️ L'échec ne bloque JAMAIS : erreur API, 429, JSON invalide → on continue
  // vers le stepper avec des champs vides et une mention discrète. Ce qu'on ne
  // fait pas, c'est faire SEMBLANT que ça a marché : sans cette mention,
  // generate-listing invente et l'utilisateur croit lire une analyse de ses
  // photos — exactement ce que ce chantier supprime.
  async function handleIdentifyAndCreate(){
    setTypeCreation('identify');
    setEtapeCreation('envoi');
    setGeneratingListing(true);
    setListingError('');
    setIdentifyEchec(false);
    try{
      const uploadedUrls=await televerserPhotos();
      if(!uploadedUrls.length)throw new Error(lang==='en'?'Photo upload failed.':'Échec upload des photos.');
      setEtapeCreation('lecture');
      // Parcours GRATUIT : il n'y a pas encore de ligne (aucun débit n'a eu
      // lieu). L'appel est sans effet tant que effectiveInvId est absent — il
      // sert la reprise d'un parcours dont la ligne existe déjà.
      await rattacherPhotosDurables(uploadedUrls);

      let identification=null;
      let echec=false;
      try{
        const{data:res,error:fnErr}=await supabase.functions.invoke('lens-analysis',{
          body:{
            // L'IA ne lit que les LENS_PHOTOS_LUES premières (2026-09-27) ;
            // le stepper, lui, reçoit TOUTES les photos (uploadedUrls, plus bas).
            urls:uploadedUrls.slice(0,LENS_PHOTOS_LUES),
            description:lensDesc.trim()||null,
            prixAchat:parseFloat(lensBuy)||null,
            lang,
            userCountry,
            mode:'identify',
          },
        });
        if(fnErr)throw fnErr;
        if(res?.error)throw new Error(res.error);
        identification=res??null;
      }catch(e){
        // 429 (plafond utilisateur ou plafond global), 5xx, timeout, JSON
        // invalide : tous traités pareil — on note et on continue.
        console.warn('[lens][identify] échec, parcours continué sans analyse :',e?.message||e);
        echec=true;
      }
      if(!identification)echec=true;

      // Ouverture fraîche : on purge tout brouillon précédent avant d'écrire le
      // blob hôte de CETTE session de publication.
      clearStepperPersistence();
      writeStepperHost({source:'lens',photos:uploadedUrls,lensResult:identification,viaIdentify:true,identifyEchec:echec,inventaireId:lensInventaireId??null});
      setIdentifyResult(identification);
      setIdentifyEchec(echec);
      setSansAnalyse(false);
      setOuvertureDirecte(false);
      setLensListingPhotos(uploadedUrls);
      setShowListingPreview(true);
      onStepperOpenChange?.(true);
    }catch(e){
      setListingError(e.message||'Erreur inattendue');
    }finally{
      setGeneratingListing(false);
    }
  }

  async function handleCreateListing(){
    setTypeCreation('create');
    setEtapeCreation('envoi');
    setGeneratingListing(true);
    setListingError('');
    try{
      // La ligne inventaire existe DÉJÀ depuis le 2026-09-15 : le scan l'a créée
      // au moment du débit. Ici on monte les copies définitives et on les
      // rattache à la fiche — l'article n'attend plus le clic Publier pour
      // exister, ni pour avoir ses photos.
      const uploadedUrls=await televerserPhotos();
      if(!uploadedUrls.length)throw new Error(lang==='en'?'Photo upload failed.':'Échec upload des photos.');
      setEtapeCreation('ouverture');
      // (29/10) Pas sur un résultat rouvert depuis l'historique : sa fiche a pu
      // changer de photos au Stock depuis le scan, on ne les écrase pas.
      if(!depuisHistorique)await rattacherPhotosDurables(uploadedUrls);

      // Ouverture fraîche : on purge tout brouillon précédent avant d'écrire le
      // blob hôte de CETTE session de publication.
      clearStepperPersistence();
      writeStepperHost({source:'lens',photos:uploadedUrls,lensResult,inventaireId:lensInventaireId??null,ouvertureDirecte:true});
      setIdentifyResult(null);
      setIdentifyEchec(false);
      setSansAnalyse(false);
      setOuvertureDirecte(true);
      setStepperEnPause(null);
      setLensListingPhotos(uploadedUrls);
      setShowListingPreview(true);
      onStepperOpenChange?.(true);
    }catch(e){
      setListingError(e.message||'Erreur inattendue');
    }finally{
      setGeneratingListing(false);
    }
  }

  // ── « Créer l'annonce sans analyse » (29/10, lot B 1.5) ───────────────────
  // Après un échec : l'écran de publication avec les photos SEULES, sans IA de
  // lecture. Le chemin existant le plus proche est celui du parcours gratuit
  // (handleIdentifyAndCreate) MOINS l'appel identify : montée des photos dans
  // listing-photos, blob hôte, stepper. La mention discrète « les photos n'ont
  // pas pu être analysées » du stepper (identifyFailed) dit ce qui s'est passé.
  // ⚠️ Ce n'est pas « sans quota » : l'étape 2 du stepper rédige l'annonce
  //    (generate-listing) et compte, comme toute annonce créée.
  async function handleCreateSansAnalyse(){
    setTypeCreation('sans');
    setEtapeCreation('envoi');
    setGeneratingListing(true);
    setListingError('');
    try{
      const uploadedUrls=await televerserPhotos();
      if(!uploadedUrls.length)throw new Error(lang==='en'?'Photo upload failed.':'Échec upload des photos.');
      setEtapeCreation('ouverture');
      clearStepperPersistence();
      writeStepperHost({source:'lens',photos:uploadedUrls,lensResult:null,viaIdentify:true,identifyEchec:true,sansAnalyse:true,inventaireId:lensInventaireId??null});
      setIdentifyResult(null);
      setIdentifyEchec(true);
      setSansAnalyse(true);
      setOuvertureDirecte(false);
      setStepperEnPause(null);
      setLensListingPhotos(uploadedUrls);
      setShowListingPreview(true);
      onStepperOpenChange?.(true);
    }catch(e){
      setListingError(e.message||'Erreur inattendue');
    }finally{
      setGeneratingListing(false);
    }
  }

  // Le geste, une fois l'accroche ou le rappel extension passés.
  function executer(action){
    if(action==='create')return handleCreateListing();
    if(action==='sans')return handleCreateSansAnalyse();
    return handleIdentifyAndCreate();
  }
  // Accroche (extension jamais vue) ou rappel extension AVANT d'ouvrir le
  // stepper — même garde qu'avant pour « Créer l'annonce », étendue à « sans
  // analyse » et à l'enchaînement automatique (29/10).
  function lancer(action){
    if(extensionNeverSeen===true){setExtPitchAction(action);return;}
    if(shouldShowExtensionReminder()){setRappelAction(action);return;}
    executer(action);
  }

  // ── « Voir l'analyse » / reprise du stepper en pause (29/10, lot B 1.2) ────
  // L'écran de publication appelle onVoirAnalyse : on referme le stepper sur le
  // résultat SANS RIEN PURGER — ni l'état Lens, ni le brouillon du stepper, ni
  // le blob hôte (marqué en pause). « Créer l'annonce » le rouvre tel quel :
  // mêmes photos, même étape, sans remonter les photos ni régénérer.
  function voirAnalyse(){
    const h=readStepperHost('lens');
    if(h)writeStepperHost({...h,enPause:true});
    setStepperEnPause(lensResult);
    setShowListingPreview(false);
    onStepperOpenChange?.(false);
  }
  function clicCreerAnnonce(){
    if(stepperEnPause&&stepperEnPause===lensResult&&lensListingPhotos.length&&readStepperHost('lens')){
      const h=readStepperHost('lens');
      writeStepperHost({...h,enPause:false});
      setStepperEnPause(null);
      setShowListingPreview(true);
      onStepperOpenChange?.(true);
      return;
    }
    lancer('create');
  }

  // ── « OUVRIR L'ANNONCE DÈS LA FIN DE L'ANALYSE » (29/10, lot B 1.2) ───────
  // Allumé (platform_settings.redaction.ouvrir_annonce_apres_scan), l'écran
  // enchaîne SEUL sur « Créer l'annonce » dès qu'un scan RÉUSSIT :
  //   · une seule fois par scan — lensScanAbouti (le scan_id, posé par
  //     analyzeLens sur un résultat réussi) est consommé ici, que l'on enchaîne
  //     ou non ;
  //   · jamais sur un échec (analyzeLens ne pose rien), jamais sur un article
  //     VENDU (son geste est « Enregistrer la vente »), ni sur une
  //     identification INCERTAINE (l'écran demande d'abord une photo de plus —
  //     l'ouvrir d'office la cacherait) ;
  //   · après la fin visible de la barre (finScan) — le résultat reste
  //     consultable par « Voir l'analyse » de l'écran de publication ;
  //   · par lancer('create') : l'accroche et le rappel extension passent avant.
  // Réglage pas encore lu (base lente) : on attend sa réponse, sans rien
  // consommer ; il est lu à l'ouverture de l'onglet, un scan dure ~20 s.
  const scanAboutiPret=lensScanAbouti!=null&&!lensLoading&&Boolean(lensResult)&&!lensResult?.error&&!finScan&&!showListingPreview&&!generatingListing;
  useEffect(()=>{
    if(!scanAboutiPret)return;
    if(!reglagesLus&&!reglagesRedaction.ouvrirApresScan)return;
    onScanAboutiVu?.();
    if(!reglagesRedaction.ouvrirApresScan)return;
    if(lensResult.est_vendu===true||lensResult.identification_incertaine===true)return;
    lancer('create');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scanAboutiPret,reglagesLus]);

  const basculerOuvrirApres=user?.id
    ?()=>{enregistrerReglages({ouvrirApresScan:!reglagesRedaction.ouvrirApresScan});}
    :null;

  const peutVoirAnalyse=!sansAnalyse&&!identifyResult&&Boolean(lensResult)&&!lensResult?.error;

  if (showListingPreview) {
    return (
      <div style={{ width:"100%" }}>
        <ListingPreviewScreen
          variante={nouveauStepper?"nouvelle":"classique"}
          inventaireId={effectiveInvId}
          userId={user.id}
          initialPhotos={lensListingPhotos}
          initialListing={listingSource}
          identifyFailed={identifyEchec}
          ebayCompte={ebayCompte}
          plateformesVisibles={plateformesVisibles}
          plateformesOuvertes={plateformesOuvertes}
          plateformesFermees={plateformesFermees}
          oplaMotifGrise={oplaMotifGrise}
          oplaExtensionMin={oplaExtensionMin}
          // Lens unifié (02/09 soir) : le scan payé (mode "annonce") rapporte
          // les annonces déjà rédigées — le stepper les applique sans
          // régénérer. Le parcours identify n'en porte jamais (listingSource
          // = identifyResult → annonce absente → prop null, comportement
          // classique).
          annoncePrete={listingSource?.annonce ?? null}
          // (29/10, lot B 1.2) Ouvert par « Créer l'annonce » du résultat : droit
          // à l'annonce (traité par ListingPreviewScreen). « Voir l'analyse »
          // referme le stepper sur le résultat, sans rien purger — seulement
          // quand il y a une analyse à revoir. La note du viseur et le prix
          // d'achat saisi voyagent avec (ils ne passaient pas au stepper).
          ouvertureDirecte={ouvertureDirecte}
          onVoirAnalyse={peutVoirAnalyse?voirAnalyse:undefined}
          noteVendeur={lensDesc}
          prixAchatSaisi={lensBuy}
          // published=true : le bouton de l'écran ✅ du stepper — on purge TOUT
          // le parcours (état App : photos, analyse, description, prix d'achat,
          // ligne inventaire) pour revenir au viseur vide. Sans argument
          // (retour arrière au step 0), on garde l'état : c'est un abandon,
          // l'utilisateur peut vouloir reprendre.
          // ⛔ `restoredInvId` NE SURVIT PLUS À LA FERMETURE (2026-09-20).
          //    Il n'existe que pour remonter le stepper après un rechargement
          //    d'onglet, et il vient du blob hôte — que la première ligne de ce
          //    handler efface. Le garder au-delà, c'était garder un pointeur
          //    vers un article que plus rien ne désigne : le parcours suivant
          //    s'ouvrait dessus, et ses photos écrasaient les siennes.
          //    La reprise après abandon, elle, ne passe PAS par lui : elle
          //    repart de lensInventaireId, qu'on garde exprès (mêmes photos =
          //    même article, sinon on crée une deuxième ligne d'inventaire).
          //    Règle énoncée dans utils/parcoursLens.js, rejouée par
          //    scripts/identite-article-lens-selftest.mjs.
          onClose={(published)=>{clearStepperPersistence();setShowListingPreview(false);setLensListingPhotos([]);setIdentifyResult(null);setIdentifyEchec(false);setSansAnalyse(false);setOuvertureDirecte(false);setStepperEnPause(null);setRestoredInvId(apresFermetureStepper({restoredInvId},published===true).restoredInvId);if(published){resetLensParcours?.();}onStepperOpenChange?.(false);}}
          supabase={supabase}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          isBusiness={isBusiness}
          onUpgrade={(tier)=>openUpgradeModal(tier,'stepper_publication')}
          // Le parcours identify n'alimente pas le lensResult de App : on lui
          // passe explicitement la source de CETTE session de publication.
          createStockItem={(prixAchat)=>saveLensItemForListing(prixAchat,listingSource)}
          alreadyInStock={!!effectiveInvId}
          extensionNeverSeen={extensionNeverSeen}
          extensionLastSeenAt={extensionLastSeenAt}
        />
      </div>
    );
  }

  // « Nouvelle analyse » (et le retour du résultat) : un RESET pur, il ne
  // débite rien. Un stepper en pause part avec le résultat qu'il servait.
  const reinitialiser=()=>{
    if(stepperEnPause&&readStepperHost('lens'))clearStepperPersistence();
    setStepperEnPause(null);setLensListingPhotos([]);
    setLensPhotos([]);setLensResult(null);setLensAdded(false);setLensDesc("");setLensBuy("");
  };

  // Le viseur tant qu'il n'y a pas de résultat RÉUSSI : avant le scan, pendant
  // (et la fin de la barre), et après un échec — les photos y restent.
  const surViseur=!lensResult||finScan||Boolean(lensResult?.error);
  const enAttente=generatingListing&&(
    typeCreation==='identify'
      ? {
          etapes:[
            {cle:'envoi',texte:lang==="en"?"Sending your photos…":"Envoi de tes photos…",duree:Math.max(3,lensPhotos.length*1.5)},
            {cle:'lecture',texte:lang==="en"?"Reading your photos: brand, size, material, condition…":"Lecture de tes photos : marque, taille, matière, état…",duree:10},
          ],
          sousTitre:lang==="en"?"Reading your photos · free":"Lecture de tes photos · gratuit",
          titre:lensDesc,
        }
      : {
          etapes:[
            {cle:'envoi',texte:lang==="en"?"Sending your photos…":"Envoi de tes photos…",duree:Math.max(3,lensPhotos.length*1.5)},
            {cle:'ouverture',texte:lang==="en"?"Opening your listing…":"Ouverture de ton annonce…",duree:3},
          ],
          sousTitre:lang==="en"?"Preparing your listing":"Préparation de ton annonce",
          titre:typeCreation==='create'?(lensResult?.titre??lensDesc):lensDesc,
        }
  );

  return (
    <>
      {surViseur ? (
        <LensScanHome
          finScan={finScan} onFinScan={()=>setFinScanVue(true)}
          lang={lang} currency={currency} isNative={isNative}
          plateformesOuvertes={plateformesOuvertes}
          plateformesFermees={plateformesFermees}
          lensPhotos={lensPhotos} setLensPhotos={setLensPhotos} setLensResult={setLensResult} setLensAdded={setLensAdded}
          lensDesc={lensDesc} setLensDesc={setLensDesc} lensMicActive={lensMicActive} lensMicLoading={lensMicLoading} toggleLensMic={toggleLensMic}
          lensPlaceholderFade={lensPlaceholderFade} lensPlaceholderIdx={lensPlaceholderIdx}
          lensFileRef={lensFileRef} handleLensPhoto={handleLensPhoto} handleLensPhotoNative={handleLensPhotoNative} handleLensCameraNative={handleLensCameraNative}
          analyzeLens={analyzeLens} lensLoading={lensLoading} lensProgres={lensProgres} lensReprise={lensReprise} infoRepriseLens={infoRepriseLens}
          quotas={quotas}
          erreur={lensResult?.error??null}
          onSansAnalyse={()=>lancer('sans')}
          occupe={generatingListing}
          listingError={listingError}
          ouvrirApresScan={reglagesRedaction.ouvrirApresScan}
          onOuvrirApresScan={basculerOuvrirApres}
          onHistorique={onRouvrirScan&&user?.id?()=>setShowHistorique(true):null}
          onCreerALaMain={onCreerALaMain}
          // Le quota du mois atteint : la modale des offres, variante quota
          // (ConversionModal, trigger quota_geste) — ouverte par un CLIC.
          onVoirForfaits={openUpgradeModal?()=>openUpgradeModal(undefined,'lens_quota_atteint','quota_geste'):null}
        />
      ) : (
        <>
          {/* (onCreateListing/creatingListing retirés à la fusion des CTA du
              02/09 soir : le viseur n'a plus qu'UN bouton — le scan unifié —
              et le scan n'exige pas l'extension. L'accroche/rappel extension
              gardent leur rôle sur le CTA de l'écran RÉSULTAT, action 'create'.) */}
          <PhotoSourceSheet
            open={showPhotoSheet}
            onClose={()=>setShowPhotoSheet(false)}
            onCamera={()=>{setShowPhotoSheet(false);handleLensCameraNative();}}
            onGallery={()=>{setShowPhotoSheet(false);handleLensPhotoNative();}}
            lang={lang}
            maxPhotos={MAX_PHOTOS}
          />
          <input
            ref={lensFileRef}
            type="file"
            accept="image/*"
            multiple
            style={{display:"none"}}
            onChange={handleLensPhoto}
          />
          {/* (prop openUpgradeModal retirée le 2026-08-09 : LensAnalysisResult
              ne la destructure pas — elle n'a jamais rien ouvert.) */}
          <LensAnalysisResult
            result={lensResult}
            lensBuy={lensBuy}
            lang={lang}
            currency={currency}
            lensAdded={lensAdded}
            addLensItem={addLensItem}
            openLensEditModal={openLensEditModal}
            onReset={reinitialiser}
            photo={lensPhotos[0]?.preview??null}
            strategie={reglagesRedaction.strategiePrix}
            userCountry={userCountry}
            nbPhotos={lensPhotos.length}
            // ⚠️ PAS DE GATE DE TIER (2026-07-21) : la condition était
            // `isPro && !lensResult.error`, et isPro valait alors profiles.is_pro
            // seul (App.jsx ; « au moins Pro » depuis le 04/10, utils/palier.js) —
            // un Free comme un Premium standard ne voyaient donc
            // jamais « Créer une annonce » depuis Lens, exactement comme dans
            // StockTab. Tout le monde cross-poste ; la différenciation se fait
            // aux unités, côté serveur.
            // CTA PRINCIPAL de l'écran (03/09) : construit ici (LensTab porte
            // handleCreateListing et l'état d'extension), rendu par
            // LensAnalysisResult EN TÊTE de la pile de boutons, en style HÉROS
            // (LensHeroCta). (29/10, lot B 1.2) « Créer l'annonce », sous-titre
            // « photos, marque, modèle, état et rayon déjà posés » ; il rouvre
            // tel quel un stepper mis en pause par « Voir l'analyse ».
            createCta={
              <>
                <LensHeroCta
                  onClick={clicCreerAnnonce}
                  disabled={generatingListing}
                  sousTitre={t('lensCreerAnnonceSous')}
                >
                  {t('lensCreerAnnonce')}
                </LensHeroCta>
                {listingError&&<div className="lns-bandeau lns-bandeau--erreur">{listingError}</div>}
              </>
            }
            // Les photos du scan, repliées : la grille (retirer, ajouter — une
            // photo de plus = un nouvel article, le résultat retombe, comme
            // avant) et la note, micro compris.
            photosPanel={
              <div className="lns-section" style={{gap:12}}>
                <div className="lns-section">
                  <GrillePhotos
                    lang={lang}
                    photos={lensPhotos}
                    onRetirer={(i)=>{setLensPhotos(prev=>prev.filter((_,j)=>j!==i));setLensResult(null);setLensAdded(false);}}
                    onAjouter={openLensPicker}
                  />
                </div>
                <NoteLens
                  id="lns-note-resultat" lang={lang} currency={currency}
                  lensDesc={lensDesc} setLensDesc={setLensDesc}
                  lensMicActive={lensMicActive} lensMicLoading={lensMicLoading} toggleLensMic={toggleLensMic}
                  lensPlaceholderFade={lensPlaceholderFade} lensPlaceholderIdx={lensPlaceholderIdx}
                />
              </div>
            }
          />
        </>
      )}

      {showHistorique&&(
        <HistoriqueLens
          open
          onClose={()=>setShowHistorique(false)}
          supabase={supabase}
          userId={user?.id}
          lang={lang}
          remplacePhotos={lensPhotos.length>0}
          onRouvrir={(r)=>{setResultatHistorique(r.resultat);onRouvrirScan?.(r);}}
          onOuvrirArticle={onOuvrirArticle}
        />
      )}

      {/* Rappel extension : le viseur ET le résultat le montent — il porte le
          geste à reprendre. */}
      {rappelAction&&(
        <ExtensionReminderModal
          lang={lang}
          onClose={()=>setRappelAction(null)}
          onContinue={()=>{const a=rappelAction;setRappelAction(null);executer(a);}}
        />
      )}
      {/* Accroche extension : même règle de montage que le rappel. */}
      {extPitchAction&&(
        <ExtensionPitchScreen
          lang={lang}
          onClose={()=>setExtPitchAction(null)}
          onContinue={()=>{const a=extPitchAction;setExtPitchAction(null);executer(a);}}
          supabase={supabase}
          userId={user?.id}
          onExtensionSeen={()=>{const a=extPitchAction;setExtPitchAction(null);executer(a);}}
        />
      )}
      {enAttente&&(
        <EcranPreparation lang={lang} photo={lensPhotos[0]?.preview??null} titre={enAttente.titre}
          etape={etapeCreation}
          etapes={enAttente.etapes}
          sousTitre={enAttente.sousTitre}/>
      )}
    </>
  );
});

export default LensTab;
