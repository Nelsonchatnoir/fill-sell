// ═══════════════════════════════════════════════════════════════════════════
// LA CARTE D'AVIS — web sur ordinateur (02/10/2026, décision de Nico, lots B3 + C)
// ═══════════════════════════════════════════════════════════════════════════
// Même carte que le popup de l'extension (chrome-extension/popup.html), mêmes
// textes, mêmes règles : elle n'apparaît que quand le SERVEUR l'a décidé
// (fonction avis-demande, _shared/avis-demande.js) et mène à la page d'avis de
// l'extension sur le Chrome Web Store.
// ⛔ Jamais sur iOS / Android : là-bas, c'est la fenêtre OFFICIELLE du store
//    (useDemandeAvis), sans rien devant. Aucune contrepartie, nulle part.
import { useId, useState } from 'react';
import { Sparkles, Star } from 'lucide-react';
import { toucherLeger } from '../utils/retourHaptique';
import './CarteInfo.css';

const TEXTES_CARTE_AVIS = Object.freeze({
  titre: '10 actions, zéro accroc',
  texte: 'Si FillSell te fait gagner du temps, ton avis nous aide énormément.',
  principal: 'Laisser un avis',
  plusTard: 'Plus tard',
  dejaFait: "C'est déjà fait",
});

export default function CarteAvis({ url, onChoix }) {
  const idTitre = useId();
  const [sortie, setSortie] = useState(false);
  const T = TEXTES_CARTE_AVIS;
  const partir = (choix) => {
    toucherLeger();
    setSortie(true);
    const reduit = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    setTimeout(() => onChoix?.(choix), reduit ? 0 : 200);
  };
  return (
    <section className={`fsc fsc-centre${sortie ? ' fsc-sortie' : ''}`} aria-labelledby={idTitre}>
      <div className="fsc-tuile" aria-hidden="true"><Sparkles strokeWidth={2} /></div>
      <h2 id={idTitre} className="fsc-titre">{T.titre}</h2>
      <p className="fsc-texte">{T.texte}</p>
      <div className="fsc-etoiles" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <Star key={i} strokeWidth={0} />)}
      </div>
      <div className="fsc-actions">
        {/* Un vrai lien : le store s'ouvre dans un nouvel onglet, l'app reste là. */}
        <a className="fsc-btn fsc-btn-principal" href={url} target="_blank" rel="noopener noreferrer"
          onClick={() => partir('laisser_avis')}>
          {T.principal}
        </a>
        <div className="fsc-secondaires">
          <button type="button" className="fsc-btn fsc-btn-contour" onClick={() => partir('plus_tard')} disabled={sortie}>{T.plusTard}</button>
          <button type="button" className="fsc-btn fsc-btn-contour" onClick={() => partir('deja_fait')} disabled={sortie}>{T.dejaFait}</button>
        </div>
      </div>
    </section>
  );
}
