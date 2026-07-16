import { useState, useEffect } from 'react';

// useIsMobile (P4, 2026-07-16) — vrai booléen RÉACTIF au lieu d'une lecture
// unique de window.innerWidth au render. Se met à jour sur resize ET
// orientationchange, si bien que le JS et le CSS s'accordent au franchissement
// du breakpoint (fin des incohérences layout mobile↔desktop en cours de vie).
//
// ⚠️ À n'utiliser que dans des composants dont TOUS les hooks sont appelés
// inconditionnellement : puisque la valeur peut changer entre deux renders, un
// early-return conditionné par elle AVANT d'autres hooks casserait l'ordre des
// hooks (React). Voir SwipeRow, refactoré pour ça.
export function useIsMobile(breakpoint = 768) {
  const read = () =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : true;
  const [isMobile, setIsMobile] = useState(read);
  useEffect(() => {
    const onChange = () => setIsMobile(read());
    onChange(); // resynchronise au montage (breakpoint peut différer)
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, [breakpoint]);
  return isMobile;
}

export default useIsMobile;
