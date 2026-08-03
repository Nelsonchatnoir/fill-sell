// ── Pont site → extension : synchronisation du dressing Vinted (2026-08-03) ──
// Le site n'a AUCUN canal direct vers l'extension (pas d'`externally_connectable`
// dans le manifest, volontairement : l'ouvrir au web exposerait l'extension à
// n'importe quelle page). Tout passe donc par window.postMessage, relayé par le
// content script `chrome-extension/content-scripts/fillsell-auth.js`, qui
// n'écoute QUE sur fillsell.app.
// Conséquence à connaître avant de crier au bug : en dev (localhost:5173) le
// content script n'est pas injecté, personne ne répond au ping, et le bouton
// reste grisé. C'est le comportement attendu, pas une régression.
import { supabase } from '../lib/supabase';

// Délai avant de conclure « pas d'extension ». Le content script répond au ping
// dans la foulée ; 1,5 s couvre une injection tardive sans faire clignoter le
// bouton entre « grisé » et « actif » sous les yeux de l'utilisateur.
export const EXT_SONDE_MS = 1500;

export const SYNC_POLL_MS = 2000;

// Plafond de sécurité du poll. Un run zombie (extension tuée en plein vol, ligne
// laissée en 'running') ne doit pas faire interroger Supabase toutes les 2 s
// jusqu'à la fin des temps.
export const SYNC_POLL_MAX_MS = 10 * 60 * 1000;

// L'extension crée sa ligne `vinted_sync_runs` dès qu'elle reçoit la commande.
// Si RIEN n'apparaît dans ce délai, personne n'a pris la commande : il faut le
// DIRE. C'est exactement le piège des jobs 'pending' du 20/07 — un ordre parti
// dans le vide et un travail réellement en cours sont indiscernables vus de
// l'UI, seule l'absence de trace au bout d'un moment tranche.
export const SYNC_DEMARRAGE_MAX_MS = 30 * 1000;

// Re-provoque l'annonce de présence du content script.
export function pinguerExtension() {
  try { window.postMessage({ __fillsellPing: true }, window.location.origin); }
  catch { /* origine opaque (sandbox) : sans conséquence, on restera grisé */ }
}

// Pose l'écoute du signal de présence ET pingue immédiatement. Retourne le
// démontage. PIÈGE : le content script s'annonce spontanément à l'injection,
// donc souvent AVANT le montage du composant — sans le ping, un écouteur posé
// après coup n'entendrait jamais rien et le bouton resterait grisé à tort.
export function ecouterPresenceExtension(onVue) {
  const onMessage = (e) => {
    // e.source !== window : une iframe tierce ne doit pas pouvoir se faire
    // passer pour le content script.
    if (e.source !== window || !e.data?.__fillsellExt) return;
    onVue(e.data.version ?? null);
  };
  window.addEventListener('message', onMessage);
  pinguerExtension();
  return () => window.removeEventListener('message', onMessage);
}

// Déclenche la sync. La réponse ne revient PAS par ce canal : l'extension
// travaille dans son service worker et ne rend compte que dans la table
// `vinted_sync_runs`. C'est elle qu'il faut lire pour savoir ce qui se passe.
export function demanderSyncDressing() {
  window.postMessage({ __fillsellCmd: 'SYNC_DRESSING' }, window.location.origin);
}

const RUN_COLS = 'id,status,page_suivante,total_pages,total_entries,items_vus,items_crees,items_maj,erreur,started_at,finished_at';

// RLS filtre déjà sur auth.uid() ; le `.eq('user_id')` explicite reste pour que
// la requête dise ce qu'elle veut, et pour ne pas dépendre d'une policy.
export async function lireDernierRunDressing(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('vinted_sync_runs')
    .select(RUN_COLS)
    .eq('user_id', userId)
    .eq('kind', 'dressing')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

// Sert UNIQUEMENT à choisir le libellé (« Synchroniser » vs « Actualiser ») :
// une erreur ici ne doit rien casser, on retombe sur le premier usage.
export async function aDejaSynchroniseDressing(userId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('vinted_sync_runs')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'dressing')
    .eq('status', 'done')
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
