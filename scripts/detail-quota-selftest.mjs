// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE COMPTEUR DE L'EN-TÊTE OUVRE LE DÉTAIL DES QUOTAS, LE BADGE ET « VOIR LES OFFRES » LES FORMULES
// (13/11/2026, bloc B1 de Nico)        npm run selftest:detail-quota
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré du 06 au 13/11 (usage_logs, 7 jours) : 393 ouvertures de la fenêtre des offres, 297 abandons sur son premier
// écran ; la 1re source est la PASTILLE de quota de l'en-tête (148 ouvertures, 77 comptes, 115 abandons au premier
// écran, 2 clics sur une formule), devant « Voir les offres » (126 ouvertures, 17 clics). Le geste « combien il me
// reste ? » tombait sur une vente. Demande de Nico : le compteur mène à un DÉTAIL clair et complet (ce qui est utilisé,
// ce qui reste, quand ça repart) ; le badge Premium / Pro / Business et « Voir les offres » mènent aux formules.
//
// Ce que ce verrou fait tomber :
//   1. une phrase du détail qui ne lit pas la SOURCE UNIQUE (quotas_etat → jaugesDuCompte), une date inventée ou pas
//      à l'heure de Paris, un « illimité » écrit avec un faux chiffre, un texte sans son anglais ;
//   2. une feuille sans ses sorties (glisser, ✕ 44 px, fond, Échap, retour Android), sans les 3 jauges, sans « ce qui
//      compte », avec un lien d'offres qui pousse (bouton plein, en haut) ou montré à un Business ;
//   3. un en-tête dont le compteur rouvre la fenêtre des offres, dont le badge n'ouvre plus « Ton plan », ou dont
//      « Voir les offres » ne mène plus aux formules.
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

// quotas_etat tel que le serveur le rend AVEC la grille (forme relue dans scripts/reglages-jauges-selftest.mjs).
const REMISE = '2026-12-03T23:30:00.000Z';   // 00:30 le 4 décembre à Paris, 23:30 le 3 en UTC : le jour de PARIS
const Q = {
  free: {
    grille: 'trois_jauges', palier: 'free', annonces_mode: 'mensuel', remise_le: REMISE,
    annonces: { plafond: 5, consommes: 2, restantes: 3 },
    publications: { mode: 'mensuel', plafond: 50, consommes: 9, restantes: 41 },
    republication: { mode: 'mensuel', plafond: 30, faites: 8, restantes: 22, remise_le: REMISE },
    retouches: { plafond: 0, consommes: 0, restantes: 0 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null,
  },
  freeVide: {
    grille: 'trois_jauges', palier: 'free', annonces_mode: 'mensuel', remise_le: REMISE,
    annonces: { plafond: 5, consommes: 5, restantes: 0 },
    publications: { mode: 'mensuel', plafond: 50, consommes: 12, restantes: 38 },
    republication: { mode: 'mensuel', plafond: 30, faites: 30, restantes: 0, remise_le: REMISE },
    retouches: { plafond: 0, consommes: 0, restantes: 0 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null,
  },
  pro: {
    grille: 'trois_jauges', palier: 'pro', annonces_mode: 'mensuel', remise_le: REMISE,
    annonces: { plafond: 120, consommes: 64, restantes: 56 },
    publications: { mode: 'mensuel', plafond: 1200, consommes: 380, restantes: 820 },
    republication: { mode: 'illimite' },
    retouches: { plafond: 20, consommes: 7, restantes: 13 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null,
  },
  business: {
    grille: 'trois_jauges', palier: 'business', annonces_mode: 'illimite', remise_le: REMISE,
    annonces: { plafond: null, consommes: 40, restantes: null },
    publications: { mode: 'illimite', plafond: null, consommes: 500, restantes: null },
    republication: { mode: 'illimite' },
    retouches: { plafond: 50, consommes: 11, restantes: 39 }, scans: { plafond: null, consommes: 12, restantes: null },
    lens: { plafond: 600, consommes: 12, restantes: 588 },
  },
};
const sansDate = (q) => { const c = JSON.parse(JSON.stringify(q)); delete c.remise_le; if (c.republication) delete c.republication.remise_le; return c; };

globalThis.document ??= { body: {} };
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
  const DQ = await charger('/src/utils/detailQuota.js');
  const FQ = await charger('/src/components/FeuilleQuota.jsx');
  const J = await charger('/src/utils/jauges.js');
  const EX = await charger('/src/utils/jaugesExplications.js');
  const TR = await charger('/src/i18n/translations.js');

  // ── 1. Les phrases du détail : la source unique, la date de Paris, fr + en ───────────────────────────────────
  console.log('1. Les phrases du détail (utils/detailQuota.js)');
  ok(typeof DQ.resumeQuota === 'function', 'utils/detailQuota.js rend resumeQuota', DQ.__erreur);
  const R = (q, o = {}) => (typeof DQ.resumeQuota === 'function' ? DQ.resumeQuota(q, { lang: 'fr', ...o }) : null);
  const rf = R(Q.free);
  ok(rf?.titre === 'Tes quotas du mois' && rf?.sous === 'Formule Free', 'Free : « Tes quotas du mois » · « Formule Free »', JSON.stringify(rf));
  ok(net(rf?.phrase ?? '') === 'Il te reste 3 annonces, 41 publications et 22 remontées jusqu\'au 4 décembre.', 'Free : ce qui RESTE, les 3 jauges, et jusqu\'à quand (jour de PARIS : 23:30 UTC le 3 = le 4)', rf?.phrase);
  ok(net(rf?.repart ?? '') === 'Tes compteurs repartent à zéro ce jour-là.', 'Free : « Tes compteurs repartent à zéro ce jour-là. » (la date est dans la phrase)', rf?.repart);
  const rv = R(Q.freeVide);
  ok(/^Il te reste 0 annonce, 38 publications et 0 remontée jusqu'au 4 décembre\.$/.test(net(rv?.phrase ?? '')), 'jauges vides : « 0 annonce », « 0 remontée » (accord), jamais caché', rv?.phrase);
  const rp = R(Q.pro);
  ok(net(rp?.phrase ?? '') === 'Il te reste 56 annonces et 820 publications jusqu\'au 4 décembre.' && net(rp?.illimitees ?? '') === 'Remontées : illimitées.',
    'Pro : les jauges finies dans la phrase, « Remontées : illimitées. » à part (jamais un faux chiffre)', JSON.stringify(rp));
  const rb = R(Q.business);
  ok(rb?.phrase == null && net(rb?.illimitees ?? '') === 'Annonces, publications et remontées : illimitées.' && rb?.offres === false
    && net(rb?.repart ?? '') === 'Tes compteurs repartent à zéro le 4 décembre.' && rb?.sous === 'Formule Business',
    'Business : tout illimité, la date dite en entier (Lens, retouches), et AUCUN lien d\'offres (la formule du haut)', JSON.stringify(rb));
  const rs = R(sansDate(Q.free));
  ok(/ce mois-ci\.$/.test(rs?.phrase ?? '') && rs?.repart === 'Tes compteurs repartent à zéro chaque mois.' && rs?.sous === 'Formule Free',
    'date illisible : « ce mois-ci » / « chaque mois », JAMAIS une date inventée', JSON.stringify(rs));
  const rl = R(sansDate(Q.free), { remiseIso: '2026-12-16T10:00:00.000Z' });
  ok(/jusqu'au 16 décembre\.$/.test(rl?.phrase ?? ''), 'la date lue par l\'hôte (coin_wallets.next_grant_at) sert quand quotas_etat ne la rend pas', rl?.phrase);
  const en = R(Q.free, { lang: 'en' });
  ok(en?.titre === 'Your monthly quotas' && en?.sous === 'Free plan' && net(en?.phrase ?? '') === 'You have 3 listings, 41 publications and 22 bumps left until 4 December.'
    && en?.repart === 'Your counters reset on that day.' && en?.offresLibelle === 'Need more? See plans',
    'anglais : titre, phrase, lien', JSON.stringify(en));
  ok(R(null) == null && R({ error: 'x' }) == null, 'rien à montrer (quotas absents ou en erreur) : null, jamais un faux zéro');
  // La source unique : les chiffres de la phrase sont ceux de jaugesDuCompte.
  const jf = J.jaugesDuCompte?.(Q.free);
  ok(jf && rf && rf.phrase.includes(`${jf.annonces.restantes} annonces`) && rf.phrase.includes(`${jf.publications.restantes} publications`) && rf.phrase.includes(`${jf.remontees.restantes} remontées`),
    'les chiffres sont ceux de jaugesDuCompte (même source que l\'en-tête et les Réglages)');
  const srcDQ = sansCommentaires(lire('src/utils/detailQuota.js'));
  ok(/jaugesDuCompte\(/.test(srcDQ) && !/\.plafond\s*-\s*/.test(srcDQ) && !/consommes\s*\+/.test(srcDQ), 'detailQuota ne recalcule aucun reste : il lit jaugesDuCompte (aucune 2e source)');
  ok(/timeZone:\s*'Europe\/Paris'/.test(srcDQ), 'la date se dit à l\'heure de Paris');
  // « Ce qui compte » : la source des définitions est jaugesExplications (une seule).
  ok(Array.isArray(rf?.explications) && rf.explications.length === 3 && rf.explications[0].definition === EX.explicationJauge?.('annonces', 'fr')?.definition
    && rf.explications[2].pas === EX.explicationJauge?.('remontees', 'fr')?.pas, '« Ce qui compte » : les 3 définitions de utils/jaugesExplications (une seule source)');
  const fr = TR.translations?.fr ?? {}, enT = TR.translations?.en ?? {};
  const cles = Object.keys(fr).filter((k) => k.startsWith('quotaDetail'));
  ok(cles.length >= 10 && cles.every((k) => typeof enT[k] === 'string' && enT[k].length > 0), 'chaque texte de la feuille a son anglais (i18n/translations.js)', cles.filter((k) => !enT[k]).join(', '));
  ok(!cles.some((k) => /pépite|pepite/i.test(fr[k])) && !/pépite|plafond/i.test(srcDQ.replace(/\.plafond/g, '')), 'vocabulaire : quotas, jamais « pépites » ni « plafond »');

  // ── 2. La feuille : téléphone d'abord, un geste pour fermer, le lien des offres en bas sans pousser ───────────
  console.log('\n2. La feuille (components/FeuilleQuota.jsx)');
  ok(typeof FQ.default === 'function', 'components/FeuilleQuota.jsx existe', FQ.__erreur);
  const rendre = (q, o = {}) => (typeof FQ.default === 'function'
    ? renderToStaticMarkup(h(FQ.default, { quotas: q, lang: 'fr', palier: q?.palier, offres: q?.palier !== 'business', onFermer() {}, onOffres() {}, lireConfig: null, ...o }))
    : '');
  const html = rendre(Q.free);
  const lu = texte(html);
  ok(/role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-labelledby="/.test(html), 'une vraie fenêtre : role dialog, aria-modal, titre relié');
  ok(/Tes quotas du mois Formule Free Il te reste 3 annonces, 41 publications et 22 remontées jusqu'au 4 décembre\./.test(lu),
    'en tête : le titre, la formule, la date, ce qui reste', lu.slice(0, 400));
  ok(/Annonces 2 \/ 5/.test(lu) && /Publications 9 \/ 50/.test(lu) && /Remontées 8 \/ 30/.test(lu) && /3 annonces restantes ce mois-ci/.test(lu),
    'les 3 jauges : ce qui est UTILISÉ sur le total, et ce qui reste (ConsommationGrille, la même que les Réglages)', lu);
  ok(/Ce qui compte, ce qui ne compte pas/.test(lu) && lu.includes(EX.explicationJauge?.('publications', 'fr')?.definition ?? '§') && /Ne compte jamais :/.test(lu),
    '« Ce qui compte, ce qui ne compte pas » : définitions et exclusions', lu);
  ok(/jusqu'au 4 décembre\. Tes compteurs repartent à zéro ce jour-là\./.test(lu), 'quand ça repart, en clair, juste sous ce qui reste');
  const iLien = html.indexOf('data-quota-offres');
  ok(iLien > 0 && iLien > html.indexOf('Ce qui compte') && /Besoin de plus \? Voir les offres/.test(lu) && lu.trim().endsWith('Besoin de plus ? Voir les offres'),
    'le lien des offres est EN BAS, après tout le détail', lu.slice(-160));
  const lienHtml = html.slice(html.lastIndexOf('<', iLien), html.indexOf('</button>', iLien));
  ok(/<button/.test(lienHtml) && !/linear-gradient|background:#1B6E62|background:#2F9E90/.test(lienHtml.replace(/\s/g, '')) && /text-decoration:underline/.test(lienHtml.replace(/\s/g, '')) && /min-height:44px/.test(lienHtml.replace(/\s/g, '')),
    'le lien ne pousse pas : un lien souligné (44 px de zone tactile), jamais un bouton plein', lienHtml.slice(0, 400));
  ok(/data-fermer-quota/.test(html) && /aria-label="Fermer"/.test(html) && /width:44px;height:44px/.test(html.replace(/\s/g, '')), 'la croix : 44 px, « Fermer »');
  ok(/data-poignee-quota/.test(html) && /data-fond-quota/.test(html), 'la poignée (glisser vers le bas) et le fond (toucher dehors) sont là');
  const hb = texte(rendre(Q.business, { offres: false }));
  ok(!/Voir les offres/.test(hb) && /Annonces, publications et remontées : illimitées\./.test(hb) && /588 scans restants ce mois-ci|Lens/.test(hb), 'Business : tout illimité, Lens, et aucun lien d\'offres', hb);
  const hv = texte(rendre(Q.freeVide));
  ok(/Tes 5 annonces du mois sont créées : elles reviennent le 04\/12\./.test(hv), 'jauge vide : elle dit quand elle revient (la date des Réglages)', hv);
  const he = texte(rendre(Q.free, { lang: 'en' }));
  ok(/Your monthly quotas/.test(he) && /What counts, what doesn't/.test(he) && /Need more\? See plans/.test(he) && !/Tes |remise à zéro|Voir les offres/.test(he), 'anglais : aucun mot français', he);
  const srcFQ = sansCommentaires(lire('src/components/FeuilleQuota.jsx'));
  ok(/useFondFige\(/.test(srcFQ) && /useEchap\(/.test(srcFQ) && /useRetourAndroid\(/.test(srcFQ) && /createPortal\([\s\S]*document\.body/.test(srcFQ),
    'règle des couches : portail sur body, fond figé, Échap et retour Android ferment');
  ok(/onPointerDown/.test(srcFQ) && /onPointerUp/.test(srcFQ) && /SEUIL_FERMETURE/.test(srcFQ), 'un geste pour fermer : glisser vers le bas (seuil)');
  ok(/ConsommationGrille/.test(srcFQ) && /resumeQuota\(/.test(srcFQ) && !/jauge_annonces_free|\b5 annonces\b|\b50 publications\b/.test(srcFQ), 'la feuille lit ConsommationGrille + resumeQuota, aucun chiffre en dur');

  // ── 3. L'en-tête : le compteur → le détail ; le badge → « Ton plan » ; « Voir les offres » → les formules ──────
  console.log('\n3. L\'en-tête (App.jsx)');
  const app = sansCommentaires(lire('src/App.jsx'));
  const i = app.indexOf('<div className={quotas?.annonces?.plafond!=null?"topbar topbar--solde":"topbar"}>');
  const entete = app.slice(i, app.indexOf('<div className="desktop-nav"', i));
  ok(i > 0 && entete.length > 500, 'l\'en-tête est trouvé');
  ok(/onClick=\{appuiPastilleGrille\}/.test(entete) && /const appuiPastilleGrille=\(\)=>ouvrirDetailQuota\(pastilleGrille\?\.cle\?\?null\);/.test(app),
    'la pastille de la grille ouvre le DÉTAIL des quotas', app.slice(app.indexOf('const appuiPastilleGrille'), app.indexOf('const appuiPastilleGrille') + 200));
  const avant = entete.slice(entete.indexOf('{!grilleEntete&&quotas?.annonces?.plafond!=null&&('), entete.indexOf('<div className="header-centre"'));
  ok(/onClick=\{\(\)=>ouvrirDetailQuota\('annonces'\)\}/.test(avant) && !/openUpgradeModal/.test(avant), 'le compteur d\'avant (grille à 0) ouvre aussi le détail, jamais les offres', avant.slice(0, 300));
  const appuiSrc = app.slice(app.indexOf('const ouvrirDetailQuota='), app.indexOf('const appuiPastilleGrille='));
  ok(appuiSrc.length > 20 && !/openUpgradeModal|setConversionModal|ouvrirModalePlafond/.test(appuiSrc) && /logTunnel\('quota_detail_open'/.test(appuiSrc) && /setDetailQuota\(/.test(appuiSrc),
    'ouvrirDetailQuota : la feuille et sa trace (quota_detail_open), aucune porte vers les offres', appuiSrc);
  const offresEntete = entete.match(/openUpgradeModal\([^)]*\)/g) ?? [];
  ok(offresEntete.length === 2 && offresEntete.every((x) => /'entete_offres'/.test(x)), '« Voir les offres » (web et app) : les deux seules portes de l\'en-tête vers les formules', offresEntete.join(' | '));
  ok(/<PlanBadge isPremium=\{isPremium\} isPro=\{isPro\} isBusiness=\{isBusiness\} onClick=\{\(\)=>setShowPremiumModal\(true\)\} \/>/.test(entete)
    && /\{showPremiumModal&&\(\s*<PlanDetailsModal/.test(app), 'le badge Premium / Pro / Business ouvre « Ton plan » (PlanDetailsModal : sa formule et la suivante)');
  const montage = app.slice(app.indexOf('{detailQuota&&('), app.indexOf('{detailQuota&&(') + 1400);
  ok(/<FeuilleQuota/.test(montage) && /quotas=\{quotas\}/.test(montage) && /remiseIso=\{remiseDuCompte\(quotas\)\?\?remiseLueApp\}/.test(montage) && /offres=\{!isBusiness\}/.test(montage),
    'la feuille est montée avec quotas_etat, la remise LUE, et sans offres pour un Business', montage.slice(0, 500));
  const offresSrc = app.slice(app.indexOf('const offresDepuisDetail='), app.indexOf('const offresDepuisDetail=') + 600);
  ok(/onFermer=\{fermerDetailQuota\}/.test(montage) && /onOffres=\{offresDepuisDetail\}/.test(montage)
    && /fermerDetailQuota\('offres'\);\s*if\(mur\)openUpgradeModal\(null,origine,'quota_geste',\{quotaInfo:quotaInfoAvecRemise\(mur\)\}\);\s*else openUpgradeModal\(null,origine\);/.test(offresSrc)
    && /murDeLaJauge\(cle,quotas\)/.test(offresSrc),
    'le lien en bas ferme la feuille PUIS ouvre les offres (sur le mur de la jauge de la pastille si elle est vide)', offresSrc);
  ok(/logTunnel\('quota_detail_ferme',\{sortie:sortie\?\?null,duree_ms:/.test(app), 'la fermeture laisse sa trace (quota_detail_ferme : sortie, durée)');
  ok(DQ.ORIGINE_DETAIL_QUOTA === 'detail_quota' && DQ.ORIGINE_DETAIL_QUOTA_JAUGE === 'detail_quota_jauge', 'les origines des offres ouvertes depuis le détail se lisent en base (detail_quota, detail_quota_jauge)');
} finally {
  await vite.close();
}

console.log(`\n${rouges ? `✗ detail-quota : ${rouges} rouge(s), ${verts} vert(s)` : `✓ detail-quota : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
