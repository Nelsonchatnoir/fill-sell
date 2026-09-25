// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — ce que l'écran « Annonces à rattacher » propose, et ce qu'il cache
// (2026-09-26, labouquinerie85)
// ═══════════════════════════════════════════════════════════════════════════
// 1. Plus jamais « Le plus probable » sur quelques mots communs : les deux
//    rattachements faux du 25/09 23:28 ne sont plus proposés du tout.
// 2. Pour un livre : titre quasi exact ou même ISBN, sinon aucune suggestion.
// 3. Ce qui tenait debout avant tient toujours (titre exact, pluriel, ordre des
//    mots, proposition du serveur sur titre exact, inclusion hors livre).
// 4. Une annonce que FillSell a retirée (retrait demandé, en cours ou abouti
//    depuis qu'on l'a vue) sort de la file ; revue depuis, elle y revient.
// Lancer : npm run selftest:candidats-rattachement
import { classerCandidats, titresQuasiExacts, titreJetons, isbnsDe, estUnLivre } from '../src/annonces/candidats.js';
import { listingDesigne, indexerRetraits, annonceRetiree } from '../src/annonces/retraits.js';

let ok = 0;
let ko = 0;
function verifie(nom, cond, detail = '') {
  if (cond) { ok += 1; console.log(`  ✓ ${nom}`); }
  else { ko += 1; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`); }
}

// Le stock de labouquinerie85, en extrait (titres et prix réels du 26/09).
const stock = [
  { id: 1790234455410004, title: 'Les plus beaux poèmes de la langue française', sell: 9, statut: 'stock' },
  { id: 1790234467835004, title: 'SNSM les sauveteurs en mer', sell: 30, statut: 'stock' },
  { id: 1790234445867007, title: 'SNSM les sauveteurs en mer', sell: 24, statut: 'stock' },
  { id: 1790234488899002, title: 'Cent poèmes de la mer', sell: null, statut: 'vendu' },
  { id: 1790234435675005, title: '36 papas', sell: 4, statut: 'stock' },
  { id: 1790234434995005, title: 'Ils sont devenus français', sell: 10, statut: 'stock' },
  { id: 1790234444747004, title: 'Les aristochats', sell: 3, statut: 'stock' },
  { id: 1790234444355004, title: 'Les sept nains et la mine de diamants', sell: 6, statut: 'stock' },
  { id: 9001, title: 'Robe Zara fleurie taille M', sell: 12, statut: 'stock' },
  { id: 9002, title: 'Une deux trois princesses tome 3', sell: 5, statut: 'stock' },
  { id: 9003, title: 'Le Petit Prince', sell: 6, statut: 'stock', description: 'Folio, ISBN 978-2-07-061275-8, bon état' },
];

console.log('\n1. Les deux faux rattachements du 25/09 ne sont plus proposés');
{
  const c = classerCandidats({ titre: 'Les plus belles pages de la poésie française', prix: 10, url: 'https://www.opla.co/product/art_ce91047f9955b194473c840eb6d435c6' }, stock);
  verifie('« Les plus belles pages… » : aucun candidat', c.length === 0, JSON.stringify(c.map((x) => x.item.title)));
}
{
  const c = classerCandidats({ titre: 'Cent poèmes de la mer', prix: 10, url: 'https://www.opla.co/product/art_1b7d838063f48c7cf05fd0f90bbe1322' }, stock);
  verifie('« Cent poèmes de la mer » : ni SNSM, ni la fiche vendue', c.length === 0, JSON.stringify(c.map((x) => x.item.title)));
}
{
  const c = classerCandidats({ titre: 'Les plus belles pages de la poésie française', prix: 10, url: 'https://www.leboncoin.fr/ad/livres/3262035696' }, stock);
  verifie('même annonce côté Leboncoin (catégorie livres) : aucun candidat', c.length === 0);
}

console.log('\n2. Un livre : titre quasi exact ou ISBN, sinon rien');
{
  const c = classerCandidats({ titre: 'Les plus beaux poèmes de la langue française', prix: 9 }, stock);
  verifie('titre identique → proposé, badge permis', c.length === 1 && c[0].item.id === 1790234455410004 && c[0].fort === true);
}
{
  const c = classerCandidats({ titre: 'Les Plus Beaux Poèmes de la Langue Française !', prix: 12 }, stock);
  verifie('casse, accents, ponctuation → quasi exact', c.length === 1 && c[0].source === 'quasi' && c[0].fort);
}
{
  const c = classerCandidats({ titre: 'Le Petit Prince — Saint-Exupéry 9782070612758', prix: 6, url: 'https://www.leboncoin.fr/ad/livres/1' }, stock);
  verifie('même ISBN, titre différent → proposé par l\'ISBN', c.length === 1 && c[0].source === 'isbn' && c[0].fort);
}
{
  const c = classerCandidats({ titre: 'Une deux trois princesses tome 3 l\'invité fantôme', prix: 5, url: 'https://www.leboncoin.fr/ad/livres/2' }, stock);
  verifie('livre : un titre contenu dans l\'autre n\'est PAS proposé', c.length === 0, JSON.stringify(c.map((x) => x.source)));
}
{
  const c = classerCandidats({
    titre: 'Les sept nains', prix: 3, url: 'https://www.leboncoin.fr/ad/livres/3',
    proposition: { inventaire_id: 1790234444355004, motif: 'titre_inclus' },
  }, stock);
  verifie('livre : une proposition serveur « titre inclus » n\'est plus montrée', c.length === 0);
}
{
  const c = classerCandidats({
    titre: 'Les plus beaux poèmes d\'amour', prix: 9,
    proposition: { inventaire_id: 1790234455410004, motif: 'faisceau' },
  }, stock);
  verifie('hors livre détectable : proposition serveur « faisceau » montrée SANS badge', c.length === 1 && c[0].source === 'serveur' && c[0].fort === false);
}

console.log('\n3. Ce qui tenait debout tient toujours');
{
  const c = classerCandidats({ titre: 'Les aristochat', prix: 3 }, stock);
  verifie('pluriel → quasi exact', c.length === 1 && c[0].item.id === 1790234444747004);
}
{
  const c = classerCandidats({ titre: 'Robe fleurie Zara', prix: 12 }, stock);
  verifie('mots dans un autre ordre, « taille M » mis à part → quasi exact', c.length === 1 && c[0].item.id === 9001 && c[0].fort);
}
{
  const c = classerCandidats({ titre: 'SNSM les sauveteurs en mer', prix: 23, proposition: { inventaire_id: 1790234467835004, motif: 'plusieurs_candidats' } }, stock);
  verifie('proposition serveur sur titre exact → en tête, badge permis, l\'homonyme suit', c.length === 2 && c[0].source === 'serveur' && c[0].fort && c[1].item.id === 1790234445867007);
}
{
  const c = classerCandidats({ titre: 'Une deux trois princesses tome 3 l\'invité fantôme', prix: 5 }, stock);
  verifie('hors livre détectable : l\'inclusion (jumeau du 20/09) reste proposée, sans badge', c.length === 1 && c[0].source === 'jumeau' && c[0].fort === false);
}
{
  const c = classerCandidats({ titre: 'Cent poèmes de la mer', prix: 10, proposition: { inventaire_id: 1790234488899002, motif: 'homonyme_vendu' } }, stock);
  verifie('homonyme VENDU : jamais proposé au rattachement', c.length === 0);
}
{
  const c = classerCandidats({ titre: 'Pull rouge', prix: 10 }, stock);
  verifie('rien de ressemblant → liste vide (la recherche libre prend le relais)', c.length === 0);
}

console.log('\n4. Mots qui comptent, ISBN, livre');
verifie('titreJetons : mots vides et pluriels', [...titreJetons('Les aristochats pour enfants')].sort().join(',') === 'aristochat,enfant');
verifie('titreJetons : « années 80 » → 1980, « 90s » → 1990', titreJetons('Robe années 80').has('1980') && titreJetons('Jean 90s').has('1990'));
verifie('quasi exact : deux livres différents ne le sont pas', !titresQuasiExacts('Les plus belles pages de la poésie française', 'Les plus beaux poèmes de la langue française'));
verifie('ISBN-13 avec tirets', isbnsDe('ISBN 978-2-07-061275-8').has('9782070612758'));
verifie('ISBN-10 annoncé', isbnsDe('isbn: 2-07-061275-X').has('207061275X'));
verifie('livre : catégorie Leboncoin dans l\'URL', estUnLivre({ url: 'https://www.leboncoin.fr/ad/livres/3262035014' }, {}));
verifie('livre : type de fiche', estUnLivre({}, { type: 'Livres' }));
verifie('pas un livre : « Hebdomadaire » ne passe pas pour « bd »', !estUnLivre({}, { type: 'Hebdomadaire' }));

console.log('\n5. Une annonce que FillSell a retirée sort de la file');
verifie('désignation : identifiant vide ne désigne rien', !listingDesigne('', 'https://www.leboncoin.fr/ad/livres/3262035696'));
verifie('désignation : préfixe numérique ne désigne pas', !listingDesigne('326203569', 'https://www.leboncoin.fr/ad/livres/3262035696'));
verifie('désignation : Leboncoin par URL', listingDesigne('3262035696', 'https://www.leboncoin.fr/ad/livres/3262035696'));
verifie('désignation : Opla par URL', listingDesigne('art_ce91047f9955b194473c840eb6d435c6', 'https://www.opla.co/product/art_ce91047f9955b194473c840eb6d435c6'));
{
  const idx = indexerRetraits([
    { platform: 'leboncoin', listing_url: 'https://www.leboncoin.fr/ad/livres/3262035696', platform_listing_id: null, created_at: '2026-09-25T20:43:00Z' },
    { platform: 'opla', listing_url: 'https://www.opla.co/product/art_ce91047f9955b194473c840eb6d435c6', platform_listing_id: null, created_at: '2026-09-25T20:43:00Z' },
  ]);
  verifie('LBC retirée après sa dernière lecture → hors de la file',
    annonceRetiree({ platform: 'leboncoin', listing_id: '3262035696', vu_le: '2026-09-25T17:12:01Z' }, idx));
  verifie('Opla retirée après sa dernière lecture → hors de la file',
    annonceRetiree({ platform: 'opla', listing_id: 'art_ce91047f9955b194473c840eb6d435c6', vu_le: '2026-09-25T17:21:04Z' }, idx));
  verifie('revue par un relevé APRÈS le retrait → le relevé a raison, elle reste',
    !annonceRetiree({ platform: 'leboncoin', listing_id: '3262035696', vu_le: '2026-09-26T08:00:00Z' }, idx));
  verifie('autre plateforme, même identifiant → pas concernée',
    !annonceRetiree({ platform: 'beebs', listing_id: '3262035696', vu_le: '2026-09-25T17:12:01Z' }, idx));
  verifie('autre annonce → pas concernée',
    !annonceRetiree({ platform: 'leboncoin', listing_id: '3262061277', vu_le: '2026-09-25T17:12:01Z' }, idx));
  verifie('index vide → rien ne sort de la file', !annonceRetiree({ platform: 'leboncoin', listing_id: '3262035696' }, indexerRetraits([])));
}

console.log(`\n${ok} ok, ${ko} ko`);
if (ko) process.exit(1);
