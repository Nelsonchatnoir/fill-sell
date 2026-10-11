/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la question « ISBN » du Blake & Mortimer de Morgane (12/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte la VRAIE modale « Compléter »
// (NeedsUserModal, StockTab.jsx) sur le job réel 2ac93181 (relu le 11/10
// 22:19) : ?vue=avant (message de la sonde, champ libre caché), ?vue=apres
// (question posée par handler-watch après lecture des photos), ?vue=refuse
// (Vinted a déjà refusé le livre sans ISBN : plus d'option « pas d'ISBN »).
//     node scripts/apercu/capture-question-isbn.mjs
import { createRoot } from 'react-dom/client';
import { NeedsUserModal } from '../../src/tabs/StockTab.jsx';
import { needsUserOuvrable } from '../../src/utils/shared.js';

const ISBN_ABSENT = "Ce livre n'a pas d'ISBN";
const base = {
  id: '2ac93181-ca2d-4ff6-80a2-abdb6852db25', platform: 'vinted', action: 'publish', status: 'needs_user',
  title: 'Blake & Mortimer - Le Mystère de la Grande Pyramide - Tome 1', inventaire_id: 1791747087652,
};
const avant = {
  ...base,
  error: "Vinted a refusé la publication : Merci d'entrer un numéro ISBN valide — l'annonce n'a PAS été créée. Champ exigé par Vinted : ISBN. À faire : renseigne « ISBN » dans la copie Vinted de l'app, puis relance la publication. [sonde réseau : /api/v2/item_upload/items → HTTP 400 · prix ENVOYÉ = 20 · réponse : {\"code\":99,\"message\":\"Erreurs trouvées\"…}]",
  platform_fields: { needs_user_source: 'champ_a_choisir', needsUserField: { target: { key: 'isbn', root: 'vintedAspects' }, platform: 'vinted', field_key: 'isbn', field_label: 'ISBN' } },
};
const aide = 'Au dos du livre, sous le code-barres, ou sur la page de copyright : 13 chiffres qui commencent par 978 ou 979.';
const apres = {
  ...base,
  error: "Vinted exige l'ISBN de ce livre, et il n'est lisible ni dans ton annonce ni sur tes photos. Saisis-le avec « ✋ Compléter » (au dos du livre, sous le code-barres, ou sur la page de copyright : 978… ou 979…), ou choisis « Ce livre n'a pas d'ISBN » : la publication repart d'elle-même. Rien n'a été mis en ligne sur Vinted.",
  platform_fields: { needs_user_source: 'champ_a_choisir', isbn_photos_lu: { photos: 4, isbn: null, motif: 'non_lu' }, needsUserField: { target: { key: 'isbn', root: 'vintedAspects' }, platform: 'vinted', field_key: 'isbn', field_label: 'ISBN', input_type: null, allowed_values: [ISBN_ABSENT], aide } },
};
const refuse = {
  ...apres,
  error: "Vinted a refusé ce livre sans ISBN : il ne peut partir sur Vinted qu'avec son numéro ISBN (au dos du livre, sous le code-barres, ou sur la page de copyright). Saisis-le avec « ✋ Compléter » et la publication repart d'elle-même — ou annule la publication Vinted de cet article : les autres plateformes ne sont pas touchées. Rien n'a été mis en ligne sur Vinted.",
  platform_fields: { ...apres.platform_fields, vintedAspects: { isbn: ISBN_ABSENT }, needsUserField: { ...apres.platform_fields.needsUserField, allowed_values: [] } },
};
const vue = new URLSearchParams(location.search).get('vue');
const job = vue === 'apres' ? apres : vue === 'refuse' ? refuse : avant;

function Apercu() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 12 }}>
      <div data-surface="message" style={{ background: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, fontSize: 13 }}>{job.error}</div>
      <div data-ouvrable={String(needsUserOuvrable(job))} style={{ fontSize: 12, marginBottom: 8 }}>bouton « Compléter » {needsUserOuvrable(job) ? 'présent' : 'ABSENT'}</div>
      <NeedsUserModal job={job} lang="fr" onClose={() => {}} onDone={() => {}} />
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
