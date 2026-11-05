// (05/11 soir, lot « Ouverture du Cloud », PHASE 3 point 1 — ordre de Nico : « inventaire d'abord ») L'INVENTAIRE DES
// TEXTES FRANÇAIS SANS ANGLAIS, dans l'app (src/) : chaque chaîne ou texte JSX en français qui n'est PAS gardé par la
// langue — ni dans une condition sur la langue (`fr ? … : …`, `lang === 'en' ? …`), ni dans un objet bilingue
// (`{ fr: …, en: … }`, `TEXTES.fr`), ni dans translations.js à côté de sa clé anglaise.
// Écartés (jamais montrés tels quels) : journaux et télémétrie, comparaisons et recherches dans un texte (les mots des
// plateformes), clés techniques, URL, expressions régulières, attributs de style.
// Heuristique : elle sert à COMPTER et à LISTER ce qui reste ; la preuve finale reste le parcours sur un téléphone en
// anglais (ordre de Nico).
//
//   node scripts/i18n/inventaire-francais.mjs              → résumé par dossier et par fichier
//   node scripts/i18n/inventaire-francais.mjs --json F     → la liste complète (fichier, ligne, texte) dans F
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';

const traverse = traverseMod.default ?? traverseMod;
const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(RACINE, 'src');

const MOTS_FR = /\b(le|la|les|des|une|un|du|de|ton|ta|tes|ton|ta|vos|votre|nos|notre|pour|avec|sans|sur|dans|est|sont|pas|plus|déjà|encore|ici|tout|toutes|tous|aucun|aucune|cette|ces|ce|qui|que|quand|où|ou|et|mais|donc|car|si|il|elle|ils|elles|on|nous|tu|je|j'|l'|d'|n'|qu'|c'est|s'|t'|m')\b/i;
const ACCENTS = /[àâäéèêëîïôöùûüçœæÀÂÉÈÊËÎÏÔÙÛÇ]/;
const OUTILS_JOURNAL = /^(console|journal|journaliser|logTunnel|logModale|logEvent|log|logger|trace|noterEvenement|signaler|track|telemetrie|telemetry|captureException|debug|warn|info|erreurInterne)$/;
const METHODES_RECHERCHE = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'match', 'matchAll', 'replace', 'replaceAll', 'split', 'search', 'test', 'localeCompare']);
const ATTRIBUTS_TECHNIQUES = /^(className|style|id|key|href|src|type|name|role|data-[\w-]+|aria-hidden|htmlFor|rel|target|viewBox|d|fill|stroke|transform|width|height|autoComplete|inputMode|pattern|method|action|accept|lang)$/;

// Mots-outils SEULEMENT français, et mots-outils anglais : une phrase anglaise (« on your computer ») n'est jamais
// comptée, une phrase française sans accent (« Tu as encore des annonces ») l'est.
const OUTILS_FR = new Set(['le', 'la', 'les', 'des', 'du', 'une', 'est', 'sont', 'pas', 'pour', 'avec', 'sans', 'dans', 'ton', 'ta', 'tes', 'vos', 'votre', 'nos', 'notre', 'cette', 'ces', 'qui', 'que', 'aussi', 'mais', 'donc', 'tu', 'te', 'toi', 'nous', 'vous', 'elle', 'ils', 'elles', 'leur', 'leurs', 'aux', 'au', 'sur', 'sous', 'puis', 'encore', 'jamais', 'rien', 'tout', 'tous', 'toutes', 'chaque', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'ou', 'et', 'un', 'de', 'par', 'en', 'ne', 'se', 'ce', 'si']);
const OUTILS_EN = new Set(['the', 'and', 'you', 'your', 'to', 'of', 'is', 'are', 'with', 'for', 'on', 'in', 'this', 'that', 'it', 'be', 'not', 'no', 'from', 'at', 'by', 'as', 'an', 'a', 'or', 'will', 'can', 'has', 'have', 'was', 'were', 'all', 'any', 'one', 'when', 'what', 'which', 'here', 'there', 'they', 'them', 'their', 'we', 'our', 'my', 'me', 'do', 'does', 'did', 'yet', 'just', 'only', 'more', 'than', 'then', 'into', 'out', 'up', 'about']);
const MOTIF_TECHNIQUE = /\\[bdswBDSW]|[|^$]|\(\?|\[\^|\{\d/;
// (05/11 soir) Des libellés courts sans accent (« Mot de passe », « Erreur de connexion », « Annuler ») passaient au
// travers : des mots d'interface SEULEMENT français comptent comme un indice de plus.
const MOTS_UI_FR = new Set(['mot', 'passe', 'erreur', 'connexion', 'annuler', 'valider', 'fermer', 'retour', 'suivant', 'enregistrer', 'supprimer',
  'modifier', 'ajouter', 'rechercher', 'chargement', 'connecte', 'connecter', 'inscription', 'compte', 'abonnement', 'paiement', 'achat', 'vente', 'ventes',
  'annonce', 'annonces', 'article', 'articles', 'plateforme', 'plateformes', 'reessaie', 'oui', 'non', 'merci', 'bienvenue', 'aucun', 'aucune', 'envoyer',
  'continuer', 'terminer', 'ouvrir', 'voir', 'tout', 'tous', 'publier', 'republier', 'retirer', 'synchroniser', 'reglages', 'parametres', 'aide', 'jours',
  'mois', 'semaine', 'heure', 'heures', 'minutes', 'prix', 'marge', 'stock', 'photos', 'titre', 'taille', 'couleur', 'marque', 'etat', 'neuf', 'lot']);
function estFrancais(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return false;
  if (/^(https?:|mailto:|\/|#|\.|data:)/i.test(t)) return false;
  if (/^[\w.:/-]+$/.test(t) && !ACCENTS.test(t)) return false;           // identifiant, clé, chemin
  if (!/[a-zA-ZÀ-ÿ]{2}/.test(t)) return false;
  if (MOTIF_TECHNIQUE.test(t)) return false;                              // motif de recherche, expression régulière
  const mots = t.toLowerCase().replace(/[’']/g, ' ').split(/[^a-zà-ÿœæ]+/).filter(Boolean);
  const fr = mots.filter((m) => OUTILS_FR.has(m) || MOTS_UI_FR.has(m)).length + (ACCENTS.test(t) ? 2 : 0);
  const en = mots.filter((m) => OUTILS_EN.has(m)).length;
  if (en >= 2 && en >= fr) return false;
  if (ACCENTS.test(t) && /[a-zà-ÿ]{3}/i.test(t)) return true;
  return mots.length >= 2 && fr >= 2 && fr > en;
}

const LANGUE_DANS_TEST = /\b(fr|en|isFr|isEn|estFr|estEn|lang|langue|lng|locale|anglais|francais|français|EN|FR)\b/;
// Un module de textes bilingue : `const FR = { … }` et `const EN = { … }` (entree/textes.js, cloud/textes.js…) — les
// chaînes de l'objet français sont gardées dès que son jumeau anglais existe dans le même fichier.
const NOM_FR = /^(FR|fr|TEXTES?_FR|T_FR|TXT_FR|MOTS_FR|[A-Za-z]+_FR|[a-z]+Fr)$/;
const versAnglais = (nom) => nom.replace(/FR$/, 'EN').replace(/fr$/, 'en').replace(/Fr$/, 'En').replace(/^FR$/, 'EN').replace(/^fr$/, 'en');
function gardeParLaLangue(chemin, code, declarateursEn) {
  let p = chemin;
  while (p && p.parentPath) {
    const parent = p.parentPath;
    const n = parent.node;
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && NOM_FR.test(n.id.name) && declarateursEn.has(versAnglais(n.id.name))) return true;
    if (n.type === 'ConditionalExpression' && p.key !== 'test') {
      const test = code.slice(n.test.start, n.test.end);
      if (LANGUE_DANS_TEST.test(test)) return true;
    }
    if (n.type === 'LogicalExpression' && p.key === 'right') {
      const gauche = code.slice(n.left.start, n.left.end);
      if (/^\s*!?\s*(fr|en|isFr|isEn)\s*$/.test(gauche)) return true;
    }
    if (n.type === 'IfStatement' && p.key !== 'test') {
      const test = code.slice(n.test.start, n.test.end);
      if (LANGUE_DANS_TEST.test(test)) return true;
    }
    if (n.type === 'ObjectProperty' || n.type === 'ObjectMethod') {
      const k = n.key?.name ?? n.key?.value;
      if (k === 'fr' || k === 'en' || k === 'FR' || k === 'EN') return true;
    }
    if (n.type === 'SwitchCase' && n.test && /['"](fr|en)['"]/.test(code.slice(n.test.start, n.test.end))) return true;
    // Une paire bilingue passée à un appel : L('Mois par mois', 'Month by month'), tr(fr, en)… — le 1er argument
    // français est gardé quand le 2e est un texte qui n'est pas du français.
    if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && p.listKey === 'arguments' && p.key === 0 && n.arguments.length >= 2) {
      const second = n.arguments[1];
      const texte2 = second?.type === 'StringLiteral' ? second.value
        : second?.type === 'TemplateLiteral' ? second.quasis.map((q) => q.value.cooked ?? '').join(' ')
          : second?.type === 'JSXElement' || second?.type === 'JSXFragment' ? code.slice(second.start, second.end) : null;
      if (texte2 != null && !estFrancais(texte2)) return true;
    }
    p = parent;
  }
  return false;
}

function ecarte(chemin, code) {
  const parent = chemin.parentPath?.node;
  if (!parent) return false;
  if (parent.type === 'ImportDeclaration' || parent.type === 'ExportAllDeclaration' || parent.type === 'ExportNamedDeclaration') return true;
  if (parent.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator)) return true;
  if (parent.type === 'SwitchCase' && chemin.key === 'test') return true;
  if ((parent.type === 'ObjectProperty' || parent.type === 'ClassProperty') && chemin.key === 'key') return true;
  if (parent.type === 'MemberExpression' && chemin.key === 'property') return true;
  if (parent.type === 'JSXAttribute') {
    const nom = parent.name?.name;
    if (typeof nom === 'string' && ATTRIBUTS_TECHNIQUES.test(nom)) return true;
  }
  // Un argument d'un appel de journal, ou d'une recherche dans un texte (les mots d'une plateforme).
  let p = chemin;
  for (let i = 0; i < 6 && p.parentPath; i++) {
    const n = p.parentPath.node;
    if (n.type === 'CallExpression' || n.type === 'NewExpression') {
      const c = n.callee;
      const nom = c?.type === 'Identifier' ? c.name : c?.type === 'MemberExpression' ? (c.property?.name ?? '') : '';
      const objet = c?.type === 'MemberExpression' && c.object?.type === 'Identifier' ? c.object.name : '';
      if (OUTILS_JOURNAL.test(nom) || OUTILS_JOURNAL.test(objet)) return true;
      if (METHODES_RECHERCHE.has(nom)) return true;
      if (nom === 'RegExp') return true;
      break;
    }
    p = p.parentPath;
  }
  return false;
}

// Les FAMILLES : l'écran (ce qu'une personne lit dans l'app), les données des plateformes (arbres de catégories,
// couleurs, modèles : la langue est celle du SITE de la plateforme — phase 3, point 2), les pages internes de Nico
// (maquettes, démo de la barre), le site vitrine.
export function familleDe(fichier) {
  if (/src\/utils\/arbres\/|Categories\.js$|Feuilles\.js$|src\/data\/|vintedColors|lbcMaisonJardin|jeuxVideo|ColisGrilles|categorieParMot|familleCategorie/.test(fichier)) return 'donnees_plateformes';
  if (/DemoBarreProgression|MaquettesLot|maquettesLotScenario/.test(fichier)) return 'pages_internes';
  if (/src\/pages\/(LandingPage|Blog|landing)/.test(fichier)) return 'site_vitrine';
  return 'ecran';
}

function fichiers(dir) {
  const out = [];
  for (const nom of readdirSync(dir)) {
    const f = join(dir, nom);
    const st = statSync(f);
    if (st.isDirectory()) { if (!/node_modules|__tests__/.test(nom)) out.push(...fichiers(f)); }
    else if (/\.(jsx?|mjs)$/.test(nom) && !/\.(test|spec)\./.test(nom)) out.push(f);
  }
  return out;
}

export function inventaire(racine = SRC) {
  const trouves = [];
  let erreurs = 0;
  for (const f of fichiers(racine)) {
    const code = readFileSync(f, 'utf8');
    let ast;
    try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }); }
    catch { erreurs++; continue; }
    const fichier = relative(RACINE, f).replace(/\\/g, '/');
    const declarateursEn = new Set();
    traverse(ast, { VariableDeclarator(c) { if (c.node.id?.type === 'Identifier') declarateursEn.add(c.node.id.name); } });
    const noter = (chemin, texte, nature) => {
      if (!estFrancais(texte)) return;
      if (ecarte(chemin, code)) return;
      const garde = gardeParLaLangue(chemin, code, declarateursEn);
      trouves.push({ fichier, famille: familleDe(fichier), ligne: chemin.node.loc?.start.line ?? 0, nature, garde, texte: texte.replace(/\s+/g, ' ').trim().slice(0, 160) });
    };
    traverse(ast, {
      StringLiteral(c) { noter(c, c.node.value, 'chaine'); },
      JSXText(c) { noter(c, c.node.value, 'jsx'); },
      TemplateLiteral(c) { noter(c, c.node.quasis.map((q) => q.value.cooked ?? '').join(' … '), 'gabarit'); },
    });
  }
  return { trouves, erreurs };
}

const estPrincipal = process.argv[1] && fileURLToPath(import.meta.url).replace(/\\/g, '/') === process.argv[1].replace(/\\/g, '/');
if (estPrincipal) {
  const { trouves, erreurs } = inventaire();
  const sansTout = trouves.filter((t) => !t.garde);
  const parFamille = new Map();
  for (const t of sansTout) parFamille.set(t.famille, (parFamille.get(t.famille) ?? 0) + 1);
  console.log('Par famille (sans anglais) :', Object.fromEntries(parFamille));
  const sans = sansTout.filter((t) => t.famille === 'ecran');
  console.log(`ÉCRANS seulement — ce qui suit ne compte que les textes que l'app montre :`);
  const parFichier = new Map();
  for (const t of sans) parFichier.set(t.fichier, (parFichier.get(t.fichier) ?? 0) + 1);
  const parDossier = new Map();
  for (const [f, n] of parFichier) { const d = f.split('/').slice(0, 2).join('/'); parDossier.set(d, (parDossier.get(d) ?? 0) + n); }
  console.log(`Textes français relevés dans src/ : ${trouves.length} — gardés par la langue : ${trouves.length - sans.length} — SANS ANGLAIS : ${sans.length} (fichiers illisibles : ${erreurs})`);
  console.log('\nPar dossier :');
  for (const [d, n] of [...parDossier].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${d}`);
  console.log('\nLes 40 fichiers qui en portent le plus :');
  for (const [f, n] of [...parFichier].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${String(n).padStart(5)}  ${f}`);
  const i = process.argv.indexOf('--json');
  if (i > 0 && process.argv[i + 1]) {
    writeFileSync(process.argv[i + 1], JSON.stringify(sans, null, 1));
    console.log(`\nListe complète : ${process.argv[i + 1]}`);
  }
}
