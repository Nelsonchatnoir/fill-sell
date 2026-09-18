import React from 'react'
import ReactDOM from 'react-dom/client'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import AppRouter from './router/AppRouter'
// Socle commun (reset, police du corps, garde-fous de formulaire). Importé ICI
// et pas dans App.jsx : depuis le code-splitting par route, App.css n'est
// chargé que sur /login et /app, et les routes servies en entrée directe
// (/blog, /reset-password, /success, /cancel) se retrouvaient sans police ni
// reset. main.jsx est le seul point par lequel TOUTES les routes passent.
import './base.css'

// ── Capgo live updates : ACQUITTEMENT DU BUNDLE (2026-07-29) ─────────────────
// PREMIÈRE instruction exécutée du point d'entrée : avant le render, et surtout
// avant le moindre appel réseau (Supabase, analytics…).
//
// Au lancement, le natif arme un minuteur (appReadyTimeout, 10 s). Si cet
// acquittement n'arrive pas dans le délai, il en conclut que le bundle
// téléchargé ne démarre pas et ROLLBACK vers le bundle précédent — puis
// recommence au lancement suivant. C'est LE mode de panne des intégrations
// Capgo : les updates partent, s'installent, et disparaissent à chaque
// redémarrage, sans aucune erreur visible côté app. On ne le déplace donc pas
// « plus bas, dans un useEffect », et on ne le met pas derrière un await.
//
// Volontairement NI awaité (ne retarde pas le render) NI conditionné par
// isNativePlatform : l'implémentation web du plugin est un no-op silencieux qui
// résout toujours, et la doc du plugin demande explicitement de ne pas
// conditionner cet appel. Le .catch n'évite qu'une rejection non gérée — il ne
// masque rien, il journalise.
CapacitorUpdater.notifyAppReady().catch((e) => {
  console.error('[capgo] notifyAppReady a échoué :', e?.message ?? e)
})

// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPLOIEMENT PENDANT QU'UN ONGLET EST OUVERT = ÉCRAN BLANC. PLUS MAINTENANT.
// ═══════════════════════════════════════════════════════════════════════════
// LE DÉFAUT, vécu DEUX FOIS (11/09 19h, puis 18/09 15h12) :
// chaque build renomme TOUS les chunks (index-<hash>.js, App-<hash>.js). Un
// onglet resté ouvert — ou un index.html encore en cache — garde les ANCIENS
// noms. Au prochain import paresseux, `lazy(() => import("../App"))` dans
// AppRouter, le fichier n'existe plus : Vercel rend un 404 franc, l'import est
// rejeté, et <Suspense fallback={null}> ne rend alors JAMAIS rien.
// Résultat à l'écran : le fond papier d'index.html et rien d'autre. Pas une
// erreur de code — le build est vert, le code est bon — mais l'application ne
// s'affiche plus, et un simple rechargement la répare.
// Le 18/09, six pushs sur main en dix minutes ont produit six déploiements de
// production, dont quatre en trente-trois secondes : la fenêtre de course était
// grande ouverte.
//
// ⛔ CE N'EST PAS UN CATCH QUI MASQUE UNE ERREUR. On n'attrape aucune exception
//    de rendu, et on n'enveloppe aucun composant : on écoute l'échec de
//    TÉLÉCHARGEMENT d'un module, c'est-à-dire une panne de réseau ou de
//    déploiement. La seule réparation possible est d'aller chercher le build
//    courant — donc on recharge. Un bug de code, lui, continue de casser
//    bruyamment, exactement comme avant.
//
// ⛔ JAMAIS DE BOUCLE. Un horodatage dans sessionStorage : un seul rechargement
//    par tranche de dix secondes. Si le rechargement ne suffit pas (vraie
//    coupure réseau), on laisse l'erreur remonter et rester lisible dans la
//    console, plutôt que de faire clignoter l'app indéfiniment.
//    L'horodatage, et non un booléen : un booléen ne se serait jamais effacé,
//    et le DEUXIÈME déploiement de la journée n'aurait plus été rattrapé.
const CLE_RECHARGE_CHUNK = 'fs_recharge_chunk'
window.addEventListener('vite:preloadError', (evt) => {
  try {
    const dernier = Number(sessionStorage.getItem(CLE_RECHARGE_CHUNK) || 0)
    if (Date.now() - dernier < 10000) return // on vient d'essayer : on n'insiste pas
    sessionStorage.setItem(CLE_RECHARGE_CHUNK, String(Date.now()))
    evt.preventDefault() // sinon la rejection non gérée part aussi en console
    console.warn('[build] chunk absent (déploiement en cours) — rechargement')
    window.location.reload()
  } catch {
    /* sessionStorage indisponible (navigation privée) : on ne recharge pas,
       l'erreur remonte normalement. Mieux vaut une erreur visible qu'une
       boucle de rechargement qu'on ne saurait pas arrêter. */
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
)
