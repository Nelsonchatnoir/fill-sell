// ═══════════════════════════════════════════════════════════════════════════
// VERROU — « 245 EN VENTE · 11 VENDUES ENCORE AFFICHÉES » VISIBLE, ET JAMAIS FAUX (13/11/2026, étape 5, bloc 6 iii)
//   npm run selftest:vendues-encore-affichees
// ═══════════════════════════════════════════════════════════════════════════
// Feu vert de Nico : « ligne « N vendues encore affichées » visible ». Le défaut (audit du 12/11, bloc 6 iii) : 447d920c
// — relevé du 11/11 20:29 : 256 lus = 245 « active » + 11 « sold » (Vinted garde les vendus affichés).
// Le texte « 245 en vente · 11 vendues encore affichées » existait (StockTab, VintedDressingSync « ligne ») mais cette ligne
// est montée CACHÉE (BlocSynchro : display:none) : l'explication n'était visible nulle part. Et le compte « en vente »,
// recompté sur les instantanés de la fenêtre du relevé, est FAUX quand un relevé plus tardif du même jour les a réécrits
// (447d920c, relevé du 11/11 13:15 : 9 « en vente » pour 256 lus ; mesuré le 13/11 : 23 relevés sur 60 en 24 h).
// La règle : la ligne est visible dans le bloc, avec le même texte ; le compte n'est rendu que si la fenêtre porte
// exactement les articles lus (sinon « 256 articles lus », jamais un faux « en vente »).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
let V = {};
try { V = await import(pathToFileURL(path.join(RACINE, 'src/annonces/boutiqueVinted.js')).href); } catch { V = {}; }
const fn = (nom) => (typeof V[nom] === 'function' ? V[nom] : null);

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d ? `\n      ← ${d}` : ''}`); } };

console.log('\nA. LE COMPTE FIABLE (instantanés de la fenêtre du relevé)');
ok(fn('enVenteFiable') && V.enVenteFiable({ actifs: 245, tous: 256, vus: 256 }) === 245, '447d920c, relevé du 11/11 20:29 : 245 + 11 = 256 lus → 245 en vente');
ok(fn('enVenteFiable') && V.enVenteFiable({ actifs: 9, tous: 9, vus: 256 }) === null, '447d920c, relevé du 11/11 13:15 (instantanés réécrits plus tard) : 9 sur 256 → INCONNU, jamais « 9 en vente »');
ok(fn('enVenteFiable') && V.enVenteFiable({ actifs: 228, tous: 276, vus: 277 }) === null, 'un instantané manquant (276 / 277) → inconnu (jamais un compte faux d\'un article)');
ok(fn('enVenteFiable') && V.enVenteFiable({ actifs: 245, tous: null, vus: 256 }) === null && V.enVenteFiable({ actifs: null, tous: 256, vus: 256 }) === null, 'lecture ratée → inconnu');

console.log('\nB. LE TEXTE (le même partout)');
ok(fn('compteBoutiqueVinted') && V.compteBoutiqueVinted({ vus: 256, enVente: 245 }) === '245 en vente · 11 vendues encore affichées', '« 245 en vente · 11 vendues encore affichées »');
ok(fn('compteBoutiqueVinted') && V.compteBoutiqueVinted({ vus: 256, enVente: null }) === '256 articles lus', 'compte inconnu : « 256 articles lus »');
ok(fn('compteBoutiqueVinted') && V.compteBoutiqueVinted({ vus: 256, enVente: 245 }, 'en') === '245 for sale · 11 sold still shown', 'anglais');
ok(fn('ligneVenduesAffichees') && V.ligneVenduesAffichees({ items_vus: 256, en_vente: 245 }) === '245 en vente · 11 vendues encore affichées par Vinted', 'la ligne du bloc : « … par Vinted »');
ok(fn('ligneVenduesAffichees') && V.ligneVenduesAffichees({ items_vus: 245, en_vente: 245 }) === null && V.ligneVenduesAffichees({ items_vus: 256, en_vente: null }) === null && V.ligneVenduesAffichees(null) === null,
  'aucune vendue affichée, ou compte inconnu : pas de ligne (rien à expliquer, rien de sûr à dire)');

console.log('\nC. L\'ÉCRAN');
const bs = lire('src/stock/BlocSynchro.jsx');
const iLigne = bs.indexOf('data-vendues-affichees');
const iCache = bs.indexOf("{ligneVinted && <div aria-hidden=\"true\" style={{ display: 'none' }}>{ligneVinted}</div>}");
ok(iLigne > 0 && bs.includes('ligneVenduesAffichees(r.runVinted, lang)'), 'BlocSynchro rend la ligne (dernier relevé Vinted réussi, hors veille)');
ok(iLigne > 0 && iCache > 0 && iLigne < iCache, 'la ligne est dans la carte VISIBLE (pas dans la ligne Vinted cachée)');
const st = lire('src/tabs/StockTab.jsx');
ok(st.includes('compteBoutiqueVinted({ vus, enVente }, lang)'), 'la ligne Vinted de StockTab dit le même texte (une seule rédaction)');
const vs = lire('src/utils/vintedSync.js');
ok(vs.includes('enVenteFiable({ actifs: actifs.count, tous: tous.count, vus: run?.items_vus })'), 'le compte « en vente » passe la garde de fiabilité (pastille Vinted comprise)');

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
