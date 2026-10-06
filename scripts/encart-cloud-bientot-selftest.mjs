// Autotest — l'encart « Bientôt : FillSell Cloud » de la feuille des offres (06/10/2026).
//
//     node --import ./scripts/loader-ext.mjs scripts/encart-cloud-bientot-selftest.mjs
//
// Ce qu'il verrouille, sans réseau ni base :
//   1. LA DÉCISION (encartCloudVisible) : montré seulement si l'interrupteur
//      est levé, que le compte ne voit pas la vraie offre, et que son état Cloud
//      est LU et vierge — jamais pour un compte qui a l'option (payée, en essai,
//      suspendue) ou l'a essayée, jamais sur une lecture absente ou ratée ;
//   2. LE BLOC, rendu (fr et en) : titre, pastille « Bientôt », la ligne ;
//      aucun prix, aucune date, aucun bouton ni lien, aucune liste d'attente,
//      rien contre l'extension ; l'anglais sans un mot de français ;
//   3. LA FEUILLE : l'encart est SOUS les cartes (après la dernière carte,
//      avant la sortie) dans les trois vues qui montrent des formules, et la
//      feuille rendue AVEC l'encart est, l'encart retiré, IDENTIQUE à la feuille
//      SANS lui (mêmes cartes, mêmes prix, mêmes boutons, mêmes textes) ;
//   4. LE RETRAIT : un seul interrupteur, un seul composant, importé par la
//      seule feuille des offres.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail ? `\n      ${String(detail).slice(0, 500)}` : ''}`); } };

const P = await import(pathToFileURL(join(ROOT, 'src/utils/palier.js')).href);
const n = Date.parse('2026-10-10T06:00:00Z');
const lu = (profil) => ({ etat: 'ok', cloud: P.cloudDuProfil(profil, n), profil });
const J = 86_400_000;
const iso = (t) => new Date(t).toISOString();

// La décision est pure : on la charge par Vite (le fichier est un .jsx).
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const portail = join(ROOT, 'scripts/lib/portail-en-place.mjs');
// Une lecture Cloud FIXÉE par le test (le vrai hook ne lit qu'après le montage,
// ce que le rendu serveur ne fait pas) : même contrat que useCloudProfil —
// `actif` faux → 'inactif', sinon la lecture posée dans globalThis.
const FAUX_HOOK = '\0faux-use-cloud-profil';
const fauxHook = {
  name: 'faux-use-cloud-profil',
  enforce: 'pre',
  resolveId(source) { return /(^|\/)useCloudProfil(\.js)?$/.test(source) ? FAUX_HOOK : null; },
  load(id) {
    if (id !== FAUX_HOOK) return null;
    return `export const COLONNES_CLOUD = '';
export function useCloudProfil(userId, { actif = true } = {}) {
  if (!(actif && userId)) return { etat: 'inactif', cloud: null, relire() {} };
  globalThis.__lecturesCloud = (globalThis.__lecturesCloud || 0) + 1;
  return globalThis.__LECTURE_CLOUD || { etat: 'lecture', cloud: null, relire() {} };
}
export function useCloudReglages() { return { etat: 'inactif', cloud: null, profil: null, luLe: null, relire() {} }; }`;
  },
};
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  plugins: [fauxHook],
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: portail }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const E = await vite.ssrLoadModule('/src/cloud/EncartCloudBientot.jsx');
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  console.log('1. La décision');
  const V = E.encartCloudVisible;
  ok(E.ENCART_CLOUD_BIENTOT === true, 'interrupteur levé (ENCART_CLOUD_BIENTOT) — à baisser à la sortie du Cloud');
  ok(V({ lecture: lu({}) }) === true, 'compte sans option, état lu → montré');
  ok(V({ lecture: lu({ is_premium: true }) }) === true && V({ lecture: lu({ is_premium: true, is_pro: true, is_business: true }) }) === true, 'Premium, Business sans option → montré');
  ok(V({ interrupteur: false, lecture: lu({}) }) === false, 'interrupteur baissé → rien');
  ok(V({ offreOuverte: true, lecture: lu({}) }) === false, 'compte qui voit la vraie offre (témoin) → rien');
  ok(V({ lecture: lu({ is_cloud: true }) }) === false && V({ lecture: lu({ is_pro: true, is_cloud: true }) }) === false, 'option payée (is_cloud), avec ou sans formule → rien');
  ok(V({ lecture: lu({ is_premium: true, cloud_essai_debut: iso(n - 2 * J), cloud_essai_fin: iso(n + 5 * J) }) }) === false, 'option en essai → rien');
  ok(V({ lecture: lu({ is_premium: true, cloud_essai_debut: iso(n - 20 * J), cloud_essai_fin: iso(n - 13 * J) }) }) === false, 'essai déjà fait → rien (« Bientôt » serait faux pour lui)');
  for (const etat of ['lecture', 'echec', 'inactif']) ok(V({ lecture: { etat, cloud: null } }) === false, `état « ${etat} » (pas lu ou raté) → rien, jamais deviné`);
  ok(V({ lecture: null }) === false && V() === false, 'aucune lecture → rien');

  console.log('2. Le bloc, rendu');
  for (const lang of ['fr', 'en']) {
    const T = E.textesEncartCloud(lang);
    const html = renderToStaticMarkup(h(E.EncartCloudBientotVue, { lang }));
    const t = texte(html);
    const net = (s) => s.replace(/\s+/g, ' ');
    ok(t.includes(T.titre) && t.includes(T.pastille) && t.includes(net(T.ligne)), `${lang} : titre, pastille, ligne`, t);
    ok(lang === 'fr' ? /FillSell Cloud/.test(t) && /Bientôt/.test(t) : /FillSell Cloud/.test(t) && /Coming soon/.test(t), `${lang} : « FillSell Cloud » annoncé comme à venir`);
    ok(!/€|\$|£|\d/.test(t), `${lang} : aucun prix, aucun chiffre, aucune date`, t);
    ok(!/<(button|a|input|select|textarea)\b|onclick|href=|role="(button|link)"|tabindex/i.test(html), `${lang} : rien de cliquable (ni bouton, ni lien, ni champ)`, html);
    ok(!/liste d.attente|inscri|pr[ée]venu|notifi|waitlist|sign ?up|notify|join/i.test(t), `${lang} : ni inscription ni liste d’attente`, t);
    ok(!/compliqu|p[ée]nible|lourd|gal[èe]re|fini l.extension|adieu|plus jamais|annoying|hassle|painful|clunky|no more extension/i.test(t), `${lang} : rien contre l’extension`, t);
    ok(!/janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|semaine|mois|jours?\b|week|month|days?\b|quarter|trimestre|202\d/i.test(t), `${lang} : aucune promesse de délai`, t);
  }
  const en = texte(renderToStaticMarkup(h(E.EncartCloudBientotVue, { lang: 'en' })));
  ok(!/Bientôt|ordinateur|annonces|éteint|tes |plus besoin/i.test(en), 'en : aucun mot de français', en);
  ok(!/\bvous\b/i.test(E.textesEncartCloud('fr').ligne), 'fr : tutoiement');

  console.log('3. La feuille des offres');
  const src = lire('src/components/ConversionModal.jsx');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
  ok((code.match(/\{encartCloud\}/g) ?? []).length === 3, 'monté dans les trois vues qui montrent des formules (Pro → Business, Premium → Pro, Free)');
  const vues = code.split(/\n\s*return \(\n\s*<Sheet onClose=\{fermer\}>/).slice(1);
  const avecEncart = vues.filter((v) => v.includes('{encartCloud}'));
  ok(avecEncart.length === 3 && avecEncart.every((v) => {
    const iE = v.indexOf('{encartCloud}');
    const iCarte = Math.max(v.lastIndexOf('<PlansStack'), v.lastIndexOf('<BusinessPlanCard'));
    const iSortie = v.indexOf('<Dismiss');
    return iCarte >= 0 && iCarte < iE && iE < iSortie;
  }), 'toujours SOUS la dernière carte, avant la sortie — jamais au-dessus des offres');
  ok(!vues.some((v) => /\{encartCloud\}[\s\S]*<(PlansStack|BusinessPlanCard|PremiumPlanCard|ProPlanCard)/.test(v.split('<Dismiss')[0])), 'aucune carte de formule après l’encart');

  const base = { isOpen: true, onClose() {}, onUpgrade() {}, userId: 'compte-ordinaire' };
  const cas = [
    ['Free', {}], ['Premium', { isPremium: true }],
    ['Pro (offre Business ouverte ou non)', { isPremium: true, isPro: true }],
  ];
  const retirerEncart = (html) => html.replace(/<section data-encart-cloud-bientot[\s\S]*?<\/section>/, '');
  for (const lang of ['fr', 'en']) {
    for (const [nom, drapeaux] of cas) {
      globalThis.__LECTURE_CLOUD = lu({});
      const avec = renderToStaticMarkup(h(CM.default, { ...base, ...drapeaux, lang }));
      globalThis.__LECTURE_CLOUD = lu({ is_cloud: true, ...(drapeaux.isPremium ? { is_premium: true } : {}) });
      const sans = renderToStaticMarkup(h(CM.default, { ...base, ...drapeaux, lang }));
      const montre = avec.includes('data-encart-cloud-bientot');
      if (nom.startsWith('Pro')) {
        // Pro sans offre Business ouverte = « déjà au maximum » : aucune carte, donc pas d'encart.
        const aDesCartes = /Passer Business|Go Business/.test(avec);
        ok(montre === aDesCartes, `${lang} · ${nom} : encart ${aDesCartes ? 'sous la carte Business' : 'absent (aucune formule montrée)'}`);
      } else {
        ok(montre, `${lang} · ${nom} : encart montré pour un compte sans option`);
      }
      ok(!sans.includes('data-encart-cloud-bientot'), `${lang} · ${nom} : encart absent pour un compte qui a l’option`);
      ok(retirerEncart(avec) === sans, `${lang} · ${nom} : l’encart retiré, la feuille est IDENTIQUE octet pour octet (cartes, prix, boutons, textes)`);
      if (montre) {
        const iEncart = avec.indexOf('data-encart-cloud-bientot');
        const boutons = [...avec.matchAll(/<button\b/g)].map((m) => m.index);
        const derniereCarte = Math.max(avec.lastIndexOf(lang === 'fr' ? 'Passer Premium' : 'Go Premium'), avec.lastIndexOf(lang === 'fr' ? 'Passer Pro' : 'Go Pro'), avec.lastIndexOf(lang === 'fr' ? 'Passer Business' : 'Go Business'));
        ok(derniereCarte > 0 && derniereCarte < iEncart, `${lang} · ${nom} : rendu APRÈS le dernier bouton d’abonnement`);
        ok(!boutons.some((b) => b > iEncart && b < iEncart + avec.slice(iEncart).indexOf('</section>')), `${lang} · ${nom} : aucun bouton dans l’encart`);
      }
    }
  }
  globalThis.__LECTURE_CLOUD = null;
  globalThis.__lecturesCloud = 0;
  renderToStaticMarkup(h(CM.default, { ...base, lang: 'fr', userId: null }));
  ok((globalThis.__lecturesCloud || 0) === 0, 'sans compte : aucune lecture Cloud tentée');

  console.log('4. Le retrait');
  const importeurs = [];
  const marcher = (d) => {
    for (const e of fs.readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) { marcher(p); continue; }
      if (/\.(jsx?|mjs)$/.test(e.name) && /from ['"][^'"]*EncartCloudBientot['"]/.test(lire(p))) importeurs.push(p);
    }
  };
  marcher('src');
  ok(importeurs.length === 1 && importeurs[0] === 'src/components/ConversionModal.jsx', 'un seul importeur : la feuille des offres', importeurs.join(', '));
  const comp = lire('src/cloud/EncartCloudBientot.jsx');
  ok(/À RETIRER À LA SORTIE DU CLOUD/.test(comp) && (comp.match(/export const ENCART_CLOUD_BIENTOT = /g) ?? []).length === 1, 'un seul interrupteur, et le fichier dit qu’il est à retirer à la sortie du Cloud');
  ok(!/supabase\.|fetch\(/.test(comp.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), 'aucune requête propre : l’état passe par useCloudProfil (requête à part, une fois)');
} finally {
  await vite.close();
}

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
