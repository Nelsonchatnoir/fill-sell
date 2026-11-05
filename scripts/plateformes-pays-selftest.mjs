// selftest:plateformes-pays — (05/11 soir, lot « Ouverture du Cloud », phase 3 point 2) les plateformes par pays :
// masquées tant qu'elles ne sont pas prouvées dans un pays anglophone, Leboncoin et Beebs jamais hors de France, et
// RIEN qui change pour la France et les autres pays.
import assert from 'node:assert/strict';
import { paysAnglophoneDuFuseau, paysDuVendeur, paysDuCompte, plateformesFermeesParPays, clesAOuvrir, cleOuverture, PAYS_ANGLOPHONES, PLATEFORMES } from '../supabase/functions/_shared/plateformes-pays.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. Zéro régression : France, zone euro, autres, inconnu.
for (const pays of ['FR', 'IT', 'BE', 'DE', 'ES', 'PT', 'CH', null, undefined, '']) {
  ok(eq(plateformesFermeesParPays({ pays }), []), `${pays ?? 'pays inconnu'} : rien de fermé (l'app d'avant)`);
}
ok(paysAnglophoneDuFuseau('Europe/Paris') === null && paysAnglophoneDuFuseau('Europe/Rome') === null && paysAnglophoneDuFuseau('Europe/Brussels') === null,
  'Paris, Rome, Bruxelles : pas un pays anglophone');
ok(paysDuVendeur({ fuseau: 'Europe/Paris' }) === null, 'téléphone en France : pays non retenu, rien ne change');

// 2. Les pays anglophones : tout masqué tant que rien n'est prouvé (aujourd'hui).
ok(eq(plateformesFermeesParPays({ pays: 'US' }), PLATEFORMES), 'États-Unis, rien de prouvé : tout est masqué (jamais proposé cassé)');
ok(eq(plateformesFermeesParPays({ pays: 'GB' }), PLATEFORMES), 'Royaume-Uni, rien de prouvé : tout masqué');
ok(plateformesFermeesParPays({ pays: 'US', ouvertes: PLATEFORMES.map((p) => cleOuverture(p, 'US')) }).includes('leboncoin')
  && plateformesFermeesParPays({ pays: 'US', ouvertes: PLATEFORMES.map((p) => cleOuverture(p, 'US')) }).includes('beebs'),
  'Leboncoin et Beebs jamais ouverts hors de France, même avec une clé posée');
ok(eq(plateformesFermeesParPays({ pays: 'US', ouvertes: ['ebay_pays_us'] }), ['vinted', 'leboncoin', 'beebs', 'depop']), 'eBay prouvé aux États-Unis : seul eBay s’ouvre');
ok(eq(plateformesFermeesParPays({ pays: 'GB', ouvertes: ['vinted_pays_gb', 'ebay_pays_gb', 'depop_pays_gb'] }), ['leboncoin', 'beebs']), 'Royaume-Uni, trois prouvées : Vinted UK, eBay.co.uk, Depop');
ok(eq(plateformesFermeesParPays({ pays: 'GB', ouvertes: ['vinted_pays_us'] }), PLATEFORMES), 'une clé d’un autre pays n’ouvre rien');
ok(eq(plateformesFermeesParPays({ pays: 'CA', ouvertes: ['vinted_pays_ca', 'ebay_pays_ca'] }), ['vinted', 'leboncoin', 'beebs', 'depop']), 'Canada : Vinted n’y est pas visé, même clé posée');
ok(eq(clesAOuvrir('US'), ['vinted_pays_us', 'ebay_pays_us', 'depop_pays_us']) && eq(clesAOuvrir('FR'), []), 'les clés à lire');
ok(Object.keys(PAYS_ANGLOPHONES).join(',') === 'US,GB,IE,CA,AU,NZ', 'pays suivis : US, GB, IE, CA, AU, NZ');

// 3. Le pays : le compte d'abord, sinon le téléphone.
ok(paysAnglophoneDuFuseau('America/New_York') === 'US' && paysAnglophoneDuFuseau('America/Los_Angeles') === 'US' && paysAnglophoneDuFuseau('Pacific/Honolulu') === 'US', 'fuseaux américains');
ok(paysAnglophoneDuFuseau('Europe/London') === 'GB' && paysAnglophoneDuFuseau('Europe/Dublin') === 'IE', 'Londres, Dublin');
ok(paysAnglophoneDuFuseau('America/Toronto') === 'CA' && paysAnglophoneDuFuseau('Australia/Sydney') === 'AU' && paysAnglophoneDuFuseau('Pacific/Auckland') === 'NZ', 'Toronto, Sydney, Auckland');
ok(paysAnglophoneDuFuseau('America/Mexico_City') === null && paysAnglophoneDuFuseau('America/Sao_Paulo') === null, 'Mexique, Brésil : non suivis');
ok(paysDuVendeur({ paysCompte: 'fr', fuseau: 'America/New_York' }) === 'FR', 'un compte français en voyage à New York reste français (rien ne change)');
ok(paysDuVendeur({ paysCompte: null, fuseau: 'Europe/London' }) === 'GB', 'sans pays du compte : le téléphone');

// 4. Le pays du COMPTE : une trace française suffit (zéro régression pour un Français à l'étranger).
ok(paysDuCompte({ motifAdresse: 'france' }) === 'FR', 'adresse de remise française : France');
ok(paysDuCompte({ jobs: [{ platform: 'leboncoin' }] }) === 'FR' && paysDuCompte({ jobs: [{ platform: 'beebs' }] }) === 'FR', 'une annonce Leboncoin ou Beebs : France');
ok(paysDuCompte({ jobs: [{ platform: 'vinted', listing_url: 'https://www.vinted.fr/items/123-pull' }] }) === 'FR', 'une annonce sur vinted.fr : France');
ok(paysDuCompte({ jobs: [{ platform: 'vinted', listing_url: 'https://www.vinted.co.uk/items/1' }] }) === null, 'vinted.co.uk seul : rien ne dit la France');
ok(paysDuCompte({ paysSonde: 'gb' }) === 'GB' && paysDuCompte({ paysSonde: 'FR', jobs: [] }) === 'FR', 'la sonde Vinted du compte');
ok(paysDuCompte({}) === null, 'aucune trace : null (le téléphone décidera)');
ok(paysDuVendeur({ paysCompte: paysDuCompte({ jobs: [{ platform: 'beebs' }] }), fuseau: 'Europe/London' }) === 'FR'
  && eq(plateformesFermeesParPays({ pays: paysDuVendeur({ paysCompte: paysDuCompte({ jobs: [{ platform: 'beebs' }] }), fuseau: 'Europe/London' }) }), []),
  'une vendeuse Beebs installée à Londres garde toutes ses plateformes');

// 5. Câblage dans l'app : les plateformes fermées du compte (déjà lues partout) reçoivent la règle du pays ; rien n'est lu
// pour un téléphone hors pays anglophone ; la langue de l'app va au profil (mails et notifications).
const app = (await import('node:fs')).readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
ok(/import \{ paysAnglophoneDuFuseau, paysDuVendeur, paysDuCompte, plateformesFermeesParPays, clesAOuvrir \} from '\.\.\/supabase\/functions\/_shared\/plateformes-pays\.js';/.test(app), 'App importe la règle');
ok(/const paysTelephone=paysAnglophoneDuFuseau\(fuseau\);\s*if\(!paysTelephone\)\{setPaysPlateformes\(\{pays:null,ouvertes:\[\]\}\);return undefined;\}/.test(app), 'téléphone hors pays anglophone : rien n’est lu, rien ne change');
ok(/if\(motifAdresse==='france'\)\{setPaysPlateformes\(\{pays:'FR',ouvertes:\[\]\}\);return undefined;\}/.test(app), 'adresse de remise française : France, sans lecture');
ok(/\.catch\(\(\)=>\{if\(vivant\)setPaysPlateformes\(\{pays:paysTelephone,ouvertes:\[\]\}\);\}\)/.test(app), 'lecture ratée : masqué (garde-fou)');
ok(/\.\.\.plateformesFermeesHorsFrance\(\{rue:settingsLbcRue,code_postal:settingsLbcCp,ville:settingsLbcVille\}\),\.\.\.plateformesFermeesParPays\(paysPlateformes\)/.test(app), 'plateformesFermees = adresse hors de France ∪ règle du pays');
ok(/supabase\.from\('profiles'\)\.update\(\{lang\}\)\.eq\('id',user\.id\)\.or\(`lang\.is\.null,lang\.neq\.\$\{lang\}`\)/.test(app), 'la langue de l’app va au profil, seulement quand elle diffère');

console.log(`✓ selftest:plateformes-pays — ${n} assertions`);
