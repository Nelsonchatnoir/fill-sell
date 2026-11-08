// selftest:prix-boutique — (08/11/2026, refus Google Play de la vc36 : « Currency differences with prominent display
// price ») LE PRIX AFFICHÉ EST CELUI DE LA FEUILLE DE PAIEMENT, sur les 3 canaux.
//   1. Les règles (pures) : web = prix Stripe en euros ; iPhone/Android = priceString de la boutique ; « … » et achat
//      inactif tant qu'il n'est pas lu ; essai annoncé seulement si la boutique l'offre.
//   2. Téléphone HORS ZONE EURO (Google et Apple en dollars) : chaque écran (offres, Cloud, onboarding, mentions,
//      conditions, bienvenue) dit le prix en dollars, jamais « € » — et c'est le prix du produit que le bouton achète.
//   3. Web : mot pour mot comme avant (12,99 €, 29,99 €, 59,99 €, 24,99 €).
//   4. Balayage du code : plus aucun prix en dur affiché sur mobile ; ce qui reste en dur (web) est listé.
//   npm run selftest:prix-boutique
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (c, m, d = '') => { assert.ok(c, `${m}${d ? ` — ${String(d).slice(0, 300)}` : ''}`); n++; console.log(`  ✓ ${m}`); };
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// Les réponses de la boutique, telles que le module natif les rend (@capgo/native-purchases 8.3.3).
// Google : UNE entrée par offre (planIdentifier = produit, identifier = offre de base ; offerId null = offre de base).
const GOOGLE_USD = [
  { planIdentifier: 'app.fillsell.premium.standard', identifier: 'standard-monthly', offerId: null, price: 12.99, priceString: '$12.99', currencyCode: 'USD' },
  { planIdentifier: 'app.fillsell.pro.sub', identifier: 'pro-monthly', offerId: null, price: 29.99, priceString: '$29.99', currencyCode: 'USD' },
  { planIdentifier: 'app.fillsell.business.sub', identifier: 'business-monthly', offerId: null, price: 59.99, priceString: '$59.99', currencyCode: 'USD' },
  { planIdentifier: 'app.fillsell.cloud.sub', identifier: 'cloud-monthly', offerId: 'essai-7-jours', price: 0, priceString: 'Free', currencyCode: 'USD' },
  { planIdentifier: 'app.fillsell.cloud.sub', identifier: 'cloud-monthly', offerId: null, price: 24.99, priceString: '$24.99', currencyCode: 'USD' },
];
const APPLE_USD = [
  { identifier: 'app.fillsell.premium.standard', price: 12.99, priceString: '$12.99', currencyCode: 'USD', introductoryPrice: null },
  { identifier: 'app.fillsell.pro2.sub', price: 29.99, priceString: '$29.99', currencyCode: 'USD', introductoryPrice: null },
  { identifier: 'app.fillsell.business.sub', price: 59.99, priceString: '$59.99', currencyCode: 'USD', introductoryPrice: null },
  { identifier: 'app.fillsell.cloud.sub', price: 24.99, priceString: '$24.99', currencyCode: 'USD', introductoryPrice: { price: 0, priceString: '$0.00', paymentMode: 2 } },
];
const IDS_GOOGLE = { premium: 'app.fillsell.premium.standard', pro: 'app.fillsell.pro.sub', business: 'app.fillsell.business.sub', cloud: 'app.fillsell.cloud.sub' };
const IDS_APPLE = { ...IDS_GOOGLE, pro: 'app.fillsell.pro2.sub' };

globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const portail = join(ROOT, 'scripts/lib/portail-en-place.mjs');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: portail }] },
  ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  // Un seul exemplaire des modules (celui de Vite) : l'état posé est celui que lisent les écrans.
  const P = await vite.ssrLoadModule('/src/lib/prixBoutique.js');
  const TC = await vite.ssrLoadModule('/src/cloud/textes.js');
  const TE = await vite.ssrLoadModule('/src/entree/textes.js');
  const TX = await vite.ssrLoadModule('/src/cloud/textesConnexion.js');
  const CO = await vite.ssrLoadModule('/src/cloud/conditionsCloud.js');
  const MA = await vite.ssrLoadModule('/src/utils/mentionsAbonnement.js');
  const RG = await vite.ssrLoadModule('/src/cloud/regles.js');
  const CH = await vite.ssrLoadModule('/src/lib/chargerPrixBoutique.js');
  const AC = await vite.ssrLoadModule('/src/cloud/achatCloud.js');
  const IAP = await vite.ssrLoadModule('/src/lib/iap.js');
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const texte = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/ /g, ' ').replace(/\s+/g, ' ');
  const tout = (o) => JSON.stringify(o, (k, v) => (typeof v === 'function' ? String(v('12 novembre', '18:00', 'Pro')) : v));
  const modale = (lang = 'fr') => renderToStaticMarkup(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang, userId: 'u1' }));

  // ── 1. Les règles ─────────────────────────────────────────────────────────
  P.poserPrixBoutique(null);
  ok(P.prixAffiche('premium', 'fr') === '12,99 €' && P.prixAffiche('pro', 'en') === '€29.99' && P.prixAffiche('business') === '59,99 €' && P.prixAffiche('cloud') === '24,99 €', 'WEB : les prix Stripe, mot pour mot');
  ok(P.prixPret('cloud') && P.prixGratuit('fr') === '0 €' && P.essaiBoutiqueOffert('cloud'), 'WEB : achat possible, « 0 € », essai décidé par le serveur');
  const g = P.lireProduitsBoutique(GOOGLE_USD, { canal: 'google', ids: IDS_GOOGLE });
  ok(g.cloud.texte === '$24.99' && g.cloud.essai === true && g.cloud.devise === 'USD', 'GOOGLE : le prix récurrent = l’offre de base (pas la phase gratuite) ; l’offre à 0 = essai proposé');
  ok(g.premium.texte === '$12.99' && g.pro.texte === '$29.99' && g.business.texte === '$59.99' && g.premium.essai === false, 'GOOGLE : un prix par formule, sans essai inventé');
  const gSansEssai = P.lireProduitsBoutique(GOOGLE_USD.filter((p) => p.offerId == null), { canal: 'google', ids: IDS_GOOGLE });
  ok(gSansEssai.cloud.essai === false, 'GOOGLE : essai déjà pris chez Google (aucune offre à 0) → pas d’essai annoncé');
  const a = P.lireProduitsBoutique(APPLE_USD, { canal: 'apple', ids: IDS_APPLE });
  ok(a.cloud.texte === '$24.99' && a.cloud.essai === true && a.pro.texte === '$29.99', 'APPLE : priceString, prix d’introduction à 0 = essai');
  P.poserPrixBoutique({ canal: 'google', statut: 'chargement', prix: {} });
  ok(P.prixAffiche('cloud') === null && !P.prixPret('premium') && P.prixOuChargement('pro') === '…' && P.prixGratuit('en') === 'Free' && !P.essaiBoutiqueOffert('cloud'), 'MOBILE, prix pas encore lus : « … », achat inactif, « Gratuit » (jamais « 0 € »), pas d’essai annoncé');
  const enChargement = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1' }));
  const brut = modale('fr');
  ok(!/€/.test(enChargement) && /…/.test(enChargement), 'MOBILE, chargement : la feuille des offres n’écrit aucun « € », elle montre « … »', enChargement.slice(0, 300));
  ok(/data-prix-pret="0"/.test(brut) && !/data-prix-pret="1"/.test(brut) && /disabled=""/.test(brut), 'MOBILE, chargement : chaque bouton d’achat est inactif');

  // ── 1 bis. (09/11, condition de Nico avant l'OTA 2.9.168) LECTURE APPLE EN ÉCHEC : l'écran d'achat reste utilisable ──
  P.poserPrixBoutique({ canal: 'apple', statut: 'echec', prix: {} });
  ok(P.prixAffiche('pro', 'fr') === '29,99 €' && P.prixAffiche('cloud', 'en') === '€24.99' && P.prixPret('premium') && P.prixPret('business') && P.prixPret('cloud'),
    'iPHONE, lecture Apple en échec : prix de repli (ceux de la 2.9.166, validés par Apple), chaque achat possible');
  ok(P.essaiBoutiqueOffert('cloud') === true && P.prixOuChargement('cloud') === '24,99 €', 'iPHONE en échec : l’essai suit le serveur (comme avant le 08/11), aucun « … » sans fin');
  const repli = modale('fr');
  ok(/data-prix-pret="1"/.test(repli) && !/data-prix-pret="0"/.test(repli) && /29,99/.test(texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1' }))),
    'iPHONE en échec : la feuille des offres se rend sans erreur, prix de repli affichés, boutons d’achat ACTIFS');
  P.poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: { pro: { texte: '$29.99', montant: 29.99, devise: 'USD', essai: false } } });
  ok(P.prixAffiche('pro') === '$29.99' && P.prixAffiche('cloud') === '24,99 €' && P.prixPret('cloud'), 'iPHONE, réponse partielle (Cloud absent) : le lu fait foi, le manquant prend le repli');
  P.poserPrixBoutique({ canal: 'google', statut: 'echec', prix: {} });
  ok(P.prixAffiche('pro') === null && !P.prixPret('cloud') && P.prixOuChargement('cloud') === '…' && !P.essaiBoutiqueOffert('cloud'),
    'ANDROID en échec : JAMAIS de prix de repli (règle Google, refus de la vc36) — « … », achat inactif');
  // La lecture bornée : rejet, silence et exception levée d'un coup deviennent un échec, jamais une attente sans fin.
  const issue = (p) => p.then(() => 'ok', (e) => `rejet:${e?.message ?? e}`);
  ok(await issue(P.avecDelai(() => Promise.reject(new Error('StoreKit')), 200)) === 'rejet:StoreKit', 'lecture rejetée par StoreKit → échec');
  ok(await issue(P.avecDelai(() => new Promise(() => {}), 150)) === 'rejet:delai_lecture_prix', 'lecture sans réponse → échec au bout du délai');
  ok(await issue(P.avecDelai(() => { throw new Error('module absent'); }, 200)) === 'rejet:module absent', 'module natif qui lève d’un coup (vieux binaire) → échec, aucune exception');
  ok(await issue(P.avecDelai(() => Promise.resolve({ products: [] }), 200)) === 'ok', 'réponse dans le délai → transmise');
  const CHG = lire('src/lib/chargerPrixBoutique.js');
  ok(/export const DELAI_LECTURE_MS = 8_000;/.test(CHG) && /enVol = avecDelai\(\(\) => NativePurchases\.getProducts\(/.test(CHG)
    && /poserPrixBoutique\(\{ canal, statut: 'echec'/.test(CHG), 'le chargeur natif borne la lecture à 8 s et pose « echec » (→ repli iPhone)');

  // ── 2. Téléphone hors zone euro ───────────────────────────────────────────
  for (const [canal, produits, ids] of [['google', GOOGLE_USD, IDS_GOOGLE], ['apple', APPLE_USD, IDS_APPLE]]) {
    P.poserPrixBoutique({ canal, statut: 'pret', prix: P.lireProduitsBoutique(produits, { canal, ids }) });
    const nom = canal === 'google' ? 'ANDROID' : 'iPHONE';
    const fr = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1' }));
    const en = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'en', userId: 'u1' }));
    ok(/\$12\.99/.test(fr) && /\$29\.99/.test(fr) && !/€/.test(fr) && !/€/.test(en), `${nom} en dollars : la feuille des offres dit $12.99 / $29.99, jamais « € »`, fr.slice(0, 400));
    ok(/data-prix-pret="1"/.test(modale('fr')) && !/data-prix-pret="0"/.test(modale('fr')), `${nom} en dollars : les boutons d’achat agissent (prix affiché)`);
    const cloudFr = tout(TC.textesCloud('fr')), cloudEn = tout(TC.textesCloud('en'));
    ok(!/€/.test(cloudFr) && !/€/.test(cloudEn) && cloudFr.includes('$24.99') && cloudEn.includes('$24.99'), `${nom} en dollars : bloc, carte, interrupteur, fin d’essai Cloud — $24.99, jamais « € »`);
    ok(!/€/.test(tout(TE.textesEntree('fr'))) && tout(TE.textesEntree('fr')).includes('$24.99'), `${nom} en dollars : l’onboarding — $24.99`);
    ok(!/€/.test(tout(TX.textesConnexion('fr'))) && tout(TX.textesConnexion('fr')).includes('$24.99'), `${nom} en dollars : la confirmation « sans essai » — $24.99`);
    ok(!/€/.test(tout(CO.conditionsCloud('fr'))) && !/€/.test(tout(CO.conditionsCloud('en'))) && tout(CO.conditionsCloud('fr')).includes('$24.99'), `${nom} en dollars : les conditions du Cloud (case avant l’achat) — $24.99`);
    const m = MA.mentionsAbonnement({ canal: canal === 'google' ? 'android' : 'ios', lang: 'fr', cloud: true, essaiCloud: true });
    ok(!/€/.test(JSON.stringify(m)) && JSON.stringify(m).includes('$24.99'), `${nom} en dollars : les mentions sous les boutons — $24.99`);
    ok(RG.offreCloudPourModale({ etat: 'ok', cloud: { etat: 'aucun', essaiPris: false } }).essai === true, `${nom} : la boutique offre l’essai → annoncé`);
  }
  // Écran = panier : le prix montré est celui du PRODUIT que le bouton achète.
  const ids = CH.idsBoutique();
  ok(ids.cloud === AC.PRODUIT_CLOUD, 'écran = panier : le prix du Cloud est lu sur le produit acheté (PRODUIT_CLOUD)');
  ok(ids.premium === IAP.PRODUCT_IDS.standard && ids.pro === IAP.PRODUCT_IDS.pro && ids.business === IAP.PRODUCT_IDS.business, 'écran = panier : Premium, Pro, Business lus sur les produits achetés (PRODUCT_IDS)');
  ok(/const productId=isBusinessPurchase\?PRODUCT_IDS\.business:isProPurchase\?PRODUCT_IDS\.pro:PRODUCT_IDS\.standard;/.test(lire('src/App.jsx')), 'écran = panier : l’achat des formules passe bien par ces produits');
  // Essai refusé par la boutique : jamais promis.
  P.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: P.lireProduitsBoutique(GOOGLE_USD.filter((p) => p.offerId == null), { canal: 'google', ids: IDS_GOOGLE }) });
  ok(RG.offreCloudPourModale({ etat: 'ok', cloud: { etat: 'aucun', essaiPris: false } }).essai === false && !/7-day free trial/.test(JSON.stringify(MA.mentionsAbonnement({ canal: 'android', lang: 'en', cloud: true, essaiCloud: true }))), 'ANDROID : Google n’offre pas l’essai à ce compte → ni carte ni mention ne le promettent');
  ok(/boutique_sans_essai/.test(lire('src/cloud/achatCloud.js')) && /if \(platform !== 'web' && !prixPret\('cloud'\)\) return \{ etat: 'refuse', raison: 'prix_boutique_absent'/.test(lire('src/cloud/achatCloud.js')), 'achat Cloud mobile : refusé sans prix, et prévenu AVANT la feuille si la boutique n’offre pas l’essai');
  ok(/if\(\(platform==='ios'\|\|platform==='android'\)&&!prixPret\(tierLog\)\)\{/.test(lire('src/App.jsx')), 'achat des formules mobile : refusé tant que le prix n’est pas affiché');

  // ── 3. Web : mot pour mot ─────────────────────────────────────────────────
  P.poserPrixBoutique(null);
  const web = texte(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1' }));
  ok(/12,99 €/.test(web) && /29,99 €/.test(web) && /0 €/.test(web), 'WEB : la feuille des offres inchangée (12,99 €, 29,99 €, 0 €)', web.slice(0, 300));
  ok(TC.textesCloud('fr').ajoutCta === 'Ajouter · +24,99 €/mois' && TC.textesCloud('en').ajoutCta === 'Add · +€24.99/mo', 'WEB : les textes Cloud inchangés (« +24,99 €/mois », « +€24.99/mo »)');
  ok(tout(CO.conditionsCloud('fr')).includes("Le Cloud coûte 24,99 € TTC par mois, sur le web"), 'WEB : les conditions du Cloud, mot pour mot');
} finally {
  await vite.close();
}

// ── 4. Balayage du code ─────────────────────────────────────────────────────
// Un prix écrit en dur (« 12,99 € », « €24.99 », « $9.99 »…) hors commentaire. Les fichiers ci-dessous sont VOLONTAIREMENT
// en dur : le web (Stripe, page de retour, landing, blog), les textes légaux (CGU/CGV : décision de Nico), et des montants
// qui ne sont pas des prix d'abonnement (exemples d'annonces, champ de prix d'article).
const PRIX_EN_DUR = /\d+,\d{2}\s?€|€\s?\d+[.,]\d{2}|\$\s?\d+\.\d{2}/;
const VOLONTAIRE = {
  'src/lib/prixBoutique.js': 'web : PRIX_WEB (Stripe), lus seulement sur le web',
  'src/utils/palier.js': 'web : CLOUD_PRIX_AFFICHE, source de PRIX_WEB',
  'src/pages/succesAchat.js': 'web : page de retour de Stripe',
  'src/pages/LandingPage.jsx': 'web : landing',
  'src/pages/Legal.jsx': 'texte légal (CGU/CGV), décision de Nico',
  'src/cloud/textesLegaux.js': 'texte légal (CGU/CGV), décision de Nico',
  'src/cloud/conditionsCloud.js': 'web mot pour mot ; sur mobile, l’article 6 est réécrit au prix de la boutique (testé plus haut)',
  'src/entree/EtapeReleve.jsx': 'exemples d’annonces (prix de vente d’articles, pas un abonnement)',
  'src/stock/BarreModifierLot.jsx': 'exemple de prix d’article dans un champ',
};
const fichiers = [];
const parcourir = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'blog') parcourir(p); continue; }
    if (/\.(jsx?|mjs)$/.test(f)) fichiers.push(p);
  }
};
parcourir(join(ROOT, 'src'));
const trouves = [];
const volontaires = [];
for (const p of fichiers) {
  const rel = relative(ROOT, p).replace(/\\/g, '/');
  // Les commentaires de bloc (/* … */, {/* … */}) sont vidés, lignes gardées : seul le code compte.
  const lignes = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split(/\r?\n/);
  lignes.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) return;
    const code = l.replace(/\/\/.*$/, '');
    if (!PRIX_EN_DUR.test(code)) return;
    (VOLONTAIRE[rel] ? volontaires : trouves).push(`${rel}:${i + 1}`);
  });
}
ok(trouves.length === 0, 'balayage : aucun prix en dur hors des fichiers web / légaux listés', trouves.join(' · '));
console.log('\n  Restent VOLONTAIREMENT en dur (web, légal, montants qui ne sont pas des abonnements) :');
for (const [f, pourquoi] of Object.entries(VOLONTAIRE)) {
  const k = volontaires.filter((x) => x.startsWith(`${f}:`)).length;
  if (k) console.log(`    · ${f} (${k}) — ${pourquoi}`);
}
console.log(`\nTout est vert — ${n} contrôles.`);
