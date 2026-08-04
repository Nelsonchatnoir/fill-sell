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

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ BASCULE DU MESSAGE « extension trop ancienne » — false AUJOURD'HUI
// ═══════════════════════════════════════════════════════════════════════════
// false → « cette fonction arrive dans une prochaine mise à jour » (C1).
// true  → « ouvre Chrome, l'extension se met à jour toute seule » (C2).
//
// C2 est FAUX tant que la 0.5.x n'est pas servie par le Chrome Web Store :
// personne ne recevrait rien, et on renverrait l'utilisateur vérifier une mise
// à jour qui n'existe pas. C'est exactement la promesse retirée le 05/08
// (commit 835b981) — ne pas la réintroduire à l'aveugle.
//
// À PASSER À true DANS LE MÊME GESTE que le bump d'EXTENSION_MIN_BUILD
// (scripts/build-id.mjs), qui n'est lui-même bumpé qu'après une publication
// ACCEPTÉE par le CWS. Un seul rituel, deux constantes.
export const SYNC_MAJ_DISPONIBLE = false;

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

// ═════════════════════════════════════════════════════════════════════════════
// ⛔ MASQUAGE BÊTA DE LA REPUBLICATION (É5, 2026-08-05) — À RETIRER D'UN GESTE
// quand Nico valide : faire retourner `true` à cette fonction (ou supprimer
// ses appels dans StockTab.jsx). Fonction SÉPARÉE de syncDressingVisiblePour
// exprès : les deux features se dévoilent indépendamment, même si la liste
// bêta est aujourd'hui la même.
// ═════════════════════════════════════════════════════════════════════════════
export function republishVisiblePour(email) {
  return syncDressingVisiblePour(email);
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
  return {
    inconnu: false,
    jamaisVue: data?.extension_last_seen_at == null,
    version: data?.extension_version ?? null,
    capable: data?.extension_last_seen_at != null
      && versionAuMoins(data?.extension_version, SYNC_VERSION_MIN),
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
// GRATUIT : aucune Pépite — c'est la publication qui est payante, pas la
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

// ── É1 republication : capture complète (2026-08-05) ────────────────────────
// Même contrat aller-retour que le détail, en plus riche : payload natif
// complet + résolutions id→libellé + verdict 'valide'|'incomplet' avec
// champs_manquants nommés. LECTURE SEULE, à l'unité, sur action humaine,
// GRATUIT en Pépites. Un verdict 'incomplet' n'autorisera JAMAIS une
// suppression (garde à la persistance — migration É2 à valider par Nico).
// Tant que le re-hébergement des photos n'est pas en place (edge function à
// valider), TOUTE capture est 'incomplet' par construction
// (champs_manquants contient 'photos_rehebergees') : c'est voulu.
export const CAPTURE_VERSION_MIN = '0.5.0';

export function demanderCaptureArticleVinted(vintedItemId) {
  window.postMessage({ __fillsellCmd: 'CAPTURE_VINTED_ITEM', vintedItemId: String(vintedItemId) }, window.location.origin);
}

// Pose l'écoute des réponses de capture. Retourne le démontage.
export function ecouterCaptureArticleVinted(onCapture) {
  const onMessage = (e) => {
    if (e.source !== window || !e.data?.__fillsellItemCapture) return;
    onCapture(e.data.__fillsellItemCapture);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

// Orchestration complète d'É1 (2026-08-05, infra validée) : capture par
// l'extension → re-hébergement des photos (edge republish-capture-photos,
// hôtes Vinted seulement, ≤20, 10 Mo/photo, timeout 15 s) → INSERT immuable
// dans vinted_republish_captures avec le VERDICT FINAL. Les échecs photo ne
// font pas tomber la capture : ils rejoignent champs_manquants et le verdict
// reste 'incomplet' — la garde anti-perte (É2) fera le reste. Pas d'UI ici :
// le bouton « Republier » (É5) appellera cette fonction telle quelle.
// prixRepublication (2026-08-05, feuille de prix validée) : le prix AJUSTÉ
// entre DANS la capture (payload.prix) — jamais appliqué après coup. Le prix
// relevé sur l'annonce est conservé en payload.prix_origine. Tout le reste de
// la capture reste « à l'identique ».
export async function capturerEtPersisterArticleVinted(supabase, { userId, inventaireId, vintedItemId, prixRepublication = null }) {
  const id = String(vintedItemId ?? '').trim();
  if (!id) return { success: false, error: "vinted_item_id manquant" };

  // 1. Capture par l'extension (aller-retour, timeout local : une extension
  // absente/muette ne doit pas laisser une promesse pendante à vie).
  const capture = await new Promise((resolve) => {
    const timer = setTimeout(() => { stop(); resolve({ success: false, error: "extension muette (30 s)" }); }, 30_000);
    const stop = ecouterCaptureArticleVinted((rep) => {
      if (String(rep?.vintedItemId ?? '') !== id) return;
      clearTimeout(timer); stop(); resolve(rep);
    });
    demanderCaptureArticleVinted(id);
  });
  if (!capture.success) return capture;

  // 2. Re-hébergement des photos — remplace le marqueur 'photos_rehebergees'
  // posé par l'extension par le résultat RÉEL, échec par échec.
  const manquants = (capture.champs_manquants ?? []).filter((c) => !c.startsWith('photos_rehebergees'));
  let photosUrls = [];
  if (capture.photos_cdn?.length) {
    try {
      const { data, error } = await supabase.functions.invoke('republish-capture-photos', {
        body: { vinted_item_id: id, urls: capture.photos_cdn },
      });
      if (error) throw new Error(error.message ?? 'appel en échec');
      photosUrls = data?.photos ?? [];
      for (const e of data?.echecs ?? []) manquants.push(`photo non re-hébergée (${e.raison})`);
      if (!photosUrls.length) manquants.push('photos_rehebergees (aucune photo re-hébergée)');
    } catch (e) {
      manquants.push(`photos_rehebergees (${String(e?.message ?? e)})`);
    }
  }

  // 3. Persistance immuable, verdict final. La capture la plus récente fait
  // foi ; l'id inséré est rendu (la relance d'un republish le repointe).
  const verdict = manquants.length ? 'incomplet' : 'valide';
  const { data: insData, error: insErr } = await supabase.from('vinted_republish_captures').insert({
    user_id: userId,
    inventaire_id: inventaireId ?? null,
    vinted_item_id: id,
    verdict,
    champs_manquants: manquants,
    payload: { natif: capture.natif ?? null, dto_public: capture.dto_public ?? null,
               titre: capture.titre ?? null,
               prix: Number.isFinite(Number(prixRepublication)) && Number(prixRepublication) >= 1
                 ? Number(prixRepublication) : (capture.prix ?? null),
               ...(Number.isFinite(Number(prixRepublication)) && Number(prixRepublication) >= 1
                 ? { prix_origine: capture.prix ?? null } : {}),
               description: capture.description ?? null, photos_cdn: capture.photos_cdn ?? [] },
    libelles: capture.libelles ?? null,
    photos_urls: photosUrls,
  }).select('id').single();
  if (insErr) return { success: false, error: `persistance : ${insErr.message}` };
  return { success: true, verdict, champs_manquants: manquants, photos_urls: photosUrls, capture_id: insData?.id ?? null };
}

// ── É2 : republier une annonce Vinted (2026-08-05) ──────────────────────────
// Capture fraîche → persistance → RPC spend_coins_and_republish (1 Pépite,
// débitée à la capture réussie ; remboursée automatiquement si la recréation
// n'aboutit jamais — trigger serveur). Le RPC REFUSE sans capture
// verdict='valide' de moins de 60 min : une capture incomplète ne peut
// JAMAIS mener à une suppression. L'extension exécute ensuite la machine à
// étapes (supprimer → attendre → recréer), en DRY RUN tant que Nico n'a pas
// basculé REPUBLISH_DRY_RUN (background.js). Pas d'UI ici : le bouton
// « Republier » (É5) appellera cette fonction telle quelle.
export async function republierArticleVinted(supabase, { userId, inventaireId, vintedItemId, prixRepublication = null }) {
  const capture = await capturerEtPersisterArticleVinted(supabase, { userId, inventaireId, vintedItemId, prixRepublication });
  if (!capture.success) return capture;
  if (capture.verdict !== 'valide') {
    return {
      success: false, verdict: capture.verdict, champs_manquants: capture.champs_manquants,
      error: "Capture incomplète — republication refusée AVANT toute suppression (rien n'a été touché).",
    };
  }
  const { data, error } = await supabase.rpc('spend_coins_and_republish', {
    p_inventaire_id: inventaireId ?? null,
    p_vinted_item_id: String(vintedItemId),
  });
  if (error) return { success: false, error: error.message };
  if (data?.allowed === false) return { success: false, ...data };
  return { success: true, job_id: data?.job_id ?? null, price: data?.price ?? null };
}

// ── É5 : relancer un republish en needs_user (2026-08-05) ───────────────────
// LE point structurel signalé par Nico : la relance RECAPTURE D'ABORD — le
// mini-éditeur générique re-pend sans recapturer, ce qui rejouerait la
// péremption à l'infini. Deux cas, par l'étape EN BASE :
//   · 'captured' (rien n'a été supprimé) : capture FRAÎCHE obligatoire, le
//     job est repointé dessus (capture_id) puis re-pend. Le compteur
//     recaptures_perimees est CONSERVÉ (il ne se remet à zéro qu'à une
//     republication aboutie — côté extension).
//   · 'deleted' (annonce déjà supprimée) : PAS de recapture (l'annonce
//     n'existe plus, la capture en base est la seule source) — simple
//     re-pend, la reprise repart directement à la recréation.
export async function relancerRepublishVinted(supabase, { userId, job }) {
  const pf = job?.platform_fields ?? {};
  const item = pf.vinted_item_id;
  if (!job?.id || !item) return { success: false, error: 'job de republication illisible' };

  if ((pf.republish_step ?? 'captured') === 'deleted') {
    const { data, error } = await supabase.from('cross_post_jobs')
      .update({ status: 'pending', error: null })
      .eq('id', job.id).select('id');
    if (error || !data?.length) return { success: false, error: error?.message ?? 'relance non écrite (RLS ?)' };
    return { success: true, recapture: false };
  }

  const capture = await capturerEtPersisterArticleVinted(supabase, {
    userId, inventaireId: job.inventaire_id ?? null, vintedItemId: item,
  });
  if (!capture.success) return capture;
  if (capture.verdict !== 'valide' || !capture.capture_id) {
    return {
      success: false, verdict: capture.verdict, champs_manquants: capture.champs_manquants,
      error: 'Nouvelle capture incomplète — relance refusée, rien n\'a été touché.',
    };
  }
  const pfNext = { ...pf, capture_id: capture.capture_id, republish_step: 'captured' };
  delete pfNext.next_action_after;
  const { data, error } = await supabase.from('cross_post_jobs')
    .update({ status: 'pending', error: null, platform_fields: pfNext })
    .eq('id', job.id).select('id');
  if (error || !data?.length) return { success: false, error: error?.message ?? 'relance non écrite (RLS ?)' };
  return { success: true, recapture: true };
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
