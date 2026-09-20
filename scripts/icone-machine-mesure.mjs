// ═══════════════════════════════════════════════════════════════════════════
// LA MACHINE PLUTÔT QUE LE THÈME — mesure AVANT / APRÈS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue la détection d'icône sur TOUS les titres distincts publiés dans les
// 60 derniers jours, avec et sans la règle « une machine nommée dit ce que
// l'objet EST ». Le corpus est un export brut de la base : le script ne le
// résume pas, il le compte.
//
//   node --import ./scripts/loader-ext.mjs scripts/icone-machine-mesure.mjs <corpus.txt>
import fs from 'node:fs';
import { detectObjectIcon } from '../src/utils/shared.js';
import { familleJeuVideo } from '../src/utils/jeuxVideo.js';

const fichier = process.argv[2];
if (!fichier || !fs.existsSync(fichier)) {
  console.error('Usage : node --import ./scripts/loader-ext.mjs scripts/icone-machine-mesure.mjs <export.txt>');
  process.exit(2);
}
// L'export est un objet JSON dont le champ `result` contient, en TEXTE, le
// tableau de lignes entouré d'un bandeau de garde. On parse deux fois.
const enveloppe = JSON.parse(fs.readFileSync(fichier, 'utf8'));
const texte = String(enveloppe.result ?? '');
const lignes = JSON.parse(texte.slice(texte.indexOf('[{'), texte.lastIndexOf('}]') + 2));
console.log(`Corpus : ${lignes.length} titres distincts publiés sur 60 jours.\n`);

const changements = new Map();
let machines = 0; let deja = 0; let change = 0;
for (const l of lignes) {
  const titre = String(l.title ?? '');
  if (!titre.trim()) continue;
  const avant = detectObjectIcon(titre, '') ?? null;
  const jv = familleJeuVideo(titre, '');
  if (!jv?.machine) continue;             // la règle ne parle pas
  machines++;
  // La règle telle qu'elle est câblée : la tête du titre, ou rien de reconnu.
  const parTete = typeof jv.regle === 'string' && jv.regle.startsWith('tete_') && jv.sousType !== 'etui';
  if (!parTete && avant !== '📦') continue;
  const apres = '🎮';
  if (avant === apres) { deja++; continue; }
  change++;
  const cle = `${avant ?? '(aucune)'} → 🎮`;
  if (!changements.has(cle)) changements.set(cle, []);
  changements.get(cle).push(titre.slice(0, 70));
}

console.log(`Titres où une MACHINE est nommée et l'objet reconnu : ${machines}`);
console.log(`  · déjà 🎮 avant la règle  : ${deja}  (aucun changement)`);
console.log(`  · icône CHANGÉE           : ${change}\n`);
for (const [cle, ex] of [...changements.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(ex.length).padStart(4)}×  ${cle}`);
  for (const t of ex.slice(0, 6)) console.log(`         ${t}`);
  if (ex.length > 6) console.log(`         … ${ex.length - 6} autre(s)`);
}
