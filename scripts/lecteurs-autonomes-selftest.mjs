// ═══════════════════════════════════════════════════════════════════════════
// UNE FONCTION ENVOYÉE DANS UNE PAGE N'A AUCUNE RÉFÉRENCE EXTÉRIEURE — `npm run selftest:lecteurs-autonomes`
// ═══════════════════════════════════════════════════════════════════════════
// 09/11 soir (commande Beebs 1723956 de louis-seller jamais vue). chrome.scripting.executeScript({ func }) n'envoie dans
// l'onglet que le TEXTE de la fonction : tout ce qu'elle appelle doit vivre DEDANS (ou être un objet du navigateur).
// Le 23/10 (f081a28, extension 0.6.132), trois fonctions du flux RSC de Beebs ont été posées À CÔTÉ de
// lecteurCommandesBeebs : dans la page, « commandesDuFluxRsc is not defined », résultat vide, aucun appel au serveur —
// plus aucun bilan ventes_beebs_commandes après le 25/10 17:09 (les derniers venaient tous d'un build d'avant, 4098342),
// aucune vente Beebs lue. Le selftest du lecteur l'appelait dans Node, avec ses voisines : vert.
// LA RÈGLE, vérifiée ici pour CHAQUE fonction que background.js envoie dans une page depuis messagerie.js :
//   · aucune variable libre hors des objets du navigateur (ESLint no-undef sur le texte seul de la fonction) ;
//   · la liste des familles est relue dans background.js : une nouvelle famille injectée sans contrôle = rouge.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(RACINE, 'package.json'));
const { Linter } = require('eslint');
const globals = require('globals');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');

let ko = 0, ok = 0;
const verifier = (cond, nom) => { if (cond) { ok++; console.log(`  ✓ ${nom}`); } else { ko++; console.error(`  ✗ ${nom}`); } };

const MS = lire('chrome-extension/messagerie.js');
const BG = lire('chrome-extension/background.js');
const g = {};
new Function('globalThis', 'self', MS)(g, g);
const M = g.FILLSELL_MESSAGERIE;

// Les familles de messagerie.js que background.js envoie dans une page (executerDansOngletPlateforme).
const FAMILLES = {
  LECTEURS: M.LECTEURS,
  ENVOYEURS: M.ENVOYEURS,
  CHEMINS_BORDEREAU: M.CHEMINS_BORDEREAU,
  lireRepublierVinted: { vinted: M.lireRepublierVinted },
  posterRepublierVinted: { vinted: M.posterRepublierVinted },
};

// 1. background.js n'injecte rien d'autre de messagerie.js que ces familles.
const injectees = new Set();
for (const m of BG.matchAll(/executerDansOngletPlateforme\([^,]+,\s*([A-Za-z_.[\]]+)/g)) injectees.add(m[1]);
for (const m of BG.matchAll(/const (\w+) = M\.(ENVOYEURS|CHEMINS_BORDEREAU|LECTEURS)\[/g)) injectees.add(`${m[1]}=M.${m[2]}`);
const connues = (expr) => /^(M\.LECTEURS\.\w+\.\w+|L\.(liste|details|commandes)|M\.lireRepublierVinted|M\.posterRepublierVinted|chemin|envoyeur)$/.test(expr)
  || /=M\.(ENVOYEURS|CHEMINS_BORDEREAU|LECTEURS)$/.test(expr)
  || !/^(M|L)\b/.test(expr); // une fonction de background.js elle-même (hors de ce contrôle)
const inconnues = [...injectees].filter((e) => !connues(e));
verifier(inconnues.length === 0, `toute fonction de messagerie.js envoyée dans une page est contrôlée ici (${inconnues.join(', ') || 'aucune inconnue'})`);
verifier(/const L = M\.LECTEURS\[platform\]|L = M\.LECTEURS\[/.test(BG) || /M\.LECTEURS\[/.test(BG), 'les lecteurs de la messagerie passent par M.LECTEURS');

// 2. Chaque fonction, relue depuis son seul texte : aucune variable libre hors du navigateur.
const linter = new Linter({ configType: 'flat' });
const config = [{ languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser } }, rules: { 'no-undef': 'error' } }];
let nb = 0;
for (const [famille, table] of Object.entries(FAMILLES)) {
  verifier(table && typeof table === 'object', `${famille} est exportée par messagerie.js`);
  for (const [pf, valeur] of Object.entries(table ?? {})) {
    const fonctions = typeof valeur === 'function' ? { [pf]: valeur } : (valeur ?? {});
    for (const [nom, fn] of Object.entries(fonctions)) {
      if (typeof fn !== 'function') continue;
      nb++;
      const libres = [...new Set(linter.verify(`(${fn.toString()});`, config)
        .filter((m) => m.ruleId === 'no-undef').map((m) => m.message.match(/'([^']+)'/)?.[1]))];
      verifier(libres.length === 0, `${famille}.${pf}${typeof valeur === 'function' ? '' : `.${nom}`} (${fn.name}) : ${libres.length ? `RÉFÉRENCES EXTÉRIEURES ${libres.join(', ')}` : 'autonome'}`);
    }
  }
}
verifier(nb >= 21, `${nb} fonctions contrôlées (21 le 09/11)`);

// 3. Le cas d'origine : le lecteur des ventes Beebs, reconstruit depuis son texte, se compile et ne référence rien d'extérieur.
const seul = new Function(`"use strict"; return (${M.LECTEURS.beebs.commandes.toString()});`)();
verifier(typeof seul === 'function', 'lecteurCommandesBeebs se reconstruit depuis son seul texte');

// 4. Un échec de lecture de la page des ventes Beebs se TRACE au serveur (plus jamais 15 jours de console seule).
const iLire = BG.indexOf('async function lireVentesBeebsSiDue(');
const corpsLire = iLire >= 0 ? BG.slice(iLire, BG.indexOf('\n}\n', iLire)) : '';
verifier(/if \(!cmd\?\.ok\) \{[\s\S]*?feature: "ventes_beebs_lecture_echec"[\s\S]*?return;\s*\}/.test(corpsLire),
  'lireVentesBeebsSiDue : un échec écrit usage_logs « ventes_beebs_lecture_echec » (motif, détail, build), puis ne décide rien');

console.log(`\n${ok} vert(s), ${ko} rouge(s)`);
if (ko) process.exit(1);
