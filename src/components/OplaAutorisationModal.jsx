// ═══════════════════════════════════════════════════════════════════════════
// OPLA — LA QUESTION SE POSE AU MOMENT DE L'ACTION (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// Décision Nico, prise deux fois : Opla est ouverte à tout le monde, sans
// condition, comme les quatre autres — et à la MOINDRE action qui la concerne,
// on demande la confirmation SUR PLACE. Rien à aller chercher dans les
// réglages, pas un texte gris sous une ligne : une modale, au clic.
//
// ⛔ LA CONTRAINTE VIENT DE CHROME, ELLE N'EST PAS CONTOURNABLE :
// `chrome.permissions.request()` n'obéit qu'à un geste de la personne DANS UNE
// PAGE D'EXTENSION. Une page web ne peut pas l'obtenir. Cette modale ne peut
// donc PAS accorder l'autorisation, et elle ne promet aucun bouton qui le
// ferait. Elle amène au clic réel en une étape, et dit ce qu'on y verra.
//
// ⛔ ET L'ACTION N'EST JAMAIS PERDUE. C'est la moitié rassurante, et elle est
// vraie de bout en bout :
//   · extension qui connaît Opla, sans l'autorisation → le job part en
//     `needs_user` NOMMÉ (needs_user_source='opla_acces') et
//     `rearmerJobsOplaEnAttente` le relance TOUT SEUL à l'octroi ;
//   · extension trop ancienne pour connaître Opla → `PLATFORM_HANDLERS` ne la
//     route pas, le job est « laissé en pending », jamais échoué, jamais
//     perdu : il part à la première mise à jour de l'extension.
// Personne ne refait quoi que ce soit.
import { createPortal } from 'react-dom';
import { UI } from './ui';
import PlatformLogo from './platform-logos/PlatformLogo';
import BoutonMeConnecter, { MESSAGE_AUTORISATION_OPLA } from './BoutonMeConnecter';
import { MOTIFS } from '../utils/connexionPlateformes';

// Trois points de contact, trois phrases de contexte — le geste, lui, est le
// même partout : c'est le seul qui existe, et c'est UN BOUTON (2026-09-23),
// jamais une description d'icône ou de menu.
const T = {
  fr: {
    titre: 'Opla a besoin de ton autorisation',
    // Le MÊME message que partout ailleurs (serveur, extension, cartes).
    geste: MESSAGE_AUTORISATION_OPLA,
    pourquoi: 'Opla demande une autorisation d’accès à son site, une seule fois.',
    publication: 'Ton annonce part quand même : elle attend l’autorisation, puis se dépose toute seule.',
    republication: 'Ta republication part quand même : elle attend l’autorisation, puis repart toute seule.',
    releve: 'Le relevé Opla a besoin de cette autorisation pour lire tes annonces.',
    releveAppoint: 'Si le bouton n’apparaît pas encore, publie une annonce sur Opla : l’extension te le proposera.',
    continuer: 'Continuer',
    compris: 'J’ai compris',
    fermer: 'Fermer',
  },
  en: {
    titre: 'Opla needs your permission',
    geste: 'Opla is waiting for your permission so FillSell can list there. Tap “Autoriser Opla”: once is enough, and the listing goes out on its own.',
    pourquoi: 'Opla asks for access to its site, once.',
    publication: 'Your listing still goes out: it waits for the permission, then posts on its own.',
    republication: 'Your repost still goes out: it waits for the permission, then runs on its own.',
    releve: 'The Opla scan needs this permission to read your listings.',
    releveAppoint: 'If you don’t see the button yet, publish a listing on Opla: the extension will offer it.',
    continuer: 'Continue',
    compris: 'Got it',
    fermer: 'Close',
  },
};

/**
 * @param {'publication'|'republication'|'releve'} contexte  d'où vient le clic
 * @param {function|null} onContinuer  l'action à poursuivre malgré tout (elle
 *        n'est jamais perdue). Absente → la modale ne propose que « J'ai
 *        compris » : c'est le cas du relevé, qui ne peut rien faire sans accès.
 */
export default function OplaAutorisationModal({ lang = 'fr', contexte = 'publication', onContinuer = null, onClose, userId = null }) {
  const t = T[lang === 'en' ? 'en' : 'fr'];
  const suite = contexte === 'releve' ? t.releve : contexte === 'republication' ? t.republication : t.publication;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.titre}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 20100, background: 'rgba(16,32,27,0.45)',
        backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 16px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400, background: UI.card, borderRadius: 20,
          padding: 20, boxShadow: '0 24px 64px rgba(16,32,27,0.28)',
          display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PlatformLogo platform="opla" size={30} />
          <strong style={{ fontSize: 16.5, fontWeight: 700, color: UI.ink, letterSpacing: '-0.02em' }}>{t.titre}</strong>
        </div>

        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#5C6560' }}>{t.pourquoi}</p>

        {/* LE GESTE — mis en avant, parce que c'est la seule chose à faire :
            le bouton lui-même (web : l'extension ouvre sa page ; mobile :
            l'ordinateur l'ouvre). Sans compte connu, la phrase seule. */}
        <div style={{
          background: '#F0FDFB', border: '1px solid rgba(47,158,144,0.28)', borderRadius: 14,
          padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: UI.ink, lineHeight: 1.5 }}>{t.geste}</span>
          {userId && (
            <BoutonMeConnecter userId={userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={lang} variante="bouton" />
          )}
          {contexte === 'releve' && (
            <span style={{ fontSize: 12.5, color: '#5C6560', lineHeight: 1.45 }}>{t.releveAppoint}</span>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: UI.ink }}>{suite}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          {onContinuer ? (
            <>
              <button
                type="button"
                onClick={onContinuer}
                style={{
                  flex: 1, minHeight: 46, borderRadius: 23, border: 'none', fontFamily: 'inherit',
                  background: `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`, color: '#fff',
                  fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t.continuer}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  minHeight: 46, padding: '0 18px', borderRadius: 23, fontFamily: 'inherit',
                  border: `1px solid ${UI.border}`, background: UI.card, color: UI.ink,
                  fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t.fermer}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%', minHeight: 46, borderRadius: 23, border: 'none', fontFamily: 'inherit',
                background: `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`, color: '#fff',
                fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {t.compris}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
