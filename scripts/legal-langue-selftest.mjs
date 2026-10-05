// Selftest — la langue de /legal (05/10/2026).
//
//     npm run selftest:legal-langue
//
// Un lecteur réglé en anglais qui arrive sur /legal sans fs_lang (pied d'un mail
// anglais, autre navigateur) voyait la page en français. /legal lit désormais
// `?lang=en|fr` AVANT le réglage de l'app. Ce test rend la vraie page
// (react-dom/server, sans réseau) et prouve :
//   · sans paramètre : exactement le rendu d'avant (fs_lang, sinon français) ;
//   · ?lang=en sans fs_lang (le lecteur du mail) → anglais ;
//   · ?lang=fr avec fs_lang=en → français ; ?lang=xx → le réglage décide ;
//   · sans `window` (rendu serveur, crawler) → le réglage, sinon le français.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

globalThis.document ??= { body: {}, getElementById: () => null };
const stockage = new Map();
globalThis.localStorage = { getItem: (k) => stockage.get(k) ?? null, setItem: (k, v) => stockage.set(k, v), removeItem: (k) => stockage.delete(k) };
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { MemoryRouter } = await import('react-router-dom');

const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const rendre = (L, { fsLang = null, search = null } = {}) => {
  stockage.clear();
  if (fsLang) stockage.set('fs_lang', fsLang);
  if (search == null) delete globalThis.window;
  else globalThis.window = { location: { search, hash: '', pathname: '/legal', href: `https://fillsell.app/legal${search}` } };
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(L.default)));
};
const estAnglais = (html) => /Legal notice|Terms of (Use|Sale)|Privacy policy/i.test(html) && !/Mentions légales —|Conditions générales d.utilisation/.test(html);
const estFrancais = (html) => /Mentions légales|Conditions générales/.test(html);

try {
  const L = await vite.ssrLoadModule('/src/pages/Legal.jsx');
  console.log('Sans paramètre : le rendu d’avant');
  const frSansRien = rendre(L, { search: '' });
  const frServeur = rendre(L, {});
  const enReglage = rendre(L, { fsLang: 'en', search: '' });
  ok(estFrancais(frSansRien) && frSansRien === frServeur, 'aucun réglage → français (navigateur comme rendu serveur, identiques)');
  ok(estAnglais(enReglage), 'fs_lang=en → anglais (comme avant)');
  ok(rendre(L, { fsLang: 'en' }) === enReglage, 'sans window (crawler, rendu serveur) : le réglage décide');

  console.log('\nAvec ?lang=');
  const enMail = rendre(L, { search: '?lang=en' });
  ok(estAnglais(enMail), '?lang=en sans fs_lang (lecteur d’un mail anglais) → anglais');
  ok(enMail === enReglage, '?lang=en rend EXACTEMENT la page anglaise d’avant');
  ok(rendre(L, { fsLang: 'en', search: '?lang=fr' }) === frSansRien, '?lang=fr avec fs_lang=en → la page française d’avant');
  ok(rendre(L, { fsLang: 'en', search: '?lang=xx' }) === enReglage && rendre(L, { search: '?lang=xx' }) === frSansRien, '?lang inconnu → le réglage, sinon le français');
  ok(rendre(L, { search: '?utm_source=mail&lang=en' }) === enReglage, '?lang=en parmi d’autres paramètres → anglais');
  ok(stockage.size === 0, 'la page n’écrit rien dans le stockage (le réglage de l’app n’est jamais changé)');
} finally {
  delete globalThis.window;
  await vite.close();
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
