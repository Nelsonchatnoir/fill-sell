// ═══════════════════════════════════════════════════════════════════════════
// ACHATS APPLE ET GOOGLE : L'ISSUE DE CHAQUE TENTATIVE — `npm run selftest:achats-store-issue`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A8). L'app journalisait l'OUVERTURE d'un achat, jamais son ISSUE
// (Simon BORGET 11/10, Ciddjy 07/10). Et l'annulation n'était jamais
// reconnue : @capgo/native-purchases rejette par MESSAGE (« User cancelled »),
// le code attendait USER_CANCELLED. Et le passage Premium → Pro de Ciddjy
// (Apple, même groupe d'abonnement) arrivait en DID_CHANGE_RENEWAL_PREF /
// UPGRADE, jeté par le webhook : payé Pro, resté Premium.
//   1. lib/issueAchat.js : annulé / en attente / erreur + code, sur les vrais
//      messages du plugin (lus dans node_modules : iOS, Android) ;
//   2. lib/iap.js : une annulation rend { cancelled }, jamais une erreur ;
//   3. App.jsx : une ligne usage_logs « checkout_issue » à CHAQUE issue
//      (réussi, annulé, en attente, erreur + code + étape), annulation muette ;
//   4. notifications Apple et Google : CHAQUE (type, sous-type) a sa décision
//      (_shared/notifications-stores.js) — UPGRADE = achat immédiat du nouveau
//      produit, DOWNGRADE rien maintenant ; les effets d'avant inchangés ; un
//      inconnu n'est jamais appliqué, il est enregistré et signalé ;
//   5. le journal ne bloque jamais un paiement (best-effort, avalé) ;
//   6. le paiement par carte (Stripe) n'est pas touché.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const I = await import(pathToFileURL(join(RACINE, 'src/lib/issueAchat.js')).href);
const D = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/notifications-stores.js')).href);

let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

console.log('1. Les messages RÉELS du plugin');
const swift = 'node_modules/@capgo/native-purchases/ios/Sources/NativePurchasesPlugin/NativePurchasesPlugin.swift';
const java = 'node_modules/@capgo/native-purchases/android/src/main/java/ee/forgr/nativepurchases/NativePurchasesPlugin.java';
if (existsSync(join(RACINE, swift))) verifier(/"User cancelled"/.test(lire(swift)) && /"Transaction pending"/.test(lire(swift)), 'iOS rejette « User cancelled » / « Transaction pending » (message, pas de code)');
if (existsSync(join(RACINE, java))) verifier(/"Purchase is not purchased"/.test(lire(java)) && /"Purchase is pending"/.test(lire(java)), 'Android rejette « Purchase is not purchased » / « Purchase is pending »');
verifier(I.classerIssueAchat(new Error('User cancelled')).issue === 'annule', 'iOS « User cancelled » → annulé');
verifier(I.classerIssueAchat({ code: 'USER_CANCELLED', message: '' }).issue === 'annule', 'code USER_CANCELLED (ancien contrat) → annulé');
verifier(I.classerIssueAchat(new Error('Transaction pending')).issue === 'en_attente', 'iOS « Transaction pending » → en attente');
verifier(I.classerIssueAchat(new Error('Purchase is pending')).issue === 'en_attente', 'Android « Purchase is pending » → en attente');
const g = I.classerIssueAchat(new Error('Purchase is not purchased'));
verifier(g.issue === 'erreur' && g.code === 'GOOGLE_NON_ACHETE', 'Android « Purchase is not purchased » → erreur GOOGLE_NON_ACHETE (annulation et refus indiscernables sans binaire neuf : jamais inventé)');
verifier(I.classerIssueAchat({ message: 'BILLING_SETUP_FAILED', code: 'Billing service unavailable' }).code === 'BILLING_SETUP_FAILED', 'Android BILLING_SETUP_* (message et code inversés par le plugin) → le vrai code');
verifier(I.classerIssueAchat(new Error('Cannot find product for id app.fillsell.pro2.sub')).code === 'PRODUIT_INTROUVABLE', 'produit introuvable → code lisible');
verifier(I.classerIssueAchat(new Error('Premium not confirmed by server')).code === 'PREMIUM_NOT_CONFIRMED_BY_SERVER', 'confirmation serveur manquée → erreur avec son code');

console.log('\n2. lib/iap.js');
const iap = lire('src/lib/iap.js');
verifier(/const issue = classerIssueAchat\(e\);\s*\n\s*if \(issue\.issue === 'annule'\) return \{ isPremium: false, receipt: null, cancelled: true, issue \};/.test(iap), 'purchasePremium : une annulation rend { cancelled }, jamais une erreur');
verifier(/enAttente: true/.test(iap) && /e\.issueAchat = issue/.test(iap), 'en attente rendu ; une erreur porte sa classification');
verifier((iap.match(/classerIssueAchat\(e\)/g) ?? []).length >= 2, 'purchaseCoins : même reconnaissance de l’annulation');

console.log('\n3. App.jsx : une ligne par issue');
const app = lire('src/App.jsx');
const bloc = app.slice(app.indexOf('async function handleIAPPurchase('), app.indexOf('async function handleIAPPurchase(') + 12000);
verifier(/logTunnel\('checkout_issue',/.test(bloc), 'feature usage_logs « checkout_issue »');
verifier(/issueTunnel\('annule'/.test(bloc) && /issueTunnel\('en_attente'/.test(bloc) && /issueTunnel\('reussi'\)/.test(bloc) && /issueTunnel\(cl\.issue==='erreur'\?'erreur':cl\.issue,\{code:cl\.code/.test(bloc), 'réussi, annulé, en attente, erreur (avec code) : chaque issue écrite');
verifier(/etapeAchat='validation_google'|etapeAchat=platform==='android'\?'validation_google':'confirmation_serveur'/.test(bloc) && /passage/.test(bloc), 'l’étape (store, validation Google, confirmation serveur) et la montée de palier sont dites');
verifier(/return; \/\/ annulé par la personne : aucun message d'erreur/.test(bloc), 'une annulation n’affiche plus « ❌ User cancelled »');
verifier(!/checkout_issue/.test(lire('src/pages/Cancel.jsx')) && !/issueTunnel/.test(app.slice(app.indexOf('function startTierCheckout('), app.indexOf('function startTierCheckout(') + 6000)), 'le chemin carte (Stripe) n’est pas touché');

console.log('\n4. Chaque notification a sa décision');
verifier(D.decisionApple('DID_CHANGE_RENEWAL_PREF', 'UPGRADE').effet === 'on', 'Apple DID_CHANGE_RENEWAL_PREF / UPGRADE = passage immédiat (on)');
verifier(D.decisionApple('DID_CHANGE_RENEWAL_PREF', 'DOWNGRADE').effet === 'aucun_effet' && D.decisionApple('DID_CHANGE_RENEWAL_PREF', null).effet === 'aucun_effet', 'DOWNGRADE (effet au renouvellement) : rien maintenant');
// Zéro régression : les effets des types déjà traités (PREMIUM_ON / PREMIUM_OFF du webhook).
const wh = lire('supabase/functions/apple-iap-webhook/index.ts');
const liste = (nom) => ((wh.match(new RegExp(`const ${nom}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '').match(/"([A-Z_]+)"/g) ?? []).map((x) => x.replace(/"/g, ''));
const on = liste('PREMIUM_ON'), off = liste('PREMIUM_OFF');
verifier(on.length >= 3 && off.length >= 3, 'les listes d’avant sont lues dans le webhook', `on=${on} off=${off}`);
const sousTypes = (t) => Object.keys(D.APPLE_DECISIONS[t] ?? {}).map((k) => (k === 'null' ? null : k));
verifier(on.every((t) => sousTypes(t).length > 0 && sousTypes(t).every((st) => D.decisionApple(t, st).effet === 'on')), 'Apple : chaque type « on » d’avant reste « on », tout sous-type connu compris', on.join(','));
verifier(off.every((t) => sousTypes(t).length > 0 && sousTypes(t).every((st) => D.decisionApple(t, st).effet === 'off')), 'Apple : chaque type « off » d’avant reste « off »', off.join(','));
verifier(D.decisionApple('DID_FAIL_TO_RENEW', 'GRACE_PERIOD').effet === 'off', 'DID_FAIL_TO_RENEW / GRACE_PERIOD reste « off » (comme avant le 12/10)');
verifier(!D.decisionApple('UN_TYPE_NEUF', null).connu && !D.decisionApple('DID_RENEW', 'SOUS_TYPE_NEUF').connu, 'Apple : un type ou un sous-type inconnu → connu = false (jamais appliqué)');
const gw = lire('supabase/functions/google-play-webhook/index.ts');
const nombres = (nom) => (gw.match(new RegExp(`const ${nom}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '').split(',').map(Number).filter(Boolean);
const gOn = nombres('PREMIUM_ON_TYPES'), gOff = nombres('PREMIUM_OFF_TYPES');
verifier(gOn.length >= 3 && gOff.length >= 3 && gOn.every((n) => D.decisionGoogle(n).effet === 'on') && gOff.every((n) => D.decisionGoogle(n).effet === 'off') && D.decisionGoogle(3).effet === 'annulation', 'Google : la table dit la même chose que le webhook (on, off, annulation)', `on=${gOn} off=${gOff}`);
verifier(!D.decisionGoogle(99).connu, 'Google : un type inconnu → connu = false');
verifier(/decisionNotif\.effet === "on"\) isPremium = true;/.test(wh) && /if \(PRO_PRODUCT_IDS\.includes\(productId\)\) update\.is_pro = isPremium;/.test(wh) && /upgrade_monthly_grant/.test(wh), 'l’UPGRADE passe par la même écriture (is_pro) et la même dotation qu’un achat');
verifier(/if \(!decisionNotif\.connu\) \{\s*\n\s*await signalerNotificationStoreInconnue/.test(wh) && /if \(!decisionJ\.connu\) \{\s*\n\s*await signalerNotificationStoreInconnue/.test(gw), 'Apple ET Google : un inconnu est signalé (alerte support@)');
verifier(/journaliserNotificationStore\(supabaseAdmin, ligneJournal\(/.test(wh) && /journaliserNotificationStore\(supabaseAdmin, ligneJournal\(/.test(gw), 'Apple ET Google : chaque notification est enregistrée');

console.log('\n4 bis. Un remboursement est signalé comme tel (29/10, boncoin59300)');
{
  const rv = D.decisionGoogleRemboursement({ purchaseToken: 'x', orderId: 'GPA.3369-1510-4339-09469', productType: 1, refundType: 1 });
  verifier(rv.connu === true && rv.effet === 'remboursement' && rv.type === 'abonnement' && rv.partiel === false && rv.nom === 'REMBOURSEMENT_ABONNEMENT_TOTAL', 'voidedPurchase (abonnement, total) : connu, « remboursement », jamais « inconnu »', JSON.stringify(rv));
  const rp = D.decisionGoogleRemboursement({ productType: 2, refundType: 2 });
  verifier(rp.type === 'pack' && rp.partiel === true && rp.connu === true, 'voidedPurchase (achat ponctuel, partiel) : pack, partiel');
  verifier(D.natureRemboursementApple('REFUND') === 'remboursement' && D.natureRemboursementApple('REVOKE') === 'retrait' && D.natureRemboursementApple('EXPIRED') === null, 'Apple : REFUND = remboursement, REVOKE = retrait, le reste n\'en est pas');
  const iAnnule = gw.indexOf('const annule = notification.voidedPurchaseNotification;');
  const iSortie = gw.indexOf('return json(200, { ok: true, remboursement: d.nom });', iAnnule);
  verifier(iAnnule > 0 && iSortie > iAnnule && /signalerRemboursementStore\(/.test(gw.slice(iAnnule, iSortie)) && !/alerterPaiementNonCredite\(/.test(gw.slice(iAnnule, iSortie)),
    'Google : un remboursement part en « Remboursement », jamais en « PAIEMENT NON ENREGISTRÉ »');
  verifier(/eq\("google_purchase_token", jeton\)/.test(gw) && /eq\("jeton_empreinte", empreinte\)/.test(gw), 'Google : le compte se retrouve par le jeton d\'achat (profil, puis empreinte au journal)');
  verifier(/if \(!appAccountToken && natureRemb\)/.test(wh) && /eq\("apple_original_transaction_id", originalTransactionId\)/.test(wh), 'Apple : remboursement sans appAccountToken → compte par la transaction d\'origine, pas « paiement non enregistré »');
  const pnR = lire('supabase/functions/_shared/payment-notify.ts');
  verifier(/export async function signalerRemboursementStore\([\s\S]{0,900}auPlus\(envoi, DELAI_JOURNAL_MS\)/.test(pnR), 'le signalement d\'un remboursement est borné à 2 s, avalé');
  const et = lire('supabase/functions/email-tunnel/index.ts');
  verifier(/if \(body\?\.store_remboursement\)/.test(et) && /type: "ops_remboursement"/.test(et) && !/PAIEMENT NON ENREGISTRÉ/.test(et.slice(et.indexOf('if (body?.store_remboursement)'), et.indexOf('// ── Paiement échoué (2026-08-07)'))),
    'email-tunnel : alerte « Remboursement » à part (ops_remboursement), sans le mot « paiement non enregistré »');
}

console.log('\n5. Le journal ne bloque jamais un paiement');
const pn = lire('supabase/functions/_shared/payment-notify.ts');
const jn = pn.slice(pn.indexOf('export async function journaliserNotificationStore('), pn.indexOf('// ── Paiement ÉCHOUÉ'));
verifier(jn.length > 50 && /try \{[\s\S]*insert\(ligne\)[\s\S]*\} catch \(e\) \{[\s\S]*console\.error/.test(jn) && !/throw/.test(jn), 'journaliserNotificationStore : tout est avalé (erreur rendue OU exception), jamais relancé');
verifier(/auPlus\(admin\.from\("stores_notifications_journal"\)\.insert\(ligne\), DELAI_JOURNAL_MS\)/.test(jn) && /const r = await auPlus\(alerterPaiementNonCredite\(/.test(pn) && /const DELAI_JOURNAL_MS = 2000;/.test(pn), 'journal ET signalement bornés à 2 s : une base ou un réseau qui ne répond pas ne retient jamais le paiement (banc : mode « bloque »)');
verifier(/async function envoyer\([\s\S]{0,700}\} catch \(e\) \{/.test(pn), 'le signalement passe par envoyer(), qui avale tout (règle 1 de payment-notify)');
verifier(/notificationUUID/.test(wh), 'Apple : l’identifiant de la notification est gardé (rejeu traçable)');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
