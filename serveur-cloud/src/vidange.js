// (05/11 soir, lot « Ouverture du Cloud », point 12 — ordre de Nico) UNE MISE À JOUR NE COUPE RIEN EN COURS.
// Avant : un déploiement (docker compose up -d) envoyait SIGTERM à l'orchestrateur, qui fermait TOUS les navigateurs sur-
// le-champ, quelle que soit la tâche en cours ; une republication coupée entre son retrait et sa remise en ligne restait
// hors ligne jusqu'à sa reprise (45 min à 2 h, _shared/reprise-processing.js). La seule garde était humaine (« jamais
// pendant une tâche en cours »).
// LA VIDANGE, à l'arrêt de l'orchestrateur :
//   1. chaque navigateur ouvert passe en vidange : son extension ne PREND plus aucune nouvelle tâche (le passage de sa
//      file est sauté — copie Cloud : __fillsellVerrouCloud.drainer) ; celles déjà prises vont au bout ;
//   2. l'orchestrateur attend qu'aucune tâche de ces comptes ne soit « processing » (prise depuis moins de
//      TACHE_FIGEE_MS : une tâche figée depuis plus longtemps relève de la reprise, pas de la vidange), puis que les
//      « Me connecter » ouverts se ferment — au plus `maxMs` (DRAIN_MAX_S, 10 min par défaut ; le délai d'arrêt du
//      conteneur, stop_grace_period, est réglé au-dessus) ;
//   3. puis seulement, la fermeture habituelle (coffre gardé). La file reprend au redémarrage, sans rien perdre.
import { evaluerDansExtension } from './sessionFillsell.js';

export const TACHE_FIGEE_MS = 45 * 60_000;
export const PAUSE_VIDANGE_MS = 5_000;

/** L'expression évaluée dans l'extension Cloud (pure : testée). */
export const expressionDrainer = (oui) =>
  `(globalThis.__fillsellVerrouCloud && typeof globalThis.__fillsellVerrouCloud.drainer === "function") ? globalThis.__fillsellVerrouCloud.drainer(${oui ? 'true' : 'false'}) : false`;

/** Une tâche « processing » compte-t-elle pour la vidange ? (pure : testée) — prise il y a moins de TACHE_FIGEE_MS. */
export function tacheEnCours(job, maintenant = Date.now()) {
  if (job?.status !== 'processing') return false;
  const t = Date.parse(String(job?.platform_fields?.processing_since ?? ''));
  return !Number.isFinite(t) || maintenant - t < TACHE_FIGEE_MS;
}

export function creerVidange({ base, navigateurs, journal, idExtension = async () => null, connexionsOuvertes = () => new Set(),
  pauseMs = PAUSE_VIDANGE_MS, maintenant = () => Date.now(), attendre = (ms) => new Promise((ok) => setTimeout(ok, ms)) }) {
  async function tachesEnCours(users) {
    if (!users.length) return 0;
    const { data, error } = await base.from('cross_post_jobs').select('id, status, platform_fields')
      .in('user_id', users).eq('status', 'processing').limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).filter((j) => tacheEnCours(j, maintenant())).length;
  }

  /** Met (ou retire) les navigateurs ouverts en vidange. Rend le nombre de navigateurs qui ont répondu. */
  async function drainer(oui) {
    const id = await idExtension().catch(() => null);
    let n = 0;
    for (const u of navigateurs.ouverts()) {
      const h = navigateurs.ouvert(u);
      if (!h?.cdp || !id) continue;
      const r = await evaluerDansExtension(h.cdp, id, expressionDrainer(oui)).catch(() => null);
      if (r === true) n++;
    }
    return n;
  }

  /** La vidange complète (arrêt de l'orchestrateur). Ne jette jamais : au pire, la fermeture habituelle suit. */
  async function vider({ maxMs = 600_000 } = {}) {
    const debut = maintenant();
    const users = [...navigateurs.ouverts()];
    if (!users.length) return { users: 0, attente_ms: 0, issue: 'rien_ouvert' };
    const drains = await drainer(true).catch(() => 0);
    journal?.info?.('vidange_debut', { users: users.length, extensions_en_vidange: drains, max_s: Math.round(maxMs / 1000) });
    let taches = 0, issue = 'vide';
    for (;;) {
      taches = await tachesEnCours(users).catch(() => 0);
      const co = connexionsOuvertes()?.size ?? 0;
      if (!taches && !co) break;
      if (maintenant() - debut >= maxMs) { issue = 'delai_depasse'; journal?.alerte?.('vidange_delai_depasse', { taches, connexions: co }); break; }
      await attendre(pauseMs);
    }
    const attente_ms = maintenant() - debut;
    journal?.info?.('vidange_fin', { issue, taches, attente_s: Math.round(attente_ms / 1000) });
    return { users: users.length, attente_ms, issue, taches };
  }

  return { vider, drainer, tachesEnCours };
}
