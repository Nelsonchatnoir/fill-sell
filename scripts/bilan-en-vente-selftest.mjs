// ═══════════════════════════════════════════════════════════════════════════
// VERROU — L'EN-TÊTE « N ANNONCES » DE LA CARTE SYNCHRONISER COMPTE VINTED « EN VENTE » (13/11/2026, lot NU, I4)
//   npm run selftest:bilan-en-vente
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (13/11, réponse à la question I4 de l'étape 5) : « oui, l'en-tête compte « en vente » ».
// Le défaut : lireBilan (src/annonces/etatReleve.js) additionnait items_vus du relevé du dressing Vinted — TOUT ce que
// Vinted affiche, vendues comprises. Cas réel (lecture seule du 13/11, compte 447d920c) : dernier relevé réussi du dressing
// hors veille, 11/11 20:29 (Paris) : 256 lus = 245 « active » + 11 « sold » (instantanés de la fenêtre : 245 actifs sur
// 256, tous = lus → compte fiable) ; la pastille Vinted disait déjà « 245 en vente » (etatTuile, 05/11 point 6 c), l'en-tête
// comptait 256 : 256 + 379 (Leboncoin 12/11) + 225 (Beebs) + 147 (Depop) + 0 (eBay) = 1 007 au lieu de 996.
// La règle : Vinted compte son « en vente » (run.en_vente, posé par vintedSync.compterEnVenteDuReleve SEULEMENT quand il
// est fiable — annonces/boutiqueVinted.enVenteFiable) ; compte pas fiable ou absent → le compte d'avant (items_vus), jamais
// une valeur inventée. Relevé du 11/11 14:15 du même compte (instantanés réécrits plus tard : 9 sur 256) → 256, comme avant.
// Même règle pour la carte « Mes annonces en ligne » (CarteAnnoncesEnLigne), qui lit le même lireBilan.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
const E = await import(pathToFileURL(path.join(RACINE, 'src/annonces/etatReleve.js')).href);

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d ? `\n      ← ${d}` : ''}`); } };

const PLATEFORMES = ['vinted', 'leboncoin', 'beebs', 'depop', 'ebay'];
const fait = (vus, fini) => ({ status: 'done', finished_at: fini, items_vus: vus, erreur: null });
// 447d920c, lus en prod le 13/11 (lecture seule) : derniers relevés réussis de chaque plateforme.
const RUNS = {
  leboncoin: fait(379, '2026-11-12T15:56:00Z'),
  beebs: fait(225, '2026-11-11T19:40:00Z'),
  depop: fait(147, '2026-11-11T19:41:00Z'),
  ebay: fait(0, '2026-11-12T15:30:00Z'),
};
const vintedFiable = { finished_at: '2026-11-11T19:29:00Z', items_vus: 256, en_vente: 245 };
const vintedPasFiable = { finished_at: '2026-11-11T13:15:00Z', items_vus: 256, en_vente: null };

console.log('\nA. LE CAS RÉEL — 447d920c');
const b1 = E.lireBilan({ plateformes: PLATEFORMES, runs: RUNS, runVinted: vintedFiable });
ok(b1.total === 996, 'relevé du 11/11 20:29 (245 en vente + 11 vendues encore affichées) : l\'en-tête compte 996, pas 1 007', `total ${b1.total}`);
const b2 = E.lireBilan({ plateformes: ['vinted'], runs: {}, runVinted: vintedFiable });
ok(b2.total === 245, 'Vinted seule : « 245 annonces », comme la pastille « 245 en vente »', `total ${b2.total}`);
const b3 = E.lireBilan({ plateformes: PLATEFORMES, runs: RUNS, runVinted: vintedPasFiable });
ok(b3.total === 1007, 'relevé du 11/11 14:15 (compte « en vente » PAS fiable : 9 instantanés sur 256) → le compte d\'avant (256), jamais 9', `total ${b3.total}`);
ok(b1.dernierFini === Date.parse('2026-11-12T15:56:00Z') && b3.dernierFini === b1.dernierFini, '« Synchronisé il y a… » inchangé (le plus récent des relevés réussis)');

console.log('\nB. LA RÈGLE, POUR TOUS LES COMPTES');
const sans = E.lireBilan({ plateformes: ['vinted'], runs: {}, runVinted: { finished_at: '2026-11-11T19:29:00Z', items_vus: 120 } });
ok(sans.total === 120, 'relevé sans compte « en vente » (lecture ratée, extension ancienne) → items_vus, comme avant', `total ${sans.total}`);
const tropGrand = E.lireBilan({ plateformes: ['vinted'], runs: {}, runVinted: { finished_at: '2026-11-11T19:29:00Z', items_vus: 120, en_vente: 130 } });
ok(tropGrand.total === 120, '« en vente » au-dessus des lus (impossible) → le compte d\'avant, jamais plus que lu', `total ${tropGrand.total}`);
const toutVendu = E.lireBilan({ plateformes: ['vinted'], runs: {}, runVinted: { finished_at: '2026-11-11T19:29:00Z', items_vus: 12, en_vente: 0 } });
ok(toutVendu.total === 0, 'fiable à 0 (12 lues, toutes vendues encore affichées) → 0, pas 12', `total ${toutVendu.total}`);
const texte = E.lireBilan({ plateformes: ['vinted'], runs: {}, runVinted: { finished_at: '2026-11-11T19:29:00Z', items_vus: 256, en_vente: '245' } });
ok(texte.total === 256, 'valeur illisible (chaîne) → le compte d\'avant', `total ${texte.total}`);
const horsCompte = E.lireBilan({ plateformes: ['leboncoin'], runs: RUNS, runVinted: vintedFiable });
ok(horsCompte.total === 379, 'Vinted hors des plateformes du compte : ni lus ni « en vente » ajoutés', `total ${horsCompte.total}`);
const autres = E.lireBilan({ plateformes: PLATEFORMES, runs: { ...RUNS, leboncoin: { ...RUNS.leboncoin, en_vente: 1 } }, runVinted: null });
ok(autres.total === 379 + 225 + 147, 'les autres plateformes : inchangées (items_vus, aucun « en vente » lu chez elles)', `total ${autres.total}`);

console.log('\nC. LE CÂBLAGE');
const bloc = lire('src/stock/BlocSynchro.jsx');
const carte = lire('src/annonces/CarteAnnoncesEnLigne.jsx');
ok(/lireBilan\(\{ plateformes: r\.plateformes, runs: r\.runs, runVinted: r\.runVinted \}\)/.test(bloc) && /T\.nAnnonces\(bilan\.total/.test(bloc), 'BlocSynchro (carte Synchroniser) : en-tête = lireBilan(…).total (BlocSynchro non touché)');
ok(/lireBilan\(\{ plateformes: r\.plateformes, runs: r\.runs, runVinted: r\.runVinted \}\)/.test(carte), 'CarteAnnoncesEnLigne : même lireBilan');
const sync = lire('src/utils/syncPlateformes.js');
ok(/run\.en_vente = await compterEnVenteDuReleve\(userId, run\)/.test(sync) && /return enVenteFiable\(/.test(lire('src/utils/vintedSync.js')), 'runVinted.en_vente : posé par compterEnVenteDuReleve, gardé par enVenteFiable (fiable ou null)');

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
