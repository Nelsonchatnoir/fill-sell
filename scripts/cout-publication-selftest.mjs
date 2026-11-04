// ═══════════════════════════════════════════════════════════════════════════
// LE COÛT AFFICHÉ AVANT PUBLICATION — GRILLE À 3 JAUGES (04/11/2026, lot 2)
//     npm run selftest:cout-publication
//     (node --import ./scripts/loader-ext.mjs scripts/cout-publication-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
// Maquettes validées par Nico le 03/11 : 4.1 publication à l'unité (Free nouvel article, Free texte déjà rédigé,
// Business), 4.2 publication en lot, 4.3 le lot qui dépasse (mur du lot), 4.4 avant une remontée en lot.
// Les écrans RENDUS côté serveur (Vite SSR + react-dom/server, comme reglages-jauges), sans réseau ni base :
//   « Où publier ? » (EcranOuPublier), « Où les publier ? » du lot (EcranPlateformes), la feuille de remontée du
//   Stock (RepublishSheet) ; les règles pures du lot (regles.js) et le bouton de l'unité (StepperNouveau,
//   piedSiUneJaugeManque) EXÉCUTÉS, jamais recopiés.
// Ce qu'il prouve :
//   1. interrupteur à 0 (quotas_etat sans « grille ») : rien de neuf — « ne coûte rien de plus », « Annonces ce
//      mois-ci », « compte pour un », « Préparer N annonces », le mur et la ligne « Gratuit » d'avant ;
//   2. à 1 : les phrases des maquettes, recalculées par case cochée ; texte déjà rédigé sans annonce ; Business
//      « illimité » ; le bouton gris AVANT l'appui quand une jauge manque, avec le lien du mur Annonces ;
//      Le lien du mur Publications (jauge vide) passe par voirOffres('publications') du moteur ;
//   3. le lot : le partage par les DEUX jauges (annonces, publications), le mur qui nomme la jauge, le bouton qui
//      chiffre le palier visé (coin_config), « Préparer / Envoyer / Programmer N publications », « N publications en
//      file », le refus d'un article (publishErrorCode du moteur) → « Reste au stock », sans modale ;
//   4. la remontée en lot : ce qu'elle utilisera, ou combien il en reste et combien le lot en demande — rien de
//      plus (la cadence ne bouge pas), rien chez les illimités.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonctionJs } from './lib/extraire-fonction-js.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 900)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s).replace(ESP, ' ');
const texte = (html) => net(String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
const fr = texte;

// La grille posée en base le 04/11 (migration 20261104000000_trois_jauges_interrupteur).
const CLES_JAUGES = {
  jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0,
  jauge_lens_business: 600,
};
const REMISE_ISO = '2026-11-16T09:00:00.000Z';
const etat = (palier, [ca, pa], [cp, pp], extra = {}) => ({
  grille: 'trois_jauges', palier, annonces_mode: pa == null ? 'illimite' : 'mensuel',
  annonces: { plafond: pa, consommes: ca, restantes: pa == null ? null : Math.max(0, pa - ca) },
  publications: { mode: pp == null ? 'illimite' : 'mensuel', plafond: pp, consommes: cp, restantes: pp == null ? null : Math.max(0, pp - cp) },
  republication: { mode: 'mensuel', plafond: 30, faites: 0, restantes: 30, remise_le: REMISE_ISO },
  retouches: { plafond: 5, consommes: 2, restantes: 3 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null, ...extra,
});
// quotas_etat AUJOURD'HUI (interrupteur à 0) : ni grille, ni publications, ni annonces_mode, ni lens.
const AUJ_FREE = { palier: 'free', annonces: { plafond: 5, consommes: 0, restantes: 5 }, republication: { mode: 'mensuel', plafond: 50, faites: 0, restantes: 50, remise_le: REMISE_ISO }, retouches: { plafond: 0, consommes: 0, restantes: 0 }, scans: { plafond: null, consommes: 0, restantes: null } };
const AUJ_PREMIUM = { palier: 'premium', annonces: { plafond: 40, consommes: 0, restantes: 40 }, republication: { mode: 'mensuel', plafond: 1500, faites: 0, restantes: 1500 }, retouches: { plafond: 5, consommes: 2, restantes: 3 }, scans: { plafond: null, consommes: 0, restantes: null } };

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
  const J = await vite.ssrLoadModule('/src/utils/jauges.js');
  const EOP = await vite.ssrLoadModule('/src/publication/EcranOuPublier.jsx');
  const PL = await vite.ssrLoadModule('/src/publication/plateformes.js');
  const R = await vite.ssrLoadModule('/src/publication/lot/regles.js');
  const LOT = await vite.ssrLoadModule('/src/publication/lot/LotPublication.jsx');
  const ST = await vite.ssrLoadModule('/src/tabs/StockTab.jsx');
  const SN = lire('src/publication/StepperNouveau.jsx');
  const lotSrc = lire('src/publication/lot/LotPublication.jsx');

  // ── « Où publier ? » : un moteur FACTICE à la forme du vrai (comme scripts/apercu/depop-interdits.jsx) ──────
  const noop = () => {};
  const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
  const mUnite = ({ quotas, cochees = ['vinted', 'leboncoin', 'beebs'], fiche = false, lang = 'fr' }) => {
    const m = {
      lang, displayPreviews: [PHOTO, PHOTO], pickedPreviews: [], platformListings: fiche ? { platforms: { vinted: {}, leboncoin: {}, beebs: {}, ebay: {} } } : null, quotas,
      reuseRetouched: false, retoucheLivree: false, optionRedaction: fiche ? 'original' : null, remiseAZero: REMISE_ISO, MAX_RETOUCHED: 5,
      retouchesEpuisees: false, retoucheNewCount: 0, photoOption: 'original', setPhotoOption: noop, retoucheARefaire: false, copieManquante: false,
      titreArticle: "Veste en jean Levi's", etatArticle: 'Très bon état', price: 35, setLightboxUrl: noop,
      MAX_PHOTOS: 20, MIN_PHOTOS: 1, uploadError: null, identifyFailed: false, modeleAConfirmer: false,
      plateformesAffichees: ['vinted', 'leboncoin', 'beebs', 'ebay'], platformSupport: {},
      publishedSet: new Set(), queuedSet: new Set(), attentes: {}, oplaAccesDetail: null, ebayBloque: false,
      pausedPlatforms: [], plateformesAVenir: [], plateformesOuvertes: [], categorieFermee: PL.categorieFermee,
      selected: new Set(cochees), platformSessions: { vinted: true, leboncoin: true, beebs: true, ebay: true },
      ebayVoieApiReelle: false, ebayVoieApi: false, motifAVenir: () => '', motifsVerrouillage: {}, onCompleter: null, userId: null,
      motifEbay: '', boutonEbay: '', ouvrirPanneauEbay: null, motifPause: () => '', oplaVerdict: null, phraseEtat: () => '',
      motifSupport: () => '', basculer: noop, rien: null, addFiles: noop, removeFile: noop, handleReorderPreviews: noop,
      handleAddMorePhotos: noop, handleRemovePhoto: noop, handleReorderPhotos: noop, analysisHidden: true, notes: '', setNotes: noop,
      voirOffres: noop,
    };
    m.bilan = PL.bilanPlateformes(m);
    // Ce que la coque (StepperNouveau) tend à l'écran : le coût SEULEMENT avec la grille.
    const jauges = J.jaugesDuCompte(quotas);
    if (jauges) {
      const redaction = !m.platformListings || Boolean(m.copieManquante) || Boolean(m.retoucheARefaire);
      const besoin = { annonces: redaction ? 1 : 0, publications: m.bilan.cochees.length };
      m.cout = { ...J.coutPublication(besoin, jauges, { lang }), jauges, besoin, redaction };
    }
    return m;
  };
  const unite = (o) => renderToStaticMarkup(h(EOP.default, { m: mUnite(o) }));

  // ── 1. Interrupteur à 0 : rien de neuf ──────────────────────────────────────────────────────────────────────
  console.log('1. Interrupteur à 0 : chaque écran rend ce qu’il rendait');
  {
    const html = unite({ quotas: AUJ_FREE });
    const t = fr(html);
    ok(/Publier sur plusieurs plateformes ne coûte rien de plus\./.test(t) && /La rédaction compte 1 annonce, une seule fois\./.test(t),
      'unité : la phrase « ne coûte rien de plus » est encore là, comme aujourd’hui', t.slice(-600));
    ok(/Annonces ce mois-ci 5 restantes \/ 5/.test(t), 'unité : « Annonces ce mois-ci 5 restantes / 5 », comme aujourd’hui', t.slice(-600));
    ok(!/Cette publication utilisera|Il te restera|data-mini-jauge|data-cout|1 publication par plateforme cochée/.test(html + t), 'unité : aucune carte « coût », aucune mini-jauge');
    const premium = fr(unite({ quotas: AUJ_PREMIUM, fiche: true }));
    ok(/Retouches ce mois-ci 3 restantes \/ 5/.test(premium) && !/ne coûte rien de plus/.test(premium), 'unité, texte déjà rédigé : le compteur des retouches, sans la phrase de rédaction (comme aujourd’hui)', premium.slice(-500));
    // La coque : sans la grille, `m` est celui d'avant (aucune clé « cout »), le bouton aussi.
    ok(/const cout = jauges \? \{ \.\.\.coutPublication\(besoin, jauges, \{ lang: m\.lang \}\), jauges, besoin, redaction: redactionIA \} : null;/.test(SN)
      && /const mq = \{ \.\.\.m, quotas, retouchesEpuisees, bilan, rien, \.\.\.\(cout \? \{ cout \} : \{\}\) \};/.test(SN),
      'coque : le coût n’existe qu’avec la grille ; sans elle, mq = { ...m, quotas, retouchesEpuisees, bilan, rien }');
    ok(/if \(cout && !cout\.suffit && !disabled\) \{/.test(SN), 'coque : le bouton ne change que si une jauge manque (grille seulement)');

    // Le lot, écran 1, sans la grille.
    const donnees = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), item: { id: i + 1, title: `Article ${i + 1}`, photos: [PHOTO] }, jobs: [] }));
    const cibles = Object.fromEntries(donnees.map((d, i) => [d.id, ['vinted', ...(i >= 2 ? ['leboncoin'] : []), ...(i >= 4 ? ['beebs'] : [])]]));
    const resume = { vinted: { possibles: 12, dejaLa: 0 }, leboncoin: { possibles: 10, dejaLa: 2 }, beebs: { possibles: 8, dejaLa: 4 } };
    const partage0 = R.partagerQuota(donnees, { restantes: 40, consomme: () => true });
    ok(!('bloque' in partage0) && !('publications' in partage0) && partage0.maintenant.length === 12 && partage0.aConsommer === 12,
      'partagerQuota sans jauges : l’objet d’avant ({ maintenant, plusTard, aConsommer })', JSON.stringify(Object.keys(partage0)));
    const base = {
      en: false, lang: 'fr', userId: 'u1', donnees, resume, choix: ['vinted', 'leboncoin', 'beebs'], basculer: noop, sessions: {}, pauses: {},
      ebayBloque: false, ebayParServeur: false, ebayEtat: null, quotas: AUJ_PREMIUM, restantes: 40, remise: REMISE_ISO,
      partage: partage0, annoncesPrevues: 30, duree: '≈ 40 min', extensionNeverSeen: false, extensionLastSeenAt: new Date().toISOString(),
      fichesLues: true, boutiqueVinted: null, depopAAutoriser: false, mur: null,
    };
    const lot0 = renderToStaticMarkup(h(LOT.EcranPlateformes, base));
    const lot0b = renderToStaticMarkup(h(LOT.EcranPlateformes, { ...base, grille: null }));
    ok(lot0 === lot0b, 'lot : grille={null} rend exactement l’écran sans la prop');
    ok(/30 annonces à créer/.test(fr(lot0)) && /un article publié sur plusieurs plateformes compte pour un\./.test(fr(lot0)),
      'lot : « 30 annonces à créer » et « … compte pour un », comme aujourd’hui', fr(lot0));
    const partageMur0 = R.partagerQuota(donnees, { restantes: 5, consomme: () => true });
    const mur0 = renderToStaticMarkup(h(LOT.EcranPlateformes, { ...base, quotas: AUJ_FREE, restantes: 5, partage: partageMur0, annoncesPrevues: 9,
      mur: { palierVise: 'premium', quotaVise: 40, onMonter: noop, renvoiBoutique: null, essaiAchat: false } }));
    ok(/Ton quota ne suffit pas pour tout le lot/.test(fr(mur0)) && /Passer à Premium — 40 articles par mois, sur toutes tes plateformes/.test(fr(mur0))
      && /que ton quota permet/.test(fr(mur0)) && !/data-mur-jauge|data-cout/.test(mur0), 'lot : le mur d’avant (« Ton quota ne suffit pas… », « Passer à Premium — 40 articles par mois… »)', fr(mur0));
    ok(R.libelleEnvoiDuLot({ nPrets: 12, publications: 30, jauges: null }) === null
      && /: \(en \? `Send \$\{annoncesPretes\} listing\$\{annoncesPretes > 1 \? "s" : ""\}` : `Envoyer \$\{annoncesPretes\} annonce\$\{annoncesPretes > 1 \? "s" : ""\}`\);/.test(lotSrc),
      'lot, écran 2 : sans la grille, « Envoyer N annonces » reste (libelleEnvoiDuLot rend null)');
    ok(R.libelleCtaDuLot({ partage: partage0, nbChoix: 3, jauges: null }) === null
      && /: \(en \? `Prepare \$\{annoncesPrevues\} listing\$\{annoncesPrevues > 1 \? "s" : ""\}` : `Préparer \$\{annoncesPrevues\} annonce\$\{annoncesPrevues > 1 \? "s" : ""\}`\);/.test(lotSrc),
      'lot : sans la grille, le bouton reste « Préparer N annonces » (libelleCtaDuLot rend null)');

    // La remontée en lot, sans la grille (et pour un illimité).
    const items = Array.from({ length: 12 }, (_, i) => ({ item: { id: i + 1, title: `Annonce ${i + 1}` }, prixActuel: 20, plateformes: ['vinted', 'leboncoin'], surEbay: false }));
    const feuille = (extra) => renderToStaticMarkup(h(ST.RepublishSheet, { lang: 'fr', items, prixUnitaire: null, multiOuverte: true, choixInitial: ['vinted', 'leboncoin'], onClose: noop, onConfirm: noop, ...extra }));
    const f0 = feuille({ repubMois: { restantes: 6, remise: '16 novembre' } });
    ok(/Ton mois gratuit en couvre encore 6 sur 24 \(remise à zéro le 16 novembre\)/.test(fr(f0)) && !/data-cout-remontee|Cette remontée utilisera/.test(f0),
      'remontée : la ligne « Ton mois gratuit en couvre encore 6 sur 24… » d’avant, aucune carte neuve', fr(f0).slice(-500));
    ok(feuille({ repubMois: { restantes: 6, remise: '16 novembre' }, jaugeRemontees: null }) === f0, 'remontée : jaugeRemontees={null} rend exactement la feuille d’avant');
    const stock = lire('src/tabs/StockTab.jsx');
    ok(/jaugeRemontees=\{\(\(\)=>\{const j=jaugesDuCompte\(quotas\)\?\.remontees;return j&&!j\.illimite\?\{\.\.\.j,remise:jourRemise\(quotas\?\.republication\?\.remise_le,lang==='en'\?'en':'fr'\)\}:null;\}\)\(\)\}/.test(stock),
      'remontée : la jauge n’est passée qu’avec la grille et un plafond (illimitées : null, rien de neuf)');
    ok(J.jaugesDuCompte(AUJ_FREE) === null && J.jaugesDuCompte({ ...etat('pro', [0, 120], [0, 1200]), republication: { mode: 'illimite' } }).remontees.illimite === true,
      'à 0, jaugesDuCompte rend null ; Pro avec la grille : remontées illimitées');
  }

  // ── 2. À 1 : la publication à l'unité (maquette 4.1) ───────────────────────────────────────────────────────
  console.log('2. À 1 : « Où publier ? »');
  {
    const free = etat('free', [0, 5], [0, 50]);
    const html = unite({ quotas: free });
    const t = fr(html);
    ok(/Cette publication utilisera 1 annonce et 3 publications\./.test(t), 'Free, nouvel article : « Cette publication utilisera 1 annonce et 3 publications. »', t);
    ok(/Il te restera 4 annonces et 47 publications ce mois-ci\./.test(t) && /<b class="num">4 annonces<\/b> et <b class="num">47 publications<\/b>/.test(html),
      '« Il te restera 4 annonces et 47 publications ce mois-ci. » (les nombres en gras)');
    ok(/1 annonce pour la rédaction par l'IA, 1 publication par plateforme cochée\./.test(t), 'la règle : « 1 annonce pour la rédaction par l’IA, 1 publication par plateforme cochée. »');
    ok(/data-mini-jauge="annonces"/.test(html) && /data-mini-jauge="publications"/.test(html) && /Annonces 4 sur 5/.test(t) && /Publications 47 sur 50/.test(t),
      'deux mini-jauges : « Annonces 4 sur 5 », « Publications 47 sur 50 »', t);
    ok(/width:80%[\s\S]{0,400}data-part="1"[^>]*width:20%/.test(html), 'la part qui va partir, au bout de la jauge (ambre pâle) : 80 % gardés, 20 % qui partent');
    ok(!/ne coûte rien de plus/.test(t) && !/Annonces ce mois-ci/.test(t), 'la phrase « ne coûte rien de plus » (fausse avec la grille) et l’ancien compteur disparaissent');
    ok(/Retouches ce mois-ci 3 restantes \/ 5/.test(t), 'le compteur des retouches IA (à côté du choix des photos) ne change pas');
    const deux = fr(unite({ quotas: free, cochees: ['vinted', 'leboncoin'] }));
    ok(/Cette publication utilisera 1 annonce et 2 publications\./.test(deux) && /Il te restera 4 annonces et 48 publications ce mois-ci\./.test(deux),
      'une case décochée : le coût suit (2 publications, 48 restantes)', deux);
    ok(/besoin = \{ annonces: redactionIA \? 1 : 0, publications: bilan\.cochees\.length \}/.test(SN), 'la coque compte les cases COCHÉES ET cochables (bilan.cochees), à chaque rendu');
    const redige = fr(unite({ quotas: free, fiche: true }));
    ok(/Cette publication utilisera 3 publications\./.test(redige) && /Ton texte est déjà rédigé : aucune annonce n'est utilisée\. Il te restera 47 publications ce mois-ci\./.test(redige)
      && /Annonces 5 sur 5/.test(redige), 'texte déjà rédigé : pas d’annonce dans la phrase, « Ton texte est déjà rédigé… », Annonces 5 sur 5', redige);
    const biz = etat('business', [40, null], [500, null]);
    const b = unite({ quotas: biz });
    ok(/Cette publication utilisera 1 annonce et 3 publications\./.test(fr(b)) && /Il te restera : <b class="num">illimité<\/b>\./.test(b)
      && /Annonces illimité/.test(fr(b)) && /Publications illimité/.test(fr(b)), 'Business : « Il te restera : illimité. », mini-jauges « illimité » (le mot, jamais une barre)', fr(b));
    const en = fr(unite({ quotas: free, lang: 'en' }));
    ok(/This publication will use 1 listing and 3 publications\./.test(en) && /You will have 4 listings and 47 publications left this month\./.test(en), 'en anglais aussi', en);

    // Le bouton du bas quand une jauge ne suffit pas (piedSiUneJaugeManque, exécutée).
    const src = extraireFonctionJs(SN, 'piedSiUneJaugeManque');
    const pied = new Function('nombre', 'motJauge', `${src}\nreturn piedSiUneJaugeManque;`)(J.nombre, J.motJauge);
    const coutDe = (q, besoin) => ({ ...J.coutPublication(besoin, J.jaugesDuCompte(q)), jauges: J.jaugesDuCompte(q), besoin });
    const plusAnnonce = coutDe(etat('free', [5, 5], [9, 50]), { annonces: 1, publications: 3 });
    const pA = pied(plusAnnonce, 3, 'fr', '16/11');
    ok(plusAnnonce.suffit === false && pA.cta === "Plus d'annonce ce mois-ci" && pA.raison === 'Tes 5 annonces du mois sont créées : elles reviennent le 16/11.' && pA.mur === 'annonces',
      'annonces épuisées : « Plus d’annonce ce mois-ci » avant l’appui, la raison, le lien du mur Annonces', JSON.stringify(pA));
    const peuPub = coutDe(etat('free', [0, 5], [48, 50]), { annonces: 1, publications: 3 });
    const pP = pied(peuPub, 3, 'fr', '16/11');
    ok(pP.cta === 'Il te reste 2 publications : décoche 1 plateforme' && pP.mur === null,
      'publications : il en reste 2 pour 3 cases → « Il te reste 2 publications : décoche 1 plateforme », sans mur (il mentirait)', JSON.stringify(pP));
    const zeroPub = coutDe(etat('premium', [0, 40], [400, 400]), { annonces: 0, publications: 2 });
    const pZ = pied(zeroPub, 2, 'fr', null);
    ok(pZ.cta === 'Plus de publication ce mois-ci' && pZ.raison === 'Tes 400 publications du mois sont faites.' && pZ.mur === 'publications',
      'publications faites : « Plus de publication ce mois-ci », « Tes 400 publications du mois sont faites. » (sans date inventée)', JSON.stringify(pZ));
    ok(coutDe(etat('free', [5, 5], [9, 50]), { annonces: 0, publications: 3 }).suffit === true, 'annonces épuisées mais texte déjà rédigé : rien ne bloque (ce qui est rédigé se publie toujours)');
    ok(/cta = p\.cta;\s*disabled = true;/.test(SN) && /data-lien-mur="annonces" onClick=\{\(\) => m\.voirOffres\("annonces", quotas\?\.annonces \?\? \{\}\)\}/.test(SN),
      'coque : le bouton gris dit la jauge AVANT l’appui ; le lien ouvre le mur Annonces (voirOffres du moteur)');
    // Le lien du mur Publications (jauge vide) : le geste du moteur, voirOffres('publications') → le mur Publications.
    ok(/\} else if \(p\.mur === "publications"\) \{\s*secondaire = \(\s*<button type="button" className="fsn-lien" data-lien-mur="publications" onClick=\{\(\) => m\.voirOffres\("publications", murDeLaJauge\("publications", quotas, \{ remise: m\.remiseAZero \?\? null \}\) \?\? \{\}\)\}>\s*\{en \? "More publications: see the plans" : "Plus de publications : voir les offres"\}/.test(SN),
      'publications faites : le lien « Plus de publications : voir les offres » ; il en reste moins que de cases (mur null) : aucun lien');
    const lps = lire('src/components/ListingPreviewScreen.jsx');
    ok(/voirOffres: \(geste, info = \{\}\) => \{\s*if \(geste === "publications"\) \{\s*const mur = murDeLaJauge\("publications", quotas, \{ remise: remiseAZero \?\? null \}\) \?\? \(info\?\.geste === "publications" \? info : null\);\s*if \(mur\) ouvrirQuotaModal\("quota_publications", \{ trigger: "quota_geste", targetTiers: \["premium", "pro"\], quotaInfo: mur \}, "clic"\);\s*return;\s*\}\s*ouvrirQuotaModal\(geste === "annonces" \? "quota_annonces" : "quota_retouche", \{/.test(lps),
      'moteur : voirOffres("publications") ouvre le mur Publications (murDeLaJauge), même chemin que les annonces ; annonces et retouches inchangés');
    const RM = await vite.ssrLoadModule('/src/reglages/refusEtMurs.js');
    const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
    const murP = RM.murDeLaJauge('publications', etat('premium', [0, 40], [400, 400]), { remise: '2026-12-01T09:00:00.000Z' });
    ok(murP?.geste === 'publications' && murP.plafond === 400 && murP.restantes === 0 && RM.murDeLaJauge('publications', AUJ_PREMIUM) === null,
      'murDeLaJauge(publications) : le mur avec la grille ; sans elle, null (rien ne s’ouvre)', JSON.stringify(murP));
    const feuilleOffres = texte(renderToStaticMarkup(h(CM.default, { isOpen: true, onClose: noop, onUpgrade: noop, lang: 'fr', userId: 'u1', isPremium: true, trigger: 'quota_geste', quotaInfo: murP, grille: true })));
    ok(/Tes 400 publications du mois sont faites\./.test(feuilleOffres), 'la feuille des offres ouverte ainsi est le mur Publications (« Tes 400 publications du mois sont faites. »)', feuilleOffres.slice(0, 300));
    const enA = pied(plusAnnonce, 3, 'en', '16/11');
    ok(enA.cta === 'No listings left this month' && /Your 5 listings for the month are created: they come back on 16\/11\./.test(enA.raison), 'en anglais aussi', JSON.stringify(enA));
  }

  // ── 3. À 1 : le lot (maquettes 4.2 et 4.3) ─────────────────────────────────────────────────────────────────
  console.log('3. À 1 : la publication en lot');
  {
    const donnees = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), item: { id: i + 1, title: `Article ${i + 1}`, photos: [PHOTO] }, jobs: [] }));
    const cibles3 = Object.fromEntries(donnees.map((d, i) => [d.id, ['vinted', ...(i >= 2 ? ['leboncoin'] : []), ...(i >= 4 ? ['beebs'] : [])]]));
    const cibles2 = Object.fromEntries(donnees.map((d) => [d.id, ['vinted', 'leboncoin']]));
    const partageDe = (q, cibles, consomme = () => true) => R.partagerQuota(donnees, { restantes: q.annonces.restantes, consomme, jauges: J.jaugesDuCompte(q), plateformes: (d) => cibles[d.id].length });
    const base = (q, partage, cibles, extra = {}) => ({
      en: false, lang: 'fr', userId: 'u1', donnees,
      resume: Object.keys(cibles).length && Object.values(cibles).some((c) => c.includes('beebs'))
        ? { vinted: { possibles: 12, dejaLa: 0 }, leboncoin: { possibles: 10, dejaLa: 2 }, beebs: { possibles: 8, dejaLa: 4 } }
        : { vinted: { possibles: 12, dejaLa: 0 }, leboncoin: { possibles: 12, dejaLa: 0 } },
      choix: Object.values(cibles).some((c) => c.includes('beebs')) ? ['vinted', 'leboncoin', 'beebs'] : ['vinted', 'leboncoin'],
      basculer: noop, sessions: {}, pauses: {}, ebayBloque: false, ebayParServeur: false, ebayEtat: null, quotas: q, restantes: q.annonces.restantes,
      remise: REMISE_ISO, partage, annoncesPrevues: partage.maintenant.reduce((n, d) => n + cibles[d.id].length, 0), duree: '≈ 40 min',
      extensionNeverSeen: false, extensionLastSeenAt: new Date().toISOString(), fichesLues: true, boutiqueVinted: null, depopAAutoriser: false,
      mur: partage.plusTard.length ? { palierVise: q.palier === 'free' ? 'premium' : 'pro', quotaVise: 40, onMonter: noop, renvoiBoutique: null, essaiAchat: false } : null,
      grille: { jauges: J.jaugesDuCompte(q), palier: q.palier === 'free' ? 'gratuit' : q.palier, configJauges: CLES_JAUGES, nbPlateformes: (id) => cibles[id]?.length ?? 0 },
      ...extra,
    });

    // 4.2 : un Premium, 12 articles, 3 plateformes (Vinted 12, Leboncoin 10, Beebs 8).
    const prem = etat('premium', [0, 40], [0, 400]);
    const p42 = partageDe(prem, cibles3);
    ok(p42.maintenant.length === 12 && p42.aConsommer === 12 && p42.publications === 30 && p42.bloque === null, 'partage à deux jauges : 12 articles, 12 annonces, 30 publications', JSON.stringify({ ...p42, maintenant: p42.maintenant.length, plusTard: p42.plusTard.length }));
    const h42 = renderToStaticMarkup(h(LOT.EcranPlateformes, base(prem, p42, cibles3)));
    const t42 = fr(h42);
    ok(/Ce lot utilisera 12 annonces et 30 publications\./.test(t42) && /Il te restera 28 annonces et 370 publications ce mois-ci\./.test(t42),
      '« Ce lot utilisera 12 annonces et 30 publications. » / « Il te restera 28 annonces et 370 publications ce mois-ci. »', t42);
    ok(/Un article sur 3 plateformes compte 1 annonce et 3 publications\. Un texte déjà rédigé ne prend pas d'annonce\./.test(t42), 'la règle des deux jauges');
    ok(/Annonces 28 sur 40/.test(t42) && /Publications 370 sur 400/.test(t42), 'mini-jauges : 28 sur 40, 370 sur 400');
    ok(!/compte pour un/.test(t42) && !/annonces à créer/.test(t42) && !/data-mur-jauge/.test(h42), '« un article publié sur plusieurs plateformes compte pour un » disparaît ; pas de mur');
    ok(/Avec ton ordinateur allumé : ≈ 40 min/.test(t42), 'la durée reste dite');
    ok(R.libelleCtaDuLot({ partage: p42, nbChoix: 3, jauges: J.jaugesDuCompte(prem) }) === 'Préparer 30 publications'
      && R.libelleCtaDuLot({ partage: p42, nbChoix: 3, jauges: J.jaugesDuCompte(prem), lang: 'en' }) === 'Prepare 30 publications',
      '« Préparer 30 publications » (le mot « annonce » appartient à la jauge IA)');
    ok(/if \(fiches != null && quotas != null\) cta = libelleCtaDuLot\(\{ partage, murActif, nbChoix: choix\.length, jauges: jaugesLot, lang \}\) \?\? cta;/.test(lotSrc),
      'le pied du lot lit libelleCtaDuLot (null sans la grille : le libellé d’avant)');
    const dejaRediges = partageDe(prem, cibles3, (d) => Number(d.id) > 4);
    ok(dejaRediges.aConsommer === 8 && dejaRediges.publications === 30, 'un texte déjà rédigé ne prend pas d’annonce (4 rédigés → 8 annonces)');

    // 4.3 : un Free, 5 annonces, 12 articles sur 2 plateformes → bloqué par les ANNONCES.
    const free = etat('free', [0, 5], [9, 50]);
    const p43 = partageDe(free, cibles2);
    ok(p43.maintenant.length === 5 && p43.plusTard.length === 7 && p43.bloque === 'annonces' && p43.publications === 10, 'Free, 5 annonces : 5 maintenant, 7 plus tard, bloqués par les annonces', JSON.stringify({ k: p43.maintenant.length, p: p43.plusTard.length, b: p43.bloque }));
    const h43 = renderToStaticMarkup(h(LOT.EcranPlateformes, base(free, p43, cibles2)));
    const t43 = fr(h43);
    ok(/data-mur-jauge="annonces"/.test(h43) && /Ton plan Free ne couvre pas tout le lot/.test(t43), 'le mur : « Ton plan Free ne couvre pas tout le lot », jauge annonces', t43);
    ok(/Il te reste 5 annonces ce mois-ci : 5 articles peuvent partir maintenant\. Les 7 autres restent dans ton stock, à publier dès le 16 novembre\./.test(t43),
      '« Il te reste 5 annonces ce mois-ci : 5 articles peuvent partir maintenant. Les 7 autres restent dans ton stock, à publier dès le 16 novembre. »', t43);
    ok(/Passer Premium : 40 annonces et 400 publications par mois/.test(t43), 'le bouton chiffre le palier visé sur les deux jauges (coin_config, clés jauge_*)');
    ok(/Ou continue avec les 5 articles que ton plan permet : le bouton du bas\. Rien n'est perdu\./.test(t43), '« Ou continue avec les 5 articles que ton plan permet… Rien n’est perdu. » reste');
    ok(/Ces 5 articles utiliseront 5 annonces et 10 publications\./.test(t43) && /Il te restera 0 annonce et 31 publications ce mois-ci\./.test(t43)
      && /Annonces 0 sur 5/.test(t43) && /Publications 31 sur 50/.test(t43), 'la carte du compte sous le mur : « Ces 5 articles utiliseront… », 0 annonce et 31 publications', t43);
    ok(!/Ton quota ne suffit pas|articles par mois, sur toutes tes plateformes|que ton quota permet/.test(t43), 'l’ancien mur ne s’affiche plus avec la grille');
    ok(R.libelleCtaDuLot({ partage: p43, murActif: true, nbChoix: 2, jauges: J.jaugesDuCompte(free) }) === null
      && /\? \(en \? `Continue with \$\{n\} item\$\{n > 1 \? "s" : ""\}` : `Continuer avec \$\{n\} article\$\{n > 1 \? "s" : ""\}`\)/.test(lotSrc),
      'mur là : le bouton du bas reste « Continuer avec 5 articles »');

    // Bloqué par les PUBLICATIONS : un Premium à 14 publications, 12 articles sur 2 plateformes.
    const premPeu = etat('premium', [0, 40], [386, 400]);
    const pPub = partageDe(premPeu, cibles2);
    ok(pPub.maintenant.length === 7 && pPub.bloque === 'publications' && pPub.publications === 14, 'Premium, 14 publications : 7 articles, bloqués par les publications');
    const tPub = fr(renderToStaticMarkup(h(LOT.EcranPlateformes, base(premPeu, pPub, cibles2))));
    ok(/Ton plan Premium ne couvre pas tout le lot/.test(tPub) && /Il te reste 14 publications : 7 articles sur 2 plateformes peuvent partir maintenant\. Les 5 autres restent dans ton stock, à publier dès le 16 novembre\./.test(tPub),
      '« Il te reste 14 publications : 7 articles sur 2 plateformes peuvent partir maintenant… »', tPub);
    ok(/Passer Pro : 120 annonces et 1 200 publications par mois/.test(tPub), 'Premium → « Passer Pro : 120 annonces et 1 200 publications par mois »', tPub);
    ok(R.boutonPalierDuLot('business', CLES_JAUGES) === 'Passer Business : annonces et publications illimitées', 'Business visé : « annonces et publications illimitées » (le mot, jamais un faux chiffre)');
    // Ce qui est déjà rédigé passe toujours, même annonces épuisées (le mur Annonces le promet).
    const vide = etat('free', [5, 5], [0, 50]);
    const pVide = R.partagerQuota(donnees, { restantes: 0, consomme: (d) => Number(d.id) % 2 === 0, jauges: J.jaugesDuCompte(vide), plateformes: () => 2 });
    ok(pVide.maintenant.length === 6 && pVide.maintenant.every((d) => Number(d.id) % 2 === 1) && pVide.bloque === 'annonces',
      'annonces épuisées : les 6 textes déjà rédigés partent quand même, l’ordre de la sélection est gardé');
    ok(R.libelleCtaDuLot({ partage: R.partagerQuota(donnees, { restantes: 0, consomme: () => true, jauges: J.jaugesDuCompte(vide), plateformes: () => 2 }), nbChoix: 2, jauges: J.jaugesDuCompte(vide) }) === "Plus d'annonce ce mois-ci",
      'rien ne tient : le bouton nomme la jauge qui manque');

    // Business : tout part, « illimité ».
    const biz = etat('business', [40, null], [500, null]);
    const pBiz = partageDe(biz, cibles3);
    const tBiz = fr(renderToStaticMarkup(h(LOT.EcranPlateformes, base(biz, pBiz, cibles3))));
    ok(pBiz.maintenant.length === 12 && /Ce lot utilisera 12 annonces et 30 publications\./.test(tBiz) && /Il te restera : illimité\./.test(tBiz) && /Annonces illimité/.test(tBiz),
      'Business : tout le lot, « Il te restera : illimité. »', tBiz);
    ok(/Your Free plan doesn't cover the whole batch/.test(fr(renderToStaticMarkup(h(LOT.EcranPlateformes, { ...base(free, p43, cibles2), en: true, lang: 'en' })))), 'le mur en anglais aussi');

    // Le journal du mur garde ses noms, avec la jauge qui bloque.
    ok(/journaliser\("lot_mur_quota_affiche", metaMur\(\)\)/.test(lotSrc) && /jauge: partage\.bloque \?\? null,/.test(lotSrc), 'lot_mur_quota_affiche / _choix : mêmes noms, metadata.jauge en plus');
    ok(/\.in\("key", \["quota_annonces_premium", "quota_annonces_pro", "quota_annonces_business", \.\.\.CLES_JAUGES_PALIERS\]\)/.test(lotSrc), 'la lecture de coin_config de l’écran prend aussi les clés jauge_*');

    // Le refus d'un article à l'envoi → « Reste au stock », la phrase du serveur, aucune modale. Le CODE vient du
    // moteur (publishErrorCode, posé à côté de publishError), comme platformErrorCode === 'quota_annonces'.
    ok(/\} else if \(jaugesLot && REFUS_DE_JAUGE\.has\(mm\?\.publishErrorCode\)\) \{[\s\S]{0,400}majEtat\(id, \{ phase: "quota", raison: mm\.publishError \|\| null \}\);/.test(lotSrc)
      && /const REFUS_DE_JAUGE = new Set\(\["quota_publications_atteint", "garde_fou_jour"\]\);/.test(lotSrc),
      'envoi (grille seulement) : quota_publications_atteint / garde_fou_jour → phase « quota » avec la phrase du serveur');
    ok(!/Proxy|observerRefusPublication|surRefusPublication|refusServeurRef/.test(lotSrc) && /userId=\{userId\}\s*supabase=\{supabase\}/.test(lotSrc),
      'plus de Proxy : le moteur du lot reçoit le client supabase tel quel');
    const lps = lire('src/components/ListingPreviewScreen.jsx');
    ok(/const \[publishErrorCode, setPublishErrorCode\] = useState\(null\);/.test(lps)
      && /async function handlePublish\(\) \{\s*if \(!selected\.size\) return;\s*setPublishErrorCode\(null\);/.test(lps)
      && /if \(pubRes\?\.allowed === false\) \{\s*setPublishing\(false\);\s*setPublishErrorCode\(typeof pubRes\.reason === "string" \? pubRes\.reason : null\);/.test(lps)
      && /publishErrorCode,\s*\n\s*ctaLabel: step === 3/.test(lps),
      'moteur : publishErrorCode = pubRes.reason du refus (remis à null à chaque publication), exposé à côté de publishError');
    const moteur = lotSrc.slice(lotSrc.indexOf('<ListingPreviewScreen'), lotSrc.indexOf('/>', lotSrc.indexOf('<ListingPreviewScreen')));
    ok(!/quotas=/.test(moteur) && !/refusEtMurs/.test(lotSrc), 'le moteur du lot ne reçoit toujours pas quotas : aucune modale d’offres dans le lot');

    // L'écran 2 et la fin : « publications » là où « annonce » veut dire une mise en ligne (grille seulement).
    const jP = J.jaugesDuCompte(prem);
    ok(R.libelleEnvoiDuLot({ nPrets: 12, nACompleter: 0, publications: 30, jauges: jP }) === 'Envoyer 30 publications'
      && R.libelleEnvoiDuLot({ nPrets: 5, nACompleter: 2, publications: 12, jauges: jP }) === 'Envoyer les 5 prêts (12 publications)'
      && R.libelleEnvoiDuLot({ nPrets: 1, nACompleter: 3, publications: 1, jauges: jP }) === "Envoyer l'article prêt (1 publication)"
      && R.libelleEnvoiDuLot({ nPrets: 12, publications: 30, jauges: jP, lang: 'en' }) === 'Send 30 publications',
      '« Envoyer 30 publications », « Envoyer les 5 prêts (12 publications) »');
    ok('Envoyer 30 publications'.replace(/^Envoyer/, 'Programmer') === 'Programmer 30 publications'
      && /cta = libelleEnvoiDuLot\(\{ nPrets: prets\.length, nACompleter: aCompleter\.length, publications: annoncesPretes, jauges: jaugesLot, lang \}\) \?\? cta;\s*\/\/ \(26\/10, D4\) Programmées : le geste dit ce qu'il fait\.\s*if \(prets\.length && programme\) cta = cta\.replace\(\/\^Envoyer\/, "Programmer"\)/.test(lotSrc),
      'programmées : « Programmer 30 publications » (le remplacement d’avant s’applique après)');
    ok(R.libelleEnvoiDuLot({ nPrets: 0, publications: 0, jauges: jP }) === null, 'rien de prêt : le libellé d’avant (« Réponds aux questions… »)');
    const lotFin = { id: 'l1', le: new Date().toISOString(), ids: ['1', '2'], plateformes: ['vinted', 'leboncoin'] };
    const etatsFin = { 1: { phase: 'envoye', envoyees: ['vinted', 'leboncoin'] }, 2: { phase: 'quota', raison: 'Pause de sécurité jusqu\'à minuit : tu as fait 300 publications aujourd\'hui.' } };
    const parIdFin = new Map(donnees.slice(0, 2).map((d) => [d.id, d]));
    const finProps = { en: false, L: { envoye: 'En file', quota: 'Reste au stock' }, lot: lotFin, etats: etatsFin, lignes: ['1', '2'], parId: parIdFin, extensionNeverSeen: false, ebayParServeur: false, onOuvrirArticle: noop, remise: REMISE_ISO };
    const fin0 = renderToStaticMarkup(h(LOT.EcranFin, finProps));
    ok(fin0 === renderToStaticMarkup(h(LOT.EcranFin, { ...finProps, grille: false })) && /2 annonces en file/.test(fr(fin0)),
      'fin, à 0 : « 2 annonces en file », comme aujourd’hui (grille={false} = sans la prop)');
    const fin1 = fr(renderToStaticMarkup(h(LOT.EcranFin, { ...finProps, grille: true })));
    ok(/2 publications en file/.test(fin1) && !/annonces en file/.test(fin1) && /Pause de sécurité jusqu'à minuit : tu as fait 300 publications aujourd'hui\. Reste au stock/.test(fin1),
      'fin : « 2 publications en file » ; l’article refusé par le garde-fou « Reste au stock », avec la phrase du serveur', fin1);
    ok(/2 listings queued/.test(texte(renderToStaticMarkup(h(LOT.EcranFin, { ...finProps, en: true, grille: false })))) && /2 publications queued/.test(texte(renderToStaticMarkup(h(LOT.EcranFin, { ...finProps, en: true, grille: true })))),
      'fin en anglais : « listings » sans la grille, « publications » avec');
    ok(/grille=\{Boolean\(jaugesLot\)\} \/>/.test(lotSrc), 'l’écran de fin ne reçoit la grille que si quotas_etat la rend');
  }

  // ── 4. À 1 : avant une remontée en lot (maquette 4.4) ──────────────────────────────────────────────────────
  console.log('4. À 1 : avant une remontée en lot');
  {
    const items = Array.from({ length: 12 }, (_, i) => ({ item: { id: i + 1, title: `Annonce ${i + 1}` }, prixActuel: 20, plateformes: ['vinted', 'leboncoin'], surEbay: false }));
    const feuille = (jauge, extra = {}) => renderToStaticMarkup(h(ST.RepublishSheet, {
      lang: 'fr', items, prixUnitaire: null, multiOuverte: true, choixInitial: ['vinted', 'leboncoin'], onClose: noop, onConfirm: noop,
      repubMois: { restantes: jauge.restantes, remise: '16 novembre' }, jaugeRemontees: { ...jauge, remise: '16 novembre' }, ...extra,
    }));
    const assez = J.jaugesDuCompte(etat('free', [0, 5], [0, 50])).remontees;
    const ha = feuille(assez);
    const ta = fr(ha);
    ok(/data-cout-remontee="assez"/.test(ha) && /Cette remontée utilisera 24 remontées\./.test(ta) && /12 annonces sur 2 plateformes \(Vinted et Leboncoin\)\. Il t'en restera 6 ce mois-ci\./.test(ta),
      '« Cette remontée utilisera 24 remontées. » / « 12 annonces sur 2 plateformes (Vinted et Leboncoin). Il t’en restera 6 ce mois-ci. »', ta.slice(-700));
    ok(/Remontées 6 sur 30/.test(ta) && !/Gratuit : il t’en restera/.test(ta), 'mini-jauge 6 sur 30 ; la ligne « Gratuit » d’avant laisse la place');
    const court = { ...assez, consommes: 24, restantes: 6 };
    const tc = fr(feuille(court));
    ok(/Il te reste 6 remontées ce mois-ci\./.test(tc) && /Ce lot en demande 24 : 12 annonces sur 2 plateformes \(Vinted et Leboncoin\)\. Elles reviennent le 16 novembre\./.test(tc)
      && /Remontées 0 sur 30/.test(tc), 'il en manque : « Il te reste 6 remontées ce mois-ci. », combien le lot en demande — sans promettre lesquelles partent', tc.slice(-700));
    ok(!/Les 3 annonces les plus anciennes|attendent le/.test(tc), 'le lot ne sait pas remonter un sous-ensemble choisi : aucune phrase ne le promet');
    ok(/Republier 24 annonces \(12 articles sur 2 plateformes\)/.test(tc), 'le bouton et ce qui part ne changent pas (24 paires, comme avant)');
    const solo = fr(renderToStaticMarkup(h(ST.RepublishSheet, { lang: 'fr', items: items.slice(0, 1), prixUnitaire: null, multiOuverte: true, choixInitial: ['vinted'], onClose: noop, onConfirm: noop,
      repubMois: { restantes: 6, remise: '16 novembre' }, jaugeRemontees: { ...court, remise: '16 novembre' } })));
    ok(!/Cette remontée utilisera|Ce lot en demande/.test(solo) && /Gratuit : il t’en restera 5 ce mois-ci/.test(solo), 'à l’unité, la feuille garde sa ligne d’avant (la carte est celle du lot)', solo.slice(-400));
    const stock = lire('src/tabs/StockTab.jsx');
    const lancer = stock.slice(stock.indexOf('async function lancerRepublicationLot('), stock.indexOf('async function relancerRepublication('));
    ok(lancer.length > 1000 && !/jaugeRemontees|nombreJauge|MiniJauge/.test(lancer), 'la CADENCE est intouchée : lancerRepublicationLot ne lit rien de neuf');
  }
} finally {
  await vite.close();
}

console.log(`\n${rouges === 0 ? '✓' : '✗'} cout-publication : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
