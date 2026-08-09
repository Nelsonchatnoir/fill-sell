// ── Onboarding post-inscription (lot 2, 2026-08-09) ─────────────────────────
// Monté par App juste après la modale devise+pseudo — laquelle ne s'affiche
// que pour un compte NEUF (profiles.currency vide) : le stock est donc
// forcément vide, pas besoin de le vérifier. Un écran = une idée = une action,
// aucune mention de Pépites (règle du lot).
//
// Trois étapes :
//   'choix'   → « Tu vends déjà sur Vinted ? » — deux réponses, pas de
//               troisième option, pas de « passer » (décision Nico).
//   'oui'     → l'extension expliquée AVEC sa raison (lire le dressing),
//               jamais comme un préalable administratif. L'ACTION dépend du
//               support :
//                 · ordinateur → ExtensionPitchScreen (lien /extension) ;
//                 · téléphone  → le tap ENVOIE l'e-mail, point (lot 2C-1,
//                   09/08). L'utilisateur est connecté, son adresse est
//                   connue : plus de mailto pré-rempli à compléter dans son
//                   client mail, plus de feuille intermédiaire. L'écran
//                   d'attente NOMME ensuite l'adresse servie et propose un
//                   « Renvoyer » verrouillé 60 s. La feuille ne reste qu'un
//                   recours, affiché si l'envoi a échoué.
//   'attente' → on attend que l'extension réponde. Poll de
//               profiles.extension_last_seen_at + version (8 s, via
//               lireCapaciteSyncCompte) ; dès qu'une extension CAPABLE est
//               là, la sync du dressing est mise en file
//               (demanderSyncDressingServeur — le serveur tranche cadence et
//               doublons) et on atterrit sur l'onglet Stock, où la carte de
//               sync existante montre la progression puis « Dressing
//               synchronisé — N articles importés » : c'est la ligne de
//               valeur, rien d'autre par-dessus.
//
// L'étape 'attente' est PERSISTÉE (localStorage fs_onboard_state) : fermer
// l'app et revenir reprend l'attente sans re-cliquer — c'est App.jsx qui
// remonte ce composant au chargement si l'état est encore là. « Plus tard »
// n'existe QUE sur l'écran d'attente (jamais sur le choix) : sans lui, un
// utilisateur qui renonce à installer serait enfermé dans l'onboarding à
// chaque ouverture de l'app.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import PlatformLogo from './platform-logos/PlatformLogo';
import ExtensionPitchScreen from './ExtensionPitchScreen';
import { supabase } from '../lib/supabase';
import { lireCapaciteSyncCompte, demanderSyncDressingServeur } from '../utils/vintedSync';
import { envoyerLienExtension } from '../utils/extensionLink';

const C = {
  canvas: '#EDEAE0', paper: '#F6F5F1', ink: '#10201B',
  teal: '#2F9E90', tealDeep: '#1B6E62', mute: '#8A8578', mute2: '#5C6560',
  border: '#E7E3D8',
};

// ⚠️ Ces deux clés sont un CACHE D'AFFICHAGE, pas un état (lot 2b). La source
// de vérité de « cet utilisateur a fait son onboarding » est
// profiles.onboarded_at, en base, donc PAR COMPTE.
//   · ONBOARD_DONE_KEY : miroir local d'onboarded_at, pour ne pas faire
//     clignoter l'écran le temps que fetchAll réponde.
//   · ONBOARD_STATE_KEY : position DANS le parcours (l'écran d'attente).
//     Volontairement local : « cet appareil-ci attend l'extension » n'a de
//     sens que sur cet appareil — sur un autre, l'écran de choix est le bon
//     point de reprise.
export const ONBOARD_STATE_KEY = 'fs_onboard_state';       // 'attente_extension' | absent
export const ONBOARD_DONE_KEY  = 'fs_onboard_choice_done'; // '1' | absent

// Lot 2C-1 : trace du dernier envoi du lien ({email, bloqueJusqua}), même
// nature que ONBOARD_STATE_KEY — un CACHE D'AFFICHAGE, local par appareil.
// Sans lui, revenir sur l'écran d'attente après une fermeture d'app effacerait
// « Lien envoyé à … » et laisserait croire que rien n'est parti. L'envoi
// lui-même, lui, est un fait serveur (email_logs 'extension_link').
const ONBOARD_LINK_KEY = 'fs_onboard_link_sent';
// Verrou du « Renvoyer » — même fenêtre que le limiteur de la fonction.
const RENVOI_LOCK_MS = 60_000;

const lireEtatInitial = () => {
  try { return localStorage.getItem(ONBOARD_STATE_KEY) === 'attente_extension' ? 'attente' : 'choix'; }
  catch { return 'choix'; }
};

const ENVOI_VIDE = { etat: 'idle', email: null, bloqueJusqua: 0, raison: null };

const lireEnvoiInitial = () => {
  try {
    const brut = localStorage.getItem(ONBOARD_LINK_KEY);
    if (!brut) return ENVOI_VIDE;
    const o = JSON.parse(brut);
    if (!o?.email) return ENVOI_VIDE;
    return { etat: 'envoye', email: o.email, bloqueJusqua: Number(o.bloqueJusqua) || 0, raison: null };
  } catch { return ENVOI_VIDE; }
};

export default function OnboardingFlow({ lang, user, onDone }) {
  const fr = lang !== 'en';
  // « Téléphone » = natif OU petit écran web : même règle que StockTab
  // (surTelephone) — sur un téléphone, installer ici est impossible, on envoie
  // le lien vers l'ordinateur.
  const surTelephone = Capacitor.isNativePlatform() || window.innerWidth < 768;
  const [step, setStep] = useState(lireEtatInitial);
  const [showPitch, setShowPitch] = useState(false);
  const [syncEnvoyee, setSyncEnvoyee] = useState(false);
  // Envoi du lien d'installation (téléphone) : 'idle' | 'en_cours' | 'envoye' |
  // 'echec'. L'écran ne dit JAMAIS « envoyé » sur autre chose qu'un aller-retour
  // serveur réussi — et l'adresse affichée est celle que la fonction rapporte
  // (lue sur le JWT), pas une valeur locale.
  const [envoi, setEnvoi] = useState(lireEnvoiInitial);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const finiRef = useRef(false);

  const secondesRestantes = Math.max(0, Math.ceil((envoi.bloqueJusqua - maintenant) / 1000));

  // Décompte du verrou « Renvoyer » : tourne uniquement tant qu'il reste du
  // temps, et s'arrête de lui-même à échéance.
  useEffect(() => {
    if (!envoi.bloqueJusqua || envoi.bloqueJusqua <= Date.now()) return;
    setMaintenant(Date.now());
    const id = setInterval(() => {
      const n = Date.now();
      setMaintenant(n);
      if (n >= envoi.bloqueJusqua) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [envoi.bloqueJusqua]);

  // UN TAP = l'e-mail part à l'adresse du compte. Aucune saisie, aucune
  // confirmation d'adresse : l'utilisateur est connecté, le serveur sait à qui
  // écrire. 'throttle' n'est PAS un échec — le mail précédent est en route vers
  // la même adresse, on affiche la confirmation et le décompte.
  const envoyerLien = async () => {
    if (envoi.etat === 'en_cours') return;
    setEnvoi((v) => ({ ...v, etat: 'en_cours', raison: null }));
    const r = await envoyerLienExtension(fr ? 'fr' : 'en');
    if (r.ok || r.reason === 'throttle') {
      const email = r.email || user?.email || null;
      const bloqueJusqua = Date.now() + (r.ok ? RENVOI_LOCK_MS : Math.max(1, r.retryDans || 1) * 1000);
      setEnvoi({ etat: 'envoye', email, bloqueJusqua, raison: null });
      try { localStorage.setItem(ONBOARD_LINK_KEY, JSON.stringify({ email, bloqueJusqua })); }
      catch { /* cache d'affichage seul */ }
      return;
    }
    // Rien n'est parti : on le dit, et le bouton reste actif. On garde l'adresse
    // d'un envoi précédent réussi pour distinguer « le renvoi a échoué » du
    // premier envoi raté.
    setEnvoi((v) => ({ etat: 'echec', email: v.email, bloqueJusqua: 0, raison: r.reason }));
  };

  // Fin de l'onboarding. La SOURCE DE VÉRITÉ est profiles.onboarded_at — un
  // fait de compte, pas d'appareil (lot 2b) : sans ça, un second téléphone
  // refaisait l'onboarding et un compte neuf sur un appareil déjà utilisé le
  // sautait. Le localStorage n'est plus qu'un cache anti-clignotement, écrit
  // APRÈS la base.
  // Écriture best-effort mais JOURNALISÉE : si elle échoue, l'écran
  // réapparaîtra au prochain chargement (fetchAll relit la base). C'est le
  // bon échec — bruyant et réparable — plutôt qu'un cache local qui masque
  // le problème en laissant la base fausse.
  const terminer = async (dest) => {
    if (finiRef.current) return;
    finiRef.current = true;
    if (user?.id) {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('onboarded_at');   // .select() obligatoire après un update client (RLS)
      if (error) console.warn('[onboarding] onboarded_at non écrit :', error.message);
    }
    try {
      localStorage.setItem(ONBOARD_DONE_KEY, '1');
      localStorage.removeItem(ONBOARD_STATE_KEY);
      localStorage.removeItem(ONBOARD_LINK_KEY);
    } catch { /* stockage local indisponible : la base fait foi de toute façon */ }
    onDone?.(dest);
  };

  // Attente : poll 8 s de la capacité du COMPTE (extension vue + version qui
  // sait lire le dressing). Dès que c'est bon → sync mise en file, et on sort
  // sur le Stock quel que soit le détail de la réponse serveur ('cadence' ou
  // 'deja_en_attente' veulent dire qu'une sync est déjà acquise — la carte de
  // sync du Stock raconte la suite). Seul cas où on RESTE : l'extension n'est
  // pas encore là (course entre le poll et le premier heartbeat).
  useEffect(() => {
    if (step !== 'attente' || !user?.id) return;
    let vivant = true;
    const tick = async () => {
      const cap = await lireCapaciteSyncCompte(user.id);
      if (!vivant || !cap?.capable) return;
      let r = null;
      try { r = await demanderSyncDressingServeur(); } catch { r = null; }
      if (!vivant) return;
      if (r?.ok || ['cadence', 'deja_en_attente', 'sync_en_cours'].includes(r?.reason)) {
        setSyncEnvoyee(true);
        // Petite respiration pour que « C'est parti » soit lisible avant la bascule.
        setTimeout(() => { if (vivant) terminer('stock'); }, 1200);
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { vivant = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, user?.id]);

  const btn = {
    width: '100%', padding: '16px 18px', borderRadius: 16, border: 'none',
    fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
  };

  const ecran = (children) => createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9980, background: C.canvas,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)',
      fontFamily: "'Space Grotesk', sans-serif", overflowY: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>{children}</div>
    </div>,
    document.body
  );

  // ── Étape 1 : le choix ─────────────────────────────────────────────────────
  if (step === 'choix') {
    return ecran(
      <>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <PlatformLogo platform="vinted" size={44} />
        </div>
        <h1 style={{ margin: '0 0 22px', fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, textAlign: 'center', lineHeight: 1.2 }}>
          {fr ? 'Tu vends déjà sur Vinted ?' : 'Already selling on Vinted?'}
        </h1>

        <button
          onClick={() => { setStep('oui'); }}
          style={{ ...btn, background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff', marginBottom: 12, boxShadow: '0 12px 26px -10px rgba(47,158,144,0.5)' }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fr ? "Oui, j'ai déjà des annonces" : 'Yes, I have listings'}</div>
          <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.85, marginTop: 3 }}>{fr ? 'On les importe, tu ne refais rien' : "We import them — you redo nothing"}</div>
        </button>

        <button
          onClick={() => terminer('lens')}
          style={{ ...btn, background: C.paper, color: C.ink, border: `1px solid ${C.border}` }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fr ? 'Non, je commence' : "No, I'm starting out"}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.mute2, marginTop: 3 }}>{fr ? 'On crée ta première annonce' : 'We create your first listing'}</div>
        </button>
      </>
    );
  }

  // ── Étape 2 (branche OUI) : l'extension, expliquée avec sa raison ──────────
  if (step === 'oui') {
    return ecran(
      <>
        <h1 style={{ margin: '0 0 12px', fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, textAlign: 'center', lineHeight: 1.25 }}>
          {fr ? 'On va chercher tes annonces sur ton ordinateur' : "We'll fetch your listings from your computer"}
        </h1>
        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: C.mute2, textAlign: 'center' }}>
          {fr
            ? 'Pour lire ton dressing Vinted, FillSell utilise une petite extension Chrome installée sur ton ordinateur. Elle se sert de ton compte déjà connecté — FillSell ne connaît jamais ton mot de passe. Une minute, une seule fois.'
            : 'To read your Vinted wardrobe, FillSell uses a small Chrome extension installed on your computer. It uses your already-signed-in account — FillSell never knows your password. One minute, once.'}
        </p>

        {/* Le contrat — même phrase que la carte de sync du Stock, mot pour mot. */}
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.55, color: C.mute2, marginBottom: 18 }}>
          {fr
            ? 'On lit tes annonces : titres, prix, photos. Rien n\'est publié, modifié ni supprimé.'
            : 'We read your listings: titles, prices, photos. Nothing is published, edited or deleted.'}
        </div>

        <button
          onClick={() => {
            // On bascule tout de suite en attente : le poll tourne pendant que
            // l'utilisateur va sur son ordinateur, et l'état survit à une
            // fermeture de l'app.
            try { localStorage.setItem(ONBOARD_STATE_KEY, 'attente_extension'); } catch { /* non bloquant */ }
            setStep('attente');
            // Téléphone : le tap EST l'envoi (lot 2C-1) — plus de feuille
            // intermédiaire, plus de mailto à compléter à la main. Sur
            // ordinateur, rien ne change : la feuille porte le lien /extension.
            if (surTelephone) envoyerLien();
            else setShowPitch(true);
          }}
          style={{ ...btn, textAlign: 'center', fontSize: 15, fontWeight: 700, background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff', boxShadow: '0 12px 26px -10px rgba(47,158,144,0.5)' }}
        >
          {surTelephone
            ? (fr ? "M'envoyer le lien pour mon ordinateur" : 'Email me the link for my computer')
            : (fr ? "Installer l'extension" : 'Install the extension')}
        </button>

        <button
          onClick={() => setStep('choix')}
          style={{ display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 4 }}
        >
          {fr ? '← Retour' : '← Back'}
        </button>
      </>
    );
  }

  // ── Étape 3 : attente de l'extension, puis sync automatique ───────────────
  return ecran(
    <>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 40 }}>{syncEnvoyee ? '✅' : '🖥️'}</div>
      </div>
      <h1 style={{ margin: '0 0 12px', fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, textAlign: 'center', lineHeight: 1.25 }}>
        {syncEnvoyee
          ? (fr ? "C'est parti — ton dressing arrive" : 'Here we go — your wardrobe is coming')
          : (fr ? "On t'attend sur ton ordinateur" : "We're waiting for you on your computer")}
      </h1>
      {!syncEnvoyee && (
        <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.6, color: C.mute2, textAlign: 'center' }}>
          {surTelephone
            // ⚠️ « le lien qu'on vient de t'envoyer » n'est écrit QUE si un
            // envoi a réellement abouti (etat 'envoye'). Tant que ce n'est pas
            // le cas — envoi en cours, échec, ou reprise d'une session où rien
            // n'est parti — la consigne ne parle pas d'un e-mail qui n'existe
            // peut-être pas.
            ? (envoi.etat === 'envoye'
              ? (fr
                // « on te prévient » de la consigne remplacé par une promesse
                // qu'on TIENT : aucun canal ne notifie aujourd'hui (pas de
                // push) — le dressing attend dans le stock, c'est ça, la vérité.
                ? "Ouvre le lien qu'on vient de t'envoyer par email, installe l'extension, et ton dressing arrivera ici tout seul. Tu peux fermer l'app : tu retrouveras tes annonces dans ton stock."
                : 'Open the link we just emailed you, install the extension, and your wardrobe will arrive here on its own. You can close the app: your listings will be waiting in your stock.')
              : (fr
                ? "Installe l'extension sur ton ordinateur et ton dressing arrivera ici tout seul. Tu peux fermer l'app : tu retrouveras tes annonces dans ton stock."
                : 'Install the extension on your computer and your wardrobe will arrive here on its own. You can close the app: your listings will be waiting in your stock.'))
            : (fr
                ? "Installe l'extension dans Chrome, connecte-toi sur fillsell.app si ce n'est pas déjà fait, et ton dressing arrivera ici tout seul — environ deux minutes après l'installation."
                : 'Install the extension in Chrome, sign in on fillsell.app if you haven\'t already, and your wardrobe will arrive here on its own — about two minutes after installing.')}
        </p>
      )}
      {!syncEnvoyee && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
            <span style={{ width: 14, height: 14, border: `2px solid ${C.teal}`, borderTopColor: 'transparent', borderRadius: 99, display: 'inline-block', animation: 'fsObSpin 1s linear infinite' }} />
            <style>{'@keyframes fsObSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'}</style>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.mute2 }}>
              {fr ? "Détection automatique — rien à recliquer ici" : 'Automatic detection — nothing to click again here'}
            </span>
          </div>
          {/* ── Le lien d'installation, sur téléphone (lot 2C-1) ───────────────
              Trois états, jamais ambigus : envoi en cours / envoyé À UNE
              ADRESSE NOMMÉE (sans quoi l'utilisateur ne sait pas dans quelle
              boîte regarder) / échec dit en toutes lettres, bouton toujours
              actif. Sur ordinateur, rien ne change : la feuille d'installation. */}
          {surTelephone ? (
            <>
              {envoi.etat === 'en_cours' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 12px', marginBottom: 8, fontSize: 13, fontWeight: 700, color: C.mute2 }}>
                  <span style={{ width: 13, height: 13, border: `2px solid ${C.teal}`, borderTopColor: 'transparent', borderRadius: 99, display: 'inline-block', animation: 'fsObSpin 1s linear infinite' }} />
                  {fr ? 'Envoi du lien…' : 'Sending the link…'}
                </div>
              )}

              {envoi.etat === 'envoye' && (
                <>
                  <div style={{ background: '#F0FDFB', border: '1px solid rgba(47,158,144,0.25)', borderRadius: 12, padding: '11px 13px', marginBottom: 6, fontSize: 13, lineHeight: 1.5, color: C.tealDeep, textAlign: 'center', wordBreak: 'break-word' }}>
                    {fr ? 'Lien envoyé à ' : 'Link sent to '}
                    <strong>{envoi.email}</strong>
                  </div>
                  <button
                    onClick={envoyerLien}
                    disabled={secondesRestantes > 0}
                    style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: secondesRestantes > 0 ? C.mute : C.tealDeep, fontSize: 12.5, fontWeight: 600, cursor: secondesRestantes > 0 ? 'default' : 'pointer', fontFamily: 'inherit', padding: 6, marginBottom: 4, textDecoration: secondesRestantes > 0 ? 'none' : 'underline' }}
                  >
                    {secondesRestantes > 0
                      ? (fr ? `Renvoyer dans ${secondesRestantes} s` : `Resend in ${secondesRestantes}s`)
                      : (fr ? 'Renvoyer' : 'Resend')}
                  </button>
                </>
              )}

              {(envoi.etat === 'idle' || envoi.etat === 'echec') && (
                <>
                  {envoi.etat === 'echec' && (
                    <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '11px 13px', marginBottom: 8, fontSize: 12.5, lineHeight: 1.5, color: '#92400E' }}>
                      {envoi.raison === 'no_email'
                        ? (fr
                            ? "Aucune adresse e-mail n'est rattachée à ton compte : on ne peut pas t'envoyer le lien. Ouvre fillsell.app/extension depuis ton ordinateur."
                            : 'No email address is attached to your account, so we can\'t send the link. Open fillsell.app/extension from your computer.')
                        : (fr
                            ? `${envoi.email ? "Le renvoi n'a pas pu partir." : "L'e-mail n'a pas pu partir."} Rien n'a été envoyé — réessaie.`
                            : `${envoi.email ? "The resend couldn't go out." : "The email couldn't be sent."} Nothing was sent — try again.`)}
                    </div>
                  )}
                  {envoi.raison !== 'no_email' && (
                    <button
                      onClick={envoyerLien}
                      style={{ display: 'block', width: '100%', background: 'none', border: `1px solid ${C.border}`, borderRadius: 12, color: C.tealDeep, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 12px', marginBottom: 8 }}
                    >
                      {fr ? "M'envoyer le lien pour mon ordinateur" : 'Email me the link for my computer'}
                    </button>
                  )}
                  {envoi.etat === 'echec' && (
                    <button
                      onClick={() => setShowPitch(true)}
                      style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: C.mute, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 6, textDecoration: 'underline', marginBottom: 4 }}
                    >
                      {fr ? 'Récupérer le lien autrement' : 'Get the link another way'}
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <button
              onClick={() => setShowPitch(true)}
              style={{ display: 'block', width: '100%', background: 'none', border: `1px solid ${C.border}`, borderRadius: 12, color: C.tealDeep, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 12px', marginBottom: 8 }}
            >
              {fr ? "Revoir comment installer l'extension" : 'See how to install the extension'}
            </button>
          )}
          <button
            onClick={() => terminer('stock')}
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 6 }}
          >
            {fr ? 'Plus tard' : 'Later'}
          </button>
        </>
      )}

      {showPitch && (
        <ExtensionPitchScreen
          lang={lang}
          onClose={() => setShowPitch(false)}
          supabase={supabase}
          userId={user?.id ?? null}
          onExtensionSeen={() => setShowPitch(false)}
          eyebrow={fr ? 'Pour importer ton dressing' : 'To import your wardrobe'}
          body={fr
            ? "Elle lit ton dressing Vinted avec ton compte déjà connecté dans ton navigateur — jamais ton mot de passe — puis publie tes annonces quand tu le décides. Gratuite, installée une seule fois."
            : 'It reads your Vinted wardrobe with the account already signed in to your browser — never your password — then publishes your listings when you decide. Free, installed once.'}
        />
      )}
    </>
  );
}
