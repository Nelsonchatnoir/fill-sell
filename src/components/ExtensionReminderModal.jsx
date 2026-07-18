// ── Rappel extension avant publication ───────────────────────────────────────
// Affiché au clic sur « Créer une annonce » (Lens) et « Publier » (Stock) :
// la publication passe par l'extension Chrome, et un utilisateur qui ne l'a pas
// installée (ou pas connecté ses plateformes) découvre l'échec trop tard, en
// bout de stepper. On prévient AVANT d'entrer dans le flux.
//
// Préférence « Ne plus afficher » : localStorage, même pattern flag "1" que
// fs_currency_confirmed / fs_username_asked (App.jsx) — pas de colonne profil,
// aucun autre choix UI n'est persisté côté Supabase.
import { useEffect, useState } from 'react';
import { Puzzle, ExternalLink } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useIsMobile } from '../hooks/useIsMobile';

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
`;

const EXT_REMINDER_KEY = 'fs_ext_reminder_hidden';

export function shouldShowExtensionReminder() {
  try { return !localStorage.getItem(EXT_REMINDER_KEY); } catch { return true; }
}

export default function ExtensionReminderModal({ onClose, onContinue, lang }) {
  const fr = lang !== 'en';
  const [dontShowAgain, setDontShowAgain] = useState(false);
  // Le guide d'installation n'a de sens que sur Chrome desktop : une extension
  // ne s'installe ni depuis l'app native ni depuis un navigateur mobile.
  const isMobile = useIsMobile();
  const showInstallLink = !Capacitor.isNativePlatform() && !isMobile;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleContinue = () => {
    if (dontShowAgain) {
      try { localStorage.setItem(EXT_REMINDER_KEY, '1'); } catch { /* stockage indisponible : on réaffichera */ }
    }
    onContinue();
  };

  return (
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

          <div style={{
            width: 52, height: 52, borderRadius: 16, margin: '0 auto 14px',
            background: 'rgba(47,158,144,0.12)', border: '1px solid rgba(47,158,144,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Puzzle size={26} color={C.tealDeep} />
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.mute, marginBottom: 6 }}>
            {fr ? 'Avant de publier' : 'Before publishing'}
          </div>
          <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', marginBottom: 10 }}>
            {fr ? "L'extension FillSell est requise" : 'The FillSell extension is required'}
          </div>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: C.mute2, lineHeight: 1.55, textAlign: 'center' }}>
            {fr
              ? "Assure-toi d'avoir téléchargé et installé l'extension FillSell sur Chrome, et d'être connecté aux plateformes sur lesquelles tu veux publier."
              : 'Make sure you have downloaded and installed the FillSell extension on Chrome, and that you are logged in to the platforms you want to publish on.'}
          </p>

          {showInstallLink && (
          <a
            href="/extension"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '12px 14px', marginBottom: 16, borderRadius: 14,
              background: C.paper, border: `1px solid ${C.border}`,
              fontSize: 13.5, fontWeight: 700, color: C.tealDeep, textDecoration: 'none',
            }}
          >
            {fr ? "Guide d'installation de l'extension" : 'Extension install guide'}
            <ExternalLink size={14} strokeWidth={2.4} />
          </a>
          )}

          <button
            onClick={handleContinue}
            style={{
              width: '100%', padding: 15, border: 'none', borderRadius: 999,
              background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff',
              fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)',
            }}
          >
            {fr ? "C'est bon, continuer" : 'All set, continue'}
          </button>

          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginTop: 14, fontSize: 12.5, fontWeight: 600, color: C.mute, cursor: 'pointer',
            userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              style={{ width: 16, height: 16, margin: 0, accentColor: C.teal, cursor: 'pointer' }}
            />
            {fr ? 'Ne plus afficher ce message' : "Don't show this again"}
          </label>
        </div>
      </div>
    </>
  );
}
