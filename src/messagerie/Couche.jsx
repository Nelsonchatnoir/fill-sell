// ═══════════════════════════════════════════════════════════════════════════
// UNE COUCHE DE LA BÊTA — la règle des couches de l'app (17/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Feuille de confirmation, aperçu du bordereau, « Tout imprimer », code en
// plein écran : jusqu'ici des `position:fixed` rendus DANS l'app. Sur iPhone,
// WebKit les peint sous l'en-tête et la barre du bas, quel que soit leur
// z-index (src/utils/modale.js, « la règle des couches ») : les boutons du bas
// d'une feuille passaient sous la barre. Toute couche de la bêta passe donc par
// ici : montée sur document.body (createPortal), fond figé et barre du bas
// masquée (useFondFige), Échap et retour Android ferment la couche.
// `premierPlan` : false pour une couche ouverte PAR une autre (le code en plein
// écran par-dessus l'aperçu) — sinon Échap et le retour Android fermeraient les
// deux d'un coup.
import { createPortal } from 'react-dom';
import { useEchap, useFondFige, useRetourAndroid } from '../utils/modale';

function SortiesDeCouche({ onFermer }) {
  useEchap(onFermer);
  useRetourAndroid(onFermer);
  return null;
}

export default function Couche({ onFermer, premierPlan = true, children }) {
  useFondFige(true);
  if (typeof document === 'undefined') return children;
  return createPortal(
    <>
      {premierPlan && onFermer ? <SortiesDeCouche onFermer={onFermer} /> : null}
      {children}
    </>,
    document.body,
  );
}
