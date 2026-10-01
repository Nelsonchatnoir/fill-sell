// Selftest — « Où publier ? » dit d'entrée quand rien ne peut partir (01/10).
//
//     node --import ./scripts/loader-ext.mjs scripts/publication-rien-a-publier-selftest.mjs
//
// Le cas réel : l'aspirateur robot de Nico (inventaire 1790420994622), en ligne
// sur Vinted, Leboncoin, eBay et Opla ; Beebs sans catégorie pour l'article.
// L'écran 1 doit le dire plateforme par plateforme et ne plus rien proposer de
// cocher — le bouton du pied, qui lit le MÊME bilan, devient « Retour au stock ».
import { bilanPlateformes, rienAPublier, etatPlateforme } from '../src/publication/plateformes.js';

let echecs = 0;
const ok = (cond, quoi) => { console.log(`  ${cond ? 'ok  ' : 'ÉCHEC'} ${quoi}`); if (!cond) echecs++; };

const base = (surcharge = {}) => ({
  plateformesAffichees: ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla'],
  plateformesAVenir: ['opla'], plateformesOuvertes: ['opla'],
  platformSupport: {}, categorieFermee: (s) => ['unavailable', 'prohibited'].includes(s ?? 'supported'),
  publishedSet: new Set(), queuedSet: new Set(), attentes: {}, oplaAccesDetail: null,
  ebayBloque: false, pausedPlatforms: [], selected: new Set(),
  ...surcharge,
});

console.log('Aspirateur de Nico : tout en ligne, Beebs sans catégorie');
{
  const m = base({ publishedSet: new Set(['vinted', 'leboncoin', 'ebay', 'opla']), platformSupport: { beebs: 'unavailable' }, selected: new Set(['vinted']) });
  const b = bilanPlateformes(m);
  ok(b.cochables.length === 0, 'aucune plateforme cochable');
  ok(b.cochees.length === 0, 'une case grisée restée dans `selected` ne compte pas comme cochée');
  const r = rienAPublier(b, 'fr');
  ok(r && r.titre === 'Rien à publier pour cet article', 'titre « Rien à publier pour cet article »');
  ok(r && r.lignes[0] === 'Déjà en ligne sur Vinted, Leboncoin, eBay et Opla.', 'une ligne nomme les quatre plateformes en ligne');
  ok(r && r.lignes.includes("Beebs n'a pas de catégorie pour cet article."), 'une ligne dit pourquoi Beebs ne peut pas');
  ok(r && !r.attendGeste, "ce n'est pas « pour l'instant » : rien à débloquer");
}

console.log('Une plateforme reste possible → aucun message, elle se coche');
{
  const m = base({ publishedSet: new Set(['vinted', 'leboncoin', 'ebay', 'opla']), selected: new Set(['beebs']) });
  const b = bilanPlateformes(m);
  ok(rienAPublier(b, 'fr') === null, 'pas de « rien à publier » quand Beebs est cochable');
  ok(b.cochees.length === 1 && b.cochees[0] === 'beebs', 'le bouton compte 1 plateforme');
}

console.log("Bloquée par un geste (compte eBay) → « pour l'instant », pas « rien »");
{
  const m = base({ publishedSet: new Set(['vinted', 'leboncoin', 'beebs', 'opla']), ebayBloque: true });
  const r = rienAPublier(bilanPlateformes(m), 'fr');
  ok(r && r.attendGeste && r.titre === "Rien ne peut partir pour l'instant", 'titre « pour l\'instant »');
  ok(r && r.lignes.some(l => l.startsWith('eBay attend un geste')), 'la ligne renvoie au geste d\'eBay');
}

console.log('Produit refusé, publication en cours, plateforme pas encore ouverte');
{
  const m = base({
    platformSupport: { leboncoin: 'prohibited' }, queuedSet: new Set(['vinted']),
    publishedSet: new Set(['beebs', 'ebay']), plateformesOuvertes: [],
  });
  const r = rienAPublier(bilanPlateformes(m), 'fr');
  ok(r && r.lignes.includes('Publication déjà en cours sur Vinted.'), 'en cours : nommée à part');
  ok(r && r.lignes.includes('Leboncoin refuse cet article.'), 'interdit : « refuse cet article »');
  ok(r && r.lignes.includes("Opla n'est pas encore ouverte."), 'pas encore ouverte : dite');
  ok(etatPlateforme('vinted', m).classe === 'fait', 'en cours = classe « fait »');
}

console.log('Anglais');
{
  const m = base({ publishedSet: new Set(['vinted', 'leboncoin', 'ebay', 'opla']), platformSupport: { beebs: 'unavailable' } });
  const r = rienAPublier(bilanPlateformes(m), 'en');
  ok(r && r.lignes[0] === 'Already online on Vinted, Leboncoin, eBay and Opla.', 'phrase anglaise');
}

if (echecs) { console.error(`\n${echecs} échec(s).`); process.exit(1); }
console.log('\n✅ « Rien à publier » se dit d\'entrée, plateforme par plateforme.');
