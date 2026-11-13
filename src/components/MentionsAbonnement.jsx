// (05/11 soir, décision l de Nico) Les mentions d'un abonnement à renouvellement automatique, au pied d'un écran d'achat :
// le texte et les liens viennent de utils/mentionsAbonnement.js (pur, testé). Les liens s'ouvrent dans le navigateur du
// système sur téléphone (messagerie/ouvrir.js), dans un nouvel onglet sur le web.
import { Capacitor } from '@capacitor/core';
import { mentionsAbonnement } from '../utils/mentionsAbonnement';
import { ouvrirLien } from '../messagerie/ouvrir';

function canalCourant() {
  try {
    if (!Capacitor.isNativePlatform()) return 'web';
    return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  } catch { return 'web'; }
}

export default function MentionsAbonnement({ lang = 'fr', cloud = false, essaiCloud = true, essaiAnnonce = false, style = null }) {
  const { texte, liens } = mentionsAbonnement({ canal: canalCourant(), lang, cloud, essaiCloud, essaiAnnonce });
  return (
    <div data-mentions-abonnement="" style={{ margin: '14px 2px 4px', fontSize: 11, lineHeight: 1.5, color: '#6B7280', ...style }}>
      <p style={{ margin: 0 }}>{texte}</p>
      <p style={{ margin: '6px 0 0', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {liens.map((l) => (
          <a key={l.cle} href={l.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); ouvrirLien(l.url); }}
            // (09/11, C1 « ultra carré ») Zone de toucher de 44 px sans rien déplacer : 14 px de marge intérieure en haut
            // et en bas, rendus par une marge négative (16,5 + 28 = 44,5 px ; le texte reste à sa place, mesuré).
            style={{ color: '#1B6E62', fontWeight: 600, textDecoration: 'underline', padding: '14px 0', margin: '-14px 0' }}>
            {l.libelle}
          </a>
        ))}
      </p>
    </div>
  );
}
