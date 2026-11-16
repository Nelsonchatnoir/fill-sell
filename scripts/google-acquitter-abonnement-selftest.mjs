// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 16/11/2026 SOIR — UN ABONNEMENT GOOGLE PLAY PAYÉ APRÈS UNE VALIDATION BANCAIRE EST ACQUITTÉ PAR LE SERVEUR
//     npm run selftest:google-acquitter-abonnement
// ═══════════════════════════════════════════════════════════════════════════
// Constat (lecture du code, 16/11) : un abonnement en attente pendant la feuille (validation bancaire), puis ACHETÉ, n'était
// acquitté par personne — le module n'acquitte que dans la feuille, google-play-webhook et validate-google-purchase
// n'acquittaient que les packs. Google rembourse au bout de 3 jours. Ce test prouve la règle pure et son branchement.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 300)}` : ''}`); } };
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let A = null;
try { A = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/google-acquitter-abonnement.js')).href); } catch (e) { console.log(`  (module absent : ${e.message.slice(0, 100)})`); }

console.log('\nA. La règle');
const actif = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', lineItems: [{ productId: 'app.fillsell.premium.cloud' }] };
ok(A?.abonnementAAcquitter?.(actif) === true, 'actif et pas encore acquitté → à acquitter');
ok(A?.abonnementAAcquitter?.({ ...actif, subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }) === true, 'en période de grâce → à acquitter');
ok(A?.abonnementAAcquitter?.({ ...actif, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }) === false, 'déjà acquitté → rien');
ok(A?.abonnementAAcquitter?.({ ...actif, subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }) === false, 'encore en attente (banque) → rien (Google ne le permet pas)');
ok(A?.abonnementAAcquitter?.(null) === false && A?.abonnementAAcquitter?.({}) === false, 'réponse vide → rien');

console.log('\nB. L\'appel');
{
  const appels = [];
  const fetchImpl = async (url, init) => { appels.push({ url, init }); return { ok: true, status: 204 }; };
  const r = await A?.acquitterAbonnementGoogle?.({ purchase: actif, packageName: 'app.fillsell.app', purchaseToken: 'jeton/1', accessToken: 'x', productId: 'app.fillsell.premium.cloud', fetchImpl });
  ok(r?.fait === true && appels.length === 1 && appels[0].url.endsWith('/applications/app.fillsell.app/purchases/subscriptions/app.fillsell.premium.cloud/tokens/jeton%2F1:acknowledge')
    && appels[0].init.method === 'POST', 'POST purchases.subscriptions.acknowledge, une fois', JSON.stringify({ r, appels }));
  const r2 = await A?.acquitterAbonnementGoogle?.({ purchase: { ...actif, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, packageName: 'p', purchaseToken: 't', accessToken: 'x', fetchImpl });
  ok(r2?.fait === false && appels.length === 1, 'déjà acquitté : aucun appel');
  const r3 = await A?.acquitterAbonnementGoogle?.({ purchase: actif, packageName: 'p', purchaseToken: 't', accessToken: 'x', fetchImpl: async () => { throw new Error('réseau'); } });
  ok(r3?.fait === false && /erreur_/.test(r3.raison), 'réseau en panne : jamais d\'exception, rejoué à la lecture suivante');
}

console.log('\nC. Branché dans le webhook Google et dans la validation par l\'app');
for (const f of ['supabase/functions/google-play-webhook/index.ts', 'supabase/functions/validate-google-purchase/index.ts']) {
  const s = lire(f);
  ok(/import \{ acquitterAbonnementGoogle \} from "\.\.\/_shared\/google-acquitter-abonnement\.js";/.test(s) && /await acquitterAbonnementGoogle\(\{ purchase, packageName/.test(s), f);
}
console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
