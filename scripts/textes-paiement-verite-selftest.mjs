// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 (2e réponse de Nico) — « PAIEMENTS ET ABONNEMENTS : TOUT DOIT ÊTRE PARFAIT ET CLAIR »
//     npm run selftest:textes-paiement-verite
// ═══════════════════════════════════════════════════════════════════════════
// « Un utilisateur doit toujours savoir, AVANT de valider, ce qui va se passer exactement : quelle formule, quel prix, essai
// ou pas, date du premier prélèvement, et comment arrêter. Aucun texte faux, nulle part. » (e) « Chaque texte de prix,
// d'essai ou de date est vérifié par un selftest contre la vraie règle du canal. Un texte qui ment fait casser le verrou. »
//
// LA VRAIE RÈGLE DE CHAQUE CANAL (l'oracle de ce test — écrite ICI, jamais importée de l'app qu'elle juge) :
//   · STRIPE (web) = le code serveur : voieFormuleStripe / parametresCheckoutFormule (_shared/formules-serveur.js), relus
//     par ce test ; montée hors essai = `proration_behavior: "always_invoice"` (create-checkout-session, relu ici) ;
//   · APPLE = developer.apple.com, « Implementing introductory offers in your app » (relu le 13/11) : « New subscribers are
//     always eligible » ; « Lapsed subscribers … eligible if they haven't previously used an introductory offer … within the
//     same subscription group » ; « Existing subscribers are not eligible … upgrading, downgrading, or crossgrading » ;
//     « Upgrades … go into effect immediately. Downgrades … at the next renewal date » (Handling subscriptions billing) ;
//     groupes « FillSell Plan » (22045363 : formules) et « FillSell Cloud » (22440194 : cloud.sub) ; offres d'intro d'App
//     Store Connect : cloud.sub, premium.cloud, pro.cloud (jamais business.cloud ni les formules classiques — prod : leurs
//     INITIAL_BUY durent 30-31 j, stores_notifications_journal lu le 13/11) ;
//   · GOOGLE = developer.android.com : « queryProductDetailsAsync() returns … user eligible offers » ; montée =
//     CHARGE_PRORATED_PRICE (« The price difference for the remaining period is then charged »), descente = DEFERRED.
// Cas RÉELS (id8, prod lue le 13/11, lecture seule) : 8b457627, 7d22ae91, f0acd3af, c7c382b7 ont utilisé la semaine
// gratuite du groupe « FillSell Cloud » (SUBSCRIBED INITIAL_BUY, fin à J+7) ; 785352fe (Pro App Store), 0029588d (Premium
// App Store), 229c7b07 (Business App Store), 9bcc16d0 / 82ae95fe / 010ff35b / 8a7f95d5 (Premium Standard App Store, 30-31 j,
// sans offre) ; d607ba20 (essai Stripe) ; 5322fa18 (compte de test, Sandbox).
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
/** Une vérification qui lève (module ou fonction absents) est ROUGE, jamais un arrêt du verrou. */
const sur = (m, f) => { try { return f(); } catch (e) { ok(false, m, `levé : ${e?.message ?? e}`); return undefined; } };
const surAsync = async (m, f) => { try { return await f(); } catch (e) { ok(false, m, `levé : ${e?.message ?? e}`); return undefined; } };
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html ?? '').replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').trim();
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const existe = (p) => fs.existsSync(join(ROOT, p));

// ── L'ORACLE : la règle de chaque canal, écrite ici ─────────────────────────────────────────────────────────────────
const GROUPE_PLAN = ['app.fillsell.premium.sub', 'app.fillsell.premium.standard', 'app.fillsell.pro.sub', 'app.fillsell.pro2.sub',
  'app.fillsell.business.sub', 'app.fillsell.premium.cloud', 'app.fillsell.pro.cloud', 'app.fillsell.business.cloud'];
const OFFRE_INTRO_APPLE = new Set(['cloud', 'premium_cloud', 'pro_cloud']);
const ID_APPLE = { cloud: 'app.fillsell.cloud.sub', premium_cloud: 'app.fillsell.premium.cloud', pro_cloud: 'app.fillsell.pro.cloud', business_cloud: 'app.fillsell.business.cloud' };
const groupeDe = (id) => (id === 'app.fillsell.cloud.sub' ? 'cloud' : GROUPE_PLAN.includes(id) ? 'plan' : null);
const jws = (charge) => `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.c2ln`;
const MAINTENANT = Date.parse('2026-11-13T12:00:00+01:00');
/** Apple offrira-t-il sa semaine pour ce produit à cet historique ? (la règle d'Apple, citée en tête) */
function oracleApple(produit, transactions) {
  if (!OFFRE_INTRO_APPLE.has(produit)) return false;
  const g = groupeDe(ID_APPLE[produit]);
  const siennes = transactions.filter((t) => groupeDe(t.productIdentifier) === g);
  const enCours = siennes.some((t) => !t.revocationDate && Date.parse(t.expirationDate ?? '') > MAINTENANT);
  const introUtilisee = siennes.some((t) => JSON.parse(Buffer.from(t.jwsRepresentation.split('.')[1], 'base64url').toString()).offerType === 1);
  return !enCours && !introUtilisee;
}
const tx = (id, { intro = false, fin = '2026-10-01T10:00:00Z' } = {}) => ({
  productIdentifier: id, expirationDate: fin, isActive: Date.parse(fin) > MAINTENANT,
  jwsRepresentation: jws({ productId: id, ...(intro ? { offerType: 1, offerDiscountType: 'FREE_TRIAL' } : {}) }),
});
// Les historiques Apple (Transaction.all) des cas réels.
const HISTORIQUES = {
  vierge: [],
  // 8b457627 (et 7d22ae91, f0acd3af, c7c382b7) : la semaine du Cloud seul prise le 08/11, finie le 15/11.
  cloud_intro_8b457627: [tx('app.fillsell.cloud.sub', { intro: true, fin: '2026-11-15T18:01:22Z' })],
  // 785352fe : Pro App Store EN COURS (abonné du groupe « FillSell Plan »).
  pro_en_cours_785352fe: [tx('app.fillsell.pro2.sub', { fin: '2026-12-01T20:07:34Z' })],
  // 9bcc16d0 (Premium Standard App Store, 30 j, sans offre) une fois expiré : abonné ÉCHU sans offre utilisée.
  premium_echu_sans_offre: [tx('app.fillsell.premium.standard', { fin: '2026-10-27T19:42:23Z' })],
  // Un identifiant Apple qui a déjà eu la semaine de Pro + Cloud (depuis l'ouverture iPhone du 13/11, 08:49).
  pro_cloud_intro: [tx('app.fillsell.pro.cloud', { intro: true, fin: '2026-11-13T07:50:00Z' })],
};

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
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch { return null; } };
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const PB = await vite.ssrLoadModule('/src/lib/prixBoutique.js');
  const FC = await vite.ssrLoadModule('/src/cloud/formulesCloud.js');
  const TF = await vite.ssrLoadModule('/src/cloud/textesFormules.js');
  const OAC = await vite.ssrLoadModule('/src/cloud/OffresAvecCloud.jsx');
  const ACH = await vite.ssrLoadModule('/src/cloud/achatFormuleCloud.js');
  const ACL = await vite.ssrLoadModule('/src/cloud/achatCloud.js');
  const FS = await vite.ssrLoadModule('/supabase/functions/_shared/formules-serveur.js');
  const CM = await vite.ssrLoadModule('/supabase/functions/_shared/cloud-mails.js');
  const MA = await vite.ssrLoadModule('/src/utils/mentionsAbonnement.js');
  const IA = await vite.ssrLoadModule('/src/lib/issueAchat.js');
  const EA = await charger('/src/lib/eligibiliteApple.js');            // 13/11 : absent avant le correctif
  const TM = await charger('/src/utils/texteMontee.js');                // 13/11 : absent avant le correctif
  const T = TF.textesFormules('fr');

  // ── A. Apple : l'éligibilité à la semaine gratuite, lue dans l'historique de l'identifiant Apple du téléphone ─────────
  console.log('\nA. iPhone — la semaine d’Apple suit la règle d’Apple (historique Transaction.all du binaire en vente)');
  const swift = fs.readFileSync(join(ROOT, 'node_modules/@capgo/native-purchases/ios/Sources/NativePurchasesPlugin/TransactionHelpers.swift'), 'utf8');
  ok(/collectPurchases\(from: Transaction\.all/.test(swift) && /response\["jwsRepresentation"\] = jws/.test(swift),
    'le module iOS du binaire 2.9.164 (8.3.3) rend Transaction.all avec la transaction signée (jwsRepresentation) — sans binaire neuf');
  for (const [nom, hist] of Object.entries(HISTORIQUES)) {
    for (const produit of ['cloud', 'pro_cloud']) {
      const attendu = oracleApple(produit, hist);
      sur(`éligibilité ${produit} / ${nom}`, () => {
        const el = EA.eligibiliteApple(hist, MAINTENANT);
        ok(el[EA.groupeAppleDuProduit(produit)] === attendu, `${nom} → ${produit} : ${attendu ? 'semaine offerte' : 'PAS de semaine (prélevé aujourd’hui)'} (règle d’Apple)`, JSON.stringify(el));
      });
    }
  }
  sur('historique illisible', () => {
    const el = EA.eligibiliteApple([{ productIdentifier: 'app.fillsell.premium.cloud', expirationDate: '2026-10-01T00:00:00Z', jwsRepresentation: 'illisible' }], MAINTENANT);
    ok(el.plan === null, 'une transaction du groupe dont la charge signée est illisible → « on ne sait pas » (jamais « 7 jours » affirmé)', JSON.stringify(el));
  });
  const charge = lire('src/lib/chargerPrixBoutique.js');
  ok(/getPurchases\(\)/.test(charge) && /eligibiliteApple\(/.test(charge) && /canal === 'apple'\) chargerEligibiliteApple\(\)/.test(charge),
    'l’app lit l’historique Apple à chaque lecture des prix sur iPhone (borné, jamais une exception)');

  // ── B. Les cartes des formules : chaque ligne de prix = la règle du canal ────────────────────────────────────────────
  console.log('\nB. Fenêtre d’offres « Avec Cloud » — le texte de chaque carte, rendu, contre la règle du canal');
  const prixApple = { premium: { texte: '12,99 €', montant: 12.99, devise: 'EUR' }, pro: { texte: '29,99 €', montant: 29.99, devise: 'EUR' },
    business: { texte: '59,99 €', montant: 59.99, devise: 'EUR' }, cloud: { texte: '24,99 €', montant: 24.99, devise: 'EUR' },
    premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR' }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR' },
    business_cloud: { texte: '79,99 €', montant: 79.99, devise: 'EUR' } };
  const prixGoogle = (essais) => Object.fromEntries(Object.entries(prixApple).map(([k, v]) => [k, { ...v, essai: essais.includes(k) }]));
  /** Pose l'état de la boutique comme le chargeur natif le ferait (Apple : prix sans clé d'essai, puis l'historique). */
  function poser(canal, { historique = null, essaisGoogle = [] } = {}) {
    if (canal === 'stripe') { PB.poserPrixBoutique(null); return; }
    if (canal === 'google') { PB.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: prixGoogle(essaisGoogle) }); return; }
    PB.poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: prixApple });
    // historique null = la lecture a échoué (chargerEligibiliteApple pose null) : « on ne sait pas ».
    if (EA && typeof PB.poserEligibiliteApple === 'function') PB.poserEligibiliteApple(historique === null ? null : EA.eligibiliteApple(historique, MAINTENANT));
  }
  const etatBoutique = (f) => (typeof PB.etatEssaiBoutique === 'function' ? PB.etatEssaiBoutique(f) : PB.essaiBoutiqueOffert(f));
  const rendreCarte = (modele, f, extra = {}) => {
    const carte = modele.cartes.find((c) => c.formule === f);
    if (!carte) return '';
    return texte(renderToStaticMarkup(h(OAC.CarteFormuleCloud, { carte, lang: 'fr', onChoisir: () => {}, ...extra })));
  };
  const NOMS = { premium_cloud: 'Premium + Cloud', pro_cloud: 'Pro + Cloud', business_cloud: 'Business + Cloud' };
  const PRIX = { premium_cloud: '34,99 €', pro_cloud: '49,99 €', business_cloud: '79,99 €' };
  /**
   * La règle d'un texte de carte NEUVE (souscription) d'après l'oracle :
   *   'essai'        : « 7 jours gratuits » et « 0 € aujourd'hui », jamais « prélevés aujourd'hui » ;
   *   'aujourdhui'   : le prix et « prélevés aujourd'hui », jamais « gratuit » ni « 0 € aujourd'hui » ;
   *   'semaine'      : la boutique offre sa semaine mais l'essai FillSell a servi : « 1 semaine gratuite » ET « premier
   *                    paiement » (la formule ne démarre qu'au 1er paiement), jamais « prélevés aujourd'hui » seul ;
   *   'inconnu'      : les deux issues dites, jamais la pastille « 7 jours gratuits » seule.
   */
  function verifierCarte(nomCas, t, regle, f) {
    const p = PRIX[f];
    if (regle === 'essai') ok(/7 jours gratuits/.test(t) && /0 € aujourd'hui/.test(t) && !/prélevés aujourd'hui/.test(t), `${nomCas} : « 7 jours gratuits », 0 € aujourd’hui`, t);
    else if (regle === 'aujourdhui') ok(t.includes(p) && /prélevés aujourd'hui/.test(t) && !/gratuit|0 € aujourd'hui/.test(t), `${nomCas} : ${p} et « prélevés aujourd’hui », aucun essai promis`, t);
    else if (regle === 'semaine') ok(/1 semaine gratuite/.test(t) && /premier paiement/.test(t) && !/0 € aujourd'hui/.test(t), `${nomCas} : semaine de la boutique SANS formule, démarrage au 1er paiement — dit avant la feuille`, t);
    else if (regle === 'inconnu') ok(/prélevés aujourd'hui/.test(t) && /7 jours gratuits si/.test(t) && !/0 € aujourd'hui/.test(t), `${nomCas} : les deux issues dites, rien d’affirmé`, t);
  }
  const casNeufs = [
    // [nom, canal, historique Apple | offres Google, essai FillSell permis, formule]
    ['web, compte neuf (Stripe : parametresCheckoutFormule essai)', 'stripe', null, true, 'pro_cloud'],
    ['web, essai FillSell déjà pris (d607ba20 après son essai)', 'stripe', null, false, 'pro_cloud'],
    ['web, Business + Cloud (jamais d’essai)', 'stripe', null, true, 'business_cloud'],
    ['iPhone, identifiant Apple vierge', 'apple', HISTORIQUES.vierge, true, 'pro_cloud'],
    ['iPhone, ex-abonné Premium App Store échu SANS offre utilisée (9bcc16d0)', 'apple', HISTORIQUES.premium_echu_sans_offre, true, 'premium_cloud'],
    ['⛔ (b) iPhone, identifiant Apple qui a DÉJÀ eu la semaine de Pro + Cloud', 'apple', HISTORIQUES.pro_cloud_intro, true, 'pro_cloud'],
    ['⛔ (b) iPhone, identifiant Apple ABONNÉ en cours du groupe (785352fe, Pro App Store) sur un autre compte FillSell', 'apple', HISTORIQUES.pro_en_cours_785352fe, true, 'premium_cloud'],
    ['iPhone, essai FillSell déjà pris, Apple offre sa semaine (décision 8)', 'apple', HISTORIQUES.vierge, false, 'pro_cloud'],
    ['iPhone, historique Apple illisible', 'apple', null, true, 'pro_cloud'],
    ['Android, Google rend l’offre d’essai', 'google', ['pro_cloud', 'premium_cloud'], true, 'pro_cloud'],
    ['Android, Google ne rend pas l’offre (compte Google déjà abonné une fois)', 'google', [], true, 'pro_cloud'],
  ];
  for (const [nomCas, canal, hist, essaiPermis, f] of casNeufs) {
    poser(canal, canal === 'google' ? { essaisGoogle: hist } : { historique: hist });
    // L'oracle : Stripe = le serveur (voieFormuleStripe + essai) ; Apple = la règle d'Apple ; Google = l'offre rendue.
    const stripe = canal === 'stripe' ? FS.voieFormuleStripe({ formule: f, essaiPermis }) : null;
    let regle;
    if (canal === 'stripe') regle = stripe.essai ? 'essai' : 'aujourdhui';
    else {
      const boutique = canal === 'apple' ? (hist === null ? null : oracleApple(f, hist)) : hist.includes(f);
      if (boutique === null) regle = OFFRE_INTRO_APPLE.has(f) ? 'inconnu' : 'aujourdhui';
      else if (!boutique) regle = 'aujourdhui';
      else regle = essaiPermis ? 'essai' : 'semaine';
    }
    sur(nomCas, () => {
      const modele = FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: canal, canalAbonnement: null, essaiPermis, essaiBoutique: etatBoutique, canalOuvert: () => true });
      verifierCarte(nomCas, rendreCarte(modele, f, { canalApp: canal }), regle, f);
    });
  }
  PB.poserPrixBoutique(null);

  // ── C. Les abonnés qui ajoutent le Cloud : la date du prélèvement, par canal ─────────────────────────────────────────
  console.log('\nC. Abonnés — montée vers une formule avec Cloud : quand et combien, par canal');
  const ccs = lire('supabase/functions/create-checkout-session/index.ts');
  ok(/proration_behavior: pendantEssai \? "none" : "always_invoice"/.test(ccs), 'Stripe (règle relue) : montée hors essai = always_invoice → la différence est prélevée TOUT DE SUITE');
  sur('Stripe Pro → Business + Cloud', () => {
    poser('stripe');
    const voie = FS.voieFormuleStripe({ formule: 'business_cloud', palierStripe: { id: 's', status: 'active', rang: 2, formule: null }, essaiPermis: true });
    ok(voie.prorata === 'immediat', 'serveur : prorata immédiat');
    const m = FC.cartesFormulesCloud({ palier: 'pro', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: true, canalOuvert: () => true });
    const c = m.cartes.find((x) => x.formule === 'business_cloud');
    const n = FC.texteNoteCarte(c, { T, canalApp: 'stripe', echeance: '1 décembre', nom: 'Business + Cloud', prix: '79,99 €' });
    ok(/prélevée aujourd'hui/.test(n ?? '') && /79,99 €/.test(n ?? ''), 'web, abonné Pro → Business + Cloud : « … est prélevée aujourd’hui sur ta carte, puis 79,99 €/mois »', n);
  });
  sur('Stripe Premium → Premium + Cloud (essai d’abonné)', () => {
    const voie = FS.voieFormuleStripe({ formule: 'premium_cloud', palierStripe: { id: 's', status: 'active', rang: 1, formule: null }, essaiPermis: true });
    ok(voie.voie === 'essai_abonne', 'serveur : essai d’abonné (schedule, create_prorations à la facture suivante)');
    const m = FC.cartesFormulesCloud({ palier: 'premium', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: true, canalOuvert: () => true });
    const c = m.cartes.find((x) => x.formule === 'premium_cloud');
    const n = FC.texteNoteCarte(c, { T, canalApp: 'stripe', palierIci: 'Premium', echeance: '1 décembre', finEssai: '20 novembre', nom: 'Premium + Cloud', prix: '34,99 €' });
    ok(/ne paies que ta formule Premium/.test(n ?? '') && /ajoutée à ta facture du 1 décembre/.test(n ?? '') && !/aujourd'hui/.test(n ?? ''), 'web, abonné Premium : rien prélevé de plus avant sa facture du 1 décembre', n);
  });
  for (const [nomCas, canal, palier, f, attendu] of [
    ['iPhone, abonné Pro App Store (785352fe) → Pro + Cloud', 'apple', 'pro', 'pro_cloud', /Pas d'essai.*49,99 € sont prélevés aujourd'hui sur ton compte Apple/],
    ['Android, abonné Premium Google Play → Premium + Cloud', 'google', 'premium', 'premium_cloud', /Pas d'essai.*différence au prorata est prélevée aujourd'hui, puis 34,99 €\/mois/],
  ]) {
    sur(nomCas, () => {
      poser(canal, canal === 'google' ? { essaisGoogle: [] } : { historique: HISTORIQUES.pro_en_cours_785352fe });
      const m = FC.cartesFormulesCloud({ palier, canalApp: canal, canalAbonnement: canal, essaiPermis: true, essaiBoutique: etatBoutique, canalOuvert: () => true });
      const c = m.cartes.find((x) => x.formule === f);
      ok(c?.essai === false && c?.pastille === false, `${nomCas} : aucun essai (${canal === 'apple' ? 'Apple : « Existing subscribers are not eligible »' : 'Google : offre réservée à qui n’a jamais été abonné'})`);
      const n = FC.texteNoteCarte(c, { T, canalApp: canal, nom: NOMS[f], prix: PRIX[f] });
      ok(attendu.test(n ?? ''), `${nomCas} : la note dit « pas d’essai » et QUAND part le prélèvement`, n);
    });
  }
  sur('iPhone, montée pendant un essai App Store', () => {
    poser('apple', { historique: HISTORIQUES.vierge });
    const m = FC.cartesFormulesCloud({ palier: 'premium', formuleActuelle: 'premium_cloud', canalApp: 'apple', canalAbonnement: 'apple', essaiPermis: false, essaiBoutique: etatBoutique, canalOuvert: () => true, essaiEnCours: true });
    const c = m.cartes.find((x) => x.formule === 'pro_cloud');
    const n = FC.texteNoteCarte(c, { T, canalApp: 'apple', nom: 'Pro + Cloud', prix: '49,99 €' });
    ok(/Ton essai s'arrête/.test(n ?? '') && /49,99 € sont prélevés aujourd'hui/.test(n ?? '') && !/peut/.test(n ?? ''), 'iPhone, Premium + Cloud en essai → Pro + Cloud : « ton essai s’arrête … 49,99 € prélevés aujourd’hui » (Apple : montée immédiate), plus « il peut »', n);
  });
  PB.poserPrixBoutique(null);
  sur('montée d’une formule classique', () => {
    ok(/aujourd'hui sur ta carte/.test(TM.texteMontee('web')) && /aujourd'hui sur ton compte Apple/.test(TM.texteMontee('ios'))
      && /prorata, puis/.test(TM.texteMontee('android')), 'CAS 4 / CAS 5 (Premium → Pro, Pro → Business) : la note dit ce qui part aujourd’hui, par canal');
    const cm = lire('src/components/ConversionModal.jsx');
    ok((cm.match(/<NoteMontee fr=\{fr\} canal=\{plateformeIci\} \/>/g) ?? []).length === 2, 'la note est sous les cartes de montée (CAS 4 et CAS 5)');
  });

  // ── D. Les questions posées AVANT la feuille de la boutique ──────────────────────────────────────────────────────────
  console.log('\nD. Les questions avant la feuille d’Apple / Google (formules et Cloud seul)');
  const supabaseFactice = (prep = { ok: true, essai: false, raison: 'essai_deja_pris' }) => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'j' } } }), refreshSession: async () => ({ data: { session: null } }) },
    rpc: async (n) => ({ data: n === 'cloud_essai_preparer_moi' ? prep : null, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  });
  for (const [nomCas, hist, attendu, interdit] of [
    ['essai FillSell pris, Apple OFFRE sa semaine (identifiant vierge)', HISTORIQUES.vierge, /App Store va t'afficher « 1 semaine gratuite »/, /payé dès aujourd'hui/],
    // La carte a déjà dit « Pas d’essai : 49,99 € prélevés aujourd’hui » (B) : aucune question, surtout pas « 1 semaine gratuite ».
    ['⛔ (b) essai FillSell pris, Apple NE l’offre PAS (semaine déjà prise)', HISTORIQUES.pro_cloud_intro, null, /semaine gratuite/],
    ['essai FillSell pris, historique Apple illisible', null, /Si App Store t'affiche « 1 semaine gratuite ».*Sinon, Pro \+ Cloud est payé dès aujourd'hui/, /^$/],
  ]) {
    await surAsync(nomCas, async () => {
      poser('apple', { historique: hist });
      const questions = [];
      let achatsFormule = 0;
      const achat = ACH.creerAchatFormuleCloud({ supabase: supabaseFactice(), supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: 'u', email: 'u@exemple.fr' }, lang: 'fr', platform: 'ios',
        confirmer: async (q) => { questions.push(q); return false; }, notifier: () => {}, demanderConditions: async () => true, purchasePremium: async () => { achatsFormule++; return { cancelled: true }; } });
      await achat.acheter('pro_cloud', { essaiAffiche: false });
      ok(attendu === null ? questions.every((q) => !interdit.test(q)) && achatsFormule > 0 : (questions.length >= 1 && attendu.test(questions.at(-1)) && !interdit.test(questions.at(-1))),
        `iPhone, ${nomCas} : ${attendu === null ? 'aucune promesse de semaine, la feuille s’ouvre (la carte a dit le prix d’aujourd’hui)' : 'la question dit la vérité avant la feuille'}`, questions.join(' | ') || '(aucune question)');
    });
  }
  for (const [nomCas, hist, prep, attendu] of [
    ['⛔ (b) Cloud seul : essai FillSell permis, mais l’identifiant Apple a déjà eu la semaine (8b457627 sur un 2e compte)', HISTORIQUES.cloud_intro_8b457627, { ok: true, essai: true }, /prélevés aujourd'hui/],
    ['Cloud seul : essai FillSell déjà pris, Apple offre sa semaine', HISTORIQUES.vierge, { ok: true, essai: false, raison: 'essai_deja_pris' }, /va t'afficher « 1 semaine gratuite ».*premier paiement/],
    ['Cloud seul : historique Apple illisible', null, { ok: true, essai: true }, /Apple te dit .* si ta semaine gratuite t'est offerte.*prélevés aujourd'hui/],
  ]) {
    await surAsync(nomCas, async () => {
      poser('apple', { historique: hist });
      const questions = [];
      const achat = ACL.creerAchatCloud({ supabase: supabaseFactice(prep), supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: 'u', email: 'u@exemple.fr' }, lang: 'fr', platform: 'ios',
        confirmer: async (q) => { questions.push(q); return false; }, notifier: () => {}, demanderConditions: async () => true, purchasePremium: async () => ({ cancelled: true }) });
      await achat.acheter('test');
      ok(questions.length === 1 && attendu.test(questions[0]), `iPhone, ${nomCas} : dit avant la feuille d’Apple`, questions.join(' | ') || '(aucune question : la feuille s’ouvrait sur une promesse fausse)');
    });
  }
  PB.poserPrixBoutique(null);

  // ── E. Les mentions sous un écran qui annonce un essai ───────────────────────────────────────────────────────────────
  console.log('\nE. Mentions d’abonnement : jamais « prélevé à la confirmation » sous une carte d’essai');
  sur('mentions', () => {
    const avec = MA.mentionsAbonnement({ canal: 'web', lang: 'fr', essaiAnnonce: true }).texte;
    ok(/à la fin de l'essai gratuit/.test(avec), 'carte d’essai à l’écran : « à la confirmation, ou à la fin de l’essai gratuit quand il est annoncé »', avec);
    const sans = MA.mentionsAbonnement({ canal: 'web', lang: 'fr' }).texte;
    ok(sans === "Abonnements à renouvellement automatique : le prix affiché est prélevé sur ta carte à la confirmation, puis à chaque période, sauf résiliation au moins 24 h avant son terme (Réglages › Abonnement dans FillSell).", 'sans essai à l’écran : la phrase d’avant, mot pour mot', sans);
    ok(/MentionsAbonnement lang=\{fr \? 'fr' : 'en'\} essaiAnnonce=\{modele\.essaiAffiche\}/.test(lire('src/components/ConversionModal.jsx')), 'la vue « Avec Cloud » passe l’essai annoncé aux mentions');
  });

  // ── F. Les mails : chaque phrase = ce que le code fait ───────────────────────────────────────────────────────────────
  console.log('\nF. Mails des formules : promesse retirée, lieu de l’arrêt, accusés, montée, impayé');
  const corps = (m) => [m?.sujet, ...(m?.paragraphes ?? [])].join(' ');
  for (const c of ['stripe', 'apple', 'google']) {
    const m = CM.texteMailFormule({ evenement: 'essai_debut', lang: 'fr', canal: c, faits: { formule: 'pro_cloud', finIso: '2026-11-20T10:00:00Z' }, prix: null });
    ok(!/prévient la veille/.test(corps(m)), `début d’essai Pro + Cloud (${c}) : plus de « On te prévient la veille » (décision 5a)`, corps(m));
    if (c !== 'stripe') ok(!/ou arrêter à tout moment, dans Réglages → Abonnement/.test(corps(m)), `début d’essai (${c}) : l’arrêt n’est pas renvoyé dans Réglages (il se fait chez ${c === 'apple' ? 'Apple' : 'Google Play'})`, corps(m));
  }
  const mAb = CM.texteMailFormule({ evenement: 'essai_debut', lang: 'fr', canal: 'stripe', faits: { formule: 'premium_cloud', finIso: '2026-11-20T10:00:00Z', abonne: true }, prix: null });
  ok(!/prévient la veille/.test(corps(mAb)), 'début d’essai d’abonné : plus de « On te prévient la veille »', corps(mAb));
  const can = lire('supabase/functions/cancel-subscription/index.ts');
  ok(/reprendre/.test(can) && !/formule.*reprendre: true/.test(can), 'serveur (relu) : « Garder le Cloud » (reprendre) ne lève l’arrêt que d’un Cloud SEUL');
  const prog = CM.texteMailFormule({ evenement: 'arret_programme', lang: 'fr', canal: 'stripe', faits: { formule: 'pro_cloud', finIso: '2026-12-01T10:00:00Z' } });
  ok(!/Garder le Cloud/.test(corps(prog)), 'arrêt programmé d’une formule (Stripe) : plus de « Réglages → Abonnement → Garder le Cloud » (ne fait rien pour une formule)', corps(prog));
  const fact = { id: 'in_1', amount_paid: 1250, currency: 'eur', billing_reason: 'subscription_update', lines: { data: [{ period: { start: 1763000000, end: 1764600000 } }] } };
  const evts = CM.evenementPaiementStripe(fact, { id: 'sub_1', metadata: { formule: 'business_cloud' } });
  const mPay = CM.texteMailFormule({ evenement: 'paiement', lang: 'fr', canal: 'stripe', faits: evts[0]?.faits ?? {} });
  ok(!/renouvelée/.test(corps(mPay)) && /prorata/.test(corps(mPay)), 'facture de prorata d’une montée (subscription_update) : plus « {n} est renouvelée »', corps(mPay));
  const arrAb = CM.texteMailFormule({ evenement: 'arret_essai', lang: 'fr', canal: 'stripe', faits: { formule: 'premium_cloud', arreteIso: '2026-11-14T10:00:00Z', aucunPrelevement: true, abonne: true } });
  ok(/Premium continue/.test(corps(arrAb)) && !/Premium \+ Cloud est arrêtée, sans aucun prélèvement/.test(corps(arrAb)), 'arrêt de l’essai d’un abonné : « ta formule Premium continue », plus « Premium + Cloud est arrêtée, sans aucun prélèvement »', corps(arrAb));
  ok(/abonne: true/.test(can.match(/faits: \{ arreteIso: maintenant, aucunPrelevement: true, formule: ea\.formule[^}]*\}/)?.[0] ?? ''), 'cancel-subscription dit au mail que c’est l’essai d’un abonné');
  const imp = CM.texteMailFormule({ evenement: 'impaye', lang: 'fr', canal: 'apple', faits: { formule: 'pro_cloud' } });
  ok(/Pro \+ Cloud est en pause/.test(corps(imp)) && !/^.*le Cloud est en pause\. Dès/.test(corps(imp)), 'impayé d’une formule (Apple) : toute la formule est en pause (impayé = gratuit), plus « le Cloud est en pause » seul', corps(imp));

  // ── G. Résilier sur le web : jamais « Abonnement annulé » pour ce que FillSell n'a pas annulé ────────────────────────
  console.log('\nG. Résiliation web d’un abonné App Store / Google Play / offert, et pendant un essai');
  ok(!/update\(\{ is_premium: false \}\)/.test(can), 'cancel-subscription : plus jamais is_premium=false sur-le-champ quand il n’y a pas de client Stripe');
  ok(/error: "rien_a_resilier"/.test(can) && /paliersVivants\.length === 0\) \{[\s\S]{0,200}return rienAResilier\(\)/.test(can), 'rien de vivant chez Stripe : 409 rien_a_resilier et la phrase vraie (où ça s’arrête), aucune écriture');
  ok(/status === "trialing" && formuleDAbonnementStripe/.test(can), 'une formule EN ESSAI résiliée : arrêtée tout de suite, rien prélevé (plus d’accusé « accès jusqu’au »)');
  const app = lire('src/App.jsx');
  ok(/json\.error==='rien_a_resilier'/.test(app) && /json\.essai_arrete===true/.test(app), 'l’app dit la phrase du serveur, jamais « Abonnement annulé » dans ces cas');
  const spa = lire('src/reglages/SousPageAbonnement.jsx');
  ok(/c\.isPremium && canalFacture === 'apple'/.test(spa) && /c\.isPremium && canalFacture === 'google'/.test(spa) && !/c\.isPremium && c\.plateforme === 'ios' && \(/.test(spa),
    'la bande « géré par Apple / Google » suit le canal QUI FACTURE, plus l’appareil');
  ok(/c\.isPremium && !c\.natif && \(clientStripe !== null \|\| c\.resiliation\.resilie\)/.test(spa) && /useState\(undefined\)/.test(spa), '« Se désabonner » caché dès que la lecture dit « aucun client Stripe » (pendant la lecture, le serveur répond juste : rien_a_resilier)');

  // ── H. Les autres phrases d'argent ────────────────────────────────────────────────────────────────────────────────
  console.log('\nH. Achat non confirmé, offre expirée, « Paiement reçu », « 0 € »');
  const cl = IA.classerIssueAchat(Object.assign(new Error('Google purchase not confirmed by server'), { code: 'SERVEUR_NON_CONFIRME' }));
  const msg = IA.messageIssueAchat(cl, 'fr') ?? '';
  ok(!/rien n'a été débité/.test(msg) && /Ne rachète pas/.test(msg), 'achat fait chez la boutique mais pas confirmé par FillSell : plus jamais « rien n’a été débité »', msg);
  ok(/code:'SERVEUR_NON_CONFIRME'/.test(app), 'App.jsx marque l’achat non confirmé (au lieu de « ❌ Premium not confirmed by server »)');
  const om = lire('src/lib/offreMail.js');
  ok(/FIN_OFFRES = Object\.freeze\(\{ FILLSELL50: Date\.parse\('2026-11-01T00:00:00\+01:00'\) \}\)/.test(om), '« -50 % … jusqu’au 31 octobre » : plus montré après le 31/10');
  ok(typeof TF.textesFormules('fr').achatApprobation === 'function' && typeof TF.textesFormules('fr').essaiAttente === 'function'
    && /essai \? T\.essaiAttente/.test(lire('src/cloud/achatFormuleCloud.js')) && /essaiPermis \? T\.essaiAttente : T\.achatAttente/.test(lire('src/cloud/achatCloud.js')),
  'jamais « Paiement reçu » après un ESSAI (0 prélevé) ni un achat en attente d’approbation');
  ok(/zeroAffiche\('cloud', c\.lang\)/.test(lire('src/entree/EtapeCloud.jsx')), 'parcours d’entrée : « 0 » dans la monnaie de la boutique (plus « 0 € » en dur sur Android)');
  ok(existe('src/lib/eligibiliteApple.js'), 'la règle d’éligibilité Apple a sa source (lib/eligibiliteApple.js)');

  // ── I. (13/11/2026, 3e réponse de Nico, point e) CONDITIONS DU CLOUD, PAGES LÉGALES, SITE — LA RÈGLE DE CHAQUE CANAL ──
  // Oracle : rappel de la veille SUPPRIMÉ (promesse non prouvée, décision 5a puis 3e réponse) ; un seul abonnement par
  // compte, tous canaux (point a) ; la page de paiement du canal (Stripe, App Store, Google Play) dit l'essai, sa fin et le
  // montant AVANT validation ; Apple : arrêt au moins 24 h avant la fin de la période (règle d'Apple), montée = nouveau
  // prix tout de suite, la part non utilisée remboursée au prorata par Apple ; Google et web : différence au prorata ;
  // l'iPhone est ouvert (13/11) ; jamais « en un geste » sans dire OÙ ; la suppression du compte n'arrête PAS un
  // abonnement App Store / Google Play (delete-account n'annule que Stripe).
  console.log('\nI. Conditions du Cloud, pages légales et site : alignés sur la règle de chaque canal');
  const CC = await charger('/src/cloud/conditionsCloud.js');
  const SRVC = await charger('/supabase/functions/_shared/cloud-conditions.js');
  const toutTexte = (c) => [c?.version ?? '', ...(c?.articles ?? []).flatMap((a) => [a.t, ...a.ps])].join(' ');
  for (const lang of ['fr', 'en']) {
    const seul = toutTexte(CC?.conditionsCloud?.(lang));
    const form = toutTexte(CC?.conditionsCloud?.(lang, { formules: true }));
    for (const [nom, t] of [['Cloud seul', seul], ['formules', form]]) {
      ok(t && !/la veille|day before/.test(t), `conditions (${nom}, ${lang}) : plus de rappel promis la veille`, t.slice(0, 300));
      ok(lang === 'en' ? /one FillSell subscription at a time/.test(t) : /un seul abonnement FillSell à la fois/.test(t), `conditions (${nom}, ${lang}) : un seul abonnement par compte, tous canaux`);
      ok(lang === 'en' ? /payment page \(Stripe, App Store or Google Play\)/.test(t) : /page de paiement \(Stripe, App Store ou Google Play\)/.test(t), `conditions (${nom}, ${lang}) : la page de paiement du canal dit l’essai et le montant avant validation`);
    }
    ok(!(lang === 'en' ? /on top of a paid plan/ : /en plus d'un forfait payant/).test(seul), `conditions (Cloud seul, ${lang}) : plus « en plus d’un forfait payant » (un second abonnement)`);
    ok(lang === 'en' ? /at least 24 hours before/.test(seul) : /au moins 24 heures avant/.test(seul), `conditions (Cloud seul, ${lang}) : l’arrêt d’un essai App Store suit la règle d’Apple (24 h avant)`);
    ok(lang === 'en' ? /App Store, the new price/.test(form) && /prorated/.test(form) : /App Store, le nouveau prix/.test(form) && /prorata/.test(form), `conditions (formules, ${lang}) : passer à la version avec Cloud = la règle de chaque canal`);
  }
  ok(SRVC?.CGU_CLOUD_VERSION_MINIMALE === '2026-11-04' && FS.versionCguFormules?.() === '2026-11-12', 'reformulation : les minimales ne bougent pas (Cloud seul 04/11, formules 12/11) — les acceptations restent valables');
  ok(SRVC?.CGU_CLOUD_HISTORIQUE?.[0]?.version > '2026-11-12' && CC?.versionConditionsMontree?.(true) === SRVC.CGU_CLOUD_HISTORIQUE[0].version
    && CC?.versionConditionsMontree?.(false) === SRVC.CGU_CLOUD_HISTORIQUE[0].version, 'changer le texte = changer la VERSION : les deux textes montrés portent la version neuve');
  ok(/reste valable/.test(CC?.ligneDeVersion?.('fr') ?? '') && /remains valid/.test(CC?.ligneDeVersion?.('en') ?? ''), 'la ligne de version dit que l’acceptation précédente reste valable', CC?.ligneDeVersion?.('fr'));
  const TL = await charger('/src/cloud/textesLegaux.js');
  for (const lang of ['fr', 'en']) {
    const a7 = (TL?.textesLegauxCloud?.(lang)?.cgvArticle7?.ps ?? []).join(' ');
    ok(a7 && !/la veille|day before/.test(a7) && !/en un geste|in one tap/.test(a7) && !(lang === 'en' ? /on top of a paid plan/ : /en plus d'un forfait payant/).test(a7),
      `CGV article 7 (${lang}) : ni rappel de la veille, ni « en un geste », ni Cloud « en plus d’un forfait payant »`, a7.slice(0, 300));
    ok(lang === 'en' ? /one FillSell subscription at a time/.test(a7) : /un seul abonnement FillSell à la fois/.test(a7), `CGV article 7 (${lang}) : un seul abonnement par compte`);
  }
  const lg = lire('src/pages/Legal.jsx');
  ok(!/annulation automatique de votre abonnement Premium en cours \(Stripe ou Apple\/Google/.test(lg) && !/Automatic cancellation of your current Premium subscription \(Stripe or Apple\/Google/.test(lg),
    'Legal 4.6 : plus « annulation automatique … Apple/Google » à la suppression du compte (delete-account n’annule que Stripe)');
  ok(/n'arrête pas un abonnement pris dans l'App Store ou Google Play/.test(lg) && /does not stop a subscription taken in the App Store or Google Play/.test(lg), 'Legal 4.6 : la suppression du compte n’arrête pas un abonnement App Store / Google Play — dit, avec où l’arrêter');
  ok(/un seul abonnement FillSell actif à la fois/.test(lg) && /one active FillSell subscription at a time/.test(lg), 'Legal 3.4 : un seul abonnement actif par compte, tous canaux');
  ok(/Dernière mise à jour : 13 novembre 2026/.test(lg) && /Last updated: November 13, 2026/.test(lg), 'Legal : date de mise à jour du 13/11/2026');
  const site = ['site/contenu/fr/accueil.md', 'site/contenu/en/accueil.md', 'site/contenu/fr/tarifs.md', 'site/contenu/en/pricing.md', 'site/contenu/fr/faq.md'].map((p) => [p, lire(p)]);
  for (const [p, t] of site) {
    ok(!/en France, sur Android et sur le web\.|in France, on Android and on the web\./.test(t) && /sur iPhone, sur Android et sur le web|on iPhone, on Android and on the web/.test(t), `${p} : l’iPhone est dit (ouvert le 13/11)`);
    ok(!/(arrêtes le Cloud en un geste|stop the Cloud in one tap)/i.test(t), `${p} : plus « tu arrêtes le Cloud en un geste » sans dire où`);
  }
  const tarifs = lire('site/contenu/fr/tarifs.md'), pricing = lire('site/contenu/en/pricing.md');
  ok(/une fois par identifiant Apple/.test(tarifs) && /once per Apple Account/.test(pricing), 'site (tarifs fr / en) : la règle d’Apple pour la semaine gratuite');
  ok(/Tu l'arrêtes là où tu paies/.test(tarifs) && /You stop it where you pay/.test(pricing), 'site (tarifs fr / en) : où arrêter, par canal');

  // ── J. (13/11/2026, points a et d) Les phrases neuves : refus d'un second abonnement, impayé ────────────────────────
  console.log('\nJ. Les phrases neuves du lot : refus d’un second abonnement, mail d’impayé');
  const USA = await charger('/supabase/functions/_shared/un-seul-abonnement.js');
  for (const d of [{ permis: false, motif: 'autre_canal', canal: 'apple', type: 'palier' }, { permis: false, motif: 'autre_canal', canal: 'stripe', type: 'palier' },
    { permis: false, motif: 'formule_en_cours', canal: 'apple' }, { permis: false, motif: 'cloud_seul_en_cours', canal: 'google' }, { permis: false, motif: 'impaye', canal: 'stripe' }]) {
    for (const lang of ['fr', 'en']) {
      const m = USA?.messageUnSeulAbonnement?.(d, lang) ?? '';
      ok(m && (lang === 'en' ? /Nothing was charged\./ : /Rien n'a été débité\./).test(m) && !/ordinateur|computer|chrome/i.test(m), `refus « ${d.motif} / ${d.canal} » (${lang}) : rien débité, où changer, sans « ordinateur »`, m);
    }
  }
  const PEX = await charger('/supabase/functions/_shared/paiement-echoue.js');
  const impJ = PEX?.texteEchec?.({ lang: 'fr', cause: 'carte_refusee', contexte: 'renouvellement', lienFacture: 'https://invoice.stripe.com/i/x', offre: 'formule_cloud', plan: 'Pro + Cloud' });
  ok(impJ && /Pro \+ Cloud est en pause/.test((impJ.suite ?? []).join(' ')) && /Mes factures/.test((impJ.suite ?? []).join(' ')), 'mail d’impayé Stripe d’une formule avec Cloud : en pause + comment reprendre', JSON.stringify(impJ?.suite));
} finally {
  await vite.close();
}
console.log(`\n${rouges === 0 ? '✓' : '✗'} textes-paiement-verite : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
