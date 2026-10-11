// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — le poids du colis Leboncoin, demandé avant l'envoi (11/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte les composants RÉELS, sans session,
// avec le FAUX client Supabase (vite-modale-free.config.mjs : aucun réseau ;
// écritures appliquées EN MÉMOIRE seulement, pour prouver le geste) :
//   ?scene=confirmer  la carte « Poids du colis (Leboncoin) » de « Confirmer »
//   ?scene=regler     la question « À régler » d'une publication du lot de
//                     Louis retenue par le serveur (3 annonces du même lot
//                     attendent leur poids, 1 d'un autre lot)
//
//     node scripts/apercu/capture-poids-leboncoin.mjs
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CartePoidsLeboncoin } from '../../src/components/PoidsLeboncoin.jsx';
import { NeedsUserModal } from '../../src/tabs/StockTab.jsx';
import { QUESTION_POIDS_LBC, MESSAGE_POIDS_LBC } from '../../supabase/functions/_shared/poids-leboncoin.js';

const q = new URLSearchParams(location.search);
const scene = q.get('scene') ?? 'confirmer';
const LOT = 'e3897e66-1dfa-421d-99dd-043005e80ca2';
const jobLot = (id, inv, lot = LOT) => ({
  id, user_id: 'u', platform: 'leboncoin', action: 'publish', status: 'needs_user', inventaire_id: inv, bulk_batch_id: lot,
  title: 'Gigoteuse rouge étoiles', error: MESSAGE_POIDS_LBC,
  platform_fields: { lot_publication: { id: lot, le: '2026-10-11T08:59:43Z' }, needsUserField: QUESTION_POIDS_LBC, lbcTransporteurs: ['Mondial Relay', 'Colissimo'] },
});
const jobs = [
  jobLot('00000000-0000-4000-8000-000000000001', 11),
  jobLot('00000000-0000-4000-8000-000000000002', 12),
  jobLot('00000000-0000-4000-8000-000000000003', 13),
  jobLot('00000000-0000-4000-8000-000000000009', 19, 'autre-lot'),
];
window.__FIXTURE = {
  tables: { cross_post_jobs: jobs, inventaire: [{ id: 11, poids_g: null }, { id: 12, poids_g: null }, { id: 13, poids_g: 800 }, { id: 19, poids_g: null }] },
  rpc: {},
  ecritures: { cross_post_jobs: true, inventaire: true },
};

function Confirmer() {
  const [g, setG] = useState(null);
  const m = { lang: 'fr', poidsLbc: { visee: true, manquant: g == null, poser: setG, saisie: g, fiche: null } };
  return (
    <div className="fsn" style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <CartePoidsLeboncoin m={m} />
      <p id="etat" style={{ fontSize: 12 }}>{g == null ? 'Publier grisé : Poids du colis Leboncoin à indiquer' : `poids posé sur la copie : ${g} g`}</p>
    </div>
  );
}

function Regler() {
  const [fini, setFini] = useState(null);
  if (fini) return <p id="fini">relancé : {fini}</p>;
  return <NeedsUserModal job={structuredClone(jobs[0])} lang="fr" onClose={() => {}} onDone={(id) => setFini(String(id))} />;
}

createRoot(document.getElementById('apercu')).render(scene === 'regler' ? <Regler /> : <Confirmer />);
