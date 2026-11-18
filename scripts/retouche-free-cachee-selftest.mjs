// ═══════════════════════════════════════════════════════════════════════════
// VERROU — AUCUN MUR PAYANT SUR LA RETOUCHE PENDANT LA PUBLICATION (18/11/2026, lot T1, décision 2 de Nico)
//   npm run selftest:retouche-free-cachee
// ═══════════════════════════════════════════════════════════════════════════
// Constat : un compte gratuit (quota_retouche_free = 0) voyait, à CHAQUE publication, « Retouche IA » grisé, « La
// retouche IA n'est pas incluse dans ta formule » et « Plus de retouches : voir les offres » (nouvel écran), ou deux
// cartes de retouche dont l'une menait au refus du serveur (écran classique). Décision 2 de Nico (18/11) : la retouche
// est CACHÉE pour le palier gratuit. Ce verrou fait tomber : un bouton, une phrase ou un lien de retouche montré à une
// formule sans retouche (ou quand on ne sait pas encore), et une retouche cachée à qui l'a (Premium, Pro, essai Cloud).
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 900)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
const REMISE_ISO = '2026-11-16T09:00:00.000Z';
const FREE = { palier: 'free', annonces: { plafond: 5, consommes: 0, restantes: 5 }, republication: { mode: 'mensuel', plafond: 50, faites: 0, restantes: 50, remise_le: REMISE_ISO }, retouches: { plafond: 0, consommes: 0, restantes: 0 }, scans: { plafond: null, consommes: 0, restantes: null } };
const PREMIUM = { palier: 'premium', annonces: { plafond: 40, consommes: 0, restantes: 40 }, republication: { mode: 'mensuel', plafond: 1500, faites: 0, restantes: 1500 }, retouches: { plafond: 5, consommes: 2, restantes: 3 }, scans: { plafond: null, consommes: 0, restantes: null } };

globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const EOP = await vite.ssrLoadModule('/src/publication/EcranOuPublier.jsx');
  const PL = await vite.ssrLoadModule('/src/publication/plateformes.js');
  const LPS = await vite.ssrLoadModule('/src/components/ListingPreviewScreen.jsx');
  const noop = () => {};
  const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
  // Le moteur FACTICE à la forme du vrai (le même que scripts/cout-publication-selftest.mjs), sans la grille (pas de coût).
  const mUnite = ({ quotas, retouchesEpuisees = false }) => {
    const m = {
      lang: 'fr', displayPreviews: [PHOTO, PHOTO], pickedPreviews: [], platformListings: null, quotas,
      reuseRetouched: false, retoucheLivree: false, optionRedaction: null, remiseAZero: REMISE_ISO, MAX_RETOUCHED: 5,
      retouchesEpuisees, retoucheNewCount: 0, photoOption: 'original', setPhotoOption: noop, retoucheARefaire: false, copieManquante: false,
      titreArticle: 'Veste en jean brut', etatArticle: 'Très bon état', price: 35, setLightboxUrl: noop,
      MAX_PHOTOS: 20, MIN_PHOTOS: 1, uploadError: null, identifyFailed: false, modeleAConfirmer: false,
      plateformesAffichees: ['vinted', 'leboncoin', 'beebs', 'ebay'], platformSupport: {},
      publishedSet: new Set(), queuedSet: new Set(), attentes: {}, oplaAccesDetail: null, ebayBloque: false,
      pausedPlatforms: [], plateformesAVenir: [], plateformesOuvertes: [], categorieFermee: PL.categorieFermee,
      selected: new Set(['vinted', 'leboncoin']), platformSessions: { vinted: true, leboncoin: true, beebs: true, ebay: true },
      ebayVoieApiReelle: false, ebayVoieApi: false, motifAVenir: () => '', motifsVerrouillage: {}, onCompleter: null, userId: null,
      motifEbay: '', boutonEbay: '', ouvrirPanneauEbay: null, motifPause: () => '', oplaVerdict: null, phraseEtat: () => '',
      motifSupport: () => '', basculer: noop, rien: null, addFiles: noop, removeFile: noop, handleReorderPreviews: noop,
      handleAddMorePhotos: noop, handleRemovePhoto: noop, handleReorderPhotos: noop, analysisHidden: true, notes: '', setNotes: noop,
      voirOffres: noop,
    };
    m.bilan = PL.bilanPlateformes(m);
    return m;
  };
  const rendre = (o) => { try { return texte(renderToStaticMarkup(h(EOP.default, { m: mUnite(o) }))); } catch (e) { return `ERREUR ${e.message}`; } };

  console.log('1. Nouvel écran « Où publier ? »');
  const free = rendre({ quotas: FREE, retouchesEpuisees: true });
  ok(!/^ERREUR/.test(free), 'l’écran se rend', free.slice(0, 300));
  ok(!/Retouche IA|Telles quelles|n.est pas incluse dans ta formule|Plus de retouches : voir les offres|Retouches ce mois-ci/.test(free),
    'Free (0 retouche) : ni bouton, ni phrase, ni lien d’offres sur la retouche', free.slice(0, 900));
  ok(/Annonces ce mois-ci 5 restantes \/ 5/.test(free) && /La rédaction compte 1 annonce, une seule fois\./.test(free), 'Free : le reste de la carte est là, comme avant', free.slice(-600));
  const inconnu = rendre({ quotas: null });
  ok(!/Retouche IA|voir les offres/.test(inconnu), 'quotas pas encore lus : rien sur la retouche (jamais un bouton qui mène au refus du serveur)');
  const premium = rendre({ quotas: PREMIUM });
  ok(/Retouche IA/.test(premium) && /Telles quelles/.test(premium) && /Retouches ce mois-ci 3 restantes \/ 5/.test(premium), 'Premium (5 retouches) : le choix et son compteur, comme avant', premium.slice(0, 900));
  const epuise = rendre({ quotas: { ...PREMIUM, retouches: { plafond: 5, consommes: 5, restantes: 0 } }, retouchesEpuisees: true });
  ok(/Retouche IA/.test(epuise) && /Plus de retouches : voir les offres/.test(epuise), 'Premium aux retouches épuisées : la ligne reste (décision 2 : le palier gratuit seulement)');

  console.log('\n2. Écran classique (StepPhotos)');
  const base = {
    photos: [PHOTO], onAddPhotos: noop, onRemovePhoto: noop, onReorderPhotos: noop, onPhotoClick: noop, photoOption: 'original', setPhotoOption: noop,
    background: 'white', setBackground: noop, selected: new Set(['vinted']), setSelected: noop, coinPrices: {}, platformSupport: {},
    publishedSet: new Set(), queuedSet: new Set(), lang: 'fr',
  };
  const rendreSP = (retoucheIncluse) => { try { return renderToStaticMarkup(h(LPS.StepPhotos, { ...base, retoucheIncluse })); } catch (e) { return `ERREUR ${e.message}`; } };
  const sans = rendreSP(false);
  const avec = rendreSP(true);
  ok(!/^ERREUR/.test(sans) && !/^ERREUR/.test(avec), 'StepPhotos se rend', sans.slice(0, 300));
  const bloc = (html) => (html.match(/display:(none|flex);flex-direction:column;gap:10px;margin-bottom:12px/) ?? [])[1] ?? '';
  ok(bloc(sans) === 'none' && bloc(avec) === 'flex', 'retoucheIncluse faux : les options de retouche ne s’affichent pas ; vrai : elles s’affichent', `${bloc(sans)} / ${bloc(avec)}`);
  const lps = lire('src/components/ListingPreviewScreen.jsx');
  ok(lps.includes('retoucheIncluse={quotas?.retouches ? Number(quotas.retouches.plafond) > 0 : Boolean(isPremium || isPro)}'),
    'l’hôte : le plafond lu (quotas_etat), sinon les drapeaux payants (jamais caché à tort à un Premium)');
  const eop = lire('src/publication/EcranOuPublier.jsx');
  ok(eop.includes('const retoucheIncluse = Number(retouches?.plafond) > 0;') && eop.includes('{(retoucheIncluse || photosRetouchees) && (<>'),
    'nouvel écran : la retouche n’existe que si la formule en a');
} finally {
  await vite.close();
}

console.log(`\n${rouges ? `✗ retouche-free-cachee : ${rouges} rouge(s), ${verts} vert(s)` : `✓ retouche-free-cachee : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
