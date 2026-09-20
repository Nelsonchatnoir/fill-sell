// ═══════════════════════════════════════════════════════════════════════════
// ABANDONNER UNE PLATEFORME POUR UN ARTICLE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// LE TROU : un job bloqué n'avait AUCUNE sortie. Le seul bouton offert sur un
// `needs_user` est « Relancer », et relancer ne sert à rien quand la cause
// n'est pas corrigeable — eBay qui refuse le rayon qu'on lui propose, Beebs
// qui refuse une taille qui n'existe pas dans son rayon enfant. La seule
// façon de fermer la ligne était de SUPPRIMER L'ARTICLE, ce qui emporte tout
// le reste : les autres plateformes, l'historique, la fiche.
// Mesuré sur le compte de Nico le 20/09 : deux lignes « attend une action »
// que rien ne pouvait clore, pour deux articles parfaitement sains.
//
// CE QUE LE GESTE FAIT, ET RIEN D'AUTRE : il clôt CE job, pour CETTE
// plateforme. L'article n'est pas touché, les autres plateformes non plus,
// et l'article reste republiable sur cette plateforme plus tard (un job
// terminal n'interdit rien).
//
// ⛔ CE N'EST PAS UN BOUTON « FAIRE TAIRE ». Un abandon reste TRACÉ, avec son
//    motif : le message d'origine est archivé dans `erreurs_archivees` (même
//    mécanique que la relance manuelle), `abandon_utilisateur` porte la date
//    et l'état d'où l'on vient, et l'erreur affichée dit le geste en clair.
//    Sans ça, le geste deviendrait un moyen de masquer un défaut — et on
//    perdrait exactement les signaux qui ont produit les correctifs du 20/09.
//
// ⛔ JAMAIS SUR UN RETRAIT. Abandonner un `delete` laisserait une annonce EN
//    LIGNE alors que l'app la croit retirée : c'est le pire des cas (règle du
//    18/09, « un delete en échec a besoin d'une porte PLUS que les autres »).
// ⛔ JAMAIS QUAND QUELQUE CHOSE EST EN LIGNE. Un job qui porte un
//    `listing_url` a déposé : le fermer ferait perdre le lien de l'annonce.
//    Celle-là se RETIRE (geste de retrait), elle ne s'abandonne pas.
// ⛔ JAMAIS SUR UNE REPUBLICATION. Elle a déjà sa sortie (« Arrêter les
//    republications », StockTab) et, passée l'étape `deleted`, l'annonce est
//    retirée mais pas encore redéposée : l'abandonner perdrait l'annonce.
// ⛔ JAMAIS SUR UN JOB EN VOL (`pending`, `processing`) : une extension peut
//    l'avoir en main à cet instant. On n'abandonne que ce qui est ARRÊTÉ.

/** Les deux seuls états où un job attend une décision humaine sans avancer. */
export const STATUTS_ABANDONNABLES = ['needs_user', 'failed'];

/**
 * Peut-on abandonner cette plateforme pour cet article ?
 * @returns {{ok: true} | {ok: false, motif: string}} — `motif` est une clé
 *          technique, jamais un texte d'écran : l'appelant choisit ses mots.
 */
export function abandonPossible(job) {
  if (!job || !job.id) return { ok: false, motif: 'job_absent' };
  const action = job.action ?? 'publish';
  if (action !== 'publish') return { ok: false, motif: 'pas_un_depot' };
  if (!STATUTS_ABANDONNABLES.includes(job.status)) return { ok: false, motif: 'pas_arrete' };
  if (String(job.listing_url ?? '').trim() || String(job.platform_listing_id ?? '').trim()) {
    return { ok: false, motif: 'annonce_en_ligne' };
  }
  if (job.platform_fields?.abandon_utilisateur) return { ok: false, motif: 'deja_abandonne' };
  return { ok: true };
}

/** Le message porté par le job après l'abandon — c'est ce que la personne
 *  relira dans six mois en rouvrant l'article. Il dit QUI a arrêté et QUE
 *  rien n'est parti ; le motif d'origine, lui, vit dans `erreurs_archivees`. */
export function messageAbandon(platformLabel, lang = 'fr') {
  return lang === 'en'
    ? `Stopped at your request — ${platformLabel} was abandoned for this item. Nothing was published, nothing was charged. You can publish it there again at any time.`
    : `Arrêté à ta demande — tu as abandonné ${platformLabel} pour cet article. Rien n'a été publié, rien n'a été décompté. Tu peux le republier là-bas quand tu veux.`;
}

/**
 * Le `platform_fields` à écrire. `archiver` est la fonction d'archivage de
 * l'appelant (archiverErreur, StockTab) : on ne la duplique pas ici, c'est
 * elle qui porte la forme du journal d'erreurs.
 */
export function champsApresAbandon(job, archiver) {
  const pf = { ...(job.platform_fields ?? {}) };
  pf.abandon_utilisateur = {
    le: new Date().toISOString(),
    depuis_statut: job.status,
    plateforme: job.platform,
  };
  // Le motif D'ORIGINE est archivé avant d'être remplacé : c'est lui qui
  // documente POURQUOI la plateforme a été abandonnée, et c'est le signal
  // qu'on veut garder pour corriger la cause.
  if (typeof archiver === 'function') {
    pf.erreurs_archivees = archiver(pf.erreurs_archivees, job.error, job.status, 'abandon_plateforme');
  }
  // Une reprise automatique en attente n'a plus lieu d'être.
  delete pf.next_action_after;
  delete pf.attente_session;
  return pf;
}
