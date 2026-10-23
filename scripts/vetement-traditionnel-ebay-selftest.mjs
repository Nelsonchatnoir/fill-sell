// selftest:vetement-traditionnel-ebay — (24/10, point 7) Un vêtement traditionnel va au rayon eBay des vêtements
// traditionnels (« Vêtements, accessoires › Déguisements, occasions spéciales › Vêtements traditionnels, du monde »,
// relevé sur ebay.fr le 23/10), jamais en « Costumes » (la djellaba de Sébastien, 19/10, 3001).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const V = await import(pathToFileURL(join(ROOT, 'src/utils/vetementTraditionnel.js')).href);
const { FEUILLES } = await import(pathToFileURL(join(ROOT, 'src/utils/arbres/ebayFeuilles.js')).href);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const id = (icone, ...t) => V.vetementTraditionnel(icone, ...t)?.id ?? null;

console.log('1. Les feuilles relevées existent dans l\'arbre eBay de l\'app');
for (const [region, f] of Object.entries(V.FEUILLES_EBAY_TRADITIONNELLES)) {
  ok(FEUILLES.some((x) => x.id === f.id && x.chemin.join(' > ') === f.chemin.join(' > ')), `${region} : ${f.id} « ${f.chemin.at(-1)} » est une feuille de ebayFeuilles.js`);
}
ok(/Vêtements traditionnels, du monde  \[id=155240\]/.test(lire('docs/ebay-categories-raw.txt')), 'la branche est dans le relevé (docs/ebay-categories-raw.txt), source du fichier généré');

console.log('2. La djellaba et les mots sûrs');
ok(id('🤵', 'Djellaba traditionnelle marocaine homme / unisexe - Marron brodée') === '155253', 'Sébastien : la djellaba → 155253 (Asie du Sud-Ouest/Moyen-Orient), plus « Costumes »');
ok(id('👗', 'Caftan/takchita bordeaux et doré') === '155253' && id('👕', 'ensemble qamis avec pantalon garçon') === '155253' && id('👗', 'Abaya noire') === '155253', 'takchita, qamis, abaya → 155253');
ok(id('👗', 'Boubou africain bazin') === '155241' && id('🥻', 'Sari indien soie rouge') === '155246' && id('👘', 'Yukata coton bleu') === '155242'
  && id('👗', 'Dirndl bavarois') === '163145' && id('👚', 'Huipil brodé') === '155252', 'boubou, sari, yukata, dirndl, huipil : la feuille de leur région');

console.log('3. Les mots que la mode emprunte : jamais sans leur origine collée');
ok(id('👗', 'Robe caftan longue bohème chic - Imprimé floral', 'Robe de style oriental') === null, '« Robe caftan bohème » (style oriental dans la description) : la mode, rien ne change');
ok(id('👗', 'Caftan marocain brodé femme') === '155253' && id('👗', 'Robe caftan marocaine') === '155253', '« caftan marocain » → 155253');
ok(id('🧥', 'Gilet kimono japonais fleuri') === null && id('👚', 'Blouse croisé Style Japonaise - Kimono') === null && id('🧥', 'Veste style kimono chinois') === null, 'gilet / blouse / « style » kimono : la mode');
ok(id('👘', 'Kimono japonais en soie traditionnel') === '155242', 'kimono japonais traditionnel → 155242');
ok(id('👘', 'Kimono de judo enfant ceinture blanche') === null && id('👘', 'Kimono Jiu-Jitsu / BJJ noir japonais') === null, 'jamais un kimono d\'art martial');
ok(id('🧥', 'Gilet poncho style bohème') === null && id('🧥', 'Poncho mexicain laine') === '155252', 'poncho de mode : rien ; poncho mexicain → 155252');
ok(id(null, 'Figurine Daniel LaRusso Kimono japonais') === null && id('🎎', 'Poupée en sari indien') === null, 'jamais un objet qui n\'est pas un vêtement (figurine, poupée)');
ok(id('👗', 'Caftan marocain et kimono japonais') === null, 'deux régions : doute, rien ne change');
ok(id('👖', "Jean Levi's 501") === null, 'un vêtement ordinaire : rien');

console.log('4. Les branchements');
const r = lire('src/utils/resolutionPublication.js');
ok(r.includes('import { vetementTraditionnel } from "./vetementTraditionnel.js";') && r.includes('const traditionnel = platform === "ebay"'), 'la résolution des rayons l\'applique à eBay');
ok(/: traditionnel\n\s*\? \{ chemin: traditionnel\.chemin, id: traditionnel\.id, regle: `vetement_traditionnel_\$\{traditionnel\.region\}` \}/.test(r), 'chemin ET identifiant posés ensemble (eBay navigue par identifiant)');
ok(r.includes(': parMot.regle?.startsWith("vetement_traditionnel_") ? "vetement_traditionnel"'), 'la source du rayon est tracée (categorie_source = vetement_traditionnel)');

console.log(`\n✓ vetement-traditionnel-ebay : ${n} contrôles verts`);
