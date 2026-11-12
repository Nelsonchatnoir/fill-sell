// Verrou du point 4b (12/11/2026, lot « zéro problème », étape 1) : L'APP NE PROMET PLUS « ON TE PRÉVIENT LA VEILLE ».
//
//     npm run selftest:promesse-veille-app   (node scripts/promesse-veille-app-selftest.mjs)
//
// Décision 5a de Nico (12/11) : la phrase est retirée du site et du mail (a9de316) tant que le rappel de la veille n'est
// pas PROUVÉ sur un vrai client (email_logs : un cloud_essai_veille réel Stripe ET Apple ; le seul envoi connu, le 07/11,
// était le compte de test en bac à sable). L'app la portait encore dans 12 textes (6 français, 6 anglais) : fenêtre
// d'offres, carte du Cloud seul, frise de l'essai, parcours d'entrée. Ce test lit tous les textes d'écran de src/ (hors
// commentaires) et rougit sur toute promesse du rappel de la veille ; seules les CONDITIONS du Cloud (texte contractuel,
// inchangé : le rappel est bien codé et part) en sont exclues. Témoin : les 12 textes d'avant sont attrapés.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
let echecs = 0, passes = 0;
const ok = (c, m, d) => { if (c) passes++; else { echecs++; console.error(`✗ ${m}${d ? ` — ${d}` : ''}`); } };

// Le motif du site (scripts/site-moteur-selftest.mjs, PROMESSE_VEILLE) + les deux formes des frises de l'app.
const PROMESSE = /veille de la fin de l[’']essai|prévient la veille|the day before (it|the trial|your trial) ends|remind you the day before|On te prévient,? dans l[’']app et par e-mail|We remind you,? in the app and by email|We'll remind you the day before/i;
const EXCLUS = new Set(['src/cloud/conditionsCloud.js', 'src/cloud/textesLegaux.js']);   // conditions : texte contractuel

const fichiers = [];
(function parcourir(d) {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (/\.(jsx?|tsx?)$/.test(n)) fichiers.push(p);
  }
})(path.join(RACINE, 'src'));
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, ''))).join('\n');
const trouves = [];
for (const p of fichiers) {
  const rel = path.relative(RACINE, p).split(path.sep).join('/');
  if (EXCLUS.has(rel)) continue;
  const lignes = sansCommentaires(readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).split('\n');
  lignes.forEach((l, i) => { if (PROMESSE.test(l)) trouves.push(`${rel}:${i + 1}`); });
}
ok(fichiers.length > 100, `les textes de src/ sont lus (${fichiers.length} fichiers)`);
ok(trouves.length === 0, 'aucun écran de l’app ne promet « on te prévient la veille » (hors conditions)', trouves.join(', '));

// Témoins : les 12 textes d'avant (881c2b9) sont attrapés par le motif.
const AVANT = [
  "Puis 34,99 €/mois, sans engagement. Carte demandée, 0 € aujourd'hui. On te prévient la veille.",
  'Then €34.99/mo, no commitment. Card required, €0 today. We remind you the day before.',
  "On te prévient la veille. Tu l'arrêtes en un geste.",
  'We remind you the day before. Stop it in one tap.',
  "Tu l'arrêtes en un geste dans Réglages › Abonnement. On te prévient la veille, dans l'app et par e-mail.",
  "Stop it in one tap in Settings › Subscription. We'll remind you the day before, in the app and by email.",
  "Puis 24,99 €/mois. Tu l'arrêtes en un geste, on te prévient la veille.",
  'Then €24.99/mo. Stop it in one tap, we remind you the day before.',
  "On te prévient, dans l'app et par e-mail.",
  'We remind you, in the app and by email.',
  "On te prévient dans l'app et par e-mail, et tu choisis ta formule.",
  'We remind you in the app and by email, and you choose your plan.',
];
const rates = AVANT.filter((t) => !PROMESSE.test(t));
ok(rates.length === 0, 'témoins : les 12 textes d’avant sont attrapés', rates.join(' | '));
// Ce qui reste permis : une phrase qui ne promet rien, et le rappel lui-même (conditions).
ok(!PROMESSE.test("Tu l'arrêtes en un geste.") && !PROMESSE.test('Ton essai se termine demain : tu choisis ta formule.'), 'les phrases de remplacement ne promettent rien');
const conditions = readFileSync(path.join(RACINE, 'src/cloud/conditionsCloud.js'), 'utf8');
ok(/un rappel vous est envoyé dans l'app et par e-mail/.test(conditions), 'les conditions du Cloud sont inchangées (le rappel est codé et part)');

console.log(`${echecs === 0 ? '✓' : '✗'} promesse-veille-app : ${passes} vert(s), ${echecs} rouge(s)`);
process.exit(echecs === 0 ? 0 : 1);
