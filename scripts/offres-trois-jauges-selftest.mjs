// ═══════════════════════════════════════════════════════════════════════════
// LES OFFRES ET LES MURS DE LA GRILLE À 3 JAUGES (04/11/2026, maquettes validées par Nico le 03/11)
//     npm run selftest:offres-trois-jauges
//     (node --import ./scripts/loader-ext.mjs scripts/offres-trois-jauges-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
// ConversionModal et PlanDetailsModal RENDUS côté serveur (Vite SSR + react-dom/server, comme cloud-ecrans), sans
// réseau ni base. Ce qu'il prouve :
//   1. l'interrupteur : la config de repli ne porte PAS grille_trois_jauges ; à 0 (même avec toutes les clés
//      jauge_* en base), chaque feuille rend EXACTEMENT ce qu'elle rendait — mêmes textes, aucun texte neuf ;
//   2. à 1 : chaque carte (Free, Premium, Pro, Business) = accroche, 3 tuiles, « par mois », les lignes de la
//      maquette ; Business « Tout illimité, sauf Lens… » ; « Dans tous les forfaits » avec Depop et « Comment on
//      compte » ; titres et résumés des payants ; la carte d'ajout du Cloud sous les cartes ;
//   3. les 5 murs (annonces Free → Premium, publications Premium → Pro, remontées Premium → Pro, Lens du
//      Business sans offre, automatique), plus republish_cap → Remontées ; jamais une date inventée ;
//   4. « Ton plan » (PlanDetailsModal) : mêmes tuiles et lignes, AUCUN prix sur le plan en cours, « Aussi dans
//      ton plan », l'upsell existant ;
//   5. les volumes viennent de coin_config (grilleDuPalier), jamais en dur ; jamais « plafond » sur une carte ;
//      jamais « 20 € » écrit en dur ; la télémétrie ne gagne que le geste.
// La config est posée en complétant COIN_CONFIG_FALLBACK le temps d'un rendu (le rendu serveur ne joue pas
// l'effet qui lit coin_config) : c'est l'objet que la feuille lit quand la table n'a pas encore répondu.
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

// La grille posée en base le 04/11 (migration 20261104000000_trois_jauges_interrupteur), interrupteur en plus.
const CLES_JAUGES = {
  jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0,
  jauge_lens_business: 600,
};
const futur = new Date(Date.now() + 12 * 86_400_000).toISOString();
const passe = new Date(Date.now() - 2 * 86_400_000).toISOString();

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
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const PD = await vite.ssrLoadModule('/src/components/PlanDetailsModal.jsx');
  const J = await vite.ssrLoadModule('/src/utils/jauges.js');
  const JR = await vite.ssrLoadModule('/src/utils/jourRemise.js');
  const REPLI = CM.COIN_CONFIG_FALLBACK;
  // Le texte lu à l'écran : sans les feuilles de style, balises retirées (une balise collée à une virgule ou à un
  // point n'ajoute pas d'espace : « <b>5 annonces par mois</b>, rédigées »).
  const texte = (html) => net(html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
  // Une config posée le temps d'un rendu, retirée ensuite (le repli redevient celui du dépôt).
  const avecConfig = (cfg, f) => {
    const avant = Object.keys(cfg).filter((k) => k in REPLI).map((k) => [k, REPLI[k]]);
    Object.assign(REPLI, cfg);
    try { return f(); } finally { for (const k of Object.keys(cfg)) delete REPLI[k]; Object.assign(REPLI, Object.fromEntries(avant)); }
  };
  const GRILLE = { ...CLES_JAUGES, grille_trois_jauges: 1 };
  const drap = {
    free: {}, premium: { isPremium: true }, pro: { isPremium: true, isPro: true }, business: { isPremium: true, isPro: true, isBusiness: true },
  };
  const base = { isOpen: true, onClose() {}, onUpgrade() {}, userId: 'compte-ordinaire' };
  const modaleHtml = (palier, props = {}, lang = 'fr') => renderToStaticMarkup(h(CM.default, { ...base, lang, ...drap[palier], ...props }));
  const modale = (palier, props = {}, lang = 'fr') => texte(modaleHtml(palier, props, lang));
  const fauxSupabase = { from: () => ({ select: () => new Promise(() => {}) }) };
  const planHtml = (palier, lang = 'fr') => renderToStaticMarkup(h(PD.default, {
    lang, onClose() {}, supabase: fauxSupabase, userId: 'compte-ordinaire', isPro: palier !== 'premium', isBusiness: palier === 'business',
    onUpgradePro() {}, onUpgradeBusiness() {},
  }));
  const plan = (palier, lang = 'fr') => texte(planHtml(palier, lang));
  // (04/11, décision de Nico) Les murs écrivent la date en JJ/MM (« Attendre le 16/11 ») : jourRemiseCourt.
  const jour = JR.jourRemiseCourt(futur, 'fr');
  const avant = (t, a, b) => t.indexOf(a) >= 0 && t.indexOf(b) > t.indexOf(a);

  // ── 1. L'interrupteur ─────────────────────────────────────────────────────
  console.log('1. L’interrupteur : à 0, rien ne change');
  ok(!('grille_trois_jauges' in REPLI) && !J.grilleActiveConfig(REPLI), 'COIN_CONFIG_FALLBACK ne porte PAS grille_trois_jauges : config illisible → la feuille d’avant');
  ok(Object.keys(REPLI).every((k) => !k.startsWith('jauge_')), 'aucune clé jauge_* ajoutée au repli');
  // (06/11) Depop est nommée aussi dans le bloc d'aujourd'hui (« eBay, Beebs & Depop ») : seule la liste de la grille
  // (« Beebs et Depop ») reste un texte neuf.
  const NEUFS = [/Vends plus, en faisant moins/, /Comment on compte/, /Beebs et Depop/,/Pour démarrer, sans payer/, /Pour vendre plus, toi-même/,
    /Pour que ça tourne tout seul/, /Pour publier sans compter/, /Bordereaux Vinted/, /Tout illimité/, /Voir toutes les formules/,
    /Laisse FillSell travailler pour toi/, /Publie sans compter/, /Aujourd'hui :/, /Attendre le/, /Aussi dans ton plan/, /remontées/,
    /scans Lens/, /Pas maintenant/];
  const CAS_0 = [
    ['free', {}], ['premium', {}], ['pro', {}], ['business', {}],
    ['free', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 5, consommes: 5, restantes: 0, remise_le: futur } }],
    ['premium', { trigger: 'quota_geste', quotaInfo: { geste: 'publications', plafond: 400, consommes: 400, remise_le: futur } }],
    ['premium', { trigger: 'quota_geste', quotaInfo: { geste: 'remontees', plafond: 1500, consommes: 1500, remise_le: futur } }],
    ['business', { trigger: 'quota_geste', quotaInfo: { geste: 'lens', plafond: 600, consommes: 600, remise_le: futur } }],
    ['free', { trigger: 'republish_cap', plafondRepub: { plafond: 50, faites: 50, remise_le: futur } }],
    ['free', { trigger: 'republish_auto', repubOffertes: { restantes: 18, plafond: 50, remise_le: futur } }],
    ['premium', { trigger: 'republish_auto' }],
  ];
  const variantesA0 = [
    ['sans clé', {}], ['clés jauge_* en base, interrupteur 0', { ...CLES_JAUGES, grille_trois_jauges: 0 }],
    ['interrupteur « 0 » (texte)', { ...CLES_JAUGES, grille_trois_jauges: '0' }], ['interrupteur null', { ...CLES_JAUGES, grille_trois_jauges: null }],
  ];
  for (const lang of ['fr', 'en']) {
    const references = CAS_0.map(([p, props]) => modaleHtml(p, props, lang));
    const refPlans = ['premium', 'pro', 'business'].map((p) => planHtml(p, lang));
    for (const [nom, cfg] of variantesA0.slice(1)) {
      const rendus = avecConfig(cfg, () => CAS_0.map(([p, props]) => modaleHtml(p, props, lang)));
      const plans = avecConfig(cfg, () => ['premium', 'pro', 'business'].map((p) => planHtml(p, lang)));
      ok(rendus.every((r, i) => r === references[i]), `${lang} · ${nom} : les ${CAS_0.length} feuilles sont identiques octet pour octet à celles sans clé`);
      ok(plans.every((r, i) => r === refPlans[i]), `${lang} · ${nom} : « Ton plan » identique octet pour octet (Premium, Pro, Business)`);
    }
  }
  {
    const tous = CAS_0.map(([p, props]) => modale(p, props)).join(' || ') + ' || ' + ['premium', 'pro', 'business'].map((p) => plan(p)).join(' || ');
    const trouves = NEUFS.filter((m) => m.test(tous));
    ok(trouves.length === 0, 'à 0 : aucun texte neuf de la grille, nulle part', trouves.join(' · '));
  }
  {
    const free = modale('free');
    ok(/Tu es en Free/.test(free) && /Débloque tout FillSell\./.test(free) && /Publication sur Vinted, Leboncoin, eBay, Beebs & Depop/.test(free)
      && /Import de tes annonces depuis toutes tes plateformes/.test(free) && /5 annonces créées et publiées sur toutes tes plateformes par mois/.test(free)
      && /50 republications par mois/.test(free) && /Passer Premium/.test(free) && /Passer Pro/.test(free) && /Non merci/.test(free),
    'à 0, Free : « Débloque tout FillSell. », le bloc et les lignes d’aujourd’hui', free.slice(0, 400));
    ok(/Passe au volume supérieur\./.test(modale('premium')) && /Rester en Premium/.test(modale('premium')), 'à 0, Premium : « Passe au volume supérieur. »');
    ok(/Le sommet\. Zéro limite\./.test(modale('pro')) && /Rester en Pro/.test(modale('pro')), 'à 0, Pro : « Le sommet. Zéro limite. »');
    ok(/Passe au volume supérieur\./.test(modale('premium', CAS_0[5][1])), 'à 0, Premium au quota : toujours la feuille d’aujourd’hui (aucun mur)');
    const a0 = modale('free', CAS_0[4][1]);
    ok(/Tes annonces du mois sont créées\./.test(a0) && /Ton forfait comprend 5 annonces créées par mois — elles le sont toutes\./.test(a0) && !/data-mur-jauge/.test(modaleHtml('free', CAS_0[4][1])),
      'à 0, Free au quota d’annonces : l’encart d’aujourd’hui, pas de mur', a0.slice(0, 300));
    ok(/Tes republications du mois sont faites\./.test(modale('free', CAS_0[8][1])), 'à 0, republish_cap : « Tes republications du mois sont faites. »');
    ok(/Import & export Excel de ton stock/.test(plan('premium')) && /Support par email/.test(plan('premium')), 'à 0, « Ton plan » : la liste d’aujourd’hui');
  }

  // ── 2. À 1 : les cartes ───────────────────────────────────────────────────
  console.log('2. À 1 : les cartes, les titres, « Dans tous les forfaits »');
  avecConfig(GRILLE, () => {
    ok(J.grilleActiveConfig(REPLI), 'la config de test lève bien l’interrupteur');
    const free = modale('free');
    const freeHtml = modaleHtml('free');
    ok(/^Tu es en Free Vends plus, en faisant moins\./.test(free), 'Free : titre générique « Vends plus, en faisant moins. »', free.slice(0, 120));
    ok(/Dans tous les forfaits Import de tout ton stock, depuis toutes tes plateformes Vinted, Leboncoin, eBay, Beebs et Depop Retrait automatique partout après une vente Commandes vocales/.test(free),
      '« Dans tous les forfaits » : la liste de la maquette, Depop comprise', free.slice(0, 500));
    ok(/Comment on compte 1 annonce : une rédaction par l'IA ou un scan Lens 1 publication : une mise en ligne sur une plateforme 1 remontée : une republication sur une plateforme L'import, la synchro et les retraits ne comptent jamais\./.test(free),
      '« Comment on compte » : les 3 définitions et « ne comptent jamais »');
    ok(avant(free, 'Comment on compte', 'Pour démarrer, sans payer.'), 'le bloc commun AU-DESSUS des cartes');
    const cartes = [
      ['Free', 'Pour démarrer, sans payer.', '5 annonces 50 publications 30 remontées par mois', 'Republication automatique Bordereaux Vinted Retouche IA'],
      ['Premium', 'Pour vendre plus, toi-même.', '40 annonces 400 publications 1 500 remontées par mois', 'Retouche IA : 5 annonces retouchées par mois Support par e-mail Republication automatique Bordereaux Vinted'],
      ['Pro', 'Pour que ça tourne tout seul.', '120 annonces 1 200 publications illimitées remontées par mois',
        'Republication automatique : tes annonces remontent toutes seules, au créneau que tu choisis Bordereaux Vinted inclus, prêts dès la vente Leboncoin, eBay : bientôt Retouche IA : 20 annonces retouchées par mois Support prioritaire'],
      ['Business', 'Pour publier sans compter.', 'illimitées annonces illimitées publications illimitées remontées par mois',
        'Tout illimité, sauf Lens (600 scans par mois) et retouches IA (50 par mois) Tout le Pro : republication automatique, bordereaux Vinted Support prioritaire : tes demandes passent en premier'],
    ];
    for (const [nom, accroche, tuiles, lignes] of cartes) {
      const i = free.indexOf(accroche);
      const bout = free.slice(i, i + 600);
      ok(i > 0 && bout.startsWith(`${accroche} ${tuiles} ${lignes}`), `carte ${nom} : accroche, 3 tuiles, « par mois », lignes de la maquette`, bout.slice(0, 400));
    }
    ok(avant(free, 'Pour démarrer', 'Pour vendre plus') && avant(free, 'Pour vendre plus', 'Pour que ça tourne') && avant(free, 'Pour que ça tourne', 'Pour publier sans compter'),
      'ordre des cartes : Free, Premium, Pro, Business');
    ok(/0 € \/mois Pour démarrer/.test(free) && /12,99 € \/mois Pour vendre plus/.test(free) && /29,99 € \/mois Pour que ça tourne/.test(free) && /59,99 € \/mois Pour publier sans compter/.test(free),
      'en-tête inchangé (badge + prix) au-dessus de l’accroche');
    ok(/Passer Premium/.test(free) && /Passer Pro/.test(free) && /Passer Business/.test(free) && /Non merci$/.test(free), 'les boutons et la sortie « Non merci »');
    ok((freeHtml.match(/data-jauges-carte="/g) ?? []).length === 4, '4 rangées de tuiles (une par carte)');
    // Les croix ne restent que sur l'automatique, les bordereaux et la retouche (Free) — jamais sur Pro/Business.
    const premium = modale('premium');
    ok(/^ton plan actuel|Premium ton plan actuel/.test(premium) && /Laisse FillSell travailler pour toi\. Aujourd'hui : 40 annonces · 400 publications · 1 500 remontées par mois/.test(premium),
      'Premium : « Laisse FillSell travailler pour toi. » + le résumé de la maquette', premium.slice(0, 300));
    ok(!/Dans tous les forfaits/.test(premium) && /Pour que ça tourne tout seul\./.test(premium) && /Pour publier sans compter\./.test(premium) && !/Pour vendre plus/.test(premium) && /Rester en Premium$/.test(premium),
      'Premium : cartes Pro puis Business (pas la sienne), « Rester en Premium »');
    const pro = modale('pro');
    ok(/Publie sans compter\. Aujourd'hui : 120 annonces · 1 200 publications · remontées illimitées par mois/.test(pro) && !/Zéro limite/.test(pro),
      'Pro : « Publie sans compter. » + « remontées illimitées » dans le résumé', pro.slice(0, 300));
    ok(/Pour publier sans compter\./.test(pro) && /Passer Business/.test(pro) && !/Passer Pro/.test(pro) && /Rester en Pro$/.test(pro), 'Pro : la carte Business seule, « Rester en Pro »');
    ok(/Tu es déjà au maximum\./.test(modale('business')), 'Business : « Tu es déjà au maximum. » (inchangé)');
    const en = modale('free', {}, 'en');
    ok(/Sell more, doing less\./.test(en) && /How we count/.test(en) && /Vinted, Leboncoin, eBay, Beebs and Depop/.test(en) && /To get started, for free\./.test(en)
      && /1,500 bumps a month/.test(en) && !/annonces|remontées|Comment on compte|par mois/.test(en), 'en : la même feuille, sans un mot de français', en.slice(0, 300));
    const enPremium = modale('premium', {}, 'en');
    ok(/Let FillSell work for you\. Today: 40 listings · 400 publications · 1,500 bumps a month/.test(enPremium), 'en : résumé du Premium', enPremium.slice(0, 200));
    // Le mot « plafond » et le prix du Cloud en dur : jamais.
    const toutes = [free, premium, pro, en].join(' ');
    ok(!/plafond/i.test(toutes), 'jamais le mot « plafond » sur une carte');
    ok(!/20 €/.test(toutes), 'jamais « 20 € » dans les feuilles');
  });

  // ── 2 bis. Les volumes viennent de coin_config ────────────────────────────
  console.log('2 bis. Les volumes viennent de coin_config (grilleDuPalier), jamais en dur');
  avecConfig({ ...GRILLE, jauge_annonces_free: 7, jauge_publications_free: 77, jauge_remontees_free: 33, jauge_annonces_premium: 41,
    jauge_publications_premium: 404, jauge_remontees_premium: 1777, jauge_remontees_pro: 9000, jauge_lens_business: 650, quota_retouche_premium: 6, quota_retouche_business: 55 }, () => {
    const free = modale('free');
    ok(/7 annonces 77 publications 33 remontées par mois/.test(free) && /41 annonces 404 publications 1 777 remontées par mois/.test(free) && /9 000 remontées/.test(free),
      'tuiles : les valeurs posées dans coin_config, aucune autre', free.slice(0, 900));
    ok(/Retouche IA : 6 annonces retouchées par mois/.test(free) && /Tout illimité, sauf Lens \(650 scans par mois\) et retouches IA \(55 par mois\)/.test(free), 'retouches et Lens lus aussi');
    ok(/Aujourd'hui : 41 annonces · 404 publications · 1 777 remontées par mois/.test(modale('premium')), 'résumé du Premium lu dans coin_config');
    ok(/Tes 7 annonces du mois sont créées\./.test(modale('free', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 7 } }))
      && /Pour créer plus d'annonces : 41 par mois/.test(modale('free', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 7 } })), 'mur : le libellé de la carte lit coin_config');
  });
  {
    const code = lignesDeCode(lire('src/components/ConversionModal.jsx'));
    const corps = code.slice(code.indexOf('function lignesGrille('), code.indexOf('export function CorpsCarteGrille('));
    // Un volume en dur serait dans une chaîne (« 40 annonces », `${…} 600 scans`) — les poids de police (600) n'en sont pas.
    const enDur = /['"`][^'"`\n]*\b(5|30|40|50|120|400|600|1200|1500|1 200|1 500)\b[^'"`\n]*['"`]/;
    ok(corps.length > 500 && !enDur.test(corps.replace(/'\d+px[^']*'|'repeat\([^']*'|'rgba\([^']*'/g, "''")), 'lignes et tuiles : aucun volume écrit en dur dans le code', corps.match(enDur)?.[0]);
    ok(!/20\s?€|20 €/.test(code), 'aucun « 20 € » écrit dans le code de la feuille (le prix du Cloud vit ailleurs)');
    ok(!/\?\?\s*K\.quota_annonces_free/.test(code) && (code.match(/K\.quota_annonces_free/g) ?? []).length === 1, 'jamais le plafond Free prêté à un compte (règle du 26/10)');
  }

  // ── 3. Les murs ───────────────────────────────────────────────────────────
  console.log('3. À 1 : les murs, un par jauge');
  avecConfig(GRILLE, () => {
    const mur = (palier, props) => ({ t: modale(palier, props), html: modaleHtml(palier, props) });
    // 3a. Annonces, Free → Premium
    {
      const { t, html } = mur('free', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 5, consommes: 5, restantes: 0, remise_le: futur, publications_restantes: 41 } });
      ok(/data-mur-jauge="annonces"/.test(html), 'mur Annonces : rendu');
      ok(t.startsWith('Tu es en Free Tes 5 annonces du mois sont créées.'), 'mur Annonces : pastille Free + « Tes 5 annonces du mois sont créées. »', t.slice(0, 120));
      ok(t.includes(`Ton plan Free comprend 5 annonces par mois, rédigées par l'IA ou scannées avec Lens. Elles sont toutes utilisées, rien n'a été décompté. Elles reviennent le ${net(jour)}.`),
        'mur Annonces : le fait, « rien n’a été décompté », la date du serveur', t.slice(0, 500));
      ok(t.includes('Ce qui est déjà rédigé se publie toujours. Il te reste 41 publications ce mois-ci.'), 'mur Annonces : ce qui marche encore (menthe)');
      ok(t.includes("Pour créer plus d'annonces : 40 par mois Premium 12,99 €"), 'mur Annonces : le libellé au-dessus de LA carte Premium', t.slice(300, 700));
      ok(/Passer Premium/.test(t) && !/Passer Pro|Passer Business|Pour que ça tourne/.test(t), 'mur Annonces : UNE carte, le palier qui débloque (le plus proche)');
      ok(avant(t, 'rien n\'a été décompté', 'Ce qui est déjà rédigé') && avant(t, 'Ce qui est déjà rédigé', 'Pour créer plus') && avant(t, 'Passer Premium', 'Voir toutes les formules')
        && t.endsWith(`Voir toutes les formules Attendre le ${net(jour)}`), 'mur Annonces : ordre de la maquette, sortie « Attendre le … »', t.slice(-160));
      ok(!/Dans tous les forfaits|Vends plus/.test(t), 'mur Annonces : ni la vue complète ni ses titres');
    }
    // 3b. Publications, Premium → Pro
    {
      const { t, html } = mur('premium', { trigger: 'quota_geste', quotaInfo: { geste: 'publications', plafond: 400, consommes: 400, restantes: 0, remise_le: futur } });
      ok(/data-mur-jauge="publications"/.test(html) && /ton plan actuel Tes 400 publications du mois sont faites\./.test(t), 'mur Publications : pastille du Premium + « Tes 400 publications du mois sont faites. »', t.slice(0, 160));
      ok(t.includes(`Une publication, c'est une mise en ligne sur une plateforme. Ton plan Premium en comprend 400 par mois : elles sont toutes faites, rien n'a été décompté. Elles reviennent le ${net(jour)}.`),
        'mur Publications : la définition et le fait');
      ok(t.includes("Tes articles restent dans ton stock, rien n'est perdu. L'import, la synchro et le retrait après une vente continuent, sans compter."), 'mur Publications : ce qui marche encore');
      ok(t.includes('Pour publier plus : 1 200 par mois Pro 29,99 €') && /Passer Pro/.test(t) && !/Passer Business/.test(t), 'mur Publications : la carte Pro seule, « Pour publier plus : 1 200 par mois »');
      ok(!/Passe au volume supérieur/.test(t), 'mur Publications : un Premium sait enfin ce qui est plein (plus « Passe au volume supérieur. »)');
    }
    // 3c. Remontées, Premium → Pro
    {
      const { t } = mur('premium', { trigger: 'quota_geste', quotaInfo: { geste: 'remontees', plafond: 1500, consommes: 1500, restantes: 0, remise_le: futur, publications_restantes: 213 } });
      ok(/Tes 1 500 remontées du mois sont faites\./.test(t) && t.includes(`Ton plan Premium en comprend 1 500 par mois : elles sont toutes faites, rien n'a été décompté. Elles reviennent le ${net(jour)}.`),
        'mur Remontées (Premium) : titre et fait', t.slice(0, 300));
      ok(t.includes('Tes annonces restent en ligne et à vendre. Tu peux toujours publier : il te reste 213 publications.'), 'mur Remontées : ce qui marche encore');
      ok(t.includes('Remontées illimitées, et toutes seules Pro 29,99 €') && /Passer Pro/.test(t) && !/Passer Business/.test(t), 'mur Remontées (Premium) : le Pro, « Remontées illimitées, et toutes seules »');
    }
    // 3d. republish_cap (Free) → le mur Remontées
    {
      const { t, html } = mur('free', { trigger: 'republish_cap', plafondRepub: { plafond: 30, faites: 30, remise_le: futur } });
      ok(/data-mur-jauge="remontees"/.test(html) && /^Tu es en Free Tes 30 remontées du mois sont faites\./.test(t), 'republish_cap (Free) : le mur Remontées', t.slice(0, 120));
      ok(t.includes("Une remontée remet une annonce en haut d'une plateforme. Ton plan Free en comprend 30 par mois : elles sont toutes faites, rien n'a été décompté."), 'Free : la définition de la remontée');
      ok(t.includes('Pour remonter plus : 1 500 par mois Premium') && /Passer Premium/.test(t) && !/Passer Pro/.test(t), 'Free : la carte Premium (le plus proche), « Pour remonter plus : 1 500 par mois »');
      ok(!/Tes republications du mois sont faites/.test(t), 'plus l’ancien titre');
    }
    // 3e. Lens du Business : aucune offre
    {
      const { t, html } = mur('business', { trigger: 'quota_geste', quotaInfo: { geste: 'lens', plafond: 600, consommes: 600, restantes: 0, remise_le: futur } });
      ok(/data-mur-jauge="lens"/.test(html) && /Business ton plan actuel Tes 600 scans Lens du mois sont faits\./.test(t), 'mur Lens (Business) : « Tes 600 scans Lens du mois sont faits. »', t.slice(0, 120));
      ok(t.includes(`Ils reviennent le ${net(jour)}. Rien n'a été décompté.`) && t.includes("Tout le reste continue, sans limite. Rédaction par l'IA depuis tes photos, publications et remontées : illimitées."),
        'mur Lens : le fait et « Tout le reste continue, sans limite. »');
      ok(!/Passer|€|Voir toutes les formules/.test(t) && /Fermer$/.test(t) && /<button[^>]*>Fermer<\/button>/.test(html), 'mur Lens : aucune offre, aucun prix, un bouton « Fermer »', t.slice(-200));
      const sansDate = modale('business', { trigger: 'quota_geste', quotaInfo: { geste: 'lens', plafond: 600 } });
      ok(/Tes 600 scans Lens du mois sont faits\. Rien n'a été décompté\./.test(sansDate) && !/reviennent/.test(sansDate), 'mur Lens sans remise connue : « Rien n’a été décompté. » seul');
    }
    // 3f. L'automatique (Free et Premium)
    for (const [palier, props, sous] of [
      ['premium', { trigger: 'republish_auto' }, null],
      ['free', { trigger: 'republish_auto', repubOffertes: { restantes: 18, plafond: 30, remise_le: futur } }, "Il t'en reste 18 ce mois-ci."],
    ]) {
      const { t, html } = mur(palier, props);
      ok(/data-mur-jauge="auto"/.test(html) && t.includes('Laisse tes annonces remonter toutes seules. La republication automatique est incluse dès le Pro. Tu choisis le créneau et les jours : tes annonces remontent sans que tu y penses.'),
        `mur automatique (${palier}) : le texte de la maquette m-auto`, t.slice(0, 300));
      ok(t.includes('Tu peux toujours remonter tes annonces toi-même.') && (sous ? t.includes(sous) : !/Il t'en reste/.test(t)), `mur automatique (${palier}) : ce qui marche encore${sous ? ', ses remontées restantes' : ''}`);
      ok(t.includes('Toutes seules, et illimitées Pro 29,99 €') && /Passer Pro/.test(t) && !/Passer Business/.test(t) && t.endsWith('Voir toutes les formules Pas maintenant'),
        `mur automatique (${palier}) : la carte Pro, « Pas maintenant »`, t.slice(-120));
    }
    // 3g. Jamais une date ni un chiffre inventés
    {
      const sans = modale('premium', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces' } });
      ok(/Tes annonces du mois sont créées\./.test(sans) && !/Tes \d/.test(sans) && !/reviennent/.test(sans) && /Non merci$/.test(sans),
        'sans plafond ni remise rendus : aucun nombre au titre, aucune date, sortie « Non merci »', sans.slice(0, 300));
      ok(/Les annonces de ton plan Premium pour ce mois, rédigées par l'IA ou scannées avec Lens, sont toutes utilisées/.test(sans), 'sans plafond : la phrase ne prête AUCUN nombre');
      const passee = modale('free', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 5, remise_le: passe } });
      ok(!/reviennent|Attendre le/.test(passee), 'remise passée : rien (jamais une date fausse)');
      const sansStock = modale('free', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 5 } });
      ok(!/Il te reste/.test(sansStock), 'publications restantes inconnues : aucune ligne « Il te reste »');
    }
    // 3h. Ce qui garde la feuille d'avant
    {
      const ret = modaleHtml('free', { trigger: 'quota_geste', quotaInfo: { geste: 'retouches', plafond: 0 } });
      ok(!/data-mur-jauge/.test(ret) && /Tes retouches du mois sont faites\./.test(texte(ret)), 'retouches : compteur à part, la feuille d’avant (pas de mur)');
      const lensPro = modaleHtml('pro', { trigger: 'quota_geste', quotaInfo: { geste: 'lens', plafond: 120 } });
      ok(/data-mur-jauge="annonces"/.test(lensPro) && /Pour ne plus compter tes annonces/.test(texte(lensPro)), 'un scan Lens refusé hors Business : le mur Annonces (la jauge qui compte les deux) ; Pro → Business');
      const enMur = modale('premium', { trigger: 'quota_geste', quotaInfo: { geste: 'publications', plafond: 400, remise_le: futur } }, 'en');
      ok(/Your 400 publications for this month are done\./.test(enMur) && /To publish more: 1,200 a month/.test(enMur) && /See all plans/.test(enMur)
        && !/publications du mois|par mois|Voir toutes/.test(enMur), 'en : le mur sans un mot de français', enMur.slice(0, 300));
      const tous = [
        modale('free', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 5, remise_le: futur } }),
        modale('premium', { trigger: 'quota_geste', quotaInfo: { geste: 'publications', plafond: 400 } }),
        modale('premium', { trigger: 'quota_geste', quotaInfo: { geste: 'remontees', plafond: 1500 } }),
        modale('business', { trigger: 'quota_geste', quotaInfo: { geste: 'lens', plafond: 600 } }),
        modale('free', { trigger: 'republish_auto' }),
      ].join(' ');
      ok(!/plafond/i.test(tous) && !/20 €/.test(tous), 'murs : jamais « plafond », jamais « 20 € »');
    }
    // 3i. (04/11, écarts relevés sur les vrais écrans, décisions de Nico) La date en JJ/MM ; le Lens du Business garde
    //     une voie ; l'automatique dit au Premium combien de remontées il lui reste.
    {
      const jj = JR.jourRemiseCourt(futur, 'fr');
      ok(/^\d{2}\/\d{2}$/.test(jj) && jj === new Date(futur).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })
        && JR.jourRemiseCourt(passe, 'fr') === null && JR.jourRemiseCourt(null, 'fr') === null && JR.jourRemiseCourt('nimporte', 'fr') === null,
        `la date des murs : JJ/MM, jour de Paris (« ${jj} ») ; passée, absente ou illisible → rien`);
      for (const [palier, props] of [
        ['premium', { trigger: 'quota_geste', quotaInfo: { geste: 'remontees', plafond: 1500, consommes: 1500, restantes: 0, remise_le: futur } }],
        ['pro', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 120, consommes: 120, restantes: 0, remise_le: futur } }],
        ['premium', { trigger: 'quota_geste', quotaInfo: { geste: 'publications', plafond: 400, consommes: 400, restantes: 0, remise_le: futur } }],
      ]) {
        const t = modale(palier, props);
        ok(t.endsWith(`Attendre le ${net(jj)}`) && t.includes(`reviennent le ${net(jj)}.`) && !/Non merci$/.test(t),
          `mur ${props.quotaInfo.geste} d'un ${palier} : « Attendre le ${jj} » et « … reviennent le ${jj}. » (JJ/MM)`, t.slice(-200));
      }
      ok(/Attendre le \d{2}\/\d{2}$/.test(modale('free', { trigger: 'republish_cap', plafondRepub: { plafond: 30, faites: 30, remise_le: futur } })), 'republish_cap (Free) : « Attendre le JJ/MM » aussi');
      // Le Lens du Business : « Créer une annonce depuis mes photos », seulement si l'hôte sait le faire.
      const lensProps = { trigger: 'quota_geste', quotaInfo: { geste: 'lens', plafond: 600, consommes: 600, restantes: 0, remise_le: futur } };
      const sansHote = modaleHtml('business', lensProps);
      ok(!/Créer une annonce depuis mes photos|data-mur-action/.test(sansHote) && /<button[^>]*>Fermer<\/button>/.test(sansHote), 'mur Lens : sans hôte qui sait le faire, pas de bouton « Créer une annonce depuis mes photos » (« Fermer » seul)');
      const avecHote = renderToStaticMarkup(h(CM.default, { ...base, lang: 'fr', ...drap.business, ...lensProps, onCreerDepuisPhotos() {} }));
      const tl = texte(avecHote);
      ok(/data-mur-action=""[^>]*>Créer une annonce depuis mes photos<\/button>/.test(avecHote) && avant(tl, 'Tout le reste continue, sans limite.', 'Créer une annonce depuis mes photos') && avant(tl, 'Créer une annonce depuis mes photos', 'Fermer')
        && !/Passer|€|Voir toutes les formules/.test(tl), 'mur Lens (Business, hôte capable) : « Créer une annonce depuis mes photos » sous « Tout le reste continue », puis « Fermer » ; aucune offre (maquette 5.4)', tl.slice(-260));
      ok(/Create a listing from my photos/.test(texte(renderToStaticMarkup(h(CM.default, { ...base, lang: 'en', ...drap.business, ...lensProps, onCreerDepuisPhotos() {} })))), 'en : « Create a listing from my photos »');
      ok(!/Créer une annonce depuis mes photos/.test(modale('pro', { trigger: 'quota_geste', quotaInfo: { geste: 'annonces', plafond: 120 }, onCreerDepuisPhotos() {} })), 'les autres murs ne montrent jamais ce bouton');
      const code = lignesDeCode(lire('src/components/ConversionModal.jsx'));
      ok(/action=\{gesteMur === 'lens' && typeof onCreerDepuisPhotos === 'function' \? \{/.test(code) && /onClick: \(\) => \{ fermer\('creer_depuis_photos'\); onCreerDepuisPhotos\(\); \}/.test(code),
        'le bouton ferme la feuille (sortie nommée « creer_depuis_photos ») puis passe la main à l’hôte');
      // L'automatique : le Premium lit ses remontées restantes (quotas_etat), jamais inventées ; le Free garde SA ligne.
      const autoPrem = modale('premium', { trigger: 'republish_auto', remonteesRestantes: 1088 });
      ok(autoPrem.includes("Tu peux toujours remonter tes annonces toi-même. Il t'en reste 1 088 ce mois-ci."), 'mur automatique (Premium) : « Tu peux toujours remonter tes annonces toi-même. Il t’en reste 1 088 ce mois-ci. » (maquette m-auto)', autoPrem.slice(0, 400));
      ok(!/Il t'en reste/.test(modale('premium', { trigger: 'republish_auto' })) && !/Il t'en reste/.test(modale('premium', { trigger: 'republish_auto', remonteesRestantes: null })),
        'mur automatique (Premium) : sans le chiffre du serveur, aucune ligne (jamais inventé)');
      ok(modale('free', { trigger: 'republish_auto', repubOffertes: { restantes: 18, plafond: 30, remise_le: futur }, remonteesRestantes: 999 }).includes("Il t'en reste 18 ce mois-ci."),
        'mur automatique (Free) : sa ligne vient toujours de repubOffertes');
      const app = lignesDeCode(lire('src/App.jsx'));
      ok(/remonteesRestantes=\{grilleEntete&&quotas\?\.palier==='premium'&&quotas\?\.republication\?\.mode==='mensuel'&&quotas\?\.republication\?\.restantes!=null\?quotas\.republication\.restantes:null\}/.test(app),
        'App : le Premium seulement, avec la grille, le chiffre de quotas_etat (Pro et Business : sans objet)');
      ok(/onCreerDepuisPhotos=\{grilleEntete&&conversionModal\.quotaInfo\?\.geste==='lens'&&tab===2&&lensPhotos\.length>0/.test(app)
        && /window\.dispatchEvent\(new CustomEvent\('fillsell:lens-sans-analyse'/.test(app),
        'App : le bouton n’existe qu’avec la grille, sur le mur Lens, onglet Lens monté avec des photos ; il relaie fillsell:lens-sans-analyse');
      const lens = lire('src/tabs/LensTab.jsx');
      ok(/sansAnalyseRef\.current=lensPhotos\.length>0&&!generatingListing&&!showListingPreview\?\(\)=>lancer\('sans'\):null;/.test(lens)
        && /window\.addEventListener\('fillsell:lens-sans-analyse',surMur\)/.test(lens),
        'LensTab : l’événement lance « Créer l’annonce sans analyse » (lancer(\'sans\') : photos seules, rédaction au stepper, comptée en annonces)');
      ok(/quotaInfo=\{quotaInfoAvecRemise\(conversionModal\.quotaInfo\?\?null\)\}/.test(app)
        && /const quotaInfoAvecRemise=\(info\)=>\(grilleEntete&&info&&typeof info==='object'&&info\.remise_le==null/.test(app)
        && /lireProchaineRemiseAZero\(user\.id\)/.test(app) && /const remiseALire=grilleEntete&&remiseDuCompte\(quotas\)==null&&Boolean\(user\?\.id\);/.test(app),
        'App : un mur sans date la reçoit de quotas_etat, sinon de coin_wallets.next_grant_at (lu une fois, grille seulement)');
    }
  });

  // ── 4. « Ton plan » ───────────────────────────────────────────────────────
  console.log('4. À 1 : « Ton plan » (PlanDetailsModal)');
  avecConfig(GRILLE, () => {
    const p = plan('premium');
    const carteDuPlan = p.slice(0, p.indexOf('Passe au niveau supérieur'));
    ok(/^Ton plan actuel Premium 40 annonces 400 publications 1 500 remontées par mois Retouche IA : 5 annonces retouchées par mois Support par e-mail Republication automatique Bordereaux Vinted/.test(p),
      'Premium : mêmes tuiles et mêmes lignes que la carte des offres', p.slice(0, 300));
    ok(!/€/.test(carteDuPlan) && !/Pour vendre plus/.test(carteDuPlan), 'Premium : AUCUN prix sur le plan en cours (règle Founder), pas d’accroche de vente');
    ok(/Aussi dans ton plan Import et export Excel de ton stock Commandes vocales Passe au niveau supérieur/.test(p), '« Aussi dans ton plan » sous la carte, puis l’upsell');
    ok(/Passe au niveau supérieur Pro 29,99 € \/mois Pour que ça tourne tout seul\. 120 annonces 1 200 publications illimitées remontées par mois/.test(p) && /Passer Pro Fermer$/.test(p),
      'Premium : l’upsell Pro, carte de la grille', p.slice(-500));
    const pr = plan('pro');
    ok(/^Ton plan actuel Pro 120 annonces 1 200 publications illimitées remontées par mois Republication automatique : tes annonces remontent toutes seules/.test(pr)
      && !/€/.test(pr.slice(0, pr.indexOf('Le palier ultime'))), 'Pro : tuiles et lignes, aucun prix', pr.slice(0, 300));
    ok(/Le palier ultime Business 59,99 € \/mois Pour publier sans compter\./.test(pr) && /Passer Business Fermer$/.test(pr), 'Pro : l’upsell Business');
    const b = plan('business');
    ok(/^Ton plan actuel Business illimitées annonces illimitées publications illimitées remontées par mois Tout illimité, sauf Lens \(600 scans par mois\) et retouches IA \(50 par mois\)/.test(b)
      && !/€|Passer/.test(b) && /Aussi dans ton plan/.test(b), 'Business : tout illimité sauf Lens, aucun prix, aucun upsell', b.slice(0, 300));
    const htmlPlan = planHtml('premium');
    const htmlOffre = renderToStaticMarkup(h(CM.CorpsCarteGrille, { fr: true, palier: 'premium', K: REPLI }));
    const tuilesPlan = htmlPlan.match(/<div data-jauges-carte="premium">[\s\S]*?par mois<\/div><\/div>/)?.[0];
    ok(tuilesPlan && htmlOffre.includes(tuilesPlan), 'une seule source : les tuiles du plan sont celles de la carte des offres, au balisage près');
    ok(!/plafond|20 €/.test(p + pr + b), '« Ton plan » : jamais « plafond », jamais « 20 € »');
  });

  // ── 5. Le code : une seule source, la télémétrie, les sorties ─────────────
  console.log('5. Le code');
  {
    const m = lire('src/components/ConversionModal.jsx');
    const code = lignesDeCode(m);
    ok(/const grille = grilleActiveConfig\(K\);/.test(code) && (code.match(/grilleActiveConfig\(K\)/g) ?? []).length >= 5, 'la feuille et chaque carte lisent l’interrupteur dans K (coin_config)');
    ok(/const gesteMur = !grille \|\| view !== 'entry' \? null/.test(code), 'aucun mur sans la grille, ni après « Voir toutes les formules »');
    ok(/onVoirTout=\{sellable\.length > 0 \? \(\) => setView\('plans'\) : null\}/.test(code) && /const trig = grille && view === 'plans' \? 'generic' : trigger;/.test(code),
      '« Voir toutes les formules » bascule sur la vue complète (état view), générique');
    ok(/onFond=\{fermerParLeFond\} onSortie=\{fermerNonMerci\}/.test(code), 'les sorties du mur passent par les mêmes fonctions (fond, non_merci) : télémétrie inchangée');
    ok(/const brut = palierQuiDebloque\(gesteMur, palierIci, K\);/.test(code) && /if \(brut && sellable\.includes\(brut\)\) return brut;/.test(code), 'le palier qui débloque : palierQuiDebloque, et seulement s’il est vendable');
    ok(/jourRemiseCourt\(trigger === 'republish_cap' \? plafondRepub\?\.remise_le : quotaInfo\?\.remise_le/.test(code), 'la date du mur : jourRemiseCourt, en JJ/MM (jamais une date inventée)');
    const ouverture = code.match(/logModale\('offers_modal_open', \{[\s\S]*?\}\);/)?.[0] ?? '';
    ok(/\.\.\.\(trigger === 'quota_geste' && quotaInfo\?\.geste \? \{ geste: quotaInfo\.geste \} : \{\}\)/.test(ouverture), 'télémétrie : l’ouverture porte le geste, rien d’autre');
    const logs = [...code.matchAll(/logModale\('([a-z_]+)'/g)].map((x) => x[1]).sort().join(',');
    ok(logs === 'offers_modal_abandon,offers_modal_cloud_ajout,offers_modal_cloud_bascule,offers_modal_cloud_seul,offers_modal_offertes_click,offers_modal_open,offers_modal_tier_click',
      'aucun événement neuf', logs);
    const pd = lignesDeCode(lire('src/components/PlanDetailsModal.jsx'));
    ok(/import \{ COIN_CONFIG_FALLBACK, ProPlanCard, BusinessPlanCard, CorpsCarteGrille, BlocCoches \} from '\.\/ConversionModal';/.test(pd)
      && /<CorpsCarteGrille fr=\{fr\} palier=\{palierCourant\} K=\{K\}/.test(pd), '« Ton plan » importe le corps de carte de la feuille (une seule source)');
  }
} finally {
  await vite.close();
}

console.log(`\n${rouges === 0 ? '✓' : '✗'} offres-trois-jauges : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
