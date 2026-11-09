// ══════════════════════════════════════════════════════════════════════════
// APERÇU — les carrés des jauges au tap, dans la VRAIE feuille des offres et dans « Ton plan » (09/11/2026)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (capture-jauges-offres.mjs). Faux client Supabase (aucun réseau, écritures
// refusées), grille à 3 jauges ALLUMÉE avec les volumes posés en base le 04/11 (comme en prod), Cloud ouvert.
//   ?vue=offres|plan · ?palier=free|premium|pro|business · ?lang=fr|en
//   vue=offres : ConversionModal (la feuille « Vends plus, en faisant moins ») du palier ;
//   vue=plan   : PlanDetailsModal (« Ton plan ») du palier (premium, pro ou business).
import React from 'react';
import ReactDOM from 'react-dom/client';
import ConversionModal from '../../src/components/ConversionModal';
import PlanDetailsModal from '../../src/components/PlanDetailsModal';
import { lireInterrupteurs } from '../../src/config/interrupteurs';
import { noterBinaireCloud } from '../../src/config/cloudOffer';
import { droitsDuPalier } from '../../src/utils/palier';
import { supabase } from '../../src/lib/supabase';
import '../../src/base.css';
import '../../src/App.redesign.css';

const UID = 'apercu-jauges-0000';
const p = new URLSearchParams(location.search);
const lang = p.get('lang') === 'en' ? 'en' : 'fr';
const vue = p.get('vue') === 'plan' ? 'plan' : 'offres';
const palier = ['free', 'premium', 'pro', 'business'].includes(p.get('palier')) ? p.get('palier') : 'free';
const DRAPEAUX = { free: {}, premium: { is_premium: true }, pro: { is_premium: true, is_pro: true }, business: { is_premium: true, is_pro: true, is_business: true } };
// Les volumes de la migration 20261104000000_trois_jauges_interrupteur (0 = illimité), interrupteur à 1.
const JAUGES_EN_BASE = {
  grille_trois_jauges: 1,
  jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0,
  jauge_lens_business: 600, quota_annonces_free: 5,
};
window.__FIXTURE = {
  utilisateur: { id: UID, email: 'apercu@fillsell.app' },
  tables: {
    profiles: [{ id: UID, stripe_customer_id: null, ...DRAPEAUX[palier] }],
    coin_config: [{ key: 'cloud_offre_ouverte', value: 1 }, ...Object.entries(JAUGES_EN_BASE).map(([key, value]) => ({ key, value }))],
  },
  rpc: { cloud_disponibilite_moi: { vente_possible: true, raison: null, places: 5, attente: {} } },
};
try { localStorage.clear(); } catch { /* rien */ }
window.__gestes = [];
const geste = (nom) => (...a) => { window.__gestes.push({ nom, a: a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))) }); };

await lireInterrupteurs(supabase);
await noterBinaireCloud('web', 'web');
const droits = droitsDuPalier(palier === 'free' ? 'gratuit' : palier);

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
    {vue === 'plan' ? (
      <PlanDetailsModal
        lang={lang} onClose={geste('fermer')} supabase={supabase} userId={UID}
        isPro={palier === 'pro' || palier === 'business'} isBusiness={palier === 'business'}
        onUpgradePro={geste('upgradePro')} onUpgradeBusiness={geste('upgradeBusiness')}
      />
    ) : (
      <ConversionModal
        isOpen onClose={geste('fermer')} onUpgrade={geste('upgrade')}
        onAjouterCloud={geste('ajouterCloud')} onCloudSeul={geste('cloudSeul')}
        trigger="generic" lang={lang} userId={UID} {...droits}
      />
    )}
  </div>,
);
