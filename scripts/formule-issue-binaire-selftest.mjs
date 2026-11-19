// VERROU « LA TRACE D'UNE ISSUE D'ACHAT DE FORMULE CLOUD PORTE LA VERSION DE L'APP » (19/11/2026, décision de Nico)
// `npm run selftest:formule-issue-binaire` — sans base, sans réseau.
// Cas : le compte 8fd44622 a eu 4 refus « mettre_a_jour_android » à 09:55-09:56, puis un achat avec le binaire 2.9.209 à
// 09:59. La garde lit la version du binaire notée au démarrage (binaireCloudNote) ; la trace formule_cloud_issue ne la
// gardait pas : il a fallu la déduire du journal de paiement d'à côté (checkout_issue). La règle : chaque ligne
// formule_cloud_issue porte `binaire` (« 2.9.209 », « web »), la valeur même que la garde a lue.
// Ce verrou CASSE si : la trace perd la version, ou l'app cesse de la passer (App.jsx → issueFormuleJournal).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 300)}` : ''}`); } };
const { issueFormuleJournal } = await import(pathToFileURL(path.join(RACINE, 'src/cloud/issueAchatJournal.js')).href);

console.log('1. La ligne de la trace porte la version de l\'app');
{
  const refus = { etat: 'refuse', raison: 'mettre_a_jour_android', etape: 'essai_unique', semaine_boutique: 'oui', message: 'Mets à jour FillSell…' };
  const l = issueFormuleJournal(refus, { origine: 'stock_carte_cloud', formule: 'premium_cloud', binaire: '2.9.176' });
  ok(l.binaire === '2.9.176', 'refus « mettre_a_jour_android » : binaire 2.9.176 dans la ligne', l);
  ok(l.raison === 'mettre_a_jour_android' && l.etape === 'essai_unique' && l.semaine_boutique === 'oui' && !('message' in l), 'le reste de la ligne inchangé (raison, étape, semaine ; jamais le texte montré)', l);
  const actif = issueFormuleJournal({ etat: 'actif', etape: 'boutique', produit: 'app.fillsell.premium.cloud' }, { origine: 'x', formule: 'premium_cloud', binaire: '2.9.209' });
  ok(actif.binaire === '2.9.209', 'issue réussie : binaire 2.9.209', actif);
  const web = issueFormuleJournal({ etat: 'annule', raison: 'boutique_annulee' }, { origine: 'x', formule: 'cloud', binaire: 'web' });
  ok(web.binaire === 'web', 'web : « web »', web);
  const sans = issueFormuleJournal({ etat: 'annule', raison: 'boutique_annulee' }, { origine: 'x', formule: 'cloud' });
  ok(!('binaire' in sans), 'version pas encore lue (null) : pas de champ, rien d\'inventé', sans);
  const long = issueFormuleJournal({ etat: 'erreur', raison: 'x' }, { binaire: 'x'.repeat(500) });
  ok(String(long.binaire).length <= 40, 'valeur bornée (40 caractères)');
}

console.log('2. L\'app passe la version que la garde a lue');
{
  const app = readFileSync(path.join(RACINE, 'src/App.jsx'), 'utf8');
  ok(/logTunnel\('formule_cloud_issue',issueFormuleJournal\(r,\{origine,formule,binaire:binaireCloudNote\(\)\}\)\)/.test(app), 'App.jsx : issueFormuleJournal(r, { origine, formule, binaire: binaireCloudNote() })');
  ok(/import \{[^}]*\bbinaireCloudNote\b[^}]*\} from '\.\/config\/cloudOffer'/.test(app), 'App.jsx importe binaireCloudNote de config/cloudOffer');
  const achat = readFileSync(path.join(RACINE, 'src/cloud/achatFormuleCloud.js'), 'utf8');
  ok(/binaireNatif \?\? binaireCloudNote\(\)/.test(achat), 'la garde (achatFormuleCloud.lireBinaire) lit la même valeur : binaireCloudNote()');
}

console.log(ko ? `\n✗ formule-issue-binaire : ${ko} échec(s) sur ${n}` : `\n✓ formule-issue-binaire : ${n}/${n}`);
process.exit(ko ? 1 : 0);
