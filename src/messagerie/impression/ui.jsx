// Petits éléments communs aux écrans d'impression (style des écrans du 16/10).
import { UI } from '../../components/ui';
import { ENCRE2, TONS } from './style';

export function Bouton({ principal = false, desactive = false, onClick, children, ariaLabel, plein = false }) {
  return (
    <button type="button" onClick={onClick} disabled={desactive} aria-label={ariaLabel}
      style={{ minHeight: 48, padding: '0 16px', borderRadius: 14, border: principal ? 'none' : `1px solid ${UI.border}`, background: principal ? (desactive ? '#ECE9E2' : UI.tealDeep) : '#FFFFFF', color: principal ? (desactive ? '#8A8578' : '#FFFFFF') : UI.ink, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: desactive ? 'default' : 'pointer', flex: plein ? '1 1 100%' : '1 1 0', minWidth: 0 }}>
      {children}
    </button>
  );
}

export function Segments({ valeur, onChange, options }) {
  return (
    <div role="tablist" style={{ display: 'flex', padding: 4, borderRadius: 18, background: '#ECE9E2', gap: 2 }}>
      {options.map(([k, libelle]) => {
        const on = k === valeur;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)}
            style={{ flex: 1, minWidth: 0, height: 44, border: 0, borderRadius: 14, background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 2px 6px rgba(16,32,27,.08)' : 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 600, color: on ? UI.ink : ENCRE2, cursor: 'pointer' }}>
            {libelle}
          </button>
        );
      })}
    </div>
  );
}

export function Note({ ton = 'neutre', children }) {
  const t = TONS[ton] ?? TONS.neutre;
  return <div role="status" style={{ padding: '9px 12px', borderRadius: 12, background: t.fond, color: t.encre, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{children}</div>;
}
