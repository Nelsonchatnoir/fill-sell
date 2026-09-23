// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — LA VÉRITÉ DES PLATEFORMES, LUE AU SERVEUR (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Remplace le calcul local de `useSessionsPlateformes` pour l'écran
// Plateformes : le serveur rend UN état et UNE action par plateforme
// (utils/veritePlateformes). Le hook lit, relit (toutes les 60 s, au retour
// d'onglet, après un geste) et porte « je ne vends pas sur X ».
// `useSessionsPlateformes` reste en place : d'autres écrans le lisent encore,
// et il sert de repli si la RPC ne répond pas.
import { useCallback, useEffect, useState } from 'react';
import { lireVeritePlateformes, ecarterPlateforme, compterConnectees } from '../utils/veritePlateformes';

export function useVeritePlateformes({ userId, plateformes, actif = true }) {
  const [verite, setVerite] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(null); // plateforme dont on change l'écartement

  const lire = useCallback(async () => {
    if (!userId) return;
    try {
      const v = await lireVeritePlateformes();
      setVerite(v);
    } catch (e) {
      console.warn('[reglages] vérité des plateformes illisible :', e?.message ?? e);
    } finally {
      setChargement(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!actif || !userId) return undefined;
    let mort = false;
    const tick = () => { if (!mort) lire(); };
    tick();
    const timer = setInterval(tick, 60_000);
    const surVisibilite = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      mort = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [actif, userId, lire]);

  const ecarter = useCallback(async (platform, valeur = true) => {
    setEnCours(platform);
    try {
      await ecarterPlateforme(platform, valeur);
      await lire();
    } catch (e) {
      console.warn('[reglages] plateforme non écartée :', e?.message ?? e);
    } finally {
      setEnCours(null);
    }
  }, [lire]);

  return {
    verite,
    chargement,
    relire: lire,
    ecarter,
    enCours,
    connectes: compterConnectees(verite, plateformes),
  };
}
