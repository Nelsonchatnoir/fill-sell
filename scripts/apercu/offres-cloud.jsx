// ══════════════════════════════════════════════════════════════════════════
// APERÇU — la VRAIE feuille des offres (ConversionModal), Cloud OUVERT, par palier (08/11/2026 soir, C1 et C3)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Faux client Supabase (aucun réseau, écritures refusées) : l'interrupteur
// cloud_offre_ouverte = 1 et le binaire « web » sont posés comme au démarrage de l'app ; le pays vient du fuseau du
// navigateur de test (Europe/Paris). L'état Cloud du compte est lu par la vraie requête (useCloudProfil).
//   ?palier=free|premium|pro|business · ?cloud=aucun|essai_pris|actif · ?trigger=generic|cloud · ?grille=1 · ?lang=fr|en
import React from 'react';
import ReactDOM from 'react-dom/client';
import ConversionModal from '../../src/components/ConversionModal';
import { lireInterrupteurs } from '../../src/config/interrupteurs';
import { noterBinaireCloud } from '../../src/config/cloudOffer';
import { droitsDuPalier } from '../../src/utils/palier';
import { supabase } from '../../src/lib/supabase';
import '../../src/base.css';
import '../../src/App.redesign.css';

const UID = 'apercu-offres-0000';
const p = new URLSearchParams(location.search);
const lang = p.get('lang') === 'en' ? 'en' : 'fr';
const palier = ['free', 'premium', 'pro', 'business'].includes(p.get('palier')) ? p.get('palier') : 'free';
const DRAPEAUX = { free: {}, premium: { is_premium: true }, pro: { is_premium: true, is_pro: true }, business: { is_premium: true, is_pro: true, is_business: true } };
const now = Date.now();
const CLOUD = {
  aucun: {},
  essai_pris: { cloud_essai_debut: new Date(now - 20 * 86400000).toISOString(), cloud_essai_fin: new Date(now - 13 * 86400000).toISOString() },
  actif: { is_cloud: true, cloud_periode_fin: new Date(now + 21 * 86400000).toISOString(), cloud_canal: 'stripe' },
};
const grille = p.get('grille') === '1';
window.__FIXTURE = {
  utilisateur: { id: UID, email: 'apercu@fillsell.app' },
  tables: {
    profiles: [{ id: UID, stripe_customer_id: null, ...DRAPEAUX[palier], ...(CLOUD[p.get('cloud')] ?? {}) }],
    coin_config: [
      { key: 'cloud_offre_ouverte', value: 1 }, { key: 'quota_annonces_free', value: 5 },
      ...(grille ? [{ key: 'grille_trois_jauges', value: 1 }] : []),
    ],
  },
  rpc: { cloud_disponibilite_moi: { vente_possible: true, raison: null, places: 5, attente: {} } },
};
try { localStorage.clear(); } catch { /* rien */ }
window.__gestes = [];
const geste = (nom) => (...a) => { window.__gestes.push({ nom, a: a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)) }); };

await lireInterrupteurs(supabase);
await noterBinaireCloud('web', 'web');
const droits = droitsDuPalier(palier === 'free' ? 'gratuit' : palier);

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
    <ConversionModal
      isOpen onClose={geste('fermer')} onUpgrade={geste('upgrade')}
      onAjouterCloud={geste('ajouterCloud')} onCloudSeul={geste('cloudSeul')}
      trigger={p.get('trigger') || 'generic'} lang={lang} userId={UID} {...droits} grille={grille}
    />
  </div>,
);
