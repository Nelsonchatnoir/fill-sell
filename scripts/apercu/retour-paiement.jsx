// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la page /cancel (retour de Stripe) pour chaque cause de refus (01/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte la VRAIE page src/pages/Cancel.jsx ;
// l'appel « diagnostic » à create-checkout-session est SIMULÉ ici (fetch
// remplacé avant le montage) : aucun appel réel, aucun compte, aucun paiement.
//
//   vite, puis /scripts/apercu/retour-paiement.html?cause=authentification
//   (authentification | radar | klarna | banque | autre | payee | aucune_tentative)
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const cause = new URLSearchParams(location.search).get('cause') || 'authentification';
const vraiFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(typeof input === 'string' ? input : input?.url);
  if (url.includes('/functions/v1/create-checkout-session')) {
    let corps = {}; try { corps = JSON.parse(init?.body ?? '{}'); } catch { /* corps illisible */ }
    console.log('[apercu] create-checkout-session', JSON.stringify(corps));
    const reponse = corps.action === 'diagnostic' ? { cause, plan: 'pro' } : { url: '#page-stripe-simulee' };
    return new Response(JSON.stringify(reponse), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return vraiFetch(input, init);
};
history.replaceState(null, '', `${location.pathname}?cause=${cause}&session_id=cs_test_apercu`);
const { default: Cancel } = await import('../../src/pages/Cancel.jsx');
createRoot(document.getElementById('apercu')).render(<MemoryRouter><Cancel /></MemoryRouter>);
