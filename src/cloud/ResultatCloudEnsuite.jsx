import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { textesCloudEnsuite } from './cloudEnsuite';

// ═══════════════════════════════════════════════════════════════════════════
// L'ISSUE DE L'ÉTAPE 2 « AJOUTER FILLSELL CLOUD » (08/11/2026, point 1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Après la formule, l'achat du Cloud (le sien : conditions, place, boutique ou Stripe) finit TOUJOURS par cette
// fenêtre : « FillSell Cloud est ajouté » (bouton « Connecter mes plateformes »), « Paiement reçu », ou « FillSell Cloud
// n'a pas été ajouté — ta formule reste active ». Jamais un toast qui disparaît : la personne sait ce qu'elle a.
// Textes et issue : cloud/cloudEnsuite.js (issueCloudEnsuite, testée). Portail sur document.body (même raison que la
// fenêtre « Bienvenue » : WebKit, 18/09) ; role="alertdialog", focus sur le bouton, Échap ferme.
const C = { ink: '#10201B', paper: '#F6F5F1', teal: '#2F9E90', tealDeep: '#1B6E62', texte: '#4D5752', amber: '#C2410C' };

export default function ResultatCloudEnsuite({ issue, lang = 'fr', onConnecter, onFermer }) {
  const T = textesCloudEnsuite(lang);
  const bouton = useRef(null);
  useEffect(() => {
    bouton.current?.focus({ preventScroll: true });
    const echap = (e) => { if (e.key === 'Escape') onFermer?.(); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [onFermer]);
  if (!issue || typeof document === 'undefined') return null;
  const ok = issue.cle === 'actif' || issue.cle === 'attente';
  return createPortal(
    <div data-resultat-cloud-ensuite={issue.cle} style={{ position: 'fixed', inset: 0, zIndex: 10100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(16,32,27,0.55)' }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="fs-resultat-cloud-titre" aria-describedby="fs-resultat-cloud-texte"
        style={{ width: '100%', maxWidth: 360, background: C.paper, borderRadius: 24, padding: '22px 20px 18px', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', fontFamily: "'Space Grotesk', sans-serif" }}>
        <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 20, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ok ? 'rgba(47,158,144,0.14)' : 'rgba(194,65,12,0.1)' }}>
          {ok ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.tealDeep} strokeWidth="2"><path d="M4 9.5l3.2 3.2L14 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.amber} strokeWidth="2"><path d="M9 4.5v5.5M9 13v.2" strokeLinecap="round" /></svg>
          )}
        </div>
        <h2 id="fs-resultat-cloud-titre" style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700, color: C.ink, lineHeight: 1.25 }}>{issue.titre}</h2>
        <p id="fs-resultat-cloud-texte" style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.5, fontWeight: 600, color: C.texte }}>{issue.texte}</p>
        {issue.cle === 'actif' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button ref={bouton} type="button" onClick={onConnecter} style={{ minHeight: 48, borderRadius: 14, border: 'none', background: `linear-gradient(120deg, ${C.teal}, ${C.tealDeep})`, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>{issue.cta}</button>
            <button type="button" onClick={onFermer} style={{ minHeight: 44, border: 'none', background: 'none', color: C.tealDeep, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>{T.plusTard}</button>
          </div>
        ) : (
          <button ref={bouton} type="button" onClick={onFermer} style={{ width: '100%', minHeight: 48, borderRadius: 14, border: 'none', background: `linear-gradient(120deg, ${C.teal}, ${C.tealDeep})`, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>{T.ok}</button>
        )}
      </div>
    </div>,
    document.body,
  );
}
