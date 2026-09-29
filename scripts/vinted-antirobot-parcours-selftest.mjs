// `npm run selftest:vinted-antirobot-parcours`
import fs from 'node:fs';

let erreurs = 0;
const verifier = (nom, condition) => {
  console.log(`  ${condition ? '✓' : '✗'} ${nom}`);
  if (!condition) erreurs++;
};
const lire = (p) => fs.readFileSync(p, 'utf8');
const bg = lire('chrome-extension/background.js');
const vinted = lire('chrome-extension/content-scripts/vinted.js');
const pont = lire('chrome-extension/content-scripts/fillsell-auth.js');
const connexion = lire('src/utils/connexionPlateformes.js');
const bouton = lire('src/components/BoutonMeConnecter.jsx');
const stock = lire('src/tabs/StockTab.jsx');

console.log('\n1. Le geste ouvre un onglet armé, jamais un lien muet');
verifier('commande web en liste fermée', /"VINTED_ANTIROBOT_OUVRIR"/.test(pont));
verifier('le motif web ne rend pas de lien direct', /motif === MOTIFS\.ANTIROBOT_VINTED\) return null/.test(connexion));
verifier('l’extension ouvre et arme l’onglet', /ouvrirVerificationVintedVisible[\s\S]*?armerVerificationVinted\(onglet\.id\)/.test(bg));
verifier('l’armement expire en dix minutes', /VINTED_ANTIROBOT_GESTE_TTL_MS = 10 \* 60_000/.test(bg));
verifier('le mobile exige le build 0.6.80', /VERSION_MINIMALE_ANTIROBOT_VINTED = '0\.6\.80'/.test(connexion));

console.log('\n2. La page déclenche une sonde immédiate et bornée');
verifier('signal au chargement', /setTimeout\(signalerPageVintedPrete, 0\)/.test(vinted));
verifier('nouvelle sonde après navigation ou focus', /addEventListener\("pageshow", signalerPageVintedPrete\)[\s\S]*?addEventListener\("focus", signalerPageVintedPrete\)/.test(vinted));
verifier('aucune sonde si l’onglet n’est pas armé', /const geste = await verificationVintedArmee\(tabId\);[\s\S]{0,80}?if \(!geste\) return false/.test(bg));
verifier('la sonde relit users/current dans la page', /sendMessageToTab\(tabId, \{ type: "VINTED_CURRENT_USER" \}/.test(bg));

console.log('\n3. 200, 401 et 403 ont trois issues distinctes');
verifier('200 = compte vivant', /resultat\?\.success === true && http === 200/.test(bg));
verifier('401 = session morte', /resultat\?\.sessionExpiree === true && http === 401/.test(bg));
verifier('403 = anti-robot maintenu', /const antirobot = http === 403/.test(bg));
verifier('200 reprend les attentes de session', /if \(succes\) await reprendreJobsVintedApresSession/.test(bg));
verifier('poll immédiat puis second passage', /pollAndProcessJobs\(\)\.finally[\s\S]{0,180}?setTimeout\(\(\) => \{ pollAndProcessJobs/.test(bg));

console.log('\n4. L’app montre le geste au lieu d’une fausse progression');
verifier('mur exact dans Stock', /attenteAntirobotVinted\(job\)[\s\S]{0,400}?MOTIFS\.ANTIROBOT_VINTED/.test(stock));
verifier('pastille Vérification Vinted', /✋ Vérification Vinted/.test(stock));
verifier('bouton direct Vérifier sur Vinted', /verifierVinted: 'Vérifier sur Vinted'/.test(bouton));

if (erreurs) {
  console.error(`\n❌ parcours anti-robot Vinted : ${erreurs} défaut(s)`);
  process.exit(1);
}
console.log('\n✅ parcours anti-robot Vinted : geste → sonde → reprise automatique');
