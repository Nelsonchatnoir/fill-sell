// ── ATTENTE DE BOUTIQUE VINTED — source unique de vérité (2026-09-06 soir) ───
//
// POURQUOI CE FICHIER EXISTE. Le régime multi-boutiques (03-04/09) a été écrit
// trois fois de suite, à trois endroits, avec trois formulations et trois
// périmètres différents :
//   · StockTab `attentesParBoutique` — lit le marqueur platform_fields
//     .attente_boutique posé par l'extension, donc SEULEMENT les republications
//     encore à l'étape 'a_capturer' (103 jobs sur 173 étaient déjà 'captured'
//     le 04/09 : invisibles) ;
//   · StockTab `pauseBoutique` — recalcule côté app le miroir de la garde
//     serveur, mais pour les republications SEULES ;
//   · RepublishSheet — refait le même calcul une troisième fois, à l'annonce
//     de masse.
// Aucun des trois ne connaissait les jobs de SUPPRESSION (action='delete') —
// et c'est exactement ce qui a mordu claeys59450 le 06/09 à 19:09 : un retrait
// d'annonce parti pendant une bascule de boutique, refusé par Vinted en
// HTTP 403 {"code":106,"message":"Accès refusé","message_code":"access_denied"}
// (un refus de PROPRIÉTÉ, session vivante), qui a brûlé ses tentatives et
// affiché un échec là où il n'y avait qu'une attente.
//
// Ce module tient LE calcul et LES phrases, une fois pour toutes. Il est le
// miroir EXACT de la garde de `supabase/functions/get-pending-jobs/index.ts`
// (périmètre republish + delete sur Vinted, mêmes deux fail-open) : l'écran
// doit dire précisément ce que le serveur fait, ni plus ni moins.
//
// ⛔ CE N'EST PAS UNE ERREUR. Un job en attente de boutique n'a rien perdu,
// rien tenté, rien consommé : il n'est simplement pas distribué. Il repart
// TOUT SEUL dès que le bon compte Vinted est reconnecté dans Chrome. Aucun
// bouton, aucune relance — donc aucun rouge, aucun « échec », aucun geste
// réclamé autre que « reconnecte-toi ».

// Les deux seules actions qui portent une origine à trahir. Une PUBLICATION
// crée une annonce neuve : elle n'appartient encore à personne, elle n'entre
// jamais ici (même règle que le serveur).
export const ACTIONS_LIEES_A_UNE_BOUTIQUE = ['republish', 'delete'];

// Statuts « le job est encore devant lui » — les seuls qui méritent d'être
// annoncés comme une attente.
const STATUTS_EN_VOL = ['pending', 'processing'];

/** Origine estampillée d'un article. '' = inconnue → fail-open, comme au serveur. */
export function origineArticle(item) {
  const v = item?.vinted_account_id;
  return v == null ? '' : String(v).trim();
}

/** Un job est-il soumis au cloisonnement par boutique ? */
export function jobLieAUneBoutique(job) {
  return !!job
    && ACTIONS_LIEES_A_UNE_BOUTIQUE.includes(job.action)
    && job.platform === 'vinted'
    && job.inventaire_id != null
    && STATUTS_EN_VOL.includes(job.status);
}

// ── Le NOM, jamais l'identifiant (règle Nico, 06/09) ────────────────────────
// Un « 3134424277 » à l'écran n'apprend rien à personne. On résout le pseudo
// dans la liste des boutiques confirmées (profiles.vinted_sync_pin) ; à défaut
// on dit « une autre de tes boutiques » — un libellé humain, jamais un nombre.
// (Le rattrapage des pseudos manquants vit dans vintedSync.completerLoginsBoutiques :
//  il va les chercher dans vinted_sync_runs et les REPOSE dans le pin.)
export function nomBoutique(userId, boutiques = [], lang = 'fr') {
  const id = userId == null ? '' : String(userId).trim();
  const b = (boutiques || []).find((x) => String(x?.user_id ?? '') === id);
  if (b?.login) return `@${b.login}`;
  return lang === 'en' ? 'another of your shops' : 'une autre de tes boutiques';
}

/**
 * LE calcul. Miroir exact de la garde serveur.
 *
 * @param {object}   p
 * @param {object[]} p.jobs      liste PLATE de jobs (action, platform, status, inventaire_id)
 * @param {Map|object} p.origines  id d'article → vinted_account_id ('' = inconnue)
 * @param {?object}  p.connectee { userId, login } — la boutique vue dans Chrome, null si non relevée
 * @param {object[]} p.boutiques  boutiques confirmées [{ user_id, login }]
 * @param {string}   p.lang
 * @returns {?{connectee: {userId: string, login: ?string, nom: string},
 *             total: number, republish: number, suppression: number,
 *             boutiques: {userId: string, login: ?string, nom: string,
 *                         total: number, republish: number, suppression: number}[]}}
 *          null quand il n'y a RIEN à dire (les deux fail-open compris).
 */
export function etatAttenteBoutique({ jobs = [], origines = new Map(), connectee = null, boutiques = [], lang = 'fr' }) {
  // Fail-open n°1 : sans identité relevée, on ne devine pas qui est connecté.
  if (!connectee?.userId) return null;
  const connecteeId = String(connectee.userId).trim();
  if (!connecteeId) return null;

  const lireOrigine = (invId) => {
    const cle = String(invId);
    const v = origines instanceof Map ? origines.get(cle) : origines?.[cle];
    return v == null ? '' : String(v).trim();
  };

  const par = new Map();
  for (const job of jobs) {
    if (!jobLieAUneBoutique(job)) continue;
    const o = lireOrigine(job.inventaire_id);
    // Fail-open n°2 : origine inconnue (article saisi à la main, importé avant
    // le multi-boutiques, ou disparu de l'inventaire) → on ne retient rien.
    if (!o || o === connecteeId) continue;
    const e = par.get(o) ?? { userId: o, total: 0, republish: 0, suppression: 0 };
    e.total += 1;
    if (job.action === 'delete') e.suppression += 1; else e.republish += 1;
    par.set(o, e);
  }
  if (!par.size) return null;

  const liste = [...par.values()]
    .map((e) => ({
      ...e,
      login: (boutiques || []).find((b) => String(b?.user_id ?? '') === e.userId)?.login ?? null,
      nom: nomBoutique(e.userId, boutiques, lang),
    }))
    .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom));

  return {
    connectee: {
      userId: connecteeId,
      login: connectee.login ?? null,
      nom: connectee.login ? `@${connectee.login}` : nomBoutique(connecteeId, boutiques, lang),
    },
    total: liste.reduce((n, e) => n + e.total, 0),
    republish: liste.reduce((n, e) => n + e.republish, 0),
    suppression: liste.reduce((n, e) => n + e.suppression, 0),
    boutiques: liste,
  };
}

// ── Les PHRASES ─────────────────────────────────────────────────────────────
// Nommer les deux boutiques, dire le nombre, dire que ça repart tout seul. Pas
// de code d'erreur, pas de « échec », pas de bouton : il n'y a rien à relancer.

/** « 12 republications et 1 retrait d'annonce » — le quoi, exact, jamais approximatif. */
function quoiAttend({ republish, suppression }, lang) {
  const fr = lang !== 'en';
  const bouts = [];
  if (republish) {
    bouts.push(fr
      ? `${republish} republication${republish > 1 ? 's' : ''}`
      : `${republish} repost${republish > 1 ? 's' : ''}`);
  }
  if (suppression) {
    bouts.push(fr
      ? `${suppression} retrait${suppression > 1 ? 's' : ''} d'annonce`
      : `${suppression} listing removal${suppression > 1 ? 's' : ''}`);
  }
  return fr ? bouts.join(' et ') : bouts.join(' and ');
}

/**
 * Une ligne PAR boutique attendue, prête à afficher.
 * @returns {string[]} vide si `etat` est null.
 */
export function lignesAttenteBoutique(etat, lang = 'fr') {
  if (!etat) return [];
  const fr = lang !== 'en';
  return etat.boutiques.map((b) => {
    const quoi = quoiAttend(b, lang);
    return fr
      ? `${quoi} concerne${b.total > 1 ? 'nt' : ''} ${b.nom} et reprendr${b.total > 1 ? 'ont' : 'a'} automatiquement dès que tu t'y reconnecteras.`
      : `${quoi} belong${b.total > 1 ? '' : 's'} to ${b.nom} and will resume automatically as soon as you sign back in to it.`;
  });
}

/** « Tu es actuellement sur la boutique @x. » — la phrase d'ancrage, toujours en tête. */
export function phraseBoutiqueActive(etatOuConnectee, lang = 'fr') {
  const c = etatOuConnectee?.connectee ?? etatOuConnectee;
  if (!c?.userId) {
    return lang === 'en'
      ? 'Shop signed in in Chrome: not seen yet — it shows up once your computer wakes up.'
      : "Boutique connectée dans Chrome : pas encore relevée — elle apparaît dès que ton ordinateur se réveille.";
  }
  const nom = c.nom ?? (c.login ? `@${c.login}` : null);
  return lang === 'en'
    ? `You are currently on the ${nom ?? 'shop'} shop.`
    : `Tu es actuellement sur la boutique ${nom ?? 'connectée'}.`;
}

/** La rassurance, dite UNE fois, jamais répétée par ligne. */
export function phraseRassurance(lang = 'fr') {
  return lang === 'en'
    ? 'Nothing is lost and nothing failed — they are simply waiting.'
    : "Rien n'est perdu, rien n'a échoué — ils attendent, c'est tout.";
}

/**
 * Le MÊME message, sur la fiche d'un article — jamais un « en attente » muet.
 * @param {object} p
 * @param {?object} p.connectee { userId, login }
 * @param {string}  p.origine   vinted_account_id de l'article
 * @param {object[]} p.boutiques
 * @param {string}  p.action    'republish' | 'delete'
 * @returns {?{court: string, titre: string, detail: string}} null si rien à dire.
 */
export function messageFicheAttenteBoutique({ connectee, origine, boutiques = [], action = 'republish', lang = 'fr' }) {
  const o = origine == null ? '' : String(origine).trim();
  if (!connectee?.userId || !o) return null;              // les deux fail-open
  const connecteeId = String(connectee.userId).trim();
  if (!connecteeId || o === connecteeId) return null;
  const fr = lang !== 'en';
  const nomA = nomBoutique(o, boutiques, lang);
  const nomB = connectee.login ? `@${connectee.login}` : nomBoutique(connecteeId, boutiques, lang);
  const quoi = action === 'delete'
    ? (fr ? 'Ce retrait' : 'This removal')
    : (fr ? 'Cette republication' : 'This repost');
  return {
    court: fr ? `Attend ${nomA}` : `Waiting ${nomA}`,
    titre: fr ? `En attente de la boutique ${nomA}` : `Waiting for the ${nomA} shop`,
    detail: fr
      ? `Tu es actuellement sur la boutique ${nomB}. ${quoi} concerne ${nomA} et reprendra automatiquement dès que tu t'y reconnecteras sur vinted.fr. ${phraseRassurance(lang)}`
      : `You are currently on the ${nomB} shop. ${quoi} belongs to ${nomA} and will resume automatically as soon as you sign back in to it on vinted.fr. ${phraseRassurance(lang)}`,
  };
}
