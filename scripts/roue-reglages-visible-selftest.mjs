// ═══════════════════════════════════════════════════════════════════════════
// LA ROUE DES RÉGLAGES RESTE TOUJOURS À L'ÉCRAN — `npm run selftest:roue-reglages-visible`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A7). À 320 px avec « Pro », de 360 à 375 px avec « Business » et un
// compteur à 4 chiffres, la roue des réglages sortait de l'écran (10 à 65 px).
// Règle (src/App.css) : sous 768 px, le groupe de droite (palier, réglages)
// ne cède JAMAIS de place ; c'est la gauche qui s'adapte — le mot « annonces »
// part d'abord (≤ 420 px), le libellé se coupe en dernier recours, jamais le
// chiffre. Contrôle hors ligne des règles ; la preuve mesurée (320 → 1920 px,
// clair et sombre, 1 à 5 chiffres, Pro/Business/Premium, anglais) :
// node scripts/apercu/capture-entete-marque.mjs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, ok = 0;
const verifier = (c, quoi) => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}`); } };

const css = lire('src/App.css');
const bloc768 = css.slice(css.indexOf('LA ROUE DES RÉGLAGES RESTE TOUJOURS À L'), css.indexOf('LA ROUE DES RÉGLAGES RESTE TOUJOURS À L') + 1400);
verifier(/@media \(max-width: 768px\) \{[\s\S]*?\.tb-right \{ flex: 0 0 auto; \}/.test(bloc768), '≤ 768 px : la droite (palier, roue) ne cède jamais de place');
verifier(/\.tb-left \{ flex: 1 1 auto; min-width: 0; \}/.test(bloc768) && /\.tb-quota \{ flex-shrink: 1; min-width: 0; \}/.test(bloc768), '≤ 768 px : la gauche (compteur) s’adapte');
verifier(/\.tb-quota-libelle \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; \}/.test(bloc768), 'le libellé se coupe en dernier recours (points de suspension), jamais le chiffre');
verifier(/@media \(max-width: 420px\) \{\s*\n\s*\.tb-quota-mot \{ display: none; \}/.test(css), '≤ 420 px : le mot « annonces » cède la place (« 1000 restantes »)');
verifier(/\.tb-quota \{ flex-shrink: 0; \}/.test(css), 'grande largeur : le compteur garde sa taille (centrage du 11/10 inchangé)');
const app = lire('src/App.jsx');
verifier(/className="tb-quota"/.test(app) && /className="tb-quota-chip"/.test(app) && /className="tb-quota-libelle"/.test(app) && /className="tb-quota-mot"/.test(app), 'l’en-tête de l’app porte les classes (compteur, puce, libellé, mot)');
verifier(!/className="tb-quota"[^>]*flexShrink:0/.test(app), 'plus de flexShrink:0 en dur sur le compteur (il empêchait la gauche de céder)');
const harnais = lire('scripts/apercu/entete-marque.jsx');
verifier(/className="tb-quota"/.test(harnais) && /className="tb-quota-mot"/.test(harnais), 'le harnais de capture recopie le même en-tête');
const capture = lire('scripts/apercu/capture-entete-marque.mjs');
verifier(/roue des réglages entière et cliquable/.test(capture) && /\[1920, 1280, 769, 768, 600, 481, 430, 414, 390, 375, 360, 340, 320\]/.test(capture) && /10000 annonces, Business/.test(capture), 'la capture mesure la roue (entière, cliquable) de 320 à 1920 px, jusqu’à 5 chiffres');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
