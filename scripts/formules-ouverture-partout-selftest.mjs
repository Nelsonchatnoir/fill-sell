// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 — « APPLE A VALIDÉ : ON OUVRE PARTOUT » (message de Nico, envoi Apple 3e203db9)
//     npm run selftest:formules-ouverture-partout
// ═══════════════════════════════════════════════════════════════════════════
// Les 3 abonnements « + Cloud » sont approuvés par Apple. Garde-fous de Nico : retirer PARTOUT les textes « les formules
// avec Cloud y arrivent bientôt… » (point 4c de l'étape 1, abonnés App Store sur le web compris) ; Android ne s'ouvre qu'à
// la publication de la vc38 ; l'essai et le mail de la veille marchent PAREIL sur les 3 canaux ; jamais deux abonnements.
// Cas RÉELS (id8, prod lue le 13/11 au matin, lecture seule) :
//   · interrupteurs : cloud_formules_stripe = 1 (12/11 18:13), cloud_formules_google = 1 (12/11 18:19), cloud_formules_apple
//     ABSENT ; binaires en vente : iPhone 2.9.164 (App Store, lookup public), Android 2.9.167 = vc37 (fiche Play publique) ;
//     la vc38 (2.9.176) n'est vue que chez le relecteur de Google (953c1ca6, checkout_issue du 12/11 20:25) ;
//   · 17 abonnés App Store payants (ex. 0029588d Premium, 785352fe Pro, 229c7b07 Business) lisaient sur le web « Les
//     formules avec Cloud y arrivent bientôt : Apple est en train de les valider… » ;
//   · Cloud SEUL facturé par l'App Store : f0acd3af (Pro App Store + Cloud seul App Store, essai jusqu'au 16/11), c7c382b7
//     (essai jusqu'au 19/11) — une formule prise sur l'iPhone serait un SECOND abonnement Apple (groupes « FillSell Cloud »
//     22440194 et « FillSell Plan » 22045363) ; le web leur disait « le passage se fait dans l'app, sans second abonnement » ;
//   · iPhone : 8b457627, 7d22ae91, f0acd3af, c7c382b7 ont reçu la semaine gratuite d'Apple (SUBSCRIBED INITIAL_BUY, fin à
//     J+7) alors que l'app, dont le module iOS ne rend pas `introductoryPrice`, ne l'annonçait jamais ;
//   · Google : le bouton des mails d'une formule (veille comprise) ouvrait l'abonnement du Cloud SEUL (sku cloud.sub).
// Sans réseau ni base (Vite SSR + react-dom/server), sur le VRAI code de l'app et du serveur.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').trim();
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// ── A. Les textes « bientôt » retirés PARTOUT (écran, Réglages, offres, serveur) ─────────────────────────────────────
console.log('\nA. Plus aucun « Les formules avec Cloud y arrivent bientôt » (app et serveur)');
// Le CODE (textes et clés), hors lignes de commentaire (l'historique de la règle y garde la citation).
const BIENTOT = /y arrivent bientôt|Apple est en train de les valider|coming there soon|Apple is reviewing them|boutiqueBientot|cloudBoutiqueBientot|'boutique_bientot'/;
const commentaire = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);
const trouves = [];
const parcourir = (d, ext) => {
  for (const n of fs.readdirSync(join(ROOT, d))) {
    const p = `${d}/${n}`;
    if (fs.statSync(join(ROOT, p)).isDirectory()) parcourir(p, ext);
    else if (ext.test(n)) lire(p).split('\n').forEach((l, i) => { if (!commentaire(l) && BIENTOT.test(l.replace(/\s\/\/ .*$/, ''))) trouves.push(`${p}:${i + 1}`); });
  }
};
parcourir('src', /\.(jsx?|tsx?|mjs)$/);
parcourir('supabase/functions', /\.(js|ts)$/);
ok(trouves.length === 0, `aucun texte « … y arrivent bientôt / Apple est en train de les valider » dans src/ ni supabase/functions/ (${trouves.length} trouvé(s))`, trouves.join(', '));

globalThis.document ??= { body: {} };
const memoire = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k), clear: () => memoire.clear() } });
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
  const CO = await vite.ssrLoadModule('/src/config/cloudOffer.js');
  const INT = await vite.ssrLoadModule('/src/config/interrupteurs.js');
  const PB = await vite.ssrLoadModule('/src/lib/prixBoutique.js');
  const FC = await vite.ssrLoadModule('/src/cloud/formulesCloud.js');
  const TF = await vite.ssrLoadModule('/src/cloud/textesFormules.js');
  const BFR = await vite.ssrLoadModule('/src/cloud/BlocFormulesReglages.jsx');
  const ACH = await vite.ssrLoadModule('/src/cloud/achatFormuleCloud.js');
  const FS = await vite.ssrLoadModule('/supabase/functions/_shared/formules-serveur.js');
  const RV = await vite.ssrLoadModule('/supabase/functions/_shared/cloud-rappel-veille.js');
  const CM = await vite.ssrLoadModule('/supabase/functions/_shared/cloud-mails.js');
  const T = TF.textesFormules('fr');
  const PROD_1311 = { cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_google: 1 };
  const BASCULE_APPLE = { ...PROD_1311, cloud_formules_apple: 1 };

  // ── B. Basculer l'interrupteur d'un canal suffit ; Android attend la vc38 ─────────────────────────────────────────
  console.log('\nB. L’ouverture par canal (interrupteurs de la prod du 13/11, puis la bascule Apple)');
  const vend = (binaire, plateforme) => { CO._binaireCloudAZero(binaire, plateforme); return CO.formulesCloudVendables('u-ordinaire', { plateforme, fuseau: 'Europe/Paris' }); };
  INT._remettreAZero(PROD_1311);
  ok(vend('web', 'web') === true, 'web : ouvert (cloud_formules_stripe = 1)');
  ok(vend('2.9.164', 'ios') === false, 'iPhone 2.9.164 (en vente) : fermé tant que cloud_formules_apple est absent');
  INT._remettreAZero(BASCULE_APPLE);
  ok(vend('2.9.164', 'ios') === true, 'iPhone 2.9.164 : OUVERT par la seule bascule de cloud_formules_apple (ni OTA, ni binaire)');
  ok(vend('2.9.167', 'android') === false, 'Android vc37 (2.9.167, en ligne) : formules MASQUÉES — elles attendent la vc38 (code de Google à chaque refus)');
  ok(vend('2.9.176', 'android') === true, 'Android vc38 (2.9.176) : ouvert dès que la personne a le binaire publié (lu au démarrage), sans rien basculer');
  CO._binaireCloudAZero('2.9.167', 'android');
  ok(CO.cloudOffreVendable('u-ordinaire', 'Europe/Paris') === true, 'Android vc37 : le Cloud SEUL garde sa règle (2.9.167), rien ne change pour lui');
  ok(CO.FORMULES_BINAIRE_MIN_ANDROID === '2.9.176' && CO.CLOUD_BINAIRE_MIN_ANDROID === '2.9.167', 'les deux seuils Android sont écrits une fois (formules 2.9.176, Cloud seul 2.9.167)');
  CO._binaireCloudAZero('web', 'web');

  // ── C. Abonnés App Store sur le web : la bascule, puis un retour arrière ─────────────────────────────────────────────
  console.log('\nC. Abonnés App Store sur le web (0029588d, 785352fe, 229c7b07…)');
  const base = { canalApp: 'stripe', essaiPermis: false, canalOuvert: CO.formulesCloudOuvertes };
  INT._remettreAZero(BASCULE_APPLE);
  const aboApple = FC.cartesFormulesCloud({ ...base, palier: 'pro', canalAbonnement: 'apple' });
  ok(aboApple.voie === 'boutique' && aboApple.cartes.length > 0 && aboApple.cartes.every((c) => !c.achetable && c.note === 'boutique'), 'Apple ouvert : chaque carte dit où (son abonnement App Store), aucun achat sur le web', JSON.stringify(aboApple.cartes.map((c) => [c.formule, c.note, c.achetable])));
  const n = FC.texteNoteCarte(aboApple.cartes[0], { T, canalApp: 'stripe', nom: 'Pro + Cloud', prix: '49,99 €' });
  ok(n === 'Le changement se fait dans ton abonnement App Store, sans second abonnement.', 'le texte de la note : « Le changement se fait dans ton abonnement App Store… »', n);
  ok(/change de formule dans l'app FillSell sur ton iPhone/.test(FS.messageVoieFormule({ motif: 'abonnement_boutique', canal: 'apple', ferme: false }, 'fr')), 'serveur, Apple ouvert : « change de formule dans l’app FillSell sur ton iPhone »');
  INT._remettreAZero(PROD_1311);   // retour arrière : Apple refermé
  const aboAppleFerme = FC.cartesFormulesCloud({ ...base, palier: 'pro', canalAbonnement: 'apple' });
  ok(aboAppleFerme.cartes.length === 0 && FC.formulesMasqueesPourLaVoie(aboAppleFerme.voie), 'Apple refermé : les formules sont MASQUÉES à ce compte (aucune carte), jamais « bientôt »', JSON.stringify(aboAppleFerme));
  const neutre = "Cette formule n'est pas disponible pour le moment. Rien n'a été débité.";
  ok(FS.messageVoieFormule({ motif: 'abonnement_boutique', canal: 'apple', ferme: true }, 'fr') === neutre, 'serveur, canal fermé : la phrase neutre, sans promesse', FS.messageVoieFormule({ motif: 'abonnement_boutique', canal: 'apple', ferme: true }, 'fr'));
  const c = (p) => ({ user: { id: 'u-ordinaire' }, lang: 'fr', plateforme: 'web', natif: false, isPremium: true, isPro: true, isBusiness: false, ...p });
  const actions = { formule: () => {}, voirFormulesCloud: () => {}, arreter: async () => ({ ok: true }) };
  const rendu = (props) => renderToStaticMarkup(h(BFR.default, props));
  const lectureSans = { etat: 'ok', cloud: { etat: 'aucun', essaiPris: false }, profil: { cloud_canal: null } };
  const htmlFerme = rendu({ c: c(), visible: true, lecture: lectureSans, profil: { etat: 'ok', formuleActuelle: null, canalAbonnement: 'apple', founder: false, echeance: '2026-12-01T10:00:00Z' }, actions });
  ok(htmlFerme === '', 'Réglages (abonné App Store, Apple refermé) : rien de rendu — la page d’avant', htmlFerme.slice(0, 200));
  const cm = lire('src/components/ConversionModal.jsx');
  ok(/const formulesVisibles = formulesCanal && !formulesMasqueesPourLaVoie\(cartesFormulesCloud\(\{/.test(cm), 'fenêtre d’offres : une voie masquée cache « Avec Cloud » (la feuille d’avant)');

  // ── D. Cloud SEUL facturé par une boutique : jamais un second abonnement ─────────────────────────────────────────────
  console.log('\nD. Cloud seul App Store (f0acd3af, c7c382b7) : jamais deux abonnements Apple');
  INT._remettreAZero(BASCULE_APPLE);
  const lectureCloudApple = { etat: 'ok', cloud: { etat: 'essai', essaiPris: true, essaiFin: '2026-11-16T18:27:44Z' }, profil: { cloud_canal: 'apple' } };
  const f0 = FC.cartesFormulesCloud({ palier: 'pro', canalApp: 'apple', canalAbonnement: 'apple', essaiPermis: false, canalOuvert: CO.formulesCloudOuvertes, canalCloud: FC.canalDuCloudSeul(lectureCloudApple) });
  ok(f0.cartes.length === 0 && f0.voie === 'cloud_seul_boutique', 'f0acd3af (Pro App Store + Cloud seul App Store) sur iPhone : aucune carte achetable (Pro + Cloud y serait un 2e abonnement Apple)', JSON.stringify(f0.cartes.map((x) => [x.formule, x.achetable])));
  const c7 = FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'apple', canalAbonnement: null, essaiPermis: false, canalOuvert: CO.formulesCloudOuvertes, canalCloud: 'apple' });
  ok(c7.cartes.length === 0, 'c7c382b7 (Cloud seul App Store) sur iPhone : aucune carte achetable');
  const htmlC7web = rendu({ c: c({ isPremium: false, isPro: false }), visible: true, lecture: { ...lectureCloudApple, cloud: { ...lectureCloudApple.cloud, essaiFin: '2026-11-19T18:18:50Z' } }, profil: { etat: 'ok', formuleActuelle: null, canalAbonnement: null, founder: false, echeance: null }, actions });
  ok(htmlC7web === '', 'c7c382b7 sur le web : plus de « le passage se fait dans l’app, sans second abonnement » (faux chez Apple), ni bouton', texte(htmlC7web));
  // (13/11/2026, décision de Nico — proposer le changement, pas un refus sec) la formule sans Cloud, qui s'ajoute au Cloud.
  { const m = FS.messageVoieFormule({ motif: 'cloud_boutique', canal: 'apple', ferme: false }, 'fr');
    ok(/Choisis la formule sans Cloud/.test(m) && !/change de formule dans l'app/.test(m), 'serveur (Cloud seul App Store) : propose la formule sans Cloud, jamais « change de formule dans l’app »', m); }
  const titulaire = FC.cartesFormulesCloud({ palier: 'pro', formuleActuelle: 'pro_cloud', canalApp: 'apple', canalAbonnement: 'apple', essaiPermis: false, canalOuvert: CO.formulesCloudOuvertes, canalCloud: 'apple' });
  ok(titulaire.voie === 'ici' && titulaire.cartes.some((x) => x.formule === 'business_cloud' && x.achetable), 'témoin : un titulaire de Pro + Cloud par l’App Store (son Cloud n’est pas un Cloud seul) garde sa montée vers Business + Cloud');
  const cloudStripe = FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'stripe', canalAbonnement: null, essaiPermis: false, canalOuvert: CO.formulesCloudOuvertes, canalCloud: 'stripe' });
  ok(cloudStripe.voie === 'ici' && cloudStripe.cartes.some((x) => x.achetable), 'témoin : Cloud seul payé par carte, sur le web → rien ne change (le même abonnement Stripe change de prix)');

  // ── E. iPhone : l'essai annoncé comme sur le web ─────────────────────────────────────────────────────────────────────
  console.log('\nE. iPhone : la semaine gratuite d’Apple annoncée (8b457627, 7d22ae91, f0acd3af, c7c382b7)');
  const swift = fs.readFileSync(join(ROOT, 'node_modules/@capgo/native-purchases/ios/Sources/NativePurchasesPlugin/Product+CapacitorPurchasesPlugin.swift'), 'utf8');
  const clesIos = [...swift.matchAll(/^\s*"([A-Za-z]+)":/gm)].map((m) => m[1]);
  ok(clesIos.includes('priceString') && !clesIos.includes('introductoryPrice'), `le module iOS du binaire rend ${clesIos.join(', ')} — PAS introductoryPrice`);
  const produitIos = (id, prix) => Object.fromEntries(clesIos.map((k) => [k, k === 'identifier' ? id : k === 'price' ? prix : k === 'priceString' ? `${String(prix).replace('.', ',')} €` : k === 'currencyCode' ? 'EUR' : k === 'title' ? id : k === 'isFamilyShareable' ? false : '']));
  const reponseApple = [produitIos('app.fillsell.cloud.sub', 24.99), produitIos('app.fillsell.premium.cloud', 34.99), produitIos('app.fillsell.pro.cloud', 49.99), produitIos('app.fillsell.business.cloud', 79.99),
    produitIos('app.fillsell.premium.standard', 12.99), produitIos('app.fillsell.pro2.sub', 29.99), produitIos('app.fillsell.business.sub', 59.99)];
  const ids = { premium: 'app.fillsell.premium.standard', pro: 'app.fillsell.pro2.sub', business: 'app.fillsell.business.sub', cloud: 'app.fillsell.cloud.sub',
    premium_cloud: 'app.fillsell.premium.cloud', pro_cloud: 'app.fillsell.pro.cloud', business_cloud: 'app.fillsell.business.cloud' };
  PB.poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: PB.lireProduitsBoutique(reponseApple, { canal: 'apple', ids }) });
  // (13/11, 2e réponse de Nico — point b) La semaine d'Apple n'est plus annoncée sans savoir : l'historique Apple du
  // téléphone (Transaction.all, lib/eligibiliteApple.js) dit si elle sera offerte. Ici, un identifiant Apple VIERGE (8b457627
  // le 08/11 avant son achat) : elle l'est. Le cas contraire (« prélevé aujourd'hui ») : selftest:textes-paiement-verite.
  PB.poserEligibiliteApple({ plan: true, cloud: true });
  ok(PB.essaiBoutiqueOffert('premium_cloud') === true && PB.essaiBoutiqueOffert('pro_cloud') === true, 'Premium + Cloud et Pro + Cloud : la semaine gratuite peut être annoncée (le serveur décide, comme sur le web)');
  ok(PB.essaiBoutiqueOffert('business_cloud') === false, '⛔ Business + Cloud : jamais (aucune offre d’introduction chez Apple)');
  ok(PB.essaiBoutiqueOffert('cloud') === true, 'le Cloud seul : plus jamais « Ta boutique ne propose pas d’essai gratuit à ce compte » quand Apple l’offre');
  const neuf = FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'apple', canalAbonnement: null, essaiPermis: true, essaiBoutique: (f) => PB.essaiBoutiqueOffert(f), canalOuvert: () => true });
  ok(neuf.cartes.find((x) => x.formule === 'pro_cloud')?.pastille === true && neuf.cartes.find((x) => x.formule === 'premium_cloud')?.pastille === true
    && neuf.cartes.find((x) => x.formule === 'business_cloud')?.pastille === false, 'nouveau compte sur iPhone : « 7 jours gratuits » sur Premium + Cloud et Pro + Cloud, jamais sur Business + Cloud (comme le web)', JSON.stringify(neuf.cartes.map((x) => [x.formule, x.pastille])));
  const questions = [];
  let achats = 0;
  const supabaseFactice = { auth: { getSession: async () => ({ data: { session: { access_token: 'j' } } }), refreshSession: async () => ({ data: { session: null } }) }, rpc: async () => ({ data: null, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
  const achatIos = ACH.creerAchatFormuleCloud({ supabase: supabaseFactice, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: 'u', email: 'u@exemple.fr' }, lang: 'fr', platform: 'ios',
    confirmer: async (q) => { questions.push(q); return false; }, notifier: () => {}, demanderConditions: async () => true, purchasePremium: async () => { achats++; return { cancelled: true }; } });
  const r = await achatIos.acheter('pro_cloud', { essaiAffiche: false, dejaCloud: true });
  ok(questions.length === 1 && /App Store va t'afficher « 1 semaine gratuite »/.test(questions[0]) && r?.etat === 'annule' && achats === 0,
    'essai FillSell déjà pris, sur iPhone : la question du 4d est POSÉE avant la feuille d’Apple (avant : jamais, le module ne disant rien)', questions[0]);
  questions.length = 0;
  await achatIos.acheter('pro_cloud', { essaiAffiche: false, dejaCloud: true, abonneBoutique: true });
  ok(questions.length === 0 && achats === 1, 'abonné App Store (785352fe Pro, ou le compte de test 5322fa18) sur iPhone : aucune question — Apple ne donne jamais la semaine à un abonné du même groupe ; la feuille s’ouvre');
  const cmA = lire('src/components/ConversionModal.jsx');
  ok(/abonneBoutique: plateformeIci !== 'web' && profilFormules\.canalAbonnement === canalDeVente\(plateformeIci\)/.test(cmA)
    && /abonneBoutique: canalApp !== 'stripe' && profil\.canalAbonnement === canalApp/.test(lire('src/cloud/BlocFormulesReglages.jsx')), 'la fenêtre d’offres et Réglages disent à l’achat si le compte est abonné par la boutique du téléphone');
  PB.poserPrixBoutique(null);

  // ── F. Les mails d'une formule sur Google Play (veille comprise) : la page de SA formule ─────────────────────────────
  console.log('\nF. Google Play : le bouton des mails d’une formule ouvre l’abonnement de la formule');
  const veilleG = RV.texteRappel({ lang: 'fr', finIso: '2026-11-20T10:00:00Z', canal: 'google', prix: { montant: 49.99, devise: 'EUR' }, formule: 'pro_cloud' });
  ok(/sku=app\.fillsell\.pro\.cloud&package=app\.fillsell\.app/.test(veilleG.bouton?.url ?? ''), 'veille Pro + Cloud (Google) : sku=app.fillsell.pro.cloud (avant : cloud.sub, l’abonnement du Cloud seul)', veilleG.bouton?.url);
  const veilleA = RV.texteRappel({ lang: 'fr', finIso: '2026-11-20T10:00:00Z', canal: 'apple', prix: null, formule: 'pro_cloud' });
  const veilleS = RV.texteRappel({ lang: 'fr', finIso: '2026-11-20T10:00:00Z', canal: 'stripe', prix: null, formule: 'pro_cloud' });
  ok(veilleA.bouton?.url === 'https://apps.apple.com/account/subscriptions' && veilleS.bouton?.url === 'https://fillsell.app', 'témoins : Apple et Stripe inchangés');
  const seul = RV.texteRappel({ lang: 'fr', finIso: '2026-11-20T10:00:00Z', canal: 'google', prix: null });
  ok(/sku=app\.fillsell\.cloud\.sub/.test(seul.bouton?.url ?? ''), 'témoin : la veille du Cloud SEUL (Google) garde son abonnement cloud.sub');
  const debutG = CM.texteMailFormule({ evenement: 'essai_debut', lang: 'fr', canal: 'google', faits: { formule: 'premium_cloud', finIso: '2026-11-20T10:00:00Z' }, prix: null });
  ok(/sku=app\.fillsell\.premium\.cloud/.test(debutG?.bouton?.url ?? ''), 'début d’essai Premium + Cloud (Google) : la page de la formule', debutG?.bouton?.url);
} finally {
  await vite.close();
}
console.log(`\n${rouges === 0 ? '✓' : '✗'} formules-ouverture-partout : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
