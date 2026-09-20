// ── 3. L'EXTENSION — L'ÉTAPE CENTRALE ───────────────────────────────────────
// Sans elle, l'app ne dépose rien, ne relève rien, ne republie rien. Elle
// n'est donc plus une note de bas de page : c'est l'écran du milieu, avec son
// schéma, et le seul dont la détection tourne en fond.
//
// L'ACTION dépend du support, exactement comme avant :
//   · téléphone  → le tap ENVOIE l'e-mail (useEnvoiLienExtension : envoi
//     serveur, adresse lue sur le JWT, verrou 60 s, mémoire partagée avec le
//     Stock et ExtensionPitchScreen) ;
//   · ordinateur → ExtensionPitchScreen (lien /extension).
// ⛔ CE MAIL NE PASSE PAS PAR `send-relance` : useEnvoiLienExtension appelle
//    utils/extensionLink (fonction dédiée, type `extension_link`). Il ne
//    compte dans aucun plafond de campagne.
// ⛔ Le délai MESURÉ entre l'envoi du lien et l'installation est d'environ
//    70 h en médiane : l'écran ne fait jamais attendre. On avance quand on
//    veut, la détection suit toute seule (poll 8 s dans useContexteEntree,
//    arrêté au démontage et dès que l'extension est vue).
import { useState } from 'react';
import ExtensionPitchScreen from '../components/ExtensionPitchScreen';
import { messageEchecLien } from '../hooks/useEnvoiLienExtension';
import { supabase } from '../lib/supabase';
import { logInstallExtension } from '../utils/installExtensionLog';
import SchemaExtension from './SchemaExtension';
import TutoTelephonePC from './TutoTelephonePC';
import { E } from './theme';
import { Scene, Kicker, Titre, Texte, BoutonPrimaire, LienDiscret, Bande, Etat } from './EntreeUI';

export default function EtapeExtension({ c, T, onSuivant }) {
  const [pitch, setPitch] = useState(false);
  const { envoi, secondesRestantes } = c;

  const envoyerEtJournaliser = async () => {
    logInstallExtension(c.user?.id ?? null, 'clic_mail', 'entree', { renvoi: envoi.etat === 'envoye' });
    const r = await c.envoyerLien();
    if (r?.ok) logInstallExtension(c.user?.id ?? null, 'mail_envoye', 'entree');
  };

  const action = () => {
    if (!c.surTelephone) { setPitch(true); return; }
    if (envoi.etat === 'envoye') { c.journaliser('continuer_telephone'); onSuivant(); return; }
    envoyerEtJournaliser();
  };

  const libelleCta = !c.surTelephone
    ? T.extCtaInstaller
    : envoi.etat === 'en_cours' ? T.extCtaMailEnCours
      : envoi.etat === 'envoye' ? T.extContinuerTel
        : T.extCtaMail;

  return (
    <Scene
      cle="extension"
      pied={(
        <>
          <BoutonPrimaire onClick={action} disabled={envoi.etat === 'en_cours'}>{libelleCta}</BoutonPrimaire>
          {/* Renvoi : verrou 60 s, le même que le limiteur de la fonction. */}
          {c.surTelephone && envoi.etat === 'envoye' && (
            <LienDiscret
              onClick={secondesRestantes > 0 ? undefined : envoyerEtJournaliser}
              style={{
                marginTop: 8, fontSize: 12.5,
                color: secondesRestantes > 0 ? E.texteSecondaire : E.tealDeep,
                cursor: secondesRestantes > 0 ? 'default' : 'pointer',
                textDecoration: secondesRestantes > 0 ? 'none' : 'underline',
              }}
            >
              {secondesRestantes > 0
                ? (c.fr ? `Renvoyer dans ${secondesRestantes} s` : `Resend in ${secondesRestantes}s`)
                : (c.fr ? 'Renvoyer' : 'Resend')}
            </LienDiscret>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            {c.extensionVue ? <Etat ok>{T.extVue}</Etat> : (
              <>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: E.teal, animation: 'enPouls 1.8s ease-in-out infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: E.texteSecondaire }}>{T.extDetection}</span>
              </>
            )}
          </div>
        </>
      )}
    >
      <Kicker>{T.extKicker}</Kicker>
      <Titre>{T.extTitre}</Titre>
      <Texte>{T.extTexte}</Texte>

      <SchemaExtension T={T} />
      {/* ⛔ LE TUTO EST SUR CET ÉCRAN, PAS SUR CELUI DES DÉBUTANTS. « Je
          photographie depuis l'app, mon ordinateur resté ouvert reprend le
          travail » vaut pour tout le monde — y compris pour qui a déjà 200
          annonces en ligne. Le mettre derrière la réponse « rien en ligne »
          le réservait à une minorité. */}
      <TutoTelephonePC T={T} style={{ marginBottom: 14 }} />

      {envoi.etat === 'echec' && (
        <div style={{ marginBottom: 10 }}>
          <Bande ton="alerte">{messageEchecLien(envoi.raison, c.fr, !!envoi.email)}</Bande>
          <LienDiscret onClick={() => setPitch(true)} style={{ marginTop: 6, fontSize: 12.5, textDecoration: 'underline' }}>
            {T.extAutrement}
          </LienDiscret>
        </div>
      )}

      {envoi.etat === 'envoye' && (
        <div className="en-monte" style={{ background: E.mentheVive, border: `1px solid ${E.mentheBord}`, borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: E.tealDeep, wordBreak: 'break-word' }}>
            {T.extLienEnvoyeA} {envoi.email}
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: E.texteSecondaire }}>{T.extLienSuite}</div>
        </div>
      )}

      {pitch && (
        <ExtensionPitchScreen
          lang={c.lang}
          onClose={() => setPitch(false)}
          supabase={supabase}
          userId={c.user?.id ?? null}
          recoursSeulement={c.surTelephone && envoi.etat === 'echec'}
          onExtensionSeen={() => setPitch(false)}
          eyebrow={T.extPitchEyebrow}
          body={T.extPitchCorps}
        />
      )}
    </Scene>
  );
}
