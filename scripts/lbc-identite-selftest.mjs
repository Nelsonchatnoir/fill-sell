import { preuveIdentiteLeboncoin, IDENTITE_LBC_FRAICHE_MS } from '../src/utils/lbcIdentite.js';
import fs from 'node:fs';

const maintenant = Date.parse('2026-09-29T12:00:00Z');
let erreurs = 0;
const verifier = (nom, condition) => {
  console.log(`  ${condition ? '✓' : '✗'} ${nom}`);
  if (!condition) erreurs++;
};

console.log('\n1. Une ancienne extension n’est jamais bloquée sur une preuve qu’elle ne sait pas écrire');
verifier('0.6.79 : porte non activée', preuveIdentiteLeboncoin({}, '0.6.79', maintenant).supportee === false);

console.log('\n2. La 0.6.80 exige un booléen exact, récent et daté par cette porte');
const dateFraiche = new Date(maintenant - 60_000).toISOString();
verifier('présence confirmée', preuveIdentiteLeboncoin({ leboncoin_identite: true, checked_at_par_plateforme: { leboncoin_identite: dateFraiche } }, '0.6.80', maintenant).presente === true);
verifier('absence confirmée', preuveIdentiteLeboncoin({ leboncoin_identite: false, checked_at_par_plateforme: { leboncoin_identite: dateFraiche } }, '0.6.80', maintenant).presente === false);
verifier('date Leboncoin générale insuffisante', preuveIdentiteLeboncoin({ leboncoin_identite: true, checked_at_par_plateforme: { leboncoin: dateFraiche } }, '0.6.80', maintenant).presente === null);
verifier('preuve périmée', preuveIdentiteLeboncoin({ leboncoin_identite: true, checked_at_par_plateforme: { leboncoin_identite: new Date(maintenant - IDENTITE_LBC_FRAICHE_MS - 1).toISOString() } }, '0.6.80', maintenant).presente === null);
verifier('date future refusée', preuveIdentiteLeboncoin({ leboncoin_identite: true, checked_at_par_plateforme: { leboncoin_identite: new Date(maintenant + 60_001).toISOString() } }, '0.6.80', maintenant).presente === null);

console.log('\n3. La sonde lit la réponse réelle sans sortir les valeurs');
const background = fs.readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8');
const debutSonde = background.indexOf('const identite = await executerDansOngletPlateforme("leboncoin"');
const finSonde = background.indexOf('return {\n        etat, http: r.status,', debutSonde);
const blocSonde = debutSonde >= 0 && finSonde > debutSonde
  ? background.slice(debutSonde, finSonde)
  : '';
verifier('la réponse courante est lue sous account', /json\?\.account/.test(blocSonde));
verifier('l’ancienne racine member reste tolérée', /json\?\.member/.test(blocSonde));
verifier('la sonde ne retourne que presente et le HTTP', /return \{ ok: true, presente, http: rep\.status \};/.test(blocSonde));
verifier('aucun nom ni prénom ne sort de la page', !/return \{[^\n}]*(first_name|firstName|last_name|lastName)/.test(blocSonde));

console.log('\n4. Un retrait Leboncoin exige le lien exact de cet exemplaire');
const lbc = fs.readFileSync(new URL('../chrome-extension/content-scripts/leboncoin.js', import.meta.url), 'utf8');
verifier('aucun repli de cible vers Mes annonces', /leboncoin:\s*\(job\)\s*=>\s*job\.listing_url,/.test(background));
verifier('la page de liste s’arrête avant toute recherche de carte',
  /if \(\/mes-annonces\/\.test\(location\.pathname\)\) \{[\s\S]{0,500}?un titre ne prouve jamais[\s\S]{0,500}?return \{/.test(lbc));
verifier('l’entrée retrait n’appelle plus deleteDepuisListe', !/return deleteDepuisListe\(job/.test(lbc));

if (erreurs) {
  console.error(`\n❌ identité Leboncoin : ${erreurs} défaut(s)`);
  process.exit(1);
}
console.log('\n✅ identité Leboncoin : aucun job autorisé sans preuve booléenne fraîche');
