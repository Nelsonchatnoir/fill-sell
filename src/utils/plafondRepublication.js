// ═══════════════════════════════════════════════════════════════════════════
// LA LIMITE DU JOUR, DITE AU CLIC (05/10, point 11 — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une republication MANUELLE n'est jamais bloquée par la limite quotidienne :
// tous les jobs se créent, get-pending-jobs retient ce qui dépasse et le
// relâche le lendemain, seul (« on retient, on n'annule jamais », 04/09).
// Mais la personne doit le savoir AU MOMENT du clic — pas le découvrir le soir
// devant une file immobile.
//
// Le calcul, sur l'état SERVEUR (get-pending-jobs, mode plafond_only — jamais
// recalculé ici) :
//   · ce qui reste aujourd'hui = limite − faits (republications PUBLIÉES
//     aujourd'hui, jour de Paris) − ce qui est déjà en file (pending +
//     processing) : la file part dans l'ordre d'arrivée (created_at
//     croissant), les plus anciennes d'abord ;
//   · les nouvelles prennent ce reste ; le surplus part les jours suivants.
// Le plafond vaut pour TOUTES les plateformes ensemble (le serveur compte les
// republications publiées sans filtre de plateforme) : nbEnvois est donc le
// nombre de paires article × plateforme de la feuille.
//
// SILENCE (null) quand :
//   · l'état est inconnu (lecture ratée, pas encore lue) — jamais un message
//     sur une panne ;
//   · Business, ou une limite hors d'atteinte (100 000 en coin_config) ;
//   · tout tient aujourd'hui.
// Pur (Node + Vite) : scripts/republication-plafond-message-selftest.mjs.

/** Au-delà, la limite n'est plus un frein réel (Business : 100 000). */
export const LIMITE_HORS_D_ATTEINTE = 10000;

const entier = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null);

/**
 * @param {object} p
 * @param {number} p.nbEnvois    republications que le clic va créer
 * @param {?object} p.etat       repubPlafondEtat {limite, faits, palier, …} | null
 * @param {number} [p.dejaEnFile] republications déjà en file (pending + processing)
 * @param {string} [p.lang]
 * @returns {null | {aujourdhui:number, plusTard:number, limite:number, demain:boolean, texte:string}}
 */
export function partageRepublicationsDuJour({ nbEnvois, etat, dejaEnFile = 0, lang = 'fr' }) {
  const n = entier(nbEnvois);
  if (!n || n <= 0) return null;
  if (!etat || typeof etat !== 'object') return null;
  const limite = entier(etat.limite);
  const faits = entier(etat.faits);
  if (limite == null || limite <= 0 || faits == null || faits < 0) return null;
  if (etat.palier === 'business' || limite >= LIMITE_HORS_D_ATTEINTE) return null;
  const enFile = Math.max(0, entier(dejaEnFile) ?? 0);
  const dispo = Math.max(0, limite - faits);
  const aujourdhui = Math.min(n, Math.max(0, dispo - enFile));
  const plusTard = n - aujourdhui;
  if (plusTard <= 0) return null;
  // Tout le surplus (file comprise) tient-il dans la journée de demain ?
  // Sinon on ne promet pas « demain » : « les jours suivants ».
  const surplus = Math.max(0, enFile + n - dispo);
  const demain = surplus <= limite;
  const fr = lang !== 'en';
  const repubs = (k) => (fr ? `${k} republication${k > 1 ? 's' : ''}` : `${k} repost${k > 1 ? 's' : ''}`);
  let texte;
  if (aujourdhui > 0) {
    texte = fr
      ? `Ta limite du jour est de ${repubs(limite)} : ${aujourdhui} ${aujourdhui > 1 ? 'partent' : 'part'} aujourd'hui, `
        + `${plusTard > 1 ? `les ${plusTard} autres partiront` : "l'autre partira"} ${demain ? 'demain' : 'les jours suivants'}, `
        + `${plusTard > 1 ? 'toutes seules' : 'toute seule'}. Rien n'est perdu.`
      : `Your daily limit is ${repubs(limite)}: ${aujourdhui} ${aujourdhui > 1 ? 'go' : 'goes'} out today, `
        + `${plusTard > 1 ? `the other ${plusTard} will go out` : 'the other one will go out'} ${demain ? 'tomorrow' : 'over the following days'}, `
        + `on ${plusTard > 1 ? 'their' : 'its'} own. Nothing is lost.`;
  } else {
    // Atteinte par ce qui est déjà PUBLIÉ, ou remplie par ce qui attend déjà
    // en file : deux phrases, jamais « atteinte » quand elle ne l'est pas.
    const tete = fr
      ? (faits >= limite ? `Ta limite du jour (${repubs(limite)}) est atteinte`
        : `Les republications déjà en file remplissent ta limite du jour (${repubs(limite)})`)
      : (faits >= limite ? `Your daily limit (${repubs(limite)}) is reached`
        : `The reposts already queued fill your daily limit (${repubs(limite)})`);
    texte = fr
      ? `${tete} : ${n > 1 ? `ces ${n} republications partiront` : 'cette republication partira'} `
        + `${demain ? 'dès demain' : 'à partir de demain'}, ${n > 1 ? 'toutes seules' : 'toute seule'}. Rien n'est perdu.`
      : `${tete}: ${n > 1 ? `these ${n} reposts will go out` : 'this repost will go out'} `
        + `${demain ? 'tomorrow' : 'from tomorrow onwards'}, on ${n > 1 ? 'their' : 'its'} own. Nothing is lost.`;
  }
  return { aujourdhui, plusTard, limite, demain, texte };
}
