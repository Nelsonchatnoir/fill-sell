// ═══════════════════════════════════════════════════════════════════════════
// LES CARRÉS DES JAUGES AU TAP — « QU'EST-CE QUE ÇA COMPTE ? » (maquette validée par Nico, intégrée le 09/11/2026)
//     npm run selftest:jauges-explications
// ═══════════════════════════════════════════════════════════════════════════
// Ce qu'il prouve :
//   1. les textes (utils/jaugesExplications.js) : les 3 jauges en FR et en EN, ceux de la maquette mot pour mot sauf
//      les trois écarts corrigés vers le vrai (prix, texte écrit à la main, 24 h) ; jamais « pépites » ni « plafond » ;
//      tutoiement ; l'anglais ne nomme ni Leboncoin ni Beebs ; le nom accessible « 120 annonces — qu'est-ce que ça
//      compte ? » ;
//   2. les logos (utils/logosPlateformes.js) : un fichier de public/email/ par plateforme (Beebs : celui du 29/10, le
//      même que les mails), le découpage d'un texte (chaque nom → son logo, le texte recollé à l'identique) ;
//   3. les RÈGLES DE COMPTAGE relues dans la dernière définition de chaque fonction de supabase/migrations : une règle
//      qui change fait tomber ce test, et le texte de la feuille se relit AVANT ;
//   4. le câblage : carrés en boutons (aria-haspopup, aria-expanded, nom accessible), feuille en dialog modal reliée,
//      Échap en capture, au-dessus de tous les hôtes (z-index), logos dans la ligne commune, aucune route de démo ;
//   5. le rendu serveur (Vite SSR) : feuille de chaque jauge FR/EN (dialog, titre, logos de l'exemple), carrés d'une
//      carte claire et d'une carte sombre.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const lignesDeCode = (texte) => texte.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*');
}).join('\n');

const J = await import('../src/utils/jaugesExplications.js');
const L = await import('../src/utils/logosPlateformes.js');

// ── 1. Les textes ────────────────────────────────────────────────────────────
console.log('1. Les textes');
const MAQUETTE = {
  fr: {
    annonces: { titre: 'Annonces', exemple: "Tu prends un pull en photo, l'IA rédige l'annonce : ça fait 1 annonce, que tu la mettes ensuite sur 1 plateforme ou sur 3.", compte: "chaque scan Lens, même s'il ne débouche pas sur une fiche." },
    publications: { titre: 'Publications', definition: "Une publication, c'est la mise en ligne d'une annonce sur une plateforme.", exemple: 'Ton pull mis en ligne sur Vinted, Leboncoin et eBay : ça fait 3 publications (et toujours 1 annonce).', compte: "une mise en ligne en cours compte dès qu'elle part.", pas: 'une mise en ligne qui échoue ou que tu annules avant son départ, tes annonces importées, les retraits.' },
    remontees: { titre: 'Remontées', definition: "Une remontée, c'est quand FillSell remet ton annonce en tête de liste sur une plateforme, pour qu'elle soit revue par les acheteurs.", exemple: 'Ton pull remonté sur Vinted et sur Leboncoin : ça fait 2 remontées. Une remontée ne prend ni annonce ni publication.', compte: 'chaque remontée, à la main ou automatique, sur chaque plateforme.', pas: 'une remontée annulée avant son départ.' },
  },
  en: {
    annonces: { titre: 'Listings', exemple: 'You photograph a sweater, the AI writes the listing: that is 1 listing, whether you then put it on 1 platform or on 3.', compte: 'each Lens scan, even if it does not lead to a listing.' },
    publications: { titre: 'Publications', definition: 'A publication is putting one listing online on one platform.', exemple: 'Your sweater put online on Vinted, eBay and Depop: that is 3 publications (and still 1 listing).', compte: 'a publication on its way counts as soon as it starts.', pas: 'a publication that fails or that you cancel before it goes out, your imported listings, removals.' },
    remontees: { titre: 'Bumps', definition: 'A bump is when FillSell puts your listing back at the top on a platform, so buyers see it again.', exemple: 'Your sweater bumped on Vinted and on Depop: that is 2 bumps. A bump uses neither a listing nor a publication.', compte: 'every bump, by hand or automatic, on each platform.', pas: 'a bump cancelled before it goes out.' },
  },
};
for (const lang of ['fr', 'en']) {
  for (const cle of J.CLES_EXPLIQUEES) {
    const e = J.explicationJauge(cle, lang);
    ok(e && ['titre', 'definition', 'exemple', 'compte', 'pas'].every((k) => typeof e[k] === 'string' && e[k].length > 3), `${lang} · ${cle} : titre, définition, exemple, compte, ne compte pas`);
    const attendu = MAQUETTE[lang][cle];
    const diff = Object.entries(attendu).filter(([k, v]) => e?.[k] !== v).map(([k]) => k);
    ok(diff.length === 0, `${lang} · ${cle} : mot pour mot la maquette (${Object.keys(attendu).join(', ')})`, diff.map((k) => `${k} : « ${e?.[k]} »`).join(' | '));
  }
}
ok(J.explicationJauge('lens') === null && J.explicationJauge('retouches', 'en') === null, 'jauge inconnue → null');
// Les trois écarts à la maquette, corrigés vers le vrai (voir l'en-tête de jaugesExplications.js et le § 3).
const aFr = J.explicationJauge('annonces', 'fr');
const aEn = J.explicationJauge('annonces', 'en');
ok(aFr.definition === "Une annonce, c'est une fiche créée par l'IA de FillSell à partir de tes photos : titre, description, catégorie."
  && aEn.definition === "A listing is a product sheet written by FillSell's AI from your photos: title, description, category.",
  'écart 1 : la définition ne promet pas de prix (la rédaction n’en écrit jamais)');
ok(aFr.pas === 'un article que tu saisis toi-même au stock, tes annonces importées des plateformes.'
  && aEn.pas === 'an item you type into your stock yourself, your listings imported from the platforms.',
  'écarts 2 et 3 : « un article que tu saisis toi-même au stock », sans la règle des 24 h');
const tous = (lang) => J.CLES_EXPLIQUEES.map((c) => Object.values(J.explicationJauge(c, lang)).join(' ')).join(' ') + ' ' + Object.values(J.libellesExplication(lang)).join(' ');
ok(!/p[ée]pite|plafond/i.test(tous('fr') + tous('en')), 'jamais « pépites », jamais « plafond »');
ok(!/\b(vous|votre|vos)\b/i.test(tous('fr')), 'FR : tutoiement (aucun « vous »)');
ok(!/Leboncoin|Beebs/.test(J.CLES_EXPLIQUEES.map((c) => J.explicationJauge(c, 'en').exemple).join(' ')), 'EN : les exemples ne nomment ni Leboncoin ni Beebs (masqués hors de France)');
ok(J.nomAccessibleCarre('120', 'annonces', 'fr') === "120 annonces — qu'est-ce que ça compte ?" && J.nomAccessibleCarre('120', 'listings', 'en') === '120 listings — what does it count?',
  'nom accessible : « 120 annonces — qu’est-ce que ça compte ? »');
ok(JSON.stringify(J.libellesExplication('fr')) === JSON.stringify({ exemple: 'Exemple', compte: 'Compte aussi :', pas: 'Ne compte jamais :', fermer: 'Fermer', ouvrir: "qu'est-ce que ça compte ?" }),
  'libellés FR de la maquette (Exemple, Compte aussi :, Ne compte jamais :, Fermer)');

// ── 2. Les logos ─────────────────────────────────────────────────────────────
console.log('2. Les logos');
const NOMS = ['Vinted', 'Leboncoin', 'eBay', 'Beebs', 'Depop'];
ok(JSON.stringify(Object.keys(L.LOGOS_PLATEFORMES)) === JSON.stringify(NOMS), 'un logo par plateforme : Vinted, Leboncoin, eBay, Beebs, Depop');
for (const [nom, src] of Object.entries(L.LOGOS_PLATEFORMES)) {
  const fichier = join(ROOT, 'public', src);
  const png = fs.existsSync(fichier) ? fs.readFileSync(fichier) : null;
  ok(png && png.readUInt32BE(0) === 0x89504e47 && png.readUInt32BE(16) >= 64, `${nom} : ${src} existe dans public/ (PNG ${png ? `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}` : 'absent'})`);
}
const plateformesTs = lire('supabase/functions/_shared/plateformes.ts');
ok(L.LOGOS_PLATEFORMES.Beebs === '/email/logo-beebs-2910.png' && /beebs: \{ label: "Beebs", logo: "logo-beebs-2910\.png" \}/.test(plateformesTs),
  'Beebs : le logo du 29/10, le même que les mails (_shared/plateformes.ts)');
{
  const t = 'Ton pull mis en ligne sur Vinted, Leboncoin et eBay : ça fait 3 publications.';
  const m = L.morceauxAvecLogos(t);
  ok(m.map((x) => x.nom ?? x.texte).join('') === t, 'découpage : le texte recollé est identique');
  ok(m.filter((x) => x.nom).map((x) => x.nom).join(',') === 'Vinted,Leboncoin,eBay' && m.filter((x) => x.nom).every((x) => x.logo === L.LOGOS_PLATEFORMES[x.nom]), 'découpage : chaque nom porte son logo');
  ok(L.morceauxAvecLogos('Vintedeux et SuperBeebs').every((x) => !x.nom), 'découpage : jamais un nom pris dans un autre mot');
  ok(L.morceauxAvecLogos('').length === 0 && L.morceauxAvecLogos(null).length === 0, 'découpage : texte vide → rien');
}
for (const lang of ['fr', 'en']) {
  for (const cle of J.CLES_EXPLIQUEES) {
    const ex = J.explicationJauge(cle, lang).exemple;
    const ecrits = NOMS.flatMap((n) => [...ex.matchAll(new RegExp(`\\b${n}\\b`, 'g'))]).length;
    ok(L.morceauxAvecLogos(ex).filter((x) => x.nom).length === ecrits, `${lang} · ${cle} : chaque plateforme de l'exemple a son logo (${ecrits})`);
  }
}

// ── 3. Les règles de comptage, relues dans les migrations ───────────────────
console.log('3. Les règles de comptage (dernière définition de chaque fonction dans supabase/migrations)');
const migrations = fs.readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const derniere = (nom) => {
  let def = null, fichier = null;
  for (const f of migrations) {
    const sql = lire(`supabase/migrations/${f}`);
    const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nom}\\([\\s\\S]*?(\\$function\\$|\\$\\$);`, 'g');
    for (const m of sql.matchAll(re)) { def = m[0]; fichier = f; }
  }
  return { def: def ?? '', fichier };
};
{
  const { def, fichier } = derniere('quota_annonces_consommees');
  ok(/u\.feature = 'generate_listing'/.test(def) && /l\.feature = 'lens'/.test(def) && /NOT \(l\.metadata \? 'unifie'\)/.test(def),
    `annonces (${fichier}) : une rédaction par l'IA + un scan Lens qui ne rédige pas (le scan unifié compte par sa rédaction)`);
  ok(/u\.metadata \? 'inventaire_id' AND EXISTS/.test(def) && /interval '24 hours'/.test(def),
    'annonces : la dédup 24 h ne joue qu’entre lignes qui portent l’id de l’article (d’où « 24 h » retiré de la feuille)');
  ok(!/feature = 'lens_identify'|import|releve/.test(def), 'annonces : ni la lecture des photos à la publication, ni un import');
}
const STATUTS = /\(j\.published_at IS NOT NULL OR j\.status IN \('published', 'sold', 'pending', 'processing', 'needs_user'\)\)/;
const EXCLUS = /\?\| ARRAY\['opla_sortie', 'hors_quota'\]/.source + '[\\s\\S]*' + /\(sync-dressing\|releve-annonces\)/.source;
{
  const { def, fichier } = derniere('publications_du_cycle');
  ok(/j\.action = 'publish'/.test(def) && STATUTS.test(def) && new RegExp(EXCLUS).test(def),
    `publications (${fichier}) : 1 tâche publish = 1 plateforme, publiée ou en cours ; échouée/annulée sans mise en ligne, import, synchro : rien`);
}
{
  const { def, fichier } = derniere('remontees_du_cycle');
  ok(/j\.action = 'republish'/.test(def) && STATUTS.test(def) && new RegExp(EXCLUS).test(def) && !/manuel|auto/.test(def),
    `remontées (${fichier}) : 1 tâche republish = 1 plateforme, faite ou en cours, à la main comme automatique`);
  const free = derniere('quota_republication_free_etat');
  ok(/j\.action = 'republish'/.test(free.def) && /j\.status IN \('pending', 'processing', 'needs_user'\)/.test(free.def) && /published_at >= v_borne/.test(free.def),
    `remontées Free (${free.fichier}) : faites + en cours, jamais une annulée`);
}
{
  const gl = lire('supabase/functions/generate-listing/index.ts');
  ok(/feature: "generate_listing"/.test(gl) && /\.\.\.\(inventaire_id \? \{ inventaire_id: String\(inventaire_id\) \} : \{\}\)/.test(gl),
    'generate-listing : la ligne comptée ne porte l’id de l’article que s’il était déjà au stock (corps item_data : non)');
  ok(/price: item\.prix_vente \?\? body_price \?\? null/.test(gl), 'generate-listing : le prix vient de l’article, jamais de la rédaction');
  ok(/descriptionFournie: descriptionVendeuse/.test(gl) && /titreFourni: titreVendeur/.test(gl), 'generate-listing : un texte écrit par la personne passe quand même par la rédaction (comptée)');
  const sn = lire('src/publication/StepperNouveau.jsx');
  ok(/const redactionIA = !m\.platformListings/.test(sn), 'écran de publication : « 1 annonce » dès qu’il n’y a pas encore de copie par plateforme');
}

// ── 4. Le câblage ────────────────────────────────────────────────────────────
console.log('4. Le câblage');
{
  const cm = lignesDeCode(lire('src/components/ConversionModal.jsx'));
  const tuiles = cm.slice(cm.indexOf('function TuilesGrille('), cm.indexOf('export function CorpsCarteGrille('));
  ok(/<button\s+key=\{cle\}\s+type="button"/.test(tuiles) && /aria-haspopup="dialog"/.test(tuiles) && /aria-expanded=\{ouverte\?\.cle === cle\}/.test(tuiles)
    && /aria-label=\{nomAccessibleCarre\(valeur, mot, lang\)\}/.test(tuiles), 'carré : un vrai bouton, aria-haspopup="dialog", aria-expanded, nom accessible');
  ok(/onClick=\{surClic\(cle\)\}/.test(tuiles) && /onPointerDown=\{surAppui\(cle\)\}/.test(tuiles) && /APPUI_LONG_MS/.test(tuiles) && /onPointerCancel=\{lacher\}/.test(tuiles),
    'carré : tap OU appui long (minuteur annulé si le doigt part)');
  ok(/<ExplicationJauge key=\{ouverte\.cle\} cle=\{ouverte\.cle\} lang=\{lang\} ouvreur=\{ouverte\.carre\}/.test(tuiles), 'carré : la feuille reçoit le carré (focus rendu)');
  ok(/data-carre-info=""[\s\S]*?<IconeInfoJauge \/>[\s\S]*?data-carre-chiffre=""[\s\S]*?data-carre-mot=""/.test(tuiles), 'carré : le « i » sur sa bande, AVANT le chiffre et le mot');
  ok(/min-height:44px/.test(cm) && /prefers-reduced-motion: reduce\)\{\.fs-carre-jauge\{transition:none\}/.test(cm), 'carré : 44 px de haut au moins ; mouvement réduit');
  ok((cm.match(/<TexteAvecLogos /g) ?? []).length === 2 && /texte=\{fr \? 'Vinted, Leboncoin, eBay, Beebs et Depop' : 'Vinted, Leboncoin, eBay, Beebs and Depop'\}/.test(cm)
    && /texte=\{fr \? 'Publication sur Vinted, Leboncoin, eBay, Beebs & Depop'/.test(cm), 'ligne commune (grille et d’avant) : les logos devant chaque plateforme');
  const ej = lire('src/components/ExplicationJauge.jsx');
  const ejc = lignesDeCode(ej);
  ok(/role="dialog" aria-modal="true" aria-labelledby=\{idTitre\} aria-describedby=\{idDefinition\}/.test(ejc) && /<h2 id=\{idTitre\}/.test(ejc), 'feuille : role="dialog", aria-modal, titre et définition reliés');
  ok(/document\.addEventListener\('keydown', echap, true\)/.test(ejc) && /ev\.stopImmediatePropagation\(\)/.test(ejc), 'feuille : Échap en capture, ne ferme qu’elle');
  ok(/fermerRef\.current\?\.focus\(/.test(ejc) && /avant\.focus\(\{ preventScroll: true \}\)/.test(ejc) && /ev\.key === 'Tab'/.test(ejc), 'feuille : focus dedans à l’ouverture, gardé (Tab), rendu au carré');
  ok(/width: 44, height: 44/.test(ejc) && /onClick=\{\(ev\) => ev\.stopPropagation\(\)\}/.test(ejc) && /fondAppuye\.current/.test(ejc), 'feuille : fermer 44×44, clic jamais remonté à l’hôte, fond fermé par un geste commencé sur lui');
  ok(/prefers-reduced-motion: reduce\)\{\.fs-jauge-fond,\.fs-jauge-feuille\{animation:none\}/.test(ej), 'feuille : mouvement réduit');
  const z = Number(ej.match(/export const Z_EXPLICATION_JAUGE = (\d+);/)?.[1]);
  const app = lire('src/App.jsx');
  const hotes = [
    Number(app.slice(app.indexOf('function PremiumWelcomeModal('), app.indexOf('function PremiumWelcomeModal(') + 12000).match(/zIndex:(\d+)/)?.[1]),
    Number(lire('src/components/PlanDetailsModal.jsx').match(/zIndex: (\d+)/)?.[1]),
    Number(lire('src/components/ConversionModal.jsx').match(/position: 'fixed', inset: 0, zIndex: (\d+)/)?.[1]),
  ];
  ok(hotes.every((h) => Number.isFinite(h)) && hotes.every((h) => z > h), `feuille au-dessus de ses hôtes : ${z} > ${hotes.join(', ')} (bienvenue, Ton plan, offres)`);
  ok(!/DemoJauges|\/demo\/jauges/.test(lire('src/router/AppRouter.jsx')) && !fs.existsSync(join(ROOT, 'src/pages/DemoJauges.jsx')), 'aucune page de démo des jauges en prod');
}

// ── 5. Le rendu serveur ──────────────────────────────────────────────────────
console.log('5. Le rendu (Vite SSR)');
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
  const EJ = await vite.ssrLoadModule('/src/components/ExplicationJauge.jsx');
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const texte = (html) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  for (const lang of ['fr', 'en']) {
    for (const cle of J.CLES_EXPLIQUEES) {
      const html = renderToStaticMarkup(h(EJ.default, { cle, lang, onFermer() {} }));
      const e = J.explicationJauge(cle, lang);
      const id = html.match(/aria-labelledby="([^"]+)"/)?.[1];
      ok(/role="dialog"/.test(html) && /aria-modal="true"/.test(html) && id && html.includes(`id="${id}"`) && html.includes(`>${e.titre}</h2>`),
        `${lang} · ${cle} : dialog modal, titre « ${e.titre} » relié`);
      const logos = [...html.matchAll(/<img src="(\/email\/logo-[a-z0-9-]+\.png)" alt=""/g)].map((m) => m[1]);
      const ecrits = L.morceauxAvecLogos(e.exemple).filter((x) => x.nom).map((x) => x.logo);
      ok(JSON.stringify(logos) === JSON.stringify(ecrits), `${lang} · ${cle} : ${ecrits.length} logo(s) dans l'exemple, dans l'ordre`, logos.join(','));
      ok(texte(html).includes(texte(e.exemple.replace(/'/g, '\''))) || texte(html).replace(/ ([,.:])/g, '$1').includes(e.exemple.replace(/ ([,.:])/g, '$1')),
        `${lang} · ${cle} : l'exemple se lit en entier`);
      ok(html.includes(`aria-label="${lang === 'en' ? 'Close' : 'Fermer'}"`), `${lang} · ${cle} : bouton « ${lang === 'en' ? 'Close' : 'Fermer'} »`);
    }
  }
  const K = { ...CM.COIN_CONFIG_FALLBACK, grille_trois_jauges: 1, jauge_annonces_pro: 120, jauge_publications_pro: 1200, jauge_remontees_pro: 0, jauge_annonces_free: 5, jauge_publications_free: 50, jauge_remontees_free: 30 };
  const pro = renderToStaticMarkup(h(CM.CorpsCarteGrille, { fr: true, palier: 'pro', K, dark: true }));
  // (toLocaleString('fr-FR') écrit « 1 200 » avec une espace fine insécable : ramenée à une espace pour comparer)
  const noms = [...pro.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1].replace(/&#x27;/g, '\'').replace(/[  ]/g, ' '));
  ok(noms.join(' | ') === "120 annonces — qu'est-ce que ça compte ? | 1 200 publications — qu'est-ce que ça compte ? | illimitées remontées — qu'est-ce que ça compte ?",
    'carte Pro : 3 boutons nommés « 120 annonces — qu’est-ce que ça compte ? »…', noms.join(' | '));
  ok((pro.match(/class="fs-carre-jauge fs-sombre"/g) ?? []).length === 3 && (pro.match(/aria-haspopup="dialog"/g) ?? []).length === 3 && (pro.match(/aria-expanded="false"/g) ?? []).length === 3,
    'carte Pro : carrés sombres, aria-haspopup="dialog", aria-expanded="false"');
  const free = renderToStaticMarkup(h(CM.CorpsCarteGrille, { fr: false, palier: 'free', K }));
  ok((free.match(/class="fs-carre-jauge fs-clair"/g) ?? []).length === 3 && /aria-label="5 listings — what does it count\?"/.test(free), 'carte Free (EN) : carrés clairs, « 5 listings — what does it count? »');
  ok(texte(pro).startsWith('120 annonces 1 200 publications illimitées remontées par mois'), 'libellés des carrés inchangés (« 120 annonces 1 200 publications illimitées remontées par mois »)', texte(pro).slice(0, 120));
} finally {
  await vite.close();
}

console.log(`\n${rouges ? '✗' : '✓'} jauges-explications : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
