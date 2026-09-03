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

// Durée de vie d'une demande de sync mise en file depuis un téléphone. Miroir
// d'affichage du TTL SQL (purger_sync_queue_perimee) et du filtre de
// get-pending-jobs — les trois à faire évoluer ENSEMBLE.
// ⚠️ Ce miroir n'est PAS cosmétique : le marquage en 'expired' n'a lieu qu'au
// poll d'une extension. Si Chrome n'est jamais rouvert, la ligne reste 'queued'
// en base pour toujours ; sans cette borne côté écran, la carte afficherait une
// attente éternelle et le bouton resterait grisé sans aucun moyen de repartir.
export const SYNC_FILE_TTL_MS = 6 * 60 * 60 * 1000;

// Délai NORMAL avant qu'une demande en file soit réclamée : le poll de
// l'extension tourne toutes les 2 min (chrome-extension/config.js). On observe
// donc pendant 3 min — une marge d'une minute sur le pire cas normal — puis on
// ARRÊTE définitivement d'interroger. Au-delà, ce n'est plus un délai, c'est
// que Chrome n'est pas ouvert : l'écran le dit et cesse de poller.
// ⚠️ Cette borne est ce qui autorise le poll à 2 s : sans elle on
// interrogerait la base toutes les 2 s pendant des heures pour rien.
export const SYNC_RECLAMATION_MAX_MS = 3 * 60 * 1000;

// ── Silence de l'extension : seuil MESURÉ, jamais estimé (2026-08-11) ───────
// Cas réel laure-4785 : sync commandée du mobile à 19:05:02, dernière trace
// d'extension (profiles.extension_last_seen_at) à 18:58:20 — 7 min avant. Le
// run est resté 'queued', claimed_at NULL, sans que RIEN ne le lui dise.
//
// Ce que le heartbeat vaut vraiment :
//   · cadence NOMINALE : extension_last_seen_at est stampé à chaque poll de
//     get-pending-jobs, soit POLL_INTERVAL_MINUTES = 2 min
//     (chrome-extension/config.js) ;
//   · cadence RÉELLE, relevée en prod sur les 12 runs 'bouton_distant'
//     effectivement réclamés (queued_at → claimed_at, c.-à-d. le délai jusqu'au
//     PREMIER poll suivant) : min 17 s, médiane 1 min 41, p90 4 min 38,
//     MAXIMUM 14 min 35. Les alarmes MV3 s'étirent — machine en veille,
//     économiseur de batterie, service worker rendormi.
// D'où 30 min : le double du pire cas observé. Un seuil serré rendrait « ton
// ordinateur ne répond pas » à quelqu'un dont le PC est allumé — un faux
// positif coûte plus cher que le bug qu'on corrige, et il absorbe aussi une
// horloge de téléphone mal réglée (la comparaison est client vs serveur).
// ⚠️ CE QUE ÇA N'ATTRAPE PAS, et c'est assumé : au moment du clic de Laure le
// silence n'était que de 6 min 42 — sous le seuil. Sa demande serait donc
// encore partie en file. Ce qui la protège, c'est le SECOND usage du seuil :
// dès que le silence le dépasse, la carte cesse d'annoncer une réclamation
// imminente et dit que l'ordinateur ne répond pas.
export const EXT_SILENCE_MAX_MS = 30 * 60 * 1000;

// (SYNC_MAJ_DISPONIBLE supprimée le 2026-08-09. Elle arbitrait entre deux
// formulations du message « extension trop ancienne » — message qui n'existe
// plus : la carte de sync n'a plus qu'UNE phrase quand la synchro est
// impossible (« Installe l'extension FillSell sur ton ordinateur… ») et ne
// parle plus jamais de version. Une bascule que plus personne ne lit est un
// piège : la basculer n'aurait rien changé à l'écran. Si un jour un message
// doit redistinguer « à installer » de « à mettre à jour », c'est une
// décision de discours à reprendre à zéro, pas cette constante à ressusciter.)

// (Le masquage bêta BETA_COMPTES / syncDressingVisiblePour, posé en urgence le
// 03/08, a été retiré le 06/08 quand la 0.5.0 a été servie par le CWS. La
// protection permanente contre un décalage front / Web Store, c'est la garde
// de VERSION ci-dessous — SYNC_VERSION_MIN — pas une liste de comptes.)

// ── Republication Vinted (É5) : visible pour TOUS depuis le 2026-08-06 ──────
// Le masquage bêta est levé (0.5.0 servie par le CWS). La fonction reste le
// point de bascule si la republication doit être re-masquée indépendamment de
// la sync ; les appels dans StockTab.jsx composent déjà avec la capacité
// réelle de l'extension (capaciteExt / SYNC_VERSION_MIN).
export function republishVisiblePour() {
  return true;
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

// ── Sync commandée à distance (2026-08-05) ──────────────────────────────────
// Objectif produit : on installe l'extension UNE FOIS sur son ordinateur, puis
// on synchronise depuis son téléphone. Le clic mobile pose une ligne
// vinted_sync_runs 'queued' que l'extension réclame à son prochain poll (2 min,
// Chrome ouvert). Le chemin DIRECT (postMessage ci-dessus) reste utilisé dès
// qu'une extension capable répond dans CE navigateur : instantané, pas de
// détour par la base. Jamais les deux — sinon deux runs pour un clic.

/**
 * Capacité de sync du COMPTE (pas du navigateur courant).
 * ⚠️ TOLÉRANTE À L'ABSENCE DE `extension_version` : le front est déployé par
 * Vercel dès le push, la migration s'applique après. Tant qu'elle n'est pas
 * passée, la colonne n'existe pas et PostgREST renvoie une erreur — on rend
 * alors `{ inconnu: true }` et l'appelant retombe sur le comportement
 * d'avant (bouton gaté sur la seule sonde locale). Aucune fenêtre cassée.
 */
export async function lireCapaciteSyncCompte(userId) {
  if (!userId) return { inconnu: true };
  const { data, error } = await supabase
    .from('profiles')
    .select('extension_last_seen_at,extension_version')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { inconnu: true };
  // `vueIlYaMs` / `enLigne` (2026-08-11) s'AJOUTENT, ils ne remplacent rien :
  // `capable` continue de dire « ce compte a une extension qui sait
  // synchroniser » et pilote seul le bouton et le message d'installation. Une
  // extension installée mais silencieuse n'est pas une extension absente — les
  // deux appellent des gestes différents (« installe-la » vs « ouvre Chrome »),
  // les confondre ramènerait le message d'installation sur l'écran de
  // quelqu'un qui l'a déjà installée.
  const vu = data?.extension_last_seen_at ? Date.parse(data.extension_last_seen_at) : NaN;
  return {
    inconnu: false,
    jamaisVue: data?.extension_last_seen_at == null,
    version: data?.extension_version ?? null,
    capable: data?.extension_last_seen_at != null
      && versionAuMoins(data?.extension_version, SYNC_VERSION_MIN),
    vueIlYaMs: Number.isFinite(vu) ? Math.max(0, Date.now() - vu) : null,
    // false = silence AVÉRÉ au-delà du seuil (ou extension jamais vue) ;
    // true = un poll récent prouve que l'ordinateur tourne.
    enLigne: Number.isFinite(vu) ? (Date.now() - vu) < EXT_SILENCE_MAX_MS : false,
  };
}

/**
 * Met une demande de sync en file. Le serveur tranche tout (capacité, cadence
 * 15 min, doublon) : cette fonction ne décide rien, elle rapporte.
 * Réponses possibles : ok | extension_jamais_vue | extension_trop_ancienne |
 * cadence | deja_en_attente | rpc_absente.
 */
export async function demanderSyncDressingServeur() {
  const { data, error } = await supabase.rpc('demander_sync_dressing');
  if (error) {
    // PGRST202 = fonction introuvable : migration pas encore appliquée.
    // Distinct d'une vraie panne — l'appelant sait retomber sur l'ancien
    // comportement au lieu d'afficher une erreur à l'utilisateur.
    const absente = error.code === 'PGRST202' || /function .*demander_sync_dressing/i.test(error.message ?? '');
    return { ok: false, reason: absente ? 'rpc_absente' : 'erreur', message: error.message };
  }
  return data ?? { ok: false, reason: 'erreur' };
}

// ── Détail d'un article Vinted à l'unité (2026-08-03 soir) ──────────────────
// GET /api/v2/item_upload/items/{id} côté extension — l'endpoint du FORMULAIRE
// D'ÉDITION de Vinted, le seul qui porte la description. CADRE (décision 2 du
// chantier sync) : appel À L'UNITÉ, SUR ACTION HUMAINE UNIQUEMENT — ici le clic
// « Publier ». Jamais en lot, jamais en tâche de fond, jamais « en avance ».
// Contrairement à la sync, la réponse REVIENT par postMessage (aller-retour
// relayé par fillsell-auth.js) : un seul article, pas de run à suivre en base.
// GRATUIT : aucune unité — c'est la publication qui est payante, pas la
// lecture.
// ── Règle de versionnage (Nico, 2026-08-05) ─────────────────────────────────
// L'extension RESTE en 0.5.0 : c'est CE numéro qui sera empaqueté et soumis
// au CWS. Les commits ne bumpent plus la version — EXTENSION_LAST_COMMIT
// (scripts/build-id.mjs) identifie un build pour les tests unpacked. Le
// numéro ne bouge que sur décision de Nico (nouvelle soumission). Les gardes
// *_VERSION_MIN ci-dessous sont donc TOUTES à 0.5.0 tant qu'une seule 0.5.0
// existe — une garde plus haute refuserait une capacité pourtant présente.
export const DETAIL_VERSION_MIN = '0.5.0';

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

// ── Sonde d'état d'une annonce Vinted avant suppression (2026-08-10) ────────
// Posée quand l'utilisateur ouvre la modale de suppression d'un article dont
// une annonce Vinted est réputée en ligne. Elle sert UNIQUEMENT à décider si
// l'app a le droit de poser la question « plus en ligne — vendue ? ». Elle
// n'écrit rien : c'est le clic qui écrit, jamais la lecture (leçon du 09/08).
//
// NON BLOQUANTE PAR CONSTRUCTION. La modale s'affiche tout de suite avec ses
// boutons habituels ; la question n'apparaît que si la réponse arrive ET dit
// « hors ligne ». Conséquences voulues :
//   · sur mobile (aucune extension) rien ne répond → rien ne change à l'écran ;
//   · sur une extension antérieure à ce build, la commande n'est pas dans sa
//     liste FERMÉE (fillsell-auth.js) : personne ne répond, même issue. Pas de
//     garde de version à maintenir — l'absence de réponse EST la garde.
// Le délai est généreux : la sonde peut faire la queue derrière une
// publication en cours (verrou d'onglet de travail côté extension). Elle
// n'immobilise rien pendant ce temps.
export const SONDE_ANNONCE_TIMEOUT_MS = 12000;

/**
 * Rend { success:true, state:'active'|'sold'|'unavailable'|'unknown', price } ou
 * { success:false, error }. Ne rejette JAMAIS : une sonde qui échoue est un
 * résultat normal (et signifie « ne pose pas la question »).
 */
export function sonderAnnonceVinted(listingUrl, { timeoutMs = SONDE_ANNONCE_TIMEOUT_MS } = {}) {
  const cible = String(listingUrl ?? '');
  return new Promise((resolve) => {
    if (!cible) { resolve({ success: false, error: 'listing_url manquante' }); return; }
    let fini = false;
    let timer = null;
    const terminer = (r) => {
      if (fini) return;
      fini = true;
      window.removeEventListener('message', onMessage);
      if (timer) clearTimeout(timer);
      resolve(r);
    };
    const onMessage = (e) => {
      // e.source !== window : une iframe tierce ne se fait pas passer pour le
      // content script (même garde que ecouterPresenceExtension).
      if (e.source !== window) return;
      const rep = e.data?.__fillsellListingProbe;
      // L'URL est REPÉTÉE par le relais : deux sondes peuvent être en vol si la
      // modale a été refermée puis rouverte sur un autre article.
      if (!rep || String(rep.listingUrl ?? '') !== cible) return;
      terminer(rep);
    };
    window.addEventListener('message', onMessage);
    timer = setTimeout(() => terminer({ success: false, error: 'timeout' }), timeoutMs);
    try {
      window.postMessage({ __fillsellCmd: 'PROBE_VINTED_LISTING', listingUrl: cible }, window.location.origin);
    } catch {
      terminer({ success: false, error: 'postMessage refusé' });
    }
  });
}

// ── É1 republication : capture complète (2026-08-05) ────────────────────────
// Même contrat aller-retour que le détail, en plus riche : payload natif
// complet + résolutions id→libellé + verdict 'valide'|'incomplet' avec
// champs_manquants nommés. LECTURE SEULE, à l'unité, sur action humaine,
// GRATUIT en unités. Un verdict 'incomplet' n'autorisera JAMAIS une
// suppression (garde à la persistance — migration É2 à valider par Nico).
// Tant que le re-hébergement des photos n'est pas en place (edge function à
// valider), TOUTE capture est 'incomplet' par construction
// (champs_manquants contient 'photos_rehebergees') : c'est voulu.
export const CAPTURE_VERSION_MIN = '0.5.0';

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LA CAPTURE NE SE FAIT PLUS ICI (2026-08-05) — NE PAS LA REMETTRE
// ═══════════════════════════════════════════════════════════════════════════
// demanderCaptureArticleVinted / ecouterCaptureArticleVinted /
// capturerEtPersisterArticleVinted ont été SUPPRIMÉES de ce fichier.
//
// Elles capturaient via postMessage à l'extension DU NAVIGATEUR COURANT :
// depuis un téléphone personne ne répond, on attendait 30 s et on affichait
// « extension muette (30 s) ». La republication était desktop-only de fait,
// sans que rien ne l'annonce — le même piège que le bouton de sync, découvert
// deux fois.
//
// La capture est désormais faite par l'EXTENSION au moment où elle ramasse le
// job (background.js, étape 'a_capturer' de processRepublishJob), quelques
// secondes avant de supprimer. Bénéfice au passage : une capture ne peut plus
// être périmée à l'instant d'agir.
//
// Si un jour tu as besoin d'une capture depuis le site : ne rétablis pas ce
// chemin, passe par la file. Le canal CAPTURE_VINTED_ITEM reste en place côté
// extension, mais plus aucun code du site ne doit l'emprunter.

// ── Republier une annonce Vinted (refondu 2026-08-05) ───────────────────────
// UN SEUL appel : la RPC pose le job 'a_capturer' et débite l'unité (Free
// seulement — Premium/Pro/comped à 0). Aucune capture ici : c'est l'extension
// qui capture au moment où elle ramasse le job, quelques secondes avant de
// supprimer. Conséquence directe : ce bouton marche depuis un TÉLÉPHONE, et
// une capture ne peut plus être périmée à l'instant d'agir.
// Le prix ajusté voyage dans platform_fields.prix_republication entre le clic
// et l'exécution ; l'extension l'injecte dans payload.prix de la capture,
// exactement comme le site le faisait, prix_origine compris.
export async function republierArticleVinted(supabase, { inventaireId, vintedItemId, prixRepublication = null }) {
  const prix = Number(prixRepublication);
  const { data, error } = await supabase.rpc('spend_coins_and_republish', {
    p_inventaire_id: inventaireId ?? null,
    p_vinted_item_id: String(vintedItemId),
    p_source: 'manuel',
    p_prix_republication: Number.isFinite(prix) && prix >= 1 ? prix : null,
  });
  if (error) return { success: false, error: error.message };
  if (data?.allowed === false) return { success: false, ...data };
  return { success: true, job_id: data?.job_id ?? null, price: data?.price ?? null };
}

// ── Relancer un republish arrêté (refondu 2026-08-05) ───────────────────────
// La relance RECAPTURAIT depuis le navigateur courant quand l'étape était
// 'captured' : elle marchait donc sur un ordinateur et pas sur un téléphone,
// alors que la branche 'deleted' (simple re-pend) marchait partout. Le bouton
// « Relancer » fonctionnait ou non selon l'étape où le job s'était arrêté,
// sans que rien ne l'annonce.
// Désormais UNE seule RPC, sans capture, quel que soit le support :
//   · annonce encore en ligne → le job repart à l'étape 'a_capturer' et
//     l'extension recapturera juste avant d'agir ;
//   · annonce DÉJÀ supprimée ('deleted') → pas de recapture possible, la
//     capture en base est la seule source : reprise directe à la recréation.
export async function relancerRepublishVinted(supabase, { job }) {
  if (!job?.id) return { success: false, error: 'job de republication illisible' };
  const { data, error } = await supabase.rpc('relancer_republish', { p_job_id: job.id });
  if (error) return { success: false, error: error.message };
  if (data?.ok === false) return { success: false, reason: data.reason, error: data.reason };
  return { success: true, recapture: (data?.republish_step ?? 'a_capturer') !== 'deleted' };
}

// vinted_login : trace d'identité du run (migration 20260814110000, appliquée
// en prod — colonne sûre à sélectionner ; PostgREST = tout ou rien). Sert à
// afficher « Dressing synchronisé : @pseudo » sur la carte de sync. NULL sur
// les runs d'avant la trace : la carte n'affiche alors rien (jamais de libellé
// vide, jamais « inconnu »).
const RUN_COLS = 'id,status,page_suivante,total_pages,total_entries,items_vus,items_crees,items_maj,erreur,started_at,finished_at,vinted_login';

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

// ── Dernière synchro RÉUSSIE (2026-08-11) ───────────────────────────────────
// L'heure affichée sous le bouton doit être celle de la dernière synchro qui a
// VRAIMENT lu le dressing, cron comprise — donc le dernier run 'done', pas le
// dernier run tout court (lireDernierRunDressing rend aussi les 'failed', les
// 'queued' et les 'expired', qui n'ont rien synchronisé).
// Remplace aDejaSynchroniseDressing dans la carte : MÊME requête, mêmes
// filtres, une colonne de plus — l'heure ne coûte donc aucun aller-retour
// supplémentaire. `declencheur` est lu pour pouvoir dire un jour « automatique »
// à côté de l'heure ; l'affichage actuel n'en dépend pas.
// Rend null si rien n'a jamais abouti : l'appelant en déduit `dejaSync`.
export async function lireDerniereSyncReussie(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('vinted_sync_runs')
    .select('id,finished_at,declencheur,vinted_login')
    .eq('user_id', userId)
    .eq('kind', 'dressing')
    .eq('status', 'done')
    .order('finished_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0] ?? null;
}
