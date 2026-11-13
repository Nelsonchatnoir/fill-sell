// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 4d (12/11/2026, lot « zéro problème », étape 1) — CHANGER DE FORMULE PENDANT L'ESSAI : CHAQUE TEXTE DIT
// CE QUI SE PASSE VRAIMENT
//     npm run selftest:formules-essai-changement
// ═══════════════════════════════════════════════════════════════════════════
// Constat (audit du 12/11, code lu) — Stripe : la montée Premium + Cloud → Pro + Cloud pendant l'essai garde l'essai sans
// prorata, l'app disait « tu paies la différence au prorata » ; vers Business + Cloud l'essai s'ARRÊTE et 79,99 € sont
// prélevés tout de suite, l'app disait seulement « prorata » (écart d'argent) ; « Passer à Premium + Cloud » de la feuille
// de la veille finissait sur un refus (« descente_par_changer_formule ») ; « Retirer le Cloud » pendant l'essai : texte faux
// (« rien n'est remboursé pour le mois en cours ») puis refus 409 ; « Voir les autres formules » (C4) visible pendant
// l'essai : impasse. Apple : le Cloud seul et les formules sont dans DEUX groupes d'abonnements — Apple offre sa semaine
// gratuite à qui a déjà eu l'essai FillSell, le serveur n'ouvre rien avant le premier paiement : 7 jours sans rien, sans
// un mot. Google : rien ne disait que la boutique peut arrêter l'essai.
// Ce test prouve, sans réseau ni base (Vite SSR) :
//   A. web : pour chaque montée pendant l'essai, la note de la carte = l'issue de la VRAIE fonction serveur
//      (voieFormuleStripe) : l'essai continue → « Ton essai continue jusqu'au … Ensuite : … » ; Business + Cloud → « ton
//      essai s'arrête, 79,99 € sont prélevés aujourd'hui » ; hors essai, rien ne change (prorata) ;
//   B. la descente de la feuille de la veille passe par changer-formule (« programmer »), jamais par create-checkout-session ;
//   C. Réglages, formule avec Cloud EN ESSAI sur le web : « Arrêter l'essai » (le vrai geste), plus « Retirer le Cloud » ;
//   D. C4 caché pendant un essai ;
//   E. iPhone / Android : l'essai FillSell déjà pris mais la boutique offre sa semaine → on le dit AVANT la feuille, et
//      rien ne s'achète sans confirmation ;
//   F. boutique pendant l'essai : la note dit que la boutique peut arrêter l'essai et montre le montant.
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
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

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
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const CO = await vite.ssrLoadModule('/src/config/cloudOffer.js');
  const INT = await vite.ssrLoadModule('/src/config/interrupteurs.js');
  const PB = await vite.ssrLoadModule('/src/lib/prixBoutique.js');
  const FC = await vite.ssrLoadModule('/src/cloud/formulesCloud.js');
  const TF = await vite.ssrLoadModule('/src/cloud/textesFormules.js');
  const BFR = await vite.ssrLoadModule('/src/cloud/BlocFormulesReglages.jsx');
  const ACH = await vite.ssrLoadModule('/src/cloud/achatFormuleCloud.js');
  const DESC = await vite.ssrLoadModule('/src/reglages/formuleDescente.js');
  const FS = await vite.ssrLoadModule('/supabase/functions/_shared/formules-serveur.js');
  await CO.noterBinaireCloud('web', 'web');
  PB.poserPrixBoutique(null);
  INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_google: 1 });
  const T = TF.textesFormules('fr');
  const FIN = '19 novembre';
  const note = (carte, canalApp = 'stripe') => FC.texteNoteCarte(carte, { T, canalApp, essaiFin: FIN, nom: TF.NOMS_FORMULES[carte.formule], prix: PB.prixOuChargement(carte.formule, 'fr') });

  // ── A. Web : la note = l'issue du serveur ─────────────────────────────────────────────────────────────────────────
  console.log('\nA. Web, pendant l’essai : la note de chaque carte = ce que fait le serveur');
  const enEssaiPremium = FC.cartesFormulesCloud({ palier: 'premium', formuleActuelle: 'premium_cloud', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: false, essaiEnCours: true });
  for (const carte of enEssaiPremium.cartes.filter((c) => !c.actuelle)) {
    const serveur = FS.voieFormuleStripe({ formule: carte.formule, palierStripe: { id: 'sub_x', formule: 'premium_cloud', rang: 1, status: 'trialing' }, essaiPermis: false });
    const attendue = serveur.finEssai ? 'essai_arrete' : serveur.prorata === 'aucun' ? 'essai_continue' : 'prorata';
    ok(carte.note === attendue, `Premium + Cloud en essai → ${carte.formule} : le serveur fait « ${serveur.finEssai ? 'fin d’essai, payé aujourd’hui' : `prorata ${serveur.prorata}`} », la carte dit « ${carte.note} »`, `attendu ${attendue}`);
  }
  const pro = enEssaiPremium.cartes.find((c) => c.formule === 'pro_cloud');
  const bus = enEssaiPremium.cartes.find((c) => c.formule === 'business_cloud');
  ok(pro && note(pro) === "Ton essai continue jusqu'au 19 novembre. Ensuite : Pro + Cloud, 49,99 €/mois.", 'Pro + Cloud : « Ton essai continue jusqu’au … Ensuite : Pro + Cloud, 49,99 €/mois. » (jamais « prorata »)', pro && note(pro));
  ok(bus && note(bus) === "Business + Cloud n'a pas d'essai : ton essai s'arrête, 79,99 € sont prélevés aujourd'hui.", 'Business + Cloud : « ton essai s’arrête, 79,99 € sont prélevés aujourd’hui » (texte de Nico)', bus && note(bus));
  // Le Cloud seul en essai (Free) qui passe à une formule : même règle côté serveur (cloudSeulStripe trialing).
  const enEssaiCloudSeul = FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'stripe', canalCloud: 'stripe', essaiPermis: false, essaiEnCours: true });
  for (const carte of enEssaiCloudSeul.cartes) {
    const serveur = FS.voieFormuleStripe({ formule: carte.formule, cloudSeulStripe: { id: 'sub_c', status: 'trialing' }, essaiPermis: false });
    const attendue = serveur.finEssai ? 'essai_arrete' : 'essai_continue';
    ok(carte.note === attendue && carte.achetable, `Cloud seul en essai → ${carte.formule} : la carte dit « ${carte.note} », comme le serveur`, `attendu ${attendue}`);
  }
  const horsEssai = FC.cartesFormulesCloud({ palier: 'premium', formuleActuelle: 'premium_cloud', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: false, essaiEnCours: false });
  ok(horsEssai.cartes.filter((c) => !c.actuelle).every((c) => c.note === 'prorata'), 'hors essai : rien ne change (« prorata »)');

  // ── B. La descente de la feuille de la veille ─────────────────────────────────────────────────────────────────────
  console.log('\nB. « Passer à Premium + Cloud » pendant l’essai, sur le web');
  const appels = [];
  globalThis.fetch = async (url, init) => {
    appels.push({ url: String(url), corps: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/changer-formule')) return { ok: true, status: 200, json: async () => ({ canal: 'stripe', actuelle: 'premium_cloud', change_pendant_essai: true }) };
    return { ok: false, status: 409, json: async () => ({ error: 'formule_refusee', motif: 'descente_par_changer_formule' }) };
  };
  const supabaseFactice = { auth: { getSession: async () => ({ data: { session: { access_token: 'jeton' } } }), refreshSession: async () => ({ data: { session: { access_token: 'jeton' } } }) }, rpc: async () => ({ data: null, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
  const achatWeb = ACH.creerAchatFormuleCloud({ supabase: supabaseFactice, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: 'u', email: 'u@exemple.fr' }, lang: 'fr', platform: 'web', confirmer: async () => true, notifier: () => {}, demanderConditions: async () => true });
  const rDesc = await achatWeb.acheter('premium_cloud', { descente: true });
  ok(appels.length === 1 && appels[0].url.endsWith('/functions/v1/changer-formule'), 'la descente appelle changer-formule (une seule fois)', JSON.stringify(appels.map((a) => a.url)));
  ok(!appels.some((a) => a.url.includes('create-checkout-session')), 'jamais create-checkout-session pour une descente (il la refuse)');
  ok(appels[0]?.corps?.action === 'programmer' && appels[0]?.corps?.vers === 'premium_cloud', 'changer-formule reçoit { action: "programmer", vers: "premium_cloud" }', JSON.stringify(appels[0]?.corps));
  ok(rDesc?.etat === 'change', 'pendant l’essai (change_pendant_essai) : issue « change » (la feuille dit « C’est noté »)', JSON.stringify(rDesc));
  const cf = lire('supabase/functions/changer-formule/index.ts');
  ok(/if \(cible\.status === "trialing" && estFormuleCloud\(actuelle\) && estFormuleCloud\(formuleStripe\(vers\)\)\)/.test(cf) && /change_pendant_essai: true/.test(cf), 'le serveur sait faire cette descente pendant l’essai (branche « pendant l’essai » de changer-formule)');

  // ── C. Réglages : « Arrêter l'essai » ─────────────────────────────────────────────────────────────────────────────
  console.log('\nC. Réglages › Abonnement, formule avec Cloud EN ESSAI, sur le web');
  const c = { user: { id: 'u' }, lang: 'fr', plateforme: 'web', natif: false, isPremium: true, isPro: true, isBusiness: false };
  const lectureEssai = { etat: 'ok', cloud: { etat: 'essai', essaiPris: true, essaiFin: '2026-11-19T18:18:00Z' }, profil: { cloud_canal: 'stripe' } };
  const profilF = { etat: 'ok', formuleActuelle: 'pro_cloud', canalAbonnement: 'stripe', founder: false, echeance: '2026-11-19T18:18:00Z' };
  const htmlEssai = renderToStaticMarkup(h(BFR.default, { c, visible: true, lecture: lectureEssai, profil: profilF, actions: { arreter: async () => ({ ok: true }) } }));
  ok(/data-formules-reglages="formule_essai"/.test(htmlEssai) && /Arrêter l(&#x27;|')essai/.test(htmlEssai), 'pendant l’essai : « Arrêter l’essai »', htmlEssai.slice(0, 400));
  ok(!/Retirer le Cloud/.test(htmlEssai), 'pendant l’essai : plus de « Retirer le Cloud » (texte faux, puis refus 409)');
  const htmlPaye = renderToStaticMarkup(h(BFR.default, { c, visible: true, lecture: { ...lectureEssai, cloud: { etat: 'paye', essaiPris: true } }, profil: profilF, actions: { arreter: async () => ({ ok: true }) } }));
  ok(/Retirer le Cloud/.test(htmlPaye) && !/formule_essai/.test(htmlPaye), 'formule PAYÉE : « Retirer le Cloud » comme avant');
  const bfr = lire('src/cloud/BlocFormulesReglages.jsx');
  ok(/const r = await actions\.arreter\(\{ canal: 'stripe' \}\);/.test(bfr) && /formuleContinue: r\?\.formule_continue === true/.test(bfr), 'le geste = l’arrêt de l’essai (cancel-subscription option cloud), le serveur dit si une formule payée continue');
  // (13/11, décision de Nico — plus aucun arrêt immédiat d'un essai) Avant : « Ton essai s'arrête maintenant : rien n'est
  // prélevé pour l'essai. » Le web coupe le renouvellement, comme les boutiques : l'essai continue jusqu'à sa fin.
  ok(T.arreterEssaiTexte('19 novembre') === "Ton essai continue jusqu'au 19 novembre, puis s'arrête seul : rien n'est prélevé pour l'essai.", 'le texte de confirmation dit la vérité (l’essai continue jusqu’à sa fin, rien prélevé pour l’essai)');

  // ── D. C4 caché pendant un essai ──────────────────────────────────────────────────────────────────────────────────
  console.log('\nD. « Voir les autres formules » (C4) pendant un essai');
  const baseC4 = { ouvert: true, natif: false, isPremium: true, clientStripe: 'cus_x', resilie: false };
  ok(DESC.blocDescenteVisible(baseC4) === true && DESC.blocDescenteVisible({ ...baseC4, enEssai: true }) === false, 'C4 : visible hors essai, caché pendant un essai');
  ok(/<BlocChangerFormule c=\{c\} clientStripe=\{clientStripe\} enEssai=\{lectureCloud\?\.cloud\?\.etat === 'essai'\} \/>/.test(lire('src/reglages/SousPageAbonnement.jsx')), 'Réglages passe l’essai en cours à C4');

  // ── E. iPhone : essai FillSell déjà pris, semaine gratuite offerte par Apple ──────────────────────────────────────
  console.log('\nE. iPhone : la semaine gratuite d’Apple quand l’essai FillSell est déjà pris');
  PB.poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: { pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: true } } });
  const questions = [];
  let achatsBoutique = 0;
  const achatIos = ACH.creerAchatFormuleCloud({
    supabase: supabaseFactice, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', user: { id: 'u', email: 'u@exemple.fr' }, lang: 'fr', platform: 'ios',
    confirmer: async (q) => { questions.push(q); return false; }, notifier: () => {}, demanderConditions: async () => true,
    purchasePremium: async () => { achatsBoutique++; return { cancelled: true }; },
  });
  const rIos = await achatIos.acheter('pro_cloud', { essaiAffiche: false, dejaCloud: true });
  ok(questions.length === 1 && /1 semaine gratuite/.test(questions[0]) && /n'est pas encore activé/.test(questions[0]), 'la question est posée AVANT la feuille d’Apple : la semaine gratuite n’active rien', questions[0]);
  ok(rIos?.etat === 'annule' && achatsBoutique === 0, 'refusée : rien ne s’achète chez Apple');
  PB.poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: { pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: false } } });
  questions.length = 0;
  await achatIos.acheter('pro_cloud', { essaiAffiche: false, dejaCloud: true });
  ok(questions.length === 0 && achatsBoutique === 1, 'Apple n’offre pas de semaine : aucune question, l’achat suit son cours');
  PB.poserPrixBoutique(null);

  // ── F. Boutique pendant l'essai ───────────────────────────────────────────────────────────────────────────────────
  console.log('\nF. iPhone / Android, pendant l’essai');
  const enEssaiGoogle = FC.cartesFormulesCloud({ palier: 'premium', formuleActuelle: 'premium_cloud', canalApp: 'google', canalAbonnement: 'google', essaiPermis: false, essaiEnCours: true });
  const proG = enEssaiGoogle.cartes.find((x) => x.formule === 'pro_cloud');
  ok(proG?.note === 'essai_boutique' && /Google Play t'affiche le montant avant que tu valides/.test(note(proG, 'google')), 'Android : « pendant ton essai, il peut l’arrêter … Google Play t’affiche le montant »', proG && note(proG, 'google'));
} finally {
  await vite.close();
}
console.log(`\n${rouges === 0 ? '✓' : '✗'} formules-essai-changement : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
