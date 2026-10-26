// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — « Ta file » : Tout annuler, annulation par ligne (26/10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le composant RÉEL (FileDesJobs) avec le
// CSS global de l'app, sur des jobs de la forme exacte de cross_post_jobs, et un
// supabase BOUCHON en mémoire (aucun compte, aucune requête) : les écritures
// d'annulation s'appliquent au magasin local et sont exposées à la capture
// (window.__ecritures). Une scène par adresse : file-annuler.html#scene=<nom>.
//
//     node scripts/apercu/capture-file-annuler.mjs
import { createRoot } from 'react-dom/client';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import FileDesJobs from '../../src/components/FileDesJobs.jsx';

const MAINTENANT = Date.now();
const il = (s) => new Date(MAINTENANT - s * 1000).toISOString();
const dans = (s) => new Date(MAINTENANT + s * 1000).toISOString();
const A = {
  short: { id: 1, title: 'Short de bain taille M orange et bleu marine', sell: '8', photos: [] },
  tshirt: { id: 2, title: 'T-shirt bleu marine poche poitrine taille S', sell: '12.5', photos: [] },
  bouilloire: { id: 3, title: 'Bouilloire électrique 0.8L blanc et noir', sell: '18', photos: [] },
  maillot: { id: 4, title: 'Maillot de foot blanc vintage', sell: '48', photos: [] },
  robe: { id: 5, title: 'Robe fleurie bleue manches courtes', sell: '28', photos: [] },
  montre: { id: 6, title: 'Montre noire', sell: '100', photos: [] },
  jean: { id: 7, title: 'Jean Lee Carol Western Gris Anthracite / Noir Délavé - Taille W24 L31', sell: '5', photos: [] },
  sac: { id: 8, title: 'Sac cabas noir et vert kaki', sell: '35', photos: [] },
};
const FICHES = new Map(Object.values(A).map((i) => [String(i.id), i]));
let n = 0;
const job = (article, x) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, inventaire_id: article.id, platform: 'leboncoin', action: 'publish', status: 'pending',
  created_at: il(1200 - n * 60), published_at: null, error: null, title: article.title, voie: 'extension', listing_url: null, platform_listing_id: null,
  platform_fields: {}, ...x,
});
const JOBS = [
  job(A.short, { action: 'republish', platform: 'beebs', status: 'processing', platform_fields: { republish_step: 'captured', processing_since: il(12) } }),
  job(A.jean, { action: 'republish', platform: 'leboncoin', platform_fields: { republish_step: 'deleted', deleted_at: il(4000) } }),
  job(A.tshirt, { platform: 'leboncoin' }),
  job(A.bouilloire, { platform: 'beebs' }),
  job(A.maillot, { action: 'republish', platform: 'depop', platform_fields: { republish_step: 'a_capturer' } }),
  job(A.robe, { action: 'republish', platform: 'leboncoin', platform_fields: { republish_step: 'a_capturer' } }),
  job(A.montre, { action: 'delete', platform: 'beebs' }),
  job(A.sac, { platform: 'ebay', status: 'needs_user', error: 'eBay demande la matière : choisis-la dans la liste.' }),
];

// Le bouchon supabase : une chaîne qui accepte les filtres et rend ce que la base rendrait.
const magasin = new Map(JOBS.map((j) => [j.id, structuredClone(j)]));
window.__ecritures = [];
function requete(table) {
  const etat = { table, ids: null, eqs: {}, patch: null, sel: null };
  const ch = {
    select(c) { etat.sel = c; return ch; },
    in(col, v) { if (col === 'id') etat.ids = v; return ch; },
    eq(col, v) { etat.eqs[col] = v; return ch; },
    is() { return ch; }, or() { return ch; }, order() { return ch; }, limit() { return ch; },
    update(p) { etat.patch = p; return ch; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    then(res, rej) { return Promise.resolve(executer(etat)).then(res, rej); },
  };
  return ch;
}
function executer(etat) {
  if (etat.table !== 'cross_post_jobs') return { data: [], error: null };
  const cibles = [...magasin.values()].filter((j) => (!etat.ids || etat.ids.includes(j.id))
    && Object.entries(etat.eqs).every(([k, v]) => k === 'user_id' || j[k] === v));
  if (!etat.patch) return { data: cibles.map((j) => structuredClone(j)), error: null };
  for (const j of cibles) { Object.assign(j, etat.patch); window.__ecritures.push({ id: j.id, ...etat.patch }); }
  return { data: cibles.map((j) => ({ id: j.id })), error: null };
}
const supabase = {
  from: requete,
  rpc: () => Promise.resolve({ data: { pause: false }, error: null }),
  functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
};
const ctx = { lang: 'fr', extension: { etat: 'vivante' }, plateformesEnPause: new Set(), plafond: null, texteErreur: (j) => j.error };
const etatFile = { pause: false, en_pause: 0, envoi: false, basculer: () => {} };

function App() {
  return (
    <FileDesJobs lang="fr" supabase={supabase} userId="apercu" jobs={JOBS} fiches={FICHES} contexte={ctx}
      etatFile={etatFile} texteErreur={(j) => j.error} formaterPrix={(v) => `${v} €`}
      onAnnules={(ids) => { window.__annules = ids; }} onFermer={() => {}} />
  );
}
// La date de retrait du jean est ancienne mais l'étape « deleted » suffit : jamais annulable.
void dans;
createRoot(document.getElementById('apercu')).render(<App />);
