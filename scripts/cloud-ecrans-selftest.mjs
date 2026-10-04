// Autotest des ÉCRANS de l'option « Sans ordinateur » (Cloud) — 04/10/2026.
//
//     npm run selftest:cloud-ecrans
//     (node --import ./scripts/loader-ext.mjs scripts/cloud-ecrans-selftest.mjs)
//
// CONCEPTION, NON LIVRÉE. Ce qu'il prouve, sans réseau ni base :
//   1. le DRAPEAU est baissé par défaut, et il ne peut pas se lever sans la
//      sortie (« Arrêter l'option ») ni sans que l'hôte lise le choix ;
//   2. drapeau baissé, RIEN ne change : la feuille des formules, l'étape
//      « extension », le mur, la carte du Stock et les Réglages rendent
//      exactement ce qu'ils rendaient (aucun mot Cloud, la phrase eBay du mur
//      mot pour mot), et onUpgrade garde son appel à un argument ;
//   3. PostgREST tout-ou-rien : les colonnes Cloud ne sont lues QUE par
//      useCloudProfil, jamais dans le select de `profiles` d'App.jsx ;
//   4. une seule palette : cloud/theme.js = la palette `C` de ConversionModal ;
//   5. les MOTS : fr et en ont les mêmes clés ; libellé imposé exact ; aucune
//      plateforme bloquée, ni Opla, ni « pépites », ni « plafond », ni jargon ;
//   6. les règles d'affichage (cloud/regles.js) : ce que la feuille montre,
//      la veille, le jour d'essai, les dates à l'heure de Paris ;
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
const INTERDITS = [/Beebs/i, /Opla/i, /p[ée]pite/i, /plafond/i, /\bproxy\b/i, /\bIP\b/, /serveur Cloud/i, /navigateur headless/i];

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
}

// ── 2. Drapeau baissé : l'appel d'onUpgrade reste à un argument ─────────────
const modale = lignesDeCode(lire('src/components/ConversionModal.jsx'));
verifier(/const offreCloud = cloudVisible \? offreCloudPourModale\(lectureCloud\) : null;/.test(modale), 'feuille : sans drapeau, offreCloud vaut null');
verifier(/if \(choixCloud\) onUpgrade\(tier, \{ cloud: avecCloud \}\);\s*else onUpgrade\(tier\);/.test(modale), 'feuille : le choix Cloud ne part QUE si l’interrupteur est montré, sinon onUpgrade(tier) comme avant');
verifier(/const choixCloud = interrupteurMontre;/.test(modale) && /const interrupteurMontre = offreCloud\?\.mode === 'interrupteur' && !ajoutCloudPossible;/.test(modale), 'feuille : « interrupteur montré » dérive d’offreCloud (null sans drapeau)');
verifier(!/onUpgrade\(\s*(palier|rangCourant|palierDesDrapeaux)/.test(modale), 'feuille : jamais onUpgrade(palier actuel) (un second abonnement)');

// ── 3. PostgREST tout ou rien ────────────────────────────────────────────────
{
  const selectsProfils = [...app.matchAll(/from\('profiles'\)\.select\('([^']*)'\)/g)].map((x) => x[1]);
  verifier(selectsProfils.length > 3, 'App : les selects de profiles sont bien relus', selectsProfils.length);
  verifier(selectsProfils.every((s) => !/is_cloud|cloud_essai/.test(s)), 'App : aucune colonne Cloud dans un select de profiles (il viderait l’app tant que la migration n’est pas appliquée)', selectsProfils.join(' | '));
  const fautifs = [];
  const parcourir = (d) => {
    for (const e of fs.readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) parcourir(p);
      else if (/\.(jsx?|mjs)$/.test(e.name) && p !== 'src/cloud/useCloudProfil.js' && p !== 'src/utils/palier.js') {
        if (/is_cloud|cloud_essai_debut|cloud_essai_fin/.test(lignesDeCode(lire(p)))) fautifs.push(p);
      }
    }
  };
  parcourir('src');
  verifier(fautifs.length === 0, 'les colonnes Cloud ne sont lues QUE par useCloudProfil (et calculées par palier.js)', fautifs.join(' · '));
  const hook = lire('src/cloud/useCloudProfil.js');
  verifier(/\.select\(COLONNES_CLOUD\)/.test(hook) && /etat: 'echec'/.test(hook), 'useCloudProfil : requête À PART, et un échec vaut « echec » (rien d’affiché)');
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
const net = (s) => String(s).replace(/ /g, ' ');
{
  verifier(JSON.stringify(Object.keys(FR).sort()) === JSON.stringify(Object.keys(EN).sort()), 'textes : fr et en ont les mêmes clés',
    Object.keys(FR).filter((k) => !(k in EN)).concat(Object.keys(EN).filter((k) => !(k in FR))).join(', '));
  verifier(net(FR.libelleInterrupteur) === 'Sans ordinateur · +20 €/mois', 'le libellé IMPOSÉ : « Sans ordinateur · +20 €/mois »', FR.libelleInterrupteur);
  verifier(/ €/.test(FR.libelleInterrupteur), 'le prix ne se coupe pas en fin de ligne (« 20 € » insécable)');
  // Toutes les phrases, fonctions comprises (appelées avec des valeurs types).
  const toutes = (T) => Object.values(T).flatMap((v) => {
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v;
    if (typeof v === 'function') {
      const r = [v('Premium', '10:00', 'Premium'), v(null, '10:00', null), v(3, 7), v('demain', '10:00'), v('aujourdhui', '10:00'), v('17 octobre')];
      return r.flatMap((x) => (Array.isArray(x) ? x.flatMap((e) => (typeof e === 'object' ? [e.quand, e.quoi] : [e])) : [x]));
    }
    return [];
  }).map(String);
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
  const frise = FR.frise('17 octobre');
  verifier(frise.length === 3 && /0 €/.test(net(frise[0].quoi)) && frise[1].quand === '17 octobre' && /20 €\/mois/.test(net(frise[1].quoi)) && /Réglages › Abonnement/.test(frise[2].quoi) && /veille/.test(frise[2].quoi),
    'l’essai sans piège : aujourd’hui 0 € pour l’option, la date de bascule, le montant, la sortie et le rappel', JSON.stringify(frise));
  verifier(/Rien ne sera facturé/.test(FR.arreterEssai) && /Ta formule ne change pas/.test(FR.arreterEssai), 'arrêter pendant l’essai : rien facturé, formule inchangée — dit AVANT le geste');
  verifier(/Demain/.test(FR.veilleTitre('demain', '10:00')) && /Aujourd.hui à 10:00/.test(FR.veilleTitre('aujourdhui', '10:00')), 'la veille : « Demain… » / « Aujourd’hui à 10:00… »');
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
  verifier(JSON.stringify(R.offreCloudPourModale(ok_(c({})))) === JSON.stringify({ mode: 'interrupteur', essai: true }), 'feuille : compte neuf → interrupteur avec essai');
  const fini = { cloud_essai_debut: '2026-09-01T00:00:00Z', cloud_essai_fin: '2026-09-08T00:00:00Z' };
  verifier(JSON.stringify(R.offreCloudPourModale(ok_(c({ is_premium: true, ...fini })))) === JSON.stringify({ mode: 'interrupteur', essai: false }), 'feuille : essai déjà pris → interrupteur SANS essai');
  verifier(R.offreCloudPourModale(ok_(c({ is_pro: true, is_cloud: true }))).mode === 'deja_actif', 'feuille : option payée → « déjà actif », pas d’interrupteur');
  verifier(R.offreCloudPourModale(ok_(c({ is_cloud: true }))).mode === 'suspendu', 'feuille : option sans palier → « en pause »');
  verifier(R.voieCloud(ok_(c({}))).essai === true && R.voieCloud(ok_(c({ is_pro: true, is_cloud: true }))) === null && R.voieCloud({ etat: 'echec' }) === null, '2e voie : montrée seulement quand l’option peut être prise, et lue');
  verifier(R.quandFin('2026-10-11T05:30:00Z', n) === 'demain' && R.quandFin('2026-10-10T20:00:00Z', n) === 'aujourdhui' && R.quandFin('2026-10-15T05:00:00Z', n) === 'plus_tard' && R.quandFin('2026-10-09T05:00:00Z', n) === 'passe',
    'quandFin : jours calendaires de Paris (demain / aujourd’hui / plus tard / passé)');
  verifier(R.quandFin('2026-10-10T22:30:00Z', n) === 'demain', 'quandFin : 00:30 à Paris le lendemain = « demain », même si c’est encore le 10 en UTC');
  const essai = (fin) => c({ is_premium: true, cloud_essai_debut: new Date(Date.parse(fin) - 7 * 86400000).toISOString(), cloud_essai_fin: fin });
  verifier(R.rappelVeilleDu(essai('2026-10-11T05:30:00Z'), n) === 'demain' && R.rappelVeilleDu(essai('2026-10-15T05:00:00Z'), n) === null && R.rappelVeilleDu(c({ is_pro: true, is_cloud: true }), n) === null,
    'la veille : seulement pendant un essai qui finit demain ou aujourd’hui');
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
  const texte = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/ |&nbsp;/g, ' ').replace(/\s+/g, ' ');
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

  // ── 7a. Drapeau baissé : rien ne change ──────────────────────────────────
  if (!cfg.CLOUD_OFFER_ENABLED) {
  const modaleFree = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1' }));
  verifier(/Débloque tout FillSell\./.test(modaleFree) && /Passer Premium/.test(modaleFree), 'drapeau baissé : la feuille des formules se rend comme avant', modaleFree.slice(0, 200));
  verifier(!/Sans ordinateur|\+ 20 €|7 jours d.essai/.test(modaleFree), 'drapeau baissé : aucune trace de l’option dans la feuille');
  const modaleCloud = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1', trigger: 'cloud', onAjouterCloud() {} }));
  verifier(!/Sans ordinateur|Vends même ordinateur éteint/.test(modaleCloud), 'drapeau baissé : même ouverte « cloud » avec un hôte d’ajout, rien de Cloud');
  verifier(texte(h(VO.default, { lang: 'fr', userId: 'u1', origine: 'test' })) === '' && texte(h(VO.default, { lang: 'fr', variante: 'page', origine: 'test' })) === '', 'drapeau baissé : la 2e voie ne rend rien (y compris page /extension)');
  verifier(texte(h(HO.default, { userId: 'u1', lang: 'fr', onOuvrirOffres() {} })) === '', 'drapeau baissé : HoteCloud ne rend rien');
  verifier(texte(h(BR.BlocCloudReglagesLu, { c: { user: { id: 'u1' }, lang: 'fr', isPremium: true }, actions: {} })) === '', 'drapeau baissé : le bloc des Réglages ne rend rien');
  const EP = await vite.ssrLoadModule('/src/components/ExtensionPitchScreen.jsx');
  const mur = texte(h(EP.default, { lang: 'fr', onClose() {}, userId: 'u1', ebaySansOrdinateur: { relie: false, onRelier() {} } }));
  verifier(mur.includes("tes annonces eBay pourront partir depuis ton téléphone. Vinted, Leboncoin et Beebs demandent l'extension sur un ordinateur."), 'drapeau baissé : la phrase eBay du mur, mot pour mot', mur.slice(0, 600));
  verifier(!/Je n.ai pas d.ordinateur|option Sans ordinateur/.test(mur), 'drapeau baissé : le mur n’a pas de 2e voie');
  }

  // ── 7b. L'interrupteur ───────────────────────────────────────────────────
  const inter = (offre, coche) => texte(h(IC.default, { offre, coche, onBasculer() {}, lang: 'fr', maintenant: n }));
  const i0 = inter({ mode: 'interrupteur', essai: true }, false);
  verifier(i0.includes('Sans ordinateur · +20 €/mois') && /7 jours d.essai gratuits/.test(i0) && !/17 octobre/.test(i0), 'interrupteur décoché : libellé + essai, pas encore de frise', i0);
  const i1 = inter({ mode: 'interrupteur', essai: true }, true);
  verifier(/Aujourd.hui — Tu paies ta formule\. L.option : 0 €/.test(i1) && /17 octobre — L.option passe à 20 €\/mois/.test(i1) && /D.ici là — Tu l.arrêtes en un geste dans Réglages › Abonnement/.test(i1), 'interrupteur coché : la frise sans piège', i1);
  const i2 = inter({ mode: 'interrupteur', essai: false }, true);
  verifier(i2.includes('Sans ordinateur · +20 €/mois') && !/7 jours/.test(i2) && /déjà servi/.test(i2), 'essai déjà pris : « +20 €/mois », sans mention d’essai, facturée dès aujourd’hui', i2);
  verifier(inter({ mode: 'deja_actif' }, false) === '' && inter(null, true) === '', 'l’interrupteur ne se rend que pour une option prenable');
  sansMotsInterdits(i1 + i2, 'interrupteur');
  const prix = texte(h(IC.PrixAvecCloud, { prix: '12,99 €', cloud: { essai: true }, lang: 'fr' }));
  verifier(/12,99 € \+ 20 €/.test(prix) && /option offerte 7 jours/.test(prix), 'carte cochée : « 12,99 € + 20 € », option offerte 7 jours', prix);
  const ajout = texte(h(IC.CarteAjoutCloud, { offre: { mode: 'interrupteur', essai: true }, nomPalier: 'Pro', onAjouter() {}, lang: 'fr', maintenant: n }));
  verifier(/Ajouter à ta formule Pro/.test(ajout) && /Essayer 7 jours gratuits/.test(ajout) && /17 octobre/.test(ajout) && !/Aujourd.hui/.test(ajout), 'carte d’ajout (formule déjà payée) : la bascule et la sortie, pas « tu paies ta formule »', ajout);
  verifier(texte(h(IC.CarteAjoutCloud, { offre: { mode: 'interrupteur', essai: true }, nomPalier: 'Pro', lang: 'fr' })) === '', 'carte d’ajout : sans geste d’hôte, rien (jamais un bouton mort)');

  // ── 7c. Réglages, état par état ──────────────────────────────────────────
  const essaiDe = (fin, extra = {}) => P.cloudDuProfil({ is_premium: true, cloud_essai_debut: new Date(Date.parse(fin) - 7 * 86400000).toISOString(), cloud_essai_fin: fin, ...extra }, n);
  const tous = { essayer() {}, ajouter() {}, arreter() {}, meConnecter() {}, voirFormules() {} };
  const reg = (cloud, nomPalier, actions = tous) => texte(h(BR.default, { lang: 'fr', cloud, nomPalier, actions }));
  const rAucun = reg(P.cloudDuProfil({ is_premium: true }, n), 'Premium');
  verifier(/Pas activée/.test(rAucun) && /Essayer 7 jours gratuits/.test(rAucun) && /Puis 20 €\/mois/.test(rAucun), 'Réglages, aucun : essai + prix ensuite', rAucun);
  const rGratuit = reg(P.cloudDuProfil({}, n), null);
  verifier(/Premium, Pro ou Business/.test(rGratuit) && /Voir les formules/.test(rGratuit) && !/Essayer 7 jours/.test(rGratuit), 'Réglages, gratuit : l’option va avec une formule payante', rGratuit);
  const rJ5 = reg(essaiDe('2026-10-15T05:00:00Z'), 'Premium');
  verifier(/Encore 5 jours d.essai/.test(rJ5) && /Gratuit jusqu.au 15 octobre à 07:00/.test(rJ5) && /Jour 3 sur 7/.test(rJ5) && /Arrêter l.option/.test(rJ5), 'Réglages, essai J-5 : jours, date, heure, jauge, arrêter', rJ5);
  const rJ1 = reg(essaiDe('2026-10-11T05:30:00Z'), 'Premium');
  verifier(/Dernier jour d.essai/.test(rJ1) && /11 octobre à 07:30/.test(rJ1), 'Réglages, essai J-1 : « Dernier jour d’essai »', rJ1);
  const rPaye = reg(P.cloudDuProfil({ is_pro: true, is_cloud: true }, n), 'Pro');
  verifier(/Active/.test(rPaye) && /En plus de ta formule Pro/.test(rPaye) && /Arrêter l.option/.test(rPaye) && /Connecter Vinted et Leboncoin/.test(rPaye), 'Réglages, payé : active, arrêter, renvoi « Me connecter »', rPaye);
  verifier(!/\d ?€/.test(rPaye), 'Réglages, payé : aucun prix (un tarif particulier ne se devine pas)', rPaye);
  const rSusp = reg(P.cloudDuProfil({ is_cloud: true }, n), null);
  verifier(/En pause/.test(rSusp) && /Ta formule payante est arrêtée/.test(rSusp) && /Voir les formules/.test(rSusp), 'Réglages, suspendu', rSusp);
  const rFin = reg(P.cloudDuProfil({ is_premium: true, cloud_essai_debut: '2026-09-30T06:00:00Z', cloud_essai_fin: '2026-10-07T06:00:00Z' }, n), 'Premium');
  verifier(/Essai terminé le 7 octobre/.test(rFin) && /rien n.a été facturé/.test(rFin) && /Ajouter l.option · 20 €\/mois/.test(rFin), 'Réglages, essai terminé : rien facturé, proposer de l’ajouter', rFin);
  const rSans = reg(essaiDe('2026-10-15T05:00:00Z'), 'Premium', {});
  verifier(!/Arrêter l.option|Connecter Vinted/.test(rSans), 'Réglages : un geste que l’hôte ne sait pas faire n’a pas de bouton', rSans);
  sansMotsInterdits([rAucun, rGratuit, rJ5, rJ1, rPaye, rSusp, rFin].join(' '), 'Réglages');

  // ── 7d. La fin d'essai ───────────────────────────────────────────────────
  const veille = texte(h(FE.RappelVeilleFinEssai, { lang: 'fr', cloud: essaiDe('2026-10-11T05:30:00Z'), quand: 'demain', nomPalier: 'Premium', actions: { arreter: async () => ({ ok: true }) }, onFermer() {} }));
  verifier(/Demain, l.option passe à 20 €\/mois/.test(veille) && /11 octobre à 07:30/.test(veille) && /Garder l.option/.test(veille) && /Arrêter l.option/.test(veille), 'la veille : titre, date, heure, garder / arrêter', veille);
  const fin = texte(h(FE.EcranEssaiTermine, { lang: 'fr', nomPalier: 'Premium', actions: { ajouter() {}, extension() {} }, onFermer() {} }));
  verifier(/Ton essai est terminé/.test(fin) && /Ce qui s.arrête/.test(fin) && /Ce qui continue/.test(fin) && /eBay, depuis ton téléphone/.test(fin) && /L.extension Chrome, gratuite/.test(fin), 'l’après : ce qui s’arrête, ce qui continue (extension, eBay)', fin);
  const finGratuit = texte(h(FE.EcranEssaiTermine, { lang: 'fr', nomPalier: null, actions: { ajouter() {}, voirFormules() {} }, onFermer() {} }));
  verifier(/Voir les formules/.test(finGratuit) && !/Reprendre l.option/.test(finGratuit) && !/Ta formule/.test(finGratuit), 'l’après, compte gratuit : « Voir les formules », pas de formule inventée', finGratuit);
  sansMotsInterdits(veille + fin, 'fin d’essai');

  // ── 7e. La 2e voie ───────────────────────────────────────────────────────
  const carte = texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: true, onChoisir() {} }));
  verifier(/Je n.ai pas d.ordinateur/.test(carte) && /Sans ordinateur, 7 jours d.essai/.test(carte) && /Essayer sans ordinateur/.test(carte), '2e voie (carte) : « Je n’ai pas d’ordinateur → Sans ordinateur, 7 jours d’essai »', carte);
  const rangee = texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: true, variante: 'rangee', onChoisir() {} }));
  verifier(/Je n.ai pas d.ordinateur/.test(rangee) && /Sans ordinateur, 7 jours d.essai/.test(rangee), '2e voie (rangée du parcours d’entrée)', rangee);
  const carteSans = texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: false, onChoisir() {} }));
  verifier(/Sans ordinateur · \+20 €\/mois/.test(carteSans) && !/7 jours/.test(carteSans), '2e voie, essai déjà pris : pas de promesse d’essai', carteSans);
  verifier(!/eBay part déjà/.test(texte(h(VO.CarteVoieCloud, { lang: 'fr', essai: true, sansEbay: true, onChoisir() {} }))), '2e voie (mur) : ne répète pas eBay quand l’hôte le dit');
  sansMotsInterdits(carte + rangee + carteSans + texte(h(VO.CarteVoieCloud, { lang: 'fr', variante: 'page', onChoisir() {} })) + texte(h(VO.CarteVoieCloud, { lang: 'fr', variante: 'lien', onChoisir() {} })), '2e voie');
  const en = texte(h(VO.CarteVoieCloud, { lang: 'en', essai: true, onChoisir() {} }));
  verifier(/I don.t have a computer/.test(en) && !/ordinateur/.test(en), '2e voie en anglais : aucun mot français');
} finally {
  await vite.close();
}

console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `écrans Cloud : ${ok} vérifications passées`);
process.exit(ko ? 1 : 0);
