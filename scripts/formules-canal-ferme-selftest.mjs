// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 4c (12/11/2026, lot « zéro problème », étape 1) — L'OFFRE SUIT LE CANAL QUI FACTURE, PAS L'APPAREIL
//     npm run selftest:formules-canal-ferme
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : les formules avec Cloud sont ouvertes sur le web (Stripe) et Android, FERMÉES chez Apple (en attente de
// validation). Un abonné App Store (16 en prod) voyait sur le web « Pro + Cloud, 49,99 €/mois », sans bouton, et « le
// changement se fait dans ton abonnement App Store » — où l'offre n'existe pas ; un client du Cloud seul App Store voyait
// « Passer à … », des boutons, les conditions, puis un refus 409 du serveur et un renvoi vers l'iPhone où rien n'existe.
// Règle (texte de Nico) : « Ton abonnement passe par l'App Store. Les formules avec Cloud y arrivent bientôt : Apple est
// en train de les valider… Rien n'a changé, rien n'a été débité. » — plus aucun bouton qui mène à un refus.
// Ce test prouve, sans réseau ni base (Vite SSR + react-dom/server) :
//   A. la règle pure voieFormulesDuCompte (ici / carte sur mobile / boutique / boutique bientôt) et canalDuCloudSeul ;
//   B. cartesFormulesCloud : abonné App Store sur le web, Apple fermé → aucune carte achetable, note « boutique_bientot » ;
//      Apple ouvert → note « boutique » ; client du Cloud seul App Store (Free) → aucune carte achetable ; client du Cloud
//      seul payé par carte vu sur iPhone → « carte_sur_mobile » (jamais un second abonnement) ; rien ne change pour un
//      compte sans abonnement ni pour un abonné vu sur SON canal ;
//   C. les écrans rendus : Réglages › Abonnement (abonné App Store, client du Cloud seul App Store) et la fenêtre d'offres
//      disent le texte de Nico, sans aucun bouton d'achat ni « Voir les formules avec Cloud » ;
//   D. le serveur dit la même chose : messageVoieFormule « bientôt » quand le canal qui facture est fermé ;
//      create-checkout-session lit l'interrupteur du canal qui facture avant de répondre.
// (13/11, décision de Nico — « Apple a validé : on ouvre partout ; retire partout les textes "les formules avec Cloud y
// arrivent bientôt…" et ce qui allait avec, y compris pour les abonnés App Store sur le web ») La RÈGLE du 4c reste (le
// canal qui facture, jamais l'appareil ; aucun bouton qui mène à un refus), mais un canal qui facture FERMÉ (retour arrière
// seulement) MASQUE désormais les formules à ce compte (voie « boutique_fermee » : aucune carte, rien dans Réglages, la
// phrase neutre du serveur) au lieu de dire « bientôt » ; le client du Cloud seul d'une boutique ne voit plus de formules
// (voie « cloud_seul_boutique » : un second abonnement). Les assertions « texte de Nico » sont remplacées en conséquence ;
// le verrou de l'ouverture est scripts/formules-ouverture-partout-selftest.mjs.
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
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').trim();
const BIENTOT_APPLE = "Ton abonnement passe par l'App Store. Les formules avec Cloud y arrivent bientôt : Apple est en train de les valider. Dès qu'elles seront dans l'app FillSell sur ton iPhone, tu pourras y ajouter le Cloud, sans second abonnement. Rien n'a changé, rien n'a été débité.";

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
  const OAC = await vite.ssrLoadModule('/src/cloud/OffresAvecCloud.jsx');
  const FS = await vite.ssrLoadModule('/supabase/functions/_shared/formules-serveur.js');
  await CO.noterBinaireCloud('web', 'web');
  PB.poserPrixBoutique(null);
  // La prod du 12/11 au soir : web et Android ouverts, Apple FERMÉ.
  INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_google: 1 });
  const T = TF.textesFormules('fr');

  // ── A. La règle pure ──────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nA. voieFormulesDuCompte / canalDuCloudSeul');
  ok(typeof FC.voieFormulesDuCompte === 'function', 'la règle voieFormulesDuCompte existe');
  if (typeof FC.voieFormulesDuCompte === 'function') {
    const v = (canalApp, canalFacture) => FC.voieFormulesDuCompte({ canalApp, canalFacture, canalOuvert: CO.formulesCloudOuvertes });
    // (13/11, décision de Nico) « boutique_bientot » → « boutique_fermee » : formules masquées, plus aucune promesse.
    ok(v('stripe', 'apple') === 'boutique_fermee', 'web, facturé par l’App Store, Apple fermé → « boutique_fermee » (formules masquées)');
    ok(v('stripe', 'google') === 'boutique', 'web, facturé par Google Play, Google ouvert → « boutique »');
    ok(v('apple', 'stripe') === 'carte_sur_mobile' && v('google', 'stripe') === 'carte_sur_mobile', 'payé par carte, vu sur mobile → « carte_sur_mobile »');
    ok(v('stripe', 'stripe') === 'ici' && v('apple', 'apple') === 'ici' && v('stripe', null) === 'ici', 'son canal, ou aucun abonnement → « ici » (rien ne change)');
    ok(FC.voieFormulesDuCompte({ canalApp: 'stripe', canalFacture: 'apple' }) === 'boutique', 'sans interrupteur passé : l’appel d’avant ne change pas');
  }
  ok(typeof FC.canalDuCloudSeul === 'function'
    && FC.canalDuCloudSeul({ cloud: { etat: 'essai' }, profil: { cloud_canal: 'apple' } }) === 'apple'
    && FC.canalDuCloudSeul({ cloud: { etat: 'paye' }, profil: { cloud_canal: 'stripe' } }) === 'stripe'
    && FC.canalDuCloudSeul({ cloud: { etat: 'essai_termine' }, profil: { cloud_canal: 'apple' } }) === null
    && FC.canalDuCloudSeul({ cloud: { etat: 'aucun' }, profil: { cloud_canal: 'apple' } }) === null,
  'canalDuCloudSeul : le canal du Cloud seul tant qu’il est vivant (essai, payé), sinon rien');

  // ── B. Les cartes ─────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nB. cartesFormulesCloud suit le canal qui facture');
  const base = { canalApp: 'stripe', essaiPermis: false, canalOuvert: CO.formulesCloudOuvertes };
  const aboApple = FC.cartesFormulesCloud({ ...base, palier: 'pro', canalAbonnement: 'apple' });
  // (13/11, décision de Nico) Apple fermé (retour arrière) : plus de carte « bientôt » — aucune carte du tout.
  ok(aboApple.cartes.every((c) => !c.achetable), 'abonné App Store sur le web : aucune carte achetable', JSON.stringify(aboApple.cartes.map((c) => [c.formule, c.achetable])));
  ok(aboApple.cartes.length === 0 && aboApple.voie === 'boutique_fermee', 'abonné App Store, Apple fermé : formules masquées (13/11 : plus jamais « bientôt »)', JSON.stringify(aboApple));
  const aboAppleOuvert = FC.cartesFormulesCloud({ ...base, palier: 'pro', canalAbonnement: 'apple', canalOuvert: () => true });
  ok(aboAppleOuvert.cartes.length > 0 && aboAppleOuvert.cartes.every((c) => !c.achetable && (c.actuelle || c.note === 'boutique')), 'abonné App Store, Apple OUVERT : « boutique » (le changement dans l’app iPhone), toujours sans achat ici');
  ok(aboAppleOuvert.cartes.every((c) => c.actuelle || c.canalFacture === 'apple'), 'la carte sait quelle boutique facture (pour la nommer)');
  const cloudSeulApple = FC.cartesFormulesCloud({ ...base, palier: 'gratuit', canalAbonnement: null, canalCloud: 'apple' });
  // (13/11) Cloud seul App Store : une formule serait un second abonnement Apple (deux groupes) → masquées, sur tout appareil.
  ok(cloudSeulApple.cartes.length === 0 && cloudSeulApple.voie === 'cloud_seul_boutique', 'client du Cloud seul App Store (Free) sur le web : aucun bouton (avant : « Passer à … » puis refus 409) — formules masquées', JSON.stringify(cloudSeulApple));
  const cloudSeulStripeIphone = FC.cartesFormulesCloud({ ...base, canalApp: 'apple', palier: 'gratuit', canalCloud: 'stripe' });
  ok(cloudSeulStripeIphone.cartes.every((c) => !c.achetable && c.note === 'carte_sur_mobile'), 'client du Cloud seul payé par carte, vu sur iPhone : jamais un second abonnement chez Apple');
  const libre = FC.cartesFormulesCloud({ ...base, palier: 'gratuit', essaiPermis: true });
  ok(libre.cartes.some((c) => c.achetable) && libre.cartes.every((c) => c.note == null), 'compte sans abonnement : rien ne change (cartes achetables, aucune note)');
  const aboStripe = FC.cartesFormulesCloud({ ...base, palier: 'pro', canalAbonnement: 'stripe' });
  ok(aboStripe.cartes.some((c) => c.achetable && c.note === 'prorata'), 'abonné par carte sur le web : rien ne change (achetable, prorata)');
  const n = FC.texteNoteCarte(aboAppleOuvert.cartes.find((c) => !c.actuelle), { T, canalApp: 'stripe', nom: 'Pro + Cloud', prix: '49,99 €' });
  // (13/11, décision de Nico) Le texte « bientôt » est retiré ; Apple ouvert, la note dit où se fait le changement.
  ok(n === 'Le changement se fait dans ton abonnement App Store, sans second abonnement.' && !n.includes(BIENTOT_APPLE.slice(0, 40)), 'le texte de la note (Apple ouvert) : « … dans ton abonnement App Store », jamais « bientôt »', n);

  // ── C. Les écrans rendus ──────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nC. Réglages › Abonnement et la fenêtre d’offres, rendus');
  const c = (p) => ({ user: { id: 'u-ordinaire' }, lang: 'fr', plateforme: 'web', natif: false, isPremium: true, isPro: true, isBusiness: false, ...p });
  const actions = { formule: () => {}, voirFormulesCloud: () => {}, arreter: async () => ({ ok: true }) };
  const rendu = (props) => renderToStaticMarkup(h(BFR.default, props));
  // Abonné Pro App Store, sans Cloud, sur le web : on bascule la vue « Avec Cloud » en préférence de rendu.
  const profilApple = { etat: 'ok', formuleActuelle: null, canalAbonnement: 'apple', founder: false, echeance: '2026-12-01T10:00:00Z' };
  const lectureSans = { etat: 'ok', cloud: { etat: 'aucun', essaiPris: false }, profil: { cloud_canal: null } };
  // (13/11, décision de Nico) Apple fermé (retour arrière) : le bloc ne rend RIEN (la page d'avant), plus « bientôt ».
  const htmlAbo = rendu({ c: c(), visible: true, lecture: lectureSans, profil: profilApple, actions });
  ok(htmlAbo === '', 'abonné App Store, Apple fermé : rien de rendu (13/11 : plus le bloc « bientôt »)', htmlAbo.slice(0, 200));
  ok(!/<button[^>]*>\s*(Ajouter le Cloud|Essayer 7 jours|Passer à)/.test(htmlAbo), 'abonné App Store : aucun bouton d’achat');
  // Apple ouvert : le bloc et sa note « dans ton abonnement App Store », sans bouton d'achat.
  INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_google: 1, cloud_formules_apple: 1 });
  const htmlAboOuvert = rendu({ c: c(), visible: true, lecture: lectureSans, profil: profilApple, actions });
  ok(/data-formules-reglages="ajout"/.test(htmlAboOuvert) && !/<button[^>]*>\s*(Ajouter le Cloud|Essayer 7 jours|Passer à)/.test(htmlAboOuvert), 'abonné App Store, Apple ouvert : le bloc « FillSell Cloud », aucun bouton d’achat sur le web');
  const modeleAbo = FC.cartesFormulesCloud({ ...base, palier: 'pro', canalAbonnement: 'apple' });
  const sienne = modeleAbo.cartes.find((x) => x.formule === 'pro_cloud');
  ok(sienne && !sienne.achetable && FC.texteNoteCarte(sienne, { T, canalApp: 'stripe', nom: 'Pro + Cloud', prix: '49,99 €' }) === 'Le changement se fait dans ton abonnement App Store, sans second abonnement.', 'Réglages (abonné App Store, « Avec Cloud ») : la note dit où, aucun bouton');
  INT._remettreAZero({ cloud_offre_ouverte: 1, grille_trois_jauges: 1, cloud_formules_stripe: 1, cloud_formules_google: 1 });
  // Client du Cloud seul App Store (Free) sur le web.
  const lectureCloudApple = { etat: 'ok', cloud: { etat: 'essai', essaiPris: true, essaiFin: '2026-11-19T18:18:00Z' }, profil: { cloud_canal: 'apple' } };
  const profilFree = { etat: 'ok', formuleActuelle: null, canalAbonnement: null, founder: false, echeance: null };
  const htmlCloud = rendu({ c: c({ isPremium: false, isPro: false }), visible: true, lecture: lectureCloudApple, profil: profilFree, actions });
  // (13/11) Plus de bloc « autre canal » ni de texte « bientôt » : rien (une formule serait un second abonnement Apple).
  ok(htmlCloud === '', 'client du Cloud seul App Store : rien de rendu (13/11 : plus « bientôt », jamais un second abonnement)', htmlCloud.slice(0, 300));
  ok(!/Voir les formules avec Cloud/.test(htmlCloud) && !/<button/.test(htmlCloud), 'client du Cloud seul App Store : ni « Voir les formules avec Cloud » ni aucun bouton (avant : bouton → conditions → refus 409)');
  ok(!texte(htmlCloud).includes('bientôt'), 'client du Cloud seul App Store : plus aucun « bientôt »', texte(htmlCloud));
  // Témoin : client du Cloud seul payé par carte, sur le web → rien ne change (la ligne et « Voir les formules »).
  const htmlCloudStripe = rendu({ c: c({ isPremium: false, isPro: false }), visible: true, lecture: { ...lectureCloudApple, profil: { cloud_canal: 'stripe' } }, profil: profilFree, actions });
  ok(/data-formules-reglages="herite"/.test(htmlCloudStripe) && /Voir les formules avec Cloud/.test(htmlCloudStripe), 'témoin : client du Cloud seul payé par carte, sur le web → la ligne et le bouton d’avant');
  // La fenêtre d'offres : une carte « boutique » (Apple ouvert) rendue sans bouton.
  const carte = modeleAbo.cartes.find((x) => x.formule === 'pro_cloud');
  const htmlCarte = renderToStaticMarkup(h(OAC.CarteFormuleCloud, { carte, lang: 'fr', palierIci: 'pro', canalApp: 'stripe', canalAbonnement: 'apple', onChoisir: () => {} }));
  ok(!/data-formule-cta/.test(htmlCarte) && /data-formule-note="boutique"/.test(htmlCarte), 'fenêtre d’offres : la carte d’un abonné App Store n’a pas de bouton');
  ok(!texte(htmlCarte).includes('bientôt'), 'fenêtre d’offres : plus aucun « bientôt »');

  // ── D. Le serveur ─────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nD. Le serveur dit la même chose');
  // (13/11, décision de Nico) Canal fermé : la phrase neutre (« … pas disponible pour le moment »), plus « bientôt ».
  const NEUTRE = "Cette formule n'est pas disponible pour le moment. Rien n'a été débité.";
  ok(FS.messageVoieFormule({ motif: 'abonnement_boutique', canal: 'apple', ferme: true }, 'fr') === NEUTRE, 'messageVoieFormule : canal fermé → la phrase neutre (13/11)');
  ok(FS.messageVoieFormule({ motif: 'cloud_boutique', canal: 'apple', ferme: true }, 'fr') === NEUTRE, 'messageVoieFormule : Cloud seul App Store → la phrase neutre (13/11)');
  ok(/change de formule dans l'app FillSell sur ton iPhone/.test(FS.messageVoieFormule({ motif: 'abonnement_boutique', canal: 'apple' }, 'fr')), 'messageVoieFormule : canal ouvert → le message d’avant (dans l’app iPhone)');
  ok(!/Apple is reviewing them/.test(FS.messageVoieFormule({ motif: 'abonnement_boutique', canal: 'apple', ferme: true }, 'en')), 'messageVoieFormule : l’anglais aussi (plus « Apple is reviewing them »)');
  const ccs = fs.readFileSync(join(ROOT, 'supabase/functions/create-checkout-session/index.ts'), 'utf8').replace(/\r\n/g, '\n');
  ok(/const r = canalR \? \{ \.\.\.r0, ferme: !\(await interrupteurFormules\(supabase, canalR, profil\)\) \} : r0;/.test(ccs), 'create-checkout-session : lit l’interrupteur du canal qui facture avant de répondre');
  const ach = fs.readFileSync(join(ROOT, 'src/cloud/achatFormuleCloud.js'), 'utf8').replace(/\r\n/g, '\n');
  ok(/if \(d\?\.error === 'abonnement_autre_canal'\) return \{ etat: 'refuse', message: message \?\? T\.boutique/.test(ach), 'l’app affiche le message du serveur (« bientôt ») plutôt que le sien');
} finally {
  await vite.close();
}
console.log(`\n${rouges === 0 ? '✓' : '✗'} formules-canal-ferme : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
