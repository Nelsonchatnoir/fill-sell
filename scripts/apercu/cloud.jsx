/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte
   rien, comme src/main.jsx. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — l'option « Sans ordinateur » (Cloud), écran par écran (04/10/2026)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-cloud.mjs
//
// Les VRAIS composants, branchés comme dans l'app : feuille des formules
// (ConversionModal), Réglages › Abonnement (SousPageAbonnement dans son écran),
// HoteCloud (veille / fin d'essai), étape « extension » du parcours d'entrée,
// mur « installe l'extension » (ExtensionPitchScreen), carte du Stock
// (InstallExtensionCta), page /extension sur téléphone.
// L'état Cloud du compte est lu par la VRAIE requête (useCloudProfil) sur un
// faux client Supabase (faux-supabase.js : aucun réseau, écritures refusées) ;
// les profils ci-dessous sont des fixtures, aucune donnée réelle.
// L'horloge est figée par la capture (playwright clock) : les dates d'essai
// sont comptées à partir de Date.now(), donc reproductibles.
// Un écran par adresse (?ecran=…) : les feuilles se montent en portail.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConversionModal from '../../src/components/ConversionModal';
import ExtensionPitchScreen from '../../src/components/ExtensionPitchScreen';
import InstallExtensionCta from '../../src/components/InstallExtensionCta';
import ExtensionPage from '../../src/pages/ExtensionPage';
import SousPageAbonnement from '../../src/reglages/SousPageAbonnement';
import { EcranReglages } from '../../src/reglages/ReglagesUI';
import { txt } from '../../src/reglages/textes';
import HoteCloud from '../../src/cloud/HoteCloud';
import EtapeExtension from '../../src/entree/EtapeExtension';
import { textesEntree } from '../../src/entree/textes';
import { E, CSS_ENTREE } from '../../src/entree/theme';
import { Progression, LienDiscret } from '../../src/entree/EntreeUI';
import { palierDuProfil, droitsDuPalier, nomDuPalier } from '../../src/utils/palier';
import { supabase } from '../../src/lib/supabase';
import '../../src/base.css';
import '../../src/App.redesign.css';

const UID = 'apercu-cloud-0000';
const H = 3_600_000;
const J = 24 * H;
const now = Date.now();
const iso = (t) => new Date(t).toISOString();

// ── Les profils (fixtures) ─────────────────────────────────────────────────
const PREMIUM = { is_premium: true };
const PRO = { is_premium: true, is_pro: true };
const BUSINESS = { is_premium: true, is_pro: true, is_business: true };
const essaiDepuis = (debut) => ({ cloud_essai_debut: iso(debut), cloud_essai_fin: iso(debut + 7 * J) });
const PROFILS = {
  free: {},
  free_essai_pris: essaiDepuis(now - 20 * J),
  premium: PREMIUM,
  premium_actif: { ...PREMIUM, is_cloud: true },
  business: BUSINESS,
  essai_j5: { ...PREMIUM, ...essaiDepuis(now - 2 * J - H) },
  essai_j1: { ...PREMIUM, ...essaiDepuis(now + 23.5 * H - 7 * J) },
  paye: { ...PRO, is_cloud: true },
  suspendu: { is_cloud: true },
  termine: { ...PREMIUM, ...essaiDepuis(now - 10 * J) },
  gratuit: {},
  aucun_payant: PREMIUM,
};

const params = new URLSearchParams(location.search);
const ecran = params.get('ecran') || 'modale-free';

// L'écran → son profil.
const PROFIL_DE = {
  'modale-free': 'free', 'modale-free-essai-pris': 'free_essai_pris', 'modale-cloud': 'free',
  'modale-premium': 'premium', 'modale-business': 'business', 'modale-deja-actif': 'premium_actif',
  'reglages-aucun': 'aucun_payant', 'reglages-gratuit': 'gratuit', 'reglages-essai-j5': 'essai_j5',
  'reglages-essai-j1': 'essai_j1', 'reglages-paye': 'paye', 'reglages-suspendu': 'suspendu', 'reglages-termine': 'termine',
  veille: 'essai_j1', fin: 'termine', entree: 'free', mur: 'free', 'stock-lien': 'free', 'page-extension': 'free',
};
const profil = { id: UID, stripe_customer_id: null, ...PROFILS[PROFIL_DE[ecran] ?? 'free'] };
window.__FIXTURE = {
  utilisateur: { id: UID, email: 'apercu@fillsell.app' },
  tables: { profiles: [profil], coin_config: [] },
  rpc: {},
};
// Les mémoires d'affichage (rappel déjà vu, lien déjà envoyé) partent vides.
try { localStorage.clear(); } catch { /* rien */ }

const palier = palierDuProfil(profil);
const droits = droitsDuPalier(palier);
const rien = () => {};
const actionsCloud = {
  essayer: rien, ajouter: rien, meConnecter: rien, voirFormules: rien, extension: rien,
  arreter: async () => ({ ok: true }),
};

function Modale({ trigger = 'generic', ajout = false }) {
  return (
    <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
      <ConversionModal
        isOpen onClose={rien} onUpgrade={(tier, choix) => { window.__dernierChoix = { tier, choix: choix ?? null, nbArgs: choix === undefined ? 1 : 2 }; }}
        trigger={trigger} lang="fr" userId={UID} {...droits}
        onAjouterCloud={ajout ? () => { window.__ajoutCloud = true; } : null}
      />
    </div>
  );
}

function Reglages() {
  const T = txt('fr');
  const c = {
    user: { id: UID, email: 'apercu@fillsell.app' }, lang: 'fr', ...droits, nomFormule: nomDuPalier(palier),
    natif: false, plateforme: 'web', quotas: null, remiseAZero: null, prochainPrelevement: null,
    ouvrirOffres: rien,
    resiliation: { resilie: false, etape: 0, setEtape: rien, lancer: rien, enCours: false, finLe: null, message: null },
    restauration: { enCours: false, lancer: rien },
    // Ce que l'hôte passera quand le paiement de l'option existera.
    actionsCloud,
  };
  return (
    <EcranReglages titre={T.gAbonnement} onRetour={rien} pile cle="abonnement">
      <SousPageAbonnement c={c} T={T} />
    </EcranReglages>
  );
}

// L'étape « extension » DANS la coque du parcours (même en-tête, même marge).
function Entree() {
  const T = textesEntree('fr');
  const c = {
    lang: 'fr', fr: true, user: { id: UID }, surTelephone: true, extensionVue: false,
    envoi: { etat: 'repos', email: null }, secondesRestantes: 0,
    envoyerLien: async () => ({ ok: false }), journaliser: rien,
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: E.page, color: E.ink, display: 'flex', flexDirection: 'column', fontFamily: "'Space Grotesk', sans-serif" }}>
      <style>{CSS_ENTREE}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, padding: '18px 20px 14px' }}>
        <Progression total={5} index={1} />
        <LienDiscret onClick={rien} style={{ width: 'auto', fontSize: 13.5, padding: '8px 2px' }}>{T.passer}</LienDiscret>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 26px', display: 'flex', flexDirection: 'column' }}>
        <EtapeExtension c={c} T={T} onSuivant={rien} />
      </div>
    </div>
  );
}

function Apercu() {
  switch (ecran) {
    case 'modale-free':
    case 'modale-free-essai-pris':
    case 'modale-deja-actif':
      return <Modale />;
    case 'modale-cloud': return <Modale trigger="cloud" />;
    case 'modale-premium':
    case 'modale-business':
      return <Modale trigger="cloud" ajout />;
    case 'veille':
    case 'fin':
      return (
        <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
          <HoteCloud userId={UID} lang="fr" onOuvrirOffres={rien} actions={actionsCloud} />
        </div>
      );
    case 'entree': return <Entree />;
    case 'mur':
      return (
        <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
          <ExtensionPitchScreen lang="fr" onClose={rien} supabase={supabase} userId={UID} onExtensionSeen={rien}
            ebaySansOrdinateur={{ relie: false, onRelier: rien }} onContinue={rien} />
        </div>
      );
    case 'stock-lien':
      return (
        <div style={{ minHeight: '100vh', background: '#F6F5F1', padding: '24px 16px', boxSizing: 'border-box' }}>
          <div data-zone="carte-stock" style={{ background: '#FFFFFF', border: '1px solid #E7E3D8', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InstallExtensionCta lang="fr" isNative userId={UID} userEmail="apercu@fillsell.app" source="stock_annonces"
              message="L'extension n'est pas encore installée sur ton ordinateur : c'est elle qui relève tes annonces." />
          </div>
        </div>
      );
    case 'page-extension':
      return <MemoryRouter><ExtensionPage /></MemoryRouter>;
    default:
      return <Reglages />;
  }
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<Apercu />);
window.__pret = true;
