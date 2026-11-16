// ═══════════════════════════════════════════════════════════════════════════
// VERROU DE LA RÈGLE DE NICO DU 16/11/2026 — UN SEUL ESSAI CLOUD PAR PERSONNE, TOUTES FORMULES, TOUS CANAUX
//     npm run selftest:essai-cloud-unique
// ═══════════════════════════════════════════════════════════════════════════
// « Un client qui n'a jamais eu d'essai Cloud y a droit, même s'il est déjà abonné Premium ou Pro sans Cloud. Un client qui
// a déjà eu un essai Cloud (Premium + Cloud, Pro + Cloud, ou sur un autre canal) n'en a JAMAIS un deuxième : s'il passe de
// Premium + Cloud à Pro + Cloud, il paie directement. » — et jamais une semaine sans service (décision b, gardée).
// Avant ce correctif, sur iPhone et Android, l'app ouvrait la feuille de la boutique quel que soit l'essai FillSell (décision
// b) : l'App Store (identifiant Apple neuf, autre groupe) et Google (« jamais eu cet abonnement », vieux binaire qui prend la
// première offre) accordaient une 2e semaine. Ce test prouve, sans réseau ni base (Vite SSR) :
//   A. le registre (_shared/essai-cloud-unique.js) lit les données réelles (profiles.cloud_essai_*, préparation, Stripe) et
//      dit la même chose que le serveur web d'aujourd'hui (essaiCloudPermis) ;
//   B. la décision pure : les TROIS cas de Nico × web / Android vc39 / iPhone, + web puis iPhone (identifiant Apple neuf),
//      + Android < 2.9.205, + Business + Cloud ;
//   C. LE VRAI CHEMIN D'ACHAT de l'app (achatFormuleCloud, achatCloud) sur les mêmes cas : la feuille, l'offre de Google
//      demandée, ou le refus AVANT la feuille ; le web suit le serveur (voieFormuleStripe + essaiCloudPermis) ;
//   D. le réglage de chaque offre Google : seul « N'ont jamais eu cet abonnement » (ou « Défini par le développeur ») + la
//      vérification FillSell donne EXACTEMENT la règle ; « N'ont jamais eu d'abonnement » refuse l'essai dû ; Apple : rien ;
//   E. les cartes disent avant le clic ce qui arrivera ; F. les phrases (fr + en, une phrase, aucune durée) ;
//   G. le filet du serveur reste « jamais une semaine sans service » ; package.json.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 700)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const J = 86_400_000;
const MAINTENANT = Date.parse('2026-11-16T18:00:00+01:00');
const S = (ms) => Math.floor(ms / 1000);
const jws = (charge) => `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.c2ln`;
const tx = (id, { intro = false, fin = '2026-10-01T10:00:00Z' } = {}) => ({
  productIdentifier: id, expirationDate: fin, isActive: Date.parse(fin) > MAINTENANT,
  jwsRepresentation: jws({ productId: id, ...(intro ? { offerType: 1, offerDiscountType: 'FREE_TRIAL' } : {}) }),
});
const PRIX = { standard: 'price_STD', pro: 'price_PRO', business: 'price_BUS', cloud: 'price_CLOUD', premium_cloud: 'price_PC1', pro_cloud: 'price_PC2', business_cloud: 'price_PC3' };
const NOMS = { premium_cloud: 'Premium + Cloud', pro_cloud: 'Pro + Cloud', business_cloud: 'Business + Cloud', cloud: 'FillSell Cloud' };

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
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} absent : ${String(e?.message ?? e).slice(0, 160)})`); return null; } };
try {
  const EU = await charger('/supabase/functions/_shared/essai-cloud-unique.js');
  const CO = await charger('/supabase/functions/_shared/cloud-option.js');
  const FS = await charger('/supabase/functions/_shared/formules-serveur.js');
  const PB = await charger('/src/lib/prixBoutique.js');
  const EA = await charger('/src/lib/eligibiliteApple.js');
  const ACH = await charger('/src/cloud/achatFormuleCloud.js');
  const ACS = await charger('/src/cloud/achatCloud.js');
  const FC = await charger('/src/cloud/formulesCloud.js');
  const TF = await charger('/src/cloud/textesFormules.js');
  const CFG = await charger('/src/config/cloudOffer.js');
  const INT = await charger('/src/config/interrupteurs.js');
  if (CFG?.noterBinaireCloud) await CFG.noterBinaireCloud('web', 'web');
  if (INT?._remettreAZero) INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_apple: 1, cloud_formules_google: 1 });
  ok(Boolean(EU?.essaiCloudDejaEu && EU?.decisionEssaiCloud && EU?.texteRefusEssaiCloud && EU?.REGLAGES_STORES), 'la règle a UNE source pure : supabase/functions/_shared/essai-cloud-unique.js');

  // ── Les personnes (données réelles : colonnes de profiles, préparation, abonnements Stripe, historique Apple, Google) ──
  const debut = new Date(MAINTENANT - 20 * J).toISOString(), fin = new Date(MAINTENANT - 13 * J).toISOString();
  const subPremium = { id: 'sub_prem', status: 'active', metadata: { plan_type: 'standard' }, items: { data: [{ price: { id: PRIX.standard } }] }, current_period_end: S(MAINTENANT + 20 * J) };
  const subPCEssaiFini = { id: 'sub_pc', status: 'canceled', metadata: { plan_type: 'standard', formule: 'premium_cloud', essai_cloud: '1' }, items: { data: [{ price: { id: PRIX.premium_cloud } }] }, trial_start: S(MAINTENANT - 20 * J), trial_end: S(MAINTENANT - 13 * J), ended_at: S(MAINTENANT - 13 * J) };
  const PERSONNES = {
    // Cas 1 de Nico : jamais eu d'essai Cloud (compte Free, identifiant Apple et compte Google neufs).
    neuf: { profil: { cloud_essai_debut: null, cloud_essai_arrete: false }, prep: { ok: true, essai: true, raison: null }, subs: [], apple: [], google: [] },
    // Cas 2 : a eu Premium + Cloud EN ESSAI (fini), même identifiant Apple / compte Google — puis veut Pro + Cloud.
    eu_pc_stripe: { profil: { cloud_essai_debut: debut, cloud_essai_fin: fin, cloud_canal: 'stripe', cloud_formule: null }, prep: { ok: true, essai: false, raison: 'essai_deja_pris' }, subs: [subPCEssaiFini], apple: [], google: [] },
    eu_pc_apple: { profil: { cloud_essai_debut: debut, cloud_essai_fin: fin, cloud_canal: 'apple' }, prep: { ok: true, essai: false, raison: 'essai_deja_pris' }, subs: [], apple: [tx('app.fillsell.premium.cloud', { intro: true, fin })], google: [] },
    eu_pc_google: { profil: { cloud_essai_debut: debut, cloud_essai_fin: fin, cloud_canal: 'google' }, prep: { ok: true, essai: false, raison: 'essai_deja_pris' }, subs: [], apple: [], google: ['app.fillsell.premium.cloud'] },
    // Cas 3 : déjà abonné Premium SANS Cloud, jamais d'essai Cloud (Stripe / App Store / Google Play, en cours).
    abonne_premium: { profil: { cloud_essai_debut: null }, prep: { ok: true, essai: true, raison: null }, subs: [subPremium],
      apple: [tx('app.fillsell.premium.standard', { fin: new Date(MAINTENANT + 20 * J).toISOString() })], google: ['app.fillsell.premium.standard'] },
    // Essai pris sur le WEB, puis iPhone avec un identifiant Apple NEUF (aucune transaction FillSell).
    web_puis_iphone: { profil: { cloud_essai_debut: debut, cloud_essai_fin: fin, cloud_canal: 'stripe' }, prep: { ok: true, essai: false, raison: 'essai_deja_pris' }, subs: [subPCEssaiFini], apple: [], google: [] },
    // Ex-abonné Premium Google Play (échu), jamais d'essai Cloud : il y a droit (cas 3, abonnement passé).
    ex_premium_google: { profil: { cloud_essai_debut: null }, prep: { ok: true, essai: true, raison: null }, subs: [], apple: [], google: ['app.fillsell.premium.standard'] },
    // test5 de Nico (16/11) : compte NEUF sur un iPhone qui a servi à l'essai d'un autre compte (verrou, pas le registre).
    test5: { profil: { cloud_essai_debut: null }, prep: { ok: true, essai: false, raison: 'appareil_deja_vu' }, subs: [], apple: [], google: [] },
  };

  // ── A. Le registre ───────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nA. Le registre « a-t-il déjà eu un essai Cloud ? » — données réelles, et le même verdict que le serveur web');
  if (EU) {
    const R = (x) => EU.essaiCloudDejaEu(x).deja;
    ok(R({ profil: { cloud_essai_debut: debut } }) === true && R({ profil: { cloud_essai_debut: null } }) === false, 'profiles.cloud_essai_debut (tous canaux, jamais effacé) fait foi');
    ok(R({ profil: { cloud_essai_debut: debut, cloud_essai_arrete: true } }) === true, 'un essai arrêté (verrou de carte, remboursement) est daté : il compte (prod 16/11 : 0 essai arrêté sans date)');
    ok(R({ preparation: { ok: true, essai: false, raison: 'essai_deja_pris' } }) === true && R({ preparation: { ok: true, essai: false, raison: 'appareil_deja_vu' } }) === false
      && R({ preparation: { ok: true, essai: true, raison: null } }) === false, 'préparation (cloud_essai_preparer_moi de prod) : « essai_deja_pris » = déjà eu ; un verrou d’appareil n’est PAS le registre');
    ok(R({ profil: { is_premium: true } }) === null && R({}) === null && R({ preparation: { ok: false, raison: 'complet' } }) === null, 'rien de lu (colonne absente, préparation refusée) → null, jamais un refus');
    ok(R({ essaiStripe: true }) === true, 'serveur : l’historique Stripe d’un essai (Cloud seul, formule, essai d’abonné) compte');
    ok(R({ etatServeur: { actif: false, essaiPris: true } }) === true && R({ etatServeur: { actif: false, essaiPris: false } }) === false && R({ etatServeur: { actif: true } }) === null,
      'app : cloud_etat_moi (essaiPris, lu par le serveur) — jamais une colonne Cloud lue par l’app (selftest:cloud-ecrans)');
    // Le même verdict que create-checkout-session (essaiCloudPermis) sur une grille de profils × abonnements Stripe.
    if (CO?.essaiCloudPermis) {
      const profils = [{}, { cloud_essai_debut: debut }, { cloud_essai_debut: null, cloud_essai_arrete: true }, { is_cloud: true }, { cloud_essai_debut: null }];
      const subsCas = [[], [subPremium], [subPCEssaiFini], [{ id: 'c', status: 'canceled', metadata: { option: 'cloud' }, items: { data: [{ price: { id: PRIX.cloud } }] }, trial_start: 1 }],
        [{ id: 'a', status: 'active', metadata: { plan_type: 'standard', essai_cloud_formule: 'premium_cloud', essai_cloud_debut: String(S(MAINTENANT)), essai_cloud_fin: String(S(MAINTENANT + 7 * J)) }, items: { data: [{ price: { id: PRIX.standard } }] } }]];
      let ecarts = [];
      for (const p of profils) for (const subs of subsCas) {
        const serveur = CO.essaiCloudPermis(p, subs, PRIX);
        const regle = p.is_cloud !== true && EU.essaiCloudDejaEu({ profil: { cloud_essai_debut: null, ...p }, essaiStripe: !CO.essaiCloudPermis({}, subs, PRIX) }).deja === false;
        if (serveur !== regle) ecarts.push({ p, subs: subs.map((s) => s.id), serveur, regle });
      }
      ok(ecarts.length === 0, `registre ≡ essaiCloudPermis du serveur web sur ${profils.length * subsCas.length} cas`, JSON.stringify(ecarts));
    } else ok(false, 'cloud-option.js se charge');
  }

  // ── B. La décision pure ──────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nB. La décision pure — les trois cas de Nico × web / Android vc39 / iPhone, et les cas en plus');
  const V39 = '2.9.205', V38 = '2.9.176';
  const D = (x) => EU?.decisionEssaiCloud?.(x) ?? {};
  if (EU) {
    // Cas 1 : jamais eu → essai partout.
    ok(D({ canal: 'stripe', produit: 'pro_cloud', deja: false }).essai === true, 'cas 1 × web : essai (Stripe)');
    ok(D({ canal: 'google', produit: 'pro_cloud', deja: false, boutique: 'oui', binaire: V39 }).offre === 'essai', 'cas 1 × Android vc39 : l’offre « essai » de Google');
    ok(D({ canal: 'apple', produit: 'pro_cloud', deja: false, boutique: 'oui' }).issue === 'essai', 'cas 1 × iPhone : la semaine d’Apple (offre d’introduction)');
    // Cas 2 : déjà eu Premium + Cloud en essai → Pro + Cloud payé directement.
    ok(D({ canal: 'stripe', produit: 'pro_cloud', deja: true }).essai === false, 'cas 2 × web : Pro + Cloud payé directement');
    for (const b of ['oui', 'non']) ok(D({ canal: 'google', produit: 'pro_cloud', deja: true, boutique: b, binaire: V39 }).offre === 'base', `cas 2 × Android vc39 (Google ${b === 'oui' ? 'propose' : 'ne propose pas'} sa semaine) : l’offre « base », payé directement`);
    ok(D({ canal: 'apple', produit: 'pro_cloud', deja: true, boutique: 'non' }).issue === 'paye', 'cas 2 × iPhone (même identifiant Apple : semaine du groupe déjà prise) : payé directement');
    // Cas 3 : abonné Premium sans Cloud, jamais d'essai → essai.
    ok(D({ canal: 'stripe', produit: 'premium_cloud', deja: false }).essai === true && FS?.voieFormuleStripe?.({ formule: 'premium_cloud', palierStripe: { id: 's', status: 'active', rang: 1, formule: null }, essaiPermis: true })?.voie === 'essai_abonne',
      'cas 3 × web : essai d’abonné (il ne paie que sa formule)');
    ok(D({ canal: 'google', produit: 'cloud', deja: false, boutique: 'oui', binaire: V39 }).offre === 'essai', 'cas 3 × Android vc39 : le Cloud seul en essai (offre « essai »)');
    ok(D({ canal: 'apple', produit: 'cloud', deja: false, boutique: 'oui' }).issue === 'essai', 'cas 3 × iPhone : le Cloud seul (groupe « FillSell Cloud ») en essai');
    // En plus.
    for (const b of ['oui', 'inconnu']) {
      const d = D({ canal: 'apple', produit: 'premium_cloud', deja: true, boutique: b });
      ok(d.issue === 'refus' && d.essai === false, `essai pris sur le web puis iPhone, identifiant Apple neuf (Apple ${b}) : REFUS avant la feuille (${d.raison})`, JSON.stringify(d));
    }
    ok(D({ canal: 'apple', produit: 'cloud', deja: true, boutique: 'oui' }).issue === 'refus', 'essai de formule pris, puis le Cloud seul (autre groupe Apple) : refus');
    for (const deja of [true, false]) {
      const d = D({ canal: 'google', produit: 'premium_cloud', deja, boutique: 'oui', binaire: V38 });
      ok(d.issue === 'refus' && d.raison === 'mettre_a_jour_android', `Android 2.9.176 (< 2.9.205), offre d’essai proposée, ${deja ? 'essai déjà eu' : 'jamais eu'} : « Mets à jour FillSell »`, JSON.stringify(d));
    }
    ok(D({ canal: 'google', produit: 'premium_cloud', deja: true, boutique: 'non', binaire: V38 }).issue === 'paye', 'Android 2.9.176, aucune offre d’essai proposée : payé (la seule offre est la base)');
    for (const canal of ['stripe', 'google', 'apple']) {
      const d = D({ canal, produit: 'business_cloud', deja: false, boutique: canal === 'google' ? 'non' : 'non', binaire: V39 });
      ok(d.essai === false && d.issue === 'paye', `Business + Cloud × ${canal} : jamais d’essai`, JSON.stringify(d));
    }
    ok(D({ canal: 'stripe', produit: 'pro_cloud', deja: false, verrou: 'appareil_deja_vu' }).essai === false && D({ canal: 'apple', produit: 'pro_cloud', deja: false, boutique: 'oui' }).issue === 'essai',
      'verrous d’appareil / de compte : web seulement (comme avant) ; iPhone : test5 garde la semaine d’Apple');
  }

  // ── C. Le vrai chemin d'achat de l'app ───────────────────────────────────────────────────────────────────────────────
  console.log('\nC. Le chemin d’achat de l’app (achatFormuleCloud, achatCloud) — la feuille, l’offre, ou le refus AVANT la feuille');
  const CRITERE_GOOGLE = Object.fromEntries((EU?.REGLAGES_STORES?.google ?? []).map((r) => [r.produit, r.apres]));
  const googleVoit = (critere, eus, produitId) => (critere === 'developpeur' ? true : critere === 'jamais_eu_d_abonnement' ? eus.length === 0
    : critere === 'jamais_eu_cet_abonnement' ? !eus.includes(produitId) : false);
  const ID_G = { premium_cloud: 'app.fillsell.premium.cloud', pro_cloud: 'app.fillsell.pro.cloud', business_cloud: 'app.fillsell.business.cloud', cloud: 'app.fillsell.cloud.sub' };
  const prixBase = { premium: ['12,99 €', 12.99], pro: ['29,99 €', 29.99], business: ['59,99 €', 59.99], cloud: ['24,99 €', 24.99], premium_cloud: ['34,99 €', 34.99], pro_cloud: ['49,99 €', 49.99], business_cloud: ['79,99 €', 79.99] };
  /** Pose la boutique comme le chargeur natif : Google ne rend que les offres auxquelles CE compte a droit (critère). */
  function poserBoutique(canal, personne, criteres = CRITERE_GOOGLE) {
    if (canal === 'stripe') { PB?.poserPrixBoutique(null); return; }
    const prix = {};
    for (const [k, [t, m]] of Object.entries(prixBase)) {
      prix[k] = { texte: t, montant: m, devise: 'EUR', ...(canal === 'google' ? { essai: ID_G[k] ? googleVoit(criteres[ID_G[k]] ?? null, personne.google, ID_G[k]) : false } : {}) };
    }
    PB?.poserPrixBoutique({ canal, statut: 'pret', prix });
    if (canal === 'apple') PB?.poserEligibiliteApple?.(EA?.eligibiliteApple?.(personne.apple, MAINTENANT) ?? null);
  }
  const sb = (personne) => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => ({ data: { session: null } }) },
    // cloud_etat_moi (prod) : essaiPris = profiles.cloud_essai_debut non nul — l'app ne lit jamais les colonnes Cloud elle-même.
    rpc: async (n) => ({ data: n === 'cloud_etat_moi' ? { actif: true, ...(personne.etatIllisible ? {} : { essaiPris: personne.profil.cloud_essai_debut != null }) }
      : n === 'cloud_essai_preparer_moi' ? personne.prep : null, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: true, is_pro: true, is_business: true }, error: null }) }) }) }),
    functions: { invoke: async (nom) => (nom === 'garde-abonnement' ? { data: { permis: true }, error: null } : { data: {}, error: null }) },
  });
  const user = { id: '00000000-0000-4000-8000-0000000000e1', email: 'e@exemple.fr' };
  async function acheterMobile(platform, personne, produit, { binaire = V39, essaiAffiche = null, abonneBoutique = false } = {}) {
    const j = { feuilles: [], questions: [], conditions: 0 };
    const purchasePremium = async (id, _u, opts) => { j.feuilles.push({ id, offre: opts?.offre ?? null }); return platform === 'android' ? { purchaseToken: 'jeton' } : { receipt: 'r' }; };
    const commun = { supabase: sb(personne), supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user, lang: 'fr', platform, purchasePremium,
      confirmer: async (q) => { j.questions.push(q); return true; }, notifier: () => {}, demanderConditions: async () => { j.conditions++; return true; }, binaireNatif: binaire };
    let r;
    if (produit === 'cloud') r = await ACS?.creerAchatCloud({ ...commun, ouvrirLien: async () => {} })?.acheter('selftest');
    else {
      // L'essai affiché = ce que la carte a annoncé (essaiPermis lu du profil, semaine de la boutique), sauf forçage.
      const ea = essaiAffiche ?? (personne.profil.cloud_essai_debut == null && PB?.etatEssaiBoutique?.(produit) === 'oui' && produit !== 'business_cloud');
      r = await ACH?.creerAchatFormuleCloud({ ...commun, preparerChangement: null })?.acheter(produit, { origine: 'selftest', essaiAffiche: ea, abonneBoutique });
    }
    return { r, ...j };
  }
  /** L'issue lue sur le chemin réel : 'essai' | 'paye' | 'refus:<raison>'. Android : l'offre demandée ; iPhone : la feuille
   *  s'ouvre et Apple applique sa semaine si l'identifiant y a droit (eligibiliteApple). */
  function issueMobile(platform, res, personne, produit) {
    if (!res.feuilles.length) return `refus:${res.r?.raison ?? '?'}`;
    if (platform === 'android') return res.feuilles[0].offre === 'essai' ? 'essai' : res.feuilles[0].offre === 'base' ? 'paye' : `offre_non_nommee`;
    const el = EA?.eligibiliteApple?.(personne.apple, MAINTENANT) ?? {};
    const groupe = produit === 'cloud' ? 'cloud' : 'plan';
    const apple = produit === 'business_cloud' ? false : el[groupe] === true;
    return apple ? 'essai' : 'paye';
  }
  const CAS = [
    // [nom, personne, produit, attendu web, attendu Android vc39, attendu iPhone]
    ['cas 1 — jamais eu d’essai → essai', 'neuf', 'pro_cloud', 'essai', 'essai', 'essai'],
    ['cas 2 — Premium + Cloud en essai (Stripe), puis Pro + Cloud → payé direct', 'eu_pc_stripe', 'pro_cloud', 'paye', 'paye', 'refus:deuxieme_essai_apple'],
    ['cas 2 — Premium + Cloud en essai (App Store, même identifiant), puis Pro + Cloud → payé direct', 'eu_pc_apple', 'pro_cloud', 'paye', 'paye', 'paye'],
    ['cas 2 — Premium + Cloud en essai (Google Play, même compte), puis Pro + Cloud → payé direct', 'eu_pc_google', 'pro_cloud', 'paye', 'paye', 'refus:deuxieme_essai_apple'],
    ['cas 2 — puis le Cloud seul → payé direct (ou refus)', 'eu_pc_google', 'cloud', 'paye', 'paye', 'refus:deuxieme_essai_apple'],
    ['cas 3 — abonné Premium sans Cloud → essai (le Cloud seul sur mobile)', 'abonne_premium', 'cloud', 'essai', 'essai', 'essai'],
    ['essai pris sur le web, puis iPhone avec un identifiant Apple neuf', 'web_puis_iphone', 'premium_cloud', 'paye', 'paye', 'refus:deuxieme_essai_apple'],
    ['essai pris sur le web, puis le Cloud seul sur iPhone (identifiant neuf)', 'web_puis_iphone', 'cloud', 'paye', 'paye', 'refus:deuxieme_essai_apple'],
    ['ex-abonné Premium Google (échu), jamais d’essai → essai', 'ex_premium_google', 'premium_cloud', 'essai', 'essai', 'essai'],
    ['Business + Cloud, compte neuf → jamais d’essai', 'neuf', 'business_cloud', 'paye', 'paye', 'paye'],
    ['test5 (verrou d’appareil, pas le registre) → la semaine d’Apple garde le service (décision b)', 'test5', 'premium_cloud', 'paye', 'essai', 'essai'],
  ];
  // Le web : le serveur (create-checkout-session) — essaiCloudPermis + la préparation, puis voieFormuleStripe.
  function issueWeb(personne, produit) {
    const essaiPermis = CO.essaiCloudPermis(personne.profil, personne.subs, PRIX) && personne.prep.essai === true;
    if (produit === 'cloud') {
      const p = CO.parametresCheckoutCloud({ prixCloud: PRIX.cloud, essai: essaiPermis, userId: 'u', maintenant: MAINTENANT });
      return p.subscription_data.trial_period_days ? 'essai' : 'paye';
    }
    const palier = personne.subs.find((s) => s.status === 'active' && s.metadata?.plan_type === 'standard');
    const v = FS.voieFormuleStripe({ formule: produit, palierStripe: palier ? { id: palier.id, status: 'active', rang: 1, formule: null } : null, essaiPermis });
    if (v.voie === 'essai_abonne') return 'essai';
    if (v.voie !== 'checkout') return `voie:${v.voie}`;
    const p = FS.parametresCheckoutFormule({ formule: produit, prixFormule: PRIX[produit], essai: v.essai, userId: 'u', maintenant: MAINTENANT });
    return p.subscription_data.trial_period_days ? 'essai' : 'paye';
  }
  for (const [nom, cle, produit, aWeb, aAndroid, aIphone] of CAS) {
    const personne = PERSONNES[cle];
    // Web
    if (CO && FS) {
      // Le cas 3 sur le web passe par la formule de son palier (essai d'abonné), jamais par le Cloud seul.
      const iw = issueWeb(personne, cle === 'abonne_premium' ? 'premium_cloud' : produit);
      ok(iw === aWeb, `${nom} × web : ${aWeb}`, iw);
    }
    // Android vc39
    poserBoutique('google', personne);
    const ra = await acheterMobile('android', personne, produit, { binaire: V39 });
    const ia = issueMobile('android', ra, personne, produit);
    ok(ia === aAndroid, `${nom} × Android vc39 : ${aAndroid}`, JSON.stringify({ ia, feuilles: ra.feuilles, r: ra.r, q: ra.questions }));
    // iPhone
    poserBoutique('apple', personne);
    const ri = await acheterMobile('ios', personne, produit);
    const ii = issueMobile('ios', ri, personne, produit);
    ok(ii === aIphone, `${nom} × iPhone : ${aIphone}`, JSON.stringify({ ii, feuilles: ri.feuilles, r: ri.r, q: ri.questions }));
    if (aIphone.startsWith('refus')) ok(typeof ri.r?.message === 'string' && /n'est donc pas disponible sur iPhone/.test(ri.r.message) && /rien n'a été payé/.test(ri.r.message) && ri.conditions === 0,
      `${nom} × iPhone : la phrase du refus, avant toute feuille ET avant la case des conditions`, JSON.stringify({ m: ri.r?.message, conditions: ri.conditions }));
  }
  {
    // cloud_etat_moi illisible : le registre de la PRÉPARATION tranche (après la case), la feuille ne s'ouvre jamais.
    const personne = { ...PERSONNES.web_puis_iphone, etatIllisible: true };
    poserBoutique('apple', personne);
    const res = await acheterMobile('ios', personne, 'pro_cloud');
    ok(res.feuilles.length === 0 && res.r?.raison === 'deuxieme_essai_apple', 'iPhone, état Cloud illisible : la préparation (essai_deja_pris) refuse avant la feuille', JSON.stringify(res));
  }
  console.log('\n   … Android plus ancien que 2.9.205 (il prend la PREMIÈRE offre du forfait)');
  for (const [nom, cle, produit] of [['cas 1, offre d’essai proposée', 'neuf', 'premium_cloud'], ['cas 2, offre d’essai proposée (cloud.sub, jamais eu cet abonnement)', 'eu_pc_google', 'cloud'],
    ['cas 2, Pro + Cloud (Google propose sa semaine)', 'eu_pc_google', 'pro_cloud']]) {
    const personne = PERSONNES[cle];
    poserBoutique('google', personne);
    const res = await acheterMobile('android', personne, produit, { binaire: V38, essaiAffiche: produit === 'cloud' ? null : true });
    ok(res.feuilles.length === 0 && res.r?.etat === 'refuse' && res.r?.raison === 'mettre_a_jour_android' && /Mets à jour FillSell/.test(res.r?.message ?? ''),
      `Android 2.9.176, ${nom} : « Mets à jour FillSell », la feuille ne s’ouvre pas (jamais un 2e essai, jamais « 0 € » puis le plein prix)`, JSON.stringify(res));
  }
  {
    const personne = PERSONNES.eu_pc_stripe;
    poserBoutique('google', personne, { ...CRITERE_GOOGLE, 'app.fillsell.pro.cloud': 'jamais_eu_d_abonnement' });
    PB?.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: Object.fromEntries(Object.entries(prixBase).map(([k, [t, m]]) => [k, { texte: t, montant: m, devise: 'EUR', essai: false }])) });
    const res = await acheterMobile('android', personne, 'pro_cloud', { binaire: V38 });
    ok(res.feuilles.length === 1 && res.r?.etat === 'actif', 'Android 2.9.176, aucune offre d’essai proposée : la feuille s’ouvre (la seule offre est la base, payée)', JSON.stringify(res));
  }
  console.log('\n   … la carte annonçait l’essai mais le serveur dit « déjà eu » (lecture d’avant) : la phrase, puis payé');
  {
    const personne = PERSONNES.eu_pc_google;
    poserBoutique('google', personne);
    const res = await acheterMobile('android', personne, 'pro_cloud', { binaire: V39, essaiAffiche: true });
    ok(res.feuilles[0]?.offre === 'base' && res.questions.some((q) => /déjà eu ton essai gratuit/.test(q) && /payé dès aujourd'hui/.test(q)),
      'Android vc39 : « Tu as déjà eu ton essai gratuit FillSell, donc … payé dès aujourd’hui », puis l’offre « base »', JSON.stringify(res));
  }

  // ── D. Les réglages des boutiques ────────────────────────────────────────────────────────────────────────────────────
  console.log('\nD. Le réglage de chaque offre Google (Android vc39 + vérification FillSell) — seule la bonne case donne EXACTEMENT la règle');
  const SCENARIOS_G = [
    // [personne, produit, essai dû ?]
    ['neuf', 'premium_cloud', true], ['neuf', 'pro_cloud', true], ['neuf', 'cloud', true],
    ['eu_pc_google', 'pro_cloud', false], ['eu_pc_google', 'premium_cloud', false], ['eu_pc_google', 'cloud', false],
    ['eu_pc_stripe', 'pro_cloud', false], ['web_puis_iphone', 'cloud', false],
    ['abonne_premium', 'cloud', true], ['ex_premium_google', 'premium_cloud', true], ['ex_premium_google', 'pro_cloud', true],
  ];
  function resultatsAvec(critere) {
    const ecarts = []; let bloquesVieux = 0;
    for (const [cle, produit, du] of SCENARIOS_G) {
      const p = PERSONNES[cle];
      const visible = googleVoit(critere, p.google, ID_G[produit]);
      const deja = EU.essaiCloudDejaEu({ preparation: p.prep }).deja;
      const d = EU.decisionEssaiCloud({ canal: 'google', produit, deja, boutique: visible ? 'oui' : 'non', binaire: V39 });
      if ((d.offre === 'essai') !== du) ecarts.push(`${cle}/${produit}`);
      if (EU.decisionEssaiCloud({ canal: 'google', produit, deja, boutique: visible ? 'oui' : 'non', binaire: V38 }).issue === 'refus') bloquesVieux++;
    }
    return { ecarts, bloquesVieux };
  }
  if (EU) {
    const avant = resultatsAvec('jamais_eu_d_abonnement');
    ok(avant.ecarts.length > 0, `« N'ont jamais eu d'abonnement » (réglage des formules le 16/11) REFUSE l'essai dû : ${avant.ecarts.join(', ')}`);
    const cet = resultatsAvec('jamais_eu_cet_abonnement');
    ok(cet.ecarts.length === 0, '« N’ont jamais eu cet abonnement » + vérification FillSell : EXACTEMENT la règle (essai dû = essai, jamais un 2e)', cet.ecarts.join(', '));
    const dev = resultatsAvec('developpeur');
    ok(dev.ecarts.length === 0 && dev.bloquesVieux >= cet.bloquesVieux, `« Défini par le développeur » : la règle aussi, mais plus d’achats bloqués sur un vieux binaire (${dev.bloquesVieux} contre ${cet.bloquesVieux})`);
    ok(EU.REGLAGES_STORES.google.filter((r) => r.offre).every((r) => r.apres === 'jamais_eu_cet_abonnement') && EU.REGLAGES_STORES.google.find((r) => r.produit === 'app.fillsell.business.cloud')?.offre === null,
      'réglage écrit : premium-cloud-trial-7d, pro-cloud-trial-7d, cloud-trial-3d → « N’ont jamais eu cet abonnement » ; business.cloud sans offre');
    ok(EU.REGLAGES_STORES.apple.every((r) => r.apres === 'inchange'), 'Apple : rien à changer (offres d’introduction gardées) — le refus avant la feuille fait la règle');
    // La vérification FillSell est OBLIGATOIRE : sans elle (l'ancien chemin, l'offre suit Google), un 2e essai passe.
    const sansFillsell = SCENARIOS_G.filter(([cle, produit, du]) => !du && googleVoit('jamais_eu_cet_abonnement', PERSONNES[cle].google, ID_G[produit]));
    ok(sansFillsell.length > 0, `sans la vérification FillSell, « jamais eu cet abonnement » donnerait un 2e essai (${sansFillsell.map(([c, p]) => `${c}/${p}`).join(', ')})`);
  }

  // ── E. Les cartes ────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nE. Les cartes « Avec Cloud » disent AVANT le clic ce qui arrivera');
  if (FC && TF && PB) {
    const T = TF.textesFormules('fr');
    const carte = (canal, essaiPermis) => FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: canal, essaiPermis, essaiBoutique: (f) => PB.etatEssaiBoutique(f), canalOuvert: () => true }).cartes.find((c) => c.formule === 'pro_cloud');
    poserBoutique('apple', PERSONNES.web_puis_iphone);
    const ci = carte('apple', false);
    const ti = FC.texteLignePrix(ci, { T, nom: 'Pro + Cloud', prix: '49,99 €', canalApp: 'apple' });
    ok(/a déjà servi/.test(ti) && /n'est pas disponible sur iPhone/.test(ti) && !/premier paiement|1 semaine gratuite/.test(ti), 'iPhone, essai déjà eu, Apple offrirait sa semaine : « … n’est pas disponible sur iPhone pour ton compte »', ti);
    PB.poserEligibiliteApple(null);
    const tin = FC.texteLignePrix(carte('apple', false), { T, nom: 'Pro + Cloud', prix: '49,99 €', canalApp: 'apple' });
    ok(/a déjà servi/.test(tin) && /pas disponible sur iPhone pour l'instant/.test(tin) && !/premier paiement/.test(tin), 'iPhone, essai déjà eu, historique Apple illisible : « … pas disponible sur iPhone pour l’instant »', tin);
    poserBoutique('google', PERSONNES.eu_pc_google);
    const tg = FC.texteLignePrix(carte('google', false), { T, nom: 'Pro + Cloud', prix: '49,99 €', canalApp: 'google' });
    ok(/Pas d'essai/.test(tg) && /49,99 € prélevés aujourd'hui/.test(tg) && !/premier paiement|1 semaine gratuite/.test(tg), 'Android, essai déjà eu, Google propose sa semaine : « Pas d’essai : 49,99 € prélevés aujourd’hui »', tg);
    poserBoutique('apple', PERSONNES.neuf);
    const ci1 = carte('apple', true);
    const t1 = FC.texteLignePrix(ci1, { T, nom: 'Pro + Cloud', prix: '49,99 €', canalApp: 'apple', zero: '0 €' });
    ok(ci1?.lignePrix === 'essai' && /0 € aujourd'hui/.test(t1) && !/disponible|déjà servi/.test(t1), 'iPhone, jamais eu : la carte d’essai, inchangée', t1);
    const TE = TF.textesFormules('en');
    poserBoutique('apple', PERSONNES.web_puis_iphone);
    const te = FC.texteLignePrix(carte('apple', false), { T: TE, nom: 'Pro + Cloud', prix: '€49.99', canalApp: 'apple' });
    ok(/already been used/.test(te) && /isn't available on iPhone/.test(te), 'la même carte en anglais', te);
  } else ok(false, 'formulesCloud / textesFormules se chargent');
  PB?.poserPrixBoutique(null);

  // ── F. Les phrases ───────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nF. Les phrases du refus : fr + en, UNE phrase, aucune durée promise, jamais « ordinateur »');
  if (EU) {
    for (const raison of ['deuxieme_essai_apple', 'deuxieme_essai_apple_incertain', 'mettre_a_jour_android']) {
      for (const lang of ['fr', 'en']) {
        const t = EU.texteRefusEssaiCloud(raison, { lang, nom: lang === 'en' ? 'Pro + Cloud' : 'Pro + Cloud' }) ?? '';
        const phrases = t.split(/(?<=[.!?])\s+/).filter(Boolean).length;
        ok(t && phrases === 1 && !/\d|jours|semaine|days?\b|week|ordinateur|computer|Chrome/i.test(t) && (lang === 'fr' ? /rien n'a été payé/ : /nothing was charged/).test(t),
          `${raison} (${lang}) : une phrase vraie, sans durée`, t);
      }
    }
    ok(EU.texteRefusEssaiCloud('essai', {}) === null, 'aucune phrase pour ce qui n’est pas un refus');
  }

  // ── G. Le serveur, et le câblage ─────────────────────────────────────────────────────────────────────────────────────
  console.log('\nG. Le filet du serveur (jamais une semaine sans service) et le câblage');
  if (CO && FS) {
    const v = CO.verdictEssaiStore({ cloud_essai_debut: debut, cloud_canal: 'stripe', cloud_ref: 'sub_pc' }, 'apple', 'A2');
    const plan = FS.planAchatBoutique({ produit: 'app.fillsell.pro.cloud', sens: 'on', essaiBoutique: true, verdictEssai: v, rangAutres: 0 });
    ok(v.ok === true && v.deja === 'essai_deja_pris' && plan?.ouvrir === true && plan?.cloud === 'ecrire',
      'une boutique qui accorde quand même une 2e semaine (binaire ancien, course) : le service tourne, le journal le note (« semaine_boutique_ouverte_essai_deja_pris »)', JSON.stringify({ v, plan }));
  }
  const srcF = lire('src/cloud/achatFormuleCloud.js'), srcC = lire('src/cloud/achatCloud.js');
  ok(/essai-cloud-unique\.js/.test(srcF) && /decisionEssaiCloud\(/.test(srcF) && /essai-cloud-unique\.js/.test(srcC) && /decisionEssaiCloud\(/.test(srcC),
    'achatFormuleCloud et achatCloud décident par la règle unique (decisionEssaiCloud)');
  ok(/binaireCloudNote/.test(lire('src/config/cloudOffer.js')), 'le binaire noté au démarrage (App.jsx → noterBinaireCloud) est lu au moment de l’achat');
  const pkg = JSON.parse(lire('package.json') || '{}');
  ok(pkg.scripts?.['selftest:essai-cloud-unique'] === 'node scripts/essai-cloud-unique-selftest.mjs', 'package.json : selftest:essai-cloud-unique');
} finally {
  await vite.close();
}
console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
