// `npm run selftest:ebay-porte-publication`
//
// La publication eBay possède deux voies et deux preuves distinctes. Ce test
// refuse toute régression qui laisserait créer un job avant que la voie choisie
// soit réellement prête, ou qui prendrait l'OAuth API pour une session Chrome.
import { portePublicationEbay } from '../src/utils/ebayCompte.js';

let echecs = 0;
const verifier = (nom, entree, attendu) => {
  const obtenu = portePublicationEbay(entree);
  const ok = Object.entries(attendu).every(([cle, valeur]) => obtenu[cle] === valeur);
  if (ok) console.log(`  ✓ ${nom}`);
  else {
    echecs += 1;
    console.log(`  ✗ ${nom}\n      attendu ${JSON.stringify(attendu)}\n      obtenu  ${JSON.stringify(obtenu)}`);
  }
};

console.log('\n1. Voie API — OAuth, politiques et état vendeur font foi');
verifier('lecture pas encore rendue : aucun job',
  { voieApi: true, etatApiLu: false },
  { bloque: true, pret: false, voie: 'api', motif: 'verification' });
verifier('compte non relié : réglages',
  { voieApi: true, etatApiLu: true, etatApi: { connecte: false } },
  { bloque: true, pret: false, motif: 'non_connecte', geste: 'reglages' });
verifier('OAuth relié mais politiques absentes : aucun job',
  { voieApi: true, etatApiLu: true, etatApi: { connecte: true, politiques: {}, seller_state: { bloque_par_etat_ebay: false } } },
  { bloque: true, pret: false, motif: 'a_finir', geste: 'reglages' });
verifier('politiques présentes mais vendeur bloqué : aucun job',
  { voieApi: true, etatApiLu: true, etatApi: { connecte: true, politiques: { fulfillment: 'f', payment: 'p', return: 'r' }, seller_state: { bloque_par_etat_ebay: true } } },
  { bloque: true, pret: false, motif: 'a_finir', geste: 'reglages' });
verifier('compte API entièrement prêt : publication autorisée',
  { voieApi: true, etatApiLu: true, etatApi: { connecte: true, politiques: { fulfillment: 'f', payment: 'p', return: 'r' }, seller_state: { bloque_par_etat_ebay: false } } },
  { bloque: false, pret: true, voie: 'api', motif: null });

console.log('\n2. Voie extension — seule une preuve du navigateur vaut');
verifier('vérité pas encore lue : aucun job',
  { voieApi: false, verite: null },
  { bloque: true, pret: false, motif: 'verification', geste: 'verifier_vendeur' });
verifier('OAuth seul ne prouve jamais Chrome',
  { voieApi: false, verite: { etat: 'connectee', source: 'api' } },
  { bloque: true, pret: false, motif: 'a_verifier', geste: 'verifier_vendeur' });
for (const source of ['sonde', 'releve', 'depot']) {
  verifier(`preuve navigateur ${source} : publication autorisée`,
    { voieApi: false, verite: { etat: 'connectee', source } },
    { bloque: false, pret: true, voie: 'extension', motif: null });
}
verifier('compte vendeur inactif : bouton vendeur direct',
  { voieApi: false, verite: { etat: 'a_connecter', source: 'sonde', mur: 'upgrade' } },
  { bloque: true, pret: false, motif: 'vendeur_inactif', geste: 'vendeur' });
verifier('reconnexion de sécurité : bouton direct',
  { voieApi: false, verite: { etat: 'a_connecter', source: 'sonde', mur: 'reauth' } },
  { bloque: true, pret: false, motif: 'a_reconnecter', geste: 'reauth' });
verifier('session fermée : connexion directe',
  { voieApi: false, verite: { etat: 'a_connecter', source: 'sonde' } },
  { bloque: true, pret: false, motif: 'non_connecte', geste: 'connexion' });
verifier('preuve périmée : nouvelle vérification obligatoire',
  { voieApi: false, verite: { etat: 'a_verifier', source: 'depot', motif: 'preuve_perimee' } },
  { bloque: true, pret: false, motif: 'a_verifier', geste: 'verifier_vendeur' });
verifier('plateforme écartée : réglages, jamais un job',
  { voieApi: false, verite: { etat: 'ecartee', source: 'utilisateur' } },
  { bloque: true, pret: false, motif: 'ecartee', geste: 'reglages' });

if (echecs) {
  console.error(`\n❌ porte eBay : ${echecs} vérification(s) en défaut`);
  process.exit(1);
}
console.log('\n✅ porte eBay : les deux voies restent séparées et aucun job ne naît sans preuve');
