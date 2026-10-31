// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN JOB, PORTÉ DANS L'EXTENSION (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le popup de l'extension n'est pas un module ES et n'a pas de bundler : il
// embarque une copie de supabase/functions/_shared/etat-job.js et de ses trois
// dépendances, recopiées À L'OCTET PRÈS — seuls les `import`/`export` sont
// remplacés par une publication locale. Même doctrine que
// gen-tailles-content-script.mjs : on ne réécrit jamais la règle, on la recopie.
// `selftest:etat-job` refuse toute divergence entre la source et la copie.
//
//   node scripts/gen-etat-job-extension.mjs
import fs from 'node:fs';

// Ordre = ordre des dépendances (un module n'importe que ceux d'avant).
const SOURCES = [
  ['publicationState', 'src/utils/publicationState.js'],
  ['retenueServeur', 'src/utils/retenueServeur.js'],
  ['attenteAutreBoutique', 'supabase/functions/_shared/attente-autre-boutique.js'],
  // (31/10, lot F) La pause : la même règle que le serveur (jobRetenuParPause), recopiée, jamais réécrite.
  ['retenueCreneau', 'supabase/functions/_shared/retenue-creneau.js'],
  ['filePause', 'supabase/functions/_shared/file-pause.js'],
  ['etatJob', 'supabase/functions/_shared/etat-job.js'],
];
export const CIBLE = 'chrome-extension/etat-job.js';

const FICHIER_VERS_NOM = {
  'lien-vinted.js': 'lienVinted',
  'publicationState.js': 'publicationState',
  'retenueServeur.js': 'retenueServeur',
  'attente-autre-boutique.js': 'attenteAutreBoutique',
  'retenue-creneau.js': 'retenueCreneau',
  'file-pause.js': 'filePause',
};

// (18/10 nuit, point 4) _shared/lien-vinted.js n'est PAS recopié : dans
// l'extension, l'origine Vinted est celle de chrome-extension/vinted-origine.js
// (le domaine du vendeur, vinted.fr par défaut) — selftest:vinted-origine, a.
// Le popup charge vinted-origine.js : l'origine est lue à l'appel, jamais au
// chargement ; absente, aucun lien et « Vinted » dans la phrase.
const LIEN_VINTED_EXTENSION = [
  '// ── lien-vinted (extension) : l\'origine unique, chrome-extension/vinted-origine.js ──',
  '__M.lienVinted = (() => {',
  'const origineVinted = () => globalThis.FILLSELL_VINTED?.origineVinted?.() ?? null;',
  'const domaineVinted = () => { const o = origineVinted(); return o ? new URL(o).host.replace(/^www\\./, "") : "Vinted"; };',
  'const lienAnnonceVinted = (numero) => { const o = origineVinted(); return o ? `${o}/items/${numero}` : null; };',
  'return { origineVinted, domaineVinted, lienAnnonceVinted };',
  '})();',
].join('\n');

export function genererEtatJobExtension() {
  const blocs = [LIEN_VINTED_EXTENSION];
  for (const [nom, chemin] of SOURCES) {
    const src = fs.readFileSync(chemin, 'utf8');
    const exportes = [];
    let corps = src
      // `import { a, b } from "./x.js";` → `const { a, b } = __M.x;`
      .replace(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/gm, (_, noms, from) => {
        const fichier = from.split('/').pop();
        const module = FICHIER_VERS_NOM[fichier];
        if (!module) throw new Error(`⛔ ${chemin} importe ${from} : hors de la liste du générateur`);
        return `const { ${noms.trim()} } = __M.${module};`;
      })
      .replace(/^export (const|function|let) (\w+)/gm, (_, mot, id) => { exportes.push(id); return `${mot} ${id}`; });
    const restant = corps.match(/^(export|import)\b.*$/m);
    if (restant) throw new Error(`⛔ ${chemin} : forme non gérée par le générateur : ${restant[0]}`);
    blocs.push(`// ── ${chemin} ──────────────────────────────────────────────────\n__M.${nom} = (() => {\n${corps}\nreturn { ${exportes.join(', ')} };\n})();`);
  }
  const entete = [
    '// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.',
    '//   node scripts/gen-etat-job-extension.mjs',
    '// Sources recopiées à l\'octet près (seuls import/export changent) :',
    ...SOURCES.map(([, c]) => `//   ${c}`),
    '// Le popup lit globalThis.FILLSELL_ETAT_JOB — un seul calcul d\'état, le même que l\'app.',
    '(() => {',
    'const __M = {};',
    '',
  ].join('\n');
  const pied = [
    '',
    'globalThis.FILLSELL_ETAT_JOB = __M.etatJob;',
    '})();',
    '',
  ].join('\n');
  return entete + blocs.join('\n\n') + pied;
}

if (process.argv[1] && /gen-etat-job-extension\.mjs$/.test(process.argv[1])) {
  const contenu = genererEtatJobExtension();
  fs.writeFileSync(CIBLE, contenu);
  console.log(`${CIBLE} régénéré (${contenu.length} caractères).`);
}
