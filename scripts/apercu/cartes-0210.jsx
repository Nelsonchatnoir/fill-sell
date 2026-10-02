// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — bandeau « sortie d'Opla » et carte d'avis (02/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte les composants RÉELS :
//   · scene=app     — le VRAI tableau de bord (DashboardTab) avec, en tête, le
//                     bandeau (BandeauSortieOpla) puis la carte d'avis (CarteAvis),
//                     exactement comme App.jsx les lui passe (prop `entete`) ;
//   · scene=popup   — la carte d'avis du popup de l'extension, avec le CSS ET le
//                     balisage réels de chrome-extension/popup.html et popup.js
//                     (lus en ?raw, rien de recopié ici).
// Adresse : cartes-0210.html#scene=<app|popup>&theme=<clair|sombre>
// « sombre » pose data-theme="dark" sur la surface — la palette sombre des
// cartes ; l'app et le popup, eux, n'ont pas de thème sombre aujourd'hui (le
// fond de page sombre ici n'est là que pour juger la carte).
//
//     node scripts/apercu/capture-cartes-0210.mjs
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import DashboardTab from '../../src/tabs/DashboardTab.jsx';
import BandeauSortieOpla from '../../src/components/BandeauSortieOpla.jsx';
import CarteAvis from '../../src/components/CarteAvis.jsx';
import { AVIS } from '../../supabase/functions/_shared/avis-demande.js';
import popupHtml from '../../chrome-extension/popup.html?raw';
import popupJs from '../../chrome-extension/popup.js?raw';

const params = new URLSearchParams(location.hash.slice(1));
const scene = params.get('scene') || 'app';
const sombre = params.get('theme') === 'sombre';
// avis=0 : le téléphone (iOS/Android) n'a PAS de carte d'avis — c'est la
// fenêtre officielle du store ; seul le bandeau y est montré.
const avecAvis = params.get('avis') !== '0';
// variante=general : le bandeau des comptes SANS Opla relié (décision du 02/10).
const variante = params.get('variante') === 'general' ? 'general' : 'relie';
window.__journal = [];

function SceneApp() {
  const [bandeau, setBandeau] = useState(true);
  const [carte, setCarte] = useState(avecAvis);
  const jour = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const sales = [
    { id: 1, title: 'Robe Camaïeu', sell: 18, buy: 4, margin: 14, date: jour(2), date_vente: jour(2), plateforme: 'Vinted' },
    { id: 2, title: 'Short Quiksilver', sell: 12, buy: 3, margin: 9, date: jour(5), date_vente: jour(5), plateforme: 'Leboncoin' },
    { id: 3, title: 'Casio G-Shock', sell: 45, buy: 20, margin: 25, date: jour(9), date_vente: jour(9), plateforme: 'eBay' },
  ];
  const items = [
    { id: 11, title: 'T-shirt Picture', sell: 15, buy: 5, statut: 'stock', quantite: 1, date_ajout: jour(1) },
    { id: 12, title: 'Bouilloire', sell: 20, buy: 8, statut: 'stock', quantite: 1, date_ajout: jour(3) },
  ];
  const entete = (bandeau || carte) ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {bandeau && <BandeauSortieOpla variante={variante} onCompris={() => { window.__journal.push('compris'); setBandeau(false); }} />}
      {carte && <CarteAvis url={AVIS.URL_AVIS_EXTENSION} onChoix={(c) => { window.__journal.push(c); setCarte(false); }} />}
    </div>
  ) : null;
  return (
    <div data-theme={sombre ? 'dark' : undefined} style={{ minHeight: '100vh', background: sombre ? '#0E1714' : '#FAFBFB', padding: '16px 16px 40px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* L'app n'a pas de thème sombre : en sombre, les cartes seules. */}
        {sombre ? entete : <DashboardTab
          lang="fr" currency="EUR" isPremium={false} isNative={false} username="Nico" loading={false}
          items={items} sales={sales} stock={items} stockVal={13} stockQty={2}
          tm={{ profit: 48, count: 3, retenues: 3, sansAchat: 0 }} salesForKpis={sales} totalM={48}
          selectedRange="1M" setSelectedRange={() => {}} openUpgradeModal={() => {}} setTab={() => {}}
          EmptyStateDashboard={() => null} extensionAbsente={false} onExtensionInfo={null}
          photosParInventaire={{}} entete={entete}
        />}
      </div>
    </div>
  );
}

// Le popup : son <style> réel, le <section id="avis"> réel, et le balisage
// produit par la VRAIE renderAvis (extraite de popup.js et exécutée ici).
function montePopup(racine) {
  // La police embarquée du popup, à son vrai chemin depuis la racine du dépôt.
  const style = popupHtml.match(/<style>([\s\S]*?)<\/style>/)[1].split('url("assets/').join('url("/chrome-extension/assets/');
  const st = document.createElement('style');
  st.textContent = style;
  document.head.appendChild(st);
  const debut = popupJs.indexOf('const SPARKLES_SVG');
  const fin = popupJs.indexOf('let avisDemande');
  const debutR = popupJs.indexOf('function renderAvis()');
  const finR = popupJs.indexOf('// ── Interactions', debutR);
  // eslint-disable-next-line no-new-func
  const fabrique = new Function('state', 'els', `${popupJs.slice(debut, fin)}\n${popupJs.slice(debutR, finR)}\nreturn renderAvis;`);
  racine.innerHTML = `<div ${sombre ? 'data-theme="dark"' : ''} style="width:380px;margin:0 auto;background:${sombre ? '#0E1714' : '#F5F6F5'};font-family:'Space Grotesk',sans-serif;font-size:13px;color:#0D0D0D;min-height:100vh">` +
    `<main class="corps"><section id="avis" class="hidden" aria-labelledby="avis-titre"></section>` +
    `<section><div class="eyebrow">Plateformes</div><div class="card" style="padding:14px;color:#6B7280">Vinted · Leboncoin · eBay · Beebs — connectées</div></section></main></div>`;
  const els = { avis: racine.querySelector('#avis') };
  const renderAvis = fabrique({ avis: { url: AVIS.URL_AVIS_EXTENSION } }, els);
  renderAvis();
  racine.addEventListener('click', (e) => {
    const b = e.target.closest('[data-avis]');
    if (b) window.__journal.push(b.getAttribute('data-avis'));
  });
}

const racine = document.getElementById('apercu');
if (scene === 'popup') montePopup(racine);
else createRoot(racine).render(<SceneApp />);
