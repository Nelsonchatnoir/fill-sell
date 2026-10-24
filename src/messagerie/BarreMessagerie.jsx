// ═══════════════════════════════════════════════════════════════════════════
// L'ENTRÉE DE LA BÊTA MESSAGES + BORDEREAUX (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Une barre fine au-dessus des onglets, rendue SEULEMENT pour un compte bêta
// (useMessagerieBeta → beta === true) : « Messages » (non lus) et « À
// expédier » (nombre). Rien pour le reste du parc.
// (17/10, constat de Nico) « Messages » s'affichait en vert, comme un onglet
// sélectionné, dès qu'il y avait un non-lu. Ce sont des entrées, pas des
// onglets : les deux pastilles ont le MÊME style neutre, seul le compteur
// porte la couleur. Rendue sur le Stock seulement (App.jsx).
import { MessageCircle, Package } from 'lucide-react';
import { S } from '../stock/jetons';

// (24/10 soir) `messages` faux : un compte hors bêta aux bordereaux Vinted ouverts — « À expédier » seul, sans badge bêta.
export default function BarreMessagerie({ lang = 'fr', nonLus = 0, aExpedier = 0, onMessages, onExpedier, messages = true }) {
  const fr = lang !== 'en';
  const pilule = {
    minHeight: 40, padding: '0 12px', borderRadius: 999, border: `1px solid ${S.border}`,
    background: '#FFFFFF', color: S.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', flexWrap: 'wrap' }}>
      {messages && <button type="button" onClick={onMessages} style={pilule} data-entree-beta="messages">
        <MessageCircle size={16} aria-hidden="true" />{fr ? 'Messages' : 'Messages'}
        {nonLus > 0 && <span className="sk-chiffres" style={{ minWidth: 20, height: 20, borderRadius: 999, background: S.tealDeep, color: '#FFFFFF', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{nonLus}</span>}
      </button>}
      <button type="button" onClick={onExpedier} style={pilule} data-entree-beta="expedier">
        <Package size={16} aria-hidden="true" />{fr ? 'À expédier' : 'To ship'}
        {aExpedier > 0 && <span className="sk-chiffres" style={{ minWidth: 20, height: 20, borderRadius: 999, background: S.ambrePoint, color: '#FFFFFF', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{aExpedier}</span>}
      </button>
      {messages && <span style={{ fontSize: 11, fontWeight: 700, color: S.ambreEncre, background: S.ambreFond, border: `1px solid ${S.ambreBord}`, borderRadius: 999, padding: '1px 8px' }}>{fr ? 'bêta' : 'beta'}</span>}
    </div>
  );
}
