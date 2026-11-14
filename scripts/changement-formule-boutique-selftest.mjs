// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 14/11/2026 (règle de Nico, iPhone et Android) — CHANGER DE FORMULE DANS LA BOUTIQUE : LA FENÊTRE D'ABORD,
// LE MONTANT EXACT, LE CLOUD JAMAIS PERDU EN SILENCE, L'ESSAI JAMAIS GARDÉ
//     npm run selftest:changement-formule-boutique
// ═══════════════════════════════════════════════════════════════════════════
// Constat (cas 13e274de sur le web : un clic « Business » a remplacé Pro + Cloud par Business seul en gardant l'essai).
// Le même trou sur les boutiques, code lu le 14/11 sur 5b395f6 :
//   · iPhone : « Business » (fenêtre de plan, PlanDetailsModal) achète app.fillsell.business.sub (niveau 2) au-dessus de
//     Pro + Cloud (niveau 3) : Apple fait une montée immédiate, arrête l'essai, débite 59,99 € — le Cloud tombe
//     (apple-iap-webhook : produit sans Cloud → « couper ») sans qu'un mot ne l'ait dit ; « Pro » depuis Premium + Cloud
//     est une DESCENTE pour Apple (niveau 5 sous 4) : rien maintenant, le Cloud tombe à la fin de l'essai, en silence.
//   · Android : handleIAPPurchase remplaçait le pack en CHARGE_PRORATED_PRICE (une « somme au prorata » de l'essai que
//     l'app ne connaît pas, puis le prix plein à l'ancienne fin d'essai), et un Pro + Cloud qui prenait Pro ou Premium
//     ouvrait un SECOND abonnement Google (aucun oldPurchaseToken : besoinUpgrade faux) ; les formules avec Cloud
//     remplaçaient en mode 2 / 6 sans fenêtre, pendant l'essai comme après.
// Ce test prouve, sans réseau ni appareil (Vite SSR) :
//   A. la règle pure (lib/changementFormuleBoutique.js) : quand la fenêtre s'ouvre, ses options (+ Cloud d'abord, la
//      formule seule marquée « Sans Cloud »), ce que fait chaque boutique, le mode Google, le montant LU (jamais inventé) ;
//   B. l'orchestration (preparerChangementBoutique) : fenêtre fermée = rien ne part ; Android remplace TOUJOURS l'abonnement
//      Play du groupe (jamais un second), avec le mode qui fait ce que la fenêtre a dit ;
//   C. l'achat d'une formule avec Cloud (achatFormuleCloud.js) passe par la fenêtre AVANT la feuille et les conditions ;
//   D. App.jsx : l'achat d'une formule sans Cloud (handleIAPPurchase) passe par la fenêtre, et la fenêtre est montée ;
//   E. les textes FR + EN existent, la fenêtre se dessine, la note des cartes dit la même chose.
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

globalThis.document ??= { body: {}, addEventListener: () => {}, removeEventListener: () => {} };
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
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} absent : ${String(e?.message ?? e).slice(0, 120)})`); return null; } };

try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const L = await charger('/src/lib/changementFormuleBoutique.js');
  const ACH = await charger('/src/cloud/achatFormuleCloud.js');
  const PB = await charger('/src/lib/prixBoutique.js');
  const TR = await charger('/src/i18n/translations.js');
  const COMP = await charger('/src/components/ChangementFormuleBoutique.jsx');
  ok(L != null, 'la règle existe : src/lib/changementFormuleBoutique.js');

  const PRIX_FR = { premium: '12,99 €', pro: '29,99 €', business: '59,99 €', premium_cloud: '34,99 €', pro_cloud: '49,99 €', business_cloud: '79,99 €' };
  const prixFr = (cle) => PRIX_FR[cle] ?? null;
  const FIN = '2026-11-19T17:18:00Z';
  const compte = (idActuel, { essai = false, cloud = false } = {}) => ({ idActuel, essaiEnCours: essai, essaiFin: essai ? FIN : null, cloudDansFormule: cloud });
  const plan = (canal, c, cible, prix = prixFr) => (L ? L.planChangementBoutique({ canal, compte: c, cible, prix }) : null);
  const textes = (p, lang = 'fr') => (L && p?.fenetre ? L.textesFenetre(p, lang) : null);
  const tout = (t) => (t ? [t.titre, t.intro, t.pied, t.annuler, ...t.options.flatMap((o) => [o.titre, ...o.lignes, o.bouton, o.avertissement ?? ''])].join(' | ') : '');
  const opt = (t, cle) => t?.options?.find((o) => o.cle === cle);

  // ── A. La règle ─────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nA. La règle (pure) — le cas 13e274de rejoué sur les boutiques : Pro + Cloud EN ESSAI choisit « Business »');
  for (const canal of ['apple', 'google']) {
    const idPack = canal === 'apple' ? 'app.fillsell.pro.cloud' : 'app.fillsell.pro.cloud';
    const p = plan(canal, compte(idPack, { essai: true, cloud: true }), 'business');
    const t = textes(p);
    ok(p?.fenetre === true, `${canal} : la fenêtre s'ouvre AVANT la feuille de la boutique`, JSON.stringify(p));
    ok(p?.options?.[0]?.cle === 'business_cloud' && p?.options?.[0]?.principal === true, `${canal} : la version « + Cloud » de la formule choisie est proposée d'abord (Business + Cloud)`, JSON.stringify(p?.options?.map((o) => o.cle)));
    ok(p?.options?.[1]?.cle === 'business' && p?.options?.[1]?.sansCloud === true, `${canal} : la formule seule reste proposée, marquée « Sans Cloud »`);
    const bc = opt(t, 'business_cloud'), b = opt(t, 'business');
    ok(/Ton essai gratuit s'arrête : tu seras débité maintenant de 79,99 €\./.test(bc?.lignes?.join(' ') ?? ''), `${canal} : « Ton essai gratuit s'arrête : tu seras débité maintenant de 79,99 € » (le prix lu chez la boutique)`, bc?.lignes?.join(' '));
    ok(/tu seras débité maintenant de 59,99 €/.test(b?.lignes?.join(' ') ?? '') && /Sans Cloud : tu ne pourras plus publier sans ordinateur\./.test(b?.lignes?.join(' ') ?? ''), `${canal} : Business seul — 59,99 € maintenant ET « Sans Cloud : tu ne pourras plus publier sans ordinateur. »`, b?.lignes?.join(' '));
    ok(p?.options?.every((o) => o.effet?.essaiArrete === true && o.effet?.debit === 'prix_plein'), `${canal} : l'essai s'arrête, le prix entier est débité maintenant (jamais l'essai gardé)`);
    if (canal === 'google') ok(p?.options?.every((o) => o.effet?.modeGoogle === 5), 'google : CHARGE_FULL_PRICE (5) pendant l’essai — jamais WITHOUT_PRORATION (3, garde l’essai) ni CHARGE_PRORATED_PRICE (2, montant inconnu)', JSON.stringify(p?.options?.map((o) => o.effet)));
    if (canal === 'apple') ok(p?.options?.every((o) => o.effet?.modeGoogle == null), 'apple : aucun mode (Apple décide par les niveaux du groupe)');
  }

  console.log('\nA bis. Les autres changements');
  {
    // Premium + Cloud en essai → Pro + Cloud (une montée de pack à pack) : une option, le montant.
    const g = plan('google', compte('app.fillsell.premium.cloud', { essai: true, cloud: true }), 'pro_cloud');
    ok(g?.fenetre && g.options.length === 1 && g.options[0].effet?.modeGoogle === 5 && /maintenant de 49,99 €/.test(opt(textes(g), 'pro_cloud')?.lignes?.join(' ') ?? ''), 'google, Premium + Cloud en essai → Pro + Cloud : une option, CHARGE_FULL_PRICE, « débité maintenant de 49,99 € »');
    const a = plan('apple', compte('app.fillsell.premium.cloud', { essai: true, cloud: true }), 'pro_cloud');
    ok(a?.fenetre && a.options[0].sens === 'montee' && /maintenant de 49,99 €/.test(opt(textes(a), 'pro_cloud')?.lignes?.join(' ') ?? ''), 'apple, Premium + Cloud en essai → Pro + Cloud : montée (niveau 3 au-dessus de 4), « débité maintenant de 49,99 € »');
    // Premium + Cloud en essai → « Pro » : Apple le traite en DESCENTE (Pro niveau 5, sous Premium + Cloud niveau 4).
    const ap = plan('apple', compte('app.fillsell.premium.cloud', { essai: true, cloud: true }), 'pro');
    const tap = textes(ap);
    ok(ap?.options?.map((o) => o.cle).join(',') === 'pro_cloud,pro', 'apple, Premium + Cloud en essai → « Pro » : Pro + Cloud proposé d’abord, puis Pro seul');
    ok(ap?.options?.[1]?.sens === 'descente' && ap.options[1].effet?.quand === 'renouvellement' && ap.options[1].effet?.essaiArrete === false, 'apple : Pro seul est une DESCENTE (niveau 5 sous 4) — au renouvellement, Apple ne l’avance pas');
    ok(/continue jusqu'au 19 novembre/.test(opt(tap, 'pro')?.lignes?.join(' ') ?? '') && /Rien n'est prélevé aujourd'hui/.test(opt(tap, 'pro')?.lignes?.join(' ') ?? '') && /Sans Cloud/.test(opt(tap, 'pro')?.lignes?.join(' ') ?? ''), 'apple : la fenêtre dit ce qu’Apple fera (l’essai continue jusqu’au 19 novembre, rien aujourd’hui) ET « Sans Cloud »', opt(tap, 'pro')?.lignes?.join(' '));
    const gp = plan('google', compte('app.fillsell.premium.cloud', { essai: true, cloud: true }), 'pro');
    ok(gp?.options?.every((o) => o.effet?.modeGoogle === 5 && o.effet?.essaiArrete), 'google, même choix : l’app impose CHARGE_FULL_PRICE (essai arrêté, prix entier maintenant) — la règle de Nico');
    // Pro + Cloud en essai → « Pro » : la version + Cloud est la formule actuelle → « Garder Pro + Cloud ».
    const garde = plan('apple', compte('app.fillsell.pro.cloud', { essai: true, cloud: true }), 'pro');
    ok(garde?.options?.[0]?.garder === true && garde.options[0].choisissable === true && /Garder Pro \+ Cloud/.test(opt(textes(garde), 'pro_cloud')?.bouton ?? ''), 'Pro + Cloud → « Pro » : la 1re option est « Garder Pro + Cloud » (rien ne change)');
    // Pack PAYÉ (hors essai) → Business : la fenêtre (le Cloud). (14/11/2026 13:00, décision 5 de Nico) Android hors essai :
    // le prix entier (CHARGE_FULL_PRICE), pour que le montant affiché soit toujours exact — avant : CHARGE_PRORATED_PRICE.
    const paye = plan('google', compte('app.fillsell.pro.cloud', { cloud: true }), 'business');
    ok(paye?.fenetre && paye.options.every((o) => o.effet?.modeGoogle === 5 && o.effet?.essaiArrete === false), 'google, Pro + Cloud PAYÉ → Business : la fenêtre (le Cloud), montée CHARGE_FULL_PRICE (prix entier, décision du 14/11)');
    ok(/Tu seras débité maintenant de/.test(opt(textes(paye), 'business')?.lignes?.join(' ') ?? '') && !/prorata|essai/.test(opt(textes(paye), 'business')?.lignes?.join(' ') ?? ''), 'google payé : « Tu seras débité maintenant de … » (le prix entier), jamais « prorata » ni un mot d’essai');
    const payeA = plan('apple', compte('app.fillsell.pro.cloud', { cloud: true }), 'business');
    ok(/débité maintenant de 79,99 € sur ton compte Apple ; l'App Store te rembourse au prorata/.test(opt(textes(payeA), 'business_cloud')?.lignes?.join(' ') ?? ''), 'apple payé : le prix entier maintenant et le remboursement au prorata d’Apple');
    // Rien à dire : abonné payé SANS Cloud, ou pas abonné ici → l'achat d'avant, sans fenêtre.
    ok(plan('apple', compte('app.fillsell.premium.standard'), 'pro')?.fenetre === false, 'Premium payé sans Cloud → Pro : pas de fenêtre (l’achat d’avant)');
    ok(plan('google', compte(null), 'pro_cloud')?.fenetre === false, 'aucun abonnement de cette boutique : pas de fenêtre (souscription neuve, ses propres textes)');
    // Le montant n'est JAMAIS inventé : prix pas lu → l'option ne se choisit pas ; monnaie de la boutique gardée.
    const sansPrix = plan('google', compte('app.fillsell.pro.cloud', { essai: true, cloud: true }), 'business', (c) => (c === 'business' ? '59,99 €' : null));
    ok(sansPrix?.options?.find((o) => o.cle === 'business_cloud')?.choisissable === false, 'prix de Business + Cloud pas lu : l’option ne se choisit pas (jamais un montant deviné)');
    const dollars = plan('apple', compte('app.fillsell.pro.cloud', { essai: true, cloud: true }), 'business', (c) => ({ business: '$59.99', business_cloud: '$79.99' })[c] ?? null);
    const td = tout(textes(dollars, 'en'));
    ok(/\$79\.99/.test(td) && !/€/.test(td), 'la monnaie est celle de la boutique ($), aucun euro écrit en dur', td.slice(0, 300));
    // Cloud pas vendable ici (vieux binaire Android) : la formule seule, toujours marquée.
    const sansFormules = L?.planChangementBoutique({ canal: 'google', compte: compte('app.fillsell.pro.cloud', { essai: true, cloud: true }), cible: 'business', prix: prixFr, cloudPossible: false });
    ok(sansFormules?.options?.length === 1 && sansFormules.options[0].sansCloud === true, 'formules avec Cloud pas vendues ici : la formule seule, marquée « Sans Cloud » (jamais en silence)');
    // Les identifiants et les niveaux : ceux de lib/iap.js et d'App Store Connect.
    const iap = lire('src/lib/iap.js');
    ok(L && /pro: Capacitor\.getPlatform\(\) === 'ios' \? 'app\.fillsell\.pro2\.sub' : 'app\.fillsell\.pro\.sub'/.test(iap) && L.PRODUITS_PALIERS.apple.pro === 'app.fillsell.pro2.sub' && L.PRODUITS_PALIERS.google.pro === 'app.fillsell.pro.sub'
      && /standard: 'app\.fillsell\.premium\.standard'/.test(iap) && /business: 'app\.fillsell\.business\.sub'/.test(iap), 'les produits sans Cloud = ceux de lib/iap.js (pro2 sur iPhone, pro sur Android)');
    const ordre = L ? Object.entries(L.NIVEAUX_APPLE).sort((x, y) => x[1] - y[1]).map(([id]) => id) : [];
    ok(ordre.slice(0, 4).join(',') === 'app.fillsell.business.cloud,app.fillsell.business.sub,app.fillsell.pro.cloud,app.fillsell.premium.cloud' && L?.NIVEAUX_APPLE['app.fillsell.premium.standard'] === 6, 'niveaux Apple du 11/11 : Business + Cloud > Business > Pro + Cloud > Premium + Cloud > Pro / Founder > Premium Standard');
    ok(L?.MODES_GOOGLE?.CHARGE_FULL_PRICE === 5 && L?.MODES_GOOGLE?.DEFERRED === 6 && L?.MODES_GOOGLE?.CHARGE_PRORATED_PRICE === 2 && /setSubscriptionReplacementMode\(replacementMode\)/.test(lire('patches/@capgo+native-purchases+8.3.3.patch')), 'modes Google = SubscriptionUpdateParams.ReplacementMode de Billing 8.3.0 (le patch du module les transmet tels quels)');
  }

  // ── B. L'orchestration ───────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nB. Avant la feuille : fenêtre, jeton, mode (preparerChangementBoutique)');
  const profilPack = (formule, canal, { essai = true } = {}) => ({
    is_premium: true, is_pro: formule !== 'premium_cloud', is_business: formule === 'business_cloud', is_founder: false,
    apple_original_transaction_id: canal === 'apple' ? '2000' : null, google_purchase_token: canal === 'google' ? 'JETON-PROFIL' : null,
    google_product_id: canal === 'google' ? `app.fillsell.${formule.replace('_cloud', '')}.cloud` : null,
    cloud_formule: formule, cloud_canal: canal, cloud_ref: 'x', is_cloud: !essai,
    cloud_essai_debut: essai ? '2026-11-12T17:18:00Z' : '2026-10-01T10:00:00Z', cloud_essai_fin: essai ? FIN : '2026-10-08T10:00:00Z',
    cloud_essai_arrete: false, cloud_periode_fin: essai ? null : '2026-12-01T10:00:00Z', cloud_arret_fin_periode: false,
  });
  const MAINTENANT = Date.parse('2026-11-14T12:00:00Z');
  const prep = async (o) => (L ? L.preparerChangementBoutique({ maintenant: MAINTENANT, prix: prixFr, ...o }) : null);
  {
    let fenetres = 0;
    const r1 = await prep({ canal: 'google', cible: 'pro_cloud', lireProfil: async () => profilPack('premium_cloud', 'google'),
      trouverAbonnementPlay: async (ids) => (ids.includes('app.fillsell.premium.cloud') ? { purchaseToken: 'JETON-TEL', productIdentifier: 'app.fillsell.premium.cloud' } : null),
      demander: async () => { fenetres++; return 'pro_cloud'; } });
    ok(fenetres === 1 && r1?.etat === 'continuer' && r1.oldPurchaseToken === 'JETON-TEL' && r1.replacementMode === 5, 'google, Premium + Cloud en essai → Pro + Cloud confirmé : le pack est REMPLACÉ (jeton du téléphone) en CHARGE_FULL_PRICE', JSON.stringify({ fenetres, r1: { ...r1, plan: undefined } }));
    const r2 = await prep({ canal: 'google', cible: 'pro_cloud', lireProfil: async () => profilPack('premium_cloud', 'google'), trouverAbonnementPlay: async () => null, demander: async () => null });
    ok(r2?.etat === 'annule', 'fenêtre fermée sans choix : « annulé », rien ne part');
    const r3 = await prep({ canal: 'google', cible: 'pro', lireProfil: async () => profilPack('pro_cloud', 'google'), trouverAbonnementPlay: async () => null, demander: async () => 'pro' });
    ok(r3?.etat === 'continuer' && r3.id === 'app.fillsell.pro.sub' && r3.oldPurchaseToken === 'JETON-PROFIL' && r3.replacementMode === 5, 'google, Pro + Cloud en essai → Pro seul : le pack est REMPLACÉ (jeton du profil en repli), jamais un second abonnement', JSON.stringify({ ...r3, plan: undefined }));
    const r3b = await prep({ canal: 'google', cible: 'business', lireProfil: async () => profilPack('pro_cloud', 'google'), trouverAbonnementPlay: async () => null, demander: async () => 'business_cloud' });
    ok(r3b?.etat === 'continuer' && r3b.cle === 'business_cloud' && r3b.id === 'app.fillsell.business.cloud' && r3b.replacementMode === 5, '« Business » cliqué, « Business + Cloud » choisi dans la fenêtre : c’est Business + Cloud qui part (le Cloud gardé)');
    let demande = 0;
    const premiumPaye = { is_premium: true, is_pro: false, is_business: false, google_purchase_token: 'JP', google_product_id: 'app.fillsell.premium.standard', cloud_formule: null };
    const r4 = await prep({ canal: 'google', cible: 'pro', lireProfil: async () => premiumPaye, trouverAbonnementPlay: async () => ({ purchaseToken: 'JT', productIdentifier: 'app.fillsell.premium.standard' }), demander: async () => { demande++; return null; } });
    ok(demande === 0 && r4?.etat === 'continuer' && r4.oldPurchaseToken === 'JT' && r4.replacementMode === 5, 'google, Premium payé sans Cloud → Pro : pas de fenêtre, montée en place CHARGE_FULL_PRICE (prix entier, décision du 14/11)');
    const proPaye = { is_premium: true, is_pro: true, is_business: false, google_purchase_token: 'JPro', google_product_id: 'app.fillsell.pro.sub', cloud_formule: null };
    const r5 = await prep({ canal: 'google', cible: 'premium', lireProfil: async () => proPaye, trouverAbonnementPlay: async () => null, demander: async () => null });
    ok(r5?.etat === 'continuer' && r5.oldPurchaseToken === 'JPro' && r5.replacementMode === 6, 'google, Pro payé → Premium : remplacement DEFERRED (6), jamais un second abonnement');
    let vu = 0;
    const r6 = await prep({ canal: 'apple', cible: 'business', lireProfil: async () => { throw new Error('réseau'); }, demander: async () => { vu++; return 'business'; } });
    ok(r6?.etat === 'erreur' && vu === 0, 'profil illisible : « erreur », aucune fenêtre sautée sur un état deviné, rien ne part');
    let charge = 0; const lu = { ...PRIX_FR }; delete lu.business_cloud;
    const r7 = await prep({ canal: 'apple', cible: 'business', lireProfil: async () => profilPack('pro_cloud', 'apple'), prix: (c) => lu[c] ?? null,
      chargerPrix: async () => { charge++; lu.business_cloud = '79,99 €'; }, demander: async (p) => (p.options[0].choisissable ? 'business_cloud' : null) });
    ok(charge === 1 && r7?.etat === 'continuer' && r7.cle === 'business_cloud' && r7.oldPurchaseToken == null, 'un prix pas encore lu : la boutique est relue UNE fois, puis l’option se choisit ; iPhone : aucun jeton (Apple remplace dans le groupe)');
    const r8 = await prep({ canal: 'apple', cible: 'business', lireProfil: async () => profilPack('pro_cloud', 'apple'), demander: async () => 'business' });
    ok(r8?.plan?.essaiEnCours === true && r8?.plan?.options?.[1]?.effet?.essaiArrete === true, 'apple : l’essai en cours est lu sur le profil (pack de CETTE boutique, semaine pas finie)');
    const rp = await prep({ canal: 'apple', cible: 'pro', lireProfil: async () => profilPack('premium_cloud', 'apple'), demander: async () => 'pro' });
    ok(rp?.etat === 'continuer' && rp.programme === true && Date.parse(rp.date) === Date.parse(FIN) && L.texteChangementProgramme('fr', rp.cle, rp.date) === "C'est noté : Pro commence le 19 novembre. Rien n'a été prélevé aujourd'hui.", 'apple, Premium + Cloud en essai → Pro seul (descente) : PROGRAMMÉ à la fin de l’essai, « C’est noté : Pro commence le 19 novembre »', JSON.stringify({ ...rp, plan: undefined }));
    ok(r5?.programme === true && r1?.programme === false && r3?.programme === false, 'google : DEFERRED (hors essai) est programmé ; CHARGE_FULL_PRICE (pendant l’essai) est immédiat');
    const r9 = await prep({ canal: 'apple', cible: 'business', lireProfil: async () => profilPack('pro_cloud', 'google'), demander: async () => 'business' });
    ok(r9?.plan?.fenetre === false, 'un pack facturé par l’AUTRE boutique ne se change pas ici (la garde « une formule » le refuse avant)');
  }

  // ── C. L'achat d'une formule avec Cloud ───────────────────────────────────────────────────────────────────────────
  console.log('\nC. achatFormuleCloud : la fenêtre AVANT la feuille de la boutique et avant les conditions');
  if (PB) PB.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: { pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: false }, premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR', essai: false } } });
  const supabaseFactice = {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => ({ data: { session: null } }) },
    rpc: async (n) => ({ data: n === 'cloud_etat_moi' ? { actif: true } : { ok: true, continuer: true }, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: true, is_pro: true, is_business: false }, error: null }) }) }) }),
    functions: { invoke: async (nom) => (nom === 'garde-abonnement' ? { data: { permis: true }, error: null } : { data: { is_premium: true }, error: null }) },
  };
  const creer = (platform, preparerChangement, journal, achats) => ACH?.creerAchatFormuleCloud({
    supabase: supabaseFactice, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: 'u', email: 'u@exemple.fr' }, lang: 'fr', platform,
    confirmer: async () => true, notifier: () => {}, demanderConditions: async () => { journal.push('conditions'); return true; },
    purchasePremium: async (id, _u, opts) => { journal.push('feuille'); achats.push({ id, opts }); return { cancelled: false, purchaseToken: 'NOUVEAU' }; },
    trouverAbonnementPlay: async () => ({ purchaseToken: 'ANCIEN', productIdentifier: 'app.fillsell.premium.cloud' }),
    idsAbonnementsPlay: ['app.fillsell.premium.cloud', 'app.fillsell.pro.cloud'],
    preparerChangement,
  });
  {
    const j1 = [], a1 = [];
    const ach1 = creer('android', async (f) => { j1.push(`fenetre:${f}`); return { etat: 'annule' }; }, j1, a1);
    const r1 = ach1 ? await ach1.acheter('pro_cloud', { dejaCloud: true, abonneBoutique: true }) : null;
    ok(r1?.etat === 'annule' && a1.length === 0 && j1[0] === 'fenetre:pro_cloud', 'Android : fenêtre fermée → aucune feuille Google, rien ne part', JSON.stringify({ r1, j1 }));
    const j2 = [], a2 = [];
    const ach2 = creer('android', async () => { j2.push('fenetre'); return { etat: 'continuer', cle: 'pro_cloud', id: 'app.fillsell.pro.cloud', oldPurchaseToken: 'ANCIEN', replacementMode: 5 }; }, j2, a2);
    if (ach2) await ach2.acheter('pro_cloud', { dejaCloud: true, abonneBoutique: true });
    ok(a2[0]?.opts?.oldPurchaseToken === 'ANCIEN' && a2[0]?.opts?.replacementMode === 5, 'Android : la feuille part avec le jeton ET le mode de la fenêtre (CHARGE_FULL_PRICE pendant l’essai), plus le mode 2 « au prorata »', JSON.stringify(a2));
    ok(j2.indexOf('fenetre') === 0 && j2.indexOf('fenetre') < j2.indexOf('conditions') && j2.indexOf('conditions') < j2.indexOf('feuille'), 'la fenêtre vient D’ABORD (avant les conditions et la feuille)', JSON.stringify(j2));
    if (PB) PB.poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: { business_cloud: { texte: '79,99 €', montant: 79.99, devise: 'EUR', essai: false } } });
    const j3 = [], a3 = [];
    const ach3 = creer('ios', async () => { j3.push('fenetre'); return { etat: 'garder' }; }, j3, a3);
    const r3 = ach3 ? await ach3.acheter('business_cloud', { dejaCloud: true, abonneBoutique: true }) : null;
    ok(r3?.etat === 'annule' && a3.length === 0 && j3.includes('fenetre'), 'iPhone : « Garder ma formule » → rien ne part chez Apple', JSON.stringify({ r3, j3 }));
    if (PB) PB.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: { pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: false }, premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR', essai: false } } });
    const j4 = [], a4 = [];
    const ach4 = creer('android', async () => { j4.push('fenetre'); return { etat: 'annule' }; }, j4, a4);
    if (ach4) await ach4.acheter('premium_cloud', { descente: true });
    ok(!j4.includes('fenetre') && a4.length === 1 && a4[0]?.opts?.replacementMode === 6, 'la fin d’essai (« Passer à … » de la feuille de la veille, descente programmée) garde son parcours : DEFERRED, sans la fenêtre', JSON.stringify({ j4, a4 }));
    if (PB) PB.poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: { pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: false } } });
    const j7 = [], a7 = [];
    const ach7 = creer('ios', async () => ({ etat: 'continuer', cle: 'pro_cloud', id: 'app.fillsell.pro.cloud', programme: true, date: FIN }), j7, a7);
    const r7c = ach7 ? await ach7.acheter('pro_cloud', { dejaCloud: true, abonneBoutique: true }) : null;
    ok(r7c?.etat === 'programme' && /C'est noté : Pro \+ Cloud commence le 19 novembre/.test(r7c?.message ?? ''), 'iPhone, changement programmé par Apple : « C’est noté : … commence le 19 novembre », jamais « Paiement reçu »', JSON.stringify(r7c));
    if (PB) PB.poserPrixBoutique({ canal: 'google', statut: 'pret', prix: { pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: false }, premium_cloud: { texte: '34,99 €', montant: 34.99, devise: 'EUR', essai: false } } });
    const j5 = [], a5 = [];
    const ach5 = creer('android', async () => ({ etat: 'erreur', raison: 'profil_illisible' }), j5, a5);
    const r5 = ach5 ? await ach5.acheter('pro_cloud', { dejaCloud: true, abonneBoutique: true }) : null;
    ok(r5?.etat === 'erreur' && a5.length === 0 && /Rien n'a été prélevé/.test(r5?.message ?? ''), 'profil illisible : aucune feuille, « Rien n’a été prélevé » (jamais la fenêtre sautée)', JSON.stringify(r5));
    const j6 = [], a6 = [];
    const ach6 = creer('android', async () => ({ etat: 'annule' }), j6, a6);
    const r6 = ach6 ? await ach6.acheter('pro_cloud', { dejaCloud: true, abonneBoutique: true }) : null;
    ok(/Rien n'a changé/.test(r6?.message ?? ''), 'fenêtre fermée : le client LIT que rien n’a changé', JSON.stringify(r6));
  }
  if (PB) PB.poserPrixBoutique(null);

  // ── D. App.jsx ──────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nD. App.jsx : la formule SANS Cloud (fenêtre de plan, fenêtre d’offres) passe aussi par la fenêtre');
  {
    const app = lire('src/App.jsx');
    const corps = app.slice(app.indexOf('async function handleIAPPurchase('), app.indexOf('async function handleIAPRestore('));
    const iFen = corps.indexOf('changementBoutique(tierLog)'), iAchat = corps.indexOf('await purchasePremium(');
    ok(iFen > 0 && iAchat > iFen, 'handleIAPPurchase demande la fenêtre AVANT la feuille de la boutique', `fenetre@${iFen} achat@${iAchat}`);
    ok(/ch\.etat==='annule'\|\|ch\.etat==='garder'/.test(corps) && /texteRienNeChange\(lang\)/.test(corps), 'fermée ou « Garder » : rien ne part, et l’app le dit (« Rien n’a changé »)');
    ok(/lancerAchatFormule\(ch\.cle,\{dejaCloud:true,abonneBoutique:true,changement:ch\},origine\)/.test(corps), '« + Cloud » choisi : l’achat de la formule avec Cloud, changement déjà confirmé (jamais deux fois la fenêtre)');
    ok(/purchasePremium\(productId,user\.id,\{oldPurchaseToken:upgradeOldToken,replacementMode:modeRemplacementGoogle\}\)/.test(corps), 'Android : la feuille part avec le mode de la fenêtre');
    const iProg = corps.indexOf('if(changementProgramme){'), iAttente = corps.indexOf('await attendreConfirmationServeur(');
    ok(iProg > 0 && iProg < iAttente && /texteChangementProgramme\(lang,changementProgramme\.cle,changementProgramme\.date\)/.test(corps), 'changement programmé par la boutique : « C’est noté … » AVANT toute attente d’un palier (plus « non confirmé »)');
    ok(/preparerChangement:isNative\?changementBoutique:null/.test(app), 'creerAchatFormuleCloud reçoit la fenêtre (iPhone / Android)');
    ok(/<ChangementFormuleBoutique plan=\{changementFormule\.plan\}[^>]*onChoix=\{\(cle\)=>\{const r=changementFormule\.resolve;setChangementFormule\(null\);r\?\.\(cle\?\?null\);\}\}/.test(app), 'la fenêtre est montée ; fermée sans choix = null (rien ne part)');
    ok(/prix:\(cle\)=>prixAffiche\(cle,lang\)/.test(app), 'le montant = le prix affiché par la boutique (prixAffiche), jamais écrit en dur');
    ok(/select\(COLONNES_CHANGEMENT\)/.test(app) && /select\(COLONNES_CLOUD\)/.test(app) && /if\(b\.error\)throw/.test(app), 'le profil relu À L’INSTANT : deux lectures (l’état du Cloud par COLONNES_CLOUD), l’une illisible = rien ne part');
    ok(L && !/is_cloud|cloud_essai_debut|cloud_essai_fin|cloud_essai_arrete|cloud_periode_fin|cloud_arret_fin_periode/.test(L.COLONNES_CHANGEMENT), 'la règle ne nomme aucune colonne d’état du Cloud (règle de selftest:cloud-ecrans)');
  }

  // ── E. Textes et dessin ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nE. Textes FR + EN, dessin de la fenêtre, note des cartes');
  {
    const cles = Object.keys(TR?.translations?.fr ?? {}).filter((k) => k.startsWith('chgFormule'));
    ok(cles.length >= 20 && cles.every((k) => typeof TR.translations.en[k] === 'string' && TR.translations.en[k].length > 0), `les ${cles.length} textes « chgFormule* » existent en FR ET en EN (src/i18n/translations.js)`);
    ok(TR?.translations?.fr?.chgFormuleEssaiArrete === "Ton essai gratuit s'arrête : tu seras débité maintenant de {prix}." && TR?.translations?.fr?.chgFormuleSansCloud === 'Sans Cloud : tu ne pourras plus publier sans ordinateur.', 'les deux phrases de Nico, mot pour mot');
    const p = plan('google', compte('app.fillsell.pro.cloud', { essai: true, cloud: true }), 'business');
    const html = COMP && p ? renderToStaticMarkup(h(COMP.default, { plan: p, lang: 'fr', onChoix: () => {} })) : '';
    ok(/data-changement-formule-boutique/.test(html) && /Changer de formule/.test(html) && /Business \+ Cloud · 79,99 €\/mois/.test(html) && /Annuler : rien ne change/.test(html) && /Confirmer et payer 79,99 €/.test(html), 'la fenêtre se dessine : titre, options avec prix, « Confirmer et payer 79,99 € », « Annuler : rien ne change »', html.slice(0, 400));
    const htmlEn = COMP && p ? renderToStaticMarkup(h(COMP.default, { plan: p, lang: 'en', onChoix: () => {} })) : '';
    ok(/Change plan/.test(htmlEn) && /Your free trial ends: you(&#x27;|')ll be charged 79,99 € now\./.test(htmlEn), 'en anglais aussi', htmlEn.slice(0, 300));
    const TF = await charger('/src/cloud/textesFormules.js');
    const n = TF?.textesFormules('fr').essaiBoutique('Google Play', '49,99 €', 'google') ?? '';
    ok(/Ton essai s'arrête/.test(n) && /49,99 € sont prélevés aujourd'hui/.test(n) && !/prorata/.test(n), 'la note des cartes (Android, pendant l’essai) dit la même chose que la fenêtre : le prix entier aujourd’hui', n);
  }
} finally {
  await vite.close();
}
console.log(`\n${rouges === 0 ? '✓' : '✗'} changement-formule-boutique : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
