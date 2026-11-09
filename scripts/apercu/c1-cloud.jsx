// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — C1 « plus besoin d'ordinateur » (09/11/2026 nuit, point 6 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-c1-cloud.mjs
//
// Les VRAIS composants, avec leurs vrais textes, sur le faux client Supabase (aucun réseau) :
//   ?ecran=reglages        → bloc « FillSell Cloud » des Réglages, compte sans Cloud (l'accroche neuve + ce que ça fait) ;
//   ?ecran=reglages-paye   → le même bloc, option payée en plus d'une formule Pro (« partent sans ordinateur, 24 h/24 ») ;
//   ?ecran=voie            → parcours d'entrée, « Comment tu veux publier ? » (carte Cloud) ;
//   ?ecran=essai           → parcours d'entrée, l'écran de l'essai (« Ce que fait le Cloud ») ;
//   ?ecran=connexion       → parcours d'entrée, « Connecte tes comptes, une fois » ;
//   ?ecran=debut           → parcours d'entrée, « Je débute » avec le Cloud ;
//   ?lang=fr|en
import React from 'react';
import ReactDOM from 'react-dom/client';
import BlocCloudReglages from '../../src/cloud/BlocCloudReglages';
import EtapeVoie from '../../src/entree/EtapeVoie';
import EtapeCloud from '../../src/entree/EtapeCloud';
import EtapeCloudConnexion from '../../src/entree/EtapeCloudConnexion';
import EtapeDebut from '../../src/entree/EtapeDebut';
import { textesEntree } from '../../src/entree/textes';
import { datesEssai, dateCourte } from '../../src/entree/regles';
import '../../src/base.css';
import '../../src/App.redesign.css';

const UID = 'apercu-c1-0000';
const p = new URLSearchParams(location.search);
const lang = p.get('lang') === 'en' ? 'en' : 'fr';
const ecran = p.get('ecran') || 'reglages';
const MAINTENANT = new Date('2026-11-09T09:00:00+01:00').getTime();
window.__FIXTURE = { utilisateur: { id: UID, email: 'apercu@fillsell.app' }, tables: { profiles: [{ id: UID }] }, rpc: {} };

const LECTURE_ESSAI = { etat: 'ok', cloud: { etat: 'aucun', essaiPris: false, actif: false }, luLe: MAINTENANT, relire() {} };
const LECTURE_ACTIVE = { etat: 'ok', cloud: { etat: 'essai', essaiPris: true, actif: true, essaiFin: '2026-11-16T09:00:00.000Z' }, luLe: MAINTENANT, relire() {} };
const L4 = [{ id: 'vinted', nom: 'Vinted', etat: 'connecte', verif: null }, { id: 'leboncoin', nom: 'Leboncoin', etat: 'a_connecter', verif: null },
  { id: 'beebs', nom: 'Beebs', etat: 'a_connecter', verif: null }, { id: 'depop', nom: 'Depop', etat: 'a_connecter', verif: null }];
const cloudObjet = ({ actif = false, cx = null } = {}) => ({
  ouvert: true, parcours: true, actif, lecture: actif ? LECTURE_ACTIVE : LECTURE_ESSAI, offre: actif ? null : { essai: true },
  vente: { fermee: false, dispo: null, inscrire: async () => true, places: 5 },
  achat: { etat: 'repos', message: null }, lancerEssai: async () => 'actif',
  dates: datesEssai(MAINTENANT, lang),
  essaiFinCourt: actif ? dateCourte('2026-11-16T09:00:00.000Z', lang) : null,
  connexions: cx ?? { etat: 'lecture', lignes: [], ebayRelie: null, relire() {}, connectees: 0, total: 0 },
});
const ctx = ({ voie = null, cloud = cloudObjet(), choix } = {}) => ({
  lang, fr: lang !== 'en', user: { id: UID, email: 'apercu@fillsell.app' }, demanderPseudo: false, surTelephone: true,
  choix: choix ?? { plateformes: ['vinted', 'leboncoin'], debute: false }, majChoix() {}, enregistrerPlateformes() {},
  extensionVue: false, syncMultiOuverte: true, envoi: { etat: 'idle', email: 'apercu@fillsell.app', envoyeA: 0, raison: null },
  secondesRestantes: 0, envoyerLien: async () => ({ ok: true }), releve: { etat: 'idle' }, lancerReleve: async () => {},
  murs: [], releveVinted: null, ebayRelie: false, setEbayRelie() {}, journaliser() {}, jetonRef: { current: null },
  plateformesFermees: [], K: null, grille: false, plan: null, palier: 'gratuit',
  voie, choisirVoie() {}, cloud, cloudChoisi: voie === 'cloud', cloudPris: voie === 'cloud' && cloud.actif,
  plateforme: 'ios',
});
const props = { pseudo: '', setPseudo() {}, onSuivant() {}, onAller() {}, onTerminer() {} };
const T = textesEntree(lang);

function Contenu() {
  if (ecran === 'reglages' || ecran === 'reglages-paye') {
    const paye = ecran === 'reglages-paye';
    return (
      <BlocCloudReglages lang={lang} lecture="ok" nomPalier={paye ? 'Pro' : null} maintenant={MAINTENANT} canal={paye ? 'stripe' : null}
        cloud={paye ? { etat: 'paye', essaiPris: true, actif: true, periodeFin: '2026-12-09T09:00:00.000Z' } : { etat: 'aucun', essaiPris: false, actif: false }}
        quotaFree={null} actions={{ essayer: () => {}, arreter: async () => ({}) }} />
    );
  }
  if (ecran === 'voie') return <EtapeVoie c={ctx()} T={T} {...props} />;
  if (ecran === 'essai') return <EtapeCloud c={ctx({ voie: 'cloud' })} T={T} {...props} />;
  if (ecran === 'connexion') {
    const cx = { etat: 'ok', lignes: L4, ebayRelie: false, relire() {}, connectees: 1, total: 4 };
    return <EtapeCloudConnexion c={ctx({ voie: 'cloud', cloud: cloudObjet({ actif: true, cx }) })} T={T} {...props} />;
  }
  if (ecran === 'debut') return <EtapeDebut c={ctx({ voie: 'cloud', cloud: cloudObjet({ actif: true }), choix: { plateformes: [], debute: true } })} T={T} {...props} />;
  return <p>écran inconnu</p>;
}

ReactDOM.createRoot(document.getElementById('apercu')).render(
  <div className="app-root" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
    <div className="wrap page-pad" data-ecran-c1={ecran} style={{ padding: '18px 14px 16px', maxWidth: ecran.startsWith('reglages') ? 720 : 520, margin: '0 auto' }}>
      <Contenu />
    </div>
  </div>,
);
