// Panneau latéral du Tableau et des Statistiques sur ordinateur (28/10) : chaque
// pastille, chaque tuile et chaque ligne de plateforme ouvre ici son détail.
// Fermeture évidente (bouton « Fermer », Échap, clic à côté), focus rendu à ce
// qui l'a ouvert : aucune navigation perdue, l'écran derrière ne bouge pas.
// (29/10) Le contenu vit dans detail.jsx, partagé avec la feuille du téléphone.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IcoFermer } from './pieces';
import { contenuDetail } from './detail';

export default function PanneauDetail({ ouvert, bloc, stock, f, lang, onFermer, onOuvrir, onAller }) {
  const fermerRef = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const avant = document.activeElement;
    fermerRef.current?.focus({ preventScroll: true });
    const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    document.addEventListener('keydown', clavier);
    return () => { document.removeEventListener('keydown', clavier); if (avant && typeof avant.focus === 'function') avant.focus({ preventScroll: true }); };
  // L'ouverture seule compte : passer d'un détail à l'autre garde le focus d'origine.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(ouvert)]);
  if (!ouvert || typeof document === 'undefined') return null;
  const c = contenuDetail({ ouvert, bloc, stock, f, lang, onOuvrir, onAller });
  if (!c) return null;

  return createPortal(
    <>
      <div className="fsb-scrim" onClick={onFermer} aria-hidden="true" />
      <aside className="fsb fsb-drawer" role="dialog" aria-modal="true" aria-labelledby="fsb-dtitre">
        <div className="fsb-dh">{c.icone}<div style={{ minWidth: 0 }}><h2 id="fsb-dtitre">{c.titre}</h2><p>{c.sous}</p></div>
          <button ref={fermerRef} type="button" className="fsb-close" onClick={onFermer} aria-label={f.L('Fermer le panneau', 'Close panel')}><IcoFermer />{f.L('Fermer', 'Close')} <kbd>{f.L('Échap', 'Esc')}</kbd></button></div>
        <div className="fsb-db">{c.corps}</div>
        {c.pied && <div className="fsb-dfoot">{c.pied}</div>}
      </aside>
    </>,
    document.body,
  );
}
