// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 1 DU LOT DU 16/11/2026 MIDI — L'ESSAI CLOUD SUR IPHONE : LA CASE AU-DESSUS DE TOUT, UNE ISSUE VRAIE
//     npm run selftest:achat-formule-issue-vraie
// ═══════════════════════════════════════════════════════════════════════════
// Constat (usage_logs, rachidafarhi54, iPhone, 16/11 09:02 → 09:23, build 3c3f93c) : l'essai Premium + Cloud demandé dans
// le parcours d'entrée → la case des conditions s'ouvre DERRIÈRE le parcours (z-index 1250 sous 9980 : le correctif du
// 04/11 ne baissait le parcours que pour le Cloud SEUL) → la personne passe l'étape, finit le parcours, la case apparaît
// sur le Tableau et l'achat part d'un écran qui n'existe plus. Puis 5 tentatives, toutes journalisées
// formule_cloud_issue « annule » avec raison = null : le chemin des formules jetait le code de StoreKit, la durée de la
// feuille et l'étape — impossible de dire si Apple avait annulé, échoué, ou si la feuille ne s'était jamais ouverte.
// Et un second achat lancé pendant le premier laissait la promesse des conditions pendre pour toujours (Pro + Cloud
// 09:18:17 : aucune issue).
// Ce test prouve, sans réseau ni base (Vite SSR) :
//   A. iPhone, StoreKit « User cancelled » → annule, raison boutique_annulee, code USER_CANCELLED, durée et étape ;
//   B. iPhone, StoreKit qui rejette (erreur) → erreur, raison boutique_erreur, code et message gardés ;
//   C. case refusée → conditions_refusees ; case remplacée par une autre demande → conditions_remplacees ; aucune feuille ;
//   D. écran démonté (ecranVivant faux) → ecran_ferme, ni case ni feuille ; démonté PENDANT la case → aucune feuille ;
//   E. la case reçoit { essai } : vrai pour Premium + Cloud annoncé à l'essai sur le web, faux pour Business + Cloud ;
//   F. issueFormuleJournal : jamais de raison nulle pour annule / erreur / refuse / attente ; code, durée, étape gardés ;
//   G. ConditionsCloudModale au-dessus du parcours (z-index > Z_PARCOURS) et, essai sûr, « 0 € aujourd'hui. Rien n'est
//      prélevé avant le JJ/MM » ;
//   H. ParcoursEntree : passe sous la case pendant l'achat d'une FORMULE aussi, et « Passer » disparaît pendant l'achat ;
//   I. App : une nouvelle demande de case rend la précédente « remplacee » ; l'issue est journalisée par issueFormuleJournal ;
//      le Cloud seul n'accepte la case que sur `true` strict ;
//   J. achatFormuleCloud.js : aucune issue annule / erreur / refuse écrite sans raison ;
//   K. web : la page Stripe d'une formule est journalisée (checkout_open) AVANT de quitter l'app (point 2f).
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
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const PB = await charger('/src/lib/prixBoutique.js');
  const ACH = await charger('/src/cloud/achatFormuleCloud.js');
  const JRN = await charger('/src/cloud/issueAchatJournal.js');
  const CCM = await charger('/src/cloud/ConditionsCloudModale.jsx');
  const CO = await charger('/src/config/cloudOffer.js');
  const INT = await charger('/src/config/interrupteurs.js');
  if (CO?.noterBinaireCloud) await CO.noterBinaireCloud('web', 'web');
  if (INT?._remettreAZero) INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_apple: 1, cloud_formules_google: 1 });

  const supabaseFactice = {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => ({ data: { session: null } }) },
    rpc: async (n) => ({ data: n === 'cloud_etat_moi' ? { actif: true } : { ok: true, continuer: true, essai: true }, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: true, is_pro: true, is_business: false }, error: null }) }) }) }),
    functions: { invoke: async (nom) => (nom === 'garde-abonnement' ? { data: { permis: true }, error: null } : { data: {}, error: null }) },
  };
  const creer = (platform, { achat, conditions = async () => true, journal = [], journalOuverture = null } = {}) => ACH?.creerAchatFormuleCloud({
    supabase: supabaseFactice, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: '00000000-0000-4000-8000-000000000001', email: 'u@exemple.fr' }, lang: 'fr', platform,
    confirmer: async () => true, notifier: () => {},
    demanderConditions: async (info) => { journal.push({ conditions: info ?? null }); return conditions(info); },
    purchasePremium: async (id, _u, opts) => { journal.push({ feuille: id }); return achat(id, opts); },
    preparerChangement: null, journalOuverture,
  });
  const prixApple = () => PB?.poserPrixBoutique({ canal: 'apple', statut: 'pret', eligibilite: { plan: true, cloud: true }, prix: {
    premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR' }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR' } } });

  // ── A. StoreKit « User cancelled » ──────────────────────────────────────────────────────────────────────────────────
  console.log('\nA. iPhone : StoreKit rend « User cancelled » → une issue qui le dit');
  prixApple();
  {
    const j = [];
    const ach = creer('ios', { journal: j, achat: async () => { await new Promise((r) => setTimeout(r, 25)); return { cancelled: true, issue: { issue: 'annule', code: 'USER_CANCELLED', message: 'User cancelled' } }; } });
    const r = ach ? await ach.acheter('premium_cloud', { origine: 'bandeau_tableau', essaiAffiche: true }) : null;
    ok(r?.etat === 'annule' && r?.raison === 'boutique_annulee', 'annule, raison « boutique_annulee » (avant : raison null)', JSON.stringify(r));
    ok(r?.code === 'USER_CANCELLED' && r?.etape === 'boutique' && r?.produit === 'app.fillsell.premium.cloud', 'le code de StoreKit, l’étape et le produit sont gardés', JSON.stringify(r));
    ok(Number.isFinite(r?.duree_feuille_ms) && r.duree_feuille_ms >= 20, 'la durée de la feuille est mesurée (ms)', JSON.stringify(r));
    ok(['oui', 'non', 'inconnu'].includes(r?.semaine_boutique), 'la semaine gratuite lue par l’app (oui / non / inconnu) part avec l’issue', JSON.stringify(r));
  }

  // ── B. StoreKit qui rejette ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nB. iPhone : StoreKit rejette (erreur) → « erreur » avec son code, jamais « annule »');
  {
    const ach = creer('ios', { achat: async () => { const e = new Error('Cannot find product for id app.fillsell.premium.cloud'); e.issueAchat = { issue: 'erreur', code: 'CANNOT_FIND_PRODUCT', message: e.message }; throw e; } });
    const r = ach ? await ach.acheter('premium_cloud', { origine: 'entree_formule_cloud', essaiAffiche: true }) : null;
    ok(r?.etat === 'erreur' && r?.raison === 'boutique_erreur' && r?.code === 'CANNOT_FIND_PRODUCT' && /Cannot find product/.test(r?.message_boutique ?? ''), 'erreur, raison « boutique_erreur », code et message de la boutique', JSON.stringify(r));
  }

  // ── C. La case refusée / remplacée ──────────────────────────────────────────────────────────────────────────────────
  console.log('\nC. La case des conditions : refusée ou remplacée → dit, et aucune feuille');
  {
    const j1 = [];
    const r1 = await creer('ios', { journal: j1, conditions: async () => false, achat: async () => ({ cancelled: false }) })?.acheter('premium_cloud', { essaiAffiche: true });
    ok(r1?.etat === 'annule' && r1?.raison === 'conditions_refusees' && !j1.some((x) => x.feuille), 'case refusée → conditions_refusees, aucune feuille', JSON.stringify({ r1, j1 }));
    const j2 = [];
    const r2 = await creer('ios', { journal: j2, conditions: async () => 'remplacee', achat: async () => ({ cancelled: false }) })?.acheter('pro_cloud', { essaiAffiche: true });
    ok(r2?.etat === 'annule' && r2?.raison === 'conditions_remplacees' && !j2.some((x) => x.feuille), 'case remplacée par une autre demande → conditions_remplacees (jamais une promesse qui pend), aucune feuille', JSON.stringify({ r2, j2 }));
  }

  // ── D. L'écran démonté ──────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nD. L’achat ne part jamais d’un écran démonté');
  {
    const j1 = [];
    const r1 = await creer('ios', { journal: j1, achat: async () => ({ cancelled: false }) })?.acheter('premium_cloud', { essaiAffiche: true, origine: 'entree_formule_cloud', ecranVivant: () => false });
    ok(r1?.etat === 'annule' && r1?.raison === 'ecran_ferme' && j1.length === 0, 'écran déjà parti → ecran_ferme, ni case ni feuille', JSON.stringify({ r1, j1 }));
    let vivant = true;
    const j2 = [];
    const r2 = await creer('ios', { journal: j2, conditions: async () => { vivant = false; return true; }, achat: async () => ({ cancelled: false }) })?.acheter('premium_cloud', { essaiAffiche: true, origine: 'entree_formule_cloud', ecranVivant: () => vivant });
    ok(r2?.etat === 'annule' && r2?.raison === 'ecran_ferme' && !j2.some((x) => x.feuille), 'écran parti PENDANT la case → aucune feuille de paiement', JSON.stringify({ r2, j2 }));
  }

  // ── E. La case reçoit l'essai ───────────────────────────────────────────────────────────────────────────────────────
  console.log('\nE. La case sait si l’essai est annoncé et sûr (« 0 € aujourd’hui »)');
  PB?.poserPrixBoutique(null);
  {
    const vues = [];
    globalThis.window = { location: { href: '' }, confirm: () => true };
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ formule: 'premium_cloud', url: 'https://checkout.stripe.com/c/pay/cs_test_x' }) });
    const ouvertures = [];
    const achW = creer('web', { conditions: async (info) => { vues.push(info); return true; }, journalOuverture: async (d) => { ouvertures.push({ ...d, href_avant: globalThis.window.location.href }); }, achat: async () => ({}) });
    const rw = achW ? await achW.acheter('premium_cloud', { essaiAffiche: true, origine: 'stock_annonces_cloud' }) : null;
    ok(vues[0]?.essai === true, 'web, Premium + Cloud annoncé à l’essai → la case reçoit { essai: true }', JSON.stringify(vues));
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ formule: 'business_cloud', url: 'https://checkout.stripe.com/c/pay/cs_test_y' }) });
    await achW?.acheter('business_cloud', { essaiAffiche: false, origine: 'entete_offres' });
    ok(vues[1]?.essai === false, 'Business + Cloud (jamais d’essai) → { essai: false }', JSON.stringify(vues));

    // ── K. checkout_open avant de quitter l'app ──
    console.log('\nK. Web : l’ouverture de la page Stripe d’une formule est journalisée, avant de quitter l’app');
    ok(rw?.etat === 'redirige' && ouvertures[0]?.canal === 'stripe' && ouvertures[0]?.tier === 'premium_cloud' && ouvertures[0]?.href_avant === '', 'journalOuverture appelé (canal stripe, formule) AVANT window.location.href', JSON.stringify({ rw, ouvertures }));
  }

  // ── F. issueFormuleJournal ──────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nF. La ligne formule_cloud_issue : jamais de raison nulle sur une issue qui n’aboutit pas');
  {
    const f = JRN?.issueFormuleJournal;
    ok(typeof f === 'function', 'issueFormuleJournal existe (src/cloud/issueAchatJournal.js)');
    if (typeof f === 'function') {
      for (const etat of ['annule', 'erreur', 'refuse', 'attente']) {
        const l = f({ etat }, { origine: 'o', formule: 'premium_cloud' });
        ok(typeof l.raison === 'string' && l.raison.length > 0, `${etat} sans raison → raison écrite (« ${l.raison} »), jamais null`, JSON.stringify(l));
      }
      const l = f({ etat: 'annule', raison: 'boutique_annulee', code: 'USER_CANCELLED', duree_feuille_ms: 4200, etape: 'boutique', produit: 'app.fillsell.premium.cloud', semaine_boutique: 'oui', message: 'texte au client' }, { origine: 'bandeau_tableau', formule: 'premium_cloud' });
      ok(l.raison === 'boutique_annulee' && l.code === 'USER_CANCELLED' && l.duree_feuille_ms === 4200 && l.etape === 'boutique' && l.semaine_boutique === 'oui' && l.origine === 'bandeau_tableau' && l.formule === 'premium_cloud' && !('message' in l),
        'code, durée, étape, semaine, origine et formule gardés ; le texte montré au client n’entre pas dans la trace', JSON.stringify(l));
      const a = f({ etat: 'actif' }, { origine: 'o', formule: 'pro_cloud' });
      ok(a.etat === 'actif' && a.raison == null, 'actif : pas de raison inventée', JSON.stringify(a));
    }
  }

  // ── G. La case au-dessus du parcours, et le message de l'essai ──────────────────────────────────────────────────────
  console.log('\nG. La case des conditions : au-dessus du parcours d’entrée, et « 0 € aujourd’hui » quand l’essai est sûr');
  {
    const srcP = lire('src/entree/ParcoursEntree.jsx');
    const zParcours = Number((srcP.match(/const Z_PARCOURS = (\d+);/) ?? [])[1]);
    const srcM = lire('src/cloud/caseConditions.js') + lire('src/cloud/ConditionsCloudModale.jsx');
    const zCase = Number((srcM.match(/export const Z_CONDITIONS = (\d+);/) ?? [])[1] ?? (srcM.match(/zIndex: (\d+)/) ?? [])[1]);
    ok(Number.isFinite(zParcours) && Number.isFinite(zCase) && zCase > zParcours, `z-index de la case (${zCase}) au-dessus du parcours (${zParcours}) — avant : 1250 sous 9980`);
    if (CCM?.default) {
      const avec = renderToStaticMarkup(React.createElement(CCM.default, { onFini: () => {}, formules: true, essai: true }));
      const sans = renderToStaticMarkup(React.createElement(CCM.default, { onFini: () => {}, formules: true, essai: false }));
      const attendue = /0\s€ aujourd'hui\. Rien n'est prélevé avant le \d{2}\/\d{2}\. Tu arrêtes en un clic depuis l'app, quand tu veux\./;
      ok(attendue.test(avec.replace(/&#x27;/g, "'")), 'essai sûr : « 0 € aujourd’hui. Rien n’est prélevé avant le JJ/MM. Tu arrêtes en un clic depuis l’app, quand tu veux. »', avec.replace(/&#x27;/g, "'").slice(0, 300));
      ok(!/Rien n&#x27;est prélevé avant le/.test(sans) && !/Rien n'est prélevé avant le/.test(sans), 'sans essai sûr : la phrase n’est pas dite');
    } else ok(false, 'ConditionsCloudModale se charge');
  }

  // ── H. Le parcours d'entrée ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nH. Le parcours d’entrée pendant l’achat d’une formule');
  {
    const srcP = lire('src/entree/ParcoursEntree.jsx');
    ok(/c\.formules\?\.achat\?\.etat === 'en_cours'/.test(srcP), 'le parcours regarde AUSSI l’achat d’une formule (c.formules.achat), plus seulement celui du Cloud seul');
    ok(/achatEnCours/.test(srcP) && /etape\.passable !== false && !achatEnCours/.test(srcP), '« Passer » disparaît pendant un achat (jamais un écran quitté sous une case ouverte)');
    const srcF = lire('src/entree/useFormulesEntree.js');
    ok(/ecranVivant/.test(srcF) && /monteRef|vivantRef/.test(srcF), 'useFormulesEntree passe ecranVivant à l’achat (l’écran démonté = rien ne part)');
  }

  // ── I. App ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nI. App : une seule case en attente ; la trace de l’issue');
  {
    const app = lire('src/App.jsx');
    ok(/function demanderConditionsAchat\(/.test(app) && /prec\.resolve\('remplacee'\)/.test(app), 'une nouvelle demande de case rend la précédente « remplacee »');
    ok(/logTunnel\('formule_cloud_issue',issueFormuleJournal\(r,/.test(app), 'formule_cloud_issue écrite par issueFormuleJournal (plus « raison: r?.raison ?? null »)');
    ok(!/raison:r\?\.raison\?\?null\}\);/.test(app), 'plus aucune trace d’issue de formule avec « raison ?? null »');
    const cs = lire('src/cloud/achatCloud.js');
    ok(/const conditions = await demanderConditions\(\);\s*if \(conditions !== true\)/.test(cs), 'Cloud seul : la case n’est acceptée que sur `true` strict (« remplacee » n’ouvre jamais un paiement)');
  }

  // ── J. Aucune issue sans raison dans achatFormuleCloud.js ───────────────────────────────────────────────────────────
  console.log('\nJ. achatFormuleCloud.js : chaque issue annule / erreur / refuse porte sa raison');
  {
    const src = lire('src/cloud/achatFormuleCloud.js');
    const lignes = src.split('\n').filter((l) => /return \{ (?:\.\.\.[a-z]+, )?etat: '(annule|erreur|refuse)'/.test(l) && !/raison:/.test(l));
    ok(lignes.length === 0, `aucune issue sans raison (${lignes.length} trouvée(s))`, lignes.join('\n'));
  }
} finally {
  await vite.close();
}
console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
