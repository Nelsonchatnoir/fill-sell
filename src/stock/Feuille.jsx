// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LA FEUILLE QUI MONTE DU BAS (planche : écrans 07 et 08)
// ═══════════════════════════════════════════════════════════════════════════
// Une seule coque pour toutes les feuilles de la refonte (Filtrer et trier,
// points à régler, menu « … », Ajouter, Boutique, Tri) : le portail, le voile
// cliquable, la poignée, l'en-tête de 48 px (titre au centre, croix à droite),
// le corps qui défile et le pied fixe avec la zone sûre du bas.
// ⛔ LA RÈGLE DES COUCHES (utils/modale.js) : portail sur document.body, fond
//    figé, Échap et retour Android — jamais une couche sans ses trois sorties.
//    `actif=false` quand une couche est ouverte PAR-DESSUS celle-ci.
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFondFige, useEchap, useRetourAndroid } from '../utils/modale';
import { S, OMBRE, Z } from './jetons';
import { CSS_STOCK } from './css';

export default function Feuille({
  lang = 'fr', titre, onFermer, children, pied = null, z = Z.feuille, actif = true,
  hauteurMax = 'calc(100dvh - 48px)', etiquette = null, corpsStyle = null,
}) {
  useFondFige(true);
  useEchap(actif ? onFermer : null);
  useRetourAndroid(actif ? onFermer : null);
  const fr = lang !== 'en';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={etiquette ?? titre} className="sk-racine"
      style={{ position: 'fixed', inset: 0, zIndex: z, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <style>{CSS_STOCK}</style>
      <button type="button" aria-label={fr ? 'Fermer' : 'Close'} onClick={onFermer} className="sk-fond"
        style={{ position: 'absolute', inset: 0, border: 'none', padding: 0, background: S.voile, cursor: 'pointer' }} />
      <section className="sk-monte" style={{
        position: 'relative', width: '100%', maxWidth: 560, maxHeight: hauteurMax,
        display: 'flex', flexDirection: 'column', background: S.sheet,
        borderRadius: '20px 20px 0 0', boxShadow: OMBRE.feuille,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', height: 16, paddingTop: 8, boxSizing: 'border-box', flexShrink: 0 }}>
          <span aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 999, background: S.poignee }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 48, padding: '0 8px', flexShrink: 0, boxShadow: `inset 0 -1px 0 ${S.border}` }}>
          <span aria-hidden="true" style={{ width: 40, flexShrink: 0 }} />
          <h2 className="sk-une-ligne" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 700, letterSpacing: '-0.01em', color: S.ink, textAlign: 'center' }}>
            {titre}
          </h2>
          <button type="button" onClick={onFermer} aria-label={fr ? 'Fermer' : 'Close'} className="sk-btn"
            style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: '50%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.ink, flexShrink: 0 }}>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="sk-feuille-corps" style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
          display: 'flex', flexDirection: 'column', gap: 16,
          padding: pied ? 16 : '16px 16px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          ...(corpsStyle ?? {}),
        }}>
          {children}
        </div>
        {pied && (
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16,
            padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
            background: S.paper, boxShadow: `inset 0 1px 0 ${S.border}`,
          }}>
            {pied}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

// Les briques communes des feuilles : intitulé de section en petites
// capitales (11/16, +0,08 em) et ligne d'action (icône, titre, sous-titre).
export function IntituleSection({ children, droite = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 16 }}>
      <span style={{ fontSize: 11, lineHeight: '16px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: S.ink2 }}>
        {children}
      </span>
      {droite}
    </div>
  );
}
