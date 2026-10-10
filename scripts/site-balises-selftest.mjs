// selftest:site-balises — parité des balises de mesure app ↔ site (09/10/2026).
//
// Les pages vitrine recopient d'index.html, entre les marqueurs
// <!-- site:balises:<nom>:debut/fin -->, GTM, Vercel Insights, le gtag Google
// Ads et le noscript GTM (revue A I6, revue C I4). Ce test prouve :
//   1. les quatre blocs sont dans index.html, une fois chacun, avec les bons
//      identifiants (GTM-TJNKL6T5, AW-16622098460) ;
//   2. AUCUNE balise de mesure d'index.html ne vit HORS d'un bloc marqué : une
//      balise ajoutée demain (Clarity, pixel) sans marqueur manquerait sur tout
//      le site — le test tombe et le dit ;
//   3. le gabarit du site écrit le bloc « consentement » et le bloc
//      « insights » d'index.html, aucun traceur hors du consentement, et les
//      liens d'icônes / de manifeste de l'app ;
//   4. un marqueur absent ou en double fait échouer la lecture (build rouge) ;
//   5. le site rendu À L'INSTANT (générateur en mode « dater », dossier
//      jetable du système) : chaque page porte le même bloc consentement et
//      le bloc insights d'index.html, aucun traceur hors du consentement ;
//   6. (09/10, CNIL) la coquille WEB (appliquerConsentement d'index.html) :
//      gtm / gtag-aw / gtm-noscript remplacés par le seul bloc consentement,
//      tout le reste à l'identique ;
//   7. (09/10, CNIL) le script des balises, joué sur un faux window : AUCUN
//      script Google demandé sans accord (ni requête ni cookie) ; consentement
//      Google « refusé » par défaut ; à l'accord, « accordé » PUIS GTM et
//      gtag AW, une seule fois ; accord déjà donné : chargés d'emblée ; refus
//      ou retrait : « refusé » et cookies Google effacés ; un accord donné au
//      bandeau d'avant (Meta seul) ne vaut pas, un refus d'avant vaut.
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lireBlocsBalises, formeComparable, BLOCS_BALISES, BLOCS_PAGE, RELS_PARTAGES,
  scriptConsentement, blocsSousConsentement, appliquerConsentement, traceursHorsConsentement, idsBalises,
  sansBalisesGoogle,
} from './site/lib/balises.mjs';
import { brancherBalises, CONSENT_ACCORDE, CONSENT_REFUSE } from '../site/js/balises-consentement.js';
import { balisesOuvrantes } from './site/lib/html.mjs';
import { layout } from '../site/gabarits/layout.mjs';
import { genererSite } from './site/build-site.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
let passes = 0;
function ok(cond, message) {
  if (cond) { passes++; return; }
  echecs++;
  console.error(`  ✗ ${message}`);
}

const index = readFileSync(path.join(racine, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const blocs = lireBlocsBalises(index, 'index.html');
ok(BLOCS_BALISES.every((n) => blocs[n]), 'les quatre blocs sont lus');
ok(blocs.gtm.includes("'GTM-TJNKL6T5'") && blocs.gtm.includes('googletagmanager.com/gtm.js'), 'bloc gtm : conteneur GTM-TJNKL6T5');
ok(blocs['gtag-aw'].includes('gtag/js?id=AW-16622098460') && blocs['gtag-aw'].includes("gtag('config', 'AW-16622098460')"), 'bloc gtag-aw : AW-16622098460 chargé et configuré');
ok(blocs.insights.includes('/_vercel/insights/script.js'), 'bloc insights : Vercel Web Analytics');
ok(blocs['gtm-noscript'].includes('ns.html?id=GTM-TJNKL6T5'), 'bloc gtm-noscript : iframe GTM');
ok(!Object.values(blocs).some((b) => b.includes('<!--')), 'les blocs recopiés ne portent plus de commentaires');

// 2. Aucune balise de mesure hors d'un bloc marqué.
let horsBlocs = index;
for (const m of index.matchAll(/<!--\s*site:balises:([\w-]+):debut[\s\S]*?<!--\s*site:balises:\1:fin\s*-->/g)) horsBlocs = horsBlocs.replace(m[0], '');
horsBlocs = horsBlocs.replace(/<!--[\s\S]*?-->/g, '');
const scriptsHors = balisesOuvrantes(horsBlocs, 'script').filter((s) =>
  !(s.attrs.type === 'module' && s.attrs.src === '/src/main.jsx') && s.attrs.type !== 'application/ld+json');
ok(scriptsHors.length === 0, `balise(s) <script> d'index.html HORS des blocs site:balises — elles manqueraient sur tout le site vitrine : ${scriptsHors.map((s) => s.brut).join(' ')}`);
ok(!/<noscript|<iframe/i.test(horsBlocs), '<noscript>/<iframe> hors des blocs site:balises');
// (Le JSON-LD cite le profil TikTok de la marque : un lien, pas un traceur.)
const horsBlocsSansDonnees = horsBlocs
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  .replace(/<link rel="dns-prefetch" href="\/\/www\.googletagmanager\.com" \/>/, '');
ok(!/googletagmanager|gtag\(|fbq\(|clarity|tiktok|connect\.facebook/i.test(horsBlocsSansDonnees),
  'référence à un traceur hors des blocs site:balises');

// 4. Marqueur absent ou en double : la lecture lève.
const leve = (html) => { try { lireBlocsBalises(html, 'essai'); return false; } catch { return true; } };
ok(leve(index.replace('<!-- site:balises:gtag-aw:fin -->', '')), 'marqueur de fin absent → erreur');
ok(leve(index.replace(/<!-- site:balises:insights:debut -->[\s\S]*?<!-- site:balises:insights:fin -->/, '')), 'bloc absent → erreur');
ok(leve(index + '\n<!-- site:balises:gtm:debut -->x<!-- site:balises:gtm:fin -->'), 'bloc en double → erreur');

// 3. Le gabarit écrit le bloc consentement, le bloc insights et les liens d'icônes.
const script = await scriptConsentement(racine, blocs);
const blocsPage = blocsSousConsentement(blocs, script);
ok(/^<script>[\s\S]*<\/script>$/.test(script) && script.includes('GTM-TJNKL6T5') && script.includes('AW-16622098460'), 'script consentement : en ligne, vise GTM-TJNKL6T5 et AW-16622098460');
ok(script.includes('fs_consent_pub_v2'), 'script consentement : lit la clé de consentement.js (fs_consent_pub_v2)');
ok(script.length < 2500, `script consentement : ${script.length} o en ligne (budget 2 500)`);
ok(JSON.stringify(idsBalises(blocs)) === JSON.stringify({ gtm: 'GTM-TJNKL6T5', aw: 'AW-16622098460' }), 'identifiants lus dans index.html');
const liensIcones = balisesOuvrantes(index.replace(/<!--[\s\S]*?-->/g, ''), 'link')
  .filter((l) => RELS_PARTAGES.includes(l.attrs.rel)).map((l) => l.brut.replace(/\s*\/>$/, '>')).join('\n');
const page = {
  id: 'essai', type: 'page', lang: 'fr', chemin: '/essai', url: 'https://fillsell.app/essai', racine: false, robots: 'index, follow',
  title: 'Essai', description: 'Essai', alternates: [], fil: [], ogImage: 'https://fillsell.app/og.png', ogType: 'website', jsonld: [],
};
const site = {
  balises: blocsPage, liensIcones, aiguillage: '/* aiguillage */', cssPour: () => 'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}', logo: '/assets/site/fillsell-icone-64.0.png',
  police: '/assets/site/p.woff2', siteJs: '/assets/site/site.0.js',
  chemin: (id, lang) => (id === 'accueil' ? (lang === 'en' ? '/en' : '/') : `/${id}`), nomCourt: (id) => id,
  perimetre: () => 'Au 9 octobre 2026, FillSell fonctionne avec Vinted.',
  nonAffiliation: () => 'Vinted est une marque de son propriétaire ; FillSell n’est affilié à aucune de ces plateformes.',
  navigation: () => [{ libelle: 'FAQ', chemin: '/faq' }],
  pied: () => [{ titre: 'Produit', liens: [{ libelle: 'Accueil', chemin: '/' }] }],
};
const rendu = layout({ site, page, principal: '<h1>Essai</h1>' });
const blocsRendus = lireBlocsBalises(rendu, 'gabarit', BLOCS_PAGE);
ok(formeComparable(blocsRendus.consentement) === formeComparable(script), 'gabarit : bloc consentement = script des balises');
ok(formeComparable(blocsRendus.insights) === formeComparable(blocs.insights), 'gabarit : bloc insights = index.html');
ok(traceursHorsConsentement(rendu).length === 0, `gabarit : traceur hors du consentement (${traceursHorsConsentement(rendu).join(', ')})`);
ok(!/site:balises:(gtm|gtag-aw|gtm-noscript):/.test(rendu) && !/<noscript/i.test(rendu), 'gabarit : plus de bloc gtm / gtag-aw / noscript');
for (const l of balisesOuvrantes(liensIcones, 'link')) {
  ok(balisesOuvrantes(rendu, 'link').some((r) => r.attrs.rel === l.attrs.rel && r.attrs.href === l.attrs.href), `gabarit : lien ${l.attrs.rel} ${l.attrs.href} absent`);
}
ok(rendu.indexOf('<script>/* aiguillage */') < rendu.indexOf('site:balises:consentement:debut'), 'gabarit : l\'aiguillage en ligne passe AVANT les balises');
ok(rendu.indexOf('site:balises:consentement:debut') < rendu.indexOf('<title>'), 'gabarit : balises en tête du <head> (comme GTM avant)');
ok(!/user-scalable|maximum-scale/.test(rendu), 'gabarit : viewport sans blocage du zoom');

// 5. Le site rendu à l'instant, dans un dossier jetable (jamais dans l'arbre).
{
  const temp = mkdtempSync(path.join(tmpdir(), 'fs-balises-'));
  try {
    await genererSite({ dossier: temp, racine, mode: 'dater', journal: { log() {}, warn() {} }, env: {} });
    const pages = [];
    const parcourir = (d) => {
      for (const nom of readdirSync(d)) {
        const p = path.join(d, nom);
        if (statSync(p).isDirectory()) { if (nom !== 'assets') parcourir(p); } else if (nom.endsWith('.html')) pages.push(p);
      }
    };
    parcourir(temp);
    ok(pages.length >= 10, `site rendu (${pages.length} pages)`);
    for (const p of pages) {
      const h = readFileSync(p, 'utf8');
      const b = lireBlocsBalises(h, p, BLOCS_PAGE);
      ok(formeComparable(b.consentement) === formeComparable(script), `${path.relative(temp, p)} : bloc consentement ≠ script des balises`);
      ok(formeComparable(b.insights) === formeComparable(blocs.insights), `${path.relative(temp, p)} : bloc insights ≠ index.html`);
      ok(traceursHorsConsentement(h).length === 0, `${path.relative(temp, p)} : traceur hors du consentement`);
    }
    console.log(`  (site rendu à l'instant : ${pages.length} pages comparées à index.html)`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// 6. La coquille WEB.
{
  const web = appliquerConsentement(index, script);
  ok(traceursHorsConsentement(web).length === 0, `coquille web : traceur hors du consentement (${traceursHorsConsentement(web).join(', ')})`);
  const bw = lireBlocsBalises(web, 'coquille web', BLOCS_PAGE);
  ok(bw.consentement === script, 'coquille web : bloc consentement = script (octets)');
  ok(formeComparable(bw.insights) === formeComparable(blocs.insights), 'coquille web : insights inchangé');
  ok(!/site:balises:(gtm|gtag-aw|gtm-noscript):/.test(web) && !/<noscript/i.test(web), 'coquille web : gtm / gtag-aw / noscript retirés');
  ok(web.indexOf('site:balises:consentement:debut') < web.indexOf('<meta charset'), 'coquille web : balises à la place de GTM, en tête du <head>');
  const sansBlocs = (h) => h.replace(/<!--\s*site:balises:([\w-]+):debut[\s\S]*?<!--\s*site:balises:\1:fin\s*-->/g, '').replace(/\s+/g, ' ');
  ok(sansBlocs(web) === sansBlocs(index), 'coquille web : tout le reste d\'index.html à l\'identique');
  const dollar = appliquerConsentement(index, '<script>a="$\'$&$1"</script>');
  ok(dollar.includes('a="$\'$&$1"'), 'coquille web : un « $\' » du code minifié est recopié tel quel');
}

// 6 bis. (10/10, Nico) La coquille NATIVE : pas de bandeau dans l'app native,
// donc aucune balise Google (builds hors site : natif, OTA).
{
  const natif = sansBalisesGoogle(index);
  ok(traceursHorsConsentement(natif).length === 0, `coquille native : traceur restant (${traceursHorsConsentement(natif).join(', ')})`);
  ok(!/googletagmanager|AW-16622098460|GTM-TJNKL6T5|<noscript/i.test(natif), 'coquille native : ni GTM, ni Google Ads, ni noscript, ni dns-prefetch GTM');
  ok(formeComparable(lireBlocsBalises(natif, 'coquille native', ['insights']).insights) === formeComparable(blocs.insights), 'coquille native : insights (Vercel, sans cookie) inchangé');
  const sansGoogle = (h) => h.replace(/<!--\s*site:balises:(gtm|gtag-aw|gtm-noscript):debut[\s\S]*?<!--\s*site:balises:\1:fin\s*-->/g, '')
    .replace(/<link rel="dns-prefetch" href="\/\/www\.googletagmanager\.com" ?\/?>/g, '').replace(/\s+/g, ' ');
  ok(sansGoogle(natif) === sansGoogle(index), 'coquille native : tout le reste d\'index.html à l\'identique');
  const vite = readFileSync(path.join(racine, 'vite.config.js'), 'utf8');
  ok(/\.\.\.\(SITE \? \[siteStatique\(\)\] : \[prerenderBlog\(\), controleSite\(\), natifSansGoogle\(\)\]\)/.test(vite),
    'vite.config.js : le plugin natif tourne dans les builds HORS site seulement (Vercel garde le consentement)');
}

// 7. Le script des balises sur un faux window.
function fauxWindow({ stockage = {}, cookies = [] } = {}) {
  const ecouteurs = {};
  const scripts = [];
  const effaces = [];
  let jar = cookies.slice();
  const document = {
    createElement: () => ({}),
    head: { appendChild: (s) => scripts.push(s.src) },
    get cookie() { return jar.join('; '); },
    set cookie(v) {
      if (/Max-Age=0/.test(v)) { const n = v.split('=')[0]; effaces.push(v); jar = jar.filter((c) => c.split('=')[0] !== n); } else jar.push(v.split(';')[0]);
    },
  };
  const w = {
    document, location: { hostname: 'fillsell.app' },
    addEventListener: (t, f) => { (ecouteurs[t] ||= []).push(f); },
    emettre: (t, detail) => (ecouteurs[t] || []).forEach((f) => f({ detail })),
  };
  const etat = () => {
    const v = stockage.fs_consent_pub_v2;
    if (v === 'accepte' || v === 'refuse') return v;
    return stockage.fs_consent_pub === 'refuse' ? 'refuse' : null;
  };
  return { w, scripts, effaces, etat, jar: () => jar };
}
const cmd = (dl) => dl.map((x) => (x && typeof x === 'object' && 'length' in x
  ? (x[0] === 'js' ? 'js' : Array.from(x).slice(0, 2).join(':')) : x && x.event));
const IDS = { gtm: 'GTM-TJNKL6T5', aw: 'AW-16622098460' };
{
  const f = fauxWindow();
  brancherBalises(f.w, { ...IDS, etat: f.etat });
  ok(f.scripts.length === 0, 'sans réponse : AUCUN script Google demandé');
  ok(cmd(f.w.dataLayer).join() === 'consent:default', `sans réponse : seul « consent default » (${cmd(f.w.dataLayer)})`);
  ok(JSON.stringify(f.w.dataLayer[0][2]) === JSON.stringify(CONSENT_REFUSE), 'consentement par défaut : les quatre signaux refusés');
  f.w.emettre('fs-consent', 'accepte');
  ok(f.scripts.join() === 'https://www.googletagmanager.com/gtm.js?id=GTM-TJNKL6T5,https://www.googletagmanager.com/gtag/js?id=AW-16622098460', `à l'accord : GTM puis gtag AW (${f.scripts})`);
  ok(cmd(f.w.dataLayer).join() === 'consent:default,consent:update,gtm.js,js,config:AW-16622098460', `à l'accord : ordre default, update, gtm.start, js, config (${cmd(f.w.dataLayer)})`);
  ok(JSON.stringify(f.w.dataLayer[1][2]) === JSON.stringify(CONSENT_ACCORDE), 'à l\'accord : les quatre signaux accordés');
  f.w.emettre('fs-consent', 'accepte');
  ok(f.scripts.length === 2, 'second accord : rien de rechargé');
}
{
  const f = fauxWindow({ stockage: { fs_consent_pub_v2: 'accepte' } });
  brancherBalises(f.w, { ...IDS, etat: f.etat });
  ok(f.scripts.length === 2, 'accord déjà donné : GTM et gtag chargés d\'emblée');
  f.w.emettre('fs-consent', 'refuse');
  ok(cmd(f.w.dataLayer).at(-1) === 'consent:update' && JSON.stringify(f.w.dataLayer.at(-1)[2]) === JSON.stringify(CONSENT_REFUSE), 'retrait de l\'accord : consentement repassé à « refusé »');
}
{
  const f = fauxWindow({ stockage: { fs_consent_pub: 'accepte' } });
  brancherBalises(f.w, { ...IDS, etat: f.etat });
  ok(f.scripts.length === 0, 'accord donné au bandeau d\'avant (Meta seul) : ne vaut pas pour Google');
}
{
  const f = fauxWindow({ stockage: { fs_consent_pub: 'refuse' }, cookies: ['_ga=GA1.1.1', '_ga_2ZYVK404G9=GS1', '_gcl_au=1.1', 'fs_lang=fr', 'sb-x-auth-token=y'] });
  brancherBalises(f.w, { ...IDS, etat: f.etat });
  ok(f.scripts.length === 0, 'refus d\'avant : vaut refus, rien chargé');
  ok(f.jar().join() === 'fs_lang=fr,sb-x-auth-token=y', `refus : cookies Google effacés, les nôtres gardés (${f.jar()})`);
  ok(f.effaces.some((c) => c.includes('domain=.fillsell.app')), 'refus : effacement aussi sur le domaine parent');
}
{
  // La vraie fonction de l'app (consentement.js) lit les deux clés comme le faux.
  const { etatConsentement } = await import('../src/utils/consentement.js');
  const essai = (valeurs) => {
    globalThis.localStorage = { getItem: (k) => (k in valeurs ? valeurs[k] : null) };
    try { return etatConsentement(); } finally { delete globalThis.localStorage; }
  };
  ok(essai({}) === null, 'consentement.js : aucune réponse → null');
  ok(essai({ fs_consent_pub: 'accepte' }) === null, 'consentement.js : accord d\'avant (Meta seul) → redemandé');
  ok(essai({ fs_consent_pub: 'refuse' }) === 'refuse', 'consentement.js : refus d\'avant → refus');
  ok(essai({ fs_consent_pub_v2: 'accepte', fs_consent_pub: 'refuse' }) === 'accepte', 'consentement.js : la réponse au nouveau bandeau l\'emporte');
}

console.log(`selftest:site-balises — ${passes} vérifications passées, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
