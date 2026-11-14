// ── La fenêtre « Changer de formule » des boutiques (14/11/2026, règle de Nico — iPhone et Android) ─────────────────────
// Ouverte AVANT la feuille de l'App Store / de Google Play quand un abonné de la boutique de ce téléphone change de formule
// pendant son essai, ou alors qu'il a le Cloud dans sa formule (lib/changementFormuleBoutique.js : la règle, les montants
// lus chez la boutique, ce que la boutique fera). Une option = un bouton ; fermer, toucher le fond ou « Annuler » = rien ne
// part, rien ne change. Le choix revient à l'hôte par onChoix(cle | null).
import { useEffect } from 'react';
import { textesFenetre } from '../lib/changementFormuleBoutique';

const C = {
  canvas: '#EDEAE0', paper: '#F6F5F1', ink: '#10201B', teal: '#2F9E90', tealDeep: '#1B6E62',
  mute: '#8A8578', mute2: '#5C6560', border: '#E7E3D8', alerte: '#9A3412', alerteFond: '#FFF1E8',
};

export default function ChangementFormuleBoutique({ plan, lang = 'fr', onChoix }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onChoix?.(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onChoix]);
  if (!plan?.fenetre) return null;
  const T = textesFenetre(plan, lang);
  return (
    <div
      data-changement-formule-boutique
      onClick={() => onChoix?.(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(16,32,27,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={T.titre}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: C.canvas, borderRadius: '26px 26px 0 0',
          maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '18px 18px calc(env(safe-area-inset-bottom, 0px) + 22px)', fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 19, fontWeight: 800, color: C.ink, marginBottom: 6 }}>{T.titre}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.45, color: C.mute2, marginBottom: 14 }}>{T.intro}</div>
        {T.options.map((o) => (
          <div
            key={o.cle}
            data-option={o.cle}
            style={{
              background: C.paper, borderRadius: 18, padding: '14px 14px 12px', marginBottom: 12,
              border: `1.5px solid ${o.principal ? C.teal : C.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{o.titre}</div>
              {o.avertissement && (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.alerte, background: C.alerteFond, borderRadius: 99, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                  {o.avertissement}
                </span>
              )}
            </div>
            {o.lignes.map((l, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 1.45, color: o.sansCloud && i === o.lignes.length - 1 ? C.alerte : C.ink, fontWeight: i === 0 ? 700 : 500, marginBottom: 4 }}>{l}</div>
            ))}
            <button
              type="button"
              disabled={!o.choisissable}
              onClick={() => onChoix?.(o.cle)}
              style={{
                width: '100%', marginTop: 8, padding: '12px 0', borderRadius: 999, cursor: o.choisissable ? 'pointer' : 'default',
                border: o.principal ? 'none' : `1px solid ${C.tealDeep}`, fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
                background: o.principal ? C.tealDeep : 'transparent', color: o.principal ? C.paper : C.tealDeep,
                opacity: o.choisissable ? 1 : 0.45,
              }}
            >
              {o.bouton}
            </button>
          </div>
        ))}
        <div style={{ fontSize: 12, lineHeight: 1.45, color: C.mute, margin: '2px 2px 12px' }}>{T.pied}</div>
        <button
          type="button"
          onClick={() => onChoix?.(null)}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 999, background: 'none', border: `1px solid ${C.border}`,
            cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: C.mute2, fontFamily: 'inherit',
          }}
        >
          {T.annuler}
        </button>
      </div>
    </div>
  );
}
