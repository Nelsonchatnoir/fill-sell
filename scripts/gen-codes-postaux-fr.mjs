// ═══════════════════════════════════════════════════════════════════════════
// LES CODES POSTAUX FRANÇAIS, EN DONNÉES (25/10/2026, Leboncoin réservé à la France)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (25/10, cas Marta — « Via CANALE 24 C 16035 RAPALLO ») : pas de
// Leboncoin pour une adresse de remise hors de France. Aucun champ pays n'existe :
// la règle (_shared/lbc-adresse-france.js) demande si le code postal de l'adresse
// figure dans la base officielle des codes postaux français. Ce script la relève
// UNE fois, depuis le service public geo.api.gouv.fr (communes actuelles, outre-mer
// compris : 971-976, 975, 977, 978, 986-988), et l'écrit en module de DONNÉES sans
// import (Deno + Vite + Node), comme gen-arbres-feuilles.mjs.
//   · relevé le 25/10 : 34 969 communes, 6 310 codes ; la même requête élargie aux
//     arrondissements, communes déléguées et associées rend les MÊMES 6 310 codes ;
//   · forme compacte : une ligne par préfixe de deux chiffres, « 01:000090100… » =
//     01000, 01090, 01100… (les trois derniers chiffres, collés) ;
//   · contrôles avant d'écrire : au moins 6 000 codes, Paris, Ajaccio, La Réunion et
//     Nouméa présents, Monaco (98000) absent — sinon RIEN n'est écrit (exit 1).
// Il n'écrit QUE son fichier de sortie. Un code postal créé par La Poste après le
// relevé passerait pour étranger : relancer ce script, puis redéployer
// get-pending-jobs (elle importe le module), et livrer l'app.
//
//   node scripts/gen-codes-postaux-fr.mjs
import fs from 'node:fs';

export const SOURCE = 'https://geo.api.gouv.fr/communes?fields=codesPostaux&format=json';
export const CIBLE = 'supabase/functions/_shared/codes-postaux-fr.js';

const CONTROLES_PRESENTS = ['75001', '75116', '20000', '97400', '98800', '91160', '26230'];
const CONTROLES_ABSENTS = ['98000', '16035', '06890'];

async function relever() {
  const r = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`geo.api.gouv.fr a répondu HTTP ${r.status}`);
  const communes = await r.json();
  if (!Array.isArray(communes)) throw new Error('réponse illisible (pas une liste de communes)');
  const codes = new Set();
  for (const c of communes) {
    for (const cp of Array.isArray(c?.codesPostaux) ? c.codesPostaux : []) {
      const v = String(cp ?? '').trim();
      if (/^\d{5}$/.test(v)) codes.add(v);
    }
  }
  return { communes: communes.length, codes: [...codes].sort() };
}

function compacter(codes) {
  const parPrefixe = new Map();
  for (const cp of codes) {
    const p = cp.slice(0, 2);
    if (!parPrefixe.has(p)) parPrefixe.set(p, []);
    parPrefixe.get(p).push(cp.slice(2));
  }
  return [...parPrefixe.entries()].map(([p, suites]) => `${p}:${suites.join('')}`);
}

const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
let releve;
try {
  releve = await relever();
} catch (e) {
  console.error(`✗ relevé impossible — rien n'est écrit : ${e?.message ?? e}`);
  process.exit(1);
}
const { communes, codes } = releve;
const ensemble = new Set(codes);
const manquants = CONTROLES_PRESENTS.filter((c) => !ensemble.has(c));
const intrus = CONTROLES_ABSENTS.filter((c) => ensemble.has(c));
if (codes.length < 6000 || manquants.length || intrus.length) {
  console.error(`✗ contrôles en échec — rien n'est écrit : ${codes.length} codes ; manquants ${manquants.join(', ') || '-'} ; intrus ${intrus.join(', ') || '-'}`);
  process.exit(1);
}
const lignes = compacter(codes);
const sortie = [
  '// ═══ FICHIER GÉNÉRÉ — NE PAS MODIFIER À LA MAIN ═══════════════════════════',
  `// scripts/gen-codes-postaux-fr.mjs, le ${jour} (heure de Paris), depuis`,
  `// ${SOURCE}`,
  `// ${communes} communes, ${codes.length} codes postaux (métropole, Corse, outre-mer).`,
  '// Une ligne par préfixe de deux chiffres : « 01:000090… » = 01000, 01090…',
  '// Lu par _shared/lbc-adresse-france.js (Leboncoin réservé aux adresses en France).',
  '// Module de DONNÉES, sans import : Deno, Vite et Node le chargent tel quel.',
  `export const CODES_POSTAUX_FR_SOURCE = ${JSON.stringify(SOURCE)};`,
  `export const CODES_POSTAUX_FR_LE = ${JSON.stringify(jour)};`,
  `export const CODES_POSTAUX_FR_NOMBRE = ${codes.length};`,
  'export const CODES_POSTAUX_FR = Object.freeze([',
  ...lignes.map((l) => `  ${JSON.stringify(l)},`),
  ']);',
  '',
].join('\n');
fs.writeFileSync(CIBLE, sortie);
console.log(`✓ ${CIBLE} : ${codes.length} codes postaux (${communes} communes), ${lignes.length} préfixes, ${Buffer.byteLength(sortie)} octets — relevé le ${jour}`);
