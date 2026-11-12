// ═══════════════════════════════════════════════════════════════════════════
// VERROUS DES FORMULES AVEC CLOUD — CÔTÉ ÉCRAN (11/11/2026, décisions et textes validés de Nico)
//     npm run selftest:formules-cloud-offres
// ═══════════════════════════════════════════════════════════════════════════
// Rendu côté serveur (Vite SSR + react-dom/server, sans réseau ni base). Un verrou par cas :
//   A. le contrat partagé (supabase/functions/_shared/formules-cloud.js) ré-exporté, jamais redéfini ; les prix du web =
//      les prix Stripe créés le 11/11 ; « le Cloud pour 22 / 20 / 20 € de plus » (jamais une « économie ») ;
//   B. le point de décision : canal fermé = invisible ; ouvert sur SON canal seulement ; témoin partout ;
//   C. ⛔ BUSINESS + CLOUD : jamais de pastille « 7 jours gratuits », jamais « Essayer », jamais « 0 € aujourd'hui », jamais
//      de texte d'essai — dans TOUTES les combinaisons d'entrée, et à l'écran ; son bouton : « Passer à Business + Cloud » ;
//   D. l'essai n'est annoncé sur Premium + Cloud et Pro + Cloud QUE si l'état lu le permet (et, mobile, la boutique) ;
//   E. § 10.2 cas 1 — inscrit AVEC ordinateur : parcours 4a (extension), offres ouvertes sur « Sans Cloud », aucun essai
//      sur les paliers ; cas 2 — SANS ordinateur : parcours 4b, offres sur « Avec Cloud », Pro mis en avant, essai permis ;
//   F. les abonnés : sa formule surlignée, prorata, jamais deux abonnements (autre canal = rien ne s'achète ici), Founder ;
//   G. les mentions (Apple 3.1.2) par carte, Business « payé dès la souscription » ;
//   H. les textes validés, À L'OCTET (fenêtre, parcours avec les 3 corrections, Réglages, fin d'essai) ; aucun mot interdit ;
//   I. l'achat : une réponse sans `formule` n'ouvre RIEN ; l'essai refusé se confirme ; Business sans confirmation ;
//   J. la fenêtre rendue : interrupteur, cartes, carte du Cloud seul retirée ; la fin d'essai rendue.
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
const egal = (a, b, m) => ok(a === b, m, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s).replace(ESP, ' ');
const texte = (html) => net(html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();

globalThis.document ??= { body: {} };
const memoire = new Map();
// Un stockage en mémoire (Node 25 a son propre localStorage, sans fichier : inutilisable ici).
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
  const CONTRAT = await vite.ssrLoadModule('/supabase/functions/_shared/formules-cloud.js');
  const CO = await vite.ssrLoadModule('/src/config/cloudOffer.js');
  const INT = await vite.ssrLoadModule('/src/config/interrupteurs.js');
  const PB = await vite.ssrLoadModule('/src/lib/prixBoutique.js');
  const FC = await vite.ssrLoadModule('/src/cloud/formulesCloud.js');
  const TF = await vite.ssrLoadModule('/src/cloud/textesFormules.js');
  const MA = await vite.ssrLoadModule('/src/utils/mentionsAbonnement.js');
  const OAC = await vite.ssrLoadModule('/src/cloud/OffresAvecCloud.jsx');
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const PL = await vite.ssrLoadModule('/src/entree/plan.js');
  const TE = await vite.ssrLoadModule('/src/entree/textes.js');
  const ACH = await vite.ssrLoadModule('/src/cloud/achatFormuleCloud.js');
  const FEF = await vite.ssrLoadModule('/src/cloud/FinEssaiFormule.jsx');
  const CC = await vite.ssrLoadModule('/src/cloud/conditionsCloud.js');
  const IDS = await vite.ssrLoadModule('/src/lib/idsFormulesBoutique.js');
  const PAL = await vite.ssrLoadModule('/src/utils/palier.js');
  await CO.noterBinaireCloud('web', 'web');

  // ── A. Le contrat, les prix du web, le supplément ─────────────────────────────────────────────────────────────────
  console.log('\nA. Le contrat partagé, les prix du web, « le Cloud pour … de plus »');
  for (const k of ['FORMULES_CLOUD', 'PALIER_DE_FORMULE', 'FORMULE_MISE_EN_AVANT', 'FORMULES_AVEC_ESSAI', 'PRIX_AVEC_CLOUD_EUR', 'SUPPLEMENT_CLOUD_EUR', 'PRODUITS_BOUTIQUES', 'CLE_INTERRUPTEUR_FORMULES']) {
    ok(CO[k] === CONTRAT[k], `config/cloudOffer.js ré-exporte ${k} du contrat (même objet, jamais redéfini)`);
  }
  egal(CO.FORMULES_ESSAI_JOURS, CONTRAT.ESSAI_JOURS, 'la durée d’essai vient du contrat');
  egal(JSON.stringify(CONTRAT.FORMULES_AVEC_ESSAI), JSON.stringify(['premium_cloud', 'pro_cloud']), '⛔ le contrat : essai sur Premium + Cloud et Pro + Cloud SEULEMENT');
  const eurosFr = (n) => `${n.toFixed(2).replace('.', ',')} €`;
  for (const f of CONTRAT.FORMULES_CLOUD) {
    egal(PB.PRIX_WEB[f].fr, eurosFr(CONTRAT.PRIX_AVEC_CLOUD_EUR[f]), `prix du web ${f} = le contrat (prix Stripe du 11/11)`);
    egal(PB.PRIX_WEB[f].en, `€${CONTRAT.PRIX_AVEC_CLOUD_EUR[f].toFixed(2)}`, `prix du web ${f}, à l’anglaise`);
    ok(PB.PRODUITS_PRIX.includes(f), `${f} est un produit de prix (même règle que les autres)`);
    const seul = Number(PB.PRIX_WEB[CONTRAT.PALIER_DE_FORMULE[f]].fr.replace(',', '.').replace(/[^\d.]/g, ''));
    egal(Math.round((CONTRAT.PRIX_AVEC_CLOUD_EUR[f] - seul) * 100) / 100, CONTRAT.SUPPLEMENT_CLOUD_EUR[f], `le supplément du contrat (${f}) = la vraie différence des prix du web`);
  }
  PB.poserPrixBoutique(null);
  egal(PB.supplementAffiche('premium_cloud', 'fr'), '22 €', 'web : « 22 € » (Premium + Cloud)');
  egal(PB.supplementAffiche('pro_cloud', 'fr'), '20 €', 'web : « 20 € » (Pro + Cloud)');
  egal(PB.supplementAffiche('business_cloud', 'fr'), '20 €', 'web : « 20 € » (Business + Cloud)');
  egal(PB.supplementAffiche('pro_cloud', 'en'), '€20', 'web anglais : « €20 »');
  egal(PB.zeroAffiche('pro_cloud', 'fr'), '0 €', 'web : « 0 € »');
  // Mobile : la différence des DEUX prix de la boutique, dans SA monnaie ; inconnus → rien.
  const boutique = (prix, statut = 'pret') => PB.poserPrixBoutique({ canal: 'google', statut, prix });
  boutique({ pro: { texte: '29,99 €', montant: 29.99, devise: 'EUR' }, pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR', essai: true } });
  egal(PB.supplementAffiche('pro_cloud', 'fr'), '20 €', 'Android (EUR) : la différence des prix de la boutique');
  egal(PB.zeroAffiche('pro_cloud', 'fr'), '0 €', 'Android (EUR) : « 0 € » dans la monnaie de la boutique');
  boutique({ pro: { texte: '$29.99', montant: 29.99, devise: 'USD' }, pro_cloud: { texte: '$49.99', montant: 49.99, devise: 'USD' } });
  egal(PB.supplementAffiche('pro_cloud', 'en'), '$20', 'Android (USD) : « $20 », jamais des euros (règle de Google, refus de la vc36)');
  boutique({ pro_cloud: { texte: '49,99 €', montant: 49.99, devise: 'EUR' } });
  egal(PB.supplementAffiche('pro_cloud', 'fr'), null, 'Android : le prix de la formule seule absent → la ligne ne s’affiche pas');
  egal(PB.prixAffiche('business_cloud', 'fr'), null, 'Android : le prix d’une formule pas lue → null (« … », bouton inactif)');
  PB.poserPrixBoutique(null);
  egal(JSON.stringify(IDS.idsFormulesBoutique('apple')), JSON.stringify({ premium_cloud: 'app.fillsell.premium.cloud', pro_cloud: 'app.fillsell.pro.cloud', business_cloud: 'app.fillsell.business.cloud' }), 'les produits Apple des formules viennent du contrat');
  const chargeur = fs.readFileSync(join(ROOT, 'src/lib/chargerPrixBoutique.js'), 'utf8');
  ok(/idsBoutique\(\{ formules: formulesDemandees \}\)/.test(chargeur) && /let formulesDemandees = false;/.test(chargeur), 'la boutique n’est interrogée sur les formules qu’une fois demandées (fermé : la lecture d’avant)');

  // ── B. Le point de décision ───────────────────────────────────────────────────────────────────────────────────────
  console.log('\nB. formulesCloudVendables : canal fermé = invisible ; son canal seulement ; témoin partout');
  const PROD = { cloud_offre_ouverte: 1, grille_trois_jauges: 1 };
  INT._remettreAZero({ ...PROD });
  for (const plateforme of ['web', 'ios', 'android']) ok(!CO.formulesCloudVendables('u-ordinaire', { plateforme, fuseau: 'Europe/Paris' }), `tout fermé (prod du 11/11) : invisible (${plateforme})`);
  INT._remettreAZero({ ...PROD, cloud_formules_stripe: 1 });
  ok(CO.formulesCloudVendables('u-ordinaire', { plateforme: 'web', fuseau: 'Europe/Paris' }), 'cloud_formules_stripe = 1 : visible sur le web');
  ok(!CO.formulesCloudVendables('u-ordinaire', { plateforme: 'ios', fuseau: 'Europe/Paris' }), 'cloud_formules_stripe = 1 : toujours invisible sur iPhone (son canal : apple)');
  ok(!CO.formulesCloudVendables('u-ordinaire', { plateforme: 'web', fuseau: 'America/New_York' }), 'hors de France : invisible (même règle que le Cloud)');
  INT._remettreAZero({ ...PROD, cloud_formules_stripe: 2 });
  ok(!CO.formulesCloudVendables('u-ordinaire', { plateforme: 'web', fuseau: 'Europe/Paris' }), 'interrupteur ≠ 1 : fermé');
  INT._remettreAZero({ ...PROD });
  const faux = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { beta_flags: { cloud: true } }, error: null }) }) }) }) };
  await CO.chargerTemoinCloud(faux, 'u-temoin');
  ok(CO.formulesCloudVendables('u-temoin', { plateforme: 'web', fuseau: 'America/New_York' }), 'témoin (profiles.beta_flags.cloud) : visible, tout fermé, partout');

  // ── C. Business + Cloud : jamais d'essai ──────────────────────────────────────────────────────────────────────────
  console.log('\nC. ⛔ Business + Cloud : ni pastille, ni « Essayer », ni « 0 € aujourd’hui », dans toutes les combinaisons');
  let combinaisons = 0, fautes = [];
  for (const palier of ['gratuit', 'premium', 'pro', 'business']) for (const canalApp of ['stripe', 'apple', 'google'])
    for (const canalAbonnement of [null, 'stripe', 'apple', 'google']) for (const essaiPermis of [true, false, null])
      for (const formuleActuelle of [null, 'premium_cloud', 'pro_cloud']) for (const founder of [false, true]) {
        const m = FC.cartesFormulesCloud({ palier, canalApp, canalAbonnement, essaiPermis, formuleActuelle, founder, essaiBoutique: () => true });
        const b = m.cartes.find((x) => x.formule === 'business_cloud');
        combinaisons++;
        if (b && (b.essai || b.pastille || b.lignePrix !== 'simple' || (b.cta !== 'passer' && b.cta !== null) || b.enLecture)) fautes.push(JSON.stringify({ palier, canalApp, canalAbonnement, essaiPermis, formuleActuelle, b }));
      }
  ok(fautes.length === 0 && combinaisons === 864, `${combinaisons} combinaisons : la carte Business + Cloud n’a jamais d’essai, son bouton est « Passer à »`, fautes[0]);

  // ── D. L'essai seulement s'il est permis ──────────────────────────────────────────────────────────────────────────
  console.log('\nD. L’essai annoncé seulement quand l’état lu le permet (et, mobile, la boutique)');
  const free = (o) => FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'stripe', essaiBoutique: () => true, ...o });
  const parF = (m) => Object.fromEntries(m.cartes.map((x) => [x.formule, x]));
  let c = parF(free({ essaiPermis: true }));
  ok(c.premium_cloud.cta === 'essai' && c.premium_cloud.pastille && c.pro_cloud.cta === 'essai' && c.pro_cloud.pastille, 'Free, essai permis : Premium + Cloud et Pro + Cloud « Essayer », avec la pastille');
  ok(c.business_cloud.cta === 'passer' && !c.business_cloud.pastille, 'Free, essai permis : Business + Cloud « Passer à », sans pastille');
  c = parF(free({ essaiPermis: false }));
  ok(Object.values(c).every((x) => x.cta === 'passer' && !x.pastille && x.lignePrix === 'simple'), 'essai déjà pris (ou verrou) : « Passer à » partout, aucune pastille');
  c = parF(free({ essaiPermis: null }));
  ok(c.pro_cloud.enLecture && c.premium_cloud.enLecture && !c.business_cloud.enLecture && !c.pro_cloud.pastille, 'état pas encore lu : bouton en attente (« … »), jamais un essai promis');
  c = parF(FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'apple', essaiPermis: true, essaiBoutique: (f) => f === 'premium_cloud' }));
  ok(c.premium_cloud.essai && !c.pro_cloud.essai, 'iPhone : l’essai suit la boutique, produit par produit');
  egal(FC.essaiPermisDuCompte({ etat: 'ok', cloud: { etat: 'aucun', essaiPris: false } }), true, 'essai permis : état « aucun », jamais pris');
  egal(FC.essaiPermisDuCompte({ etat: 'ok', cloud: { etat: 'essai_termine', essaiPris: true } }), false, 'essai déjà pris : non');
  egal(FC.essaiPermisDuCompte({ etat: 'echec' }), false, 'lecture ratée : non');
  egal(FC.essaiPermisDuCompte({ etat: 'lecture' }), null, 'lecture en cours : inconnu');

  // ── E. § 10.2 cas 1 et 2 ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nE. § 10.2 — cas 1 (avec ordinateur) et cas 2 (sans ordinateur), côté écran');
  const ctx = (o = {}) => ({ choix: { plateformes: ['vinted'] }, cloud: { parcours: false, actif: false, ouvert: true }, plan: { free: true }, demanderPseudo: false, voie: null, ...o });
  const ids = (cx) => PL.etapesVisibles(cx).map((e) => e.id).join(' › ');
  const formulesOuvertes = { parcours: true, actif: false, choisie: null, choisieAvecEssai: false };
  egal(ids(ctx({ formules: formulesOuvertes })), 'plateformes › ordinateur › extension › releve › republication › free › fin', 'formules ouvertes, avant le choix : « As-tu un ordinateur ? » à la place de « Comment tu veux publier ? »');
  egal(ids(ctx({ formules: formulesOuvertes, voie: 'extension' })), 'plateformes › ordinateur › extension › releve › republication › free › fin', 'cas 1 — avec ordinateur : 4a, l’extension, aucune étape Cloud');
  memoire.clear(); FC.noterVueOffres('sans');
  egal(FC.vueOffresParDefaut({ choixEntree: FC.lireVueOffres() }), 'sans', 'cas 1 : la fenêtre d’offres s’ouvre ensuite sur « Sans Cloud »');
  egal(ids(ctx({ formules: formulesOuvertes, voie: 'cloud' })), 'plateformes › ordinateur › cloud_presentation › cloud_offres › releve › republication › free › fin', 'cas 2 — sans ordinateur : 4b, présentation puis « Choisis ta formule »');
  egal(ids(ctx({ formules: { ...formulesOuvertes, choisie: 'pro_cloud', choisieAvecEssai: true }, voie: 'cloud' })), 'plateformes › ordinateur › cloud_presentation › cloud_offres › cloud › releve › republication › free › fin', 'cas 2 : Pro + Cloud à l’essai → « Rien à payer avant le … »');
  egal(ids(ctx({ formules: { ...formulesOuvertes, choisie: 'business_cloud', choisieAvecEssai: false }, voie: 'cloud' })), 'plateformes › ordinateur › cloud_presentation › cloud_offres › releve › republication › free › fin', '⛔ Business + Cloud choisi : JAMAIS l’écran d’essai');
  egal(ids(ctx({ formules: { ...formulesOuvertes, choisie: 'pro_cloud', choisieAvecEssai: true, actif: true }, voie: 'cloud', cloud: { parcours: true, actif: true, ouvert: true }, plan: { free: false } })), 'plateformes › ordinateur › cloud_presentation › cloud_offres › cloud › cloud_connexion › releve › republication › formule › fin', 'cas 2, essai pris : les connexions, puis « Ta formule Pro + Cloud » à la place de « Ton plan Free »');
  memoire.clear(); FC.noterVueOffres('avec');
  egal(FC.vueOffresParDefaut({ choixEntree: FC.lireVueOffres() }), 'avec', 'cas 2 : la fenêtre d’offres s’ouvre sur « Avec Cloud »');
  c = parF(free({ essaiPermis: true }));
  ok(c.pro_cloud.misEnAvant && !c.premium_cloud.misEnAvant && !c.business_cloud.misEnAvant, 'cas 2 : Pro + Cloud mis en avant (« Notre conseil »), lui seul');
  // Fermé : le parcours d'avant, étape pour étape (les mêmes listes que le plan d'avant le 11/11).
  egal(ids(ctx()), 'plateformes › extension › releve › republication › free › fin', 'fermé : le parcours d’avant (Cloud fermé)');
  egal(ids(ctx({ cloud: { parcours: true, actif: false, ouvert: true } })), 'plateformes › voie › extension › releve › republication › free › fin', 'fermé, Cloud seul ouvert : « Comment tu veux publier ? » comme avant');
  egal(ids(ctx({ cloud: { parcours: true, actif: true, ouvert: true }, voie: 'cloud' })), 'plateformes › voie › cloud › cloud_connexion › releve › republication › free › fin', 'fermé, voie Cloud seul : comme avant');
  egal(ids(ctx({ formules: { parcours: false }, cloud: { parcours: true, actif: true, ouvert: true }, voie: 'cloud' })), 'plateformes › voie › cloud › cloud_connexion › releve › republication › free › fin', 'formules.parcours faux : exactement le parcours d’avant');
  egal(FC.vueOffresParDefaut({}), 'sans', 'sans rien : « Sans Cloud »');
  egal(FC.vueOffresParDefaut({ cloudActif: true }), 'avec', 'un compte qui a le Cloud : « Avec Cloud »');
  egal(FC.vueOffresParDefaut({ trigger: 'cloud', choixEntree: 'sans' }), 'avec', 'ouverte par une porte Cloud : « Avec Cloud »');
  egal(FC.vueOffresParDefaut({ demande: 'sans', cloudActif: true }), 'sans', 'la demande de l’hôte prime');

  // ── F. Les abonnés ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nF. Abonnés : sa formule, prorata, jamais deux abonnements, Founder');
  c = parF(FC.cartesFormulesCloud({ palier: 'pro', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: true }));
  ok(!c.premium_cloud && c.pro_cloud.maFormule && c.pro_cloud.cta === 'essai_abonne' && c.pro_cloud.note === 'note_essai' && !c.pro_cloud.pastille, 'Pro (carte) jamais passé par le Cloud : « Essayer le Cloud 7 jours » sur SA formule, la note de l’essai, pas la pastille du nouvel inscrit');
  ok(c.business_cloud.cta === 'passer' && c.business_cloud.note === 'prorata' && !c.business_cloud.essai, 'Pro → Business + Cloud : « Passer à », au prorata, sans essai');
  c = parF(FC.cartesFormulesCloud({ palier: 'pro', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: false }));
  ok(c.pro_cloud.cta === 'ajouter' && c.pro_cloud.note === 'prorata', 'Pro, essai déjà pris : « Ajouter le Cloud », au prorata');
  c = parF(FC.cartesFormulesCloud({ palier: 'business', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: true }));
  ok(Object.keys(c).join() === 'business_cloud' && c.business_cloud.maFormule && c.business_cloud.cta === 'passer' && c.business_cloud.note === 'prorata', '⛔ abonné Business : « Passer à Business + Cloud », payé tout de suite au prorata, jamais d’essai');
  c = parF(FC.cartesFormulesCloud({ palier: 'premium', canalApp: 'stripe', canalAbonnement: 'apple', essaiPermis: true }));
  ok(Object.values(c).every((x) => !x.achetable && x.note === 'boutique' && !x.essai), 'abonné App Store vu sur le web : rien ne s’achète ici, « dans ton abonnement App Store »');
  c = parF(FC.cartesFormulesCloud({ palier: 'premium', canalApp: 'apple', canalAbonnement: 'stripe', essaiPermis: true }));
  ok(Object.values(c).every((x) => !x.achetable && x.note === 'carte_sur_mobile'), 'abonné par carte vu sur iPhone : rien ne s’achète ici (jamais deux abonnements)');
  c = parF(FC.cartesFormulesCloud({ palier: 'premium', canalApp: 'google', canalAbonnement: 'google', essaiPermis: true }));
  ok(c.premium_cloud.cta === 'ajouter' && c.premium_cloud.note === 'boutique' && c.premium_cloud.achetable, 'abonné Google Play sur Android : « Ajouter le Cloud » dans son abonnement Google Play (même abonnement)');
  c = parF(FC.cartesFormulesCloud({ palier: 'pro', formuleActuelle: 'pro_cloud', canalApp: 'stripe', canalAbonnement: 'stripe', essaiPermis: false }));
  ok(c.pro_cloud.actuelle && c.pro_cloud.cta === null && !c.pro_cloud.achetable && c.business_cloud.cta === 'passer', 'Pro + Cloud déjà pris : « Ta formule », plus rien à acheter dessus ; Business + Cloud au-dessus');
  ok(FC.cartesFormulesCloud({ palier: 'premium', canalApp: 'stripe', canalAbonnement: 'stripe', founder: true }).founder, 'Founder : « ton tarif Founder s’arrête » dit avant le geste');
  ok(!FC.cartesFormulesCloud({ palier: 'gratuit', founder: true }).founder, 'un Free n’a pas de tarif Founder à perdre');
  egal(FC.canalAbonnementDuProfil({ is_premium: true, apple_original_transaction_id: 'x' }), 'apple', 'canal de l’abonnement : App Store');
  egal(FC.canalAbonnementDuProfil({ is_premium: false, stripe_customer_id: 'cus' }), null, 'sans palier : aucun abonnement à changer');

  // ── G. Mentions ──────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nG. Les mentions d’une carte (Apple 3.1.2)');
  egal(MA.mentionFormuleCloud({ canal: 'web', lang: 'fr', prix: '49,99 €', essai: true }), "Abonnement à renouvellement automatique : 49,99 € par mois après 7 jours d'essai gratuits pour un premier essai, prélevés sur ta carte, sauf résiliation au moins 24 h avant la fin de la période.", 'mention, essai, web (texte validé)');
  egal(MA.mentionFormuleCloud({ canal: 'ios', lang: 'fr', prix: '49,99 €', essai: true }), "Abonnement à renouvellement automatique : 49,99 € par mois après 7 jours d'essai gratuits pour un premier essai, prélevés sur ton compte Apple, sauf résiliation au moins 24 h avant la fin de la période.", 'mention, essai, iPhone');
  egal(MA.mentionFormuleCloud({ canal: 'android', lang: 'fr', prix: '79,99 €', business: true, essai: true }), 'Abonnement à renouvellement automatique : 79,99 € par mois, payé dès la souscription, prélevés sur ton compte Google Play, sauf résiliation au moins 24 h avant la fin de la période.', '⛔ mention Business + Cloud : payé dès la souscription, jamais d’essai (même si on le lui demande)');
  egal(MA.mentionFormuleCloud({ canal: 'web', lang: 'en', prix: '€34.99' }), 'Auto-renewing subscription: €34.99 a month, charged to your card, unless cancelled at least 24 hours before the end of the period.', 'mention anglaise sans essai');
  INT._remettreAZero({ ...PROD });
  egal(MA.mentionsAbonnement({ canal: 'web', lang: 'fr', cloud: true }).texte, "Abonnements à renouvellement automatique : le prix affiché est prélevé sur ta carte à la confirmation, puis à chaque période, sauf résiliation au moins 24 h avant son terme (Réglages › Abonnement dans FillSell). FillSell Cloud : 7 jours d'essai gratuit pour un premier abonnement, puis 24,99 € par mois.", 'la mention d’avant (Cloud seul) : mot pour mot');

  // ── H. Les textes validés, à l'octet ─────────────────────────────────────────────────────────────────────────────
  console.log('\nH. Les textes validés par Nico, à l’octet');
  const F = TF.textesFormules('fr');
  const attendus = [
    [F.sansCloud, 'Sans Cloud'], [F.avecCloud, 'Avec Cloud'], [F.notreConseil, 'Notre conseil'], [F.pastilleEssai, '7 jours gratuits'],
    [F.supplement('22 €'), 'Le Cloud pour 22 € de plus'], [F.ctaEssai, 'Essayer 7 jours gratuits'], [F.ctaPasser('Business + Cloud'), 'Passer à Business + Cloud'],
    [F.ctaPasser('Pro + Cloud'), 'Passer à Pro + Cloud'],
    [F.lignePrixEssai('49,99 €', '0 €'), "Puis 49,99 €/mois, sans engagement. Carte demandée, 0 € aujourd'hui. On te prévient la veille."],
    [F.lignePrix('79,99 €'), '79,99 €/mois, sans engagement.'],
    [F.ligneCommune, 'Le Cloud publie, remonte et retire tes annonces depuis nos serveurs, sans ordinateur.'],
    [F.taFormuleAvec('Pro', '49,99 €'), 'Ta formule : Pro. Avec Cloud : 49,99 €/mois.'],
    [F.ctaEssaiAbonne, 'Essayer le Cloud 7 jours'], [F.ctaAjouter, 'Ajouter le Cloud'],
    [F.prorata('12 décembre'), "Tu paies la différence au prorata jusqu'à ta prochaine échéance du 12 décembre."],
    [F.boutique('App Store'), 'Le changement se fait dans ton abonnement App Store, sans second abonnement.'],
    [F.boutique('Google Play'), 'Le changement se fait dans ton abonnement Google Play, sans second abonnement.'],
    [F.titre, 'Choisis ta formule'], [F.sousTitreEssai('0 €'), "7 jours gratuits sur Premium ou Pro avec Cloud. Carte demandée, 0 € aujourd'hui."],
    [F.ajouterLigne('Pro', 'Pro + Cloud', '49,99 €'), 'Ajouter le Cloud à ta formule Pro : Pro + Cloud, 49,99 €/mois.'],
    [F.ctaEssayer7, 'Essayer 7 jours'],
    [F.noteEssai('Pro', 'Pro + Cloud', '18 novembre', '3 décembre'), "Pendant 7 jours, tu ne paies que ta formule Pro. Le 18 novembre, elle devient Pro + Cloud ; la différence jusqu'à ta prochaine échéance est ajoutée à ta facture du 3 décembre."],
    [F.taFormule('Pro + Cloud'), 'Ta formule : Pro + Cloud.'], [F.retirer, 'Retirer le Cloud'],
    [F.retirerTexte('Pro', '3 décembre'), "Ta formule redevient Pro le 3 décembre. Le Cloud tourne jusque-là ; rien n'est remboursé pour le mois en cours."],
    [F.retirerBoutique('Apple'), 'Le changement se fait dans tes abonnements Apple.'],
    [F.heritePasser('49,99 €', '34,99 €'), 'Passer à Pro + Cloud (49,99 €/mois) ou Premium + Cloud (34,99 €/mois).'],
    [F.finTitre('demain', '18 novembre', '15:16'), 'Ton essai se termine demain, le 18 novembre à 15:16'],
    [F.finTitre('aujourdhui', '18 novembre', '15:16'), "Ton essai se termine aujourd'hui à 15:16"],
    [F.finTexte('Pro + Cloud', '49,99 €', '18 novembre'), 'Choisis ta formule. Sans choix de ta part, Pro + Cloud continue à 49,99 €/mois à partir du 18 novembre.'],
    [F.finGarder('Pro + Cloud', '49,99 €'), 'Garder Pro + Cloud · 49,99 €/mois'], [F.finPasser('Premium + Cloud', '34,99 €'), 'Passer à Premium + Cloud · 34,99 €/mois'],
    [F.finContenu('Premium + Cloud', '40 annonces, 400 publications, 1 500 remontées', false), 'Premium + Cloud : 40 annonces, 400 publications, 1 500 remontées par mois'],
    [F.finContenu('Pro + Cloud', '120 annonces, 1 200 publications, remontées illimitées', true), 'Pro + Cloud : 120 annonces, 1 200 publications, remontées illimitées, republication automatique'],
    [F.finArreter, 'Arrêter'],
  ];
  const fautesTextes = attendus.filter(([a, b]) => a !== b);
  ok(fautesTextes.length === 0, `${attendus.length} textes de la fenêtre, des Réglages et de la fin d’essai, à l’octet`, fautesTextes.map(([a, b]) => `${a} ≠ ${b}`).join(' | '));
  const E = TE.textesEntree('fr');
  const entree = [
    [E.ordiKicker, "L'étape qui compte"], [E.ordiTitre, 'As-tu un ordinateur ?'],
    [E.ordiTexte, "Tes annonces doivent être déposées sur chaque plateforme, avec ton compte. Ton ordinateur peut s'en charger, ou nos serveurs."],
    [E.ordiOui, "Oui, j'ai un ordinateur"], [E.ordiOuiSous, "Gratuit, avec l'extension FillSell installée une fois sur ton ordinateur."],
    [E.ordiNon, 'Non, seulement mon téléphone'], [E.ordiNonSous, 'FillSell tourne pour toi sur nos serveurs.'], [E.ordiPied, 'Tu pourras changer plus tard, dans Réglages.'],
    [E.presKicker, 'FillSell Cloud'], [E.presTitre, 'FillSell tourne pour toi, même sans ordinateur'],
    [E.presTexte('Vinted, Leboncoin, Beebs et Depop'), 'Depuis nos serveurs, FillSell Cloud publie, remonte et retire tes annonces Vinted, Leboncoin, Beebs et Depop, 24 h/24. Tu pilotes tout depuis ton téléphone.'],
    [JSON.stringify(E.presListe), JSON.stringify(['Rien à installer', 'Tes ventes repérées automatiquement', 'Retrait partout après une vente'])],
    [E.presCta, 'Voir les formules avec Cloud'], [E.presOrdinateur, "Finalement, j'ai un ordinateur"],
    [net(E.formKicker('Pro + Cloud')), 'Pro + Cloud · 7 jours gratuits'], [net(E.formCta), 'Commencer mes 7 jours gratuits'],
    [E.formFrise('Lundi 17 novembre', 'Mardi 18 novembre', 'Pro + Cloud', '49,99 €', '0 €').map((x) => `${x.quand} : ${x.quoi}`).join(' / '),
      "Aujourd'hui : Carte demandée, 0 € prélevé. / Lundi 17 novembre : On te prévient dans l'app et par e-mail, et tu choisis ta formule. / Mardi 18 novembre : Sans choix de ta part, Pro + Cloud continue à 49,99 €/mois. Sans engagement."],
  ];
  const fautesEntree = entree.filter(([a, b]) => a !== b);
  ok(fautesEntree.length === 0, `${entree.length} textes du parcours (avec les 3 corrections de Nico), à l’octet`, fautesEntree.map(([a, b]) => `${a} ≠ ${b}`).join(' | '));
  ok(!/Chrome/.test(E.ordiOuiSous) && !E.presListe.some((x) => /eBay/.test(x)), 'corrections : jamais « Chrome » en dur, la puce eBay retirée');
  const neufs = ['src/cloud/textesFormules.js', 'src/cloud/formulesCloud.js', 'src/cloud/OffresAvecCloud.jsx', 'src/cloud/BlocFormulesReglages.jsx', 'src/cloud/FinEssaiFormule.jsx', 'src/cloud/achatFormuleCloud.js', 'src/entree/EtapesFormules.jsx', 'src/entree/useFormulesEntree.js']
    .map((p) => [p, fs.readFileSync(join(ROOT, p), 'utf8')]);
  const interdits = /formule de ton choix|n'importe quelle formule|n’importe quelle formule|[ée]conomi|− ?[35] ?€|Pépite|pépite/;
  ok(neufs.every(([, s]) => !interdits.test(s)), 'aucun « formule de ton choix », « économie », « − 3 € », ni « Pépites » dans les fichiers neufs', neufs.filter(([, s]) => interdits.test(s)).map(([p]) => p).join(', '));
  const enDur = /\b(34|49|79)[,.]99\b/;
  ok(neufs.every(([, s]) => !enDur.test(s)), 'aucun prix des formules écrit en dur dans les écrans (prix du canal)', neufs.filter(([, s]) => enDur.test(s)).map(([p]) => p).join(', '));

  // ── I. L'achat ───────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nI. L’achat : la réponse du serveur, l’essai refusé, Business');
  egal(ACH.lireReponseFormule({ url: 'https://checkout.stripe.com/x' }, 'pro_cloud', 'fr').etat, 'refuse', '⛔ réponse sans `formule` (serveur d’avant, qui retomberait sur Premium) : rien ne s’ouvre');
  egal(ACH.lireReponseFormule({ url: 'https://checkout.stripe.com/x', formule: 'premium_cloud' }, 'pro_cloud', 'fr').etat, 'refuse', 'réponse pour une AUTRE formule : rien ne s’ouvre');
  egal(ACH.lireReponseFormule({ url: 'https://checkout.stripe.com/x', formule: 'pro_cloud' }, 'pro_cloud', 'fr').etat, 'redirige', 'réponse qui porte la formule : la page de paiement s’ouvre');
  egal(ACH.lireReponseFormule({ upgraded: true, formule: 'pro_cloud' }, 'pro_cloud', 'fr').etat, 'change', 'abonné Stripe : changement sur le même abonnement');
  egal(ACH.lireReponseFormule({ error: 'abonnement_autre_canal', canal: 'apple' }, 'pro_cloud', 'fr').message, 'Le changement se fait dans ton abonnement App Store, sans second abonnement.', 'abonné App Store sur le web : le serveur refuse, l’écran le dit');
  egal(ACH.modeRemplacement('app.fillsell.premium.standard', 'premium_cloud'), 2, 'Android Premium → Premium + Cloud : montée, prorata');
  egal(ACH.modeRemplacement('app.fillsell.pro.cloud', 'premium_cloud'), 6, 'Android Pro + Cloud → Premium + Cloud : descente au renouvellement');
  egal(ACH.produitBoutiqueDe('business_cloud', 'android'), 'app.fillsell.business.cloud', 'le produit Google de Business + Cloud vient du contrat');
  const appels = [];
  const essaiAchat = async ({ formule, essaiAffiche, preparation, reponse, confirmer = true, descente = false }) => {
    appels.length = 0;
    const loc = { href: 'avant' };
    globalThis.window = { location: loc };
    globalThis.fetch = async (url, init) => { appels.push({ url, corps: JSON.parse(init.body) }); return { json: async () => reponse }; };
    const supa = {
      auth: { getSession: async () => ({ data: { session: { access_token: 'jeton' } } }), refreshSession: async () => ({ data: { session: null } }) },
      rpc: async (nom) => { appels.push({ rpc: nom }); return { data: preparation, error: null }; },
    };
    const confirmations = [];
    const a = ACH.creerAchatFormuleCloud({
      supabase: supa, supabaseUrl: 'https://x', supabaseAnonKey: 'k', user: { id: 'u1', email: 'demo@fillsell.app' }, lang: 'fr', platform: 'web',
      purchasePremium: async () => ({}), confirmer: async (m) => { confirmations.push(m); return confirmer; }, notifier: () => {}, demanderConditions: async () => true,
    });
    const r = await a.acheter(formule, { origine: 'test', essaiAffiche, descente });
    return { r, confirmations, loc, appels: [...appels] };
  };
  let x = await essaiAchat({ formule: 'pro_cloud', essaiAffiche: true, preparation: { ok: true, essai: true }, reponse: { url: 'https://checkout.stripe.com/s', formule: 'pro_cloud' } });
  const corps = x.appels.find((y) => y.corps)?.corps;
  ok(x.r.etat === 'redirige' && x.loc.href === 'https://checkout.stripe.com/s' && corps?.product === 'pro_cloud' && corps?.email === 'demo@fillsell.app' && corps?.lang === 'fr', 'web : create-checkout-session { product: \'pro_cloud\', email, lang }, puis la page de Stripe', JSON.stringify(x));
  ok(x.appels[0]?.rpc === 'cloud_essai_preparer_moi', 'la préparation (place + verrous de l’essai) AVANT toute carte');
  x = await essaiAchat({ formule: 'pro_cloud', essaiAffiche: true, preparation: { ok: true, essai: false, raison: 'appareil_deja_vu' }, reponse: { url: 'u', formule: 'pro_cloud' }, confirmer: false });
  ok(x.r.etat === 'annule' && x.confirmations.length === 1 && !x.appels.some((y) => y.corps), 'essai annoncé mais refusé par un verrou : la personne confirme, sinon rien ne part');
  x = await essaiAchat({ formule: 'business_cloud', essaiAffiche: false, preparation: { ok: true, essai: false }, reponse: { url: 'https://checkout.stripe.com/b', formule: 'business_cloud' } });
  ok(x.r.etat === 'redirige' && x.confirmations.length === 0, '⛔ Business + Cloud : aucune confirmation d’essai (il n’y en a pas), payé dès la souscription');
  x = await essaiAchat({ formule: 'pro_cloud', essaiAffiche: true, preparation: { ok: true, essai: true }, reponse: { url: 'https://checkout.stripe.com/s' } });
  ok(x.r.etat === 'refuse' && x.loc.href === 'avant', '⛔ serveur qui ne connaît pas les formules : AUCUNE redirection', JSON.stringify(x.r));
  x = await essaiAchat({ formule: 'premium_cloud', descente: true, preparation: { ok: false }, reponse: { change: true, formule: 'premium_cloud' } });
  ok(x.r.etat === 'change' && !x.appels.some((y) => y.rpc), 'fin d’essai, passer à Premium + Cloud : ni conditions ni préparation, le serveur change le prix');
  delete globalThis.window; delete globalThis.fetch;

  // ── J. Les écrans rendus ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nJ. Les écrans rendus');
  INT._remettreAZero({ ...PROD });
  const DROITS = { free: PAL.droitsDuPalier('gratuit'), pro: PAL.droitsDuPalier('pro') };
  const modale = (o) => renderToStaticMarkup(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, onCloudSeul() {}, onAjouterCloud() {}, onFormuleCloud() {}, lang: 'fr', userId: 'u-temoin', ...DROITS.free, ...o }));
  memoire.clear();
  let html = modale({});
  ok(/data-formules-bascule/.test(html) && /aria-pressed="true" data-formules-vue="sans"/.test(html), 'témoin, Free : l’interrupteur, sur « Sans Cloud »');
  ok(!/data-cloud="offre"/.test(html) && /Passer Premium/.test(html), '« Sans Cloud » : les cartes d’avant, sans la carte du Cloud seul');
  ok(!/7 jours gratuits|Essayer/.test(texte(html)), 'cas 1 : « Sans Cloud », aucun essai sur les paliers');
  html = modale({ vueCloud: 'avec' });
  const t = texte(html);
  ok(/aria-pressed="true" data-formules-vue="avec"/.test(html) && (html.match(/data-formule-cloud=/g) ?? []).length === 3, '« Avec Cloud » : trois cartes');
  ok(t.includes('Le Cloud pour 22 € de plus') && (t.match(/Le Cloud pour 20 € de plus/g) ?? []).length === 2, '« Le Cloud pour 22 € de plus » (Premium), « 20 € » (Pro, Business)');
  ok(/data-formule-conseil[^>]*>Notre conseil</.test(html) && /data-formule-cloud="pro_cloud"[^>]*>(?:(?!data-formule-cloud=)[\s\S])*Notre conseil/.test(html), '« Notre conseil » sur Pro + Cloud');
  ok(t.includes('Le Cloud publie, remonte et retire tes annonces depuis nos serveurs, sans ordinateur.'), 'la ligne commune');
  html = modale({ vueCloud: 'avec', ...DROITS.pro });
  ok((html.match(/data-formule-cloud=/g) ?? []).length === 2 && !/data-formule-cloud="premium_cloud"/.test(html), 'un Pro : Pro + Cloud et Business + Cloud, jamais une formule en dessous');
  INT._remettreAZero({ ...PROD });
  html = renderToStaticMarkup(h(CM.default, { isOpen: true, onClose() {}, onUpgrade() {}, onFormuleCloud() {}, lang: 'fr', userId: 'u-ordinaire', vueCloud: 'avec', ...DROITS.free }));
  ok(!/data-formules/.test(html) && /Passer Premium/.test(html), 'compte ordinaire, tout fermé, même « avec » demandé : la feuille d’avant');
  // La carte Business + Cloud rendue, essai permis partout ailleurs : ni pastille, ni « Essayer », ni « 0 € aujourd'hui ».
  const modele = FC.cartesFormulesCloud({ palier: 'gratuit', canalApp: 'stripe', essaiPermis: true });
  html = renderToStaticMarkup(h(OAC.default, { modele, lang: 'fr', onChoisir() {} }));
  const carteB = html.match(/<section data-formule-cloud="business_cloud"[\s\S]*?<\/section>/)?.[0] ?? '';
  const tB = texte(carteB);
  ok(carteB && !/data-formule-pastille/.test(carteB) && !/Essayer|jours gratuits|0 € aujourd'hui|essai/i.test(tB) && tB.includes('Passer à Business + Cloud') && tB.includes('79,99 €/mois, sans engagement.') && tB.includes('payé dès la souscription'), '⛔ carte Business + Cloud RENDUE : « Passer à Business + Cloud », « 79,99 €/mois, sans engagement. », aucun texte d’essai', tB);
  const carteP = texte(html.match(/<section data-formule-cloud="pro_cloud"[\s\S]*?<\/section>/)?.[0] ?? '');
  ok(carteP.includes('7 jours gratuits') && carteP.includes('Essayer 7 jours gratuits') && carteP.includes("Puis 49,99 €/mois, sans engagement. Carte demandée, 0 € aujourd'hui. On te prévient la veille."), 'carte Pro + Cloud rendue, essai permis : pastille, « Essayer 7 jours gratuits », la ligne de prix validée', carteP);
  const html0 = renderToStaticMarkup(h(OAC.default, { modele: FC.cartesFormulesCloud({ palier: 'gratuit', essaiPermis: false }), lang: 'fr', onChoisir() {} }));
  ok(!/data-formule-pastille|Essayer/.test(html0) && texte(html0).includes('Passer à Pro + Cloud'), 'essai non permis : « Passer à Pro + Cloud », aucune pastille');
  // La fin d'essai (rappel avant débit).
  const fin = new Date(Date.now() + 86_400_000).toISOString();
  html = renderToStaticMarkup(h(FEF.default, { lang: 'fr', cloud: { etat: 'essai', essaiFin: fin }, formule: 'pro_cloud', quand: 'demain', canal: 'stripe', actions: { formule() {}, arreter() {} }, onFermer() {} }));
  const tf = texte(html);
  ok(tf.includes('Ton essai se termine demain, le') && tf.includes('Sans choix de ta part, Pro + Cloud continue à 49,99 €/mois à partir du') && tf.includes('Garder Pro + Cloud · 49,99 €/mois') && tf.includes('Passer à Premium + Cloud · 34,99 €/mois') && tf.includes('Arrêter'), 'rappel avant débit (la veille) : titre, texte, garder, passer, arrêter', tf.slice(0, 500));
  ok(tf.includes('Premium + Cloud : 40 annonces, 400 publications, 1 500 remontées par mois') && tf.includes('Pro + Cloud : 120 annonces, 1 200 publications, remontées illimitées, republication automatique'), 'ce que comprend chaque formule (repli de coin_config, jamais en dur)');
  // Les conditions : l'article 6 d'avant tant que la version n'a pas changé ; l'article des formules prêt.
  ok(CC.conditionsCloud('fr').articles[5].ps[0].includes('24,99 € TTC par mois') && CC.CHANGEMENT_FORMULES === 'formules_cloud_article_6', 'conditions : l’article 6 d’avant, mot pour mot, tant que la version des formules n’est pas posée');
  const a6 = CC.article6Formules('fr');
  ok(a6.ps[0].includes('Premium + Cloud 34,99 €, Pro + Cloud 49,99 €, Business + Cloud 79,99 € TTC par mois') && a6.ps[1].includes('Business + Cloud est payé dès la souscription'), 'article 6 des formules : les prix du canal, Business payé dès la souscription');
} finally {
  await vite.close();
}
console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
