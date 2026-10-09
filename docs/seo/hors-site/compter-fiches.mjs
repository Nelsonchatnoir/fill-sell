// Compte les textes prêts à coller de fiches-stores.md et vérifie leurs limites (09/10/2026).
//   node docs/seo/hors-site/compter-fiches.mjs
// Chaque bloc ``` est rattaché au dernier intertitre ### (et à la langue « FR : » / « EN : »
// qui le précède). Limites : caractères (Apple, Google, Chrome comptent des caractères) ; mots-clés
// App Store en OCTETS UTF-8. Refuse aussi les mots bannis (plateforme retirée, « à vie », quotas).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fichier = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fiches-stores.md');
const texte = readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');

const LIMITES = [
  [/^Nom \(30\)/, 30], [/^Sous-titre \(30\)/, 30], [/^Texte promotionnel/, 170],
  [/^Mots-clés/, 100, 'octets'], [/^Description \(4 000\)/, 4000], [/^Nouveautés/, 500],
  [/^Titre \(30\)/, 30], [/^Description courte/, 80], [/^Nom de l'extension/, 75],
  [/^Résumé \(132\)/, 132], [/^Description détaillée/, 16000],
];
const BANNIS = /\bopla\b|à vie|for life|offertes|pépite|nugget|quota|\b\d+\s*(annonces|republications|listings|reposts)\b/i;

let titre = '';
let langue = '';
let echecs = 0;
const lignes = texte.split('\n');
for (let i = 0; i < lignes.length; i++) {
  const l = lignes[i];
  if (l.startsWith('### ')) { titre = l.slice(4); langue = ''; continue; }
  if (/^(FR|EN)( \(|\s*:)/.test(l)) { langue = l.slice(0, 2); continue; }
  if (l.trim() !== '```') continue;
  const debut = i + 1;
  let fin = debut;
  while (fin < lignes.length && lignes[fin].trim() !== '```') fin++;
  const bloc = lignes.slice(debut, fin).join('\n');
  i = fin;
  const regle = LIMITES.find(([r]) => r.test(titre));
  const octets = Buffer.byteLength(bloc, 'utf8');
  const caracteres = Array.from(bloc).length;
  const mesure = regle?.[2] === 'octets' ? octets : caracteres;
  const limite = regle?.[1];
  const ok = limite == null || mesure <= limite;
  const banni = BANNIS.exec(bloc);
  if (!ok || banni) echecs++;
  console.log(`${ok && !banni ? '✓' : '✗'} ${titre}${langue ? ' — ' + langue : ''} : ${mesure} ${regle?.[2] ?? 'caractères'}${limite ? ' / ' + limite : ''}${banni ? `  MOT BANNI « ${banni[0]} »` : ''}`);
}
const bannisHorsBlocs = BANNIS.exec(texte.replace(/```[\s\S]*?```/g, ''));
if (bannisHorsBlocs) { echecs++; console.log(`✗ mot banni hors des blocs : « ${bannisHorsBlocs[0]} »`); }
console.log(echecs ? `${echecs} problème(s)` : 'tout tient dans les limites, aucun mot banni');
process.exit(echecs ? 1 : 0);
