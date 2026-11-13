// ═══════════════════════════════════════════════════════════════════════════
// LE GESTE D'UNE CONNEXION CHOISIE (13/11/2026, décision de Nico) — un seul rendu pour le Tableau, le Stock, les Réglages
// ═══════════════════════════════════════════════════════════════════════════
// Le geste vient de la règle (./connexionChoisie.js) :
//   · connexion / ouvrir / autoriser_depop → BoutonMeConnecter (LE bouton « Me connecter » de l'app : un lien sur le
//     web, une demande à l'ordinateur sur téléphone, les deux voies pour eBay, le geste du Cloud pour un client Cloud) ;
//   · cloud → l'écran de connexion de FillSell Cloud (ouvrirConnexionCloud) ;
//   · relier_ebay_api → le parcours eBay par l'API, le seul d'un client Cloud (jamais la voie « Chrome ouvert »).
import { useState } from 'react';
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { UI } from '../components/ui';
import { MOTIFS } from '../utils/connexionPlateformes';
import { ouvrirConnexionCloud } from '../cloud/connexionsCloud';
import { demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';

const habit = (inerte = false) => ({
  minHeight: 44, padding: '0 16px', borderRadius: 22, border: `1px solid ${UI.border}`, background: UI.card, color: UI.ink,
  fontFamily: 'inherit', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 9, flexShrink: 0,
  cursor: inerte ? 'default' : 'pointer', opacity: inerte ? 0.6 : 1, alignSelf: 'flex-start',
});

export default function GesteConnexion({ ligne, userId, lang = 'fr', onOuverte = null, onAvantCloud = null, origine = 'connexions_choisies' }) {
  const [enVol, setEnVol] = useState(false);
  const g = ligne?.geste;
  if (!g) return null;
  if (g.type === 'cloud') {
    return (
      <button type="button" data-connexion-choisie-cloud={ligne.p} onClick={() => { onAvantCloud?.(); ouvrirConnexionCloud(origine); }} style={habit()}>
        <PlatformLogo platform={ligne.p} size={20} /><span>{g.libelle}</span>
      </button>
    );
  }
  if (g.type === 'relier_ebay_api') {
    const relier = async () => {
      setEnVol(true);
      try { const { url } = await demarrerConnexionEbay(lang); if (url) await ouvrirConsentementEbay(url); onOuverte?.(); }
      catch { /* la section eBay des Réglages porte le détail */ }
      finally { setEnVol(false); }
    };
    return (
      <button type="button" disabled={enVol} onClick={relier} style={habit(enVol)}>
        <PlatformLogo platform="ebay" size={20} /><span>{enVol ? (lang === 'en' ? 'Opening…' : 'On ouvre…') : g.libelle}</span>
      </button>
    );
  }
  const motif = g.type === 'autoriser_depop' ? MOTIFS.AUTORISER_DEPOP : MOTIFS.CONNEXION;
  return (
    <BoutonMeConnecter userId={userId} platform={ligne.p} motif={motif} lang={lang} variante="bouton"
      libelleImpose={g.type === 'ouvrir' ? g.libelle : null} onOuverte={onOuverte ?? undefined} />
  );
}
