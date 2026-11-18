// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE PARCOURS D'ENTRÉE : LA VOIE DE PUBLICATION D'ABORD, eBAY APRÈS, « TON PLAN FREE » DANS LE RÉCAP
// (13/11/2026, bloc B2 de Nico)        npm run selftest:entree-ordre
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré sur les 119 inscrits du 08 au 13/11 (usage_logs onboarding_choice + profiles.onboarded_at) :
//   · 23 ont ouvert le consentement eBay AU MILIEU du parcours, 12 ne sont jamais revenus dans le parcours (la page
//     eBay remplace l'app sur le web, le parcours se marque fini à la sortie) — 9 d'entre eux ont pourtant relié eBay :
//     ils n'ont jamais vu le choix « Cloud ou ordinateur », ni le relevé, ni le récap ;
//   · sans voie de publication (extension vue ou FillSell Cloud), AUCUN inscrit n'a publié (0 sur 79) : le choix de
//     la voie est l'étape qui décide de tout, elle passe juste après « Où tu vends ? » pour TOUT LE MONDE ;
//   · « Ton plan Free » était un écran de plus juste avant la sortie, que le récap redisait déjà en une ligne : il est
//     FUSIONNÉ dans le récap, avec TOUTE son information (3 chiffres et ce qu'ils comptent, la remise à zéro, ce qui est
//     sans limite, l'exemple, « Besoin de plus un jour ? ») — rien n'est caché ;
//   · les écrans sans choix (republication, récap) ne laissaient aucune trace : « s'arrête après "offre gratuite
//     comprise" » voulait en fait dire « arrivé au récap ». Chaque écran vu se journalise désormais (etape_vue).
// Ce que ce verrou fait tomber : une étape eBay ou « free » qui revient dans le parcours, un écran glissé entre
// « Où tu vends ? » et le choix de la voie, un consentement eBay ouvert AVANT que le parcours soit marqué fini,
// une information du plan Free perdue, un bouton d'achat dans le récap, une règle Cloud du plan qui change.
// (18/11/2026, lot T1 — refonte de l'accueil, changement voulu par Nico ; verrou selftest:accueil-refonte) L'ordre suit le
// plan de la refonte : la voie se choisit par « As-tu un ordinateur ? », 2e étape de TOUT téléphone ; sur ordinateur (web),
// l'extension vient tout de suite. voie, cloud_presentation, cloud_offres, republication, formule et le récap (fin) sortent
// du plan (leurs écrans restent, montables) ; plus de « Passer » en haut (la flèche de retour, la sortie de chaque écran en
// bas). Le récap (EtapeFin) et entree/ebayApres.js gardent leurs verrous de contenu, inchangés.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 700)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s).replace(ESP, ' ');
const texte = (html) => net(String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .split('\n').map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, '$1')).join('\n');

const K1 = {
  grille_trois_jauges: 1, jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0, jauge_lens_business: 600,
};

globalThis.document ??= { body: {} };
const magasin = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k) => (k in magasin ? magasin[k] : null), setItem: (k, v) => { magasin[k] = String(v); }, removeItem: (k) => { delete magasin[k]; } },
  configurable: true, writable: true,
});
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { return { __erreur: e?.message ?? String(e) }; } };
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const P = await charger('/src/entree/plan.js');
  const R = await charger('/src/entree/regles.js');
  const TX = await charger('/src/entree/textes.js');
  const FIN = await charger('/src/entree/EtapeFin.jsx');
  const EA = await charger('/src/entree/ebayApres.js');

  // ── 1. L'ordre : la voie de publication juste après « Où tu vends ? », jamais d'étape eBay ni « free » ───────────
  console.log('1. L\'ordre des étapes (plan.js)');
  // (18/11/2026, lot T1 — refonte de l'accueil, changement voulu par Nico) Le plan lit `surTelephone` (vrai = téléphone) :
  // le contexte le porte ; la voie peut aussi valoir 'sans_cloud' (« Plus tard » sur le Cloud).
  const formulesCtx = (o) => ({ parcours: true, actif: false, choisie: null, choisieAvecEssai: false, ...o });
  const cx = ({ tel = true, formules = false, cloud = false, voie = null, actif = false, grille = true, palier = 'gratuit', plateformes = ['vinted', 'ebay'], pseudo = true, f = {} }) => ({
    surTelephone: tel, choix: { plateformes, debute: plateformes.length === 0 }, demanderPseudo: pseudo, voie,
    cloud: { parcours: tel && cloud, actif, ouvert: tel && cloud },
    formules: tel && formules ? formulesCtx({ actif, ...f }) : { parcours: false },
    plan: R.planEntree?.(grille ? K1 : { ...K1, grille_trois_jauges: 0 }, palier) ?? null,
  });
  const ids = (c) => (typeof P.etapesVisibles === 'function' ? P.etapesVisibles(c).map((e) => e.id) : []);
  const RETIREES_1811 = ['voie', 'cloud_presentation', 'cloud_offres', 'republication', 'formule', 'fin'];
  let combos = 0, sansEbayNiFree = 0, sansRetiree = 0, voieDAbord = 0;
  for (const tel of [true, false]) for (const formules of [true, false]) for (const cloud of [true, false]) for (const voie of [null, 'cloud', 'extension', 'sans_cloud'])
    for (const actif of [false, true]) for (const grille of [true, false]) for (const palier of ['gratuit', 'premium']) for (const plateformes of [['vinted', 'ebay'], ['ebay'], ['leboncoin'], []]) {
      const l = ids(cx({ tel, formules, cloud, voie, actif, grille, palier, plateformes, f: voie === 'cloud' ? { choisie: 'pro_cloud', choisieAvecEssai: true } : {} }));
      combos++;
      if (!l.includes('ebay') && !l.includes('free')) sansEbayNiFree++;
      if (!RETIREES_1811.some((x) => l.includes(x))) sansRetiree++;
      // (18/11/2026, lot T1) La 2e étape EST le choix de la voie, sans exception : « As-tu un ordinateur ? » sur tout
      // téléphone (voie choisie ou non, reprise comprise) ; sur ordinateur, l'extension.
      const attendue = tel ? 'ordinateur' : 'extension';
      if (l[0] === 'plateformes' && l[1] === attendue) voieDAbord++;
    }
  ok(combos > 0 && sansEbayNiFree === combos, `aucune étape « ebay » ni « free » dans le parcours (${sansEbayNiFree}/${combos} cas)`);
  ok(combos > 0 && sansRetiree === combos, `aucune étape retirée le 18/11 (${RETIREES_1811.join(', ')}) dans le parcours (${sansRetiree}/${combos} cas)`);
  ok(combos > 0 && voieDAbord === combos, `la 2e étape est TOUJOURS le choix de la voie : « As-tu un ordinateur ? » (téléphone), l'extension (ordinateur) (${voieDAbord}/${combos} cas)`);
  const j = (c) => ids(c).join(' › ');
  ok(j(cx({ tel: true, formules: true })) === 'plateformes › ordinateur › releve › pseudo',
    'téléphone, formules ouvertes, eBay coché : « As-tu un ordinateur ? » juste après « Où tu vends ? »', j(cx({ tel: true, formules: true })));
  ok(j(cx({ tel: true, formules: true, voie: 'cloud', f: { choisie: 'pro_cloud', choisieAvecEssai: true } })) === 'plateformes › ordinateur › cloud_offre › releve › pseudo',
    'téléphone, « Non, seulement mon téléphone » : UN écran Cloud (l\'essai s\'y dit), puis le relevé', j(cx({ tel: true, formules: true, voie: 'cloud', f: { choisie: 'pro_cloud', choisieAvecEssai: true } })));
  ok(j(cx({ tel: true, formules: true, cloud: true, voie: 'cloud', actif: true, palier: 'pro', f: { choisie: 'pro_cloud', choisieAvecEssai: true } })) === 'plateformes › ordinateur › cloud_offre › cloud_connexion › releve › pseudo',
    'formule prise à l\'essai : « Connecte tes comptes », puis le relevé (« Ta formule Pro + Cloud » retirée le 18/11)',
    j(cx({ tel: true, formules: true, cloud: true, voie: 'cloud', actif: true, palier: 'pro', f: { choisie: 'pro_cloud', choisieAvecEssai: true } })));
  ok(j(cx({ tel: true, formules: true, voie: 'sans_cloud' })) === 'plateformes › ordinateur › sans_cloud › pseudo',
    '« Plus tard » sur le Cloud : « il te faut un ordinateur », ni relevé ni début (rien ne pourrait partir)', j(cx({ tel: true, formules: true, voie: 'sans_cloud' })));
  ok(j(cx({ tel: false })) === 'plateformes › extension › releve › pseudo', 'ordinateur, eBay coché : l\'extension juste après', j(cx({ tel: false })));
  ok(j(cx({ tel: true, cloud: true, voie: 'cloud', actif: true, plateformes: [] })) === 'plateformes › ordinateur › cloud › cloud_connexion › debut › pseudo',
    'Cloud seul (Android avant la vc38) et rien en ligne : « As-tu un ordinateur ? », puis l\'écran Cloud d\'avant', j(cx({ tel: true, cloud: true, voie: 'cloud', actif: true, plateformes: [] })));
  // (18/11/2026, lot T1 — refonte de l'accueil, changement voulu par Nico) : plus de « Passer » en haut ni de récap. La
  // garantie « aucune étape ne bloque l'entrée » passe par la coque : la DERNIÈRE étape visible fait sortir du parcours.
  const coque = sansCommentaires(lire('src/entree/ParcoursEntree.jsx'));
  ok(Array.isArray(P.ETAPES) && P.ETAPES.every((e) => !('passable' in e)) && !P.ETAPES.some((e) => e.id === 'fin')
    && /if \(index >= liste\.length - 1\) \{ terminer\(\); return; \}/.test(coque),
    'plus de « Passer » ni de récap : aucune étape « passable », la dernière étape visible fait sortir (coque)');
  // Les règles Cloud du plan ne bougent pas (mêmes prédicats, mot pour mot).
  // (18/11/2026, lot T1 — refonte de l'accueil, changement voulu par Nico) : ce sont désormais ceux de la refonte.
  const plan = sansCommentaires(lire('src/entree/plan.js'));
  for (const l of [
    'const formules = (c) => c.formules?.parcours === true;',
    'const telephone = (c) => c.surTelephone === true;',
    'const cloudActif = (c) => (formules(c) ? c.formules.actif === true && c.cloud?.ouvert === true : c.cloud?.actif === true);',
    "{ id: 'ordinateur', visible: telephone }",
    "{ id: 'cloud_offre', visible: (c) => telephone(c) && c.voie === 'cloud' && formules(c) }",
    "{ id: 'cloud', visible: (c) => telephone(c) && c.voie === 'cloud' && !formules(c) && c.cloud?.parcours === true }",
    "{ id: 'sans_cloud', visible: (c) => telephone(c) && c.voie === 'sans_cloud' }",
    "{ id: 'cloud_connexion', visible: (c) => telephone(c) && c.voie === 'cloud' && cloudActif(c) }",
    "{ id: 'extension', visible: (c) => !telephone(c) || c.voie === 'extension' }",
  ]) ok(plan.includes(l), `règle Cloud inchangée : ${l.slice(0, 60)}…`);

  // ── 2. La reprise : un appareil arrêté sur une étape retirée repart à la suivante, jamais au début ────────────────
  console.log('\n2. La reprise d\'un parcours commencé avant (fs_entree_etape = une étape retirée)');
  const liste = typeof P.etapesVisibles === 'function' ? P.etapesVisibles(cx({ tel: true, formules: true })) : [];
  ok(typeof P.indexDeReprise === 'function', 'plan.js rend indexDeReprise', P.__erreur);
  if (typeof P.indexDeReprise === 'function') {
    ok(liste[P.indexDeReprise(liste, 'ebay')]?.id === 'ordinateur', '« ebay » (retirée) → l\'étape qui suit « Où tu vends ? »');
    // (18/11/2026, lot T1) La republication est retirée aussi : « free » reprend après le relevé.
    ok(liste[P.indexDeReprise(liste, 'free')]?.id === 'pseudo', '« free » (retirée) → l\'étape qui suit le relevé (la republication est retirée aussi, 18/11)');
    // (18/11/2026, lot T1 — refonte de l'accueil, changement voulu par Nico) Les étapes retirées par la refonte.
    const reprises = [['voie', 'ordinateur'], ['cloud_presentation', 'ordinateur'], ['cloud_offres', 'ordinateur'], ['republication', 'pseudo'], ['formule', 'pseudo'], ['fin', 'pseudo']]
      .map(([x, a]) => [x, a, liste[P.indexDeReprise(liste, x)]?.id]);
    ok(reprises.every(([, a, v]) => a === v), 'retirées le 18/11 : voie, cloud_presentation, cloud_offres → « As-tu un ordinateur ? » ; republication, formule, récap → l\'étape d\'après',
      reprises.map(([x, a, v]) => `${x}→${v} (attendu ${a})`).join(', '));
    const sansPseudo = P.etapesVisibles(cx({ tel: true, formules: true, pseudo: false }));
    ok(sansPseudo[P.indexDeReprise(sansPseudo, 'fin')]?.id === 'releve' && P.indexDeReprise(sansPseudo, 'fin') === sansPseudo.length - 1,
      'le récap (retiré), nom déjà connu : la dernière étape qui reste (jamais le début)');
    ok(P.indexDeReprise(liste, 'releve') === liste.findIndex((e) => e.id === 'releve') && P.indexDeReprise(liste, null) === 0 && P.indexDeReprise(liste, 'inconnue') === 0,
      'une étape connue reprend à sa place ; rien ou inconnu → le début');
  }
  ok(/indexDeReprise\(liste, etapeId\)/.test(coque), 'la coque reprend par indexDeReprise');

  // ── 3. eBay APRÈS le parcours : le consentement ne s'ouvre qu'une fois le parcours marqué fini ────────────────────
  // (18/11/2026, lot T1 — refonte de l'accueil, changement voulu par Nico) Le récap n'est plus dans le plan ; son écran
  // (EtapeFin) et entree/ebayApres.js restent, inchangés et montables : leurs verrous (sections 3 et 4) restent tels quels.
  console.log('\n3. eBay après le parcours (entree/ebayApres.js, récap)');
  ok(typeof EA.relierEbayApresEntree === 'function', 'entree/ebayApres.js rend relierEbayApresEntree', EA.__erreur);
  if (typeof EA.relierEbayApresEntree === 'function') {
    const appels = [];
    const r = await EA.relierEbayApresEntree({
      lang: 'fr',
      demarrer: async (l) => { appels.push(`demarrer:${l}`); return { url: 'https://auth.ebay.com/consent?x=1' }; },
      terminer: async () => { await new Promise((res) => setTimeout(res, 5)); appels.push('terminer'); },
      ouvrir: async (u) => { appels.push(`ouvrir:${u}`); },
      journaliser: (c, x) => appels.push(`log:${c}${x?.apres_parcours ? '+apres' : ''}`),
    });
    ok(r?.ok === true && appels.join(' > ') === 'log:ebay_apres_parcours > demarrer:fr > terminer > log:ebay_oauth_ouvert+apres > ouvrir:https://auth.ebay.com/consent?x=1',
      'ordre : l\'adresse d\'eBay demandée, le parcours MARQUÉ FINI (attendu), puis seulement la page eBay', appels.join(' > '));
    const a2 = [];
    const r2 = await EA.relierEbayApresEntree({ lang: 'fr', demarrer: async () => { throw new Error('réseau'); }, terminer: async () => a2.push('terminer'), ouvrir: async () => a2.push('ouvrir'), journaliser() {} });
    ok(r2?.ok === false && a2.length === 0 && typeof r2?.erreur === 'string', 'eBay indisponible : on reste sur le récap (ni fin, ni page eBay), l\'erreur est rendue', JSON.stringify(r2));
    const a3 = [];
    const r3 = await EA.relierEbayApresEntree({ lang: 'en', demarrer: async () => ({ consent_url: 'https://e/c' }), terminer: async () => a3.push('terminer'), ouvrir: async (u) => a3.push(u), journaliser() {} });
    ok(r3?.ok === true && a3.join(',') === 'terminer,https://e/c', 'réponse plus ancienne (consent_url) : même ordre');
  }
  const ea = sansCommentaires(lire('src/entree/ebayApres.js'));
  ok(/await terminer\(/.test(ea) && ea.indexOf('await terminer(') < ea.indexOf('ouvrir('), 'source : terminer() est ATTENDU avant ouvrir()');
  ok(/relierEbayApresEntree\(/.test(coque) && /demarrerConnexionEbay/.test(coque) && /ouvrirConsentementEbay/.test(coque) && /const terminer = async \(\{ ensuite = null \} = \{\}\)/.test(coque),
    'la coque : terminer({ ensuite }) et le chemin eBay existant (demarrerConnexionEbay, ouvrirConsentementEbay)');
  const fin = sansCommentaires(lire('src/entree/EtapeFin.jsx'));
  ok(/onTerminer\(\{ ensuite: 'ebay' \}\)/.test(fin) && /onClick=\{\(\) => onTerminer\(\)\}/.test(fin), 'le récap : « Relier eBay » → terminer puis eBay ; le bouton principal → terminer seul');

  // ── 4. Le récap : TOUTE l'information du plan Free, aucun bouton d'achat ──────────────────────────────────────────
  console.log('\n4. Le récap (EtapeFin) porte le plan Free');
  const ctx = (o = {}) => {
    const lang = o.lang ?? 'fr';
    return {
      lang, fr: lang !== 'en', user: { id: 'u1', email: 'a@b.c' }, surTelephone: o.tel ?? true,
      choix: { plateformes: o.plateformes ?? ['vinted', 'ebay'], debute: false }, extensionVue: false,
      envoi: { etat: o.envoi ?? 'idle' }, releve: { etat: 'idle' }, murs: [], releveVinted: null, ebayRelie: o.ebayRelie ?? false,
      journaliser() {}, K: K1, grille: true, plan: R.planEntree?.(K1, o.palier ?? 'gratuit') ?? null, palier: o.palier ?? 'gratuit',
      voie: o.voie ?? null, cloud: { parcours: false, actif: false, connexions: null }, cloudChoisi: false, cloudPris: o.cloudPris ?? false,
      formules: { parcours: false }, plateforme: 'ios',
    };
  };
  const rendre = (c, extra = {}) => (typeof FIN.default === 'function'
    ? renderToStaticMarkup(h(FIN.default, { c, T: TX.textesEntree(c.lang), pseudo: '', onTerminer() {}, ...extra })) : '');
  const htmlFin = rendre(ctx());
  const f = texte(htmlFin).replace(/✓ ?/g, '');
  ok(/Ton plan Free/.test(f) && /Ce que tu as chaque mois, sans payer/.test(f), 'le récap nomme le plan Free et ce qu\'il est', f.slice(0, 500));
  ok(/5 annonces rédigées par l.IA ou scannées avec Lens/.test(f) && /50 publications une mise en ligne sur une plateforme/.test(f) && /30 remontées une annonce remise en haut sur une plateforme/.test(f),
    'les 3 chiffres (lus dans coin_config) et ce qu\'ils comptent', f);
  ok(/Tes compteurs repartent à zéro chaque mois, à la date de ton inscription\./.test(f), 'la remise à zéro');
  ok(/Sans limite, même en Free Import de tout ton stock, depuis toutes tes plateformes Retrait automatique partout après une vente Synchronisation de tes annonces/.test(f), 'ce qui est sans limite');
  ok(/Exemple : un article publié sur Vinted et Leboncoin compte 1 annonce et 2 publications\./.test(f) && /Besoin de plus un jour \? Les formules sont dans Réglages › Abonnement\./.test(f),
    'l\'exemple et « Besoin de plus un jour ? »');
  ok(!/Premium|Business|€|S.abonner|Passer à/.test(f), 'aucun prix, aucun nom de formule payante, aucun achat dans le récap d\'un Free', f);
  ok(/Relier eBay/.test(f) && (htmlFin.match(/data-entree="fin-ebay"/g) ?? []).length === 1, 'eBay choisi et pas relié : « Relier eBay » dans le récap (après le parcours)', f);
  ok(!/Relier eBay/.test(texte(rendre(ctx({ ebayRelie: true })))) && !/Relier eBay/.test(texte(rendre(ctx({ plateformes: ['vinted'] })))), 'eBay relié, ou pas choisi : rien à relier');
  const fp = texte(rendre(ctx({ palier: 'premium' })));
  ok(/Ton plan Premium : 40 annonces, 400 publications, 1 500 remontées/.test(fp) && !/Ce que tu as chaque mois, sans payer/.test(fp), 'un Premium : sa ligne « Ton plan », pas le bloc Free', fp);
  const fe = texte(rendre(ctx({ lang: 'en' })));
  ok(/Your Free plan/.test(fe) && /What you get each month, without paying/.test(fe) && /Link eBay/.test(fe) && !/Ton plan|Relier|Réglages/.test(fe), 'anglais : le bloc Free et « Link eBay », aucun mot français', fe);
  ok((htmlFin.match(/<button/g) ?? []).length === 2, 'deux boutons seulement : « Entrer dans FillSell » et « Relier eBay »', String((htmlFin.match(/<button/g) ?? []).length));

  // ── 5. Les mesures : chaque écran vu laisse une trace, la fin aussi ───────────────────────────────────────────────
  console.log('\n5. La télémétrie du parcours');
  // (18/11/2026, lot T1) + chemin (voie, « a_choisir » ou « ordinateur_web ») et appareil, à l'écran vu comme à la sortie.
  ok(/const rang = index \+ 1;\s*const total = liste\.length;/.test(coque) && /if \(vuesRef\.current\.has\(etape\.id\)\) return;\s*vuesRef\.current\.add\(etape\.id\);\s*journaliser\('etape_vue', \{ etape: etape\.id, rang, total, chemin: c\.voie \?\? \(c\.surTelephone \? 'a_choisir' : 'ordinateur_web'\), appareil: c\.plateforme \}\);/.test(coque),
    'chaque écran vu : etape_vue { etape, rang, total, chemin, appareil } (une fois par écran)');
  ok(/journaliser\('parcours_termine', \{ destination, ensuite, chemin: c\.voie \?\? \(c\.surTelephone \? 'a_choisir' : 'ordinateur_web'\), appareil: c\.plateforme \}\)/.test(coque),
    'la sortie : parcours_termine { destination, ensuite, chemin, appareil }');
  // L'écran des remontées n'est plus dans le plan (18/11) ; son fichier reste, sa trace aussi.
  ok(/c\.journaliser\('republication_comprise'\)/.test(sansCommentaires(lire('src/entree/EtapeRepublication.jsx'))), 'l\'écran des remontées : republication_comprise');
  // (18/11/2026, lot T1 — refonte de l'accueil, changement voulu par Nico) : plus de « Passer » en haut, donc plus de
  // passe_<étape> à verrouiller ; « plus_tard » vit sur le « Plus tard » du bas de l'écran extension, le retour arrière se
  // journalise « retour ».
  ok(/c\.journaliser\('plus_tard'\); onSuivant\(\);/.test(sansCommentaires(lire('src/entree/EtapeExtension.jsx'))) && /c\.journaliser\('plateformes', \{ plateformes, debute \}\)/.test(sansCommentaires(lire('src/entree/EtapePlateformes.jsx')))
    && /c\.journaliser\('retour', \{ depuis: etape\.id \}\)/.test(coque),
    'les valeurs historiques restent (plateformes, plus_tard) ; le retour arrière : retour { depuis }');
  ok(/marquerEntreeFaite\(user\?\.id\)/.test(coque) && /marquerEntreeFaiteAuVol\(user\.id, c\.jetonRef\.current\)/.test(coque), 'le drapeau onboarded_at reste posé à la fin ET à la sortie en route');
} finally {
  await vite.close();
}

console.log(`\n${rouges ? `✗ entree-ordre : ${rouges} rouge(s), ${verts} vert(s)` : `✓ entree-ordre : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
