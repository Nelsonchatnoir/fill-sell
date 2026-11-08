// Suivre les prix de la boutique dans un écran (08/11/2026) : l'écran se redessine quand les prix arrivent, et une
// lecture ratée est retentée à l'ouverture (au plus une fois par minute). Règles : lib/prixBoutique.js.
import { useEffect, useSyncExternalStore } from 'react';
import { abonnerPrixBoutique, lirePrixBoutique } from './prixBoutique';
import { chargerPrixBoutique } from './chargerPrixBoutique';

export function usePrixBoutique({ charger = true } = {}) {
  const e = useSyncExternalStore(abonnerPrixBoutique, lirePrixBoutique, lirePrixBoutique);
  useEffect(() => { if (charger) chargerPrixBoutique().catch(() => {}); }, [charger]);
  return e;
}
