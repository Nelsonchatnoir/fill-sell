// ═══════════════════════════════════════════════════════════════════════════
// LES 3 JAUGES DANS LES RÉGLAGES, LA PASTILLE DE L'EN-TÊTE ET LES REFUS → MURS (04/11/2026, lot 1)
//     npm run selftest:reglages-jauges
//     (node --import ./scripts/loader-ext.mjs scripts/reglages-jauges-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
// Maquettes validées par Nico le 03/11 (3.1 Réglages › Abonnement, 3.2 accueil des Réglages, 3.3 pastille de
// l'en-tête, 5.2 → 5.6 murs et garde-fou). La carte « Consommation du mois » de l'accueil et la sous-page
// Abonnement RENDUES côté serveur (Vite SSR + react-dom/server, comme offres-trois-jauges), sans réseau ni base.
// Ce qu'il prouve :
//   1. interrupteur à 0 (quotas_etat d'aujourd'hui, sans « grille ») : Free, Premium, Pro, Business rendent les
//      compteurs d'avant — aucun texte neuf, aucune ligne neuve, même avec la config des jauges sous la main ;
//   2. à 1 : les 3 jauges dans l'ordre Annonces · Publications · Remontées ; « illimitées » en mot (jamais une
//      jauge pleine) ; une jauge vide en ambre qui dit quand elle revient (date LUE, jamais inventée) et le palier
//      qui la débloque (volume lu dans coin_config) ; retouches IA à part ; phrase du Business puis Lens ;
//      « Bordereaux Vinted · inclus » au Pro et au Business ; le hub et la sous-page disent la même chose ;
//   3. la règle des refus (src/reglages/refusEtMurs.js), exécutée : chaque refus → son mur, le garde-fou → une
//      phrase, JAMAIS un mur ; à 0, rien (le chemin d'avant) ;
//   4. la feuille des offres : prop `grille` (repli AVEC grille tant que coin_config n'est pas lue), false = avant ;
//   5. le code des branchements (en-tête, Stock, stepper, Lens) : refus → mur, garde-fou → message, jamais modale.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 700)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s).replace(ESP, ' ');
const lignesDeCode = (texte) => texte.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*');
}).join('\n');

// La grille posée en base le 04/11 (migration 20261104000000_trois_jauges_interrupteur).
const CLES_JAUGES = {
  jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0,
  jauge_lens_business: 600,
};
const futur = new Date(Date.now() + 12 * 86_400_000).toISOString();

// quotas_etat tel que le serveur le rend, interrupteur à 1 (maquettes 3.1 / 3.2) …
const GRILLE = {
  free: {
    grille: 'trois_jauges', palier: 'free', annonces_mode: 'mensuel',
    annonces: { plafond: 5, consommes: 3, restantes: 2 },
    publications: { mode: 'mensuel', plafond: 50, consommes: 31, restantes: 19 },
    republication: { mode: 'mensuel', plafond: 30, faites: 30, restantes: 0, remise_le: futur },
    retouches: { plafond: 0, consommes: 0, restantes: 0 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null,
  },
  premium: {
    grille: 'trois_jauges', palier: 'premium', annonces_mode: 'mensuel',
    annonces: { plafond: 40, consommes: 22, restantes: 18 },
    publications: { mode: 'mensuel', plafond: 400, consommes: 187, restantes: 213 },
    republication: { mode: 'mensuel', plafond: 1500, faites: 1412, restantes: 88 },
    retouches: { plafond: 5, consommes: 2, restantes: 3 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null,
  },
  pro: {
    grille: 'trois_jauges', palier: 'pro', annonces_mode: 'mensuel',
    annonces: { plafond: 120, consommes: 64, restantes: 56 },
    publications: { mode: 'mensuel', plafond: 1200, consommes: 380, restantes: 820 },
    republication: { mode: 'illimite' },
    retouches: { plafond: 20, consommes: 7, restantes: 13 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null,
  },
  business: {
    grille: 'trois_jauges', palier: 'business', annonces_mode: 'illimite',
    annonces: { plafond: null, consommes: 40, restantes: null },
    publications: { mode: 'illimite', plafond: null, consommes: 500, restantes: null },
    republication: { mode: 'illimite' },
    retouches: { plafond: 50, consommes: 11, restantes: 39 }, scans: { plafond: null, consommes: 12, restantes: null },
    lens: { plafond: 600, consommes: 12, restantes: 588 },
  },
};
// … et tel qu'il le rend AUJOURD'HUI (interrupteur à 0 : ni grille, ni publications, ni annonces_mode, ni lens).
const AUJOURDHUI = {
  free: {
    palier: 'free', annonces: { plafond: 5, consommes: 3, restantes: 2 },
    republication: { mode: 'mensuel', plafond: 50, faites: 50, restantes: 0, remise_le: futur },
    retouches: { plafond: 0, consommes: 0, restantes: 0 }, scans: { plafond: null, consommes: 0, restantes: null },
  },
  premium: {
    palier: 'premium', annonces: { plafond: 40, consommes: 22, restantes: 18 },
    republication: { mode: 'mensuel', plafond: 1500, faites: 1412, restantes: 88 },
    retouches: { plafond: 5, consommes: 2, restantes: 3 }, scans: { plafond: null, consommes: 0, restantes: null },
  },
  pro: {
    palier: 'pro', annonces: { plafond: 120, consommes: 64, restantes: 56 },
    republication: { mode: 'mensuel', plafond: 3000, faites: 12, restantes: 2988 },
    retouches: { plafond: 20, consommes: 7, restantes: 13 }, scans: { plafond: null, consommes: 0, restantes: null },
  },
  business: {
    palier: 'business', annonces: { plafond: 300, consommes: 40, restantes: 260 },
    republication: { mode: 'illimite' },
    retouches: { plafond: 50, consommes: 11, restantes: 39 }, scans: { plafond: null, consommes: 12, restantes: null },
  },
};
const drap = {
  free: {}, premium: { isPremium: true }, pro: { isPremium: true, isPro: true }, business: { isPremium: true, isPro: true, isBusiness: true },
};
const PALIERS = ['free', 'premium', 'pro', 'business'];
// Ce que la grille AJOUTE à l'écran : à 0, rien de ceci ne doit apparaître.
const NEUF_TEXTE = /Publications|Remontées|remontée|Tout illimité|dont Lens|Bordereaux Vinted|scans? Lens|restantes? sur \d|reviennent le|par mois en (Premium|Pro|Business)|illimitées en/;
const NEUF_BALISE = /data-jauge-illimitee|data-lien-mur|data-retouches-a-part|data-tout-illimite|data-bordereaux-inclus/;

globalThis.document ??= { body: {} };
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
  const RP = await vite.ssrLoadModule('/src/reglages/ReglagesPage.jsx');
  const SPA = await vite.ssrLoadModule('/src/reglages/SousPageAbonnement.jsx');
  const RT = await vite.ssrLoadModule('/src/reglages/textes.js');
  const QT = await vite.ssrLoadModule('/src/reglages/quotas.js');
  const RM = await vite.ssrLoadModule('/src/reglages/refusEtMurs.js');
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const texte = (html) => net(html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
  const T = RT.txt('fr');
  const TEN = RT.txt('en');
  const appels = [];
  const cDe = (palier, quotas, extra = {}) => ({
    user: { id: 'u1', email: 'a@b.c' }, lang: 'fr', ...drap[palier], natif: false, plateforme: 'web', quotas,
    remiseAZero: '16/11', remiseIso: futur, prochainPrelevement: '16/11/2026', configJauges: CLES_JAUGES,
    ouvrirOffres(...a) { appels.push(a); },
    resiliation: { resilie: false, etape: 0, setEtape() {}, lancer() {}, enCours: false }, restauration: { enCours: false, lancer() {} },
    actionsCloud: null, ...extra,
  });
  const hub = (c) => renderToStaticMarkup(h(RP.CarteConsommation, { c, T: c.lang === 'en' ? TEN : T }));
  const page = (c) => renderToStaticMarkup(h(SPA.default, { c, T: c.lang === 'en' ? TEN : T }));
  const avant = (t, a, b) => t.indexOf(a) >= 0 && t.indexOf(b) > t.indexOf(a);

  // ── 1. Interrupteur à 0 : rien de neuf ────────────────────────────────────
  console.log('1. Interrupteur à 0 (quotas_etat d’aujourd’hui) : les compteurs d’avant, rien de neuf');
  for (const p of PALIERS) {
    const c = cDe(p, AUJOURDHUI[p]);
    const hh = hub(c), pp = page(c);
    const th = texte(hh), tp = texte(pp);
    ok(!NEUF_TEXTE.test(th) && !NEUF_BALISE.test(hh), `${p} · accueil : aucun texte ni balise de la grille`, th);
    ok(!NEUF_TEXTE.test(tp) && !NEUF_BALISE.test(pp), `${p} · Abonnement : aucun texte ni balise de la grille`, tp);
    ok(th.includes('Annonces créées') && th.includes('Republications') && tp.includes('Annonces créées') && tp.includes('Republications'),
      `${p} : « Annonces créées » et « Republications », comme avant`, th);
    ok((th.includes('Retouches IA') === (p !== 'free')) && (tp.includes('Retouches IA') === (p !== 'free')), `${p} : les retouches IA à leur place d’avant (rien en Free)`);
    ok((tp.match(/Retouches IA/g) ?? []).length <= 1 && !/<h2[^>]*>Retouches IA<\/h2>/.test(pp), `${p} : pas de groupe « Retouches IA » à part sans la grille`);
  }
  {
    // Même la réponse d'un Business d'aujourd'hui (annonces 300) garde sa jauge, comme avant.
    const tb = texte(page(cDe('business', AUJOURDHUI.business)));
    ok(/Annonces créées 40 \/ 300/.test(tb) && /Republications illimitées/.test(tb), 'business à 0 : « Annonces créées 40 / 300 » et « Republications illimitées », comme avant', tb);
    // Sans config ni date : toujours rien de neuf.
    const nu = cDe('free', AUJOURDHUI.free, { configJauges: undefined, remiseIso: null, remiseAZero: null });
    ok(!NEUF_TEXTE.test(texte(hub(nu)) + texte(page(nu))), 'free à 0 sans config ni date : rien de neuf');
    ok(QT.consommationVisible(AUJOURDHUI.free) && QT.consommationVisible(GRILLE.business), 'la carte existe à 0 comme à 1 (Business avec la grille : retouches et remontées)');
  }

  // ── 2. Interrupteur à 1 : la grille ───────────────────────────────────────
  console.log('2. Interrupteur à 1 : les 3 jauges, « illimitées », retouches à part, Business, bordereaux');
  {
    const c = cDe('free', GRILLE.free);
    const pp = page(c), hh = hub(c);
    const tp = texte(pp), th = texte(hh);
    ok(avant(tp, 'Annonces', 'Publications') && avant(tp, 'Publications', 'Remontées'), 'free · Abonnement : Annonces · Publications · Remontées, dans cet ordre', tp);
    ok(/Annonces 3 \/ 5 2 annonces restantes ce mois-ci/.test(tp) && /Publications 31 \/ 50 19 publications restantes ce mois-ci/.test(tp), 'free : « 2 annonces restantes », « 19 publications restantes »', tp);
    ok(/Remontées 30 \/ 30 Tes 30 remontées du mois sont faites : elles reviennent le 16\/11\. 1 500 par mois en Premium/.test(tp),
      'free · Abonnement : la jauge vide dit quand elle revient et ce qui la débloque (maquette 3.1)', tp);
    ok(/Remontées 30 \/ 30 Faites : elles reviennent le 16\/11\. 1 500 par mois en Premium/.test(th), 'free · accueil : « Faites : elles reviennent le 16/11. 1 500 par mois en Premium » (maquette 3.2)', th);
    const vide = pp.slice(pp.indexOf('Remontées'));
    ok(/background:#E8956D/.test(vide), 'la jauge vide passe en ambre');
    ok(!/background:#E8956D/.test(pp.slice(0, pp.indexOf('Remontées'))), 'les jauges qui ne sont pas vides restent vertes');
    ok(!tp.includes('Retouches IA') && !th.includes('Retouches IA'), 'free : aucune retouche (plafond 0)');
    ok(!tp.includes('Bordereaux Vinted'), 'free : pas de ligne bordereaux');
    ok(/data-lien-mur="1"/.test(pp) && /data-lien-mur="1"/.test(hh), 'le palier qui débloque est un lien (vers le mur de cette jauge)');
    ok((pp.match(/data-lien-mur/g) ?? []).length === 1, 'un seul lien : seule la jauge vide en porte un');
    // Jamais une date inventée ; le lien attend la config ; les volumes viennent de coin_config.
    ok(/Tes 30 remontées du mois sont faites\. 1 500 par mois en Premium/.test(texte(page(cDe('free', GRILLE.free, { remiseAZero: null })))),
      'sans date lue : aucune date (« … sont faites. »)');
    ok(!/data-lien-mur/.test(page(cDe('free', GRILLE.free, { configJauges: undefined }))), 'config pas encore lue : pas de lien (aucun chiffre en dur)');
    ok(/2 000 par mois en Premium/.test(texte(page(cDe('free', GRILLE.free, { configJauges: { ...CLES_JAUGES, jauge_remontees_premium: 2000 } })))),
      'le volume du lien est LU dans coin_config (2 000 si la base dit 2 000)');
    ok(/1 500 par mois en Premium/.test(texte(page(cDe('free', GRILLE.free, { configJauges: null })))), 'config illisible : le repli de utils/jauges (comme la feuille des offres)');
    const pAnn = texte(page(cDe('free', { ...GRILLE.free, annonces: { plafond: 5, consommes: 5, restantes: 0 } })));
    ok(/Tes 5 annonces du mois sont créées : elles reviennent le 16\/11\. 40 par mois en Premium/.test(pAnn), 'annonces vides : « sont créées », 40 par mois en Premium', pAnn);
  }
  {
    const c = cDe('premium', GRILLE.premium);
    const pp = page(c), tp = texte(pp), th = texte(hub(c));
    ok(/Annonces 22 \/ 40 18 annonces restantes ce mois-ci Publications 187 \/ 400 213 publications restantes ce mois-ci Remontées 1 412 \/ 1 500 88 remontées restantes ce mois-ci/.test(tp),
      'premium · Abonnement : les 3 jauges de la maquette', tp);
    ok(/<h2[^>]*>Retouches IA<\/h2>/.test(pp) && avant(tp, 'Remontées', 'Retouches IA') && /Retouches IA 2 \/ 5 3 retouches restantes ce mois-ci/.test(tp),
      'premium · Abonnement : les retouches IA dans leur propre groupe, SOUS les jauges', tp);
    ok(/Retouches IA 3 restantes sur 5/.test(th) && /data-retouches-a-part/.test(hub(c)), 'premium · accueil : « Retouches IA · 3 restantes sur 5 », à part', th);
    ok(!tp.includes('Bordereaux Vinted'), 'premium : pas de ligne bordereaux');
    const vide = texte(page(cDe('premium', { ...GRILLE.premium, republication: { mode: 'mensuel', plafond: 1500, faites: 1500, restantes: 0 } })));
    ok(/Tes 1 500 remontées du mois sont faites : elles reviennent le 16\/11\. illimitées en Pro/.test(vide), 'premium à 1 500 : « illimitées en Pro » (le plus proche, pas le plus cher)', vide);
  }
  {
    const c = cDe('pro', GRILLE.pro);
    const pp = page(c), tp = texte(pp), th = texte(hub(c));
    ok(/Publications 380 \/ 1 200 820 publications restantes ce mois-ci Remontées illimitées/.test(tp) && /Remontées illimitées/.test(th), 'pro : « Remontées illimitées » en mot', tp);
    ok(/data-jauge-illimitee="1"/.test(pp) && (pp.match(/height:7px/g) ?? []).length === 3, 'pro · Abonnement : 3 barres (annonces, publications, retouches), jamais une jauge pleine pour l’illimité');
    ok(/Bordereaux Vinted inclus Comparer les formules/.test(tp) && /data-bordereaux-inclus/.test(pp), 'pro : « Bordereaux Vinted · inclus » en tête de « Gérer »', tp);
    ok(/Retouches IA 13 restantes sur 20/.test(th), 'pro · accueil : retouches 13 sur 20');
  }
  {
    const c = cDe('business', GRILLE.business);
    const pp = page(c), hh = hub(c), tp = texte(pp), th = texte(hh);
    ok(tp.startsWith('Business') || tp.includes('Abonnement actif'), 'business : la page se rend');
    ok(/Tout illimité, sauf Lens \(600 par mois\) et retouches IA \(50 par mois\)\. Annonces illimitées dont Lens 12 \/ 600 588 scans Lens restants ce mois-ci Publications illimitées Remontées illimitées/.test(tp),
      'business · Abonnement : la phrase, puis Annonces (dont Lens), Publications, Remontées illimitées (maquette 3.1)', tp);
    ok(/Retouches IA 11 \/ 50 39 retouches restantes ce mois-ci/.test(tp), 'business · Abonnement : retouches 11 / 50 à part');
    ok(/Tout illimité, sauf Lens \(600 par mois\) et retouches IA \(50 par mois\)\. Lens 12 \/ 600 588 scans restants ce mois-ci Retouches IA 39 restantes sur 50/.test(th),
      'business · accueil : la phrase, Lens, puis la ligne des retouches (maquette 3.2)', th);
    ok(!/Publications/.test(th), 'business · accueil : rien d’autre (tout le reste est illimité)');
    ok(/Bordereaux Vinted inclus/.test(tp), 'business : « Bordereaux Vinted · inclus »');
    ok(!/data-lien-mur/.test(pp + hh), 'business : aucun lien vers une offre');
    const lensVide = texte(page(cDe('business', { ...GRILLE.business, lens: { plafond: 600, consommes: 600, restantes: 0 } })));
    ok(/dont Lens 600 \/ 600 Tes 600 scans Lens du mois sont faits : ils reviennent le 16\/11\./.test(lensVide) && !/par mois en/.test(lensVide), 'Lens vide : quand ça revient, aucune offre (rien au-dessus du Business)', lensVide);
  }
  {
    // Le hub et la sous-page disent la même chose (même source).
    for (const p of PALIERS) {
      const c = cDe(p, GRILLE[p]);
      const nums = (t) => (t.match(/\d[\d ]* \/ \d[\d ]*/g) ?? []).join('|');
      const th = texte(hub(c)), tp = texte(page(c));
      ok(nums(th).length > 0 && nums(th).split('|').every((x) => tp.includes(x)), `${p} : chaque compteur de l’accueil est celui de la sous-page`, `${nums(th)} ⊄ ${nums(tp)}`);
    }
    const en = texte(page({ ...cDe('free', GRILLE.free), lang: 'en' }));
    ok(/Listings 3 \/ 5 2 listings left this month/.test(en) && /Bumps 30 \/ 30 Your 30 bumps for this month are done: they come back on 16\/11\. 1,500 a month on Premium/.test(net(en)),
      'anglais : mêmes jauges, mêmes mots que la feuille des offres', en);
    const enB = texte(page({ ...cDe('business', GRILLE.business), lang: 'en' }));
    ok(/Everything unlimited, except Lens \(600 a month\) and AI touch-ups \(50 a month\)\./.test(enB) && /Vinted labels included/.test(enB), 'anglais : la phrase du Business et les bordereaux', enB);
  }
  {
    // Le lien d'une jauge vide ouvre les offres SUR LE MUR de cette jauge.
    const mur = RM.murDeLaJauge('remontees', GRILLE.free, { remise: futur });
    ok(mur && mur.geste === 'remontees' && mur.plafond === 30 && mur.consommes === 30 && mur.restantes === 0 && mur.remise_le === futur && mur.publications_restantes === 19,
      'murDeLaJauge : le mur Remontées (plafond, faites, remise lue, publications restantes)', JSON.stringify(mur));
    const ui = lignesDeCode(lire('src/reglages/ReglagesUI.jsx'));
    ok(/<LienMur onClick=\{\(\) => c\.ouvrirOffres\('reglages_jauge', mur\)\}>/.test(ui), 'le lien : c.ouvrirOffres(origine, mur)');
    const app = lignesDeCode(lire('src/App.jsx'));
    ok(/ouvrirOffres=\{\(origine,mur\)=>\(mur&&typeof mur==='object'&&typeof mur\.geste==='string'\s*\?openUpgradeModal\(null,origine\?\?'reglages','quota_geste',\{quotaInfo:mur\}\)\s*:openUpgradeModal\(null,origine\?\?'reglages'\)\)\}/.test(app),
      'App : un mur ouvre la feuille en quota_geste ; sans mur (une chaîne seule), l’appel d’avant');
  }

  // ── 3. Les refus (refusEtMurs.js), exécutés ───────────────────────────────
  console.log('3. Les refus : chaque refus → son mur ; le garde-fou → une phrase, jamais un mur');
  {
    const CODES = [
      { reason: 'plafond_republication_mensuel', plafond: 1500, faites: 1500 },
      { reason: 'plafond_republication_free', plafond: 30, faites: 30, remise_le: futur },
      { reason: 'garde_fou_jour', jauge: 'publications', garde: 2000, faites: 2000, message: 'x' },
      { reason: 'quota_publications_atteint', plafond: 400, consommes: 400, restantes: 0, demandees: 2, remise_le: futur, message: 'm' },
      { error: 'quota_scan_atteint', plafond: 600, consommes: 600 },
      { error: 'quota_annonces_atteint', plafond: 40, consommes: 40 },
      { error: 'generation_limit', message: 'g' },
    ];
    for (const r of CODES) {
      ok(RM.suiteDuRefus(r, AUJOURDHUI.premium) === null && RM.suiteDuRefus(r, null) === null, `à 0 : ${r.reason ?? r.error} → null (le chemin d’avant)`);
    }
    ok(RM.murDeLaJauge('annonces', AUJOURDHUI.free) === null && RM.publicationsRestantes(AUJOURDHUI.free) === null, 'à 0 : aucun mur d’en-tête, aucune publication restante');
    const prem = { ...GRILLE.premium, republication: { mode: 'mensuel', plafond: 1500, faites: 1500, restantes: 0 } };
    const s1 = RM.suiteDuRefus({ reason: 'plafond_republication_mensuel', plafond: 1500, faites: 1500 }, prem);
    ok(s1?.mur?.geste === 'remontees' && s1.mur.plafond === 1500 && s1.mur.consommes === 1500 && s1.mur.publications_restantes === 213 && !s1.message,
      'Premium à 1 500 → le mur Remontées (consommes = faites, « il te reste 213 publications »)', JSON.stringify(s1));
    ok(RM.suiteDuRefus({ reason: 'plafond_republication_free', plafond: 30, faites: 30 }, GRILLE.free) === null, 'Free à 30 → null : son chemin republish_cap (qui rend déjà le mur Remontées)');
    const msgServeur = "Pause de sécurité jusqu'à minuit : tu as fait 2 000 publications aujourd'hui. Au-delà, les plateformes risquent de restreindre ton compte. Rien n'est perdu : tout reprend demain.";
    const s2 = RM.suiteDuRefus({ reason: 'garde_fou_jour', jauge: 'publications', garde: 2000, faites: 2000, message: msgServeur }, GRILLE.business);
    ok(s2?.message === msgServeur && !s2.mur, 'garde_fou_jour → la phrase du SERVEUR, telle quelle, et aucun mur');
    const s3 = RM.suiteDuRefus({ reason: 'quota_publications_atteint', plafond: 400, consommes: 400, restantes: 0, demandees: 2, remise_le: futur, message: 'Tes 400…' }, GRILLE.premium);
    ok(s3?.mur?.geste === 'publications' && s3.mur.plafond === 400 && s3.mur.consommes === 400 && s3.mur.restantes === 0 && s3.mur.remise_le === futur,
      'publications du mois faites → le mur Publications (plafond, consommes, restantes, remise du refus)', JSON.stringify(s3));
    const s4 = RM.suiteDuRefus({ reason: 'quota_publications_atteint', plafond: 400, consommes: 398, restantes: 2, demandees: 4, message: 'Il te reste 2 publications ce mois-ci, et cet article en demande 4 : décoche une plateforme.' }, GRILLE.premium);
    ok(s4?.message?.startsWith('Il te reste 2 publications') && !s4.mur, 'il en reste mais moins que l’article n’en demande → la phrase « décoche une plateforme », pas un mur qui dirait « toutes faites »');
    const s5 = RM.suiteDuRefus({ error: 'quota_scan_atteint', plafond: 600, consommes: 600 }, GRILLE.business, { remise: futur });
    ok(s5?.mur?.geste === 'lens' && s5.mur.plafond === 600 && s5.mur.remise_le === futur, 'Business, scan refusé à 600 (= son Lens) → le mur Lens, avec la remise lue par l’hôte', JSON.stringify(s5));
    const s6 = RM.suiteDuRefus({ error: 'quota_scan_atteint', plafond: 800, consommes: 800 }, GRILLE.business);
    ok(s6?.message && !s6.mur && /^Pause de sécurité jusqu'à minuit : tu as fait 800 annonces aujourd'hui\. Au-delà, les plateformes risquent de restreindre ton compte : FillSell s'arrête par sécurité jusqu'à minuit\./.test(net(s6.message)),
      'Business, scan refusé à 800 (le garde-fou, que lens-analysis ne nomme pas) → « Pause de sécurité jusqu’à minuit… » (maquette 5.6), jamais un mur', s6?.message);
    ok(RM.suiteDuRefus({ error: 'quota_scan_atteint', plafond: 800, consommes: 800 }, GRILLE.pro)?.message, 'hors Business, un scan refusé sous la grille est le garde-fou : la phrase');
    ok(RM.suiteDuRefus({ error: 'quota_scan_atteint', garde_fou: true, jauge: 'annonces', plafond: 800, consommes: 800, message: 'srv' }, GRILLE.business)?.message === 'srv', 'garde-fou relayé un jour avec sa phrase : la phrase du serveur');
    const s7 = RM.suiteDuRefus({ error: 'quota_annonces_atteint', plafond: 5, consommes: 5 }, GRILLE.free);
    ok(s7?.mur?.geste === 'annonces' && s7.mur.plafond === 5 && s7.mur.publications_restantes === 19 && s7.mur.remise_le === futur,
      'annonces du mois → le mur Annonces avec « il te reste 19 publications » et la remise de quotas_etat', JSON.stringify(s7));
    ok(RM.suiteDuRefus({ error: 'generation_limit', message: 'g' }, GRILLE.business) === null, 'generation_limit → null : le message du serveur, comme aujourd’hui');
    const pause = RM.messagePause({ consommes: 800 }, 'fr') + RM.messagePause({}, 'fr') + RM.messagePause({ consommes: 800 }, 'en');
    ok(!/Premium|Pro\b|Business|€|offre|formule|plan|upgrade/i.test(pause), 'la phrase du garde-fou ne vend rien et n’annonce aucun plafond', pause);
    ok(!/dès minuit|à partir de minuit|repart à minuit|limite du jour|daily limit/i.test(pause), 'ni « dès minuit » ni « limite du jour » (règle du 24/10)');
    // La pastille de l'en-tête (maquette 3.3) : la règle de utils/jauges + le mur de murDeLaJauge.
    const proBas = { ...GRILLE.pro, publications: { mode: 'mensuel', plafond: 1200, consommes: 1162, restantes: 38 } };
    const J = await vite.ssrLoadModule('/src/utils/jauges.js');
    const pastille = J.jaugeLaPlusProche(J.jaugesDuCompte(proBas));
    ok(pastille?.cle === 'publications' && pastille.restantes === 38 && pastille.basse === true, 'pastille : Pro aux publications basses → « 38 publications restantes », ambre');
    ok(J.jaugeLaPlusProche(J.jaugesDuCompte(GRILLE.business)) === null, 'pastille : rien chez le Business');
    ok(RM.murDeLaJauge('remontees', GRILLE.pro) === null, 'murDeLaJauge : une jauge illimitée n’a pas de mur');
  }

  // ── 4. La feuille des offres : prop grille ────────────────────────────────
  console.log('4. ConversionModal : prop grille (repli AVEC grille tant que coin_config n’est pas lue)');
  {
    const base = { isOpen: true, onClose() {}, onUpgrade() {}, lang: 'fr', userId: 'u1', isPremium: true, trigger: 'quota_geste',
      quotaInfo: { geste: 'publications', plafond: 400, consommes: 400, restantes: 0, remise_le: futur } };
    const sans = renderToStaticMarkup(h(CM.default, base));
    const faux = renderToStaticMarkup(h(CM.default, { ...base, grille: false }));
    const vrai = renderToStaticMarkup(h(CM.default, { ...base, grille: true }));
    ok(sans === faux, 'grille={false} : exactement le rendu sans la prop');
    ok(!/data-mur-jauge/.test(sans), 'sans la prop, config pas encore lue : l’ancienne feuille (aucun mur)');
    ok(/data-mur-jauge="publications"/.test(vrai) && /Tes 400 publications du mois sont faites\./.test(texte(vrai)), 'grille={true}, config pas encore lue : le mur Publications d’emblée (repli AVEC grille)', texte(vrai).slice(0, 300));
    const m = lignesDeCode(lire('src/components/ConversionModal.jsx'));
    ok(/grille: grilleHote = false,/.test(m) && /const K = cfg \|\| \(grilleHote === true \? \{ \.\.\.COIN_CONFIG_FALLBACK, grille_trois_jauges: 1 \} : COIN_CONFIG_FALLBACK\);/.test(m),
      'la seule retouche de la modale : la prop et le repli de K (cfg lue fait foi)');
    ok((m.match(/grilleHote/g) ?? []).length === 2, 'grilleHote ne sert nulle part ailleurs');
    const app = lignesDeCode(lire('src/App.jsx'));
    const lps = lignesDeCode(lire('src/components/ListingPreviewScreen.jsx'));
    ok(/grille=\{grilleActive\(quotas\)\}/.test(app) && /grille=\{grilleActive\(quotas\)\}/.test(lps), 'les deux hôtes passent grille={grilleActive(quotas)}');
  }

  // ── 5. Le code des branchements ───────────────────────────────────────────
  console.log('5. Les branchements : refus → mur, garde-fou → message, jamais une modale d’offres');
  {
    const app = lignesDeCode(lire('src/App.jsx'));
    // En-tête.
    ok(/\{grilleEntete&&pastilleGrille&&\(\s*<button\s*onClick=\{appuiPastilleGrille\}/.test(app) && /\{!grilleEntete&&quotas\?\.annonces\?\.plafond!=null&&\(/.test(app),
      'en-tête : la pastille de la grille, sinon le compteur d’avant (inchangé)');
    const pastille = app.slice(app.indexOf('{grilleEntete&&pastilleGrille&&('), app.indexOf('{!grilleEntete&&quotas?.annonces?.plafond!=null&&('));
    ok(/className="tb-quota"/.test(pastille) && /className="tb-quota-chip"/.test(pastille) && /className="tb-quota-libelle"/.test(pastille) && /className="tb-quota-mot"/.test(pastille),
      'pastille : mêmes classes que le compteur (le mot cède sur petit écran)');
    ok(/pastilleGrille\.basse\?"#FFF6E3"/.test(pastille) && /pastilleGrille\.basse\?"#8A6100"/.test(pastille), 'pastille : ambre sous 20 %');
    ok(!/openUpgradeModal\(/.test(pastille), 'pastille : aucune porte vers les offres écrite dans l’en-tête (le compte des portes de l’en-tête ne bouge pas)');
    ok(/const pastilleGrille=grilleEntete\?jaugeLaPlusProche\(jaugesDuCompte\(quotas\)\):null;/.test(app), 'pastille : jaugeLaPlusProche(jaugesDuCompte(quotas)) — rien chez le Business');
    ok(/const mur=pastilleGrille&&pastilleGrille\.restantes===0\?murDeLaJauge\(pastilleGrille\.cle,quotas\):null;\s*if\(mur\)openUpgradeModal\(null,'entete_quota','quota_geste',\{quotaInfo:mur\}\);\s*else openUpgradeModal\(null,'entete_quota'\);/.test(app),
      'pastille : le mur de la jauge si elle est pleine, sinon les offres comme aujourd’hui');
    ok(/setConversionModal\(\{open:true,trigger,origine:org,\.\.\.\(etat&&typeof etat==='object'&&etat\.quotaInfo\?\{quotaInfo:etat\.quotaInfo\}:\{\}\)\}\);/.test(app),
      'openUpgradeModal : 4e argument facultatif ({ quotaInfo }) ; absent, l’appel d’avant');
    // Lens (App).
    const lens = app.slice(app.indexOf('const suiteRefusLens=suiteDuRefus(errBody,quotas,{lang});'), app.indexOf("throw new Error(errBody.error||`HTTP ${r.status}`);"));
    const blocMsg = lens.slice(lens.indexOf('if(suiteRefusLens?.message){'), lens.indexOf("if(errBody.error==='quota_scan_atteint'){"));
    ok(lens.length > 100 && /setToast\(\{visible:true,message:suiteRefusLens\.message\}\)/.test(blocMsg) && !/ouvrirModalePlafond|openUpgradeModal|setConversionModal/.test(blocMsg),
      'Lens : le garde-fou → la phrase (toast), jamais une modale');
    ok(/if\(suiteRefusLens\?\.mur\)\{ouvrirModalePlafond\('quota_scan',\{trigger:'quota_geste',quotaInfo:suiteRefusLens\.mur\}\);return;\}/.test(lens), 'Lens du Business → son mur');
    ok(/quotaInfo:suiteRefusLens\?\.mur\?\?\{geste:'annonces',plafond:errBody\.plafond,consommes:errBody\.consommes\}/.test(lens), 'quota d’annonces : le mur avec la grille, l’objet d’avant sans');
    // Stock.
    const stock = lignesDeCode(lire('src/tabs/StockTab.jsx'));
    ok(/ouvrirModalePlafond\('plafond_republication_mensuel', \{ trigger: 'quota_geste', quotaInfo: suite\.mur \}\);/.test(stock), 'Stock : le Premium à 1 500 → le mur Remontées (quota_geste)');
    ok(/const suite = suiteDuRefus\(res, quotas, \{ lang \}\);\s*if \(ouvrirMurRemontees\(suite\)\) return;\s*if \(suite\?\.message\) \{ refus\.push\(suite\.message\); break; \}/.test(stock),
      'Stock (à l’unité) : mur, sinon le garde-fou en phrase (une fois), sinon le chemin d’avant');
    ok(/const suiteLot = suiteDuRefus\(res, quotas, \{ lang \}\);\s*if \(suiteLot\) \{\s*refus\.push\(\{ titre: nomArticle, raison: suiteLot\.message \?\? messageRefusRepublication\(res, lang, platform\) \}\);[\s\S]{0,140}ouvrirMurRemontees\(suiteLot\);\s*break;/.test(stock),
      'Stock (en lot) : une entrée, le mur UNE fois (ouvrirMurRemontees ne s’ouvre que sur un mur), et on coupe');
    const murStock = stock.slice(stock.indexOf('const ouvrirMurRemontees = (suite) => {'), stock.indexOf('const msgPlafondRepub'));
    ok(/if \(!suite\?\.mur \|\| typeof ouvrirModalePlafond !== 'function'\) return false;/.test(murStock), 'Stock : une phrase (garde-fou) n’ouvre jamais la modale');
    ok(/plafondRepub: \{ plafond: res\?\.plafond \?\? null, faites: res\?\.faites \?\? null, remise_le: res\?\.remise_le \?\? null \},\s*\.\.\.\(pubsRestantes != null \? \{ quotaInfo: \{ publications_restantes: pubsRestantes \} \} : \{\}\),/.test(stock),
      'Stock : republish_cap garde son chemin, avec les publications restantes sous la grille');
    // Stepper.
    const lps = lignesDeCode(lire('src/components/ListingPreviewScreen.jsx'));
    ok(/const suitePub = suiteDuRefus\(pubRes, quotas, \{ lang, remise: remiseAZero \}\);\s*if \(suitePub\?\.mur\) \{\s*ouvrirQuotaModal\("quota_publications", \{ trigger: "quota_geste", targetTiers: \["premium","pro"\], quotaInfo: suitePub\.mur \}\);/.test(lps),
      'stepper : publications du mois faites → le mur Publications');
    ok(/if \(suitePub\?\.message\) throw new Error\(suitePub\.message\);/.test(lps), 'stepper : le garde-fou → la phrase dans le bandeau, jamais une modale');
    ok(/if \(suiteScan\?\.message\) \{\s*setAnalysisError\(suiteScan\.message\);\s*return;\s*\}/.test(lps), 'stepper (analyse) : le garde-fou → la phrase, jamais une modale');
    ok(/if \(err\?\.error === "quota_scan_atteint" && suiteScan\?\.mur\) \{\s*ouvrirQuotaModal\("quota_scan", \{ trigger: "quota_geste", targetTiers: \["premium","pro"\], quotaInfo: suiteScan\.mur \}\);/.test(lps), 'stepper (analyse) : Lens du Business → son mur');
    ok(/if \(errBody\?\.error === "generation_limit" && errBody\?\.message\) \{\s*throw new Error\(errBody\.message\);/.test(lps), 'generation_limit : le message du serveur, comme aujourd’hui');
    // Lens (onglet) et hôtes du stepper.
    const lensTab = lignesDeCode(lire('src/tabs/LensTab.jsx'));
    ok(/const mur=murDeLaJauge\('annonces',quotas\);if\(mur\)openUpgradeModal\(undefined,'lens_quota_atteint','quota_geste',\{quotaInfo:mur\}\);else openUpgradeModal\(undefined,'lens_quota_atteint','quota_geste'\);/.test(lensTab),
      'viseur Lens : le mur Annonces avec la jauge du compte, l’appel d’avant sans la grille');
    ok(/quotas=\{quotas\}\s*\/>/.test(lensTab) && /quotas=\{quotas\}\s*\/>/.test(stock), 'Lens et Stock passent quotas au stepper');
    // La règle elle-même : le garde-fou passe AVANT tout mur.
    const rm = lignesDeCode(lire('src/reglages/refusEtMurs.js'));
    ok(/if \(!grilleActive\(quotas\)\) return null;\s*const j = jaugeDuRefus\(refus\);\s*if \(!j\) return null;\s*if \(j\.gardeFou\) return \{ message: messagePause\(refus, lang\) \};/.test(rm),
      'refusEtMurs : sans la grille, null ; le garde-fou rend une phrase AVANT tout mur');
    // Le lot n'est pas touché (lot suivant).
    // Son moteur (ListingPreviewScreen en pilote) ne reçoit pas quotas : la règle des refus n'y joue pas.
    const lot = lire('src/publication/lot/LotPublication.jsx');
    const moteurDuLot = lot.slice(lot.indexOf('<ListingPreviewScreen'), lot.indexOf('/>', lot.indexOf('<ListingPreviewScreen')));
    ok(moteurDuLot.length > 50 && !/refusEtMurs/.test(lot) && !/quotas=/.test(moteurDuLot), 'la publication en lot n’est pas touchée (lot suivant) : son moteur ne reçoit pas quotas');
  }
} finally {
  await vite.close();
}

console.log(`\n${rouges === 0 ? '✓' : '✗'} reglages-jauges : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
