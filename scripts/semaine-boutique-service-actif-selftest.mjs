// ═══════════════════════════════════════════════════════════════════════════
// VERROU DE LA DÉCISION DE NICO DU 16/11/2026 (urgent, point 1) — LA SEMAINE GRATUITE D'APPLE / GOOGLE = LE CLOUD ACTIF
// TOUT DE SUITE ; PLUS JAMAIS « ESSAI DÉJÀ UTILISÉ… IL DÉMARRE AU PREMIER PAIEMENT »
//     npm run selftest:semaine-boutique-service-actif
// ═══════════════════════════════════════════════════════════════════════════
// Constat (Nico, iPhone, compte NEUF nicolas.svobodny+test5, 16/11 11:31) : après la case des conditions, l'app affiche
// « Ton essai gratuit FillSell a déjà été utilisé. App Store va t'afficher « 1 semaine gratuite » : cette semaine-là,
// Premium + Cloud n'est pas encore activé ; il démarre au premier paiement, 7 jours plus tard. Continuer ? ».
// Cause (base) : cloud_essai_demandes de test5 = essai_permis faux, raison « appareil_deja_vu » (l'iPhone a servi à
// l'essai d'un autre compte) ; le serveur appliquait la « décision 8 » du 11-13/11 : une semaine gratuite de la boutique
// refusée par les verrous de FillSell n'ouvrait RIEN (verdictEssaiStore, droitsAchatBoutique, validate-apple-receipt
// refusEssaiA) — sept jours sans service — et l'app le disait par cette question, en parlant d'un « essai déjà utilisé ».
// Décision de Nico (16/11) : quand la boutique accorde la semaine gratuite, le Cloud est ACTIVÉ IMMÉDIATEMENT ; plus jamais
// de semaine gratuite sans service ; le vrai cas « essai déjà utilisé » (web) se dit en une phrase et ne fait jamais payer
// une semaine sans service. Ce test prouve, sans réseau ni base :
//   A. serveur (pur) : semaine de la boutique + verrou FillSell (appareil, compte de plateforme, essai déjà pris, autre
//      canal) → ouvrir, palier + Cloud écrits, essai daté, Cloud ACTIF ; un essai arrêté auparavant ne bloque pas le nouveau ;
//      le rejeu du même essai n'en rouvre pas un arrêté ;
//   B. validate-apple-receipt / webhooks : la règle passe par droitsAchatBoutique (plus de refus local) ;
//   C. app, iPhone : verrou FillSell + semaine Apple « oui » → AUCUNE question, la feuille d'Apple s'ouvre ;
//      semaine « non » annoncée à l'essai → une phrase « payé dès aujourd'hui » ; « inconnu » → une phrase, deux issues vraies ;
//   D. app, web : essai refusé → UNE phrase selon la raison (déjà eu ton essai / appareil), « payé dès aujourd'hui » ;
//   E. Cloud seul, iPhone : même règle (aucune question quand la semaine est offerte) ;
//   F. aucun texte de l'app ne dit plus « n'est pas encore activé » / « ne tourne pas » pendant une semaine gratuite.
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
const J = 86_400_000;
const T0 = Date.parse('2026-11-16T10:31:00Z');

globalThis.document ??= { body: {} };
const memoire = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k), clear: () => memoire.clear() } });
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] },
});
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} absent : ${String(e?.message ?? e).slice(0, 140)})`); return null; } };
try {
  const FS = await charger('/supabase/functions/_shared/formules-serveur.js');
  const CO = await charger('/supabase/functions/_shared/cloud-option.js');
  const PB = await charger('/src/lib/prixBoutique.js');
  const ACH = await charger('/src/cloud/achatFormuleCloud.js');
  const ACS = await charger('/src/cloud/achatCloud.js');
  const CFG = await charger('/src/config/cloudOffer.js');
  const INT = await charger('/src/config/interrupteurs.js');
  if (CFG?.noterBinaireCloud) await CFG.noterBinaireCloud('web', 'web');
  if (INT?._remettreAZero) INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_apple: 1, cloud_formules_google: 1 });

  // ── A. Serveur ──────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nA. Serveur : la semaine gratuite de la boutique ouvre TOUJOURS le service');
  const verrous = [
    ['appareil déjà vu (test5)', { cloud_essai_interdit: true }],
    ['essai déjà pris sur Stripe', { cloud_essai_debut: new Date(T0 - 40 * J).toISOString(), cloud_essai_fin: new Date(T0 - 33 * J).toISOString(), cloud_canal: 'stripe', cloud_ref: 'sub_ancien', cloud_essai_arrete: true }],
  ];
  for (const [nom, profil] of verrous) {
    const v = CO?.verdictEssaiStore?.(profil, 'apple', 'A_NOUVEAU');
    ok(v?.ok === true, `${nom} : verdictEssaiStore → ok (la semaine de la boutique est activée)`, JSON.stringify(v));
    for (const produit of ['app.fillsell.premium.cloud', 'app.fillsell.pro.cloud']) {
      const plan = FS?.planAchatBoutique?.({ produit, sens: 'on', essaiBoutique: true, verdictEssai: CO?.verdictEssaiStore?.(profil, 'apple', 'A_NOUVEAU'), rangAutres: 0 });
      ok(plan?.ouvrir === true && plan?.drapeaux?.is_premium === true && plan?.cloud === 'ecrire' && plan?.credit === false, `${nom}, ${produit} en semaine gratuite : palier + Cloud ouverts, aucun crédit du mois`, JSON.stringify(plan));
    }
    const lecture = { essai: true, debut: new Date(T0).toISOString(), fin: new Date(T0 + 7 * J).toISOString(), renouvellementAuto: true };
    const e = CO?.ecritureCloudStore?.({ canal: 'apple', lecture, sens: 'on', ref: 'A_NOUVEAU', profil, maintenant: T0 });
    const apres = { ...profil, ...(e?.update ?? {}) };
    ok(e?.update?.cloud_essai_debut === lecture.debut && CO?.etatCloud?.(apres, T0 + 1000)?.actif === true, `${nom} : l'essai est daté et le Cloud TOURNE dès l'achat`, JSON.stringify(e));
  }
  {
    const d = FS?.droitsAchatBoutique?.({ produit: 'app.fillsell.premium.cloud', essaiBoutique: true, verdictEssai: { ok: false, raison: 'essai_deja_pris' } });
    ok(d?.ouvrir === true, 'droitsAchatBoutique : même un verdict « refusé » ne laisse jamais une semaine gratuite sans service', JSON.stringify(d));
    // Le rejeu du même essai (même canal, même référence) n'en rouvre pas un arrêté par la personne.
    const arrete = { cloud_canal: 'apple', cloud_ref: 'A1', cloud_essai_debut: new Date(T0 - 2 * J).toISOString(), cloud_essai_fin: new Date(T0 + 5 * J).toISOString(), cloud_essai_arrete: true };
    const lecture = { essai: true, debut: arrete.cloud_essai_debut, fin: arrete.cloud_essai_fin, renouvellementAuto: false };
    const r = CO?.ecritureCloudStore?.({ canal: 'apple', lecture, sens: 'on', ref: 'A1', profil: arrete, maintenant: T0 });
    ok(r?.update?.cloud_essai_arrete !== false, 'rejeu du MÊME essai arrêté : l’arrêt n’est pas effacé', JSON.stringify(r));
  }

  // ── B. Les fonctions ────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nB. Les fonctions de paiement : une seule règle');
  const va = lire('supabase/functions/validate-apple-receipt/index.ts');
  ok(/const refusEssaiA = [^;]*droitsAchatBoutique\(/.test(va), 'validate-apple-receipt : le refus passe par droitsAchatBoutique (plus de verdict local)');
  const ap = lire('supabase/functions/apple-iap-webhook/index.ts');
  ok(!/semaine gratuite sans droits/.test(ap) || /\(16\/11\/2026/.test(ap), 'apple-iap-webhook : plus de « semaine gratuite sans droits » silencieuse');

  // ── C. App, iPhone ──────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nC. App, iPhone : aucune question quand Apple offre la semaine, même si le serveur refuse l’essai FillSell');
  const sb = (essai, raison) => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => ({ data: { session: null } }) },
    rpc: async (n) => ({ data: n === 'cloud_etat_moi' ? { actif: true } : { ok: true, essai, raison }, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: true, is_pro: true, is_business: false }, error: null }) }) }) }),
    functions: { invoke: async (nom) => (nom === 'garde-abonnement' ? { data: { permis: true }, error: null } : { data: {}, error: null }) },
  });
  const creer = (platform, { essai = false, raison = 'appareil_deja_vu', questions = [], feuilles = [] } = {}) => ACH?.creerAchatFormuleCloud({
    supabase: sb(essai, raison), supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: '00000000-0000-4000-8000-000000000002', email: 't@exemple.fr' }, lang: 'fr', platform,
    confirmer: async (m) => { questions.push(m); return true; }, notifier: () => {}, demanderConditions: async () => true,
    purchasePremium: async (id) => { feuilles.push(id); return { cancelled: false }; }, preparerChangement: null,
  });
  const prix = { premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR' }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR' } };
  for (const raison of ['appareil_deja_vu', 'essai_deja_pris', 'compte_plateforme_deja_vu']) {
    PB?.poserPrixBoutique({ canal: 'apple', statut: 'pret', eligibilite: { plan: true, cloud: true }, prix });
    const q = [], f = [];
    const r = await creer('ios', { raison, questions: q, feuilles: f })?.acheter('premium_cloud', { essaiAffiche: true, origine: 'entree_formule_cloud' });
    ok(q.length === 0 && f[0] === 'app.fillsell.premium.cloud' && r?.etat === 'actif', `iPhone, ${raison}, semaine Apple offerte : aucune question, la feuille s’ouvre, Premium + Cloud actif`, JSON.stringify({ q, f, r }));
  }
  {
    PB?.poserPrixBoutique({ canal: 'apple', statut: 'pret', eligibilite: { plan: false, cloud: false }, prix });
    const q = [];
    await creer('ios', { essai: true, questions: q })?.acheter('premium_cloud', { essaiAffiche: true });
    ok(q.length === 1 && /payé dès aujourd'hui/.test(q[0]) && !/Ton essai gratuit FillSell a déjà été utilisé/.test(q[0]) && (q[0].match(/[.?!]/g) ?? []).length <= 2,
      'iPhone, semaine Apple « non » alors que l’essai était annoncé : une phrase, « payé dès aujourd’hui »', JSON.stringify(q));
    PB?.poserPrixBoutique({ canal: 'apple', statut: 'pret', eligibilite: { plan: null, cloud: null }, prix });
    const q2 = [];
    await creer('ios', { essai: false, questions: q2 })?.acheter('premium_cloud', { essaiAffiche: true });
    ok(q2.length === 1 && /tout de suite/.test(q2[0]) && /payé dès aujourd'hui/.test(q2[0]) && !/n'est pas (encore )?activé|premier paiement/.test(q2[0]),
      'iPhone, historique Apple illisible : une phrase, les deux issues vraies (semaine → actif tout de suite ; sinon payé aujourd’hui)', JSON.stringify(q2));
  }

  // ── D. App, web ─────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nD. Web : l’essai FillSell refusé se dit en UNE phrase, selon la vraie raison');
  PB?.poserPrixBoutique(null);
  globalThis.window = { location: { href: '' }, confirm: () => true };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ formule: 'premium_cloud', url: 'https://checkout.stripe.com/c/pay/cs_test_z' }) });
  for (const [raison, motif] of [['essai_deja_pris', /Tu as déjà eu ton essai gratuit/], ['appareil_deja_vu', /Cet appareil a déjà servi à un essai gratuit/]]) {
    const q = [];
    await creer('web', { raison, questions: q })?.acheter('premium_cloud', { essaiAffiche: true });
    ok(q.length === 1 && motif.test(q[0]) && /payé dès aujourd'hui/.test(q[0]) && (q[0].match(/[.!]/g) ?? []).length === 0, `web, ${raison} : une phrase vraie (« ${q[0] ?? '—'} »)`, JSON.stringify(q));
  }

  // ── E. Cloud seul, iPhone ───────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nE. Cloud seul, iPhone : même règle');
  if (ACS?.creerAchatCloud) {
    PB?.poserPrixBoutique({ canal: 'apple', statut: 'pret', eligibilite: { plan: true, cloud: true }, prix: { cloud: { texte: '24,99 €', montant: 24.99, devise: 'EUR' } } });
    const q = [], f = [];
    const ach = ACS.creerAchatCloud({ supabase: sb(false, 'appareil_deja_vu'), supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: '00000000-0000-4000-8000-000000000003', email: 'c@exemple.fr' }, lang: 'fr', platform: 'ios',
      purchasePremium: async (id) => { f.push(id); return { cancelled: false }; }, ouvrirLien: async () => {}, confirmer: async (m) => { q.push(m); return true; }, notifier: () => {}, demanderConditions: async () => true });
    await ach.acheter('test');
    ok(q.length === 0 && f.length === 1, 'Cloud seul, verrou FillSell + semaine Apple offerte : aucune question, la feuille s’ouvre', JSON.stringify({ q, f }));
  } else ok(false, 'achatCloud se charge');

  // ── F. Les textes ───────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nF. Plus aucun texte « semaine gratuite sans service »');
  const textes = lire('src/cloud/textesFormules.js') + lire('src/cloud/textesConnexion.js');
  ok(!/n'est pas encore activé|le Cloud ne tourne pas|is not turned on yet|the Cloud does not run/.test(textes), 'textesFormules / textesConnexion : plus de « pas encore activé » ni « ne tourne pas cette semaine-là »');
  const src = lire('src/cloud/achatFormuleCloud.js');
  ok(!/essaiDejaPrisBoutique|essaiDejaPrisIncertain/.test(src), 'achatFormuleCloud n’emploie plus la question « essai déjà utilisé… Apple va t’afficher 1 semaine gratuite »');
} finally {
  await vite.close();
}
console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
