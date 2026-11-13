// ═══════════════════════════════════════════════════════════════════════════
// VERROU « RIEN NE CHANGE QUAND TOUT EST FERMÉ » — formules avec Cloud (11/11/2026, décisions de Nico)
//     npm run selftest:formules-cloud-ferme
//     node scripts/formules-cloud-ferme-selftest.mjs --capturer   (réécrit l'empreinte : SEULEMENT sur le code d'avant)
// ═══════════════════════════════════════════════════════════════════════════
// Les formules avec Cloud (Premium + Cloud, Pro + Cloud, Business + Cloud) se montrent derrière les interrupteurs
// serveur coin_config.cloud_formules_stripe / _apple / _google (absent, illisible ou ≠ 1 = FERMÉ) et les témoins
// (profiles.beta_flags.cloud). Canal fermé, compte ordinaire : l'app doit être EXACTEMENT celle d'avant.
// Ce verrou rend côté serveur (Vite SSR + react-dom/server, sans réseau) la feuille des offres (ConversionModal) et
// Réglages › Abonnement (SousPageAbonnement) dans 224 états (palier × déclencheur × langue × grille × Cloud ouvert ou
// non × plateforme), et compare l'empreinte SHA-256 de chaque rendu à celle relevée sur le code d'AVANT les formules
// (1f91bc3, relevée le 11/11/2026 vers 23:00, heure de Paris) : un octet de différence = rouge.
// Il vérifie aussi que, fermé, les règles pures neuves ne proposent rien (formules invisibles, aucune carte, aucun
// produit de boutique demandé, mentions mot pour mot, parcours d'entrée identique).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'scripts/fixtures/formules-cloud-ferme-1111.json');
const CAPTURER = process.argv.includes('--capturer');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const empreinte = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 24);

globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const rendus = {};
const purs = [];   // [condition, message, détail] — les règles pures, fermé
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const SPA = await vite.ssrLoadModule('/src/reglages/SousPageAbonnement.jsx');
  const RT = await vite.ssrLoadModule('/src/reglages/textes.js');
  const INT = await vite.ssrLoadModule('/src/config/interrupteurs.js');
  const CO = await vite.ssrLoadModule('/src/config/cloudOffer.js');
  const PAL = await vite.ssrLoadModule('/src/utils/palier.js');

  // Le binaire du web, comme App.jsx le note au démarrage.
  await CO.noterBinaireCloud('web', 'web');
  const DROITS = { free: PAL.droitsDuPalier('gratuit'), premium: PAL.droitsDuPalier('premium'), pro: PAL.droitsDuPalier('pro'), business: PAL.droitsDuPalier('business') };
  // Les interrupteurs tels qu'en prod le 11/11 (Cloud ouvert, grille ouverte, formules FERMÉES), et tout fermé.
  const ETATS_SERVEUR = {
    tout_ferme: {},
    prod_1111: { cloud_offre_ouverte: 1, grille_trois_jauges: 1, sync_multi_ouverte: 1, descente_formule_ouverte: 1 },
  };
  for (const [nomEtat, valeurs] of Object.entries(ETATS_SERVEUR)) {
    INT._remettreAZero({ ...valeurs });
    for (const palier of ['free', 'premium', 'pro', 'business']) {
      for (const trigger of ['generic', 'cloud', 'republish_auto', 'quota_geste']) {
        for (const lang of ['fr', 'en']) {
          for (const grille of [false, true]) {
            const html = renderToStaticMarkup(h(CM.default, {
              isOpen: true, onClose() {}, onUpgrade() {}, onCloudSeul() {}, onAjouterCloud() {}, onFormuleCloud() {}, lang, userId: 'u-ordinaire-0001',
              trigger, grille, ...DROITS[palier], ...(trigger === 'quota_geste' ? { quotaInfo: { geste: 'annonces', plafond: 40 } } : {}),
            }));
            // (13/11, décision de Nico — « date du premier prélèvement, AVANT de valider ») La note de MONTÉE (CAS 4 / CAS 5 :
            // ce qui est prélevé aujourd'hui, par canal) est ajoutée pour TOUS, formules ouvertes ou non : elle est retirée du rendu
            // avant l'empreinte (verrou selftest:textes-paiement-verite) ; tout le reste reste comparé à l'octet au code d'avant.
            rendus[`modale/${nomEtat}/${palier}/${trigger}/${lang}/${grille ? 'grille' : 'sans'}`] = empreinte(html.replace(/<p data-note-montee="[a-z]+"[^>]*>[^<]*<\/p>/g, ''));
          }
        }
      }
      for (const plateforme of ['web', 'ios', 'android']) {
        for (const lang of ['fr', 'en']) {
          for (const etape of [0, 1]) {
            const T = RT.txt(lang);
            const c = {
              user: { id: 'u-ordinaire-0001', email: 'demo@fillsell.app' }, lang, ...DROITS[palier], natif: plateforme !== 'web', plateforme,
              quotas: null, ouvrirOffres() {}, resiliation: { resilie: false, etape, setEtape() {}, lancer() {}, enCours: false },
              restauration: { enCours: false, lancer() {} }, actionsCloud: {},
            };
            // (13/11, audit des paiements de Nico) Le lien Google de la bande suit le PRODUIT du compte (google_product_id) ; pas
            // encore lu (rendu serveur) : la liste des abonnements Google Play — ramené ici au lien d'avant (produit Founder pour
            // tous) pour comparer tout le reste à l'octet.
            rendus[`abonnement/${nomEtat}/${palier}/${plateforme}/${lang}/${etape}`] = empreinte(renderToStaticMarkup(h(SPA.default, { c, T }))
              .split('href="https://play.google.com/store/account/subscriptions"').join('href="https://play.google.com/store/account/subscriptions?sku=app.fillsell.premium.sub&amp;package=app.fillsell.app"'));
          }
        }
      }
    }
  }
  // ── Les règles pures, fermé (compte ordinaire) ────────────────────────────────────────────────────────────────
  const PL = await vite.ssrLoadModule('/src/entree/plan.js');
  const MA = await vite.ssrLoadModule('/src/utils/mentionsAbonnement.js');
  for (const [nomEtat, valeurs] of Object.entries(ETATS_SERVEUR)) {
    INT._remettreAZero({ ...valeurs });
    for (const plateforme of ['web', 'ios', 'android']) {
      purs.push([!CO.formulesCloudVendables('u-ordinaire-0001', { plateforme, fuseau: 'Europe/Paris' }), `${nomEtat} : les formules avec Cloud invisibles (${plateforme})`]);
    }
  }
  // Le parcours d'entrée : les listes du plan d'AVANT (1f91bc3), contexte par contexte, avec c.formules fermé.
  const ctx = (o = {}) => ({ choix: { plateformes: ['vinted'] }, cloud: { parcours: false, actif: false, ouvert: false }, plan: null, demanderPseudo: false, voie: null, formules: { parcours: false }, ...o });
  const ids = (cx) => PL.etapesVisibles(cx).map((e) => e.id).join(' › ');
  const AVANT = [
    [ctx(), 'plateformes › extension › releve › republication › fin'],
    [ctx({ choix: { plateformes: [] } }), 'plateformes › extension › debut › republication › fin'],
    // (13/11/2026, bloc B2 de Nico, changement VOLONTAIRE — verrou selftest:entree-ordre) eBay se relie APRÈS le parcours
    // (récap) et « Ton plan Free » est dans le récap : ni étape « ebay », ni étape « free », formules ouvertes ou fermées.
    [ctx({ choix: { plateformes: ['ebay'] }, plan: { free: true }, demanderPseudo: true }), 'plateformes › extension › releve › republication › pseudo › fin'],
    [ctx({ cloud: { parcours: true, actif: false, ouvert: true } }), 'plateformes › voie › extension › releve › republication › fin'],
    [ctx({ cloud: { parcours: true, actif: false, ouvert: true }, voie: 'cloud' }), 'plateformes › voie › cloud › releve › republication › fin'],
    [ctx({ cloud: { parcours: true, actif: true, ouvert: true }, voie: 'cloud', plan: { free: true } }), 'plateformes › voie › cloud › cloud_connexion › releve › republication › fin'],
    [ctx({ cloud: { parcours: true, actif: false, ouvert: true }, voie: 'extension' }), 'plateformes › voie › extension › releve › republication › fin'],
  ];
  for (const [cx, attendu] of AVANT) {
    purs.push([ids(cx) === attendu, `parcours d'entrée, fermé : ${attendu}`, ids(cx)]);
    purs.push([ids({ ...cx, formules: undefined }) === attendu, `parcours d'entrée, sans contexte des formules : ${attendu}`, ids({ ...cx, formules: undefined })]);
  }
  // Les mentions d'avant, mot pour mot.
  INT._remettreAZero({ cloud_offre_ouverte: 1 });
  const m = MA.mentionsAbonnement({ canal: 'ios', lang: 'fr', cloud: true });
  purs.push([m.texte === "Abonnements à renouvellement automatique : le prix affiché est prélevé sur ton compte Apple à la confirmation, puis à chaque période, sauf résiliation au moins 24 h avant son terme (Réglages › ton nom › Abonnements). FillSell Cloud : 7 jours d'essai gratuit pour un premier abonnement, puis 24,99 € par mois." && m.liens.length === 3, 'les mentions d’abonnement d’avant, mot pour mot', m.texte]);
  INT._remettreAZero(null);
} finally {
  await vite.close();
}

if (CAPTURER) {
  fs.mkdirSync(dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, `${JSON.stringify({ releve: '1f91bc3, 11/11/2026, code d’avant les formules avec Cloud', rendus }, null, 1)}\n`);
  console.log(`empreinte écrite : ${Object.keys(rendus).length} rendus → ${FIXTURE}`);
  process.exit(0);
}

console.log('\n1. Fermé : la feuille des offres et Réglages › Abonnement, octet pour octet, comme avant');
const avant = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).rendus;
const cles = Object.keys(avant);
ok(cles.length === Object.keys(rendus).length && cles.length >= 170, `${cles.length} rendus relevés avant, ${Object.keys(rendus).length} rendus maintenant`);
const differents = cles.filter((k) => rendus[k] !== avant[k]);
ok(differents.length === 0, 'aucun rendu ne change quand les formules sont fermées (compte ordinaire)', differents.slice(0, 12).join(' · '));

console.log('\n2. Fermé : les règles pures (formules invisibles, parcours d’entrée et mentions d’avant)');
for (const [cond, msg, detail] of purs) ok(cond, msg, detail);

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
