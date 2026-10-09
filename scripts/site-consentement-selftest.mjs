// selftest:site-consentement — un consentement, deux bandeaux, UN texte (09/10/2026).
//
// Le bandeau React (src/components/BandeauConsentement.jsx, pages de l'app) et
// celui du site vitrine (site/js/bandeau.js, sans React) demandent le MÊME
// consentement : mêmes textes, mêmes boutons dans le même ordre, même lien,
// même clé de stockage — sinon la personne n'a pas consenti à la même chose
// selon la page où elle a répondu. Ce test prouve :
//   1. le composant React rend EXACTEMENT le même HTML qu'avant le
//      remaniement (comparé à la version de HEAD, si git répond) ;
//   2. il ne porte plus aucun texte en dur : tout vient de consentementTextes.js ;
//   3. le bandeau du site dit le même texte, dans le même ordre, avec le même
//      lien, le même libellé d'accessibilité et les mêmes valeurs de boutons ;
//   4. site.js écrit la même clé (fs_consent_pub, via consentement.js) ;
//   5. FR et EN ont les mêmes clés de textes.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXTES_CONSENTEMENT } from '../src/utils/consentementTextes.js';
import { ACCEPTE, REFUSE } from '../src/utils/consentement.js';
import { htmlBandeau } from '../site/js/bandeau.js';
import { texteBrut, balisesOuvrantes } from './site/lib/html.mjs';
import { bundler } from './site/lib/bundles.mjs';
import { constantesSupabase } from './site/lib/constantes-app.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
let passes = 0;
function ok(cond, message) {
  if (cond) { passes++; return; }
  echecs++;
  console.error(`  ✗ ${message}`);
}

// Rend un composant React (source JSX donnée) par rolldown + react-dom/server,
// sans rien écrire dans le dépôt : le module virtuel est déclaré à côté du vrai
// composant pour que ses imports relatifs se résolvent pareil.
const temp = mkdtempSync(path.join(tmpdir(), 'fs-consentement-'));
async function rendreComposant(sourceJsx, nom) {
  const { build } = await import('rolldown');
  const virtuel = path.join(racine, 'src', 'components', `__${nom}__.jsx`).split(path.sep).join('/');
  const entree = path.join(racine, 'src', 'components', `__entree_${nom}__.jsx`).split(path.sep).join('/');
  const r = await build({
    input: entree, cwd: racine, platform: 'node', write: false, logLevel: 'silent',
    transform: { jsx: 'react-jsx' },
    plugins: [{
      name: 'virtuel',
      resolveId(id, importeur) {
        if (id === entree) return entree;
        if (importeur === entree && id === './composant.jsx') return virtuel;
        return null;
      },
      load(id) {
        if (id === entree) return { code: "import B from './composant.jsx';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';export const html = renderToStaticMarkup(createElement(B));", moduleType: 'jsx' };
        if (id === virtuel) return { code: sourceJsx, moduleType: 'jsx' };
        return null;
      },
    }],
    output: { format: 'esm' },
  });
  const fichier = path.join(temp, `${nom}.mjs`);
  writeFileSync(fichier, r.output[0].code);
  return (await import(pathToFileURL(fichier).href)).html;
}

try {
  const fichierJsx = path.join(racine, 'src', 'components', 'BandeauConsentement.jsx');
  const actuel = readFileSync(fichierJsx, 'utf8');
  const htmlReact = await rendreComposant(actuel, 'actuel');
  const t = TEXTES_CONSENTEMENT.fr;

  // 1. Rendu identique à la version d'avant (HEAD).
  let avant = null;
  try {
    avant = execFileSync('git', ['show', 'HEAD:src/components/BandeauConsentement.jsx'], { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { /* git absent : comparaison sautée, dite ci-dessous */ }
  if (avant && !avant.includes('consentementTextes')) {
    const htmlAvant = await rendreComposant(avant, 'avant');
    ok(htmlAvant === htmlReact, `le bandeau React ne rend plus le même HTML qu'avant\n      avant : ${htmlAvant}\n      après : ${htmlReact}`);
  } else {
    console.log('  (version de HEAD déjà remaniée ou git absent : comparaison avant/après sautée)');
  }

  // 2. Plus aucun texte en dur dans le composant.
  ok(/from '\.\.\/utils\/consentementTextes'/.test(actuel), 'BandeauConsentement.jsx importe consentementTextes');
  // (sur le CODE seulement : les commentaires d'en-tête parlent de « Refuser »)
  const code = actuel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [cle, valeur] of Object.entries(t)) {
    if (cle === 'lienHref') continue;
    const morceau = valeur.split(' ').slice(0, 4).join(' ');
    ok(!code.includes(morceau), `BandeauConsentement.jsx porte encore « ${morceau} » en dur (${cle})`);
  }

  // 3. Le bandeau du site dit la même chose.
  const htmlSite = htmlBandeau(t);
  ok(texteBrut(htmlSite) === texteBrut(htmlReact), `textes différents\n      React : ${texteBrut(htmlReact)}\n      site  : ${texteBrut(htmlSite)}`);
  const lien = (h) => balisesOuvrantes(h, 'a').map((a) => a.attrs.href).join();
  ok(lien(htmlSite) === lien(htmlReact) && lien(htmlSite) === '/legal#confidentialite', `même lien (${lien(htmlReact)} / ${lien(htmlSite)})`);
  const libelle = (h) => balisesOuvrantes(h, 'div').find((d) => d.attrs.role === 'dialog')?.attrs['aria-label'];
  ok(libelle(htmlSite) === libelle(htmlReact) && !!libelle(htmlSite), 'même rôle dialog et même aria-label');
  const boutons = (h) => [...h.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1].trim()).join('|');
  ok(boutons(htmlSite) === boutons(htmlReact) && boutons(htmlSite) === `${t.refuser}|${t.accepter}`, `mêmes boutons, même ordre (Refuser puis Accepter) : ${boutons(htmlReact)} / ${boutons(htmlSite)}`);
  const valeurs = balisesOuvrantes(htmlSite, 'button').map((b) => b.attrs['data-consentement']).join();
  ok(valeurs === `${REFUSE},${ACCEPTE}`, `boutons du site : valeurs de consentement.js (${valeurs})`);
  ok(!/\sstyle=/.test(htmlSite), 'bandeau du site : aucun style= en ligne (tout dans site.css)');

  // 4. Même clé de stockage (site.js passe par consentement.js).
  const { url, cle, cleJeton } = constantesSupabase(racine);
  const siteJs = await bundler(path.join(racine, 'site', 'js', 'site.js'), {
    racine, define: { __FS_CLE_JETON__: cleJeton, __FS_SUPABASE_URL__: url, __FS_SUPABASE_CLE__: cle },
  });
  const sourceConsentement = readFileSync(path.join(racine, 'src', 'utils', 'consentement.js'), 'utf8');
  const cleStockage = /const CLE = '([^']+)'/.exec(sourceConsentement)?.[1];
  ok(cleStockage === 'fs_consent_pub', `clé de consentement.js = fs_consent_pub (${cleStockage})`);
  ok(siteJs.includes(cleStockage), 'site.js (bundle) écrit la même clé de stockage');
  ok(siteJs.includes(t.texte.slice(0, 30)) && siteJs.includes(TEXTES_CONSENTEMENT.en.texte.slice(0, 30)), 'site.js (bundle) porte les textes du module partagé');
  ok(!/supabase-js|createClient/.test(siteJs), 'site.js n\'embarque pas supabase-js');

  // 5. FR et EN : mêmes clés.
  ok(JSON.stringify(Object.keys(TEXTES_CONSENTEMENT.fr).sort()) === JSON.stringify(Object.keys(TEXTES_CONSENTEMENT.en).sort()), 'FR et EN ont les mêmes clés');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`selftest:site-consentement — ${passes} vérifications passées, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
