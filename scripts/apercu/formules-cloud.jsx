/* eslint-disable react-refresh/only-export-components -- point d'entrée d'aperçu, jamais livré */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — LES ÉCRANS DES FORMULES AVEC CLOUD (11/11/2026), en mode DÉMONSTRATION
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Les VRAIS composants de l'app (fenêtre d'offres, étapes du parcours d'entrée,
// Réglages › Abonnement, rappel avant débit), un compte de DÉMONSTRATION (aucune donnée client), un faux client Supabase
// (vite-formules-cloud.config.mjs : aucune requête ne part, écritures refusées). Le compte est un TÉMOIN
// (profiles.beta_flags.cloud) : les formules se montrent sans toucher aux interrupteurs.
//   ?ecran= offres-sans | offres-avec | offres-avec-pro | entree-ordinateur | entree-extension | entree-presentation
//           | entree-offres | entree-essai | reglages-pro | fin-essai | rappel-jourj
//   ?lang=fr|en · ?prix=boutique (prix de boutique SIMULÉS, comme l'App Store les donnerait — la capture injecte le pont
//   natif iOS : les mentions disent « compte Apple »)
//     node scripts/apercu/capture-formules-cloud.mjs
import ReactDOM from 'react-dom/client';
import ConversionModal from '../../src/components/ConversionModal';
import SousPageAbonnement from '../../src/reglages/SousPageAbonnement';
import { txt as textesReglages } from '../../src/reglages/textes';
import { EtapeOrdinateur, EtapeCloudPresentation, EtapeCloudOffres, EtapeCloudOuFormule } from '../../src/entree/EtapesFormules';
import EtapeExtension from '../../src/entree/EtapeExtension';
import { textesEntree } from '../../src/entree/textes';
import { E, CSS_ENTREE } from '../../src/entree/theme';
import { datesEssai } from '../../src/entree/regles';
import RappelVeilleFormule from '../../src/cloud/FinEssaiFormule';
import { lireInterrupteurs } from '../../src/config/interrupteurs';
import { chargerTemoinCloud, noterBinaireCloud } from '../../src/config/cloudOffer';
import { droitsDuPalier } from '../../src/utils/palier';
import { poserPrixBoutique } from '../../src/lib/prixBoutique';
import { supabase } from '../../src/lib/supabase';
import '../../src/base.css';
import '../../src/App.redesign.css';

const UID = 'demo-0000-formules-cloud';
const p = new URLSearchParams(location.search);
const lang = p.get('lang') === 'en' ? 'en' : 'fr';
const ecran = p.get('ecran') || 'offres-avec';
const now = Date.now();
const pro = ecran === 'offres-avec-pro' || ecran === 'reglages-pro';
const JAUGES = {
  grille_trois_jauges: 1, jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0, jauge_lens_business: 600,
  quota_retouche_premium: 5, quota_retouche_pro: 20, quota_retouche_business: 50,
};
window.__FIXTURE = {
  utilisateur: { id: UID, email: 'demo@fillsell.app' },
  tables: {
    profiles: [{
      id: UID, beta_flags: { cloud: true }, is_founder: false,
      ...(pro ? { is_premium: true, is_pro: true, stripe_customer_id: 'cus_demo', subscription_period_end: new Date(now + 21 * 86400000).toISOString() } : {}),
    }],
    coin_config: [{ key: 'cloud_offre_ouverte', value: 1 }, ...Object.entries(JAUGES).map(([key, value]) => ({ key, value }))],
  },
  rpc: { cloud_disponibilite_moi: { vente_possible: true, raison: null, places: 12, attente: {} }, cloud_etat_moi: { actif: false } },
};
try { localStorage.clear(); } catch { /* rien */ }
// Les prix de la boutique SIMULÉS (démonstration) : ceux qu'Apple afficherait en France, essai d'une semaine sur Premium +
// Cloud et Pro + Cloud seulement (Business + Cloud : aucune offre d'introduction, comme dans App Store Connect).
if (p.get('prix') === 'boutique') {
  // Le texte du prix comme la boutique le formate dans la langue du téléphone (« 34,99 € » / « €34.99 »).
  const pr = (texteFr, montant, essai = false) => ({ texte: lang === 'en' ? `€${montant.toFixed(2)}` : texteFr, montant, devise: 'EUR', essai });
  poserPrixBoutique({ canal: 'apple', statut: 'pret', prix: {
    premium: pr('12,99 €', 12.99), pro: pr('29,99 €', 29.99), business: pr('59,99 €', 59.99), cloud: pr('24,99 €', 24.99, true),
    premium_cloud: pr('34,99 €', 34.99, true), pro_cloud: pr('49,99 €', 49.99, true), business_cloud: pr('79,99 €', 79.99, false),
  } });
}
await lireInterrupteurs(supabase);
await noterBinaireCloud('web', 'web');
await chargerTemoinCloud(supabase, UID);

const rien = () => {};
const K = { ...JAUGES };
const T = textesEntree(lang);
// Le contexte du parcours d'entrée, en démonstration (ce que useContexteEntree rendrait, sans réseau).
const c = {
  lang, fr: lang !== 'en', user: { id: UID }, surTelephone: true, plateforme: 'ios', plateformesFermees: [], grille: true, K, palier: 'gratuit',
  plan: { free: true }, journaliser: rien, choisirVoie: rien, envoi: { etat: 'repos' }, secondesRestantes: 0, extensionVue: false, envoyerLien: async () => ({ ok: false }),
  cloud: { parcours: false, ouvert: true }, voie: 'cloud',
  formules: {
    parcours: true, essaiPermis: true, vente: { fermee: false, dispo: null, inscrire: async () => false }, choisie: 'pro_cloud', choisieAvecEssai: true,
    choisir: rien, noterVoie: rien, achat: { etat: 'repos', message: null }, lancer: async () => null, actif: false, dates: datesEssai(now, lang), essaiFinCourt: null,
  },
};
const Parcours = ({ children }) => (
  <div style={{ position: 'fixed', inset: 0, background: E.page, color: E.ink, display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk', sans-serif" }}>
    <style>{CSS_ENTREE}</style>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'calc(env(safe-area-inset-top,0px) + 30px) 20px 26px', display: 'flex', flexDirection: 'column' }}>{children}</div>
  </div>
);
const ETAPE = { onSuivant: rien, onAller: rien, onTerminer: rien, pseudo: '', setPseudo: rien };

let rendu;
if (ecran.startsWith('offres')) {
  rendu = (
    <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
      <ConversionModal isOpen onClose={rien} onUpgrade={rien} onFormuleCloud={rien} lang={lang} userId={UID} grille
        vueCloud={ecran === 'offres-sans' ? 'sans' : 'avec'} {...droitsDuPalier(pro ? 'pro' : 'gratuit')} />
    </div>
  );
} else if (ecran === 'entree-ordinateur') rendu = <Parcours><EtapeOrdinateur c={c} T={T} {...ETAPE} /></Parcours>;
else if (ecran === 'entree-extension') rendu = <Parcours><EtapeExtension c={{ ...c, voie: 'extension' }} T={T} {...ETAPE} /></Parcours>;
else if (ecran === 'entree-presentation') rendu = <Parcours><EtapeCloudPresentation c={c} T={T} {...ETAPE} /></Parcours>;
else if (ecran === 'entree-offres') rendu = <Parcours><EtapeCloudOffres c={c} T={T} {...ETAPE} /></Parcours>;
else if (ecran === 'entree-essai') rendu = <Parcours><EtapeCloudOuFormule c={c} T={T} {...ETAPE} /></Parcours>;
else if (ecran === 'reglages-pro') {
  const cr = {
    user: { id: UID, email: 'demo@fillsell.app' }, lang, ...droitsDuPalier('pro'), natif: false, plateforme: 'web', quotas: null,
    ouvrirOffres: rien, resiliation: { resilie: false, etape: 0, setEtape: rien, lancer: rien, enCours: false },
    restauration: { enCours: false, lancer: rien }, actionsCloud: { formule: rien, voirFormulesCloud: rien },
  };
  rendu = <div style={{ minHeight: '100vh', background: '#F4F2EC', padding: '24px 16px', fontFamily: "'Space Grotesk', sans-serif" }}><SousPageAbonnement c={cr} T={textesReglages(lang)} /></div>;
} else {
  const fin = new Date(now + (ecran === 'rappel-jourj' ? 5 : 26) * 3600000).toISOString();
  rendu = (
    <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
      <RappelVeilleFormule lang={lang} cloud={{ etat: 'essai', essaiFin: fin }} formule="pro_cloud" quand={ecran === 'rappel-jourj' ? 'aujourdhui' : 'demain'}
        canal="stripe" actions={{ formule: rien, arreter: rien }} onFermer={rien} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('apercu')).render(rendu);
