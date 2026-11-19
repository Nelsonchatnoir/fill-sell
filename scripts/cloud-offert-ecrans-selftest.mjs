// VERROU « UN CLOUD OFFERT NE VOIT PLUS JAMAIS L'ÉCRAN DE PAIEMENT DU CLOUD » (19/11/2026, décision de Nico, point 5)
// `npm run selftest:cloud-offert-ecrans` — sans base, sans réseau (Vite SSR pour les modules de src/ et les écrans).
// Décision : « un compte dont le Cloud est offert ne doit plus jamais voir l'écran de paiement du Cloud (liste d'attente,
// carte Cloud, offres). La place s'ouvre directement. » Cas : faf5021a (Business, Cloud offert lié au Business depuis le
// 19/11) voyait encore, sur le web, « Passer à Business + Cloud » achetable dans la fenêtre d'offres (vue « Avec Cloud »
// ouverte d'office), « Arrêter le Cloud » dans les Réglages, et, Business arrêté, « Reprendre FillSell Cloud · 24,99 €/mois ».
// La règle (une seule) : supabase/functions/_shared/cloud-option.js cloudOffertDuProfil / achatCloudFermeParOffert /
// CLOUD_OFFERT_SOMMEIL_SANS_ACHAT ; l'app : src/cloud/cloudOffert.js.
//   1. la règle pure (cadeau = canal 'offert' ET cloud_ref hors 'offert:' — les « 7 jours offerts » restent un essai) ;
//   2. les offres (cartesFormulesCloud : voie 'cloud_offert', aucune carte) ; 3. l'offre du Cloud seul (regles.js) ;
//   4. les gestes sans argent ; 5. « Reprendre ton essai » ; 6. le parcours d'entrée (offert actif → connexion) ;
//   7. la GARDE FINALE des achats (achatFormuleCloud, achatCloud : « deja », rien n'est préparé, ni Stripe, ni feuille) ;
//   8. les branchements (sources) ; 9. les écrans rendus (Réglages, résiliation, « Cloud arrêté »).
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ✓ ${m}`); }
  else { rouges++; console.log(`  ✗ ${m}${d !== '' ? `\n      ← ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 500)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };

const MAINTENANT = Date.now();
const iso = (ms) => new Date(MAINTENANT + ms).toISOString();
const JOUR = 86_400_000;
// Les profils (aucun vrai compte : la forme seule de faf5021a, telle que la base la porte le 19/11).
const BASE = { is_comped: false, cloud_essai_debut: null, cloud_essai_fin: null, cloud_essai_arrete: false, cloud_periode_fin: null,
  cloud_arret_fin_periode: false, cloud_essai_refus: null, cloud_formule: null };
const OFFERT_LIE = { ...BASE, is_premium: true, is_pro: true, is_business: true, is_cloud: true, cloud_canal: 'offert', cloud_ref: null, cloud_offert: 'business' };
const OFFERT_LIE_SERVEUR = { ...BASE, is_premium: true, is_pro: true, is_business: true, is_cloud: true, cloud_canal: 'offert', cloud_ref: null, beta_flags: { cloud_offert: 'business' } };
const OFFERT_SANS_LIEN = { ...BASE, is_premium: true, is_pro: true, is_business: false, is_comped: true, is_cloud: true, cloud_canal: 'offert', cloud_ref: null };
const SOMMEIL = { ...OFFERT_LIE, is_premium: false, is_pro: false, is_business: false, is_cloud: false };
const SEPT_JOURS = { ...BASE, is_premium: true, is_pro: true, is_business: false, is_cloud: false, cloud_canal: 'offert', cloud_ref: 'offert:apple:pro_cloud',
  cloud_essai_debut: iso(-JOUR), cloud_essai_fin: iso(6 * JOUR), cloud_periode_fin: iso(6 * JOUR) };
const STRIPE = { ...BASE, is_premium: true, is_pro: true, is_business: true, is_cloud: true, cloud_canal: 'stripe', cloud_ref: 'sub_banc' };
const FREE = { ...BASE, is_premium: false, is_pro: false, is_business: false, is_cloud: false, cloud_canal: null, cloud_ref: null };

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
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { console.log(`  (module ${p} illisible : ${String(e?.message ?? e).slice(0, 160)})`); return {}; } };
const fonction = (m, nom) => typeof m?.[nom] === 'function';

try {
  const CO = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/cloud-option.js')).href);
  const PAL = await charger('/src/utils/palier.js');
  const lectureDe = (p) => ({ etat: 'ok', cloud: PAL.cloudDuProfil(p, MAINTENANT), profil: p, luLe: MAINTENANT, relire() {} });

  console.log('1. La règle pure (cloud-option.js)');
  ok(fonction(CO, 'cloudOffertDuProfil') && fonction(CO, 'achatCloudFermeParOffert'), 'cloudOffertDuProfil et achatCloudFermeParOffert existent');
  ok(CO.CLOUD_OFFERT_SOMMEIL_SANS_ACHAT === true, 'CLOUD_OFFERT_SOMMEIL_SANS_ACHAT = true (en attendant la réponse de Nico : aucun achat Cloud en sommeil)');
  if (fonction(CO, 'cloudOffertDuProfil')) {
    const o = CO.cloudOffertDuProfil;
    ok(JSON.stringify(o(OFFERT_LIE)) === JSON.stringify({ lie: 'business', actif: true, sommeil: false }), 'faf5021a (lecture de l\'app, alias cloud_offert) : lié au Business, actif', o(OFFERT_LIE));
    ok(o(OFFERT_LIE_SERVEUR)?.lie === 'business' && o(OFFERT_LIE_SERVEUR)?.actif === true, 'le même profil lu par le serveur (beta_flags.cloud_offert)', o(OFFERT_LIE_SERVEUR));
    ok(o(OFFERT_SANS_LIEN)?.lie === null && o(OFFERT_SANS_LIEN)?.actif === true, 'Cloud offert SANS lien (compte de Nico) : offert, actif', o(OFFERT_SANS_LIEN));
    ok(o(SOMMEIL)?.actif === false && o(SOMMEIL)?.sommeil === true && o(SOMMEIL)?.lie === 'business', 'Business arrêté : offert EN SOMMEIL', o(SOMMEIL));
    ok(o(SEPT_JOURS) === null, '« 7 jours offerts » d\'un abonné boutique (cloud_ref offert:apple:…) : un ESSAI, jamais un cadeau', o(SEPT_JOURS));
    ok(o(STRIPE) === null && o(FREE) === null && o(null) === null && o(undefined) === null, 'Stripe, Free, profil illisible : rien');
    const f = CO.achatCloudFermeParOffert;
    ok(f(OFFERT_LIE) === true && f(OFFERT_SANS_LIEN) === true, 'Cloud offert actif : tout achat Cloud fermé');
    ok(f(SOMMEIL) === true && f(SOMMEIL, { sommeilSansAchat: false }) === false, 'en sommeil : fermé tant que la constante le dit ; false = un compte ordinaire');
    ok(f(SEPT_JOURS) === false && f(STRIPE) === false && f(FREE) === false, '« 7 jours offerts », Stripe, Free : rien de fermé (non-régression)');
  }

  console.log('2. Les offres (formulesCloud.js : cartesFormulesCloud)');
  const FC = await charger('/src/cloud/formulesCloud.js');
  if (fonction(FC, 'cartesFormulesCloud')) {
    for (const canalApp of ['stripe', 'apple', 'google']) {
      const m = FC.cartesFormulesCloud({ palier: 'business', canalApp, canalAbonnement: 'stripe', essaiPermis: false, cloudOffert: true });
      ok(m.cartes.length === 0 && m.voie === 'cloud_offert' && FC.formulesMasqueesPourLaVoie(m.voie) === true,
        `faf5021a (${canalApp}) : aucune carte « + Cloud », voie 'cloud_offert' masquée`, { voie: m.voie, cartes: m.cartes.map((c) => `${c.formule}:${c.cta}:${c.achetable}`) });
    }
    const free = FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'stripe', essaiPermis: true, cloudOffert: true });
    ok(free.cartes.length === 0 && free.essaiAffiche === false, 'un compte Free au Cloud offert : aucune carte, aucun essai annoncé', free.cartes.map((c) => c.formule));
    const avant = FC.cartesFormulesCloud({ palier: 'business', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: false });
    ok(avant.cartes.some((c) => c.formule === 'business_cloud' && c.cta === 'passer' && c.achetable === true), 'sans Cloud offert : « Passer à Business + Cloud » reste achetable (non-régression)');
  } else ok(false, 'formulesCloud.js illisible');

  console.log('3. L\'offre du Cloud seul (regles.js)');
  const RG = await charger('/src/cloud/regles.js');
  if (fonction(RG, 'offreCloudPourModale')) {
    ok(RG.offreCloudPourModale(lectureDe(OFFERT_LIE))?.mode === 'deja_actif', 'offert actif : « déjà actif », jamais un interrupteur');
    ok(RG.offreCloudPourModale(lectureDe(SOMMEIL)) === null && RG.voieCloud(lectureDe(SOMMEIL)) === null, 'en sommeil : aucune offre, aucune 2e voie', RG.offreCloudPourModale(lectureDe(SOMMEIL)));
    ok(RG.offreCloudPourModale(lectureDe(FREE))?.mode === 'interrupteur', 'un compte Free ordinaire : l\'offre d\'avant (non-régression)');
  } else ok(false, 'regles.js illisible');

  console.log('4. Les gestes sans argent (cloudOffert.js)');
  const CF = await charger('/src/cloud/cloudOffert.js');
  if (fonction(CF, 'actionsSansAchatCloud')) {
    const toutes = { essayer() {}, ajouter() {}, formule() {}, voirFormulesCloud() {}, voirFormules() {}, reprendre() {}, arreter() {}, meConnecter() {}, extension() {} };
    ok(JSON.stringify(Object.keys(CF.actionsSansAchatCloud(toutes)).sort()) === JSON.stringify(['extension', 'meConnecter']), 'restent « Me connecter » et l\'extension ; ni achat, ni offres, ni arrêt', Object.keys(CF.actionsSansAchatCloud(toutes)));
    ok(CF.achatFermeDeLecture({ etat: 'lecture' }) === false && CF.offertDeLecture({ etat: 'echec' }) === null, 'lecture pas encore là : rien de décidé (la garde finale tranche)');
    ok(CF.achatFermeDeLecture(lectureDe(OFFERT_LIE)) === true && CF.offertDeLecture(lectureDe(SOMMEIL))?.sommeil === true, 'la lecture Cloud porte le cadeau');
    ok(CF.phraseCloudOffert(CF.offertDeLecture(lectureDe(SOMMEIL)), 'fr') === 'Ton Cloud offert revient avec ton abonnement Business.', 'en sommeil : « Ton Cloud offert revient avec ton abonnement Business. »');
  } else ok(false, 'src/cloud/cloudOffert.js absent');

  console.log('5. « Reprendre mon essai » (repriseEssai.js)');
  const RE = await charger('/src/cloud/repriseEssai.js');
  if (fonction(RE, 'bandeauRepriseVisible')) {
    const marque = { formule: 'pro_cloud', at: MAINTENANT - 60_000 };
    ok(RE.bandeauRepriseVisible({ marque, cloudActif: false, vendable: true, maintenant: MAINTENANT }) === true, 'compte ordinaire : le bandeau d\'avant (non-régression)');
    ok(RE.bandeauRepriseVisible({ marque, cloudActif: false, vendable: true, maintenant: MAINTENANT, achatFerme: true }) === false, 'Cloud offert (en sommeil) : jamais « Reprendre mon essai »');
  }

  console.log('6. Le parcours d\'entrée (plan.js)');
  const PL = await charger('/src/entree/plan.js');
  if (fonction(PL, 'etapesVisibles')) {
    const c = (offert) => ({ surTelephone: true, voie: 'cloud', choix: { plateformes: ['vinted'] }, demanderPseudo: false,
      formules: { parcours: true, actif: offert, cloudOffert: offert }, cloud: { ouvert: true, actif: offert, parcours: true, cloudOffert: offert } });
    const liste = PL.etapesVisibles(c(true));
    const ids = liste.map((e) => e.id);
    ok(!ids.includes('cloud_offre') && !ids.includes('cloud') && ids.includes('cloud_connexion'), 'offert actif, « Non, pas d\'ordinateur » : aucun écran de vente, la connexion', ids);
    ok(liste[PL.indexDeReprise(liste, 'cloud_offre')]?.id === 'cloud_connexion', 'l\'écran de vente demandé (ou gardé) mène à la connexion, jamais au début', liste[PL.indexDeReprise(liste, 'cloud_offre')]?.id);
    ok(PL.etapesVisibles(c(false)).some((e) => e.id === 'cloud_offre'), 'compte ordinaire : l\'écran Cloud d\'avant (non-régression)');
  }

  console.log('7. La GARDE FINALE des achats');
  const ACH = await charger('/src/cloud/achatFormuleCloud.js');
  const ACS = await charger('/src/cloud/achatCloud.js');
  const banc = (profil) => {
    const j = { rpc: 0, invoke: 0, fetch: 0, conditions: 0, feuille: 0 };
    const supabase = {
      auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }), refreshSession: async () => ({ data: { session: null } }) },
      rpc: async () => { j.rpc++; return { data: { ok: true, essai: true }, error: null }; },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profil, error: null }) }) }) }),
      functions: { invoke: async () => { j.invoke++; return { data: { permis: true }, error: null }; } },
    };
    globalThis.fetch = async () => { j.fetch++; return { json: async () => ({}) }; };
    const commun = { supabase, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: '00000000-0000-4000-8000-000000000001', email: 'u@exemple.fr' },
      lang: 'fr', confirmer: async () => true, notifier: () => {}, demanderConditions: async () => { j.conditions++; return false; },
      purchasePremium: async () => { j.feuille++; return null; } };
    return { j, commun };
  };
  if (fonction(ACH, 'creerAchatFormuleCloud') && fonction(ACS, 'creerAchatCloud')) {
    for (const platform of ['web', 'ios', 'android']) {
      const { j, commun } = banc(OFFERT_LIE);
      const r = await ACH.creerAchatFormuleCloud({ ...commun, platform }).acheter('business_cloud', { origine: 'banc', dejaCloud: true });
      ok(r?.etat === 'deja' && r?.raison === 'cloud_offert' && j.conditions + j.rpc + j.fetch + j.feuille === 0,
        `formule avec Cloud (${platform}), Cloud offert : « deja », ni conditions, ni préparation, ni Stripe, ni feuille`, { r, j });
    }
    {
      const { j, commun } = banc(SOMMEIL);
      const r = await ACH.creerAchatFormuleCloud({ ...commun, platform: 'web' }).acheter('pro_cloud', { origine: 'banc', essaiAffiche: true });
      ok(r?.etat === 'refuse' && r?.raison === 'cloud_offert_sommeil' && /revient avec ton abonnement Business/.test(r?.message ?? '') && j.conditions + j.rpc + j.fetch === 0,
        'en sommeil : refusé avant tout, « Ton Cloud offert revient avec ton abonnement Business. »', { r, j });
    }
    {
      const { j, commun } = banc(OFFERT_LIE);
      const r = await ACS.creerAchatCloud({ ...commun, platform: 'web' }).acheter('banc');
      ok(r?.etat === 'deja' && r?.raison === 'cloud_offert' && j.conditions + j.rpc + j.fetch === 0, 'Cloud seul, Cloud offert : « deja », rien ne part', { r, j });
    }
    {
      const { j, commun } = banc(FREE);
      await ACH.creerAchatFormuleCloud({ ...commun, platform: 'web' }).acheter('pro_cloud', { origine: 'banc' });
      ok(j.conditions === 1, 'compte ordinaire : l\'achat d\'avant (la case des conditions est demandée — non-régression)', j);
    }
  } else ok(false, 'achatFormuleCloud.js / achatCloud.js illisibles');

  console.log('8. Les branchements (sources)');
  {
    const cm = lire('src/components/ConversionModal.jsx');
    ok((cm.match(/cartesFormulesCloud\(\{[\s\S]{0,700}?cloudOffert[,:\s}]/g) ?? []).length === 2, 'fenêtre d\'offres : les DEUX appels de cartesFormulesCloud portent cloudOffert');
    ok(/cloud_offert:beta_flags->>cloud_offert/.test(lire('src/cloud/useCloudProfil.js')), 'la lecture Cloud porte la marque du lien (alias cloud_offert)');
    ok(/achatFermeDeLecture\(lecture\)/.test(lire('src/cloud/CarteCloudStock.jsx')) && /cloudOffert: achatFermeDeLecture\(lecture\)/.test(lire('src/cloud/CarteCloudStock.jsx')), 'carte Cloud du Stock : cachée, et ses cartes vides, pour un Cloud offert');
    ok(/if \(achatFermeDeLecture\(lecture\)\) return null;/.test(lire('src/cloud/BlocFormulesReglages.jsx')), 'Réglages › formules avec Cloud : rien pour un Cloud offert');
    const ho = lire('src/cloud/HoteCloud.jsx');
    ok(/actionsSansAchatCloud\(actions\)/.test(ho) && /achatFermeDeLecture\(lecture\)/.test(ho), 'HoteCloud : « Cloud arrêté » et « essai terminé » sans achat, « place libre » jamais pour un Cloud offert');
    ok(/!achatFermeDeLecture\(lectureCloud\) && blocCloudSeulCache\(/.test(lire('src/reglages/SousPageAbonnement.jsx')), 'Réglages › Abonnement : le bloc Cloud reste pour un Cloud offert (il porte « Offert » / la phrase)');
    ok(/cloudOffert: achatFermeDeLecture\(lecture\)/.test(lire('src/entree/useFormulesEntree.js')) && /cloudOffert: achatFermeDeLecture\(lecture\)/.test(lire('src/entree/useCloudEntree.js')), 'parcours d\'entrée : les deux lectures disent le Cloud offert');
    ok(/cloudOffert: ferme/.test(lire('src/entree/useOffreAccueil.js')), 'accueil : les cartes de l\'écran Cloud sont vides pour un Cloud offert');
    ok(/achatFerme: achatFermeDeLecture\(lecture\)/.test(lire('src/cloud/BandeauReprendreEssai.jsx')), '« Reprendre mon essai » lit le Cloud offert');
    ok(/refusAchatSiOffert\(supabase, user\?\.id, lang\)/.test(lire('src/cloud/achatFormuleCloud.js')) && /refusAchatSiOffert\(supabase, user\?\.id, lang\)/.test(lire('src/cloud/achatCloud.js')), 'la garde finale est la PREMIÈRE chose des deux achats');
  }

  console.log('9. Les écrans rendus');
  {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const h = React.createElement;
    const texte = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').split(String.fromCharCode(0x2060)).join('').replace(/\s+/g, ' ');
    const BR = await charger('/src/cloud/BlocCloudReglages.jsx');
    const FE = await charger('/src/cloud/FinEssaiCloud.jsx');
    const actions = { arreter: async () => ({}), reprendre: async () => ({}), essayer() {}, ajouter() {}, voirFormules() {}, meConnecter() {} };
    const cBiz = { lang: 'fr', isPremium: true, isPro: true, isBusiness: true, quotas: {}, plateforme: 'web' };
    const cFree = { lang: 'fr', isPremium: false, isPro: false, isBusiness: false, quotas: { annonces: { plafond: 5 } }, plateforme: 'web' };
    if (fonction(BR, 'BlocCloudReglagesLu')) {
      const a = texte(h(BR.BlocCloudReglagesLu, { c: cBiz, lecture: lectureDe(OFFERT_LIE), actions }));
      ok(/Offert/.test(a) && /tant que ton abonnement Business est actif/.test(a) && !/Arrêter/.test(a) && !/24,99/.test(a),
        'Réglages, Cloud offert actif : « Offert », la phrase vraie, ni « Arrêter » ni prix', a.slice(0, 400));
      ok(/Connecter mes plateformes/.test(a), 'Réglages, Cloud offert actif : « Connecter mes plateformes » reste');
      const d = texte(h(BR.BlocCloudReglagesLu, { c: cFree, lecture: lectureDe(SOMMEIL), actions }));
      ok(/Ton Cloud offert revient avec ton abonnement Business\./.test(d) && !/Essayer|Ajouter|Reprendre|24,99|7 jours/.test(d),
        'Réglages, en sommeil : « Ton Cloud offert revient avec ton abonnement Business. », aucun achat', d.slice(0, 400));
      const s = texte(h(BR.BlocCloudReglagesLu, { c: cBiz, lecture: lectureDe(STRIPE), actions }));
      ok(/Arrêter/.test(s) && !/Offert/.test(s), 'Réglages, Cloud payé par carte : « Arrêter » comme avant (non-régression)', s.slice(0, 300));
      const m = texte(h(BR.MentionCloudResiliation, { lang: 'fr', lecture: lectureDe(OFFERT_LIE), onArreterOption() {} }));
      ok(/s'arrête avec lui/.test(m) && !/repasse en Free \+ FillSell Cloud/.test(m) && !/Arrêter aussi/.test(m),
        'résiliation du Business : « ton Cloud offert s\'arrête avec lui », jamais « repasse en Free + Cloud »', m);
      const ms = texte(h(BR.MentionCloudResiliation, { lang: 'fr', lecture: lectureDe(STRIPE), onArreterOption() {} }));
      ok(/repasse en Free \+ FillSell Cloud/.test(ms), 'résiliation, Cloud payé : la phrase d\'avant (non-régression)', ms);
    } else ok(false, 'BlocCloudReglages.jsx illisible');
    if (fonction(FE, 'EcranCloudArrete')) {
      const e = texte(h(FE.EcranCloudArrete, { lang: 'fr', actions: CF.actionsSansAchatCloud?.({ ajouter() {}, extension() {} }) ?? {}, phrase: 'Ton Cloud offert revient avec ton abonnement Business.', onFermer() {} }));
      ok(/Ton Cloud offert revient avec ton abonnement Business\./.test(e) && !/Reprendre|24,99/.test(e), '« FillSell Cloud est arrêté » d\'un Cloud offert : la phrase, jamais « Reprendre · 24,99 €/mois »', e.slice(0, 300));
    }
  }
} finally {
  await vite.close();
}
console.log(rouges ? `\n✗ cloud-offert-ecrans : ${rouges} échec(s) sur ${verts + rouges}` : `\n✓ cloud-offert-ecrans : ${verts}/${verts}`);
process.exit(rouges ? 1 : 0);
