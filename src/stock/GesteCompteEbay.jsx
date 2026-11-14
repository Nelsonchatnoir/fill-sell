// ═══════════════════════════════════════════════════════════════════════════
// LE GESTE SOUS UNE PUBLICATION eBAY « COMPTE À FINIR » (14/11/2026, point 5a de Nico — af37fa49)
// ═══════════════════════════════════════════════════════════════════════════
// Le compte eBay est RELIÉ mais pas prêt à vendre. La règle (_shared/ebay-compte-a-finir.js, gesteCompteEbayAFinir,
// lue par utils/shared.js lienVerificationEbay) dit le geste ; ce composant le dessine, le même dans « Où en est la
// publication » et dans la fenêtre ouverte depuis « À régler » (qui n'en montrait AUCUN jusqu'au 14/11) :
//   · ebay_ouvrir_hub        : le lien chez eBay (plafond, inscription vendeur) ;
//   · creer_conditions_ebay  : « Créer mes conditions eBay » (décision de Nico du 04/11), puis l'espace vendeur eBay ;
//   · ouvrir_compte_ebay     : « Finir mon compte eBay » — l'écran eBay de FillSell (Réglages › Compte eBay), qui relève
//                              le compte et dit l'étape qui reste ; sans écran à ouvrir, l'espace vendeur eBay.
// Jamais « Me connecter », jamais « ordinateur » : la personne est connectée, et elle est peut-être au Cloud.
import { ExternalLink } from 'lucide-react';
import BoutonConditionsEbay from './CreerConditionsEbay';
import { LIEN_EBAY_ESPACE_VENDEUR } from '../../supabase/functions/_shared/ebay-compte-a-finir.js';

const PLEIN = {
  display: 'block', width: '100%', textAlign: 'center', padding: '9px 12px', borderRadius: 10, border: 'none',
  color: '#FFFFFF', background: 'linear-gradient(120deg,#2F9E90,#1B6E62)', fontSize: 13, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box',
};
const CREUX = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px 12px',
  borderRadius: 10, border: '1px solid #6B7A75', color: '#3A443F', background: 'transparent', fontSize: 12.5,
  fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const AIDE = { fontSize: 11, lineHeight: 1.4, color: '#6B7A75', marginTop: 4, textAlign: 'center' };

function LienEbay({ url, libelle }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" data-geste-compte-ebay="lien" style={{ ...CREUX, marginTop: 8 }}>
      <span>{libelle}</span><ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

/**
 * @param {{ geste: ReturnType<typeof import('../utils/shared').lienVerificationEbay>, lang?: 'fr'|'en',
 *           onOuvrirCompteEbay?: (() => void) | null }} props
 */
export default function GesteCompteEbay({ geste, lang = 'fr', onOuvrirCompteEbay = null }) {
  if (!geste) return null;
  const en = lang === 'en';
  if (geste.action === 'creer_conditions_ebay') {
    return (
      <div data-geste-compte-ebay="conditions" style={{ marginTop: 8 }}>
        <BoutonConditionsEbay lang={lang} libelle={geste.libelle} aide={geste.aide} style={PLEIN} />
        {geste.lien ? <LienEbay url={geste.lien.url} libelle={geste.lien.libelle} /> : null}
        {geste.apres ? <div style={AIDE}>{geste.apres}</div> : null}
      </div>
    );
  }
  if (geste.action === 'ouvrir_compte_ebay') {
    return (
      <div data-geste-compte-ebay="ouvrir" style={{ marginTop: 8 }}>
        {onOuvrirCompteEbay ? (
          <button type="button" onClick={onOuvrirCompteEbay} style={PLEIN}>{geste.libelle}</button>
        ) : (
          <LienEbay url={geste.lien?.url ?? LIEN_EBAY_ESPACE_VENDEUR} libelle={geste.lien?.libelle ?? (en ? 'Open my eBay seller space' : 'Ouvrir mon espace vendeur eBay')} />
        )}
        {onOuvrirCompteEbay && geste.lien ? <LienEbay url={geste.lien.url} libelle={geste.lien.libelle} /> : null}
        <div style={AIDE}>{geste.aide}</div>
      </div>
    );
  }
  // Le lien chez eBay (plafond, inscription vendeur, vérification d'identité, mur du compte).
  return (
    <div data-geste-compte-ebay="ebay" style={{ marginTop: 8 }}>
      <LienEbay url={geste.url} libelle={geste.libelle} />
      {geste.aide ? <div style={AIDE}>{geste.aide}</div> : null}
    </div>
  );
}
