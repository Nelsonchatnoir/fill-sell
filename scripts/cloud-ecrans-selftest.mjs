// Autotest des ÉCRANS de l'option « Sans ordinateur » (Cloud) — 04/10/2026.
//
//     npm run selftest:cloud-ecrans
//     (node --import ./scripts/loader-ext.mjs scripts/cloud-ecrans-selftest.mjs)
//
// CONCEPTION, NON LIVRÉE. Décisions FINALES de Nico (04/10 soir) comprises :
// essai de 7 jours carte demandée ; option prise SEULE sur un compte Free
// (quotas Free gardés) ou en plus d'une formule ; arrêt immédiat pendant
// l'essai, en fin de période une fois payée ; résilier la formule n'arrête pas
// l'option ; rappel de la veille dans l'app ET par e-mail.
//
// Ce qu'il prouve, sans réseau ni base :
//   1. le DRAPEAU est baissé par défaut, et il ne peut pas se lever sans la
//      sortie (« Arrêter l'option ») ni sans que l'hôte lise le choix ;
//   2. drapeau baissé, RIEN ne change : la feuille des formules, l'étape
//      « extension », le mur, la carte du Stock et les Réglages (confirmation
//      de résiliation comprise) rendent exactement ce qu'ils rendaient, et
//      onUpgrade garde son appel à un argument ;
//   3. PostgREST tout-ou-rien : les colonnes Cloud ne sont lues QUE par
//      useCloudProfil, jamais dans le select de `profiles` d'App.jsx ;
//   4. une seule palette : cloud/theme.js = la palette `C` de ConversionModal ;
//   5. les MOTS : fr et en ont les mêmes clés ; libellé imposé exact ; carte
//      demandée ; « FillSell publie tes annonces depuis ses serveurs » ; plus
//      jamais « formule payante » pour l'option ; aucune plateforme bloquée,
//      ni Opla, ni « pépites », ni « plafond », ni jargon ;
//   5 bis. AUCUNE DATE NI AUCUN QUOTA ÉCRIT EN DUR dans src/cloud/ ;
//   6. les règles d'affichage (cloud/regles.js) ;
//   7. les écrans Cloud, RENDUS (Vite SSR + react-dom/server), état par état.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => {
  if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 400)}` : ''}`); }
};
const lignesDeCode = (texte) => texte.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*');
}).join('\n');
const INTERDITS = [/Beebs/i, /Opla/i, /p[ée]pite/i, /plafond/i, /\bproxy\b/i, /\bIP\b/, /serveur Cloud/i, /navigateur headless/i,
  /formule payante/i, /fait tourner l.extension/i];
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');
const net = (s) => String(s).replace(NBSP, ' ');

// ── 1. Le drapeau ────────────────────────────────────────────────────────────
const cfg = await charger('src/config/cloudOffer.js');
// ⚠️ FIL-PIÈGE VOLONTAIRE : ces deux lignes tombent le jour où le drapeau se
// lève. C'est voulu — ce jour-là, on relit les cinq conditions de
// config/cloudOffer.js, puis on retire ces deux lignes (et seulement elles :
// les contrôles « drapeau levé » ci-dessous prennent le relais).
verifier(cfg.CLOUD_OFFER_ENABLED === false, 'le drapeau Cloud est BAISSÉ (conception, non livrée — fil-piège, cf. ci-dessus)');
verifier(cfg.cloudOfferVisible('n-importe-qui') === false && cfg.cloudOfferVisible(null) === false, 'cloudOfferVisible() répond non à tout le monde');
const app = lignesDeCode(lire('src/App.jsx'));
const montageHote = app.match(/<HoteCloud[\s\S]*?\/>/)?.[0] ?? '';
verifier(Boolean(montageHote), 'App monte HoteCloud (le seul point de montage Cloud)');
if (cfg.CLOUD_OFFER_ENABLED) {
  verifier(/actions=\{[\s\S]*arreter/.test(montageHote), 'drapeau levé : HoteCloud reçoit actions.arreter (on ne vend pas un essai qu’on ne sait pas arrêter)', montageHote);
  verifier(/onUpgrade=\{\(tier,\s*\w+\)/.test(app), 'drapeau levé : l’hôte de la feuille lit le 2e argument d’onUpgrade (le choix Cloud)');
  verifier(/onCloudSeul=\{/.test(app), 'drapeau levé : l’hôte de la feuille sait prendre Free + Sans ordinateur (onCloudSeul)');
}

// ── 2. Drapeau baissé : l'appel d'onUpgrade reste à un argument ─────────────
const modale = lignesDeCode(lire('src/components/ConversionModal.jsx'));
verifier(/const offreCloud = cloudVisible \? offreCloudPourModale\(lectureCloud\) : null;/.test(modale), 'feuille : sans drapeau, offreCloud vaut null');
verifier(/if \(choixCloud\) onUpgrade\(tier, \{ cloud: avecCloud \}\);\s*else onUpgrade\(tier\);/.test(modale), 'feuille : le choix Cloud ne part QUE si l’interrupteur est montré, sinon onUpgrade(tier) comme avant');
verifier(/const choixCloud = interrupteurMontre;/.test(modale) && /const interrupteurMontre = offreCloud\?\.mode === 'interrupteur' && !ajoutCloudPossible;/.test(modale), 'feuille : « interrupteur montré » dérive d’offreCloud (null sans drapeau)');
verifier(!/onUpgrade\(\s*(palier|rangCourant|palierDesDrapeaux)/.test(modale), 'feuille : jamais onUpgrade(palier actuel) (un second abonnement)');
verifier(!/onUpgrade\(\s*['"]free['"]/.test(modale), 'feuille : jamais onUpgrade(\'free\') (Free + Sans ordinateur passe par onCloudSeul)');
verifier(/const voieFree = interrupteurMontre && !isPremium && typeof onCloudSeul === 'function';/.test(modale), 'feuille : la voie Free + Sans ordinateur exige l’interrupteur montré, un compte Free et un hôte qui sait la prendre');
verifier(/quotaFree=\{K\.quota_annonces_free\}/.test(modale), 'feuille : le nombre d’annonces du plan Free vient de coin_config (K.quota_annonces_free)');

// ── 3. PostgREST tout ou rien ────────────────────────────────────────────────
{
  const selectsProfils = [...app.matchAll(/from\('profiles'\)\.select\('([^']*)'\)/g)].map((x) => x[1]);
  verifier(selectsProfils.length > 3, 'App : les selects de profiles sont bien relus', selectsProfils.length);
  verifier(selectsProfils.every((s) => !/is_cloud|cloud_essai|cloud_periode|cloud_arret/.test(s)), 'App : aucune colonne Cloud dans un select de profiles (il viderait l’app tant que la migration n’est pas appliquée)', selectsProfils.join(' | '));
  const fautifs = [];
  const parcourir = (d) => {
    for (const e of fs.readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) parcourir(p);
      else if (/\.(jsx?|mjs)$/.test(e.name) && p !== 'src/cloud/useCloudProfil.js' && p !== 'src/utils/palier.js') {
        if (/is_cloud|cloud_essai_debut|cloud_essai_fin|cloud_essai_arrete|cloud_periode_fin|cloud_arret_fin_periode/.test(lignesDeCode(lire(p)))) fautifs.push(p);
      }
    }
  };
  parcourir('src');
  verifier(fautifs.length === 0, 'les colonnes Cloud ne sont lues QUE par useCloudProfil (et calculées par palier.js)', fautifs.join(' · '));
  const hook = lire('src/cloud/useCloudProfil.js');
  verifier(/\.select\(COLONNES_CLOUD\)/.test(hook) && /etat: 'echec'/.test(hook), 'useCloudProfil : requête À PART, et un échec vaut « echec » (rien d’affiché)');
  verifier(['cloud_essai_arrete', 'cloud_periode_fin', 'cloud_arret_fin_periode'].every((c) => hook.includes(c)), 'useCloudProfil : lit aussi l’essai arrêté, la fin de période et l’arrêt prévu (décisions du 04/10 soir)');
}

// ── 4. Une seule palette ─────────────────────────────────────────────────────
{
  const extraire = (src) => {
    const bloc = src.match(/const C = \{([\s\S]*?)\};/)?.[1] ?? '';
    return Object.fromEntries([...bloc.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)].map((x) => [x[1], x[2].toUpperCase()]));
  };
  const cModale = extraire(lire('src/components/ConversionModal.jsx'));
  const cCloud = extraire(lire('src/cloud/theme.js'));
  verifier(Object.keys(cModale).length >= 10 && JSON.stringify(cModale) === JSON.stringify(cCloud), 'cloud/theme.js reprend À L’IDENTIQUE la palette C de ConversionModal', `${JSON.stringify(cModale)} ≠ ${JSON.stringify(cCloud)}`);
}

// ── 5. Les mots ──────────────────────────────────────────────────────────────
const { textesCloud } = await charger('src/cloud/textes.js');
const FR = textesCloud('fr');
const EN = textesCloud('en');
// Toutes les phrases, fonctions comprises (appelées avec des valeurs types).
const toutes = (T) => Object.values(T).flatMap((v) => {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v;
  if (typeof v === 'function') {
    const r = [v('Premium', '10:00', 'Premium'), v(null, '10:00', null), v(3, 7), v('demain', '10:00'), v('aujourdhui', '10:00'), v('17 octobre', 5)];
    return r.flatMap((x) => (Array.isArray(x) ? x.flatMap((e) => (typeof e === 'object' ? [e.quand, e.quoi] : [e])) : [x]));
  }
  return [];
}).map((s) => net(s));
{
  verifier(JSON.stringify(Object.keys(FR).sort()) === JSON.stringify(Object.keys(EN).sort()), 'textes : fr et en ont les mêmes clés',
    Object.keys(FR).filter((k) => !(k in EN)).concat(Object.keys(EN).filter((k) => !(k in FR))).join(', '));
  verifier(net(FR.libelleInterrupteur) === 'Sans ordinateur · +20 €/mois', 'le libellé IMPOSÉ : « Sans ordinateur · +20 €/mois »', FR.libelleInterrupteur);
  verifier(NBSP.test(FR.libelleInterrupteur), 'le prix ne se coupe pas en fin de ligne (« 20 € » insécable)');
  for (const [nom, T] of [['fr', FR], ['en', EN]]) {
    const phrases = toutes(T);
    for (const motif of INTERDITS) {
      const f = phrases.filter((p) => motif.test(p));
      verifier(f.length === 0, `textes ${nom} : jamais ${motif}`, f.join(' | '));
    }
  }
  const fr = toutes(FR).join(' ');
  verifier(!/\bvous\b/i.test(fr), 'textes fr : tutoiement, jamais « vous »');
  verifier(/Vinted et Leboncoin/.test(FR.ceQueCaFait) && /eBay part déjà sans ordinateur/.test(FR.ebayDeja), 'textes : Vinted et Leboncoin seulement ; eBay « déjà sans ordinateur »');
  verifier(FR.voieTexte.includes('FillSell publie tes annonces depuis ses serveurs') && FR.pageTexte.includes('FillSell publie tes annonces depuis ses serveurs'), 'la phrase imposée : « FillSell publie tes annonces depuis ses serveurs », partout');
  const frise = FR.frise('17 octobre').map((e) => ({ quand: net(e.quand), quoi: net(e.quoi) }));
  verifier(frise.length === 3 && /Carte demandée, rien n.est prélevé pour l.option/.test(frise[0].quoi) && frise[1].quand === '17 octobre' && /20 €\/mois/.test(frise[1].quoi)
    && /Réglages › Abonnement/.test(frise[2].quoi) && /la veille, dans l.app et par e-mail/.test(frise[2].quoi),
    'l’essai sans piège : carte demandée sans prélèvement, date de bascule, montant, sortie, rappel la veille (app + e-mail)', JSON.stringify(frise));
  verifier(/^Carte demandée, rien n.est prélevé pour l.option avant le 17 octobre\.$/.test(net(FR.carteDemandee('17 octobre'))), 'la carte demandée, dite là où l’essai se propose');
  const ff = FR.freeCloudFrise('17 octobre', 5).map((e) => net(`${e.quand} — ${e.quoi}`));
  verifier(/^Aujourd.hui — 0 €/.test(ff[0]) && /Pendant l.essai — Tes 5 annonces du plan Free/.test(ff[1]) && /^17 octobre — 20 €\/mois, sauf si tu l.arrêtes/.test(ff[2]), 'la frise Free (décision Nico) : 0 € / tes N annonces du plan Free / 20 €/mois sauf arrêt', ff.join(' | '));
  verifier(net(FR.freeCloudQuota(5)) === 'Avec Free + Sans ordinateur, tu restes à 5 annonces par mois.', '« Avec Free + Sans ordinateur, tu restes à N annonces par mois. »', FR.freeCloudQuota(5));
  verifier(!/\d/.test(net(FR.freeCloudQuota(null))), 'quota Free inconnu : aucun chiffre inventé', FR.freeCloudQuota(null));
  verifier(/tout de suite/.test(FR.arreterEssai('Premium')) && /rien n.est facturé/.test(FR.arreterEssai('Premium')) && /Ta formule Premium ne change pas/.test(FR.arreterEssai('Premium')), 'arrêter pendant l’essai : tout de suite, rien facturé, formule inchangée — dit AVANT le geste');
  verifier(/jusqu.au 31 octobre/.test(FR.arreterPaye('31 octobre')) && /fin de la période payée/.test(FR.arreterPaye(null)), 'arrêter une fois payée : elle tourne jusqu’à la fin de période (date quand elle est connue)');
  verifier(/^S.arrête le 31 octobre$/.test(FR.etatArretPrevu('31 octobre')), 'arrêt prévu : « S’arrête le [date] »');
  verifier(/continue/.test(FR.resiliationCloud) && /Free \+ Sans ordinateur/.test(FR.resiliationCloud) && /Arrêter aussi l.option/.test(FR.resiliationCloudLien), 'résilier la formule : l’option continue (Free + Sans ordinateur), lien pour l’arrêter aussi');
  verifier(/Demain/.test(FR.veilleTitre('demain', '10:00')) && /Aujourd.hui à 10:00/.test(FR.veilleTitre('aujourdhui', '10:00')), 'la veille : « Demain… » / « Aujourd’hui à 10:00… »');
  verifier(/elle passe à 20 €\/mois/.test(net(FR.veilleTexte('11 octobre', '07:30', null))) && /ton plan Free ne change pas/.test(FR.veilleNote(null)), 'la veille d’un compte Free : pas de « formule » inventée');
}

// ── 5 bis. Aucune date ni aucun quota écrit en dur ──────────────────────────
{
  const MOIS = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|January|February|March|April|May|June|July|August|September|October|November|December';
  const DATE_EN_DUR = [
    new RegExp(`\\b\\d{1,2}(er)?\\s+(${MOIS})\\b`, 'i'),
    new RegExp(`\\b(${MOIS})\\s+\\d{1,2}\\b`, 'i'),
    /\b20\d\d-\d\d-\d\d/,
    /['"`][^'"`\n]*\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b[^'"`\n]*['"`]/,
  ];
  const fichiers = fs.readdirSync(join(ROOT, 'src/cloud')).filter((f) => /\.(jsx?)$/.test(f)).map((f) => `src/cloud/${f}`);
  const fautes = [];
  for (const f of fichiers) {
    const code = lignesDeCode(lire(f)).split('\n').map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
    for (const m of DATE_EN_DUR) { const x = code.match(m); if (x) fautes.push(`${f} : « ${x[0]} »`); }
    const quota = code.match(/['"`][^'"`\n]*\b\d+\s?(annonces|listings)\b/);
    if (quota) fautes.push(`${f} : quota en dur « ${quota[0]} »`);
  }
  verifier(fichiers.length >= 10, 'src/cloud/ relu en entier', fichiers.join(', '));
  verifier(fautes.length === 0, 'aucune date ni aucun quota écrit en dur dans src/cloud/ (les dates viennent de l’essai réel ou de maintenant + 7 jours)', fautes.join(' | '));
  // Les phrases-fonctions reçoivent leur date en argument (le test leur passe
  // « 17 octobre ») ; une phrase FIXE ne doit porter ni date ni quota.
  const fixes = [...Object.values(FR), ...Object.values(EN)].filter((v) => typeof v === 'string').map(net);
  const datees = fixes.filter((p) => DATE_EN_DUR.some((m) => m.test(p)) || /\b\d+ (annonces|listings)\b/.test(p));
  verifier(fixes.length > 30 && datees.length === 0, 'aucune phrase fixe des textes ne porte de date ni de quota', datees.join(' | '));
  // Et une phrase-fonction appelée SANS date n'en invente pas une.
  const sansArg = [...Object.values(FR), ...Object.values(EN)].filter((v) => typeof v === 'function')
    .flatMap((f) => { const r = f(); return Array.isArray(r) ? r.flatMap((e) => (typeof e === 'object' ? [e.quand, e.quoi] : [e])) : [r]; }).map((s) => net(String(s)));
  const inventees = sansArg.filter((p) => DATE_EN_DUR.some((m) => m.test(p)));
  verifier(inventees.length === 0, 'aucune phrase-fonction n’invente une date', inventees.join(' | '));
}

// ── 6. Les règles d'affichage ────────────────────────────────────────────────
const R = await charger('src/cloud/regles.js');
const P = await charger('src/utils/palier.js');
{
  const n = Date.parse('2026-10-10T06:00:00Z'); // samedi 08:00 à Paris
  const c = (p) => P.cloudDuProfil(p, n);
  const ok_ = (cloud) => ({ etat: 'ok', cloud });
  verifier(R.offreCloudPourModale({ etat: 'lecture', cloud: null }) === null && R.offreCloudPourModale({ etat: 'echec', cloud: null }) === null && R.offreCloudPourModale(null) === null,
    'feuille : pas lu / lecture ratée → RIEN (jamais un interrupteur deviné)');
  verifier(JSON.stringify(R.offreCloudPourModale(ok_(c({})))) === JSON.stringify({ mode: 'interrupteur', essai: true }), 'feuille : compte Free neuf → interrupteur avec essai (l’option se prend seule)');
  const fini = { cloud_essai_debut: '2026-09-01T00:00:00Z', cloud_essai_fin: '2026-09-08T00:00:00Z' };
  verifier(JSON.stringify(R.offreCloudPourModale(ok_(c({ is_premium: true, ...fini })))) === JSON.stringify({ mode: 'interrupteur', essai: false }), 'feuille : essai déjà pris → interrupteur SANS essai');
  verifier(R.offreCloudPourModale(ok_(c({ is_pro: true, is_cloud: true }))).mode === 'deja_actif', 'feuille : option payée → « déjà actif », pas d’interrupteur');
  verifier(R.offreCloudPourModale(ok_(c({ is_cloud: true }))).mode === 'deja_actif' && c({ is_cloud: true }).avecFormule === false, 'feuille : Free + Sans ordinateur payée → « déjà actif » (plus jamais « en pause »)');
  verifier(R.voieCloud(ok_(c({}))).essai === true && R.voieCloud(ok_(c({ is_pro: true, is_cloud: true }))) === null && R.voieCloud({ etat: 'echec' }) === null, '2e voie : montrée seulement quand l’option peut être prise, et lue');
  verifier(R.quandFin('2026-10-11T05:30:00Z', n) === 'demain' && R.quandFin('2026-10-10T20:00:00Z', n) === 'aujourdhui' && R.quandFin('2026-10-15T05:00:00Z', n) === 'plus_tard' && R.quandFin('2026-10-09T05:00:00Z', n) === 'passe',
    'quandFin : jours calendaires de Paris (demain / aujourd’hui / plus tard / passé)');
  verifier(R.quandFin('2026-10-10T22:30:00Z', n) === 'demain', 'quandFin : 00:30 à Paris le lendemain = « demain », même si c’est encore le 10 en UTC');
  const essai = (fin, extra = {}) => c({ is_premium: true, cloud_essai_debut: new Date(Date.parse(fin) - 7 * 86400000).toISOString(), cloud_essai_fin: fin, ...extra });
  verifier(R.rappelVeilleDu(essai('2026-10-11T05:30:00Z'), n) === 'demain' && R.rappelVeilleDu(essai('2026-10-15T05:00:00Z'), n) === null && R.rappelVeilleDu(c({ is_pro: true, is_cloud: true }), n) === null,
    'la veille : seulement pendant un essai qui finit demain ou aujourd’hui');
  verifier(R.rappelVeilleDu(essai('2026-10-11T05:30:00Z', { cloud_essai_arrete: true }), n) === null, 'la veille : jamais pour un essai déjà arrêté');
  verifier(R.jourDEssai(essai('2026-10-15T05:00:00Z')) === 3 && R.jourDEssai(essai('2026-10-11T05:30:00Z')) === 7 && R.jourDEssai(c({})) === null, 'jour d’essai : J-5 = jour 3 sur 7, dernier jour = 7');
  verifier(R.dateLongue('2026-10-10T22:30:00Z', 'fr') === '11 octobre' && R.heureDe('2026-10-10T22:30:00Z', 'fr') === '00:30', 'dates écrites à l’heure de Paris (« 11 octobre », « 00:30 »)');
  verifier(R.dateLongue(R.finEssaiSiOnCommence(n), 'fr') === '17 octobre', 'un essai qui commence le 10 octobre bascule le 17 octobre');
}

// ── 7. Les écrans, rendus ────────────────────────────────────────────────────
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const portail = join(ROOT, 'scripts/lib/portail-en-place.mjs');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: portail }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const texte = (el) => net(renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ');
  const sansMotsInterdits = (t, quoi) => {
    for (const m of INTERDITS) verifier(!m.test(t), `${quoi} : jamais ${m}`, t.slice(0, 300));
  };
  const n = Date.parse('2026-10-10T06:00:00Z');
  const IC = await vite.ssrLoadModule('/src/cloud/InterrupteurCloud.jsx');
  const BR = await vite.ssrLoadModule('/src/cloud/BlocCloudReglages.jsx');
  const FE = await vite.ssrLoadModule('/src/cloud/FinEssaiCloud.jsx');
  const VO = await vite.ssrLoadModule('/src/cloud/VoieSansOrdinateur.jsx');
  const HO = await vite.ssrLoadModule('/src/cloud/HoteCloud.jsx');
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const SPA = await vite.ssrLoadModule('/src/reglages/SousPageAbonnement.jsx');
  const RT = await vite.ssrLoadModule('/src/reglages/textes.js');

  // ── 7a. Drapeau baissé : rien ne change ──────────────────────────────────
  if (!cfg.CLOUD_OFFER_ENABLED) {
    const modaleFree = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1' }));
    verifier(/Débloque tout FillSell\./.test(modaleFree) && /Passer Premium/.test(modaleFree), 'drapeau baissé : la feuille des formules se rend comme avant', modaleFree.slice(0, 200));
    verifier(!/Sans ordinateur|\+ 20 €|7 jours d.essai/.test(modaleFree), 'drapeau baissé : aucune trace de l’option dans la feuille');
    const modaleCloud = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1', trigger: 'cloud', onAjouterCloud() {}, onCloudSeul() {} }));
    verifier(!/Sans ordinateur|Vends même ordinateur éteint/.test(modaleCloud), 'drapeau baissé : même ouverte « cloud » avec des hôtes d’ajout et de Free + option, rien de Cloud');
    verifier(texte(h(VO.default, { lang: 'fr', userId: 'u1', origine: 'test' })) === '' && texte(h(VO.default, { lang: 'fr', variante: 'page', origine: 'test' })) === '', 'drapeau baissé : la 2e voie ne rend rien (y compris page /extension)');
    verifier(texte(h(HO.default, { userId: 'u1', lang: 'fr', onOuvrirOffres() {} })) === '', 'drapeau baissé : HoteCloud ne rend rien');
    const EP = await vite.ssrLoadModule('/src/components/ExtensionPitchScreen.jsx');
    const mur = texte(h(EP.default, { lang: 'fr', onClose() {}, userId: 'u1', ebaySansOrdinateur: { relie: false, onRelier() {} } }));
    verifier(mur.includes("tes annonces eBay pourront partir depuis ton téléphone. Vinted, Leboncoin et Beebs demandent l'extension sur un ordinateur."), 'drapeau baissé : la phrase eBay du mur, mot pour mot', mur.slice(0, 600));
    verifier(!/Je n.ai pas d.ordinateur|option Sans ordinateur|Gratuite, sans carte/.test(mur), 'drapeau baissé : le mur n’a ni 2e voie ni mention « sans carte »');
    // Réglages › Abonnement, confirmation de résiliation ouverte : mot pour mot.
    const T = RT.txt('fr');
    const cAbo = {
      user: { id: 'u1', email: 'a@b.c' }, lang: 'fr', isPremium: true, isPro: false, isBusiness: false, natif: false, plateforme: 'web',
      quotas: null, ouvrirOffres() {}, resiliation: { resilie: false, etape: 1, setEtape() {}, lancer() {}, enCours: false }, restauration: { enCours: false, lancer() {} },
    };
    const abo = renderToStaticMarkup(h(SPA.default, { c: cAbo, T }));
    verifier(!/data-cloud/.test(abo) && !/Sans ordinateur/.test(abo), 'drapeau baissé : Réglages › Abonnement sans aucun bloc Cloud');
    const aboTexte = texte(h(SPA.default, { c: cAbo, T }));
    verifier(aboTexte.includes(net(T.confirmerResiliation)) && aboTexte.includes(net(T.resiliationDetail)) && !/Free \+ Sans ordinateur|Arrêter aussi/.test(aboTexte), 'drapeau baissé : la confirmation « Se désabonner » reste mot pour mot', aboTexte.slice(-400));
  }

  // ── 7b. L'interrupteur ───────────────────────────────────────────────────
  const inter = (offre, coche, extra = {}) => texte(h(IC.default, { offre, coche, onBasculer() {}, lang: 'fr', maintenant: n, ...extra }));
  const i0 = inter({ mode: 'interrupteur', essai: true }, false);
  verifier(i0.includes('Sans ordinateur · +20 €/mois') && /7 jours d.essai gratuits/.test(i0) && /Carte demandée, rien n.est prélevé pour l.option avant le 17 octobre/.test(i0), 'interrupteur décoché : libellé, essai, carte demandée avec la date', i0);
  verifier(/ci-dessous\./.test(i0) && !/Free compris/.test(i0), 'interrupteur sans voie Free : « ci-dessous » seulement');
  verifier(/Free compris/.test(inter({ mode: 'interrupteur', essai: true }, false, { freeCompris: true })), 'interrupteur avec voie Free : « Free compris »');
  const i1 = inter({ mode: 'interrupteur', essai: true }, true);
  verifier(/Aujourd.hui — Carte demandée, rien n.est prélevé pour l.option/.test(i1) && /17 octobre — L.option passe à 20 €\/mois, sauf si tu l.arrêtes avant/.test(i1) && /D.ici là — Tu l.arrêtes en un geste dans Réglages › Abonnement\. On te prévient la veille, dans l.app et par e-mail/.test(i1), 'interrupteur coché : la frise sans piège', i1);
  const i2 = inter({ mode: 'interrupteur', essai: false }, true);
  verifier(i2.includes('Sans ordinateur · +20 €/mois') && !/7 jours|Carte demandée/.test(i2) && /déjà servi/.test(i2), 'essai déjà pris : « +20 €/mois », sans essai ni carte « offerte », facturée dès aujourd’hui', i2);
  verifier(inter({ mode: 'deja_actif' }, false) === '' && inter(null, true) === '', 'l’interrupteur ne se rend que pour une option prenable');
  sansMotsInterdits(i0 + i1 + i2, 'interrupteur');
  const prix = texte(h(IC.PrixAvecCloud, { prix: '12,99 €', cloud: { essai: true }, lang: 'fr' }));
  verifier(/12,99 € \+ 20 €/.test(prix) && /option offerte 7 jours/.test(prix), 'carte cochée : « 12,99 € + 20 € », option offerte 7 jours', prix);
  const ajout = texte(h(IC.CarteAjoutCloud, { offre: { mode: 'interrupteur', essai: true }, nomPalier: 'Pro', onAjouter() {}, lang: 'fr', maintenant: n }));
  verifier(/Ajouter à ta formule Pro/.test(ajout) && /Essayer 7 jours gratuits/.test(ajout) && /17 octobre/.test(ajout) && /Carte demandée/.test(ajout), 'carte d’ajout (formule déjà payée) : essai, carte demandée, date de bascule', ajout);
  verifier(texte(h(IC.CarteAjoutCloud, { offre: { mode: 'interrupteur', essai: true }, nomPalier: 'Pro', lang: 'fr' })) === '', 'carte d’ajout : sans geste d’hôte, rien (jamais un bouton mort)');

  // ── 7b bis. Free + Sans ordinateur ───────────────────────────────────────
  const free = (offre, extra = {}) => texte(h(IC.SectionFreeCloud, { offre, quotaFree: 9, onCloudSeul() {}, lang: 'fr', maintenant: n, ...extra }));
  const f1 = free({ mode: 'interrupteur', essai: true });
  verifier(/Free \+ Sans ordinateur/.test(f1) && /Avec Free \+ Sans ordinateur, tu restes à 9 annonces par mois\./.test(f1), 'Free + option : le quota Free dit noir sur blanc, LU (9 ici : jamais un 5 en dur)', f1);
  verifier(/Aujourd.hui — 0 €, carte demandée\./.test(f1) && /Pendant l.essai — Tes 9 annonces du plan Free\./.test(f1) && /17 octobre — 20 €\/mois, sauf si tu l.arrêtes\./.test(f1) && /Essayer Free \+ Sans ordinateur/.test(f1), 'Free + option : la frise Free et le bouton dédié', f1);
  const f2 = free({ mode: 'interrupteur', essai: false });
  verifier(/facturée 20 €\/mois dès aujourd.hui/.test(f2) && /Prendre Free \+ Sans ordinateur · 20 €\/mois/.test(f2) && !/Pendant l.essai/.test(f2), 'Free + option, essai déjà pris : facturée dès aujourd’hui, pas de frise', f2);
  verifier(free({ mode: 'interrupteur', essai: true }, { onCloudSeul: null }) === '', 'Free + option : sans geste d’hôte (onCloudSeul), pas de bouton');
  sansMotsInterdits(f1 + f2, 'Free + Sans ordinateur');

  // ── 7c. Réglages, état par état ──────────────────────────────────────────
  const essaiDe = (fin, extra = {}) => P.cloudDuProfil({ is_premium: true, cloud_essai_debut: new Date(Date.parse(fin) - 7 * 86400000).toISOString(), cloud_essai_fin: fin, ...extra }, n);
  const tous = { essayer() {}, ajouter() {}, arreter() {}, reprendre() {}, meConnecter() {}, voirFormules() {} };
  const reg = (cloud, nomPalier, actions = tous, extra = {}) => texte(h(BR.default, { lang: 'fr', cloud, nomPalier, actions, maintenant: n, quotaFree: 5, ...extra }));
  const rAucun = reg(P.cloudDuProfil({ is_premium: true }, n), 'Premium');
  verifier(/Pas activée/.test(rAucun) && /Essayer 7 jours gratuits/.test(rAucun) && /Carte demandée, rien n.est prélevé avant le 17 octobre/.test(rAucun) && /Puis 20 €\/mois/.test(rAucun), 'Réglages, aucun : essai, carte demandée, date, prix ensuite', rAucun);
  verifier(!/restes à/.test(rAucun), 'Réglages, aucun (Premium) : pas de quota Free');
  const rGratuit = reg(P.cloudDuProfil({}, n), null);
  verifier(/Essayer 7 jours gratuits/.test(rGratuit) && /Avec Free \+ Sans ordinateur, tu restes à 5 annonces par mois/.test(rGratuit) && /Carte demandée/.test(rGratuit), 'Réglages, Free sans option : l’essai, le quota Free gardé, carte demandée', rGratuit);
  const rJ5 = reg(essaiDe('2026-10-15T05:00:00Z'), 'Premium');
  verifier(/Encore 5 jours d.essai/.test(rJ5) && /Gratuit jusqu.au 15 octobre à 07:00/.test(rJ5) && /Jour 3 sur 7/.test(rJ5) && /Arrêter l.option/.test(rJ5), 'Réglages, essai J-5 : jours, date, heure, jauge, arrêter', rJ5);
  verifier(!/Voir Premium|Premium s.ajoute à l.option/.test(rJ5), 'Réglages, essai avec formule : aucune mention de Premium');
  const rFreeEssai = reg(P.cloudDuProfil({ cloud_essai_debut: '2026-10-08T05:00:00Z', cloud_essai_fin: '2026-10-15T05:00:00Z' }, n), null);
  verifier(/Essai gratuit/.test(rFreeEssai) && /l.option passe à 20 €\/mois/.test(rFreeEssai) && /Tu es en Free \+ Sans ordinateur : 5 annonces par mois\. Pour en publier plus, Premium s.ajoute à l.option\./.test(rFreeEssai) && /Voir Premium/.test(rFreeEssai), 'Réglages, Free en essai : UNE mention de Premium, avec son bouton', rFreeEssai);
  verifier((rFreeEssai.match(/Premium/g) ?? []).length <= 3, 'Réglages, Free en essai : Premium n’est pas martelé', rFreeEssai);
  const rJ1 = reg(essaiDe('2026-10-11T05:30:00Z'), 'Premium');
  verifier(/Dernier jour d.essai/.test(rJ1) && /11 octobre à 07:30/.test(rJ1), 'Réglages, essai J-1 : « Dernier jour d’essai »', rJ1);
  const rPaye = reg(P.cloudDuProfil({ is_pro: true, is_cloud: true, cloud_periode_fin: '2026-10-31T23:00:00Z' }, n), 'Pro');
  verifier(/Active/.test(rPaye) && /En plus de ta formule Pro/.test(rPaye) && /Arrêter l.option/.test(rPaye) && /Connecter Vinted et Leboncoin/.test(rPaye), 'Réglages, payé : active, arrêter, renvoi « Me connecter »', rPaye);
  verifier(!/\d ?€/.test(rPaye), 'Réglages, payé : aucun prix (un tarif particulier ne se devine pas)', rPaye);
  const rArret = reg(P.cloudDuProfil({ is_pro: true, is_cloud: true, cloud_periode_fin: '2026-10-31T23:00:00Z', cloud_arret_fin_periode: true }, n), 'Pro');
  verifier(/S.arrête le 1 novembre|S.arrête le 1er novembre/.test(rArret) && /tourne jusqu.au 1(er)? novembre, puis s.arrête/.test(rArret) && /Garder l.option/.test(rArret) && !/Arrêter l.option/.test(rArret), 'Réglages, arrêt prévu : « S’arrête le [fin de période] », garder, plus de bouton d’arrêt', rArret);
  const rFreePaye = reg(P.cloudDuProfil({ is_cloud: true }, n), null);
  verifier(/Active/.test(rFreePaye) && /Avec ton plan Free/.test(rFreePaye) && !/En pause/.test(rFreePaye), 'Réglages, Free + Sans ordinateur payée : active (plus jamais « en pause »)', rFreePaye);
  const rFin = reg(P.cloudDuProfil({ is_premium: true, cloud_essai_debut: '2026-09-30T06:00:00Z', cloud_essai_fin: '2026-10-07T06:00:00Z' }, n), 'Premium');
  verifier(/Essai terminé le 7 octobre/.test(rFin) && /rien n.a été facturé/.test(rFin) && /Ajouter l.option · 20 €\/mois/.test(rFin), 'Réglages, essai terminé : rien facturé, proposer de l’ajouter', rFin);
  const rArrete = reg(P.cloudDuProfil({ cloud_essai_debut: '2026-10-05T06:00:00Z', cloud_essai_fin: '2026-10-08T09:00:00Z', cloud_essai_arrete: true }, n), null);
  verifier(/Essai arrêté/.test(rArrete) && /Essai arrêté le 8 octobre/.test(rArrete) && /Ajouter l.option/.test(rArrete), 'Réglages, essai arrêté (Free) : la date réelle de l’arrêt, et l’ajouter reste possible', rArrete);
  const rSans = reg(essaiDe('2026-10-15T05:00:00Z'), 'Premium', {});
  verifier(!/Arrêter l.option|Connecter Vinted/.test(rSans), 'Réglages : un geste que l’hôte ne sait pas faire n’a pas de bouton', rSans);
  sansMotsInterdits([rAucun, rGratuit, rJ5, rFreeEssai, rJ1, rPaye, rArret, rFreePaye, rFin, rArrete].join(' '), 'Réglages');

  // ── 7c bis. La résiliation de la formule, option active ──────────────────
  const lu = (cloud) => ({ etat: 'ok', cloud });
  const mRes = texte(h(BR.MentionCloudResiliation, { lang: 'fr', lecture: lu(P.cloudDuProfil({ is_premium: true, is_cloud: true }, n)), onArreterOption() {} }));
  verifier(/continue : ton compte repasse en Free \+ Sans ordinateur/.test(mRes) && /Arrêter aussi l.option/.test(mRes), 'résiliation, option active : elle continue, lien pour l’arrêter aussi', mRes);
  verifier(texte(h(BR.MentionCloudResiliation, { lang: 'fr', lecture: lu(essaiDe('2026-10-15T05:00:00Z')), onArreterOption() {} })).length > 0, 'résiliation, option en essai : la mention aussi');
  verifier(texte(h(BR.MentionCloudResiliation, { lang: 'fr', lecture: lu(P.cloudDuProfil({ is_premium: true }, n)) })) === ''
    && texte(h(BR.MentionCloudResiliation, { lang: 'fr', lecture: lu(P.cloudDuProfil({ is_premium: true, is_cloud: true, cloud_periode_fin: '2026-10-31T23:00:00Z', cloud_arret_fin_periode: true }, n)) })) === ''
    && texte(h(BR.MentionCloudResiliation, { lang: 'fr', lecture: { etat: 'inactif', cloud: null } })) === '',
  'résiliation : rien sans option active, rien si l’arrêt est déjà prévu, rien sans lecture');

  // ── 7d. La fin d'essai ───────────────────────────────────────────────────
  const veille = texte(h(FE.RappelVeilleFinEssai, { lang: 'fr', cloud: essaiDe('2026-10-11T05:30:00Z'), quand: 'demain', nomPalier: 'Premium', actions: { arreter: async () => ({ ok: true }) }, onFermer() {} }));
  verifier(/Demain, l.option passe à 20 €\/mois/.test(veille) && /11 octobre à 07:30/.test(veille) && /Garder l.option/.test(veille) && /Arrêter l.option/.test(veille), 'la veille : titre, date, heure, garder / arrêter', veille);
  const veilleFree = texte(h(FE.RappelVeilleFinEssai, { lang: 'fr', cloud: essaiDe('2026-10-11T05:30:00Z'), quand: 'demain', nomPalier: null, actions: {}, onFermer() {} }));
  verifier(/elle passe à 20 €\/mois/.test(veilleFree) && /ton plan Free ne change pas/.test(veilleFree), 'la veille d’un compte Free', veilleFree);
  const fin = texte(h(FE.EcranEssaiTermine, { lang: 'fr', nomPalier: 'Premium', actions: { ajouter() {}, extension() {} }, onFermer() {} }));
  verifier(/Ton essai est terminé/.test(fin) && /Ce qui s.arrête/.test(fin) && /Ce qui continue/.test(fin) && /eBay, depuis ton téléphone/.test(fin) && /L.extension Chrome, gratuite/.test(fin), 'l’après : ce qui s’arrête, ce qui continue (extension, eBay)', fin);
  const finFree = texte(h(FE.EcranEssaiTermine, { lang: 'fr', nomPalier: null, actions: { ajouter() {} }, onFermer() {} }));
  verifier(/Reprendre l.option · 20 €\/mois/.test(finFree) && /Ton plan Free/.test(finFree), 'l’après, compte Free : il reprend l’option comme les autres (Free + Sans ordinateur)', finFree);
  sansMotsInterdits(veille + veilleFree + fin + finFree, 'fin d’essai');

  // ── 7e. La 2e voie ───────────────────────────────────────────────────────
  const carte = texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: true, onChoisir() {}, maintenant: n }));
  verifier(/Je n.ai pas d.ordinateur/.test(carte) && /Sans ordinateur, 7 jours d.essai/.test(carte) && /Essayer sans ordinateur/.test(carte), '2e voie (carte) : « Je n’ai pas d’ordinateur → Sans ordinateur, 7 jours d’essai »', carte);
  verifier(/FillSell publie tes annonces depuis ses serveurs/.test(carte) && /Carte demandée, rien n.est prélevé avant le 17 octobre/.test(carte), '2e voie : la phrase imposée et la carte demandée, datée', carte);
  const rangee = texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: true, variante: 'rangee', onChoisir() {} }));
  verifier(/Je n.ai pas d.ordinateur/.test(rangee) && /Sans ordinateur, 7 jours d.essai/.test(rangee), '2e voie (rangée du parcours d’entrée)', rangee);
  const carteSans = texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: false, onChoisir() {} }));
  verifier(/Sans ordinateur · \+20 €\/mois/.test(carteSans) && !/7 jours|Carte demandée/.test(carteSans), '2e voie, essai déjà pris : pas de promesse d’essai', carteSans);
  verifier(!/eBay part déjà/.test(texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: true, sansEbay: true, onChoisir() {} }))), '2e voie (mur) : ne répète pas eBay quand l’hôte le dit');
  const page = texte(h(VO.CarteVoieCloud, { lang: 'fr', variante: 'page', onChoisir() {} }));
  verifier(/FillSell publie tes annonces depuis ses serveurs/.test(page) && /carte demandée/.test(page), 'page /extension : la phrase imposée, carte demandée', page);
  sansMotsInterdits(carte + rangee + carteSans + page + texte(h(VO.CarteVoieCloud, { lang: 'fr', variante: 'lien', onChoisir() {} })), '2e voie');
  const en = texte(h(VO.CarteVoieCloud, { lang: 'en', essai: true, onChoisir() {}, maintenant: n }));
  verifier(/I don.t have a computer/.test(en) && !/ordinateur|octobre/.test(en), '2e voie en anglais : aucun mot français', en);
} finally {
  await vite.close();
}

console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `écrans Cloud : ${ok} vérifications passées`);
process.exit(ko ? 1 : 0);
