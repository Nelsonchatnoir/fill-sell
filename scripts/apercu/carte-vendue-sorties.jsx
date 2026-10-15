/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la carte « Vendue » et ses sorties (15/10, P1-0 : Louis, Tech-t)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le VRAI composant de « À régler »
// (QuestionsPlusEnLigne) sur trois jobs recopiés de la prod (14/10) :
//   · Tech-t, Swatch : « vendu » sur une fiche DÉJÀ vendue (vente saisie) ;
//   · Louis, 12 adaptateurs Vert : « vendu » sur une fiche en stock (9 996) ;
//   · Louis, Rangement gris : annonce plus vue en ligne depuis le 07/10.
//     node scripts/apercu/capture-carte-vendue-sorties.mjs
import { createRoot } from 'react-dom/client';
import QuestionsPlusEnLigne from '../../src/components/QuestionsPlusEnLigne.jsx';

const fiches = {
  1791399842798: { id: 1791399842798, title: 'Montre Swatch', statut: 'vendu', prix_achat: 5, sell: 25 },
  1789898202878: { id: 1789898202878, title: '12 adaptateurs Vert', statut: 'stock', quantite: 9996, prix_achat: 1, sell: 7 },
  1790501874516: { id: 1790501874516, title: 'Rangement Gris', statut: 'stock', quantite: 9997, prix_achat: 2, sell: 9 },
};
const questions = [
  { job: { id: '1d86f55d', platform: 'vinted', title: 'Montre Swatch', price: 25, inventaire_id: 1791399842798,
      platform_fields: { sale_signal: 'sold', unavailable_since: '2026-10-11T09:28:00Z' } }, q: { masquee: false, proposition: null } },
  { job: { id: 'd7b3b535', platform: 'vinted', title: '12 adaptateurs Vert', price: 7, inventaire_id: 1789898202878,
      platform_fields: { sale_signal: 'sold', unavailable_since: '2026-10-14T18:20:19.349Z' } }, q: { masquee: false, proposition: null } },
  { job: { id: '07bc4850', platform: 'vinted', title: 'Rangement Gris', price: 9, inventaire_id: 1790501874516,
      platform_fields: { sale_signal: 'unavailable', unavailable_since: '2026-10-07T07:16:51.813Z' } }, q: { masquee: false, proposition: null, forcee: true } },
];
const rien = () => {};
function Apercu() {
  return (
    <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <QuestionsPlusEnLigne lang="fr" currency="EUR" questions={questions}
        salePriceDraft={{}} setSalePriceDraft={rien} buyPriceDraft={{}} setBuyPriceDraft={rien}
        ficheDuJob={(j) => fiches[j.inventaire_id] ?? null}
        onOuvrirRevue={rien} onAccepterProposition={rien} onRefuserProposition={rien} onConfirmerVente={rien}
        onRetiree={rien} onReporter={rien} onMasquer={rien} onPrixAchatInconnu={rien} onBasculerMasquees={rien}
        onReafficherPlateforme={rien} onPasVendue={rien} onDejaEnregistree={rien} />
    </div>
  );
}
createRoot(document.getElementById('apercu')).render(<Apercu />);
