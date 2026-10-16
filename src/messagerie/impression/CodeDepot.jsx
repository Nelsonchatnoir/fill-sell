// ═══════════════════════════════════════════════════════════════════════════
// LE CODE DE DÉPÔT SANS PAPIER, EN GRAND (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Une image de QR ou de code-barres (ex. Vinted digital_label) : fond blanc,
// pleine largeur, pixels nets (aucun lissage qui brouille les modules), et un
// plein écran blanc pour le scanner du point relais. Rien n'est transformé.
import { useEffect, useState } from 'react';
import { UI } from '../../components/ui';
import Icone from '../../ecrans/Icone';
import { ENCRE2, POLICE } from './style';

export default function CodeDepot({ url, genre = 'png', lang = 'fr', titre = null }) {
  const fr = lang !== 'en';
  const [plein, setPlein] = useState(false);
  useEffect(() => {
    if (!plein) return undefined;
    const echap = (e) => { if (e.key === 'Escape') setPlein(false); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [plein]);
  if (!url) return null;
  // Un PNG (QR, code-barres) s'agrandit sans lissage ; une photo (JPEG) reste lissée.
  const rendu = genre === 'png' ? 'pixelated' : 'auto';
  return (
    <>
      <div data-code-depot style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => setPlein(true)} aria-label={fr ? 'Afficher le code en plein écran' : 'Show the code full screen'}
          style={{ width: '100%', border: 0, padding: 0, background: '#FFFFFF', cursor: 'zoom-in', display: 'flex', justifyContent: 'center' }}>
          <img src={url} alt={fr ? 'Code de dépôt à présenter au point relais' : 'Drop-off code to show at the parcel point'}
            style={{ width: '100%', maxWidth: 420, maxHeight: '52vh', objectFit: 'contain', imageRendering: rendu, display: 'block', background: '#FFFFFF' }} />
        </button>
        <div style={{ fontSize: 13.5, color: UI.ink, lineHeight: 1.45, textAlign: 'center', fontFamily: POLICE }}>
          {titre ?? (fr ? 'Montre ce code au point relais : il se scanne directement sur ton écran, sans rien imprimer.' : 'Show this code at the parcel point: it is scanned straight from your screen, nothing to print.')}
        </div>
        <div style={{ fontSize: 12.5, color: ENCRE2, textAlign: 'center' }}>{fr ? 'Monte la luminosité de ton écran avant de le présenter.' : 'Turn your screen brightness up before showing it.'}</div>
        <button type="button" onClick={() => setPlein(true)}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, border: `1px solid ${UI.border}`, background: '#FFFFFF', color: UI.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <Icone nom="loupe" taille={17} couleur={UI.ink} epaisseur={2.2} />{fr ? 'Plein écran' : 'Full screen'}
        </button>
      </div>
      {plein && (
        <div role="dialog" aria-modal="true" aria-label={fr ? 'Code de dépôt' : 'Drop-off code'} onClick={() => setPlein(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1400, background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))', gap: 16, cursor: 'zoom-out' }}>
          <img src={url} alt={fr ? 'Code de dépôt' : 'Drop-off code'}
            style={{ width: '100%', height: '100%', maxHeight: 'calc(100% - 64px)', objectFit: 'contain', imageRendering: rendu, background: '#FFFFFF' }} />
          <button type="button" onClick={() => setPlein(false)}
            style={{ minHeight: 48, padding: '0 22px', borderRadius: 14, border: `1px solid ${UI.border}`, background: '#FFFFFF', color: UI.ink, fontFamily: POLICE, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {fr ? 'Fermer' : 'Close'}
          </button>
        </div>
      )}
    </>
  );
}
