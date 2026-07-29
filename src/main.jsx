import React from 'react'
import ReactDOM from 'react-dom/client'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import AppRouter from './router/AppRouter'

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
)
