// ═══════════════════════════════════════════════════════════════════════════
// « SOIS PRÉVENU DÈS QU'UN ARTICLE SE VEND » (06/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// L'écran qui précède la demande du système. Jamais au premier lancement :
// usePropositionPush ne l'ouvre qu'après une synchro réussie ou une vente, et
// seulement si le binaire porte le module (pushDisponible). « Plus tard » le
// remet à 3 jours ; « Activer » ouvre la demande officielle d'iOS / Android.
import { useId, useState } from 'react';
import { BellRing } from 'lucide-react';
import { useEchap, useFondFige, useRetourAndroid } from '../utils/modale';
import { TEXTES_PROPOSITION } from './usePropositionPush';
import '../components/CarteInfo.css';

export default function PropositionNotifications({ lang, onActiver, onPlusTard }) {
  const T = TEXTES_PROPOSITION[lang === 'en' ? 'en' : 'fr'];
  const idTitre = useId();
  const [enCours, setEnCours] = useState(false);
  useFondFige(true);
  useEchap(onPlusTard);
  useRetourAndroid(onPlusTard);
  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onPlusTard?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(16, 32, 27, 0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby={idTitre} className="fsc fsc-centre" style={{ maxWidth: 420 }}>
        <div className="fsc-tuile" aria-hidden="true"><BellRing strokeWidth={2} /></div>
        <h2 id={idTitre} className="fsc-titre">{T.titre}</h2>
        <p className="fsc-texte">{T.texte}</p>
        <div className="fsc-actions">
          <button type="button" className="fsc-btn fsc-btn-principal" disabled={enCours}
            onClick={() => { setEnCours(true); onActiver?.(); }}>
            {T.activer}
          </button>
          <button type="button" className="fsc-btn fsc-btn-contour" onClick={onPlusTard} disabled={enCours}>{T.plusTard}</button>
        </div>
      </section>
    </div>
  );
}
