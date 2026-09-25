// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION RETIRÉE NE S'ARRÊTE JAMAIS AVANT SA RECRÉATION (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico, mot pour mot : « une republication ne doit JAMAIS s'arrêter
// entre le retrait et la recréation. Après un retrait, la recréation se retente
// seule jusqu'à aboutir, sans demander d'action à l'utilisateur. »
//
// CE QUI S'EST PASSÉ (LES PETITES FIOLES, job fb358c75, 25/09). Le calendrier
// de l'Avent a été retiré de Leboncoin à 11:44 ; trois recréations ont buté
// sur « Timeout: pas de réponse du content script » (11:53, 12:00, 12:33) ;
// l'extension a alors écrit needs_user « Clique « Republier maintenant » », et
// le serveur l'a affiché « Relance-la depuis la fiche de l'article quand tu
// veux ». L'annonce est restée HORS LIGNE, en attendant un clic que rien ne
// réclamait vraiment : le défaut était chez nous.
//
// LA RÈGLE, bornée à ce seul cas : une republication à l'étape 'deleted'
// (l'annonce d'origine n'existe plus, la recréation n'a pas abouti) qui
// remonte `needs_user` ou `failed` repart en `pending`, avec une reprise
// ESPACÉE (5, 10, 20, 30, 60, 120 min, puis toutes les 4 h) et UN message qui
// dit l'état réel. Les compteurs d'attente de l'utilisateur ne bougent pas :
// le défaut est chez nous.
//
// ⛔ CE QUI GARDE LA MAIN, parce qu'aucune reprise ne peut aboutir sans eux :
//    · un MUR qui se lève tout seul et relance déjà le job (connexion,
//      autorisation Opla, cookies Opla, compte eBay) — le bouton existe ;
//    · une QUESTION (champ à choisir, capture incomplète) — on n'invente
//      jamais une valeur ;
//    · une IMPASSE nommée (copie de dépôt ou capture introuvable, prix
//      irrésoluble, plusieurs annonces identiques déjà en ligne) — retenter
//      ne changerait rien, et la dernière serait un doublon.
// ⛔ JAMAIS DE DOUBLON : si la tentative ratée avait atteint l'envoi du dépôt,
//    la reprise porte `verifier_doublon_avant_publication` — l'extension relit
//    « Mes annonces » avant de redéposer (processJob, depuis le 07/09).

const NOM = {
  vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla",
};

/** Paliers de reprise, en minutes ; au-delà du dernier, toutes les 4 h. */
export const PALIERS_REPRISE_MIN = [5, 10, 20, 30, 60, 120];
export const REPRISE_MAX_MIN = 240;

/** Murs qui rendent la main à un geste précis ET relancent seuls à la levée. */
const SOURCES_MUR = new Set([
  "connexion", "session_vinted", "attente_session", "opla_acces", "opla_cookies",
  "ebay_connexion_requise", "ebay_compte_vendeur_inactif",
]);
/** Questions : une valeur à choisir, jamais devinée. */
const SOURCES_QUESTION = new Set(["capture_incomplete", "champ_a_choisir"]);

const MUR_TEXTE_RE = /^Connexion \S+ requise|^REAUTH VENTE eBay/i;
const IMPASSE_RE =
  /capture introuvable ou invalide|copie de dépôt est introuvable|prix de la nouvelle annonce n'a pas pu être déterminé|plusieurs annonces identiques|Étape de republication inconnue/i;
/** La tentative ratée a pu partir chez la plateforme : on vérifie avant de redéposer. */
const ENVOI_PARTI_RE = /adsubmit|issue inconnue|d'issue INCONNUE|demande de publication est partie|dépôt peut-être abouti/i;
const ETAPES_ENVOI = new Set(["depot", "options"]);
/** Vérification anti-robot : on ne retape pas la porte toutes les 5 min (même
 *  espacement que pas-de-rouge, 45 min au moins). */
const ANTIROBOT_RE = /CHALLENGE|anti-?robot|access_denied|DataDome/i;
export const ANTIROBOT_MIN = 45;

function heureDeParis(ms) {
  try {
    return new Date(ms).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

/** Le message unique, cohérent avec l'état réel : retirée, pas encore revenue, reprise auto. */
export function messageRecreationEnCours(platform, prochainEssaiMs) {
  const nom = NOM[platform] ?? "la plateforme";
  const heure = Number.isFinite(prochainEssaiMs) ? heureDeParis(prochainEssaiMs) : null;
  return `Ton annonce a été retirée de ${nom} et n'est pas encore revenue en ligne : sa remise en ligne ` +
    `n'a pas abouti à l'essai précédent. On réessaie tout seuls${heure ? ` vers ${heure}` : ""} — rien à faire ` +
    "de ton côté. Rien n'est perdu : titre, description, photos et champs sont conservés tels quels.";
}

function aUneQuestion(pf) {
  if (pf.needsUserField && typeof pf.needsUserField === "object") return true;
  if (Array.isArray(pf.needsUserFields) && pf.needsUserFields.length) return true;
  if (Array.isArray(pf.champs_a_completer) && pf.champs_a_completer.length) return true;
  return SOURCES_QUESTION.has(String(pf.needs_user_source ?? ""));
}

/**
 * Décide si l'écriture entrante doit être requalifiée en reprise.
 *
 * @param {object} a
 * @param {string} a.action      action du job EN BASE ('republish', …)
 * @param {string} a.platform    plateforme du job en base
 * @param {string} a.statut      statut retenu jusqu'ici par update-job-status
 * @param {object} a.pf          platform_fields qui vont être écrits (la vue la plus récente)
 * @param {object} a.pfEnBase    platform_fields actuellement en base
 * @param {string} [a.brut]      texte brut envoyé par l'extension
 * @param {string} [a.reecrit]   texte retenu jusqu'ici pour l'écran
 * @param {number} [a.maintenant]
 * @returns {null | { statut: "pending", message: string, pf: object, n: number, dansMinutes: number, motif: string }}
 */
export function decisionRecreationHorsLigne(a) {
  const maintenant = Number.isFinite(a?.maintenant) ? a.maintenant : Date.now();
  if (a?.action !== "republish") return null;
  if (a.statut !== "needs_user" && a.statut !== "failed") return null;
  const pf = (a.pf && typeof a.pf === "object") ? a.pf : {};
  const pfEnBase = (a.pfEnBase && typeof a.pfEnBase === "object") ? a.pfEnBase : {};
  const etape = String(pf.republish_step ?? pfEnBase.republish_step ?? "");
  if (etape !== "deleted") return null;

  const texte = `${String(a.brut ?? "")}\n${String(a.reecrit ?? "")}`;
  const source = String(pf.needs_user_source ?? "");
  if (SOURCES_MUR.has(source) || MUR_TEXTE_RE.test(String(a.brut ?? "").trim()) || MUR_TEXTE_RE.test(String(a.reecrit ?? "").trim())) return null;
  if (aUneQuestion(pf)) return null;
  if (IMPASSE_RE.test(texte) || pf.recreation_doublon) return null;

  // Palier : une même tentative ratée remonte souvent DEUX écritures à la
  // suite (le dépôt écrit failed, la republication needs_user) — elles ne
  // comptent qu'une fois.
  const precedente = (pfEnBase.recreation_reprise && typeof pfEnBase.recreation_reprise === "object")
    ? pfEnBase.recreation_reprise : null;
  const nAvant = Number(pfEnBase.recreation_reprises ?? pf.recreation_reprises ?? 0) || 0;
  const recente = precedente && maintenant - Date.parse(String(precedente.at ?? "")) < 90_000;
  const n = recente ? Math.max(1, nAvant) : nAvant + 1;
  const palier = PALIERS_REPRISE_MIN[n - 1] ?? REPRISE_MAX_MIN;
  const dansMinutes = ANTIROBOT_RE.test(texte) ? Math.max(palier, ANTIROBOT_MIN) : palier;
  const prochain = recente && Number.isFinite(Date.parse(String(pfEnBase.next_action_after ?? "")))
    ? Date.parse(String(pfEnBase.next_action_after))
    : maintenant + dansMinutes * 60_000;

  const pfNeuf = { ...pf };
  pfNeuf.republish_step = "deleted";
  pfNeuf.recreation_reprises = n;
  pfNeuf.recreation_reprise = {
    at: new Date(maintenant).toISOString(),
    n,
    statut_recu: a.statut,
    brut: String(a.brut ?? "").slice(0, 300),
  };
  pfNeuf.next_action_after = new Date(prochain).toISOString();
  // Le budget de l'utilisateur n'est pas consommé : le défaut est chez nous.
  for (const k of [
    "needsUserAttempts", "needsUserBoucle", "processing_since", "republish_recreation",
    "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
  ]) delete pfNeuf[k];
  if (source === "relancer") delete pfNeuf.needs_user_source;

  // Anti-doublon : la tentative ratée avait-elle atteint l'envoi du dépôt ?
  const fin = pf.work_window_state?.at_end ?? pfEnBase.work_window_state?.at_end ?? null;
  const etapeFin = String(fin?.fill_step ?? "");
  const urlFin = String(fin?.tab_url ?? "");
  if (ETAPES_ENVOI.has(etapeFin) || /\/options(?:[/?#]|$)/.test(urlFin) || ENVOI_PARTI_RE.test(texte)) {
    pfNeuf.verifier_doublon_avant_publication = true;
  }

  return {
    statut: "pending",
    message: messageRecreationEnCours(a.platform, prochain),
    pf: pfNeuf,
    n,
    dansMinutes,
    motif: pfNeuf.verifier_doublon_avant_publication ? "recreation_reprise_verif_doublon" : "recreation_reprise",
  };
}
