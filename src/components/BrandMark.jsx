/**
 * Marque FillSell (logo + wordmark) du header.
 *
 * Extraite du topbar de l'app connectée (App.jsx) pour que le header public de
 * la landing soit strictement le même : mêmes assets, mêmes classes, donc même
 * typo et mêmes couleurs. Aucun CSS n'est dupliqué — .tb-logo, .tb-logo .name,
 * .logo-desktop et .logo-mobile vivent dans App.css / App.redesign.css, qui
 * sont chargés globalement (App.jsx est importé par AppRouter sur toutes les
 * routes, landing comprise).
 *
 * Le reste du topbar (profit du mois, badge de plan, réglages) dépend d'un
 * utilisateur connecté et n'a pas de sens sur la landing : il reste dans App.jsx.
 */
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
