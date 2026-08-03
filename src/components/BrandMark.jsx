/**
 * Marque FillSell (logo + wordmark) du header.
 *
 * Extraite du topbar de l'app connectée (App.jsx) pour que le header public de
 * la landing soit strictement le même : mêmes assets, mêmes classes, donc même
 * typo et mêmes couleurs.
 *
 * ⚠️ Le commentaire d'origine affirmait ici qu'« aucun CSS n'est dupliqué »
 * parce qu'App.css est « chargé globalement sur toutes les routes ». Ce n'est
 * PLUS vrai depuis le code-splitting par route (5115c57, 02/08) : la landing
 * ne charge plus App.css, et le 03/08 le logo s'affichait DEUX FOIS sur
 * fillsell.app en mobile, wordmark par-dessus. Les styles voyagent donc
 * désormais avec le composant (BrandMark.css) — ne pas les retirer en croyant
 * dédupliquer.
 *
 * Le reste du topbar (profit du mois, badge de plan, réglages) dépend d'un
 * utilisateur connecté et n'a pas de sens sur la landing : il reste dans App.jsx.
 */
import './BrandMark.css';

export default function BrandMark({ onClick }) {
  return (
    <button onClick={onClick} className="tb-logo">
      <img src="/icon_1024x1024.png" alt="FillSell" className="logo-mobile"
        style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
      <img src="/logo.png" alt="FillSell" className="logo-desktop"
        style={{ height: 34, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
      <span className="name">FillSell</span>
    </button>
  );
}
