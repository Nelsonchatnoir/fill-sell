/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants : il monte et n'exporte
   rien, comme src/main.jsx. */
// ══════════════════════════════════════════════════════════════════════════
// APERÇU — les trois tuiles du haut du Stock (07/10/2026, lot TEXTES)
// ══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée, index.html).
//
//     node scripts/apercu/capture-tuiles-stock.mjs
//
// Les VRAIS composants du haut du Stock (src/stock/Haut.jsx), dans l'ordre
// où StockTab les monte, avec la feuille de style réelle (CSS_STOCK) :
// tuiles, porte du lot si elle existe encore, republication automatique,
// « Ajouter un article ». Aucune donnée, aucune requête : les chiffres sont
// ceux de la capture de Nico du 07/10 (15 · 9 · 9).
//   ?retraits=1 — la tuile « À régler » avec un retrait bloqué (ses propres mots).
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as H from '../../src/stock/Haut';
import { CSS_STOCK } from '../../src/stock/css';
import '../../src/base.css';
import '../../src/App.redesign.css';

const q = new URLSearchParams(location.search);
const retraits = q.get('retraits') === '1';
const n = (cle, def) => (q.get(cle) != null ? Number(q.get(cle)) : def);
const rien = () => {};

const aRegler = { n: n('r', 9), onOuvrir: rien,
  ...(retraits ? {
    court: 'annonces à retirer',
    long: () => 'dont des annonces à retirer',
    aria: (k) => `À régler : ${k}, dont 2 annonces encore en ligne à retirer`,
  } : {}) };

function HautStock() {
  return (
    <div className="sk-racine" style={{ background: '#FAFBFB', minHeight: '100vh', padding: '24px 16px', boxSizing: 'border-box' }}>
      <style>{CSS_STOCK}</style>
      <div data-zone="haut">
        <div data-zone="gestes">
          <H.Gestes lang="fr" variante="tuiles"
            publier={{ n: n('p', 15), onOuvrir: rien }}
            remonter={{ n: n('m', 9), onOuvrir: rien }}
            aRegler={aRegler} />
        </div>
        {H.LignePublierEnLot && (
          <div data-zone="lot" style={{ marginTop: 8 }}>
            <H.LignePublierEnLot lang="fr" n={n('p', 15)} onOuvrir={rien} />
          </div>
        )}
        <div data-zone="repub" style={{ marginTop: 8 }}>
          <H.LigneRepublicationAuto lang="fr" autorise actif={false} nomsActifs={[]} busy={false}
            onBasculer={rien} onOuvrirReglages={rien} onOffres={rien} />
        </div>
        <div data-zone="ajouter" style={{ marginTop: 24 }}>
          <H.EntreeAjouter lang="fr" ouvert={false} onOuvrir={rien} onFermer={rien} />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('apercu')).render(<HautStock />);
document.fonts.ready.then(() => { window.__pret = true; });
