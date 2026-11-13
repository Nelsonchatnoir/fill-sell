// ═══════════════════════════════════════════════════════════════════════════
// LE JUGE D'ÉTAT, PORTÉ DANS L'EXTENSION (12/11, lot « zéro problème », 1d-i — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Trois copies de la même règle d'état vivaient côte à côte (get-pending-jobs, leboncoin.js, _shared) et l'écran n'en
// avait aucune. Désormais UN juge : supabase/functions/_shared/etat-correspondance.js. Le content script Leboncoin
// n'est pas un module ES : il embarque une COPIE de ce module, recopiée à l'octet près (seuls les `export` tombent),
// dans un bloc borné de chrome-extension/content-scripts/leboncoin.js — même doctrine que gen-etat-job-extension.mjs et
// gen-tailles-content-script.mjs : on ne réécrit jamais la règle, on la recopie. Le bloc vit DANS leboncoin.js (pas de
// fichier de plus, manifeste inchangé, monde d'exécution inchangé). `selftest:etat-grille-ecran` refuse toute divergence.
// (13/11, lot « zéro problème » 5e) Même copie dans content-scripts/vinted.js : l'état d'une annonce Vinted part dans
// l'envoi par son IDENTIFIANT (status_id), tiré de la copie ou d'une réponse de la personne par CE juge — jamais un
// libellé cherché. `selftest:vinted-envoi-sans-perte` refuse toute divergence de cette seconde copie.
//
//   node scripts/gen-etat-correspondance-extension.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'supabase/functions/_shared/etat-correspondance.js';
export const CIBLE = 'chrome-extension/content-scripts/leboncoin.js';
export const DEBUT = `// ═══ DÉBUT — COPIE GÉNÉRÉE de ${SOURCE} — ne pas éditer (node scripts/gen-etat-correspondance-extension.mjs) ═══`;
export const FIN = '// ═══ FIN — COPIE GÉNÉRÉE du juge d\'état ═══';
// Le bloc s'insère juste avant cette ligne la première fois (puis se remplace entre ses bornes).
const ANCRE = 'const normEtatLbc = ';

/** Le bloc généré (bornes comprises), depuis la source lue sur le disque. */
export function genererBlocEtat(source = fs.readFileSync(path.join(ROOT, SOURCE), 'utf8')) {
  const exportes = [];
  const corps = source.replace(/\r\n/g, '\n')
    .replace(/^export (const|function) (\w+)/gm, (_, mot, id) => { exportes.push(id); return `${mot} ${id}`; });
  const restant = corps.match(/^(export|import)\b.*$/m);
  if (restant) throw new Error(`⛔ ${SOURCE} : forme non gérée par le générateur : ${restant[0]}`);
  return [
    DEBUT,
    '// Le juge d\'état UNIQUE (l\'écran, get-pending-jobs et cette extension appellent la même règle) : le content script',
    '// n\'étant pas un module, la source est recopiée à l\'octet près ; seuls les `export` tombent.',
    'const ETAT_CORRESPONDANCE = (() => {',
    corps.trimEnd(),
    `return { ${exportes.join(', ')} };`,
    '})();',
    FIN,
  ].join('\n');
}

/** leboncoin.js avec le bloc à jour (le texte d'entrée si rien ne change). */
export function genererCopieLeboncoin(contenu = fs.readFileSync(path.join(ROOT, CIBLE), 'utf8')) {
  const bloc = genererBlocEtat();
  const i = contenu.indexOf(DEBUT);
  if (i >= 0) {
    const j = contenu.indexOf(FIN, i);
    if (j < 0) throw new Error(`⛔ ${CIBLE} : borne de fin du bloc généré absente`);
    return contenu.slice(0, i) + bloc + contenu.slice(j + FIN.length);
  }
  const a = contenu.indexOf(ANCRE);
  if (a < 0) throw new Error(`⛔ ${CIBLE} : ancre « ${ANCRE} » absente`);
  return `${contenu.slice(0, a)}${bloc}\n${contenu.slice(a)}`;
}

// (13/11) La seconde copie : content-scripts/vinted.js, même bloc, mêmes bornes.
export const CIBLE_VINTED = 'chrome-extension/content-scripts/vinted.js';
// (Insertion la première fois seulement, avant le bloc de la couleur ; ensuite le bloc se remplace entre ses bornes.)
const ANCRE_VINTED = 'function armerCouleurPourPost(ids) {';
/** vinted.js avec le bloc à jour (le texte d'entrée si rien ne change). */
export function genererCopieVinted(contenu = fs.readFileSync(path.join(ROOT, CIBLE_VINTED), 'utf8')) {
  const bloc = genererBlocEtat();
  const i = contenu.indexOf(DEBUT);
  if (i >= 0) {
    const j = contenu.indexOf(FIN, i);
    if (j < 0) throw new Error(`⛔ ${CIBLE_VINTED} : borne de fin du bloc généré absente`);
    return contenu.slice(0, i) + bloc + contenu.slice(j + FIN.length);
  }
  const a = contenu.indexOf(ANCRE_VINTED);
  if (a < 0) throw new Error(`⛔ ${CIBLE_VINTED} : ancre « ${ANCRE_VINTED} » absente`);
  return `${contenu.slice(0, a)}${bloc}\n${contenu.slice(a)}`;
}

if (process.argv[1] && /gen-etat-correspondance-extension\.mjs$/.test(process.argv[1])) {
  const avant = fs.readFileSync(path.join(ROOT, CIBLE), 'utf8');
  const apres = genererCopieLeboncoin(avant);
  if (apres !== avant) fs.writeFileSync(path.join(ROOT, CIBLE), apres);
  console.log(`${CIBLE} : copie du juge d'état ${apres !== avant ? 'régénérée' : 'déjà à jour'} depuis ${SOURCE}.`);
  const avantV = fs.readFileSync(path.join(ROOT, CIBLE_VINTED), 'utf8');
  const apresV = genererCopieVinted(avantV);
  if (apresV !== avantV) fs.writeFileSync(path.join(ROOT, CIBLE_VINTED), apresV);
  console.log(`${CIBLE_VINTED} : copie du juge d'état ${apresV !== avantV ? 'régénérée' : 'déjà à jour'} depuis ${SOURCE}.`);
}
