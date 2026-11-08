// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU « NOUVEAU · FillSell Cloud » DU TABLEAU — SELFTEST (08/11/2026 soir, point 4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute les règles LIVRÉES (src/cloud/bandeauCloud.js) et relit le composant et son câblage. Garantit :
//   1. jamais à un client Cloud (essai compris), ni à qui a déjà eu le Cloud (essai pris, arrêté, refusé, payé) ;
//   2. jamais là où le Cloud ne se vend pas (cloudOffreVendable : Android tant que Google n'a pas publié la vc37) ;
//   3. rien tant qu'une lecture manque (pas de clignotement) ; rien sous un autre écran ;
//   4. refermé = 7 jours sur l'appareil, lecture/écriture sans exception ;
//   5. aucun prix ; clair seulement ; animations coupées si moins d'animations ; boutons de 44 px ;
//   6. « Essayer 7 jours » = lancerAchatCloud (Stripe sur le web, Apple sur iPhone) ; mesure vu / clic / fermeture.
//
//   node scripts/cloud-bandeau-selftest.mjs

import { readFileSync } from 'node:fs';
import {
  bandeauCloudVisible, aDejaEuLeCloud, fermetureEnCours, BANDEAU_CLOUD_PAUSE_MS, lireFermetureBandeauCloud,
  noterFermetureBandeauCloud, cleFermetureBandeauCloud, textesBandeauCloud, ORIGINE_BANDEAU_CLOUD,
} from '../src/cloud/bandeauCloud.js';

let n = 0;
let ko = 0;
const ok = (c, quoi) => { n++; if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const T0 = Date.parse('2026-11-08T21:00:00Z');
const base = { vendable: true, compteLu: true, clientCloud: false, profilLu: true, profil: { is_cloud: false }, fermeLe: null, ecranLibre: true, maintenant: T0 };

console.log('1. Jamais à qui a ou a eu le Cloud');
ok(bandeauCloudVisible(base) === true, 'compte sans Cloud, tout lu, vendable : montré');
ok(bandeauCloudVisible({ ...base, clientCloud: true }) === false, 'client Cloud (essai ou payé) : jamais');
for (const champ of ['is_cloud', 'cloud_essai_debut', 'cloud_essai_fin', 'cloud_essai_arrete', 'cloud_essai_refus', 'cloud_periode_fin', 'cloud_ref', 'cloud_canal']) {
  ok(bandeauCloudVisible({ ...base, profil: { [champ]: champ === 'is_cloud' ? true : '2026-11-01T10:00:00Z' } }) === false, `déjà eu le Cloud (${champ}) : jamais (« Essayer 7 jours » mentirait)`);
}
ok(aDejaEuLeCloud(null) === false && aDejaEuLeCloud({}) === false, 'profil vide : jamais eu le Cloud');

console.log('2. Seulement là où le Cloud se vend');
ok(bandeauCloudVisible({ ...base, vendable: false }) === false, 'non vendable (Android avant la vc37, hors France, offre fermée, vieux binaire) : jamais');
const offre = lire('src/config/cloudOffer.js');
ok(/export const CLOUD_BINAIRE_MIN_ANDROID = '2\.9\.167';/.test(offre), 'Android : le Cloud ne se vend qu’à partir de la vc37 (2.9.167)');

console.log('3. Rien tant qu’une lecture manque, rien sous un autre écran');
ok(bandeauCloudVisible({ ...base, compteLu: false }) === false, 'état Cloud du compte pas encore lu : rien');
ok(bandeauCloudVisible({ ...base, profilLu: false, profil: null }) === false, 'profil Cloud pas encore lu : rien');
ok(bandeauCloudVisible({ ...base, ecranLibre: false }) === false, 'parcours d’entrée ou « Me connecter » ouvert : rien');
ok(bandeauCloudVisible({ ...base, vendable: undefined }) === false && bandeauCloudVisible(null) === false, 'valeurs absentes : rien (fermé par défaut)');

console.log('4. Refermé = 7 jours sur cet appareil');
ok(BANDEAU_CLOUD_PAUSE_MS === 7 * 24 * 3600 * 1000, 'pause de 7 jours');
ok(bandeauCloudVisible({ ...base, fermeLe: T0 - 60_000 }) === false, 'refermé il y a 1 min : rien');
ok(bandeauCloudVisible({ ...base, fermeLe: String(T0 - 6 * 86400_000) }) === false, 'refermé il y a 6 jours (texte du stockage) : rien');
ok(bandeauCloudVisible({ ...base, fermeLe: T0 - 7 * 86400_000 - 1 }) === true, 'refermé il y a plus de 7 jours : revient');
ok(fermetureEnCours('abc', T0) === false && fermetureEnCours(null, T0) === false && fermetureEnCours(T0 + 3600_000, T0) === false, 'valeur illisible ou dans le futur : ne ferme rien');
const memoire = new Map();
const stock = { getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) };
noterFermetureBandeauCloud('u1', T0, stock);
ok(lireFermetureBandeauCloud('u1', stock) === String(T0) && memoire.has(cleFermetureBandeauCloud('u1')), 'fermeture écrite puis relue, clé par compte');
ok(lireFermetureBandeauCloud('u2', stock) === null, 'un autre compte du même appareil : pas refermé');
const casse = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } };
ok(lireFermetureBandeauCloud('u1', casse) === null && noterFermetureBandeauCloud('u1', T0, casse) === T0, 'stockage bloqué : jamais d’exception');

console.log('5. Aucun prix, clair seulement, moins d’animations, 44 px');
for (const lang of ['fr', 'en']) {
  const t = textesBandeauCloud(lang);
  ok(!/[€$£]|\d+[,.]\d{2}|\bprix\b|\bprice\b/i.test(Object.values(t).join(' ')), `textes ${lang} : aucun prix`);
}
ok(textesBandeauCloud('fr').cta === 'Essayer 7 jours' && textesBandeauCloud('fr').accroche === "Plus besoin d'ordinateur", 'textes FR de la maquette B');
const comp = lire('src/cloud/BandeauCloudTableau.jsx');
ok(!/prefers-color-scheme/.test(comp) && !/sombre|dark/i.test(comp.replace(/l'app n'a pas de\s*\/\/\s*mode sombre|mode sombre\)/g, '')), 'clair seulement : aucune variante sombre');
ok(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]*animation:none!important[\s\S]*\}/.test(comp), 'moins d’animations : toutes les animations coupées, état final fixe');
ok(/\.fsbc-btn\{[^}]*min-height:44px/.test(comp) && /\.fsbc-fermer\{width:44px;height:44px/.test(comp), 'boutons « Essayer » et × : 44 px au moins');
ok(/aria-label=\{T\.fermer\}/.test(comp) && /className="fsbc-scene" aria-hidden="true"/.test(comp), '× nommé pour l’accessibilité, scène décorative masquée');
ok(!/\$\{?\s*prix|PRIX|CLOUD_PRIX_AFFICHE|prixBoutique/.test(comp), 'le composant ne lit aucun prix');

console.log('6. Câblage et mesure');
const app = lire('src/App.jsx');
ok(/\{user\?\.id&&tab===0&&\(\s*<BandeauCloudTableau /.test(app), 'monté en haut du Tableau seulement (onglet 0)');
const z0 = app.indexOf('<div ref={scrollRef} className=');
ok(app.indexOf('<BandeauCloudTableau ') > z0 && app.indexOf('<BandeauCloudTableau ') < app.indexOf('<VentesADecider ', z0), 'dans la zone des bandeaux du Tableau, avant « Ventes à confirmer » (rien d’autre ne bouge)');
ok(/vendable=\{cloudOffreVendable\(user\.id\)\} compteLu=\{etatCompteCloud\.lu===true\} clientCloud=\{clientCloud\}/.test(app), 'vendable, compte lu, client Cloud : les sources de l’app');
ok(/ecranLibre=\{!meConnecterOuvert&&!showOnboardingFlow\}/.test(app), 'jamais sous le parcours d’entrée ni « Me connecter »');
ok(/onEssayer=\{\(\)=>lancerAchatCloud\(ORIGINE_BANDEAU_CLOUD\)\}/.test(app) && ORIGINE_BANDEAU_CLOUD === 'bandeau_tableau', '« Essayer 7 jours » = lancerAchatCloud (Stripe web, Apple iPhone), origine « bandeau_tableau »');
ok(/async function lancerAchatCloud\(origine='non_precisee'\)\{\s*if\(!achatCloud\|\|!cloudOffreVendable\(user\?\.id\)\)return;/.test(app), 'l’achat refuse lui-même un appareil où le Cloud ne se vend pas');
for (const ev of ['cloud_bandeau_vu', 'cloud_bandeau_clic', 'cloud_bandeau_ferme']) ok(comp.includes(`'${ev}'`), `mesure : ${ev}`);
ok(/vusCetteSession/.test(comp), '« vu » : une fois par ouverture de l’app, pas à chaque rendu');

console.log(`\n${n - ko}/${n} contrôles verts`);
if (ko) { console.log(`${ko} ROUGE(S)`); process.exit(1); }
