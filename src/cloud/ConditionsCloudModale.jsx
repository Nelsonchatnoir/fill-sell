// ═══════════════════════════════════════════════════════════════════════════
// LA CASE DES CONDITIONS D'UTILISATION DE FILLSELL CLOUD — à l'activation, AVANT toute carte (30/10, lot D)
// ═══════════════════════════════════════════════════════════════════════════
// Le texte en entier (déroulable), une case OBLIGATOIRE, « J'accepte et je continue » grisé tant qu'elle n'est pas
// cochée. L'acceptation est ENREGISTRÉE en base (rpc cloud_cgu_accepter_moi : version + date, écrites par le serveur
// seul) avant de rendre la main : un échec se dit, rien ne s'ouvre. Mobile d'abord, thème de l'app (cloud/theme.js).
// Monté par App derrière cloudOfferVisible() / le drapeau par compte : invisible pour tout autre compte.
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { conditionsCloud, CGU_CLOUD_VERSION } from './conditionsCloud';
import { C, BLANC, DEGRADE_TEAL, POLICE } from './theme';

export default function ConditionsCloudModale({ onFini }) {
  const T = conditionsCloud();
  const [coche, setCoche] = useState(false);
  const [etat, setEtat] = useState('lecture');   // lecture | envoi | echec
  async function accepter() {
    if (!coche || etat === 'envoi') return;
    setEtat('envoi');
    try {
      const { data, error } = await supabase.rpc('cloud_cgu_accepter_moi', { p_version: CGU_CLOUD_VERSION });
      if (error || data?.ok !== true) { setEtat('echec'); return; }
      onFini(true);
    } catch {
      setEtat('echec');
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label={T.titre} style={{
      position: 'fixed', inset: 0, zIndex: 1250, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center', fontFamily: POLICE,
    }}>
      <div style={{
        width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: C.canvas,
        borderRadius: '20px 20px 0 0', paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -8px 30px rgba(15,23,42,0.18)',
      }}>
        <div style={{ padding: '18px 16px 8px' }}>
          <h2 style={{ margin: 0, fontSize: 19, color: C.ink, lineHeight: 1.3 }}>{T.titre}</h2>
          <div style={{ fontSize: 12.5, color: C.mute2, marginTop: 4 }}>{T.version}</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 8px', WebkitOverflowScrolling: 'touch' }}>
          {T.articles.map((a) => (
            <section key={a.t} style={{ margin: '0 0 12px', padding: '12px 14px', background: BLANC, borderRadius: 14, border: `1px solid ${C.border}` }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 14.5, color: C.ink }}>{a.t}</h3>
              {a.ps.map((p) => <p key={p.slice(0, 40)} style={{ margin: '0 0 6px', fontSize: 13.2, color: C.mute2, lineHeight: 1.55 }}>{p}</p>)}
            </section>
          ))}
        </div>
        <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C.border}`, background: BLANC }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: C.ink, lineHeight: 1.45, cursor: 'pointer' }}>
            <input type="checkbox" checked={coche} onChange={(e) => setCoche(e.target.checked)}
              style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0, accentColor: C.teal }} />
            <span>{T.case}</span>
          </label>
          {etat === 'echec' && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: C.amberInk }}>{T.echec}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => onFini(false)} style={{
              flex: 1, minHeight: 48, borderRadius: 12, fontWeight: 700, fontSize: 15, border: `1px solid ${C.border}`, background: BLANC, color: C.ink,
            }}>{T.annuler}</button>
            <button type="button" onClick={accepter} disabled={!coche || etat === 'envoi'} aria-disabled={!coche || etat === 'envoi'} style={{
              flex: 2, minHeight: 48, borderRadius: 12, fontWeight: 800, fontSize: 15, border: 'none', color: BLANC,
              background: coche ? DEGRADE_TEAL : C.faint, opacity: etat === 'envoi' ? 0.7 : 1,
            }}>{etat === 'envoi' ? T.enregistrement : T.accepter}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
