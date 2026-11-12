// Verrou du point 4a (12/11/2026, lot « zéro problème », étape 1) : UN ACHAT DE TEST N'ENVOIE JAMAIS DE MAIL À UN CLIENT.
//
//     npm run selftest:store-test-sans-mail   (node scripts/store-test-sans-mail-selftest.mjs)
//
// Le cas réel : le compte de test 5322fa18 a reçu un vrai mail « paiement FillSell Cloud 24,99 € » chaque soir à 18:50
// du 08 au 12/11, chacun né d'un DID_RENEW Apple de l'environnement « Sandbox » (journal des boutiques, lignes 46 à 70 ;
// TestFlight renouvelle tous les jours), plus le rappel de la veille le 07/11. apple-iap-webhook lisait l'environnement
// pour son journal seulement ; Google (testPurchase) avait le même trou, Stripe n'était fermé que par chance.
// Décisions de Nico (12/11) : aucun mail CLIENT ; alerte à support@ gardée, marquée « [TEST] » ; droits gardés.
//
// Ce test prouve, sans réseau ni base ni envoi :
//   1. la règle pure (_shared/environnement-store.js) : Apple Sandbox / Xcode / LocalTesting, Google testPurchase /
//      purchaseType 0 / notification de test, Stripe livemode false = test ; Production, absent, inconnu = PAS test ;
//   2. le VRAI module d'envoi (_shared/cloud-mails-envoi.ts + cloud-mails.js + cloud-alerte-nico.js, exécutés ici, seule
//      la porte d'envoi est remplacée par un enregistreur) rejoue la notification réelle du 12/11 18:50 (ligne 70) :
//      test → 0 mail client, rien réservé pour lui, 1 alerte « [TEST] » ; la même en Production → 1 mail client et une
//      alerte sans « [TEST] » (rien ne change pour un vrai client) ;
//   3. le câblage : chaque appel de mailsCloud / notifierPaiement / alerterPaiementNonCredite des webhooks Apple et
//      Google (et de validate-google-purchase) porte le drapeau ; Apple le lit sur data.environment ; Stripe écarte un
//      événement du mode test AVANT toute écriture ; le rappel de la veille (email-tunnel) écarte un essai de test lu
//      à la source ; l'alerte de paiement à support@ porte « [TEST] » ;
//   4. le lecteur de prix rend l'environnement pour les 3 canaux (Apple déjà ; Google testPurchase ; Stripe livemode).
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, passes = 0;
const ok = (c, m, d) => { if (c) passes++; else { echecs++; console.error(`✗ ${m}${d !== undefined ? ` — ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };

// ── 1. La règle pure ────────────────────────────────────────────────────────────────────────────────────────────────
let regle = null;
try { regle = await import('../supabase/functions/_shared/environnement-store.js'); } catch (e) { ok(false, 'la règle _shared/environnement-store.js existe', String(e?.message ?? e)); }
if (regle) {
  const { notificationDeTest, environnementDeTest } = regle;
  // La ligne réelle du journal (id 70, 12/11 18:50:12) : DID_RENEW app.fillsell.cloud.sub, environnement « Sandbox ».
  ok(notificationDeTest({ canal: 'apple', environnement: 'Sandbox' }) === true, 'Apple « Sandbox » (ligne 70 du journal) = achat de test');
  ok(notificationDeTest({ canal: 'apple', environnement: 'Xcode' }) && notificationDeTest({ canal: 'apple', environnement: 'LocalTesting' }), 'Apple Xcode / LocalTesting = test');
  ok(notificationDeTest({ canal: 'apple', environnement: 'Production' }) === false, 'Apple « Production » = vrai client');
  ok(notificationDeTest({ canal: 'apple', environnement: null }) === false && notificationDeTest({ canal: 'apple' }) === false, 'Apple sans environnement = vrai client (jamais un mail retenu par doute)');
  ok(notificationDeTest({ canal: 'google', achat: { testPurchase: {} } }) === true, 'Google : abonnement d’un testeur de licence (testPurchase) = test');
  ok(notificationDeTest({ canal: 'google', achat: { purchaseType: 0 } }) === true, 'Google : produit ponctuel d’un testeur (purchaseType 0) = test');
  ok(notificationDeTest({ canal: 'google', achat: { purchaseType: 1 } }) === false, 'Google : code promo (purchaseType 1) = vrai client');
  ok(notificationDeTest({ canal: 'google', achat: { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' } }) === false, 'Google : achat ordinaire = vrai client');
  ok(notificationDeTest({ canal: 'google', testNotification: { version: '1.0' } }) === true, 'Google : notification de test de la console = test');
  ok(notificationDeTest({ canal: 'stripe', livemode: false }) === true && notificationDeTest({ canal: 'stripe', livemode: true }) === false, 'Stripe : livemode false = test, true = réel');
  ok(notificationDeTest({ canal: 'stripe' }) === false, 'Stripe : livemode absent = réel (jamais un mail retenu par doute)');
  ok(notificationDeTest({ canal: 'offert', environnement: 'Sandbox' }) === false, 'canal sans boutique : jamais test');
  ok(environnementDeTest('test') && environnementDeTest(' sandbox ') && !environnementDeTest('production') && !environnementDeTest('') && !environnementDeTest(undefined),
    'environnementDeTest : « test », « Sandbox » (casse et espaces) oui ; production, vide, absent non');
}

// ── 2. Le vrai module d'envoi rejoue la notification réelle ─────────────────────────────────────────────────────────
// Seules la porte d'envoi (desinscription.ts : Resend + base) et la mise en page (emails-fillsell.ts) sont remplacées
// par un enregistreur ; les règles (cloud-mails.js, cloud-alerte-nico.js, cloud-mails-envoi.ts) sont le code réel.
globalThis.__envois = [];
const STUB_ENVOI = 'data:text/javascript,' + encodeURIComponent(
  'export async function envoyerEmail(e) { globalThis.__envois.push(e); return { envoye: true }; }');
const STUB_GABARIT = 'data:text/javascript,' + encodeURIComponent(
  'export const langue = (l) => (l === "en" ? "en" : "fr"); export const mailCloud = (t) => ({ sujet: t?.sujet ?? "mail", html: "<p>mail</p>", ...t });');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL && /cloud-mails-envoi\.ts$/.test(context.parentURL)) {
      if (/\/desinscription\.ts$/.test(specifier)) return { url: STUB_ENVOI, shortCircuit: true };
      if (/\/emails-fillsell\.ts$/.test(specifier)) return { url: STUB_GABARIT, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const envoiMod = await import(pathToFileURL(`${RACINE}supabase/functions/_shared/cloud-mails-envoi.ts`).href);
const { evenementsBoutique } = await import('../supabase/functions/_shared/cloud-mails.js');

// Un faux client Supabase : le registre cloud_mails (réservations) et la lecture du profil.
function adminFactice() {
  const registre = [];
  const admin = {
    registre,
    from(table) {
      const q = {
        _table: table, _op: null, _ligne: null,
        insert(l) { this._op = 'insert'; this._ligne = l; return this; },
        update() { this._op = 'update'; return this; },
        delete() { this._op = 'delete'; return this; },
        select() { this._op = this._op ?? 'select'; return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: { email: 'test@fillsell.app', lang: 'fr', is_premium: true, is_pro: true }, error: null }); },
        then(res, rej) {
          if (this._table === 'cloud_mails' && this._op === 'insert') registre.push(this._ligne);
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
  return admin;
}
// La notification réelle (ligne 70) : DID_RENEW du Cloud, même référence que celle du profil → « paiement », renouvellement.
const REF = '2000001262935799';
const evenements = evenementsBoutique({
  canal: 'apple', nature: 'paiement',
  avant: { cloud_canal: 'apple', cloud_ref: REF, is_cloud: false, cloud_essai_debut: '2026-11-07T17:51:05Z', cloud_essai_arrete: true },
  update: { is_cloud: true, cloud_ref: REF, cloud_canal: 'apple' },
  lecture: { essai: false, fin: '2026-11-13T17:51:00Z', transaction: '2000001266000070', montantPaye: { montant: 24.99, devise: 'EUR' } },
  ref: REF,
});
ok(evenements.length === 1 && evenements[0].evenement === 'paiement', 'la notification réelle produit bien l’événement « paiement » (celui qui partait chaque soir)', evenements);

const enTest = regle ? regle.notificationDeTest({ canal: 'apple', environnement: 'Sandbox' }) : false;
globalThis.__envois = [];
const adminT = adminFactice();
const bilanT = await envoiMod.mailsCloud(adminT, { userId: '00000000-0000-4000-8000-000000000070', email: 'test@fillsell.app', lang: 'fr', canal: 'apple', evenements, journal: '[selftest]', test: enTest });
const clientsT = globalThis.__envois.filter((e) => e.userId != null);
const alertesT = globalThis.__envois.filter((e) => e.userId == null);
ok(clientsT.length === 0, 'Sandbox : AUCUN mail client (le « paiement 24,99 € » de 18:50 ne part plus)', clientsT.map((e) => e.type));
ok(!adminT.registre.some((l) => !String(l.cle).startsWith('alerte:')), 'Sandbox : rien réservé pour un mail client dans cloud_mails', adminT.registre);
ok(alertesT.length === 1 && /^\[TEST\] /.test(alertesT[0].subject ?? ''), 'Sandbox : l’alerte à support@ part, sujet « [TEST] … »', alertesT.map((e) => e.subject));
ok(alertesT.length === 1 && /Achat de TEST/.test(alertesT[0].html ?? ''), 'Sandbox : l’alerte dit « Achat de TEST … aucun mail envoyé au client »');
ok(Array.isArray(bilanT) && bilanT.every((l) => l.resultat === 'retenu_achat_de_test'), 'Sandbox : le bilan dit « retenu_achat_de_test »', bilanT);

globalThis.__envois = [];
const adminP = adminFactice();
await envoiMod.mailsCloud(adminP, { userId: '00000000-0000-4000-8000-000000000071', email: 'client@exemple.fr', lang: 'fr', canal: 'apple', evenements, journal: '[selftest]', test: false });
const clientsP = globalThis.__envois.filter((e) => e.userId != null);
const alertesP = globalThis.__envois.filter((e) => e.userId == null);
ok(clientsP.length === 1 && clientsP[0].type === 'cloud_paiement', 'Production : le vrai client reçoit toujours son mail « paiement » (rien ne change)', clientsP.map((e) => e.type));
ok(alertesP.length === 1 && !/\[TEST\]/.test(alertesP[0].subject ?? ''), 'Production : l’alerte à support@ sans « [TEST] »', alertesP.map((e) => e.subject));

// ── 3. Le câblage ───────────────────────────────────────────────────────────────────────────────────────────────────
const appels = (src) => {
  const out = [];
  const re = /(mailsCloud\(supabaseAdmin, \{|notifierPaiement\(\{|alerterPaiementNonCredite\(\{)/g;
  let m;
  while ((m = re.exec(src))) {
    // L'objet passé : jusqu'à la parenthèse fermante équilibrée.
    let i = m.index + m[0].length - 1, prof = 0, fin = i;
    for (; fin < src.length; fin++) { const c = src[fin]; if (c === '{') prof++; else if (c === '}') { prof--; if (prof === 0) break; } }
    out.push({ appel: m[1], corps: src.slice(i, fin + 1), ligne: src.slice(0, m.index).split('\n').length });
  }
  return out;
};
for (const [f, motif] of [
  ['supabase/functions/apple-iap-webhook/index.ts', /\btest(: enTest)?\b/],
  ['supabase/functions/google-play-webhook/index.ts', /\btest: deTest\(purchase\)/],
  ['supabase/functions/validate-google-purchase/index.ts', /\btest: deTest\(purchase\)/],
]) {
  const src = lire(f);
  const a = appels(src);
  const sans = a.filter((x) => !motif.test(x.corps));
  ok(a.length > 0 && sans.length === 0, `${f} : les ${a.length} appels (mails Cloud, alertes de paiement) portent le drapeau « achat de test »`, sans.map((x) => `l.${x.ligne} ${x.appel}`));
}
const apple = lire('supabase/functions/apple-iap-webhook/index.ts');
ok(/const enTest = notificationDeTest\(\{ canal: "apple", environnement: data\?\.environment \?\? null \}\);/.test(apple), 'Apple : le drapeau est lu sur data.environment de la notification');
ok(/natureRemb, test: enTest,\n\s*\}\);/.test(apple) && /const test = p\.test === true;/.test(apple), 'Apple : planApple (formules) reçoit et utilise le drapeau');
const google = lire('supabase/functions/google-play-webhook/index.ts');
ok(/const deTest = \(achat: any\): boolean => notificationDeTest\(\{ canal: "google", achat \}\);/.test(google), 'Google : le drapeau est lu sur l’achat relu chez Google (testPurchase, purchaseType)');
const stripe = lire('supabase/functions/stripe-webhook/index.ts');
const iGarde = stripe.indexOf('if (notificationDeTest({ canal: "stripe", livemode:');
const iClient = stripe.indexOf('const supabase = createClient(', stripe.indexOf('serve(async (req) =>'));
ok(iGarde > 0 && iClient > iGarde, 'Stripe : un événement du mode test est écarté AVANT toute lecture ou écriture en base');
ok(/ignore: "mode_test"/.test(stripe) && /test: true, type: "abonnement", produit: event\.type/.test(stripe), 'Stripe : réponse 200 « mode_test » et alerte marquée « [TEST] »');
const tunnel = lire('supabase/functions/email-tunnel/index.ts');
const iRenouv = tunnel.indexOf('if (lu.renouvelle === false)');
const iTest = tunnel.indexOf('if (environnementDeTest(lu.environnement)) { compter(rien, "achat_de_test"); continue; }');
const iEnvoi = tunnel.indexOf('const m = mailRappelVeilleCloud(', iRenouv);
ok(iTest > iRenouv && iTest < iEnvoi && iTest < tunnel.indexOf('if (dry) { envoyes.push', iRenouv), 'email-tunnel : le rappel de la veille d’un essai de test (lu à la source) ne part jamais, avant même le mode à blanc');
ok(/subject: `\$\{a\.test === true \? "\[TEST\] " : ""\}/.test(tunnel), 'email-tunnel : l’alerte de paiement à support@ porte « [TEST] » pour un achat de test');
const notify = lire('supabase/functions/_shared/payment-notify.ts');
ok(/\n  test\?: boolean;\n\};/.test(notify), 'payment-notify : le contrat d’alerte transporte le drapeau');

// ── 4. Le lecteur de prix rend l'environnement des 3 canaux ─────────────────────────────────────────────────────────
const { lirePrixCloud } = await import('../supabase/functions/_shared/cloud-prix.js');
const { PRODUIT_CLOUD_GOOGLE } = await import('../supabase/functions/_shared/cloud-option.js');
const reponse = (corps) => ({ ok: true, status: 200, json: async () => corps });
const ligneG = { productId: PRODUIT_CLOUD_GOOGLE, autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { units: '24', nanos: 990000000, currencyCode: 'EUR' } } };
const g = await lirePrixCloud({ canal: 'google', ref: 'jeton', deps: { fetch: async () => reponse({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', testPurchase: {}, lineItems: [ligneG] }), jetonGoogle: async () => 'j' } });
const gP = await lirePrixCloud({ canal: 'google', ref: 'jeton', deps: { fetch: async () => reponse({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [ligneG] }), jetonGoogle: async () => 'j' } });
ok(g.environnement === 'test' && gP.environnement === 'production', 'lecteur de prix Google : testPurchase → « test », sinon « production »', [g.environnement, gP.environnement]);
const sub = (livemode) => ({ livemode, status: 'active', items: { data: [{ price: { unit_amount: 2499, currency: 'eur', recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 }] } });
const s = await lirePrixCloud({ canal: 'stripe', ref: 'sub_1', deps: { fetch: async () => reponse(sub(false)), cleStripe: 'sk' } });
const sP = await lirePrixCloud({ canal: 'stripe', ref: 'sub_1', deps: { fetch: async () => reponse(sub(true)), cleStripe: 'sk' } });
ok(s.environnement === 'test' && sP.environnement === 'production', 'lecteur de prix Stripe : livemode false → « test », sinon « production »', [s.environnement, sP.environnement]);
ok(g.prix?.montant === 24.99 && sP.prix?.montant === 24.99, 'lecteur de prix : le montant ne change pas (24,99)');

console.log(`${echecs === 0 ? '✓' : '✗'} store-test-sans-mail : ${passes} vert(s), ${echecs} rouge(s)`);
process.exit(echecs === 0 ? 0 : 1);
