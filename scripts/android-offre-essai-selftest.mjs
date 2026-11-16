// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 1 DU LOT DU 16/11/2026 APRÈS-MIDI — L'ESSAI CLOUD SUR ANDROID : L'OFFRE DE GOOGLE EST NOMMÉE
//     npm run selftest:android-offre-essai
// ═══════════════════════════════════════════════════════════════════════════
// Constat : aucun essai Cloud n'a jamais abouti chez Google (ahlamnajjari34, 16/11 12:34 et 12:37 : « annule » 3 s après
// les conditions). Google rend, pour un forfait de base, l'offre de base ET chaque offre à laquelle le compte a droit
// (la semaine gratuite) ; le module d'achat (@capgo/native-purchases 8.3.3) prenait la PREMIÈRE offre du forfait : la
// feuille pouvait montrer le plein prix juste après « 0 € aujourd'hui ».
// Ce test prouve, sans réseau ni base (Vite SSR) :
//   A. le patch du module (binaire vc39) lit `offerChoice` : « essai » = l'offre éligible dont la 1re phase est gratuite,
//      absente → rejet FILLSELL_ESSAI_ABSENT AVANT la feuille ; « base » = l'offre sans offerId ; sans choix (vieux bundle) :
//      le comportement d'avant ; l'offre réellement envoyée revient avec la réponse (succès et rejet) ;
//   B. Android, semaine gratuite offerte et annoncée → l'app demande « essai » (Premium + Cloud, Pro + Cloud) ;
//   C. Android, Google ne l'offre pas → la question « payé dès aujourd'hui », puis « base » ;
//   D. FILLSELL_ESSAI_ABSENT → refusé, rien payé, la phrase vraie ; l'essai suivant demande « base » après la question ;
//   E. un abonnement Play remplacé → « base » ; iPhone → aucune offre nommée ;
//   F. la trace garde l'offre demandée et celle reçue par Google ;
//   G. iap.js transmet offerChoice sur Android seulement ; le Cloud seul nomme aussi l'offre ;
//   H. le binaire : versionCode 39 > 38, versionName = package.json.
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
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };

console.log('\nA. Le patch du module d’achat (binaire Android vc39)');
{
  const p = lire('patches/@capgo+native-purchases+8.3.3.patch');
  const ajouts = p.split('\n').filter((l) => l.startsWith('+')).join('\n');
  ok(/call\.getString\("offerChoice"\)/.test(ajouts) && /call\.getString\("offerIdentifier"\)/.test(ajouts), 'le module lit offerChoice et offerIdentifier');
  ok(/"essai"\.equals\(choixOffre\)[\s\S]{0,200}getOfferId\(\) != null && fillsellPremierePhaseGratuite\(offerDetails\)/.test(ajouts)
    && /getPricingPhaseList\(\);[\s\S]{0,120}phases\.get\(0\)\.getPriceAmountMicros\(\) == 0L/.test(ajouts),
  '« essai » = une offre (offerId) dont la 1re phase est gratuite');
  ok(/"base"\.equals\(choixOffre\)[\s\S]{0,120}getOfferId\(\) == null/.test(ajouts), '« base » = l’offre de base (offerId null)');
  ok(/"essai"\.equals\(choixOffre\)[\s\S]{0,300}call\.reject\("Free trial offer not available for this account", "FILLSELL_ESSAI_ABSENT"\);\s*\n\+\s*return;/.test(ajouts),
  'semaine demandée mais absente : rejet FILLSELL_ESSAI_ABSENT, la feuille ne s’ouvre pas');
  ok(/if \(selectedOfferDetails == null\) selectedOfferDetails = premiereDuForfait;/.test(ajouts)
    && /if \(choixOffre != null \|\| \(offreVoulue != null && !offreVoulue\.isEmpty\(\)\)\)/.test(ajouts),
  'sans choix (bundle d’avant) : la première offre du forfait, comme avant');
  ok(/ret\.put\("essaiGratuit", offreAchetee\.optBoolean\("essaiGratuit", false\)\)/.test(ajouts)
    && /nomCodeGoogle\(codeGoogle\), fillsellOffre\(purchaseCall\)\);/.test(ajouts), 'l’offre envoyée revient avec la réponse (succès et rejet)');
  ok(/-\s+if \(offerDetails\.getBasePlanId\(\)\.equals\(planIdentifier\)\) \{\n-\s+selectedOfferDetails = offerDetails;/.test(p),
    'le choix « première offre du forfait » d’origine est bien remplacé');
  // Le patch reste un diff LF du paquet npm (patch-package l'applique à l'install).
  ok(!p.includes('\r') && /^diff --git a\/node_modules\/@capgo\/native-purchases\/android\//m.test(p) && /^diff --git a\/node_modules\/@capgo\/native-purchases\/ios\//m.test(p),
    'patch en LF, Android et iPhone (le patch iPhone du 31e5873 gardé)');
}

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
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} absent : ${String(e?.message ?? e).slice(0, 140)})`); return null; } };
try {
  const PB = await charger('/src/lib/prixBoutique.js');
  const ACH = await charger('/src/cloud/achatFormuleCloud.js');
  const JRN = await charger('/src/cloud/issueAchatJournal.js');
  const CO = await charger('/src/config/cloudOffer.js');
  const INT = await charger('/src/config/interrupteurs.js');
  if (CO?.noterBinaireCloud) await CO.noterBinaireCloud('android', '2.9.205');
  if (INT?._remettreAZero) INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_apple: 1, cloud_formules_google: 1 });

  const supabaseFactice = {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => ({ data: { session: null } }) },
    rpc: async (n) => ({ data: n === 'cloud_etat_moi' ? { actif: true } : { ok: true, continuer: true, essai: true }, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: true, is_pro: true, is_business: false, cloud_actif: true, cloud_formule: true }, error: null }) }) }) }),
    functions: { invoke: async (nom) => (nom === 'garde-abonnement' ? { data: { permis: true }, error: null } : { data: {}, error: null }) },
  };
  const creer = (platform, { achat, journal = [], confirmer = async () => true } = {}) => ACH?.creerAchatFormuleCloud({
    supabase: supabaseFactice, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: '00000000-0000-4000-8000-000000000001', email: 'u@exemple.fr' }, lang: 'fr', platform,
    confirmer: async (q) => { journal.push({ question: q }); return confirmer(q); }, notifier: () => {},
    demanderConditions: async () => true,
    purchasePremium: async (id, _u, opts) => { journal.push({ feuille: id, opts: opts ?? {} }); return achat(id, opts ?? {}); },
    preparerChangement: null,
  });
  const prixGoogle = (essai) => PB?.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: {
    premium: { texte: '12,99 €', montant: 12.99, devise: 'EUR', essai: false }, pro: { texte: '29,99 €', montant: 29.99, devise: 'EUR', essai: false },
    premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR', essai }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai } } });
  const acheter = (a, formule, extra = {}) => a.acheter(formule, { origine: 'onboarding', essaiAffiche: true, ...extra });
  const offresDe = (j) => j.filter((x) => x.feuille).map((x) => x.opts.offre ?? null);

  console.log('\nB. Android, semaine gratuite offerte par Google et annoncée : l’app demande l’offre « essai »');
  for (const formule of ['premium_cloud', 'pro_cloud']) {
    prixGoogle(true);
    const j = [];
    const r = await acheter(creer('android', { journal: j, achat: async () => ({ purchaseToken: 'jeton', offreGoogle: { offerId: 'semaine-gratuite', essaiGratuit: true } }) }), formule);
    ok(JSON.stringify(offresDe(j)) === '["essai"]' && !j.some((x) => x.question), `${formule} : offre « essai », aucune question`, JSON.stringify(j));
    ok(r?.etat === 'actif' && r?.offre_demandee === 'essai' && r?.essai_google === true && r?.offre_google === 'semaine-gratuite', `${formule} : actif, la trace dit l’offre reçue`, JSON.stringify(r));
  }

  console.log('\nC. Android, Google n’offre pas la semaine à ce compte : la question d’abord, puis l’offre de base');
  {
    prixGoogle(false);
    const j = [];
    const r = await acheter(creer('android', { journal: j, achat: async () => ({ purchaseToken: 'jeton', offreGoogle: { offerId: null, essaiGratuit: false } }) }), 'premium_cloud');
    ok(j.some((x) => /payé dès aujourd'hui/.test(x.question ?? '')) && JSON.stringify(offresDe(j)) === '["base"]', 'question « payé dès aujourd’hui », puis « base »', JSON.stringify(j));
    ok(r?.offre_demandee === 'base' && r?.essai_google === false, 'trace : base demandée, base reçue', JSON.stringify(r));
  }

  console.log('\nD. La semaine annoncée n’est plus offerte au moment de la feuille (FILLSELL_ESSAI_ABSENT)');
  {
    prixGoogle(true);
    const j = [];
    let n = 0;
    const a = creer('android', { journal: j, achat: async (_id, opts) => {
      n++;
      if (opts.offre === 'essai') { const e = new Error('Free trial offer not available for this account'); e.code = 'FILLSELL_ESSAI_ABSENT'; e.issueAchat = { issue: 'erreur', code: 'FILLSELL_ESSAI_ABSENT', message: e.message }; throw e; }
      return { purchaseToken: 'jeton', offreGoogle: { offerId: null, essaiGratuit: false } };
    } });
    const r1 = await acheter(a, 'pro_cloud');
    ok(r1?.etat === 'refuse' && r1?.raison === 'essai_google_absent' && /ne te propose plus la semaine gratuite : rien n'a été payé/.test(r1?.message ?? '')
      && r1?.code === 'FILLSELL_ESSAI_ABSENT' && r1?.offre_demandee === 'essai', 'refusé, rien payé, la phrase vraie', JSON.stringify(r1));
    const avant = j.length;
    const r2 = await acheter(a, 'pro_cloud');
    const suite = j.slice(avant);
    ok(suite.some((x) => /payé dès aujourd'hui/.test(x.question ?? '')) && JSON.stringify(offresDe(suite)) === '["base"]' && r2?.etat === 'actif' && n === 2,
      'essai suivant : la question « payé dès aujourd’hui », puis « base »', JSON.stringify({ suite, r2 }));
  }

  console.log('\nE. Remplacement d’un abonnement Play, et iPhone');
  {
    prixGoogle(true);
    const j = [];
    await acheter(creer('android', { journal: j, achat: async () => ({ purchaseToken: 'jeton' }) }), 'pro_cloud',
      { changement: { etat: 'continuer', cle: 'pro_cloud', oldPurchaseToken: 'ancien', replacementMode: 5 } });
    ok(JSON.stringify(offresDe(j)) === '["base"]' && j.find((x) => x.feuille)?.opts?.oldPurchaseToken === 'ancien', 'abonnement Play remplacé : « base » (jamais d’essai)', JSON.stringify(j));
    PB?.poserPrixBoutique({ canal: 'apple', statut: 'pret', eligibilite: { plan: true, cloud: true }, prix: {
      premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR' }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR' } } });
    const ji = [];
    await acheter(creer('ios', { journal: ji, achat: async () => ({ receipt: 'r' }) }), 'premium_cloud');
    ok(ji.some((x) => x.feuille) && offresDe(ji).every((o) => o === null), 'iPhone : aucune offre nommée (Apple applique sa semaine)', JSON.stringify(ji));
  }

  console.log('\nF. La trace');
  {
    const l = JRN?.issueFormuleJournal?.({ etat: 'annule', raison: 'boutique_annulee', offre_demandee: 'essai', essai_google: true, offre_google: 'semaine-gratuite', message: 'x' }, { origine: 'tableau', formule: 'pro_cloud' });
    ok(l?.offre_demandee === 'essai' && l?.essai_google === true && l?.offre_google === 'semaine-gratuite' && !('message' in l), 'formule_cloud_issue garde l’offre demandée et reçue', JSON.stringify(l));
  }
} finally {
  await vite.close();
}

console.log('\nG. iap.js et le Cloud seul');
{
  const iap = lire('src/lib/iap.js');
  ok(/offre = null \} = \{\}\) => \{/.test(iap) && /if \(\(offre === 'essai' \|\| offre === 'base'\) && Capacitor\.getPlatform\(\) === 'android'\) purchaseOptions\.offerChoice = offre;/.test(iap),
    'purchasePremium transmet offerChoice, sur Android seulement');
  ok(/offreGoogle: offreGoogleDe\(result\)/.test(iap) && /const offreGoogle = offreGoogleDe\(e\?\.data\);/.test(iap), 'l’offre reçue par Google est rendue (succès, annulation, erreur)');
  const c = lire('src/cloud/achatCloud.js');
  ok(/const offre = platform === 'android' \? \(essaiPermis && !boutiqueSansEssai \? 'essai' : 'base'\) : null;/.test(c) && /purchasePremium\(PRODUIT_CLOUD, user\.id, offre \? \{ offre \} : \{\}\)/.test(c)
    && /FILLSELL_ESSAI_ABSENT/.test(c), 'le Cloud seul nomme l’offre et dit la semaine retirée');
}

console.log('\nH. Le binaire Android');
{
  const g = lire('android/app/build.gradle');
  const vc = Number(/^\s*versionCode (\d+)\s*$/m.exec(g)?.[1]);
  const vn = /^\s*versionName "([^"]+)"\s*$/m.exec(g)?.[1];
  const pkg = JSON.parse(lire('package.json') || '{}');
  // Le binaire porte la version de son commit (2.9.205) ; une OTA suivante monte package.json au-dessus (2.9.206…), jamais en dessous.
  const v = (x) => String(x ?? '').split('.').map(Number);
  const cmp = (a, b) => { const A = v(a), B = v(b); for (let i = 0; i < 3; i++) if ((A[i] ?? 0) !== (B[i] ?? 0)) return (A[i] ?? 0) - (B[i] ?? 0); return 0; };
  ok(vc >= 39 && cmp(vn, '2.9.205') >= 0 && cmp(vn, pkg.version) <= 0,
    `versionCode ${vc} (> 38, la vc38 en vente), versionName ${vn} ≥ 2.9.205 et ≤ package.json ${pkg.version}`);
}

console.log(`\n${rouges === 0 ? '✓' : '✗'} android-offre-essai : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
