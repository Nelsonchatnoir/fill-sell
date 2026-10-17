// ═══════════════════════════════════════════════════════════════════════════
// UNE QUESTION DE CATÉGORIE IDENTIQUE N'EST PAYÉE QU'UNE FOIS (18/10 nuit, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré sur 7 jours (usage_logs resolve_categorie, 3 179 appels) : 839 appels
// (26 %) sont le JUMEAU exact d'un autre — même compte, mêmes jetons d'entrée
// et de sortie, à moins de 2 secondes : la même question partie deux fois en
// parallèle (deux chemins de la résolution qui la posent au même instant), et
// payée deux fois. Ailleurs, la même question revient dans les minutes qui
// suivent (un même titre : jusqu'à 70 appels en 6 minutes).
//
// LA RÈGLE : toute question à resolve-categorie passe par ici. Corps identique
// (JSON stable : clés triées) →
//   · une question EN VOL est partagée (un seul appel, la même réponse aux deux) ;
//   · une réponse obtenue il y a moins de 10 minutes dans CETTE ouverture de
//     l'app est rendue telle quelle (même objet { data, error }).
// Rien d'autre ne change : le serveur, sa consigne, ses contrôles, ses clés
// opaques. Une erreur, un refus (429) ou « ia_indisponible » ne sont JAMAIS
// gardés : la question suivante repart. La réponse d'une question identique
// étant la même par construction (température 0), la qualité ne bouge pas.
// Borné (300 entrées), en mémoire seulement, rien n'est écrit nulle part.

const DUREE_MS = 10 * 60 * 1000;
const MAX_ENTREES = 300;
const enVol = new Map();   // clé → Promise<{ data, error }>
const faites = new Map();  // clé → { t, res }

export function jsonStable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(jsonStable).join(",")}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${jsonStable(v[k])}`).join(",")}}`;
}

const gardable = (res) => Boolean(res && !res.error && res.data && !res.data.error && res.data.motif !== "ia_indisponible");

/**
 * Même signature d'usage que `supabase.functions.invoke("resolve-categorie", options)`.
 * @returns {Promise<{ data: any, error: any }>}
 */
export function invoquerResolveCategorie(supabase, options = {}, maintenant = Date.now) {
  const cle = jsonStable(options?.body ?? null);
  const deja = faites.get(cle);
  if (deja && maintenant() - deja.t < DUREE_MS) return Promise.resolve(deja.res);
  if (deja) faites.delete(cle);
  if (enVol.has(cle)) return enVol.get(cle);
  const p = Promise.resolve()
    .then(() => supabase.functions.invoke("resolve-categorie", options))
    .then((res) => {
      if (gardable(res)) {
        faites.set(cle, { t: maintenant(), res });
        while (faites.size > MAX_ENTREES) faites.delete(faites.keys().next().value);
      }
      return res;
    })
    .finally(() => { enVol.delete(cle); });
  enVol.set(cle, p);
  return p;
}

/** Selftests seulement. */
export function _viderQuestionsCategorie() { enVol.clear(); faites.clear(); }
