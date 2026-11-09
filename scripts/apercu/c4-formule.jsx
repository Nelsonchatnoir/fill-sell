// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — C4 « Voir les autres formules » et descendre à la fin de la période (09/11/2026 nuit)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Le VRAI bloc (src/reglages/BlocChangerFormule.jsx), l'interrupteur OUVERT POUR
// L'APERÇU SEULEMENT (en prod : fermé, coin_config.descente_formule_ouverte absente), faux client Supabase, et les
// réponses de changer-formule SIMULÉES (la fonction n'est pas déployée) :
//   ?formule=pro|business · ?prevue=premium|pro (un changement déjà programmé) · ?refus=<code> · ?lang=fr|en
import React from 'react';
import ReactDOM from 'react-dom/client';
import BlocChangerFormule from '../../src/reglages/BlocChangerFormule';
import { _remettreAZero } from '../../src/config/interrupteurs';
import { CSS_REGLAGES } from '../../src/reglages/theme';
import '../../src/base.css';
import '../../src/App.redesign.css';

const p = new URLSearchParams(location.search);
const lang = p.get('lang') === 'en' ? 'en' : 'fr';
const formule = p.get('formule') === 'business' ? 'business' : 'pro';
const FIN = '2026-12-09T00:31:18.000Z';
window.__FIXTURE = { utilisateur: { id: 'apercu-c4', email: 'apercu@fillsell.app' }, tables: { profiles: [{ id: 'apercu-c4' }] }, rpc: {} };
_remettreAZero({ descente_formule_ouverte: 1 });
window.__appels = [];
let prevue = p.get('prevue') ? { formule: p.get('prevue'), le: FIN } : null;
const etat = () => ({ canal: 'stripe', disponible: true, actuelle: formule, fin_periode: FIN, arret_prevu: false,
  possibles: formule === 'business' ? ['premium', 'pro'] : ['premium'], prevue });
const vraiFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (!String(url).includes('/functions/v1/changer-formule')) return vraiFetch(url, init);
  const corps = JSON.parse(init?.body ?? '{}');
  window.__appels.push(corps);
  await new Promise((r) => setTimeout(r, 150));
  if (corps.action === 'programmer' && p.get('refus')) return new Response(JSON.stringify({ ...etat(), error: p.get('refus') }), { status: 409 });
  if (corps.action === 'programmer') prevue = { formule: corps.vers, le: FIN };
  if (corps.action === 'annuler') prevue = null;
  return new Response(JSON.stringify(etat()), { status: 200 });
};
const c = { lang, natif: false, isPremium: true, isPro: true, isBusiness: formule === 'business', resiliation: { resilie: false }, user: { id: 'apercu-c4' } };

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <div className="app-root" style={{ minHeight: '100vh', background: '#EDEAE0' }}>
    {/* La feuille de style des Réglages, injectée par le vrai écran (ReglagesUI.jsx) : lignes de 44 px et plus. */}
    <style>{CSS_REGLAGES}</style>
    <div style={{ padding: '18px 16px', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div data-temoin-formule style={{ background: '#fff', border: '1px solid #E7E3D8', borderRadius: 16, padding: 18, fontFamily: "'Space Grotesk', sans-serif" }}>
        {formule === 'business' ? 'Business' : 'Pro'} · {lang === 'en' ? 'Subscription active.' : 'Abonnement actif.'}
      </div>
      <BlocChangerFormule c={c} clientStripe="cus_apercu" />
    </div>
  </div>,
);
