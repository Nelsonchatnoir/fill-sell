// ═══════════════════════════════════════════════════════════════════════════
// BANC — « Ventes à confirmer » (11/10, cas Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Monte le VRAI composant (src/components/VentesADecider.jsx) avec la liste que
// la base rend pour Louis le 11/10 (ventes_a_decider, lue en prod), plus une
// vente au dernier exemplaire. Les décisions sont journalisées dans
// window.__decisions (rien ne part).
//   ?cas=louis | vide
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/base.css';
import '../../src/App.css';
import VentesADecider from '../../src/components/VentesADecider.jsx';

const LOUIS = [
  { cle: 'annonce:vinted:10289137208', plateforme: 'vinted', annonce_id: '10289137208', job_id: 'fe9b64bb', titre: 'Rangement Blanc pour 12 pots et 12 couvercles pour yaourtière Multidélices', prix: 12, quantite: 9998, detectee_le: '2026-10-10T18:42:00Z', listing_url: 'https://www.vinted.fr/items/10289137208' },
  { cle: 'annonce:vinted:10289147239', plateforme: 'vinted', annonce_id: '10289147239', job_id: '820014c6', titre: '12 adaptateurs pour pots La Laitière – Multidélices', prix: 7, quantite: 9996, detectee_le: '2026-10-09T18:13:00Z', listing_url: 'https://www.vinted.fr/items/10289147239' },
  { cle: 'annonce:vinted:10269303712', plateforme: 'vinted', annonce_id: '10269303712', job_id: '427ad01d', titre: 'Rangement Gris et Violet pour 12 pots et 12 couvercles pour yaourtière Multidélices', prix: 12, quantite: 9997, detectee_le: '2026-10-07T22:04:00Z', listing_url: 'https://www.vinted.fr/items/10269303712' },
  { cle: 'annonce:vinted:10276047846', plateforme: 'vinted', annonce_id: '10276047846', job_id: '1340db6e', titre: 'Rangement Gris et Rouge pour 12 pots et 12 couvercles pour yaourtière Multidélices', prix: 11.5, quantite: 9995, detectee_le: '2026-10-07T22:04:00Z', listing_url: 'https://www.vinted.fr/items/10276047846' },
  { cle: 'annonce:vinted:10276053804', plateforme: 'vinted', annonce_id: '10276053804', job_id: '776e18eb', titre: 'Rangement Noir et Blanc pour 12 pots et 12 couvercles pour yaourtière Multidélices', prix: 12, quantite: 9997, detectee_le: '2026-10-07T22:04:00Z', listing_url: 'https://www.vinted.fr/items/10276053804' },
  { cle: 'annonce:leboncoin:3285000000', plateforme: 'leboncoin', annonce_id: '3285000000', job_id: 'lbc00001', titre: 'Kit bûche gâteau (dernier exemplaire)', prix: 15, quantite: 1, detectee_le: '2026-10-11T07:30:00Z', listing_url: null },
];

function Banc() {
  const cas = new URLSearchParams(location.search).get('cas') ?? 'louis';
  const [ventes, setVentes] = useState(cas === 'vide' ? [] : LOUIS);
  const [enCours, setEnCours] = useState(null);
  window.__decisions ??= [];
  return (
    <VentesADecider lang="fr" devise="€" ventes={ventes} enCours={enCours}
      onDecider={(v, remettre, prix) => {
        window.__decisions.push({ annonce: v.annonce_id, job: v.job_id, remettre, prix });
        setEnCours(v.cle);
        setTimeout(() => { setVentes((l) => l.filter((x) => x.cle !== v.cle)); setEnCours(null); }, 200);
      }} />
  );
}
createRoot(document.getElementById('apercu')).render(<Banc />);
window.__pret = true;
