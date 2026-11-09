import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { explicationJauge, libellesExplication } from '../utils/jaugesExplications';
import TexteAvecLogos from './TexteAvecLogos';

// ═══════════════════════════════════════════════════════════════════════════
// LA FEUILLE « QU'EST-CE QUE ÇA COMPTE ? » D'UNE JAUGE (maquette « les carrés au tap » validée par Nico, 09/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Ouverte par un tap ou un appui long sur un carré (TuilesGrille, ConversionModal) ; fermée par la croix, un tap à
// côté, ou Échap. Rendue dans document.body (même raison WebKit que la feuille des offres, ConversionModal § Sheet),
// AU-DESSUS de tous les hôtes des carrés : feuille des offres et « Ton plan » (9990), fenêtre de bienvenue (10100).
// Accessible : role="dialog" + aria-modal, titre et définition reliés, le focus va sur « Fermer » à l'ouverture,
// reste dans la feuille (Tab), et revient au carré à la fermeture. Mouvement réduit respecté.
// Un clic dans la feuille ne remonte JAMAIS à l'hôte (le fond de la feuille des offres la fermerait) ; Échap ne
// ferme que cette feuille (écouté en capture, avant l'écouteur de l'hôte).
// Les textes : utils/jaugesExplications.js ; les logos de l'EXEMPLE : TexteAvecLogos.

export const Z_EXPLICATION_JAUGE = 10150;
const C = { paper: '#F6F5F1', ink: '#10201B', tealDeep: '#1B6E62', border: '#E7E3D8', trait: '#D8D3C6', texte: '#2B3532', survol: '#E7E3D8' };
const STYLE = `
@keyframes fsJaugeMonte{from{transform:translateY(100%)}to{transform:none}}
@keyframes fsJaugeFondu{from{opacity:0}to{opacity:1}}
.fs-jauge-fond{animation:fsJaugeFondu .18s ease-out}
.fs-jauge-feuille{animation:fsJaugeMonte .26s cubic-bezier(.2,.8,.2,1)}
.fs-jauge-fermer{appearance:none;-webkit-appearance:none;border:0;margin:0;padding:0;background:transparent;font:inherit;-webkit-tap-highlight-color:transparent}
@media (hover:hover){.fs-jauge-fermer:hover{background:${C.survol}}}
.fs-jauge-fermer:focus-visible{outline:2px solid ${C.tealDeep};outline-offset:1px}
@media (prefers-reduced-motion: reduce){.fs-jauge-fond,.fs-jauge-feuille{animation:none}}
`;

/** Le petit « i » des carrés (décor : le carré porte le nom accessible). */
export function IconeInfoJauge({ taille = 13 }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.3" /><path d="M8 7.2v3.6M8 5.1v.1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * cle : annonces | publications | remontees · lang : fr | en · onFermer() · ouvreur : le carré qui a ouvert (le
 * focus y revient ; WebKit ne donne pas le focus à un bouton touché, document.activeElement ne suffit pas).
 */
export default function ExplicationJauge({ cle, lang = 'fr', onFermer, ouvreur = null }) {
  const fermerRef = useRef(null);
  const retour = useRef(ouvreur);
  const fermerCourant = useRef(onFermer);
  const fondAppuye = useRef(false);
  useEffect(() => { fermerCourant.current = onFermer; });
  const id = useId();
  const idTitre = `fs-jauge-titre-${id}`;
  const idDefinition = `fs-jauge-def-${id}`;
  const e = explicationJauge(cle, lang);
  const L = libellesExplication(lang);

  useEffect(() => {
    const avant = retour.current ?? document.activeElement;
    fermerRef.current?.focus({ preventScroll: true });
    // Échap ferme CETTE feuille seule : écouté en capture sur le document, avant l'écouteur de l'hôte (feuille des
    // offres, « Ton plan »), qui fermerait toute la fenêtre.
    const echap = (ev) => {
      if (ev.key !== 'Escape') return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      fermerCourant.current?.();
    };
    document.addEventListener('keydown', echap, true);
    return () => {
      document.removeEventListener('keydown', echap, true);
      try { if (avant?.isConnected) avant.focus({ preventScroll: true }); } catch { /* le carré a pu disparaître */ }
    };
  }, []);

  if (!e || typeof document === 'undefined') return null;

  const clavier = (ev) => {
    if (ev.key === 'Tab') {
      // Un seul élément actif dans la feuille (Fermer) : le focus y reste.
      ev.preventDefault();
      ev.stopPropagation();
      fermerRef.current?.focus({ preventScroll: true });
    }
  };

  return createPortal(
    // Le clic s'arrête ici : dans l'arbre React, la feuille est l'enfant du carré, donc de la carte et de l'hôte.
    <div data-explication-jauge={cle} onClick={(ev) => ev.stopPropagation()} onKeyDown={clavier}
      style={{ position: 'fixed', inset: 0, zIndex: Z_EXPLICATION_JAUGE }}>
      <style>{STYLE}</style>
      {/* Le fond ne ferme que sur un geste COMMENCÉ sur lui : le relâcher d'un appui long sur le carré, qui tombe sur
          le fond monté entre-temps, ne referme pas la feuille qu'il vient d'ouvrir. */}
      <div className="fs-jauge-fond" data-fond-jauge="" aria-hidden="true"
        onPointerDown={() => { fondAppuye.current = true; }}
        onClick={() => { if (fondAppuye.current) onFermer?.(); fondAppuye.current = false; }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(16,32,27,0.48)' }} />
      <div className="fs-jauge-feuille" role="dialog" aria-modal="true" aria-labelledby={idTitre} aria-describedby={idDefinition}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, boxSizing: 'border-box',
          background: C.paper, color: C.ink, borderRadius: '24px 24px 0 0',
          padding: '10px 22px calc(26px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -18px 40px -20px rgba(16,32,27,0.5)', fontFamily: "'Space Grotesk', sans-serif",
          maxHeight: '86vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', textAlign: 'left',
        }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: C.trait, margin: '0 auto 6px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id={idTitre} style={{ margin: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0, color: C.ink }}>{e.titre}</h2>
          <button ref={fermerRef} type="button" className="fs-jauge-fermer" data-fermer-jauge="" aria-label={L.fermer} onClick={() => onFermer?.()}
            style={{
              boxSizing: 'border-box', cursor: 'pointer', width: 44, height: 44, flexShrink: 0, borderRadius: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink,
            }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
              <path d="M4 4l10 10M14 4L4 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p id={idDefinition} style={{ margin: '6px 0 14px', fontSize: 15.5, lineHeight: 1.45 }}>{e.definition}</p>
        <div data-exemple-jauge="" style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tealDeep, marginBottom: 4 }}>{L.exemple}</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.45 }}><TexteAvecLogos texte={e.exemple} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5, lineHeight: 1.45, color: C.texte }}>
          <p style={{ margin: 0 }}><strong>{L.compte}</strong> {e.compte}</p>
          <p style={{ margin: 0 }}><strong>{L.pas}</strong> {e.pas}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
