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

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ MASQUAGE TEMPORAIRE — À RETIRER DÈS QUE LA 0.5.0 EST EN LIGNE SUR LE CWS
// ═══════════════════════════════════════════════════════════════════════════
// Posé le 2026-08-03 en urgence : le front est parti sur Vercel avec le bouton,
// alors que l'extension 0.5.0 (la seule qui sait synchroniser) n'était pas
// publiée. Les comptes équipés tournaient en 0.4.x — détectée par le heartbeat
// serveur, donc bouton ACTIF, mais sourde à la commande de sync : un clic dans
// le vide, exactement le piège des jobs 'pending' qu'on venait de fermer.
//
// POUR RETIRER (3 gestes, dans cet ordre) :
//   1. vérifier que la 0.5.0 est bien SERVIE par le Chrome Web Store ;
//   2. supprimer BETA_COMPTES et syncDressingVisiblePour ci-dessous ;
//   3. supprimer l'appel `syncDressingVisiblePour(...)` dans StockTab.jsx.
// La garde de VERSION (SYNC_VERSION_MIN, plus bas) reste, elle : c'est elle qui
// évitera que le problème revienne au prochain décalage front / Web Store.
const BETA_COMPTES = ['nicolas.svobodny@gmail.com', 'hoosslocal@gmail.com', 'ornellaracano@icloud.com'];

/** Le bouton de sync doit-il être rendu du tout ? (masquage temporaire) */
export function syncDressingVisiblePour(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e) return false;
  // Alias « + » retirés : nicolas.svobodny+test2@gmail.com est le même compte.
  const arobase = e.lastIndexOf('@');
  if (arobase < 1) return false;
  const canonique = `${e.slice(0, arobase).split('+')[0]}@${e.slice(arobase + 1)}`;
  return BETA_COMPTES.includes(canonique);
}

// ── Garde de VERSION (permanente) ───────────────────────────────────────────
// Le bouton testait la PRÉSENCE d'une extension, jamais sa CAPACITÉ. Or :
//   · le heartbeat serveur (profiles.extension_last_seen_at) prouve qu'UNE
//     extension tourne — n'importe laquelle, y compris une 0.4.x ;
//   · le signal postMessage `__fillsellExt` n'existe QUE depuis la 0.5.0, et il
//     porte la version du manifest.
// La sync exige donc le signal postMessage AVEC une version suffisante. Le
// heartbeat ne sert plus qu'à distinguer « extension trop ancienne » de
// « aucune extension » dans le message affiché — jamais à autoriser le clic.
export const SYNC_VERSION_MIN = '0.5.0';

// ── Cadence des syncs manuelles (2026-08-03) ────────────────────────────────
// Un run ne dure que ~7 s : sans borne, le bouton se relance en boucle et
// c'est le compte VINTED de l'utilisateur qui présente un profil mécanique.
// La borne RÉELLE vit côté background/base (un F5 ne la contourne pas) ;
// cette constante n'est que le miroir d'affichage — même valeur que
// SYNC_MANUAL_COOLDOWN_MS dans chrome-extension/background.js, à faire
// évoluer ENSEMBLE. Seul un run DONE arme la fenêtre : un échec se retente
// tout de suite. Ce n'est pas une faute, c'est une cadence.
export const SYNC_CADENCE_MANUELLE_MS = 15 * 60 * 1000;

/** a >= b sur des versions « x.y.z ». Rend false si l'un des deux est illisible. */
export function versionAuMoins(a, b) {
  const parse = (v) => String(v ?? '').trim().split('.').map((n) => parseInt(n, 10));
  const x = parse(a), y = parse(b);
  if (!x.length || x.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true; // égales
}

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

// ── Détail d'un article Vinted à l'unité (2026-08-03 soir) ──────────────────
// GET /api/v2/item_upload/items/{id} côté extension — l'endpoint du FORMULAIRE
// D'ÉDITION de Vinted, le seul qui porte la description. CADRE (décision 2 du
// chantier sync) : appel À L'UNITÉ, SUR ACTION HUMAINE UNIQUEMENT — ici le clic
// « Publier ». Jamais en lot, jamais en tâche de fond, jamais « en avance ».
// Contrairement à la sync, la réponse REVIENT par postMessage (aller-retour
// relayé par fillsell-auth.js) : un seul article, pas de run à suivre en base.
// GRATUIT : aucune Pépite — c'est la publication qui est payante, pas la
// lecture.
export const DETAIL_VERSION_MIN = '0.5.1';

export function demanderDetailArticleVinted(vintedItemId) {
  window.postMessage({ __fillsellCmd: 'FETCH_VINTED_ITEM', vintedItemId: String(vintedItemId) }, window.location.origin);
}

// Pose l'écoute des réponses de détail. Retourne le démontage.
export function ecouterDetailArticleVinted(onDetail) {
  const onMessage = (e) => {
    if (e.source !== window || !e.data?.__fillsellItemDetail) return;
    onDetail(e.data.__fillsellItemDetail);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
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
