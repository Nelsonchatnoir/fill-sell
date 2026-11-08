import { useEffect } from 'react';
import { textesConnexionsCloud } from './connexionsCloud';
import { C, BLANC, MENTHE, DEGRADE_TEAL, POLICE } from './theme';

// « CONNECTE TES COMPTES POUR DÉMARRER FILLSELL CLOUD » — en haut du Tableau et du Stock (08/11/2026, urgent U2 de
// Nico), tant qu'une plateforme choisie n'est pas connectée. Mène à l'écran de connexion (onConnecter). Une trace
// « cloud_connexion_carte_vue » par montage et par écran (ou), « cloud_connexion_carte_clic » au geste.
export default function CarteConnexionCloud({ avancement, lang = 'fr', ou = 'tableau', onConnecter, journal }) {
  const T = textesConnexionsCloud(lang);
  useEffect(() => { try { journal?.('cloud_connexion_carte_vue', { ou, connectees: avancement?.connectees ?? null, total: avancement?.total ?? null }); } catch { /* trace seule */ } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ou]);
  if (!avancement) return null;
  const pct = avancement.total ? Math.round((avancement.connectees / avancement.total) * 100) : 0;
  return (
    <section data-cloud-connexion-carte={ou} aria-label={T.carteTitre} style={{
      background: BLANC, border: `1.5px solid ${C.teal}`, borderRadius: 18, padding: '14px 16px', margin: '0 0 14px',
      fontFamily: POLICE, boxShadow: '0 10px 26px -20px rgba(27,110,98,0.6)',
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{T.carteTitre}</div>
      <div style={{ margin: '10px 0 6px', height: 6, borderRadius: 3, background: MENTHE, overflow: 'hidden' }} role="progressbar"
        aria-valuemin={0} aria-valuemax={avancement.total} aria-valuenow={avancement.connectees} aria-valuetext={T.avancement(avancement)}>
        <div style={{ width: `${pct}%`, height: '100%', background: DEGRADE_TEAL, transition: 'width .3s ease' }} />
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: C.mute2 }}>{T.carteTexte(avancement)}</p>
      <button type="button" onClick={() => { try { journal?.('cloud_connexion_carte_clic', { ou }); } catch { /* trace seule */ } onConnecter?.(); }}
        style={{ width: '100%', minHeight: 46, borderRadius: 14, border: 'none', background: DEGRADE_TEAL, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
        {T.carteCta}
      </button>
    </section>
  );
}
