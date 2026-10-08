// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la fenêtre « Vendre » (point 8, 02/10 soir), sans session
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. La coque de la fenêtre (titre, sous-titre,
// prix) est recopiée de App.jsx (elle y vit en ligne, non exportable) ; le
// cœur est le VRAI composant ChoixVenteModale et les VRAIS textes de
// utils/venteModale.js. Les annonces en ligne sont passées par `enLigneConnu`
// (aucune session, aucune lecture en base). Rien n'est enregistré.
//
//     node scripts/apercu/capture-vente-modale.mjs
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChoixVenteModale from '../../src/components/ChoixVenteModale.jsx';
import { prixPrerempli } from '../../src/utils/venteModale.js';

const C = { teal: '#1B6E62', text: '#10201B', sub: '#6B7A75', red: '#C0392B' };

function Fenetre({ id, item, enLigne, plateformeInitiale = '', qteVendue = 1, depopVisible = undefined }) {
  const [plateforme, setPlateforme] = useState(plateformeInitiale);
  const [prix, setPrix] = useState(prixPrerempli(item));
  return (
    <div data-cas={id} style={{ background: '#fff', borderRadius: 20, padding: 22, margin: '12px auto', width: 'min(92vw,400px)', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(0,0,0,0.12)', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 14 }}>💰 Marquer comme vendu</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 4 }}>{item.title}</div>
      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 14, lineHeight: 1.4 }}>Enregistre une vraie vente : stock, statistiques et bénéfice. Ce n'est pas une suppression.</div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 4 }}>💰 Prix de vente</label>
      <input data-champ="prix" value={prix} onChange={(e) => setPrix(e.target.value)} type="number"
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.15)', marginBottom: 12 }} />
      {(item.quantite ?? 1) > 1 && (
        <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 12 }}>Quantité à vendre : {qteVendue} / {item.quantite}</div>
      )}
      <ChoixVenteModale item={item} plateforme={plateforme} onPlateforme={setPlateforme}
        quantiteVendue={qteVendue} lang="fr" couleurs={C} enLigneConnu={enLigne}
        {...(depopVisible === undefined ? {} : { depopVisible })} />
    </div>
  );
}

function Apercu() {
  return (
    <div style={{ padding: '4px 0 24px' }}>
      <Fenetre id="un-exemplaire" item={{ id: 1, title: 'Robe noire plissée PROMOD', sell: 12, quantite: 1 }}
        enLigne={[{ platform: 'vinted', url: 'https://www.vinted.fr/items/1' }, { platform: 'beebs', url: null }]}
        plateformeInitiale="vinted" />
      <Fenetre id="plusieurs" item={{ id: 2, title: 'Lot gommes de mâchoire', sell: 10, quantite: 3 }}
        enLigne={[{ platform: 'vinted', url: 'https://www.vinted.fr/items/2' }, { platform: 'leboncoin', url: null }]}
        plateformeInitiale="vinted" />
      <Fenetre id="aucune" item={{ id: 3, title: 'Casio vintage', sell: null, quantite: 1 }} enLigne={[]} />
      <Fenetre id="vide" item={{ id: 4, title: 'Pull Zara', sell: 7, quantite: 1 }}
        enLigne={[{ platform: 'vinted', url: null }, { platform: 'ebay', url: null }]} />
      {/* (09/10) Depop : le compte AUTORISÉ (App.jsx passe depopVisible =
          depopOuverte) — les fenêtres au-dessus sont celles de TOUS les autres
          comptes, sans la prop, exactement comme App.jsx avant Depop. */}
      <Fenetre id="beta-depop" item={{ id: 5, title: 'Casio vintage (compte bêta Depop)', sell: null, quantite: 1 }}
        enLigne={[]} depopVisible />
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
