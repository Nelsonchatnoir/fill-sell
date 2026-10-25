// ═══════════════════════════════════════════════════════════════════════════
// CE QUI DEMANDE VRAIMENT UN GESTE — UNE RÈGLE POUR TOUS LES ÉCRANS (25/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 25/10 : « L'utilisateur ne doit voir AUCUNE erreur qui vient de nous ou
// qui est déjà réglée. Il ne voit que ce qui demande vraiment un geste de sa
// part (connexion, choix qui lui appartient). Tout le reste se clôt ou se
// rattrape seul, avec un état vrai. »
// Le balayage du 25/10 (263 comptes actifs, lecture seule) : des lignes ambre
// ou rouges, et 173 pastilles neutres au mot négatif, venaient de NOS règles
// d'affichage — jamais d'un geste à faire. Cinq règles les fabriquaient :
//   1. l'emplacement de republication de la carte ignorait attenteAutomatique
//      (« À toi de jouer » sur une attente qui repart seule) et disait
//      « Arrêtée » / « Plus en ligne » sur une annonce revue en ligne depuis ;
//   2. la pastille de l'onglet comptait TOUS les needs_user, sans la règle de
//      « À régler » (attentes automatiques, articles vendus ou supprimés) ;
//   3. le suivi du lot ne passait pas par etatJob (publication/lot/regles.js) ;
//   4. la bannière de la modale de statut comptait tous les jobs, anciens compris ;
//   5. le « dernier job » de la carte ignorait les republications : un échec
//      dépassé par une republication réussie restait rouge.
// Ce module dit UNE fois ce qui demande un geste ; les écrans l'appliquent.
// L'état d'un job reste celui de _shared/etat-job.js (etatJob,
// attenteAutomatique) : rien n'est redécidé ici, on ne fait que le lire.
// ⛔ AFFICHAGE PUR : rien ici n'écrit, ne relance ni n'annule un job.
// Preuve : scripts/erreurs-visibles-selftest.mjs.
import { attenteAutomatique, libelleEtat, ETATS } from "../../supabase/functions/_shared/etat-job.js";
import { estArretUtilisateur, estGeleLivres } from "./publicationState.js";
import { natureNeedsUser } from "./shared.js";
import { situationJob } from "./fileDesJobs.js";
import { identifiantAnnonceJob } from "../../supabase/functions/_shared/introuvable-a-confirmer.js";

const tsDe = (v) => { const t = Date.parse(v ?? ""); return Number.isFinite(t) ? t : 0; };
const pfDe = (j) => (j?.platform_fields && typeof j.platform_fields === "object" && !Array.isArray(j.platform_fields) ? j.platform_fields : {});
const actionDe = (j) => String(j?.action ?? "publish");
const memeJob = (a, b) => (a?.id != null && b?.id != null ? String(a.id) === String(b.id) : a === b);
const contient = (ensemble, p) => Boolean(p) && (ensemble instanceof Set ? ensemble.has(p) : Array.isArray(ensemble) && ensemble.includes(p));
// Le plus récent : created_at, puis id — le tri du Stock (stock/jobsIncrementaux.comparerJobs).
const plusRecentQue = (a, b) => tsDe(a?.created_at) > tsDe(b?.created_at)
  || (tsDe(a?.created_at) === tsDe(b?.created_at) && String(a?.id ?? "") > String(b?.id ?? ""));

/** Les plateformes HORS JEU pour ce compte : fermées (Leboncoin d'une adresse hors de France, App.jsx) et Opla
 *  quand elle n'est plus ouverte (la carte n'en montre déjà plus rien). Rien à y régler, jamais. */
export function plateformesHorsJeu({ plateformesOuvertes = [], plateformesFermees = [] } = {}) {
  const s = new Set(Array.isArray(plateformesFermees) ? plateformesFermees : []);
  if (!(Array.isArray(plateformesOuvertes) && plateformesOuvertes.includes("opla"))) s.add("opla");
  return s;
}

/** Le job a-t-il mis (ou remis) l'annonce en ligne ? Publiée, vendue, ou republication recréée. */
export function jobReussi(j) {
  if (!j) return false;
  if (j.status === "published" || j.status === "sold") return true;
  return actionDe(j) === "republish" && pfDe(j).republish_step === "recreated";
}

/** (Règle 5, cas B3) Une PUBLICATION en échec ou en attente qu'une réussite plus récente — même article, même
 *  plateforme — a dépassée : republication remise en ligne, ou nouvelle publication en ligne. L'annonce existe :
 *  ce vieil état n'a plus d'objet et ne s'affiche plus comme un geste à faire. Jamais une autre plateforme. */
export function jobSupplante(j, jobsDeLArticle) {
  if (!j || actionDe(j) !== "publish" || (j.status !== "failed" && j.status !== "needs_user")) return false;
  const t = tsDe(j.created_at);
  return (jobsDeLArticle ?? []).some((x) => x && !memeJob(x, j) && x.platform === j.platform
    && (x.inventaire_id == null || j.inventaire_id == null || String(x.inventaire_id) === String(j.inventaire_id))
    && (actionDe(x) === "publish" || actionDe(x) === "republish") && jobReussi(x) && tsDe(x.created_at) > t);
}

/** Le job est-il le plus récent de sa ligne (article × plateforme × action) ? La règle de « À régler » : une
 *  annulation, une relance ou une réussite plus récente l'emportent toujours sur un vieil état. */
export function estLeDernierDeSaLigne(j, jobsDeLArticle) {
  if (!j) return false;
  return !(jobsDeLArticle ?? []).some((x) => x && !memeJob(x, j) && x.platform === j.platform
    && actionDe(x) === actionDe(j) && plusRecentQue(x, j));
}

/** Le dernier job de chaque ligne (plateforme × action) d'un article — la règle de la carte et de « À régler ». */
export function derniersParLigne(jobs) {
  const m = new Map();
  for (const j of jobs ?? []) {
    if (!j) continue;
    const k = `${j.platform}|${actionDe(j)}`;
    const cur = m.get(k);
    if (!cur || plusRecentQue(j, cur)) m.set(k, j);
  }
  return [...m.values()];
}

// Une republication arrêtée APRÈS le retrait : l'annonce est hors ligne (même lecture que
// shared.republicationAnnonceDisparue et etat-job : étape deleted, ou deleted_at posé).
const republicationApresRetrait = (j) => { const pf = pfDe(j); return pf.republish_step === "deleted" || Boolean(pf.deleted_at); };

/**
 * LA RÈGLE DE « À RÉGLER » (25/10) — ce job demande-t-il un geste à la personne ?
 *   'completer' : une information, une connexion, une autorisation, un choix qui lui revient ;
 *   'echec'     : une publication pas partie (à relancer), ou une republication arrêtée APRÈS le retrait
 *                 (annonce hors ligne : la relance repart à la recréation) ;
 *   null        : rien à faire — en file, en pause (attente automatique, etat-job.js), en cours de
 *                 confirmation chez la plateforme, arrêtée, dépassée par une réussite ou par un job plus
 *                 récent de sa ligne, plateforme hors jeu, republication arrêtée avant tout retrait (l'annonce
 *                 est intacte : la relancer est un choix, jamais une alerte — l'emplacement dit « Arrêtée »).
 * Les retraits ont leurs propres règles (utils/retraitsBloques) : null ici.
 * opts : jobsDeLArticle (les jobs de la fiche : « le dernier », « dépassé ») ; plateformesHorsJeu (Set ou liste).
 */
export function causeARegler(j, { jobsDeLArticle = null, plateformesHorsJeu: horsJeu = null } = {}) {
  if (!j) return null;
  const action = actionDe(j);
  if (action !== "publish" && action !== "republish") return null;
  if (contient(horsJeu, j.platform)) return null;
  if (estArretUtilisateur(j) || estGeleLivres(j)) return null;
  if (jobsDeLArticle && !estLeDernierDeSaLigne(j, jobsDeLArticle)) return null;
  if (j.status === "needs_user") {
    if (attenteAutomatique(j)) return null;
    if (natureNeedsUser(j) === "en_cours") return null;
    if (jobsDeLArticle && jobSupplante(j, jobsDeLArticle)) return null;
    return "completer";
  }
  if (j.status === "failed") {
    if (action === "republish") return republicationApresRetrait(j) ? "echec" : null;
    if (jobsDeLArticle && jobSupplante(j, jobsDeLArticle)) return null;
    return "echec";
  }
  return null;
}

/**
 * (S3 du balayage) L'index d'état du Stock (utils/stockFiltres.indexEtatStock) selon la règle de « À régler » : ses
 * listes aCompleter / enEchec (une entrée par plateforme, { platform, job }) ne gardent que ce qui demande un geste
 * (causeARegler). Elles nourrissent les compteurs et le filtre « État » de la feuille, la pastille « à traiter » de
 * la carte et la vue « À régler » : une attente automatique, un échec suivi d'une annulation ou dépassé par une
 * republication réussie, une republication arrêtée avant tout retrait, une plateforme hors jeu n'y comptent plus.
 * Rend le même Map (les entrées inchangées gardent leur objet).
 */
export function indexSelonARegler(index, jobsParArticle, { plateformesHorsJeu: horsJeu = null } = {}) {
  if (!(index instanceof Map)) return index;
  for (const [id, e] of index) {
    if (!e?.aCompleter?.length && !e?.enEchec?.length) continue;
    const jobsDeLArticle = jobsParArticle?.[id] ?? [];
    const demande = (x) => Boolean(causeARegler(x?.job, { jobsDeLArticle, plateformesHorsJeu: horsJeu }));
    const aCompleter = (e.aCompleter ?? []).filter(demande);
    const enEchec = (e.enEchec ?? []).filter(demande);
    if (aCompleter.length !== (e.aCompleter ?? []).length || enEchec.length !== (e.enEchec ?? []).length) {
      index.set(id, { ...e, aCompleter, enEchec });
    }
  }
  return index;
}

/**
 * (Règle 2) La pastille de l'onglet Stock : les ARTICLES qui attendent un geste, lus sur les needs_user que l'App
 * relit seule (sans ouvrir le Stock). La règle de « À régler » (causeARegler) :
 *   · une publication ou une republication ne compte que sur une fiche EN STOCK (`enStock`) — un article vendu
 *     ou supprimé n'a plus rien à compléter (B4) ; une attente automatique ou une plateforme hors jeu, jamais (B1) ;
 *   · un RETRAIT qui attend la personne compte toujours (article vendu encore en ligne : la ligne « Vendu, encore
 *     en ligne » de « À régler »), sauf une attente automatique.
 * `enStock` (Set d'identifiants) absent : aucun filtre de fiche. Rend un Set d'identifiants d'articles.
 */
export function articlesARegler(jobs, { enStock = null, plateformesHorsJeu: horsJeu = null } = {}) {
  const ids = new Set();
  for (const j of jobs ?? []) {
    if (!j || j.status !== "needs_user" || j.inventaire_id == null) continue;
    const id = String(j.inventaire_id);
    if (actionDe(j) === "delete") {
      if (!attenteAutomatique(j)) ids.add(id);
      continue;
    }
    if (enStock && !enStock.has(id)) continue;
    if (causeARegler(j, { plateformesHorsJeu: horsJeu }) === "completer") ids.add(id);
  }
  return ids;
}

/**
 * (Règle 1, cas B1 et B2) L'emplacement de republication d'une attente AUTOMATIQUE (etat-job.js,
 * attenteAutomatique : relevé attendu, coupure technique avant tout retrait, plateforme écartée, mise à jour de
 * l'extension…) : « En pause » avec la phrase de la file (situationJob), jamais « À toi de jouer ». Rend
 * { cle: 'en_pause', court, titre, detail, apresSuppression } ou null — les couleurs restent celles de la carte.
 */
export function pastilleRepublicationEnPause(j, lang = "fr") {
  if (!j || j.status !== "needs_user" || !attenteAutomatique(j)) return null;
  const fr = lang !== "en";
  const apres = pfDe(j).republish_step === "deleted";
  const raison = String(situationJob(j, { lang: fr ? "fr" : "en" }).raison ?? libelleEtat(ETATS.EN_PAUSE, lang)).replace(/[\s.]+$/, "");
  return {
    cle: "en_pause",
    court: apres ? (fr ? "Hors ligne · en pause" : "Offline · paused") : libelleEtat(ETATS.EN_PAUSE, fr ? "fr" : "en"),
    apresSuppression: apres,
    titre: raison,
    detail: apres
      ? `${raison}. ${fr ? "Rien n'est perdu : toutes ses données (photos comprises) sont sauvegardées." : "Nothing is lost: all its data (photos included) is saved."}`
      : `${raison}.`,
  };
}

/** La dernière trace horodatée d'un job : création, mise en ligne, prise en main par l'ordinateur, retrait,
 *  recréation, verdict 404, dernier passage du veilleur — cross_post_jobs n'a pas d'updated_at lu ici. */
export function derniereTraceDuJob(j) {
  const pf = pfDe(j);
  const disp = pf.annonce_disparue && typeof pf.annonce_disparue === "object" ? pf.annonce_disparue : {};
  return Math.max(
    tsDe(j?.created_at), tsDe(j?.published_at), tsDe(pf.processing_since), tsDe(pf.deleted_at), tsDe(pf.recreated_at),
    tsDe(pf.introuvable_404?.at), tsDe(disp.le ?? disp.at), tsDe(pf.needs_user_tick_le),
  );
}

/** (B6, N1) La fiche est-elle REVUE EN LIGNE sur Vinted APRÈS ce job ? Le relevé du dressing (vinted_status
 *  « active », jamais disparue, fiche en stock) daté après la dernière trace du job — et, quand le job nomme son
 *  annonce exacte (identifiantAnnonceJob, la lecture du serveur), la fiche porte CETTE annonce (17/10, DeadRoz :
 *  une fiche qui porte une AUTRE annonce ne prouve rien). Sans preuve : false — jamais « en ligne » sur un doute. */
export function revueEnLigneApres(item, j) {
  if (!item || !j || j.platform !== "vinted") return false;
  if (!item.vinted_item_id || item.disparu_le || item.statut === "vendu" || item.vinted_status !== "active") return false;
  const cible = identifiantAnnonceJob(j);
  if (cible && cible !== String(item.vinted_item_id).trim()) return false;
  const vu = tsDe(item.last_synced_at);
  return vu > 0 && vu > derniereTraceDuJob(j);
}

/**
 * (Règle 1, cas B6 et N1) Une republication arrêtée (failed, cancelled) AVANT tout retrait libère-t-elle
 * l'emplacement de la carte — « ● En ligne » reprend sa place, comme après un arrêt demandé ?
 *   · rien n'a été touché (étape a_capturer, aucune suppression envoyée) : oui, l'annonce est telle qu'elle était ;
 *   · copie faite (captured), ou annonce dite disparue (404 à la capture) : seulement si la fiche est REVUE EN
 *     LIGNE après le job (revueEnLigneApres) — sinon « Arrêtée » / « Plus en ligne » restent, c'est le vrai ;
 *   · retirée (étape deleted, deleted_at, suppression envoyée) ou étape inconnue : jamais.
 */
export function republicationLibereeApresArret(j, item = null) {
  if (!j || actionDe(j) !== "republish" || (j.status !== "failed" && j.status !== "cancelled")) return false;
  const pf = pfDe(j);
  if (pf.deleted_at || pf.republish_suppression_envoyee || /Suppression envoy[ée]e/i.test(String(j.error ?? ""))) return false;
  // Valeur BRUTE (comme republishAnnulable) : une étape inconnue n'est jamais une preuve d'innocence.
  const etape = pf.republish_step;
  const avantRetrait = etape == null || etape === "a_capturer" || etape === "captured";
  if (!avantRetrait) return false;
  const disparue = pf.introuvable_404?.verdict === "disparue" || Boolean(pf.annonce_disparue);
  if (disparue || etape === "captured") return revueEnLigneApres(item, j);
  return true;
}
