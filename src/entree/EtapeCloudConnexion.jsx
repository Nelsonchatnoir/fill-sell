// ── 2 quater. FILLSELL CLOUD : « CONNECTE TES COMPTES, UNE FOIS » (04/11/2026, lot 3) ──
// Maquette o-cloud-connexion (v3), validée par Nico le 03/11 : l'écran
// « Me connecter » DANS LA TRAME DU PARCOURS. N'existe qu'une fois l'option
// active, sur la voie Cloud (plan.js).
//
// CE QUI EST REPRIS, SANS RIEN MODIFIER DE src/cloud/ :
//   · les ÉTATS : les lectures de « Me connecter » (c.cloud.connexions, monté
//     par useCloudEntree) et ses fonctions pures (cloud/executant.js) ;
//   · les MOTS : textesConnexion (Connecté, À connecter, Me connecter, Relier
//     eBay, la vérification à résoudre…) ;
//   · la PAGE DE CONNEXION : le composant `Vue` de MeConnecterCloud (le même
//     que le bandeau de reconnexion ouvre), posé sur body au-dessus du parcours.
//   · eBay : la connexion OFFICIELLE (demarrerConnexionEbay + ouvrirConsentementEbay),
//     jamais une page dans le navigateur du Cloud.
// ⛔ Une seule connexion suffit pour avancer ; « Continuer » ne dépend de rien.
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { Vue } from '../cloud/MeConnecterCloud';
import { textesConnexion } from '../cloud/textesConnexion';
import { demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';
import { E, TACTILE } from './theme';
import { Scene, Kicker, Titre, Texte, Carte, BoutonPrimaire, LienDiscret, Bande, Etat } from './EntreeUI';
import { NOMS_FORMULES } from '../cloud/textesFormules';

const styleBouton = {
  flexShrink: 0, minHeight: TACTILE, padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${E.tealDeep}`, background: E.card,
  color: E.tealDeep, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};

function Rangee({ logo, nom, sous, droite, dernier }) {
  // (14/11/2026) translate="no" : la traduction du navigateur ne touche jamais une ligne de connexion ni son bouton.
  return (
    <div translate="no" className="notranslate" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: dernier ? 'none' : `1px solid ${E.ligneDouce}` }}>
      {logo}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: E.ink }}>{nom}</span>
        {sous && <span style={{ fontSize: 11.5, lineHeight: 1.4, color: E.texteSecondaire }}>{sous}</span>}
      </span>
      {droite}
    </div>
  );
}

export default function EtapeCloudConnexion({ c, T, onSuivant }) {
  const k = c.cloud;
  const cx = k.connexions;
  const TX = textesConnexion(c.lang);
  const [ouverte, setOuverte] = useState(null);
  const [ebayEnCours, setEbayEnCours] = useState(false);
  const relire = cx.relire;
  // ⚠️ STABLE : la Vue relance sa connexion à chaque nouveau `onFermer` (dépendance de son effet).
  const fermerVue = useCallback((connectee) => { setOuverte(null); if (connectee) relire(); }, [relire]);
  const ebayRelie = cx.ebayRelie === true || c.ebayRelie === true;

  const ouvrir = (l) => {
    c.journaliser('cloud_connexion_ouverte', { plateforme: l.id, ...(l.verif === 'a_resoudre' ? { mode: 'resoudre' } : {}) });
    setOuverte(l.verif === 'a_resoudre' ? { ...l, mode: 'resoudre' } : l);
  };
  const relierEbay = async () => {
    setEbayEnCours(true);
    try {
      const r = await demarrerConnexionEbay();
      const url = r?.url ?? r?.consent_url ?? null;
      if (url) {
        c.journaliser('cloud_ebay_ouvert');
        await ouvrirConsentementEbay(url);
        c.setEbayRelie(true);
        relire();
      }
    } catch (e) { console.warn('[entree] connexion eBay :', e?.message ?? e); }
    setEbayEnCours(false);
  };

  const droite = (l) => {
    if (l.verif) {
      return l.verif === 'a_resoudre'
        ? <button type="button" onClick={() => ouvrir(l)} className="en-focus" style={styleBouton}>{TX.resoudre}</button>
        : null;
    }
    if (l.etat === 'connecte') return <Etat ok>{TX.connecte}</Etat>;
    return (
      <button type="button" onClick={() => ouvrir(l)} className="en-focus" style={styleBouton}>
        {l.etat === 'a_reconnecter' ? TX.reconnecter : TX.meConnecter}
      </button>
    );
  };
  const sous = (l) => {
    if (l.verif) return TX.verifEtat[l.verif] ?? null;
    if (l.etat === 'connecte') return null;
    return l.etat === 'a_reconnecter' ? TX.aReconnecter : TX.aConnecter;
  };

  const vue = ouverte && c.user?.id ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }}>
      <Vue userId={c.user.id} plateforme={ouverte.id} nom={ouverte.nom} lang={c.lang} onFermer={fermerVue} mode={ouverte.mode ?? null} />
    </div>
  ) : null;

  return (
    <Scene
      cle="cloud_connexion"
      pied={(
        <>
          <BoutonPrimaire onClick={() => { c.journaliser('cloud_connexions_suite', { connectees: cx.connectees, total: cx.total }); onSuivant(); }}>{T.continuer}</BoutonPrimaire>
          {cx.etat === 'ok' && <Texte centre style={{ margin: '10px 0 0', fontSize: 12 }}>{T.cxCompte(cx.connectees, cx.total)}</Texte>}
        </>
      )}
    >
      {/* (11/11/2026) Sur la voie des formules avec Cloud : « Pro + Cloud activé · essai jusqu'au … ». */}
      <Kicker>{c.formules?.parcours === true && NOMS_FORMULES[c.formules.choisie] ? T.formCxKicker(NOMS_FORMULES[c.formules.choisie], k.essaiFinCourt) : T.cxKicker(k.essaiFinCourt)}</Kicker>
      <Titre>{T.cxTitre}</Titre>
      <Texte>{T.cxTexte}</Texte>

      <Carte style={{ padding: '6px 16px', marginBottom: 12 }}>
        {cx.etat === 'lecture' && <p style={{ margin: '10px 0', fontSize: 13, color: E.texteSecondaire }}>{TX.lecture}</p>}
        {cx.etat === 'echec' && (
          <div style={{ padding: '6px 0' }}>
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: E.ink }}>{TX.lectureEchec}</p>
            <LienDiscret onClick={relire} style={{ textDecoration: 'underline', color: E.tealDeep }}>{T.cxReessayer}</LienDiscret>
          </div>
        )}
        {cx.etat === 'ok' && cx.lignes.map((l) => (
          <Rangee key={l.id} logo={<PlatformLogo platform={l.id} size={28} />} nom={l.nom} sous={sous(l)} droite={droite(l)} />
        ))}
        <Rangee
          dernier
          logo={<PlatformLogo platform="ebay" size={28} />}
          nom={TX.ebayTitre}
          sous={ebayRelie ? TX.ebayRelie : T.cxEbaySous}
          droite={ebayRelie ? null : (
            <button type="button" onClick={relierEbay} disabled={ebayEnCours} className="en-focus" style={{ ...styleBouton, opacity: ebayEnCours ? 0.6 : 1 }}>
              {TX.ebayRelier}
            </button>
          )}
        />
      </Carte>

      <Bande>{T.cxBande}</Bande>

      {vue && (typeof document === 'undefined' ? vue : createPortal(vue, document.body))}
    </Scene>
  );
}
