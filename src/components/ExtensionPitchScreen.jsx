// ── Accroche extension : la publication attend un ordinateur ─────────────────
// Affiché quand profiles.extension_last_seen_at est NULL — aucune copie de
// l'extension n'a JAMAIS pollé pour ce compte, donc un job de publication ne
// serait ramassé par personne (23 jobs de comptes mobiles dormaient en pending,
// unités débitées, constat du 04/08). Le RPC spend_coins_and_publish porte la
// même garde côté serveur (reason 'extension_required') : cet écran évite de
// découvrir le mur au dernier clic, il ne protège pas l'argent — le serveur
// s'en charge.
//
// C'est une ACCROCHE, pas un mur : l'argument mis en avant est la synchro
// GRATUITE du dressing Vinted (tout remonte en quelques secondes), pas
// l'obligation technique. Deux modes :
//  - allowContinue (entrée du parcours) : « Préparer mon annonce » reste
//    possible — photos, retouche, génération se font très bien sans extension,
//    seule la publication attendra.
//  - bloquant (clic Publier) : pas de « continuer », mais un « J'ai installé
//    l'extension → vérifier » qui relit le profil (le premier poll de
//    l'extension stampe extension_last_seen_at en ~2 min).
// PAS de case « ne plus afficher » : contrairement au rappel informatif
// (ExtensionReminderModal, conservé pour les comptes dont l'extension est
// connue), cet écran correspond à un état bloquant réel.
//
// Récupération du lien sur ordinateur (utilisateur mobile) : UN TAP, l'e-mail
// part à l'adresse du compte (send-extension-link, déployée le 09/08). Le
// `mailto:` pré-rempli qui tenait ce rôle depuis l'origine — l'utilisateur
// devait saisir sa propre adresse et envoyer lui-même — n'est plus qu'un
// RECOURS, montré si l'envoi échoue. Sur desktop : lien direct /extension.
//
// Cette feuille est montée depuis SIX endroits (App, StockTab ×2, LensTab ×2,
// ListingPreviewScreen) plus l'onboarding : c'est ici, et nulle part ailleurs,
// que « m'envoyer le lien » doit se comporter — d'où le hook partagé.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Puzzle, ExternalLink, Mail, Copy, Check, RefreshCw, Send } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useIsMobile } from '../hooks/useIsMobile';
import { useEnvoiLienExtension, messageEchecLien } from '../hooks/useEnvoiLienExtension';

const C = {
  canvas: '#EDEAE0',
  paper:  '#F6F5F1',
  ink:    '#10201B',
  teal:   '#2F9E90',
  tealDeep: '#1B6E62',
  mute:   '#8A8578',
  mute2:  '#5C6560',
  border: '#E7E3D8',
};

const ANIM = `
@keyframes fsSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fsFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes fsSpin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const EXTENSION_URL = 'https://fillsell.app/extension';

export default function ExtensionPitchScreen({
  lang, onClose, onContinue = null, supabase = null, userId = null, onExtensionSeen = null,
  // Textes surchargeables (lot 2, onboarding) : le MÉCANISME (lien /extension,
  // mailto, copie, re-vérification) est unique — seul le discours change selon
  // le contexte (publier vs importer le dressing). null = textes historiques.
  eyebrow = null, body = null,
  // Ouverte APRÈS un échec d'envoi (« Récupérer le lien autrement ») : on ne
  // repropose pas le bouton qui vient de tomber, seulement les recours.
  recoursSeulement = false,
}) {
  const fr = lang !== 'en';
  const isMobile = useIsMobile();
  const onComputer = !Capacitor.isNativePlatform() && !isMobile;
  const { envoi, secondesRestantes, envoyer } = useEnvoiLienExtension(lang);
  const [copied, setCopied]     = useState(false);
  const [checking, setChecking] = useState(false);
  // null = pas encore vérifié ; false = vérifié, toujours rien
  const [checkResult, setCheckResult] = useState(null);

  const mailtoHref = `mailto:?subject=${encodeURIComponent(
    fr ? 'Lien extension FillSell (à ouvrir sur ordinateur)' : 'FillSell extension link (open on a computer)'
  )}&body=${encodeURIComponent(
    fr
      ? `Installe l'extension FillSell sur ton ordinateur :\n${EXTENSION_URL}\n\nElle synchronise ton dressing Vinted en quelques secondes et publie tes annonces sur Vinted, Leboncoin, eBay et Beebs.`
      : `Install the FillSell extension on your computer:\n${EXTENSION_URL}\n\nIt syncs your Vinted wardrobe in seconds and posts your listings on Vinted, Leboncoin, eBay and Beebs.`
  )}`;

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EXTENSION_URL);
      } else {
        // WebViews anciennes sans API clipboard : textarea + execCommand.
        const ta = document.createElement('textarea');
        ta.value = EXTENSION_URL;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* presse-papiers indisponible : le mailto reste le chemin */ }
  }

  // Relit le profil : le premier poll get-pending-jobs de l'extension stampe
  // extension_last_seen_at (~2 min après installation). Trouvé → l'hôte lève
  // la garde et reprend le parcours.
  async function recheck() {
    if (!supabase || !userId || checking) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const { data } = await supabase
        .from('profiles').select('extension_last_seen_at').eq('id', userId).maybeSingle();
      if (data?.extension_last_seen_at) {
        onExtensionSeen?.();
        return;
      }
      setCheckResult(false);
    } finally {
      setChecking(false);
    }
  }

  const btnBase = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 14px', borderRadius: 14,
    fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
    textDecoration: 'none', cursor: 'pointer',
  };

  return createPortal(
    <>
      <style>{ANIM}</style>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: 'rgba(16,32,27,0.55)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'fsFadeIn 0.2s ease',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 480,
            background: C.canvas, borderRadius: '26px 26px 0 0',
            maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            padding: '14px 18px calc(env(safe-area-inset-bottom, 0px) + 26px)',
            animation: 'fsSheetUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border, margin: '0 auto 18px' }} />

          {/* ── Ordre imposé (lot 4, 09/08) ────────────────────────────────────
              titre court → LE bouton, visible sans scroll → deux lignes au
              plus → tout le reste après. L'argumentaire de quatre lignes qui
              vivait ICI, avant le bouton, poussait l'action sous la ligne de
              flottaison : il est passé sous l'action, en secondaire. Rien
              d'indispensable pour décider de cliquer ne se lit après le clic —
              et réciproquement. */}
          <div style={{
            width: 44, height: 44, borderRadius: 14, margin: '0 auto 10px',
            background: 'rgba(47,158,144,0.12)', border: '1px solid rgba(47,158,144,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Puzzle size={22} color={C.tealDeep} />
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.mute, marginBottom: 5 }}>
            {eyebrow ?? (fr ? 'Pour publier tes annonces' : 'To post your listings')}
          </div>
          <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', marginBottom: 14, lineHeight: 1.25 }}>
            {onComputer
              ? (fr ? "L'extension FillSell, dans Chrome" : 'The FillSell extension, in Chrome')
              : (fr ? "L'extension s'installe sur ordinateur" : 'The extension installs on a computer')}
          </div>

          {onComputer ? (
            <a href="/extension" style={{ ...btnBase, background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff', border: 'none', marginBottom: 10, boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)' }}>
              {fr ? "Installer l'extension" : 'Install the extension'}
              <ExternalLink size={14} strokeWidth={2.4} />
            </a>
          ) : (
            <>
              {/* Chemin principal : UN TAP = l'e-mail part à l'adresse du
                  compte, et la confirmation la NOMME (sinon l'utilisateur ne
                  sait pas dans quelle boîte regarder). */}
              {!recoursSeulement && envoi.etat === 'envoye' && (
                <>
                  <div style={{ background: '#F0FDFB', border: '1px solid rgba(47,158,144,0.25)', borderRadius: 14, padding: '12px 14px', marginBottom: 6, fontSize: 13.5, lineHeight: 1.5, color: C.tealDeep, textAlign: 'center', wordBreak: 'break-word' }}>
                    {fr ? 'Lien envoyé à ' : 'Link sent to '}
                    <strong>{envoi.email}</strong>
                  </div>
                  <button
                    onClick={envoyer}
                    disabled={secondesRestantes > 0}
                    style={{ ...btnBase, background: 'none', border: 'none', padding: '8px 12px', color: secondesRestantes > 0 ? C.mute : C.tealDeep, fontSize: 12.5, fontWeight: 600, cursor: secondesRestantes > 0 ? 'default' : 'pointer', textDecoration: secondesRestantes > 0 ? 'none' : 'underline', marginBottom: 4 }}
                  >
                    {secondesRestantes > 0
                      ? (fr ? `Renvoyer dans ${secondesRestantes} s` : `Resend in ${secondesRestantes}s`)
                      : (fr ? 'Renvoyer' : 'Resend')}
                  </button>
                </>
              )}

              {!recoursSeulement && envoi.etat !== 'envoye' && (
                <>
                  {envoi.etat === 'echec' && (
                    <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 14, padding: '11px 13px', marginBottom: 8, fontSize: 12.5, lineHeight: 1.5, color: '#92400E' }}>
                      {messageEchecLien(envoi.raison, fr, !!envoi.email)}
                    </div>
                  )}
                  {envoi.raison !== 'no_email' && (
                    <button
                      onClick={envoyer}
                      disabled={envoi.etat === 'en_cours'}
                      style={{ ...btnBase, background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff', border: 'none', marginBottom: 8, boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)', opacity: envoi.etat === 'en_cours' ? 0.7 : 1 }}
                    >
                      {envoi.etat === 'en_cours'
                        ? <RefreshCw size={15} strokeWidth={2.4} style={{ animation: 'fsSpin 1s linear infinite' }} />
                        : <Send size={15} strokeWidth={2.4} />}
                      {envoi.etat === 'en_cours'
                        ? (fr ? 'Envoi du lien…' : 'Sending the link…')
                        : (fr ? "M'envoyer le lien pour mon ordinateur" : 'Email me the link for my computer')}
                    </button>
                  )}
                </>
              )}

              {/* RECOURS seulement — jamais le chemin principal : le mailto
                  oblige à saisir sa propre adresse et à envoyer soi-même. */}
              {(recoursSeulement || envoi.etat === 'echec') && (
                <>
                  <a href={mailtoHref} style={{ ...btnBase, background: C.paper, border: `1px solid ${C.border}`, color: C.ink, marginBottom: 8 }}>
                    <Mail size={15} strokeWidth={2.4} />
                    {fr ? "Écrire le mail moi-même" : 'Write the email myself'}
                  </a>
                  <button onClick={copyLink} style={{ ...btnBase, background: C.paper, border: `1px solid ${C.border}`, color: copied ? C.tealDeep : C.ink, marginBottom: 10 }}>
                    {copied ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2.4} />}
                    {copied ? (fr ? 'Lien copié !' : 'Link copied!') : (fr ? 'Copier le lien' : 'Copy the link')}
                  </button>
                </>
              )}
            </>
          )}

          {/* Deux lignes AU PLUS sous le bouton — ce qui aide à comprendre ce
              qu'on vient de déclencher, rien de plus. */}
          <p style={{ margin: '2px 0 14px', fontSize: 12.5, color: C.mute, lineHeight: 1.5, textAlign: 'center' }}>
            {onComputer
              ? (fr
                  ? "Gratuite, installée en une minute."
                  : 'Free, installed in a minute.')
              : (envoi.etat === 'envoye'
                  ? (fr ? "Ouvre-le sur ton ordinateur, dans Chrome." : 'Open it on your computer, in Chrome.')
                  : (fr ? "Le lien part à l'adresse de ton compte." : 'The link goes to your account address.'))}
          </p>

          {/* ── Secondaire : après l'action, pour qui veut savoir ───────────── */}
          <p style={{ margin: '0 0 12px', fontSize: 13, color: C.mute2, lineHeight: 1.55, textAlign: 'center' }}>
            {body ?? (fr
              ? "C'est elle qui met tes annonces en ligne pour toi sur Vinted, Leboncoin, eBay et Beebs. Elle est gratuite — et dès son installation, tout ton dressing Vinted se synchronise dans FillSell en quelques secondes."
              : 'It posts your listings for you on Vinted, Leboncoin, eBay and Beebs. It is free — and as soon as it is installed, your entire Vinted wardrobe syncs into FillSell within seconds.')}
          </p>

          {supabase && userId && (
            <button onClick={recheck} disabled={checking} style={{ ...btnBase, background: 'transparent', border: `1px dashed ${C.border}`, color: C.mute2, marginBottom: onContinue ? 10 : 0, opacity: checking ? 0.6 : 1 }}>
              <RefreshCw size={14} strokeWidth={2.4} style={checking ? { animation: 'fsSpin 1s linear infinite' } : undefined} />
              {checking
                ? (fr ? 'Vérification…' : 'Checking…')
                : (fr ? "J'ai installé l'extension — vérifier" : 'I installed the extension — check')}
            </button>
          )}
          {checkResult === false && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: C.mute, lineHeight: 1.5, textAlign: 'center' }}>
              {fr
                ? "Pas encore détectée. Après l'installation, laisse Chrome ouvert 2 minutes puis réessaie."
                : 'Not detected yet. After installing, keep Chrome open for 2 minutes and try again.'}
            </p>
          )}

          {onContinue && (
            <button
              onClick={onContinue}
              style={{ ...btnBase, background: 'transparent', border: 'none', color: C.tealDeep, padding: '10px 14px' }}
            >
              {fr ? "Préparer mon annonce en attendant" : 'Prepare my listing in the meantime'}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
