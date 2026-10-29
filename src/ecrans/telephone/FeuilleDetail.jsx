// La feuille qui monte du bas (téléphone, 29/10) : le détail d'une tuile, d'une pastille ou
// d'une plateforme, avec le CONTENU du panneau de l'ordinateur (bureau/detail.jsx).
// Règle des couches (utils/modale.js) : portail sur document.body, fond figé et barre de
// navigation masquée tant qu'elle est montée (useFondFige), Échap et retour Android la
// ferment (ou reviennent au détail d'avant). On la ferme aussi en la glissant vers le bas
// (poignée, en-tête, ou contenu déjà remonté en haut), au ✕ (44 px) ou d'un toucher dehors.
// Ne se monte QUE pendant qu'elle est ouverte : le retour Android n'est intercepté que là.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFondFige, useEchap, useRetourAndroid } from '../../utils/modale';
import { contenuDetail } from '../bureau/detail';
import { IcoFermer } from '../bureau/pieces';

const SEUIL_FERMETURE = 110; // px glissés vers le bas
const VITESSE_FERMETURE = 0.6; // px/ms : un geste vif ferme même court

export default function FeuilleDetail({ pile, onPile, bloc, stock, f, lang, onAller }) {
  const ouvert = pile[pile.length - 1];
  const feuilleRef = useRef(null), scrimRef = useRef(null), corpsRef = useRef(null), fermerRef = useRef(null);
  const geste = useRef(null);
  const [entree, setEntree] = useState(true);

  const fermer = () => {
    const el = feuilleRef.current;
    if (!el) { onPile([]); return; }
    el.classList.remove('fst-glisse');
    el.style.transform = 'translateY(100%)';
    scrimRef.current?.classList.add('fst-sortie');
    window.setTimeout(() => onPile([]), 260);
  };
  const retour = () => (pile.length > 1 ? onPile(pile.slice(0, -1)) : fermer());
  useFondFige(true);
  useEchap(retour);
  useRetourAndroid(retour);

  // Focus sur ✕ à l'ouverture, rendu à ce qui l'a ouverte à la fermeture.
  useEffect(() => {
    const avant = document.activeElement;
    fermerRef.current?.focus({ preventScroll: true });
    return () => { if (avant && typeof avant.focus === 'function') avant.focus({ preventScroll: true }); };
  }, []);
  // Un nouveau détail (plateforme ouverte depuis la feuille) repart du haut.
  useEffect(() => { corpsRef.current?.scrollTo?.(0, 0); }, [pile.length]);

  const debut = (e, poignee) => {
    if (!poignee && (corpsRef.current?.scrollTop ?? 0) > 0) return;
    if (!poignee && e.target.closest('button, a, .fsb-tactile')) return;
    geste.current = { y0: e.clientY, t0: Date.now(), dy: 0, poignee };
  };
  const bouge = (e) => {
    const g = geste.current; if (!g) return;
    const dy = e.clientY - g.y0;
    if (!g.poignee && dy < 8) return;
    g.dy = Math.max(0, dy);
    const el = feuilleRef.current;
    if (el) { el.classList.add('fst-glisse'); el.style.transform = `translateY(${g.dy}px)`; }
  };
  const lache = () => {
    const g = geste.current; geste.current = null; if (!g) return;
    const el = feuilleRef.current; if (!el) return;
    el.classList.remove('fst-glisse');
    const vitesse = g.dy / Math.max(1, Date.now() - g.t0);
    if (g.dy > SEUIL_FERMETURE || (g.dy > 24 && vitesse > VITESSE_FERMETURE)) fermer();
    else el.style.transform = '';
  };

  if (!ouvert || typeof document === 'undefined') return null;
  const ouvrir = (o) => onPile([...pile, o]);
  const c = contenuDetail({ ouvert, bloc, stock, f, lang, onOuvrir: ouvrir, onAller, tactile: true });
  if (!c) return null;
  const precedent = pile.length > 1 ? contenuDetail({ ouvert: pile[pile.length - 2], bloc, stock, f, lang, onOuvrir: ouvrir, onAller, tactile: true }) : null;
  const poignee = { onPointerDown: (e) => debut(e, true), onPointerMove: bouge, onPointerUp: lache, onPointerCancel: lache };

  return createPortal(
    <>
      <div ref={scrimRef} className="fst-scrim" onClick={fermer} aria-hidden="true" />
      <section ref={feuilleRef} className="fsb fst-feuille" role="dialog" aria-modal="true" aria-labelledby="fst-ftitre"
        // L'animation d'entrée tenue (fill-mode) l'emporterait sur le transform du glisser : on la retire une fois jouée.
        style={entree ? undefined : { animation: 'none' }} onAnimationEnd={(e) => { if (e.target === e.currentTarget) setEntree(false); }}>
        <div className="fst-grab" {...poignee}><i /></div>
        <div className="fst-sh" {...poignee}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
            {precedent && <button type="button" className="fst-retour" onClick={retour}><span aria-hidden="true">‹</span> {precedent.titre}</button>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>{c.icone}<div style={{ minWidth: 0 }}><h2 id="fst-ftitre">{c.titre}</h2><p>{c.sous}</p></div></div>
          </div>
          <button ref={fermerRef} type="button" className="fst-x" onClick={fermer} aria-label={f.L('Fermer', 'Close')}><IcoFermer /></button>
        </div>
        <div ref={corpsRef} className="fst-sb" onPointerDown={(e) => debut(e, false)} onPointerMove={bouge} onPointerUp={lache} onPointerCancel={lache}>{c.corps}</div>
        {c.pied && <div className="fst-pied">{c.pied}</div>}
      </section>
    </>,
    document.body,
  );
}
