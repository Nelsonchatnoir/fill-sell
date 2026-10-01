// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — LA barre de progression et la file des jobs, écran par écran (01/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Il monte les composants RÉELS de l'app
// (BarreJobCarte, BarreProgression, FileDesJobs, RepublishProgressSheet,
// RemovePlatformsModal, EcranSuivi, StepGeneration, LensScanHome,
// EcranPreparation) avec le VRAI CSS (STOCK_CSS lu dans StockTab.jsx,
// stepper.css), sur des jobs de la forme exacte de cross_post_jobs. Les
// articles (titres, photos, prix) sont injectés par le script de capture
// (window.__APERCU__, relus dans la base) ; sans eux, des articles neutres.
// Une scène par adresse : barres.html#scene=<nom>.
//
// Ce qui est une RÉPLIQUE (balisage recopié, composant réel dedans) : la carte
// du Stock (.gcard, son CSS réel) et le bandeau « En cours » (styles en ligne
// recopiés de StockTab). Le reste est le composant lui-même.
// Aucun compte, aucune requête : les supabase sont des bouchons en mémoire.
//
//     node scripts/apercu/capture-barres.mjs
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
// Le CSS GLOBAL de l'app, comme dans l'app (main.jsx, App.jsx) : la police et
// les remises à zéro héritées par les feuilles portalisées dans <body>.
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import '../../src/publication/stepper.css';
import BarreJobCarte from '../../src/components/BarreJobCarte.jsx';
import BarreProgression from '../../src/components/BarreProgression.jsx';
import FileDesJobs from '../../src/components/FileDesJobs.jsx';
import PlatformLogo from '../../src/components/platform-logos/PlatformLogo.jsx';
import GalleryPhoto from '../../src/components/GalleryPhoto.jsx';
import EcranSuivi from '../../src/publication/EcranSuivi.jsx';
import { StepGeneration } from '../../src/components/ListingPreviewScreen.jsx';
import { RepublishProgressSheet, RemovePlatformsModal } from '../../src/tabs/StockTab.jsx';
import { LensScanHome, EcranPreparation } from '../../src/tabs/LensTab.jsx';
import { buildCardCss } from '../../src/utils/shared.js';
import { useTranslation } from '../../src/i18n/useTranslation.js';
import stockSource from '../../src/tabs/StockTab.jsx?raw';

const DEBUT = "const STOCK_CSS = buildCardCss('stock-v2') + `";
const corps = stockSource.slice(stockSource.indexOf(DEBUT) + DEBUT.length);
const STOCK_CSS = buildCardCss('stock-v2') + corps.slice(0, corps.indexOf('`;'));

const MAINTENANT = Date.now();
const il = (s) => new Date(MAINTENANT - s * 1000).toISOString();
const dans = (s) => new Date(MAINTENANT + s * 1000).toISOString();

// Les articles : injectés (base réelle) ou neutres.
const NEUTRES = {
  short: { id: 1, title: 'Short de bain taille M orange et bleu marine', sell: '8', photos: [] },
  tshirt: { id: 2, title: 'T-shirt bleu marine poche poitrine taille S', sell: '12.5', photos: [] },
  bouilloire: { id: 3, title: 'Bouilloire électrique 0.8L blanc et noir', sell: '18', photos: [] },
  maillot: { id: 4, title: 'Maillot blanc', sell: '48', photos: [] },
  robe: { id: 5, title: 'Robe fleurie bleue manches courtes', sell: '28', photos: [] },
  montre: { id: 6, title: 'Montre noire', sell: '100', photos: [] },
  long: { id: 7, title: 'Pantalon de jogging vert XS avec un titre très long qui ne tient sur aucune ligne', sell: '12', photos: [] },
  bobines: { id: 8, title: 'Lot de 3 bobines de film Super 8 et 16 mm vintage avec boîte métal', sell: '25', photos: [] },
  sansphoto: { id: 9, title: 'T-shirt rouille', sell: '18', photos: [] },
};
const A = { ...NEUTRES, ...(window.__APERCU__?.articles ?? {}) };
A.sansphoto = { ...A.sansphoto, photos: [] };
const FICHES = new Map(Object.values(A).map((i) => [String(i.id), i]));
let n = 0;
const job = (article, x) => ({
  id: `j${++n}`, inventaire_id: article.id, platform: 'vinted', action: 'publish', status: 'pending',
  created_at: il(120), published_at: null, error: null, title: article.title, voie: 'extension', listing_url: null,
  platform_fields: {}, ...x,
});
const ctx = { lang: 'fr', extension: { etat: 'vivante' }, plateformesEnPause: new Set(), plafond: null, texteErreur: (j) => j.error };
const fmt = (n2) => `${Number(n2).toLocaleString('fr-FR', { minimumFractionDigits: Number(n2) % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const T = { canvas: '#EDEAE0', ink: '#10201B', mute: '#8A8578', mute2: '#6B7A75', border: '#E7E3D8' };

const Titre = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, margin: '18px 0 8px' }}>{children}</div>
);

// ── 1. Les cartes du Stock (réplique de .gcard, CSS réel) ──────────────────
function Carte({ article, jobs, tous, pastille, marque }) {
  const photo = article.photos?.[0]?.url ?? article.photos?.[0] ?? null;
  return (
    <div className="gcard" data-carte={marque ?? article.id}>
      <div className="gphoto">
        {photo ? <GalleryPhoto url={photo} alt="" fallback={<span />} /> : <div style={{ width: '100%', height: '100%', background: '#F2F0E9' }} />}
        {pastille && <div className="gstatus"><i className="dot" style={{ width: 6, height: 6, borderRadius: 3, background: '#2F9E90', display: 'inline-block' }} />{pastille}</div>}
      </div>
      <div className="gbody">
        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{fmt(article.sell)}</div>
        <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.3, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{article.title}</div>
      </div>
      <BarreJobCarte jobs={jobs} tous={tous ?? jobs} lang="fr" ctx={ctx} onOuvrir={() => { window.__fileOuverte = (window.__fileOuverte ?? 0) + 1; }} />
    </div>
  );
}

function SceneCartes() {
  // La carte qui FINIT : en travail 3 s, puis publiée — la barre glisse à 100 %,
  // la coche paraît, puis la barre s'efface (5 s).
  const enTravail = job(A.robe, { status: 'processing', platform: 'leboncoin', platform_fields: { processing_since: il(40) } });
  const [fin, setFin] = useState(null);
  useEffect(() => { const t = setTimeout(() => setFin({ ...enTravail, status: 'published', published_at: new Date().toISOString() }), 3000); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // La séance : Vinted finit avant Leboncoin — la barre d'ensemble ne doit
  // JAMAIS reculer quand Vinted sort du travail.
  const v0 = job(A.bobines, { status: 'processing', platform: 'vinted', created_at: il(60), platform_fields: { processing_since: il(30) } });
  const l0 = job(A.bobines, { platform: 'leboncoin', created_at: il(60) });
  const [seance, setSeance] = useState({ jobs: [v0, l0], tous: [v0, l0] });
  useEffect(() => {
    const t = setTimeout(() => {
      const v1 = { ...v0, status: 'published', published_at: new Date().toISOString() };
      const l1 = { ...l0, status: 'processing', platform_fields: { processing_since: new Date().toISOString() } };
      setSeance({ jobs: [l1], tous: [v1, l1] });
    }, 2500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pub3 = [
    job(A.tshirt, { status: 'processing', platform: 'vinted', platform_fields: { processing_since: il(25) } }),
    job(A.tshirt, { platform: 'leboncoin' }),
    job(A.tshirt, { platform: 'beebs' }),
  ];
  return (
    <div className="ggrid" data-scene="cartes">
      <Carte article={A.short} pastille="En cours…" jobs={[job(A.short, { status: 'processing', platform_fields: { processing_since: il(20) } })]} />
      <Carte article={A.tshirt} pastille="En cours…" jobs={pub3} />
      <Carte article={A.bouilloire} pastille="Retrait…" jobs={[job(A.bouilloire, { action: 'republish', status: 'processing', platform_fields: { republish_step: 'captured', processing_since: il(8) } })]} />
      <Carte article={A.maillot} pastille="Recréation…" jobs={[job(A.maillot, { action: 'republish', platform: 'leboncoin', platform_fields: { republish_step: 'deleted', deleted_at: il(70), next_action_after: dans(150) } })]} />
      <Carte article={A.montre} pastille="Retrait…" jobs={[job(A.montre, { action: 'delete', platform: 'leboncoin', status: 'processing', platform_fields: { processing_since: il(10) } })]} />
      <Carte article={A.robe} pastille={fin ? 'En ligne' : 'En cours…'} jobs={fin ? [] : [enTravail]} tous={fin ? [fin] : [enTravail]} />
      <Carte article={A.long} pastille="En cours…" jobs={[job(A.long, { platform: 'opla' })]} />
      <Carte article={A.bobines} marque="seance" pastille="En cours…" jobs={seance.jobs} tous={seance.tous} />
      <Carte article={A.sansphoto} pastille="En cours…" jobs={[job(A.sansphoto, { status: 'processing', platform: 'ebay', voie: 'api', platform_fields: { processing_since: il(30) } })]} />
    </div>
  );
}

// ── 2. Le bandeau « En cours » du Stock (réplique, barre réelle) ──────────
function Bandeau({ actif, article, faites, total, muet = false }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E7E3D8', borderRadius: 20, padding: '12px 14px', marginBottom: 10 }} data-bandeau>
      <button type="button" style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: 0, margin: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: '#F7F5EF', border: '1px solid #EFECE3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GalleryPhoto url={article.photos?.[0]?.url ?? article.photos?.[0] ?? null} alt="" fallback={<PlatformLogo platform={actif.platform} size={20} />} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#10201B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{article.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 11.5, color: '#5C6560' }}>
              <PlatformLogo platform={actif.platform} size={13} /><span>Vinted<span style={{ color: '#8A8578' }}> · republication</span></span>
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#10201B', fontVariantNumeric: 'tabular-nums' }}>{faites} sur {total}</div>
            {!muet && <div style={{ fontSize: 10.5, color: '#8A8578', fontWeight: 500, marginTop: 2 }}>~{(total - faites) * 5}-{(total - faites) * 7} min</div>}
          </div>
        </div>
        <div style={{ marginTop: 11 }}>
          <BarreProgression seulePiste lang="fr" fraction={faites / total} pas={1 / total} dureePas={60} etat={muet ? 'pause' : 'en_cours'} />
        </div>
      </button>
    </div>
  );
}
function SceneBandeau() {
  const actif = job(A.short, { action: 'republish', status: 'processing', platform_fields: { republish_step: 'a_capturer' } });
  return (
    <div data-scene="bandeau">
      <Titre>Bandeau — 2 sur 5, l'actif travaille</Titre>
      <Bandeau actif={actif} article={A.short} faites={2} total={5} />
      <Titre>Bandeau — ordinateur muet : la barre s'immobilise</Titre>
      <Bandeau actif={actif} article={A.long} faites={1} total={3} muet />
    </div>
  );
}

// ── 3. La file complète ────────────────────────────────────────────────────
const geste = (j) => (j.status === 'needs_user'
  ? <button type="button" style={{ border: 'none', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(120deg,#2F9E90,#1B6E62)' }}>Compléter</button>
  : null);
function SceneFile({ variante }) {
  let jobs = [];
  let contexte = ctx;
  if (variante === 'typique') {
    jobs = [
      job(A.short, { action: 'republish', platform: 'beebs', status: 'processing', platform_fields: { republish_step: 'captured', processing_since: il(12) } }),
      job(A.tshirt, { platform: 'leboncoin', created_at: il(300) }),
      job(A.montre, { action: 'delete', platform: 'beebs', created_at: il(200) }),
      job(A.maillot, { action: 'republish', platform: 'vinted', created_at: il(900), platform_fields: { republish_step: 'a_capturer' } }),
      job(A.robe, { action: 'republish', platform: 'vinted', created_at: il(800), platform_fields: { republish_step: 'captured', retenue_serveur: { motif: 'boutique_origine_inconnue', depuis: il(3600) } } }),
      job(A.bobines, { platform: 'beebs', error: 'Beebs ne répond pas', platform_fields: { next_action_after: dans(25 * 60) } }),
      job(A.long, { platform: 'vinted', status: 'needs_user', error: 'Vinted demande la taille : choisis-la dans la liste.' }),
      job(A.bouilloire, { platform: 'beebs', error: 'En attente de ta connexion à Beebs', platform_fields: { attente_session: { depuis: il(600) } } }),
    ];
    contexte = { ...ctx, plafond: { retenue: true, motif: 'pause', reprise: dans(86 * 60) } };
  } else if (variante === 'cinquante') {
    const liste = Object.values(A);
    jobs = Array.from({ length: 50 }, (_, i) => job(liste[i % liste.length], { platform: ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla'][i % 5], created_at: il(3000 - i * 30), action: i % 7 === 3 ? 'delete' : 'publish' }));
    jobs[0] = { ...jobs[0], status: 'processing', platform_fields: { processing_since: il(15) } };
  } else if (variante === 'ordinateur') {
    jobs = [job(A.short, {}), job(A.tshirt, { platform: 'beebs' }), job(A.bouilloire, { platform: 'ebay', voie: 'api' })];
    contexte = { ...ctx, extension: { etat: 'eteinte', jours: 2 } };
  }
  return (
    <FileDesJobs lang="fr" jobs={jobs} fiches={FICHES} contexte={contexte} texteErreur={(j) => j.error} formaterPrix={fmt}
      renderGeste={geste}
      pied={variante === 'typique' ? <div style={{ fontSize: 11.5, color: '#8A8578', textAlign: 'center' }}>(pied : bouton d'arrêt des republications, rendu par le Stock)</div> : null}
      onFermer={() => {}} />
  );
}

// ── 4. La feuille de republication ─────────────────────────────────────────
function SceneRepub({ etat }) {
  const j = etat === 'arret'
    ? job(A.maillot, { action: 'republish', platform: 'leboncoin', status: 'needs_user', error: 'Leboncoin demande : Produit.', platform_fields: { republish_step: 'captured', champs_a_completer: [] } })
    : job(A.maillot, { action: 'republish', platform: 'leboncoin', platform_fields: { republish_step: 'deleted', deleted_at: il(70), next_action_after: dans(150) } });
  return <RepublishProgressSheet lang="fr" job={j} item={A.maillot} ctxBarres={ctx} formaterPrix={fmt} onClose={() => {}} onOuvrirFile={() => {}} />;
}

// ── 5. Le retrait (modale « Retirer de… ») ─────────────────────────────────
function SceneRetrait() {
  const pubs = [
    job(A.montre, { platform: 'leboncoin', status: 'published', listing_url: 'https://www.leboncoin.fr/ad/x/1', published_at: il(86400) }),
    job(A.montre, { platform: 'vinted', status: 'published', listing_url: 'https://www.vinted.fr/items/1', published_at: il(86400) }),
  ];
  const del = job(A.montre, { platform: 'leboncoin', action: 'delete', status: 'processing', created_at: il(30), platform_fields: { processing_since: il(9) } });
  return (
    <RemovePlatformsModal item={{ ...A.montre, statut: 'stock' }} jobsAll={[...pubs, del]} lang="fr" busyPlatform={null}
      onClose={() => {}} onRemove={() => {}} onCompleter={() => {}} onRelancer={() => {}} onOublier={() => {}} onRepublier={() => {}}
      plateformes={['vinted', 'leboncoin']} ctxBarres={ctx} onOuvrirFile={() => {}} />
  );
}

// ── 6. Le suivi de la publication (écran 4 du parcours) ────────────────────
function bouchonSupabase(jobs) {
  const chaine = (table) => {
    const c = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve({ data: { extension_last_seen_at: new Date().toISOString() }, error: null });
    c.then = (ok) => Promise.resolve(table === 'cross_post_jobs' ? { data: jobs, error: null } : { data: [], error: null }).then(ok);
    return c;
  };
  return { from: chaine, functions: { invoke: () => Promise.resolve({ data: null, error: null }) } };
}
function SceneSuivi({ variante }) {
  const { t } = useTranslation('fr');
  const depuis = il(60);
  let plateformes = ['vinted'];
  let jobs = [];
  if (variante === 'une') {
    jobs = [job(A.short, { status: 'processing', created_at: il(50), platform_fields: { processing_since: il(15) } })];
  } else if (variante === 'quatre') {
    plateformes = ['vinted', 'ebay', 'leboncoin', 'beebs'];
    jobs = [
      job(A.short, { platform: 'vinted', status: 'published', created_at: il(55), listing_url: 'https://www.vinted.fr/items/1' }),
      job(A.short, { platform: 'ebay', voie: 'api', status: 'published', created_at: il(55), listing_url: 'https://www.ebay.fr/itm/1' }),
      job(A.short, { platform: 'leboncoin', status: 'processing', created_at: il(55), platform_fields: { processing_since: il(10) } }),
      job(A.short, { platform: 'beebs', created_at: il(55) }),
    ];
  } else if (variante === 'partiel') {
    plateformes = ['vinted', 'ebay', 'leboncoin', 'beebs'];
    jobs = [
      job(A.short, { platform: 'vinted', status: 'published', created_at: il(55), listing_url: 'https://www.vinted.fr/items/1' }),
      job(A.short, { platform: 'ebay', voie: 'api', status: 'published', created_at: il(55), listing_url: 'https://www.ebay.fr/itm/1' }),
      job(A.short, { platform: 'leboncoin', status: 'published', created_at: il(55), listing_url: 'https://www.leboncoin.fr/ad/1' }),
      job(A.short, { platform: 'beebs', status: 'needs_user', created_at: il(55), error: 'Beebs demande « Taille »', platform_fields: { needsUserField: { field_key: 'taille', field_label: 'Taille' } } }),
    ];
  }
  const m = {
    lang: 'fr', t, supabase: bouchonSupabase(jobs), userId: 'apercu',
    fournee: { plateformes, inventaireId: A.short.id, depuis },
    voiesDuLot: { toutServeur: false }, extFraicheurPublier: { etat: 'vivante' }, extensionVueLe: new Date().toISOString(),
    titreArticle: A.short.title, photos: A.short.photos, processedPhotos: [], price: A.short.sell,
    onCompleter: () => {}, ebayVoieApiReelle: true, exclusionsDuClic: [], publieesSansPf: [],
  };
  return (
    <div className="fsn" style={{ position: 'relative', height: '100vh' }}>
      <div className="fsn-scroll"><div className="fsn-col"><EcranSuivi m={m} /></div></div>
      <div className="fsn-foot"><div className="fsn-col"><button type="button" className="fsn-btn fsn-btn--primary">Terminé</button></div></div>
    </div>
  );
}

// ── 7. La rédaction des annonces (écran 2 du parcours) ─────────────────────
function SceneGeneration({ retouche }) {
  const [listings, setListings] = useState(null);
  useEffect(() => {
    if (window.location.hash.includes('fin')) { const t = setTimeout(() => setListings({ vinted: { title: 'x' } }), 4000); return () => clearTimeout(t); }
    return undefined;
  }, []);
  return (
    <div className="fsn" style={{ position: 'relative', height: '100vh' }}>
      <div className="fsn-scroll"><div className="fsn-col">
        <div><p className="fsn-eyebrow">Étape 2 sur 3</p><h1 className="fsn-h" style={{ marginTop: 4 }}>Ce qui va partir</h1></div>
        {listings
          ? <div data-annonces style={{ fontSize: 13 }}>Les annonces s'affichent ici.</div>
          : null}
        {!listings || window.location.hash.includes('fin') ? (
          <StepGeneration generating={!listings} generateError={null} platformListings={listings} processedPhotos={[]} selected={new Set(['vinted'])}
            edited={{}} setEdited={() => {}} lang="fr" photoOption={retouche ? 'ia' : 'original'} price={A.short.sell}
            photoArticle={A.short.photos?.[0] ?? null} titreArticle={A.short.title} variante="nouvelle" etatsParPlateforme={{}}
            setPrice={() => {}} customPriced={new Set()} setCustomPriced={() => {}} />
        ) : null}
      </div></div>
    </div>
  );
}

// ── 8. Lens ────────────────────────────────────────────────────────────────
function SceneLens({ etape }) {
  const url = (x) => x.photos?.[0]?.url ?? x.photos?.[0] ?? null;
  const photos = [A.montre, A.robe, A.bouilloire].map((x) => ({ preview: url(x) ?? 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }));
  const [progres, setProgres] = useState({ etape: 'envoi', faites: 0, total: 3 });
  useEffect(() => {
    const ts = [setTimeout(() => setProgres((p) => ({ ...p, faites: 1 })), 1500), setTimeout(() => setProgres((p) => ({ ...p, faites: 2 })), 3000), setTimeout(() => setProgres((p) => ({ ...p, faites: 3, etape: 'analyse' })), 4500)];
    return () => ts.forEach(clearTimeout);
  }, []);
  if (etape === 'preparation') {
    return <EcranPreparation lang="fr" photo={url(A.montre)} titre="Casio G-Shock noire" etape="envoi"
      etapes={[{ cle: 'envoi', texte: 'Envoi de tes photos…', duree: 4.5 }, { cle: 'ouverture', texte: 'Ouverture de ton annonce…', duree: 3 }]} sousTitre="Préparation de ton annonce" />;
  }
  return (
    <div style={{ padding: 16 }}>
      <LensScanHome lang="fr" currency="EUR" isPremium isNative={false} isPro={false} plateformesOuvertes={['vinted']}
        lensPhotos={photos.map((p) => ({ ...p, mime: 'image/jpeg' }))} setLensPhotos={() => {}} setLensResult={() => {}} setLensAdded={() => {}}
        lensDesc="Casio G-Shock noire" setLensDesc={() => {}} lensMicActive={false} lensMicLoading={false} toggleLensMic={() => {}}
        lensPlaceholderFade={false} lensPlaceholderIdx={0} lensFileRef={{ current: null }}
        handleLensPhoto={() => {}} analyzeLens={() => {}} lensLoading lensProgres={progres} lensReprise={false} infoRepriseLens={null} />
    </div>
  );
}

const SCENES = {
  cartes: () => <div className="stock-v2" style={{ padding: 16 }}><style>{STOCK_CSS}</style><SceneCartes /></div>,
  bandeau: () => <div style={{ padding: 16 }}><SceneBandeau /></div>,
  'file-typique': () => <SceneFile variante="typique" />,
  'file-vide': () => <SceneFile variante="vide" />,
  'file-cinquante': () => <SceneFile variante="cinquante" />,
  'file-ordinateur': () => <SceneFile variante="ordinateur" />,
  'repub-remise': () => <SceneRepub etat="remise" />,
  'repub-arret': () => <SceneRepub etat="arret" />,
  retrait: () => <SceneRetrait />,
  'suivi-une': () => <SceneSuivi variante="une" />,
  'suivi-quatre': () => <SceneSuivi variante="quatre" />,
  'suivi-partiel': () => <SceneSuivi variante="partiel" />,
  'generation-retouche': () => <SceneGeneration retouche />,
  'generation-fin': () => <SceneGeneration retouche={false} />,
  'lens-scan': () => <SceneLens etape="scan" />,
  'lens-preparation': () => <SceneLens etape="preparation" />,
};

function Apercu() {
  const nom = (window.location.hash.match(/scene=([\w-]+)/) ?? [])[1] ?? 'cartes';
  const Scene = SCENES[nom] ?? SCENES.cartes;
  return (
    <div style={{ background: T.canvas, minHeight: '100vh', fontFamily: "'Space Grotesk', system-ui, sans-serif" }} data-apercu={nom}>
      <Scene />
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
