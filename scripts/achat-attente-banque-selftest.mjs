// ═══════════════════════════════════════════════════════════════════════════
// VERROU DE LA VALIDATION BANCAIRE PENDANT LA FEUILLE DE LA BOUTIQUE (16/11/2026, ordre de Nico)
//     npm run selftest:achat-attente-banque
// ═══════════════════════════════════════════════════════════════════════════
// Constat (16/11 18:19, iPhone, compte 08918381) : Apple demande une validation bancaire, la personne part dans l'appli
// de sa banque, FillSell passe en arrière-plan ; au retour la feuille d'Apple a disparu, StoreKit rend « User cancelled »
// (duree_feuille_ms 35 605) et l'app affichait « Ton essai Premium + Cloud n'a pas démarré » — alors que la transaction
// peut encore arriver (Apple : Transaction.updates + notification SUBSCRIBED ; Google : PENDING puis ACHETÉ).
// Ce test prouve, sans réseau ni base (Vite SSR) :
//   A. iPhone : feuille annulée APRÈS un passage en arrière-plan (pause) → attente « validation_banque », la phrase de la
//      banque, la veille notée, quitte_app dans la trace — jamais « annule » ni la marque « n'a pas démarré » ;
//   B. iPhone : feuille annulée SANS arrière-plan → « annule » comme avant (même si appStateChange(false) a battu : sur iOS
//      il suit la feuille d'Apple et Face ID, pas l'appli de la banque) ; aucune veille ;
//   C. « pending » (Ask to Buy, Google PENDING) → attente « boutique_en_attente » + veille ; Android annulée après
//      appStateChange(false) → attente « validation_banque », « Dès que Google Play confirme » ; le Cloud seul aussi ;
//   D. retour au premier plan, serveur actif → « Ton essai … a démarré », veille effacée, veille_achat_fin « actif » ;
//      serveur pas encore actif → au plus UNE relecture différée, jamais de setInterval ;
//   E. Android : un achat ACHETÉ du produit trouvé chez Google Play → validate-google-purchase appelé UNE fois, puis
//      l'acquittement ; un achat EN ATTENTE ou d'un autre compte → rien ;
//   F. veille expirée (24 h) → veille_achat_fin « expiree », le bandeau « Reprendre ton essai » revient avec « Ta banque
//      n'a pas confirmé : rien n'a été prélevé. » ; pendant la veille, le bandeau ne se montre jamais ;
//   G. iPhone : une transaction d'abonnement FillSell livrée par Apple → vérification, relectures bornées ; un pack de
//      Pépites → ignoré ;
//   H. aucune durée promise (selftest:aucune-estimation) ; I. App branche la veille (ouverture, retour, transaction).
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const evenements = [];
globalThis.dispatchEvent = (e) => { evenements.push(e?.type); return true; };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} absent : ${String(e?.message ?? e).slice(0, 140)})`); return null; } };
const UID = '00000000-0000-4000-8000-000000000001';
try {
  const PB = await charger('/src/lib/prixBoutique.js');
  const ACH = await charger('/src/cloud/achatFormuleCloud.js');
  const ACC = await charger('/src/cloud/achatCloud.js');
  const JRN = await charger('/src/cloud/issueAchatJournal.js');
  const RE = await charger('/src/cloud/repriseEssai.js');
  const VA = await charger('/src/cloud/veilleAchatBoutique.js');
  const CO = await charger('/src/config/cloudOffer.js');
  const INT = await charger('/src/config/interrupteurs.js');
  if (INT?._remettreAZero) INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_apple: 1, cloud_formules_google: 1 });

  // Le serveur factice : cloud_etat_moi et le palier relus ; validate-google-purchase compté (et, s'il le faut, il active).
  const serveur = { cloud: { actif: false, essaiPris: false, etat: 'aucun' }, profil: { is_premium: false, is_pro: false, is_business: false }, appels: [], activerALaValidation: false };
  const sf = {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => ({ data: { session: null } }) },
    rpc: async (n) => ({ data: n === 'cloud_etat_moi' ? { ...serveur.cloud } : { ok: true, continuer: true, essai: true }, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...serveur.profil }, error: null }) }) }) }),
    functions: { invoke: async (nom, o) => {
      serveur.appels.push({ nom, body: o?.body ?? null });
      if (nom === 'garde-abonnement') return { data: { permis: true }, error: null };
      if (nom === 'validate-google-purchase' && serveur.activerALaValidation) { serveur.cloud = { actif: true, etat: 'essai', essaiPris: true }; serveur.profil.is_premium = true; }
      return { data: { success: true }, error: null };
    } },
  };
  const remettre = () => { serveur.cloud = { actif: false, essaiPris: false, etat: 'aucun' }; serveur.profil = { is_premium: false, is_pro: false, is_business: false }; serveur.appels = []; serveur.activerALaValidation = false; memoire.clear(); evenements.length = 0; };
  // CapacitorApp factice : addListener(nom, cb) → Promise<{ remove }> ; emettre(nom, données).
  const fauxApp = () => {
    const ecoutes = new Map();
    const o = { retires: 0,
      ecouter: (nom, cb) => { if (!ecoutes.has(nom)) ecoutes.set(nom, []); ecoutes.get(nom).push(cb); return Promise.resolve({ remove: async () => { o.retires++; ecoutes.set(nom, ecoutes.get(nom).filter((x) => x !== cb)); } }); },
      emettre: (nom, d) => { for (const cb of [...(ecoutes.get(nom) ?? [])]) cb(d); },
      nb: (nom) => (ecoutes.get(nom) ?? []).length };
    return o;
  };
  const creerF = (platform, { achat, app = null } = {}) => ACH?.creerAchatFormuleCloud({
    supabase: sf, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: UID, email: 'u@exemple.fr' }, lang: 'fr', platform,
    confirmer: async () => true, notifier: () => {}, demanderConditions: async () => true,
    purchasePremium: async (id, _u, opts) => achat(id, opts ?? {}), preparerChangement: null,
    ecouterApp: app ? app.ecouter : null,
  });
  const creerC = (platform, { achat, app = null } = {}) => ACC?.creerAchatCloud({
    supabase: sf, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: UID, email: 'u@exemple.fr' }, lang: 'fr', platform,
    confirmer: async () => true, notifier: () => {}, demanderConditions: async () => true,
    purchasePremium: async (id, _u, opts) => achat(id, opts ?? {}), paiementsAndroidCoupes: null,
    ecouterApp: app ? app.ecouter : null,
  });
  const prixApple = () => PB?.poserPrixBoutique({ canal: 'apple', statut: 'pret', eligibilite: { plan: true, cloud: true }, prix: {
    premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR' }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR' },
    cloud: { texte: '24,99 €', montant: 24.99, devise: 'EUR' } } });
  const prixGoogle = () => PB?.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: {
    premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR', essai: true }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: true },
    cloud: { texte: '24,99 €', montant: 24.99, devise: 'EUR', essai: true } } });
  const annuleStoreKit = { cancelled: true, issue: { issue: 'annule', code: 'USER_CANCELLED', message: 'User cancelled' } };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const marqueReprise = () => RE?.lireEssaiAReprendre?.() ?? null;

  // ── A. iPhone : annulée APRÈS l'appli de la banque ─────────────────────────────────────────────────────────────────
  console.log('\nA. iPhone : la feuille d’Apple revient « User cancelled » APRÈS un passage en arrière-plan (l’appli de la banque)');
  remettre(); prixApple(); if (CO?.noterBinaireCloud) await CO.noterBinaireCloud('ios', '2.9.205');
  let rA = null;
  {
    const app = fauxApp();
    const ach = creerF('ios', { app, achat: async () => { app.emettre('appStateChange', { isActive: false }); app.emettre('pause'); await pause(20); app.emettre('resume'); app.emettre('appStateChange', { isActive: true }); return annuleStoreKit; } });
    rA = ach ? await ach.acheter('premium_cloud', { origine: 'entree_formule_cloud', essaiAffiche: true }) : null;
    ok(rA?.etat === 'attente' && rA?.raison === 'validation_banque', 'attente, raison « validation_banque » (avant : annule / boutique_annulee → « n’a pas démarré »)', JSON.stringify(rA));
    ok(rA?.message === "On attend la validation de ta banque… Dès qu'Apple confirme, ton essai Premium + Cloud démarre tout seul : tu n'as rien à refaire.", 'la phrase : « On attend la validation de ta banque… Dès qu’Apple confirme, ton essai Premium + Cloud démarre tout seul : tu n’as rien à refaire. »', rA?.message);
    const v = VA?.lireVeilleAchat?.();
    ok(v?.userId === UID && v?.produit === 'app.fillsell.premium.cloud' && v?.formule === 'premium_cloud' && v?.canal === 'apple' && Number.isFinite(v?.depuis) && v?.repriseEssai === true, 'la veille est notée : compte, produit, formule, canal, depuis', JSON.stringify(v));
    ok(rA?.veille === true && rA?.quitte_app === true && Number.isFinite(rA?.hors_app_ms) && rA?.code === 'USER_CANCELLED', 'l’issue dit la veille, l’app partie (quitte_app, hors_app_ms) et le code de StoreKit', JSON.stringify(rA));
    const l = JRN?.issueFormuleJournal?.(rA, { origine: 'entree_formule_cloud', formule: 'premium_cloud' });
    ok(l?.quitte_app === true && l?.raison === 'validation_banque' && l?.veille === true && !('message' in (l ?? {})), 'formule_cloud_issue garde quitte_app: true et la raison (jamais le texte montré)', JSON.stringify(l));
    ok(app.retires >= 2 && app.nb('pause') === 0, 'les écoutes posées pour la feuille sont retirées après elle', `retirés ${app.retires}`);
    // App : la marque « n'a pas démarré » n'est posée que sur annule / boutique_annulee ; et le bandeau se tait pendant la veille.
    ok(!(rA?.etat === 'annule' && rA?.raison === 'boutique_annulee'), 'jamais la condition de la marque « n’a pas démarré » (annule / boutique_annulee)');
    const marque = { formule: 'premium_cloud', at: Date.now() - 60_000, canal: 'ios' };
    ok(RE?.bandeauRepriseVisible?.({ marque, cloudActif: false, vendable: true, veilleEnCours: VA?.veilleEnCours?.({ userId: UID }) }) === false, 'pendant la veille, le bandeau « n’a pas démarré » ne se montre jamais (même une vieille marque)');
    ok(evenements.includes('fs:veille-achat'), 'la veille notée prévient les écrans (fs:veille-achat)');
  }

  // ── B. iPhone : annulée sur place ───────────────────────────────────────────────────────────────────────────────────
  console.log('\nB. iPhone : feuille annulée SANS quitter l’app → « annule » comme avant');
  {
    remettre(); prixApple();
    const app = fauxApp();
    // La feuille d'Apple et Face ID font battre appStateChange (willResignActive) sans quitter l'app : jamais « la banque ».
    const ach = creerF('ios', { app, achat: async () => { app.emettre('appStateChange', { isActive: false }); await pause(5); app.emettre('appStateChange', { isActive: true }); return annuleStoreKit; } });
    const r = ach ? await ach.acheter('premium_cloud', { origine: 'bandeau_tableau', essaiAffiche: true }) : null;
    ok(r?.etat === 'annule' && r?.raison === 'boutique_annulee' && r?.code === 'USER_CANCELLED', 'annule, raison boutique_annulee (la marque « Reprendre ton essai » suit, comme avant)', JSON.stringify(r));
    ok(!('quitte_app' in (r ?? {})) && VA?.lireVeilleAchat?.() == null, 'ni quitte_app, ni veille', JSON.stringify({ r, v: VA?.lireVeilleAchat?.() }));
    const sansHote = creerF('ios', { achat: async () => annuleStoreKit });
    const r2 = sansHote ? await sansHote.acheter('pro_cloud', { essaiAffiche: true }) : null;
    ok(r2?.etat === 'annule' && r2?.raison === 'boutique_annulee', 'sans écoute fournie par l’hôte (web, ancien appel) : annule comme avant', JSON.stringify(r2));
  }

  // ── C. « pending », Android, Cloud seul ─────────────────────────────────────────────────────────────────────────────
  console.log('\nC. « En attente » (Ask to Buy, Google PENDING) ; Android ; le Cloud seul');
  {
    remettre(); prixApple();
    const r = await creerF('ios', { achat: async () => ({ isPremium: false, cancelled: false, enAttente: true, issue: { issue: 'en_attente', code: 'PENDING', message: 'Transaction pending' } }) })?.acheter('pro_cloud', { essaiAffiche: true });
    ok(r?.etat === 'attente' && r?.raison === 'boutique_en_attente' && r?.veille === true && /^On attend la validation de ta banque… Dès qu'Apple confirme, ton essai Pro \+ Cloud démarre tout seul/.test(r?.message ?? ''), 'iPhone pending → attente « boutique_en_attente », la veille, la phrase de la banque', JSON.stringify(r));
    ok(VA?.lireVeilleAchat?.()?.produit === 'app.fillsell.pro2.cloud' || VA?.lireVeilleAchat?.()?.formule === 'pro_cloud', 'la veille porte la formule demandée', JSON.stringify(VA?.lireVeilleAchat?.()));

    remettre(); prixGoogle(); if (CO?.noterBinaireCloud) await CO.noterBinaireCloud('android', '2.9.205');
    const rP = await creerF('android', { achat: async () => ({ isPremium: false, cancelled: false, enAttente: true, issue: { issue: 'en_attente', code: 'PENDING', message: 'Purchase is pending' } }) })?.acheter('premium_cloud', { essaiAffiche: true });
    ok(rP?.etat === 'attente' && rP?.raison === 'boutique_en_attente' && /Dès que Google Play confirme, ton essai Premium \+ Cloud démarre tout seul : tu n'as rien à refaire\./.test(rP?.message ?? '') && VA?.lireVeilleAchat?.()?.canal === 'google',
      'Android « Purchase is pending » → attente, « Dès que Google Play confirme… », veille canal google', JSON.stringify(rP));

    remettre(); prixGoogle();
    const app = fauxApp();
    const rA2 = await creerF('android', { app, achat: async () => { app.emettre('pause'); app.emettre('appStateChange', { isActive: false }); await pause(10); app.emettre('appStateChange', { isActive: true }); return { cancelled: true, issue: { issue: 'annule', code: 'USER_CANCELLED', message: 'USER_CANCELED' } }; } })?.acheter('premium_cloud', { essaiAffiche: true });
    ok(rA2?.etat === 'attente' && rA2?.raison === 'validation_banque' && rA2?.quitte_app === true, 'Android : annulée après appStateChange(false) (l’app n’était plus visible) → attente « validation_banque »', JSON.stringify(rA2));
    remettre(); prixGoogle();
    const app2 = fauxApp();
    const rA3 = await creerF('android', { app: app2, achat: async () => { app2.emettre('pause'); app2.emettre('resume'); return { cancelled: true, issue: { issue: 'annule', code: 'USER_CANCELLED', message: 'USER_CANCELED' } }; } })?.acheter('premium_cloud', { essaiAffiche: true });
    ok(rA3?.etat === 'annule' && rA3?.raison === 'boutique_annulee', 'Android : `pause` seul (onPause, la feuille Google Play) → annule comme avant', JSON.stringify(rA3));

    remettre(); prixApple(); if (CO?.noterBinaireCloud) await CO.noterBinaireCloud('ios', '2.9.205');
    const app3 = fauxApp();
    const rC = await creerC('ios', { app: app3, achat: async () => { app3.emettre('pause'); app3.emettre('resume'); return annuleStoreKit; } })?.acheter('reglages_cloud');
    ok(rC?.etat === 'attente' && rC?.raison === 'validation_banque' && rC?.quitte_app === true && /Dès qu'Apple confirme, ton Cloud démarre tout seul : tu n'as rien à refaire\./.test(rC?.message ?? ''), 'Cloud seul, iPhone : même règle (« ton Cloud démarre tout seul »)', JSON.stringify(rC));
    ok(VA?.lireVeilleAchat?.()?.formule === 'cloud' && VA?.lireVeilleAchat?.()?.produit === 'app.fillsell.cloud.sub', 'Cloud seul : la veille porte app.fillsell.cloud.sub', JSON.stringify(VA?.lireVeilleAchat?.()));
    const lC = JRN?.issueFormuleJournal?.(rC, { origine: 'reglages_cloud', formule: 'cloud' });
    ok(lC?.quitte_app === true && lC?.raison === 'validation_banque', 'cloud_achat_issue garde quitte_app et la raison', JSON.stringify(lC));
    const CE = await charger('/src/cloud/cloudEnsuite.js');
    const ie = CE?.issueCloudEnsuite?.(rC, 'pro', 'fr');
    ok(ie?.cle === 'attente' && ie?.titre === 'On attend ta banque' && /On attend la validation de ta banque/.test(ie?.texte ?? '') && /Ta formule Pro est active\./.test(ie?.texte ?? ''),
      '« Formule + Cloud » (étape 2) : « On attend ta banque », jamais « FillSell Cloud n’a pas été ajouté »', JSON.stringify(ie));
    remettre(); prixApple();
    const rC2 = await creerC('ios', { achat: async () => annuleStoreKit })?.acheter('reglages_cloud');
    ok(rC2?.etat === 'annule' && rC2?.raison === 'boutique_annulee' && VA?.lireVeilleAchat?.() == null, 'Cloud seul annulé sur place : annule comme avant, aucune veille', JSON.stringify(rC2));
  }

  // Une minuterie factice : on compte, on déclenche à la main (jamais une vraie attente).
  const fausseMinuterie = () => {
    const m = { poses: [], retires: 0 };
    m.poser = (f, ms) => { const t = { f, ms, fait: false }; m.poses.push(t); return t; };
    m.retirer = (t) => { if (t && !t.fait) { t.fait = true; m.retires++; } };
    m.actives = () => m.poses.filter((t) => !t.fait);
    m.declencher = async (t) => { if (!t) return; t.fait = true; t.f(); await pause(5); };
    return m;
  };
  const veilleDe = (o = {}) => {
    const fins = []; const journal = []; const m = fausseMinuterie();
    const v = VA?.creerVeilleAchat?.({ userId: UID, platform: 'ios', supabase: sf, journal: (e, md) => journal.push({ e, m: md }), surFin: (f) => fins.push(f),
      poserMinuterie: m.poser, retirerMinuterie: m.retirer, ...o });
    return { v, fins, journal, m };
  };
  const noter = (o = {}) => VA?.noterVeilleAchat?.({ userId: UID, produit: 'app.fillsell.premium.cloud', formule: 'premium_cloud', canal: 'apple', raison: 'validation_banque', essai: true, repriseEssai: true, ...o });

  // ── D. Retour au premier plan ───────────────────────────────────────────────────────────────────────────────────────
  console.log('\nD. Retour au premier plan : le serveur fait foi');
  {
    remettre(); noter();
    const { v, fins, journal, m } = veilleDe();
    const r1 = v ? await v.surRetour('retour') : null;
    ok(r1?.issue === 'attente' && m.actives().length === 1 && m.actives()[0].ms === VA?.DELAI_RELECTURE_RETOUR_MS, 'serveur pas encore actif : attente, et UNE relecture différée', JSON.stringify({ r1: r1?.issue, minuteries: m.poses.map((t) => t.ms) }));
    await v?.surRetour('retour');
    ok(m.actives().length === 1 && m.retires === 1, 'un second retour remplace la relecture différée (jamais deux en attente)', JSON.stringify({ actives: m.actives().length, retires: m.retires }));
    serveur.cloud = { actif: true, etat: 'essai', essaiPris: true }; serveur.profil.is_premium = true;
    RE?.noterEssaiAReprendre?.({ formule: 'premium_cloud', maintenant: Date.now() - 60_000 });
    await m.declencher(m.actives()[0]);
    ok(fins[0]?.issue === 'actif' && fins[0]?.message === 'Ton essai Premium + Cloud a démarré.', 'la relecture différée trouve le serveur actif → « Ton essai Premium + Cloud a démarré. »', JSON.stringify(fins));
    ok(VA?.lireVeilleAchat?.() == null && marqueReprise() == null, 'veille effacée, et toute marque « n’a pas démarré » avec elle');
    ok(journal.some((x) => x.e === 'veille_achat_fin' && x.m?.issue === 'actif' && x.m?.formule === 'premium_cloud' && Number.isFinite(x.m?.depuis_s)), 'usage_logs veille_achat_fin { issue: actif, formule, depuis_s }', JSON.stringify(journal));
    ok(m.actives().length === 0, 'plus aucune relecture prévue une fois la veille finie');

    remettre(); noter(); serveur.cloud = { actif: true, etat: 'essai', essaiPris: true }; serveur.profil.is_premium = true;
    const w = veilleDe();
    const r2 = w.v ? await w.v.surRetour('retour') : null;
    ok(r2?.issue === 'actif' && w.fins.length === 1 && w.m.poses.length === 0, 'retour avec serveur déjà actif : succès tout de suite, aucune relecture', JSON.stringify({ r2: r2?.issue, fins: w.fins.length }));
    serveur.cloud = { actif: true, etat: 'essai', essaiPris: true }; serveur.profil = { is_premium: false, is_pro: false, is_business: false };
    noter({ produit: 'app.fillsell.pro2.cloud', formule: 'pro_cloud' });
    const w2 = veilleDe();
    const r3 = w2.v ? await w2.v.verifier('ouverture') : null;
    ok(r3?.issue === 'attente', 'le Cloud seul ne suffit pas à une formule : le palier ET le Cloud (la lecture d’attendreServeur)', JSON.stringify(r3));
    remettre(); noter({ userId: 'autre-compte' });
    const w3 = veilleDe();
    ok((await w3.v?.verifier('ouverture'))?.issue === 'autre_compte' && VA?.lireVeilleAchat?.() != null, 'la veille d’un autre compte n’est jamais touchée');
    const src = lire('src/cloud/veilleAchatBoutique.js');
    ok(src.length > 0 && !/setInterval\s*\(/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'veilleAchatBoutique.js : aucun setInterval (règle relectureBornee)');
  }

  // ── E. Android : l'achat passé ACHETÉ chez Google Play ──────────────────────────────────────────────────────────────
  console.log('\nE. Android : l’achat EN ATTENTE passé ACHETÉ → validation (une fois), acquittement, puis le serveur');
  {
    remettre(); noter({ canal: 'google', raison: 'boutique_en_attente' });
    let achats = [{ productIdentifier: 'app.fillsell.premium.cloud', purchaseToken: 'jeton-play', purchaseState: '2', isAcknowledged: false, appAccountToken: UID }];
    const acquittes = [];
    const o = { platform: 'android', lireAchatsAndroid: async () => achats, acquitterGoogle: async (t) => { acquittes.push(t); } };
    const { v, fins, journal } = veilleDe(o);
    await v?.verifier('ouverture');
    ok(!serveur.appels.some((a) => a.nom === 'validate-google-purchase') && acquittes.length === 0, 'encore EN ATTENTE (purchaseState 2) : ni validation, ni acquittement', JSON.stringify(serveur.appels));
    achats = [{ ...achats[0], purchaseState: '1' }];
    await v?.surRetour('retour');
    await v?.surRetour('retour');
    const vals = serveur.appels.filter((a) => a.nom === 'validate-google-purchase');
    ok(vals.length === 1 && vals[0].body?.productId === 'app.fillsell.premium.cloud' && vals[0].body?.purchaseToken === 'jeton-play' && vals[0].body?.userId === UID, 'ACHETÉ : validate-google-purchase appelé UNE fois (produit, jeton, compte), jamais à chaque retour', JSON.stringify(vals));
    ok(acquittes.length >= 1 && acquittes.every((t) => t === 'jeton-play'), 'puis l’acquittement du jeton (sans lui, Google rembourse au bout de 3 jours)', JSON.stringify(acquittes));
    serveur.cloud = { actif: true, etat: 'essai', essaiPris: true }; serveur.profil.is_premium = true;
    await v?.surRetour('retour');
    ok(fins.some((f) => f.issue === 'actif') && VA?.lireVeilleAchat?.() == null && journal.some((x) => x.e === 'veille_achat_fin' && x.m?.issue === 'actif' && x.m?.valide_google === true), 'le serveur actif → succès, veille effacée, trace valide_google', JSON.stringify({ fins, journal }));

    remettre(); noter({ canal: 'google', raison: 'boutique_en_attente' }); serveur.activerALaValidation = true;
    const w = veilleDe({ platform: 'android', lireAchatsAndroid: async () => [{ productIdentifier: 'app.fillsell.premium.cloud', purchaseToken: 'j2', purchaseState: '1', isAcknowledged: true, appAccountToken: UID }], acquitterGoogle: async (t) => { acquittes.push(`deja:${t}`); } });
    const r = await w.v?.verifier('ouverture');
    ok(r?.issue === 'actif' && serveur.appels.filter((a) => a.nom === 'validate-google-purchase').length === 1 && !acquittes.includes('deja:j2'), 'une seule visite : validé, le serveur s’ouvre, succès ; déjà acquitté → pas de second acquittement', JSON.stringify({ r: r?.issue, appels: serveur.appels }));

    remettre(); noter({ canal: 'google' });
    const w2 = veilleDe({ platform: 'android', lireAchatsAndroid: async () => [{ productIdentifier: 'app.fillsell.premium.cloud', purchaseToken: 'j3', purchaseState: '1', isAcknowledged: false, appAccountToken: 'un-autre-compte' },
      { productIdentifier: 'app.fillsell.pro.cloud', purchaseToken: 'j4', purchaseState: '1', isAcknowledged: false, appAccountToken: UID }] });
    await w2.v?.verifier('ouverture');
    ok(!serveur.appels.some((a) => a.nom === 'validate-google-purchase'), 'un achat d’un autre compte, ou d’un autre produit : jamais validé ici', JSON.stringify(serveur.appels));
    remettre(); noter({ canal: 'google' });
    const w3 = veilleDe({ platform: 'android', lireAchatsAndroid: async () => { throw new Error('BILLING_UNAVAILABLE'); } });
    ok((await w3.v?.verifier('ouverture'))?.issue === 'attente', 'Google Play illisible : la veille continue (le serveur reste lu)');
  }

  // ── F. 24 h sans confirmation ───────────────────────────────────────────────────────────────────────────────────────
  console.log('\nF. 24 h sans confirmation : la veille s’éteint, le bandeau « Reprendre ton essai » revient avec la phrase vraie');
  {
    remettre(); noter({ maintenant: Date.now() - 25 * 3600_000 });
    const { v, fins, journal } = veilleDe();
    const r = await v?.surRetour('retour');
    ok(r?.issue === 'expiree' && VA?.lireVeilleAchat?.() == null, 'veille expirée → éteinte', JSON.stringify(r));
    ok(journal.some((x) => x.e === 'veille_achat_fin' && x.m?.issue === 'expiree' && x.m?.bandeau === true), 'usage_logs veille_achat_fin { issue: expiree, bandeau: true }', JSON.stringify(journal));
    const m = marqueReprise();
    ok(m?.formule === 'premium_cloud' && m?.raison === 'banque_non_confirmee', 'la marque « Reprendre ton essai » est posée, raison banque_non_confirmee', JSON.stringify(m));
    ok(RE?.bandeauRepriseVisible?.({ marque: m, cloudActif: false, vendable: true, veilleEnCours: VA?.veilleEnCours?.({ userId: UID }) }) === true, 'le bandeau se montre (tout de suite : la veille a déjà attendu)');
    const t = RE?.texteBandeauReprise?.('fr', 'premium_cloud', { raison: m?.raison });
    ok(/^Ta banque n'a pas confirmé : rien n'a été prélevé\. Reprends-le quand tu veux/.test(t?.corps ?? ''), '« Ta banque n’a pas confirmé : rien n’a été prélevé. Reprends-le quand tu veux… »', t?.corps);
    ok(/^Your bank didn't confirm: nothing was charged\./.test(RE?.texteBandeauReprise?.('en', 'premium_cloud', { raison: 'banque_non_confirmee' })?.corps ?? ''), 'en anglais aussi');
    ok(RE?.texteBandeauReprise?.('fr', 'premium_cloud')?.corps?.startsWith("Rien n'a été prélevé.") === true, 'sans raison : le texte d’avant');
    ok(fins[0]?.issue === 'expiree' && fins[0]?.bandeau === true && fins[0]?.message == null, 'le bandeau dit la phrase (pas de toast en plus)', JSON.stringify(fins));
    remettre(); VA?.noterVeilleAchat?.({ userId: UID, produit: 'app.fillsell.cloud.sub', formule: 'cloud', canal: 'apple', raison: 'validation_banque', maintenant: Date.now() - 25 * 3600_000 });
    const w = veilleDe();
    await w.v?.verifier('ouverture');
    ok(w.fins[0]?.issue === 'expiree' && w.fins[0]?.message === "Ta banque n'a pas confirmé : rien n'a été prélevé." && marqueReprise() == null, 'Cloud seul (pas de bandeau de reprise) : la phrase vraie en message', JSON.stringify(w.fins));
    remettre(); noter({ maintenant: Date.now() - 23 * 3600_000 });
    ok((await veilleDe().v?.verifier('ouverture'))?.issue === 'attente', '23 h : la veille continue');
  }

  // ── G. iPhone : la transaction livrée par Apple ─────────────────────────────────────────────────────────────────────
  console.log('\nG. iPhone : transactionUpdated pendant la veille');
  {
    remettre(); noter();
    const { v, fins, m } = veilleDe();
    ok((await v?.surTransaction({ productIdentifier: 'app.fillsell.coins.100' }))?.issue === 'ignoree', 'un pack de Pépites : ignoré (listenCoinTransactionUpdates le traite)');
    ok((await v?.surTransaction({ productIdentifier: 'app.fillsell.premium.cloud', appAccountToken: 'AUTRE' }))?.issue === 'autre_compte', 'la transaction d’un autre compte (appAccountToken) : ignorée');
    const r = await v?.surTransaction({ productIdentifier: 'app.fillsell.premium.cloud', appAccountToken: UID.toUpperCase(), jwsRepresentation: 'jws' });
    ok(r?.issue === 'attente' && m.actives().length === (VA?.RELECTURES_APRES_TRANSACTION_MS?.length ?? -1) && m.actives().length <= 3, 'la transaction arrive avant la notification d’Apple : relectures BORNÉES (au plus 3)', JSON.stringify(m.poses.map((t) => t.ms)));
    await v?.surTransaction({ productIdentifier: 'app.fillsell.premium.cloud', appAccountToken: UID });
    ok(m.poses.length === (VA?.RELECTURES_APRES_TRANSACTION_MS?.length ?? -1), 'une seconde transaction n’empile pas d’autres relectures');
    serveur.cloud = { actif: true, etat: 'essai', essaiPris: true }; serveur.profil.is_premium = true;
    await m.declencher(m.actives()[0]);
    ok(fins[0]?.issue === 'actif' && fins[0]?.message === 'Ton essai Premium + Cloud a démarré.' && VA?.lireVeilleAchat?.() == null, 'le serveur l’a activé (notification d’Apple) → « Ton essai Premium + Cloud a démarré. »', JSON.stringify(fins));
    for (const t of m.actives()) await m.declencher(t);
    ok(fins.length === 1, 'les relectures restantes ne relisent plus rien (veille finie)', JSON.stringify(fins.length));
    ok(VA?.estAbonnementFillSell?.('app.fillsell.cloud.sub') === true && VA?.estAbonnementFillSell?.('app.fillsell.coins.460') === false, 'estAbonnementFillSell : abonnements oui, Pépites non');
  }

  // ── H. Aucune durée promise ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nH. Aucune durée promise');
  {
    const phrases = [
      VA?.texteAttenteBanque?.({ lang: 'fr', canal: 'apple', formule: 'premium_cloud', essai: true }), VA?.texteAttenteBanque?.({ lang: 'en', canal: 'google', formule: 'cloud', essai: true }),
      VA?.texteAttenteBanque?.({ lang: 'fr', canal: 'google', formule: 'business_cloud' }), VA?.texteVeilleActive?.({ lang: 'en', formule: 'pro_cloud', essai: true }), VA?.texteBanqueNonConfirmee?.('fr'),
    ];
    // « As soon as » (« dès que ») n'est pas une durée.
    ok(phrases.every((p) => typeof p === 'string' && p.length > 0) && !phrases.some((p) => /\d|\bminutes?\b|\bheures?\b|\bhours?\b|\bseconds?\b|\binstant\b|\bbientôt\b|\bsoon\b|\bjours?\b|\bdays?\b/i.test(p.replace(/\bAs soon as\b/g, ''))),
      'ni chiffre, ni « minute / heure / instant / bientôt » dans les phrases de la veille', JSON.stringify(phrases));
    ok(phrases[2] === "On attend la validation de ta banque… Dès que Google Play confirme, Business + Cloud démarre tout seul : tu n'as rien à refaire.", 'sans essai : « … Business + Cloud démarre tout seul » (jamais « ton essai »)', phrases[2]);
    let est = '';
    try { execFileSync(process.execPath, [join(ROOT, 'scripts/aucune-estimation-selftest.mjs')], { cwd: ROOT, stdio: 'pipe' }); est = 'vert'; } catch (e) { est = String(e?.stdout ?? '') + String(e?.stderr ?? ''); }
    ok(est === 'vert', 'selftest:aucune-estimation vert sur le dépôt', est.slice(-400));
  }

  // ── I. Le branchement dans App ──────────────────────────────────────────────────────────────────────────────────────
  console.log('\nI. App branche la veille : ouverture, chaque retour, chaque transaction ; l’achat reçoit l’écoute de l’app');
  {
    const app = lire('src/App.jsx');
    const n = (re) => (app.match(re) ?? []).length;
    ok(n(/ecouterApp:isNative\?\(nom,cb\)=>CapacitorApp\.addListener\(nom,cb\):null/g) === 2, 'creerAchatCloud ET creerAchatFormuleCloud reçoivent ecouterApp (injecté, jamais importé dans les modules purs)');
    ok(/const veille=creerVeilleAchat\(\{/.test(app) && /veille\.verifier\('ouverture'\)/.test(app), 'la veille est vérifiée à l’ouverture');
    ok(/CapacitorApp\.addListener\('appStateChange',\(\{isActive\}\)=>\{if\(isActive\)veille\.surRetour\('retour'\);\}\)/.test(app), 'et à CHAQUE retour au premier plan (appStateChange actif)');
    ok(/ecouterTransactionsAbonnement\(\(tx\)=>\{veille\.surTransaction\(tx\);\}\)/.test(app) && /if\(platform==='ios'\)\{\s*try\{poignees\.push\(ecouterTransactionsAbonnement/.test(app), 'iPhone : transactionUpdated des abonnements FillSell écouté pendant la veille');
    ok(/lireAchatsAndroid:platform==='android'\?lireAbonnementsPlay:null/.test(app) && /acquitterGoogle:platform==='android'\?acquitterAchatPlay:null/.test(app), 'Android : getPurchases(subs) et l’acquittement branchés');
    ok(/if\(r\?\.etat==='attente'&&r\?\.veille===true\)effacerEssaiAReprendre\(\);/.test(app), 'une attente de la banque efface la marque « n’a pas démarré »');
    const iap = lire('src/lib/iap.js');
    ok(/NativePurchases\.addListener\('transactionUpdated'/.test(iap) && /COIN_PRODUCT_IDS\.includes\(tx\.productIdentifier\)\) return;/.test(iap), 'iap.js : écoute des abonnements, jamais des packs de Pépites');
    ok(/NativePurchases\.getPurchases\(\{ productType: 'subs' \}\)/.test(iap) && /NativePurchases\.acknowledgePurchase\(\{ purchaseToken: String\(purchaseToken\) \}\)/.test(iap), 'iap.js : abonnements Play lus, acquittement par une méthode déjà dans le binaire');
    const b = lire('src/cloud/BandeauReprendreEssai.jsx');
    ok(/veilleEnCours: veille/.test(b) && /EVENEMENT_VEILLE/.test(b) && /raison: marque\.raison/.test(b), 'le bandeau : caché pendant la veille, relu quand elle change, la phrase de la banque');
  }
} finally {
  await vite.close();
}
console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
