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
// (17/10, décision de Nico) La limite se dit EN ENTIER : qu'elle est atteinte,
// que la file repart à minuit (heure de Paris), et combien de temps il faut
// pour l'écouler (« ça prendra environ N jours »), AVANT le clic comme pendant
// la retenue (phraseLimiteAtteinte : carte du haut du Stock, « Ta file »).
// Exception écrite à la règle du 16/10 « aucun temps estimé » : minuit est la
// règle du plafond (le compteur du serveur repart au jour de Paris), N est un
// calcul sur la limite du palier — jamais une vitesse mesurée. Les lignes de
// texte portent le marqueur `estimation-ok:`.
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
const jourParisDe = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

/**
 * Ce que la limite fait de la file (pur calcul, jour de Paris).
 *   · aujourd'hui = ce qui part encore aujourd'hui (limite − faits) ;
 *   · le reste part à partir de minuit, `limite` par jour ;
 *   · jours = jours de calendrier où la file part (aujourd'hui compris s'il
 *     en part au moins une).
 * Un état lu AVANT minuit (écran resté ouvert) : le jour a tourné, le
 * compteur du serveur aussi — faits repart de 0.
 *
 * @param {object} p
 * @param {?object} p.etat       repubPlafondEtat {limite, faits, palier, jour, …} | null
 * @param {number} [p.enFile]    republications déjà en file (pending + processing)
 * @param {number} [p.nouvelles] republications que le clic va créer
 * @param {number} [p.maintenant]
 * @returns {null | {limite:number, faits:number, total:number, aujourdhui:number, joursSuivants:number, jours:number, atteinte:boolean}}
 */
export function ecoulementFile({ etat, enFile = 0, nouvelles = 0, maintenant = Date.now() }) {
  if (!etat || typeof etat !== 'object') return null;
  const limite = entier(etat.limite);
  let faits = entier(etat.faits);
  if (limite == null || limite <= 0 || faits == null || faits < 0) return null;
  if (etat.palier === 'business' || limite >= LIMITE_HORS_D_ATTEINTE) return null;
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(etat.jour ?? '')) ? String(etat.jour) : null;
  if (jour && jour !== jourParisDe(maintenant)) faits = 0;
  const total = Math.max(0, entier(enFile) ?? 0) + Math.max(0, entier(nouvelles) ?? 0);
  if (total <= 0) return null;
  const aujourdhui = Math.min(total, Math.max(0, limite - faits));
  const joursSuivants = Math.ceil((total - aujourdhui) / limite);
  return {
    limite, faits, total, aujourdhui, joursSuivants,
    jours: joursSuivants + (aujourdhui > 0 ? 1 : 0),
    atteinte: faits >= limite,
  };
}

// Espace insécable après chaque nombre : jamais « 5 » seul en fin de ligne.
const repubsDe = (fr) => (k) => (fr ? `${k}\u00a0republication${k > 1 ? 's' : ''}` : `${k}\u00a0repost${k > 1 ? 's' : ''}`);
const joursDe = (fr) => (k) => (fr ? `${k}\u00a0jour${k > 1 ? 's' : ''}` : `${k}\u00a0day${k > 1 ? 's' : ''}`);

/**
 * AU CLIC : combien partent aujourd'hui, et le reste.
 * @param {object} p
 * @param {number} p.nbEnvois    republications que le clic va créer
 * @param {?object} p.etat       repubPlafondEtat {limite, faits, palier, …} | null
 * @param {number} [p.dejaEnFile] republications déjà en file (pending + processing)
 * @param {string} [p.lang]
 * @param {number} [p.maintenant]
 * @returns {null | {aujourdhui:number, plusTard:number, limite:number, demain:boolean, jours:number, texte:string}}
 */
export function partageRepublicationsDuJour({ nbEnvois, etat, dejaEnFile = 0, lang = 'fr', maintenant = Date.now() }) {
  const n = entier(nbEnvois);
  if (!n || n <= 0) return null;
  const e = ecoulementFile({ etat, enFile: dejaEnFile, nouvelles: n, maintenant });
  if (!e) return null;
  const enFile = Math.max(0, entier(dejaEnFile) ?? 0);
  // La file part dans l'ordre d'arrivée : ce qui attend déjà passe avant.
  const aujourdhui = Math.min(n, Math.max(0, Math.max(0, e.limite - e.faits) - enFile));
  const plusTard = n - aujourdhui;
  if (plusTard <= 0) return null;
  // Tout le surplus (file comprise) tient-il dans la journée de demain ?
  // Sinon on ne promet pas « demain » : on dit la durée de toute la file.
  const demain = e.joursSuivants <= 1;
  const fr = lang !== 'en';
  const repubs = repubsDe(fr);
  const jours = joursDe(fr);
  const quand = demain
    ? (fr ? 'demain, dès minuit (heure de Paris)' : 'tomorrow, from midnight (Paris time)') // estimation-ok: règle du plafond (minuit, heure de Paris) — Nico, 17/10
    : (fr ? `à partir de minuit (heure de Paris), ${e.limite}\u00a0par jour` : `from midnight (Paris time), ${e.limite}\u00a0a day`); // estimation-ok: règle du plafond — Nico, 17/10
  const duree = demain ? ''
    : (fr ? ` Pour toute ta file, ça prendra environ ${jours(e.jours)}.` : ` For your whole queue, it will take about ${jours(e.jours)}.`); // estimation-ok: « ça prendra environ N jours », calcul sur la limite du palier — Nico, 17/10
  const seules = fr ? (plusTard > 1 ? 'Elles partent toutes seules' : 'Elle part toute seule')
    : (plusTard > 1 ? 'They go out on their own' : 'It goes out on its own');
  let texte;
  if (aujourdhui > 0) {
    texte = fr
      ? `Ta limite est de ${repubs(e.limite)} par jour (toutes plateformes) : ${aujourdhui}\u00a0${aujourdhui > 1 ? 'partent' : 'part'} aujourd'hui, `
        + `${plusTard > 1 ? `les ${plusTard}\u00a0autres` : "l'autre"} ${quand}.${duree} ${seules}, rien n'est perdu.`
      : `Your limit is ${repubs(e.limite)} a day (all platforms): ${aujourdhui} ${aujourdhui > 1 ? 'go' : 'goes'} out today, `
        + `${plusTard > 1 ? `the other ${plusTard}` : 'the other one'} ${quand}.${duree} ${seules}, nothing is lost.`;
  } else {
    // Atteinte par ce qui est déjà PUBLIÉ, ou remplie par ce qui attend déjà
    // en file : deux phrases, jamais « atteinte » quand elle ne l'est pas.
    const tete = fr
      ? (e.faits >= e.limite ? `Ta limite du jour (${repubs(e.limite)}, toutes plateformes) est atteinte`
        : `Les republications déjà en file remplissent ta limite du jour (${repubs(e.limite)}, toutes plateformes)`)
      : (e.faits >= e.limite ? `Your daily limit (${repubs(e.limite)}, all platforms) is reached`
        : `The reposts already queued fill your daily limit (${repubs(e.limite)}, all platforms)`);
    texte = fr
      ? `${tete} : ${n > 1 ? `ces ${n}\u00a0republications partiront` : 'cette republication partira'} ${quand}.${duree} ${seules}, rien n'est perdu.`
      : `${tete}: ${n > 1 ? `these ${n} reposts will go out` : 'this repost will go out'} ${quand}.${duree} ${seules}, nothing is lost.`;
  }
  return { aujourdhui, plusTard, limite: e.limite, demain, jours: e.jours, texte };
}

/**
 * PENDANT LA RETENUE (motif « plafond » seulement : la pause de respiration
 * garde sa phrase). La limite est atteinte : la file repart à minuit, et voici
 * combien de jours il faut pour l'écouler.
 * @param {object} p
 * @param {?object} p.etat    repubPlafondEtat (retenue, motif, limite, faits, jour)
 * @param {number} p.enFile   republications en file (pending + processing), toutes plateformes
 * @param {string} [p.lang]
 * @param {number} [p.maintenant]
 * @returns {?string}
 */
export function phraseLimiteAtteinte({ etat, enFile = 0, lang = 'fr', maintenant = Date.now() }) {
  if (!etat || etat.retenue !== true || etat.motif !== 'plafond') return null;
  const e = ecoulementFile({ etat, enFile, maintenant });
  if (!e || !e.atteinte) return null;
  const fr = lang !== 'en';
  const repubs = repubsDe(fr);
  const jours = joursDe(fr);
  const tete = fr ? `Limite du jour atteinte (${e.faits} sur ${repubs(e.limite)}, toutes plateformes)`
    : `Daily limit reached (${e.faits} of ${repubs(e.limite)}, all platforms)`;
  const suite = e.joursSuivants <= 1
    ? (fr ? `${e.total > 1 ? `les ${e.total}\u00a0en file repartent` : 'celle en file repart'} demain, dès minuit (heure de Paris), ${e.total > 1 ? 'toutes seules' : 'toute seule'}` // estimation-ok: règle du plafond (minuit, heure de Paris) — Nico, 17/10
      : `${e.total > 1 ? `the ${e.total} queued resume` : 'the queued one resumes'} tomorrow, from midnight (Paris time), on ${e.total > 1 ? 'their' : 'its'} own`) // estimation-ok: règle du plafond — Nico, 17/10
    : (fr ? `les ${e.total}\u00a0en file repartent à minuit (heure de Paris), ${e.limite}\u00a0par jour : ça prendra environ ${jours(e.joursSuivants)}` // estimation-ok: « environ N jours », calcul sur la limite du palier — Nico, 17/10
      : `the ${e.total} queued resume at midnight (Paris time), ${e.limite}\u00a0a day: it will take about ${jours(e.joursSuivants)}`); // estimation-ok: calcul sur la limite du palier — Nico, 17/10
  return fr ? `${tete} : ${suite}. Rien à faire, rien n'est perdu.` : `${tete}: ${suite}. Nothing to do, nothing is lost.`;
}
