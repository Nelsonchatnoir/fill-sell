import { Fragment } from 'react';
import { morceauxAvecLogos } from '../utils/logosPlateformes';

// ═══════════════════════════════════════════════════════════════════════════
// UN TEXTE OÙ CHAQUE PLATEFORME PORTE SON LOGO (09/11/2026, maquette « les carrés au tap » validée par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Vinted, Leboncoin, eBay, Beebs et Depop » → l'icône de l'app devant chaque nom, 1,2 em, coins arrondis, et le
// couple logo + nom INSÉCABLE (jamais un logo en fin de ligne et son nom à la suivante). Le logo est un décor
// (alt="") : le nom qui le suit dit tout, au lecteur d'écran comme à l'œil. Sources : utils/logosPlateformes.js.
// Employé par la ligne commune « Dans tous les forfaits » (ConversionModal) et l'EXEMPLE de ExplicationJauge.

const STYLE_LOGO = {
  display: 'inline-block', width: '1.2em', height: '1.2em', borderRadius: '0.3em', verticalAlign: '-0.25em',
  marginRight: '0.3em', boxShadow: '0 0 0 1px rgba(16,32,27,0.12)', objectFit: 'cover', flexShrink: 0,
};

export default function TexteAvecLogos({ texte }) {
  return (
    <span data-texte-logos="">
      {morceauxAvecLogos(texte).map((m, i) => (m.nom ? (
        <span key={i} data-plateforme-logo={m.nom} style={{ whiteSpace: 'nowrap' }}>
          <img src={m.logo} alt="" width="16" height="16" draggable={false} decoding="async" style={STYLE_LOGO} />{m.nom}
        </span>
      ) : <Fragment key={i}>{m.texte}</Fragment>))}
    </span>
  );
}
