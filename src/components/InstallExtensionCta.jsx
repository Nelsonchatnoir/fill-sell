// ── CTA d'installation de l'extension — UN composant, deux emplacements ──────
// Né inline dans la carte « Tu vends déjà sur Vinted ? » de Stock IA
// (VintedDressingSync, audit Stock vide du 01/09), sorti ici le 05/09 pour
// servir aussi l'étape 1 du Tableau vide — sans second exemplaire à maintenir.
// Le comportement ne change pas d'un écran à l'autre :
//   · sur téléphone (app native ou viewport mobile) : l'e-mail en UN tap
//     (useEnvoiLienExtension — envoi serveur, adresse lue sur le JWT, verrou
//     60 s, persistance partagée avec l'onboarding et ExtensionPitchScreen) ;
//   · sur ordinateur : le lien /extension.
// L'appelant ne décide que de deux choses : la phrase au-dessus (`message`,
// optionnelle) et s'il propose « En savoir plus » (`onEnSavoirPlus`, ouvre la
// feuille ExtensionPitchScreen chez l'hôte — jamais une modale bloquante ici).
// Télémétrie usage_logs install_extension (carte_vue une fois par session,
// clic_mail, mail_envoye, clic_en_savoir_plus) — cf. utils/installExtensionLog.
import { useEffect } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useEnvoiLienExtension, messageEchecLien } from '../hooks/useEnvoiLienExtension';
import { logInstallExtension, logCarteVueUneFois } from '../utils/installExtensionLog';
import { SecondaryButton } from './ui';

export default function InstallExtensionCta({
  lang, isNative = false, userId = null, userEmail = null,
  source = 'stock_vide', message = null, onEnSavoirPlus = null,
}) {
  const fr = lang !== 'en';
  const isMobile = useIsMobile();
  const surTelephone = isNative || isMobile;
  const { envoi, secondesRestantes, envoyer } = useEnvoiLienExtension(lang, userEmail);

  // carte_vue : au montage, une fois par session et par emplacement — la
  // garde vit dans logCarteVueUneFois, pas dans l'effet (un re-rendu ne
  // relance rien, un remontage non plus).
  useEffect(() => { logCarteVueUneFois(userId, source); }, [userId, source]);

  const envoyerEtJournaliser = async () => {
    logInstallExtension(userId, 'clic_mail', source, { renvoi: envoi.etat === 'envoye' });
    const r = await envoyer();
    if (r?.ok) logInstallExtension(userId, 'mail_envoye', source);
  };

  const lienEnSavoirPlus = onEnSavoirPlus ? (
    <button
      onClick={() => { logInstallExtension(userId, 'clic_en_savoir_plus', source); onEnSavoirPlus(); }}
      style={{ display: 'block', margin: '0 auto', background: 'none', border: 'none', padding: 4, fontSize: 12, fontWeight: 700, color: '#1B6E62', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      {fr ? 'En savoir plus' : 'Learn more'}
    </button>
  ) : null;

  return (
    <>
      {message && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#5C6560', fontWeight: 600 }}>{message}</div>
      )}
      {surTelephone ? (
        <>
          {envoi.etat === 'echec' && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, color: '#92400E' }}>
              {messageEchecLien(envoi.raison, fr, !!envoi.email)}
            </div>
          )}
          {envoi.etat === 'envoye' ? (
            <>
              <div style={{ background: '#F0FDFB', border: '1px solid rgba(47,158,144,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5, color: '#1B6E62', textAlign: 'center', wordBreak: 'break-word' }}>
                {fr ? 'Lien envoyé à ' : 'Link sent to '}<strong>{envoi.email}</strong>
                <div style={{ fontSize: 11.5, fontWeight: 500, marginTop: 2, color: '#5C6560' }}>
                  {fr ? 'Ouvre-le sur ton ordinateur, dans Chrome — ton dressing arrivera ici tout seul.' : 'Open it on your computer, in Chrome — your closet will arrive here on its own.'}
                </div>
              </div>
              <button
                onClick={envoyerEtJournaliser}
                disabled={secondesRestantes > 0}
                style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: secondesRestantes > 0 ? '#8A8578' : '#1B6E62', fontSize: 12, fontWeight: 600, cursor: secondesRestantes > 0 ? 'default' : 'pointer', fontFamily: 'inherit', padding: 4, textDecoration: secondesRestantes > 0 ? 'none' : 'underline' }}
              >
                {secondesRestantes > 0
                  ? (fr ? `Renvoyer dans ${secondesRestantes} s` : `Resend in ${secondesRestantes}s`)
                  : (fr ? 'Renvoyer' : 'Resend')}
              </button>
            </>
          ) : envoi.raison !== 'no_email' ? (
            <SecondaryButton disabled={envoi.etat === 'en_cours'} onClick={envoyerEtJournaliser}>
              {envoi.etat === 'en_cours'
                ? (fr ? 'Envoi du lien…' : 'Sending the link…')
                : (fr ? "M'envoyer le lien pour mon ordinateur" : 'Email me the link for my computer')}
            </SecondaryButton>
          ) : null}
        </>
      ) : (
        <a href="/extension" style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none', padding: '10px 14px', borderRadius: 10, border: '1px solid #E7E3D8', background: '#F6F5F1', color: '#1B6E62', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
          {fr ? "Installer l'extension" : 'Install the extension'}
        </a>
      )}
      {lienEnSavoirPlus}
    </>
  );
}
