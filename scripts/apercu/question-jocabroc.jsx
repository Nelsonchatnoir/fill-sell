// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la question eBay de Jocabroc (job 80d0704f), sans session (25/09)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte la VRAIE modale « Compléter »
// (NeedsUserModal, StockTab.jsx) sur la ligne réelle du job, et les VRAIS
// libellés de la liste « à compléter » (champManquant) et de la fiche / du
// stepper (natureAttente). Aucun compte, aucune écriture : la validation n'est
// pas cliquée.
//
//     node scripts/apercu/capture-question-jocabroc.mjs
import { createRoot } from 'react-dom/client';
import { NeedsUserModal } from '../../src/tabs/StockTab.jsx';
import { champManquant } from '../../src/utils/stockFiltres.js';
import { natureAttente } from '../../src/utils/etatsPublication.js';

const job = {
  id: '80d0704f-d32f-4eda-b506-a80f0f18364c', platform: 'ebay', action: 'publish', status: 'needs_user',
  title: 'Panier décoratif vintage Walther', inventaire_id: 1789908553177004,
  error: "eBay a besoin de ces informations pour publier l'article : Hauteur, Largeur, Longueur. Complète-les depuis la fiche de l'article (bouton « ✋ Compléter ») : la publication repart d'elle-même.",
  platform_fields: {
    ebayCategoryId: '125072',
    needsUserField: { target: { key: 'Hauteur', root: 'ebayAspects' }, platform: 'ebay', field_key: 'Hauteur', field_label: 'Hauteur' },
    needsUserFields: [
      { target: { key: 'Largeur', root: 'ebayAspects' }, platform: 'ebay', field_key: 'Largeur', field_label: 'Largeur' },
      { target: { key: 'Longueur', root: 'ebayAspects' }, platform: 'ebay', field_key: 'Longueur', field_label: 'Longueur' },
    ],
  },
};

function Apercu() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 12 }}>
      <div data-surface="liste" style={{ background: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, fontSize: 13 }}>
        <b>Liste « à compléter » :</b> <span data-libelle="liste">eBay : il manque {champManquant(job)}</span>
      </div>
      <div data-surface="fiche" style={{ background: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, fontSize: 13 }}>
        <b>Fiche / stepper :</b> <span data-libelle="fiche">Compléter « {natureAttente(job).champ} »</span>
      </div>
      <NeedsUserModal job={job} lang="fr" onClose={() => {}} onDone={() => {}} />
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
