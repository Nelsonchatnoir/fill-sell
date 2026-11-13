// ═══════════════════════════════════════════════════════════════════════════
// VERROU — « SYNCHRONISÉ IL Y A X » NOMME LA PLATEFORME (13/11/2026, étape 5 du lot « zéro problème », bloc 6 ii)
//   npm run selftest:synchro-entete-plateforme
// ═══════════════════════════════════════════════════════════════════════════
// Feu vert de Nico : « écran : plateforme nommée dans « il y a X » ». Le défaut (audit du 12/11, bloc 6 ii) : l'en-tête du
// bloc de synchro (stock/BlocSynchro.jsx) disait « Synchronisé il y a X » avec X = le relevé réussi le PLUS RÉCENT, toutes
// plateformes et tous déclencheurs confondus. Cas réel : 447d920c le 12/11 à 17:04:45 (Paris) — « Synchronisé il y a
// 8 min » = Leboncoin (relevé cron de 16:56:45), alors que Vinted n'avait plus été relu depuis le 11/11 20:29 (≈ 20 h 36,
// son cron du matin refusé par la règle des 20 h). La règle : l'en-tête nomme la plateforme — la MOINS fraîche d'abord
// (c'est elle qu'il faut savoir ; la ligne peut être coupée sur téléphone), puis la plus fraîche ; le détail par
// plateforme reste au toucher.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
const B = await import(pathToFileURL(path.join(RACINE, 'src/stock/boutonSynchro.js')).href);

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d ? `\n      ← ${d}` : ''}`); } };
const enTete = (o) => (typeof B.enTeteSynchro === 'function' ? B.enTeteSynchro(o) : undefined);
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay' };

console.log('\nA. LE CAS RÉEL — 447d920c, 12/11 à 17:04:45 (Paris)');
const MAINT = Date.parse('2026-11-12T16:04:45Z');
const reussis = { vinted: '2026-11-11T19:29:00.597Z', beebs: '2026-11-11T19:40:00Z', depop: '2026-11-11T19:41:00Z', ebay: '2026-11-12T15:30:11Z', leboncoin: '2026-11-12T15:56:45Z' };
const plateformes = ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'];
const t = enTete({ reussis, plateformes, noms: NOMS, maintenant: MAINT, fr: true });
ok(t === 'Vinted synchronisé il y a 21 h · Leboncoin il y a 8 min', 'l\'en-tête nomme Vinted (la moins fraîche) puis Leboncoin (la plus fraîche) — avant : « Synchronisé il y a 8 min »', String(t));
ok(enTete({ reussis, plateformes, noms: NOMS, maintenant: MAINT, fr: false }) === 'Vinted synced 21 h ago · Leboncoin 8 min ago', 'anglais', String(enTete({ reussis, plateformes, noms: NOMS, maintenant: MAINT, fr: false })));

console.log('\nB. LES AUTRES CAS');
ok(enTete({ reussis: { vinted: '2026-11-12T13:04:45Z' }, plateformes: ['vinted'], noms: NOMS, maintenant: MAINT, fr: true }) === 'Vinted synchronisé il y a 3 h', 'une seule plateforme relue : nommée');
ok(enTete({ reussis: { vinted: '2026-11-12T16:01:45Z', leboncoin: '2026-11-12T16:01:50Z' }, plateformes: ['vinted', 'leboncoin'], noms: NOMS, maintenant: MAINT, fr: true }) === 'Vinted et Leboncoin synchronisés il y a 3 min', 'même délai : les deux nommées, une seule fois le délai');
ok(enTete({ reussis: { vinted: '2026-11-11T19:29:00Z', opla: '2026-11-12T16:00:00Z' }, plateformes: ['vinted'], noms: NOMS, maintenant: MAINT, fr: true }) === 'Vinted synchronisé il y a 21 h', 'une plateforme hors du compte (Opla quittée) ne compte pas');
ok(enTete({ reussis: {}, plateformes, noms: NOMS, maintenant: MAINT, fr: true }) === null && enTete({ reussis: null, plateformes, noms: NOMS, maintenant: MAINT }) === null, 'rien de relu (ou lecture ratée) : null → l\'écran garde sa phrase d\'avant');
ok(enTete({ reussis: { depop: '2026-11-12T16:00:00Z' }, plateformes: ['depop'], noms: {}, maintenant: MAINT, fr: true }) === 'depop synchronisé il y a 5 min', 'nom inconnu : l\'identifiant, jamais un nom inventé');

console.log('\nC. L\'ÉCRAN');
const bs = lire('src/stock/BlocSynchro.jsx');
ok(/enTeteSynchro\(\{\s*reussis: r\.reussis/.test(bs), 'BlocSynchro calcule l\'en-tête par plateforme (r.reussis)');
ok(bs.includes('(enTetePlateformes ?? T.synchronise(quand))'), 'l\'en-tête affiche la phrase nommée (repli : l\'ancienne si rien n\'est lisible)');

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
