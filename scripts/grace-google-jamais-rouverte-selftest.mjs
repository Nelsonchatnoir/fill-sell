// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 (3e réponse de Nico, point c) — LA GRÂCE GOOGLE N'EST JAMAIS ROUVERTE À TORT
//     npm run selftest:grace-google-jamais-rouverte
// ═══════════════════════════════════════════════════════════════════════════
// Constat (audit du 13/11, R3) : validate-google-purchase (appelée à chaque achat ET à chaque « Restaurer mes achats »
// Android) comptait SUBSCRIPTION_STATE_IN_GRACE_PERIOD comme « actif » et ROUVRAIT le palier et le Cloud, alors que
// google-play-webhook les coupe à la notification 6 (IN_GRACE_PERIOD) et 5 (ON_HOLD) — règle de Nico du 29/10
// (« un impayé repasse en gratuit », tous canaux : Stripe past_due, Apple DID_FAIL_TO_RENEW, Google grâce et suspension).
// Un impayé Google qui ouvrait l'app sur Android retrouvait donc son Pro et son Cloud jusqu'à la notification suivante.
// La règle de GOOGLE, relue le 13/11 (developer.android.com/google/play/billing/lifecycle/subscriptions) : « During a grace
// period, the user should still have access to their subscription entitlement » ; « If the user does not fix their payment
// method during the grace period, the subscription enters account hold, and they lose entitlement ». Google RECOMMANDE
// donc de garder l'accès pendant la grâce ; FillSell la coupe par décision de Nico (29/10) — le choix est repris ici
// comme une règle UNIQUE pour les deux chemins (webhook et validation), et dit à Nico dans le rapport (question).
// L'oracle : la règle FillSell écrite ici (pas importée) — ACTIVE → oui ; CANCELED payé jusqu'à une fin à venir → oui ;
// IN_GRACE_PERIOD, ON_HOLD, PAUSED, PENDING, EXPIRED, CANCELED échu → non.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
};
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const MAINTENANT = Date.parse('2026-11-13T12:00:00+01:00');
const ORACLE = {
  SUBSCRIPTION_STATE_ACTIVE: true, SUBSCRIPTION_STATE_IN_GRACE_PERIOD: false, SUBSCRIPTION_STATE_ON_HOLD: false,
  SUBSCRIPTION_STATE_PAUSED: false, SUBSCRIPTION_STATE_PENDING: false, SUBSCRIPTION_STATE_EXPIRED: false,
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: false,
};

console.log('A. La règle exécutée (droits-canaux.js, abonnementGoogleActif)');
const D = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/droits-canaux.js')).href);
const ligne = (fin) => ({ lineItems: [{ productId: 'app.fillsell.pro.sub', expiryTime: fin }] });
for (const [etat, attendu] of Object.entries(ORACLE)) {
  ok(D.abonnementGoogleActif({ subscriptionState: etat, ...ligne('2026-11-20T10:00:00Z') }, MAINTENANT) === attendu, `${etat} (fin à venir) → ${attendu ? 'droit ouvert' : 'droit coupé'}`);
}
ok(D.abonnementGoogleActif({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', ...ligne('2026-11-20T10:00:00Z') }, MAINTENANT) === true, 'CANCELED payé jusqu’au 20/11 → droit ouvert jusqu’à la fin payée');
ok(D.abonnementGoogleActif({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', ...ligne('2026-11-01T10:00:00Z') }, MAINTENANT) === false, 'CANCELED échu → droit coupé');

console.log('\nB. validate-google-purchase suit CETTE règle (palier, formule avec Cloud, Cloud seul)');
const v = lire('supabase/functions/validate-google-purchase/index.ts');
const code = v.replace(/^\s*\/\/.*$/gm, '');
ok(!/ETATS_ACTIFS\s*=\s*\[[^\]]*IN_GRACE_PERIOD/.test(code), 'plus de liste d’états « actifs » qui contient IN_GRACE_PERIOD');
ok(/const actif = abonnementGoogleActif\(purchase\)/.test(code), '« actif » = abonnementGoogleActif(purchase) (la même règle que la garde des doubles abonnements)');
ok(/const terminal = \/EXPIRED\|PENDING_PURCHASE_CANCELED\//.test(code), 'la grâce reste un arrêt PASSAGER : le jeton est gardé (la reprise RECOVERED arrive dessus)');

console.log('\nC. Le webhook dit la même chose (aucune régression)');
const w = lire('supabase/functions/google-play-webhook/index.ts');
const off = /PREMIUM_OFF_TYPES\s*=\s*\[([^\]]*)\]/.exec(w)?.[1] ?? '';
ok(/\b5\b/.test(off) && /\b6\b/.test(off), 'google-play-webhook : 5 (ON_HOLD) et 6 (IN_GRACE_PERIOD) coupent le droit', off);

console.log(`\n${rouges === 0 ? '✓' : '✗'} grace-google-jamais-rouverte : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
