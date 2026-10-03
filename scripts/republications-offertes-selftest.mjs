// Autotest — le mur des republications dit d'abord ce que le gratuit A DÉJÀ
// (03/10, point 20) — npm run selftest:republications-offertes
//
// Le gratuit a 50 republications offertes à vie (republication_avie_free,
// règle du serveur depuis le 02/09, aucune limite par jour). Sur 30 jours,
// 79 comptes gratuits ont pris le mur « republication en lot » ou
// « automatique » — 54 n'ont jamais republié une seule annonce : le mur ne
// leur disait ni qu'ils en avaient 50, ni comment s'en servir.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA MODALE DES OFFRES : CE QU'IL A, D'ABORD");
const modale = lire("src/components/ConversionModal.jsx");
ok(/repubOffertes = null,/.test(modale), "la modale reçoit les republications offertes restantes");
const iBloc = modale.indexOf("{(repubLot || repubAuto) && Number(repubOffertes?.restantes) > 0 && (");
const iOffre = modale.indexOf("{offre === 'FILLSELL50' && (");
const iCartes = modale.indexOf("<PlansStack fr={fr} tiers={sellable} showFree");
ok(iBloc > 0 && iBloc < iOffre && iBloc < iCartes, "en lot comme en automatique, le bloc vient AVANT toute offre et toute carte de prix");
const bloc = modale.slice(iBloc, iOffre);
ok(/Tu as encore \{repubOffertes\.restantes\} republications offertes/.test(bloc) && /rien à payer/.test(bloc), "« Tu as encore N republications offertes — rien à payer »");
ok(/une par une : le bouton « Republier » est sur la carte de chaque annonce/.test(bloc), "le geste : une par une, le bouton « Republier » de chaque carte");
ok(/logModale\('offers_modal_offertes_click'/.test(bloc) && /\{fr \? 'Republier une par une' : 'Repost one by one'\}/.test(bloc),
  "un bouton qui ramène au stock, mesuré à part (pas compté comme un abandon)");
const app = lire("src/App.jsx");
ok(/repubOffertes=\{quotas\?\.republication\?\.mode==='avie'\?\{restantes:quotas\.republication\.restantes\?\?null,plafond:quotas\.republication\.plafond\?\?null\}:null\}/.test(app),
  "l'app passe le compteur du serveur (quotas_etat, mode « à vie ») — jamais un chiffre en dur");

console.log("\n2. LE STOCK : LE BOUTON « REPUBLIER EN LOT » D'UN GRATUIT");
const stock = lire("src/tabs/StockTab.jsx");
ok(/Tu as encore \$\{quotas\.republication\.restantes\} republications offertes : republie tes annonces une par une, avec le bouton « Republier » de chaque carte\./.test(stock),
  "sous le bouton : ses republications offertes et comment s'en servir");

console.log("\n3. PLUS DE TEXTE FAUX");
ok(!/par jour en Free|a day on Free|ça repart demain\.`/.test(stock), "plus de « 3 par jour… ça repart demain » (la règle est « 50 à vie »)");
ok(/Tes \$\{res\?\.plafond \?\? 50\} republications offertes sont toutes utilisées\. Rien n'a été débité\./.test(stock), "le refus dit le vrai : les offertes sont toutes utilisées");
ok(!/pour la faire remonter dans le fil Vinted\.\$\{quotas/.test(stock), "la republication EN LOT (toutes plateformes) ne parle plus du seul « fil Vinted »");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ le gratuit voit ce qu'il a avant ce qu'on lui vend");
