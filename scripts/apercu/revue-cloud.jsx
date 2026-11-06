/* Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la capture d'écran de RELECTURE de l'abonnement « FillSell Cloud » (06/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// La VRAIE feuille des formules (ConversionModal), ouverte sur l'offre Cloud, comme sur un iPhone
// (la capture injecte le pont natif iOS : MentionsAbonnement dit « compte Apple »). Le compte est un TÉMOIN
// (NICO_USER_ID, comme les comptes de relecture) : l'offre se montre sans toucher au drapeau. Faux client Supabase
// (vite-revue-cloud.config.mjs : aucune requête ne part), aucune donnée réelle.
//
//   node scripts/apercu/capture-revue-cloud.mjs
import ReactDOM from 'react-dom/client';
import ConversionModal from '../../src/components/ConversionModal';
import { NICO_USER_ID, chargerTemoinCloud } from '../../src/config/cloudOffer';
import { supabase } from '../../src/lib/supabase';
import '../../src/base.css';
import '../../src/App.redesign.css';

const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'fr';

window.__FIXTURE = {
  utilisateur: { id: NICO_USER_ID, email: 'apercu@fillsell.app' },
  tables: { profiles: [{ id: NICO_USER_ID, stripe_customer_id: null, beta_flags: { cloud: true } }], coin_config: [{ key: 'quota_annonces_free', value: 5 }] },
  rpc: {},
};
try { localStorage.clear(); } catch { /* rien */ }
// Comme l'App à la connexion : le drapeau témoin du compte, lu dans profiles.beta_flags.
await chargerTemoinCloud(supabase, NICO_USER_ID);

const rien = () => {};
ReactDOM.createRoot(document.getElementById('apercu')).render(
  <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
    <ConversionModal isOpen onClose={rien} onUpgrade={rien} trigger="cloud" lang={lang} userId={NICO_USER_ID}
      onCloudSeul={rien} />
  </div>,
);
