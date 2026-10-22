// ═══════════════════════════════════════════════════════════════════════════
// LE CHARGEMENT A UNE FIN (22/10, Sébastien — logo qui tourne sans fin)
// ═══════════════════════════════════════════════════════════════════════════
// Le 22/10 vers 08:30, le réseau de Sébastien (Chrome, Windows) s'est dégradé :
// les requêtes partaient, les réponses n'arrivaient plus (ou au bout de minutes).
// L'app attendait chaque lecture SANS limite : `appLoading` ne repasse à false
// qu'à la fin de fetchAll, une dizaine d'await plus loin → logo éternel, aucun
// message, aucune issue. Jusqu'à 6 fetchAll complets en parallèle (retour
// d'onglet, jeton rafraîchi, sentinelle) étouffaient encore plus le lien.
// Trois outils, purs et testés (`npm run selftest:cinq-points-2210`) :
//   · creerFetchBorne   — toute LECTURE PostgREST (GET/HEAD /rest/v1/) a une
//     limite de temps qui couvre aussi le CORPS de la réponse (un corps qui cale
//     est le cas vécu). Écritures, RPC, auth, storage, fonctions : intactes —
//     abandonner une écriture laisserait un résultat inconnu.
//   · fileUnique        — un seul fetchAll en vol : un appel pendant un autre
//     attend la FIN de celui-ci puis lance UNE relecture neuve (partagée par tous
//     les appels arrivés entre-temps). Chaque appelant obtient une lecture qui a
//     commencé APRÈS son appel : `await fetchAll()` garde son sens.
//   · uneFoisPar        — un rechargement automatique au plus une fois par clé
//     (build distant, build courant) et par onglet : jamais de boucle.
// ═══════════════════════════════════════════════════════════════════════════

export const DELAI_LECTURE_MS = 30_000;

function methodeDe(input, init) {
  const m = init?.method ?? (typeof input === 'object' && input && 'method' in input ? input.method : 'GET');
  return String(m || 'GET').toUpperCase();
}

function urlDe(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') return String(input.url ?? input.href ?? '');
  return String(input ?? '');
}

/** Une lecture PostgREST (et seulement elle) : GET ou HEAD sur /rest/v1/. */
export function estLectureBornee(input, init) {
  const m = methodeDe(input, init);
  if (m !== 'GET' && m !== 'HEAD') return false;
  return /\/rest\/v1\//.test(urlDe(input));
}

/**
 * fetch borné pour les lectures : AbortController armé AVANT l'envoi, désarmé
 * seulement quand le corps est entièrement lu. Le corps lu est rendu dans une
 * Response neuve (même statut, mêmes en-têtes — Content-Range compris).
 * Un signal fourni par l'appelant reste respecté.
 */
export function creerFetchBorne(fetchImpl, { delaiMs = DELAI_LECTURE_MS } = {}) {
  const base = fetchImpl ?? ((...a) => fetch(...a));
  return async function fetchBorne(input, init) {
    if (!estLectureBornee(input, init)) return base(input, init);
    const ctrl = new AbortController();
    const signalAppelant = init?.signal;
    let surAbandon = null;
    if (signalAppelant) {
      if (signalAppelant.aborted) ctrl.abort(signalAppelant.reason);
      else { surAbandon = () => ctrl.abort(signalAppelant.reason); signalAppelant.addEventListener('abort', surAbandon, { once: true }); }
    }
    const minuteur = setTimeout(() => {
      const e = new Error(`lecture sans réponse après ${Math.round(delaiMs / 1000)} s`);
      e.name = 'TimeoutError';
      ctrl.abort(e);
    }, delaiMs);
    try {
      const res = await base(input, { ...(init ?? {}), signal: ctrl.signal });
      const sansCorps = methodeDe(input, init) === 'HEAD' || [101, 204, 205, 304].includes(res.status);
      const corps = sansCorps ? null : await res.arrayBuffer();
      return new Response(corps, { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (e) {
      // Le motif lisible (« lecture sans réponse après 30 s ») plutôt qu'un AbortError muet.
      if (ctrl.signal.aborted && ctrl.signal.reason instanceof Error && !signalAppelant?.aborted) throw ctrl.signal.reason;
      throw e;
    } finally {
      clearTimeout(minuteur);
      if (surAbandon) signalAppelant.removeEventListener('abort', surAbandon);
    }
  };
}

/** Une promesse qui rend `valeur` si `p` n'a pas répondu en `ms` (jamais de rejet). */
export function auPlus(p, ms, valeur) {
  let t;
  return Promise.race([
    Promise.resolve(p).catch(() => valeur),
    new Promise((r) => { t = setTimeout(() => r(valeur), ms); }),
  ]).finally(() => clearTimeout(t));
}

/**
 * Un seul passage en vol. `executer(...args)` lance le corps ; un appel pendant un
 * passage attend sa fin, puis un passage NEUF part (un seul pour tous les appels
 * arrivés entre-temps, avec les arguments du dernier ; `fusionner` combine les
 * options). Un passage qui ne rend pas la main en `liberationMs` libère la file
 * (il continue seul, mais ne bloque plus les suivants).
 */
export function fileUnique(corps, { liberationMs = 60_000, fusionner = (a, b) => b } = {}) {
  let enVol = null;
  let suivante = null;
  let argsSuivants = null;
  const lancer = (args) => {
    const p = Promise.resolve().then(() => corps(...args));
    enVol = auPlus(p.then(() => undefined, () => undefined), liberationMs, undefined).then(() => { enVol = null; });
    return p;
  };
  return function executer(...args) {
    if (!enVol) return lancer(args);
    argsSuivants = argsSuivants ? fusionner(argsSuivants, args) : args;
    if (!suivante) {
      suivante = enVol.then(() => {
        const a = argsSuivants; argsSuivants = null; suivante = null;
        return enVol ? executer(...a) : lancer(a);
      });
    }
    return suivante;
  };
}

/**
 * Vrai la PREMIÈRE fois pour (clé, valeur) dans ce stockage (sessionStorage =
 * cet onglet), faux ensuite. Stockage illisible : faux (dans le doute, on ne
 * recharge pas — une erreur visible vaut mieux qu'une boucle).
 */
export function uneFoisPar(cle, valeur, stockage) {
  try {
    const s = stockage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    if (!s) return false;
    const v = String(valeur ?? '');
    if (s.getItem(cle) === v) return false;
    s.setItem(cle, v);
    return true;
  } catch {
    return false;
  }
}

/** Les étapes du démarrage, lisibles dans la console (window.__fillsellEtape). */
export function noterEtape(etape) {
  try { if (typeof window !== 'undefined') window.__fillsellEtape = { etape, le: new Date().toISOString() }; } catch { /* diagnostic seul */ }
}
