// ═══════════════════════════════════════════════════════════════════════════
// UN IMPORT PARESSEUX QUI NE PLANTE JAMAIS PENDANT UN CHANGEMENT DE VERSION (08/11, point 7 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// doriane-henri (07/11 20:37, Edge) : onglet ouvert sur le build 7e54e5f, déploiement 65396fd à 20:12 (les chunks
// changent de nom). Elle ouvre la Messagerie (chargée à la demande) : l'ancien chunk n'existe plus, `vite:preloadError`
// part, main.jsx annule l'événement et recharge. Mais Vite (8.0.3) RÉSOUT alors l'import avec `undefined` : React.lazy
// lit `undefined.default` → « TypeError: Cannot read properties of undefined (reading 'default') », la racine est
// démontée (écran blanc), une ligne exception_js est écrite, puis le rechargement arrive ~1 s plus tard.
//
// Ici : un module vide pendant un rechargement de version (window.__fillsellRechargeVersion, posé par main.jsx) ne se
// résout JAMAIS — <Suspense> garde son fallback, rien n'est rendu, rien ne plante, la page repart sur la nouvelle
// version. Hors rechargement, un module vide est une vraie erreur : elle remonte, lisible.
import { lazy } from 'react'

/** Vrai pendant un rechargement de version décidé par main.jsx (au plus 60 s). */
export function rechargementDeVersionEnCours(maintenant = Date.now()) {
  const t = Number(typeof window !== 'undefined' ? window.__fillsellRechargeVersion : 0)
  return Number.isFinite(t) && t > 0 && maintenant - t < 60_000
}

/** Le module à rendre à React.lazy, ou une promesse qui ne se résout pas (rechargement en cours). */
export function moduleOuAttente(m) {
  if (m && m.default !== undefined) return m
  if (rechargementDeVersionEnCours()) return new Promise(() => {})
  throw new Error('module chargé à la demande vide (chunk absent ?)')
}

/** `lazy(() => import(...))`, sûr pendant un changement de version. */
export function lazySur(charger) {
  return lazy(() => charger().then(moduleOuAttente))
}
