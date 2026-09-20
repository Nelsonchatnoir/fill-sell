// ── 2. eBAY, LÀ OÙ LA PERSONNE VIENT DE COCHER eBAY ─────────────────────────
// Le défaut réparé ici : la connexion OAuth vivait dans Réglages › Mes
// plateformes, personne ne l'y trouvait, et des comptes publiaient sur eBay
// par l'extension SANS compte relié — donc sans détection de vente par API et
// sans politique de livraison.
//
// ⛔ ELLE NE BLOQUE JAMAIS. « Plus tard » sort de l'étape, l'entrée dans l'app
//    n'en dépend pas, et la phrase dit la vérité : sans OAuth, l'extension
//    dépose quand même.
// ⛔ AUCUN APPEL NEUF : demarrerConnexionEbay + ouvrirConsentementEbay, les
//    deux fonctions de utils/ebayCompte déjà utilisées par EbayCompteSection.
import { useState } from 'react';
import { demarrerConnexionEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, Carte, BoutonPrimaire, LienDiscret, Bande, Etat } from './EntreeUI';

export default function EtapeEbay({ c, T, onSuivant }) {
  const [etat, setEtat] = useState('idle'); // idle | en_cours | echec
  const [erreur, setErreur] = useState(null);

  const connecter = async () => {
    if (c.ebayRelie) { onSuivant(); return; }
    setEtat('en_cours');
    setErreur(null);
    try {
      const r = await demarrerConnexionEbay();
      // EbayCompteSection lit `url` ; le repli couvre une réponse plus
      // ancienne sans rien supposer de neuf côté fonction.
      const url = r?.url ?? r?.consent_url ?? null;
      if (!url) throw new Error('URL de consentement absente');
      c.journaliser('ebay_oauth_ouvert');
      // Web : la page eBay remplace l'app, retour sur /ebay/retour.
      // Natif : navigateur système, la personne referme et revient ici.
      await ouvrirConsentementEbay(url);
      c.setEbayRelie(true);
      setEtat('idle');
    } catch (e) {
      console.warn('[entree] consentement eBay indisponible :', e?.message ?? e);
      setErreur(e?.message ?? null);
      setEtat('echec');
    }
  };

  return (
    <Scene
      cle="ebay"
      pied={(
        <>
          <BoutonPrimaire onClick={connecter} disabled={etat === 'en_cours'}>
            {etat === 'en_cours' ? T.ebayEnCours : c.ebayRelie ? T.continuer : T.ebayCta}
          </BoutonPrimaire>
          <LienDiscret onClick={() => { c.journaliser('ebay_plus_tard'); onSuivant(); }} style={{ marginTop: 10 }}>
            {T.ebayPlusTard}
          </LienDiscret>
        </>
      )}
    >
      <Kicker>{T.ebayKicker}</Kicker>
      <Titre>{T.ebayTitre}</Titre>
      <Texte>{T.ebayTexte}</Texte>

      <Carte style={{ padding: '4px 16px', marginBottom: 14 }}>
        {T.ebayGains.map((g, k) => (
          <div
            key={g}
            className="en-monte"
            style={{
              display: 'flex', gap: 11, alignItems: 'flex-start', padding: '13px 0',
              borderBottom: k === T.ebayGains.length - 1 ? 'none' : `1px solid ${E.ligneDouce}`,
              animationDelay: `${k * 70}ms`,
            }}
          >
            <span aria-hidden="true" style={{
              width: 19, height: 19, marginTop: 1, borderRadius: 10, flexShrink: 0, background: E.menthe,
              border: `1px solid ${E.mentheBord}`, color: E.tealDeep, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}>✓</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: E.ink }}>{g}</span>
          </div>
        ))}
      </Carte>

      {etat === 'echec' && (
        <div style={{ marginBottom: 12 }}>
          <Bande ton="alerte">
            {c.fr
              ? "eBay n'a pas pu ouvrir sa page de consentement. Rien n'est cassé : tu peux réessayer, ou le faire plus tard dans Réglages › Mes plateformes."
              : "eBay couldn't open its consent page. Nothing is broken: try again, or do it later in Settings › My platforms."}
            {erreur ? ` (${erreur})` : ''}
          </Bande>
        </div>
      )}

      {c.ebayRelie
        ? <Etat ok>{T.ebayRelie}</Etat>
        : <Texte style={{ margin: 0, fontSize: 12.5 }}>{T.ebayNote}</Texte>}
    </Scene>
  );
}
