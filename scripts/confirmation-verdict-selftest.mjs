// Selftest — « Confirmer » (étape 3/3) dit UNE chose, et elle est vraie (02/10).
//
//     node --import ./scripts/loader-ext.mjs scripts/confirmation-verdict-selftest.mjs
//
// Le cas de la capture du 02/10 : Opla en file (publication en cours),
// Leboncoin cochée mais sans adresse de remise, Beebs libre et non cochée.
// L'écran affichait « Partiront : rien pour l'instant », « La publication se
// fait… toute seule », « Avant de publier, il reste : coche Beebs », et la
// pastille « En ligne » sur Opla sous « une publication est déjà en cours ».
import { verdictConfirmation, puceVerrouillee, etatVerrouillee } from '../src/publication/plateformes.js';

let echecs = 0;
const ok = (cond, quoi) => { console.log(`  ${cond ? 'ok  ' : 'ÉCHEC'} ${quoi}`); if (!cond) echecs++; };

const base = (surcharge = {}) => ({
  platformListings: { platforms: { vinted: {}, leboncoin: {}, beebs: {}, opla: {} } },
  lockedSet: new Set(), publishedSet: new Set(), queuedSet: new Set(), attentes: {}, oplaAccesDetail: null,
  pausedPlatforms: [], platformSupport: {}, selected: new Set(), lbcAdresseManquante: null,
  exclusionsPrevues: { aPublier: [], exclues: [] },
  ...surcharge,
});
const VOIE = 'Après ton clic, la publication se fait dans Chrome sur ton ordinateur, toute seule.';

console.log('La capture du 02/10 : Opla en cours, Leboncoin sans adresse, Beebs libre');
{
  const m = base({
    lockedSet: new Set(['vinted', 'opla']), publishedSet: new Set(['vinted']), queuedSet: new Set(['opla']),
    selected: new Set(['leboncoin']),
    lbcAdresseManquante: { plateformes: ['leboncoin'] },
    exclusionsPrevues: { aPublier: [], exclues: [{ platform: 'leboncoin', motif: 'sans_adresse' }] },
  });
  const v = verdictConfirmation(m, 'fr', VOIE);
  ok(v.rienNePart === true, 'rien ne part');
  ok(v.titre === "Rien ne partira pour l'instant", 'un titre, vrai');
  ok(v.gravite === 'geste', 'ambre : un geste débloque');
  ok(v.lignes[0].startsWith('Leboncoin ne partira pas : adresse de remise manquante — va dans Réglages'), 'Leboncoin bloquée, en PREMIÈRE ligne, avec le geste');
  ok(v.lignes.includes('Tu peux cocher Beebs.'), 'Beebs : ce qu\'on peut cocher, dans la même carte');
  ok(v.lignes.includes('Publication déjà en cours sur Opla.'), 'Opla : en cours (pas « en ligne »)');
  ok(v.lignes.includes('Déjà en ligne sur Vinted.'), 'Vinted : déjà en ligne');
  ok(!v.lignes.includes(VOIE), 'jamais « la publication se fait toute seule » quand rien ne part');
  ok(etatVerrouillee('opla', m) === 'en_cours', 'Opla : état réel « en cours »');
  ok(puceVerrouillee('opla', m, 'fr').libelle === 'En cours', 'pastille Opla « En cours »');
  ok(puceVerrouillee('vinted', m, 'fr').libelle === 'En ligne', 'pastille Vinted « En ligne »');
}

console.log('Quelque chose part, une plateforme exclue');
{
  const m = base({
    selected: new Set(['vinted', 'leboncoin']),
    lbcAdresseManquante: { plateformes: ['leboncoin'] },
    exclusionsPrevues: { aPublier: ['vinted'], exclues: [{ platform: 'leboncoin', motif: 'sans_adresse' }] },
  });
  const v = verdictConfirmation(m, 'fr', VOIE);
  ok(!v.rienNePart && v.titre === 'Partira sur Vinted', 'titre : ce qui part');
  ok(v.gravite === 'geste', 'ambre : une exclusion à lever');
  ok(v.lignes[0].startsWith('Leboncoin ne partira pas'), 'l\'exclusion nommée');
  ok(v.lignes.includes(VOIE), 'la voie, puisque quelque chose part');
}

console.log('Tout part');
{
  const m = base({ selected: new Set(['vinted', 'beebs']), exclusionsPrevues: { aPublier: ['vinted', 'beebs'], exclues: [] } });
  const v = verdictConfirmation(m, 'fr', VOIE);
  ok(v.gravite === 'info' && v.titre === 'Partira sur Vinted et Beebs', 'sarcelle, deux plateformes');
  ok(v.lignes.length === 1 && v.lignes[0] === VOIE, 'une seule ligne : comment ça part');
}

console.log('Seul un refus de la plateforme, rien à cocher');
{
  const m = base({
    platformListings: { platforms: { beebs: {} } },
    selected: new Set(['beebs']), platformSupport: { beebs: 'prohibited' },
    exclusionsPrevues: { aPublier: [], exclues: [{ platform: 'beebs', motif: 'interdite' }] },
  });
  const v = verdictConfirmation(m, 'fr');
  ok(v.rienNePart && v.gravite === 'refus', 'rouge : rien à débloquer');
  ok(v.lignes[0] === 'Beebs ne partira pas : la plateforme refuse ce produit.', 'le motif');
}

console.log('Anglais');
{
  const m = base({
    lockedSet: new Set(['opla']), queuedSet: new Set(['opla']), selected: new Set(['leboncoin']),
    lbcAdresseManquante: { plateformes: ['leboncoin'] },
    exclusionsPrevues: { aPublier: [], exclues: [{ platform: 'leboncoin', motif: 'sans_adresse' }] },
  });
  const v = verdictConfirmation(m, 'en');
  ok(v.titre === 'Nothing will go out for now', 'title');
  ok(v.lignes.includes('You can tick Vinted or Beebs.'), 'what can be ticked');
  ok(puceVerrouillee('opla', m, 'en').libelle === 'Under way', 'Opla badge « Under way »');
}

if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
console.log('\nconfirmation-verdict : tout est vert');
