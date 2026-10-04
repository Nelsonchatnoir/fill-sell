// ═══════════════════════════════════════════════════════════════════════════
// STOCK — L'ÉCRAN PLEIN (planche : écran 09 « Remonter mes annonces »)
// ═══════════════════════════════════════════════════════════════════════════
// En-tête de 48 px (retour à gauche, titre au centre), contenu qui défile,
// et un pied FIXE qui porte LE bouton de confirmation — un seul. Sert aux
// trois gestes du haut du Stock (Publier, Remonter, À régler).
// ⛔ Couche plein écran = mêmes trois sorties qu'une feuille (utils/modale.js) ;
//    la barre d'onglets se masque d'elle-même (classe fs-modale-ouverte).
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useFondFige, useEchap, useRetourAndroid } from '../utils/modale';
import { S, Z } from './jetons';
import { CSS_STOCK } from './css';

export default function EcranPlein({ lang = 'fr', titre, onFermer, children, pied = null, actif = true }) {
  useFondFige(true);
  useEchap(actif ? onFermer : null);
  useRetourAndroid(actif ? onFermer : null);
  const fr = lang !== 'en';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={titre} className="sk-racine sk-entre"
      style={{ position: 'fixed', inset: 0, zIndex: Z.ecran, display: 'flex', flexDirection: 'column', background: S.page }}>
      <style>{CSS_STOCK}</style>
      <div style={{ flexShrink: 0, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 48, padding: '0 8px', maxWidth: 720, margin: '0 auto' }}>
          <button type="button" onClick={onFermer} aria-label={fr ? 'Retour' : 'Back'} className="sk-btn"
            style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: '50%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.ink, flexShrink: 0 }}>
            <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
          </button>
          <h1 className="sk-une-ligne" style={{ flex: 1, minWidth: 0, margin: 0, textAlign: 'center', fontSize: 17, lineHeight: '24px', fontWeight: 700, letterSpacing: '-0.01em', color: S.ink }}>
            {titre}
          </h1>
          <span aria-hidden="true" style={{ width: 40, flexShrink: 0 }} />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: pied ? '0 16px 24px' : '0 16px calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          {children}
        </div>
      </div>
      {pied && (
        <div style={{ flexShrink: 0, background: 'rgba(250,251,251,0.94)', boxShadow: `inset 0 1px 0 ${S.border}` }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
            {pied}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
