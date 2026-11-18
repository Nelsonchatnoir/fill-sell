// ═══════════════════════════════════════════════════════════════════════════
// VERROU — QUAND L'APP PROPOSE LE CLOUD, ET QUAND ELLE SE TAIT (18/11/2026, lot T1, décisions 3 et 5 de Nico)
//   npm run selftest:propositions-cloud
// ═══════════════════════════════════════════════════════════════════════════
// Cas Butin d'Or (18/11, 20:13-20:14, Android) : Business seul, le bandeau Cloud une minute après, Business + Cloud →
// deux débits Google le même soir. Décisions de Nico du 18/11 : (3) aucune proposition Cloud 7 jours après un paiement
// (ni bandeau, ni carte, ni pop-up), ensuite seulement une carte discrète au Stock, jamais de bandeau, l'ajout reste
// possible depuis les offres ; (5) le bandeau du Tableau est retiré pendant les premiers jours, la carte du Stock suffit.
// Ce verrou fait tomber : une proposition Cloud (bandeau, carte, fenêtre automatique) qui revient juste après un paiement,
// un bandeau montré à un abonné ou à un compte de moins de 7 jours, une carte du Stock qui disparaît pour un compte gratuit,
// une proposition faite avant que l'état soit lu.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
let P = {};
try { P = await import('../src/cloud/propositionsCloud.js'); } catch (e) { P = { __erreur: e.message }; }
const J = 86_400_000;
const MAINTENANT = Date.parse('2026-11-18T20:15:00Z');

console.log('1. La règle (pure)');
ok(typeof P.propositionsCloud === 'function', 'propositionsCloud se charge', P.__erreur);
if (typeof P.propositionsCloud === 'function') {
  const r = (o) => P.propositionsCloud({ maintenant: MAINTENANT, lu: true, compteCreeMs: MAINTENANT - 30 * J, ...o });
  const pasLu = P.propositionsCloud({ palier: 'gratuit', lu: false, maintenant: MAINTENANT });
  ok(!pasLu.bandeau && pasLu.carteStock === null && !pasLu.cartes && !pasLu.popups, 'rien n’est lu : rien ne se propose');
  const butin = r({ palier: 'business', dernierPaiementMs: MAINTENANT - 60_000 });
  ok(butin.silence && !butin.bandeau && butin.carteStock === null && !butin.cartes && !butin.popups, 'Butin d’Or : Business payé il y a 1 minute → ni bandeau, ni carte, ni fenêtre', JSON.stringify(butin));
  const j6 = r({ palier: 'pro', dernierPaiementMs: MAINTENANT - 6.9 * J });
  ok(j6.silence && j6.carteStock === null, '6,9 jours après un paiement : toujours rien');
  const j8 = r({ palier: 'pro', dernierPaiementMs: MAINTENANT - 8 * J });
  ok(!j8.silence && j8.carteStock === 'discrete' && !j8.bandeau && !j8.cartes && j8.popups, 'abonné, 8 jours après : la carte DISCRÈTE du Stock seulement, jamais de bandeau', JSON.stringify(j8));
  const free = r({ palier: 'gratuit' });
  ok(free.carteStock === 'grande' && free.bandeau && free.cartes && free.popups, 'compte gratuit installé depuis 30 jours : la grande carte du Stock, le bandeau, les cartes', JSON.stringify(free));
  const nouveau = r({ palier: 'gratuit', compteCreeMs: MAINTENANT - 2 * J });
  ok(nouveau.carteStock === 'grande' && !nouveau.bandeau, 'compte de 2 jours : la carte du Stock, PAS le bandeau du Tableau (décision 5)');
  ok(r({ palier: 'gratuit', compteCreeMs: MAINTENANT - 7.1 * J }).bandeau === true, 'après 7 jours : le bandeau revient pour un compte gratuit');
  ok(r({ palier: 'gratuit', dernierPaiementMs: MAINTENANT - J }).silence === true, 'un paiement (même d’un compte redevenu gratuit) : silence 7 jours');
  ok(P.estAbonnePayant('premium') && P.estAbonnePayant('business') && !P.estAbonnePayant('gratuit') && !P.estAbonnePayant('free') && !P.estAbonnePayant(null), 'abonné payant = premium, pro, business');
  ok(P.plusRecent(5, 9) === 9 && P.plusRecent(null, 3) === 3 && P.plusRecent(NaN, null) === null, 'plusRecent');
}

console.log('\n2. Le dernier paiement : lu dans coin_ledger (Stripe, Apple, Google), ou un palier qui monte');
const suivi = lire('src/cloud/useSuiviPropositionsCloud.js');
ok(/from\('coin_ledger'\)/.test(suivi) && /\.in\('kind', \['grant_monthly', 'grant_upgrade'\]\)\.eq\('metadata->>source', 'payment'\)/.test(suivi), 'la ligne coin_ledger de source « payment » (tous les canaux l’écrivent)');
ok(/\.gte\('created_at', depuis\)/.test(suivi) && /\.limit\(1\)/.test(suivi) && /\}, \[userId, palier\]\);/.test(suivi), 'UNE lecture bornée par compte et par palier (jamais en boucle)');
ok(/RANG_PALIER\[palier\] \?\? 0\) > \(RANG_PALIER\[avant\] \?\? 0\)/.test(suivi) && /noterPaiementLocal\(userId, maintenant\)/.test(suivi), 'un palier qui MONTE après la 1re lecture = un achat qui vient de réussir');

console.log('\n3. Les endroits où le Cloud se propose');
const app = lire('src/App.jsx');
ok(/useSuiviPropositionsCloud\(\{userId:user\?\.id\?\?null,palier,palierCharge,compteCreeLe:user\?\.created_at\?\?null\}\)/.test(app), 'App pose la règle pour tous les écrans');
ok(/setPalier\(palierLu\);\s*setPalierCharge\(true\);/.test(app), 'le palier « lu » ne l’est qu’après la base (fetchAll)');
ok(/\{user\?\.id&&tab===0&&propCloud\.bandeau&&\(\s*<BandeauCloudTableau /.test(app), 'le bandeau du Tableau : seulement si la règle le permet');
ok(/\{user&&achatFormules&&propCloud\.popups&&!propCloud\.abonnePayant&&<BandeauReprendreEssai /.test(app), '« Reprendre ton essai » : jamais à un abonné, jamais 7 jours après un paiement');
ok(/silence=\{!propCloud\.popups\}/.test(app), 'les fenêtres automatiques (HoteCloud) se taisent 7 jours après un paiement');
ok(/\{user\?\.id&&tab===1&&!espaceMessagerie&&!meConnecterOuvert&&!showOnboardingFlow&&\(\s*<CarteCloudStock /.test(app), 'la carte Cloud en tête du Stock (onglet Stock)');
ok(/onEssai=\{\(formule,opts\)=>lancerAchatFormule\(formule,opts,'stock_carte_cloud'\)\}/.test(app) && /onVoirOffres=\{\(\)=>openUpgradeModal\(null,'stock_carte_cloud','cloud'\)\}/.test(app),
  'la carte achète par le chemin existant (lancerAchatFormule), ou ouvre les offres');
const hote = lire('src/cloud/HoteCloud.jsx');
ok((hote.match(/if \(!silence && /g) ?? []).length === 3, 'HoteCloud : place libérée, essai terminé, Cloud arrêté → rien pendant le silence', String((hote.match(/if \(!silence && /g) ?? []).length));
const voie = lire('src/cloud/VoieSansOrdinateur.jsx');
ok(/if \(variante !== 'page' && !prop\.cartes\) return null;/.test(voie), 'les cartes « sans ordinateur » (murs de l’extension) : ni après un paiement, ni à un abonné');
const carte = lire('src/cloud/CarteCloudStock.jsx');
ok(/prop\.lu && prop\.carteStock != null/.test(carte) && /!clientCloud/.test(carte), 'la carte du Stock : jamais avant la lecture, jamais à un client Cloud, jamais pendant le silence');
ok(/if \(taille === 'discrete'\)/.test(carte) && /onVoirOffres\?\.\(\)/.test(carte), 'abonné : la carte discrète ouvre les offres (jamais un achat en un geste)');
ok(/journal\?\.\('stock_carte_cloud_vue', \{ taille, essai_propose: o\.essaiPropose/.test(carte), 'journal : stock_carte_cloud_vue { taille, essai_propose }');
ok(/offreAccueil\(modele, essaiPermis\)/.test(carte) && /essai \? T\.acCloudCtaEssai : T\.acCloudCtaPasser\(nom\)/.test(carte), 'l’essai annoncé seulement si la carte d’offre le porte (même règle que l’accueil)');
const bienvenue = lire('src/App.jsx').match(/function PremiumWelcomeModal[\s\S]*?\n}\n/)?.[0] ?? '';
ok(!/Cloud/.test(bienvenue.replace(/\/\/.*$/gm, '').replace(/cloudEnsuite|CloudEnsuite|lireCloudEnsuite/g, '')) || /avecCloud = false/.test(lire('src/components/ConversionModal.jsx')),
  'après un paiement : la confirmation, et rien d’autre (aucun « Cloud ensuite » : avecCloud reste faux)');

console.log(`\n${rouges ? `✗ propositions-cloud : ${rouges} rouge(s), ${verts} vert(s)` : `✓ propositions-cloud : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
