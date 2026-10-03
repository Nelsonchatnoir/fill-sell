// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la question « Marque » hors catalogue Vinted, sans session (03/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte la VRAIE modale « Compléter »
// (NeedsUserModal, StockTab.jsx) sur une question telle que la pose la 0.6.94
// (marque « Bonobo », relevé du catalogue Vinted). Aucun compte, aucune
// écriture : aucun choix n'est cliqué.
//
//     node scripts/apercu/capture-question-marque.mjs
import { createRoot } from 'react-dom/client';
import { NeedsUserModal } from '../../src/tabs/StockTab.jsx';

const job = {
  id: '00000000-0000-4000-8000-000000000001', platform: 'vinted', action: 'publish', status: 'needs_user',
  title: 'Pull rayé crème et noir taille L', inventaire_id: 1,
  error: "Vinted ne connaît pas la marque « Bonobo » et ne permet plus d'en créer une nouvelle.",
  platform_fields: {
    marque: 'Bonobo',
    needsUserField: {
      platform: 'vinted', field_key: 'brand', field_label: 'Marque', input_type: 'list_search',
      allowed_values: ['Sans marque', 'Bonobo Jeans', 'Bonobos', 'Bonpoint', 'Bonton'],
      target: { key: 'marque' }, raison: 'marque_hors_catalogue', demandee: 'Bonobo',
    },
  },
};

createRoot(document.getElementById('apercu')).render(
  <div style={{ fontFamily: 'system-ui, sans-serif', padding: 12 }}>
    <NeedsUserModal job={job} lang="fr" onClose={() => {}} onDone={() => {}} />
  </div>,
);
