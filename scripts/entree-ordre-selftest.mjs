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
  const formulesCtx = (o) => ({ parcours: true, actif: false, choisie: null, choisieAvecEssai: false, ...o });
  const cx = ({ tel = true, formules = false, cloud = false, voie = null, actif = false, grille = true, palier = 'gratuit', plateformes = ['vinted', 'ebay'], pseudo = true, f = {} }) => ({
    choix: { plateformes, debute: plateformes.length === 0 }, demanderPseudo: pseudo, voie,
    cloud: { parcours: tel && cloud, actif, ouvert: tel && cloud },
    formules: tel && formules ? formulesCtx({ actif, ...f }) : { parcours: false },
    plan: R.planEntree?.(grille ? K1 : { ...K1, grille_trois_jauges: 0 }, palier) ?? null,
  });
  const ids = (c) => (typeof P.etapesVisibles === 'function' ? P.etapesVisibles(c).map((e) => e.id) : []);
  let combos = 0, sansEbayNiFree = 0, voieDAbord = 0;
  for (const tel of [true, false]) for (const formules of [true, false]) for (const cloud of [true, false]) for (const voie of [null, 'cloud', 'extension'])
    for (const grille of [true, false]) for (const palier of ['gratuit', 'premium']) for (const plateformes of [['vinted', 'ebay'], ['ebay'], ['leboncoin'], []]) {
      const l = ids(cx({ tel, formules, cloud, voie, grille, palier, plateformes, f: voie === 'cloud' ? { choisie: 'pro_cloud', choisieAvecEssai: true } : {} }));
      combos++;
      if (!l.includes('ebay') && !l.includes('free')) sansEbayNiFree++;
      const attendue = tel && formules ? 'ordinateur' : tel && cloud && !formules ? 'voie' : 'extension';
      const deuxieme = l[1];
      // Sur la voie Cloud déjà choisie (reprise), la 2e étape reste la question de la voie ; ensuite viennent ses écrans.
      if (l[0] === 'plateformes' && (deuxieme === attendue || (attendue === 'extension' && ['cloud', 'voie'].includes(deuxieme)))) voieDAbord++;
    }
  ok(combos > 0 && sansEbayNiFree === combos, `aucune étape « ebay » ni « free » dans le parcours (${sansEbayNiFree}/${combos} cas)`);
  ok(combos > 0 && voieDAbord === combos, `la 2e étape est TOUJOURS le choix de la voie de publication (${voieDAbord}/${combos} cas)`);
  const j = (c) => ids(c).join(' › ');
  ok(j(cx({ tel: true, formules: true })) === 'plateformes › ordinateur › extension › releve › republication › pseudo › fin',
    'téléphone, formules ouvertes, eBay coché : « As-tu un ordinateur ? » juste après « Où tu vends ? »', j(cx({ tel: true, formules: true })));
  ok(j(cx({ tel: true, formules: true, voie: 'cloud', f: { choisie: 'pro_cloud', choisieAvecEssai: true } })) === 'plateformes › ordinateur › cloud_presentation › cloud_offres › cloud › releve › republication › pseudo › fin',
    'téléphone, « Non, seulement mon téléphone » : le Cloud 7 jours, puis le relevé', j(cx({ tel: true, formules: true, voie: 'cloud', f: { choisie: 'pro_cloud', choisieAvecEssai: true } })));
  ok(j(cx({ tel: true, formules: true, voie: 'cloud', actif: true, palier: 'pro', f: { choisie: 'pro_cloud', choisieAvecEssai: true } })) === 'plateformes › ordinateur › cloud_presentation › cloud_offres › cloud › releve › republication › formule › pseudo › fin',
    'formule prise à l\'essai : « Ta formule Pro + Cloud » reste (inchangé)');
  ok(j(cx({ tel: false })) === 'plateformes › extension › releve › republication › pseudo › fin', 'ordinateur, eBay coché : l\'extension juste après', j(cx({ tel: false })));
  ok(j(cx({ tel: true, cloud: true, voie: 'cloud', actif: true, plateformes: [] })) === 'plateformes › voie › cloud › cloud_connexion › debut › republication › pseudo › fin',
    'Cloud seul (Android avant la vc38) et rien en ligne : inchangé hors eBay', j(cx({ tel: true, cloud: true, voie: 'cloud', actif: true, plateformes: [] })));
  ok(Array.isArray(P.ETAPES) && P.ETAPES.filter((e) => e.passable === false).map((e) => e.id).join(',') === 'fin', 'chaque étape reste passable, sauf le récap');
  // Les règles Cloud du plan ne bougent pas (mêmes prédicats, mot pour mot).
  const plan = sansCommentaires(lire('src/entree/plan.js'));
  for (const l of [
    "{ id: 'ordinateur', visible: formules }",
    "{ id: 'voie', visible: (c) => !formules(c) && c.cloud?.parcours === true }",
    "{ id: 'cloud_presentation', visible: voieFormuleChoisie }",
    "{ id: 'cloud_offres', visible: voieFormuleChoisie }",
    "{ id: 'cloud', visible: (c) => voieCloudChoisie(c) || essaiFormuleChoisi(c) }",
    "{ id: 'cloud_connexion', visible: (c) => (voieCloudChoisie(c) && c.cloud.actif === true) || (voieFormuleChoisie(c) && c.formules.actif === true && c.cloud?.ouvert === true) }",
    "{ id: 'extension', visible: (c) => !voieCloudChoisie(c) && !voieFormuleChoisie(c) }",
  ]) ok(plan.includes(l), `règle Cloud inchangée : ${l.slice(0, 60)}…`);

  // ── 2. La reprise : un appareil arrêté sur une étape retirée repart à la suivante, jamais au début ────────────────
  console.log('\n2. La reprise d\'un parcours commencé avant (fs_entree_etape = ebay | free)');
  const liste = typeof P.etapesVisibles === 'function' ? P.etapesVisibles(cx({ tel: true, formules: true })) : [];
  ok(typeof P.indexDeReprise === 'function', 'plan.js rend indexDeReprise', P.__erreur);
  if (typeof P.indexDeReprise === 'function') {
    ok(liste[P.indexDeReprise(liste, 'ebay')]?.id === 'ordinateur', '« ebay » (retirée) → l\'étape qui suit « Où tu vends ? »');
    ok(liste[P.indexDeReprise(liste, 'free')]?.id === 'pseudo', '« free » (retirée) → l\'étape qui suit la republication');
    ok(P.indexDeReprise(liste, 'releve') === liste.findIndex((e) => e.id === 'releve') && P.indexDeReprise(liste, null) === 0 && P.indexDeReprise(liste, 'inconnue') === 0,
      'une étape connue reprend à sa place ; rien ou inconnu → le début');
  }
  const coque = sansCommentaires(lire('src/entree/ParcoursEntree.jsx'));
  ok(/indexDeReprise\(liste, etapeId\)/.test(coque), 'la coque reprend par indexDeReprise');

  // ── 3. eBay APRÈS le parcours : le consentement ne s'ouvre qu'une fois le parcours marqué fini ────────────────────
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
  ok(/const rang = index \+ 1;\s*const total = liste\.length;/.test(coque) && /if \(vuesRef\.current\.has\(etape\.id\)\) return;\s*vuesRef\.current\.add\(etape\.id\);\s*journaliser\('etape_vue', \{ etape: etape\.id, rang, total \}\);/.test(coque),
    'chaque écran vu : etape_vue { etape, rang, total } (une fois par écran)');
  ok(/journaliser\('parcours_termine', \{ destination, ensuite \}\)/.test(coque), 'la sortie : parcours_termine { destination, ensuite }');
  ok(/c\.journaliser\('republication_comprise'\)/.test(sansCommentaires(lire('src/entree/EtapeRepublication.jsx'))), 'l\'écran des remontées : republication_comprise');
  ok(/journaliser\(etape\.id === 'extension' \? 'plus_tard' : `passe_\$\{etape\.id\}`\)/.test(coque) && /c\.journaliser\('plateformes', \{ plateformes, debute \}\)/.test(sansCommentaires(lire('src/entree/EtapePlateformes.jsx'))),
    'les valeurs historiques restent (plateformes, plus_tard, passe_*)');
  ok(/marquerEntreeFaite\(user\?\.id\)/.test(coque) && /marquerEntreeFaiteAuVol\(user\.id, c\.jetonRef\.current\)/.test(coque), 'le drapeau onboarded_at reste posé à la fin ET à la sortie en route');
} finally {
  await vite.close();
}

console.log(`\n${rouges ? `✗ entree-ordre : ${rouges} rouge(s), ${verts} vert(s)` : `✓ entree-ordre : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
